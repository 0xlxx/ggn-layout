/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
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
