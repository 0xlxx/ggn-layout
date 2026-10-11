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
 * EdgeAndLayerConstraintEdgeReverser (对应 ELK intermediate.EdgeAndLayerConstraintEdgeReverser).
 * P1 前置: 反转违反方向约束的边 —
 *   - FIRST/LAST 层约束节点: 反转边使满足 OUTGOING_ONLY/INCOMING_ONLY
 *   - FIXED_SIDE 且所有端口都"反向" (WEST 输出 / EAST 输入) 的节点: 反转全部边
 *     (west_output/feedback_edge/east_input 等 inverted-ports 图依赖此行为).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide, PortType, LayerConstraint, EdgeConstraint, PortConstraints } from '../graph/enums.js'
import { REVERSED } from '../options/internal-properties.js'
import { EDGE_CONSTRAINT, PORT_CONSTRAINTS } from '../options/layered-options.js'

export class EdgeAndLayerConstraintEdgeReverser {
  process(layeredGraph: LGraph): void {
    const remainingNodes = this.handleOuterNodes(layeredGraph)
    this.handleInnerNodes(layeredGraph, remainingNodes)
  }

  private handleOuterNodes(layeredGraph: LGraph): LNode[] {
    const remainingNodes: LNode[] = []
    for (const node of layeredGraph.getLayerlessNodes()) {
      if (!this.handleLayerConstraintNode(layeredGraph, node)) {
        remainingNodes.push(node)
      }
    }
    return remainingNodes
  }

  private handleInnerNodes(layeredGraph: LGraph, remainingNodes: LNode[]): void {
    for (const node of remainingNodes) {
      this.handleLayerConstraintNode(layeredGraph, node)
      // FIXED_SIDE 且所有端口都"反向" (WEST 输出 / EAST 输入) → 反转全部边.
      if (PortConstraints.isSideFixed(node.getProperty(PORT_CONSTRAINTS)) && node.getPorts().length > 0) {
        let allPortsReversed = true
        if (process.env.GGN_REV_DBG) console.error(`[REV] node ${node.id} ports=${node.getPorts().length}`)
        for (const port of node.getPorts()) {
          if (process.env.GGN_REV_DBG) console.error(`[REV]   port side=${port.getSide()} netFlow=${port.getNetFlow()} out=${port.getOutgoingEdges().map(e => (e.getSource() ? 'P' + e.getSource()!.id : '?') + '->' + (e.getTarget() ? 'P' + e.getTarget()!.id : '?')).join(';')} in=${port.getIncomingEdges().map(e => (e.getSource() ? 'P' + e.getSource()!.id : '?') + '->' + (e.getTarget() ? 'P' + e.getTarget()!.id : '?')).join(';')}`)
          const side = port.getSide()
          const netFlow = port.getNetFlow()
          if (!((side === PortSide.EAST && netFlow > 0) || (side === PortSide.WEST && netFlow < 0))) {
            allPortsReversed = false
            break
          }
          for (const e of port.getOutgoingEdges()) {
            const lc = e.getTarget()?.getNode()?.getLayerConstraint()
            if (lc === LayerConstraint.LAST || lc === LayerConstraint.LAST_SEPARATE) {
              allPortsReversed = false
              break
            }
          }
          if (!allPortsReversed) break
          for (const e of port.getIncomingEdges()) {
            const lc = e.getSource()?.getNode()?.getLayerConstraint()
            if (lc === LayerConstraint.FIRST || lc === LayerConstraint.FIRST_SEPARATE) {
              allPortsReversed = false
              break
            }
          }
          if (!allPortsReversed) break
        }
        if (process.env.GGN_REV_DBG) console.error(`[REV] node ${node.id} allReversed=${allPortsReversed}`)
        if (allPortsReversed) {
          this.reverseEdges(layeredGraph, node, LayerConstraint.NONE, PortType.UNDEFINED)
        }
      }
    }
  }

  /** 处理 FIRST/LAST 层约束节点的边反转; 返回 true 表示节点有层约束且已处理. */
  private handleLayerConstraintNode(layeredGraph: LGraph, node: LNode): boolean {
    const layerConstraint = node.getLayerConstraint()
    let edgeConstraint: EdgeConstraint | null = null
    switch (layerConstraint) {
      case LayerConstraint.FIRST:
      case LayerConstraint.FIRST_SEPARATE:
        edgeConstraint = EdgeConstraint.OUTGOING_ONLY
        break
      case LayerConstraint.LAST:
      case LayerConstraint.LAST_SEPARATE:
        edgeConstraint = EdgeConstraint.INCOMING_ONLY
        break
    }
    if (edgeConstraint !== null) {
      // 照抄 ELK: 无条件设 OUTGOING_ONLY (源码行为).
      node.setProperty(EDGE_CONSTRAINT, EdgeConstraint.OUTGOING_ONLY)
      if (edgeConstraint === EdgeConstraint.INCOMING_ONLY) {
        this.reverseEdges(layeredGraph, node, layerConstraint!, PortType.INPUT)
      } else {
        this.reverseEdges(layeredGraph, node, layerConstraint!, PortType.OUTPUT)
      }
      return true
    }
    return false
  }

  private reverseEdges(layeredGraph: LGraph, node: LNode, nodeLayerConstraint: LayerConstraint,
    targetPortType: PortType): void {
    for (const port of [...node.getPorts()]) {
      if (targetPortType === PortType.INPUT || targetPortType === PortType.UNDEFINED) {
        for (const edge of [...port.getOutgoingEdges()]) {
          if (this.canReverseOutgoingEdge(nodeLayerConstraint, edge)) {
            edge.reverse(layeredGraph, true)
          }
        }
      }
      if (targetPortType === PortType.OUTPUT || targetPortType === PortType.UNDEFINED) {
        for (const edge of [...port.getIncomingEdges()]) {
          if (this.canReverseIncomingEdge(nodeLayerConstraint, edge)) {
            edge.reverse(layeredGraph, true)
          }
        }
      }
    }
  }

  private canReverseOutgoingEdge(sourceNodeLayerConstraint: LayerConstraint, edge: LEdge): boolean {
    if (edge.getProperty(REVERSED)) return false
    const targetNode = edge.getTarget()?.getNode()
    if (targetNode === null || targetNode === undefined) return false
    if (sourceNodeLayerConstraint === LayerConstraint.LAST && targetNode.getType() === NodeType.LABEL) {
      return false
    }
    if (targetNode.getLayerConstraint() === LayerConstraint.LAST_SEPARATE) return false
    return true
  }

  private canReverseIncomingEdge(targetNodeLayerConstraint: LayerConstraint, edge: LEdge): boolean {
    if (edge.getProperty(REVERSED)) return false
    const sourceNode = edge.getSource()?.getNode()
    if (sourceNode === null || sourceNode === undefined) return false
    if (targetNodeLayerConstraint === LayerConstraint.FIRST && sourceNode.getType() === NodeType.LABEL) {
      return false
    }
    if (sourceNode.getLayerConstraint() === LayerConstraint.FIRST_SEPARATE) return false
    return true
  }
}
