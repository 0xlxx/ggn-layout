/**
 * 移植自 ELK Java: intermediate/greedyswitch/BetweenLayerEdgeTwoNodeCrossingsCounterTest.java
 * 统计相邻两层两节点之间、跨层边与层内边/自环的交叉数。
 */
import { describe, expect, it } from 'vitest'
import { LNode, PortSide } from '../../src/index.js'
import { BetweenLayerEdgeTwoNodeCrossingsCounter } from '../../src/intermediate/greedyswitch/greedy-switch-heuristic.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'

describe('BetweenLayerEdgeTwoNodeCrossingsCounter (ELK Java 移植)', () => {
  it('twoNodeNoEdges', () => {
    const tg = new TestGraphCreator()
    tg.getTwoNodesNoConnectionGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 0)
    const upper = nodeOrder[0]![0]!
    const lower = nodeOrder[0]![1]!
    assertAllZero(counter, upper, lower)
  })

  it('crossFormed', () => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![1]!
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
  })

  it('oneNode', () => {
    const tg = new TestGraphCreator()
    tg.getOneNodeGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 0)
    const upper = nodeOrder[0]![0]!
    const lower = nodeOrder[0]![0]!
    assertAllZero(counter, upper, lower)
  })

  it('crossFormedMultipleEdgesBetweenSameNodes', () => {
    const tg = new TestGraphCreator()
    tg.getMultipleEdgesBetweenSameNodesGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![1]!
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 4, lowerUpper: 0 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 4, lowerUpper: 0 })
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
  })

  it('crossWithExtraEdgeInBetween', () => {
    const tg = new TestGraphCreator()
    tg.getCrossWithExtraEdgeInBetweenGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![2]!
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
  })

  it('ignoreInLayerEdges', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![2]!
    assertAllZero(counter, upper, lower)
  })

  it('ignoreSelfLoops', () => {
    const tg = new TestGraphCreator()
    tg.getCrossWithManySelfLoopsGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![1]!
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
  })

  it('moreComplexThreeLayerGraph', () => {
    const tg = new TestGraphCreator()
    tg.getMoreComplexThreeLayerGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![1]!
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 1 })
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 2, lowerUpper: 3 })
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 3, lowerUpper: 4 })
  })

  it('fixedPortOrder', () => {
    const tg = new TestGraphCreator()
    tg.getFixedPortOrderGraph()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![1]!
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
  })

  it('switchThreeTimes', () => {
    const tg = new TestGraphCreator()
    const leftNodes = tg.addNodesToLayer(2, tg.makeLayer())
    const rightNodes = tg.addNodesToLayer(4, tg.makeLayer())
    const leftTopPort = tg.addPortOnSide(leftNodes[0]!, PortSide.EAST)
    const leftLowerPort = tg.addPortOnSide(leftNodes[1]!, PortSide.EAST)
    const rightTopPort = tg.addPortOnSide(rightNodes[0]!, PortSide.WEST)
    tg.addEdgeBetweenPorts(leftLowerPort, rightTopPort)
    tg.eastWestEdgeFromTo(leftLowerPort, rightNodes[2]!)
    tg.addEdgeBetweenPorts(leftTopPort, rightTopPort)
    tg.eastWestEdgeFromTo(leftTopPort, rightNodes[1]!)
    tg.eastWestEdgeFromTo(leftTopPort, rightNodes[3]!)
    tg.setUpIds()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 0)
    const upper = nodeOrder[0]![0]!
    const lower = nodeOrder[0]![1]!
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 3, lowerUpper: 2 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 3, lowerUpper: 2 })
  })

  it('intoSamePort', () => {
    const tg = new TestGraphCreator()
    tg.twoEdgesIntoSamePort()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 1)
    const upper = nodeOrder[1]![0]!
    const lower = nodeOrder[1]![1]!
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 2, lowerUpper: 0 })
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 2, lowerUpper: 0 })
  })

  it('intoSamePortCausesCrossingsOnSwitch', () => {
    const tg = new TestGraphCreator()
    tg.twoEdgesIntoSamePortCrossesWhenSwitched()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 0)
    const upper = nodeOrder[0]![0]!
    const lower = nodeOrder[0]![1]!
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 1 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 1 })
  })

  it('intoSamePortReducesCrossingsOnSwitch', () => {
    const tg = new TestGraphCreator()
    tg.twoEdgesIntoSamePortResolvesCrossingWhenSwitched()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 0)
    const upper = nodeOrder[0]![0]!
    const lower = nodeOrder[0]![1]!
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 1, lowerUpper: 0 })
  })

  it('intoSamePortFromEastSwitchWithFixedPortOrder', () => {
    const tg = new TestGraphCreator()
    tg.twoEdgesIntoSamePortFromEastWithFixedPortOrder()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 0)
    const upper = nodeOrder[0]![0]!
    const lower = nodeOrder[0]![1]!
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 1 })
    expect(countWest(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
    expect(countBoth(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 1 })
  })

  it('multipleEdgesIntoSamePort_causesNoCrossings', () => {
    const tg = new TestGraphCreator()
    const leftLayer = tg.makeLayer()
    const rightLayer = tg.makeLayer()
    const topLeft = tg.addNodeToLayer(leftLayer)
    const bottomLeft = tg.addNodeToLayer(leftLayer)
    const bottomRight = tg.addNodeToLayer(rightLayer)
    const bottomRightPort = tg.addPortOnSide(bottomRight, PortSide.WEST)
    tg.eastWestEdgeFromTo(topLeft, bottomRightPort)
    tg.eastWestEdgeFromTo(topLeft, bottomRightPort)
    tg.eastWestEdgeFromTo(bottomLeft, bottomRightPort)
    tg.setUpIds()
    const nodeOrder = tg.getGraph().toNodeArray()
    const counter = new BetweenLayerEdgeTwoNodeCrossingsCounter(nodeOrder, 0)
    const upper = nodeOrder[0]![0]!
    const lower = nodeOrder[0]![1]!
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
    expect(countEast(counter, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
  })
})

type Counts = { upperLower: number, lowerUpper: number }

function countBoth(c: BetweenLayerEdgeTwoNodeCrossingsCounter, upper: LNode, lower: LNode): Counts {
  c.countBothSideCrossings(upper, lower)
  return { upperLower: c.getUpperLowerCrossings(), lowerUpper: c.getLowerUpperCrossings() }
}
function countWest(c: BetweenLayerEdgeTwoNodeCrossingsCounter, upper: LNode, lower: LNode): Counts {
  c.countWesternEdgeCrossings(upper, lower)
  return { upperLower: c.getUpperLowerCrossings(), lowerUpper: c.getLowerUpperCrossings() }
}
function countEast(c: BetweenLayerEdgeTwoNodeCrossingsCounter, upper: LNode, lower: LNode): Counts {
  c.countEasternEdgeCrossings(upper, lower)
  return { upperLower: c.getUpperLowerCrossings(), lowerUpper: c.getLowerUpperCrossings() }
}
function assertAllZero(c: BetweenLayerEdgeTwoNodeCrossingsCounter, upper: LNode, lower: LNode): void {
  expect(countBoth(c, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
  expect(countWest(c, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
  expect(countEast(c, upper, lower)).toEqual({ upperLower: 0, lowerUpper: 0 })
}
