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
 * vertiflex 主入口 (ELK alg.vertiflex VertiFlexLayoutProvider 0.12.0).
 *
 * 管线 (AlgorithmAssembler):
 *   P1 节点垂直放置 (SIMPLE_Y_PLACING): 垂直约束优先, 否则按树深递推
 *       (layerDistance + 节点高 + max(margin.bottom, nodeNodeSpacing));
 *   P2 节点相对水平放置 (SIMPLE_X_PLACING): outline 压实, 策略分 STRAIGHT
 *       (半圆排列, 直线边) 与 BEND (模型序保持 + 弯点高度);
 *   P3 绝对坐标 (ABSOLUTE_XPLACING): 根左移到最左子树 x=0, 子树偏移累加;
 *   P4 边路由 (DIRECT_ROUTING/BEND_ROUTING): 直线 或 带弯点 (EDGE_BEND_HEIGHT).
 *
 * 输入校验 (Java 同): 图必须是无环树 (根唯一, 每子节点入边 ≤ 1, 垂直约束
 * 沿祖先链单调). 输出: 子节点位置 + 图 (容器) 尺寸 = 内容 + padding.
 * NodeMicroLayout (omitNodeMicroLayout=false 时) 处理标签/端口: 节点 margin
 * (标签/端口溢出)、端口位置、节点尺寸 (nodeSize.constraints) — 见 node-micro-layout.ts.
 */
import type { ElkNode } from '../api/elk-json.js'
import { InternalProperties } from './internal-properties.js'
import {
  LAYOUT_STRATEGY, OMIT_NODE_MICRO_LAYOUT, SPACING_NODE_NODE,
  VERTICAL_CONSTRAINT, EdgeRoutingStrategy, optBool, optMargins, optNum,
  optNumOptional, optPadding, optStr,
} from './options.js'
import { nodeMicroLayout } from '../common/node-micro-layout.js'
import { nodeYPlacer } from './p1yplacement/node-y-placer.js'
import { relativeXPlacer } from './p2relative/relative-x-placer.js'
import { absoluteXPlacer } from './p3absolute/absolute-x-placer.js'
import { bendEdgeRouter } from './p4edgerouting/bend-edge-router.js'
import { straightEdgeRouter } from './p4edgerouting/straight-edge-router.js'
import { findRoot, incomingEdges, outgoingEdges, targetOf } from './vertiflex-util.js'

/**
 * vertiflex 布局 (org.eclipse.elk.vertiflex).
 * 直接操作 ElkNode JSON 子节点位置 + 容器尺寸 + 内部边 sections.
 */
export function vertiFlexLayout(elkGraph: ElkNode): ElkNode {
  const props = new InternalProperties()
  const nodeNodeSpacing = optNum(elkGraph, SPACING_NODE_NODE, 20)

  // 若请求计算节点尺寸/标签/端口等 (NodeMicroLayout.forGraph(elkGraph).execute()).
  if (!optBool(elkGraph, OMIT_NODE_MICRO_LAYOUT, false)) {
    nodeMicroLayout(elkGraph)
  }

  // 预计算根节点并保存
  const root = findRoot(elkGraph)
  if (root === null) {
    throw new Error('[vertiflex] The given graph is not a tree!')
  }

  for (const child of elkGraph.children ?? []) {
    const numberOfParents = incomingEdges(elkGraph, child).length
    if (numberOfParents > 1) {
      throw new Error('[vertiflex] The given graph is not an acyclic tree!')
    }

    // reset position
    child.x = 0
    child.y = 0
  }

  // 检查垂直约束按有效顺序排列, 即子节点的垂直约束始终高于父节点
  checkVerticalConstraintValidity(elkGraph, root, 0, nodeNodeSpacing)

  // 存储模型序
  let count = 0
  for (const node of elkGraph.children ?? []) {
    props.setNodeModelOrder(node, count)
    count += 1
  }

  // P1 垂直放置
  nodeYPlacer(elkGraph, root)
  // P2 相对水平放置 (策略分派, Java AlgorithmAssembler)
  relativeXPlacer(elkGraph, root, props)
  // P3 绝对坐标
  absoluteXPlacer(elkGraph, root)
  // P4 边路由 (策略分派)
  const strategy = optStr<EdgeRoutingStrategy>(elkGraph, LAYOUT_STRATEGY, EdgeRoutingStrategy.STRAIGHT)
  switch (strategy) {
    case EdgeRoutingStrategy.STRAIGHT:
      straightEdgeRouter(elkGraph, root)
      break
    case EdgeRoutingStrategy.BEND:
      bendEdgeRouter(elkGraph, root, props)
      break
    default:
      break
  }

  setGraphSize(elkGraph)
  return elkGraph
}

/**
 * 检查垂直约束是否大于任何祖先节点设定的约束
 * (Java checkVerticalConstraintValidity).
 */
function checkVerticalConstraintValidity(
  graph: ElkNode,
  root: ElkNode,
  currentMinConstraint: number,
  nodeNodeSpacing: number,
): void {
  let rootHeight: number
  const constraint = optNumOptional(root, VERTICAL_CONSTRAINT)
  if (constraint !== undefined) {
    rootHeight = constraint
  } else {
    rootHeight = currentMinConstraint
  }

  const newMinConstraint = rootHeight + (root.height ?? 0)
    + Math.max(optMargins(root).bottom, nodeNodeSpacing)

  for (const edge of outgoingEdges(graph, root)) {
    const child = targetOf(graph, edge)
    const childConstraint = optNumOptional(child, VERTICAL_CONSTRAINT)
    if (childConstraint !== undefined) {
      if (newMinConstraint > childConstraint + optMargins(child).top) {
        throw new Error(`[vertiflex] Invalid vertical constraints. Node ${child.id} has a vertical constraint that is too low for its ancestors.`)
      }
    }
  }
  for (const edge of outgoingEdges(graph, root)) {
    const child = targetOf(graph, edge)
    checkVerticalConstraintValidity(graph, child, newMinConstraint, nodeNodeSpacing)
  }
}

/** 计算布局占用空间并设置图尺寸 (Java setGraphSize). */
function setGraphSize(graph: ElkNode): void {
  const padding = optPadding(graph)

  let maxX = 0.0
  let maxY = 0.0
  for (const node of graph.children ?? []) {
    const margin = optMargins(node)

    if (maxX < (node.x ?? 0) + (node.width ?? 0) + margin.right) {
      maxX = (node.x ?? 0) + (node.width ?? 0) + margin.right
    }
    if (maxY < (node.y ?? 0) + (node.height ?? 0) + margin.bottom) {
      maxY = (node.y ?? 0) + (node.height ?? 0) + margin.bottom
    }
  }

  graph.width = maxX + padding.right
  graph.height = maxY + padding.bottom
}
