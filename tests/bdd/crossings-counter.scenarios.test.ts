/**
 * CrossingsCounter BDD 场景 — 层间/层内两两交叉计数不变量 (M4).
 *
 * 对照 ELK p3order/counting/CrossingsCounter.java (632 行) 的计数语义:
 *  1. 两两正确: countCrossingsBetweenLayers / countInLayerCrossingsOnSide 与独立暴力 oracle 一致;
 *  2. 对称: countCrossingsBetweenPortsInBothOrders / countInLayerCrossingsBetweenNodesInBothOrders
 *     物理交换端口/节点后得到镜像 pair;
 *  3. 单调: 相邻端口/节点交换取较优序 → 全局交叉数不增 (且差值 = 两两 first - second).
 *
 * 暴力 oracle (tests/unit/helpers/PropertyTestGraphs.ts) 用普通数组复刻 ELK 的索引分配与
 * BIT 扫描 (左层 EAST 自上而下 + 右层 WEST 自下而上), 因此「与暴力一致」即「与 Java 一致」.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, PortSide } from '../../src/index.js'
import { CrossingsCounter } from '../../src/p3order/counting.js'
import {
  randomLayeredGraph, bruteCrossingsBetweenLayers, bruteInLayerCrossings,
  indexPortIds, countPorts, makeLayer, addNodeToLayer, eastWestEdge,
} from '../unit/helpers/PropertyTestGraphs.js'

const makeCounter = (graph: LGraph) => new CrossingsCounter(new Array<number>(countPorts(graph)).fill(0))

describe('CrossingsCounter 场景: 两两交叉数正确 (与 Java 一致)', () => {
  it.each([60, 61, 62])('多层随机图 (含层内边): 层间交叉数 = 暴力 oracle (seed=%i)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 4, nodesPerLayer: 4, inLayer: true })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    for (let i = 0; i < layers.length - 1; i++) {
      expect(counter.countCrossingsBetweenLayers(layers[i]!, layers[i + 1]!), `layer=${i}`)
        .toBe(bruteCrossingsBetweenLayers(layers[i]!, layers[i + 1]!))
    }
  })

  it.each([70, 71, 72])('多层随机图: 层内交叉数 = 暴力 oracle (seed=%i)', (seed) => {
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

  it('两节点固定端口序双平行边: 层间交叉数 = 1 (ELK Java 同用例期望)', () => {
    const graph = new LGraph()
    const leftLayer = makeLayer(graph)
    const rightLayer = makeLayer(graph)
    const left = addNodeToLayer(graph, leftLayer)
    const right = addNodeToLayer(graph, rightLayer)
    eastWestEdge(left, right)
    eastWestEdge(left, right)
    indexPortIds(graph)
    const counter = makeCounter(graph)
    expect(counter.countCrossingsBetweenLayers([left], [right])).toBe(1)
  })

  it('十字交叉 (cross formed): 层间交叉数 = 1 (ELK Java 同用例期望)', () => {
    const graph = new LGraph()
    const leftLayer = makeLayer(graph)
    const rightLayer = makeLayer(graph)
    const topLeft = addNodeToLayer(graph, leftLayer)
    const bottomLeft = addNodeToLayer(graph, leftLayer)
    const topRight = addNodeToLayer(graph, rightLayer)
    const bottomRight = addNodeToLayer(graph, rightLayer)
    eastWestEdge(topLeft, bottomRight)
    eastWestEdge(bottomLeft, topRight)
    indexPortIds(graph)
    const counter = makeCounter(graph)
    expect(counter.countCrossingsBetweenLayers([topLeft, bottomLeft], [topRight, bottomRight])).toBe(1)
  })
})

describe('CrossingsCounter 场景: 两两交叉数对称', () => {
  it.each([80, 81, 82])('countCrossingsBetweenPortsInBothOrders: 物理交换端口后 pair 镜像 (seed=%i)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5 })
    indexPortIds(graph)
    const counter = makeCounter(graph)
    counter.initForCountingBetween(layers[0]!, layers[1]!)
    const leftPorts = layers[0]!.flatMap(n => n.getPortSideView(PortSide.EAST))
    if (leftPorts.length < 2) return
    const upper = leftPorts[0]!
    const lower = leftPorts[1]!
    const pair1 = counter.countCrossingsBetweenPortsInBothOrders(upper, lower)
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

  it.each([90, 91, 92])('countInLayerCrossingsBetweenNodesInBothOrders: 物理交换节点后 pair 镜像 (seed=%i)', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5, inLayer: true })
    indexPortIds(graph)
    const layer = layers[0]!
    const counter = makeCounter(graph)
    counter.initPortPositionsForInLayerCrossings(layer, PortSide.EAST)
    const upper = layer[0]!
    const lower = layer[1]!
    const pair1 = counter.countInLayerCrossingsBetweenNodesInBothOrders(upper, lower, PortSide.EAST)
    ;[layer[0]!, layer[1]!] = [layer[1]!, layer[0]!]
    const counter2 = makeCounter(graph)
    counter2.initPortPositionsForInLayerCrossings(layer, PortSide.EAST)
    const pair2 = counter2.countInLayerCrossingsBetweenNodesInBothOrders(lower, upper, PortSide.EAST)
    ;[layer[0]!, layer[1]!] = [layer[1]!, layer[0]!]
    expect(pair2.first, `seed=${seed}`).toBe(pair1.second)
    expect(pair2.second, `seed=${seed}`).toBe(pair1.first)
  })
})

describe('CrossingsCounter 场景: 交叉数单调 (贪心交换不增)', () => {
  it.each([100, 101, 102])('相邻端口交换取较优序 → 全局层间交叉不增且差值精确 (seed=%i)', (seed) => {
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

  it.each([110, 111, 112])('相邻节点交换取较优序 → 层内交叉不增且差值精确 (seed=%i)', (seed) => {
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
})
