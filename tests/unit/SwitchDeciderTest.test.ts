/**
 * 移植自 ELK Java: intermediate/greedyswitch/SwitchDeciderTest.java
 * 参数化: ONE_SIDED_GREEDY_SWITCH / TWO_SIDED_GREEDY_SWITCH 两种 SwitchDecider 变体。
 */
import { describe, expect, it } from 'vitest'
import { LNode, PortSide } from '../../src/index.js'
import {
  CrossingMatrixFiller, CrossingCountSide, SwitchDecider,
} from '../../src/intermediate/greedyswitch/greedy-switch-heuristic.js'
import { CrossMinType } from '../../src/p3order/port-distributors.js'
import { GraphInfoHolder } from '../../src/p3order/graph-info-holder.js'
import { TestGraphCreator, NorthSouthEdgeTestGraphCreator } from './helpers/TestGraphCreator.js'

const TYPES = [CrossMinType.ONE_SIDED_GREEDY_SWITCH, CrossMinType.TWO_SIDED_GREEDY_SWITCH]

class SwitchDeciderHarness {
  freeLayerIndex = 0
  currentNodeOrder: LNode[][] = []
  decider!: SwitchDecider
  constructor(private readonly tg: TestGraphCreator, private readonly greedyType: CrossMinType) {}

  givenDeciderForFreeLayer(layerIndex: number, direction: CrossingCountSide): SwitchDecider {
    this.freeLayerIndex = layerIndex
    this.currentNodeOrder = this.tg.getGraph().toNodeArray()
    const filler = new CrossingMatrixFiller(this.greedyType, this.currentNodeOrder, layerIndex, direction)
    this.decider = new SwitchDecider(
      layerIndex,
      this.currentNodeOrder,
      filler,
      new Array<number>(this.getNPorts(this.currentNodeOrder)),
      new GraphInfoHolder(this.tg.getGraph(), CrossMinType.ONE_SIDED_GREEDY_SWITCH, []),
      this.greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH,
    )
    return this.decider
  }

  switchNodes(upper: number, lower: number): void {
    const layer = this.currentNodeOrder[this.freeLayerIndex]!
    const upperNode = layer[upper]!
    layer[upper] = layer[lower]!
    layer[lower] = upperNode
  }

  // ELK TestGraphCreator.copyOfNodesInLayer 读 graph.getLayers() (图原始顺序),
  // 与 switchNodes 交换的 currentNodeOrder (toNodeArray 副本) 不一致 — 官方测试的微妙行为.
  copyOfNodesInLayer(layerIndex: number): LNode[] {
    return [...this.tg.getGraph().getLayers()[layerIndex]!.getNodes()]
  }

  getNPorts(order: LNode[][]): number {
    let n = 0
    for (const layer of order) for (const node of layer) n += node.getPorts().length
    return n
  }
}

describe('SwitchDecider (ELK Java 移植)', () => {
  it.each(TYPES)('crossFormed (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getCrossFormedGraph()
    tg.setUpIds()
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST).doesSwitchReduceCrossings(0, 1)).toBe(true)
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 1)).toBe(true)
  })

  it.each(TYPES)('oneNode (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getOneNodeGraph()
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.WEST).doesSwitchReduceCrossings(0, 0)).toBe(false)
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 0)).toBe(false)
  })

  it.each(TYPES)('inLayerSwitchable (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getInLayerEdgesGraph()
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST).doesSwitchReduceCrossings(0, 1)).toBe(true)
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 1)).toBe(true)
  })

  it.each(TYPES)('multipleEdgesBetweenSameNodes (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getMultipleEdgesBetweenSameNodesGraph()
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST).doesSwitchReduceCrossings(0, 1)).toBe(true)
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 1)).toBe(true)
  })

  it.each(TYPES)('selfLoops (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getCrossWithManySelfLoopsGraph()
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST).doesSwitchReduceCrossings(0, 1)).toBe(true)
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 1)).toBe(true)
  })

  it.each(TYPES)('northSouthPortCrossing (%s)', (greedyType) => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getThreeLayerNorthSouthCrossingGraph()
    const decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(true)
    } else {
      expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(false)
    }
  })

  it.each(TYPES)('moreComplex (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getMoreComplexThreeLayerGraph()
    let decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    decider = h.givenDeciderForFreeLayer(2, CrossingCountSide.WEST)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(true)
    expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(false)
    decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.EAST)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    decider = h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(true)
  })

  it.each(TYPES)('switchOnlyTrueForOneSided (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getSwitchOnlyOneSided()
    const decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(true)
    } else {
      expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    }
  })

  it.each(TYPES)('switchOnlyTrueForOneSidedEasternSide (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getSwitchOnlyEastOneSided()
    const decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.EAST)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(true)
    } else {
      expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    }
  })

  it.each(TYPES)('constraintsPreventSwitch (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getCrossFormedGraphWithConstraintsInSecondLayer()
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST).doesSwitchReduceCrossings(0, 1)).toBe(false)
  })

  it.each(TYPES)('inLayerUnitConstraintsPreventSwitch (%s)', (greedyType) => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getGraphWhereLayoutUnitPreventsSwitch()
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.WEST).doesSwitchReduceCrossings(1, 2)).toBe(false)
  })

  it.each(TYPES)('switchAndRecount (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getCrossFormedGraph()
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST).doesSwitchReduceCrossings(0, 1)).toBe(true)
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 1)).toBe(true)
    h.switchNodes(0, 1)
    h.decider.notifyOfSwitch(h.copyOfNodesInLayer(0)[0]!, h.copyOfNodesInLayer(0)[1]!)
    expect(h.decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
  })

  it.each(TYPES)('switchAndRecountCounterBug (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
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
    const decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(true)
    expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(false)
    expect(decider.doesSwitchReduceCrossings(2, 3)).toBe(true)
    decider.notifyOfSwitch(h.currentNodeOrder[h.freeLayerIndex]![0]!, h.currentNodeOrder[h.freeLayerIndex]![1]!)
    h.switchNodes(0, 1)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(false)
    expect(decider.doesSwitchReduceCrossings(2, 3)).toBe(true)
    decider.notifyOfSwitch(h.currentNodeOrder[h.freeLayerIndex]![2]!, h.currentNodeOrder[h.freeLayerIndex]![3]!)
    h.switchNodes(2, 3)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(true)
    expect(decider.doesSwitchReduceCrossings(2, 3)).toBe(false)
    decider.notifyOfSwitch(h.currentNodeOrder[h.freeLayerIndex]![1]!, h.currentNodeOrder[h.freeLayerIndex]![2]!)
    h.switchNodes(1, 2)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(false)
    expect(decider.doesSwitchReduceCrossings(2, 3)).toBe(false)
  })

  it.each(TYPES)('switchAndRecountReducedCounterBug (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getSwitchedProblemGraph()
    const decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST)
    for (let i = 0; i < h.copyOfNodesInLayer(1).length - 1; i++) {
      expect(decider.doesSwitchReduceCrossings(i, i + 1)).toBe(false)
    }
  })

  it.each(TYPES)('shouldSwitchWithLongEdgeDummies (%s)', (greedyType) => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getNorthernNorthSouthDummyEdgeCrossingGraph()
    let decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST)
    expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(true)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(true)
    }
    tg.getSouthernNorthSouthDummyEdgeCrossingGraph()
    decider = h.givenDeciderForFreeLayer(1, CrossingCountSide.WEST)
    expect(decider.doesSwitchReduceCrossings(0, 1)).toBe(true)
    if (greedyType === CrossMinType.ONE_SIDED_GREEDY_SWITCH) {
      expect(decider.doesSwitchReduceCrossings(1, 2)).toBe(true)
    }
  })

  it.each(TYPES)('layoutUnitConstraintPreventsSwitchWithNodeWithNorthernPorts (%s)', (greedyType) => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getGraphLayoutUnitPreventsSwitchWithNodeWithNodeWithNorthernEdges()
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST).doesSwitchReduceCrossings(1, 2)).toBe(false)
  })

  it.each(TYPES)('layoutUnitConstraintPreventsSwitchWithNodeWithSouthernPorts (%s)', (greedyType) => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getGraphLayoutUnitPreventsSwitchWithNodeWithNodeWithSouthernEdges()
    expect(h.givenDeciderForFreeLayer(0, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 1)).toBe(false)
  })

  it.each(TYPES)('layoutUnitConstraintDoesNotPreventSwitchWithWhenOtherNodeIsLongEdgeDummy (%s)', (greedyType) => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    tg.getGraphLayoutUnitDoesNotPreventSwitchWithLongEdgeDummy()
    expect(h.givenDeciderForFreeLayer(1, CrossingCountSide.EAST).doesSwitchReduceCrossings(0, 1)).toBe(true)
  })

  it.each(TYPES)('switchingDummyNodesNotifiesPortSwitch (%s)', (greedyType) => {
    const tg = new TestGraphCreator()
    const h = new SwitchDeciderHarness(tg, greedyType as CrossMinType)
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const rightNodes = tg.addNodesToLayer(2, tg.makeLayer())
    const leftPorts = tg.addPortsOnSide(2, leftNode, PortSide.EAST)
    const nestedGraph = tg.nestedGraph(leftNode)
    const nestedLayer = tg.makeLayer(nestedGraph)
    const dummies = tg.addExternalPortDummiesToLayer(nestedLayer, leftPorts)
    tg.eastWestEdgeFromTo(leftPorts[0]!, rightNodes[1]!)
    tg.eastWestEdgeFromTo(leftPorts[1]!, rightNodes[0]!)
    const filler = new CrossingMatrixFiller(greedyType as CrossMinType, nestedGraph.toNodeArray(), 0, CrossingCountSide.EAST)
    const parentGraphData = new GraphInfoHolder(tg.getGraph(), greedyType as CrossMinType, [])
    const graphData = new GraphInfoHolder(nestedGraph, greedyType as CrossMinType, [parentGraphData])
    const switchDecider = new SwitchDecider(0, nestedGraph.toNodeArray(), filler,
      new Array<number>(h.getNPorts(nestedGraph.toNodeArray())), graphData, false)
    if (greedyType === CrossMinType.TWO_SIDED_GREEDY_SWITCH) {
      expect(switchDecider.doesSwitchReduceCrossings(0, 1)).toBe(true)
      switchDecider.notifyOfSwitch(dummies[0]!, dummies[1]!)
      expect(switchDecider.doesSwitchReduceCrossings(0, 1)).toBe(false)
    }
  })
})
