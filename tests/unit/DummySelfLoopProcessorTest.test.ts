/**
 * DummySelfLoopProcessor (ELK intermediate.DummySelfLoopProcessor) 语义单元测试.
 * SSOT: ELK Java 0.12.0 DummySelfLoopProcessor.java.
 */
import { describe, expect, it } from 'vitest'
import { PortSide, NodeType, PortConstraints } from '../../src/index.js'
import { processDummySelfLoops } from '../../src/intermediate/dummy-self-loop-processor.js'
import { ORIGIN, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../../src/options/internal-properties.js'
import { JUNCTION_POINTS, PORT_CONSTRAINTS } from '../../src/options/layered-options.js'
import { makeGraph, makeLayer, makeNode, makePorts, makeEdge } from './helpers/SelfLoopGraphBuilder.js'
import { expectNoDanglingEdges, expectEdgePortConservation, expectFiniteCoordinates, expectBendPointContinuity } from './helpers/conservation.js'

describe('DummySelfLoopProcessor (ELK Java 移植)', () => {
  it('反转场景: N/S→W, S→N, E→非E 均反转; N→S 不动', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [n1, n2, s1, s2, e1, e2, w1, w2] = makePorts(node, 2, 2, 2, 2)
    // 端口顺序: n1,n2,e1,e2,s1,s2,w1,w2
    const nw = makeEdge(n1, w1)      // N→W 反转 → W→N
    const sn = makeEdge(s1, n2)      // S→N 反转 → N→S
    const en = makeEdge(e1, n2)      // E→N 反转 → N→E
    const ns = makeEdge(n1, s2)      // N→S 不动
    processDummySelfLoops(graph)

    expect(nw.getSource()).toBe(w1); expect(nw.getTarget()).toBe(n1)
    expect(sn.getSource()).toBe(n2); expect(sn.getTarget()).toBe(s1)
    expect(en.getSource()).toBe(n2); expect(en.getTarget()).toBe(e1)
    expect(ns.getSource()).toBe(n1); expect(ns.getTarget()).toBe(s2)
  })

  it('E→W 与 W→E 插入 long-edge dummy', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [e1, e2, w1, w2] = makePorts(node, 0, 2, 0, 2)
    const ew = makeEdge(e1, w1) // E→W
    const we = makeEdge(w2, e2) // W→E
    processDummySelfLoops(graph)

    const dummies = layer.getNodes().filter(n => n.getType() === NodeType.LONG_EDGE)
    expect(dummies).toHaveLength(2)

    // E→W 边: 先反转 (W→E), 再插入 dummy (源=WEST 端口, 目标=EAST 端口)
    expect(ew.getSource()).toBe(w1)
    expect(ew.getTarget()!.getNode()!.getType()).toBe(NodeType.LONG_EDGE)
    const d1 = ew.getTarget()!.getNode()!
    expect(d1.getProperty(ORIGIN)).toBe(ew)
    expect(d1.getProperty(LONG_EDGE_SOURCE)).toBe(w1)
    expect(d1.getProperty(LONG_EDGE_TARGET)).toBe(e1)
    expect(d1.getProperty(PORT_CONSTRAINTS)).toBe(PortConstraints.FIXED_POS)
    const d1In = d1.getPorts(PortSide.WEST)[0]!
    const d1Out = d1.getPorts(PortSide.EAST)[0]!
    expect(ew.getTarget()).toBe(d1In)
    const d1Edge = d1Out.getOutgoingEdges()[0]!
    expect(d1Edge.getSource()).toBe(d1Out)
    expect(d1Edge.getTarget()).toBe(e1)
    expect(d1Edge.getProperty(JUNCTION_POINTS)).toBeNull()

    // 全图守恒: 无悬挂边/边-端口守恒/坐标有限/弯点连续
    expectNoDanglingEdges(graph)
    expectEdgePortConservation(graph)
    expectFiniteCoordinates(graph)
    for (const e of [ew, we]) expectBendPointContinuity(e)

    // W→E 边: 不反转, 直接插入 dummy
    expect(we.getSource()).toBe(w2)
    const d2 = we.getTarget()!.getNode()!
    expect(d2.getProperty(ORIGIN)).toBe(we)
    expect(d2.getProperty(LONG_EDGE_SOURCE)).toBe(w2)
    expect(d2.getProperty(LONG_EDGE_TARGET)).toBe(e2)
    const d2Out = d2.getPorts(PortSide.EAST)[0]!
    expect(d2Out.getOutgoingEdges()[0]!.getTarget()).toBe(e2)

    // dummy 已加入层
    for (const d of dummies) expect(d.getLayer()).toBe(layer)
  })

  it('跨节点边 continue 跳过; E→E 不反转不建 dummy', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const nodeA = makeNode(graph, layer)
    const nodeB = makeNode(graph, layer)
    const [ea1, ea2] = makePorts(nodeA, 0, 2, 0, 0)
    const [wb1, wb2] = makePorts(nodeB, 0, 0, 0, 2)
    // 跨节点: A.EAST → B.WEST
    makeEdge(ea1, wb1)
    // 同节点 E→E
    makeEdge(ea2, ea2 === ea2 ? ea2 : ea2) // 自环 E→E (源=目标同一端口)
    // 同节点 W→W
    makeEdge(wb2, wb2)
    processDummySelfLoops(graph)
    // 无 LONG_EDGE dummy 生成
    expect(layer.getNodes().filter(n => n.getType() === NodeType.LONG_EDGE)).toHaveLength(0)
    // 跨节点边保持原样
    expect(ea1.getOutgoingEdges()[0]!.getTarget()).toBe(wb1)
  })
})

describe('DummySelfLoopProcessor 补充 (ELK Java 移植)', () => {
  it('S→W 反转; N→N / S→S 不反转不建 dummy; W→W 不处理', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [n1, n2] = makePorts(node, 2, 0, 0, 0)
    const [s1, s2, s3, s4] = makePorts(node, 0, 0, 4, 0)
    const [w1, w2] = makePorts(node, 0, 0, 0, 2)
    const sw = makeEdge(s1, w1) // S→W → 反转 W→S
    const nn = makeEdge(n1, n2) // N→N 不动
    const ss = makeEdge(s3, s4) // S→S 不动
    const ww = makeEdge(w2, w1) // W→W 不动
    processDummySelfLoops(graph)
    expect(sw.getSource()).toBe(w1); expect(sw.getTarget()).toBe(s1)
    expect(nn.getSource()).toBe(n1); expect(nn.getTarget()).toBe(n2)
    expect(ss.getSource()).toBe(s3); expect(ss.getTarget()).toBe(s4)
    expect(ww.getSource()).toBe(w2); expect(ww.getTarget()).toBe(w1)
    // 无 LONG_EDGE dummy
    expect(layer.getNodes().filter(n => n.getType() === NodeType.LONG_EDGE)).toHaveLength(0)
  })

  it('E→W 反转后建 dummy; W→E 直接建 dummy; 两环均无悬挂', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [e1, e2] = makePorts(node, 0, 2, 0, 0)
    const [w1, w2] = makePorts(node, 0, 0, 0, 2)
    const ew = makeEdge(e1, w1) // E→W
    const we = makeEdge(w2, e2) // W→E
    processDummySelfLoops(graph)
    const dummies = layer.getNodes().filter(n => n.getType() === NodeType.LONG_EDGE)
    expect(dummies).toHaveLength(2)
    // ew 反转后 W→E, dummy 源=W 端口
    expect(ew.getSource()).toBe(w1)
    expect(ew.getTarget()!.getNode()!.getType()).toBe(NodeType.LONG_EDGE)
    // we 不反转, dummy 源=W 端口
    expect(we.getSource()).toBe(w2)
    expect(we.getTarget()!.getNode()!.getType()).toBe(NodeType.LONG_EDGE)
    // 守恒
    expectNoDanglingEdges(graph)
    expectEdgePortConservation(graph)
  })
})
