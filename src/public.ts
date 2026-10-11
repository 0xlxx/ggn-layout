/*
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout. It is original work of the GGN project and
 * is made available under the terms of the MIT License.
 *
 * SPDX-License-Identifier: MIT
 * License text: LICENSE.
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
