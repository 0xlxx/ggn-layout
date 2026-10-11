/**
 * SelfLoopPostprocessor (ELK intermediate.SelfLoopPostProcessor) 语义单元测试.
 * SSOT: ELK Java 0.12.0 SelfLoopPostProcessor.java (恢复边源/目标 + bendPoint 加节点偏移 + 标签位置应用).
 */
import { describe, expect, it } from 'vitest'
import { LNode, NodeType } from '../../src/index.js'
import { processSelfLoopPost } from '../../src/intermediate/self-loop-postprocessor.js'
import { SELF_LOOP_HOLDER } from '../../src/options/internal-properties.js'
import { makeGraph, makeLayer, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'
import { expectNoDanglingEdges, expectEdgePortConservation, expectFiniteCoordinates } from './helpers/conservation.js'

describe('SelfLoopPostprocessor (ELK Java 移植)', () => {
  it('恢复隐藏边源/目标, bendPoint 加节点偏移, 标签位置应用节点偏移', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    node.position = { x: 5, y: 7 }
    const [p1, p2] = makePorts(node, 0, 2, 0, 0)
    const edge = makeEdge(p1, p2)
    addLabel(edge, 'L', { x: 10, y: 5 })
    edge.getBendPoints().push({ x: 1, y: 2 }, { x: 3, y: 4 })
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    const slEdge = [...loop.getSLEdges()][0]!
    const slLabels = loop.getSLLabels()!

    // 模拟隐藏状态
    edge.setSource(null)
    edge.setTarget(null)

    processSelfLoopPost(graph)

    expect(edge.getSource()).toBe(p1)
    expect(edge.getTarget()).toBe(p2)
    expect(edge.getBendPoints()).toEqual([{ x: 6, y: 9 }, { x: 8, y: 11 }])
    // 单标签水平布局 (RIGHT): 标签位置 = 包围盒 {0,0} + offset {5,7}
    expect(slLabels.getLLabels()[0]!.position).toEqual({ x: 5, y: 7 })
    expect(slLabels.getPosition()).toEqual({ x: 0, y: 0 })
    expect(slEdge.getSLSource().getLPort()).toBe(p1)
    // 全图守恒: 无悬挂边/边-端口守恒/坐标有限 (弯点由测试手工构造, 非正交路由输出, 不检查连续性)
    expectNoDanglingEdges(graph)
    expectEdgePortConservation(graph)
    expectFiniteCoordinates(graph)
  })

  it('跳过非 NORMAL 节点与无 holder 节点', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node1 = makeNode(graph, layer)
    const [a1, a2] = makePorts(node1, 0, 2, 0, 0)
    const e1 = makeEdge(a1, a2)
    e1.getBendPoints().push({ x: 1, y: 1 })
    const holder = installHolder(node1)
    node1.setProperty(SELF_LOOP_HOLDER, holder)

    const node2 = makeNode(graph, layer) // NORMAL, 无 holder
    makePorts(node2, 0, 1, 0, 0)

    const node3 = new LNode(graph)
    node3.setType(NodeType.LONG_EDGE) // 非 NORMAL
    node3.setLayer(layer)

    processSelfLoopPost(graph)
    expect(node1.getProperty(SELF_LOOP_HOLDER)).toBe(holder)
    expect(node2.getPorts()).toHaveLength(1)
    expect(node3.getType()).toBe(NodeType.LONG_EDGE)
  })
})

describe('SelfLoopPostprocessor 补充 (ELK Java 移植)', () => {
  it('非 NORMAL 节点携带 holder: 跳过, 边不恢复', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [p1, p2] = makePorts(node, 0, 2, 0, 0)
    const edge = makeEdge(p1, p2)
    const holder = installHolder(node)
    node.setType(NodeType.LONG_EDGE)
    edge.setSource(null)
    edge.setTarget(null)
    processSelfLoopPost(graph)
    // 跳过: 边保持隐藏
    expect(edge.getSource()).toBeNull()
    expect(edge.getTarget()).toBeNull()
    void holder
  })
})
