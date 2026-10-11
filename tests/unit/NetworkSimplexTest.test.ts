/**
 * 移植自 ELK Java: alg.common.networksimplex.NetworkSimplexTest
 * 可行性 (delta 满足) / 最优性 (树边 cut value 非负) / 归一化 / 平衡 / 子树移除重挂.
 */
import { describe, expect, it } from 'vitest'
import { NGraph } from '../../src/networksimplex/ngraph.js'
import { NNode, nn } from '../../src/networksimplex/nnode.js'
import { ne } from '../../src/networksimplex/nedge.js'
import type { NEdge } from '../../src/networksimplex/nedge.js'
import { NetworkSimplex } from '../../src/networksimplex/network-simplex.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import { JavaRandom } from '../../src/util/java-random.js'

function addNode(graph: NGraph, id: number): NNode {
  return nn().id(id).create(graph)
}

function addEdge(graph: NGraph, src: NNode, tgt: NNode, delta = 1, weight = 0): void {
  ne().delta(delta).weight(weight).source(src).target(tgt).create()
}

/** 断言每条边满足最小长度 (可行性). */
function assertFeasible(graph: NGraph, msg?: string): void {
  for (const node of graph.nodes) {
    for (const e of node.getOutgoingEdges()) {
      const actual = e.getTarget().layer - e.getSource().layer
      expect(actual).toBeGreaterThanOrEqual(e.delta)
    }
  }
}

/** 断言层号已归一化 (最小层为 0) 且有限. */
function assertNormalized(graph: NGraph): void {
  expect(graph.nodes.length).toBeGreaterThan(0)
  const layers = graph.nodes.map(n => n.layer)
  expect(Math.min(...layers)).toBe(0)
  for (const l of layers) expect(Number.isFinite(l)).toBe(true)
}

describe('NetworkSimplex (ELK Java 移植)', () => {
  it('空图 execute 为 no-op', () => {
    const graph = new NGraph()
    NetworkSimplex.forGraph(graph).execute()
    expect(graph.nodes.length).toBe(0)
  })

  it('简单链 a→b→c: 归一化后层为 0,2,3', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b, 2)
    addEdge(graph, b, c, 1)
    NetworkSimplex.forGraph(graph).execute()
    expect(a.layer).toBe(0)
    expect(b.layer).toBe(2)
    expect(c.layer).toBe(3)
    assertFeasible(graph)
    assertNormalized(graph)
  })

  it('executeWithMonitor 与 execute 等价', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    addEdge(graph, a, b, 3)
    NetworkSimplex.forGraph(graph).executeWithMonitor(new NullProgressMonitor())
    expect(a.layer).toBe(0)
    expect(b.layer).toBe(3)
  })

  it('不连通图: makeConnected 后执行, 全部节点有界且归一化', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    const d = addNode(graph, 3)
    addEdge(graph, a, b, 1) // 分量1
    addEdge(graph, c, d, 2) // 分量2
    const root = graph.makeConnected()
    expect(root).not.toBeNull()
    NetworkSimplex.forGraph(graph).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    expect(a.layer).toBe(0)
    expect(b.layer).toBe(1)
    expect(c.layer).toBe(0)
    expect(d.layer).toBe(2)
  })

  it('withIterationLimit(0): 只做初始可行分层, 仍满足 delta', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b, 1)
    addEdge(graph, b, c, 2)
    addEdge(graph, a, c, 5)
    NetworkSimplex.forGraph(graph).withIterationLimit(0).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    // a→c delta 5: c.layer - a.layer >= 5
    expect(c.layer).toBeGreaterThanOrEqual(5)
  })

  it('withBalancing(true): 平衡层宽且保持可行', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    const d = addNode(graph, 3)
    // 菱形: a→b→d 与 a→c→d
    addEdge(graph, a, b, 1)
    addEdge(graph, b, d, 1)
    addEdge(graph, a, c, 1)
    addEdge(graph, c, d, 1)
    NetworkSimplex.forGraph(graph).withBalancing(true).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    expect(a.layer).toBe(0)
    expect(d.layer).toBe(2)
  })

  it('withPreviousLayering: 归一化时叠加已有分量层数', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    addEdge(graph, a, b, 1)
    NetworkSimplex.forGraph(graph).withPreviousLayering([2, 1]).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    expect(a.layer).toBe(0)
    expect(b.layer).toBe(1)
  })

  it('最优性: 执行后树边 cut value 非负 (无负 cut 边)', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    const d = addNode(graph, 3)
    // 加权图, 初始可行分层可能需要改进
    addEdge(graph, a, b, 1, 10)
    addEdge(graph, b, d, 1, 10)
    addEdge(graph, a, c, 1, 1)
    addEdge(graph, c, d, 1, 1)
    const ns = NetworkSimplex.forGraph(graph)
    ns.execute()
    assertFeasible(graph)
    const cutvalues = (ns as unknown as { cutvalue: number[] }).cutvalue
    const treeEdges = (ns as unknown as { treeEdges: Set<NEdge> }).treeEdges
    expect(treeEdges.size).toBeGreaterThan(0)
    for (const e of treeEdges) {
      expect(cutvalues[e.internalId]).toBeGreaterThanOrEqual(-1e-10)
    }
  })

  it('testDeltas (移植 ELK Java 随机测试, 种子固定): 大图可行性', () => {
    const random = new JavaRandom(1)
    const graph = new NGraph()
    const n = 120
    const eCount = 240
    const nodes: NNode[] = []
    for (let i = 0; i < n; i++) nodes.push(addNode(graph, i))
    for (let i = 0; i < eCount; i++) {
      let src = random.nextInt(n)
      let tgt = random.nextInt(n)
      while (src === tgt) tgt = random.nextInt(n)
      addEdge(graph, nodes[src]!, nodes[tgt]!, random.nextInt(50), random.nextDouble() * 50)
    }
    // 保证连通
    for (let i = 0; i < n - 1; i++) {
      addEdge(graph, nodes[i]!, nodes[i + 1]!, random.nextInt(50), random.nextDouble() * 50)
    }
    // 保证无环: 高 id 不指向低 id
    for (const node of nodes) {
      for (const edge of [...node.getOutgoingEdges()]) {
        if (edge.source.id > edge.target.id) edge.reverse()
      }
    }
    expect(graph.isAcyclic()).toBe(true)

    NetworkSimplex.forGraph(graph).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    // 不变量: 节点数不变 (子树移除后重挂)
    expect(graph.nodes.length).toBe(n)
  })

  it('子树移除/重挂: 45 节点链执行后节点数恢复且可行', () => {
    const graph = new NGraph()
    const nodes: NNode[] = []
    for (let i = 0; i < 45; i++) nodes.push(addNode(graph, i))
    for (let i = 0; i < 44; i++) addEdge(graph, nodes[i]!, nodes[i + 1]!, 1)
    NetworkSimplex.forGraph(graph).execute()
    expect(graph.nodes.length).toBe(45)
    assertFeasible(graph)
    assertNormalized(graph)
    // 链: layer 单调递增 0..44
    expect(nodes[0]!.layer).toBe(0)
    expect(nodes[44]!.layer).toBe(44)
  })

  describe('私有方法异常路径 (as any)', () => {
    it('enterEdge: 非树边抛错', () => {
      const graph = new NGraph()
      const a = addNode(graph, 0)
      const b = addNode(graph, 1)
      const e = addEdgeRaw(graph, a, b)
      const ns = NetworkSimplex.forGraph(graph)
      expect(() => (ns as any).enterEdge(e)).toThrow('The input edge is not a tree edge.')
    })

    it('exchange: leave 非树边抛错', () => {
      const graph = new NGraph()
      const a = addNode(graph, 0)
      const b = addNode(graph, 1)
      const leave = addEdgeRaw(graph, a, b)
      const enter = addEdgeRaw(graph, b, a)
      const ns = NetworkSimplex.forGraph(graph)
      expect(() => (ns as any).exchange(leave, enter)).toThrow('Given leave edge is no tree edge.')
    })

    it('exchange: enter 已是树边抛错', () => {
      const graph = new NGraph()
      const a = addNode(graph, 0)
      const b = addNode(graph, 1)
      const leave = addEdgeRaw(graph, a, b)
      const enter = addEdgeRaw(graph, b, a)
      leave.treeEdge = true
      enter.treeEdge = true
      const ns = NetworkSimplex.forGraph(graph)
      expect(() => (ns as any).exchange(leave, enter)).toThrow('Given enter edge is a tree edge already.')
    })
  })
})

function addEdgeRaw(graph: NGraph, src: NNode, tgt: NNode): import('../../src/networksimplex/nedge.js').NEdge {
  return ne().delta(1).source(src).target(tgt).create()
}

// ─────────────────────────────────────────────────────────────────────────────
// 最优性 oracle (2026-08-11 T4X3 变异补测):
// 对随机小 DAG 穷举所有可行分层, 断言 NetworkSimplex 输出成本 == 全局最优成本.
// 只杀成本偏差/可行性破坏类变异; 层号平移不变量 (normalize 后 min=0) 单独断言.
// ─────────────────────────────────────────────────────────────────────────────

/** 穷举可行分层中最小化 Σ w*(t.layer - s.layer) 的成本 (平移不变). */
function bruteForceOptimalCost(graph: NGraph): number {
  const nodes = graph.nodes
  const n = nodes.length
  nodes.forEach((nd, i) => { nd.internalId = i })
  const edges: { src: number, tgt: number, w: number, delta: number }[] = []
  for (const node of nodes) {
    for (const e of node.getOutgoingEdges()) {
      edges.push({ src: e.getSource().internalId, tgt: e.getTarget().internalId, w: e.weight, delta: e.delta })
    }
  }
  // 最小可行分层 (最长路径) 必在 [0, MAX_LAYER] 内 → 保证存在可行解.
  const MAX_LAYER = 12
  const layers = new Array(n).fill(0)
  let best = Number.POSITIVE_INFINITY
  const feasible = (): boolean => {
    for (const e of edges) {
      if (layers[e.tgt]! - layers[e.src]! < e.delta) return false
    }
    return true
  }
  const cost = (): number => {
    let c = 0
    for (const e of edges) c += e.w * (layers[e.tgt]! - layers[e.src]!)
    return c
  }
  const rec = (i: number): void => {
    if (i === n) {
      if (feasible()) best = Math.min(best, cost())
      return
    }
    for (let l = 0; l <= MAX_LAYER; l++) {
      layers[i] = l
      rec(i + 1)
    }
  }
  rec(0)
  return best
}

function nsCost(graph: NGraph): number {
  let c = 0
  for (const node of graph.nodes) {
    for (const e of node.getOutgoingEdges()) {
      c += e.weight * (e.getTarget().layer - e.getSource().layer)
    }
  }
  return c
}

/** 构造连通带权 DAG: 骨架边 i→i+1 保证连通, 随机附加边只从低 id 到高 id. */
function randomDAG(seed: number, nodeCount: number): NGraph {
  const r = new JavaRandom(seed)
  const graph = new NGraph()
  const nodes: NNode[] = []
  for (let i = 0; i < nodeCount; i++) nodes.push(addNode(graph, i))
  for (let i = 0; i < nodeCount - 1; i++) addEdge(graph, nodes[i]!, nodes[i + 1]!, 1, 1)
  for (let i = 0; i < nodeCount; i++) {
    for (let j = i + 1; j < nodeCount; j++) {
      if (r.nextDouble() < 0.4) {
        addEdge(graph, nodes[i]!, nodes[j]!, r.nextInt(3), r.nextInt(5) + 1)
      }
    }
  }
  return graph
}

describe('NetworkSimplex 最优性 oracle (穷举 vs 算法)', () => {
  it.each([1, 2, 3, 4, 5, 7, 11, 13])('seed=%i: 随机 DAG 成本等于穷举最优 + 可行 + 归一化', (seed) => {
    const graph = randomDAG(seed, 5)
    const opt = bruteForceOptimalCost(graph)
    expect(Number.isFinite(opt), `seed=${seed}: 穷举应存在可行解`).toBe(true)
    NetworkSimplex.forGraph(graph).execute()
    assertFeasible(graph, `seed=${seed}`)
    assertNormalized(graph)
    expect(nsCost(graph), `seed=${seed} opt=${opt}`).toBe(opt)
  })

  it('权重路径冲突: 高权路径优先紧, 低权路径吸收 slack (成本最小)', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    const d = addNode(graph, 3)
    // a→b (w=10, δ=1), a→c (w=1, δ=2), b→d (w=10, δ=1), c→d (w=1, δ=1)
    addEdge(graph, a, b, 1, 10)
    addEdge(graph, a, c, 2, 1)
    addEdge(graph, b, d, 1, 10)
    addEdge(graph, c, d, 1, 1)
    const opt = bruteForceOptimalCost(graph)
    NetworkSimplex.forGraph(graph).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    expect(nsCost(graph)).toBe(opt)
    // 具体解 (归一化后唯一): a=0, b=1, c=2, d=3 — 高权路径 b→d 紧 (d=b+1),
    // 低权路径 a→c 吸收 slack (c=a+2 即 δ), c→d 紧.
    expect(a.layer).toBe(0)
    expect(b.layer).toBe(1)
    expect(c.layer).toBe(2)
    expect(d.layer).toBe(3)
  })

  it('不连通图 (makeConnected 后): 穷举最优成本一致', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    const d = addNode(graph, 3)
    addEdge(graph, a, b, 1, 3)
    addEdge(graph, c, d, 2, 1)
    const opt = bruteForceOptimalCost(graph)
    const root = graph.makeConnected()
    expect(root).not.toBeNull()
    NetworkSimplex.forGraph(graph).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    // 人工根 0 权重边不增加成本
    expect(nsCost(graph)).toBe(opt)
  })

  it('withBalancing(true) 保持最优成本且平衡后仍归一化', () => {
    // 菱形: 中心 a 入=出 (可平衡移动), 存在多个最优解 → 平衡按层宽摊平.
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    const d = addNode(graph, 3)
    addEdge(graph, a, b, 1, 1)
    addEdge(graph, a, c, 1, 1)
    addEdge(graph, b, d, 1, 1)
    addEdge(graph, c, d, 1, 1)
    const opt = bruteForceOptimalCost(graph)
    NetworkSimplex.forGraph(graph).withBalancing(true).execute()
    assertFeasible(graph)
    assertNormalized(graph)
    expect(nsCost(graph)).toBe(opt)
    expect(a.layer).toBe(0)
    expect(d.layer).toBeGreaterThanOrEqual(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 循环图 (含回边): 初始拓扑分层不可行/非最优 → 触发 minimalSlack/enterEdge/exchange
// 真实优化迭代. 精确层号断言杀优化逻辑变异 (slack 符号/交换方向/迭代次数).
// ─────────────────────────────────────────────────────────────────────────────

describe('NetworkSimplex 循环图 (回边触发 exchange 优化)', () => {
  it('3 环等权: 层号 1,2,0 (回边 c→a 吸收全部 slack)', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b, 1, 5)
    addEdge(graph, b, c, 1, 5)
    addEdge(graph, c, a, 1, 5)
    NetworkSimplex.forGraph(graph).execute()
    expect([a.layer, b.layer, c.layer]).toEqual([1, 2, 0])
    assertNormalized(graph)
  })

  it('3 环权重偏置 10,10,1: 高权边 a→b→c 紧, 低权回边 c→a 吸收 slack', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b, 1, 10)
    addEdge(graph, b, c, 1, 10)
    addEdge(graph, c, a, 1, 1)
    NetworkSimplex.forGraph(graph).execute()
    expect([a.layer, b.layer, c.layer]).toEqual([0, 1, 2])
    assertNormalized(graph)
  })

  it('3 环 delta=2: 高权 a→b(δ2) 拉长, 层号 0,2,3', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b, 2, 3)
    addEdge(graph, b, c, 1, 3)
    addEdge(graph, c, a, 1, 1)
    NetworkSimplex.forGraph(graph).execute()
    expect([a.layer, b.layer, c.layer]).toEqual([0, 2, 3])
    assertNormalized(graph)
  })

  it('双环共享边 a→b: 层号 0:2,1:0,2:1,3:1', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    const d = addNode(graph, 3)
    addEdge(graph, a, b, 1, 5)
    addEdge(graph, b, c, 1, 5)
    addEdge(graph, c, a, 1, 5)
    addEdge(graph, b, d, 1, 5)
    addEdge(graph, d, a, 1, 5)
    NetworkSimplex.forGraph(graph).execute()
    expect([a.layer, b.layer, c.layer, d.layer]).toEqual([2, 0, 1, 1])
    assertNormalized(graph)
  })

  it.each([
    [10, [4, 0, 1, 2, 6]],
    [11, [2, 4, 0, 6, 4]],
    [12, [2, 0, 0, 4, 2]],
  ] as const)('seed=%i: 随机 5 节点含环精确层号', (seed, expected) => {
    const r = new JavaRandom(seed)
    const graph = new NGraph()
    const n = 5
    const nodes: NNode[] = []
    for (let i = 0; i < n; i++) nodes.push(addNode(graph, i))
    for (let i = 0; i < 2 * n; i++) {
      let s = r.nextInt(n)
      let t = r.nextInt(n)
      while (t === s) t = r.nextInt(n)
      addEdge(graph, nodes[s]!, nodes[t]!, 1 + r.nextInt(2), 1 + r.nextInt(6))
    }
    addEdge(graph, nodes[0]!, nodes[1]!, 1, 5)
    addEdge(graph, nodes[1]!, nodes[2]!, 1, 5)
    addEdge(graph, nodes[2]!, nodes[0]!, 1, 5)
    NetworkSimplex.forGraph(graph).execute()
    expect(graph.nodes.map(x => x.layer), `seed=${seed}`).toEqual(expected)
    assertNormalized(graph)
  })

  it('withBalancing(true) 3 环: 平衡不破坏精确层号 (0:1,1:2,2:0)', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b, 1, 5)
    addEdge(graph, b, c, 1, 5)
    addEdge(graph, c, a, 1, 5)
    NetworkSimplex.forGraph(graph).withBalancing(true).execute()
    expect([a.layer, b.layer, c.layer]).toEqual([1, 2, 0])
    assertNormalized(graph)
  })

  it('withPreviousLayering 3 环: 层号不受影响 (filling 只影响 balance)', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b, 1, 5)
    addEdge(graph, b, c, 1, 5)
    addEdge(graph, c, a, 1, 5)
    NetworkSimplex.forGraph(graph).withPreviousLayering([3, 2, 1]).execute()
    expect([a.layer, b.layer, c.layer]).toEqual([1, 2, 0])
    assertNormalized(graph)
  })
})
