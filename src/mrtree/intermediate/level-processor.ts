/**
 * mrtree LevelProcessor — ELK alg.mrtree.intermediate.LevelProcessor 0.12.0.
 * BFS 逐层设置 TREE_LEVEL.
 */
import { TGraph, TNode, P_ROOT, getBool } from '../graph.js'
import { TREE_LEVEL } from '../options.js'

export function levelProcessor(tGraph: TGraph): void {
  const gloLevelMap = new Map<number, number>()
  const roots = tGraph.getNodes().filter((x) => getBool(x, P_ROOT, false))
  setLevel(roots, 0, gloLevelMap)
  for (const tNode of tGraph.getNodes()) {
    const level = gloLevelMap.get(tNode.id) ?? 0
    tNode.props[TREE_LEVEL] = level
  }
}

function setLevel(currentLevel: TNode[], level: number, gloLevelMap: Map<number, number>): void {
  if (currentLevel.length > 0) {
    const nextLevel: TNode[] = []
    for (const tNode of currentLevel) {
      gloLevelMap.set(tNode.id, level)
      for (const tChild of tNode.getChildren()) nextLevel.push(tChild)
    }
    setLevel(nextLevel, level + 1, gloLevelMap)
  }
}
