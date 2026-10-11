/**
 * 移植自 ELK Java: intermediate/greedyswitch/InLayerEdgeTwoNodeCrossingCounterTest.java
 * 统计同层两节点之间、层内边与跨层边的交叉数 (WEST/EAST 两侧)。
 */
import { describe, expect, it } from 'vitest'
import { LNode, PortSide } from '../../src/index.js'
import { CrossingsCounter } from '../../src/p3order/counting.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'

describe('InLayerEdgeTwoNodeCrossingCounter (ELK Java 移植)', () => {
  it('ignoresInBetweenLayerEdges', () => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(0)
    expect(lowerUpper).toBe(0)
  })

  it('countInLayerEdgeWithNormalEdgeCrossing', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesGraph()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(1)
    expect(lowerUpper).toBe(0)
  })

  it('crossingsWhenSwitched', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesGraphWhichResultsInCrossingsWhenSwitched()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 1, 2)
    expect(upperLower).toBe(0)
    expect(lowerUpper).toBe(1)
  })

  it('inLayerEdgeOnLowerNode', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesGraph()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(1)
    expect(lowerUpper).toBe(0)
  })

  it('switchNodeOrder', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesGraph()
    const ctx = initLayer(tg, 1)
    ctx.switchOrderAndNotifyCounter(1, 2)
    const { upperLower, lowerUpper } = ctx.count(0, 1)
    expect(upperLower).toBe(0)
    expect(lowerUpper).toBe(0)
  })

  it('fixedPortOrderCrossingToInBetweenLayerEdge', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesGraphWithCrossingsToBetweenLayerEdgeWithFixedPortOrder()
    let { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(1)
    expect(lowerUpper).toBe(2)
    const ctx = initLayer(tg, 1)
    ctx.switchOrderAndNotifyCounter(0, 1)
    ;({ upperLower, lowerUpper } = ctx.count(0, 1))
    expect(upperLower).toBe(2)
    expect(lowerUpper).toBe(1)
  })

  it('fixedPortOrderCrossingsAndNormalEdgeCrossings', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesWithFixedPortOrderAndNormalEdgeCrossings()
    let { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(2)
    expect(lowerUpper).toBe(1)
    const ctx = initLayer(tg, 1)
    ctx.switchOrderAndNotifyCounter(0, 1)
    ;({ upperLower, lowerUpper } = ctx.count(0, 1))
    expect(upperLower).toBe(1)
    expect(lowerUpper).toBe(2)
  })

  it('ignoresSelfLoops', () => {
    const tg = new TestGraphCreator()
    tg.getCrossWithManySelfLoopsGraph()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(0)
    expect(lowerUpper).toBe(0)
  })

  it('crossingsOnBothSides', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerCrossingsOnBothSides()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(2)
    expect(lowerUpper).toBe(0)
  })

  it('fixedPortOrderInLayerNoCrossings', () => {
    const tg = new TestGraphCreator()
    tg.getFixedPortOrderInLayerEdgesDontCrossEachOther()
    const { upperLower, lowerUpper } = countInLayer(tg, 0, 0, 1)
    expect(upperLower).toBe(0)
    expect(lowerUpper).toBe(0)
  })

  it('fixedPortOrderInLayerWithAlwaysRemaingCrossingsAreNotCounted', () => {
    const tg = new TestGraphCreator()
    tg.getFixedPortOrderInLayerEdgesWithCrossings()
    const { upperLower, lowerUpper } = countInLayer(tg, 0, 0, 1)
    expect(upperLower).toBe(1)
    expect(lowerUpper).toBe(1)
  })

  it('oneNode', () => {
    const tg = new TestGraphCreator()
    tg.getOneNodeGraph()
    const { upperLower, lowerUpper } = countInLayer(tg, 0, 0, 0)
    expect(upperLower).toBe(0)
    expect(lowerUpper).toBe(0)
  })

  it('moreComplex', () => {
    const tg = new TestGraphCreator()
    tg.getMoreComplexInLayerGraph()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(6)
    expect(lowerUpper).toBe(6)
  })

  it('downwardInLayerEdgesOnLowerNode', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesFixedPortOrderInLayerAndInBetweenLayerCrossing()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(2)
    expect(lowerUpper).toBe(2)
  })

  it('oneLayerInLayerCrossingShouldDisappearAfterAnySwitch', () => {
    const tg = new TestGraphCreator()
    tg.getOneLayerWithInLayerCrossings()
    let { upperLower, lowerUpper } = countInLayer(tg, 0, 0, 1)
    expect(upperLower).toBe(1); expect(lowerUpper).toBe(0)
    ;({ upperLower, lowerUpper } = countInLayer(tg, 0, 1, 2))
    expect(upperLower).toBe(1); expect(lowerUpper).toBe(0)
    ;({ upperLower, lowerUpper } = countInLayer(tg, 0, 2, 3))
    expect(upperLower).toBe(1); expect(lowerUpper).toBe(0)

    const ctx = initLayer(tg, 0)
    ctx.switchOrderAndNotifyCounter(0, 1)
    ;({ upperLower, lowerUpper } = ctx.count(0, 1))
    expect(upperLower).toBe(0); expect(lowerUpper).toBe(1)

    ctx.switchOrderAndNotifyCounter(0, 1)
    ctx.switchOrderAndNotifyCounter(1, 2)
    ;({ upperLower, lowerUpper } = ctx.count(1, 2))
    expect(upperLower).toBe(0); expect(lowerUpper).toBe(1)

    ctx.switchOrderAndNotifyCounter(1, 2)
    ctx.switchOrderAndNotifyCounter(2, 3)
    ;({ upperLower, lowerUpper } = ctx.count(2, 3))
    expect(upperLower).toBe(0); expect(lowerUpper).toBe(1)
  })

  it('moreThanOneEdgeIntoAPort', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesMultipleEdgesIntoSinglePort()
    const { upperLower, lowerUpper } = countInLayer(tg, 1, 1, 2)
    expect(upperLower).toBe(2)
    expect(lowerUpper).toBe(0)
  })

  it('inBetweenLayerEdgesIntoNodeWithNoFixedPortOrderCauseCrossings', () => {
    const tg = new TestGraphCreator()
    tg.multipleInBetweenLayerEdgesIntoNodeWithNoFixedPortOrderCauseCrossings()
    let { upperLower, lowerUpper } = countInLayer(tg, 1, 0, 1)
    expect(upperLower).toBe(2); expect(lowerUpper).toBe(0)
    ;({ upperLower, lowerUpper } = countInLayer(tg, 1, 1, 2))
    expect(upperLower).toBe(2); expect(lowerUpper).toBe(0)
  })

  it('inLayerEdgesPassEachOther', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerOneLayerNoCrossings()
    let { upperLower, lowerUpper } = countInLayer(tg, 0, 0, 1)
    expect(upperLower).toBe(0); expect(lowerUpper).toBe(1)
    ;({ upperLower, lowerUpper } = countInLayer(tg, 0, 1, 2))
    expect(upperLower).toBe(0); expect(lowerUpper).toBe(0)
    ;({ upperLower, lowerUpper } = countInLayer(tg, 0, 2, 3))
    expect(upperLower).toBe(0); expect(lowerUpper).toBe(1)
  })

  it('fixedPortOrderCrossingToInLayerEdge', () => {
    const tg = new TestGraphCreator()
    tg.getInLayerEdgesFixedPortOrderInLayerCrossing()
    const { upperLower, lowerUpper } = countInLayer(tg, 0, 1, 2)
    expect(upperLower).toBe(1)
    expect(lowerUpper).toBe(0)
  })

  it('fixedPortOrderTwoInLayerEdgesCrossEachOther', () => {
    const tg = new TestGraphCreator()
    tg.getFixedPortOrderTwoInLayerEdgesCrossEachOther()
    const { upperLower, lowerUpper } = countInLayer(tg, 0, 0, 1)
    expect(upperLower).toBe(1)
    expect(lowerUpper).toBe(0)
  })

  it('multipleEdgesIntoOnePort_ShouldNotCauseCrossing', () => {
    const tg = new TestGraphCreator()
    const nodes = tg.addNodesToLayer(3, tg.makeLayer())
    const portSide = PortSide.EAST
    const portOne = tg.addPortOnSide(nodes[0]!, portSide)
    const portTwo = tg.addPortOnSide(nodes[1]!, portSide)
    const portThree = tg.addPortOnSide(nodes[2]!, portSide)
    tg.addEdgeBetweenPorts(portOne, portThree)
    tg.addEdgeBetweenPorts(portTwo, portThree)
    const { upperLower, lowerUpper } = countInLayer(tg, 0, 0, 1)
    expect(upperLower).toBe(0)
    expect(lowerUpper).toBe(0)
  })
})

type Counts = { upperLower: number, lowerUpper: number }

interface LayerCtx {
  count(upper: number, lower: number): Counts
  switchOrderAndNotifyCounter(i: number, j: number): void
}

function initLayer(tg: TestGraphCreator, layerIndex: number): LayerCtx {
  const currentOrder = tg.getGraph().toNodeArray()
  const nodeOrder = currentOrder[layerIndex]!
  numberIdsAscendinglyIn(nodeOrder)
  const nPorts = tg.getNumPorts(currentOrder)
  const leftCounter = new CrossingsCounter(new Array<number>(nPorts))
  const rightCounter = new CrossingsCounter(new Array<number>(nPorts))
  leftCounter.initPortPositionsForInLayerCrossings(nodeOrder, PortSide.WEST)
  rightCounter.initPortPositionsForInLayerCrossings(nodeOrder, PortSide.EAST)
  return {
    count(upper, lower) {
      const left = leftCounter.countInLayerCrossingsBetweenNodesInBothOrders(nodeOrder[upper]!, nodeOrder[lower]!, PortSide.WEST)
      const right = rightCounter.countInLayerCrossingsBetweenNodesInBothOrders(nodeOrder[upper]!, nodeOrder[lower]!, PortSide.EAST)
      return { upperLower: left.first + right.first, lowerUpper: left.second + right.second }
    },
    switchOrderAndNotifyCounter(i, j) {
      leftCounter.switchNodes(nodeOrder[i]!, nodeOrder[j]!, PortSide.WEST)
      rightCounter.switchNodes(nodeOrder[i]!, nodeOrder[j]!, PortSide.EAST)
      const one = nodeOrder[i]!
      nodeOrder[i] = nodeOrder[j]!
      nodeOrder[j] = one
    },
  }
}

function countInLayer(tg: TestGraphCreator, layerIndex: number, upper: number, lower: number): Counts {
  return initLayer(tg, layerIndex).count(upper, lower)
}

function numberIdsAscendinglyIn(nodes: LNode[]): void {
  for (let i = 0; i < nodes.length; i++) nodes[i]!.id = i
}
