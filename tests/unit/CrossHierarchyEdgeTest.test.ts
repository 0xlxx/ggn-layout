/**
 * CrossHierarchyEdge / CrossHierarchyEdgeComparator 直接单测
 * (对应 ELK compound.CrossHierarchyEdge / CrossHierarchyEdgeComparator).
 *
 * 不变量:
 *  - getActualSource/getActualTarget: 段边端点所在节点是 EXTERNAL_PORT dummy 时返回 ORIGIN
 *    指向的真实端口, 否则返回端点本身 (null 透传).
 *  - 段排序: OUTPUT 在前 (深者先), INPUT 在后 (浅者先); 同为 OUTPUT 深者先, 同为 INPUT 浅者先;
 *    层级链断开 (top 非祖先) 时按当前可达深度比较.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortType, PortSide, NodeType } from '../../src/index.js'
import { CrossHierarchyEdge } from '../../src/compound/cross-hierarchy-edge.js'
import { compareCrossHierarchyEdges } from '../../src/compound/cross-hierarchy-edge-comparator.js'
import { ORIGIN } from '../../src/options/internal-properties.js'

function makeEdge(source: LPort | null, target: LPort | null): LEdge {
  const e = new LEdge()
  e.setSource(source)
  e.setTarget(target)
  return e
}

function normalPort(node: LNode, side = PortSide.EAST): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  p.size = { x: 8, y: 8 }
  return p
}

describe('CrossHierarchyEdge', () => {
  it('getType 返回构造时传入的段类型', () => {
    const g = new LGraph()
    const e = makeEdge(null, null)
    expect(new CrossHierarchyEdge(e, g, PortType.OUTPUT).getType()).toBe(PortType.OUTPUT)
    expect(new CrossHierarchyEdge(e, g, PortType.INPUT).getType()).toBe(PortType.INPUT)
  })

  it('getNewEdge / getGraph 返回构造时传入对象', () => {
    const g = new LGraph()
    const e = makeEdge(null, null)
    const ch = new CrossHierarchyEdge(e, g, PortType.OUTPUT)
    expect(ch.getNewEdge()).toBe(e)
    expect(ch.getGraph()).toBe(g)
  })

  it('getActualSource: 源端点节点为 EXTERNAL_PORT dummy 时返回 ORIGIN 真实端口', () => {
    const g = new LGraph()
    const realNode = new LNode(g)
    const realPort = normalPort(realNode)
    const dummyNode = new LNode(g)
    dummyNode.setType(NodeType.EXTERNAL_PORT)
    const dummyPort = normalPort(dummyNode)
    dummyNode.setProperty(ORIGIN, realPort)
    const tgtNode = new LNode(g)
    const tgtPort = normalPort(tgtNode)
    const ch = new CrossHierarchyEdge(makeEdge(dummyPort, tgtPort), g, PortType.OUTPUT)
    expect(ch.getActualSource()).toBe(realPort)
    // 非 EXTERNAL_PORT 端点: 原样返回
    expect(new CrossHierarchyEdge(makeEdge(realPort, tgtPort), g, PortType.OUTPUT).getActualSource()).toBe(realPort)
  })

  it('getActualSource: 源为 null 时返回 null', () => {
    const g = new LGraph()
    const ch = new CrossHierarchyEdge(makeEdge(null, null), g, PortType.OUTPUT)
    expect(ch.getActualSource()).toBeNull()
  })

  it('getActualTarget: 目标端点节点为 EXTERNAL_PORT dummy 时返回 ORIGIN 真实端口', () => {
    const g = new LGraph()
    const realNode = new LNode(g)
    const realPort = normalPort(realNode)
    const dummyNode = new LNode(g)
    dummyNode.setType(NodeType.EXTERNAL_PORT)
    const dummyPort = normalPort(dummyNode)
    dummyNode.setProperty(ORIGIN, realPort)
    const srcNode = new LNode(g)
    const srcPort = normalPort(srcNode)
    const ch = new CrossHierarchyEdge(makeEdge(srcPort, dummyPort), g, PortType.INPUT)
    expect(ch.getActualTarget()).toBe(realPort)
    // 非 EXTERNAL_PORT 端点: 原样返回
    expect(new CrossHierarchyEdge(makeEdge(srcPort, realPort), g, PortType.INPUT).getActualTarget()).toBe(realPort)
  })

  it('getActualTarget: 目标为 null 时返回 null', () => {
    const g = new LGraph()
    const ch = new CrossHierarchyEdge(makeEdge(null, null), g, PortType.INPUT)
    expect(ch.getActualTarget()).toBeNull()
  })
})

describe('compareCrossHierarchyEdges', () => {
  /** 构造挂在 graph 下的段 (type). */
  function edgeIn(graph: LGraph, type: PortType): CrossHierarchyEdge {
    return new CrossHierarchyEdge(makeEdge(null, null), graph, type)
  }

  it('OUTPUT 段排在 INPUT 段之前 (-1)', () => {
    const g = new LGraph()
    expect(compareCrossHierarchyEdges(edgeIn(g, PortType.OUTPUT), edgeIn(g, PortType.INPUT), g)).toBe(-1)
  })

  it('INPUT 段排在 OUTPUT 段之后 (1)', () => {
    const g = new LGraph()
    expect(compareCrossHierarchyEdges(edgeIn(g, PortType.INPUT), edgeIn(g, PortType.OUTPUT), g)).toBe(1)
  })

  it('同为 OUTPUT: 深者在前 (深度差)', () => {
    const top = new LGraph()
    const mid = new LGraph()
    const midNode = new LNode(top)
    mid.setParentNode(midNode)
    midNode.setNestedGraph(mid)
    const deep = new LGraph()
    const deepNode = new LNode(mid)
    deep.setParentNode(deepNode)
    deepNode.setNestedGraph(deep)
    // deep 深度 2, mid 深度 1: 深者在前 → b(浅) - a(深) > 0
    expect(compareCrossHierarchyEdges(edgeIn(deep, PortType.OUTPUT), edgeIn(mid, PortType.OUTPUT), top)).toBe(-1)
    expect(compareCrossHierarchyEdges(edgeIn(mid, PortType.OUTPUT), edgeIn(deep, PortType.OUTPUT), top)).toBe(1)
  })

  it('同为 INPUT: 浅者在前 (深度差)', () => {
    const top = new LGraph()
    const mid = new LGraph()
    const midNode = new LNode(top)
    mid.setParentNode(midNode)
    midNode.setNestedGraph(mid)
    const deep = new LGraph()
    const deepNode = new LNode(mid)
    deep.setParentNode(deepNode)
    deepNode.setNestedGraph(deep)
    // 浅者在前 → a(浅) - b(深) < 0
    expect(compareCrossHierarchyEdges(edgeIn(mid, PortType.INPUT), edgeIn(deep, PortType.INPUT), top)).toBe(-1)
    expect(compareCrossHierarchyEdges(edgeIn(deep, PortType.INPUT), edgeIn(mid, PortType.INPUT), top)).toBe(1)
  })

  it('层级链断开 (top 非祖先): 按可达深度比较 (不崩溃)', () => {
    const top = new LGraph()
    const g1 = new LGraph() // 无 parentNode 的独立图
    expect(compareCrossHierarchyEdges(edgeIn(g1, PortType.INPUT), edgeIn(g1, PortType.INPUT), top)).toBe(0)
    // parentNode 存在但其 graph 为 null (断链)
    const g2 = new LGraph()
    const orphan = new LNode(null)
    g2.setParentNode(orphan)
    expect(compareCrossHierarchyEdges(edgeIn(g2, PortType.OUTPUT), edgeIn(g2, PortType.OUTPUT), top)).toBe(0)
  })

  it('同深度 OUTPUT 段顺序稳定 (0)', () => {
    const g = new LGraph()
    expect(compareCrossHierarchyEdges(edgeIn(g, PortType.OUTPUT), edgeIn(g, PortType.OUTPUT), g)).toBe(0)
  })
})
