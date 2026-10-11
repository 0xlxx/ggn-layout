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
 * LongEdgeSplitter (对应 ELK intermediate.LongEdgeSplitter).
 */
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { Layer } from '../graph/layer.js'
import { NodeType, PortSide, PortConstraints } from '../graph/enums.js'
import { ORIGIN, LONG_EDGE_SOURCE, LONG_EDGE_TARGET, LONG_EDGE_HAS_LABEL_DUMMIES, END_LABEL_EDGE } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, EDGE_THICKNESS, JUNCTION_POINTS, EDGE_LABELS_PLACEMENT, EdgeLabelPlacement } from '../options/layered-options.js'

export function processLongEdgeSplit(layeredGraph: LGraph): void {
    if (layeredGraph.getLayers().length <= 2) return

    const layers = layeredGraph.getLayers()
    for (let li = 0; li < layers.length - 1; li++) {
      const layer = layers[li]!
      const nextLayer = layers[li + 1]!

      for (const node of layer.getNodes()) {
        for (const port of node.getPorts()) {
          for (const edge of [...port.getOutgoingEdges()]) {
            const targetPort = edge.getTarget()!
            const targetLayer = targetPort.getNode()!.getLayer()
            // ELK: 只拆分"向前"跨多层的边 (layerIndex(target) - layerIndex(source) > 1).
            if (targetLayer === null) continue
            const targetIndex = targetLayer.getIndex()
            if (targetIndex - li > 1) {
              const dummy = createDummyNode(layeredGraph, nextLayer, edge)
              splitEdge(edge, dummy)
            }
          }
        }
      }
    }
  }

function createDummyNode(layeredGraph: LGraph, targetLayer: Layer, edgeToSplit: LEdge): LNode {
    const dummyNode = new LNode(layeredGraph)
    dummyNode.setType(NodeType.LONG_EDGE)
    dummyNode.setProperty(ORIGIN, edgeToSplit)
    dummyNode.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    dummyNode.setLayer(targetLayer)
    return dummyNode
  }

export function splitEdge(edge: LEdge, dummyNode: LNode): LEdge {
    const oldEdgeTarget = edge.getTarget()!

    let thickness = edge.getProperty(EDGE_THICKNESS)
    if (thickness < 0) {
      thickness = 0
      edge.setProperty(EDGE_THICKNESS, thickness)
    }
    dummyNode.size.y = thickness
    const portPos = Math.floor(thickness / 2)

    const dummyInput = new LPort()
    dummyInput.setSide(PortSide.WEST)
    dummyInput.setNode(dummyNode)
    dummyInput.getPosition().y = portPos

    const dummyOutput = new LPort()
    dummyOutput.setSide(PortSide.EAST)
    dummyOutput.setNode(dummyNode)
    dummyOutput.getPosition().y = portPos

    edge.setTarget(dummyInput)

    const dummyEdge = new LEdge()
    dummyEdge.copyProperties(edge)
    dummyEdge.setProperty(JUNCTION_POINTS, null)
    dummyEdge.setSource(dummyOutput)
    dummyEdge.setTarget(oldEdgeTarget)

    setDummyNodeProperties(dummyNode, edge, dummyEdge)
    moveHeadLabels(edge, dummyEdge)

    return dummyEdge
  }

function setDummyNodeProperties(dummyNode: LNode, inEdge: LEdge, outEdge: LEdge): void {
    const inEdgeSourceNode = inEdge.getSource()!.getNode()!
    const outEdgeTargetNode = outEdge.getTarget()!.getNode()!

    if (inEdgeSourceNode.getType() === NodeType.LONG_EDGE) {
      dummyNode.setProperty(LONG_EDGE_SOURCE, inEdgeSourceNode.getProperty(LONG_EDGE_SOURCE))
      dummyNode.setProperty(LONG_EDGE_TARGET, inEdgeSourceNode.getProperty(LONG_EDGE_TARGET))
      dummyNode.setProperty(LONG_EDGE_HAS_LABEL_DUMMIES, inEdgeSourceNode.getProperty(LONG_EDGE_HAS_LABEL_DUMMIES))
    } else if (inEdgeSourceNode.getType() === NodeType.LABEL) {
      dummyNode.setProperty(LONG_EDGE_SOURCE, inEdgeSourceNode.getProperty(LONG_EDGE_SOURCE))
      dummyNode.setProperty(LONG_EDGE_TARGET, inEdgeSourceNode.getProperty(LONG_EDGE_TARGET))
      dummyNode.setProperty(LONG_EDGE_HAS_LABEL_DUMMIES, true)
    } else if (outEdgeTargetNode.getType() === NodeType.LABEL) {
      dummyNode.setProperty(LONG_EDGE_SOURCE, outEdgeTargetNode.getProperty(LONG_EDGE_SOURCE))
      dummyNode.setProperty(LONG_EDGE_TARGET, outEdgeTargetNode.getProperty(LONG_EDGE_TARGET))
      dummyNode.setProperty(LONG_EDGE_HAS_LABEL_DUMMIES, true)
    } else {
      dummyNode.setProperty(LONG_EDGE_SOURCE, inEdge.getSource())
      dummyNode.setProperty(LONG_EDGE_TARGET, outEdge.getTarget())
    }
  }

function moveHeadLabels(oldEdge: LEdge, newEdge: LEdge): void {
    const labels = [...oldEdge.getLabels()]
    for (const label of labels) {
      const labelPlacement = label.placement
      if (labelPlacement === EdgeLabelPlacement.HEAD) {
        const idx = oldEdge.getLabels().indexOf(label)
        if (idx !== -1) oldEdge.getLabels().splice(idx, 1)
        newEdge.getLabels().push(label)
      }
    }
    void END_LABEL_EDGE
    void EDGE_LABELS_PLACEMENT
  }
