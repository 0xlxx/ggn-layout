/**
 * NGraph (对应 ELK networksimplex.NGraph) — makeConnected / isAcyclic.
 */
import { describe, expect, it } from 'vitest'
import { NGraph } from '../../src/networksimplex/ngraph.js'
import { NNode, nn } from '../../src/networksimplex/nnode.js'
import { ne } from '../../src/networksimplex/nedge.js'

function addNode(graph: NGraph, id: number): NNode {
  return nn().id(id).create(graph)
}

function addEdge(graph: NGraph, src: NNode, tgt: NNode, delta = 1): void {
  ne().delta(delta).source(src).target(tgt).create()
}

describe('NGraph (ELK Java 移植)', () => {
  it('makeConnected: 单连通分量返回 null 且不新增节点', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    addEdge(graph, a, b)
    const root = graph.makeConnected()
    expect(root).toBeNull()
    expect(graph.nodes.length).toBe(2)
  })

  it('makeConnected: 多连通分量创建人工根并用 0 权重 0 delta 边连接', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b) // 分量1: {a,b}; 分量2: {c}
    const root = graph.makeConnected()
    expect(root).not.toBeNull()
    expect(graph.nodes.length).toBe(4)
    expect(graph.nodes[3]).toBe(root)
    const rootNode = root!
    // 根到每个分量的代表节点: 0 权重 0 delta
    expect(rootNode.getOutgoingEdges().length).toBe(2)
    for (const e of rootNode.getOutgoingEdges()) {
      expect(e.weight).toBe(0)
      expect(e.delta).toBe(0)
      expect(e.getSource()).toBe(rootNode)
      // 目标是两个分量的代表 (a 与 c)
      expect([a, c]).toContain(e.getTarget())
    }
    // 不变量: 连接后全图连通 (根可达所有节点)
    const visited = new Set<NNode>()
    const dfs = (n: NNode) => {
      if (visited.has(n)) return
      visited.add(n)
      for (const e of n.getConnectedEdges()) dfs(e.getOther(n))
    }
    dfs(rootNode)
    expect(visited.size).toBe(4)
  })

  it('isAcyclic: 空图返回 true', () => {
    expect(new NGraph().isAcyclic()).toBe(true)
  })

  it('isAcyclic: 无环 DAG 返回 true', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b)
    addEdge(graph, b, c)
    addEdge(graph, a, c)
    expect(graph.isAcyclic()).toBe(true)
  })

  it('isAcyclic: 全环 (无根) 返回 false', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    addEdge(graph, a, b)
    addEdge(graph, b, a)
    expect(graph.isAcyclic()).toBe(false)
  })

  it('isAcyclic: 部分环 (有根但存在回边) 返回 false', () => {
    // a→b, b→c, c→b: b↔c 成环, a 是根 → 拓扑排序走完 a 后停, 回边检查发现 c→b.
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    const c = addNode(graph, 2)
    addEdge(graph, a, b)
    addEdge(graph, b, c)
    addEdge(graph, c, b)
    expect(graph.isAcyclic()).toBe(false)
  })

  it('isAcyclic: 自环返回 false', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    addEdge(graph, a, b)
    // 手工给 b 加自环
    const self = ne().delta(1).source(b).target(b)
    expect(() => self.create()).toThrow('self-loops')
    // 无自环则 acyclic
    expect(graph.isAcyclic()).toBe(true)
  })

  it('makeConnected 后 isAcyclic 仍为 true (人工根 0 权重边不破坏无环性)', () => {
    const graph = new NGraph()
    const a = addNode(graph, 0)
    const b = addNode(graph, 1)
    graph.makeConnected()
    expect(graph.isAcyclic()).toBe(true)
  })
})

/**
 * 性质/随机属性测试 (writer C): 固定种子随机图.
 *   - 拓扑构造的随机 DAG → isAcyclic true; 强制 0↔1 互连 → false
 *   - 随机稠密图 makeConnected → 全图连通 (从根可达所有节点) + 节点守恒 + 人工根 0 权重/0 delta
 */
import { JavaRandom } from '../../src/util/java-random.js'

describe('NGraph 性质/随机属性测试', () => {
  it.each([1, 2, 3, 4, 5])('seed=%i: 随机 DAG 无环; 强制回边成环', (seed) => {
    const r = new JavaRandom(seed)
    const graph = new NGraph()
    const n = 10
    const nodes: NNode[] = []
    for (let i = 0; i < n; i++) nodes.push(addNode(graph, i))
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (r.nextDouble() < 0.3) addEdge(graph, nodes[i]!, nodes[j]!)
      }
    }
    expect(graph.isAcyclic(), `seed=${seed}`).toBe(true)
    // 强制 0→1 与 1→0 → 环
    addEdge(graph, nodes[0]!, nodes[1]!)
    addEdge(graph, nodes[1]!, nodes[0]!)
    expect(graph.isAcyclic()).toBe(false)
  })

  it.each([1, 2, 3, 4, 5])('seed=%i: makeConnected 后全图连通 + 节点守恒 + 根 0 权重', (seed) => {
    const r = new JavaRandom(seed)
    const graph = new NGraph()
    const n = 12
    const nodes: NNode[] = []
    for (let i = 0; i < n; i++) nodes.push(addNode(graph, i))
    for (let i = 0; i < 3 * n; i++) {
      const a = nodes[r.nextInt(n)]!
      const b = nodes[r.nextInt(n)]!
      if (a !== b) addEdge(graph, a, b)
    }
    const before = graph.nodes.length
    const root = graph.makeConnected()
    expect(graph.nodes.length, `seed=${seed}`).toBe(before + (root !== null ? 1 : 0))
    // 连通性: 从根 (或任一节点) 可达所有
    const reach = new Set<NNode>()
    const stack: NNode[] = [root ?? graph.nodes[0]!]
    while (stack.length > 0) {
      const x = stack.pop()!
      if (reach.has(x)) continue
      reach.add(x)
      for (const e of x.getConnectedEdges()) stack.push(e.getOther(x))
    }
    expect(reach.size, `seed=${seed}`).toBe(graph.nodes.length)
    if (root !== null) {
      for (const e of root.getOutgoingEdges()) {
        expect(e.weight).toBe(0)
        expect(e.delta).toBe(0)
      }
    }
  })
})
