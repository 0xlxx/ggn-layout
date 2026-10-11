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
