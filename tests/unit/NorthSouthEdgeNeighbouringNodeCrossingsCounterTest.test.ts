/**
 * 移植自 ELK Java: intermediate/greedyswitch/NorthSouthEdgeNeighbouringNodeCrossingsCounterTest.java
 * 统计 NS dummy 顺序造成的交叉 + NS 边与长边 dummy 的交叉。
 */
import { describe, expect, it } from 'vitest'
import { LNode, PortSide } from '../../src/index.js'
import { NorthSouthEdgeNeighbouringNodeCrossingsCounter } from '../../src/intermediate/greedyswitch/greedy-switch-heuristic.js'
import { ORIGIN } from '../../src/options/internal-properties.js'
import { NorthSouthEdgeTestGraphCreator } from './helpers/TestGraphCreator.js'

describe('NorthSouthEdgeNeighbouringNodeCrossingsCounter (ELK Java 移植)', () => {
  it('noNorthSouthNode', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getCrossFormedGraph()
    const c = countInLayer(tg, 0, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('southernNorthSouthNodeCrossing', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthDownwardCrossingGraph()
    const c = countInLayer(tg, 0, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('northernNorthSouthNodeCrossings', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthUpwardCrossingGraph()
    const c = countInLayer(tg, 0, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('oneNodeIsLongEdgeDummy', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernNorthSouthDummyEdgeCrossingGraph()
    let c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
    const ctx = switchNodes(tg, 1, 1, 2)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[1]!, ctx.layer[2]!)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('oneNodeIsLongEdgeDummyNorthern', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthernNorthSouthDummyEdgeCrossingGraph()
    let c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
    const ctx = switchNodes(tg, 1, 0, 1)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[0]!, ctx.layer[1]!)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('withNormalNode', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthDownwardCrossingGraph()
    const c = countInLayer(tg, 0, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('northSouthEdgesComeFromBothSidesDontCross', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernNorthSouthGraphEdgesFromEastAndWestNoCrossings()
    let c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(0)
    tg.getNorthernNorthSouthGraphEdgesFromEastAndWestNoCrossings()
    c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('southernNorthSouthEdgesBothToEast', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernNorthSouthEdgesBothToEast()
    const c = countInLayer(tg, 0, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('crossingsWithNorthSouthPortsBelongingToDifferentNodesShouldNotBeCounted', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getGraphWhereLayoutUnitPreventsSwitch()
    const c = countInLayer(tg, 0, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('northSouthEdgesComeFromBothSidesDoCross', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthEdgesFromEastAndWestAndCross()
    const c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('switchNodesAndRecount', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthUpwardCrossingGraph()
    let c = countInLayer(tg, 0, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
    const ctx = switchNodes(tg, 0, 0, 1)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[0]!, ctx.layer[1]!)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('southPortOndNormalNodeBelowLongEdgeDummy', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthPortOnNormalNodeBelowLongEdgeDummy()
    let c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
    const ctx = switchNodes(tg, 1, 0, 1)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[0]!, ctx.layer[1]!)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('northPortOndNormalNodeAboveLongEdgeDummy', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthPortOndNormalNodeAboveLongEdgeDummy()
    let c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
    const ctx = switchNodes(tg, 1, 1, 2)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[1]!, ctx.layer[2]!)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('southernTwoWesternEdges', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthSouthernTwoWesternEdges()
    let c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
    const ctx = switchNodes(tg, 1, 1, 2)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[1]!, ctx.layer[2]!)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('southernWesternPortToEastAndEasternPortToWest', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthSouthernWesternPortToEastAndEasternPortToWest()
    let c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(1)
    const ctx = switchNodes(tg, 1, 1, 2)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[1]!, ctx.layer[2]!)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('northernBothEdgesWestern', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthNorthernWesternEdges()
    let c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(1)
    const ctx = switchNodes(tg, 1, 0, 1)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[0]!, ctx.layer[1]!)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('northernEasternPortToWestWesternPortToEast', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthNorthernEasternPortToWestWesternPortToEast()
    let c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(1)
    const ctx = switchNodes(tg, 1, 0, 1)
    c = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(ctx.layer)
    c.countCrossings(ctx.layer[0]!, ctx.layer[1]!)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('normalNodesNorthSouthEdgesHaveCrossingsToLongEdgeDummy', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthernNorthSouthDummyEdgeCrossingGraph()
    let c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1); expect(c.getLowerUpperCrossings()).toBe(0)
    c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(1); expect(c.getLowerUpperCrossings()).toBe(0)
    tg.getSouthernNorthSouthDummyEdgeCrossingGraph()
    c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1); expect(c.getLowerUpperCrossings()).toBe(0)
    c = countInLayer(tg, 1, 1, 2)
    expect(c.getUpperLowerCrossings()).toBe(1); expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('normalNodesNorthSouthEdgesHaveCrossingsToLongEdgeDummyOnBothSides', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getMultipleNorthSouthAndLongEdgeDummiesOnBothSides()
    const c = countInLayer(tg, 1, 2, 3)
    expect(c.getUpperLowerCrossings()).toBe(2)
    expect(c.getLowerUpperCrossings()).toBe(2)
  })

  it('ignoresUnconnectedPortsForNormalNodeAndLongEdgeDummies', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getLongEdgeDummyAndNormalNodeWithUnusedPortsOnSouthernSide()
    let c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    tg.getLongEdgeDummyAndNormalNodeWithUnusedPortsOnNorthernSide()
    c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
  })

  it('oneEdgeWestOneEdgeEastDontCross', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthernNorthSouthGraphEdgesFromEastAndWestNoCrossings()
    const c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('oneEdgeEastOneEdgeWestDontCross', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthernNorthSouthGraphEdgesFromEastAndWestNoCrossingsUpperEdgeEast()
    const c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(0)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('givenPolylineRoutingWhenMoreThanOneEdgeIntoNSNode_countsTheseToo', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const middleNodes = tg.addNodesToLayer(3, tg.makeLayer())
    const rightNodes = tg.addNodesToLayer(2, tg.makeLayer())
    tg.setFixedOrderConstraint(middleNodes[2]!)
    tg.addNorthSouthEdge(PortSide.NORTH, middleNodes[2]!, middleNodes[1]!, rightNodes[0]!, false)
    tg.addNorthSouthEdge(PortSide.NORTH, middleNodes[2]!, middleNodes[0]!, leftNode, true)
    const middleNodePort = middleNodes[1]!.getPorts()[0]!
    tg.eastWestEdgeFromTo(middleNodePort, rightNodes[1]!)
    tg.getGraph().setProperty('org.eclipse.elk.edgeRouting' as never, 'POLYLINE')
    const c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(2)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('givenMultipleEdgesInOneNSNodeCountsCrossings', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const middleLayer = tg.addNodesToLayer(3, tg.makeLayer())
    const rightLayer = tg.addNodesToLayer(2, tg.makeLayer())
    tg.setFixedOrderConstraint(middleLayer[2]!)
    tg.addNorthSouthEdge(PortSide.NORTH, middleLayer[2]!, middleLayer[1]!, leftNode, true)
    const normalNodePort = tg.addPortOnSide(rightLayer[1]!, PortSide.WEST)
    const dummyNodePort = tg.addPortOnSide(middleLayer[1]!, PortSide.EAST)
    tg.addEdgeBetweenPorts(dummyNodePort, normalNodePort)
    const originPort = middleLayer[2]!.getPorts()[0]!
    dummyNodePort.setProperty(ORIGIN, originPort)
    tg.addNorthSouthEdge(PortSide.NORTH, middleLayer[2]!, middleLayer[0]!, rightLayer[0]!, false)
    const c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(0)
  })

  it('edgesInBothDirections', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const leftLayer = tg.addNodesToLayer(2, tg.makeLayer())
    const middleLayer = tg.addNodesToLayer(3, tg.makeLayer())
    const rightLayer = tg.addNodesToLayer(2, tg.makeLayer())
    tg.setFixedOrderConstraint(middleLayer[2]!)
    tg.addNorthSouthEdge(PortSide.NORTH, middleLayer[2]!, middleLayer[1]!, leftLayer[1]!, true)
    let normalNodePort = tg.addPortOnSide(rightLayer[1]!, PortSide.WEST)
    let dummyNodePort = tg.addPortOnSide(middleLayer[1]!, PortSide.EAST)
    tg.addEdgeBetweenPorts(dummyNodePort, normalNodePort)
    let originPort = middleLayer[2]!.getPorts()[0]!
    dummyNodePort.setProperty(ORIGIN, originPort)
    tg.addNorthSouthEdge(PortSide.NORTH, middleLayer[2]!, middleLayer[0]!, leftLayer[0]!, true)
    normalNodePort = tg.addPortOnSide(rightLayer[0]!, PortSide.WEST)
    dummyNodePort = tg.addPortOnSide(middleLayer[0]!, PortSide.EAST)
    tg.addEdgeBetweenPorts(dummyNodePort, normalNodePort)
    originPort = middleLayer[2]!.getPorts()[1]!
    dummyNodePort.setProperty(ORIGIN, originPort)
    const c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(1)
    expect(c.getLowerUpperCrossings()).toBe(1)
  })

  it('multipleEdgesInBothDirectionsNSNode', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const leftLayer = tg.addNodesToLayer(2, tg.makeLayer())
    const middleLayer = tg.addNodesToLayer(3, tg.makeLayer())
    const rightLayer = tg.addNodesToLayer(2, tg.makeLayer())
    tg.setFixedOrderConstraint(middleLayer[2]!)
    tg.addNorthSouthEdge(PortSide.NORTH, middleLayer[2]!, middleLayer[1]!, leftLayer[1]!, true)
    let normalNodePort = tg.addPortOnSide(rightLayer[1]!, PortSide.WEST)
    let dummyNodePort = tg.addPortOnSide(middleLayer[1]!, PortSide.EAST)
    tg.addEdgeBetweenPorts(dummyNodePort, normalNodePort)
    tg.addEdgeBetweenPorts(dummyNodePort, normalNodePort)
    let originPort = middleLayer[2]!.getPorts()[0]!
    dummyNodePort.setProperty(ORIGIN, originPort)
    tg.addNorthSouthEdge(PortSide.NORTH, middleLayer[2]!, middleLayer[0]!, rightLayer[0]!, false)
    normalNodePort = tg.addPortOnSide(rightLayer[0]!, PortSide.EAST)
    dummyNodePort = tg.addPortOnSide(middleLayer[0]!, PortSide.WEST)
    tg.addEdgeBetweenPorts(dummyNodePort, normalNodePort)
    tg.addEdgeBetweenPorts(dummyNodePort, normalNodePort)
    originPort = middleLayer[2]!.getPorts()[1]!
    dummyNodePort.setProperty(ORIGIN, originPort)
    const c = countInLayer(tg, 1, 0, 1)
    expect(c.getUpperLowerCrossings()).toBe(2)
    expect(c.getLowerUpperCrossings()).toBe(2)
  })
})

function countInLayer(tg: NorthSouthEdgeTestGraphCreator, layerIndex: number, upper: number, lower: number):
  NorthSouthEdgeNeighbouringNodeCrossingsCounter {
  const layer = tg.getGraph().toNodeArray()[layerIndex]!
  const counter = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(layer)
  counter.countCrossings(layer[upper]!, layer[lower]!)
  return counter
}

function switchNodes(tg: NorthSouthEdgeTestGraphCreator, layerIndex: number, upper: number, lower: number): { layer: LNode[] } {
  const layer = tg.getGraph().toNodeArray()[layerIndex]!
  const upperNode = layer[upper]!
  const lowerNode = layer[lower]!
  layer[upper] = lowerNode
  layer[lower] = upperNode
  return { layer }
}
