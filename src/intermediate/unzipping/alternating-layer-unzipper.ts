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
 * AlternatingLayerUnzipper (对应 ELK intermediate.unzipping.AlternatingLayerUnzipper).
 * 把节点按 A-B-A 模式拆分到多个子层 (更紧凑布局). P4 前运行.
 */
import { NodeType, PortConstraints } from '../../graph/enums.js'
import type { LEdge } from '../../graph/ledge.js'
import { LGraph } from '../../graph/lgraph.js'
import { LNode } from '../../graph/lnode.js'
import { Layer } from '../../graph/layer.js'
import { ORIGIN } from '../../options/internal-properties.js'
import {
  LAYER_UNZIPPING_LAYER_SPLIT, LAYER_UNZIPPING_MINIMIZE_EDGE_LENGTH,
  LAYER_UNZIPPING_RESET_ON_LONG_EDGES, PORT_CONSTRAINTS,
  SPACING_EDGE_NODE, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE_BETWEEN_LAYERS, SPACING_EDGE_EDGE_BETWEEN_LAYERS,
} from '../../options/layered-options.js'
import { splitEdge } from '../long-edge-splitter.js'

export function alternatingLayerUnzip(graph: LGraph): void {
  let insertionLayerOffset = 1
  const newLayers: { layer: Layer, index: number }[] = []
  for (let i = 0; i < graph.getLayers().length; i++) {
    const layer = graph.getLayers()[i]!
    const N = getLayerSplitProperty(layer)
      const resetOnLongEdges = getResetOnLongEdgesProperty(layer)
    const minimizeEdgeLength = getMinimizeEdgeLengthProperty(layer)

    if (minimizeEdgeLength) {
      let maxWidth = 0
      let averageHeight = 0
      for (const node of layer.getNodes()) {
        maxWidth = Math.max(maxWidth, node.size.x)
        averageHeight += node.size.y
      }
      averageHeight /= layer.getNodes().length
      maxWidth += Math.max(2 * graph.getProperty(SPACING_EDGE_NODE_BETWEEN_LAYERS),
        Math.max(layer.getNodes().length * graph.getProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS),
          graph.getProperty(SPACING_NODE_NODE_BETWEEN_LAYERS)))
      averageHeight += Math.max(graph.getProperty(SPACING_NODE_NODE), graph.getProperty(SPACING_EDGE_NODE))
      if (maxWidth / averageHeight >= layer.getNodes().length / 4.0) continue
    }

    if (layer.getNodes().length >= N) {
      const subLayers: Layer[] = [layer]
      for (let j = 0; j < N - 1; j++) {
        const newLayer = new Layer(graph)
        newLayers.push({ layer: newLayer, index: i + j + insertionLayerOffset })
        subLayers.push(newLayer)
      }
      insertionLayerOffset += N - 1

      const nodesInLayer = subLayers[0]!.getNodes().length
      for (let j = 0, nodeIndex = 0, targetLayer = 0; j < nodesInLayer; j++, nodeIndex++, targetLayer++) {
        const node = subLayers[0]!.getNodes()[nodeIndex]!
        if (node.getType() !== NodeType.NONSHIFTING_PLACEHOLDER) {
          nodeIndex += shiftNode(graph, subLayers, targetLayer % N, nodeIndex)
        } else {
          j -= 1
          targetLayer -= 1
        }
        if (resetOnLongEdges && node.getType() === NodeType.LONG_EDGE) {
          targetLayer = -1
        }
      }
    }
  }

  for (const nl of newLayers) {
    graph.getLayers().splice(nl.index, 0, nl.layer)
  }

  for (const layer of graph.getLayers()) {
    const nodes = layer.getNodes()
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!
      if (node.getType() === NodeType.PLACEHOLDER || node.getType() === NodeType.NONSHIFTING_PLACEHOLDER) {
        nodes.splice(i, 1)
      }
    }
  }
}

function getLayerSplitProperty(layer: Layer): number {
  let layerSplit = Number.MAX_SAFE_INTEGER
  let propertyUnset = true
  for (let i = 0; i < layer.getNodes().length; i++) {
    const node = layer.getNodes()[i]!
    if (node.hasProperty(LAYER_UNZIPPING_LAYER_SPLIT)) {
      propertyUnset = false
      const nodeValue = node.getProperty<number>(LAYER_UNZIPPING_LAYER_SPLIT)
      layerSplit = layerSplit < nodeValue ? layerSplit : nodeValue
    }
  }
  if (propertyUnset) layerSplit = LAYER_UNZIPPING_LAYER_SPLIT.getDefault()
  return layerSplit
}

function getResetOnLongEdgesProperty(layer: Layer): boolean {
  for (let i = 0; i < layer.getNodes().length; i++) {
    const node = layer.getNodes()[i]!
    if (node.hasProperty(LAYER_UNZIPPING_RESET_ON_LONG_EDGES)) {
      if (!node.getProperty<boolean>(LAYER_UNZIPPING_RESET_ON_LONG_EDGES)) return false
    }
  }
  return true
}

function getMinimizeEdgeLengthProperty(layer: Layer): boolean {
  for (let i = 0; i < layer.getNodes().length; i++) {
    const node = layer.getNodes()[i]!
    if (node.hasProperty(LAYER_UNZIPPING_MINIMIZE_EDGE_LENGTH)) {
      if (node.getProperty<boolean>(LAYER_UNZIPPING_MINIMIZE_EDGE_LENGTH)) return true
    }
  }
  return false
}

function shiftNode(graph: LGraph, subLayers: Layer[], targetLayer: number, nodeIndex: number): number {
  const node = subLayers[0]!.getNodes()[nodeIndex]!
  if (targetLayer > 0) node.setLayer(subLayers[targetLayer]!)

  let edgeCount = 0
  let noIncomingEdges = true
  const reversedIncomingEdges = [...node.getIncomingEdges()].reverse()
  for (const incomingEdge of reversedIncomingEdges) {
    noIncomingEdges = false
    let nextEdgeToSplit = incomingEdge
    for (let layerIndex = 0; layerIndex < targetLayer; layerIndex++) {
      const dummyNode = createDummyNode(graph, nextEdgeToSplit)
      if (nodeIndex + edgeCount > subLayers[layerIndex]!.getNodes().length) {
        dummyNode.setLayer(subLayers[layerIndex]!)
      } else {
        dummyNode.setLayerAt(nodeIndex + edgeCount, subLayers[layerIndex]!)
      }
      nextEdgeToSplit = splitEdge(nextEdgeToSplit, dummyNode)
    }
    if (targetLayer > 0) edgeCount += 1
  }

  if (noIncomingEdges) {
    for (let layerIndex = 0; layerIndex < targetLayer; layerIndex++) {
      const dummyNode = new LNode(graph)
      dummyNode.setType(NodeType.PLACEHOLDER)
      if (nodeIndex + edgeCount > subLayers[layerIndex]!.getNodes().length) {
        dummyNode.setLayer(subLayers[layerIndex]!)
      } else {
        dummyNode.setLayerAt(nodeIndex + edgeCount, subLayers[layerIndex]!)
      }
    }
    if (targetLayer > 0) edgeCount += 1
  }

  let extraEdge = false
  for (const outgoingEdge of node.getOutgoingEdges()) {
    let nextEdgeToSplit = outgoingEdge
    for (let layerIndex = targetLayer + 1; layerIndex < subLayers.length; layerIndex++) {
      const dummyNode = createDummyNode(graph, nextEdgeToSplit)
      dummyNode.setLayer(subLayers[layerIndex]!)
      nextEdgeToSplit = splitEdge(nextEdgeToSplit, dummyNode)
    }
    for (let layerIndex = 0; layerIndex <= targetLayer; layerIndex++) {
      if (extraEdge) {
        const placeholder = new LNode(graph)
        placeholder.setType(NodeType.NONSHIFTING_PLACEHOLDER)
        if (nodeIndex + 1 > subLayers[layerIndex]!.getNodes().length) {
          placeholder.setLayer(subLayers[layerIndex]!)
        } else {
          placeholder.setLayerAt(nodeIndex + 1, subLayers[layerIndex]!)
        }
      }
    }
    if (extraEdge) edgeCount += 1
    extraEdge = true
  }

  return edgeCount > 0 ? edgeCount - 1 : 0
}

function createDummyNode(graph: LGraph, nextEdgeToSplit: LEdge): LNode {
  const dummyNode = new LNode(graph)
  dummyNode.setType(NodeType.LONG_EDGE)
  dummyNode.setProperty(ORIGIN, nextEdgeToSplit)
  dummyNode.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
  return dummyNode
}
