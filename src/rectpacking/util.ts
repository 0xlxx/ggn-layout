/**
 * rectpacking 内部数据结构 (ELK alg.rectpacking.util).
 *
 * - DrawingDataDescriptor / DrawingData: 候选摆放 (LPR/LPB/WDR/WDB) 的图数据.
 * - DrawingUtil: scale measure / 坐标重置 / 尺寸计算.
 * - InternalProperties: 算法内部状态 (TARGET_WIDTH/MIN_WIDTH/DRAWING_WIDTH/ROWS 等),
 *   用 per-run Map 承载 (Java 存在 ElkNode property 上).
 */
import type { ElkNode } from '../api/elk-json.js'
import type { RectRow } from './rect-row.js'

// ── DrawingDataDescriptor (util/DrawingDataDescriptor.java) ──
export enum DrawingDataDescriptor {
  /** 放在最近放置矩形右侧. */
  CANDIDATE_POSITION_LAST_PLACED_RIGHT = 'CANDIDATE_POSITION_LAST_PLACED_RIGHT',
  /** 放在最近放置矩形下方. */
  CANDIDATE_POSITION_LAST_PLACED_BELOW = 'CANDIDATE_POSITION_LAST_PLACED_BELOW',
  /** 放在整个图形右侧. */
  CANDIDATE_POSITION_WHOLE_DRAWING_RIGHT = 'CANDIDATE_POSITION_WHOLE_DRAWING_RIGHT',
  /** 放在整个图形下方. */
  CANDIDATE_POSITION_WHOLE_DRAWING_BELOW = 'CANDIDATE_POSITION_WHOLE_DRAWING_BELOW',
  /** 表示真实图形而非候选摆放. */
  WHOLE_DRAWING = 'WHOLE_DRAWING',
}

// ── DrawingData (util/DrawingData.java) ──
export class DrawingData {
  private scaleMeasure = 0
  private drawingWidth: number
  private drawingHeight: number
  private area = 0
  private aspectRatio = 0
  private readonly dar: number
  private placementOption: DrawingDataDescriptor
  private nextXcoordinate: number
  private nextYcoordinate: number

  constructor(dar: number, drawingWidth: number, drawingHeight: number,
    placementOption: DrawingDataDescriptor, nextXcoord = 0, nextYcoord = 0) {
    this.dar = dar
    this.drawingWidth = drawingWidth
    this.drawingHeight = drawingHeight
    this.placementOption = placementOption
    this.nextXcoordinate = nextXcoord
    this.nextYcoordinate = nextYcoord
    this.calcAreaAspectRatioScaleMeasure()
  }

  /** Java: 仅当宽高均 > 0 时计算 area/aspectRatio/scaleMeasure, 否则保持 0. */
  private calcAreaAspectRatioScaleMeasure(): void {
    if (this.drawingWidth > 0 && this.drawingHeight > 0) {
      this.area = this.drawingWidth * this.drawingHeight
      this.aspectRatio = this.drawingWidth / this.drawingHeight
      this.scaleMeasure = DrawingUtil.computeScaleMeasure(this.drawingWidth, this.drawingHeight, this.dar)
    }
  }

  getScaleMeasure(): number { return this.scaleMeasure }
  getArea(): number { return this.area }
  getAspectRatio(): number { return this.aspectRatio }
  getPlacementOption(): DrawingDataDescriptor { return this.placementOption }
  setPlacementOption(placementOption: DrawingDataDescriptor): void { this.placementOption = placementOption }
  getNextXcoordinate(): number { return this.nextXcoordinate }
  setNextXcoordinate(potentialX: number): void { this.nextXcoordinate = potentialX }
  getNextYcoordinate(): number { return this.nextYcoordinate }
  setNextYcoordinate(potentialY: number): void { this.nextYcoordinate = potentialY }
  getDesiredAspectRatio(): number { return this.dar }
  getDrawingWidth(): number { return this.drawingWidth }
  setDrawingWidth(drawingWidth: number): void { this.drawingWidth = drawingWidth; this.calcAreaAspectRatioScaleMeasure() }
  getDrawingHeight(): number { return this.drawingHeight }
  setDrawingHeight(drawingHeight: number): void { this.drawingHeight = drawingHeight; this.calcAreaAspectRatioScaleMeasure() }
}

// ── DrawingUtil (util/DrawingUtil.java) ──
export const DrawingUtil = {
  /** 根据期望宽高比计算 scale measure (min(dar/width, 1/height)). */
  computeScaleMeasure(width: number, height: number, dar: number): number {
    return Math.min(dar / width, 1 / height)
  },

  /** 重置所有坐标到 (0,0) (ELK DrawingUtil.resetCoordinates). */
  resetCoordinates(graph: ElkNode[]): void {
    for (const node of graph) {
      node.x = 0
      node.y = 0
    }
  },

  /** 计算行列表的 max 宽 + 行高累加 (nodeNodeSpacing 已在行宽内, 首行不加). */
  calculateDimensionsRows(rows: RectRow[], nodeNodeSpacing: number): { x: number; y: number } {
    let maxWidth = 0
    let newHeight = 0
    let index = 0
    for (const row of rows) {
      maxWidth = Math.max(maxWidth, row.getWidth())
      newHeight += row.getHeight() + (index > 0 ? nodeNodeSpacing : 0)
      index++
    }
    return { x: maxWidth, y: newHeight }
  },

  /** 计算矩形列表的 max (x+width, y+height). */
  calculateDimensions(rectangles: ElkNode[]): { x: number; y: number } {
    let maxWidth = 0
    let maxHeight = 0
    for (const node of rectangles) {
      maxWidth = Math.max((node.width ?? 0) + (node.x ?? 0), maxWidth)
      maxHeight = Math.max((node.height ?? 0) + (node.y ?? 0), maxHeight)
    }
    return { x: maxWidth, y: maxHeight }
  },
}

// ── InternalProperties (options/InternalProperties.java) ──
/** 算法内部状态容器 (Java: ElkNode property; TS: 每次布局 run 一个). */
export class InternalProperties {
  additionalHeight = 0
  drawingHeight = 0
  drawingWidth = 0
  minHeight = 0
  minWidth = 0
  rows: RectRow[] = []
  targetWidth = 0
  minRowIncrease = 0
  maxRowIncrease = 0
  minRowDecrease = 0
  maxRowDecrease = 0
}
