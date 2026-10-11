/**
 * P3 绝对坐标 (ELK alg.vertiflex p3absolute.AbsoluteXPlacer).
 *
 * 由相对坐标计算绝对 x: 先左移根节点使最左子树 x=0 (findMinimalX),
 * 再把子树相对偏移逐层累加 (absoluteTreeCoords).
 */
import type { ElkNode } from '../../api/elk-json.js'
import { outgoingEdges, targetOf, nodeX } from '../vertiflex-util.js'

/** AbsoluteXPlacer.process(graph). */
export function absoluteXPlacer(graph: ElkNode, root: ElkNode): void {
  if ((graph.children ?? []).length > 0) {
    // first, move the root
    root.x = nodeX(root) - findMinimalX(graph, root)
    // now we update the whole tree to absolute X
    absoluteTreeCoords(graph, root)
  }
}

/** 最左子树 (递归: 叶子返回自身 x, 否则 min(子树最左) + 自身 x). */
function findMinimalX(graph: ElkNode, tree: ElkNode): number {
  const numOfChildren = outgoingEdges(graph, tree).length
  if (numOfChildren === 0) {
    return nodeX(tree)
  } else {
    let minSubtreeX = 0.0
    for (const edge of outgoingEdges(graph, tree)) {
      const testX = findMinimalX(graph, targetOf(graph, edge))
      minSubtreeX = testX < minSubtreeX ? testX : minSubtreeX
    }
    return minSubtreeX + nodeX(tree)
  }
}

/** 子树绝对坐标累加 (子 x += 父 x, 递归). */
function absoluteTreeCoords(graph: ElkNode, tree: ElkNode): void {
  const numOfChildren = outgoingEdges(graph, tree).length
  if (numOfChildren > 0) {
    for (const edge of outgoingEdges(graph, tree)) {
      const child = targetOf(graph, edge)
      child.x = nodeX(child) + nodeX(tree)
      absoluteTreeCoords(graph, child)
    }
  }
}
