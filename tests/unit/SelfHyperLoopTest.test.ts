/**
 * SelfHyperLoop (ELK intermediate.loops.SelfHyperLoop) 语义单元测试.
 * SSOT: ELK Java 0.12.0 SelfHyperLoop.java.
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { SelfLoopEdge } from '../../src/intermediate/loops/self-loop-edge.js'
import { SelfHyperLoop } from '../../src/intermediate/loops/self-hyper-loop.js'
import { portSideOrdinal } from '../../src/intermediate/loops/port-side-util.js'
import { makeGraph, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'

describe('SelfHyperLoop (ELK Java 移植)', () => {
  it('addSelfLoopEdge: 去重/收录端口与标签/BFS 超环构建', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const ports = makePorts(node, 4, 0, 0, 0)
    const e1 = makeEdge(ports[0]!, ports[1]!)
    const e2 = makeEdge(ports[1]!, ports[2]!)
    const e3 = makeEdge(ports[2]!, ports[3]!)
    addLabel(e1, 'L1', { x: 5, y: 5 })
    addLabel(e2, 'L2', { x: 7, y: 6 })
    addLabel(e3, 'L3', { x: 3, y: 4 })
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getSLHolder()).toBe(holder)
    expect(loop.getSLPorts().map(p => p.getLPort())).toEqual(ports)
    expect(loop.getSLEdges().size).toBe(3)
    expect(loop.getSLLabels()!.getLLabels()).toHaveLength(3)

    // 重复 add 同一 SL 边 → 无效果
    const firstEdge = [...loop.getSLEdges()][0]!
    loop.addSelfLoopEdge(firstEdge)
    expect(loop.getSLEdges().size).toBe(3)
    expect(loop.getSLPorts()).toHaveLength(4)

    // 手工构造 SL 边再 add → 复用既有 slLabels
    const e4 = makeEdge(ports[3]!, ports[0]!)
    addLabel(e4, 'L4', { x: 9, y: 2 })
    const slSource = holder.getSLPortMap().get(ports[3]!)!
    const slTarget = holder.getSLPortMap().get(ports[0]!)!
    const slEdge4 = new SelfLoopEdge(e4, slSource, slTarget)
    loop.addSelfLoopEdge(slEdge4)
    expect(loop.getSLEdges().size).toBe(4)
    expect(loop.getSLLabels()!.getLLabels()).toHaveLength(4)
    expect(slEdge4.getSLHyperLoop()).toBe(loop)
  })

  it('computePortsPerSide: 按侧分组 + 计算自环类型', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const ports = makePorts(node, 2, 1, 0, 0)
    makeEdge(ports[0]!, ports[2]!)
    makeEdge(ports[2]!, ports[1]!)
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    loop.computePortsPerSide()
    expect(loop.getSLPortsBySideMap().size).toBe(2)
    expect(loop.getSLPortsBySide(PortSide.NORTH)).toHaveLength(2)
    expect(loop.getSLPortsBySide(PortSide.EAST)).toHaveLength(1)
    expect(loop.hasSLPortsOnSide(PortSide.NORTH)).toBe(true)
    expect(loop.hasSLPortsOnSide(PortSide.SOUTH)).toBe(false)
    expect(loop.getSelfLoopType()).toBe('TWO_SIDES_CORNER')
  })

  it('leftmost/rightmost/occupied 访问器与路由槽更新 holder 槽计数', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const ports = makePorts(node, 2, 0, 0, 0)
    makeEdge(ports[0]!, ports[1]!)
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    const slPorts = loop.getSLPorts()
    loop.setLeftmostPort(slPorts[0]!)
    loop.setRightmostPort(slPorts[1]!)
    expect(loop.getLeftmostPort()).toBe(slPorts[0])
    expect(loop.getRightmostPort()).toBe(slPorts[1])
    expect(loop.getOccupiedPortSides().size).toBe(0)
    loop.getOccupiedPortSides().add(PortSide.NORTH)
    expect(loop.getOccupiedPortSides().has(PortSide.NORTH)).toBe(true)

    // setRoutingSlot 更新 slotCount (max)
    loop.setRoutingSlot(PortSide.NORTH, 2)
    expect(loop.getRoutingSlot(PortSide.NORTH)).toBe(2)
    expect(holder.getRoutingSlotCount()[portSideOrdinal(PortSide.NORTH)]).toBe(3)
    loop.setRoutingSlot(PortSide.NORTH, 0)
    expect(holder.getRoutingSlotCount()[portSideOrdinal(PortSide.NORTH)]).toBe(3)
    // ELK Java int[] 初始 0: 未设槽返回 0 (ggn 曾用稀疏数组返回 undefined, 已修 fill(0))
    expect(loop.getRoutingSlot(PortSide.SOUTH)).toBe(0)
    loop.setRoutingSlot(PortSide.SOUTH, 1)
    expect(loop.getRoutingSlot(PortSide.SOUTH)).toBe(1)
    expect(holder.getRoutingSlotCount()[portSideOrdinal(PortSide.SOUTH)]).toBe(2)
  })

  it('getSLLabels 对无标签环为 null, getSLPortsBySideMap 在 computePortsPerSide 后可用', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const ports = makePorts(node, 2, 0, 0, 0)
    makeEdge(ports[0]!, ports[1]!)
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getSLLabels()).toBeNull()
    // Java: getSelfLoopType() 直接返回字段 (未计算时为 null, 由消费方 NPE) → 此处断言 null
    expect(loop.getSelfLoopType()).toBeNull()
    loop.computePortsPerSide()
    expect(loop.getSLPortsBySideMap().has(PortSide.NORTH)).toBe(true)
    expect(loop.getSelfLoopType()).toBe('ONE_SIDE')
  })
})

// 确保类型引用 (防止 tree-shake 移除 import)
void (SelfHyperLoop as unknown)
