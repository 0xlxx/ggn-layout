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
 * SortByInputModelProcessor (对应 ELK intermediate.SortByInputModelProcessor).
 * 按输入模型顺序 (MODEL_ORDER) 排序各层节点与端口.
 */
import { LGraph } from '../graph/lgraph.js'
import type { LEdge } from '../graph/ledge.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import { NodeType, PortConstraints } from '../graph/enums.js'
import { MODEL_ORDER, REVERSED, TARGET_NODE_MODEL_ORDER, LONG_EDGE_TARGET, LONG_EDGE_TARGET_NODE } from '../options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_STRATEGY, CONSIDER_MODEL_ORDER_LONG_EDGE_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER,
  PORT_CONSTRAINTS,
} from '../options/layered-options.js'
import { ModelOrderNodeComparator } from './preserveorder/model-order-node-comparator.js'
import { ModelOrderPortComparator } from './preserveorder/model-order-port-comparator.js'

export function sortByInputModelProcess(graph: LGraph): void {
  let layerIndex = 0
  for (const layer of graph.getLayers()) {
    layer.id = layerIndex
    const previousLayerIndex = layerIndex === 0 ? 0 : layerIndex - 1
    const previousLayer = graph.getLayers()[previousLayerIndex]!.getNodes()

    let comparator = new ModelOrderNodeComparator(graph, previousLayer,
      graph.getProperty(CONSIDER_MODEL_ORDER_STRATEGY),
      graph.getProperty(CONSIDER_MODEL_ORDER_LONG_EDGE_STRATEGY),
      graph.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY), true)
    insertionSort(layer.getNodes(), comparator)

    for (const node of layer.getNodes()) {
      const pc = node.getProperty(PORT_CONSTRAINTS)
      if (pc !== PortConstraints.FIXED_ORDER && pc !== PortConstraints.FIXED_POS) {
        const portComparator = new ModelOrderPortComparator(graph, previousLayer,
          graph.getProperty(CONSIDER_MODEL_ORDER_STRATEGY),
          longEdgeTargetNodePreprocessing(node),
          graph.getProperty(CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER))
        node.getPorts().sort((a, b) => portComparator.compare(a, b))
      }
    }

    comparator = new ModelOrderNodeComparator(graph, previousLayer,
      graph.getProperty(CONSIDER_MODEL_ORDER_STRATEGY),
      graph.getProperty(CONSIDER_MODEL_ORDER_LONG_EDGE_STRATEGY),
      graph.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY), false)
    insertionSort(layer.getNodes(), comparator)

    layerIndex++
  }
}

/** 计算端口的长边目标节点, 保存到节点并返回所有长边目标的 model order map. */
export function longEdgeTargetNodePreprocessing(node: LNode): Map<LNode, number> {
  const targetNodeModelOrder = new Map<LNode, number>()
  if (node.hasProperty(TARGET_NODE_MODEL_ORDER)) {
    return node.getProperty(TARGET_NODE_MODEL_ORDER) as Map<LNode, number>
  }
  for (const p of node.getPorts()) {
    if (p.getOutgoingEdges().length === 0) continue
    const targetNode = getTargetNode(p)
    p.setProperty(LONG_EDGE_TARGET_NODE, targetNode)
    if (targetNode !== null) {
      let previousOrder = Number.MAX_SAFE_INTEGER
      if (targetNodeModelOrder.has(targetNode)) previousOrder = targetNodeModelOrder.get(targetNode)!
      const edge = p.getOutgoingEdges()[0]!
      if (!edge.getProperty<boolean>(REVERSED)) {
        targetNodeModelOrder.set(targetNode, Math.min(edge.getProperty(MODEL_ORDER), previousOrder))
      }
    }
  }
  node.setProperty(TARGET_NODE_MODEL_ORDER, targetNodeModelOrder)
  return targetNodeModelOrder
}

export function getTargetNode(port: LPort): LNode | null {
  let node: LNode | null = null
  const edge = port.getOutgoingEdges()[0]!
  let currentEdge: LEdge = edge
  for (;;) {
    node = currentEdge.getTarget()!.getNode()!
    if (node.hasProperty(LONG_EDGE_TARGET)) {
      return (node.getProperty(LONG_EDGE_TARGET) as { getNode(): LNode }).getNode()
    }
    if (node.getType() !== NodeType.NORMAL && node.getOutgoingEdges().length > 0) {
      currentEdge = node.getOutgoingEdges()[0]!
    } else if (node.getType() !== NodeType.NORMAL) {
      return null
    }
    if (node.getType() === NodeType.NORMAL) break
  }
  return node
}

export function insertionSort(layer: LNode[], comparator: ModelOrderNodeComparator): void {
  for (let i = 1; i < layer.length; i++) {
    const temp = layer[i]!
    let j = i
    while (j > 0 && comparator.compare(layer[j - 1]!, temp) > 0) {
      layer[j] = layer[j - 1]!
      j--
    }
    layer[j] = temp
  }
  comparator.clearTransitiveOrdering()
}
