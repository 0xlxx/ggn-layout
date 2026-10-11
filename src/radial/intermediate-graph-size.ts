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
 * intermediate-graph-size — ELK alg.radial.intermediate.CalculateGraphSize.
 *
 * 计算图尺寸并把节点平移到正坐标; 可选 CENTER_ON_ROOT: 使根成为布局中心
 * (额外空白). 容器尺寸写回 graph.width/height (除非 fixedGraphSize),
 * CHILD_AREA 属性只存内存 (Java 内部属性不导出).
 */
import type { ElkNode } from '../api/elk-json.js'
import {
  CENTER_ON_ROOT, NODE_SIZE_FIXED_GRAPH_SIZE, CHILD_AREA_WIDTH, CHILD_AREA_HEIGHT,
  optBool, optMargins, optPadding, setGraphProperty, getGraphProperty,
} from './options.js'
import { INTERNAL_ROOT_NODE } from './radial-layout.js'

/** 计算图尺寸并平移 (Java CalculateGraphSize.process). */
export function calculateGraphSize(graph: ElkNode): void {
  // calculate the offset from border spacing and node distribution
  let minXPos = Number.MAX_VALUE
  let minYPos = Number.MAX_VALUE
  let maxXPos = Number.MIN_VALUE
  let maxYPos = Number.MIN_VALUE

  for (const node of graph.children ?? []) {
    const posX = node.x ?? 0
    const posY = node.y ?? 0
    const width = node.width ?? 0
    const height = node.height ?? 0
    const margins = optMargins(node)

    minXPos = Math.min(minXPos, posX - margins.left)
    minYPos = Math.min(minYPos, posY - margins.top)
    maxXPos = Math.max(maxXPos, posX + width + margins.right)
    maxYPos = Math.max(maxYPos, posY + height + margins.bottom)
  }

  const padding = optPadding(graph)
  const offset = { x: minXPos - padding.left, y: minYPos - padding.top }

  let width = maxXPos - minXPos + padding.left + padding.right
  let height = maxYPos - minYPos + padding.top + padding.bottom

  if (optBool(graph, CENTER_ON_ROOT)) {
    const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)
    const rootMargins = optMargins(root)
    // calculate the current midpoint of the root, taking into account the defined margins and the already
    // calculated offset necessary to shift the graph into the positive quadrant of the coordinate system
    const rootX = (root.x ?? 0) + (root.width ?? 0) / 2 + (rootMargins.left + rootMargins.right) / 2 - offset.x
    const rootY = (root.y ?? 0) + (root.height ?? 0) / 2 + (rootMargins.top + rootMargins.bottom) / 2 - offset.y

    const dx = width - rootX
    const dy = height - rootY

    if (dx < width / 2) {
      // need to add additional space on the left
      const additionalX = dx - rootX
      width += additionalX
      offset.x -= additionalX
    } else {
      // add additional space on the right
      const additionalX = rootX - dx
      width += additionalX
    }

    if (dy < height / 2) {
      // need to add additional space on the top
      const additionalY = dy - rootY
      height += additionalY
      offset.y -= additionalY
    } else {
      // add additional space on the bottom
      const additionalY = rootY - dy
      height += additionalY
    }
  }

  // process the nodes
  for (const node of graph.children ?? []) {
    // set the node position
    node.x = (node.x ?? 0) - offset.x
    node.y = (node.y ?? 0) - offset.y
  }

  // set up the graph
  if (!optBool(graph, NODE_SIZE_FIXED_GRAPH_SIZE)) {
    graph.width = width
    graph.height = height
  }

  // store child area info
  setGraphProperty(graph, CHILD_AREA_WIDTH, width - padding.left - padding.right)
  setGraphProperty(graph, CHILD_AREA_HEIGHT, height - padding.top - padding.bottom)
}
