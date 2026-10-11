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
 * ShrinkTreeCompactionPhase — ELK alg.spore.p3execution.ShrinkTreeCompactionPhase 0.12.0.
 *
 * P3 执行 (sporeCompaction): 对生成树做深度优先压缩.
 */
import { Graph } from './graph.js'
import { depthFirstCompaction } from './depth-first-compaction.js'

export function shrinkTreeCompactionPhase(graph: Graph): void {
  depthFirstCompaction(graph.tree!, graph.orthogonalCompaction)
}
