/**
 * 移植自 ELK Java: p3order/counting/CrossingsCounterTest.java
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, PortSide, NodeType } from '../../src/index.js'
import { CrossingsCounter, BinaryIndexedTree, inNorthSouthEastWestOrder } from '../../src/p3order/counting.js'
import { TestGraphCreator, NorthSouthEdgeTestGraphCreator } from './helpers/TestGraphCreator.js'

describe('CrossingsCounter (ELK Java 移植)', () => {
  let tg: TestGraphCreator
  let counter: CrossingsCounter
  const order = () => tg.getGraph().toNodeArray()
  const counter_ = () => new CrossingsCounter(new Array<number>(tg.getNumPorts(order())).fill(0))

  it('countCrossingsBetweenLayers_fixedPortOrderCrossingOnTwoNodes', () => {
    tg = new TestGraphCreator()
    const left = tg.addNodeToLayer(tg.makeLayer()); const right = tg.addNodeToLayer(tg.makeLayer())
    tg.eastWestEdgeFromTo(left, right); tg.eastWestEdgeFromTo(left, right)
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(1)
  })

  it('longInLayerCrossings', () => {
    tg = new TestGraphCreator()
    const nodes = tg.addNodesToLayer(5, tg.makeLayer())
    tg.addInLayerEdge(nodes[0]!, nodes[1]!, PortSide.EAST)
    tg.addInLayerEdge(nodes[1]!, nodes[3]!, PortSide.EAST)
    tg.addInLayerEdge(nodes[2]!, nodes[4]!, PortSide.EAST)
    counter = counter_()
    expect(counter.countInLayerCrossingsOnSide(order()[0]!, PortSide.EAST)).toBe(1)
  })

  it('countCrossingsBetweenLayers_crossFormed', () => {
    tg = new TestGraphCreator(); tg.getCrossFormedGraph()
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(1)
  })

  it('countCrossingsBetweenLayers_crossFormedMultipleEdgesBetweenSameNodes', async () => {
    tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer(); const rightLayer = tg.makeLayer()
    const topLeft = tg.addNodeToLayer(leftLayer); const bottomLeft = tg.addNodeToLayer(leftLayer)
    const topRight = tg.addNodeToLayer(rightLayer); const bottomRight = tg.addNodeToLayer(rightLayer)
    const tlTop = tg.addPortOnSide(topLeft, PortSide.EAST); const tlBottom = tg.addPortOnSide(topLeft, PortSide.EAST)
    const brBottom = tg.addPortOnSide(bottomRight, PortSide.WEST); const brTop = tg.addPortOnSide(bottomRight, PortSide.WEST)
    tg.addEdgeBetweenPorts(tlTop, brTop); tg.addEdgeBetweenPorts(tlBottom, brBottom)
    const blTop = tg.addPortOnSide(bottomLeft, PortSide.EAST); const blBottom = tg.addPortOnSide(bottomLeft, PortSide.EAST)
    const trBottom = tg.addPortOnSide(topRight, PortSide.WEST); const trTop = tg.addPortOnSide(topRight, PortSide.WEST)
    tg.addEdgeBetweenPorts(blTop, trTop); tg.addEdgeBetweenPorts(blBottom, trBottom)
    const { GraphInfoHolder } = await import('../../src/p3order/graph-info-holder.js')
    const { CrossMinType } = await import('../../src/p3order/port-distributors.js')
    const gd = new GraphInfoHolder(tg.getGraph(), CrossMinType.BARYCENTER, [])
    gd.portDistributor.distributePortsWhileSweeping(order(), 1, true)
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(4)
  })

  it('countCrossingsBetweenLayers_crossWithExtraEdgeInBetween', () => {
    tg = new TestGraphCreator(); tg.getCrossWithExtraEdgeInBetweenGraph()
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(3)
  })

  it('countCrossingsBetweenLayers_ignoreSelfLoops', () => {
    tg = new TestGraphCreator(); tg.getCrossWithManySelfLoopsGraph()
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(1)
  })

  it('countCrossingsBetweenLayers_moreComplexThreeLayerGraph', async () => {
    tg = new TestGraphCreator(); tg.getMoreComplexThreeLayerGraph()
    const { GraphInfoHolder } = await import('../../src/p3order/graph-info-holder.js')
    const { CrossMinType } = await import('../../src/p3order/port-distributors.js')
    const gd = new GraphInfoHolder(tg.getGraph(), CrossMinType.BARYCENTER, [])
    gd.portDistributor.distributePortsWhileSweeping(order(), 1, true)
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(1)
  })

  it('countCrossingsBetweenLayers_fixedPortOrder', () => {
    tg = new TestGraphCreator(); tg.getFixedPortOrderGraph()
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(1)
  })

  it('countCrossingsBetweenLayers_intoSamePort', () => {
    tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer(); const rightLayer = tg.makeLayer()
    const topLeft = tg.addNodeToLayer(leftLayer); const bottomLeft = tg.addNodeToLayer(leftLayer)
    const topRight = tg.addNodeToLayer(rightLayer); const bottomRight = tg.addNodeToLayer(rightLayer)
    tg.eastWestEdgeFromTo(topLeft, bottomRight)
    const blFirst = tg.addPortOnSide(bottomLeft, PortSide.EAST); const blSecond = tg.addPortOnSide(bottomLeft, PortSide.EAST)
    const trFirst = tg.addPortOnSide(topRight, PortSide.WEST)
    tg.addEdgeBetweenPorts(blFirst, trFirst); tg.addEdgeBetweenPorts(blSecond, trFirst)
    tg.setUpIds()
    counter = counter_()
    expect(counter.countCrossingsBetweenLayers(order()[0]!, order()[1]!)).toBe(2)
  })

  it('countCrossingsBetweenPorts_givenWesternCrossings_OnlyCountsForGivenPorts', () => {
    tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer()); const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[1]!, right[1]!)
    tg.eastWestEdgeFromTo(left[1]!, right[0]!)
    counter = counter_()
    counter.initForCountingBetween(left, right)
    const p = counter.countCrossingsBetweenPortsInBothOrders(right[1]!.getPorts()[1]!, right[1]!.getPorts()[0]!)
    expect(p.first).toBe(1)
  })

  it('countCrossingsBetweenPorts_GivenCrossingsOnEasternSide', () => {
    tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(1, tg.makeLayer()); const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    counter = counter_()
    counter.initForCountingBetween(left, right)
    const p = counter.countCrossingsBetweenPortsInBothOrders(left[0]!.getPorts()[0]!, left[0]!.getPorts()[1]!)
    expect(p.first).toBe(1)
  })

  it('countingTwoDifferentGraphs_DoesNotInterfereWithEachOther', () => {
    tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(3, tg.makeLayer()); const right = tg.addNodesToLayer(3, tg.makeLayer())
    const leftNode = left[1]!
    const leftPorts = tg.addPortsOnSide(2, leftNode, PortSide.EAST)
    tg.eastWestEdgeFromTo(left[2]!, right[1]!)
    tg.eastWestEdgeFromTo(leftPorts[0]!, right[1]!)
    tg.eastWestEdgeFromTo(leftPorts[1]!, right[0]!)
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    counter = counter_()
    counter.initForCountingBetween(left, right)
    const p1 = counter.countCrossingsBetweenPortsInBothOrders(leftNode.getPorts()[0]!, leftNode.getPorts()[1]!)
    expect(p1.first).toBe(1)
    counter.switchPorts(leftPorts[0]!, leftPorts[1]!)
    leftNode.getPorts()[0] = leftPorts[1]!
    leftNode.getPorts()[1] = leftPorts[0]!
    const p2 = counter.countCrossingsBetweenPortsInBothOrders(leftNode.getPorts()[0]!, leftNode.getPorts()[1]!)
    expect(p2.first).toBe(0)
  })

  it('countCrossingsBetweenPorts_twoEdgesIntoSamePort', () => {
    tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer(); const rightLayer = tg.makeLayer()
    const topLeft = tg.addNodeToLayer(leftLayer); const bottomLeft = tg.addNodeToLayer(leftLayer)
    const topRight = tg.addNodeToLayer(rightLayer); const bottomRight = tg.addNodeToLayer(rightLayer)
    tg.eastWestEdgeFromTo(topLeft, bottomRight)
    const blPort = tg.addPortOnSide(bottomLeft, PortSide.EAST); const trPort = tg.addPortOnSide(topRight, PortSide.WEST)
    tg.addEdgeBetweenPorts(blPort, trPort); tg.addEdgeBetweenPorts(blPort, trPort)
    tg.setUpIds()
    counter = counter_()
    counter.initForCountingBetween(order()[0]!, order()[1]!)
    const p = counter.countCrossingsBetweenPortsInBothOrders(blPort, topLeft.getPorts()[0]!)
    expect(p.first).toBe(2)
  })

  it('countInLayerCrossingsBetweenNodesInBothOrders_swapChangesCrossings', () => {
    // 单层 4 节点 [A,B,C,D], 层内 EAST 边 A→D 与 B→C:
    // 端口序 A(0) B(1) C(2) D(3) → 两层层内边不交叉 (0);
    // 交换 A,B 后 A→D 与 B→C 交叉 (1). 与 ELK 索引语义一致.
    tg = new TestGraphCreator()
    const nodes = tg.addNodesToLayer(4, tg.makeLayer())
    const [a, b, c, d] = nodes
    tg.addEdgeBetweenPorts(tg.addPortOnSide(a!, PortSide.EAST), tg.addPortOnSide(d!, PortSide.EAST))
    tg.addEdgeBetweenPorts(tg.addPortOnSide(b!, PortSide.EAST), tg.addPortOnSide(c!, PortSide.EAST))
    tg.setUpIds()
    counter = counter_()
    counter.initPortPositionsForInLayerCrossings(order()[0]!, PortSide.EAST)
    const p = counter.countInLayerCrossingsBetweenNodesInBothOrders(a!, b!, PortSide.EAST)
    expect(p.first).toBe(0)
    expect(p.second).toBe(1)
  })
})

/**
 * 性质/随机属性测试 (writer C): 固定种子随机图, 用独立暴力 oracle (普通数组复刻 BIT 扫描)
 * 校验 CrossingsCounter 的计数与 ELK 索引语义一致, 而非仅断言具体坐标.
 */
import {
  randomLayeredGraph, bruteCrossingsBetweenLayers, bruteInLayerCrossings, indexPortIds, countPorts,
} from './helpers/PropertyTestGraphs.js'

describe('CrossingsCounter 性质/随机属性测试', () => {
  const makeCounter = (graph: LGraph) => new CrossingsCounter(new Array<number>(countPorts(graph)).fill(0))

  it.each([1, 2, 3, 4, 5])('seed=%i: countCrossingsBetweenLayers 与暴力一致 (多层)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    for (let i = 0; i < layers.length - 1; i++) {
      expect(counter.countCrossingsBetweenLayers(layers[i]!, layers[i + 1]!), `layer=${i}`)
        .toBe(bruteCrossingsBetweenLayers(layers[i]!, layers[i + 1]!))
    }
  })

  it.each([10, 11, 12, 13, 14])('seed=%i: countInLayerCrossingsOnSide 与暴力一致 (含层内边)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4, inLayer: true })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    for (let i = 0; i < layers.length; i++) {
      for (const side of [PortSide.EAST, PortSide.WEST]) {
        expect(counter.countInLayerCrossingsOnSide(layers[i]!, side), `layer=${i} side=${side}`)
          .toBe(bruteInLayerCrossings(layers[i]!, side))
      }
    }
  })

  it.each([1, 2, 3, 4, 5])('seed=%i: countCrossingsBetweenPortsInBothOrders 物理交换后对称且非负', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5 })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    counter.initForCountingBetween(layers[0]!, layers[1]!)
    const leftPorts = layers[0]!.flatMap(n => n.getPortSideView(PortSide.EAST))
    if (leftPorts.length < 2) return
    const upper = leftPorts[0]!
    const lower = leftPorts[1]!
    const pair1 = counter.countCrossingsBetweenPortsInBothOrders(upper, lower)
    expect(pair1.first).toBeGreaterThanOrEqual(0)
    expect(pair1.second).toBeGreaterThanOrEqual(0)
    // 物理交换节点端口数组中的两个端口后, 以 (lower, upper) 计数应得到交换后的 pair
    const node = upper.getNode()!
    const ports = node.getPorts()
    const iu = ports.indexOf(upper)
    const il = ports.indexOf(lower)
    ;[ports[iu]!, ports[il]!] = [ports[il]!, ports[iu]!]
    const counter2 = makeCounter(graph)
    counter2.initForCountingBetween(layers[0]!, layers[1]!)
    const pair2 = counter2.countCrossingsBetweenPortsInBothOrders(lower, upper)
    ;[ports[iu]!, ports[il]!] = [ports[il]!, ports[iu]!]
    expect(pair2.first, `seed=${seed}`).toBe(pair1.second)
    expect(pair2.second, `seed=${seed}`).toBe(pair1.first)
  })

  it('countCrossingsBetweenPortsInBothOrders: 两端口无连接时 first/second 为 0', () => {
    const { graph, layers } = randomLayeredGraph(99, { numLayers: 2, nodesPerLayer: 4 })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    counter.initForCountingBetween(layers[0]!, layers[1]!)
    // 取两个都没有边的孤立端口 (若存在)
    const isolated: LPort[] = []
    for (const layer of layers) for (const node of layer) for (const p of node.getPorts()) {
      if (p.getDegree() === 0) isolated.push(p)
    }
    if (isolated.length >= 2) {
      const pair = counter.countCrossingsBetweenPortsInBothOrders(isolated[0]!, isolated[1]!)
      expect(pair.first).toBe(0)
      expect(pair.second).toBe(0)
    }
  })

  it.each([20, 21, 22, 23, 24])('seed=%i: countCrossingsBetweenLayers 与暴力一致 (含层内边, 不受污染)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4, inLayer: true })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    for (let i = 0; i < layers.length - 1; i++) {
      expect(counter.countCrossingsBetweenLayers(layers[i]!, layers[i + 1]!), `layer=${i}`)
        .toBe(bruteCrossingsBetweenLayers(layers[i]!, layers[i + 1]!))
    }
  })

  it.each([30, 31, 32, 33, 34])('seed=%i: 相邻端口交换取较优序 → 全局层间交叉不增且差值精确 (单调)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5 })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    counter.initForCountingBetween(layers[0]!, layers[1]!)
    for (const node of layers[0]!) {
      const east = node.getPortSideView(PortSide.EAST)
      for (let i = 0; i < east.length - 1; i++) {
        const upper = east[i]!
        const lower = east[i + 1]!
        const pair = counter.countCrossingsBetweenPortsInBothOrders(upper, lower)
        if (pair.second >= pair.first) continue
        const before = makeCounter(graph).countCrossingsBetweenLayers(layers[0]!, layers[1]!)
        const ports = node.getPorts()
        const iu = ports.indexOf(upper)
        const il = ports.indexOf(lower)
        ;[ports[iu]!, ports[il]!] = [ports[il]!, ports[iu]!]
        const after = makeCounter(graph).countCrossingsBetweenLayers(layers[0]!, layers[1]!)
        ;[ports[iu]!, ports[il]!] = [ports[il]!, ports[iu]!]
        expect(after, `seed=${seed}`).toBeLessThanOrEqual(before)
        expect(after, `seed=${seed} delta`).toBe(before - (pair.first - pair.second))
      }
    }
  })

  it.each([40, 41, 42, 43, 44])('seed=%i: 相邻节点交换取较优序 → 层内交叉不增且差值精确 (单调)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5, inLayer: true })
    indexPortIds(graph)
    const layer = layers[0]!
    const counter = makeCounter(graph)
    counter.initPortPositionsForInLayerCrossings(layer, PortSide.EAST)
    for (let i = 0; i < layer.length - 1; i++) {
      const upper = layer[i]!
      const lower = layer[i + 1]!
      const pair = counter.countInLayerCrossingsBetweenNodesInBothOrders(upper, lower, PortSide.EAST)
      if (pair.second >= pair.first) continue
      const before = bruteInLayerCrossings(layer, PortSide.EAST)
      ;[layer[i]!, layer[i + 1]!] = [layer[i + 1]!, layer[i]!]
      const after = bruteInLayerCrossings(layer, PortSide.EAST)
      ;[layer[i]!, layer[i + 1]!] = [layer[i + 1]!, layer[i]!]
      expect(after, `seed=${seed}`).toBeLessThanOrEqual(before)
      expect(after, `seed=${seed} delta`).toBe(before - (pair.first - pair.second))
    }
  })

  it.each([50, 51, 52, 53, 54])('seed=%i: countInLayerCrossingsBetweenNodesInBothOrders 物理交换后对称', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5, inLayer: true })
    indexPortIds(graph)
    const layer = layers[0]!
    const counter = makeCounter(graph)
    counter.initPortPositionsForInLayerCrossings(layer, PortSide.EAST)
    const upper = layer[0]!
    const lower = layer[1]!
    const pair1 = counter.countInLayerCrossingsBetweenNodesInBothOrders(upper, lower, PortSide.EAST)
    expect(pair1.first).toBeGreaterThanOrEqual(0)
    expect(pair1.second).toBeGreaterThanOrEqual(0)
    ;[layer[0]!, layer[1]!] = [layer[1]!, layer[0]!]
    const counter2 = makeCounter(graph)
    counter2.initPortPositionsForInLayerCrossings(layer, PortSide.EAST)
    const pair2 = counter2.countInLayerCrossingsBetweenNodesInBothOrders(lower, upper, PortSide.EAST)
    ;[layer[0]!, layer[1]!] = [layer[1]!, layer[0]!]
    expect(pair2.first, `seed=${seed}`).toBe(pair1.second)
    expect(pair2.second, `seed=${seed}`).toBe(pair1.first)
  })
})

describe('BinaryIndexedTree 边界 (counting.ts)', () => {
  it('add/removeAll 非法索引抛 RangeError', () => {
    const bit = new BinaryIndexedTree(5)
    expect(() => bit.add(-1)).toThrow(RangeError)
    expect(() => bit.add(5)).toThrow(RangeError)
    expect(() => bit.add(2.5)).toThrow(RangeError)
    expect(() => bit.add(Number.NaN)).toThrow(RangeError)
    expect(() => bit.removeAll(-1)).toThrow(RangeError)
    expect(() => bit.removeAll(5)).toThrow(RangeError)
  })

  it('isEmpty/size/clear 生命周期', () => {
    const bit = new BinaryIndexedTree(5)
    expect(bit.isEmpty()).toBe(true)
    bit.add(2)
    bit.add(2)
    bit.add(4)
    expect(bit.isEmpty()).toBe(false)
    expect(bit.size()).toBe(3)
    expect(bit.rank(0)).toBe(0)
    expect(bit.rank(2)).toBe(0)
    expect(bit.rank(3)).toBe(2)
    expect(bit.rank(5)).toBe(3)
    bit.removeAll(2)
    expect(bit.size()).toBe(1)
    expect(bit.rank(3)).toBe(0)
    bit.clear()
    expect(bit.size()).toBe(0)
    expect(bit.isEmpty()).toBe(true)
  })

  it('index=0 与 removeAll 不存在索引', () => {
    const bit = new BinaryIndexedTree(5)
    bit.add(0)
    expect(bit.size()).toBe(1)
    expect(bit.rank(1)).toBe(1)
    expect(bit.rank(0)).toBe(0)
    // removeAll 不存在的索引: 无操作
    bit.removeAll(3)
    expect(bit.size()).toBe(1)
  })
})

describe('inNorthSouthEastWestOrder (counting.ts)', () => {
  it('WEST/SOUTH 反序, EAST/NORTH 正序', () => {
    const tg = new TestGraphCreator()
    const n = tg.addNodeToLayer(tg.makeLayer())
    const w1 = tg.addPortOnSide(n, PortSide.WEST)
    const w2 = tg.addPortOnSide(n, PortSide.WEST)
    const w3 = tg.addPortOnSide(n, PortSide.WEST)
    const s1 = tg.addPortOnSide(n, PortSide.SOUTH)
    const s2 = tg.addPortOnSide(n, PortSide.SOUTH)
    const e1 = tg.addPortOnSide(n, PortSide.EAST)
    const e2 = tg.addPortOnSide(n, PortSide.EAST)
    expect(inNorthSouthEastWestOrder(n, PortSide.WEST).map(p => p.id)).toEqual([w3.id, w2.id, w1.id])
    expect(inNorthSouthEastWestOrder(n, PortSide.SOUTH).map(p => p.id)).toEqual([s2.id, s1.id])
    expect(inNorthSouthEastWestOrder(n, PortSide.EAST).map(p => p.id)).toEqual([e1.id, e2.id])
    expect(inNorthSouthEastWestOrder(n, PortSide.NORTH)).toEqual([])
  })

  it('未知 side 返回空数组 (默认分支)', () => {
    const tg = new TestGraphCreator()
    const n = tg.addNodeToLayer(tg.makeLayer())
    expect((inNorthSouthEastWestOrder as (n: LNode, s: unknown) => LPort[])(n, 'BOGUS')).toEqual([])
  })
})

describe('CrossingsCounter 补充分支 (counting.ts)', () => {
  it('WEST 侧层内交叉计数 (getPorts 反序分支)', () => {
    const tg = new TestGraphCreator()
    const nodes = tg.addNodesToLayer(5, tg.makeLayer())
    tg.addInLayerEdge(nodes[0]!, nodes[1]!, PortSide.WEST)
    tg.addInLayerEdge(nodes[1]!, nodes[3]!, PortSide.WEST)
    tg.addInLayerEdge(nodes[2]!, nodes[4]!, PortSide.WEST)
    tg.setUpIds()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countInLayerCrossingsOnSide(tg.getGraph().toNodeArray()[0]!, PortSide.WEST)).toBe(2)
  })

  it('N-S 计数: LONG_EDGE dummy 分支', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const g = tg.getSouthernNorthSouthDummyEdgeCrossingGraph()
    const order = g.toNodeArray()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countNorthSouthPortCrossingsInLayer(order[1]!)).toBe(0)
  })

  it('N-S 计数: 三层图 N-S 交叉为 1', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const g = tg.getThreeLayerNorthSouthCrossingGraph()
    const order = g.toNodeArray()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countNorthSouthPortCrossingsInLayer(order[1]!)).toBe(1)
  })

  it('countCrossingsBetweenLayers 后重复计数保持端口位置 (无遗留状态)', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[1]!, right[0]!)
    tg.setUpIds()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    const order = tg.getGraph().toNodeArray()
    expect(cc.countCrossingsBetweenLayers(order[0]!, order[1]!)).toBe(1)
    expect(cc.countCrossingsBetweenLayers(order[0]!, order[1]!)).toBe(1)
  })
})

// ============================================================================
// X1 续接: default 分支 / getPorts 私有四态 / EXTERNAL_PORT 节点
// ============================================================================

describe('CrossingsCounter 续接补测 (X1)', () => {
  it('N-S 计数 switch default: EXTERNAL_PORT 节点不崩溃且计数 0', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const n1 = tg.addNodeToLayer(l0)
    const n2 = tg.addNodeToLayer(l0)
    n2.setType(NodeType.EXTERNAL_PORT)
    tg.addPortOnSide(n1, PortSide.NORTH)
    tg.addPortOnSide(n2, PortSide.SOUTH)
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countNorthSouthPortCrossingsInLayer(order[0]!)).toBe(0)
  })

  it('getPorts 私有: EAST 逆序 / WEST 正序 (topDown=false)', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const n = tg.addNodeToLayer(l0)
    const pe1 = tg.addPortOnSide(n, PortSide.EAST)
    const pe2 = tg.addPortOnSide(n, PortSide.EAST)
    const pw1 = tg.addPortOnSide(n, PortSide.WEST)
    const pw2 = tg.addPortOnSide(n, PortSide.WEST)
    pe1.id = 1
    pe2.id = 2
    pw1.id = 3
    pw2.id = 4
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    const cc: any = new CrossingsCounter(new Array<number>(20).fill(0))
    const node = order[0]![0]!
    // 注意: 端口按 NORTH-EAST-SOUTH-WEST 序, 这里直接断言集合相等
    const eastFalse = cc.getPorts(node, PortSide.EAST, false) as LPort[]
    expect(eastFalse.map((p: LPort) => p.id)).toEqual([2, 1])
    const westTrue = cc.getPorts(node, PortSide.WEST, true) as LPort[]
    expect(westTrue.map((p: LPort) => p.id)).toEqual([4, 3])
    const eastTrue = cc.getPorts(node, PortSide.EAST, true) as LPort[]
    expect(eastTrue.map((p: LPort) => p.id)).toEqual([1, 2])
    const westFalse = cc.getPorts(node, PortSide.WEST, false) as LPort[]
    expect(westFalse.map((p: LPort) => p.id)).toEqual([3, 4])
  })
})
