/**
 * mrtree RootProcessor — ELK alg.mrtree.intermediate.RootProcessor 0.12.0.
 * 找入边为空的节点为 root; 0 个 → DUMMY_ROOT; 多个 → SUPER_ROOT (dummy 边连接).
 */
import { TGraph, TNode, P_ROOT, P_DUMMY, setProp } from '../graph.js'

export function rootProcessor(tGraph: TGraph): void {
  const roots: TNode[] = []
  for (const node of tGraph.getNodes()) {
    if (node.getIncomingEdges().length === 0) {
      setProp(node, P_ROOT, true)
      roots.push(node)
    }
  }
  switch (roots.length) {
    case 0:
      // assert tGraph.getNodes().isEmpty()
      {
        const root = new TNode(0, tGraph, 'DUMMY_ROOT')
        setProp(root, P_ROOT, true)
        setProp(root, P_DUMMY, true)
        tGraph.getNodes().push(root)
      }
      break
    case 1:
      // perfect, we already have only one root
      break
    default: {
      const superRoot = new TNode(0, tGraph, 'SUPER_ROOT')
      for (const tRoot of roots) {
        superRoot.addChild(tRoot)
        setProp(tRoot, P_ROOT, false)
      }
      setProp(superRoot, P_ROOT, true)
      setProp(superRoot, P_DUMMY, true)
      tGraph.getNodes().push(superRoot)
      break
    }
  }
}
