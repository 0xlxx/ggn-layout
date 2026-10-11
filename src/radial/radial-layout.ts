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
 * radial 布局主入口 — ELK alg.radial RadialLayoutProvider 0.12.0.
 *
 * 管线 (AlgorithmAssembler):
 *   P1 节点放置 (EadesRadial): 树 → 以根为中心的同心圆布局, 同层节点同半径;
 *   可选平移优化 (0-359 度) 按优化准则 (默认 NONE) 选最优偏移.
 *   中间处理器 (P1 后, P2 前):
 *     OVERLAP_REMOVAL (总是): 逐半径外扩消除重叠;
 *     COMPACTION (compactor != NONE): 逐半径/逐楔形压缩;
 *     ROTATION (rotate): 整体旋转到目标角度;
 *     GRAPH_SIZE_CALCULATION (总是): 计算容器尺寸 + 平移到正坐标.
 *   P2 边路由 (StraightLineEdgeRouter): 中心到中心直线 + 裁剪.
 *   OUTGOING_EDGE_ANGLES (rotation.outgoingEdgeAngles): 出边角度写回目标节点.
 *
 * NodeMicroLayout (omitNodeMicroLayout=false 时 Java 执行) 对无标签/端口/尺寸约束的
 * 节点无副作用 (尺寸不变, margin 0; spore 移植同实证), 故省略.
 * 输出直接写回 ElkNode JSON (子节点位置 + 容器尺寸 + 边 sections).
 */
import type { ElkNode } from '../api/elk-json.js'
import { nodeMicroLayout } from '../common/node-micro-layout.js'
import {
  RADIUS, COMPACTOR, ROTATE, ROTATION_OUTGOING_EDGE_ANGLES, OMIT_NODE_MICRO_LAYOUT,
  optNum, optBool, optStr, jsonOpt, setGraphProperty, CompactionStrategy,
} from './options.js'
import { findRoot, findLargestNodeInGraph } from './radial-util.js'
import { eadesRadial } from './p1-eades-radial.js'
import { overlapRemoval } from './overlaps.js'
import { generalCompactor } from './compaction.js'
import { generalRotator } from './rotation.js'
import { calculateGraphSize } from './intermediate-graph-size.js'
import { straightLineEdgeRouter } from './p2-straight-line-edge-router.js'
import { edgeAngleCalculator } from './intermediate-edge-angle.js'

/** 内部属性: 树的根节点 (Java InternalProperties.ROOT_NODE; 内存保存, 不导出 JSON). */
export const INTERNAL_ROOT_NODE = 'org.eclipse.elk.radial.internal.root'

/**
 * radial 布局 (org.eclipse.elk.radial).
 * 直接操作 ElkNode JSON 子节点位置/尺寸 + 容器尺寸 + 边 sections (直线路由).
 * 输入必须是树 (无入边的唯一根), 否则抛错 (Java IllegalArgumentException 同).
 */
export function radialLayout(elkGraph: ElkNode): ElkNode {
  // 2026-08-15 (对齐 Java RadialLayoutProvider): 布局前执行 NodeMicroLayout —
  // 节点尺寸含 NODE_LABELS 约束 (黑盒 + label 容器容纳)、端口/标签微布局;
  // OMIT_NODE_MICRO_LAYOUT=true 时省略 (Java gate, 对抗审阅 P1 补).
  if (!(jsonOpt<boolean>(elkGraph, OMIT_NODE_MICRO_LAYOUT) ?? false)) {
    nodeMicroLayout(elkGraph)
  }
  // pre calculate the root node and save it (Java: findRoot + InternalProperties.ROOT_NODE)
  const root = findRoot(elkGraph)
  if (root === null) {
    throw new Error('The given graph is not a tree!')
  }
  setGraphProperty(elkGraph, INTERNAL_ROOT_NODE, root)

  // Calculate the radius or take the one given by the user (Java: setProperty 覆盖).
  let layoutRadius = optNum(elkGraph, RADIUS)
  if (layoutRadius === 0) {
    layoutRadius = findLargestNodeInGraph(elkGraph)
  }
  setGraphProperty(elkGraph, RADIUS, layoutRadius)

  // P1 + 中间处理器 + P2 (RadialLayoutProvider.assembleAlgorithm 顺序)
  eadesRadial(elkGraph)
  overlapRemoval(elkGraph)
  if (optStr(elkGraph, COMPACTOR, CompactionStrategy.NONE) !== CompactionStrategy.NONE) {
    generalCompactor(elkGraph)
  }
  if (optBool(elkGraph, ROTATE)) {
    generalRotator(elkGraph)
  }
  calculateGraphSize(elkGraph)
  straightLineEdgeRouter(elkGraph)
  if (optBool(elkGraph, ROTATION_OUTGOING_EDGE_ANGLES)) {
    edgeAngleCalculator(elkGraph)
  }

  return elkGraph
}
