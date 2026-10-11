/**
 * 验证 elkg ↔ elkt 转换等价性 (全量批量).
 *
 * 原理:
 *   elkg 侧: ELK Java 权威解析 (ElkgJsonMain: EMF 加载 → ElkGraphJson 导出, 含递归边)
 *   elkt 侧: ggn parseElkt + elktToElkJson
 *   规范化后逐字段 diff (id 去前缀 / 选项键统一 / 边端点解析到 节点.端口 / 端口 index 负值).
 *
 * 性能: ElkgJsonMain 批量模式一次 JVM 处理全部 elkg (避免 550 次 JVM 启动);
 *       diff 每对 O(N+E) 线性, 无卡住风险.
 *
 * 用法: bun scripts/verify-elkg-elkt.mjs [glob]
 *   默认 glob: realworld/ptolemy/**\/*.elkg (与同名 .elkt 成对)
 * 输出: 总对数 / 完全等价数 / 问题分类统计 / 差异模型列表 / 耗时
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson, OPT_MAP } from './elkt2test.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const ELKG_GLOB = process.argv[2] ?? 'realworld/ptolemy/**/*.elkg'
const JAVA = process.env.ELK_JAVA_HOME
  ? join(process.env.ELK_JAVA_HOME, 'bin/java')
  : '/opt/homebrew/opt/openjdk@21/bin/java'
const DBG = join(ROOT, 'scripts/elk-java-debug')

const optKey = (k) => (k ?? '').replace(/^org\.eclipse\.elk\./, '')

/** 单对 diff: elkgJson (ElkgJsonMain 输出) vs elkt 源文件 → 问题列表 + 归一化计数.
 * 归一化 (表示层差异, 布局已证等价): elkg 无尺寸 → 视同默认 (容器 60x30 / 端口 8x8). */
function verifyPair(elkgJson, elktPath) {
  const elkt = elktToElkJson(parseElkt(readFileSync(elktPath, 'utf8')))
  const problems = []
  const normalized = { nodeSize: 0, portSize: 0 }

  // elkg 端口归属节点 (全限定路径; 节点 id 是每层短名)
  const portOwner = new Map()
  const walkE = (ns, path) => {
    for (const n of ns) {
      const full = path ? path + '.' + n.id : n.id
      for (const p of n.ports ?? []) portOwner.set(p.id, full)
      walkE(n.children ?? [], full)
    }
  }
  walkE(elkgJson.children ?? [], '')

  const normEdge = (e, side) => {
    const srcRef = (e.sources?.[0] ?? e.source) ?? ''
    const tgtRef = (e.targets?.[0] ?? e.target) ?? ''
    const resolve = (r) => r.includes('.') ? r : (portOwner.get(r) ? portOwner.get(r) + '.' + r : r)
    const s = side === 'elkg' ? resolve(srcRef) : srcRef.replace(/^N/, '')
    const t = side === 'elkg' ? resolve(tgtRef) : tgtRef.replace(/^N/, '')
    return s + '->' + t
  }

  // 收集: elkg 短名拼路径; elkt 'N'+全限定去前缀 → key 全限定
  const a = new Map(), b = new Map()
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const normNode = (n, side, key) => {
    const opts = {}
    for (const [k, v] of Object.entries(n.layoutOptions ?? {})) opts[optKey(k)] = String(v)
    const ports = (n.ports ?? []).map((p) => {
      const popts = {}
      for (const [k, v] of Object.entries(p.layoutOptions ?? p.properties ?? {})) popts[optKey(k)] = String(v)
      const pid = side === 'elkt' && key ? p.id.replace(new RegExp('^N' + esc(key) + '\\.'), '') : p.id
      return {
        id: pid, x: p.x, y: p.y, w: p.width, h: p.height,
        side: popts['port.side'] ?? null,
        index: popts['port.index'] ?? null,
        other: Object.fromEntries(Object.entries(popts).filter(([k]) => !['port.side', 'port.index'].includes(k))),
      }
    })
    const labels = (n.labels ?? []).map((l) => ({ text: l.text, w: l.width, h: l.height }))
    const childIds = (n.children ?? []).map((c) => side === 'elkt' && key ? c.id.replace(new RegExp('^N' + esc(key) + '\\.'), '') : c.id)
    return { w: n.width, h: n.height, opts, ports, labels, childIds }
  }
  const collect = (n, side, path) => {
    const key = side === 'elkg' ? (path ? path + '.' + n.id : n.id) : n.id.replace(/^N/, '')
    ;(side === 'elkg' ? a : b).set(key, normNode(n, side, key))
    for (const c of n.children ?? []) collect(c, side, key)
  }
  for (const c of elkgJson.children ?? []) collect(c, 'elkg', '')
  for (const c of elkt.children ?? []) collect(c, 'elkt', '')

  // ── 根节点选项 diff (审查盲区1: 此前 collect 从 children 开始, 顶层选项从未比) ──
  // elkg 根 = ElkgJsonMain 导出顶层; elkt 根 = elktToElkJson 输出顶层 (含注入默认).
  // 归一化: elkt 侧多出的注入默认 (direction/randomSeed/hierarchyHandling) 允许; 值去引号.
  {
    const DEFAULT_GP = new Set(['org.eclipse.elk.randomSeed', 'org.eclipse.elk.direction', 'org.eclipse.elk.hierarchyHandling'])
    const unq = (v) => String(v ?? '').replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
    const canon = (k) => (OPT_MAP[k]?.ggn ?? k)
    const rootOpts = (n) => {
      const out = {}
      for (const [k, v] of Object.entries(n?.layoutOptions ?? {})) out[canon(k)] = unq(v)
      return out
    }
    const re = rootOpts(elkgJson)
    const rt = rootOpts(elkt)
    for (const [k, v] of Object.entries(re)) {
      if (rt[k] !== v) problems.push(`根.opt ${k}: elkg=${v} elkt=${rt[k] ?? '<无>'}`)
    }
    for (const k of Object.keys(rt)) {
      if (re[k] === undefined && !DEFAULT_GP.has(k)) problems.push(`根.opt ${k}: 仅 elkt 有 (=${rt[k]})`)
    }
  }

  const num = (v) => (v === null || v === undefined ? null : Number(v))
  for (const [id, na] of a) {
    const nb = b.get(id)
    if (!nb) { problems.push(`节点 ${id}: 仅 elkg 有`); continue }
    const wMissing = (na.w === null || na.w === undefined) && nb.w !== null && nb.w !== undefined
    const hMissing = (na.h === null || na.h === undefined) && nb.h !== null && nb.h !== undefined
    if (wMissing || hMissing) {
      // elkg 无尺寸 (EMF 未存) → parseElkt 默认 60x30: 布局已证等价, 归一化
      if (Math.abs(nb.w - 60) > 1e-6 || Math.abs(nb.h - 30) > 1e-6) {
        problems.push(`节点 ${id}: 容器尺寸 elkg=无 → elkt=(${nb.w},${nb.h}) (非默认, 疑似真差异)`)
      } else {
        normalized.nodeSize++
      }
    } else if (Math.abs((na.w ?? 0) - (nb.w ?? 0)) > 1e-6 || Math.abs((na.h ?? 0) - (nb.h ?? 0)) > 1e-6) {
      problems.push(`节点 ${id}: 尺寸 A=(${na.w},${na.h}) B=(${nb.w},${nb.h})`)
    }
    for (const k of new Set([...Object.keys(na.opts), ...Object.keys(nb.opts)])) {
      if (na.opts[k] !== nb.opts[k]) problems.push(`节点 ${id}.opt ${k}: A=${na.opts[k] ?? '<无>'} B=${nb.opts[k] ?? '<无>'}`)
    }
    if (na.ports.length !== nb.ports.length) { problems.push(`节点 ${id}: 端口数 A=${na.ports.length} B=${nb.ports.length}`); continue }
    for (let i = 0; i < na.ports.length; i++) {
      const pa = na.ports[i], pb = nb.ports[i]
      if (pa.id !== pb.id) { problems.push(`节点 ${id}.P${i}: id A=${pa.id} B=${pb.id}`); continue }
      for (const k of ['x', 'y']) {
        const va = num(pa[k]), vb = num(pb[k])
        const eq = va === vb || (va === null && vb === 0) || (vb === null && va === 0)
        if (!eq) problems.push(`节点 ${id}.${pa.id}.${k}: A=${pa[k]} B=${pb[k]}`)
      }
      for (const k of ['w', 'h']) {
        const va = num(pa[k]), vb = num(pb[k])
        // elkg 端口无尺寸 → elktToElkJson 默认 8: 布局已证等价, 归一化
        const eq = va === vb || (va === null && vb === 8) || (vb === null && va === 8)
        if (!eq) {
          if (va === null) problems.push(`节点 ${id}.${pa.id}.${k}: 端口尺寸 elkg=无 → elkt=${pb} (非默认, 疑似真差异)`)
          else problems.push(`节点 ${id}.${pa.id}.${k}: A=${pa[k]} B=${pb[k]}`)
        } else if (va === null) {
          normalized.portSize++
        }
      }
      if ((pa.side ?? null) !== (pb.side ?? null)) problems.push(`节点 ${id}.${pa.id}.side: A=${pa.side} B=${pb.side}`)
      if (pa.index !== null && pa.index !== undefined) {
        if (pb.index === null || pb.index === undefined) problems.push(`节点 ${id}.${pa.id}.index: elkg=${pa.index}(显式) elkt=<无>`)
        else if (String(num(pa.index)) !== String(num(pb.index))) problems.push(`节点 ${id}.${pa.id}.index: A=${pa.index} B=${pb.index}`)
      }
      const poa = JSON.stringify(pa.other), pob = JSON.stringify(pb.other)
      if (poa !== pob) problems.push(`节点 ${id}.${pa.id}.otherOpts: A=${poa} B=${pob}`)
    }
    const la = JSON.stringify(na.labels), lb = JSON.stringify(nb.labels)
    if (la !== lb) problems.push(`节点 ${id}.labels: A=${la} B=${lb}`)
    const ca = JSON.stringify([...na.childIds].sort()), cb = JSON.stringify([...nb.childIds].sort())
    if (ca !== cb) problems.push(`节点 ${id}.children: A=${ca} B=${cb}`)
  }
  for (const id of b.keys()) if (!a.has(id)) problems.push(`节点 ${id}: 仅 elkt 有`)

  const ae = new Set((elkgJson.edges ?? []).map((e) => normEdge(e, 'elkg')))
  const be = new Set((elkt.edges ?? []).map((e) => normEdge(e, 'elkt')))
  for (const e of ae) if (!be.has(e)) problems.push(`边 仅 elkg: ${e}`)
  for (const e of be) if (!ae.has(e)) problems.push(`边 仅 elkt: ${e}`)
  return { problems, normalized }
}

// ── 主流程 ──
const t0 = Date.now()
const elkgFiles = globSync(join(MODEL_ROOT, ELKG_GLOB)).sort()
const pairs = elkgFiles
  .map((f) => ({ elkg: f, elkt: f.replace(/\.elkg$/, '.elkt') }))
  .filter((p) => existsSync(p.elkt))
console.log(`elkg 文件: ${elkgFiles.length} | 有对应 elkt: ${pairs.length}`)

// 一次 JVM 批量导出全部 elkg JSON
const out = execFileSync(JAVA, ['-cp', `${join(DBG, 'out')}:${join(DBG, 'lib')}/*`, 'ElkgJsonMain', ...pairs.map((p) => p.elkg)], {
  encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
})
const elkgJsonByIdx = new Map()
for (const block of out.split('### ').slice(1)) {
  const nl = block.indexOf('\n')
  const idx = Number(block.slice(0, block.indexOf(':')))
  elkgJsonByIdx.set(idx, JSON.parse(block.slice(nl + 1)))
}
console.log(`JVM 批量导出: ${elkgJsonByIdx.size} 个 elkg JSON (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

// 逐对 diff
let eq = 0
const failModels = []
const byKind = {}
const totalNorm = { nodeSize: 0, portSize: 0 }
for (let i = 0; i < pairs.length; i++) {
  const elkgJson = elkgJsonByIdx.get(i)
  if (!elkgJson) { failModels.push({ rel: pairs[i].elkg, problems: ['缺少 elkg JSON'] }); continue }
  const { problems, normalized } = verifyPair(elkgJson, pairs[i].elkt)
  totalNorm.nodeSize += normalized.nodeSize
  totalNorm.portSize += normalized.portSize
  if (problems.length === 0) { eq++; continue }
  failModels.push({ rel: pairs[i].elkg.replace(MODEL_ROOT + '/', '').replace(/\.elkg$/, ''), problems })
  for (const p of problems) {
    const kind = p.includes('容器尺寸') ? '容器尺寸' : p.includes('端口尺寸') ? '端口尺寸' : p.includes('.index') ? '端口 index' : p.includes('仅 elkg 有') || p.includes('仅 elkt 有') ? '仅一侧有' : '其他'
    byKind[kind] = (byKind[kind] ?? 0) + 1
  }
}
console.log(`\n=== 结果 ===`)
console.log(`总对数 ${pairs.length} | 完全等价 ${eq} | 有差异 ${failModels.length}`)
console.log(`归一化 (缺失→默认, 布局已证等价): 容器尺寸 ${totalNorm.nodeSize} | 端口尺寸 ${totalNorm.portSize}`)
console.log(`问题分类 (仅真差异): ${JSON.stringify(byKind)}`)
console.log(`耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (failModels.length > 0) {
  console.log(`\n差异模型 (前 30):`)
  for (const m of failModels.slice(0, 30)) {
    console.log(`  ${m.rel}`)
    for (const p of m.problems.slice(0, 4)) console.log(`      ${p}`)
  }
}
