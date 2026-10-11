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
 * 稳定布局选项门面。
 *
 * 只暴露消费方可依赖的选项类型、层级处理枚举和算法识别工具；
 * 内部 GraphProperties 与底层 properties 不属于发布契约。
 */
export type { ElkLayoutOptions } from './api/elk-json.js'
export { HIERARCHY_HANDLING } from './options/layered-options.js'
export { isSupportedAlgorithm, normalizeAlgorithm } from './api/algorithms.js'
