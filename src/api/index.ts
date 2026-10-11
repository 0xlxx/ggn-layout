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
/** 完整入口: 注册全部非 layered 算法 provider (副作用). layered-only 用 ./layered.js. */
import './register-all.js'

/** 高层布局 API (等价 elkjs 的图布局服务). */
export { layoutElkJson, buildGraph, extractGraph } from './elk-json.js'
export type { ElkNode, ElkEdge, ElkPort, ElkPoint, ElkEdgeSection, ElkLayoutOptions, BuiltGraph, LayoutInput, LayoutOutput, LayoutOutputEdge, LayoutSummary } from './elk-json.js'

export { LayoutError, LayoutErrorCode } from './errors.js'
export type { LayoutErrorOptions, LayoutIssue } from './errors.js'
export { validateLayoutInput, assertValidLayoutInput } from './validate.js'

export { layoutJsonBatch } from './batch.js'
export type { LayoutBatchItem, LayoutBatchResult } from './batch.js'
export { diffLayout, layoutJsonDiff } from './diff.js'
export type { LayoutDiff, LayoutNodeDelta, LayoutEdgeDelta } from './diff.js'
export type { LayoutControl, LayoutProgressEvent, LayoutPhase } from './control.js'
export { createLayoutWorker } from './worker.js'
export type { LayoutWorkerClient, LayoutWorkerRequest, LayoutWorkerResponse, LayoutWorkerError, WorkerLike } from './worker.js'
