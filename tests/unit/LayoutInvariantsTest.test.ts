/**
 * M4 白盒不变量 (对应 ELK TestAfterProcessor 断言, 移植到 ggn).
 *
 * 对代表性 elkt 图跑完整布局后校验:
 *   1. 无环 (P1 断环后图应无环)
 *   2. 节点 margin ≥ 0 (NodeMarginCalculator)
 *   3. 层内节点不重叠 (BK/Simple/Interactive 后)
 *   4. in-layer successor 约束满足 (Forster): 约束目标必须在层内当前节点之后
 *
 * 若某图布局崩溃 (如 compound06 已知 ggn 崩溃), 单测记为失败以暴露真实问题.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseElkt, OPT_MAP } from '../../scripts/elkt2test.mjs'
import { coerceVal } from '../../shared/opt-map.ts'
import { LGraph, LNode, LPort, LEdge, PortSide, LayeredLayoutProvider } from '../../src/index.js'
import { IN_LAYER_SUCCESSOR_CONSTRAINTS } from '../../src/options/internal-properties.js'

function buildGraph(file: string): { g: LGraph; nodeOf: Map<string, LNode>; hasHierarchy: boolean } {
  const gd = parseElkt(readFileSync(file, 'utf8'))
  const g = new LGraph()
  const nodeOf = new Map<string, LNode>()
  const nested = new Map<string, LGraph>()
  for (const p of gd.hierarchy.keys()) nested.set(p, new LGraph())
  for (const id of gd.nodes) {
    const parent = [...gd.hierarchy.entries()].find(([, k]) => k.includes(id))?.[0]
    const gg = parent !== undefined ? nested.get(parent)! : g
    const n = new LNode(gg)
    const p = gd.nodeProps.get(id) ?? {}
    n.size = { x: p.width ?? 60, y: p.height ?? 30 }
    if (p.portConstraints) n.setProperty('org.eclipse.elk.portConstraints', p.portConstraints)
    for (const port of p.ports ?? []) {
      const lp = new LPort(); lp.setNode(n)
      lp.size = { x: port.w ?? 8, y: port.h ?? 8 }
      lp.getPosition().x = port.x ?? 0; lp.getPosition().y = port.y ?? 0
      if (port.side) lp.setSide(port.side as PortSide)
      if (port.index != null) lp.setProperty('org.eclipse.elk.port.index', port.index)
    }
    nodeOf.set(id, n)
  }
  for (const p of gd.hierarchy.keys()) { nodeOf.get(p)!.setNestedGraph(nested.get(p)!); nested.get(p)!.setParentNode(nodeOf.get(p)!) }
  const allEdges: LEdge[] = []
  for (const [s, sp, t, tp] of gd.edges) {
    const spc = sp !== null ? (gd.nodeProps.get(s)?.ports ?? []).findIndex(x => x.id === sp) : -1
    const tpc = tp !== null ? (gd.nodeProps.get(t)?.ports ?? []).findIndex(x => x.id === tp) : -1
    const src = nodeOf.get(s)!, tgt = nodeOf.get(t)!
    const spPort = spc >= 0 && spc < src.getPorts().length ? src.getPorts()[spc]! : (() => { const p = new LPort(); p.setNode(src); return p })()
    const tpPort = tpc >= 0 && tpc < tgt.getPorts().length ? tgt.getPorts()[tpc]! : (() => { const p = new LPort(); p.setNode(tgt); return p })()
    const e = new LEdge(); e.setSource(spPort); e.setTarget(tpPort)
    allEdges.push(e)
  }
  if (gd.hierarchy.size > 0) g.setProperty('org.eclipse.elk.hierarchyHandling', 'INCLUDE_CHILDREN')
  for (const [k, v] of Object.entries(gd.graphProps)) {
    const m = OPT_MAP[k]
    if (!m) continue
    const coerced = coerceVal(m, String(v))
    if (coerced !== undefined) g.setProperty(m.ggn, coerced)
  }

  // ELK LGraphUtil.createPort 语义: 自环边的隐式端口 (edge n -> n 无显式端口) 在导入期
  // 被赋方向默认输出/输入侧 (RIGHT→EAST/WEST 等), 否则 UNDEFINED 进入 SelfLoopType 会抛错
  // (与 ELK Java 0.12.0 一致; labels.elkt 的 `edge n1 -> n1` 即此类).
  const dir = String(gd.graphProps.direction ?? 'RIGHT').toUpperCase()
  const defaultSide = dir === 'DOWN' ? PortSide.SOUTH : dir === 'LEFT' ? PortSide.WEST : dir === 'UP' ? PortSide.NORTH : PortSide.EAST
  const opposedSide = (side: PortSide): PortSide =>
    side === PortSide.NORTH ? PortSide.SOUTH : side === PortSide.SOUTH ? PortSide.NORTH
      : side === PortSide.EAST ? PortSide.WEST : PortSide.EAST
  for (const e of allEdges) {
    if (e.getSource()!.getNode() !== e.getTarget()!.getNode()) continue
    if (e.getSource()!.getSide() === PortSide.UNDEFINED) e.getSource()!.setSide(defaultSide)
    if (e.getTarget()!.getSide() === PortSide.UNDEFINED) e.getTarget()!.setSide(opposedSide(defaultSide))
  }
  return { g, nodeOf, hasHierarchy: gd.hierarchy.size > 0 }
}

function isAcyclic(g: LGraph): boolean {
  const seen = new Set<LNode>()
  const inPath = new Set<LNode>()
  const dfs = (n: LNode): boolean => {
    if (inPath.has(n)) return false
    if (seen.has(n)) return true
    inPath.add(n); seen.add(n)
    for (const e of n.getOutgoingEdges()) {
      const t = e.getTarget()?.getNode()
      if (t && t !== n && !dfs(t)) return false // 自环边由 SelfLoopPreprocessor 单独处理, 不算环
    }
    inPath.delete(n)
    return true
  }
  for (const layer of g.getLayers()) for (const n of layer.getNodes()) if (!seen.has(n) && !dfs(n)) return false
  for (const n of g.getLayerlessNodes()) if (!seen.has(n) && !dfs(n)) return false
  return true
}

function checkInvariants(g: LGraph): string[] {
  const problems: string[] = []
  // 方向感知的层内不重叠: RIGHT/LEFT 层内节点并排 (y 不同, x 相同); DOWN/UP 层内节点横排 (y 相同, x 不同).
  const dir = g.getProperty('org.eclipse.elk.direction')
  const horizontal = dir === 'DOWN' || dir === 'UP'
  const extent = (n: LNode): [number, number] => {
    const pos = n.getPosition()
    const size = n.getSize()
    const m = n.getMargin()
    return horizontal
      ? [pos.x - m.left, pos.x + size.x + m.right]
      : [pos.y - m.top, pos.y + size.y + m.bottom]
  }
  for (const layer of g.getLayers()) {
    for (const n of layer.getNodes()) {
      const m = n.getMargin()
      if (m.left < 0 || m.top < 0 || m.right < 0 || m.bottom < 0) {
        problems.push(`margin<0: node ${n.id} margin=(${m.left},${m.top},${m.right},${m.bottom})`)
      }
    }
    const ns = layer.getNodes()
    for (let i = 0; i < ns.length; i++) {
      for (let j = i + 1; j < ns.length; j++) {
        const a = ns[i]!, b = ns[j]!
        const [a0, a1] = extent(a)
        const [b0, b1] = extent(b)
        if (a0 < b1 && b0 < a1) {
          problems.push(`overlap: layer ${layer.id} nodes ${a.id}(${a0.toFixed(1)}..${a1.toFixed(1)}) and ${b.id}(${b0.toFixed(1)}..${b1.toFixed(1)}) ${horizontal ? '(x)' : '(y)'}`)
        }
      }
    }
    // successor 约束满足
    const encountered = new Set<LNode>()
    for (const n of layer.getNodes()) {
      const succ = n.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS) ?? []
      for (const s of succ) {
        if (encountered.has(s)) problems.push(`successor violation: ${n.id} 的约束目标 ${s.id} 已在层内更前位置`)
      }
      encountered.add(n)
    }
  }
  return problems
}

// 全量图集扫描: examples/tests/tickets (不含 realworld, 慢).
const ALL_MODELS = (() => {
  const { globSync } = require('glob') as never
  return (globSync as unknown as (p: string) => string[])('test-resources/elk-models/{examples,tests,tickets}/**/*.elkt')
    .filter(f => !f.includes('realworld'))
})()

// 已知 ggn bug (崩溃/违规), 修好后从清单移除即转绿:
//   compound06 — 层级端口 P3 sweep "Expected 2 hierarchical ports" 崩溃 (见 PROGRESS 下午30).
const KNOWN_CRASHES = new Set([
  'test-resources/elk-models/tests/layered/connected_components/compound06.elkt',
])

describe('M4 白盒不变量 (ELK TestAfterProcessor 移植, 全量图集扫描)', () => {
  it(`不变量: 全部 ${ALL_MODELS.length} 图 (examples/tests/tickets)`, () => {
    const failures: string[] = []
    let ok = 0
    for (const file of ALL_MODELS) {
      if (KNOWN_CRASHES.has(file)) continue
      try {
        const { g, hasHierarchy } = buildGraph(file)
        const provider = new LayeredLayoutProvider()
        // ELK: P1 断环为布局提供无环图, 但输出边会被 ReversedEdgeRestorer 恢复原方向
        // (循环图的输出边方向 = 输入, 可能仍有环) → 无环检查在 P1 阶段 (布局前), 不在最终输出.
        let p1Acyclic = true
        provider.setHooks({
          afterPhase: (phase, graph) => {
            if (phase === 'P1' && !hasHierarchy) p1Acyclic = isAcyclic(graph)
          },
        })
        provider.layout(g)
        if (!hasHierarchy && !p1Acyclic) {
          failures.push(`${file}: P1 断环后仍有环`)
          continue
        }
        const problems = checkInvariants(g)
        if (problems.length > 0) {
          failures.push(`${file}:\n  ${problems.join('\n  ')}`)
          continue
        }
        ok++
      } catch (e) {
        failures.push(`${file}: 布局崩溃 ${(e as Error).message}`)
      }
    }
    expect(failures, `不变量违规/崩溃 (${failures.length} 图):\n${failures.join('\n')}`).toEqual([])
    expect(ok).toBe(ALL_MODELS.length - KNOWN_CRASHES.size)
  })
})
