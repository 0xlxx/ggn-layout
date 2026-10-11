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
 * P1 垂直放置 (ELK alg.vertiflex p1yplacement.NodeYPlacer).
 *
 * 有 VERTICAL_CONSTRAINT 的节点按约束放置, 其余按树中位置自动:
 *   y(node) = max(父 minHeight, 自身约束); 子节点 minHeight =
 *   minHeight + layerDistance + 节点高 + max(margin.bottom, nodeNodeSpacing).
 */
import type { ElkNode } from '../../api/elk-json.js'
import { LAYER_DISTANCE, SPACING_NODE_NODE, VERTICAL_CONSTRAINT, optNum, optMargins, optNumOptional } from '../options.js'
import { outgoingEdges, targetOf } from '../vertiflex-util.js'

/** NodeYPlacer.process(graph). */
export function nodeYPlacer(graph: ElkNode, root: ElkNode): void {
  const layerDistance = optNum(graph, LAYER_DISTANCE, 50)
  const nodeNodeSpacing = optNum(graph, SPACING_NODE_NODE, 20)

  if ((graph.children ?? []).length > 0) {
    setYLevels(graph, root, 0.0, layerDistance, nodeNodeSpacing)
  }
}

/**
 * 递归设置节点绝对 y 坐标 (setYLevels).
 * @param node 节点及其子树更新 y 坐标.
 * @param minHeight 节点最小高度.
 */
function setYLevels(
  graph: ElkNode,
  node: ElkNode,
  minHeight: number,
  layerDistance: number,
  nodeNodeSpacing: number,
): void {
  const constraint = optNumOptional(node, VERTICAL_CONSTRAINT)
  if (constraint !== undefined) {
    minHeight = constraint
  }
  node.y = minHeight
  const newMinHeight = minHeight + layerDistance + (node.height ?? 0)
    + Math.max(optMargins(node).bottom, nodeNodeSpacing)
  for (const edge of outgoingEdges(graph, node)) {
    setYLevels(graph, targetOf(graph, edge), newMinHeight, layerDistance, nodeNodeSpacing)
  }
}
