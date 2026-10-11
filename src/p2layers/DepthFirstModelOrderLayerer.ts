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
 * DepthFirstModelOrderLayerer (对应 ELK p2layers.DepthFirstModelOrderLayerer) — 1:1 移植.
 *
 * 假设输入按深度优先模型序排列的分层器, 按模型序以条带 (strip) 方式放置节点:
 * 1 -> 2 -> 3
 *        \
 *      4 -> 5 -> 6
 *
 *   - Precondition: 图无环; 每个节点是 NORMAL 且有 MODEL_ORDER (或 LABEL dummy).
 *   - Postcondition: 边只连接层号递增的节点.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { Layer } from '../graph/layer.js'
import { NodeType } from '../graph/enums.js'
import { MODEL_ORDER } from '../options/internal-properties.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class DepthFirstModelOrderLayerer {
  /** The layered graph to which layers are added. */
  private layeredGraph!: LGraph

  /** The current layer without the nodesToPlace. */
  private currentLayer!: Layer

  /** The current layer id. */
  private currentLayerId = 0

  /** The current dummy layer without the nodesToPlace. */
  private currentDummyLayer: Layer | null = null

  /**
   * Holds nodes that will be placed once a new strip is connected to the rest of the graph.
   * The node id holds the currently desired layer.
   */
  private nodesToPlace: LNode[] = []

  /**
   * Saves the maximum layer the nodes that still have to be assigned to a layer will be placed in.
   * This is necessary to determine the actual offset of the nodes to place.
   */
  private maxToPlace = 0

  process(thelayeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Depth first model order layering', 1)

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
      throw new Error('The DF model order layer assigner requires all real nodes to have a model order.')
    })
    let firstNode = true
    this.currentLayer = new Layer(this.layeredGraph)
    this.currentDummyLayer = null
    this.layeredGraph.getLayers().push(this.currentLayer)
    this.currentLayer.id = 0
    this.currentLayerId = 0
    this.nodesToPlace = []
    for (const node of realNodes) {
      if (firstNode) {
        // Set the first node in the first layer.
        node.setLayer(this.currentLayer)
        firstNode = false
      } else {
        // Check whether the current node connects to the current layer.
        // If this is the case, place it in the layer after the current one (and add a dummy layer).
        // If not, begin a new "strip" based on the incoming connection of the node.
        if (this.isConnectedToCurrentLayer(node)) {
          // Check whether there are incoming edges to layers higher than currendLayer.id + 2
          let maxLayer = this.currentLayerId
          maxLayer = this.getMaxConnectedLayer(maxLayer, node)
          const desiredLayer = maxLayer + 2
          const layerDiff = maxLayer - this.currentLayerId
          // Move all nodes that where not already placed by the layer difference.
          if (this.nodesToPlace.length > 0) {
            if (layerDiff > 0) {
              // Case some dependency to the existing graph was found add all nodes to their layers.
              for (const toPlace of this.nodesToPlace) {
                toPlace.id += maxLayer - this.maxToPlace
              }
              this.placeNodesToPlace()
              // Remove all nodes since they are now placed correctly.
              this.nodesToPlace = []
              this.addNodeToLayer(desiredLayer, node)
            } else {
              // Case nodes cannot be placed without the need to move them later.
              this.nodesToPlace.push(node)
              node.id = desiredLayer
              this.maxToPlace = Math.max(this.maxToPlace, desiredLayer)
              // Add dummy nodes and give them their desired layer id.
              for (const edge of node.getIncomingEdges()) {
                if (edge.getSource()!.getNode()!.getLayer() === null
                  && edge.getSource()!.getNode()!.getType() === NodeType.LABEL) {
                  this.nodesToPlace.push(edge.getSource()!.getNode()!)
                  edge.getSource()!.getNode()!.id = desiredLayer - 1
                }
              }
              // Update the current layer id.
              this.currentLayerId = desiredLayer
            }
          } else {
            this.addNodeToLayer(desiredLayer, node)
          }
        } else {
          // Case a new strip has to begin.
          this.placeNodesToPlace()
          this.nodesToPlace = []

          // Find the layer for the first element of the strip.
          // If it has no incoming connections it is placed in the first layer.
          // Once a node with a connection to the previous strip is added previous nodes move to be moved,
          // therefore, we need to safe the dependent nodes.
          // If it has an incoming connection, it has to be to an already placed node and hence the new node
          // Should be placed in the current layer after the connected node.
          let desiredLayer = 0
          if (node.getIncomingEdges().length === 0) {
            // Case no incoming connections, save the node to be placed.
            this.nodesToPlace.push(node)
            node.id = 0 // Save the layer the node will be placed in.
            this.maxToPlace = Math.max(this.maxToPlace, 0)
            this.currentLayer = this.layeredGraph.getLayers()[0]!
            this.currentLayerId = 0
          } else {
            // Find the last layer the node is connected to.
            let maxLayer = 0
            maxLayer = this.getMaxConnectedLayer(maxLayer, node)
            desiredLayer = maxLayer + 2
            // Add node to desired layer.
            this.addNodeToLayer(desiredLayer, node)
          }
        }
      }
    }
    // Finish the last
    if (this.nodesToPlace.length > 0) {
      this.placeNodesToPlace()
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

  /**
   * Returns true if a node is connected (directly or by label dummy) to the current layer.
   * @param node The node
   * @return True if the node is connected to the current layer.
   */
  private isConnectedToCurrentLayer(node: LNode): boolean {
    for (const edge of node.getIncomingEdges()) {
      let directlyConnected: boolean
      let connectedViaLabelDummy: boolean
      if (this.nodesToPlace.length === 0) {
        // Case the node to check already has a layer.
        // This may case an NPE if getLayer is null;
        directlyConnected = edge.getSource()!.getNode()!.getType() === NodeType.NORMAL
          && edge.getSource()!.getNode()!.getLayer() !== null
          && edge.getSource()!.getNode()!.getLayer()!.id === this.currentLayerId
        if (edge.getSource()!.getNode()!.getIncomingEdges().length > 0) {
          const connectedLayerViaDummy = edge.getSource()!.getNode()!.getIncomingEdges()[0]!
            .getSource()!.getNode()!.getLayer()
          connectedViaLabelDummy = edge.getSource()!.getNode()!.getType() === NodeType.LABEL
            && connectedLayerViaDummy !== null
            && connectedLayerViaDummy.id === this.currentLayerId
        } else {
          connectedViaLabelDummy = false
        }
      } else {
        // Case the node to check might not be placed yet and the node id holds its desired layer.
        directlyConnected = edge.getSource()!.getNode()!.getType() === NodeType.NORMAL
          && edge.getSource()!.getNode()!.id === this.currentLayerId
        connectedViaLabelDummy = edge.getSource()!.getNode()!.getType() === NodeType.LABEL
          && edge.getSource()!.getNode()!.getIncomingEdges()[0]!.getSource()!.getNode()!.id === this.currentLayerId
      }
      if (directlyConnected || connectedViaLabelDummy) {
        return true
      }
    }
    return false
  }

  /**
   * Adds a node and its label dummies to the desired layer.
   * @param layerId The id of the desired layer.
   * @param node The node.
   */
  private addNodeToLayer(layerId: number, node: LNode): void {
    if (layerId < this.layeredGraph.getLayers().length) {
      // Case the layers already exist.
      this.currentLayer = this.layeredGraph.getLayers()[layerId]!
      this.currentDummyLayer = this.layeredGraph.getLayers()[layerId - 1]!
      this.currentLayerId = layerId
    } else {
      // Case the layers need to be added.
      this.currentDummyLayer = new Layer(this.layeredGraph)
      this.currentDummyLayer.id = layerId - 1
      this.layeredGraph.getLayers().push(this.currentDummyLayer)
      this.currentLayer = new Layer(this.layeredGraph)
      this.currentLayer.id = layerId
      this.layeredGraph.getLayers().push(this.currentLayer)
      this.currentLayerId = layerId
    }
    // Add node
    node.setLayer(this.currentLayer)
    // Add dummy node
    for (const edge of node.getIncomingEdges()) {
      if (edge.getSource()!.getNode()!.getLayer() === null
        && edge.getSource()!.getNode()!.getType() === NodeType.LABEL) {
        edge.getSource()!.getNode()!.setLayer(this.currentDummyLayer)
      }
    }
  }

  /**
   * Returns the highest layer id a node is connected to.
   * @param maxLayer The currently highest layer id.
   * @param node The node.
   * @return The highest layer id the node is connected to.
   */
  private getMaxConnectedLayer(layerId: number, node: LNode): number {
    let maxLayer = layerId
    for (const edge of node.getIncomingEdges()) {
      if (edge.getSource()!.getNode()!.getLayer() !== null) {
        maxLayer = Math.max(maxLayer, edge.getSource()!.getNode()!.getLayer()!.id)
      }
    }
    return maxLayer
  }

  /**
   * Places the nodes to place in their desired layer.
   */
  placeNodesToPlace(): void {
    this.maxToPlace = 0
    for (const nodeToPlace of this.nodesToPlace) {
      if (nodeToPlace.id >= this.layeredGraph.getLayers().length) {
        // Add a normal and a dummy layer.
        const dummyLayer = new Layer(this.layeredGraph)
        dummyLayer.id = nodeToPlace.id - 1
        this.layeredGraph.getLayers().push(dummyLayer)
        const newLayer = new Layer(this.layeredGraph)
        newLayer.id = nodeToPlace.id
        this.layeredGraph.getLayers().push(newLayer)
      }
      nodeToPlace.setLayer(this.layeredGraph.getLayers()[nodeToPlace.id]!)
    }
  }
}
