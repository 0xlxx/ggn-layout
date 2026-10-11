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
 * force/stress 布局选项 (ELK alg.force 0.12.0).
 * id 取自 melk (idPrefix org.eclipse.elk.stress / org.eclipse.elk.force) + core 选项,
 * 默认值取自 Force.melk / Stress.melk / core.
 */
import { MapPropertyHolder } from '../graph/properties.js'
import { CORE, ALG } from '../options/specs.js'

// ── core 选项 (force/stress 复用) ──
export const PRIORITY = CORE.priority.id
export const SPACING_NODE_NODE = CORE.spacingNodeNode.id
export const SPACING_EDGE_LABEL = CORE.spacingEdgeLabel.id
export const ASPECT_RATIO = CORE.aspectRatio.id
export const RANDOM_SEED = CORE.randomSeed.id
export const SEPARATE_CONNECTED_COMPONENTS = CORE.separateConnectedComponents.id
export const PADDING = CORE.padding.id
export const INTERACTIVE = CORE.interactive.id
export const OMIT_NODE_MICRO_LAYOUT = CORE.omitNodeMicroLayout.id
export const EDGE_LABELS_INLINE = CORE.edgeLabelsInline.id

// ── force 特有 (Force.melk) ──
export const FORCE_MODEL = ALG.force.forceModel.id
export const FORCE_ITERATIONS = ALG.force.forceIterations.id
export const FORCE_REPULSIVE_POWER = ALG.force.forceRepulsivePower.id
export const FORCE_TEMPERATURE = ALG.force.forceTemperature.id
export const FORCE_REPULSION = ALG.force.forceRepulsion.id

// ── stress 特有 (Stress.melk, idPrefix org.eclipse.elk.stress) ──
export const STRESS_FIXED = ALG.force.stressFixed.id
export const STRESS_DESIRED_EDGE_LENGTH = ALG.force.stressDesiredEdgeLength.id
export const STRESS_DIMENSION = ALG.force.stressDimension.id
export const STRESS_EPSILON = ALG.force.stressEpsilon.id
export const STRESS_ITERATION_LIMIT = ALG.force.stressIterationLimit.id

export enum ForceModelStrategy {
  EADES = 'EADES',
  FRUCHTERMAN_REINGOLD = 'FRUCHTERMAN_REINGOLD',
}

export enum Dimension {
  XY = 'XY',
  X = 'X',
  Y = 'Y',
}

// ── 默认值 (ELK 0.12.0) ──
export const DEFAULTS = {
  [PRIORITY]: 1,
  [SPACING_NODE_NODE]: 80, // Force.melk: supports spacing.nodeNode = 80 (覆盖 core 默认 20)
  [SPACING_EDGE_LABEL]: 5, // Force.melk: supports spacing.edgeLabel = 5
  [ASPECT_RATIO]: 1.6,
  [RANDOM_SEED]: 1, // Force.melk: supports randomSeed = 1
  [SEPARATE_CONNECTED_COMPONENTS]: true, // Force.melk: supports = true
  [PADDING]: 50, // Force.melk: supports padding = new ElkPadding(50)
  [INTERACTIVE]: false,
  [OMIT_NODE_MICRO_LAYOUT]: false,
  [EDGE_LABELS_INLINE]: false,
  [FORCE_MODEL]: ForceModelStrategy.FRUCHTERMAN_REINGOLD,
  [FORCE_ITERATIONS]: 300,
  [FORCE_REPULSIVE_POWER]: 0,
  [FORCE_TEMPERATURE]: 0.001,
  [FORCE_REPULSION]: 5.0,
  [STRESS_FIXED]: false,
  [STRESS_DESIRED_EDGE_LENGTH]: 100.0,
  [STRESS_DIMENSION]: Dimension.XY,
  [STRESS_EPSILON]: 10e-4, // Stress.melk: default = 10e-4
  [STRESS_ITERATION_LIMIT]: 2147483647, // Integer.MAX_VALUE
} as const

/** 读取选项 (显式设置 > 默认值). */
export function optOf<T>(holder: MapPropertyHolder, key: string, def: T): T {
  if (holder.hasProperty(key)) return holder.getProperty<T>(key)
  return def
}

/** 读取选项 (JSON 输入, layoutOptions/properties 全键). */
export function jsonOpt<T>(node: { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, key: string): T | undefined {
  const v = node.layoutOptions?.[key] ?? node.properties?.[key] ?? node.layoutOptions?.[key.replace(/^org\.eclipse\.elk\./, 'elk.')]
  return v as T | undefined
}

/** 解析 padding (JSON 字符串 "[top=10,left=10,...]" / 数字 / 缺省 → 统一值). */
export interface ElkPaddingLike {
  top: number
  left: number
  right: number
  bottom: number
}

export function parsePadding(v: unknown, def: number): ElkPaddingLike {
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
  if (typeof v === 'string') {
    const s = String(v).replace(/[\[\]]/g, '')
    const parts: Record<string, number> = {}
    for (const token of s.split(',')) {
      const eq = token.indexOf('=')
      if (eq !== -1) {
        const k = token.slice(0, eq).trim()
        const num = Number(token.slice(eq + 1).trim())
        if (Number.isFinite(num)) parts[k] = num
      } else {
        const num = Number(token.trim())
        if (Number.isFinite(num)) { parts.top = num; parts.left = num; parts.right = num; parts.bottom = num }
      }
    }
    return { top: parts.top ?? def, left: parts.left ?? def, right: parts.right ?? def, bottom: parts.bottom ?? def }
  }
  return { top: def, left: def, right: def, bottom: def }
}
