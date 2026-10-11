/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/** Greedy switch crossing minimizer and its small counting helpers. */
import type { LEdge } from '../../graph/ledge.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import { NodeType, PortSide } from '../../graph/enums.js'
import { IN_LAYER_LAYOUT_UNIT, IN_LAYER_SUCCESSOR_CONSTRAINTS, ORIGIN, PORT_DUMMY } from '../../options/internal-properties.js'
import { CrossingsCounter, inNorthSouthEastWestOrder } from '../../p3order/counting.js'
import type { GraphInfoHolder } from '../../p3order/graph-info-holder.js'
import { CrossMinType } from '../../p3order/port-distributors.js'
import type { ICrossingMinimizationHeuristic } from '../../p3order/interfaces.js'

export enum CrossingCountSide { WEST, EAST }

function maxPortId(order: LNode[][]): number {
  let max = -1
  for (const layer of order) for (const node of layer) for (const port of node.getPorts()) max = Math.max(max, port.id)
  return max
}

function boundaryCrossings(order: LNode[][], layerIndex: number, portIds: number[]): number {
  if (layerIndex < 0 || layerIndex >= order.length - 1) return 0
  return new CrossingsCounter(portIds).countCrossingsBetweenLayers(order[layerIndex]!, order[layerIndex + 1]!)
}

function inLayerCrossings(order: LNode[][], layerIndex: number, side: PortSide, portIds: number[]): number {
  if (layerIndex < 0 || layerIndex >= order.length) return 0
  return new CrossingsCounter(portIds).countInLayerCrossingsOnSide(order[layerIndex]!, side)
}

function hasEdgesOnSide(node: LNode, side: PortSide): boolean {
  return node.getPortSideView(side).some(port => port.hasProperty(PORT_DUMMY) || port.getConnectedEdges().length > 0)
}

function constraintsPreventSwitch(upper: LNode, lower: LNode): boolean {
  const successors = upper.getProperty<LNode[] | null>(IN_LAYER_SUCCESSOR_CONSTRAINTS)
  if (successors?.includes(lower)) return true
  const upperUnit = upper.getProperty<LNode | null>(IN_LAYER_LAYOUT_UNIT)
  const lowerUnit = lower.getProperty<LNode | null>(IN_LAYER_LAYOUT_UNIT)
  if ((upperUnit !== null && upperUnit !== undefined && upperUnit !== upper)
    || (lowerUnit !== null && lowerUnit !== undefined && lowerUnit !== lower)) return true
  return (upper.getType() === NodeType.NORTH_SOUTH_PORT && lower.getType() === NodeType.NORMAL)
    || (upper.getType() === NodeType.NORMAL && lower.getType() === NodeType.NORTH_SOUTH_PORT)
}

/**
 * 交叉矩阵, 按需填充 (对应 ELK CrossingMatrixFiller).
 * 要求每层 node.id 从 0 到 layer.size-1.
 */
export class CrossingMatrixFiller {
  private readonly isCrossingMatrixFilled: boolean[][]
  private readonly crossingMatrix: number[][]
  private readonly inBetweenLayerCrossingCounter: BetweenLayerEdgeTwoNodeCrossingsCounter
  private readonly direction: CrossingCountSide
  private readonly oneSided: boolean

  constructor(greedySwitchType: CrossMinType, graph: LNode[][], freeLayerIndex: number, direction: CrossingCountSide) {
    this.direction = direction
    this.oneSided = greedySwitchType === CrossMinType.ONE_SIDED_GREEDY_SWITCH
    const freeLayer = graph[freeLayerIndex]!
    this.isCrossingMatrixFilled = Array.from({ length: freeLayer.length }, () => new Array<boolean>(freeLayer.length).fill(false))
    this.crossingMatrix = Array.from({ length: freeLayer.length }, () => new Array<number>(freeLayer.length).fill(0))
    this.inBetweenLayerCrossingCounter = new BetweenLayerEdgeTwoNodeCrossingsCounter(graph, freeLayerIndex)
  }

  getCrossingMatrixEntry(upperNode: LNode, lowerNode: LNode): number {
    if (!this.isCrossingMatrixFilled[upperNode.id]![lowerNode.id]) {
      this.fillCrossingMatrix(upperNode, lowerNode)
      this.isCrossingMatrixFilled[upperNode.id]![lowerNode.id] = true
      this.isCrossingMatrixFilled[lowerNode.id]![upperNode.id] = true
    }
    return this.crossingMatrix[upperNode.id]![lowerNode.id]!
  }

  private fillCrossingMatrix(upperNode: LNode, lowerNode: LNode): void {
    if (this.oneSided) {
      if (this.direction === CrossingCountSide.EAST) {
        this.inBetweenLayerCrossingCounter.countEasternEdgeCrossings(upperNode, lowerNode)
      } else {
        this.inBetweenLayerCrossingCounter.countWesternEdgeCrossings(upperNode, lowerNode)
      }
    } else {
      this.inBetweenLayerCrossingCounter.countBothSideCrossings(upperNode, lowerNode)
    }
    this.crossingMatrix[upperNode.id]![lowerNode.id] = this.inBetweenLayerCrossingCounter.getUpperLowerCrossings()
    this.crossingMatrix[lowerNode.id]![upperNode.id] = this.inBetweenLayerCrossingCounter.getLowerUpperCrossings()
  }
}

export class NorthSouthEdgeNeighbouringNodeCrossingsCounter {
  private upperLowerCrossings = 0
  private lowerUpperCrossings = 0
  private readonly portPositions = new Map<LPort, number>()
  private readonly layer: LNode[]

  constructor(nodes: LNode[]) {
    this.layer = nodes
    this.initializePortPositions()
  }

  /**
   * 端口位置按 getPorts() 返回序编号 (SOUTH/NORTH 各一) — 对应 ELK 实现.
   */
  private initializePortPositions(): void {
    for (const node of this.layer) {
      this.setPortIdsOn(node, PortSide.SOUTH)
      this.setPortIdsOn(node, PortSide.NORTH)
    }
  }

  private setPortIdsOn(node: LNode, side: PortSide): void {
    let portId = 0
    for (const port of inNorthSouthEastWestOrder(node, side)) this.portPositions.set(port, portId++)
  }

  countCrossings(upperNode: LNode, lowerNode: LNode): void {
    this.upperLowerCrossings = 0
    this.lowerUpperCrossings = 0
    this.processIfTwoNorthSouthNodes(upperNode, lowerNode)
    this.processIfNorthSouthLongEdgeDummyCrossing(upperNode, lowerNode)
    this.processIfNormalNodeWithNSPortsAndLongEdgeDummy(upperNode, lowerNode)
  }

  private processIfTwoNorthSouthNodes(upperNode: LNode, lowerNode: LNode): void {
    if (this.isNorthSouth(upperNode) && this.isNorthSouth(lowerNode) && !this.haveDifferentOrigins(upperNode, lowerNode)) {
      if (this.isNorthOfNormalNode(upperNode)) this.countCrossingsOfTwoNorthSouthDummies(upperNode, lowerNode)
      else this.countCrossingsOfTwoNorthSouthDummies(lowerNode, upperNode)
    }
  }

  private countCrossingsOfTwoNorthSouthDummies(furtherFromNormalNode: LNode, closerToNormalNode: LNode): void {
    if (this.originPortPositionOf(furtherFromNormalNode) > this.originPortPositionOf(closerToNormalNode)) {
      const closerEastPorts = closerToNormalNode.getPortSideView(PortSide.EAST)
      this.upperLowerCrossings = closerEastPorts.length === 0 ? 0 : closerEastPorts[0]!.getDegree()
      const furtherWestPorts = furtherFromNormalNode.getPortSideView(PortSide.WEST)
      this.lowerUpperCrossings = furtherWestPorts.length === 0 ? 0 : furtherWestPorts[0]!.getDegree()
    } else {
      const closerWestPorts = closerToNormalNode.getPortSideView(PortSide.WEST)
      this.upperLowerCrossings = closerWestPorts.length === 0 ? 0 : closerWestPorts[0]!.getDegree()
      const furtherEastPorts = furtherFromNormalNode.getPortSideView(PortSide.EAST)
      this.lowerUpperCrossings = furtherEastPorts.length === 0 ? 0 : furtherEastPorts[0]!.getDegree()
    }
  }

  private processIfNorthSouthLongEdgeDummyCrossing(upperNode: LNode, lowerNode: LNode): void {
    if (this.isNorthSouth(upperNode) && this.isLongEdgeDummy(lowerNode)) {
      if (this.isNorthOfNormalNode(upperNode)) this.upperLowerCrossings = 1
      else this.lowerUpperCrossings = 1
    } else if (this.isNorthSouth(lowerNode) && this.isLongEdgeDummy(upperNode)) {
      if (this.isNorthOfNormalNode(lowerNode)) this.lowerUpperCrossings = 1
      else this.upperLowerCrossings = 1
    }
  }

  private processIfNormalNodeWithNSPortsAndLongEdgeDummy(upperNode: LNode, lowerNode: LNode): void {
    if (this.isNormal(upperNode) && this.isLongEdgeDummy(lowerNode)) {
      this.upperLowerCrossings = this.numberOfNorthSouthEdges(upperNode, PortSide.SOUTH)
      this.lowerUpperCrossings = this.numberOfNorthSouthEdges(upperNode, PortSide.NORTH)
    }
    if (this.isNormal(lowerNode) && this.isLongEdgeDummy(upperNode)) {
      this.upperLowerCrossings = this.numberOfNorthSouthEdges(lowerNode, PortSide.NORTH)
      this.lowerUpperCrossings = this.numberOfNorthSouthEdges(lowerNode, PortSide.SOUTH)
    }
  }

  private numberOfNorthSouthEdges(node: LNode, side: PortSide): number {
    let numberOfEdges = 0
    for (const port of node.getPortSideView(side)) numberOfEdges += this.hasConnectedNorthSouthEdge(port) ? 1 : 0
    return numberOfEdges
  }

  private hasConnectedNorthSouthEdge(port: LPort): boolean {
    return port.getProperty<LNode | null>(PORT_DUMMY) !== null && port.getProperty<LNode | null>(PORT_DUMMY) !== undefined
  }

  private haveDifferentOrigins(upperNode: LNode, lowerNode: LNode): boolean {
    return this.originOf(upperNode) !== this.originOf(lowerNode)
  }

  private originPortPositionOf(node: LNode): number {
    return this.portPositions.get(this.originPortOf(node))!
  }

  private originPortOf(node: LNode): LPort {
    const port = node.getPorts()[0]!
    return port.getProperty(ORIGIN) as LPort
  }

  private isNorthOfNormalNode(node: LNode): boolean {
    return this.originPortOf(node).getSide() === PortSide.NORTH
  }

  private originOf(node: LNode): LNode {
    return node.getProperty(ORIGIN) as LNode
  }

  private isLongEdgeDummy(node: LNode): boolean { return node.getType() === NodeType.LONG_EDGE }
  private isNorthSouth(node: LNode): boolean { return node.getType() === NodeType.NORTH_SOUTH_PORT }
  private isNormal(node: LNode): boolean { return node.getType() === NodeType.NORMAL }

  getUpperLowerCrossings(): number { return this.upperLowerCrossings }
  getLowerUpperCrossings(): number { return this.lowerUpperCrossings }
}

export class BetweenLayerEdgeTwoNodeCrossingsCounter {
  private upperLowerCrossings = 0
  private lowerUpperCrossings = 0
  private upperAdjacencies!: AdjacencyList
  private lowerAdjacencies!: AdjacencyList
  private readonly portPositions = new Map<LPort, number>()
  private readonly easternAdjacencies = new Map<LNode, AdjacencyList>()
  private readonly westernAdjacencies = new Map<LNode, AdjacencyList>()

  constructor(private readonly currentNodeOrder: LNode[][], private readonly freeLayerIndex: number) {
    this.setPortPositionsForNeighbouringLayers()
  }

  private setPortPositionsForNeighbouringLayers(): void {
    if (this.freeLayerIndex > 0) this.setPortPositionsForLayer(this.freeLayerIndex - 1, PortSide.EAST)
    if (this.freeLayerIndex < this.currentNodeOrder.length - 1) this.setPortPositionsForLayer(this.freeLayerIndex + 1, PortSide.WEST)
  }

  private setPortPositionsForLayer(layerIndex: number, portSide: PortSide): void {
    let portId = 0
    for (const node of this.currentNodeOrder[layerIndex]!) {
      for (const port of inNorthSouthEastWestOrder(node, portSide)) this.portPositions.set(port, portId++)
    }
  }

  countEasternEdgeCrossings(upper: LNode, lower: LNode): void {
    this.resetCrossingCount()
    if (upper === lower) return
    this.addEasternCrossings(upper, lower)
  }

  countWesternEdgeCrossings(upper: LNode, lower: LNode): void {
    this.resetCrossingCount()
    if (upper === lower) return
    this.addWesternCrossings(upper, lower)
  }

  countBothSideCrossings(upper: LNode, lower: LNode): void {
    this.resetCrossingCount()
    if (upper === lower) return
    this.addWesternCrossings(upper, lower)
    this.addEasternCrossings(upper, lower)
  }

  private resetCrossingCount(): void {
    this.upperLowerCrossings = 0
    this.lowerUpperCrossings = 0
  }

  private addEasternCrossings(upper: LNode, lower: LNode): void {
    this.upperAdjacencies = this.getAdjacencyFor(upper, PortSide.EAST, this.easternAdjacencies)
    this.lowerAdjacencies = this.getAdjacencyFor(lower, PortSide.EAST, this.easternAdjacencies)
    if (this.upperAdjacencies.size() === 0 || this.lowerAdjacencies.size() === 0) return
    this.countCrossingsByMergingAdjacencyLists()
  }

  private getAdjacencyFor(node: LNode, side: PortSide, adjacencies: Map<LNode, AdjacencyList>): AdjacencyList {
    if (adjacencies.size === 0) {
      for (const n of this.currentNodeOrder[this.freeLayerIndex]!) adjacencies.set(n, new AdjacencyList(n, side, this.portPositions))
    }
    const aL = adjacencies.get(node)!
    aL.reset()
    return aL
  }

  private addWesternCrossings(upper: LNode, lower: LNode): void {
    this.upperAdjacencies = this.getAdjacencyFor(upper, PortSide.WEST, this.westernAdjacencies)
    this.lowerAdjacencies = this.getAdjacencyFor(lower, PortSide.WEST, this.westernAdjacencies)
    if (this.upperAdjacencies.size() === 0 || this.lowerAdjacencies.size() === 0) return
    this.countCrossingsByMergingAdjacencyLists()
  }

  private countCrossingsByMergingAdjacencyLists(): void {
    while (!this.upperAdjacencies.isEmpty() && !this.lowerAdjacencies.isEmpty()) {
      if (this.isBelow(this.upperAdjacencies.first(), this.lowerAdjacencies.first())) {
        this.upperLowerCrossings += this.upperAdjacencies.size()
        this.lowerAdjacencies.removeFirst()
      } else if (this.isBelow(this.lowerAdjacencies.first(), this.upperAdjacencies.first())) {
        this.lowerUpperCrossings += this.lowerAdjacencies.size()
        this.upperAdjacencies.removeFirst()
      } else {
        this.upperLowerCrossings += this.upperAdjacencies.countAdjacenciesBelowNodeOfFirstPort()
        this.lowerUpperCrossings += this.lowerAdjacencies.countAdjacenciesBelowNodeOfFirstPort()
        this.upperAdjacencies.removeFirst()
        this.lowerAdjacencies.removeFirst()
      }
    }
  }

  private isBelow(firstPort: number, secondPort: number): boolean {
    return firstPort > secondPort
  }

  getUpperLowerCrossings(): number { return this.upperLowerCrossings }
  getLowerUpperCrossings(): number { return this.lowerUpperCrossings }
}

class AdjacencyList {
  private readonly adjacencyList: Adjacency[] = []
  private totalSize = 0
  private currentSize = 0
  private currentIndex = 0

  constructor(private readonly node: LNode, private readonly side: PortSide,
    private readonly portPositions: Map<LPort, number>) {
    this.getAdjacenciesSortedByPosition()
  }

  private getAdjacenciesSortedByPosition(): void {
    this.iterateThroughEdgesCollectingAdjacencies()
    this.adjacencyList.sort((a, b) => a.position - b.position)
  }

  private iterateThroughEdgesCollectingAdjacencies(): void {
    for (const port of inNorthSouthEastWestOrder(this.node, this.side)) {
      const edges = this.side === PortSide.WEST ? port.getIncomingEdges() : port.getOutgoingEdges()
      for (const edge of edges) {
        if (!edge.isSelfLoop() && !this.isInLayer(edge)) {
          this.addAdjacencyOf(edge)
          this.totalSize++
          this.currentSize++
        }
      }
    }
  }

  private isInLayer(edge: LEdge): boolean {
    return edge.getSource()!.getNode()!.getLayer() === edge.getTarget()!.getNode()!.getLayer()
  }

  private addAdjacencyOf(edge: LEdge): void {
    const adjacentPort = this.side === PortSide.WEST ? edge.getSource()! : edge.getTarget()!
    const position = this.portPositions.get(adjacentPort)!
    const lastIndex = this.adjacencyList.length - 1
    if (this.adjacencyList.length > 0 && this.adjacencyList[lastIndex]!.position === position) {
      this.adjacencyList[lastIndex]!.cardinality++
      this.adjacencyList[lastIndex]!.currentCardinality++
    } else {
      this.adjacencyList.push(new Adjacency(position))
    }
  }

  reset(): void {
    this.currentIndex = 0
    this.currentSize = this.totalSize
    if (!this.isEmpty()) this.currentAdjacency().reset()
  }

  countAdjacenciesBelowNodeOfFirstPort(): number {
    return this.currentSize - this.currentAdjacency().currentCardinality
  }

  removeFirst(): void {
    if (this.isEmpty()) return
    const current = this.currentAdjacency()
    if (current.currentCardinality === 1) this.incrementCurrentIndex()
    else current.currentCardinality--
    this.currentSize--
  }

  private incrementCurrentIndex(): void {
    this.currentIndex++
    if (this.currentIndex < this.adjacencyList.length) this.currentAdjacency().reset()
  }

  isEmpty(): boolean { return this.currentSize === 0 }
  first(): number { return this.currentAdjacency().position }
  size(): number { return this.currentSize }

  private currentAdjacency(): Adjacency {
    return this.adjacencyList[this.currentIndex]!
  }
}

class Adjacency {
  readonly position: number
  cardinality = 1
  currentCardinality = 1
  constructor(position: number) {
    this.position = position
  }
  reset(): void { this.currentCardinality = this.cardinality }
}

/**
 * 决定相邻两节点是否应交换 (对应 ELK SwitchDecider).
 * 组合: 层间交叉矩阵 + 层内两侧计数器 + NS 邻居计数器.
 */
export class SwitchDecider {
  private readonly freeLayer: LNode[]
  private readonly leftInLayerCounter: CrossingsCounter
  private readonly rightInLayerCounter: CrossingsCounter
  private readonly northSouthCounter: NorthSouthEdgeNeighbouringNodeCrossingsCounter
  private readonly crossingMatrixFiller: CrossingMatrixFiller
  private readonly graphData: GraphInfoHolder
  private parentCrossCounter: CrossingsCounter | null = null
  private readonly countCrossingsCausedByPortSwitch: boolean

  constructor(
    freeLayerIndex: number,
    graph: LNode[][],
    crossingMatrixFiller: CrossingMatrixFiller,
    portPositions: number[],
    graphData: GraphInfoHolder,
    oneSided: boolean,
  ) {
    this.crossingMatrixFiller = crossingMatrixFiller
    this.graphData = graphData
    if (freeLayerIndex >= graph.length) throw new Error('Greedy SwitchDecider: Free layer not in graph.')
    this.freeLayer = graph[freeLayerIndex]!
    this.leftInLayerCounter = new CrossingsCounter(portPositions)
    this.leftInLayerCounter.initPortPositionsForInLayerCrossings(this.freeLayer, PortSide.WEST)
    this.rightInLayerCounter = new CrossingsCounter(portPositions)
    this.rightInLayerCounter.initPortPositionsForInLayerCrossings(this.freeLayer, PortSide.EAST)
    this.northSouthCounter = new NorthSouthEdgeNeighbouringNodeCrossingsCounter(this.freeLayer)
    this.countCrossingsCausedByPortSwitch = !oneSided && graphData.hasParent && !graphData.dontSweepInto()
      && this.freeLayer[0]!.getType() === NodeType.EXTERNAL_PORT
    if (this.countCrossingsCausedByPortSwitch) this.initParentCrossingsCounters(freeLayerIndex, graph.length)
  }

  private initParentCrossingsCounters(freeLayerIndex: number, length: number): void {
    const parentGraphData = this.graphData.parentGraphData
    const parentNodeOrder = parentGraphData!.currentNodeOrder
    const portPos = parentGraphData!.portPositions
    this.parentCrossCounter = new CrossingsCounter(portPos)
    const parentNodeLayerPos = this.graphData.parent!.getLayer()!.id
    const leftLayer = parentNodeLayerPos > 0 ? parentNodeOrder[parentNodeLayerPos - 1]! : []
    const middleLayer = parentNodeOrder[parentNodeLayerPos]!
    const rightLayer = parentNodeLayerPos < parentNodeOrder.length - 1 ? parentNodeOrder[parentNodeLayerPos + 1]! : []
    const rightMostLayer = freeLayerIndex === length - 1
    if (rightMostLayer) this.parentCrossCounter.initForCountingBetween(middleLayer, rightLayer)
    else this.parentCrossCounter.initForCountingBetween(leftLayer, middleLayer)
  }

  /** 通知层内计数器节点已交换 (效率优化). */
  notifyOfSwitch(upperNode: LNode, lowerNode: LNode): void {
    this.leftInLayerCounter.switchNodes(upperNode, lowerNode, PortSide.WEST)
    this.rightInLayerCounter.switchNodes(upperNode, lowerNode, PortSide.EAST)
    if (this.countCrossingsCausedByPortSwitch) {
      const upperPort = upperNode.getProperty(ORIGIN) as LPort
      const lowerPort = lowerNode.getProperty(ORIGIN) as LPort
      this.parentCrossCounter!.switchPorts(upperPort, lowerPort)
    }
  }

  /** 交换这两个索引代表的节点是否会减少交叉数. */
  doesSwitchReduceCrossings(upperNodeIndex: number, lowerNodeIndex: number): boolean {
    if (process.env.GGN_SD_DBG) console.error('SD step1 constraints')
    if (this.constraintsPreventSwitch(upperNodeIndex, lowerNodeIndex)) return false
    const upperNode = this.freeLayer[upperNodeIndex]!
    const lowerNode = this.freeLayer[lowerNodeIndex]!
    if (process.env.GGN_SD_DBG) console.error('SD step2 left')
    const leftInLayer = this.leftInLayerCounter.countInLayerCrossingsBetweenNodesInBothOrders(upperNode, lowerNode, PortSide.WEST)
    if (process.env.GGN_SD_DBG) console.error('SD step3 right')
    const rightInLayer = this.rightInLayerCounter.countInLayerCrossingsBetweenNodesInBothOrders(upperNode, lowerNode, PortSide.EAST)
    if (process.env.GGN_SD_DBG) console.error('SD step4 ns')
    this.northSouthCounter.countCrossings(upperNode, lowerNode)
    if (process.env.GGN_SD_DBG) console.error('SD step5 matrix')
    const matrixUL = this.crossingMatrixFiller.getCrossingMatrixEntry(upperNode, lowerNode)
    const matrixLU = this.crossingMatrixFiller.getCrossingMatrixEntry(lowerNode, upperNode)
    let upperLowerCrossings = matrixUL
      + leftInLayer.first + rightInLayer.first + this.northSouthCounter.getUpperLowerCrossings()
    let lowerUpperCrossings = matrixLU
      + leftInLayer.second + rightInLayer.second + this.northSouthCounter.getLowerUpperCrossings()
    if (process.env.GGN_SD_DBG) {
      const nm = (n: LNode) => n.getLabels()[0]?.text ?? `d${n.id}`
      console.error(`SD parts ${nm(upperNode)}/${nm(lowerNode)} matrix=[${matrixUL},${matrixLU}] left=[${leftInLayer.first},${leftInLayer.second}] right=[${rightInLayer.first},${rightInLayer.second}] ns=[${this.northSouthCounter.getUpperLowerCrossings()},${this.northSouthCounter.getLowerUpperCrossings()}]`)
    }
    if (this.countCrossingsCausedByPortSwitch) {
      const upperPort = upperNode.getProperty(ORIGIN) as LPort
      const lowerPort = lowerNode.getProperty(ORIGIN) as LPort
      const crossingNumbers = this.parentCrossCounter!.countCrossingsBetweenPortsInBothOrders(upperPort, lowerPort)
      upperLowerCrossings += crossingNumbers.first
      lowerUpperCrossings += crossingNumbers.second
    }
    if (process.env.GGN_SD_DBG) {
      const nm = (n: LNode) => n.getLabels()[0]?.text ?? `d${n.id}`
      console.error(`SD decide upper=${nm(upperNode)}[${upperNodeIndex}] lower=${nm(lowerNode)}[${lowerNodeIndex}] upperLower=${upperLowerCrossings} lowerUpper=${lowerUpperCrossings} switch=${upperLowerCrossings > lowerUpperCrossings}`)
    }
    return upperLowerCrossings > lowerUpperCrossings
  }

  private constraintsPreventSwitch(nodeIndex: number, lowerNodeIndex: number): boolean {
    const upperNode = this.freeLayer[nodeIndex]!
    const lowerNode = this.freeLayer[lowerNodeIndex]!
    return this.haveSuccessorConstraints(upperNode, lowerNode)
      || this.haveLayoutUnitConstraints(upperNode, lowerNode)
      || this.areNormalAndNorthSouthPortDummy(upperNode, lowerNode)
  }

  private haveSuccessorConstraints(upperNode: LNode, lowerNode: LNode): boolean {
    const constraints = upperNode.getProperty<LNode[] | null>(IN_LAYER_SUCCESSOR_CONSTRAINTS)
    return constraints !== null && constraints !== undefined && constraints.length !== 0 && constraints.includes(lowerNode)
  }

  private haveLayoutUnitConstraints(upperNode: LNode, lowerNode: LNode): boolean {
    const neitherNodeIsLongEdgeDummy = upperNode.getType() !== NodeType.LONG_EDGE && lowerNode.getType() !== NodeType.LONG_EDGE
    const upperLayoutUnit = upperNode.getProperty<LNode | null>(IN_LAYER_LAYOUT_UNIT)
    const lowerLayoutUnit = lowerNode.getProperty<LNode | null>(IN_LAYER_LAYOUT_UNIT)
    const areInDifferentLayoutUnits = upperLayoutUnit !== lowerLayoutUnit
    let nodesHaveLayoutUnits = this.partOfMultiNodeLayoutUnit(upperNode, upperLayoutUnit)
      || this.partOfMultiNodeLayoutUnit(lowerNode, lowerLayoutUnit)
    const upperNodeHasNorthernEdges = hasEdgesOnSide(upperNode, PortSide.NORTH)
    const lowerNodeHasSouthernEdges = hasEdgesOnSide(lowerNode, PortSide.SOUTH)
    nodesHaveLayoutUnits = nodesHaveLayoutUnits || hasEdgesOnSide(upperNode, PortSide.SOUTH) || hasEdgesOnSide(lowerNode, PortSide.NORTH)
    const hasLayoutUnitConstraint = (nodesHaveLayoutUnits && areInDifferentLayoutUnits)
      || (upperNodeHasNorthernEdges || lowerNodeHasSouthernEdges)
    return neitherNodeIsLongEdgeDummy && hasLayoutUnitConstraint
  }

  private partOfMultiNodeLayoutUnit(node: LNode, layoutUnit: LNode | null): boolean {
    return layoutUnit !== null && layoutUnit !== undefined && layoutUnit !== node
  }

  private areNormalAndNorthSouthPortDummy(upperNode: LNode, lowerNode: LNode): boolean {
    return (this.isNorthSouthPortNode(upperNode) && this.isNormalNode(lowerNode))
      || (this.isNorthSouthPortNode(lowerNode) && this.isNormalNode(upperNode))
  }

  private isNormalNode(node: LNode): boolean { return node.getType() === NodeType.NORMAL }
  private isNorthSouthPortNode(node: LNode): boolean { return node.getType() === NodeType.NORTH_SOUTH_PORT }
}

export class GreedySwitchHeuristic implements ICrossingMinimizationHeuristic {
  private currentNodeOrder!: LNode[][]
  private switchDecider!: SwitchDecider
  private nPorts = 0
  private portPositions: number[] = []
  constructor(private readonly greedySwitchType: CrossMinType, private readonly graphData: GraphInfoHolder) {}
  minimizeCrossings(order: LNode[][], freeLayerIndex: number, forwardSweep: boolean, _isFirstSweep: boolean): boolean {
    if (process.env.GGN_SD_DBG) console.error(`SD minimize layer=${freeLayerIndex} forward=${forwardSweep}`)
    this.setUp(order, freeLayerIndex, forwardSweep)
    return this.continueSwitchingUntilNoImprovementInLayer(freeLayerIndex)
  }
  setFirstLayerOrder(order: LNode[][], forwardSweep: boolean): boolean {
    const start = forwardSweep ? 0 : order.length - 1
    this.setUp(order, start, forwardSweep)
    return this.sweepDownwardInLayer(start)
  }
  alwaysImproves(): boolean { return this.greedySwitchType !== CrossMinType.ONE_SIDED_GREEDY_SWITCH }
  isDeterministic(): boolean { return true }
  initAtLayerLevel(): void {}
  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void { nodeOrder[l]![n]!.id = n }
  initAtPortLevel(): void { this.nPorts++ }
  initAtEdgeLevel(): void {}
  initAfterTraversal(): void { this.portPositions = new Array<number>(this.nPorts) }
  private setUp(order: LNode[][], freeLayerIndex: number, forwardSweep: boolean): void {
    this.currentNodeOrder = order
    const direction = forwardSweep ? CrossingCountSide.WEST : CrossingCountSide.EAST
    const filler = new CrossingMatrixFiller(this.greedySwitchType, order, freeLayerIndex, direction)
    this.switchDecider = new SwitchDecider(
      freeLayerIndex,
      order,
      filler,
      this.portPositions,
      this.graphData,
      this.greedySwitchType === CrossMinType.ONE_SIDED_GREEDY_SWITCH,
    )
  }
  private continueSwitchingUntilNoImprovementInLayer(layerIndex: number): boolean {
    let improved = false
    let switched: boolean
    do {
      switched = this.sweepDownwardInLayer(layerIndex)
      improved ||= switched
    } while (switched)
    return improved
  }
  private sweepDownwardInLayer(layerIndex: number): boolean {
    const layer = this.currentNodeOrder[layerIndex]!
    let improved = false
    for (let index = 0; index < layer.length - 1; index++) {
      if (!this.switchDecider.doesSwitchReduceCrossings(index, index + 1)) continue
      this.switchDecider.notifyOfSwitch(layer[index]!, layer[index + 1]!)
      const old = layer[index]!
      layer[index] = layer[index + 1]!
      layer[index + 1] = old
      improved = true
    }
    return improved
  }
}
