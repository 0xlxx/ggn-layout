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
 * 稳定布局选项门面。
 *
 * 只暴露消费方可依赖的选项类型、层级处理枚举和算法识别工具；
 * 内部 GraphProperties 与底层 properties 不属于发布契约。
 */
export type { ElkLayoutOptions } from './api/elk-json.js'
export { HIERARCHY_HANDLING } from './options/layered-options.js'
export { isSupportedAlgorithm, normalizeAlgorithm } from './api/algorithms.js'
