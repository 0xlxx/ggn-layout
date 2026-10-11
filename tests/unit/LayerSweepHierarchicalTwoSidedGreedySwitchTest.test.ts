/**
 * 移植自 ELK Java: p3order/LayerSweepHierarchicalTwoSidedGreedySwitchTest.java
 * 嵌套图 + 外部端口 dummy 的 TWO_SIDED_GREEDY_SWITCH 层序验证。
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { LayerSweepCrossingMinimizer } from '../../src/p3order/layer-sweep-crossing-minimizer.js'
import { CrossMinType } from '../../src/p3order/port-distributors.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import { CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS } from '../../src/options/internal-properties.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'

describe('LayerSweepHierarchicalTwoSidedGreedySwitch (ELK Java 移植)', () => {
  it('givencrossInFirstLevelCompoundNodeUsingTwoSidedGreedySwitch_LeavesCrossing', () => {
    const tg = new TestGraphCreator()
    const leftOuterNode = tg.addNodeToLayer(tg.makeLayer())
    const rightNodes = tg.addNodesToLayer(2, tg.makeLayer())
    const leftOuterPorts = tg.addPortsOnSide(2, leftOuterNode, PortSide.EAST)
    tg.eastWestEdgeFromTo(leftOuterPorts[0]!, rightNodes[0]!)
    tg.eastWestEdgeFromTo(leftOuterPorts[1]!, rightNodes[1]!)
    const leftInnerGraph = tg.nestedGraph(leftOuterNode)
    const leftInnerNodesLeft = tg.addNodesToLayer(2, tg.makeLayer(leftInnerGraph))
    const leftInnerNodesRight = tg.addNodesToLayer(2, tg.makeLayer(leftInnerGraph))
    const leftInnerDummyNodes = tg.addExternalPortDummiesToLayer(tg.makeLayer(leftInnerGraph), leftOuterPorts)
    tg.eastWestEdgeFromTo(leftInnerNodesRight[0]!, leftInnerDummyNodes[0]!)
    tg.eastWestEdgeFromTo(leftInnerNodesRight[1]!, leftInnerDummyNodes[1]!)
    tg.eastWestEdgeFromTo(leftInnerNodesLeft[0]!, leftInnerNodesRight[1]!)
    tg.eastWestEdgeFromTo(leftInnerNodesLeft[1]!, leftInnerNodesRight[0]!)
    tg.getGraph().setProperty(CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS, -1.0)
    const expectedSameOrder = tg.copyOfNodesInLayer(1)
    tg.setUpIds()
    setUpAndMinimize(tg)
    expect(tg.getGraph().getLayers()[1]!.getNodes()).toEqual(expectedSameOrder)
  })

  it('givenCompoundGraphWhereOrderIsOnlyCorrectedOnForwardSweep_RemovesCrossing', () => {
    const tg = new TestGraphCreator()
    const node = tg.addNodeToLayer(tg.makeLayer())
    const innerGraph = tg.nestedGraph(node)
    const leftInnerNode = tg.addNodeToLayer(tg.makeLayer(innerGraph))
    tg.setFixedOrderConstraint(leftInnerNode)
    const rightInnerNodes = tg.addNodesToLayer(2, tg.makeLayer(innerGraph))
    tg.eastWestEdgeFromTo(leftInnerNode, rightInnerNodes[1]!)
    tg.eastWestEdgeFromTo(leftInnerNode, rightInnerNodes[0]!)
    const rightInnerLayer = innerGraph.getLayers()[1]!
    const expectedOrderRightInner = tg.switchOrderOfNodesInLayer(0, 1, rightInnerLayer)
    const expectedPortOrderLeft = tg.copyPortsInIndexOrder(leftInnerNode, 0, 1)
    tg.randomMock.setNextBoolean(false)
    tg.setUpIds()
    setUpAndMinimize(tg)
    expect(leftInnerNode.getPorts()).toEqual(expectedPortOrderLeft)
    expect(rightInnerLayer.getNodes()).toEqual(expectedOrderRightInner)
  })

  it('givenSingleHierarchicalNodeWithCross_RemovesCrossing', () => {
    const tg = new TestGraphCreator()
    const node = tg.addNodeToLayer(tg.makeLayer())
    const innerGraph = tg.nestedGraph(node)
    const innerNodesLeft = tg.addNodesToLayer(2, tg.makeLayer(innerGraph))
    const innerNodesRight = tg.addNodesToLayer(2, tg.makeLayer(innerGraph))
    tg.eastWestEdgeFromTo(innerNodesLeft[0]!, innerNodesRight[1]!)
    tg.eastWestEdgeFromTo(innerNodesLeft[1]!, innerNodesRight[0]!)
    const expectedOrderLeft = tg.switchOrderOfNodesInLayer(0, 1, innerGraph.getLayers()[0]!)
    tg.setUpIds()
    setUpAndMinimize(tg)
    expect(innerGraph.getLayers()[0]!.getNodes()).toEqual(expectedOrderLeft)
  })

  it('onlyTwoSidedGreedySwitchReturnsNoChange', () => {
    const tg = new TestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    const leftPorts = tg.addPortsOnSide(2, leftNode, PortSide.EAST)
    tg.eastWestEdgeFromTo(leftPorts[0]!, rightNode)
    tg.eastWestEdgeFromTo(leftPorts[1]!, rightNode)
    tg.setFixedOrderConstraint(rightNode)
    const innerGraph = tg.nestedGraph(leftNode)
    const innerLayers = tg.makeLayers(2, innerGraph)
    const innerLeftNode = tg.addNodeToLayer(innerLayers[0]!)
    tg.setFixedOrderConstraint(innerLeftNode)
    const dummies = tg.addExternalPortDummiesToLayer(innerLayers[1]!, leftPorts)
    tg.eastWestEdgeFromTo(innerLeftNode, dummies[0]!)
    tg.eastWestEdgeFromTo(innerLeftNode, dummies[1]!)
    const expectedOrderDummies = [...innerGraph.getLayers()[1]!.getNodes()]
    tg.randomMock.setNextBoolean(false)
    tg.setUpIds()
    setUpAndMinimize(tg)
    expect(innerGraph.getLayers()[1]!.getNodes()).toEqual(expectedOrderDummies)
  })

  it('crossingBeforeLastLayerCausesCrossingOutside_TwoSidedPrevents', () => {
    const tg = new TestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    const leftPorts = tg.addPortsOnSide(2, leftNode, PortSide.EAST)
    tg.eastWestEdgeFromTo(leftPorts[1]!, rightNode)
    tg.eastWestEdgeFromTo(leftPorts[0]!, rightNode)
    tg.setFixedOrderConstraint(rightNode)
    const innerGraph = tg.nestedGraph(leftNode)
    const innerLayers = tg.makeLayers(2, innerGraph)
    const innerLeftNode = tg.addNodeToLayer(innerLayers[0]!)
    tg.setFixedOrderConstraint(innerLeftNode)
    const dummies = tg.addExternalPortDummiesToLayer(innerLayers[1]!, leftPorts)
    tg.eastWestEdgeFromTo(innerLeftNode, dummies[1]!)
    tg.eastWestEdgeFromTo(innerLeftNode, dummies[0]!)
    const expectedOrderDummies = [...innerGraph.getLayers()[1]!.getNodes()]
    tg.setUpIds()
    setUpAndMinimize(tg)
    expect(innerGraph.getLayers()[1]!.getNodes()).toEqual(expectedOrderDummies)
  })

  it('crossingBeforeFirstLayerCausesCrossingOutside_TwoSidedPrevents', () => {
    const tg = new TestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    const rightPorts = tg.addPortsOnSide(2, rightNode, PortSide.WEST)
    tg.eastWestEdgeFromTo(leftNode, rightPorts[1]!)
    tg.eastWestEdgeFromTo(leftNode, rightPorts[0]!)
    tg.setFixedOrderConstraint(leftNode)
    const innerGraph = tg.nestedGraph(rightNode)
    const innerLayers = tg.makeLayers(2, innerGraph)
    const innerRightNode = tg.addNodeToLayer(innerLayers[1]!)
    tg.setFixedOrderConstraint(innerRightNode)
    const dummies = tg.addExternalPortDummiesToLayer(innerLayers[0]!, rightPorts)
    tg.eastWestEdgeFromTo(dummies[0]!, innerRightNode)
    tg.eastWestEdgeFromTo(dummies[1]!, innerRightNode)
    const expectedOrderDummies = [...innerGraph.getLayers()[0]!.getNodes()]
    tg.randomMock.setNextBoolean(false)
    tg.setUpIds()
    setUpAndMinimize(tg)
    expect(innerGraph.getLayers()[0]!.getNodes()).toEqual(expectedOrderDummies)
  })
})

function setUpAndMinimize(tg: TestGraphCreator): void {
  const crossMin = new LayerSweepCrossingMinimizer(CrossMinType.TWO_SIDED_GREEDY_SWITCH)
  crossMin.process(tg.getGraph(), new NullProgressMonitor())
}
