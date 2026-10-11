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
