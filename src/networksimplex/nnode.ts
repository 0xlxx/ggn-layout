/**
 * NNode (对应 ELK networksimplex.NNode).
 */
import type { NGraph } from './ngraph.js'
import type { NEdge } from './nedge.js'

export class NNode {
  /** A public id, unused internally, use it for whatever you want. */
  id = 0
  /** Internally set and used id to index arrays. */
  internalId = 0
  /** An object from which this node is derived. */
  origin: unknown = null
  /** The type is attached as label to the debug graph. Apart from this it has no semantic meaning. */
  type = ''

  /** The layer each node is currently assigned to. */
  layer = 0

  private outgoingEdges: NEdge[] = []
  private incomingEdges: NEdge[] = []
  private allEdgesCache: NEdge[] | null = null

  /** A flag indicating whether a specified node is part of the spanning tree. */
  treeNode = false

  /** A collection of edges for which cutvalues are unknown. */
  unknownCutvalues: NEdge[] = []

  getOutgoingEdges(): NEdge[] {
    return this.outgoingEdges
  }

  getIncomingEdges(): NEdge[] {
    return this.incomingEdges
  }

  getConnectedEdges(): NEdge[] {
    if (this.allEdgesCache === null) {
      this.allEdgesCache = [...this.incomingEdges, ...this.outgoingEdges]
    }
    return this.allEdgesCache
  }

  /** 边列表变更后使缓存失效. */
  invalidateConnectedEdges(): void {
    this.allEdgesCache = null
  }
}

export class NNodeBuilder {
  private node: NNode

  constructor() {
    this.node = new NNode()
  }

  id(id: number): NNodeBuilder {
    this.node.id = id
    return this
  }

  origin(origin: unknown): NNodeBuilder {
    this.node.origin = origin
    return this
  }

  type(type: string): NNodeBuilder {
    this.node.type = type
    return this
  }

  create(graph: NGraph): NNode {
    graph.nodes.push(this.node)
    return this.node
  }
}

export function nn(): NNodeBuilder {
  return new NNodeBuilder()
}
