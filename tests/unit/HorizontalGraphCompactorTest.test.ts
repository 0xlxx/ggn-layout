/**
 * HorizontalGraphCompactor 单元测试 (ELK intermediate.compaction.HorizontalGraphCompactor 移植).
 * 覆盖: SPLINES 压缩把松弛布局压紧 (节点更紧凑/无重叠/顺序保持), POLYLINE 不压缩 (ELK 条件),
 * NONE 策略不压缩, 压缩后节点间距 = spacing.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, NodeType, PortSide } from '../../src/index.js'
import { HorizontalGraphCompactor } from '../../src/compaction/oned/horizontal-graph-compactor.js'
import { Spacings } from '../../src/p4nodes/spacings.js'
import { SPACINGS } from '../../src/options/internal-properties.js'
import {
  EDGE_ROUTING,
  COMPACTION_POST_COMPACTION_STRATEGY,
  COMPACTION_POST_COMPACTION_CONSTRAINTS,
  SPACING_NODE_NODE,
  SPACING_EDGE_EDGE,
} from '../../src/options/layered-options.js'

/** 构造 3 层链式图: L0=[a] → L1=[b] → L2=[c], 人为设置松弛 x (200 间距). */
function makeChain(edgeRouting = 'SPLINES', strategy = 'LEFT', gap = 200): { graph: LGraph; a: LNode; b: LNode; c: LNode } {
  const graph = new LGraph()
  graph.setProperty(EDGE_ROUTING, edgeRouting)
  graph.setProperty(COMPACTION_POST_COMPACTION_STRATEGY, strategy)
  graph.setProperty(COMPACTION_POST_COMPACTION_CONSTRAINTS, 'SCANLINE')
  graph.setProperty(SPACING_NODE_NODE, 20)
  graph.setProperty(SPACING_EDGE_EDGE, 10)
  graph.setProperty(SPACINGS, new Spacings(graph))

  const mk = (name: string): LNode => {
    const n = new LNode(graph); n.size = { x: 50, y: 20 }; n.setType(NodeType.NORMAL)
    const p = new LPort(); p.setNode(n); p.setSide(PortSide.EAST)
    const q = new LPort(); q.setNode(n); q.setSide(PortSide.WEST)
    return n
  }
  const a = mk('a'), b = mk('b'), c = mk('c')
  const l0 = new Layer(graph), l1 = new Layer(graph), l2 = new Layer(graph)
  graph.getLayers().push(l0, l1, l2)
  a.setLayer(l0); b.setLayer(l1); c.setLayer(l2)
  a.position.x = 0; b.position.x = gap; c.position.x = 2 * gap
  // 边 a→b→c (压缩约束链).
  const e1 = new LEdge(); e1.setSource(a.getPorts()[0]!); e1.setTarget(b.getPorts()[1]!)
  const e2 = new LEdge(); e2.setSource(b.getPorts()[0]!); e2.setTarget(c.getPorts()[1]!)
  return { graph, a, b, c }
}

function runCompaction(graph: LGraph): void {
  new HorizontalGraphCompactor().process(graph)
}

describe('HorizontalGraphCompactor (ELK Java 移植)', () => {
  it('SPLINES + LEFT: 松弛布局被压紧且不重叠', () => {
    const { graph, a, b, c } = makeChain()
    const beforeC = c.position.x
    runCompaction(graph)
    expect(a.position.x).toBe(0)
    // 压紧后 b/c 左移.
    expect(b.position.x).toBeLessThan(200)
    expect(c.position.x).toBeLessThan(beforeC)
    // 无重叠: a.width=50, 间距 20.
    expect(b.position.x - (a.position.x + 50)).toBeGreaterThanOrEqual(19)
    expect(c.position.x - (b.position.x + 50)).toBeGreaterThanOrEqual(19)
    // 顺序保持.
    expect(a.position.x).toBeLessThan(b.position.x)
    expect(b.position.x).toBeLessThan(c.position.x)
  })

  it('SPLINES + LEFT: 压缩后层间距 = SPACING_NODE_NODE (20)', () => {
    const { graph, a, b, c } = makeChain()
    runCompaction(graph)
    // 同层链压紧到最小间距 20 (margin 0).
    expect(b.position.x - (a.position.x + 50)).toBeCloseTo(20, 6)
    expect(c.position.x - (b.position.x + 50)).toBeCloseTo(20, 6)
  })

  // 注: POLYLINE 不压缩是 GraphConfigurator 装配条件 (edgeRouting != POLYLINE 才装配 compactor),
  // 不在 process 内部; 装配条件由 layered-layout-provider 管线测试覆盖 (见 compaction BDD).
  it('NONE 策略: 不压缩', () => {
    const { graph, c } = makeChain('SPLINES', 'NONE')
    const before = c.position.x
    runCompaction(graph)
    expect(c.position.x).toBe(before)
  })

  it('RIGHT 策略: 节点向右对齐 (最左节点右移)', () => {
    const { graph, a, c } = makeChain('SPLINES', 'RIGHT')
    const beforeA = a.position.x
    runCompaction(graph)
    expect(c.position.x).toBe(400)
    expect(a.position.x).toBeGreaterThan(beforeA)
  })
})
