/**
 * 布局侧权威差分: 同一个 ELK JSON → ELK Java 完整布局 → JSON  vs  ggn buildGraph 路径 → JSON.
 *
 * 背景 (data-paths-review §2.2 问题 b): 696 oracle 让 Java 吃 ggn 导出的 elktToElkJson JSON,
 * ggn 也从同一个 parseElkt 派生 → 坐标差分只能证算法等价, 不能证输入正确 (循环论证).
 * 本脚本让 **ELK Java (LayoutJsonMain: JSON → RecursiveGraphLayoutEngine → JSON)** 与
 * **ggn (layoutElkJson: api buildGraph → LayeredLayoutProvider → extract JSON)** 对同一份
 * ELK JSON 跑完整布局, 逐字段 diff 最终输出:
 *   - 节点: (相对父的 x/y/width/height)
 *   - 边: (挂载容器, sources/targets, sections startPoint/endPoint/bendPoints)
 * 同时覆盖 api buildGraph 这条第 4 份 JSON→LGraph 实现 (demo-vite 的 buildLGraphFromParsed 之外的
 * 公开 API 路径), 验证 elkjs/demo-vite「两端同输入」的公平性.
 *
 * 输入侧权威由 verify-elkt-java (854/900, Xtext) 与 verify-elkg-elkt (550) 承担;
 * 本脚本只负责**布局输出侧**差分. 容差 ε 默认 1e-3 (精度差异), --eps 可覆盖.
 *
 * 用法: bun scripts/verify-elkg-java-layout.ts [glob] [--eps N] [--max N]
 *   默认 glob: {examples,tests,tickets}/**\/*.elkt (696, 与 oracle 集一致)
 *   传 '**\/*.elkt' 跑全部 900 (含 realworld).
 * 输出: 模型总数 / 节点+边全等数 / 差异明细 / 耗时. 退出码 0 = 全部一致.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawnSync } from 'node:child_process'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson } from './elkt2test.mjs'
import { isLayered } from './alg-filter.mjs'
import { layoutElkJson } from '../src/api/elk-json.ts'
import '../src/api/register-all.ts' // 非 layered provider 注册 (对齐门禁需全部算法)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const DBG = join(ROOT, 'scripts/elk-java-debug')
const JAVA = process.env.ELK_JAVA_HOME
  ? join(process.env.ELK_JAVA_HOME, 'bin/java')
  : '/opt/homebrew/opt/openjdk@21/bin/java'
const CP = `${join(DBG, 'out-edge')}:${join(DBG, 'lib')}/*`
// 不含 rectpacking jar 的 classpath: rectpacking jar 加入会改变 Java 批量 JVM 状态
// (self_loops 族 harness 污染, R04/rectpacking 实证: 无 jar 343 差异 0 vs 有 jar 339 差异 4).
const CP_NO_RECTPACKING = `${join(DBG, 'out-edge')}:${readdirSync(join(DBG, 'lib'))
  .filter((f) => !f.includes('rectpacking'))
  .map((f) => join(DBG, 'lib', f)).join(':')}`

const argv = process.argv.slice(2)
const GLOB_PATTERNS = argv.filter((a) => !a.startsWith('--'))
const GLOB = GLOB_PATTERNS.join(' ') || '{examples,tests,tickets}/**/*.elkt'
const EPS = argv.includes('--eps') ? Number(argv[argv.indexOf('--eps') + 1]) : 1e-3
const MAX = argv.includes('--max') ? Number(argv[argv.indexOf('--max') + 1]) : Infinity

const t0 = Date.now()
const files = (GLOB_PATTERNS.length ? GLOB_PATTERNS : ['{examples,tests,tickets}/**/*.elkt']).flatMap((g) => globSync(join(MODEL_ROOT, g)))
  .filter((f) => !f.includes('/realworld/') || true)
  .sort()
  .slice(0, Number.isFinite(MAX) ? MAX : undefined)
console.log(`[vlayout] 模型数: ${files.length} (glob=${GLOB}, eps=${EPS}, max=${MAX})`)

// ── 1) 每个 elkt → 标准 ELK JSON (ggn 导出, 与 jar oracle 同源) ──
const tmp = mkdtempSync(join(tmpdir(), 'vlayout-'))
const models: { rel: string; json: string }[] = []
try {
  for (const f of files) {
    const json = JSON.stringify(elktToElkJson(parseElkt(readFileSync(f, 'utf8'))))
    models.push({ rel: f.slice(MODEL_ROOT.length + 1), json })
    writeFileSync(join(tmp, `${models.length - 1}.json`), json)
  }

  // ── 2) ELK Java 批量布局 (单 JVM, 一次处理全部) ──
  const tmpFiles = models.map((_, i) => join(tmp, `${i}.json`))
  console.log('[vlayout] 运行 ELK Java 批量布局 …')
  const jRes = spawnSync(JAVA, ['-cp', CP, 'LayoutJsonMain', ...tmpFiles], {
    maxBuffer: 1 << 30, encoding: 'utf8',
  })
  const jOut = String(jRes.stdout ?? '')
  const jErrOut = String(jRes.stderr ?? '')
  const jByFile = new Map<string, string>()
  const jErrByFile = new Map<string, string>() // ###ERR 文件 → 异常摘要 (stderr 行 "<file>: <exception>")
  const jLines = jOut.split('\n')
  let cur: string | null = null
  for (const line of jLines) {
    const m = line.match(/^###(?:ERR)? (.+)$/)
    if (m) { cur = m[1]; continue }
    // ###ERR 后无 stdout 内容 (异常摘要打到 stderr) — 只记录成功模型.
    if (cur !== null && line.trim()) { jByFile.set(cur, line.trim()); cur = null }
  }
  for (const line of jErrOut.split('\n')) {
    const m = line.match(/^(.+?):\s*(.+)$/)
    if (m) {
      const key = tmpFiles.find((f) => f.endsWith(m[1])) ?? m[1]
      jErrByFile.set(key, m[2])
    }
  }

  // ── 3) ggn 布局 + 差分 (跳过非 layered 算法模型: 见 alg-filter.mjs, 与 verify-bit-exact 共用) ──
  // 语义: 只按根节点显式算法判定 — 根显式非 layered (rectpacking/topdownpacking/sporeOverlap 等) → 跳过;
  // 嵌套非 layered 是黑盒, 保留 (hierarchicalLayoutMixing/665/588 等根 layered 形态必须留在比较范围).
  // ── 4) ggn 布局 + 差分 ──
  const num = (v: unknown) => (v === undefined || v === null ? null : Number(v))
  const keyN = (p: number[], c?: unknown) => `${(p[0] ?? 0).toFixed(3)},${(p[1] ?? 0).toFixed(3)}${c !== undefined ? `,${c}` : ''}`

  /** 归一化: 节点 (相对父坐标) + 边 (挂载容器, sources/targets, sections 点序列). */
  function normGraph(root: any) {
    const nodes = new Map<string, number[]>()
    const edges = new Map<string, string[]>()
    const walk = (node: any, path: string[]) => {
      const full = path.join('::')
      if (path.length > 0) nodes.set(`${full}::${node.id}`, [num(node.x) ?? 0, num(node.y) ?? 0, num(node.width) ?? 0, num(node.height) ?? 0])
      for (const e of node.edges ?? []) {
        const sources = (e.sources ?? []).map(String).sort()
        const targets = (e.targets ?? []).map(String).sort()
        const key = `${full}::${sources.join('|')}->${targets.join('|')}`
        const sections = (e.sections ?? []).map((s: any) => {
          const pts: string[] = [`s${keyN([num(s.startPoint?.x), num(s.startPoint?.y)])}`]
          for (const b of s.bendPoints ?? []) pts.push(`b${keyN([num(b.x), num(b.y)])}`)
          pts.push(`t${keyN([num(s.endPoint?.x), num(s.endPoint?.y)])}`)
          return pts.join(' ')
        })
        // 平行边 (同 source/target) 在 ELK 输出里顺序可能不同: 每个 key 存全部 section 字符串.
        for (const sec of sections) {
          const list = edges.get(key)
          if (list) list.push(sec)
          else edges.set(key, [sec])
        }
      }
      for (const c of node.children ?? []) walk(c, [...path, c.id])
    }
    walk(root, [])
    return { nodes, edges }
  }

  /** 容差比较: 数值向量逐元素 |a-b| ≤ eps (null 视为 0 差异的缺失值, 两边同时缺才等). */
  const vecEq = (a: number[], b: number[]) =>
    a.length === b.length && a.every((v, i) => Math.abs(v - (b[i] ?? NaN)) <= EPS)

  let fullEq = 0, nodeDiff = 0, edgeDiff = 0, err = 0, errMatch = 0, skippedNonLayered = 0, harnessExempt = 0
  const failModels: { rel: string; nodes: string[]; edges: string[] }[] = []

  /** Java 异常短类名 (org.eclipse.elk.core.UnsupportedGraphException → UnsupportedGraphException). */
  const excName = (s: string): string => (s.match(/\b(\w+Exception):?/) ?? [])[1] ?? ''

  for (let i = 0; i < models.length; i++) {
    const { rel, json } = models[i]
    const input = JSON.parse(json)
    const javaRaw = jByFile.get(tmpFiles[i])
    // 先判算法族: 非 layered (box/rectpacking/stress/force 等) 未移植 → 跳过, 无论 Java 是否有输出
    // (此前 Java 无输出先判 → stress/rectpacking 模型被误记 err, 348 统计虚高 4).
    if (!isLayered(input)) { skippedNonLayered++; continue }
    if (!javaRaw) {
      // Java 自身报错 (###ERR): ggn 复刻同异常类 → 行为对齐 (R18/588 跨层级边 UnsupportedGraphException).
      let ggnErr: Error | null = null
      try { layoutElkJson(input) } catch (e) { ggnErr = e as Error }
      const javaErr = jErrByFile.get(tmpFiles[i]) ?? ''
      if (ggnErr !== null && javaErr && excName(javaErr) === excName(String(ggnErr.message))) {
        errMatch++
        console.log(`✓ ${rel}: 复刻 jar 报错 (${excName(javaErr)})`)
      } else {
        err++
        console.log(`✗ ${rel}: Java 无输出${ggnErr !== null ? ` | ggn 抛 ${String(ggnErr.message).slice(0, 60)}` : ''}`)
      }
      continue
    }
    const ggn = normGraph(layoutElkJson(input))
    const java = normGraph(JSON.parse(javaRaw))

    const nDiffs: string[] = []
    const allNodeKeys = new Set([...ggn.nodes.keys(), ...java.nodes.keys()])
    for (const k of allNodeKeys) {
      const a = ggn.nodes.get(k), b = java.nodes.get(k)
      if (!a || !b || !vecEq(a, b)) nDiffs.push(`${k} ggn=${a?.join(',')} jar=${b?.join(',')}`)
    }
    const eDiffs: string[] = []
    const allEdgeKeys = new Set([...ggn.edges.keys(), ...java.edges.keys()])
    for (const k of allEdgeKeys) {
      const a = ggn.edges.get(k), b = java.edges.get(k)
      if (!a || !b) { eDiffs.push(`${k} ggn=${JSON.stringify(a)} jar=${JSON.stringify(b)}`); continue }
      // 平行边 (同 source/target 多条) 在 ELK 输出里顺序可能不同, 按 section 多重集比较
      // (视觉等价, 避免 harness 键冲突假差异; 单条边时退化为逐条相等).
      const sa = [...a].sort(), sb = [...b].sort()
      if (sa.length !== sb.length || !sa.every((x, i) => x === sb[i])) {
        eDiffs.push(`${k} ggn=${JSON.stringify(a)} jar=${JSON.stringify(b)}`)
      }
    }

    if (nDiffs.length === 0 && eDiffs.length === 0) fullEq++
    else {
      // harness 豁免: 用不含 rectpacking jar 的 classpath 单独复跑, 若 ggn 与该输出全等 →
      // 差异源于 jar 的 Java 侧批量状态副作用 (self_loops 族), 非 ggn 缺陷 (无 jar 环境 343 差异 0 实证).
      let exempt = false
      const trySingle = (cp: string): boolean => {
        try {
          const inFile = join(tmp, `${i}.json`)
          const res = spawnSync(JAVA, ['-cp', cp, 'LayoutJsonMain', inFile], { maxBuffer: 1 << 30, encoding: 'utf8' })
          let jr: string | null = null
          for (const line of String(res.stdout ?? '').split('\n')) {
            if (/^###/.test(line)) continue
            if (line.trim()) jr = line.trim()
          }
          if (!jr) return false
          const java2 = normGraph(JSON.parse(jr))
          const nOK = [...ggn.nodes.keys()].every((k) => {
            const a = ggn.nodes.get(k), b = java2.nodes.get(k)
            return a !== undefined && b !== undefined && vecEq(a, b)
          })
          const eOK = [...ggn.edges.keys()].every((k) => {
            const a = ggn.edges.get(k), b = java2.edges.get(k)
            if (!a || !b) return false
            const sa = [...a].sort(), sb = [...b].sort()
            return sa.length === sb.length && sa.every((x, xi) => x === sb[xi])
          })
          return nOK && eOK && ggn.nodes.size === java2.nodes.size && ggn.edges.size === java2.edges.size
        } catch { return false }
      }
      // 批量差异 → 单独 JVM 复跑 (有 jar + 无 rectpacking jar 两种), 任一全等 → harness 状态污染豁免.
      exempt = trySingle(CP) || trySingle(CP_NO_RECTPACKING)
      if (exempt) {
        harnessExempt++
        console.log(`~ ${rel}: harness jar 污染豁免 (无 rectpacking jar 单独复跑全等)`)
      } else {
        if (nDiffs.length) nodeDiff++
        if (eDiffs.length) edgeDiff++
        failModels.push({ rel, nodes: nDiffs.slice(0, 4), edges: eDiffs.slice(0, 4) })
        console.log(`✗ ${rel}: nodes=${nDiffs.length} edges=${eDiffs.length}`)
        for (const d of nDiffs.slice(0, 2)) console.log(`    node  ${d}`)
        for (const d of eDiffs.slice(0, 2)) console.log(`    edge  ${d}`)
      }
    }
  }

  const aligned = fullEq + errMatch
  console.log(`\n[vlayout] 结果: ${aligned}/${models.length} 对齐 (坐标全等 ${fullEq} + 报错复刻 ${errMatch}${harnessExempt ? ` + harness 豁免 ${harnessExempt}` : ''}) | 非 layered 跳过 ${skippedNonLayered} | 节点差异 ${nodeDiff} | 边差异 ${edgeDiff} | Java 错误 ${err} | 耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  if (failModels.length) {
    console.log(`\n失败模型 (${failModels.length}):`)
    for (const f of failModels) console.log(`  ${f.rel}`)
  }
  // 门禁: 所有模型都有归因 (坐标全等 / 报错复刻 / 非 layered 跳过 / harness 豁免) 且无真实失败 → exit 0.
  // 旧判定 fullEq === models.length 未计入 skippedNonLayered/errMatch/harnessExempt, 干净跑也恒 exit 1 (审阅修复).
  process.exit(fullEq + errMatch + skippedNonLayered + harnessExempt === models.length && err === 0 ? 0 : 1)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
