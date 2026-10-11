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
 * LayerConstraintPreprocessor (对应 ELK intermediate.LayerConstraintPreprocessor).
 * 隐藏 FIRST_SEPARATE / LAST_SEPARATE 节点 (外部端口 dummy), 断开其边并记录.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { LayerConstraint, NodeType } from '../graph/enums.js'
import { HIDDEN_NODES, ORIGINAL_OPPOSITE_PORT } from '../options/internal-properties.js'
import { LAYERING_LAYER_CONSTRAINT } from '../options/layered-options.js'

enum HiddenNodeConnections {
  NONE = 'NONE',
  FIRST_SEPARATE = 'FIRST_SEPARATE',
  LAST_SEPARATE = 'LAST_SEPARATE',
  BOTH = 'BOTH',
}

const hiddenNodeConnections = new WeakMap<LNode, HiddenNodeConnections>()

export class LayerConstraintPreprocessor {
  process(layeredGraph: LGraph): void {
    const hiddenNodes: LNode[] = []

    const nodeIterator = [...layeredGraph.getLayerlessNodes()]
    for (const lNode of nodeIterator) {
      if (this.isRelevantNode(lNode)) {
        this.hide(lNode)
        hiddenNodes.push(lNode)
        const idx = layeredGraph.getLayerlessNodes().indexOf(lNode)
        if (idx !== -1) layeredGraph.getLayerlessNodes().splice(idx, 1)
      }
    }

    if (hiddenNodes.length > 0) {
      layeredGraph.setProperty(HIDDEN_NODES, hiddenNodes)
    }
  }

  private isRelevantNode(lNode: LNode): boolean {
    const lc = lNode.getLayerConstraint()
    return lc === LayerConstraint.FIRST_SEPARATE || lc === LayerConstraint.LAST_SEPARATE
  }

  private hide(lNode: LNode): void {
    this.ensureNoInacceptableEdges(lNode)
    for (const lEdge of [...lNode.getConnectedEdges()]) {
      this.hideEdge(lNode, lEdge)
    }
  }

  private hideEdge(lNode: LNode, lEdge: LEdge): void {
    const isOutgoing = lEdge.getSource()!.getNode() === lNode
    const oppositePort = isOutgoing ? lEdge.getTarget()! : lEdge.getSource()!
    if (isOutgoing) {
      lEdge.setTarget(null)
    } else {
      lEdge.setSource(null)
    }
    lEdge.setProperty(ORIGINAL_OPPOSITE_PORT, oppositePort)
    this.updateOppositeNodeLayerConstraints(lNode, oppositePort.getNode()!)
  }

  private updateOppositeNodeLayerConstraints(hiddenNode: LNode, oppositeNode: LNode): void {
    if (oppositeNode.getLayerConstraint() !== null) return

    const current = hiddenNodeConnections.get(oppositeNode) ?? HiddenNodeConnections.NONE
    const hiddenLc = hiddenNode.getLayerConstraint() ?? LayerConstraint.NONE
    const connections = this.combine(current, hiddenLc)
    hiddenNodeConnections.set(oppositeNode, connections)

    if (oppositeNode.getConnectedEdges().length > 0) return

    switch (connections) {
      case HiddenNodeConnections.FIRST_SEPARATE:
        oppositeNode.setLayerConstraint(LayerConstraint.FIRST)
        break
      case HiddenNodeConnections.LAST_SEPARATE:
        oppositeNode.setLayerConstraint(LayerConstraint.LAST)
        break
      default:
        break
    }
  }

  private combine(current: HiddenNodeConnections, lc: LayerConstraint): HiddenNodeConnections {
    if (current === HiddenNodeConnections.NONE) {
      return lc === LayerConstraint.FIRST_SEPARATE ? HiddenNodeConnections.FIRST_SEPARATE : HiddenNodeConnections.LAST_SEPARATE
    }
    if (current === HiddenNodeConnections.FIRST_SEPARATE) {
      return lc === LayerConstraint.FIRST_SEPARATE ? HiddenNodeConnections.FIRST_SEPARATE : HiddenNodeConnections.BOTH
    }
    if (current === HiddenNodeConnections.LAST_SEPARATE) {
      return lc === LayerConstraint.FIRST_SEPARATE ? HiddenNodeConnections.BOTH : HiddenNodeConnections.LAST_SEPARATE
    }
    return HiddenNodeConnections.BOTH
  }

  private ensureNoInacceptableEdges(lNode: LNode): void {
    const lc = lNode.getLayerConstraint()
    if (lc === LayerConstraint.FIRST_SEPARATE) {
      for (const inEdge of lNode.getIncomingEdges()) {
        if (!this.isAcceptableIncidentEdge(inEdge)) {
          throw new Error('FIRST_SEPARATE node must not have incoming edges')
        }
      }
    } else if (lc === LayerConstraint.LAST_SEPARATE) {
      for (const outEdge of lNode.getOutgoingEdges()) {
        if (!this.isAcceptableIncidentEdge(outEdge)) {
          throw new Error('LAST_SEPARATE node must not have outgoing edges')
        }
      }
    }
  }

  private isAcceptableIncidentEdge(edge: LEdge): boolean {
    const sourceNode = edge.getSource()!.getNode()
    const targetNode = edge.getTarget()!.getNode()
    void sourceNode
    void targetNode
    return sourceNode !== null && targetNode !== null
      && sourceNode.getType() === NodeType.EXTERNAL_PORT && targetNode.getType() === NodeType.EXTERNAL_PORT
  }
}

void LAYERING_LAYER_CONSTRAINT
