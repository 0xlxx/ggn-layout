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
 * InteractiveNodePlacer (对应 ELK p4nodes.InteractiveNodePlacer).
 *
 * nodePlacement.strategy = INTERACTIVE: 保留节点输入 y 坐标 (普通节点), dummy 用
 * InteractiveCrossingMinimizer 计算的 ORIGINAL_DUMMY_NODE_POSITION, 无则按间距下推.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { Layer } from '../graph/layer.js'
import { NodeType } from '../graph/enums.js'
import { SPACINGS, ORIGINAL_DUMMY_NODE_POSITION } from '../options/internal-properties.js'
import type { Spacings } from './spacings.js'

export function processInteractiveNodePlace(layeredGraph: LGraph): void {
    const spacings = layeredGraph.getProperty(SPACINGS)
    for (const layer of layeredGraph.getLayers()) {
      placeNodes(layer, spacings)
    }
  }

function placeNodes(layer: Layer, spacings: Spacings): void {
    let minValidY = Number.NEGATIVE_INFINITY
    let prevNodeType = NodeType.NORMAL

    for (const node of layer.getNodes()) {
      const nodeType = node.getType()
      if (nodeType !== NodeType.NORMAL) {
        const originalYCoordinate = node.getProperty(ORIGINAL_DUMMY_NODE_POSITION)
        if (originalYCoordinate === null || originalYCoordinate === undefined) {
          minValidY = Math.max(minValidY, 0.0)
          node.getPosition().y = minValidY + spacings.getVerticalSpacingByType(nodeType, prevNodeType)
        } else {
          node.getPosition().y = originalYCoordinate
        }
      }

      const spacing = spacings.getVerticalSpacingByType(nodeType, prevNodeType)
      if (node.getPosition().y < minValidY + spacing + node.getMargin().top) {
        node.getPosition().y = minValidY + spacing + node.getMargin().top
      }

      minValidY = node.getPosition().y + node.getSize().y + node.getMargin().bottom
      prevNodeType = nodeType
    }
  }
