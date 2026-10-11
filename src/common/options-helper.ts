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
 * 通用选项读取 helper（NodeMicroLayout 等通用模块用，提取自 vertiflex/options.ts）。
 * SSOT：与 vertiflex/options.ts 同语义（Java IndividualSpacings / CoreOptions 读取）；
 * 后续可收敛 vertiflex/options.ts 引用本模块（当前保留原样避免 vertiflex 回归风险）。
 */
import type { ElkNode } from '../api/elk-json.js'

/** 读取选项 (layoutOptions/properties 全键; 支持 org.eclipse.elk.* → elk.* 短键). */
export function jsonOpt<T>(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): T | undefined {
  const v = node.layoutOptions?.[key] ?? node.properties?.[key] ?? node.layoutOptions?.[key.replace(/^org\.eclipse\.elk\./, 'elk.')]
  return v as T | undefined
}

/** spacing.individual 选项 id (Java CoreOptions.SPACING_INDIVIDUAL). */
const SPACING_INDIVIDUAL = 'org.eclipse.elk.spacing.individual'

/**
 * 解析 spacing.individual 覆盖串 (Java IndividualSpacings.parse: "id:value" 以 ";,;" 分隔;
 * id 可为全 id 或后缀, 值与 LayoutOptionData 序列化一致).
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

/** 读取 spacing 选项原始值 (Java IndividualSpacings.getIndividualOrInherited). */
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

/** 数值 spacing 选项 (继承版 optNum). */
export function optNumSpacing(root: ElkNode | undefined, node: ElkNode, key: string, def: number): number {
  const v = spacingValue(root, node, key)
  if (v === undefined || v === null || v === '') return def
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
