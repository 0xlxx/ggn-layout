/**
 * P1-A: 验证 ggn elktToElkJson(parseElkt(src)) 与 ELK Java Xtext 独立解析 .elkt 的等价性 (全量).
 *
 * 打破循环论证 (data-paths-review.md §0 问题 b): oracle 差分让 Java 吃 ggn 生成的 JSON, 与 ggn 同源派生,
 * 只能证算法等价、不能证输入正确. 本脚本让 Java 用官方 Xtext elkt 解析器 (org.eclipse.elk.graph.text)
 * 独立解析同一个 .elkt → ElkGraphJson, 与 ggn elktToElkJson 输出逐字段 diff.
 *
 * 依赖: scripts/elk-java-debug/ElktJsonMain + xtext-lib/* (见其文件头编译/运行说明).
 * 用法: bun scripts/verify-elkt-java.mjs [glob]   (默认 test-resources/elk-models/**\/*.elkt, 900 模型)
 *
 * 归一化 (表示层差异, 布局已证等价):
 *   - Java 根 id "n0" vs ggn "root" → 不比根 id;
 *   - Java 无尺寸节点 0x0 → 视同 ggn 默认 60x30; 端口 0x0 → 8x8;
 *   - ggn 注入默认 direction/randomSeed/hierarchyHandling → 允许 ggn 侧多出;
 *   - 选项值: 向量 "(100.0,50.0)"≡"100, 50"; enumset "[A, B]"≡"A,B"; 数值规范化;
 *   - 边端点: Java 端口短 id → 解析到 节点.端口; ggn 'N' 前缀剥离.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson, OPT_MAP } from './elkt2test.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const GLOB = process.argv[2] ?? '**/*.elkt'
const JAVA = process.env.ELK_JAVA_HOME
  ? join(process.env.ELK_JAVA_HOME, 'bin/java')
  : '/opt/homebrew/opt/openjdk@21/bin/java'
const DBG = join(ROOT, 'scripts/elk-java-debug')
const CP = `${join(DBG, 'out-xtext')}:${join(DBG, 'xtext-lib')}/*:${join(DBG, 'lib')}/*`

const optKey = (k) => (k ?? '').replace(/^org\.eclipse\.elk\./, '')

/** 选项值归一化 (表示层差异): 去引号 / 向量 / enumset / 数值. */
function normVal(v) {
  let s = String(v ?? '').trim()
  s = s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1')
  const vec = s.match(/^\(?([-+]?[\d.eE]+)\s*,\s*([-+]?[\d.eE]+)\)?$/)
  if (vec && s.includes(',')) return `v(${Number(vec[1])},${Number(vec[2])})`
  if (/^\[.*\]$/.test(s) || /[,\s]/.test(s)) {
    const inner = s.replace(/^\[/, '').replace(/\]$/, '')
    const parts = inner.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
    if (parts.length > 1 || /^\[/.test(s)) {
      // key=value 形式 (padding [top=10.0,...]) → 数值归一化 (10.0 ≡ 10)
      if (parts.every((x) => x.includes('='))) {
        const kv = parts.map((x) => { const [k2, v2] = x.split('='); const n = Number(v2); return k2 + '=' + (Number.isFinite(n) ? n : v2) }).sort()
        return 'o[' + kv.join(',') + ']'
      }
      return 'e[' + [...parts].sort().join(',') + ']'
    }
  }
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(s)) return 'n' + Number(s)
  return s
}

const num = (v) => (v === undefined || v === null ? null : Number(v))

/** 对象键排序 (键序差异是表示层, 布局无关). */
const sortKeys = (o) => {
  if (Array.isArray(o)) return o.map(sortKeys)
  if (o && typeof o === 'object') return Object.fromEntries(Object.keys(o).sort().map((k) => [k, sortKeys(o[k])]))
  return o
}

export function verifyPair(javaJson, elktPath) {
  const elkt = elktToElkJson(parseElkt(readFileSync(elktPath, 'utf8')))
  const problems = []
  const normalized = { nodeSize: 0, portSize: 0 }

  // Java 端口归属节点 (全限定路径; 节点 id 是每层短名)
  const portOwner = new Map()
  const nodePathSet = new Set()
  // Java 图元后缀 (p1_g734946 / n0_g736021) 是 Xtext 对**同名兄弟**的消歧; 仅当剥后缀后
  // 在节点内不冲突才剥 (insideSelfLoops: parent 与 parentWithSize 各有 p1/p2 → 后者带后缀).
  const displayName = (raw, allIds) => {
    const base = raw.replace(/_g\d+$/, '')
    if (base !== raw && allIds.some((x) => x !== raw && x.replace(/_g\d+$/, '') === base)) return raw
    return base
  }
  const walkJ = (ns, path) => {
    for (const n of ns) {
      const id = n.id.replace(/_g\d+$/, '')
      const full = path ? path + '.' + id : id
      nodePathSet.add(full)
      const portIds = (n.ports ?? []).map((x) => x.id)
      // portOwner 用 **raw** id 作 key (不同节点可有同名端口/后缀消歧), 值带显示名
      for (const p of n.ports ?? []) portOwner.set(p.id, { path: full, name: displayName(p.id, portIds) })
      walkJ(n.children ?? [], full)
    }
  }
  walkJ(javaJson.children ?? [], '')

  // 边端点归一化 → "节点路径[.端口名]"
  const normEdgeEnd = (r, side) => {
    if (side === 'java') {
      if (portOwner.has(r)) {
        const o = portOwner.get(r)
        return o.path + '.' + o.name
      }
      const rr = r.replace(/_g\d+$/, '')
      if (portOwner.has(rr)) {
        const o = portOwner.get(rr)
        return o.path + '.' + o.name
      }
      if (nodePathSet.has(rr)) return rr
      return rr
    }
    const ref = r.replace(/^N/, '')
    if (nodePathSet.has(ref)) return ref
    const dot = ref.lastIndexOf('.')
    if (dot !== -1 && nodePathSet.has(ref.slice(0, dot))) return ref
    return ref
  }
  const normEdgeEndFull = (r, side, owner) => {
    const base = normEdgeEnd(r, side)
    if (side === 'java' && base === r) {
      const rr = r.replace(/_g\d+$/, '')
      // 先按边归属作用域解析 (局部 id n1 → owner.n1), 再全局唯一局部 id
      if (owner) {
        const scoped = owner + '.' + rr
        if (nodePathSet.has(scoped)) return scoped
        if (portOwner.has(owner + '.' + rr)) return scoped
      }
      const cands = localIdMap.get(rr)
      if (cands && cands.length === 1) return cands[0]
    }
    return base
  }
  const normEdge = (e, side) => {
    const owner = e.graph ?? ''
    const s = normEdgeEndFull((e.sources?.[0] ?? e.source) ?? '', side, owner)
    const t = normEdgeEndFull((e.targets?.[0] ?? e.target) ?? '', side, owner)
    return s + '->' + t
  }

  const a = new Map(), b = new Map() // java / elkt
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const normNode = (n, side, key) => {
    const opts = {}
    for (const [k, v] of Object.entries(n.layoutOptions ?? {})) {
      const short = optKey(k)
      // enumset 选项 (Java 导出 "[A, B]" 括号形式; ggn 可能裸 "A B") → 统一排序数组
      if (OPT_MAP[short]?.type === 'enumset') {
        const inner = String(v).replace(/^["'\[]/, '').replace(/["'\]]$/, '')
        opts[short] = 'e[' + inner.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean).sort().join(',') + ']'
      } else {
        opts[short] = normVal(v)
      }
    }
    const allPortIds = (n.ports ?? []).map((x) => x.id)
    const ports = (n.ports ?? []).map((p) => {
      const popts = {}
      for (const [k, v] of Object.entries(p.layoutOptions ?? p.properties ?? {})) popts[optKey(k)] = normVal(v)
      // Java 声明端口短 id (同名兄弟带图元后缀 pN_gNNN → 条件剥); ggn 'Nnode.port' → 短名
      let pid = p.id
      if (side === 'elkt' && key) pid = p.id.replace(new RegExp('^N' + esc(key) + '\\.'), '')
      else if (side === 'java') pid = displayName(p.id, allPortIds)
      return {
        id: pid, x: p.x, y: p.y, w: p.width, h: p.height,
        side: popts['port.side'] ?? null,
        index: popts['port.index'] ?? null,
        other: Object.fromEntries(Object.entries(popts).filter(([k]) => !['port.side', 'port.index'].includes(k))),
      }
    })
    // 标签只比文本: Java Xtext 导入会估算标签尺寸 (FontMetrics), ggn 保持未设置 → 布局期各自估算.
    const labels = (n.labels ?? []).map((l) => l.text)
    const childIds = (n.children ?? []).map((c) => {
      const raw = c.id
      if (side === 'elkt' && key) return raw.replace(new RegExp('^N' + esc(key) + '\\.'), '')
      const kids = (n.children ?? []).map((x) => x.id)
      return displayName(raw, kids)
    })
    return { w: n.width, h: n.height, opts, ports, labels, childIds }
  }
  const collect = (n, side, path) => {
    const id = side === 'java' ? n.id.replace(/_g\d+$/, '') : n.id.replace(/^N/, '')
    const key = side === 'java' ? (path ? path + '.' + id : id) : id
    ;(side === 'java' ? a : b).set(key, normNode(n, side, key))
    for (const c of n.children ?? []) collect(c, side, key)
  }
  for (const c of javaJson.children ?? []) collect(c, 'java', '')
  for (const c of elkt.children ?? []) collect(c, 'elkt', '')
  // Java 边端点可能用局部 id (Xtext 导出只给叶子名, 如 'n1' 而非 'outside.inside.n1') → 局部 id → 全路径
  const localIdMap = new Map()
  for (const full of a.keys()) {
    const leaf = full.split('.').pop()
    if (!localIdMap.has(leaf)) localIdMap.set(leaf, [])
    localIdMap.get(leaf).push(full)
  }

  // ── 根节点选项 diff (ggn 注入默认允许) ──
  {
    const DEFAULT_GP = new Set(['org.eclipse.elk.randomSeed', 'org.eclipse.elk.direction', 'org.eclipse.elk.hierarchyHandling'])
    const rootOpts = (n) => {
      const out = {}
      for (const [k, v] of Object.entries(n?.layoutOptions ?? {})) out[optKey(k)] = normVal(v)
      return out
    }
    const ra = rootOpts(javaJson), rb = rootOpts(elkt)
    for (const [k, v] of Object.entries(sortKeys(ra))) {
      if (rb[k] !== v) problems.push(`根选项 ${k}: Java=${v} elkt=${rb[k] ?? '<无>'}`)
    }
    for (const k of Object.keys(rb)) {
      if (ra[k] === undefined && !DEFAULT_GP.has('org.eclipse.elk.' + k)) problems.push(`根选项 ${k}: 仅 elkt 有 (${rb[k]})`)
    }
  }

  for (const [id, nb] of b) {
    const na = a.get(id)
    if (!na) { problems.push(`节点 ${id}: 仅 elkt 有`); continue }
    for (const k of ['w', 'h']) {
      const va = num(na[k]), vb = num(nb[k])
      // Java omitZero → null; 无尺寸视同 ggn 默认 60x30
      const isDefault = k === 'w' ? vb === 60 : vb === 30
      const eq = va === vb || ((va === null || va === 0) && isDefault)
      if (!eq) {
        if (va === null || va === 0) problems.push(`节点 ${id}.${k}: Java=无 → elkt=${vb} (非默认, 疑似真差异)`)
        else problems.push(`节点 ${id}.${k}: A=${na[k]} B=${nb[k]}`)
      } else if (va === null || va === 0) {
        normalized.nodeSize++
      }
    }
    const oa = JSON.stringify(sortKeys(na.opts)), ob = JSON.stringify(sortKeys(nb.opts))
    if (oa !== ob) problems.push(`节点 ${id}.opts: Java=${oa} elkt=${ob}`)
    if (na.ports.length !== nb.ports.length) { problems.push(`节点 ${id}: 端口数 Java=${na.ports.length} elkt=${nb.ports.length}`); continue }
    for (let i = 0; i < na.ports.length; i++) {
      const pa = na.ports[i], pb = nb.ports[i]
      if (pa.id !== pb.id) { problems.push(`节点 ${id}.P${i}: id Java=${pa.id} elkt=${pb.id}`); continue }
      for (const k of ['x', 'y']) {
        const va = num(pa[k]), vb = num(pb[k])
        const eq = va === vb || ((va === null || va === 0) && (vb === null || vb === 0))
        if (!eq) problems.push(`节点 ${id}.${pa.id}.${k}: A=${pa[k]} B=${pb[k]}`)
      }
      for (const k of ['w', 'h']) {
        const va = num(pa[k]), vb = num(pb[k])
        const eq = va === vb || ((va === null || va === 0) && vb === 8) || (va === 8 && (vb === null || vb === 0))
        if (!eq) {
          if (va === null || va === 0) problems.push(`节点 ${id}.${pa.id}.${k}: 端口尺寸 Java=无 → elkt=${pb} (非默认 8, 疑似真差异)`)
          else problems.push(`节点 ${id}.${pa.id}.${k}: A=${pa[k]} B=${pb[k]}`)
        } else if (va === null || va === 0) {
          normalized.portSize++
        }
      }
      const normSide = (x) => (x === 'UNDEFINED' || x === null || x === undefined ? null : x)
      if (normSide(pa.side) !== normSide(pb.side)) problems.push(`节点 ${id}.${pa.id}.side: Java=${pa.side} elkt=${pb.side}`)
      if (pa.index !== null && pa.index !== undefined) {
        if (pb.index === null || pb.index === undefined) problems.push(`节点 ${id}.${pa.id}.index: Java=${pa.index}(显式) elkt=<无>`)
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
  for (const id of a.keys()) if (!b.has(id)) problems.push(`节点 ${id}: 仅 Java 有`)

  const ae = new Set((javaJson.edges ?? []).map((e) => normEdge(e, 'java')))
  const be = new Set((elkt.edges ?? []).map((e) => normEdge(e, 'elkt')))
  for (const e of ae) if (!be.has(e)) problems.push(`边 仅 Java: ${e}`)
  for (const e of be) if (!ae.has(e)) problems.push(`边 仅 elkt: ${e}`)
  return { problems, normalized }
}

if (!import.meta.main) {
  // 仅导出 verifyPair 供探针使用
} else {
const t0 = Date.now()
const files = globSync(join(MODEL_ROOT, GLOB)).filter((f) => f.endsWith('.elkt')).sort()
console.log(`elkt 文件: ${files.length}`)

// 一次 JVM 批量 Xtext 解析全部 elkt
const out = execFileSync(JAVA, ['-cp', CP, 'ElktJsonMain', ...files], {
  encoding: 'utf8', maxBuffer: 1024 * 1024 * 1024,
})
const javaByIdx = new Map()
for (const block of out.split('### ').slice(1)) {
  const nl = block.indexOf('\n')
  const idx = Number(block.slice(0, block.indexOf(' ')))
  javaByIdx.set(idx, JSON.parse(block.slice(nl + 1)))
}
console.log(`JVM Xtext 解析: ${javaByIdx.size} 个 elkt JSON (${((Date.now() - t0) / 1000).toFixed(1)}s)`)

let eq = 0
const failModels = []
const byKind = {}
const totalNorm = { nodeSize: 0, portSize: 0 }
for (let i = 0; i < files.length; i++) {
  const j = javaByIdx.get(i)
  if (!j) { failModels.push({ rel: files[i], problems: ['缺少 Java JSON'] }); continue }
  const { problems, normalized } = verifyPair(j, files[i])
  totalNorm.nodeSize += normalized.nodeSize
  totalNorm.portSize += normalized.portSize
  if (problems.length === 0) { eq++; continue }
  failModels.push({ rel: files[i].replace(MODEL_ROOT + '/', ''), problems })
  for (const p of problems) {
    const kind = p.includes('.opts') ? '节点选项' : p.includes('.side') ? '端口侧' : p.includes('.index') ? '端口 index' : p.includes('端口尺寸') || p.includes('端口数') ? '端口' : p.includes('节点') && p.includes('尺寸') ? '节点尺寸' : p.includes('根选项') ? '根选项' : p.includes('边 ') ? '边' : p.includes('children') ? 'children' : p.includes('labels') ? '标签' : p.includes('仅 Java') || p.includes('仅 elkt') ? '仅一侧有' : '其他'
    byKind[kind] = (byKind[kind] ?? 0) + 1
  }
}
console.log(`\n=== 结果 ===`)
console.log(`总对数 ${files.length} | 完全等价 ${eq} | 有差异 ${failModels.length}`)
console.log(`归一化: 容器尺寸 ${totalNorm.nodeSize} | 端口尺寸 ${totalNorm.portSize}`)
console.log(`问题分类: ${JSON.stringify(byKind)}`)
console.log(`耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (failModels.length > 0) {
  console.log(`\n差异模型 (前 40):`)
  for (const m of failModels.slice(0, 40)) {
    console.log(`  ${m.rel}`)
    for (const p of m.problems.slice(0, 4)) console.log(`      ${p}`)
  }
}
}
