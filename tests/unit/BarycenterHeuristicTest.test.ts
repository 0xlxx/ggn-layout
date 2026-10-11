/**
 * 移植自 ELK Java: p3order/BarycenterHeuristicTest.java (全部 7 方法)
 */
import { describe, expect, it } from 'vitest'
import { LNode, PortSide, PortType, NodeType } from '../../src/index.js'
import { NodeRelativePortDistributor } from '../../src/p3order/port-distributors.js'
import { ForsterConstraintResolver } from '../../src/p3order/forster-constraint-resolver.js'
import { BarycenterHeuristic, BarycenterState } from '../../src/p3order/barycenter-heuristic.js'
import { initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'
import { MockRandom } from './helpers/MockRandom.js'

function getArrayInIndexOrder(arr: LNode[], ...idx: number[]): LNode[] {
  return idx.map(i => arr[i]!)
}

describe('BarycenterHeuristic (ELK Java 移植)', () => {
  function setup(nodes: LNode[][]) {
    const portDist = new NodeRelativePortDistributor(nodes.length)
    const cr = new ForsterConstraintResolver(nodes)
    initInitializables([portDist, cr], nodes)
    return { portDist, cr }
  }
  function makeCrossMin(cr: ForsterConstraintResolver, random: MockRandom, portDist: NodeRelativePortDistributor, nodes: LNode[][]) {
    const cm = new BarycenterHeuristic(cr, random as any, portDist, nodes)
    initInitializables([cm], nodes)
    return cm
  }
  function minimize(crossMin: BarycenterHeuristic, layer: LNode[], preOrdered: boolean, randomized: boolean, forward: boolean) {
    const list = [...layer]
    crossMin.minimizeLayer(list, preOrdered, randomized, forward)
    for (let i = 0; i < list.length; i++) layer[i] = list[i]!
  }

  it('minimizeCrossings_removesCrossingInSimpleCross', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[1]!, right[0]!)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup(nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const expected = tg.switchOrderInArray(0, 1, nodes[1]!)
    minimize(cm, nodes[1]!, false, false, true)
    expect(nodes[1]).toEqual(expected)
  })

  it('mockRandomizeFirstLayer', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[1]!, right[0]!)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup(nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const expectedOrder = [...nodes[0]!]
    const expectedSwitched = tg.switchOrderInArray(0, 1, nodes[0]!)
    minimize(cm, nodes[0]!, false, true, true)
    expect(nodes[0]).toEqual(expectedOrder)
    tg.randomMock.setChangeBy(-0.01)
    minimize(cm, nodes[0]!, false, true, true)
    expect(nodes[0]).toEqual(expectedSwitched)
  })

  it('fillingInUnknownBarycenters', () => {
    const tg = new TestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const middle = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(middle[0]!, right[1]!)
    tg.eastWestEdgeFromTo(middle[1]!, right[0]!)
    tg.eastWestEdgeFromTo(leftNode, middle[1]!)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const expectedSwitched = tg.switchOrderInArray(0, 1, nodes[2]!)
    const expectedOrderSecondLayer = [...nodes[1]!]
    const { portDist, cr } = setup(nodes)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    minimize(cm, nodes[0]!, false, true, true)
    portDist.calculatePortRanksForLayer(nodes[1]!, PortType.OUTPUT)
    minimize(cm, nodes[1]!, false, false, true)
    expect(nodes[1]).toEqual(expectedOrderSecondLayer)
    minimize(cm, nodes[2]!, false, false, true)
    expect(nodes[2]).toEqual(expectedSwitched)
  })

  it('assumingFixedPortOrder_givenSimplePortOrderCross_removesCrossingIndependentOfRandom', () => {
    const tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer(); const rightLayer = tg.makeLayer()
    const leftNode = tg.addNodeToLayer(leftLayer)
    const rightTop = tg.addNodeToLayer(rightLayer); const rightBottom = tg.addNodeToLayer(rightLayer)
    tg.eastWestEdgeFromTo(leftNode, rightBottom)
    tg.eastWestEdgeFromTo(leftNode, rightTop)
    tg.setFixedOrderConstraint(leftNode)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup(nodes)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const expected = [...nodes[1]!]
    minimize(cm, nodes[1]!, false, false, true)
    expect(nodes[1]).toEqual(expected)
  })

  it('assumingFixedPortOrder_givenSimplePortOrderCross_removesCrossingBackwards', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, rightNode)
    tg.eastWestEdgeFromTo(left[1]!, rightNode)
    tg.setFixedOrderConstraint(rightNode)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup(nodes)
    portDist.calculatePortRanksForLayer(nodes[1]!, PortType.INPUT)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const expected = tg.switchOrderInArray(0, 1, nodes[0]!)
    minimize(cm, nodes[0]!, false, false, false)
    expect(nodes[0]).toEqual(expected)
  })

  it('inLayerEdges', () => {
    const tg = new TestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const right = tg.addNodesToLayer(3, tg.makeLayer())
    tg.setFixedOrderConstraint(right[0]!)
    tg.eastWestEdgeFromTo(leftNode, right[0]!)
    tg.addInLayerEdge(right[0]!, right[2]!, PortSide.WEST)
    tg.eastWestEdgeFromTo(leftNode, right[1]!)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup(nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.INPUT)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const expected = getArrayInIndexOrder(nodes[1]!, 2, 0, 1)
    minimize(cm, nodes[1]!, false, false, true)
    expect(nodes[1]).toEqual(expected)
  })

  it('northSouthEdges', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(1, tg.makeLayer())
    const middle = tg.addNodesToLayer(4, tg.makeLayer())
    const right = tg.addNodesToLayer(3, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, middle[2]!)
    tg.eastWestEdgeFromTo(middle[2]!, right[2]!)
    tg.setAsLongEdgeDummy(middle[2]!)
    tg.addNorthSouthEdge(PortSide.NORTH, middle[3]!, middle[0]!, right[0]!, false)
    tg.addNorthSouthEdge(PortSide.NORTH, middle[3]!, middle[1]!, right[1]!, false)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup(nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.INPUT)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const expected = getArrayInIndexOrder(nodes[1]!, 1, 0, 3, 2)
    tg.randomMock.setChangeBy(-0.01)
    minimize(cm, nodes[1]!, false, false, true)
    expect(nodes[1]).toEqual(expected)
  })
})

/**
 * 性质/随机属性测试 (writer C): 固定种子 JavaRandom, 断言不变量而非具体坐标.
 *   - 层内排序确定 (同种子两次结果一致)
 *   - 排列守恒 (不丢/不重节点)
 *   - barycenter = (Σ portRank + 扰动) / degree, 扰动 ∈ [-RANDOM_AMOUNT/2, +RANDOM_AMOUNT/2]
 *   - 平局 (barycenter 相等) 时比较器返回 0 → 稳定排序保持相对顺序 (ELK List.sort 稳定)
 */
import { JavaRandom } from '../../src/util/java-random.js'
import { randomLayeredGraph, addPortOnSide, addEdgeBetweenPorts, indexPortIds, setUpLayerNodeIds } from './helpers/PropertyTestGraphs.js'

declare const process: { env: Record<string, string | undefined> }
describe('BarycenterHeuristic 性质/随机属性测试', () => {
  /** 构造「层 1 每个节点都有入边」的随机图 (避免 unknown barycenter 干扰公式不变式). */
  function makeBarycenterFriendlyGraph(seed: number): { layers: LNode[][]; portDist: NodeRelativePortDistributor; cr: ForsterConstraintResolver } {
    const r = new JavaRandom(seed)
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
    // 确保层 1 每个节点至少 1 条入边 (层 0→1)
    for (const right of layers[1]!) {
      const k = 1 + r.nextInt(2)
      for (let e = 0; e < k; e++) {
        const left = layers[0]![r.nextInt(4)]!
        addEdgeBetweenPorts(addPortOnSide(left, PortSide.EAST), addPortOnSide(right, PortSide.WEST))
      }
    }
    // 层 1→2
    for (const left of layers[1]!) {
      const k = 1 + r.nextInt(2)
      for (let e = 0; e < k; e++) {
        const right = layers[2]![r.nextInt(4)]!
        addEdgeBetweenPorts(addPortOnSide(left, PortSide.EAST), addPortOnSide(right, PortSide.WEST))
      }
    }
    setUpLayerNodeIds(graph)
    indexPortIds(graph)
    const nodes = graph.toNodeArray()
    const portDist = new NodeRelativePortDistributor(nodes.length)
    const cr = new ForsterConstraintResolver(nodes)
    initInitializables([portDist, cr], nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    return { layers, portDist, cr }
  }

  it.each([1, 2, 3, 4, 5])('seed=%i: 固定种子确定性 + 排列守恒 + barycenter 公式', (seed) => {
    const { layers, portDist, cr } = makeBarycenterFriendlyGraph(seed)
    const nodes = layers
    const cm1 = new BarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, nodes)
    initInitializables([cm1], nodes)
    const list1 = [...nodes[1]!]
    cm1.minimizeLayer(list1, false, false, true)

    const cm2 = new BarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, nodes)
    initInitializables([cm2], nodes)
    const list2 = [...nodes[1]!]
    cm2.minimizeLayer(list2, false, false, true)

    // 确定性
    expect(list2.map(n => n.id)).toEqual(list1.map(n => n.id))
    // 排列守恒
    expect([...list1].sort((a, b) => a.id - b.id).map(n => n.id))
      .toEqual([...nodes[1]!].sort((a, b) => a.id - b.id).map(n => n.id))

    // 公式: barycenter = (S + pert*0.07 - 0.035)/degree, |barycenter - S/d| ≤ 0.035
    const ranks = portDist.getPortRanks()
    for (const node of list1) {
      const st = (cm1 as any).stateOf(node)
      expect(st.degree).toBeGreaterThan(0)
      let S = 0
      for (const port of node.getPorts()) {
        for (const e of port.getIncomingEdges()) {
          const src = e.getSource()!
          if (src.getNode()!.getLayer() !== node.getLayer()) S += ranks[src.id]
        }
      }
      expect(Math.abs(st.barycenter - S / st.degree)).toBeLessThanOrEqual(0.035 + 1e-9)
    }
  })

  it('平局处理确定: barycenter 相等的两节点比较器返回 0 (稳定排序)', () => {
    const seed = 1
    const { layers, portDist, cr } = makeBarycenterFriendlyGraph(seed)
    const cm = new BarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, layers)
    initInitializables([cm], layers)
    const comparator = (cm as any).barycenterStateComparator
    const [a, b] = layers[1]!
    // 手工把两节点 state 的 barycenter 设为相同值
    const sa = (cm as any).stateOf(a)
    const sb = (cm as any).stateOf(b)
    sa.barycenter = 5
    sb.barycenter = 5
    expect(comparator(a, b)).toBe(0)
    expect(comparator(b, a)).toBe(0)
    // null 排序: 有 barycenter 的节点排在 null 之前
    sa.barycenter = null
    sb.barycenter = 5
    expect(comparator(a, b)).toBe(1)
    expect(comparator(b, a)).toBe(-1)
    // 双 null → 0
    sb.barycenter = null
    expect(comparator(a, b)).toBe(0)
  })

  it('minimizeLayer 空层/单节点不崩溃且保序', () => {
    const seed = 2
    const { layers, portDist, cr } = makeBarycenterFriendlyGraph(seed)
    const cm = new BarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, layers)
    initInitializables([cm], layers)
    const single = [layers[1]![0]!]
    const before = [...single]
    cm.minimizeLayer(single, false, false, true)
    expect(single).toEqual(before)
  })

  it('平局走 JavaRandom: 无连接节点 (barycenter null) 非预排序填充确定且随种子变化', () => {
    // 层 1 两个节点无任何边 → degree=0 → barycenter null → fillInUnknownBarycenters
    // (preOrdered=false) 用 JavaRandom.nextFloat() * maxBary - 1 填充, 值 ∈ [-1, 1).
    const run = (seed: number): { order: number[]; values: number[] } => {
      const { graph } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 2 })
      const layers = graph.toNodeArray()
      const { portDist, cr } = (() => {
        const pd = new NodeRelativePortDistributor(layers.length)
        const c = new ForsterConstraintResolver(layers)
        initInitializables([pd, c], layers)
        return { portDist: pd, cr: c }
      })()
      const cm = new BarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, layers)
      initInitializables([cm], layers)
      const list = [...layers[1]!]
      cm.minimizeLayer(list, false, false, true)
      return {
        order: list.map(n => n.id),
        values: list.map(n => (cm as any).stateOf(n).barycenter),
      }
    }
    const a = run(101)
    const b = run(101)
    // 同种子两次结果一致 (JavaRandom 序列确定).
    expect(a.order).toEqual(b.order)
    expect(a.values).toEqual(b.values)
    // 填充值 ∈ [-1, 1) (maxBary = 0 + 2).
    for (const v of a.values) {
      expect(v).toBeGreaterThanOrEqual(-1)
      expect(v).toBeLessThan(1)
    }
    // 不同种子大概率给出不同序 (随机填充决定平局).
    const c = run(202)
    expect(a.values.some((v, i) => v !== c.values[i])).toBe(true)
  })

  it('minimizeCrossings 全链路: 固定种子确定性 + 排列守恒 (setFirstLayerOrder + 逐层 sweep)', () => {
    // 每次运行重建图: AbstractBarycenterPortDistributor.initAtNodeLevel 按层内位置重写
    // node.id, 复用同一图会让第二次运行的 id 分配与第一次不同 (ELK 语义: id 是层内索引).
    const run = (seed: number): number[][] => {
      const { graph } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
      const order = graph.toNodeArray()
      const { portDist, cr } = (() => {
        const pd = new NodeRelativePortDistributor(order.length)
        const c = new ForsterConstraintResolver(order)
        initInitializables([pd, c], order)
        return { portDist: pd, cr: c }
      })()
      const cm = new BarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, order)
      initInitializables([cm], order)
      const before = order.map(layer => layer.map(n => n.id).sort((x, y) => x - y))
      cm.setFirstLayerOrder(order, true)
      cm.minimizeCrossings(order, 1, true, false)
      cm.minimizeCrossings(order, 2, true, false)
      const ids = order.map(layer => layer.map(n => n.id))
      // 排列守恒.
      for (let l = 0; l < order.length; l++) {
        expect(ids[l]!.slice().sort((x, y) => x - y)).toEqual(before[l])
      }
      return ids
    }
    const seed = 7
    // 同种子两次结果一致 (确定性).
    expect(run(seed)).toEqual(run(seed))
    expect(run(8)).not.toEqual(run(7))
  })
})

// ============================================================================
// M7 变异补测: fillInUnknownBarycenters 插值 / 同层递归 / 关联节点
// ============================================================================

describe('BarycenterHeuristic 补充分支 (M7 变异补测)', () => {
  function setup2(nodes: LNode[][]) {
    const portDist = new NodeRelativePortDistributor(nodes.length)
    const cr = new ForsterConstraintResolver(nodes)
    initInitializables([portDist, cr], nodes)
    return { portDist, cr }
  }
  function makeCrossMin(cr: ForsterConstraintResolver, random: MockRandom, portDist: NodeRelativePortDistributor, nodes: LNode[][]) {
    const cm = new BarycenterHeuristic(cr, random as any, portDist, nodes)
    initInitializables([cm], nodes)
    return cm
  }

  it('preOrdered 插值: 首节点 (lastValue=-1) 与中间空洞的插值', () => {
    const tg = new TestGraphCreator()
    const layer = tg.addNodesToLayer(4, tg.makeLayer())
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup2(nodes)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const states = (cm as any).barycenterState as BarycenterState[][]
    // 手动设 barycenter: [null, 5, null, null] → preOrdered 插值 (直接调 protected 方法)
    states[0]![0]!.barycenter = null
    states[0]![1]!.barycenter = 5
    states[0]![2]!.barycenter = null
    states[0]![3]!.barycenter = null
    ;(cm as any).fillInUnknownBarycenters(nodes[0]!, true)
    // 插值: n0 = (-1+5)/2 = 2, n2 = (5+6)/2 = 5.5, n3 = (5.5+6.5)/2 = 6
    expect(states[0]![0]!.barycenter).toBeCloseTo(2)
    expect(states[0]![2]!.barycenter).toBeCloseTo(5.5)
    expect(states[0]![3]!.barycenter).toBeCloseTo(6)
  })

  it('非 preOrdered: null barycenter 用随机值填充且排序稳定', () => {
    const tg = new TestGraphCreator()
    const layer = tg.addNodesToLayer(3, tg.makeLayer())
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup2(nodes)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    const states = (cm as any).barycenterState as BarycenterState[][]
    states[0]![0]!.barycenter = 10
    states[0]![1]!.barycenter = null
    states[0]![2]!.barycenter = null
    ;(cm as any).fillInUnknownBarycenters(nodes[0]!, false)
    // maxBary = 10 + 2 = 12; MockRandom 首次 nextFloat = 0.02 (累加后返回)
    // → 0.02*12-1 = -0.76, 0.03*12-1 = -0.64
    expect(states[0]![1]!.barycenter).toBeCloseTo(-0.76)
    expect(states[0]![2]!.barycenter).toBeCloseTo(-0.64)
  })

  it('同层递归: 有层内边的节点递归计算 barycenter', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    tg.addInLayerEdge(right[0]!, right[1]!, PortSide.WEST)
    // 层序 [right[1], right[0]]: 递归先处理 right[1] → 未访问的 right[0] 才被计入
    const l1 = tg.getGraph().getLayers()[1]!
    const ns = l1.getNodes()
    ;[ns[0]!, ns[1]!] = [ns[1]!, ns[0]!]
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup2(nodes)
    const cm = makeCrossMin(cr, tg.randomMock, portDist, nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    const layer = [...nodes[1]!]
    cm.minimizeLayer(layer, false, false, true)
    // 同层递归路径执行: 不抛异常且保持 2 节点; degree 非负
    const states = (cm as any).barycenterState as BarycenterState[][]
    expect(states[0]![0]!.degree).toBeGreaterThanOrEqual(0)
    expect(states[0]![1]!.degree).toBeGreaterThanOrEqual(0)
    expect(layer.length).toBe(2)
  })
})

// ============================================================================
// X1 续接: alwaysImproves/isDeterministic 直调 + GGN_P3_DBG NS dummy 标签
// ============================================================================

describe('BarycenterHeuristic 续接补测 (X1)', () => {
  function setup3(nodes: LNode[][]) {
    const portDist = new NodeRelativePortDistributor(nodes.length)
    const cr = new ForsterConstraintResolver(nodes)
    initInitializables([portDist, cr], nodes)
    return { portDist, cr }
  }
  function makeCrossMin3(cr: ForsterConstraintResolver, random: MockRandom, portDist: NodeRelativePortDistributor, nodes: LNode[][]) {
    const cm = new BarycenterHeuristic(cr, random as any, portDist, nodes)
    initInitializables([cm], nodes)
    return cm
  }

  it('alwaysImproves/isDeterministic 返回 false (Barycenter 非确定/非单调改进)', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[1]!, right[0]!)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup3(nodes)
    const cm = makeCrossMin3(cr, tg.randomMock, portDist, nodes)
    expect(cm.alwaysImproves()).toBe(false)
    expect(cm.isDeterministic()).toBe(false)
  })

  it('GGN_P3_DBG: NS dummy 带标签输出 dA (idOf 标签分支)', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const l1 = tg.makeLayer()
    const d0 = tg.addNodeToLayer(l0)
    d0.setType(NodeType.NORTH_SOUTH_PORT)
    const n1 = tg.addNodeToLayer(l0)
    const n2 = tg.addNodeToLayer(l1)
    n2.setLabels([{ text: 'A', position: { x: 0, y: 0 }, size: { x: 0, y: 0 } }])
    tg.addEdgeBetweenPorts(tg.addPortOnSide(d0, PortSide.WEST), tg.addPortOnSide(n2, PortSide.WEST))
    tg.eastWestEdgeFromTo(n1, n2)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const random = tg.randomMock as any
    random.setChangeBy(0)
    const { portDist, cr } = setup3(nodes)
    const cm = makeCrossMin3(cr, random, portDist, nodes)
    const origErr = console.error
    const calls: string[] = []
    console.error = (...args: unknown[]) => { calls.push(args.map(String).join(' ')) }
    try {
      process.env.GGN_P3_DBG = '1'
      cm.minimizeLayer([...nodes[0]!], false, true, true)
      expect(calls).toEqual(['GGN BARY layer=0 fwd=true preOrdered=false randomize=true after=[dA(0.0100) 1(0.0100)]'])
    } finally {
      console.error = origErr
      delete process.env.GGN_P3_DBG
    }
  })
})
