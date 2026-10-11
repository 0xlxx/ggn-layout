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
 * DelaunayTriangulationPhase — ELK alg.spore.p1structure.DelaunayTriangulationPhase 0.12.0.
 *
 * P1 结构提取: 对中心顶点做 Delaunay 三角剖分, 边并入 graph.tEdges
 * (已有边集 (scanline 重叠边) 存在时 addAll 追加).
 */
import { Graph } from './graph.js'
import { triangulate } from './bowyer-watson.js'

export function delaunayTriangulationPhase(graph: Graph): void {
  const vertices = graph.vertices.map((v) => v.originalVertex)
  if (graph.tEdges === null) {
    graph.tEdges = triangulate(vertices)
  } else {
    graph.tEdges.addAll(triangulate(vertices).toArray())
  }
}
