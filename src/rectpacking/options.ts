/**
 * rectpacking 布局选项 (ELK alg.rectpacking 0.12.0, RectPacking.melk).
 *
 * id 前缀 org.eclipse.elk.rectpacking (bundle idPrefix) + core 选项.
 * 默认值: RectPackingOptions 生成的 derived property 覆盖 (javap 实证):
 *   - aspectRatio 默认 1.3 (core 默认 null, rectpacking 覆盖为 1.3)
 *   - padding 默认 15 / spacing.nodeNode 默认 15 (rectpacking 覆盖 core 12/20)
 *   - nodeSize.fixedGraphSize 默认 false
 * 其余 rectpacking 专有选项默认值取自 melk.
 */
import type { ElkNode } from '../api/elk-json.js'
import { CORE, ALG } from '../options/specs.js'

// ── core 选项 (rectpacking 复用) ──
export const ASPECT_RATIO = CORE.aspectRatio.id
export const PADDING = CORE.padding.id
export const SPACING_NODE_NODE = CORE.spacingNodeNode.id
export const NODE_SIZE_FIXED_GRAPH_SIZE = CORE.nodeSizeFixedGraphSize.id
export const NODE_SIZE_CONSTRAINTS = CORE.nodeSizeConstraints.id
export const NODE_SIZE_MINIMUM = CORE.nodeSizeMinimum.id
export const CONTENT_ALIGNMENT = CORE.contentAlignment.id
export const INTERACTIVE = CORE.interactive.id
export const OMIT_NODE_MICRO_LAYOUT = CORE.omitNodeMicroLayout.id
export const PRIORITY = CORE.priority.id

// ── rectpacking 专有 (org.eclipse.elk.rectpacking.*) ──
export const WIDTH_APPROXIMATION_STRATEGY = ALG.rectpacking.widthApproximationStrategy.id
export const WIDTH_APPROXIMATION_TARGET_WIDTH = ALG.rectpacking.widthApproximationTargetWidth.id
export const WIDTH_APPROXIMATION_OPTIMIZATION_GOAL = ALG.rectpacking.widthApproximationOptimizationGoal.id
export const WIDTH_APPROXIMATION_LAST_PLACE_SHIFT = ALG.rectpacking.widthApproximationLastPlaceShift.id
export const PACKING_STRATEGY = ALG.rectpacking.packingStrategy.id
export const PACKING_COMPACTION_ROW_HEIGHT_REEVALUATION = ALG.rectpacking.packingCompactionRowHeightReevaluation.id
export const PACKING_COMPACTION_ITERATIONS = ALG.rectpacking.packingCompactionIterations.id
export const WHITE_SPACE_ELIMINATION_STRATEGY = ALG.rectpacking.whiteSpaceEliminationStrategy.id
export const TRYBOX = ALG.rectpacking.trybox.id
export const ORDER_BY_SIZE = ALG.rectpacking.orderBySize.id
export const DESIRED_POSITION = ALG.rectpacking.desiredPosition.id
export const CURRENT_POSITION = ALG.rectpacking.currentPosition.id
export const IN_NEW_ROW = ALG.rectpacking.inNewRow.id

// ── 枚举 (melk) ──
export enum OptimizationGoal {
  ASPECT_RATIO_DRIVEN = 'ASPECT_RATIO_DRIVEN',
  MAX_SCALE_DRIVEN = 'MAX_SCALE_DRIVEN',
  AREA_DRIVEN = 'AREA_DRIVEN',
}

export enum WidthApproximationStrategy {
  GREEDY = 'GREEDY',
  TARGET_WIDTH = 'TARGET_WIDTH',
}

export enum PackingStrategy {
  COMPACTION = 'COMPACTION',
  SIMPLE = 'SIMPLE',
  NONE = 'NONE',
}

export enum WhiteSpaceEliminationStrategy {
  EQUAL_BETWEEN_STRUCTURES = 'EQUAL_BETWEEN_STRUCTURES',
  TO_ASPECT_RATIO = 'TO_ASPECT_RATIO',
  NONE = 'NONE',
}

/** 选项默认值 (javap RectPackingOptions derived property / melk default). */
export const DEFAULTS = {
  [ASPECT_RATIO]: 1.3, // RectPackingOptions: new Property(CoreOptions.ASPECT_RATIO, 1.3)
  [PADDING]: 15, // RectPackingOptions: new Property(CoreOptions.PADDING, new ElkPadding(15))
  [SPACING_NODE_NODE]: 15, // RectPackingOptions: new Property(..., 15)
  [NODE_SIZE_FIXED_GRAPH_SIZE]: false,
  [CONTENT_ALIGNMENT]: 'topLeft',
  [INTERACTIVE]: false,
  [OMIT_NODE_MICRO_LAYOUT]: false,
  [WIDTH_APPROXIMATION_STRATEGY]: WidthApproximationStrategy.GREEDY,
  [WIDTH_APPROXIMATION_TARGET_WIDTH]: -1,
  [WIDTH_APPROXIMATION_OPTIMIZATION_GOAL]: OptimizationGoal.MAX_SCALE_DRIVEN,
  [WIDTH_APPROXIMATION_LAST_PLACE_SHIFT]: true,
  [PACKING_STRATEGY]: PackingStrategy.COMPACTION,
  [PACKING_COMPACTION_ROW_HEIGHT_REEVALUATION]: false,
  [PACKING_COMPACTION_ITERATIONS]: 1,
  [WHITE_SPACE_ELIMINATION_STRATEGY]: WhiteSpaceEliminationStrategy.NONE,
  [TRYBOX]: false,
  [ORDER_BY_SIZE]: false,
  [DESIRED_POSITION]: -1,
  [CURRENT_POSITION]: -1,
  [IN_NEW_ROW]: false,
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

/** 布尔选项: 显式设置 > 默认值. */
export function optBool(node: ElkNode, key: string, def: boolean): boolean {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return def
  return String(v) === 'true'
}

/** 字符串/枚举选项: 显式设置 > 默认值. */
export function optStr<T extends string>(node: ElkNode, key: string, def: T): T {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return def
  return String(v) as T
}

/** 解析 padding (字符串 "[top=..,left=..]" / 数字 / 缺省 → 15, ELK ElkPadding). */
export function optPadding(node: ElkNode): ElkPadding {
  const v = jsonOpt<unknown>(node, PADDING)
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
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
