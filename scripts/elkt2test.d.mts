import type { ParsedGraph } from '../shared/elkgraph-builder.js'
import type { OptMeta } from '../shared/opt-map.js'

/** elkt2test.mjs 的类型声明（脚本无声明文件，测试侧用）. */
export interface ElktParsedGraph extends ParsedGraph {
  portIds: Set<string>
}

export function parseElkt(source: string): ElktParsedGraph
export function elktToElkJson(graphData: ElktParsedGraph, opts?: Record<string, unknown>): unknown
export function elktHash(graphData: ElktParsedGraph): string
export const OPT_MAP: Record<string, OptMeta>
export function coerceVal(meta: OptMeta, raw: string): unknown
export function applyGraphPropsToLGraph(graph: unknown, graphProps: Record<string, unknown>): void

declare const _default: { parseElkt: typeof parseElkt }
export default _default
