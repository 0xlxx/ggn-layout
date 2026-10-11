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
/**
 * NEdge (对应 ELK networksimplex.NEdge).
 */
import type { NNode } from './nnode.js'

export class NEdge {
  /** A public id, unused internally, use it for whatever you want. */
  id = 0
  /** Internally set and used id to index arrays. */
  internalId = 0
  /** An object from which this edge is derived. */
  origin: unknown = null
  /** The source node of this edge. */
  source!: NNode
  /** The target node of this edge. */
  target!: NNode
  /** The weight of this edge. */
  weight = 0
  /** The minimum length of this edge. */
  delta = 1

  /** A flag indicating whether a specified edge is part of the spanning tree. */
  treeEdge = false

  getSource(): NNode {
    return this.source
  }

  getTarget(): NNode {
    return this.target
  }

  /** The opposite node of {@code some}. */
  getOther(some: NNode): NNode {
    if (some === this.source) return this.target
    if (some === this.target) return this.source
    throw new Error('Node not part of edge')
  }

  /** Reversed this edge, i.e. the target becomes the source and the source becomes the target. */
  reverse(): NEdge {
    const tmp = this.source
    this.source = this.target
    this.target = tmp

    const tgOut = this.target.getOutgoingEdges()
    const idx1 = tgOut.indexOf(this)
    if (idx1 !== -1) tgOut.splice(idx1, 1)
    this.target.getIncomingEdges().push(this)

    const srcIn = this.source.getIncomingEdges()
    const idx2 = srcIn.indexOf(this)
    if (idx2 !== -1) srcIn.splice(idx2, 1)
    this.source.getOutgoingEdges().push(this)

    this.source.invalidateConnectedEdges()
    this.target.invalidateConnectedEdges()
    return this
  }
}

export class NEdgeBuilder {
  private edge: NEdge

  constructor() {
    this.edge = new NEdge()
  }

  id(id: number): NEdgeBuilder {
    this.edge.id = id
    return this
  }

  origin(origin: unknown): NEdgeBuilder {
    this.edge.origin = origin
    return this
  }

  weight(weight: number): NEdgeBuilder {
    this.edge.weight = weight
    return this
  }

  delta(delta: number): NEdgeBuilder {
    this.edge.delta = delta
    return this
  }

  source(source: NNode): NEdgeBuilder {
    this.edge.source = source
    return this
  }

  target(target: NNode): NEdgeBuilder {
    this.edge.target = target
    return this
  }

  create(): NEdge {
    if (this.edge.source === undefined || this.edge.target === undefined) {
      throw new Error('NEdge must have a source and target NNode specified.')
    }
    if (this.edge.source === this.edge.target) {
      throw new Error('Network simplex does not support self-loops')
    }
    this.edge.source.getOutgoingEdges().push(this.edge)
    this.edge.target.getIncomingEdges().push(this.edge)
    this.edge.source.invalidateConnectedEdges()
    this.edge.target.invalidateConnectedEdges()
    return this.edge
  }
}

export function ne(): NEdgeBuilder {
  return new NEdgeBuilder()
}
