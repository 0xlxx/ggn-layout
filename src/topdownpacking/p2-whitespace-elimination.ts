/**
 * P2 空白消除 (ELK alg.topdownpacking BottomRowEqualWhitespaceEliminator).
 *
 * 逐行检查末节点右侧空白: 若右边界 + padding.right 仍小于父宽度, 把额外空间均分给该行
 * 前 lastIndex+1 个节点 (右移 + 加宽). 然后检查首列底部空白: 若底边界 + padding.bottom
 * 小于父高度, 把额外空间按「行数+1」均分给所有节点 (下移 + 加高).
 * 父宽度/高度为 0 或网格无列时跳过 (Java 同).
 */
import type { ElkNode } from '../api/elk-json.js'
import type { Grid } from './grid.js'
import { optPadding } from './options.js'

/** P2: 底部行均分空白消除 (Java BottomRowEqualWhitespaceEliminator.process). */
export function bottomRowEqualWhitespaceEliminator(graph: ElkNode, grid: Grid<ElkNode>): void {
  if ((graph.width ?? 0) === 0 || grid.getColumns() === 0) return

  const padding = optPadding(graph)

  // 逐行: 检查末节点右侧是否有空白, 有则均分扩张并右移.
  for (let i = 0; i < grid.getRows(); i++) {
    const row = grid.getRow(i)
    let last: ElkNode | null = null
    let lastIndex = row.length
    while (last === null) last = row[--lastIndex] ?? null
    const rightBorder = (last.x ?? 0) + (last.width ?? 0)

    if (rightBorder + padding.right < (graph.width ?? 0)) {
      const extraSpace = (graph.width ?? 0) - (rightBorder + padding.right)
      const extraSpacePerNode = extraSpace / (lastIndex + 1)
      let accumulatedShift = 0
      for (let j = 0; j <= lastIndex; j++) {
        const node = row[j]!
        node.x = (node.x ?? 0) + accumulatedShift
        node.width = (node.width ?? 0) + extraSpacePerNode
        accumulatedShift += extraSpacePerNode
      }
    }
  }

  // 纵向: 检查首列底部是否有空白, 有则均分扩张并下移 (防止与横向扩张重叠).
  const col = grid.getColumn(0)
  const last = col[col.length - 1]!
  const bottomBorder = (last.y ?? 0) + (last.height ?? 0)
  const extraSpace = (graph.height ?? 0) - (bottomBorder + padding.bottom)
  const extraSpacePerNode = extraSpace / (col.length + 1)
  let accumulatedShift = 0
  if (bottomBorder + padding.bottom < (graph.height ?? 0)) {
    for (let i = 0; i < grid.getRows(); i++) {
      const row = grid.getRow(i)
      for (const node of row) {
        if (node === null) break
        node.y = (node.y ?? 0) + accumulatedShift
        node.height = (node.height ?? 0) + extraSpacePerNode
        accumulatedShift += extraSpacePerNode
      }
    }
  }
}
