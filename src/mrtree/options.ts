/**
 * mrtree 布局选项 (ELK alg.mrtree 0.12.0, MrTreeOptions).
 *
 * 默认值: Tree.melk (bundle meta) 实证 — mrtree 覆盖 core 默认:
 *   - padding = ElkPadding(20) / spacing.nodeNode 20 / spacing.edgeNode 3
 *   - aspectRatio 1.6 / priority 1 / separateConnectedComponents true
 *   - direction UNDEFINED / weighting MODEL_ORDER / searchOrder DFS
 *   - edgeRoutingMode AVOID_OVERLAP / positionConstraint -1 / treeLevel 0
 *   - compaction false / edgeEndTextureLength 7
 */
import type { ElkNode } from '../api/elk-json.js'
import { CORE, ALG } from '../options/specs.js'

// ── core 选项 ──
export const PADDING = CORE.padding.id
export const SPACING_NODE_NODE = CORE.spacingNodeNode.id
export const SPACING_EDGE_NODE = CORE.spacingEdgeNode.id
export const ASPECT_RATIO = CORE.aspectRatio.id
export const PRIORITY = CORE.priority.id
export const SEPARATE_CONNECTED_COMPONENTS = CORE.separateConnectedComponents.id
export const DEBUG_MODE = CORE.debugMode.id
export const DIRECTION = CORE.direction.id
export const NODE_SIZE_FIXED_GRAPH_SIZE = CORE.nodeSizeFixedGraphSize.id

// ── mrtree 专有 (org.eclipse.elk.mrtree.*) ──
export const WEIGHTING = ALG.mrtree.weighting.id
export const SEARCH_ORDER = ALG.mrtree.searchOrder.id
export const POSITION_CONSTRAINT = ALG.mrtree.positionConstraint.id
export const EDGE_ROUTING_MODE = ALG.mrtree.edgeRoutingMode.id
export const TREE_LEVEL = ALG.mrtree.treeLevel.id
export const COMPACTION = ALG.mrtree.compaction.id
export const EDGE_END_TEXTURE_LENGTH = ALG.mrtree.edgeEndTextureLength.id

/** 方向 (core Direction). */
export enum Direction {
  UNDEFINED = 'UNDEFINED',
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

export namespace Direction {
  export function isVertical(d: Direction): boolean {
    return d === Direction.UP || d === Direction.DOWN
  }
  export function isHorizontal(d: Direction): boolean {
    return d === Direction.LEFT || d === Direction.RIGHT
  }
}

/** TreeifyingOrder. */
export enum TreeifyingOrder {
  DFS = 'DFS',
  BFS = 'BFS',
}

/** OrderWeighting. */
export enum OrderWeighting {
  MODEL_ORDER = 'MODEL_ORDER',
  DESCENDANTS = 'DESCENDANTS',
  FAN = 'FAN',
  CONSTRAINT = 'CONSTRAINT',
}

/** EdgeRoutingMode. */
export enum EdgeRoutingMode {
  NONE = 'NONE',
  MIDDLE_TO_MIDDLE = 'MIDDLE_TO_MIDDLE',
  AVOID_OVERLAP = 'AVOID_OVERLAP',
}

export interface ElkPadding {
  top: number
  left: number
  right: number
  bottom: number
}

/** 选项默认值 (Tree.melk 实证). */
export const DEFAULTS = {
  [PADDING]: 20,
  [SPACING_NODE_NODE]: 20,
  [SPACING_EDGE_NODE]: 3,
  [ASPECT_RATIO]: 1.6,
  [PRIORITY]: 1,
  [SEPARATE_CONNECTED_COMPONENTS]: true, // null → true (Java: separate == null || separate)
  [DEBUG_MODE]: false,
  [DIRECTION]: Direction.UNDEFINED,
  [WEIGHTING]: OrderWeighting.MODEL_ORDER,
  [SEARCH_ORDER]: TreeifyingOrder.DFS,
  [POSITION_CONSTRAINT]: -1,
  [EDGE_ROUTING_MODE]: EdgeRoutingMode.AVOID_OVERLAP,
  [TREE_LEVEL]: 0,
  [COMPACTION]: false,
  [EDGE_END_TEXTURE_LENGTH]: 7,
  [NODE_SIZE_FIXED_GRAPH_SIZE]: false,
} as const

/** 读取选项 (layoutOptions/properties 全键; 支持 org.eclipse.elk.* → elk.* 短键). */
export function jsonOpt<T>(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): T | undefined {
  const v = node.layoutOptions?.[key] ?? node.properties?.[key] ?? node.layoutOptions?.[key.replace(/^org\.eclipse\.elk\./, 'elk.')]
  return v as T | undefined
}

/** 数值选项: 显式设置 > 默认值. */
export function optNum(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): number {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return DEFAULTS[key as keyof typeof DEFAULTS] as number
  const n = Number(v)
  return Number.isFinite(n) ? n : (DEFAULTS[key as keyof typeof DEFAULTS] as number)
}

/** 布尔选项: 显式设置 > 默认值. */
export function optBool(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): boolean {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return DEFAULTS[key as keyof typeof DEFAULTS] as boolean
  return Boolean(v)
}

/** 字符串/枚举选项: 显式设置 > 默认值. */
export function optStr<T extends string>(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string, def: T): T {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return def
  return String(v) as T
}

/** 解析 padding (对象 / 字符串 "[top=..,left=..]" / 数字 / 缺省 → 12, ELK ElkPadding). */
export function optPadding(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }): ElkPadding {
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

/** 方向选项: 显式设置 > 默认值. */
export function optDirection(node: ElkNode): Direction {
  const v = jsonOpt<unknown>(node, DIRECTION)
  if (v === undefined || v === null || v === '') return Direction.UNDEFINED
  const s = String(v).toUpperCase()
  if (s === 'UP') return Direction.UP
  if (s === 'LEFT') return Direction.LEFT
  if (s === 'RIGHT') return Direction.RIGHT
  if (s === 'DOWN') return Direction.DOWN
  return Direction.UNDEFINED
}
