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
 * MinSTPhase — ELK alg.spore.p2processingorder.MinSTPhase 0.12.0.
 *
 * P2 处理序: 以 preferredRoot (或首顶点) 为根构造最小生成树,
 * Tree<KVector> → Tree<Node> (originalVertex 映射).
 */
import { Graph } from './graph.js'
import { createSpanningTree, convertTree } from './naive-minst.js'

export function minSTPhase(graph: Graph): void {
  const root = graph.preferredRoot !== null ? graph.preferredRoot.originalVertex : graph.vertices[0]!.originalVertex
  const tTree = createSpanningTree(graph.tEdges!, root, graph.costFunction)
  graph.tree = convertTree(tTree, graph.vertices)
}
