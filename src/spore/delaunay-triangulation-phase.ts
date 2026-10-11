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
