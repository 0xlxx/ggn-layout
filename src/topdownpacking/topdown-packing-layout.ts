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
 * topdownpacking 主入口 (ELK alg.topdownpacking TopdownpackingLayoutProvider).
 *
 * 管线 (AlgorithmAssembler):
 *   P1 节点放置 (LEFT_RIGHT_TOP_DOWN_NODE_PLACER): 统一尺寸 (父预知), 网格放置,
 *       父尺寸 = max(当前, 预测尺寸);
 *   P2 空白消除 (BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR): 底部行水平扩张填空白 +
 *       纵向扩张填空白.
 *
 * 直接操作 ElkNode JSON 子节点位置/尺寸 (不动边路由, 同 rectpacking/box 移植约定);
 * Grid 为算法内部二维结构 (Java GridElkNode wrapper 的 grid 部分).
 */
import type { ElkNode } from '../api/elk-json.js'
import { Grid } from './grid.js'
import {
  NODE_ARRANGEMENT_STRATEGY, WHITESPACE_ELIMINATION_STRATEGY,
  NodeArrangementStrategy, WhitespaceEliminationStrategy, optStr,
} from './options.js'
import { leftRightTopDownNodePlacer } from './p1-node-arrangement.js'
import { bottomRowEqualWhitespaceEliminator } from './p2-whitespace-elimination.js'

/**
 * topdownpacking 布局 (org.eclipse.elk.topdownpacking).
 * 直接操作 ElkNode JSON 子节点位置/尺寸, 并设置父节点尺寸 (对齐 rectpacking/box 风格).
 */
export function topdownPackingLayout(elkGraph: ElkNode): ElkNode {
  const grid = new Grid<ElkNode>()

  // P1 策略 (AlgorithmAssembler.setPhase(P1, nodeArrangementStrategy)).
  const nodeArrangement = optStr(elkGraph, NODE_ARRANGEMENT_STRATEGY, NodeArrangementStrategy.LEFT_RIGHT_TOP_DOWN_NODE_PLACER)
  if (nodeArrangement !== NodeArrangementStrategy.LEFT_RIGHT_TOP_DOWN_NODE_PLACER) {
    throw new Error(`[topdownpacking] No implementation is available for the node placer ${nodeArrangement}`)
  }

  // P2 策略 (AlgorithmAssembler.setPhase(P2, whitespaceEliminationStrategy)).
  const whitespaceElimination = optStr(elkGraph, WHITESPACE_ELIMINATION_STRATEGY, WhitespaceEliminationStrategy.BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR)
  if (whitespaceElimination !== WhitespaceEliminationStrategy.BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR) {
    throw new Error(`[topdownpacking] No implementation is available for the whitespace eliminator${whitespaceElimination}`)
  }

  leftRightTopDownNodePlacer(elkGraph, grid)
  bottomRowEqualWhitespaceEliminator(elkGraph, grid)

  return elkGraph
}
