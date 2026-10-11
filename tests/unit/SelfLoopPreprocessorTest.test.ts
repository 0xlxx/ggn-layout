/**
 * 移植自 ELK Java: test/.../intermediate/SelfLoopPreprocessorTest.java
 * 验证 ggn SelfLoopPreprocessor 的自环端口隐藏行为与 ELK Java 一致.
 * (ELK Java 断言: FREE/FIXED_SIDE 隐藏自环端口, FIXED_ORDER/RATIO/POS 不隐藏)
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints } from '../../src/index.js'
import { processSelfLoops } from '../../src/intermediate/self-loop-preprocessor.js'
import { PORT_CONSTRAINTS } from '../../src/options/layered-options.js'
import { GRAPH_PROPERTIES, GraphProperties, SELF_LOOP_HOLDER } from '../../src/options/internal-properties.js'

/** 对应 ELK SelfLoopTestGraphCreator.ports: 先 N 个 NORTH, 再 EAST, 再 SOUTH, 再 WEST. */
function ports(lNode: LNode, north: number, east: number, south: number, west: number): LPort[] {
  const out: LPort[] = []
  const add = (side: PortSide, n: number) => {
    for (let i = 0; i < n; i++) {
      const p = new LPort()
      p.setNode(lNode)
      p.setSide(side)
      out.push(p)
    }
  }
  add(PortSide.NORTH, north)
  add(PortSide.EAST, east)
  add(PortSide.SOUTH, south)
  add(PortSide.WEST, west)
  return out
}

function edge(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

/** 对应 SelfLoopTestGraphCreator.basicGraphWithoutSelfLoops: n1(0N1E) -> n2(0N0E0S1W). */
function basicGraph(): { graph: LGraph; selfLoopNode: LNode } {
  const graph = new LGraph()
  const n1 = new LNode(graph)
  ports(n1, 0, 1, 0, 0)
  const n2 = new LNode(graph)
  ports(n2, 0, 0, 0, 1)
  edge(n1.getPorts()[0]!, n2.getPorts()[0]!)
  return { graph, selfLoopNode: n2 }
}

/** 对应 SelfLoopPreprocessorTest.TestGraph: selfLoopNode 加 2N2E2S1W 端口 + 坐标 + 自环边. */
function buildTestGraph(pc: PortConstraints): { graph: LGraph; node: LNode; regular: LPort[]; selfLoop: LPort[]; unconnected: LPort[] } {
  const { graph, selfLoopNode } = basicGraph()
  const node = selfLoopNode
  node.setProperty(PORT_CONSTRAINTS, pc)
  node.size = { x: 50, y: 50 }
  ports(node, 2, 2, 2, 1)
  // 注意: basicGraph 里 n2 已有 1 个 WEST 端口 (连 n1), 共 8 个端口 (与 ELK 一致).
  const all = node.getPorts()
  // 端口坐标 (对应 ELK: 每侧第一个 10, 第二个 40)
  let north = 10, east = 10, south = 10, west = 10
  for (const p of all) {
    switch (p.getSide()) {
      case PortSide.NORTH: p.getPosition().x = north; p.getPosition().y = 0; north += 30; break
      case PortSide.EAST: p.getPosition().x = 50; p.getPosition().y = east; east += 30; break
      case PortSide.SOUTH: p.getPosition().x = south; p.getPosition().y = 50; south += 30; break
      case PortSide.WEST: p.getPosition().x = 0; p.getPosition().y = west; west += 30; break
      default: break
    }
  }
  edge(all[0]!, all[1]!)
  edge(all[1]!, all[2]!)
  edge(all[3]!, all[4]!)
  edge(all[4]!, all[5]!)
  const regular = [all[0]!]
  const selfLoop = [all[1]!, all[2]!, all[3]!, all[4]!, all[5]!]
  const unconnected = [all[6]!, all[7]!]
  return { graph, node, regular, selfLoop, unconnected }
}

function process(pc: PortConstraints) {
  const g = buildTestGraph(pc)
  processSelfLoops(g.graph)
  return g
}

describe('SelfLoopPreprocessor (ELK Java 移植)', () => {
  it('FREE: 隐藏自环端口, 保留 regular + unconnected', () => {
    const { node, regular, unconnected } = process(PortConstraints.FREE)
    expect(node.getPorts().length).toBe(regular.length + unconnected.length)
    for (const p of [...regular, ...unconnected]) expect(node.getPorts()).toContain(p)
  })
  it('FIXED_SIDE: 隐藏自环端口', () => {
    const { node, regular, unconnected } = process(PortConstraints.FIXED_SIDE)
    expect(node.getPorts().length).toBe(regular.length + unconnected.length)
    for (const p of [...regular, ...unconnected]) expect(node.getPorts()).toContain(p)
  })
  it('FIXED_ORDER: 不隐藏', () => {
    const { node, regular, selfLoop, unconnected } = process(PortConstraints.FIXED_ORDER)
    expect(node.getPorts().length).toBe(regular.length + selfLoop.length + unconnected.length)
  })
  it('FIXED_RATIO: 不隐藏', () => {
    const { node, regular, selfLoop, unconnected } = process(PortConstraints.FIXED_RATIO)
    expect(node.getPorts().length).toBe(regular.length + selfLoop.length + unconnected.length)
  })
  it('FIXED_POS: 不隐藏', () => {
    const { node, regular, selfLoop, unconnected } = process(PortConstraints.FIXED_POS)
    expect(node.getPorts().length).toBe(regular.length + selfLoop.length + unconnected.length)
  })
})

describe('SelfLoopPreprocessor 补充 (ELK Java 移植)', () => {
  it('隐藏自环边: 处理后被隐藏边 source/target 置 null, 跨节点边不受影响', () => {
    const g = buildTestGraph(PortConstraints.FREE)
    const selfLoopEdges = g.node.getOutgoingEdges()
      .filter(e => e.getSource()!.getNode() === e.getTarget()!.getNode())
    expect(selfLoopEdges.length).toBeGreaterThan(0)
    processSelfLoops(g.graph)
    for (const e of selfLoopEdges) {
      expect(e.getSource()).toBeNull()
      expect(e.getTarget()).toBeNull()
    }
    // 跨节点边 (n1→n2) 保持连接
    const n1 = g.graph.getLayerlessNodes()[0]!
    const crossEdge = n1.getOutgoingEdges()[0]!
    expect(crossEdge.getSource()).not.toBeNull()
    expect(crossEdge.getTarget()).not.toBeNull()
  })

  it('hierarchyMode: 嵌套图含 EXTERNAL_PORTS → 自环端口不隐藏', () => {
    const g = buildTestGraph(PortConstraints.FREE)
    const nested = new LGraph()
    nested.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)
    g.node.setNestedGraph(nested)
    processSelfLoops(g.graph)
    expect(g.node.getPorts()).toHaveLength(g.regular.length + g.selfLoop.length + g.unconnected.length)
  })

  it('FREE: 隐藏端口标记 slPort.hidden + holder.arePortsHiddenFlag', () => {
    const g = process(PortConstraints.FREE)
    const holder = g.node.getProperty(SELF_LOOP_HOLDER) as import('../../src/intermediate/loops/self-loop-holder.js').SelfLoopHolder
    expect(holder.arePortsHiddenFlag()).toBe(true)
    for (const p of g.selfLoop) {
      expect(holder.getSLPortMap().get(p)!.isHidden()).toBe(true)
    }
    for (const p of [...g.regular, ...g.unconnected]) {
      const sl = holder.getSLPortMap().get(p)
      if (sl) expect(sl.isHidden()).toBe(false)
    }
  })
})
