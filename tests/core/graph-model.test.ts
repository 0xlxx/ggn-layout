import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, PortSide, NodeType, Property } from '../../src/index.js'

describe('graph model (ELK 1:1)', () => {
  it('LGraph/Layer/LNode 层级关联', () => {
    const graph = new LGraph()
    const layer = new Layer(graph)
    // ELK Java: Layer 构造器不自动加入 graph.layers (只保存 owner), 由调用方显式 add.
    graph.getLayers().push(layer)
    const node = new LNode(graph)
    node.setLayer(layer)
    expect(graph.getLayers()).toHaveLength(1)
    expect(graph.getLayerlessNodes()).toContain(node)
    expect(layer.getNodes()).toContain(node)
    expect(node.getLayer()).toBe(layer)
    expect(node.getGraph()).toBe(graph)
    expect(node.getIndex()).toBe(0)
  })

  it('setLayer 从旧层移除', () => {
    const graph = new LGraph()
    const l1 = new Layer(graph)
    const l2 = new Layer(graph)
    const node = new LNode(graph)
    node.setLayer(l1)
    node.setLayer(l2)
    expect(l1.getNodes()).not.toContain(node)
    expect(l2.getNodes()).toContain(node)
  })

  it('LPort setNode/setSide 维护锚点与列表', () => {
    const node = new LNode()
    const port = new LPort()
    port.setNode(node)
    expect(node.getPorts()).toContain(port)
    port.size = { x: 20, y: 10 }
    port.setSide(PortSide.EAST)
    expect(port.getAnchor()).toEqual({ x: 20, y: 5 })
    port.setSide(PortSide.WEST)
    expect(port.getAnchor()).toEqual({ x: 0, y: 5 })
  })

  it('LEdge setSource/setTarget 双向维护 + reverse', () => {
    const a = new LNode()
    const b = new LNode()
    const pa = new LPort(); pa.setNode(a)
    const pb = new LPort(); pb.setNode(b)
    const edge = new LEdge()
    edge.setSource(pa)
    edge.setTarget(pb)
    expect(pa.getOutgoingEdges()).toContain(edge)
    expect(pb.getIncomingEdges()).toContain(edge)
    expect(edge.isSelfLoop()).toBe(false)
    edge.reverse(new LGraph(), false)
    expect(edge.getSource()).toBe(pb)
    expect(edge.getTarget()).toBe(pa)
    expect(pa.getIncomingEdges()).toContain(edge)
    expect(pb.getOutgoingEdges()).toContain(edge)
  })

  it('属性系统: 默认值 + setProperty + hasProperty', () => {
    const prop = new Property<number>('test.prop', 42)
    const holder = new LGraph()
    expect(holder.getProperty(prop)).toBe(42)
    holder.setProperty(prop, 7)
    expect(holder.getProperty(prop)).toBe(7)
    expect(holder.hasProperty(prop)).toBe(true)
    holder.setProperty(prop, null as unknown as number)
    expect(holder.hasProperty(prop)).toBe(false)
  })

  it('NodeType 枚举与节点类型', () => {
    const node = new LNode()
    node.setType(NodeType.EXTERNAL_PORT)
    expect(node.getType()).toBe(NodeType.EXTERNAL_PORT)
  })
})
