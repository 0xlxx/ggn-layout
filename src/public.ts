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
 * 公共 API 入口（消费方 + AI agent 只应从这里 import）。
 *
 * 普通任务只需要 `layoutElkJson`：传入标准 JSON 图，得到带节点几何与边
 * sections 的新 JSON。低层组装原语（buildGraph / extractGraph / LGraph 模型）
 * 不属于公共契约——需要引擎级能力请用 `internal.ts` 或历史兼容入口。
 */
export { layoutElkJson } from './api/index.js'
export type {
  ElkNode, ElkEdge, ElkPort, ElkPoint, ElkEdgeSection, ElkLayoutOptions,
  LayoutInput, LayoutOutput, LayoutOutputEdge, LayoutSummary,
} from './api/index.js'
export { LayoutError, LayoutErrorCode, validateLayoutInput, assertValidLayoutInput } from './api/index.js'
export type { LayoutErrorOptions, LayoutIssue } from './api/index.js'
export { layoutJsonBatch, diffLayout, layoutJsonDiff } from './api/index.js'
export type {
  LayoutBatchItem, LayoutBatchResult, LayoutDiff, LayoutNodeDelta, LayoutEdgeDelta,
  LayoutControl, LayoutProgressEvent, LayoutPhase,
} from './api/index.js'
