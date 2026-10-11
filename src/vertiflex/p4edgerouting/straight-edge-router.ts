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
 * 直线边路由 (ELK alg.vertiflex p4edgerouting.StraightEdgeRouter).
 *
 * 边从父节点底部中点 → 目标节点顶部中点, 无弯点, 递归处理子树.
 */
import type { ElkNode } from '../../api/elk-json.js'
import { outgoingEdges, targetOf, firstEdgeSection, nodeX, nodeY } from '../vertiflex-util.js'

/** StraightEdgeRouter.process(graph). */
export function straightEdgeRouter(graph: ElkNode, root: ElkNode): void {
  if ((graph.children ?? []).length > 0) {
    routeEdges(graph, root)
  }
}

/** 递归以直线路由边. */
function routeEdges(graph: ElkNode, node: ElkNode): void {
  for (const edge of outgoingEdges(graph, node)) {
    const target = targetOf(graph, edge)
    const section = firstEdgeSection(edge)

    const startX = nodeX(node) + (node.width ?? 0) / 2
    const startY = nodeY(node) + (node.height ?? 0)
    const endX = nodeX(target) + (target.width ?? 0) / 2
    const endY = nodeY(target)

    section.startPoint = { x: startX, y: startY }
    section.endPoint = { x: endX, y: endY }
    routeEdges(graph, target)
  }
}
