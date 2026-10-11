/**
 * 边路由 E2E 共享库 — 供 tests/oracle/EdgeRoutingE2ETest.test.ts 与
 * scripts/scan-edge-e2e.mjs 复用同一套「ggn vs ELK Java jar 边弯点」对比语义.
 *
 * SSOT = ELK Java 0.12.0 jar (test-resources/edge-dirs-oracle.json).
 * 用例正交: 每张图 × 每个方向 = 一个独立用例.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { LayeredLayoutProvider } from '../src/index.js'
import { buildLGraphFromParsed } from '../shared/elkgraph-builder.ts'
import { parseElkt } from './elkt2test.mjs'

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DIRS = ['RIGHT', 'LEFT', 'DOWN', 'UP']
export const EPS = 2

export function oraclePath() { return join(ROOT, 'test-resources/edge-dirs-oracle.json') }
export function registryPath() { return join(ROOT, 'test-resources/edge-e2e-registry.json') }

export function loadOracle() {
  return JSON.parse(readFileSync(oraclePath(), 'utf8'))
}
export function loadRegistry() {
  return JSON.parse(readFileSync(registryPath(), 'utf8'))
}
export function oracleHash() {
  return createHash('sha256').update(readFileSync(oraclePath(), 'utf8')).digest('hex').slice(0, 16)
}

/** 用例分类: flat (平坦正交) / selfloop (平坦自环正交) / hier (层级正交) / null (不在 E2E 范围). */
export function classify(rel, parsed) {
  const isHier = parsed.hierarchy.size > 0
  const hasSelfLoop = parsed.edges.some(([s, , t]) => s === t)
  const er = String(parsed.graphProps.edgeRouting ?? 'ORTHOGONAL').toUpperCase()
  const isInteractive = rel.includes('interactive')
  if ((er !== 'ORTHOGONAL' && er !== 'UNDEFINED') || isInteractive) return null
  if (isHier) return 'hier'
  return hasSelfLoop ? 'selfloop' : 'flat'
}

/** 跑 ggn 布局, 提取每条边 (源/目标节点索引 + 弯点). */
export function layoutAndExtract(rel, dir) {
  const source = readFileSync(join(ROOT, 'test-resources/elk-models', rel), 'utf8')
  const parsed = parseElkt(source)
  // 方向在 build 前注入: 匿名端口的默认侧取最终方向 (ELK 导入期即用最终方向定侧),
  // 否则 build 用模型默认 (RIGHT) 建 EAST/WEST 匿名端口, 再覆盖 DOWN/UP → 误判 N-S (south_port 实证).
  parsed.graphProps.direction = dir
  const { graph, nodeOf } = buildLGraphFromParsed(parsed, rel)
  graph.setProperty('org.eclipse.elk.direction', dir)
  new LayeredLayoutProvider().layout(graph)
  const out = []
  const seen = new Set()
  const nodeToIdx = new Map()
  for (const [i, n] of nodeOf) nodeToIdx.set(n, Number(i))
  for (const [, n] of nodeOf) for (const p of n.getPorts()) for (const e of p.getOutgoingEdges()) {
    if (seen.has(e.id)) continue
    seen.add(e.id)
    const src = e.getSource()?.getNode(), tgt = e.getTarget()?.getNode()
    if (!src || !tgt) continue
    const si = nodeToIdx.get(src), ti = nodeToIdx.get(tgt)
    if (si === undefined || ti === undefined) continue
    out.push({ s: si, t: ti, pts: e.getBendPoints().map(b => [b.x, b.y]) })
  }
  return out
}

/**
 * 边弯点对比 (ε=EPS): 逐条 ggn 边按 (s,t,弯点数) 在 oracle 中找最近未用边.
 * @returns {{ nEdges, matched, fails: {edge, ggn, jar}[], nodeDiffs: number[] }}
 */
export function compare(rel, dir, oracle = null) {
  oracle ??= loadOracle()
  const expected = oracle[rel + '::' + dir]?.edges ?? []
  const actual = layoutAndExtract(rel, dir)
  const used = new Set()
  const fails = []
  let matched = 0
  for (const a of actual) {
    const cands = expected.map((e, i) => ({ e, i })).filter(({ e, i }) => !used.has(i) && e.s === a.s && e.t === a.t && e.pts.length === a.pts.length)
    let best = null, bestDist = Infinity
    for (const { e, i } of cands) {
      const dist = e.pts.reduce((acc, p, k) => acc + Math.abs(p[0] - a.pts[k][0]) + Math.abs(p[1] - a.pts[k][1]), 0)
      if (dist < bestDist) { bestDist = dist; best = i }
    }
    if (best === null || bestDist > EPS * a.pts.length * 2) {
      fails.push({
        edge: `${a.s}->${a.t}`,
        ggn: a.pts.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]),
        jar: best === null ? '无匹配' : expected[best].pts.map(p => [+p[0].toFixed(1), +p[1].toFixed(1)]),
      })
    } else { used.add(best); matched++ }
  }
  // 缺边检测 (ggn 布局后边数少于 jar): 之前只遍历 ggn 边, 缺边不报 → 假绿
  // (297/298 等 insideSelfLoops 模型 yo 边丢失时 ggn 无边, fails 恒空判通过).
  const missingCount = expected.length - used.size
  if (missingCount > 0) {
    fails.push({ edge: `缺 ${missingCount} 条 jar 边`, ggn: '无', jar: '存在' })
  }
  // 节点位置差分 (边路由前置: 节点不对 → 边弯点必然偏, 属节点放置问题而非边路由).
  const nodeDiffs = checkNodePositions(rel, dir, oracle)
  return { nEdges: actual.length, matched, fails, nodeDiffs }
}

/** 对比节点世界坐标 (oracle.nodes, 按 elkt 索引), 返回差 > EPS 的节点索引. */
export function checkNodePositions(rel, dir, oracle = null) {
  oracle ??= loadOracle()
  const expNodes = oracle[rel + '::' + dir]?.nodes ?? {}
  const source = readFileSync(join(ROOT, 'test-resources/elk-models', rel), 'utf8')
  const parsed = parseElkt(source)
  parsed.graphProps.direction = dir
  const { graph, nodeOf } = buildLGraphFromParsed(parsed, rel)
  graph.setProperty('org.eclipse.elk.direction', dir)
  new LayeredLayoutProvider().layout(graph)
  const world = (n) => { let x = n.position.x, y = n.position.y, g = n.getGraph(); while (g && g.getParentNode()) { const p = g.getParentNode(); x += p.position.x; y += p.position.y; g = p.getGraph() } return { x, y } }
  const diffs = []
  for (const [i, n] of nodeOf) {
    const o = expNodes[Number(i)]
    if (!o) continue
    const w = world(n)
    if (Math.abs(w.x - o[0]) > EPS || Math.abs(w.y - o[1]) > EPS) diffs.push(Number(i))
  }
  return diffs
}

/**
 * 对比 (带崩溃保护): 布局/对比抛错时记为失败 (reason=崩溃), 避免单个用例中断全量扫描.
 */
export function compareSafe(rel, dir, oracle = null) {
  try {
    return compare(rel, dir, oracle)
  } catch (e) {
    return { nEdges: -1, matched: 0, fails: [], crashed: String(e?.message ?? e).slice(0, 140) }
  }
}

/** 收集范围内的用例 (rel × dir), 按 key 排序. */
export function collectCases(oracle = loadOracle()) {
  const cases = []
  for (const key of Object.keys(oracle)) {
    const [rel, dir] = key.split('::')
    if (!DIRS.includes(dir)) continue
    const source = readFileSync(join(ROOT, 'test-resources/elk-models', rel), 'utf8')
    const parsed = parseElkt(source)
    const cat = classify(rel, parsed)
    if (!cat) continue
    cases.push({ rel, dir, cat, key })
  }
  cases.sort((a, b) => a.key.localeCompare(b.key))
  return cases
}

export function summarize(r) {
  if (r.nEdges !== r.matched) {
    const noMatch = r.fails.filter(f => f.jar === '无匹配')
    if (noMatch.length) return `ggn 有 ${noMatch.length} 条边 jar 无同形匹配 (弯点数量/路径不同)`
    return `边弯点数量不一致 (ggn ${r.nEdges} vs jar ${r.nEdges})`
  }
  return `边弯点坐标偏移 (ε=${EPS} 内不一致, ${r.fails.length} 条边)`
}
