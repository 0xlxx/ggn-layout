/**
 * SelfLoopEdge (ELK intermediate.loops.SelfLoopEdge) 语义单元测试.
 * SSOT: ELK Java 0.12.0 SelfLoopEdge.java.
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { SelfLoopEdge } from '../../src/intermediate/loops/self-loop-edge.js'
import { makeGraph, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'

describe('SelfLoopEdge (ELK Java 移植)', () => {
  it('构造器注册 in/out SL 边, 访问器往返, getLabelSide 取超环标签侧', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const [p1, p2] = makePorts(node, 0, 2, 0, 0)
    const edge = makeEdge(p1, p2)
    addLabel(edge, 'L', { x: 4, y: 4 })
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    const slEdge = [...loop.getSLEdges()][0]!
    expect(slEdge).toBeInstanceOf(SelfLoopEdge)
    expect(slEdge.getLEdge()).toBe(edge)
    expect(slEdge.getSLSource().getLPort()).toBe(p1)
    expect(slEdge.getSLTarget().getLPort()).toBe(p2)
    expect(slEdge.getSLHyperLoop()).toBe(loop)
    expect(slEdge.getSLSource().hadOnlySelfLoops()).toBe(true)
    expect(slEdge.getSLTarget().hadOnlySelfLoops()).toBe(true)
    // 端口侧 SL 边注册
    expect(slEdge.getSLSource().getOutgoingSLEdges()).toContain(slEdge)
    expect(slEdge.getSLTarget().getIncomingSLEdges()).toContain(slEdge)
    // getLabelSide
    loop.getSLLabels()!.setSide(PortSide.NORTH)
    expect(slEdge.getLabelSide()).toBe(PortSide.NORTH)
  })
})
