/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * DisCoPolyominoCompactor — alg.disco.DisCoPolyominoCompactor (0.12.0).
 * 基于 Freivalds et al. (2002) 的连通分量布局: 各分量栅格化为低分辨率 polyomino,
 * 在网格上启发式打包, 再把偏移写回 DCComponent.
 */
import { KVector } from '../force/kvector.js'
import { Quadruple, ElkPadding } from './geometry.js'
import { DCPolyomino } from './structures/dc-polyomino.js'
import { Polyominoes } from './polyomino/polyominoes.js'
import { PolyominoCompactor } from './polyomino/polyomino-compactor.js'
import type { DCGraph } from './graph/dc-graph.js'
import { PlanarGrid } from './polyomino/planar-grid.js'
import {
  PADDING, optNum, optBool, optStr, optPadding, optAspectRatio,
  CompactionStrategy, LowLevelSortingCriterion, HighLevelSortingCriterion, TraversalStrategy,
} from './options.js'

/** ICompactor (alg.disco.ICompactor) — 设置各分量偏移与图尺寸. */
export interface ICompactor {
  compact(graph: DCGraph): void
}

export class DisCoPolyominoCompactor implements ICompactor {
  /** DCGraph 的空间单位数 (离散网格单格宽/高覆盖). */
  private gridCellSizeX = 0
  private gridCellSizeY = 0
  /** 网格单格大小上界, 100 取自论文建议. */
  private readonly upperBound = 100.0
  /** 待压缩图. */
  private cmpGraph: DCGraph | null = null
  /** 表示 DCGraph 各 DCComponent 的 polyomino 列表. */
  private polys: DCPolyomino[] = []
  /** 表示无限平面网格 ℕ x ℕ 的有限网格. */
  private grid: PlanarGrid | null = null
  /** 最终布局期望宽高比. */
  private aspectRatio: number | null = null
  /** 是否填充 polyomino 孔洞. */
  private fill = false

  compact(graph: DCGraph): void {
    // Initialization
    this.cmpGraph = graph
    this.polys = []

    // Computation of the ideal step size of the discrete grid in relation to the original graphs resolution.
    const gridCellRecommendation = this.computeCellSize(this.cmpGraph)
    this.gridCellSizeX = gridCellRecommendation
    this.gridCellSizeY = gridCellRecommendation

    this.fill = optBool(this.cmpGraph.layoutOptions, 'org.eclipse.elk.alg.common.compaction.polyomino.fill')
    this.aspectRatio = optAspectRatio(this.cmpGraph.layoutOptions) ?? 1.0

    if (this.aspectRatio > 1.0) {
      // Width greater than height
      this.gridCellSizeX *= this.aspectRatio
    } else {
      this.gridCellSizeY /= this.aspectRatio
    }

    // 1.) Convert DCComponents into polyominoes and generate a grid large enough to contain them all after
    // packing.
    this.createPolyominoes()
    // 2.) Do the actual layout of the polyominoes.
    this.packPolyominoes()

    // 3.) Apply layout back to the DCGraph
    this.applyToDCGraph()
  }

  /**
   * 计算 polyomino 网格最优步长 (论文方程):
   * (c*n-1)*l² - (Σ W_i + H_i) * l - (Σ W_i * H_i) = 0
   */
  private computeCellSize(graph: DCGraph): number {
    let sumTerm = 0.0
    let prodTerm = 0.0
    const comps = graph.getComponents()
    const numOfComps = comps.size

    for (const comp of comps) {
      const bounds = comp.getDimensionsOfBoundingRectangle()
      const width = bounds.x
      const height = bounds.y
      sumTerm += width + height
      prodTerm += width * height
    }

    // Numerator of positive solution of quadratic equation (the negative solution is is not interesting for us, as
    // step size should be positive)
    const four = 4.0
    const numerator = Math.sqrt(four * this.upperBound * numOfComps * prodTerm - four * prodTerm + sumTerm * sumTerm) + sumTerm
    const denominator = 2 * (this.upperBound * numOfComps - 1.0)

    // Shouldn't happen with reasonable values for parameter "bound", ignore denominator just in case
    if (denominator === 0.0) {
      return numerator
    }
    return numerator / denominator
  }

  /** 由全部 DCComponent 创建 DCPolyomino (前置: computeCellSize 已调用). */
  private createPolyominoes(): void {
    const comps = this.cmpGraph!.getComponents()
    for (const comp of comps) {
      const poly = new DCPolyomino(comp, this.gridCellSizeX, this.gridCellSizeY)
      this.polys.push(poly)
    }
  }

  /** 基于论文 PackPolyominoes 启发式, 把 polyomino 紧凑放置 (前置: createPolyominoes 已调用). */
  private packPolyominoes(): void {
    // Id is for debugging purposes only.
    let id = 0
    for (const poly of this.polys) {
      poly.setId(id)
      id++
    }

    // Use the more generic polyomino compactor which isn't restricted to components
    const lowLevelSort = optStr(this.cmpGraph!.layoutOptions, 'org.eclipse.elk.alg.common.compaction.polyomino.lowLevelSort',
      LowLevelSortingCriterion.BY_SIZE_AND_SHAPE)
    const highLevelSort = optStr(this.cmpGraph!.layoutOptions, 'org.eclipse.elk.alg.common.compaction.polyomino.highLevelSort',
      HighLevelSortingCriterion.NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST)
    const traversalStrategy = optStr(this.cmpGraph!.layoutOptions, 'org.eclipse.elk.alg.common.compaction.polyomino.traversalStrategy',
      TraversalStrategy.QUADRANTS_LINE_BY_LINE)
    const polyHolder = new Polyominoes(this.polys, this.aspectRatio!, this.fill, lowLevelSort, highLevelSort, traversalStrategy)
    new PolyominoCompactor().packPolyominoes(polyHolder)

    this.polys = polyHolder.getPolyominoes()
    this.grid = polyHolder.getGrid()
  }

  /**
   * 给 DCComponent 设置偏移: 新绝对位置 = 原坐标 + 偏移 (前置: packPolyominoes 已调用).
   */
  private applyToDCGraph(): void {
    // Crop base grid to the bounding box of all filled/marked cells.
    const gridCrop: Quadruple<number, number, number, number> = this.grid!.getFilledBounds()
    // Compute width and height of the minimum bounding box of the new layout and set the the dimensions of the
    // graph accordingly. The coordinates are thereby translated from the discrete integer coordinates of the low
    // resolution polyominoes back to the real coordinates of the DCGraph.
    const padding: ElkPadding = optPadding(this.cmpGraph!.layoutOptions)
    const paddingHori = padding.getHorizontal()
    const paddingVert = padding.getVertical()
    const parentWidth = (gridCrop.getThird() * this.gridCellSizeX) + paddingHori
    const parentHeight = (gridCrop.getFourth() * this.gridCellSizeY) + paddingVert
    this.cmpGraph!.setDimensions(new KVector(parentWidth, parentHeight))

    for (const poly of this.polys) {
      // Compute the position of the upper left corner of each polyomino relative to the upper left corner of the
      // bounding box of all filled/marked cells of the base grid.
      const absoluteIntPositionX = poly.getX() - gridCrop.getFirst()
      const absoluteIntPositionY = poly.getY() - gridCrop.getSecond()

      // Compute new position of DCComponent (KVector.scale(x, y) 双参, 原地)
      const absolutePositionOnCanvas = new KVector(absoluteIntPositionX, absoluteIntPositionY)
      absolutePositionOnCanvas.x *= poly.getCellSizeX()
      absolutePositionOnCanvas.y *= poly.getCellSizeY()
      absolutePositionOnCanvas.add(poly.getOffset())
      // Get original coordinates of DCComponent (These will not be updated, as so far all classes implementing
      // the IGraphTransformer only use the offsets of the components to layout their underlying graph structures.
      const originalCoordinates = poly.getRepresentee().getMinCorner()
      // Set offset of new position relative to the original position of the component
      poly.getRepresentee().setOffset(absolutePositionOnCanvas.sub(originalCoordinates))
    }
  }
}

// 保留: CompactionStrategy 为选项类型 (只有 POLYOMINO 一种实现).
export type { CompactionStrategy }
export { PADDING, optNum }
