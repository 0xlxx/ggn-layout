/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * NeighborhoodInformation (对应 ELK p4nodes.bk.NeighborhoodInformation).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { PRIORITY_STRAIGHTNESS } from '../options/layered-options.js'

export interface Pair<A, B> {
  first: A
  second: B
}

export function pair<A, B>(first: A, second: B): Pair<A, B> {
  return { first, second }
}

export class NeighborhoodInformation {
  nodeCount = 0
  layerIndex: number[] = []
  nodeIndex: number[] = []
  leftNeighbors: Pair<LNode, LEdge>[][] = []
  rightNeighbors: Pair<LNode, LEdge>[][] = []

  static buildFor(graph: LGraph): NeighborhoodInformation {
    const ni = new NeighborhoodInformation()
    ni.nodeCount = 0
    for (const layer of graph.getLayers()) ni.nodeCount += layer.getNodes().length

    let lId = 0
    let lIndex = 0
    ni.layerIndex = new Array(graph.getLayers().length)
    let nId = 0
    ni.nodeIndex = new Array(ni.nodeCount)
    for (const l of graph.getLayers()) {
      l.id = lId++
      ni.layerIndex[l.id] = lIndex++
      let nIndex = 0
      for (const n of l.getNodes()) {
        n.id = nId++
        ni.nodeIndex[n.id] = nIndex++
      }
    }

    ni.leftNeighbors = []
    NeighborhoodInformation.determineAllLeftNeighbors(ni, graph)
    ni.rightNeighbors = []
    NeighborhoodInformation.determineAllRightNeighbors(ni, graph)
    return ni
  }

  private static determineAllLeftNeighbors(ni: NeighborhoodInformation, graph: LGraph): void {
    for (const l of graph.getLayers()) {
      for (const n of l.getNodes()) {
        const result: Pair<LNode, LEdge>[] = []
        let maxPriority = 0
        for (const edge of n.getIncomingEdges()) {
          if (edge.isSelfLoop() || edge.isInLayerEdge()) continue
          const edgePrio = edge.getProperty(PRIORITY_STRAIGHTNESS)
          if (edgePrio > maxPriority) {
            maxPriority = edgePrio
            result.length = 0
          }
          if (edgePrio === maxPriority) {
            result.push(pair(edge.getSource()!.getNode()!, edge))
          }
        }
        result.sort((o1, o2) => Math.sign(ni.nodeIndex[o1.first.id]! - ni.nodeIndex[o2.first.id]!))
        ni.leftNeighbors[n.id] = result
      }
    }
  }

  private static determineAllRightNeighbors(ni: NeighborhoodInformation, graph: LGraph): void {
    for (const l of graph.getLayers()) {
      for (const n of l.getNodes()) {
        const result: Pair<LNode, LEdge>[] = []
        let maxPriority = 0
        for (const edge of n.getOutgoingEdges()) {
          if (edge.isSelfLoop() || edge.isInLayerEdge()) continue
          const edgePrio = edge.getProperty(PRIORITY_STRAIGHTNESS)
          if (edgePrio > maxPriority) {
            maxPriority = edgePrio
            result.length = 0
          }
          if (edgePrio === maxPriority) {
            result.push(pair(edge.getTarget()!.getNode()!, edge))
          }
        }
        result.sort((o1, o2) => Math.sign(ni.nodeIndex[o1.first.id]! - ni.nodeIndex[o2.first.id]!))
        ni.rightNeighbors[n.id] = result
      }
    }
  }

  cleanup(): void {
    this.leftNeighbors = []
    this.rightNeighbors = []
  }
}
