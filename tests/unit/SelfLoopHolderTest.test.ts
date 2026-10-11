/**
 * 移植自 ELK Java: intermediate/loops/SelfLoopHolderTest.java
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType } from '../../src/index.js'
import { SelfLoopHolder } from '../../src/intermediate/loops/self-loop-holder.js'
import { SELF_LOOP_HOLDER } from '../../src/options/internal-properties.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'

function basicGraphWithoutSelfLoops(): { graph: LGraph; nodes: LNode[] } {
  const tg = new TestGraphCreator()
  const n1 = tg.addNodeToLayer(tg.makeLayer())
  const n2 = tg.addNodeToLayer(tg.makeLayer())
  tg.eastWestEdgeFromTo(n1, n2)
  return { graph: tg.getGraph(), nodes: [n1, n2] }
}

function ports(lNode: LNode, north: number, east: number, south: number, west: number): void {
  const add = (side: PortSide, n: number) => {
    for (let i = 0; i < n; i++) { const p = new LPort(); p.setNode(lNode); p.setSide(side) }
  }
  add(PortSide.NORTH, north); add(PortSide.EAST, east); add(PortSide.SOUTH, south); add(PortSide.WEST, west)
}

function edge(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge(); e.setSource(src); e.setTarget(tgt); return e
}

function basicGraphWithSelfLoops(): { graph: LGraph; selfLoopNode: LNode } {
  const { graph, nodes } = basicGraphWithoutSelfLoops()
  const lNode = nodes[1]!
  ports(lNode, 2, 2, 2, 1)
  const ps = lNode.getPorts()
  for (let i = 1; i < ps.length; i += 2) edge(ps[i - 1]!, ps[i]!)
  return { graph, selfLoopNode: lNode }
}

describe('SelfLoopHolder (ELK Java 移植)', () => {
  it('testNonSelfLoopGraph', () => {
    const { graph, nodes } = basicGraphWithoutSelfLoops()
    for (const n of nodes) {
      expect(SelfLoopHolder.needsSelfLoopProcessing(n)).toBe(false)
      expect(() => SelfLoopHolder.install(n)).toThrow()
    }
  })

  it('testBasicSelfLoops', () => {
    const { selfLoopNode } = basicGraphWithSelfLoops()
    expect(SelfLoopHolder.needsSelfLoopProcessing(selfLoopNode)).toBe(true)
    const slHolder = SelfLoopHolder.install(selfLoopNode)
    expect(slHolder).not.toBeNull()
    expect(slHolder).toBe(selfLoopNode.getProperty(SELF_LOOP_HOLDER))
    expect(slHolder.getSLPortMap().size).toBe(selfLoopNode.getPorts().length)
    expect(slHolder.getSLHyperLoops().length).toBe(Math.floor(selfLoopNode.getPorts().length / 2))
  })

  it('testDifferentSelfHyperLoops', () => {
    const { graph, nodes } = basicGraphWithoutSelfLoops()
    const lNode = nodes[1]!
    ports(lNode, 2, 2, 2, 1)
    const firstLoops = new Set<LEdge>()
    const ps = lNode.getPorts()
    for (let i = 1; i < ps.length / 2; i++) firstLoops.add(edge(ps[i - 1]!, ps[i]!))
    const secondLoops = new Set<LEdge>()
    for (let i = ps.length / 2 + 1; i < ps.length; i++) secondLoops.add(edge(ps[i - 1]!, ps[i]!))
    const slHolder = SelfLoopHolder.install(lNode)
    expect(slHolder.getSLHyperLoops().length).toBe(2)
    const firstHLEdges = new Set([...slHolder.getSLHyperLoops()[0]!.getSLEdges()].map(sl => sl.getLEdge()))
    const secondHLEdges = new Set([...slHolder.getSLHyperLoops()[1]!.getSLEdges()].map(sl => sl.getLEdge()))
    const match = (setEq(firstHLEdges, firstLoops) && setEq(secondHLEdges, secondLoops))
      || (setEq(firstHLEdges, secondLoops) && setEq(secondHLEdges, firstLoops))
    expect(match).toBe(true)
  })
})

function setEq(a: Set<LEdge>, b: Set<LEdge>): boolean {
  if (a.size !== b.size) return false
  for (const x of a) if (!b.has(x)) return false
  return true
}

describe('SelfLoopHolder 补充 (ELK Java 移植)', () => {
  it('非 NORMAL 节点: needsSelfLoopProcessing 返回 false (即使含自环边)', () => {
    const { graph, nodes } = basicGraphWithoutSelfLoops()
    const lNode = nodes[1]!
    lNode.setType(NodeType.LONG_EDGE)
    ports(lNode, 2, 0, 0, 0)
    const [p0, p1] = lNode.getPorts()
    edge(p0, p1)
    expect(SelfLoopHolder.needsSelfLoopProcessing(lNode)).toBe(false)
  })

  it('install 抛出精确 AssertionError 消息', () => {
    const { nodes } = basicGraphWithoutSelfLoops()
    expect(() => SelfLoopHolder.install(nodes[0]!)).toThrow('AssertionError: needsSelfLoopProcessing')
  })

  it('混合 regular + 自环边: holder 只含自环边 (isSelfLoop 过滤)', () => {
    const { graph, nodes } = basicGraphWithoutSelfLoops()
    const lNode = nodes[1]!
    ports(lNode, 3, 0, 0, 0)
    const [p0, p1, p2] = lNode.getPorts()
    edge(p0, p1) // 自环
    const n3 = new LNode(graph)
    ports(n3, 0, 0, 0, 1)
    edge(p2, n3.getPorts()[0]!) // regular 跨节点边
    const slHolder = SelfLoopHolder.install(lNode)
    const loopEdges = [...slHolder.getSLHyperLoops().flatMap(l => [...l.getSLEdges()])].map(sl => sl.getLEdge())
    expect(loopEdges).toHaveLength(1)
    expect(loopEdges[0]!.getSource()).toBe(p0)
    expect(loopEdges[0]!.getTarget()).toBe(p1)
    // regular 边的端口不进入 holder 端口表
    expect(slHolder.getSLPortMap().has(p2)).toBe(false)
  })
})
