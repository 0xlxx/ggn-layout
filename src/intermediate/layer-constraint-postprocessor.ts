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
 * LayerConstraintPostprocessor (对应 ELK intermediate.LayerConstraintPostprocessor).
 * 移动 FIRST/LAST 节点到首/末层, 恢复 hidden FIRST_SEPARATE/LAST_SEPARATE 节点.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { Layer } from '../graph/layer.js'
import { LayerConstraint } from '../graph/enums.js'
import { HIDDEN_NODES, ORIGINAL_OPPOSITE_PORT } from '../options/internal-properties.js'

export function processLayerConstraintPost(layeredGraph: LGraph): void {
    const layers = layeredGraph.getLayers()

    if (layers.length > 0) {
      const firstLayer = layers[0]!
      const lastLayer = layers[layers.length - 1]!
      moveFirstAndLastNodes(layeredGraph, firstLayer, lastLayer)
    }

    const hiddenNodes = layeredGraph.getProperty(HIDDEN_NODES)
    if (hiddenNodes !== undefined && hiddenNodes.length > 0) {
      const firstSeparateLayer = new Layer(layeredGraph)
      const lastSeparateLayer = new Layer(layeredGraph)
      restoreHiddenNodes(hiddenNodes, firstSeparateLayer, lastSeparateLayer)
      if (firstSeparateLayer.getNodes().length > 0) {
        layers.unshift(firstSeparateLayer)
      }
      if (lastSeparateLayer.getNodes().length > 0) {
        layers.push(lastSeparateLayer)
      }
    }

    // 清理空层 (防御: P2 孤立节点处理可能产生空层).
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i]!.getNodes().length === 0) {
        layers.splice(i, 1)
      }
    }
  }

function moveFirstAndLastNodes(layeredGraph: LGraph, firstLayer: Layer, lastLayer: Layer): void {
    for (const layer of [...layeredGraph.getLayers()]) {
      for (const node of [...layer.getNodes()]) {
        const lc = node.getLayerConstraint()
        if (lc === LayerConstraint.FIRST) {
          node.setLayer(firstLayer)
        } else if (lc === LayerConstraint.LAST) {
          node.setLayer(lastLayer)
        }
      }
    }

    // 移除空层 (ELK: 移动可能导致空层).
    const layers = layeredGraph.getLayers()
    for (let i = layers.length - 1; i >= 0; i--) {
      if (layers[i]!.getNodes().length === 0) {
        layers.splice(i, 1)
      }
    }
  }

function restoreHiddenNodes(hiddenNodes: LNode[], firstSeparateLayer: Layer, lastSeparateLayer: Layer): void {
    for (const hiddenNode of hiddenNodes) {
      const lc = hiddenNode.getLayerConstraint()
      if (lc === LayerConstraint.FIRST_SEPARATE) {
        hiddenNode.setLayer(firstSeparateLayer)
      } else if (lc === LayerConstraint.LAST_SEPARATE) {
        hiddenNode.setLayer(lastSeparateLayer)
      }

      for (const hiddenEdge of hiddenNode.getConnectedEdges()) {
        if (hiddenEdge.getSource() !== null && hiddenEdge.getTarget() !== null) continue

        const isOutgoing = hiddenEdge.getTarget() === null
        const originalOppositePort = hiddenEdge.getProperty(ORIGINAL_OPPOSITE_PORT)
        if (isOutgoing) {
          hiddenEdge.setTarget(originalOppositePort)
        } else {
          hiddenEdge.setSource(originalOppositePort)
        }
      }
    }
  }
