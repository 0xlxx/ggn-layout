/**
 * spore 布局主入口 — ELK alg.spore OverlapRemovalLayoutProvider + ShrinkTreeLayoutProvider 0.12.0.
 *
 * sporeOverlapLayout (OverlapRemovalLayoutProvider):
 *   可选 underlying layout → importGraph (provider 强制 CENTER_NODE + INVERTED_OVERLAP
 *   + MINIMUM_SPANNING_TREE) → 迭代 (scanline 检测重叠 → Delaunay 三角剖分 →
 *   最小生成树 → GrowTree 消除重叠 → updateGraph), 直到无重叠或达 maxIterations.
 *
 * sporeCompactionLayout (ShrinkTreeLayoutProvider):
 *   可选 underlying layout → importGraph → shrink (vertices > 1 时:
 *   Delaunay → 生成树 (graph 策略) → 深度优先压缩) → applyPositions.
 *
 * 输出直接写回 ElkNode JSON (子节点位置 + 父节点尺寸), 边直线路由.
 */
import type { ElkNode } from '../api/elk-json.js'
import { boxLayout, fixedLayout, randomLayout } from '../api/core-providers.js'
import { stressLayout, forceLayout } from '../force/stress-layout.js'
import { rectPackingLayout } from '../rectpacking/rect-packing-layout.js'
import { topdownPackingLayout } from '../topdownpacking/topdown-packing-layout.js'
import { SporeElkGraphImporter } from './elk-graph-importer.js'
import type { ImportOverrides } from './elk-graph-importer.js'
import { delaunayTriangulationPhase } from './delaunay-triangulation-phase.js'
import { minSTPhase } from './minst-phase.js'
import { maxSTPhase } from './maxst-phase.js'
import { growTreePhase } from './grow-tree-phase.js'
import { shrinkTreeCompactionPhase } from './shrink-tree-compaction-phase.js'
import { findOverlapEdges } from './scanline-overlap-check.js'
import {
  UNDERLYING_LAYOUT_ALGORITHM, OVERLAP_REMOVAL_MAX_ITERATIONS, OVERLAP_REMOVAL_RUN_SCANLINE,
  optNum, optBool, jsonOpt, SpanningTreeCostFunction, RootSelection,
} from './options.js'
import { TreeConstructionStrategy } from './graph.js'

/**
 * sporeOverlap 布局 (org.eclipse.elk.sporeOverlap).
 * 直接操作 ElkNode JSON 子节点位置 (输入需带初始 position, 输出消除重叠后的位置).
 */
export function sporeOverlapLayout(elkGraph: ElkNode): ElkNode {
  runUnderlyingLayout(elkGraph)

  // provider 强制选项 (Java OverlapRemovalLayoutProvider.setProperty)
  const overrides: ImportOverrides = {
    rootSelection: RootSelection.CENTER_NODE,
    costFunction: SpanningTreeCostFunction.INVERTED_OVERLAP,
    treeConstruction: TreeConstructionStrategy.MINIMUM_SPANNING_TREE,
  }

  const importer = new SporeElkGraphImporter()
  const graph = importer.importGraph(elkGraph, overrides)

  const maxIterations = optNum(elkGraph, OVERLAP_REMOVAL_MAX_ITERATIONS)
  const runScanline = optBool(elkGraph, OVERLAP_REMOVAL_RUN_SCANLINE)

  let overlapsExisted = true
  let iteration = 0
  while (iteration < maxIterations && overlapsExisted) {
    // scanline 重叠检测
    if (runScanline) {
      const overlapEdges = findOverlapEdges(graph.vertices)
      if (overlapEdges.size === 0) break // 无重叠则无需继续
      graph.tEdges = overlapEdges
    }

    // 算法管线: P1 结构 → P2 处理序 → P3 执行
    delaunayTriangulationPhase(graph)
    minSTPhase(graph)
    growTreePhase(graph)

    // 更新节点位置 (originalVertex = rect 中心, 重置 tEdges/tree)
    importer.updateGraph(graph)

    overlapsExisted = graph.overlapsExisted
    iteration++
  }

  importer.applyPositions(graph)
  return elkGraph
}

/**
 * sporeCompaction 布局 (org.eclipse.elk.sporeCompaction, ShrinkTree).
 * 前置条件: 输入无重叠. 通过收缩生成树压缩布局间隙 (保持拓扑).
 */
export function sporeCompactionLayout(elkGraph: ElkNode): ElkNode {
  runUnderlyingLayout(elkGraph)

  const importer = new SporeElkGraphImporter()
  const graph = importer.importGraph(elkGraph)

  // shrink: 只有一个元素时不压缩 (Java ShrinkTree.shrink)
  if (graph.vertices.length > 1) {
    delaunayTriangulationPhase(graph)
    if (graph.treeConstructionStrategy === TreeConstructionStrategy.MAXIMUM_SPANNING_TREE) {
      maxSTPhase(graph)
    } else {
      minSTPhase(graph)
    }
    shrinkTreeCompactionPhase(graph)
  }

  importer.applyPositions(graph)
  return elkGraph
}

/**
 * 可选 underlying layout (Java provider: getAlgorithmDataBySuffix → 运行).
 * 仅支持已移植算法; 未知算法静默忽略 (Java lad == null 同).
 */
function runUnderlyingLayout(elkGraph: ElkNode): void {
  const alg = jsonOpt<unknown>(elkGraph, UNDERLYING_LAYOUT_ALGORITHM)
  if (alg === undefined || alg === null || String(alg).trim() === '') return
  const id = String(alg).trim()
  switch (normAlg(id)) {
    case 'box': boxLayout(elkGraph); return
    case 'fixed': fixedLayout(elkGraph); return
    case 'random': randomLayout(elkGraph); return
    case 'stress': stressLayout(elkGraph); return
    case 'force': forceLayout(elkGraph); return
    case 'rectpacking': rectPackingLayout(elkGraph); return
    case 'topdownpacking': topdownPackingLayout(elkGraph); return
    case 'layered':
    case 'sporeoverlap':
    case 'sporecompaction':
      throw new Error(`[spore] underlying layout algorithm '${id}' 未支持 (递归 layered/spore 未移植)`)
    default:
      // Java: LayoutMetaDataService.getAlgorithmDataBySuffix 未找到 → 忽略
      return
  }
}

/** 规范化算法 id (去前缀, 小写). */
function normAlg(a: string): string {
  return String(a).trim().toLowerCase().replace(/^org\.eclipse\.elk\./, '').replace(/^elk\./, '')
}
