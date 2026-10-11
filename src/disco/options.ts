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
 * disco 布局选项 — ELK alg.disco 0.12.0 (Disco.melk + Polyomino.melk + core).
 *
 * 默认值来源 (jar 实证):
 *   - org.eclipse.elk.spacing.componentComponent = 20 (core)
 *   - org.eclipse.elk.edge.thickness = 1 (core)
 *   - org.eclipse.elk.padding = ElkPadding(12) (core)
 *   - org.eclipse.elk.aspectRatio: 无默认 → null → 1.0
 *   - org.eclipse.elk.disco.componentCompaction.strategy = POLYOMINO
 *   - org.eclipse.elk.disco.componentCompaction.componentLayoutAlgorithm: 无默认
 *   - org.eclipse.elk.alg.common.compaction.polyomino.fill = true (注意: melk 默认 true!)
 *   - org.eclipse.elk.alg.common.compaction.polyomino.lowLevelSort = BY_SIZE_AND_SHAPE
 *   - org.eclipse.elk.alg.common.compaction.polyomino.highLevelSort
 *       = NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST
 *   - org.eclipse.elk.alg.common.compaction.polyomino.traversalStrategy = QUADRANTS_LINE_BY_LINE
 *       (注意: 代码 switch default 是 QUADRANTS_JITTER, 但 melk 默认值是 QUADRANTS_LINE_BY_LINE!)
 */
import type { ElkNode } from '../api/elk-json.js'
import { ElkPadding } from './geometry.js'
import { CORE, ALG } from '../options/specs.js'

// ── core 选项 ──
export const SPACING_COMPONENT_COMPONENT = CORE.spacingComponentComponent.id
export const EDGE_THICKNESS = CORE.edgeThickness.id
export const PADDING = CORE.padding.id
export const ASPECT_RATIO = CORE.aspectRatio.id

// ── disco 专有 (org.eclipse.elk.disco.*) ──
export const COMPONENT_COMPACTION_STRATEGY = ALG.disco.componentCompactionStrategy.id
export const COMPONENT_LAYOUT_ALGORITHM = ALG.disco.componentLayoutAlgorithm.id
export const DEBUG_DISCO_GRAPH = ALG.disco.debugDiscoGraph.id
export const DEBUG_DISCO_POLYS = ALG.disco.debugDiscoPolys.id

// ── polyomino 公共选项 (org.eclipse.elk.alg.common.compaction.polyomino.*) ──
export const POLYOMINO_FILL = ALG.disco.polyominoFill.id
export const POLYOMINO_LOW_LEVEL_SORT = ALG.disco.polyominoLowLevelSort.id
export const POLYOMINO_HIGH_LEVEL_SORT = ALG.disco.polyominoHighLevelSort.id
export const POLYOMINO_TRAVERSAL_STRATEGY = ALG.disco.polyominoTraversalStrategy.id

// ── 枚举 (jar class 实证) ──
export enum CompactionStrategy {
  POLYOMINO = 'POLYOMINO',
}

export enum LowLevelSortingCriterion {
  BY_SIZE = 'BY_SIZE',
  BY_SIZE_AND_SHAPE = 'BY_SIZE_AND_SHAPE',
}

export enum HighLevelSortingCriterion {
  CORNER_CASES_THAN_SINGLE_SIDE_LAST = 'CORNER_CASES_THAN_SINGLE_SIDE_LAST',
  NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST = 'NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST',
}

export enum TraversalStrategy {
  SPIRAL = 'SPIRAL',
  LINE_BY_LINE = 'LINE_BY_LINE',
  MANHATTAN = 'MANHATTAN',
  JITTER = 'JITTER',
  QUADRANTS_MANHATTAN = 'QUADRANTS_MANHATTAN',
  QUADRANTS_LINE_BY_LINE = 'QUADRANTS_LINE_BY_LINE',
  COMBINE_LINE_BY_LINE_MANHATTAN = 'COMBINE_LINE_BY_LINE_MANHATTAN',
  COMBINE_JITTER_MANHATTAN = 'COMBINE_JITTER_MANHATTAN',
  QUADRANTS_JITTER = 'QUADRANTS_JITTER',
}

/** 选项默认值 (jar 实证, 见文件头注释). */
export const DEFAULTS = {
  [SPACING_COMPONENT_COMPONENT]: 20, // core spacing.componentComponent
  [EDGE_THICKNESS]: 1, // core edge.thickness
  [PADDING]: 12, // core padding = ElkPadding(12)
  [COMPONENT_COMPACTION_STRATEGY]: CompactionStrategy.POLYOMINO,
  [POLYOMINO_FILL]: true, // melk 默认 true!
  [POLYOMINO_LOW_LEVEL_SORT]: LowLevelSortingCriterion.BY_SIZE_AND_SHAPE,
  [POLYOMINO_HIGH_LEVEL_SORT]: HighLevelSortingCriterion.NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST,
  [POLYOMINO_TRAVERSAL_STRATEGY]: TraversalStrategy.QUADRANTS_LINE_BY_LINE, // melk 默认 (非代码 default!)
} as const

/** 读取选项 (layoutOptions/properties 全键; 支持 org.eclipse.elk.* → elk.* 短键). */
export function jsonOpt(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): unknown {
  const v = node.layoutOptions?.[key] ?? node.properties?.[key] ?? node.layoutOptions?.[key.replace(/^org\.eclipse\.elk\./, 'elk.')]
  return v
}

/** 数值选项: 显式设置 > 默认值. */
export function optNum(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): number {
  const v = jsonOpt(node, key)
  if (v === undefined || v === null || v === '') return DEFAULTS[key as keyof typeof DEFAULTS] as number
  const n = Number(v)
  return Number.isFinite(n) ? n : (DEFAULTS[key as keyof typeof DEFAULTS] as number)
}

/** 布尔选项: 显式设置 > 默认值. */
export function optBool(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): boolean {
  const v = jsonOpt(node, key)
  if (v === undefined || v === null || v === '') return DEFAULTS[key as keyof typeof DEFAULTS] as boolean
  return String(v).toLowerCase() === 'true'
}

/** 字符串/枚举选项: 显式设置 > 默认值. */
export function optStr<T extends string>(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string, def: T): T {
  const v = jsonOpt(node, key)
  if (v === undefined || v === null || v === '') return def
  return String(v) as T
}

/** 可选选项 (无默认): 显式设置 → 值; 否则 undefined. */
export function optOptStr(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): string | undefined {
  const v = jsonOpt(node, key)
  if (v === undefined || v === null || v === '') return undefined
  return String(v)
}

/** 解析 padding (对象 / 字符串 "[top=..,left=..]" / 数字 / 缺省 → 12, ELK ElkPadding). */
export function optPadding(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }): ElkPadding {
  const v = jsonOpt(node, PADDING)
  if (typeof v === 'number') return new ElkPadding(v, v, v, v)
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const num = (k: string): number => (typeof o[k] === 'number' ? o[k] as number : DEFAULTS[PADDING])
    return new ElkPadding(num('top'), num('left'), num('right'), num('bottom'))
  }
  if (typeof v === 'string') {
    const m = v.match(/top=([\d.]+),\s*left=([\d.]+),\s*right=([\d.]+),\s*bottom=([\d.]+)/)
    if (m) return new ElkPadding(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]))
  }
  return new ElkPadding(DEFAULTS[PADDING], DEFAULTS[PADDING], DEFAULTS[PADDING], DEFAULTS[PADDING])
}

/** 从 ElkNode 读取 aspectRatio (无默认, null → undefined). */
export function optAspectRatio(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }): number | undefined {
  const v = jsonOpt(node, ASPECT_RATIO)
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** 便捷: 节点尺寸/位置辅助. */
export function nodeX(node: ElkNode): number {
  return Number(node.x ?? 0)
}

export function nodeY(node: ElkNode): number {
  return Number(node.y ?? 0)
}

export function nodeWidth(node: ElkNode): number {
  return Number(node.width ?? 0)
}

export function nodeHeight(node: ElkNode): number {
  return Number(node.height ?? 0)
}
