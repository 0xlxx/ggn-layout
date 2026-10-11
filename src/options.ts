/**
 * 稳定布局选项门面。
 *
 * 只暴露消费方可依赖的选项类型、层级处理枚举和算法识别工具；
 * 内部 GraphProperties 与底层 properties 不属于发布契约。
 */
export type { ElkLayoutOptions } from './api/elk-json.js'
export { HIERARCHY_HANDLING } from './options/layered-options.js'
export { isSupportedAlgorithm, normalizeAlgorithm } from './api/algorithms.js'
