/**
 * mrtree LevelHeightProcessor — ELK alg.mrtree.intermediate.LevelHeightProcessor 0.12.0.
 * 每层高度 = 该层节点在布局方向上的最大尺寸.
 */
import { TGraph, TNode, P_ROOT, P_LEVELHEIGHT, getBool, setProp } from '../graph.js'

export function levelHeightProcessor(tGraph: TGraph): void {
  const root = tGraph.getNodes().find((tNode) => getBool(tNode, P_ROOT, false))
  if (root === undefined) return
  const layoutDirection = tGraph.props['org.eclipse.elk.direction'] as string | undefined
  setNeighbors([root], layoutDirection)
}

function setNeighbors(currentLevel: TNode[], layoutDirection?: string): void {
  if (currentLevel.length === 0) return
  const nextLevel: TNode[] = []
  let height = 0
  const horizontal = layoutDirection === 'LEFT' || layoutDirection === 'RIGHT'
  if (horizontal) {
    for (const cN of currentLevel) {
      for (const child of cN.getChildren()) nextLevel.push(child)
      if (height < cN.getSize().x) height = cN.getSize().x
    }
  } else {
    for (const cN of currentLevel) {
      for (const child of cN.getChildren()) nextLevel.push(child)
      if (height < cN.getSize().y) height = cN.getSize().y
    }
  }
  for (const cN of currentLevel) {
    setProp(cN, P_LEVELHEIGHT, height)
  }
  setNeighbors(nextLevel, layoutDirection)
}
