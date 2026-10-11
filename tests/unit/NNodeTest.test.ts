/**
 * NNode / NNodeBuilder (对应 ELK networksimplex.NNode).
 */
import { describe, expect, it } from 'vitest'
import { NGraph } from '../../src/networksimplex/ngraph.js'
import { NNode, nn } from '../../src/networksimplex/nnode.js'
import { ne } from '../../src/networksimplex/nedge.js'

describe('NNode (ELK Java 移植)', () => {
  it('builder 默认值', () => {
    const graph = new NGraph()
    const n = nn().create(graph)
    expect(n).toBeInstanceOf(NNode)
    expect(n.id).toBe(0)
    expect(n.internalId).toBe(0)
    expect(n.origin).toBeNull()
    expect(n.type).toBe('')
    expect(n.layer).toBe(0)
    expect(n.treeNode).toBe(false)
    expect(n.getOutgoingEdges()).toEqual([])
    expect(n.getIncomingEdges()).toEqual([])
    expect(n.getConnectedEdges()).toEqual([])
    expect(n.unknownCutvalues).toEqual([])
  })

  it('builder id/origin/type 链式设置', () => {
    const graph = new NGraph()
    const origin = { name: 'x' }
    const n = nn().id(42).origin(origin).type('dummy').create(graph)
    expect(n.id).toBe(42)
    expect(n.origin).toBe(origin)
    expect(n.type).toBe('dummy')
    expect(graph.nodes).toContain(n)
    expect(graph.nodes.length).toBe(1)
  })

  it('getConnectedEdges 合并入边与出边并缓存; invalidate 失效', () => {
    const graph = new NGraph()
    const a = nn().create(graph)
    const b = nn().create(graph)
    const e = ne().source(a).target(b).create()

    expect(a.getConnectedEdges()).toEqual([e])
    expect(a.getConnectedEdges()).toBe(a.getConnectedEdges()) // 缓存同一引用
    expect(b.getConnectedEdges()).toEqual([e])

    // 边反转后缓存失效 → 列表更新
    e.reverse()
    // reverse 内部已调用 invalidateConnectedEdges
    expect(a.getConnectedEdges()).toEqual([e])
    expect(b.getConnectedEdges()).toEqual([e])
  })

  it('connected edges 顺序: 先入边后出边', () => {
    const graph = new NGraph()
    const a = nn().create(graph)
    const b = nn().create(graph)
    const c = nn().create(graph)
    const inEdge = ne().source(b).target(a).create()
    const outEdge = ne().source(a).target(c).create()
    expect(a.getConnectedEdges()).toEqual([inEdge, outEdge])
  })
})
