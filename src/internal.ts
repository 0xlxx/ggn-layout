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
 * 内部移植模型入口，不对外承诺兼容。
 *
 * 这里保留算法移植所需的 LGraph/LNode 等模型、provider、枚举和内部 options。
 * 消费方与 AI agent 应优先从 `public.ts` 使用标准 JSON API；本入口的符号可能
 * 随移植实现演进而调整。
 */

// ── 属性系统 (org.eclipse.elk.graph.properties) ──
export { Property, MapPropertyHolder } from './graph/properties.js'
export type { IProperty, IPropertyHolder } from './graph/properties.js'

// ── 图模型 (org.eclipse.elk.alg.layered.graph) ──
export { LShape, LGraphElement } from './graph/lshape.js'
export { LGraph } from './graph/lgraph.js'
export type { LPadding } from './graph/lgraph.js'
export { LNode } from './graph/lnode.js'
export type { LLabel, LMargin } from './graph/lnode.js'
export { LPort } from './graph/lport.js'
export { LEdge } from './graph/ledge.js'
export { Layer } from './graph/layer.js'

// ── 枚举与基础类型 ──
export {
  NodeType,
  PortSide,
  PortType,
  Direction,
  PortConstraints,
  LayerConstraint,
  InLayerConstraint,
  EdgeConstraint,
  SIDES_NORTH,
  SIDES_EAST,
  SIDES_SOUTH,
  SIDES_WEST,
  SIDES_EAST_WEST,
  SIDES_NORTH_SOUTH,
  SIDES_NORTH_EAST,
  SIDES_EAST_SOUTH,
  SIDES_SOUTH_WEST,
  SIDES_NORTH_WEST,
  SIDES_NORTH_EAST_SOUTH,
  SIDES_EAST_SOUTH_WEST,
  SIDES_SOUTH_WEST_NORTH,
  SIDES_WEST_NORTH_EAST,
  SIDES_NORTH_EAST_SOUTH_WEST,
} from './graph/enums.js'
export type { KVector } from './graph/enums.js'

// ── mergeEdges 支持 (内部 LGraphUtil.createPort 合并分支) ──
export { createMergedPort, provideCollectorPort } from './graph/lgraph-util-merge.js'
export { getEdgeEndpoints } from './graph/lgraph-util.js'

// ── 布局入口 ──
export { LayeredLayoutProvider, doCompoundLayout, doSimpleLayout } from './layered-layout-provider.js'
export { ComponentsProcessor, computeComponentSize } from './components/components-processor.js'
export type { IElkProgressMonitor } from './layered-layout-provider.js'
export { NullProgressMonitor } from './layered-layout-provider.js'

// ── 低层组装原语 (JSON↔LGraph 闭环; 引擎级调用, 非公共消费入口) ──
export { buildGraph, extractGraph } from './api/index.js'
export type { BuiltGraph } from './api/index.js'

// ── options ──
export * from './options/internal-properties.js'
export { HIERARCHY_HANDLING } from './options/layered-options.js'
