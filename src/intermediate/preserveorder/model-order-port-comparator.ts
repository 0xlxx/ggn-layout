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
/** ModelOrderPortComparator (对应 ELK preserveorder.ModelOrderPortComparator). */
import { NodeType, PortSide } from '../../graph/enums.js'
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import { MODEL_ORDER, LONG_EDGE_TARGET_NODE } from '../../options/internal-properties.js'
import type { OrderingStrategy } from '../../options/layered-options.js'
import { calculateModelOrderOrGroupModelOrder } from './cm-group-model-order.js'
import { portSideOrdinal } from './model-order-node-comparator.js'

export class ModelOrderPortComparator {
  private readonly targetNodeModelOrder: Map<LNode, number> | null
  private portModelOrder: boolean
  private previousLayer: LNode[]
  private graph: LGraph
  private strategy: OrderingStrategy
  private biggerThan = new Map<LPort, Set<LPort>>()
  private smallerThan = new Map<LPort, Set<LPort>>()

  constructor(graph: LGraph, previousLayer: LNode[], strategy: OrderingStrategy,
    targetNodeModelOrder: Map<LNode, number> | null, portModelOrder: boolean) {
    this.graph = graph
    this.previousLayer = previousLayer
    this.strategy = strategy
    this.targetNodeModelOrder = targetNodeModelOrder
    this.portModelOrder = portModelOrder
  }

  compare(originalP1: LPort, originalP2: LPort): number {
    const p1 = originalP1
    const p2 = originalP2

    if (!this.biggerThan.has(p1)) this.biggerThan.set(p1, new Set())
    else if (this.biggerThan.get(p1)!.has(p2)) return 1
    if (!this.biggerThan.has(p2)) this.biggerThan.set(p2, new Set())
    else if (this.biggerThan.get(p2)!.has(p1)) return -1
    if (!this.smallerThan.has(p1)) this.smallerThan.set(p1, new Set())
    else if (this.smallerThan.get(p1)!.has(p2)) return -1
    if (!this.smallerThan.has(p2)) this.smallerThan.set(p2, new Set())
    else if (this.biggerThan.get(p2)!.has(p1)) return 1

    if (p1.getSide() !== p2.getSide()) {
      const result = portSideOrdinal(p1.getSide()) - portSideOrdinal(p2.getSide())
      if (result > 0) this.updateBiggerAndSmallerAssociations(p1, p2, 1)
      else this.updateBiggerAndSmallerAssociations(p2, p1, 1)
      return result
    }
    let reverseOrder = 1

    if (p1.getIncomingEdges().length > 0 && p2.getIncomingEdges().length > 0) {
      if ((p1.getSide() === PortSide.WEST && p2.getSide() === PortSide.WEST)
        || (p1.getSide() === PortSide.NORTH && p2.getSide() === PortSide.NORTH)
        || (p1.getSide() === PortSide.SOUTH && p2.getSide() === PortSide.SOUTH)) {
        reverseOrder = -reverseOrder
      }

      const p1SourcePort = p1.getIncomingEdges()[0]!.getSource()!
      const p2SourcePort = p2.getIncomingEdges()[0]!.getSource()!
      const p1Node = p1SourcePort.getNode()!
      const p2Node = p2SourcePort.getNode()!
      if (p1Node === p2Node) {
        for (const port of p1Node.getPorts()) {
          if (p1SourcePort === port) { this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder }
          if (p2SourcePort === port) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
        }
      }
      if (p1Node.getType() === NodeType.LONG_EDGE && p2Node.getType() === NodeType.LONG_EDGE
        && p1Node.getLayer()!.id === p2Node.getLayer()!.id && p1Node.getLayer()!.id === p1.getNode()!.getLayer()!.id) {
        const inPreviousLayer = this.checkReferenceLayer(p1Node.getLayer()!.getNodes(), p1Node, p2Node)
        if (inPreviousLayer !== 0) {
          if (p1.getSide() === PortSide.EAST && p2.getSide() === PortSide.EAST) reverseOrder = -reverseOrder
          if (inPreviousLayer > 0) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
          this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
        }
      }

      const inPreviousLayer = this.checkReferenceLayer(this.previousLayer, p1Node, p2Node)
      if (inPreviousLayer !== 0) {
        if (inPreviousLayer > 0) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
        this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
      }
      if (this.portModelOrder) {
        const result = this.checkPortModelOrder(p1, p2)
        if (result !== 0) {
          if (result > 0) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
          this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
        }
      }
    }

    if (p1.getOutgoingEdges().length > 0 && p2.getOutgoingEdges().length > 0) {
      if ((p1.getSide() === PortSide.WEST && p2.getSide() === PortSide.WEST)
        || (p1.getSide() === PortSide.SOUTH && p2.getSide() === PortSide.SOUTH)) {
        reverseOrder = -reverseOrder
      }
      const p1TargetNode = p1.getProperty(LONG_EDGE_TARGET_NODE) as LNode | null
      const p2TargetNode = p2.getProperty(LONG_EDGE_TARGET_NODE) as LNode | null

      if (this.strategy === 'PREFER_NODES' && p1TargetNode != null && p2TargetNode != null
        && p1TargetNode.hasProperty(MODEL_ORDER) && p2TargetNode.hasProperty(MODEL_ORDER)) {
        const p1MO = calculateModelOrderOrGroupModelOrder(p1TargetNode, p2TargetNode, this.graph, this.graph.getProperty('org.eclipse.elk.layered.internal.maxModelOrderNodes' as never) as number)
        const p2MO = calculateModelOrderOrGroupModelOrder(p2TargetNode, p1TargetNode, this.graph, this.graph.getProperty('org.eclipse.elk.layered.internal.maxModelOrderNodes' as never) as number)
        if (p1MO > p2MO) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
        this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
      }

      if (this.portModelOrder) {
        const result = this.checkPortModelOrder(p1, p2)
        if (result !== 0) {
          if (result > 0) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
          this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
        }
      }

      let p1Order = 0
      let p2Order = 0
      if (p1.getOutgoingEdges()[0]!.hasProperty(MODEL_ORDER)) {
        p1Order = calculateModelOrderOrGroupModelOrder(p1.getOutgoingEdges()[0]!, p2.getOutgoingEdges()[0]!, this.graph, p1.getOutgoingEdges().length + p1.getIncomingEdges().length)
      }
      if (p2.getOutgoingEdges()[0]!.hasProperty(MODEL_ORDER)) {
        p2Order = calculateModelOrderOrGroupModelOrder(p2.getOutgoingEdges()[0]!, p1.getOutgoingEdges()[0]!, this.graph, p2.getOutgoingEdges().length + p2.getIncomingEdges().length)
      }

      if (p1TargetNode != null && p1TargetNode === p2TargetNode) {
        if (p1Order > p2Order) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
        this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
      }
      if (this.targetNodeModelOrder != null) {
        if (this.targetNodeModelOrder.has(p1TargetNode!)) p1Order = this.targetNodeModelOrder.get(p1TargetNode!)!
        if (this.targetNodeModelOrder.has(p2TargetNode!)) p2Order = this.targetNodeModelOrder.get(p2TargetNode!)!
      }
      if (p1Order > p2Order) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
      this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
    }

    if (p1.getIncomingEdges().length > 0 && p2.getOutgoingEdges().length > 0) {
      this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return 1
    } else if (p1.getOutgoingEdges().length > 0 && p2.getIncomingEdges().length > 0) {
      this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -1
    } else if (p1.hasProperty(MODEL_ORDER) && p2.hasProperty(MODEL_ORDER)) {
      const numberOfPorts = p1.getNode()!.getPorts().length
      const p1MO = calculateModelOrderOrGroupModelOrder(p1, p2, this.graph, numberOfPorts)
      const p2MO = calculateModelOrderOrGroupModelOrder(p2, p1, this.graph, numberOfPorts)
      if (p1.getSide() === PortSide.WEST && p2.getSide() === PortSide.WEST
        || p1.getSide() === PortSide.SOUTH && p2.getSide() === PortSide.SOUTH) {
        reverseOrder = -reverseOrder
      }
      if (p1MO > p2MO) { this.updateBiggerAndSmallerAssociations(p1, p2, reverseOrder); return reverseOrder }
      this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
    }
    this.updateBiggerAndSmallerAssociations(p2, p1, reverseOrder); return -reverseOrder
  }

  checkPortModelOrder(p1: LPort, p2: LPort): number {
    const numberOfPorts = p1.getNode()!.getPorts().length
    if (p1.hasProperty(MODEL_ORDER) && p2.hasProperty(MODEL_ORDER)) {
      const p1Order = calculateModelOrderOrGroupModelOrder(p1, p2, this.graph, numberOfPorts)
      const p2Order = calculateModelOrderOrGroupModelOrder(p2, p1, this.graph, numberOfPorts)
      return p1Order - p2Order
    }
    return 0
  }

  private updateBiggerAndSmallerAssociations(biggerOri: LPort, smallerOri: LPort, reverseOrder: number): void {
    let bigger = biggerOri
    let smaller = smallerOri
    if (reverseOrder < 0) { bigger = smallerOri; smaller = biggerOri }
    const biggerPortBiggerThan = this.biggerThan.get(bigger)!
    const smallerPortBiggerThan = this.biggerThan.get(smaller)!
    const biggerPortSmallerThan = this.smallerThan.get(bigger)!
    const smallerPortSmallerThan = this.smallerThan.get(smaller)!
    biggerPortBiggerThan.add(smaller)
    smallerPortSmallerThan.add(bigger)
    for (const verySmall of smallerPortBiggerThan) {
      biggerPortBiggerThan.add(verySmall)
      this.smallerThan.get(verySmall)!.add(bigger)
      for (const b of biggerPortSmallerThan) this.smallerThan.get(verySmall)!.add(b)
    }
    for (const veryBig of biggerPortSmallerThan) {
      smallerPortSmallerThan.add(veryBig)
      this.biggerThan.get(veryBig)!.add(smaller)
      for (const s of smallerPortBiggerThan) this.biggerThan.get(veryBig)!.add(s)
    }
  }

  private checkReferenceLayer(layer: LNode[], p1Node: LNode, p2Node: LNode): number {
    for (const node of layer) {
      if (node === p1Node) return -1
      if (node === p2Node) return 1
    }
    return 0
  }

  clearTransitiveOrdering(): void {
    this.biggerThan = new Map()
    this.smallerThan = new Map()
  }
}
