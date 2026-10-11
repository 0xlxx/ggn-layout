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
 * topdownpacking 布局选项 (ELK alg.topdownpacking 0.12.0, Topdownpacking.melk).
 *
 * id 前缀 org.eclipse.elk.topdownpacking (bundle idPrefix) + core 选项.
 * 默认值: javap/ElkOptionsMain 实证 (TopdownpackingOptions 继承 core 默认, melk 无覆盖):
 *   - padding 默认 12 (core org.eclipse.elk.padding)
 *   - spacing.nodeNode 默认 20 (core)
 *   - topdown.hierarchicalNodeWidth 默认 150 / hierarchicalNodeAspectRatio 默认 1.414
 *   - nodeArrangement.strategy 默认 LEFT_RIGHT_TOP_DOWN_NODE_PLACER
 *   - whitespaceElimination.strategy 默认 BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR
 */
import type { ElkNode } from '../api/elk-json.js'
import { CORE, ALG } from '../options/specs.js'

// ── core 选项 (topdownpacking 复用) ──
export const PADDING = CORE.padding.id
export const SPACING_NODE_NODE = CORE.spacingNodeNode.id
export const TOPDOWN_HIERARCHICAL_NODE_WIDTH = ALG.topdownpacking.hierarchicalNodeWidth.id
export const TOPDOWN_HIERARCHICAL_NODE_ASPECT_RATIO = ALG.topdownpacking.hierarchicalNodeAspectRatio.id

// ── topdownpacking 专有 (org.eclipse.elk.topdownpacking.*) ──
export const NODE_ARRANGEMENT_STRATEGY = ALG.topdownpacking.nodeArrangementStrategy.id
export const WHITESPACE_ELIMINATION_STRATEGY = ALG.topdownpacking.whitespaceEliminationStrategy.id

// ── 枚举 (melk) ──
export enum NodeArrangementStrategy {
  LEFT_RIGHT_TOP_DOWN_NODE_PLACER = 'LEFT_RIGHT_TOP_DOWN_NODE_PLACER',
}

export enum WhitespaceEliminationStrategy {
  BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR = 'BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR',
}

/** 选项默认值 (ElkOptionsMain 实证: core 选项默认 + melk strategy 默认). */
export const DEFAULTS = {
  [PADDING]: 12, // core org.eclipse.elk.padding = ElkPadding(12)
  [SPACING_NODE_NODE]: 20, // core spacing.nodeNode
  [TOPDOWN_HIERARCHICAL_NODE_WIDTH]: 150, // core topdown.hierarchicalNodeWidth
  [TOPDOWN_HIERARCHICAL_NODE_ASPECT_RATIO]: 1.414, // core topdown.hierarchicalNodeAspectRatio
  [NODE_ARRANGEMENT_STRATEGY]: NodeArrangementStrategy.LEFT_RIGHT_TOP_DOWN_NODE_PLACER,
  [WHITESPACE_ELIMINATION_STRATEGY]: WhitespaceEliminationStrategy.BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR,
} as const

export interface ElkPadding {
  top: number
  left: number
  right: number
  bottom: number
}

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

/** 解析 padding (对象 / 字符串 "[top=..,left=..]" / 数字 / 缺省 → 12, ELK ElkPadding). */
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
