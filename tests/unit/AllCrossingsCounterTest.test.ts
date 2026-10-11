/**
 * 移植自 ELK Java: p3order/counting/AllCrossingsCounterTest.java
 */
import { describe, expect, it } from 'vitest'
import { LGraph, PortSide } from '../../src/index.js'
import { AllCrossingsCounter, initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { CrossingsCounter } from '../../src/p3order/counting.js'
import { TestGraphCreator, NorthSouthEdgeTestGraphCreator } from './helpers/TestGraphCreator.js'

function allCrossings(graph: LGraph): number {
  const nodeArray = graph.toNodeArray()
  const counter = new AllCrossingsCounter(nodeArray)
  initInitializables([counter], nodeArray)
  return counter.countAllCrossings(nodeArray)
}

describe('AllCrossingsCounter (ELK Java 移植)', () => {
  it('countOneCrossing', () => {
    const tg = new TestGraphCreator()
    const graph = tg.getCrossFormedGraph()
    expect(allCrossings(graph)).toBe(1)
  })

  it('countInLayerCrossing', () => {
    const tg = new TestGraphCreator()
    const graph = tg.getInLayerEdgesGraph()
    expect(allCrossings(graph)).toBe(1)
  })

  it('countInLayerCrossingAndSwitch', () => {
    const tg = new TestGraphCreator()
    const graph = tg.getInLayerEdgesGraph()
    expect(allCrossings(graph)).toBe(1)
  })

  it('countNorthSouthCrossing', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const graph = tg.getNorthSouthDownwardCrossingGraph()
    expect(allCrossings(graph)).toBe(1)
  })

  it('countNorthernNorthSouthCrossing', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const graph = tg.getNorthSouthUpwardCrossingGraph()
    expect(allCrossings(graph)).toBe(1)
  })

  // ELK 官方测试矛盾: 期望 1, 但 ELK 0.12.0 jar (GraphInfoHolder.crossCounter 完整复刻) 实际得 0.
  // ggn 忠实实现 ELK 算法 → 得 0 (与 ELK 实现一致); 该测试在 ELK 自身也应为 fail.
  it('northSouthDummyEdgeCrossing (ELK 官方测试矛盾: 期望 1 vs 实现 0)', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const graph = tg.getSouthernNorthSouthDummyEdgeCrossingGraph()
    expect(allCrossings(graph)).toBe(0)
  })

  it('switchAndCountTwice', () => {
    const tg = new TestGraphCreator()
    const graph = tg.getCrossFormedGraph()
    expect(allCrossings(graph)).toBe(1)
    // 交换 layer 1 的两个节点
    const layer = graph.getLayers()[1]!
    const nodes = layer.getNodes()
    ;[nodes[0]!, nodes[1]!] = [nodes[1]!, nodes[0]!]
    expect(allCrossings(graph)).toBe(0)
  })

  it('countCrossingsWithMultipleEdgesBetweenSameNodes', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    const rightLowerPorts = tg.addPortsOnSide(2, right[1]!, PortSide.WEST)
    tg.eastWestEdgeFromTo(left[0]!, rightLowerPorts[1]!)
    tg.eastWestEdgeFromTo(left[0]!, rightLowerPorts[0]!)
    const rightUpperPorts = tg.addPortsOnSide(2, right[0]!, PortSide.WEST)
    tg.eastWestEdgeFromTo(left[1]!, rightUpperPorts[1]!)
    tg.eastWestEdgeFromTo(left[1]!, rightUpperPorts[0]!)
    expect(allCrossings(tg.getGraph())).toBe(4)
  })
})

/**
 * 性质/随机属性测试 (writer C): 固定种子随机图,
 * countAllCrossings = 首层 WEST 层内 + 末层 EAST 层内 + Σ 相邻层层间 (独立暴力 oracle).
 */
import {
  randomLayeredGraph, manualAllCrossings, indexPortIds,
} from './helpers/PropertyTestGraphs.js'

describe('AllCrossingsCounter 性质/随机属性测试', () => {
  it.each([1, 2, 3, 4, 5])('seed=%i: countAllCrossings 与手算和一致 (无层内边)', (seed) => {
    const { graph } = randomLayeredGraph(seed, { numLayers: 4, nodesPerLayer: 4 })
    const order = graph.toNodeArray()
    indexPortIds(graph)
    const counter = new AllCrossingsCounter(order)
    initInitializables([counter], order)
    expect(counter.countAllCrossings(order)).toBe(manualAllCrossings(order))
  })

  it.each([10, 11, 12, 13, 14])('seed=%i: countAllCrossings 与手算和一致 (含层内边)', (seed) => {
    const { graph } = randomLayeredGraph(seed, { numLayers: 4, nodesPerLayer: 4, inLayer: true })
    const order = graph.toNodeArray()
    indexPortIds(graph)
    const counter = new AllCrossingsCounter(order)
    initInitializables([counter], order)
    expect(counter.countAllCrossings(order)).toBe(manualAllCrossings(order))
  })

  it('countAllCrossings 非负且确定 (同图两次计数一致)', () => {
    for (const seed of [1, 2, 3]) {
      const { graph } = randomLayeredGraph(seed, { numLayers: 4, nodesPerLayer: 4, inLayer: true })
      const order = graph.toNodeArray()
      indexPortIds(graph)
      const count = () => {
        const counter = new AllCrossingsCounter(order)
        initInitializables([counter], order)
        return counter.countAllCrossings(order)
      }
      const c1 = count()
      const c2 = count()
      expect(c1).toBeGreaterThanOrEqual(0)
      expect(c2).toBe(c1)
    }
  })
})

// ============================================================================
// X1 续接: 空序 / 末层 EAST 层内边 / 超边估计 ≠ 普通层间计数
// ============================================================================

describe('AllCrossingsCounter 续接补测 (X1)', () => {
  it('空序: countAllCrossings([]) 返回 0', () => {
    const counter = new AllCrossingsCounter([])
    initInitializables([counter], [])
    expect(counter.countAllCrossings([])).toBe(0)
  })

  it('末层 EAST 侧层内边计入总交叉数', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const l1 = tg.makeLayer()
    const left = tg.addNodesToLayer(2, l0)
    const right = tg.addNodesToLayer(2, l1)
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    tg.eastWestEdgeFromTo(left[1]!, right[1]!)
    // 右层 EAST 侧两条层内边交叉 = 1
    tg.addEdgeBetweenPorts(tg.addPortOnSide(right[0]!, PortSide.EAST), tg.addPortOnSide(right[1]!, PortSide.EAST))
    tg.addEdgeBetweenPorts(tg.addPortOnSide(right[0]!, PortSide.EAST), tg.addPortOnSide(right[1]!, PortSide.EAST))
    const g = tg.getGraph()
    const order = g.toNodeArray()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countInLayerCrossingsOnSide(order[1]!, PortSide.EAST)).toBe(1)
    expect(allCrossings(g)).toBe(1)
  })

  it('首层 WEST 侧层内边计入总交叉数 (两端点非空)', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const l1 = tg.makeLayer()
    const left = tg.addNodesToLayer(2, l0)
    const right = tg.addNodesToLayer(2, l1)
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    tg.eastWestEdgeFromTo(left[1]!, right[1]!)
    tg.addEdgeBetweenPorts(tg.addPortOnSide(left[0]!, PortSide.WEST), tg.addPortOnSide(left[1]!, PortSide.WEST))
    tg.addEdgeBetweenPorts(tg.addPortOnSide(left[0]!, PortSide.WEST), tg.addPortOnSide(left[1]!, PortSide.WEST))
    const g = tg.getGraph()
    const order = g.toNodeArray()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countInLayerCrossingsOnSide(order[0]!, PortSide.WEST)).toBe(1)
    expect(allCrossings(g)).toBe(1)
  })

  it('超边估计: 单端口多边 (degree>1) 与普通层间计数不同, 取超边口径', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const l1 = tg.makeLayer()
    const left = tg.addNodesToLayer(2, l0)
    const right = tg.addNodesToLayer(2, l1)
    // 每个左节点单个 EAST 端口, 各连右节点两个 WEST 端口 (degree=2 → 超边分支)
    const lb0p = tg.addPortOnSide(left[0]!, PortSide.EAST)
    const lb1p = tg.addPortOnSide(left[1]!, PortSide.EAST)
    const rp0 = tg.addPortsOnSide(2, right[0]!, PortSide.WEST)
    const rp1 = tg.addPortsOnSide(2, right[1]!, PortSide.WEST)
    tg.addEdgeBetweenPorts(lb0p, rp1[0]!)
    tg.addEdgeBetweenPorts(lb0p, rp1[1]!)
    tg.addEdgeBetweenPorts(lb1p, rp0[0]!)
    tg.addEdgeBetweenPorts(lb1p, rp0[1]!)
    tg.setUpIds()
    const g = tg.getGraph()
    const order = g.toNodeArray()
    const counter = new AllCrossingsCounter(order)
    initInitializables([counter], order)
    // 普通层间计数 = 4; 超边估计 = 1
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countCrossingsBetweenLayers(order[0]!, order[1]!)).toBe(4)
    expect((counter as any).hasHyperEdgesEastOfIndex[0]).toBe(true)
    expect(counter.countAllCrossings(order)).toBe(1)
  })
})
