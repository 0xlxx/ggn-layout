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
 * layered-only 子入口 (tree-shaking).
 *
 * 与完整入口 (api/index.ts) 的差异: 不 import register-all → 非 layered 算法 provider
 * (mrtree/disco/force/radial/rectpacking/spore/topdownpacking/vertiflex) 不进 bundle,
 * 只 import 本入口的 consumer 可 tree-shake 掉这些代码.
 *
 * 若传入非 layered 算法, runCoreProviders 分派时抛明确错误 (提示用完整入口).
 */
export { layoutElkJson } from './elk-json.js'
export type {
  ElkNode, ElkEdge, ElkPort, ElkPoint, ElkEdgeSection, ElkLayoutOptions,
  LayoutInput, LayoutOutput, LayoutOutputEdge, LayoutSummary,
} from './elk-json.js'
export { LayoutError, LayoutErrorCode } from './errors.js'
export type { LayoutErrorOptions, LayoutIssue } from './errors.js'
export { validateLayoutInput, assertValidLayoutInput } from './validate.js'
