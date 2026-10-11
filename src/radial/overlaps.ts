/**
 * overlaps — ELK alg.radial.intermediate.overlaps
 * (IOverlapRemoval / RadiusExtensionOverlapRemoval).
 *
 * 初始径向布局后, 逐半径外扩消除重叠: 每层外扩到无重叠, 再把该层移动距离
 * 传递给所有下一层节点 (沿根连线方向), 递归直到叶子.
 */
import type { ElkNode } from '../api/elk-json.js'
import { SORTER, SPACING_NODE_NODE, optStr, optNum, getGraphProperty, SortingStrategy } from './options.js'
import { getNextLevelNodeSet, getSuccessors } from './radial-util.js'
import type { IRadialSorter } from './sorting.js'
import { createSorter } from './sorting.js'
import { AbstractRadiusExtensionCompaction } from './compaction.js'
import { INTERNAL_ROOT_NODE } from './radial-layout.js'

/** 重叠消除策略 (Java IOverlapRemoval). */
export interface IOverlapRemoval {
  removeOverlaps(graph: ElkNode): void
}

/** 通过外扩半径消除重叠 (Java RadiusExtensionOverlapRemoval). */
export class RadiusExtensionOverlapRemoval extends AbstractRadiusExtensionCompaction implements IOverlapRemoval {
  private graph: ElkNode
  private sorter: IRadialSorter | null = null

  constructor(graph: ElkNode) {
    super()
    this.graph = graph
  }

  removeOverlaps(graph: ElkNode): void {
    const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)
    this.setRoot(root)
    this.sorter = createSorter(this.graph, optStr(graph, SORTER, SortingStrategy.NONE))
    this.setSpacing(optNum(graph, SPACING_NODE_NODE))

    const successors = getSuccessors(this.graph, root)
    this.extend(successors)
  }

  /** 外扩当前半径直到无重叠, 然后递归下一层 (Java extend). */
  private extend(nodes: ElkNode[]): void {
    if (nodes.length === 0) return
    // Save old positions
    const oldPositions: { x: number; y: number }[] = nodes.map((node) => ({ x: node.x ?? 0, y: node.y ?? 0 }))
    while (this.overlapLayer(nodes)) {
      this.contractLayer(this.graph, nodes, false)
    }

    let movedX = 0
    let movedY = 0
    if (nodes.length > 0) {
      const firstNode = nodes[0]!
      movedX = (firstNode.x ?? 0) - oldPositions[0]!.x
      movedY = (firstNode.y ?? 0) - oldPositions[0]!.y
    }
    const movedDistance = Math.sqrt(movedX * movedX + movedY * movedY)
    const nextLevelNodes = getNextLevelNodeSet(this.graph, nodes)
    // Calculate the moved distance which is the amount all children and grandchildren have to be moved.
    if (nextLevelNodes.size > 0) {
      for (const nextLevelNode of nextLevelNodes) {
        this.moveNode(nextLevelNode, movedDistance)
      }
    }

    if (this.sorter !== null) {
      this.sorter.sort([...nextLevelNodes])
    }
    this.extend([...nextLevelNodes])
  }
}

/** 重叠消除处理器 (Java RadiusExtensionOverlapRemoval.process). */
export function overlapRemoval(graph: ElkNode): void {
  const removal = new RadiusExtensionOverlapRemoval(graph)
  removal.removeOverlaps(graph)
}
