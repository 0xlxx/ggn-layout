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
 * radial 布局选项 (ELK alg.radial 0.12.0, Radial.melk + CoreOptions).
 *
 * 选项 id (idPrefix org.eclipse.elk.radial):
 *   centerOnRoot / orderId / radius / rotate / rotation.{targetAngle,computeAdditionalWedgeSpace,
 *   outgoingEdgeAngles} / compactor / compactionStepSize / sorter / wedgeCriteria / optimizationCriteria.
 *   共用 core: org.eclipse.elk.{spacing.nodeNode (默认 20), padding (默认 8), margins (默认 0),
 *   omitNodeMicroLayout (false), nodeSize.fixedGraphSize (false), position (优化器用)}.
 */
import type { ElkNode } from '../api/elk-json.js'
import { CORE, ALG } from '../options/specs.js'

// ── radial 专有选项 (Radial.melk) ──
export const CENTER_ON_ROOT = ALG.radial.centerOnRoot.id
export const ORDER_ID = ALG.radial.orderId.id
export const RADIUS = ALG.radial.radius.id
export const ROTATE = ALG.radial.rotate.id
export const ROTATION_TARGET_ANGLE = ALG.radial.rotationTargetAngle.id
export const ROTATION_COMPUTE_ADDITIONAL_WEDGE_SPACE = ALG.radial.rotationComputeAdditionalWedgeSpace.id
export const ROTATION_OUTGOING_EDGE_ANGLES = ALG.radial.rotationOutgoingEdgeAngles.id
export const COMPACTOR = ALG.radial.compactor.id
export const COMPACTION_STEP_SIZE = ALG.radial.compactionStepSize.id
export const SORTER = ALG.radial.sorter.id
export const WEDGE_CRITERIA = ALG.radial.wedgeCriteria.id
export const OPTIMIZATION_CRITERIA = ALG.radial.optimizationCriteria.id

// ── core 共用 (CoreOptions) ──
export const SPACING_NODE_NODE = CORE.spacingNodeNode.id
export const PADDING = CORE.padding.id
export const MARGINS = CORE.margins.id
export const OMIT_NODE_MICRO_LAYOUT = CORE.omitNodeMicroLayout.id
export const NODE_SIZE_FIXED_GRAPH_SIZE = CORE.nodeSizeFixedGraphSize.id
export const POSITION = CORE.position.id
/** 内部属性 (CoreOptions.CHILD_AREA_*): 只内存保存, 不导出 JSON. */
export const CHILD_AREA_WIDTH = CORE.childAreaWidth.id
export const CHILD_AREA_HEIGHT = CORE.childAreaHeight.id

// ── 枚举 (melk) ──
export enum CompactionStrategy {
  NONE = 'NONE',
  RADIAL_COMPACTION = 'RADIAL_COMPACTION',
  WEDGE_COMPACTION = 'WEDGE_COMPACTION',
}

export enum SortingStrategy {
  NONE = 'NONE',
  POLAR_COORDINATE = 'POLAR_COORDINATE',
  ID = 'ID',
}

export enum AnnulusWedgeCriteria {
  LEAF_NUMBER = 'LEAF_NUMBER',
  NODE_SIZE = 'NODE_SIZE',
}

export enum RadialTranslationStrategy {
  NONE = 'NONE',
  EDGE_LENGTH = 'EDGE_LENGTH',
  EDGE_LENGTH_BY_POSITION = 'EDGE_LENGTH_BY_POSITION',
  CROSSING_MINIMIZATION_BY_POSITION = 'CROSSING_MINIMIZATION_BY_POSITION',
}

/** 默认值 (Radial.melk + CoreOptions). */
export const DEFAULTS = {
  [CENTER_ON_ROOT]: false,
  [ORDER_ID]: 0,
  [RADIUS]: 0.0,
  [ROTATE]: false,
  [ROTATION_TARGET_ANGLE]: 0,
  [ROTATION_COMPUTE_ADDITIONAL_WEDGE_SPACE]: false,
  [ROTATION_OUTGOING_EDGE_ANGLES]: false,
  [COMPACTOR]: CompactionStrategy.NONE,
  [COMPACTION_STEP_SIZE]: 1,
  [SORTER]: SortingStrategy.NONE,
  [WEDGE_CRITERIA]: AnnulusWedgeCriteria.NODE_SIZE,
  [OPTIMIZATION_CRITERIA]: RadialTranslationStrategy.NONE,
  [SPACING_NODE_NODE]: 20, // CoreOptions 默认
  [OMIT_NODE_MICRO_LAYOUT]: false,
  [NODE_SIZE_FIXED_GRAPH_SIZE]: false,
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

export interface ElkMargin {
  top: number
  left: number
  right: number
  bottom: number
}

export interface ElkPadding extends ElkMargin {}

/** 解析 margins (对象 / 字符串 "[top=..,left=..]" / 数字 / 缺省 0, ELK ElkMargin). */
export function optMargins(node: ElkNode): ElkMargin {
  const v = jsonOpt<unknown>(node, MARGINS)
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const num = (k: string): number => (typeof o[k] === 'number' ? o[k] as number : 0)
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    const num = (k: string): number => m[k] ?? 0
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  return { top: 0, left: 0, right: 0, bottom: 0 }
}

/** 解析 padding (对象 / 字符串 / 数字 / 缺省 → 12, CoreOptions.PADDING = new ElkPadding(12)). */
export function optPadding(node: ElkNode): ElkPadding {
  const v = jsonOpt<unknown>(node, PADDING)
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const num = (k: string): number => (typeof o[k] === 'number' ? o[k] as number : 12)
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  if (typeof v === 'string' && v.trim() !== '') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    const num = (k: string): number => m[k] ?? 12
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  return { top: 12, left: 12, right: 12, bottom: 12 }
}

// ── 图属性存取 (Java ElkNode.get/setProperty 语义) ──
// setProperty 覆盖显式设置 (Java Property 单一存储); 读优先级: 内存覆盖 > layoutOptions 显式 > 默认.
const propStore = new WeakMap<object, Map<string, unknown>>()

export function setGraphProperty(node: ElkNode, key: string, value: unknown): void {
  let m = propStore.get(node)
  if (m === undefined) { m = new Map(); propStore.set(node, m) }
  m.set(key, value)
}

export function getGraphProperty<T>(node: ElkNode, key: string, def?: T): T {
  const overridden = propStore.get(node)?.get(key)
  if (overridden !== undefined) return overridden as T
  const explicit = jsonOpt<unknown>(node, key)
  if (explicit !== undefined && explicit !== null && explicit !== '') return explicit as T
  return def as T
}
