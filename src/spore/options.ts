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
 * spore 布局选项 (ELK alg.spore 0.12.0, SPOrE.melk + SporeOverlapRemovalOptions/
 * SporeCompactionOptions 实证).
 *
 * 选项 id (jar SporeMetaDataProvider 反编译实证):
 *   sporeOverlap:   org.eclipse.elk.overlapRemoval.maxIterations / .runScanline,
 *                   org.eclipse.elk.structure.structureExtractionStrategy
 *   sporeCompaction: org.eclipse.elk.processingOrder.{treeConstruction,spanningTreeCostFunction,
 *                   preferredRoot,rootSelection}, org.eclipse.elk.compaction.{compactionStrategy,orthogonal},
 *                   org.eclipse.elk.structure.structureExtractionStrategy
 *   共用 core:      org.eclipse.elk.padding (默认 8), org.eclipse.elk.spacing.nodeNode (默认 8),
 *                   org.eclipse.elk.underlyingLayoutAlgorithm, org.eclipse.elk.debugMode
 */
import type { ElkNode } from '../api/elk-json.js'
import { CompactionStrategy, TreeConstructionStrategy } from './graph.js'
import { CORE, ALG } from '../options/specs.js'

// ── core 共用 ──
export const PADDING = CORE.padding.id
export const SPACING_NODE_NODE = CORE.spacingNodeNode.id
export const UNDERLYING_LAYOUT_ALGORITHM = CORE.underlyingLayoutAlgorithm.id
export const DEBUG_MODE = CORE.debugMode.id

// ── spore 共用选项 (idPrefix org.eclipse.elk, sporeOverlap/sporeCompaction 各自 supports) ──
export const STRUCTURE_EXTRACTION_STRATEGY = CORE.structureExtractionStrategy.id
export const PROCESSING_ORDER_TREE_CONSTRUCTION = ALG.spore.processingOrderTreeConstruction.id
export const PROCESSING_ORDER_SPANNING_TREE_COST_FUNCTION = ALG.spore.processingOrderSpanningTreeCostFunction.id
export const PROCESSING_ORDER_PREFERRED_ROOT = ALG.spore.processingOrderPreferredRoot.id
export const PROCESSING_ORDER_ROOT_SELECTION = ALG.spore.processingOrderRootSelection.id
export const COMPACTION_COMPACTION_STRATEGY = ALG.spore.compactionStrategy.id
export const COMPACTION_ORTHOGONAL = ALG.spore.compactionOrthogonal.id

// ── sporeOverlap 专有 ──
export const OVERLAP_REMOVAL_MAX_ITERATIONS = ALG.spore.overlapRemovalMaxIterations.id
export const OVERLAP_REMOVAL_RUN_SCANLINE = ALG.spore.overlapRemovalRunScanline.id

// ── 枚举 (melk) ──
export enum StructureExtractionStrategy {
  DELAUNAY_TRIANGULATION = 'DELAUNAY_TRIANGULATION',
}

export enum SpanningTreeCostFunction {
  CENTER_DISTANCE = 'CENTER_DISTANCE',
  CIRCLE_UNDERLAP = 'CIRCLE_UNDERLAP',
  RECTANGLE_UNDERLAP = 'RECTANGLE_UNDERLAP',
  INVERTED_OVERLAP = 'INVERTED_OVERLAP',
  MINIMUM_ROOT_DISTANCE = 'MINIMUM_ROOT_DISTANCE',
}

export enum RootSelection {
  FIXED = 'FIXED',
  CENTER_NODE = 'CENTER_NODE',
}

/** 默认值 (SporeCompactionOptions/SporeOverlapRemovalOptions + melk). */
export const DEFAULTS = {
  [PADDING]: 8, // spore melk supports org.eclipse.elk.padding = ElkPadding(8)
  [SPACING_NODE_NODE]: 8, // spore melk supports = 8
  [STRUCTURE_EXTRACTION_STRATEGY]: StructureExtractionStrategy.DELAUNAY_TRIANGULATION,
  [PROCESSING_ORDER_TREE_CONSTRUCTION]: TreeConstructionStrategy.MINIMUM_SPANNING_TREE,
  [PROCESSING_ORDER_SPANNING_TREE_COST_FUNCTION]: SpanningTreeCostFunction.CIRCLE_UNDERLAP,
  [PROCESSING_ORDER_ROOT_SELECTION]: RootSelection.CENTER_NODE,
  [COMPACTION_COMPACTION_STRATEGY]: CompactionStrategy.DEPTH_FIRST,
  [COMPACTION_ORTHOGONAL]: false,
  [OVERLAP_REMOVAL_MAX_ITERATIONS]: 64,
  [OVERLAP_REMOVAL_RUN_SCANLINE]: true,
} as const

/** 读取选项 (layoutOptions/properties 全键; 支持 org.eclipse.elk.* → elk.* 短键). */
export function jsonOpt<T>(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): T | undefined {
  const v = node.layoutOptions?.[key] ?? node.properties?.[key] ?? node.layoutOptions?.[key.replace(/^org\.eclipse\.elk\./, 'elk.')]
  return v as T | undefined
}

/** 数值选项: 显式设置 > 默认值. */
export function optNum(node: ElkNode, key: string): number {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return DEFAULTS[key as keyof typeof DEFAULTS] as number
  const n = Number(v)
  return Number.isFinite(n) ? n : (DEFAULTS[key as keyof typeof DEFAULTS] as number)
}

/** 字符串/枚举选项: 显式设置 > 默认值. */
export function optStr<T extends string>(node: ElkNode, key: string, def: T): T {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return def
  return String(v) as T
}

/** 布尔选项: 显式设置 > 默认值. */
export function optBool(node: ElkNode, key: string): boolean {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return DEFAULTS[key as keyof typeof DEFAULTS] as boolean
  return String(v) === 'true'
}

export interface ElkPadding {
  top: number
  left: number
  right: number
  bottom: number
}

/** 解析 padding (对象 / 字符串 "[top=..,left=..]" / 数字 / 缺省 → 8, ELK ElkPadding). */
export function optPadding(node: ElkNode): ElkPadding {
  const v = jsonOpt<unknown>(node, PADDING)
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const num = (k: string): number => (typeof o[k] === 'number' ? o[k] as number : DEFAULTS[PADDING])
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  if (typeof v === 'string') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    const num = (k: string): number => m[k] ?? DEFAULTS[PADDING]
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  return { top: DEFAULTS[PADDING], left: DEFAULTS[PADDING], right: DEFAULTS[PADDING], bottom: DEFAULTS[PADDING] }
}
