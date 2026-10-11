/**
 * mrtree Untreeifyer — ELK alg.mrtree.intermediate.Untreeifyer 0.12.0.
 * 把 treeify 阶段移除的边重新插回图结构.
 */
import { TGraph, TEdge, P_REMOVABLE_EDGES, getProp } from '../graph.js'

export function untreeifyer(tGraph: TGraph): void {
  const edges = getProp<TEdge[]>(tGraph, P_REMOVABLE_EDGES, [])
  for (const tEdge of edges) {
    tEdge.getSource().getOutgoingEdges().push(tEdge)
    tEdge.getTarget().getIncomingEdges().push(tEdge)
  }
}
