#!/usr/bin/env bun
/**
 * bit-exact 可行性实验 (阶段 0, 审阅整合修订 A 第 0 步).
 *
 * 目的: 量化「当前 ggn vs ELK Java」的 bit-exact 率, 为浮点门禁策略分流:
 *   - 某类图全等率 > 99% -> 可对该类建 === 门禁 (真正防求和顺序引起的舍入差异)
 *   - 普遍非 bit-exact -> 放弃 bit-exact 默认, 改「相对容差 + 不变量」为主
 *
 * 与 verify-elkg-java-layout.ts 同 harness (同一份 ELK JSON -> jar LayoutJsonMain vs ggn layoutElkJson),
 * 区别: 坐标全精度 (不做 toFixed(3) 舍入), 逐坐标 === 比较, 输出模型级 + 坐标级统计:
 *   - 模型级: 全等 / 部分一致 / 零一致 / 结构差异 / 报错复刻 / Java 错误 / ggn 错误 / 非 layered 跳过
 *   - 坐标级: 精确率 + 偏差分布 (绝对 bin) + ULP 分位 (max/p99/p90)
 *   - 按图类 (examples/tests/tickets) 分组
 *
 * ── 门禁政策 (2026-09-13 用户授权放宽) ──
 * 判定 = **结构全等 + 数值在界内**:
 *   1. 结构全等 (硬线, 不看预算): 节点集合 (含层级归属) / 每节点端口 id 集合 / 边端点集合 /
 *      每条边的弯点数. 任一不同 → 结构差异 → 必失败.
 *      **不比输出顺序**: 实测 children 顺序两边本就不同 (NA,NB,NC,NF,ND,NE vs ...,ND,NE,NF)
 *      而坐标全等 —— 输出顺序不属于等价口径, 拿它当硬线会误杀.
 *   2. 数值在界内: 每模型上限取 registry entries[].bitExact.limitMaxUlp/limitMaxAbs;
 *      未登记上限的模型回落到 registry.numericBudget (maxUlp / maxAbsRelative×图包围盒对角线).
 *   3. 非有限值 (NaN/Inf) → 必失败.
 *   4. 确定性: --determinism 同模型跑两次须逐位一致 (排除 scratch 复用没重置这类状态泄漏).
 * 用途: 允许「改浮点运算顺序」的优化合入, 同时用结构 + 预算 + 确定性挡住真正的逻辑错.
 *   --strict: 回到旧政策 (全等 + 已登记豁免 + 报错复刻 + 跳过 才算覆盖; 关掉全局预算放行), 用于二分定位回归.
 * 文件名 verify-bit-exact 是历史名; 严格模式用 --strict.
 *
 * 用法: bun scripts/verify-bit-exact.mjs [--glob <pattern>] [--max N] [--no-exempt] [--no-gate] [--strict] [--determinism]
 *   --no-gate: 关闭门禁模式 (只出报告, 恒 exit 0).
 *   覆盖 = 全等 + 结构全等且预算内 + 豁免A + 豁免B + 报错复刻 + 非 layered 跳过.
 * 豁免清单从 triage-registry.json 的 entries[].bitExact 读取 (不硬编码), graph 名用
 * `__` 双下划线格式 (相对路径去 .elkt, / → __), 与现有 registry 条目一致.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { globSync } from 'glob'
import { parseElkt, elktToElkJson } from './elkt2test.mjs'
import { isLayered } from './alg-filter.mjs'
import { layoutElkJson } from '../src/api/elk-json.ts'
import '../src/api/register-all.ts' // 非 layered provider 注册 (门禁全量需全部算法)

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_ROOT = join(ROOT, 'test-resources/elk-models')
const DBG = join(ROOT, 'scripts/elk-java-debug')
const JAVA = process.env.ELK_JAVA_HOME
  ? join(process.env.ELK_JAVA_HOME, 'bin/java')
  : '/opt/homebrew/opt/openjdk@21/bin/java'
const CP = join(DBG, 'out-edge') + ':' + join(DBG, 'lib') + '/*'
const CP_NO_RECTPACKING = join(DBG, 'out-edge') + ':' + readdirSync(join(DBG, 'lib'))
  .filter((f) => !f.includes('rectpacking'))
  .map((f) => join(DBG, 'lib', f)).join(':')

const argv = process.argv.slice(2)
const GLOB_PATTERNS = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a))
const GLOB = GLOB_PATTERNS.join(' ') || '{examples,tests,tickets}/**/*.elkt'
const MAX = argv.includes('--max') ? Number(argv[argv.indexOf('--max') + 1]) : Infinity
const NO_EXEMPT = argv.includes('--no-exempt')
const STRICT = argv.includes('--strict')
const DETERMINISM = argv.includes('--determinism')

const BINS = [0, 1e-12, 1e-9, 1e-6, 1e-3, 1e-1, 2, Infinity]
const BIN_LABEL = ['==0', '<=1e-12', '<=1e-9', '<=1e-6', '<=1e-3', '<=1e-1', '<=2', '>2']

// ── 豁免登记 (待办 3): 从 triage-registry.json entries[].bitExact 读取, 不硬编码 ──
// registry graph 名格式: 相对路径去 .elkt、/ → __ (如 examples__hierarchy__hierarchicalLayoutMixing);
// 本脚本 rel 格式: examples/hierarchy/hierarchicalLayoutMixing.elkt — 读时做格式映射.
const REGISTRY = JSON.parse(readFileSync(join(ROOT, 'triage-registry.json'), 'utf8'))
const NUMERIC_BUDGET = REGISTRY.numericBudget ?? { maxUlp: 0, maxAbsRelative: 0 }
const REG_BY_REL = new Map() // rel(带 .elkt) -> { class, limitMaxUlp, limitMaxAbs, graph }
for (const e of REGISTRY.entries ?? []) {
  if (!e.bitExact) continue
  REG_BY_REL.set(e.graph.replaceAll('__', '/') + '.elkt', { ...e.bitExact, graph: e.graph })
}
const REG_NON_LAYERED = new Set() // rel -> true (登记为非 layered 的模型)
for (const e of REGISTRY.entries ?? []) {
  if (e.bitExact?.class === 'nonLayered') REG_NON_LAYERED.add(e.graph.replaceAll('__', '/') + '.elkt')
}

const num = (v) => (v === undefined || v === null ? null : Number(v))

/** 全精度归一化: 节点 [x,y,w,h] 原始数字; 边 sections -> 点数组序列 (不做 toFixed 舍入). */
function normGraphFull(root) {
  const nodes = new Map()
  const edges = new Map()
  const walk = (node, path) => {
    const full = path.join('::')
    if (path.length > 0) nodes.set(full + '::' + node.id, [num(node.x) ?? 0, num(node.y) ?? 0, num(node.width) ?? 0, num(node.height) ?? 0])
    for (const e of node.edges ?? []) {
      const sources = (e.sources ?? []).map(String).sort()
      const targets = (e.targets ?? []).map(String).sort()
      const key = full + '::' + sources.join('|') + '->' + targets.join('|')
      const sections = (e.sections ?? []).map((s) => {
        const pts = [[num(s.startPoint?.x) ?? 0, num(s.startPoint?.y) ?? 0]]
        for (const b of s.bendPoints ?? []) pts.push([num(b.x) ?? 0, num(b.y) ?? 0])
        pts.push([num(s.endPoint?.x) ?? 0, num(s.endPoint?.y) ?? 0])
        return pts
      })
      const list = edges.get(key)
      if (list) for (const sec of sections) list.push(sec)
      else edges.set(key, [...sections])
    }
    for (const c of node.children ?? []) walk(c, [...path, c.id])
  }
  walk(root, [])
  return { nodes, edges }
}

/** 结构视图: 集合级 (不看顺序). 用于「结构全等」硬线判定. */
function structureOf(root) {
  const nodeKeys = new Set()      // 容器路径::id —— 层级归属编码在路径里
  const portIds = new Map()       // nodeKey -> 端口 id 排序后拼接 (集合语义)
  const edgeKeys = new Set()      // 容器路径::源->目标
  const sectionCounts = new Map() // edgeKey -> 各段的点数序列
  const walk = (node, path) => {
    const container = path.join('::')
    if (path.length > 0) {
      const key = container + '::' + String(node.id)
      nodeKeys.add(key)
      const ids = (node.ports ?? []).map((p) => String(p.id)).sort()
      if (ids.length) portIds.set(key, ids.join(','))
    }
    for (const e of node.edges ?? []) {
      const sources = (e.sources ?? []).map(String).sort()
      const targets = (e.targets ?? []).map(String).sort()
      const key = container + '::' + sources.join('|') + '->' + targets.join('|')
      edgeKeys.add(key)
      const counts = (e.sections ?? []).map((sec) => 2 + (sec.bendPoints?.length ?? 0))
      // 平行边会共用同一个 key → 累积成多重集; 取排序后拼接, 与 cmpModel 的边比较口径一致
      // (实测: 同一组平行边的段出现顺序两边不同 —— ggn [2,6] vs java [6,2], 但几何全等)
      const prev = sectionCounts.get(key)
      if (prev === undefined) sectionCounts.set(key, [...counts].sort((a, b) => a - b))
      else prev.push(...counts)
    }
    for (const c of node.children ?? []) walk(c, [...path, String(c.id)])
  }
  walk(root, [])
  return { nodeKeys, portIds, edgeKeys, sectionCounts }
}

/** 结构差异计数 (只看集合级; 顺序差异不算). */
function structDiff(a, b) {
  let missingNodes = 0, extraNodes = 0, portDiff = 0, missingEdges = 0, extraEdges = 0, sectionDiff = 0
  for (const k of a.nodeKeys) if (!b.nodeKeys.has(k)) missingNodes++
  for (const k of b.nodeKeys) if (!a.nodeKeys.has(k)) extraNodes++
  for (const [k, v] of a.portIds) if (b.portIds.get(k) !== v) portDiff++
  for (const [k, v] of b.portIds) if (a.portIds.get(k) !== v) portDiff++
  for (const k of a.edgeKeys) if (!b.edgeKeys.has(k)) missingEdges++
  for (const k of b.edgeKeys) if (!a.edgeKeys.has(k)) extraEdges++
  const norm = (arr) => (arr === undefined ? undefined : [...arr].sort((x, y) => x - y).join(','))
  for (const [k, v] of a.sectionCounts) {
    const w = b.sectionCounts.get(k)
    if (w !== undefined && norm(w) !== norm(v)) sectionDiff++
  }
  const total = missingNodes + extraNodes + portDiff + missingEdges + extraEdges + sectionDiff
  return { total, missingNodes, extraNodes, portDiff, missingEdges, extraEdges, sectionDiff }
}

/** 图包围盒对角线 —— 相对预算的尺度基准 (绝对容差随图大小缩放). */
function bboxDiagonalOf(graph) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [x, y, w, h] of graph.nodes.values()) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    minX = Math.min(minX, x); minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + (Number.isFinite(w) ? w : 0)); maxY = Math.max(maxY, y + (Number.isFinite(h) ? h : 0))
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) return 1
  return Math.max(Math.hypot(maxX - minX, maxY - minY), 1)
}

/** 该模型的数值上限: 每模型登记优先, 否则回落到全局 numericBudget. */
function budgetFor(rel, bboxDiagonal) {
  const reg = REG_BY_REL.get(rel)
  const hasModelLimit = reg && (reg.limitMaxUlp != null || reg.limitMaxAbs != null)
  if (hasModelLimit) {
    return { maxUlp: reg.limitMaxUlp ?? Infinity, maxAbs: reg.limitMaxAbs ?? Infinity, source: 'model' }
  }
  const maxUlp = NUMERIC_BUDGET.maxUlp ?? 0
  const maxAbs = (NUMERIC_BUDGET.maxAbsRelative ?? 0) * (Number.isFinite(bboxDiagonal) && bboxDiagonal > 0 ? bboxDiagonal : 1)
  return { maxUlp, maxAbs, source: 'global' }
}

/** ULP 尺度下限: 坐标绝对值小于「图包围盒对角线 × 1e-6」时, 视为与原点同量级.
 *  为什么需要: 纯按 |x| 取 ULP 在 0 附近会爆炸 —— ulpOf(0)=Number.MIN_VALUE,
 *  任何一点扰动都变成 1e15 ULP (自检实测 4.5e15), 预算判定失去意义.
 *  下限只让近零处的 ULP 比值变小 → 只会放宽, 不会误伤已有的紧上限 (exemptA limitMaxUlp=8). */
let ULP_FLOOR = 0
function ulpOf(x) {
  const a = Math.max(Math.abs(x), ULP_FLOOR)
  if (a === 0 || !Number.isFinite(a)) return Number.MIN_VALUE
  return 2 ** (Math.floor(Math.log2(a)) - 52)
}

/** 逐坐标 === 比较, 返回统计. */
function cmpModel(a, b) {
  const st = { exact: 0, total: 0, maxAbs: 0, maxUlp: 0, ulps: [], bins: new Array(BINS.length).fill(0), missing: 0, mismatchLen: 0, nonFinite: 0 }
  const cmpVal = (x, y) => {
    st.total++
    if (!Number.isFinite(x) || !Number.isFinite(y)) st.nonFinite++
    if (x === y) { st.exact++; st.bins[0]++; return }
    const d = Math.abs(x - y)
    if (d > st.maxAbs) st.maxAbs = d
    const u = d / Math.max(ulpOf(x), ulpOf(y), Number.MIN_VALUE)
    if (u > st.maxUlp) st.maxUlp = u
    st.ulps.push(u)
    for (let i = 1; i < BINS.length; i++) { if (d <= BINS[i]) { st.bins[i]++; break } }
  }
  const allNodeKeys = new Set([...a.nodes.keys(), ...b.nodes.keys()])
  for (const k of allNodeKeys) {
    const va = a.nodes.get(k), vb = b.nodes.get(k)
    if (!va || !vb) { st.missing++; continue }
    for (let i = 0; i < 4; i++) cmpVal(va[i], vb[i])
  }
  const allEdgeKeys = new Set([...a.edges.keys(), ...b.edges.keys()])
  for (const k of allEdgeKeys) {
    const ea = a.edges.get(k), eb = b.edges.get(k)
    if (!ea || !eb) { st.missing++; continue }
    if (ea.length !== eb.length) { st.mismatchLen++; continue }
    const sa = [...ea].sort((p, q) => JSON.stringify(p) < JSON.stringify(q) ? -1 : 1)
    const sb = [...eb].sort((p, q) => JSON.stringify(p) < JSON.stringify(q) ? -1 : 1)
    for (let i = 0; i < sa.length; i++) {
      const pa = sa[i], pb = sb[i]
      if (pa.length !== pb.length) { st.mismatchLen++; continue }
      for (let j = 0; j < pa.length; j++) cmpVal(pa[j][0], pb[j][0]), cmpVal(pa[j][1], pb[j][1])
    }
  }
  return st
}

function pct(arr, p) {
  if (arr.length === 0) return 0
  const s = [...arr].sort((x, y) => x - y)
  return s[Math.min(s.length - 1, Math.floor(s.length * p))]
}

// ── 自检 (--selftest): 证明三层判定仍拦得住真错 (负向验证, 不依赖 Java) ──
if (argv.includes('--selftest')) {
  const mk = (opts = {}) => ({
    id: 'root',
    children: [
      { id: 'a', x: opts.shift ?? 0, y: 0, width: 10, height: 10, children: [], edges: [], ports: [{ id: 'p1' }] },
      ...(opts.drop ? [] : [{ id: 'b', x: opts.nan ? NaN : 10, y: 0, width: 10, height: 10, children: [], edges: [], ports: [] }]),
    ],
    edges: [],
  })
  const base = mk()
  const bNorm = normGraphFull(base)
  ULP_FLOOR = bboxDiagonalOf(bNorm) * 1e-6
  const budget = { maxUlp: 1e6, maxAbs: 1e-9 * bboxDiagonalOf(bNorm), source: 'selftest' }
  const cases = []
  // ① 完全相同 → 全等
  {
    const st = cmpModel(bNorm, normGraphFull(mk()))
    const sd = structDiff(structureOf(base), structureOf(mk()))
    cases.push(['全等基线', st.exact === st.total && sd.total === 0, ''])
  }
  // ② 结构差异 (少一个节点) → 必须拦
  {
    const other = mk({ drop: true })
    const sd = structDiff(structureOf(base), structureOf(other))
    cases.push(['结构差异必须失败', sd.total > 0, `struct=${JSON.stringify(sd)}`])
  }
  // ③ 数值超预算 → 必须拦
  {
    const st = cmpModel(bNorm, normGraphFull(mk({ shift: 1e-3 })))
    cases.push(['超预算必须失败', st.maxAbs > budget.maxAbs, `maxAbs=${st.maxAbs.toExponential(2)} > ${budget.maxAbs.toExponential(2)}`])
  }
  // ④ 非有限值 → 必须拦
  {
    const st = cmpModel(bNorm, normGraphFull(mk({ nan: true })))
    cases.push(['非有限值必须失败', st.nonFinite > 0, `nonFinite=${st.nonFinite}`])
  }
  // ⑤ 极小舍入差异 (1 ULP) → 必须放行
  {
    const st = cmpModel(bNorm, normGraphFull(mk({ shift: 2 ** -49 })))
    cases.push(['1 ULP 舍入差异必须放行', st.maxAbs <= budget.maxAbs && st.maxUlp <= budget.maxUlp, `maxUlp=${st.maxUlp.toExponential(2)}`])
  }
  let bad = 0
  console.log('[vbitexact] 自检 (负向验证):')
  for (const [name, ok, detail] of cases) {
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + name + (detail ? ' — ' + detail : ''))
    if (!ok) bad++
  }
  console.log('[vbitexact] 自检: ' + (bad === 0 ? '通过' : '失败 ' + bad + ' 项'))
  process.exit(bad === 0 ? 0 : 1)
}

// ── 主流程 ──
const t0 = Date.now()
const files = (GLOB_PATTERNS.length ? GLOB_PATTERNS : ['{examples,tests,tickets}/**/*.elkt']).map((g) => globSync(join(MODEL_ROOT, g))).flat()
  .filter((f) => !f.includes('/realworld/'))
  .sort()
  .slice(0, Number.isFinite(MAX) ? MAX : undefined)
console.log('[vbitexact] 模型数: ' + files.length + ' (glob=' + GLOB + (Number.isFinite(MAX) ? ', max=' + MAX : '') + ')')

const tmp = mkdtempSync(join(tmpdir(), 'vbitexact-'))
const models = []
try {
  for (const f of files) {
    const json = JSON.stringify(elktToElkJson(parseElkt(readFileSync(f, 'utf8'))))
    models.push({ rel: f.slice(MODEL_ROOT.length + 1), json })
    writeFileSync(join(tmp, models.length + '.json'), json)
  }
  const tmpFiles = models.map((_, i) => join(tmp, String(i + 1) + '.json'))
  console.log('[vbitexact] 运行 ELK Java 批量布局 ...')
  const jRes = spawnSync(JAVA, ['-cp', CP, 'LayoutJsonMain', ...tmpFiles], { maxBuffer: 1 << 30, encoding: 'utf8' })
  const jByFile = new Map()
  let cur = null
  for (const line of String(jRes.stdout ?? '').split('\n')) {
    const m = line.match(/^###(?:ERR)? (.+)$/)
    if (m) { cur = m[1]; continue }
    if (cur !== null && line.trim()) { jByFile.set(cur, line.trim()); cur = null }
  }
  const jErrByFile = new Map()
  for (const line of String(jRes.stderr ?? '').split('\n')) {
    const m = line.match(/^(.+?):\s*(.+)$/)
    if (m) jErrByFile.set(tmpFiles.find((f) => f.endsWith(m[1])) ?? m[1], m[2])
  }
  const excName = (s) => (s.match(/\b(\w+Exception):?/) ?? [])[1] ?? ''

  let fullExact = 0, partial = 0, zeroExact = 0, structural = 0, nonFinite = 0, withinBudget = 0, errMatch = 0, javaErr = 0, ggnErr = 0, skipped = 0
  const groupStats = new Map() // topDir -> { models, fullExact, nodeExact, nodeTotal, edgeExact, edgeTotal }
  const worst = [] // { rel, maxUlp, maxAbs }
  const gate = { covered: new Set(), exemptA: 0, exemptB: 0, failures: [], nowExact: [], withinBudget: [], skippedRels: new Set(), comparedNonLayered: [], skippedExempt: [] }

  for (let i = 0; i < models.length; i++) {
    const { rel, json } = models[i]
    const input = JSON.parse(json)
    const topDir = rel.split('/')[0]
    if (!groupStats.has(topDir)) groupStats.set(topDir, { models: 0, fullExact: 0 })
    const gs = groupStats.get(topDir)
    gs.models++
    const javaRaw = jByFile.get(tmpFiles[i])
    if (!isLayered(input)) { skipped++; gate.skippedRels.add(rel); gate.covered.add(rel); continue }
    if (!javaRaw) {
      let gErr = null
      try { layoutElkJson(input) } catch (e) { gErr = e }
      const je = jErrByFile.get(tmpFiles[i]) ?? ''
      if (gErr !== null && je && excName(je) === excName(String(gErr.message))) { errMatch++; gate.covered.add(rel) }
      else { javaErr++; gate.failures.push({ rel, kind: 'javaErr' }) }
      continue
    }
    let ggn, ggnOut
    try { ggnOut = layoutElkJson(input); ggn = normGraphFull(ggnOut) } catch (e) { ggnErr++; console.log('! ' + rel + ' ggn 抛错: ' + String(e.message).slice(0, 80)); gate.failures.push({ rel, kind: 'ggnErr' }); continue }
    const javaOut = JSON.parse(javaRaw)
    const java = normGraphFull(javaOut)
    const struct = structDiff(structureOf(ggnOut), structureOf(javaOut))
    const bbox = bboxDiagonalOf(ggn)
    ULP_FLOOR = bbox * 1e-6
    let st = cmpModel(ggn, java)

    // harness 豁免: 批量有差异 -> 无 rectpacking jar 单 JVM 复跑, bit-exact 则豁免 (与 342/348 门禁同方法论).
    if (st.total > 0 && st.exact < st.total && !NO_EXEMPT) {
      const inFile = tmpFiles[i]
      const res = spawnSync(JAVA, ['-cp', CP_NO_RECTPACKING, 'LayoutJsonMain', inFile], { maxBuffer: 1 << 30, encoding: 'utf8' })
      let jr = null
      for (const line of String(res.stdout ?? '').split('\n')) {
        if (/^###/.test(line)) continue
        if (line.trim()) jr = line.trim()
      }
      if (jr) {
        const java2Out = JSON.parse(jr)
        const java2 = normGraphFull(java2Out)
        const st2 = cmpModel(ggn, java2)
        if (st2.exact === st2.total && st2.missing === 0 && st2.mismatchLen === 0 && structDiff(structureOf(ggnOut), structureOf(java2Out)).total === 0) st = st2
      }
    }

    // 确定性: 同模型跑两次须逐位一致 (排除 scratch 复用没重置这类状态泄漏 —— 那不是舍入差异)
    if (DETERMINISM) {
      const again = normGraphFull(layoutElkJson(input))
      const dt = cmpModel(ggn, again)
      const deterministic = dt.total > 0 && dt.exact === dt.total && dt.missing === 0 && dt.mismatchLen === 0
      if (!deterministic) gate.failures.push({ rel, kind: 'nondeterministic', maxUlp: dt.maxUlp, maxAbs: dt.maxAbs })
    }

    // 分节点/边统计需要分开: 这里简化用模型级 exact/total 汇总
    const isFullExact = st.total > 0 && st.exact === st.total && st.missing === 0 && st.mismatchLen === 0
    gs.fullExact += isFullExact ? 1 : 0
    const rate = st.total > 0 ? st.exact / st.total : 1
    const budget = budgetFor(rel, bbox)
    const reg = REG_BY_REL.get(rel)
    const isExempt = reg && (reg.class === 'exemptA' || reg.class === 'exemptB')
    let outcome = 'full'
    if (isFullExact) { fullExact++ }
    else if (struct.total > 0) { structural++; outcome = 'structural' }
    else if (st.nonFinite > 0) { nonFinite++; outcome = 'nonFinite' }
    else if (st.exact === 0) { zeroExact++; outcome = 'zero' }
    else { partial++; outcome = 'partial' }
    // ── 门禁三层判定: ① 结构全等(硬线) → ② 非有限值 → ③ 数值预算 ──
    if (reg && reg.class === 'nonLayered') {
      gate.comparedNonLayered.push(rel) // 登记非 layered 却被比较 → registry/模型不一致
    } else if (struct.total > 0) {
      // 结构变了 = 逻辑信号, 预算再小也不放行 (1 ULP 的比较翻转可以整张图换样, 但那是结构全等前提下的连锁)
      gate.failures.push({ rel, kind: 'structural', struct })
    } else if (st.nonFinite > 0) {
      gate.failures.push({ rel, kind: 'nonFinite', nonFinite: st.nonFinite })
    } else if (st.maxUlp > budget.maxUlp || st.maxAbs > budget.maxAbs) {
      gate.failures.push({
        rel, kind: 'overBudget', maxUlp: st.maxUlp, maxAbs: st.maxAbs,
        limitMaxUlp: budget.maxUlp === Infinity ? undefined : budget.maxUlp,
        limitMaxAbs: budget.maxAbs === Infinity ? undefined : budget.maxAbs,
        budgetSource: budget.source,
      })
    } else if (STRICT && !isFullExact && !isExempt) {
      // 严格模式 = 旧政策: 只有全等或「已登记豁免(且在各自上限内)」算覆盖;
      // 新增的「全局预算内放行」这条路在严格模式下关掉.
      gate.failures.push({ rel, kind: 'notBitExact', maxUlp: st.maxUlp, maxAbs: st.maxAbs })
    } else {
      gate.covered.add(rel)
      if (!isFullExact) {
        if (isExempt) { if (reg.class === 'exemptA') gate.exemptA++; else gate.exemptB++ }
        else { withinBudget++; gate.withinBudget.push({ rel, maxUlp: st.maxUlp, maxAbs: st.maxAbs, source: budget.source }) }
      }
      if (isExempt && st.maxAbs === 0 && st.maxUlp === 0) gate.nowExact.push(rel)
    }
    if (st.maxUlp > 0) worst.push({ rel, maxUlp: st.maxUlp, maxAbs: st.maxAbs, rate })
    const line = (st.exact === st.total && st.missing === 0 && st.mismatchLen === 0 ? '=' : '~') + ' ' + rel
      + ' coords=' + st.total + ' exact=' + st.exact + ' (' + (st.total ? (100 * st.exact / st.total).toFixed(1) : '100') + '%)'
      + ' maxAbs=' + st.maxAbs.toExponential(2) + ' maxUlp=' + (st.maxUlp === 0 ? '0' : st.maxUlp.toExponential(2))
      + (st.missing ? ' missing=' + st.missing : '') + (st.mismatchLen ? ' lenMismatch=' + st.mismatchLen : '')
    console.log(line)
  }

  // 汇总
  console.log('\n[vbitexact] 政策: ' + (STRICT ? '严格 (逐位全等)' : '结构全等 + 数值在界内')
    + ' | 全局预算 maxUlp=' + NUMERIC_BUDGET.maxUlp + ' maxAbsRelative=' + NUMERIC_BUDGET.maxAbsRelative)
  console.log('\n[vbitexact] 模型级: 全等 ' + fullExact + ' | 部分一致 ' + partial + ' | 零一致 ' + zeroExact
    + ' | 预算内(非全等) ' + withinBudget + ' | 结构差异 ' + structural + ' | 非有限值 ' + nonFinite
    + ' | 报错复刻 ' + errMatch + ' | Java 错误 ' + javaErr + ' | ggn 错误 ' + ggnErr
    + ' | 非 layered 跳过 ' + skipped + ' | 总 ' + models.length + ' | 耗时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's')
  console.log('\n[vbitexact] 按图类:')
  for (const [d, g] of groupStats) {
    console.log('  ' + d + ': 模型 ' + g.models + ' 全等 ' + g.fullExact + ' (' + (g.models ? (100 * g.fullExact / g.models).toFixed(1) : '0') + '%)')
  }
  const worstSorted = worst.sort((a, b) => b.maxUlp - a.maxUlp)
  console.log('\n[vbitexact] 偏差最大 15 个模型 (按 maxUlp):')
  for (const w of worstSorted.slice(0, 15)) {
    console.log('  ' + w.rel + ' maxUlp=' + w.maxUlp.toExponential(2) + ' maxAbs=' + w.maxAbs.toExponential(2) + ' exactRate=' + (100 * w.rate).toFixed(1) + '%')
  }

  // ── 门禁 (待办 2, 默认开启; --no-gate 关闭) ──
  const GATE = !argv.includes('--no-gate')
  for (const rel of gate.comparedNonLayered) gate.failures.push({ rel, kind: 'nonLayeredCompared' })
  for (const rel of gate.skippedRels) {
    if (!REG_NON_LAYERED.has(rel)) console.log('  ! ' + rel + ' 被跳过但未在 registry 登记为非 layered (请登记)')
    if (REG_BY_REL.get(rel) && (REG_BY_REL.get(rel).class === 'exemptA' || REG_BY_REL.get(rel).class === 'exemptB')) {
      gate.skippedExempt.push(rel) // 豁免模型被跳过 → 登记与模型不一致 (告警, 不阻断)
    }
  }
  const gatePass = gate.covered.size === models.length && gate.failures.length === 0
  console.log('\n[vbitexact] 门禁: ' + (GATE ? (gatePass ? '通过' : '失败') : '关闭 (--no-gate)')
    + ' | 覆盖 ' + gate.covered.size + '/' + models.length
    + ' = 全等 ' + fullExact + ' + 预算内 ' + withinBudget + ' + 豁免A ' + gate.exemptA + ' + 豁免B ' + gate.exemptB
    + ' + 报错复刻 ' + errMatch + ' + 跳过 ' + skipped + ' | 失败 ' + gate.failures.length)
  if (gate.withinBudget.length) {
    console.log('[vbitexact] 结构全等、数值在全局预算内 (允许, 但需可见): ' + gate.withinBudget.length + ' 个')
    for (const w of gate.withinBudget.slice(0, 20)) {
      console.log('    ' + w.rel + ' maxUlp=' + w.maxUlp.toExponential(2) + ' maxAbs=' + w.maxAbs.toExponential(2) + ' (limit=' + w.source + ')')
    }
    if (gate.withinBudget.length > 20) console.log('    … 其余 ' + (gate.withinBudget.length - 20) + ' 个')
  }
  if (gate.nowExact.length) {
    console.log('[vbitexact] 提示 (可移除豁免, 已 bit-exact): ' + gate.nowExact.length + ' 个')
    for (const rel of gate.nowExact) console.log('    ' + rel)
  }
  if (gate.skippedExempt.length) {
    console.log('[vbitexact] 提示 (豁免模型被跳过, 登记与模型不一致): ' + gate.skippedExempt.length + ' 个')
    for (const rel of gate.skippedExempt) console.log('    ' + rel)
  }
  if (gate.failures.length) {
    console.log('[vbitexact] 门禁失败 ' + gate.failures.length + ' 个:')
    for (const f of gate.failures) {
      console.log('  [' + f.kind + '] ' + f.rel
        + (f.struct !== undefined ? ' 结构差异=' + JSON.stringify(f.struct) : '')
        + (f.nonFinite !== undefined ? ' 非有限值=' + f.nonFinite : '')
        + (f.maxUlp !== undefined ? ' maxUlp=' + f.maxUlp.toExponential(2) + ' maxAbs=' + f.maxAbs.toExponential(2) : '')
        + (f.limitMaxUlp !== undefined ? ' limitUlp=' + f.limitMaxUlp : '')
        + (f.limitMaxAbs !== undefined ? ' limitAbs=' + f.limitMaxAbs : '')
        + (f.budgetSource !== undefined ? ' budget=' + f.budgetSource : ''))
    }
  }
  if (GATE && !gatePass) process.exit(1)
  process.exit(0)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
