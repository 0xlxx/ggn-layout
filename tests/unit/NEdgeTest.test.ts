/**
 * NEdge / NEdgeBuilder (对应 ELK networksimplex.NEdge).
 */
import { describe, expect, it } from 'vitest'
import { NGraph } from '../../src/networksimplex/ngraph.js'
import { NNode, nn } from '../../src/networksimplex/nnode.js'
import { NEdge, ne } from '../../src/networksimplex/nedge.js'

function graphWithTwoNodes(): { graph: NGraph, a: NNode, b: NNode } {
  const graph = new NGraph()
  const a = nn().create(graph)
  const b = nn().create(graph)
  return { graph, a, b }
}

describe('NEdge (ELK Java 移植)', () => {
  it('builder 默认值', () => {
    const { graph, a, b } = graphWithTwoNodes()
    const e = ne().source(a).target(b).create()
    expect(e).toBeInstanceOf(NEdge)
    expect(e.id).toBe(0)
    expect(e.internalId).toBe(0)
    expect(e.origin).toBeNull()
    expect(e.weight).toBe(0)
    expect(e.delta).toBe(1)
    expect(e.treeEdge).toBe(false)
    expect(e.getSource()).toBe(a)
    expect(e.getTarget()).toBe(b)
    expect(graph.nodes).toEqual([a, b])
  })

  it('builder id/origin/weight/delta 链式设置', () => {
    const { a, b } = graphWithTwoNodes()
    const origin = { edge: true }
    const e = ne().id(7).origin(origin).weight(3.5).delta(2).source(a).target(b).create()
    expect(e.id).toBe(7)
    expect(e.origin).toBe(origin)
    expect(e.weight).toBe(3.5)
    expect(e.delta).toBe(2)
  })

  it('create: 把边注册到 source.outgoing / target.incoming', () => {
    const { a, b } = graphWithTwoNodes()
    ne().source(a).target(b).create()
    expect(a.getOutgoingEdges().length).toBe(1)
    expect(b.getIncomingEdges().length).toBe(1)
    expect(a.getIncomingEdges().length).toBe(0)
    expect(b.getOutgoingEdges().length).toBe(0)
  })

  it('create: 缺少 source/target 抛错', () => {
    expect(() => ne().create()).toThrow('NEdge must have a source and target NNode specified.')
    expect(() => ne().source(nn().create(new NGraph())).create()).toThrow('NEdge must have a source and target NNode specified.')
  })

  it('create: 自环抛错', () => {
    const { a } = graphWithTwoNodes()
    expect(() => ne().source(a).target(a).create()).toThrow('Network simplex does not support self-loops')
  })

  it('getOther: 返回对端; 非法节点抛错', () => {
    const { graph, a, b } = graphWithTwoNodes()
    const c = nn().create(graph)
    const e = ne().source(a).target(b).create()
    expect(e.getOther(a)).toBe(b)
    expect(e.getOther(b)).toBe(a)
    expect(() => e.getOther(c)).toThrow('Node not part of edge')
  })

  it('reverse: 交换 source/target 并迁移边列表', () => {
    const { a, b } = graphWithTwoNodes()
    const e = ne().source(a).target(b).create()
    const result = e.reverse()
    expect(result).toBe(e)
    expect(e.getSource()).toBe(b)
    expect(e.getTarget()).toBe(a)
    expect(b.getOutgoingEdges()).toContain(e)
    expect(a.getIncomingEdges()).toContain(e)
    expect(a.getOutgoingEdges()).not.toContain(e)
    expect(b.getIncomingEdges()).not.toContain(e)
  })

  it('reverse: 多层链式反转恢复原状', () => {
    const { graph, a, b } = graphWithTwoNodes()
    const c = nn().create(graph)
    const e1 = ne().source(a).target(b).create()
    const e2 = ne().source(b).target(c).create()
    e1.reverse()
    e2.reverse()
    expect(e1.getSource()).toBe(b)
    expect(e1.getTarget()).toBe(a)
    expect(e2.getSource()).toBe(c)
    expect(e2.getTarget()).toBe(b)
    // 不变量: 每个节点的出入边集合一致
    expect(a.getIncomingEdges()).toEqual([e1])
    expect(c.getOutgoingEdges()).toEqual([e2])
    expect(b.getOutgoingEdges()).toEqual([e1])
    expect(b.getIncomingEdges()).toEqual([e2])
  })

  it('reverse 对缓存 getConnectedEdges 生效 (invalidate)', () => {
    const { a, b } = graphWithTwoNodes()
    const e = ne().source(a).target(b).create()
    const before = a.getConnectedEdges()
    e.reverse()
    expect(a.getConnectedEdges()).not.toBe(before) // 缓存已失效重建
    expect(a.getConnectedEdges()).toEqual([e])
  })
})
