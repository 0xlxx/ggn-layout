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
 * vertiflex 工具 (ELK alg.vertiflex VertiFlexUtil).
 *
 * TS 图模型 = ElkNode JSON: 树节点 (算法所在节点) 的 children + edges 构成
 * Java 侧的 ElkNode graph; 边挂在 graph.edges, sources/targets 为节点 id 字符串.
 * getOutgoingEdges/getIncomingEdges 语义 = Java ElkNode.getOutgoingEdges()
 * (父图边集中 source/target == 本节点的边).
 */
import type { ElkEdge, ElkNode } from '../api/elk-json.js'

/** 节点在图中的出边 (Java ElkGraphUtil.allOutgoingEdges: 图边集中 source == node). */
export function outgoingEdges(graph: ElkNode, node: ElkNode): ElkEdge[] {
  return (graph.edges ?? []).filter((e) => (e.sources ?? [])[0] === node.id)
}

/** 节点在图中的入边 (Java ElkGraphUtil.allIncomingEdges: 图边集中 target == node). */
export function incomingEdges(graph: ElkNode, node: ElkNode): ElkEdge[] {
  return (graph.edges ?? []).filter((e) => (e.targets ?? [])[0] === node.id)
}

/** 解析边 target 端点 → 图内子节点 (Java ElkGraphUtil.connectableShapeToNode).
 * 2026-08-15：跨层级边（端点不在当前层级直接子节点）→ 明确错误而非 `!` 崩溃——
 * vertiflex 为树算法，边须连接父 → 直接子；Java 侧由 core INCLUDE_CHILDREN 提平跨层边，
 * ggn provider 直接操作 JSON 无提平，故此处显式声明边界。 */
export function targetOf(graph: ElkNode, edge: ElkEdge): ElkNode {
  const id = (edge.targets ?? [])[0]
  const node = (graph.children ?? []).find((c) => c.id === id)
  if (node === undefined) {
    throw new Error(
      `[vertiflex] 跨层级边不支持：target "${id}" 不在当前层级的直接子节点中` +
        `（vertiflex 为树算法，边须连接父→直接子；跨层级边请改挂到 group 容器端点）`,
    )
  }
  return node
}

/** 解析边 source 端点 → 图内子节点. */
export function sourceOf(graph: ElkNode, edge: ElkEdge): ElkNode {
  const id = (edge.sources ?? [])[0]
  const node = (graph.children ?? []).find((c) => c.id === id)
  if (node === undefined) {
    throw new Error(
      `[vertiflex] 跨层级边不支持：source "${id}" 不在当前层级的直接子节点中` +
        `（vertiflex 为树算法，边须连接父→直接子；跨层级边请改挂到 group 容器端点）`,
    )
  }
  return node
}

/**
 * 计算图的根节点 (Java VertiFlexUtil.findRoot): 第一个无入边的子节点; 无 → null.
 */
export function findRoot(graph: ElkNode): ElkNode | null {
  for (const child of graph.children ?? []) {
    if (incomingEdges(graph, child).length === 0) return child
  }
  return null
}

/** ElkGraphUtil.firstEdgeSection(e, true, true): 无 section 则新建. */
export function firstEdgeSection(e: ElkEdge): NonNullable<ElkEdge['sections']>[number] {
  e.sections ??= []
  if (e.sections.length === 0) e.sections.push({ startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } })
  return e.sections[0]!
}

/** ElkGraphUtil.createBendPoint(section, x, y). */
export function createBendPoint(
  section: NonNullable<ElkEdge['sections']>[number],
  x: number,
  y: number,
): void {
  section.bendPoints ??= []
  section.bendPoints.push({ x, y })
}

/** 节点 x 坐标 (缺省 0). */
export function nodeX(node: ElkNode): number {
  return node.x ?? 0
}

/** 节点 y 坐标 (缺省 0). */
export function nodeY(node: ElkNode): number {
  return node.y ?? 0
}
