/**
 * P1 GreedyCycleBreaker 测试 (对应 ELK p1cycles.BasicCycleBreakerTest.testIsAcyclic).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { GreedyCycleBreaker } from '../../src/p1cycles/greedy-cycle-breaker.js'
import { RANDOM, CYCLIC } from '../../src/options/internal-properties.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'

function createSimpleEdge(src: LNode, tgt: LNode): LEdge {
  const sp = new LPort(); sp.setNode(src)
  const tp = new LPort(); tp.setNode(tgt)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

function graphIsAcyclic(graph: LGraph): boolean {
  const nodes = graph.getLayerlessNodes()
  const adj = new Map<LNode, LNode[]>()
  for (const n of nodes) adj.set(n, [])
  for (const n of nodes) {
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        const t = e.getTarget()!.getNode()!
        if (t !== n) adj.get(n)!.push(t)
      }
    }
  }
  const visiting = new Set<LNode>()
  const visited = new Set<LNode>()
  const dfs = (n: LNode): boolean => {
    if (visiting.has(n)) return true
    if (visited.has(n)) return false
    visiting.add(n)
    for (const v of adj.get(n)!) if (dfs(v)) return true
    visiting.delete(n)
    visited.add(n)
    return false
  }
  for (const n of nodes) if (dfs(n)) return false
  return true
}

describe('GreedyCycleBreaker (ELK 1:1)', () => {
  it('DAG 图: 不反转任何边', () => {
    const graph = new LGraph()
    const a = new LNode(graph)
    const b = new LNode(graph)
    const c = new LNode(graph)
    createSimpleEdge(a, b)
    createSimpleEdge(b, c)
    graph.setProperty(RANDOM, new JavaRandom(1))
    new GreedyCycleBreaker().process(graph, new NullProgressMonitor())
    expect(graphIsAcyclic(graph)).toBe(true)
  })

  it('环图: 反转后无环', () => {
    const graph = new LGraph()
    const a = new LNode(graph)
    const b = new LNode(graph)
    const c = new LNode(graph)
    createSimpleEdge(a, b)
    createSimpleEdge(b, c)
    createSimpleEdge(c, a)
    graph.setProperty(RANDOM, new JavaRandom(1))
    new GreedyCycleBreaker().process(graph, new NullProgressMonitor())
    expect(graphIsAcyclic(graph)).toBe(true)
    expect(graph.getProperty(CYCLIC)).toBe(true)
  })

  it('自环被忽略', () => {
    const graph = new LGraph()
    const a = new LNode(graph)
    createSimpleEdge(a, a)
    graph.setProperty(RANDOM, new JavaRandom(1))
    new GreedyCycleBreaker().process(graph, new NullProgressMonitor())
    expect(graphIsAcyclic(graph)).toBe(true)
  })

  it('两节点互环', () => {
    const graph = new LGraph()
    const a = new LNode(graph)
    const b = new LNode(graph)
    createSimpleEdge(a, b)
    createSimpleEdge(b, a)
    graph.setProperty(RANDOM, new JavaRandom(1))
    new GreedyCycleBreaker().process(graph, new NullProgressMonitor())
    expect(graphIsAcyclic(graph)).toBe(true)
  })

  it('确定性: 同一 seed 结果一致', () => {
    function run(): number[] {
      const graph = new LGraph()
      const nodes = Array.from({ length: 6 }, () => new LNode(graph))
      createSimpleEdge(nodes[0]!, nodes[1]!)
      createSimpleEdge(nodes[1]!, nodes[2]!)
      createSimpleEdge(nodes[2]!, nodes[0]!)
      createSimpleEdge(nodes[3]!, nodes[4]!)
      createSimpleEdge(nodes[4]!, nodes[5]!)
      createSimpleEdge(nodes[5]!, nodes[3]!)
      graph.setProperty(RANDOM, new JavaRandom(42))
      new GreedyCycleBreaker().process(graph, new NullProgressMonitor())
      return nodes.map(n => n.getPorts().flatMap(p => p.getOutgoingEdges()).length)
    }
    expect(run()).toEqual(run())
  })
})
