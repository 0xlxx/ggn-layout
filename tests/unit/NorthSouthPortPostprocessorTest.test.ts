/**
 * NorthSouthPortPostprocessor (ELK intermediate.NorthSouthPortPostprocessor) 语义单元测试.
 * SSOT: ELK Java 0.12.0 NorthSouthPortPostprocessor.java (移除 NS dummy, 边重连 + bendPoint/联结点).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType } from '../../src/index.js'
import { processNorthSouthPortPost } from '../../src/intermediate/north-south-port-postprocessor.js'
import { ORIGIN } from '../../src/options/internal-properties.js'
import { JUNCTION_POINTS } from '../../src/options/layered-options.js'
import { makeGraph, makeLayer, makeNode, makePorts, makeEdge } from './helpers/SelfLoopGraphBuilder.js'

function makeNSDummy(graph: LGraph, layer: import('../../src/graph/layer.js').Layer, origin: unknown): LNode {
  const dummy = new LNode(graph)
  dummy.setType(NodeType.NORTH_SOUTH_PORT)
  dummy.setLayer(layer)
  dummy.setProperty(ORIGIN, origin as never)
  return dummy
}

describe('NorthSouthPortPostprocessor (ELK Java 移植)', () => {
  it('SPLINES 路由: 重连边到原端口, 不插 bendPoint', () => {
    const graph = makeGraph({ edgeRouting: 'SPLINES' })
    const layer = makeLayer(graph)
    const originNode = makeNode(graph, layer)
    const originPort = makePorts(originNode, 1, 0, 0, 0)[0]!
    const otherNode = makeNode(graph, layer)
    const otherPort = makePorts(otherNode, 0, 1, 0, 0)[0]!

    const dummy = makeNSDummy(graph, layer, originPort)
    const inPort = new LPort(); inPort.setSide(PortSide.WEST); inPort.setNode(dummy); inPort.setProperty(ORIGIN, originPort)
    const outPort = new LPort(); outPort.setSide(PortSide.EAST); outPort.setNode(dummy); outPort.setProperty(ORIGIN, originPort)
    const inEdge = makeEdge(otherPort, inPort)   // 进入 dummy
    const outEdge = makeEdge(outPort, otherPort) // 从 dummy 出去

    processNorthSouthPortPost(graph)

    expect(inEdge.getTarget()).toBe(originPort)
    expect(outEdge.getSource()).toBe(originPort)
    expect(inEdge.getBendPoints()).toHaveLength(0)
    expect(outEdge.getBendPoints()).toHaveLength(0)
    expect(dummy.getLayer()).toBeNull()
  })

  it('自环 NS dummy (ORIGIN 为 LEdge): restoreSelfLoop 重连 + 2 bendPoint', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer)
    const [outPort, inPort] = makePorts(node, 0, 2, 0, 0)
    outPort.getPosition().x = 10
    inPort.getPosition().x = 40
    outPort.getAnchor().x = 5
    inPort.getAnchor().x = 5
    const selfLoop = new LEdge() // 自环边 (源/目标待恢复)
    const dummy = makeNSDummy(graph, layer, selfLoop)
    const dummyIn = new LPort(); dummyIn.setSide(PortSide.WEST); dummyIn.setNode(dummy); dummyIn.setProperty(ORIGIN, inPort)
    const dummyOut = new LPort(); dummyOut.setSide(PortSide.EAST); dummyOut.setNode(dummy); dummyOut.setProperty(ORIGIN, outPort)
    dummy.position = { x: 100, y: 200 }

    processNorthSouthPortPost(graph)

    expect(selfLoop.getSource()).toBe(outPort)
    expect(selfLoop.getTarget()).toBe(inPort)
    // bp1 = dummy.position 拷贝 + x 改为 originOutput 绝对锚点 x (node.pos 0 + port.pos 10 + anchor 5)
    expect(selfLoop.getBendPoints()[0]).toEqual({ x: 15, y: 200 })
    // bp2 = dummy.position 拷贝 + x 改为 originInput 绝对锚点 x (0 + 40 + 5)
    expect(selfLoop.getBendPoints()[1]).toEqual({ x: 45, y: 200 })
    expect(dummy.getLayer()).toBeNull()
  })

  it('普通 NS dummy (共享同一 origin): restoreEdges + 联结点', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const originNode = makeNode(graph, layer)
    const originPort = makePorts(originNode, 1, 0, 0, 0)[0]!
    originPort.getPosition().x = 30
    originPort.getAnchor().x = 5
    const otherNode = makeNode(graph, layer)
    const otherPortA = makePorts(otherNode, 0, 1, 0, 0)[0]!
    const otherPortB = makePorts(otherNode, 0, 0, 1, 0)[0]!

    const dummy = makeNSDummy(graph, layer, originPort)
    dummy.position = { x: 0, y: 77 }
    const inPort = new LPort(); inPort.setSide(PortSide.WEST); inPort.setNode(dummy); inPort.setProperty(ORIGIN, originPort)
    const outPort = new LPort(); outPort.setSide(PortSide.EAST); outPort.setNode(dummy); outPort.setProperty(ORIGIN, originPort)
    const inEdge = makeEdge(otherPortA, inPort)
    const outEdge = makeEdge(outPort, otherPortB)

    processNorthSouthPortPost(graph)

    expect(inEdge.getTarget()).toBe(originPort)
    expect(outEdge.getSource()).toBe(originPort)
    const xy = { x: 35, y: 77 } // originPort 绝对锚点 x = 30+5, dummy.position.y = 77
    expect(inEdge.getBendPoints()).toEqual([xy])
    expect(outEdge.getBendPoints()).toEqual([xy])
    expect(inEdge.getProperty(JUNCTION_POINTS)).toEqual([xy])
    expect(outEdge.getProperty(JUNCTION_POINTS)).toEqual([xy])
  })

  it('普通 NS dummy (不同 origin): 不加联结点; 单端口 dummy sameOrigin=false', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const nodeA = makeNode(graph, layer)
    const originA = makePorts(nodeA, 1, 0, 0, 0)[0]!
    const nodeB = makeNode(graph, layer)
    const originB = makePorts(nodeB, 0, 0, 1, 0)[0]!
    const otherNode = makeNode(graph, layer)
    const otherPort = makePorts(otherNode, 0, 1, 0, 0)[0]!

    const dummy = makeNSDummy(graph, layer, originA)
    const inPort = new LPort(); inPort.setSide(PortSide.WEST); inPort.setNode(dummy); inPort.setProperty(ORIGIN, originA)
    const outPort = new LPort(); outPort.setSide(PortSide.EAST); outPort.setNode(dummy); outPort.setProperty(ORIGIN, originB)
    const inEdge = makeEdge(otherPort, inPort)
    const outEdge = makeEdge(outPort, otherPort)
    processNorthSouthPortPost(graph)
    expect(inEdge.getTarget()).toBe(originA)
    expect(outEdge.getSource()).toBe(originB)
    expect(inEdge.getProperty(JUNCTION_POINTS)).toBeNull()
    expect(outEdge.getProperty(JUNCTION_POINTS)).toBeNull()

    // 单端口 dummy (只有入边) → sameOrigin=false
    const dummy2 = makeNSDummy(graph, layer, originA)
    const only = new LPort(); only.setSide(PortSide.WEST); only.setNode(dummy2); only.setProperty(ORIGIN, originA)
    const e2 = makeEdge(otherPort, only)
    processNorthSouthPortPost(graph)
    expect(e2.getTarget()).toBe(originA)
    expect(e2.getProperty(JUNCTION_POINTS)).toBeNull()
  })

  it('跳过非 NORTH_SOUTH_PORT 节点', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const normal = makeNode(graph, layer)
    const [p1, p2] = makePorts(normal, 0, 2, 0, 0)
    const e = makeEdge(p1, p2)
    processNorthSouthPortPost(graph)
    expect(e.getSource()).toBe(p1)
    expect(e.getTarget()).toBe(p2)
    expect(normal.getLayer()).toBe(layer)
  })
})
