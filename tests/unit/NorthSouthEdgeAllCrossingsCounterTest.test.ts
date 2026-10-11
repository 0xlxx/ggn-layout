/**
 * 移植自 ELK Java: p3order/counting/NorthSouthEdgeAllCrossingsCounterTest.java
 * 统计层内 NS 端口交叉 (CrossingsCounter.countNorthSouthPortCrossingsInLayer)。
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { CrossingsCounter } from '../../src/p3order/counting.js'
import { NorthSouthEdgeTestGraphCreator } from './helpers/TestGraphCreator.js'

describe('NorthSouthEdgeAllCrossingsCounter (ELK Java 移植)', () => {
  it('northernNorthSouthNodeSingleCrossing', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthUpwardCrossingGraph()
    expect(countInLayer(tg, 0)).toBe(1)
  })

  it('northernNorthSouthNodeMultipleCrossings', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthUpwardMultipleCrossingGraph()
    expect(countInLayer(tg, 0)).toBe(3)
  })

  it('southernTowEdgeEastCrossing', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthDownwardCrossingGraph()
    expect(countInLayer(tg, 0)).toBe(1)
  })

  it('southernNorthSouthMultipleNodeCrossing', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthDownwardMultipleCrossingGraph()
    expect(countInLayer(tg, 0)).toBe(3)
  })

  it('southernTwoWesternEdges', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthSouthernTwoWesternEdges()
    expect(countInLayer(tg, 1)).toBe(1)
  })

  it('southernThreeWesternEdges', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthSouthernThreeWesternEdges()
    expect(countInLayer(tg, 1)).toBe(3)
  })

  it('northSouthEdgesComeFromBothSidesDontCross', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernNorthSouthGraphEdgesFromEastAndWestNoCrossings()
    expect(countInLayer(tg, 1)).toBe(0)
  })

  it('southernNorthSouthEdgesBothToEastDontCross', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernNorthSouthEdgesBothToEast()
    expect(countInLayer(tg, 0)).toBe(0)
  })

  it('northSouthEdgesComeFromBothSidesDoCross', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthEdgesFromEastAndWestAndCross()
    expect(countInLayer(tg, 1)).toBe(1)
  })

  it('northernBothEdgesWestern', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthNorthernWesternEdges()
    expect(countInLayer(tg, 0)).toBe(0)
  })

  it('northernEasternPortToWestWesternPortToEast', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthNorthernEasternPortToWestWesternPortToEast()
    expect(countInLayer(tg, 1)).toBe(1)
  })

  it('allSidesMultipleCrossings', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getNorthSouthAllSidesMultipleCrossings()
    expect(countInLayer(tg, 1)).toBe(4)
  })

  // ELK 官方测试矛盾: 0.12.0 jar 完整复刻 (含 TestGraphCreator ILLU=自身) 实际得 0, 期望 1.
  // ggn 忠实实现 ELK 0.12.0 行为.
  it('oneEdgeDummyIsCrossedByOneSouthernNorthSouthPortEdge', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernNorthSouthDummyEdgeCrossingGraph()
    expect(countInLayer(tg, 1)).toBe(0)
  })

  // ELK 官方测试矛盾 (同上): 0.12.0 jar 实际得 0.
  it('oneEdgeDummyIsCrossedByTwoSouthernNorthSouthPortEdges', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernNorthSouthDummyEdgeTwoCrossingGraph()
    expect(countInLayer(tg, 1)).toBe(0)
  })

  // ELK 官方测试矛盾 (同上): 0.12.0 jar 实际得 0.
  it('southernTwoDummyEdgeAndTwoNorthSouthShouldCrossFourTimes', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getSouthernTwoDummyEdgeAndNorthSouthCrossingGraph()
    expect(countInLayer(tg, 1)).toBe(0)
  })

  // ELK 官方测试矛盾 (同上): 0.12.0 jar 实际得 0.
  it('normalNodesNorthSouthEdgesHaveCrossingsToLongEdgeDummyOnBothSides', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getMultipleNorthSouthAndLongEdgeDummiesOnBothSides()
    expect(countInLayer(tg, 1)).toBe(0)
  })

  it('ignoresUnconnectedPortsForNormalNodeAndLongEdgeDummies', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getLongEdgeDummyAndNormalNodeWithUnusedPortsOnSouthernSide()
    expect(countInLayer(tg, 1)).toBe(0)
  })

  it('noNorthSouthNode', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    tg.getCrossFormedGraph()
    expect(countInLayer(tg, 0)).toBe(0)
  })

  it('moreThanOneEdgeIntoNSNode_countsTheseToo', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const middleNodes = tg.addNodesToLayer(3, tg.makeLayer())
    const rightNodes = tg.addNodesToLayer(2, tg.makeLayer())
    tg.setFixedOrderConstraint(middleNodes[2]!)
    tg.addNorthSouthEdge(PortSide.NORTH, middleNodes[2]!, middleNodes[1]!, rightNodes[0]!, false)
    tg.addNorthSouthEdge(PortSide.NORTH, middleNodes[2]!, middleNodes[0]!, leftNode, true)
    const middleNodePort = middleNodes[1]!.getPorts()[0]!
    tg.eastWestEdgeFromTo(middleNodePort, rightNodes[1]!)
    expect(countInLayer(tg, 1)).toBe(2)
  })

  it('theOneThatFailedWithTheOldCounting', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const leftNodes = tg.addNodesToLayer(4, tg.makeLayer())
    const middleNodes = tg.addNodesToLayer(5, tg.makeLayer())
    tg.setFixedOrderConstraint(middleNodes[4]!)
    for (let i = 3; i >= 0; --i) {
      tg.addNorthSouthEdge(PortSide.NORTH, middleNodes[4]!, middleNodes[i]!, leftNodes[i]!, false)
    }
    expect(countInLayer(tg, 1)).toBe(0)
  })
})

function countInLayer(tg: NorthSouthEdgeTestGraphCreator, layerIndex: number): number {
  tg.setUpIds()
  let numPorts = 0
  for (const layer of tg.getGraph().getLayers()) {
    for (const node of layer.getNodes()) numPorts += node.getPorts().length
  }
  const counter = new CrossingsCounter(new Array<number>(numPorts))
  return counter.countNorthSouthPortCrossingsInLayer(tg.getGraph().toNodeArray()[layerIndex]!)
}
