/**
 * 移植自 ELK Java: p3order/GreedyPortDistributorTest.java (前 5 个简单方法)
 */
import { describe, expect, it } from 'vitest'
import { LPort } from '../../src/index.js'
import { GreedyPortDistributor } from '../../src/p3order/greedy-port-distributor.js'
import { PortSide } from '../../src/index.js'
import { initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'
import { LGraph, LNode, LEdge, NodeType, PortType as PT } from '../../src/index.js'
import { Layer as GLayer } from '../../src/graph/layer.js'
import { LayerTotalPortDistributor, NodeRelativePortDistributor, createPortDistributor, CrossMinType } from '../../src/p3order/port-distributors.js'
import { IN_LAYER_LAYOUT_UNIT as ILU, ORIGIN as ORG, PORT_DUMMY as PDM } from '../../src/options/internal-properties.js'
import { MockRandom as MR } from './helpers/MockRandom.js'

function portsOrderedAs(node: { getPorts(): LPort[] }, ...indices: number[]): LPort[] {
  return indices.map(i => node.getPorts()[i]!)
}

describe('GreedyPortDistributor (ELK Java 移植)', () => {
  it('distributePorts_GivenCrossOnWesternSide_RemoveCrossing', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, rightNode)
    tg.eastWestEdgeFromTo(left[1]!, rightNode)
    const expected = portsOrderedAs(rightNode, 1, 0)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    const improved = pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 1, true)
    expect(improved).toBe(true)
    expect(rightNode.getPorts()).toEqual(expected)
  })

  it('distributePorts_GivenNoPortsOnRightSide_NothingHappens', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const middleNode = tg.addNodeToLayer(tg.makeLayer())
    tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, middleNode)
    tg.eastWestEdgeFromTo(left[1]!, middleNode)
    const expected = portsOrderedAs(middleNode, 0, 1)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 1, false)
    expect(middleNode.getPorts()).toEqual(expected)
  })

  it('distributePorts_GivenMultipleCrossingsOnWesternSide_RemoveCrossing', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(3, tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, rightNode)
    tg.eastWestEdgeFromTo(left[2]!, rightNode)
    tg.eastWestEdgeFromTo(left[1]!, rightNode)
    const expected = portsOrderedAs(rightNode, 1, 2, 0)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 1, true)
    expect(rightNode.getPorts()).toEqual(expected)
  })

  it('distributePorts_GivenCrossingsOnEasternSide_RemoveThem', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(1, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    const expected = portsOrderedAs(left[0]!, 1, 0)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(left[0]!.getPorts()).toEqual(expected)
  })

  it('distributePorts_fixedPortOrder_NoChange', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(1, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    tg.setFixedOrderConstraint(left[0]!)
    const expected = portsOrderedAs(left[0]!, 0, 1)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(left[0]!.getPorts()).toEqual(expected)
  })

  it('givenDoubleCrossBetweenCompoundAndNonCompoundNodes_SwitchesPorts', () => {
    const tg = new TestGraphCreator()
    const leftOuter = tg.addNodeToLayer(tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    const leftOuterPorts = tg.addPortsOnSide(2, leftOuter, PortSide.EAST)
    tg.eastWestEdgeFromTo(leftOuterPorts[0]!, right[1]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[0]!, right[1]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[1]!, right[0]!)
    const inner = tg.nestedGraph(leftOuter)
    const innerNodes = tg.addNodesToLayer(2, tg.makeLayer(inner))
    const innerDummies = tg.addExternalPortDummiesToLayer(tg.makeLayer(inner), leftOuterPorts)
    tg.eastWestEdgeFromTo(innerNodes[0]!, innerDummies[0]!)
    tg.eastWestEdgeFromTo(innerNodes[1]!, innerDummies[1]!)
    tg.setUpIds()
    const expected = portsOrderedAs(leftOuter, 1, 0)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(leftOuter.getPorts()).toEqual(expected)
  })

  it('givenSingleCrossBetweenCompoundAndNonCompoundNodes_DoesNotSwitchPorts', () => {
    const tg = new TestGraphCreator()
    const leftOuter = tg.addNodeToLayer(tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    const leftOuterPorts = tg.addPortsOnSide(2, leftOuter, PortSide.EAST)
    tg.eastWestEdgeFromTo(leftOuterPorts[0]!, right[1]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[1]!, right[0]!)
    const inner = tg.nestedGraph(leftOuter)
    const innerNodes = tg.addNodesToLayer(2, tg.makeLayer(inner))
    const innerDummies = tg.addExternalPortDummiesToLayer(tg.makeLayer(inner), leftOuterPorts)
    tg.eastWestEdgeFromTo(innerNodes[0]!, innerDummies[0]!)
    tg.eastWestEdgeFromTo(innerNodes[1]!, innerDummies[1]!)
    const expected = portsOrderedAs(leftOuter, 0, 1)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(leftOuter.getPorts()).toEqual(expected)
  })

  it('givenMoreHierarchicalNodes_DoesNotSwitchPorts', () => {
    const tg = new TestGraphCreator()
    const leftOuter = tg.addNodeToLayer(tg.makeLayer())
    const right = tg.addNodesToLayer(3, tg.makeLayer())
    const leftOuterPorts = tg.addPortsOnSide(3, leftOuter, PortSide.EAST)
    tg.eastWestEdgeFromTo(leftOuterPorts[0]!, right[1]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[1]!, right[0]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[2]!, right[2]!)
    const inner = tg.nestedGraph(leftOuter)
    const innerNodes = tg.addNodesToLayer(3, tg.makeLayer(inner))
    const innerDummies = tg.addExternalPortDummiesToLayer(tg.makeLayer(inner), leftOuterPorts)
    tg.eastWestEdgeFromTo(innerNodes[0]!, innerDummies[0]!)
    tg.eastWestEdgeFromTo(innerNodes[1]!, innerDummies[1]!)
    tg.eastWestEdgeFromTo(innerNodes[2]!, innerDummies[2]!)
    const expected = portsOrderedAs(leftOuter, 0, 1, 2)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(leftOuter.getPorts()).toEqual(expected)
  })

  it('givenMoreHierarchicalNodes2_DoesNotSwitchPorts', () => {
    const tg = new TestGraphCreator()
    const leftOuter = tg.addNodeToLayer(tg.makeLayer())
    const right = tg.addNodesToLayer(3, tg.makeLayer())
    const leftOuterPorts = tg.addPortsOnSide(3, leftOuter, PortSide.EAST)
    tg.eastWestEdgeFromTo(leftOuterPorts[0]!, right[1]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[1]!, right[0]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[2]!, right[2]!)
    const inner = tg.nestedGraph(leftOuter)
    const innerNode = tg.addNodeToLayer(tg.makeLayer(inner))
    const innerRight = tg.addNodesToLayer(3, tg.makeLayer(inner))
    const innerDummies = tg.addExternalPortDummiesToLayer(tg.makeLayer(inner), leftOuterPorts)
    tg.eastWestEdgeFromTo(innerNode, innerRight[2]!)
    tg.eastWestEdgeFromTo(innerRight[0]!, innerDummies[0]!)
    tg.eastWestEdgeFromTo(innerRight[1]!, innerDummies[1]!)
    tg.eastWestEdgeFromTo(innerRight[2]!, innerDummies[2]!)
    const expected = portsOrderedAs(leftOuter, 0, 1, 2)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(leftOuter.getPorts()).toEqual(expected)
  })

  it('distributePortsWhileSweeping_givenTwoHierarchicalNodesInOneLayer', () => {
    const tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer(); const rightLayer = tg.makeLayer()
    for (let i = 0; i < 2; i++) {
      const leftNodes = tg.addNodesToLayer(1, leftLayer)
      const rightNodes = tg.addNodesToLayer(2, rightLayer)
      tg.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[1]!)
      tg.eastWestEdgeFromTo(leftNodes[0]!, rightNodes[0]!)
    }
    const leftOuter = leftLayer.getNodes()[0]!
    const expected = portsOrderedAs(leftOuter, 1, 0)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(leftOuter.getPorts()).toEqual(expected)
  })

  it('noChange', () => {
    const tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer(); const rightLayer = tg.makeLayer()
    const left = tg.addNodesToLayer(1, leftLayer)
    const right = tg.addNodesToLayer(2, rightLayer)
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    const pd = new GreedyPortDistributor()
    initInitializables([pd], tg.getGraph().toNodeArray())
    const improved = pd.distributePortsWhileSweeping(tg.getGraph().toNodeArray(), 0, false)
    expect(improved).toBe(false)
  })
})

/**
 * 性质/随机属性测试 (writer C): 固定种子随机图.
 * GreedyPortDistributor 只在交换会减少交叉时切换 (switchingDecreasesCrossings),
 * 因此 distributePortsWhileSweeping 后层间交叉数单调不增; improved=true 时严格减少.
 */
import { CrossingsCounter } from '../../src/p3order/counting.js'
import {
  randomLayeredGraph, indexPortIds, countPorts,
} from './helpers/PropertyTestGraphs.js'

declare const process: { env: Record<string, string | undefined> }
describe('GreedyPortDistributor 性质/随机属性测试', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8])('seed=%i: 交叉数不增; improved 时严格减少', (seed) => {
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5, maxEdges: 3 })
    indexPortIds(graph)
    const order = graph.toNodeArray()
    const pd = new GreedyPortDistributor()
    initInitializables([pd], order)
    const counter = new CrossingsCounter(new Array<number>(countPorts(graph)).fill(0))
    const before = counter.countCrossingsBetweenLayers(order[0]!, order[1]!)
    const improved = pd.distributePortsWhileSweeping(order, 1, true)
    const after = counter.countCrossingsBetweenLayers(order[0]!, order[1]!)
    expect(after, `seed=${seed}`).toBeLessThanOrEqual(before)
    if (improved) expect(after, `seed=${seed} improved`).toBeLessThan(before)
    // 端口集合守恒 (每节点)
    for (const layer of layers) {
      for (const node of layer) {
        const ids = node.getPorts().map(p => p.id).sort((a, b) => a - b)
        expect(new Set(ids).size, `seed=${seed} node=${node.id}`).toBe(ids.length)
      }
    }
  })

  it('improved=false 时交叉数不变 (已局部最优)', () => {
    for (const seed of [21, 22, 23]) {
      const { graph } = randomLayeredGraph(seed, { numLayers: 2, nodesPerLayer: 5, maxEdges: 3 })
      indexPortIds(graph)
      const order = graph.toNodeArray()
      const pd = new GreedyPortDistributor()
      initInitializables([pd], order)
      const counter = new CrossingsCounter(new Array<number>(countPorts(graph)).fill(0))
      // 先分布一次
      pd.distributePortsWhileSweeping(order, 1, true)
      const before = counter.countCrossingsBetweenLayers(order[0]!, order[1]!)
      const improved = pd.distributePortsWhileSweeping(order, 1, true)
      const after = counter.countCrossingsBetweenLayers(order[0]!, order[1]!)
      expect(improved, `seed=${seed}`).toBe(false)
      expect(after).toBe(before)
    }
  })

  it('首层 forward (freeLayerIndex=0): 走 initPortPositionsForInLayerCrossings 分支', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer(); const l1 = tg.makeLayer()
    const a = tg.addNodeToLayer(l0); const b = tg.addNodeToLayer(l0)
    const c = tg.addNodeToLayer(l1); const d = tg.addNodeToLayer(l1)
    tg.addPortOnSide(a, PortSide.WEST); tg.addPortOnSide(a, PortSide.WEST)
    tg.addPortOnSide(b, PortSide.WEST); tg.addPortOnSide(b, PortSide.WEST)
    tg.addInLayerEdge(a, b, PortSide.WEST)
    tg.eastWestEdgeFromTo(a, c); tg.eastWestEdgeFromTo(b, d)
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    const pd = new GreedyPortDistributor()
    initInitializables([pd], order)
    expect(() => pd.distributePortsWhileSweeping(order, 0, true)).not.toThrow()
    // 末层 backward (freeLayerIndex=length-1): 同样走 else 分支
    const pd2 = new GreedyPortDistributor()
    initInitializables([pd2], order)
    expect(() => pd2.distributePortsWhileSweeping(order, order.length - 1, false)).not.toThrow()
  })

  it('compound 节点: 走 hierarchical crossing counter', () => {
    const tg = new TestGraphCreator()
    const outer = tg.addNodeToLayer(tg.makeLayer())
    const inner = tg.nestedGraph(outer)
    const innerNode = tg.addNodesToLayer(1, tg.makeLayer(inner))
    const right = tg.addNodeToLayer(tg.makeLayer())
    // outer 有 EAST 端口 (非空端口视图) + 嵌套图 → useHierarchical
    tg.eastWestEdgeFromTo(outer, right)
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    const pd = new GreedyPortDistributor()
    initInitializables([pd], order)
    expect(() => pd.distributePortsWhileSweeping(order, 0, true)).not.toThrow()
    expect(innerNode.length).toBe(1)
  })
})

// ============================================================================
// X1 续接: AbstractBarycenterPortDistributor / LayerTotal / NodeRelative 分支补测
// (挂靠本文件因批次 glob PortDistributor*.test.ts 不匹配 Abstract* 文件)
// ============================================================================

describe('AbstractBarycenterPortDistributor 补测 (X1 挂靠)', () => {
  function makeLayer(graph: LGraph): GLayer {
    const layer = new GLayer(graph)
    graph.getLayers().push(layer)
    return layer
  }
  function addNodeToLayer(graph: LGraph, layer: GLayer): LNode {
    const node = new LNode(graph)
    node.setLayer(layer)
    node.setProperty(ILU, node)
    return node
  }
  function addPortOnSide(node: LNode, side: PortSide): LPort {
    const p = new LPort()
    p.setNode(node)
    p.setSide(side)
    return p
  }
  function addEdgeBetweenPorts(from: LPort, to: LPort): LEdge {
    const e = new LEdge()
    e.setSource(from)
    e.setTarget(to)
    return e
  }
  function setUpIds(graph: LGraph): void {
    let l = 0
    for (const layer of graph.getLayers()) {
      layer.id = l++
      let i = 0
      for (const node of layer.getNodes()) node.id = i++
    }
  }
  function makeDist(graph: LGraph, cls: any): any {
    const nodeArray = graph.toNodeArray()
    const dist = new cls(nodeArray.length)
    for (let l = 0; l < nodeArray.length; l++) {
      dist.initAtLayerLevel(l, nodeArray)
      for (let n = 0; n < nodeArray[l]!.length; n++) dist.initAtNodeLevel(l, n, nodeArray)
    }
    dist.initAfterTraversal()
    return dist
  }
  function makeNsDummy(origin: LNode, graph: LGraph, ew: LNode, side: PortSide, direction: 'in' | 'out'): void {
    const port = addPortOnSide(origin, side)
    const d = addNodeToLayer(graph, origin.getLayer()!)
    d.setType(NodeType.NORTH_SOUTH_PORT)
    d.setProperty(ILU, origin)
    d.setProperty(ORG, origin)
    const dp = addPortOnSide(d, PortSide.WEST)
    dp.setProperty(ORG, port)
    port.setProperty(PDM, d)
    const ewPort = addPortOnSide(ew, PortSide.EAST)
    if (direction === 'in') addEdgeBetweenPorts(ewPort, dp)
    else addEdgeBetweenPorts(dp, ewPort)
  }

  it('SOUTH input-only: barycenter 精确 = absurdlyLargeFloat - pos(dummy)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const ew = addNodeToLayer(graph, l1)
    makeNsDummy(origin, graph, ew, PortSide.SOUTH, 'in')
    const portIn = origin.getPorts()[0]!
    setUpIds(graph)
    const dist = makeDist(graph, LayerTotalPortDistributor)
    dist.distributePortsWhileSweeping(graph.toNodeArray(), 0, true)
    const alF = 2 * l0.getNodes().length + 1
    const posDummy = dist.nodePositions[0]![1]!
    expect(dist.portBarycenter[portIn.id]).toBe(alF - posDummy)
  })

  it('NORTH input-only: barycenter 精确 = -pos(dummy)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const ew = addNodeToLayer(graph, l1)
    makeNsDummy(origin, graph, ew, PortSide.NORTH, 'in')
    const portIn = origin.getPorts()[0]!
    setUpIds(graph)
    const dist = makeDist(graph, LayerTotalPortDistributor)
    dist.distributePortsWhileSweeping(graph.toNodeArray(), 0, true)
    const posDummy = dist.nodePositions[0]![1]!
    expect(dist.portBarycenter[portIn.id]).toBe(-posDummy)
  })

  it('output-only: barycenter 精确 = pos(dummy) + 1', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const ew = addNodeToLayer(graph, l1)
    makeNsDummy(origin, graph, ew, PortSide.SOUTH, 'out')
    const portOut = origin.getPorts()[0]!
    setUpIds(graph)
    const dist = makeDist(graph, LayerTotalPortDistributor)
    dist.distributePortsWhileSweeping(graph.toNodeArray(), 0, true)
    const posDummy = dist.nodePositions[0]![1]!
    expect(dist.portBarycenter[portOut.id]).toBe(posDummy + 1.0)
  })

  it('input&&output: NORTH=0.0, SOUTH=absurdlyLargeFloat/2 (精确)', () => {
    for (const side of [PortSide.NORTH, PortSide.SOUTH]) {
      const graph = new LGraph()
      const l0 = makeLayer(graph)
      const l1 = makeLayer(graph)
      const origin = addNodeToLayer(graph, l0)
      const ew1 = addNodeToLayer(graph, l1)
      const port = addPortOnSide(origin, side)
      const d = addNodeToLayer(graph, l0)
      d.setType(NodeType.NORTH_SOUTH_PORT)
      d.setProperty(ILU, origin)
      d.setProperty(ORG, origin)
      const dpIn = addPortOnSide(d, PortSide.WEST)
      dpIn.setProperty(ORG, port)
      const dpOut = addPortOnSide(d, PortSide.EAST)
      dpOut.setProperty(ORG, port)
      port.setProperty(PDM, d)
      const ewPort1 = addPortOnSide(ew1, PortSide.EAST)
      addEdgeBetweenPorts(ewPort1, dpIn)
      const ew2 = addNodeToLayer(graph, l1)
      const ewPort2 = addPortOnSide(ew2, PortSide.EAST)
      addEdgeBetweenPorts(dpOut, ewPort2)
      setUpIds(graph)
      const dist = makeDist(graph, LayerTotalPortDistributor)
      dist.distributePortsWhileSweeping(graph.toNodeArray(), 0, true)
      const alF = 2 * l0.getNodes().length + 1
      if (side === PortSide.NORTH) {
        expect(dist.portBarycenter[port.id]).toBe(0.0)
      } else {
        expect(dist.portBarycenter[port.id]).toBe(alF / 2)
      }
    }
  })

  it('EAST 层内边: barycenter >= nodeIndexInLayer 走 maxBarycenter + (layerSize - barycenter)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const other = addNodeToLayer(graph, l0)
    addNodeToLayer(graph, l1)
    const p0 = addPortOnSide(origin, PortSide.EAST)
    const q0 = addPortOnSide(other, PortSide.EAST)
    addEdgeBetweenPorts(p0, q0)
    setUpIds(graph)
    const dist = makeDist(graph, LayerTotalPortDistributor)
    const nodeArray = graph.toNodeArray()
    dist.calculatePortRanksForLayer(nodeArray[1]!, PT.INPUT)
    dist.distributePortsWhileSweeping(nodeArray, 0, false)
    // barycenter = pos(other)+1 = 2 >= nodeIndexInLayer(1) → maxBarycenter + (layerSize - 2)
    expect(dist.portBarycenter[p0.id]).toBe(0 + (l0.getNodes().length + 1 - 2))
  })

  it('LayerTotal INPUT: NORTH 端口逆序 rank (northPos--)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const n = addNodeToLayer(graph, l1)
    const left = addNodeToLayer(graph, l0)
    const pn1 = addPortOnSide(n, PortSide.NORTH)
    const pn2 = addPortOnSide(n, PortSide.NORTH)
    const pw = addPortOnSide(n, PortSide.WEST)
    const lp1 = addPortOnSide(left, PortSide.EAST)
    const lp2 = addPortOnSide(left, PortSide.EAST)
    const lp3 = addPortOnSide(left, PortSide.EAST)
    addEdgeBetweenPorts(lp1, pn1)
    addEdgeBetweenPorts(lp2, pn2)
    addEdgeBetweenPorts(lp3, pw)
    setUpIds(graph)
    const dist = makeDist(graph, LayerTotalPortDistributor)
    dist.calculatePortRanksForLayer(graph.toNodeArray()[1]!, PT.INPUT)
    // northPos 初始 = 0 + northInputCount(2) = 2 → pn1=2, pn2=1; restPos = 0 + inputCount(3) = 3 → pw=3
    expect(dist.getPortRanks()[pn1.id]).toBe(2)
    expect(dist.getPortRanks()[pn2.id]).toBe(1)
    expect(dist.getPortRanks()[pw.id]).toBe(3)
  })

  it('NodeRelative INPUT: NORTH 端口 rank 用 incr 递减', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const n = addNodeToLayer(graph, l1)
    const left = addNodeToLayer(graph, l0)
    const pn = addPortOnSide(n, PortSide.NORTH)
    const pw = addPortOnSide(n, PortSide.WEST)
    const lp1 = addPortOnSide(left, PortSide.EAST)
    const lp2 = addPortOnSide(left, PortSide.EAST)
    addEdgeBetweenPorts(lp1, pn)
    addEdgeBetweenPorts(lp2, pw)
    setUpIds(graph)
    const dist = makeDist(graph, NodeRelativePortDistributor)
    dist.calculatePortRanksForLayer(graph.toNodeArray()[1]!, PT.INPUT)
    // incr = 1/(2+1) = 1/3; northPos = 0 + 1*(1/3) → pn=1/3; restPos = 0+1-1/3=2/3 → pw=2/3
    expect(dist.getPortRanks()[pn.id]).toBeCloseTo(1 / 3)
    expect(dist.getPortRanks()[pw.id]).toBeCloseTo(2 / 3)
  })

  it('LayerTotal calculatePortRanks 非法类型: 抛 IllegalArgumentException', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const n = addNodeToLayer(graph, l0)
    addPortOnSide(n, PortSide.EAST)
    setUpIds(graph)
    const dist = makeDist(graph, LayerTotalPortDistributor)
    const nodeArray = graph.toNodeArray()
    expect(() => (dist as any).calculatePortRanks(nodeArray[0]![0]!, 0, 'BOGUS')).toThrow('IllegalArgumentException')
  })

  it('NodeRelative calculatePortRanks 非法类型: 抛 Port type is undefined', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const n = addNodeToLayer(graph, l0)
    addPortOnSide(n, PortSide.EAST)
    setUpIds(graph)
    const dist = makeDist(graph, NodeRelativePortDistributor)
    const nodeArray = graph.toNodeArray()
    expect(() => (dist as any).calculatePortRanks(nodeArray[0]![0]!, 0, 'BOGUS')).toThrow('Port type is undefined')
  })

  it('GGN_P3_DBG LayerTotal INPUT rank 调试块: 结构 + rank 序列', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const n = addNodeToLayer(graph, l1)
    const left = addNodeToLayer(graph, l0)
    const pn1 = addPortOnSide(n, PortSide.NORTH)
    const pn2 = addPortOnSide(n, PortSide.NORTH)
    const pw = addPortOnSide(n, PortSide.WEST)
    const lp1 = addPortOnSide(left, PortSide.EAST)
    const lp2 = addPortOnSide(left, PortSide.EAST)
    const lp3 = addPortOnSide(left, PortSide.EAST)
    addEdgeBetweenPorts(lp1, pn1)
    addEdgeBetweenPorts(lp2, pn2)
    addEdgeBetweenPorts(lp3, pw)
    setUpIds(graph)
    const dist = makeDist(graph, LayerTotalPortDistributor)
    const origErr = console.error
    const calls: string[] = []
    console.error = (...args: unknown[]) => { calls.push(args.map(String).join(' ')) }
    try {
      process.env.GGN_P3_DBG = '1'
      dist.calculatePortRanksForLayer(graph.toNodeArray()[1]!, PT.INPUT)
      expect(calls).toHaveLength(3)
      for (const c of calls) {
        expect(c).toMatch(/^GGN rank INPUT node=0 L1 port=\d+ rank=\d+ conn=<-0$/)
      }
      const ranks = calls.map(c => Number(c.match(/rank=(\d+)/)![1]!)).sort((a, b) => a - b)
      expect(ranks).toEqual([1, 2, 3])
    } finally {
      console.error = origErr
      delete process.env.GGN_P3_DBG
    }
  })

  it('GGN_PD + nextBoolean=false: 输出 LayerTotal 分支', () => {
    const origErr = console.error
    const calls: string[] = []
    console.error = (...args: unknown[]) => { calls.push(args.map(String).join(' ')) }
    try {
      process.env.GGN_PD = '1'
      const r = new MR()
      r.setNextBoolean(false)
      const pd = createPortDistributor(CrossMinType.BARYCENTER, r as any, [])
      expect(calls).toEqual(['GGN_PD LayerTotal (nextBoolean=false)'])
      expect((pd as any).constructor.name).toBe('LayerTotalPortDistributor')
    } finally {
      console.error = origErr
      delete process.env.GGN_PD
    }
  })
})

// ============================================================================
// X1 续接: GGN_GPD_DBG 调试块 (compound 节点 inner layers 打印)
// ============================================================================

describe('GreedyPortDistributor GGN_GPD_DBG (X1)', () => {
  it('compound 节点走 hierarchical: 输出 inner layers 调试串', () => {
    const tg = new TestGraphCreator()
    const outer = tg.addNodeToLayer(tg.makeLayer())
    const inner = tg.nestedGraph(outer)
    tg.addNodesToLayer(1, tg.makeLayer(inner))
    const right = tg.addNodeToLayer(tg.makeLayer())
    tg.eastWestEdgeFromTo(outer, right)
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    const origErr = console.error
    const calls: string[] = []
    console.error = (...args: unknown[]) => { calls.push(args.map(String).join(' ')) }
    try {
      process.env.GGN_GPD_DBG = '1'
      const pd = new GreedyPortDistributor()
      initInitializables([pd], order)
      pd.distributePortsWhileSweeping(order, 0, false)
      expect(calls.length).toBeGreaterThanOrEqual(1)
      for (const c of calls) {
        expect(c).toMatch(/^GPD inner layers: \d+(?: \d+)*$/)
      }
    } finally {
      console.error = origErr
      delete process.env.GGN_GPD_DBG
    }
  })
})
