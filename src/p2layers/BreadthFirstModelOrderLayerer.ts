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
 * BreadthFirstModelOrderLayerer (对应 ELK p2layers.BreadthFirstModelOrderLayerer) — 1:1 移植.
 *
 * 假设输入按广度优先模型序排列的分层器:
 *   - Precondition: 图无环; 每个节点是 NORMAL 且有 MODEL_ORDER (或 LABEL dummy).
 *   - Postcondition: 边只连接层号递增的节点; 不存在「模型序更大的节点」位于
 *     「模型序更小的节点」之前的层.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { Layer } from '../graph/layer.js'
import { NodeType } from '../graph/enums.js'
import { MODEL_ORDER } from '../options/internal-properties.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class BreadthFirstModelOrderLayerer {
  /** the layered graph to which layers are added. */
  private layeredGraph!: LGraph

  process(thelayeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Breadth first model order layering', 1)

    this.layeredGraph = thelayeredGraph
    // Add first layer.
    const realNodes: LNode[] = []
    for (const node of this.layeredGraph.getLayerlessNodes()) {
      if (node.getType() === NodeType.NORMAL) {
        realNodes.push(node)
      }
    }
    // Sort real nodes by model order.
    realNodes.sort((n1, n2) => {
      if (n1.hasProperty(MODEL_ORDER) && n2.hasProperty(MODEL_ORDER)) {
        return n1.getProperty(MODEL_ORDER) - n2.getProperty(MODEL_ORDER)
      }
      throw new Error('The BF model order layer assigner requires all real nodes to have a model order.')
    })
    let firstNode = true
    let currentLayer = new Layer(this.layeredGraph)
    let currentDummyLayer: Layer | null = null
    this.layeredGraph.getLayers().push(currentLayer)
    for (const node of realNodes) {
      if (firstNode) {
        // Set the first node in the first layer.
        node.setLayer(currentLayer)
        firstNode = false
      } else {
        // Check for each incoming edge whether it connects to the current layer.
        // If this is the case, add a new dummy and normal layer.
        for (const edge of node.getIncomingEdges()) {
          if ((edge.getSource()!.getNode()!.getType() === NodeType.NORMAL // Case nodes are directly connected
              && edge.getSource()!.getNode()!.getLayer() === currentLayer)
            || (edge.getSource()!.getNode()!.getType() === NodeType.LABEL // Case dummy label in-between.
              && edge.getSource()!.getNode()!.getIncomingEdges()[0]!.getSource()!.getNode()!.getLayer() === currentLayer)) {
            currentDummyLayer = new Layer(this.layeredGraph)
            this.layeredGraph.getLayers().push(currentDummyLayer)
            currentLayer = new Layer(this.layeredGraph)
            this.layeredGraph.getLayers().push(currentLayer)
          }
        }
        // Add all label dummies to the dummy layer between the last layer and the current one.
        for (const edge of node.getIncomingEdges()) {
          if (edge.getSource()!.getNode()!.getType() === NodeType.LABEL
            && edge.getSource()!.getNode()!.getLayer() === null) {
            edge.getSource()!.getNode()!.setLayer(currentDummyLayer)
          }
        }
        // Add the node to the (potentially new) current layer.
        node.setLayer(currentLayer)
      }
    }
    // Empty the list of unlayered nodes.
    this.layeredGraph.getLayerlessNodes().length = 0
    // Delete all empty dummy layers.
    const toDelete: Layer[] = []
    for (const layer of this.layeredGraph.getLayers()) {
      if (layer.getNodes().length === 0) {
        toDelete.push(layer)
      }
    }
    for (const layer of toDelete) {
      const idx = this.layeredGraph.getLayers().indexOf(layer)
      if (idx !== -1) this.layeredGraph.getLayers().splice(idx, 1)
    }
    // Adjust layer ids
    let layerId = 0
    for (const layer of this.layeredGraph.getLayers()) {
      layer.id = layerId
      layerId++
    }
    monitor.done()
  }
}
