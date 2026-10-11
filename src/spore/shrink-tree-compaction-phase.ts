/**
 * ShrinkTreeCompactionPhase — ELK alg.spore.p3execution.ShrinkTreeCompactionPhase 0.12.0.
 *
 * P3 执行 (sporeCompaction): 对生成树做深度优先压缩.
 */
import { Graph } from './graph.js'
import { depthFirstCompaction } from './depth-first-compaction.js'

export function shrinkTreeCompactionPhase(graph: Graph): void {
  depthFirstCompaction(graph.tree!, graph.orthogonalCompaction)
}
