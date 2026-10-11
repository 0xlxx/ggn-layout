/** ModelOrderNodeComparator (对应 ELK preserveorder.ModelOrderNodeComparator). */
import { NodeType, PortSide } from '../../graph/enums.js'
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import { MODEL_ORDER } from '../../options/internal-properties.js'
import { MAX_MODEL_ORDER_NODES } from '../../options/internal-properties.js'
import { OrderingStrategy } from '../../options/layered-options.js'
import type { LongEdgeOrderingStrategy, GroupOrderStrategy } from '../../options/layered-options.js'
import { calculateModelOrderOrGroupModelOrder } from './cm-group-model-order.js'
import { ModelOrderPortComparator } from './model-order-port-comparator.js'

export class ModelOrderNodeComparator {
  private previousLayer: LNode[]
  private graph: LGraph
  private orderingStrategy: OrderingStrategy
  private groupOrderStrategy: GroupOrderStrategy
  private biggerThan = new Map<LNode, Set<LNode>>()
  private smallerThan = new Map<LNode, Set<LNode>>()
  private longEdgeNodeOrder: LongEdgeOrderingStrategy
  private beforePorts: boolean

  constructor(graph: LGraph, previousLayer: LNode[], orderingStrategy: OrderingStrategy,
    longEdgeOrderingStrategy: LongEdgeOrderingStrategy, groupOrderStrategy: GroupOrderStrategy, beforePorts: boolean) {
    this.graph = graph
    this.previousLayer = previousLayer
    this.orderingStrategy = orderingStrategy
    this.groupOrderStrategy = groupOrderStrategy
    this.longEdgeNodeOrder = longEdgeOrderingStrategy
    this.beforePorts = beforePorts
  }

  compare(n1: LNode, n2: LNode): number {
    if (!this.biggerThan.has(n1)) this.biggerThan.set(n1, new Set())
    else if (this.biggerThan.get(n1)!.has(n2)) return 1
    if (!this.biggerThan.has(n2)) this.biggerThan.set(n2, new Set())
    else if (this.biggerThan.get(n2)!.has(n1)) return -1
    if (!this.smallerThan.has(n1)) this.smallerThan.set(n1, new Set())
    else if (this.smallerThan.get(n1)!.has(n2)) return -1
    if (!this.smallerThan.has(n2)) this.smallerThan.set(n2, new Set())
    else if (this.biggerThan.get(n2)!.has(n1)) return 1

    if (this.orderingStrategy === OrderingStrategy.PREFER_EDGES || !n1.hasProperty(MODEL_ORDER) || !n2.hasProperty(MODEL_ORDER)) {
      let p1SourcePort: LPort | null = null
      for (const p of n1.getPorts()) {
        if (p.getIncomingEdges().length > 0 && p.getIncomingEdges()[0]!.getSource()!.getNode()!.getLayer()!.id === (n1.getLayer()!.id - 1)) {
          p1SourcePort = p.getIncomingEdges()[0]!.getSource()!
          break
        }
      }
      let p2SourcePort: LPort | null = null
      for (const p of n2.getPorts()) {
        const _inc = p.getIncomingEdges()
        const _srcN = _inc[0]?.getSource()?.getNode()
        if (process.env.GGN_MO_DBG && _inc.length > 0 && (!_srcN?.getLayer())) {
          console.error(`[MO] n2=${n2.id} type=${n2.getType()} layer=${n2.getLayer()?.getIndex() ?? 'NULL'} | srcNode=${_srcN?.id ?? '?'} type=${_srcN?.getType()} srcLayer=${_srcN?.getLayer()?.getIndex() ?? 'NULL'} srcGraphLayerless=${_srcN?.getGraph()?.getLayerlessNodes().includes(_srcN!)}`)
        }
        if (p.getIncomingEdges().length > 0 && p.getIncomingEdges()[0]!.getSource()!.getNode()!.getLayer()!.id === (n2.getLayer()!.id - 1)) {
          p2SourcePort = p.getIncomingEdges()[0]!.getSource()!
          break
        }
      }

      if (p1SourcePort !== null && p2SourcePort !== null) {
        const p1Node = p1SourcePort.getNode()!
        const p2Node = p2SourcePort.getNode()!
        if (p1Node === p2Node) {
          for (const port of p1Node.getPorts()) {
            if (port === p1SourcePort) { this.updateBiggerAndSmallerAssociations(n2, n1); return -1 }
            if (port === p2SourcePort) { this.updateBiggerAndSmallerAssociations(n1, n2); return 1 }
          }
          const n1EdgeOrder = this.getModelOrderFromConnectedEdges(n1)
          const n2EdgeOrder = this.getModelOrderFromConnectedEdges(n2)
          if (n1EdgeOrder > n2EdgeOrder) { this.updateBiggerAndSmallerAssociations(n1, n2); return 1 }
          this.updateBiggerAndSmallerAssociations(n2, n1); return -1
        }
        for (const previousNode of this.previousLayer) {
          if (previousNode === p1Node) { this.updateBiggerAndSmallerAssociations(n2, n1); return -1 }
          if (previousNode === p2Node) { this.updateBiggerAndSmallerAssociations(n1, n2); return 1 }
        }
      }

      if ((p1SourcePort !== null && p2SourcePort === null) || (p1SourcePort === null && p2SourcePort !== null)) {
        const comparedWithLongEdgeFeedback = this.handleHelperDummyNodes(n1, n2)
        if (comparedWithLongEdgeFeedback !== 0) {
          if (comparedWithLongEdgeFeedback > 0) this.updateBiggerAndSmallerAssociations(n1, n2)
          else this.updateBiggerAndSmallerAssociations(n2, n1)
          return comparedWithLongEdgeFeedback
        }
        if (!n1.hasProperty(MODEL_ORDER) || !n2.hasProperty(MODEL_ORDER)) {
          const n1ModelOrder = this.getModelOrderFromConnectedEdges(n1)
          const n2ModelOrder = this.getModelOrderFromConnectedEdges(n2)
          if (n1ModelOrder > n2ModelOrder) { this.updateBiggerAndSmallerAssociations(n1, n2); return 1 }
          this.updateBiggerAndSmallerAssociations(n2, n1); return -1
        }
      }

      if (p1SourcePort === null && p2SourcePort === null) {
        const comparedWithLongEdgeFeedback = this.handleHelperDummyNodes(n1, n2)
        if (comparedWithLongEdgeFeedback !== 0) {
          if (comparedWithLongEdgeFeedback > 0) this.updateBiggerAndSmallerAssociations(n1, n2)
          else this.updateBiggerAndSmallerAssociations(n2, n1)
          return comparedWithLongEdgeFeedback
        }
      }
    }

    if (n1.hasProperty(MODEL_ORDER) && n2.hasProperty(MODEL_ORDER)) {
      const n1ModelOrder = calculateModelOrderOrGroupModelOrder(n1, n2, this.graph, this.graph.getProperty(MAX_MODEL_ORDER_NODES))
      const n2ModelOrder = calculateModelOrderOrGroupModelOrder(n2, n1, this.graph, this.graph.getProperty(MAX_MODEL_ORDER_NODES))
      if (n1ModelOrder > n2ModelOrder) { this.updateBiggerAndSmallerAssociations(n1, n2); return 1 }
      this.updateBiggerAndSmallerAssociations(n2, n1); return -1
    }
    this.updateBiggerAndSmallerAssociations(n2, n1); return -1
  }

  private getModelOrderFromConnectedEdges(n: LNode): number {
    const sourcePort = n.getPorts().find(p => p.getIncomingEdges().length > 0)
    if (sourcePort !== undefined) {
      const edge = sourcePort.getIncomingEdges()[0]!
      if (edge !== undefined) return edge.getProperty<number>(MODEL_ORDER)
    }
    return longEdgeReturnValue(this.longEdgeNodeOrder)
  }

  private updateBiggerAndSmallerAssociations(bigger: LNode, smaller: LNode): void {
    const biggerNodeBiggerThan = this.biggerThan.get(bigger)!
    const smallerNodeBiggerThan = this.biggerThan.get(smaller)!
    const biggerNodeSmallerThan = this.smallerThan.get(bigger)!
    const smallerNodeSmallerThan = this.smallerThan.get(smaller)!
    biggerNodeBiggerThan.add(smaller)
    smallerNodeSmallerThan.add(bigger)
    for (const verySmall of smallerNodeBiggerThan) {
      biggerNodeBiggerThan.add(verySmall)
      this.smallerThan.get(verySmall)!.add(bigger)
      for (const b of biggerNodeSmallerThan) this.smallerThan.get(verySmall)!.add(b)
    }
    for (const veryBig of biggerNodeSmallerThan) {
      smallerNodeSmallerThan.add(veryBig)
      this.biggerThan.get(veryBig)!.add(smaller)
      for (const s of smallerNodeBiggerThan) this.biggerThan.get(veryBig)!.add(s)
    }
  }

  private handleHelperDummyNodes(n1: LNode, n2: LNode): number {
    if (n1.getType() === NodeType.LONG_EDGE && n2.getType() === NodeType.NORMAL) {
      const dummyNodeSourcePort = this.getFirstIncomingSourcePortOfNode(n1)
      const dummyNodeSourceNode = dummyNodeSourcePort.getNode()!
      const dummyNodeTargetPort = this.getFirstOutgoingTargetPortOfNode(n1)
      const dummyNodeTargetNode = dummyNodeTargetPort.getNode()!
      const dummyLayerId = n1.getLayer()!.id
      if (dummyNodeSourceNode.getLayer()!.id !== dummyLayerId && dummyNodeTargetNode.getLayer()!.id !== dummyLayerId) return 0
      if (dummyNodeSourceNode === n2 || dummyNodeTargetNode === n2) { this.updateBiggerAndSmallerAssociations(n1, n2); return 1 }
      return this.compare(dummyNodeSourceNode, n2)
    } else if (n1.getType() === NodeType.NORMAL && n2.getType() === NodeType.LONG_EDGE) {
      const dummyNodeSourcePort = this.getFirstIncomingSourcePortOfNode(n2)
      const dummyNodeSourceNode = dummyNodeSourcePort.getNode()!
      const dummyNodeTargetPort = this.getFirstOutgoingTargetPortOfNode(n2)
      const dummyNodeTargetNode = dummyNodeTargetPort.getNode()!
      const dummyLayerId = n1.getLayer()!.id
      if (dummyNodeSourceNode.getLayer()!.id !== dummyLayerId && dummyNodeTargetNode.getLayer()!.id !== dummyLayerId) return 0
      if (dummyNodeSourceNode === n1 || dummyNodeTargetNode === n1) { this.updateBiggerAndSmallerAssociations(n2, n1); return -1 }
      return this.compare(n1, dummyNodeSourceNode)
    } else if (n1.getType() === NodeType.LONG_EDGE && n2.getType() === NodeType.LONG_EDGE) {
      const n1dummyNodeSourcePort = this.getFirstIncomingSourcePortOfNode(n1)
      const n1dummyNodeTargetPort = this.getFirstOutgoingTargetPortOfNode(n1)
      const n1dummySourceNode = n1dummyNodeSourcePort.getNode()!
      const n1dummyTargetNode = n1dummyNodeTargetPort.getNode()!
      const n1LayerId = n1.getLayer()!.id
      let n1SourceFeedbackNode = false
      let n1TargetFeedbackNode = false

      const n2dummyNodeSourcePort = this.getFirstIncomingSourcePortOfNode(n2)
      const n2dummyNodeTargetPort = this.getFirstOutgoingTargetPortOfNode(n2)
      const n2dummySourceNode = n2dummyNodeSourcePort.getNode()!
      const n2dummyTargetNode = n2dummyNodeTargetPort.getNode()!
      const n2LayerId = n2.getLayer()!.id
      let n2SourceFeedbackNode = false
      let n2TargetFeedbackNode = false

      let n1ReferenceNode = n1
      let n2ReferenceNode = n2
      if (n1dummySourceNode.getLayer()!.id === n1LayerId) { n1SourceFeedbackNode = true; n1ReferenceNode = n1dummySourceNode }
      else if (n1dummyTargetNode.getLayer()!.id === n1LayerId) { n1TargetFeedbackNode = true; n1ReferenceNode = n1dummyTargetNode }
      if (n2dummySourceNode.getLayer()!.id === n2LayerId) { n2SourceFeedbackNode = true; n2ReferenceNode = n2dummySourceNode }
      else if (n2dummyTargetNode.getLayer()!.id === n2LayerId) { n2TargetFeedbackNode = true; n2ReferenceNode = n2dummyTargetNode }

      if (n1ReferenceNode === n2ReferenceNode) {
        if (this.beforePorts) {
          if (n1SourceFeedbackNode && n2SourceFeedbackNode) {
            const returnValue = new ModelOrderPortComparator(this.graph, this.previousLayer, this.orderingStrategy, null, n2TargetFeedbackNode)
              .compare(n1dummyNodeSourcePort, n2dummyNodeSourcePort)
            if (returnValue > 0) { this.updateBiggerAndSmallerAssociations(n2, n1); return 1 }
            this.updateBiggerAndSmallerAssociations(n1, n2); return -1
          } else if (n1SourceFeedbackNode && n2TargetFeedbackNode) { this.updateBiggerAndSmallerAssociations(n2, n1); return 1 }
          else if (n1TargetFeedbackNode && n2SourceFeedbackNode) { this.updateBiggerAndSmallerAssociations(n1, n2); return -1 }
          else if (n1TargetFeedbackNode && n2TargetFeedbackNode) return 0
        } else {
          for (const port of n1ReferenceNode.getPorts()) {
            if (n1dummyNodeSourcePort === port) { this.updateBiggerAndSmallerAssociations(n2, n1); return -1 }
            if (n2dummyNodeSourcePort === port) { this.updateBiggerAndSmallerAssociations(n1, n2); return 1 }
          }
        }
      }
      return this.compare(n1ReferenceNode, n2ReferenceNode)
    }
    return 0
  }

  private getFirstIncomingPortOfNode(node: LNode): LPort {
    return node.getPorts().find(p => p.getIncomingEdges().length > 0)!
  }

  private getFirstIncomingSourcePortOfNode(node: LNode): LPort {
    return this.getFirstIncomingPortOfNode(node).getIncomingEdges()[0]!.getSource()!
  }

  private getFirstOutgoingPortOfNode(node: LNode): LPort {
    return node.getPorts().find(p => p.getOutgoingEdges().length > 0)!
  }

  private getFirstOutgoingTargetPortOfNode(node: LNode): LPort {
    return this.getFirstOutgoingPortOfNode(node).getOutgoingEdges()[0]!.getTarget()!
  }

  clearTransitiveOrdering(): void {
    this.biggerThan = new Map()
    this.smallerThan = new Map()
  }
}

export function longEdgeReturnValue(strategy: LongEdgeOrderingStrategy): number {
  switch (strategy) {
    case 'DUMMY_NODE_OVER': return Number.MAX_SAFE_INTEGER
    case 'DUMMY_NODE_UNDER': return Number.MIN_SAFE_INTEGER
    default: return 0
  }
}

export function portSideOrdinal(side: PortSide): number {
  switch (side) {
    case PortSide.UNDEFINED: return 0
    case PortSide.NORTH: return 1
    case PortSide.EAST: return 2
    case PortSide.SOUTH: return 3
    case PortSide.WEST: return 4
  }
}
