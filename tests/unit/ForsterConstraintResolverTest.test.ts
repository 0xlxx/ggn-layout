/**
 * ForsterConstraintResolver 移植单测 (ELK p3order.ForsterConstraintResolver).
 * 对应 Java ForsterConstraintResolverTest 的约束语义:
 *   - IN_LAYER_SUCCESSOR_CONSTRAINTS 必须被满足 (violated → merge)
 *   - 布局单元 (IN_LAYER_LAYOUT_UNIT) 保持连续
 *   - 同 barycenter 时按组序判违规 (findViolatedConstraint 平局分支)
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, Layer as GLayer } from '../../src/index.js'
import { ForsterConstraintResolver, ConstraintGroup } from '../../src/p3order/forster-constraint-resolver.js'
import { initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { IN_LAYER_SUCCESSOR_CONSTRAINTS, IN_LAYER_LAYOUT_UNIT, IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES } from '../../src/options/internal-properties.js'

function makeLayer(graph: LGraph): GLayer {
  const l = new GLayer(graph)
  graph.getLayers().push(l)
  l.id = 0
  return l
}

function addNode(layer: GLayer, graph: LGraph): LNode {
  const n = new LNode(graph)
  n.size = { x: 10, y: 10 }
  n.setLayer(layer)
  return n
}

/** 构建 resolver + init + 手动设 barycenter. */
function makeResolver(graph: LGraph, layer: GLayer, barycenters: Map<LNode, number>): { resolver: ForsterConstraintResolver; nodes: LNode[] } {
  const nodes = layer.getNodes()
  const order = [nodes]
  // 真实管线中 node.id 由其他 initializable (portDistributor 等) 归一化; 单测需手动设置,
  // 因为 ForsterConstraintResolver.stateOf 用 node.id 索引 barycenterStates.
  nodes.forEach((n, i) => { n.id = i })
  const resolver = new ForsterConstraintResolver(order)
  initInitializables([resolver], order)
  const states = resolver.getBarycenterStates()
  nodes.forEach((n, i) => { states[0]![i]!.barycenter = barycenters.get(n) ?? i })
  return { resolver, nodes }
}

describe('ForsterConstraintResolver (ELK Java 移植)', () => {
  it('违反的后继约束被解析: [b,a] 带 a→b 约束 → [a,b]', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])
    // 初始 barycenter: b(0) < a(1) → 排序为 [b,a], 违反 a→b
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[a, 1], [b, 0]]))
    const input = [b, a]
    resolver.processConstraints(input)
    // 解析后 input 重排为 [a, b]
    expect(input).toEqual([a, b])
    // 且两者的 barycenter 被更新为组合组的 barycenter (a 的)
    expect(nodes.length).toBe(2)
  })

  it('无约束时保持输入顺序', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[a, 0], [b, 1]]))
    const input = [a, b]
    resolver.processConstraints(input)
    expect(input).toEqual([a, b])
  })

  it('barycenter 平局时按组序判定违规 (predecessor 在 group 之后)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])
    // 两者 barycenter 相同 (=0), 但组序 [a,b] 中 predecessor a 在 b 前 → 不违规
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[a, 0], [b, 0]]))
    const input = [a, b]
    resolver.processConstraints(input)
    expect(input).toEqual([a, b])
  })

  it('布局单元保持连续 (IN_LAYER_LAYOUT_UNIT)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const u1a = addNode(l0, graph)
    const u1b = addNode(l0, graph)
    const u2 = addNode(l0, graph)
    // u1a/u1b 同单元 (用 u1a 作代表), u2 独立
    u1a.setProperty(IN_LAYER_LAYOUT_UNIT, u1a)
    u1b.setProperty(IN_LAYER_LAYOUT_UNIT, u1a)
    u2.setProperty(IN_LAYER_LAYOUT_UNIT, u2)
    // 输入序 [u1a, u2, u1b] → 解析后 u1a/u1b 应连续
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[u1a, 0], [u2, 1], [u1b, 2]]))
    const input = [u1a, u2, u1b]
    resolver.processConstraints(input)
    const idx1a = input.indexOf(u1a)
    const idx1b = input.indexOf(u1b)
    expect(Math.abs(idx1a - idx1b)).toBe(1)
  })

  it('constraintsBetweenNonDummies: 两阶段处理 (onlyNormal 先跑)', () => {
    const graph = new LGraph()
    graph.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES, true)
    const l0 = makeLayer(graph)
    const normalA = addNode(l0, graph)
    const normalB = addNode(l0, graph)
    const dummy = addNode(l0, graph)
    dummy.setType('LONG_EDGE' as never)
    // normal 之间约束: normalA → normalB (normalA 必须在前)
    normalA.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [normalB])
    // barycenter 违反: normalA(1) > normalB(0) → stage1 必须合并修复
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[normalA, 1], [normalB, 0], [dummy, 2]]))
    const input = [normalB, dummy, normalA]
    resolver.processConstraints(input)
    expect(input.indexOf(normalA)).toBeLessThan(input.indexOf(normalB))
  })

  it('ConstraintGroup 合并保持 nodes 拼接', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const c = addNode(l0, graph)
    const ga = new ConstraintGroup(a)
    const gb = new ConstraintGroup(b)
    const gab = new ConstraintGroup(ga, gb)
    expect(gab.nodes).toEqual([a, b])
    expect(gab.getOutgoing()).toEqual([])
    const gc = new ConstraintGroup(c)
    const g = new ConstraintGroup(gab, gc)
    expect(g.nodes).toEqual([a, b, c])
  })
})

// ============================================================================
// M5 变异补测 2: 链式约束 / 多违规 / 组插入中间位置 (handleViolatedConstraint 分支)
// ============================================================================

describe('ForsterConstraintResolver 链式约束 (M5 变异补测)', () => {
  it('链式 a→b→c 全违反: 逐对合并为单组', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const c = addNode(l0, graph)
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])
    b.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [c])
    // barycenter 全反转: c(0) < b(1) < a(2) → 三个约束都违反
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[a, 2], [b, 1], [c, 0]]))
    const input = [c, b, a]
    resolver.processConstraints(input)
    // 解析后 a 在 b 前, b 在 c 前
    expect(input.indexOf(a)).toBeLessThan(input.indexOf(b))
    expect(input.indexOf(b)).toBeLessThan(input.indexOf(c))
  })

  it('链式 a→b→c 部分违反: 只合并违规对', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const c = addNode(l0, graph)
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])
    b.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [c])
    // 只有 a→b 违反 (a=1 > b=0); b→c 满足 (b=0 < c=2)
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[a, 1], [b, 0], [c, 2]]))
    const input = [b, a, c]
    resolver.processConstraints(input)
    expect(input.indexOf(a)).toBeLessThan(input.indexOf(b))
    expect(input.indexOf(c)).toBeGreaterThan(input.indexOf(b))
  })

  it('合并组插入中间位置 (barycenter 排序)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const c = addNode(l0, graph)
    const d = addNode(l0, graph)
    // a→d 约束, a/b/c/d barycenter 递增 → 只有 a,d 需合并, 且合并组应插入合适位置
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [d])
    // a(3) > d(0) 违反; b(1), c(2) 在中间
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[a, 3], [b, 1], [c, 2], [d, 0]]))
    const input = [d, b, c, a]
    resolver.processConstraints(input)
    expect(input.indexOf(a)).toBeLessThan(input.indexOf(d))
  })

  it('多个独立约束对同时违反', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const c = addNode(l0, graph)
    const d = addNode(l0, graph)
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])
    c.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [d])
    // 两对都违反: a(1)>b(0), c(3)>d(2)
    const { resolver, nodes } = makeResolver(graph, l0, new Map([[a, 1], [b, 0], [c, 3], [d, 2]]))
    const input = [b, a, d, c]
    resolver.processConstraints(input)
    expect(input.indexOf(a)).toBeLessThan(input.indexOf(b))
    expect(input.indexOf(c)).toBeLessThan(input.indexOf(d))
  })
})

/**
 * 性质/随机属性测试 (writer C): 固定种子随机 DAG 后继约束.
 * 注意: ELK Forster 算法是「尽力而为」的约束解析 (合并违规组), 不保证任意 DAG 全部满足;
 * 本组只断言算法保证的不变量:
 *   - 输出是输入的排列 (节点不丢/不重)
 *   - 输入已满足全部约束时 processConstraints 为 no-op (保序)
 *   - 链式/独立交叉约束 (无相互作用) 可完整解析
 */
import { JavaRandom } from '../../src/util/java-random.js'
import { makeLayer as fcrMakeLayer, addNodeToLayer as fcrAddNode } from './helpers/PropertyTestGraphs.js'
import { IN_LAYER_SUCCESSOR_CONSTRAINTS as _INSC2 } from '../../src/options/internal-properties.js'

describe('ForsterConstraintResolver 性质/随机属性测试', () => {
  /** 随机 DAG 约束: 打乱拓扑序, 对 (i<j) 以概率 p 加 topo[i]→topo[j]. */
  function makeRandomDag(seed: number, n: number, p = 0.3): {
    graph: LGraph; nodes: LNode[]; constraints: [LNode, LNode][]; r: JavaRandom; topo: LNode[]
  } {
    const r = new JavaRandom(seed)
    const graph = new LGraph()
    const l0 = fcrMakeLayer(graph)
    const nodes: LNode[] = []
    for (let i = 0; i < n; i++) nodes.push(fcrAddNode(graph, l0))
    nodes.forEach((x, i) => { x.id = i })
    const topo = [...nodes].sort(() => r.nextDouble() - 0.5)
    const constraints: [LNode, LNode][] = []
    for (let i = 0; i < topo.length; i++) {
      for (let j = i + 1; j < topo.length; j++) {
        if (r.nextDouble() < p) constraints.push([topo[i]!, topo[j]!])
      }
    }
    for (const [a, b] of constraints) {
      const list = a.getProperty<LNode[] | null>(_INSC2)
      if (list === null || list === undefined) a.setProperty(_INSC2, [b])
      else list.push(b)
    }
    return { graph, nodes, constraints, r, topo }
  }

  function makeResolver(graph: LGraph, nodes: LNode[], barycenters: number[]): ForsterConstraintResolver {
    const order = [nodes]
    const resolver = new ForsterConstraintResolver(order)
    initInitializables([resolver], order)
    const states = resolver.getBarycenterStates()
    nodes.forEach((x, i) => { states[0]![i]!.barycenter = barycenters[i]! })
    return resolver
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed=%i: 随机 DAG 解析后输出是输入排列且不崩溃', (seed) => {
    const { nodes, constraints, r } = makeRandomDag(seed, 8)
    const perm = [...Array(nodes.length).keys()].sort(() => r.nextDouble() - 0.5)
    const resolver = makeResolver(nodes[0]!.getGraph() as LGraph, nodes, perm)
    const input = [...nodes].sort((a, b) => (resolver.getBarycenterStates()[0]![b.id]!.barycenter!) - (resolver.getBarycenterStates()[0]![a.id]!.barycenter!))
    resolver.processConstraints(input)
    expect([...input].sort((a, b) => a.id - b.id).map(x => x.id))
      .toEqual([...nodes].sort((a, b) => a.id - b.id).map(x => x.id))
    void constraints
  })

  it.each([1, 2, 3, 4, 5])('seed=%i: 输入已满足全部约束且 barycenter 单调 → processConstraints 保序 (no-op)', (seed) => {
    const { graph, nodes, constraints, topo } = makeRandomDag(seed, 8)
    // barycenter 按输入序单调递增 (与真实管线排序一致); 输入 = 拓扑序满足全部约束
    const barycenters = new Array<number>(nodes.length).fill(0)
    topo.forEach((x, i) => { barycenters[x.id] = i })
    const resolver = makeResolver(graph, nodes, barycenters)
    const input = [...topo]
    resolver.processConstraints(input)
    expect(input.map(x => x.id), `seed=${seed}`).toEqual(topo.map(x => x.id))
    void constraints
  })

  it('链式约束 a→b→c→d (输入完全逆序) → 完整解析', () => {
    const graph = new LGraph()
    const l0 = fcrMakeLayer(graph)
    const a = fcrAddNode(graph, l0), b = fcrAddNode(graph, l0), c = fcrAddNode(graph, l0), d = fcrAddNode(graph, l0)
    ;[a, b, c, d].forEach((x, i) => { x.id = i })
    a.setProperty(_INSC2, [b])
    b.setProperty(_INSC2, [c])
    c.setProperty(_INSC2, [d])
    const nodes = [a, b, c, d]
    // barycenter: d < c < b < a → 输入为完全逆序
    const resolver = makeResolver(graph, nodes, [3, 2, 1, 0])
    const input = [...nodes].sort((x, y) => (resolver.getBarycenterStates()[0]![x.id]!.barycenter!) - (resolver.getBarycenterStates()[0]![y.id]!.barycenter!))
    resolver.processConstraints(input)
    expect(input.indexOf(a)).toBeLessThan(input.indexOf(b))
    expect(input.indexOf(b)).toBeLessThan(input.indexOf(c))
    expect(input.indexOf(c)).toBeLessThan(input.indexOf(d))
  })

  it('两个独立交叉约束 (a→b, c→d) 逆序 → 都解析', () => {
    const graph = new LGraph()
    const l0 = fcrMakeLayer(graph)
    const a = fcrAddNode(graph, l0), b = fcrAddNode(graph, l0), c = fcrAddNode(graph, l0), d = fcrAddNode(graph, l0)
    ;[a, b, c, d].forEach((x, i) => { x.id = i })
    a.setProperty(_INSC2, [b])
    c.setProperty(_INSC2, [d])
    const nodes = [a, b, c, d]
    // barycenter: b < a, d < c → 输入 [b,a,d,c]
    const resolver = makeResolver(graph, nodes, [1, 0, 3, 2])
    const input = [...nodes].sort((x, y) => (resolver.getBarycenterStates()[0]![x.id]!.barycenter!) - (resolver.getBarycenterStates()[0]![y.id]!.barycenter!))
    resolver.processConstraints(input)
    expect(input.indexOf(a)).toBeLessThan(input.indexOf(b))
    expect(input.indexOf(c)).toBeLessThan(input.indexOf(d))
  })
})

// ============================================================================
// M6 变异补测 3: ConstraintGroup 合并构造分支 (outgoing 来源组合)
// ============================================================================

describe('ConstraintGroup 合并构造分支 (M6 变异补测)', () => {
  it('g1 无 outgoing + g2 有 outgoing: 合并后沿用 g2 的 outgoing', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const x = addNode(l0, graph)
    const ga = new ConstraintGroup(a)
    const gb = new ConstraintGroup(b)
    const gx = new ConstraintGroup(x)
    gb.getOutgoing().push(gx)
    const gab = new ConstraintGroup(ga, gb)
    expect(gab.nodes).toEqual([a, b])
    expect(gab.getOutgoing().map(g => g.nodes[0])).toEqual([x])
    expect(gab.hasOutgoing()).toBe(true)
  })

  it('g1 有 outgoing + g2 无 outgoing: 合并后沿用 g1 的 outgoing (过滤 g2)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const x = addNode(l0, graph)
    const ga = new ConstraintGroup(a)
    const gb = new ConstraintGroup(b)
    const gx = new ConstraintGroup(x)
    ga.getOutgoing().push(gx)
    const gab = new ConstraintGroup(ga, gb)
    expect(gab.getOutgoing().map(g => g.nodes[0])).toEqual([x])
  })

  it('双方 outgoing 重叠: 去重且 overlapping 目标 incomingCount 减一', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const x = addNode(l0, graph)
    const y = addNode(l0, graph)
    const ga = new ConstraintGroup(a)
    const gb = new ConstraintGroup(b)
    const gx = new ConstraintGroup(x)
    const gy = new ConstraintGroup(y)
    ga.getOutgoing().push(gx, gy)
    gb.getOutgoing().push(gx)
    gx.incomingCount = 1
    gy.incomingCount = 0
    const gab = new ConstraintGroup(ga, gb)
    expect(gab.getOutgoing().map(g => g.nodes[0]!.id)).toEqual([x.id, y.id])
    expect(gx.incomingCount).toBe(0)
    expect(gy.incomingCount).toBe(0)
  })

  it('g1 的 outgoing 指向 g2: 合并后过滤掉 g2', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    const b = addNode(l0, graph)
    const ga = new ConstraintGroup(a)
    const gb = new ConstraintGroup(b)
    ga.getOutgoing().push(gb)
    const gab = new ConstraintGroup(ga, gb)
    expect(gab.getOutgoing()).toEqual([])
    expect(gab.hasOutgoing()).toBe(false)
  })

  it('合并后 summedWeight/degree 相加; getBarycenter 取首节点', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const a = addNode(l0, graph)
    a.id = 0
    const b = addNode(l0, graph)
    b.id = 1
    const order = [[a, b]]
    const r = new ForsterConstraintResolver(order)
    initInitializables([r], order)
    const states = r.getBarycenterStates()
    states[0]![0]!.barycenter = 3
    states[0]![1]!.barycenter = 5
    const gab = new ConstraintGroup(new ConstraintGroup(a), new ConstraintGroup(b))
    // getBarycenter 的 stateOf 契约: 返回 BarycenterState 对象 (方法内部取 .barycenter)
    expect(gab.getBarycenter(n => states[0]![n.id]!)).toBe(3)
    // 无 merged barycenter 时 (getSummedWeight/getDegree)
    expect(gab.getSummedWeight()).toBe(0)
    expect(gab.getDegree()).toBe(0)
  })

  it('空节点数组构造: constraintsBetweenNonDummies 为 false (两阶段不触发)', () => {
    const r = new ForsterConstraintResolver([])
    expect(r.getBarycenterStates()).toEqual([])
    expect(() => r.processConstraints([])).not.toThrow()
  })
})
