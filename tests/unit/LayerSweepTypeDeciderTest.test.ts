/**
 * 移植自 ELK Java: p3order/LayerSweepTypeDeciderTest.java
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { GraphInfoHolder } from '../../src/p3order/graph-info-holder.js'
import { CrossMinType } from '../../src/p3order/port-distributors.js'
import { decideUseBottomUp } from '../../src/p3order/layer-sweep-type-decider.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'
import { CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS } from '../../src/options/internal-properties.js'

describe('LayerSweepTypeDecider (ELK Java 移植)', () => {
  it('northSouthPortsChangeDecision', () => {
    const tg = new TestGraphCreator()
    const layers = tg.makeLayers(3)
    const leftOuter = tg.addNodeToLayer(layers[0]!)
    const middleOuter = tg.addNodeToLayer(layers[1]!)
    const rightOuter = tg.addNodeToLayer(layers[2]!)
    const leftPortMiddleNode = tg.addPortOnSide(middleOuter, PortSide.WEST)
    const rightPortMiddleNode = tg.addPortOnSide(middleOuter, PortSide.EAST)
    tg.eastWestEdgeFromTo(middleOuter, rightOuter)
    tg.eastWestEdgeFromTo(rightPortMiddleNode, rightOuter)
    tg.eastWestEdgeFromTo(leftOuter, leftPortMiddleNode)
    tg.eastWestEdgeFromTo(leftOuter, middleOuter)
    const nestedGraph = tg.nestedGraph(middleOuter)
    const innerLayers = tg.makeLayers(5, nestedGraph)
    const leftDummy = tg.addExternalPortDummyNodeToLayer(innerLayers[0]!, leftPortMiddleNode)
    const firstLayer = tg.addNodesToLayer(3, innerLayers[1]!)
    const secondLayer = tg.addNodesToLayer(3, innerLayers[2]!)
    const thirdLayer = tg.addNodesToLayer(2, innerLayers[3]!)
    const rightDummy = tg.addExternalPortDummyNodeToLayer(innerLayers[4]!, rightPortMiddleNode)
    tg.eastWestEdgeFromTo(leftDummy, firstLayer[2]!)
    tg.eastWestEdgeFromTo(firstLayer[2]!, secondLayer[2]!)
    tg.eastWestEdgeFromTo(secondLayer[2]!, thirdLayer[1]!)
    tg.eastWestEdgeFromTo(thirdLayer[1]!, rightDummy)
    tg.addNorthSouthEdge(PortSide.NORTH, firstLayer[1]!, firstLayer[0]!, secondLayer[0]!, false)
    tg.addNorthSouthEdge(PortSide.SOUTH, secondLayer[0]!, secondLayer[1]!, thirdLayer[0]!, false)
    const graph = tg.getGraph()
    graph.id = 0
    nestedGraph.id = 1
    tg.setOnAllGraphs(CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS, 0.1, graph)
    const parentGd = new GraphInfoHolder(graph, CrossMinType.BARYCENTER, [])
    const gd = new GraphInfoHolder(nestedGraph, CrossMinType.BARYCENTER, [parentGd])
    expect(gd.dontSweepInto()).toBe(true)
  })

  it('allHierarchicalButMinusOne_StillReturnsBU', () => {
    const tg = new TestGraphCreator()
    const leftNode = tg.addNodeToLayer(tg.makeLayer())
    const middleNode = tg.addNodeToLayer(tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    const middlePortRight = tg.addPortsOnSide(2, middleNode, PortSide.EAST)
    const middlePortLeft = tg.addPortsOnSide(2, middleNode, PortSide.WEST)
    tg.eastWestEdgeFromTo(leftNode, middlePortLeft[1]!)
    tg.eastWestEdgeFromTo(leftNode, middlePortLeft[0]!)
    tg.eastWestEdgeFromTo(middlePortRight[0]!, rightNode)
    tg.eastWestEdgeFromTo(middlePortRight[1]!, rightNode)
    const innerGraph = tg.nestedGraph(middleNode)
    const layers = tg.makeLayers(3, innerGraph)
    const leftInnerDummyNodes = tg.addExternalPortDummiesToLayer(layers[2]!, middlePortRight)
    const node = tg.addNodeToLayer(layers[1]!)
    const rightInnerDummyNodes = tg.addExternalPortDummiesToLayer(layers[0]!, middlePortLeft)
    tg.eastWestEdgeFromTo(leftInnerDummyNodes[0]!, node)
    tg.eastWestEdgeFromTo(leftInnerDummyNodes[1]!, node)
    tg.eastWestEdgeFromTo(node, rightInnerDummyNodes[0]!)
    tg.eastWestEdgeFromTo(node, rightInnerDummyNodes[1]!)
    const graph = tg.getGraph()
    graph.id = 0
    innerGraph.id = 1
    tg.setOnAllGraphs(CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS, -1.0, graph)
    const parentGd = new GraphInfoHolder(graph, CrossMinType.BARYCENTER, [])
    const gd = new GraphInfoHolder(innerGraph, CrossMinType.BARYCENTER, [parentGd])
    expect(decideUseBottomUp(gd)).toBe(true)
  })

  it('portWithNoEdges_DoesNotCount', () => {
    const tg = new TestGraphCreator()
    const middleNode = tg.addNodeToLayer(tg.makeLayer())
    const rightNode = tg.addNodeToLayer(tg.makeLayer())
    const middlePortRight = tg.addPortsOnSide(2, middleNode, PortSide.EAST)
    tg.eastWestEdgeFromTo(middlePortRight[0]!, rightNode)
    tg.eastWestEdgeFromTo(middlePortRight[1]!, rightNode)
    const innerGraph = tg.nestedGraph(middleNode)
    const layers = tg.makeLayers(2, innerGraph)
    const node = tg.addNodeToLayer(layers[0]!)
    const rightInnerDummyNodes = tg.addExternalPortDummiesToLayer(layers[1]!, middlePortRight)
    tg.eastWestEdgeFromTo(node, rightInnerDummyNodes[0]!)
    tg.eastWestEdgeFromTo(node, rightInnerDummyNodes[1]!)
    tg.addPortOnSide(node, PortSide.WEST)
    const graph = tg.getGraph()
    graph.id = 0
    innerGraph.id = 1
    tg.setOnAllGraphs(CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS, -0.1, graph)
    const parentGd = new GraphInfoHolder(graph, CrossMinType.BARYCENTER, [])
    const gd = new GraphInfoHolder(innerGraph, CrossMinType.BARYCENTER, [parentGd])
    expect(gd.dontSweepInto()).toBe(true)
  })
})
