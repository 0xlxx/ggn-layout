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
 * MaxSTPhase — ELK alg.spore.p2processingorder.MaxSTPhase 0.12.0.
 *
 * 最大生成树: 对代价函数取负后跑 MinST (根用 preferredRoot.vertex 或首顶点 vertex).
 */
import { Graph, TEdge } from './graph.js'
import { createSpanningTree, convertTree } from './naive-minst.js'

export function maxSTPhase(graph: Graph): void {
  const invertedCF = (e: TEdge) => -graph.costFunction(e)
  const root = graph.preferredRoot !== null ? graph.preferredRoot.vertex : graph.vertices[0]!.vertex
  const tTree = createSpanningTree(graph.tEdges!, root, invertedCF)
  graph.tree = convertTree(tTree, graph.vertices)
}
