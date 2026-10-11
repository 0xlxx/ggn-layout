/**
 * vertiflex 布局选项 (ELK alg.vertiflex 0.12.0, VertiFlex.melk).
 *
 * 选项 id = bundle idPrefix (org.eclipse.elk.vertiflex) + 选项名;
 * core 选项 (spacing.nodeNode/padding/margins/omitNodeMicroLayout) 复用.
 * 默认值: ElkOptionsMain/jar 实证 (950 输出 padding=[12,12,12,12], margins=0):
 *   - padding 默认 12 (core org.eclipse.elk.padding)
 *   - spacing.nodeNode 默认 20 (core)
 *   - margins 默认 0 (core)
 *   - layerDistance 默认 50 / layoutStrategy 默认 STRAIGHT (melk)
 *   - considerNodeModelOrder 默认 true (melk)
 *   - verticalConstraint 无默认 (节点级, 可选)
 *   - omitNodeMicroLayout 默认 false (core)
 *
 * 枚举值: Java LayoutOptionData.enumForString 用 Enum.valueOf (大小写敏感) —
 * JSON 值须为枚举常量名 (BEND) 或整数下标; 解析失败 → null → 保持默认.
 */
import type { ElkNode } from '../api/elk-json.js'
import { CORE, ALG } from '../options/specs.js'

// ── core 选项 (vertiflex 复用) ──
export const SPACING_NODE_NODE = CORE.spacingNodeNode.id
export const PADDING = CORE.padding.id
export const MARGINS = CORE.margins.id
export const OMIT_NODE_MICRO_LAYOUT = CORE.omitNodeMicroLayout.id

// ── vertiflex 专有 (org.eclipse.elk.vertiflex.*) ──
export const VERTICAL_CONSTRAINT = ALG.vertiflex.verticalConstraint.id
export const LAYOUT_STRATEGY = ALG.vertiflex.layoutStrategy.id
export const LAYER_DISTANCE = ALG.vertiflex.layerDistance.id
export const CONSIDER_NODE_MODEL_ORDER = ALG.vertiflex.considerNodeModelOrder.id

// ── 枚举 (melk, EdgeRoutingStrategy) ──
export enum EdgeRoutingStrategy {
  STRAIGHT = 'STRAIGHT',
  BEND = 'BEND',
}

export interface ElkMargin {
  top: number
  left: number
  right: number
  bottom: number
}

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

/** 数值选项: 显式设置 (可解析) > 默认值. */
export function optNum(node: ElkNode, key: string, def: number): number {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

/** 布尔选项: 显式设置 (true/false, 大小写不敏感) > 默认值. */
export function optBool(node: ElkNode, key: string, def: boolean): boolean {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return def
  if (String(v).toLowerCase() === 'true') return true
  if (String(v).toLowerCase() === 'false') return false
  return def
}

/** 字符串/枚举选项: 显式设置 > 默认值 (枚举常量名, Enum.valueOf 语义). */
export function optStr<T extends string>(node: ElkNode, key: string, def: T): T {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return def
  return String(v) as T
}

/** 数值选项 (Java 节点级, 无默认): 显式设置 → number, 否则 undefined. */
export function optNumOptional(node: ElkNode, key: string): number | undefined {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** 解析 margins (对象 / 字符串 "[top=..,left=..]" / 缺省 → 0, ELK ElkMargin 默认 0). */
export function optMargins(node: ElkNode): ElkMargin {
  const v = jsonOpt<unknown>(node, MARGINS)
  const num = (k: string): number => {
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      return typeof o[k] === 'number' ? o[k] as number : 0
    }
    return 0
  }
  if (typeof v === 'string') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    return { top: m['top'] ?? 0, left: m['left'] ?? 0, right: m['right'] ?? 0, bottom: m['bottom'] ?? 0 }
  }
  return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
}

/** 解析 padding (对象 / 字符串 "[top=..,left=..]" / 数字 / 缺省 → 12, ELK ElkPadding). */
export function optPadding(node: ElkNode): ElkPadding {
  const v = jsonOpt<unknown>(node, PADDING)
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
  if (typeof v === 'object' && v !== null) {
    const o = v as Record<string, unknown>
    const num = (k: string): number => (typeof o[k] === 'number' ? o[k] as number : 12)
    return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
  }
  if (typeof v === 'string') {
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

/** spacing.individual 选项 id (Java CoreOptions.SPACING_INDIVIDUAL). */
const SPACING_INDIVIDUAL = CORE.spacingIndividual.id

/**
 * 解析 spacing.individual 覆盖串 (Java IndividualSpacings.parse: "id:value" 以 ";,;" 分隔;
 * id 可为全 id 或后缀, 值与 LayoutOptionData 序列化一致, 例如
 * "spacing.labelNode:3" / "spacing.portsSurrounding:[top=40.0,left=10.0,...]").
 */
export function parseIndividualSpacings(v: unknown): Record<string, unknown> {
  if (typeof v !== 'string' || v === '') return {}
  const map: Record<string, unknown> = {}
  for (const entry of v.split(';,;')) {
    const idx = entry.indexOf(':')
    if (idx <= 0) continue
    const id = entry.slice(0, idx).trim()
    const value = entry.slice(idx + 1).trim()
    if (id !== '') map[id] = value
  }
  return map
}

/** id 是否匹配选项 key (Java getOptionDataBySuffix: 全 id 或 '.' 边界后缀). */
function matchesOptionId(key: string, id: string): boolean {
  return key === id
    || key.endsWith('.' + id)
    || id === key.replace(/^org\.eclipse\.elk\./, '')
}

/**
 * 读取 spacing 选项原始值 (Java IndividualSpacings.getIndividualOrInherited):
 *   node.spacing.individual 覆盖 > root(graph) 显式值 > undefined.
 * 注意: 节点自身的直接 spacing 选项不被读取 (jar 实证 NodeContext 只查 individual + graph),
 * 因此 root 级设置才是继承来源.
 */
export function spacingValue(root: ElkNode | undefined, node: ElkNode, key: string): unknown {
  for (const [id, value] of Object.entries(parseIndividualSpacings(jsonOpt<unknown>(node, SPACING_INDIVIDUAL)))) {
    if (matchesOptionId(key, id)) return value
  }
  if (root !== undefined) {
    const v = jsonOpt<unknown>(root, key)
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

/** 数值 spacing 选项 (继承版 optNum): node.spacing.individual > root > 默认 (Java IndividualSpacings 语义). */
export function optNumSpacing(root: ElkNode | undefined, node: ElkNode, key: string, def: number): number {
  const v = spacingValue(root, node, key)
  if (v === undefined || v === null || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
