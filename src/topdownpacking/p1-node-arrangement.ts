/**
 * P1 节点放置 (ELK alg.topdownpacking LeftRightTopDownNodePlacer).
 *
 * 按「正方形网格 + 移除底部空行」决定行列数 (cols = ceil(sqrt(n))), 从左到右、从上到下
 * 放置子节点. 所有子节点尺寸统一为父节点指定的 topdown.hierarchicalNodeWidth ×
 * (width / hierarchicalNodeAspectRatio) — 尺寸由父节点预知, 这是 topdown 布局的语义.
 * 随后父节点尺寸取 max(当前, 预测尺寸) (standalone 用法必须).
 */
import type { ElkNode } from '../api/elk-json.js'
import type { Grid } from './grid.js'
import {
  SPACING_NODE_NODE, TOPDOWN_HIERARCHICAL_NODE_ASPECT_RATIO, TOPDOWN_HIERARCHICAL_NODE_WIDTH,
  optNum, optPadding,
} from './options.js'

/** 预测图尺寸 (Java getPredictedSize): 不计算布局, 直接由行列数 + 选项推算. */
export function getPredictedSize(graph: ElkNode): { x: number; y: number } {
  const numberOfChildren = (graph.children ?? []).length
  const padding = optPadding(graph)
  const nodeNodeSpacing = optNum(graph, SPACING_NODE_NODE)
  const hierarchicalNodeWidth = optNum(graph, TOPDOWN_HIERARCHICAL_NODE_WIDTH)
  const hierarchicalNodeAspectRatio = optNum(graph, TOPDOWN_HIERARCHICAL_NODE_ASPECT_RATIO)

  const cols = Math.ceil(Math.sqrt(numberOfChildren))
  const requiredWidth = cols * hierarchicalNodeWidth
    + padding.left + padding.right + (cols - 1) * nodeNodeSpacing
  const rows = numberOfChildren > cols * cols - cols || cols === 0 ? cols : cols - 1
  const requiredHeight = rows * hierarchicalNodeWidth / hierarchicalNodeAspectRatio
    + padding.top + padding.bottom + (rows - 1) * nodeNodeSpacing
  return { x: requiredWidth, y: requiredHeight }
}

/** 子节点数量 → 网格列数 (Java: ceil(sqrt(n)); n=0 → 0). */
function computeCols(numberOfChildren: number): number {
  return Math.ceil(Math.sqrt(numberOfChildren))
}

/** 子节点数量 → 网格行数 (Java: N > W²-W 或 W=0 → W, 否则 W-1). */
function computeRows(numberOfChildren: number, cols: number): number {
  return numberOfChildren > cols * cols - cols || cols === 0 ? cols : cols - 1
}

/** P1: 放置子节点到网格并定型父节点尺寸 (Java LeftRightTopDownNodePlacer.process). */
export function leftRightTopDownNodePlacer(graph: ElkNode, grid: Grid<ElkNode>): void {
  const padding = optPadding(graph)
  const nodeNodeSpacing = optNum(graph, SPACING_NODE_NODE)

  // standalone 用法: 图尺寸未设则现在设置 (预测尺寸).
  const graphSize = getPredictedSize(graph)
  graph.width = Math.max(graph.width ?? 0, graphSize.x)
  graph.height = Math.max(graph.height ?? 0, graphSize.y)

  const nodes = [...(graph.children ?? [])]
  const cols = computeCols(nodes.length)
  const rows = computeRows(nodes.length, cols)
  grid.setGridSize(cols, rows)

  // 父节点预知的层级节点尺寸 (topdown 布局契约).
  const desiredNodeWidth = optNum(graph, TOPDOWN_HIERARCHICAL_NODE_WIDTH)
  const aspectRatio = optNum(graph, TOPDOWN_HIERARCHICAL_NODE_ASPECT_RATIO)

  let currX = padding.left
  let currY = padding.top
  let currentCol = 0
  let currentRow = 0

  for (const node of nodes) {
    node.width = desiredNodeWidth
    node.height = desiredNodeWidth / aspectRatio
    node.x = currX
    node.y = currY
    grid.put(currentCol, currentRow, node)

    currX += node.width + nodeNodeSpacing
    currentCol += 1

    // 尺寸已预计算, 换行后一切正好放下.
    if (currentCol >= cols) {
      currX = padding.left
      currY += desiredNodeWidth / aspectRatio + nodeNodeSpacing
      currentCol = 0
      currentRow += 1
    }
  }
}
