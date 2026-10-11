/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * Phase 1: 宽度近似 (ELK alg.rectpacking.p1widthapproximation).
 *
 * GreedyWidthApproximator (默认): AreaApproximation 用贪心策略把矩形逐个放入
 * 4 种候选位置 (LPR/LPB/WDR/WDB), 按 OptimizationGoal 过滤出最优, 得到近似宽度.
 * TargetWidthWidthApproximator: 直接使用 widthApproximation.targetWidth 选项.
 */
import type { ElkNode } from '../api/elk-json.js'
import {
  ASPECT_RATIO, WIDTH_APPROXIMATION_OPTIMIZATION_GOAL, WIDTH_APPROXIMATION_LAST_PLACE_SHIFT,
  WIDTH_APPROXIMATION_STRATEGY, WIDTH_APPROXIMATION_TARGET_WIDTH, SPACING_NODE_NODE,
  OptimizationGoal, WidthApproximationStrategy,
  optNum, optStr, optBool, optPadding, jsonOpt, type ElkPadding,
} from './options.js'
import { DrawingData, DrawingDataDescriptor, DrawingUtil, type InternalProperties } from './util.js'

// ── Calculations (p1widthapproximation/Calculations.java) ──
const Calculations = {
  getWidthLPRorLPB(drawingWidth: number, x: number, width: number): number {
    return Math.max(drawingWidth, x + width)
  },
  getHeightLPRorLPB(drawingHeight: number, y: number, height: number): number {
    return Math.max(drawingHeight, y + height)
  },
  /** LPR 时矩形右移后的 y (找最近上邻居的底边 + spacing). */
  calculateYforLPR(x: number, placedRects: ElkNode[], lastPlaced: ElkNode, nodeNodeSpacing: number): number {
    let closestUpperNeighbor: ElkNode | null = null
    let closestNeighborBottomBorder = 0
    for (const placedRect of placedRects) {
      const placedRectBottomBorder = (placedRect.y ?? 0) + (placedRect.height ?? 0)
      if (this.verticalOrderConstraint(placedRect, x, nodeNodeSpacing)) {
        if (closestUpperNeighbor === null) {
          closestUpperNeighbor = placedRect
        } else if ((lastPlaced.y ?? 0) - placedRectBottomBorder < (lastPlaced.y ?? 0) - closestNeighborBottomBorder) {
          closestUpperNeighbor = placedRect
        }
        closestNeighborBottomBorder = (closestUpperNeighbor.y ?? 0) + (closestUpperNeighbor.height ?? 0)
      }
    }
    if (closestUpperNeighbor === null) return 0
    return closestNeighborBottomBorder + nodeNodeSpacing
  },
  /** LPB 时矩形下移后的 x (找最近左邻居的右边 + spacing). */
  calculateXforLPB(y: number, placedRects: ElkNode[], lastPlaced: ElkNode, nodeNodeSpacing: number): number {
    let closestLeftNeighbour: ElkNode | null = null
    let closestNeighborRightBorder = 0
    for (const placedRect of placedRects) {
      const placedRectRightBorder = (placedRect.x ?? 0) + (placedRect.width ?? 0)
      if (this.horizontalOrderConstraint(placedRect, y, nodeNodeSpacing)) {
        if (closestLeftNeighbour === null) {
          closestLeftNeighbour = placedRect
        } else if ((lastPlaced.x ?? 0) - placedRectRightBorder < (lastPlaced.x ?? 0) - closestNeighborRightBorder) {
          closestLeftNeighbour = placedRect
        }
        closestNeighborRightBorder = (closestLeftNeighbour.x ?? 0) + (closestLeftNeighbour.width ?? 0)
      }
    }
    if (closestLeftNeighbour === null) return 0
    return closestNeighborRightBorder + nodeNodeSpacing
  },
  /** LPR 特例面积 (最后放置 + 待放置矩形). */
  calculateAreaLPR(lastPlaced: ElkNode, toPlace: ElkNode, lprOpt: DrawingData): number {
    const lastPlacedBottomBorder = (lastPlaced.y ?? 0) + (lastPlaced.height ?? 0)
    const toPlaceBottomBorder = lprOpt.getNextYcoordinate() + (toPlace.height ?? 0)
    const maxYLPR = Math.max(lastPlacedBottomBorder, toPlaceBottomBorder)
    const heightLPR = maxYLPR - Math.min(lastPlaced.y ?? 0, lprOpt.getNextYcoordinate())
    const widthLPR = lprOpt.getNextXcoordinate() + (toPlace.width ?? 0) - (lastPlaced.x ?? 0)
    return widthLPR * heightLPR
  },
  calculateAreaLPB(lastPlaced: ElkNode, toPlace: ElkNode, lpbOpt: DrawingData): number {
    const lastPlacedRightBorder = (lastPlaced.x ?? 0) + (lastPlaced.width ?? 0)
    const toPlaceRightBorder = lpbOpt.getNextXcoordinate() + (toPlace.width ?? 0)
    const maxXLPB = Math.max(lastPlacedRightBorder, toPlaceRightBorder)
    const widthLPB = maxXLPB - Math.min(lastPlaced.x ?? 0, lpbOpt.getNextXcoordinate())
    const heightLPB = lpbOpt.getNextYcoordinate() + (toPlace.height ?? 0) - (lastPlaced.y ?? 0)
    return widthLPB * heightLPB
  },
  verticalOrderConstraint(placedRect: ElkNode, x: number, nodeNodeSpacing: number): boolean {
    return x < (placedRect.x ?? 0) + (placedRect.width ?? 0) + nodeNodeSpacing
  },
  horizontalOrderConstraint(placedRect: ElkNode, yCoordRectToPlace: number, nodeNodeSpacing: number): boolean {
    return yCoordRectToPlace < (placedRect.y ?? 0) + (placedRect.height ?? 0) + nodeNodeSpacing
  },
}

// ── 过滤器 (strategy pattern, 顺序由 OptimizationGoal 决定) ──
type BestCandidateFilter = (candidates: DrawingData[], aspectRatio: number, padding: ElkPadding) => DrawingData[]

/** 保留最小面积候选 (Java AreaFilter). */
const areaFilter: BestCandidateFilter = (candidates, _aspectRatio, padding) => {
  let minArea = Number.POSITIVE_INFINITY
  for (const opt of candidates) {
    minArea = Math.min(minArea, (opt.getDrawingWidth() + padding.left + padding.right)
      * (opt.getDrawingHeight() + padding.top + padding.bottom))
  }
  return candidates.filter((c) => (c.getDrawingWidth() + padding.left + padding.right)
    * (c.getDrawingHeight() + padding.top + padding.bottom) === minArea)
}

/** 保留宽高比最接近期望的候选 (Java AspectRatioFilter). */
const aspectRatioFilter: BestCandidateFilter = (candidates, aspectRatio, padding) => {
  let smallestDeviation = Number.POSITIVE_INFINITY
  for (const opt of candidates) {
    smallestDeviation = Math.min(smallestDeviation,
      Math.abs(((opt.getDrawingWidth() + padding.left + padding.right)
        / (opt.getDrawingHeight() + padding.top + padding.bottom)) - aspectRatio))
  }
  return candidates.filter((c) =>
    Math.abs(((c.getDrawingWidth() + padding.left + padding.right)
      / (c.getDrawingHeight() + padding.top + padding.bottom)) - aspectRatio) === smallestDeviation)
}

/** 保留最大 scale measure 候选 (Java ScaleMeasureFilter). */
const scaleMeasureFilter: BestCandidateFilter = (candidates, _aspectRatio, padding) => {
  let maxScale = Number.NEGATIVE_INFINITY
  for (const opt of candidates) {
    maxScale = Math.max(maxScale, DrawingUtil.computeScaleMeasure(
      opt.getDrawingWidth() + padding.left + padding.right,
      opt.getDrawingHeight() + padding.top + padding.bottom,
      opt.getDesiredAspectRatio()))
  }
  return candidates.filter((c) => DrawingUtil.computeScaleMeasure(
    c.getDrawingWidth() + padding.left + padding.right,
    c.getDrawingHeight() + padding.top + padding.bottom,
    c.getDesiredAspectRatio()) === maxScale)
}

// ── AreaApproximation (p1widthapproximation/AreaApproximation.java) ──
export class AreaApproximation {
  private readonly aspectRatio: number
  private readonly goal: OptimizationGoal
  private readonly lpShift: boolean

  constructor(aspectRatio: number, goal: OptimizationGoal, lpShift: boolean) {
    this.aspectRatio = aspectRatio
    this.goal = goal
    this.lpShift = lpShift
  }

  /** 计算近似 bounding box 并设置矩形坐标 (Java approxBoundingBox). */
  approxBoundingBox(rectangles: ElkNode[], nodeNodeSpacing: number, padding: ElkPadding): DrawingData {
    const firstRect = rectangles[0]!
    firstRect.x = 0
    firstRect.y = 0
    const placedRects: ElkNode[] = [firstRect]
    let lastPlaced = firstRect
    let currentValues = new DrawingData(this.aspectRatio, firstRect.width ?? 0, firstRect.height ?? 0,
      DrawingDataDescriptor.WHOLE_DRAWING)

    for (let rectangleIdx = 1; rectangleIdx < rectangles.length; rectangleIdx++) {
      const toPlace = rectangles[rectangleIdx]!
      const opt1 = this.calcValuesForOpt(DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT, toPlace,
        lastPlaced, currentValues, placedRects, nodeNodeSpacing)
      const opt2 = this.calcValuesForOpt(DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_BELOW, toPlace,
        lastPlaced, currentValues, placedRects, nodeNodeSpacing)
      const opt3 = this.calcValuesForOpt(DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_RIGHT, toPlace,
        lastPlaced, currentValues, placedRects, nodeNodeSpacing)
      const opt4 = this.calcValuesForOpt(DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_BELOW, toPlace,
        lastPlaced, currentValues, placedRects, nodeNodeSpacing)

      const bestOpt = this.findBestCandidate(opt1, opt2, opt3, opt4, toPlace, lastPlaced, padding)
      toPlace.x = bestOpt.getNextXcoordinate()
      toPlace.y = bestOpt.getNextYcoordinate()
      bestOpt.setPlacementOption(DrawingDataDescriptor.WHOLE_DRAWING)
      currentValues = bestOpt
      lastPlaced = toPlace
      placedRects.push(toPlace)
    }
    return currentValues
  }

  /** 按 goal 顺序过滤候选; 1 个返回, 2 个走特例判定 (Java findBestCandidate). */
  private findBestCandidate(opt1: DrawingData, opt2: DrawingData, opt3: DrawingData, opt4: DrawingData,
    toPlace: ElkNode, lastPlaced: ElkNode, padding: ElkPadding): DrawingData {
    let candidates: DrawingData[] = [opt1, opt2, opt3, opt4]
    let filters: BestCandidateFilter[] = []
    switch (this.goal) {
      case OptimizationGoal.MAX_SCALE_DRIVEN:
        filters = [scaleMeasureFilter, areaFilter, aspectRatioFilter]
        break
      case OptimizationGoal.ASPECT_RATIO_DRIVEN:
        filters = [aspectRatioFilter, areaFilter, scaleMeasureFilter]
        break
      case OptimizationGoal.AREA_DRIVEN:
        filters = [areaFilter, scaleMeasureFilter, aspectRatioFilter]
        break
      default:
    }
    for (const filter of filters) {
      if (candidates.length > 1) {
        candidates = filter(candidates, this.aspectRatio, padding)
      }
    }
    if (candidates.length === 1) {
      return candidates[candidates.length - 1]!
    }
    if (candidates.length === 2) {
      return this.checkSpecialCases(candidates[0]!, candidates[1]!, lastPlaced, toPlace)
    }
    throw new Error('[rectpacking] no best candidate found')
  }

  /** 两个候选在全部基准下相等时的特例判定 (Java checkSpecialCases). */
  private checkSpecialCases(drawing1: DrawingData, drawing2: DrawingData,
    lastPlaced: ElkNode, toPlace: ElkNode): DrawingData {
    const firstOpt = drawing1.getPlacementOption()
    const secondOpt = drawing2.getPlacementOption()

    const firstOptLPBorCDB = (firstOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_BELOW
      || firstOpt === DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_BELOW)
    const secondOptLPBorCDB = (secondOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_BELOW
      || secondOpt === DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_BELOW)
    const firstOptLPRorCDR = (firstOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT
      || firstOpt === DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_RIGHT)
    const secondOptLPRorCDR = (secondOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT
      || secondOpt === DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_RIGHT)
    const firstOptLPRorLPB = (firstOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT
      || firstOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_BELOW)
    const secondOptLPRorLPB = (secondOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT
      || secondOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_BELOW)

    if (firstOptLPBorCDB && secondOptLPBorCDB) {
      // LPB 与 WDB 同值 → 取 WDB.
      if (drawing1.getPlacementOption() === DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_BELOW) {
        return drawing1
      }
      return drawing2
    } else if (firstOptLPRorCDR && secondOptLPRorCDR) {
      // LPR 与 WDR 同值 → 取 WDR.
      if (drawing1.getPlacementOption() === DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_RIGHT) {
        return drawing1
      }
      return drawing2
    } else if (firstOptLPRorLPB && secondOptLPRorLPB) {
      // LPR 与 LPB 同值 → 取两者面积更小的.
      let lprOpt: DrawingData
      let lpbOpt: DrawingData
      if (firstOpt === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT) {
        lprOpt = drawing1
        lpbOpt = drawing2
      } else {
        lprOpt = drawing2
        lpbOpt = drawing1
      }
      const areaLPR = Calculations.calculateAreaLPR(lastPlaced, toPlace, lprOpt)
      const areaLPB = Calculations.calculateAreaLPB(lastPlaced, toPlace, lpbOpt)
      if (areaLPR <= areaLPB) {
        if (drawing1.getPlacementOption() === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT) {
          return drawing1
        }
        return drawing2
      }
      if (drawing1.getPlacementOption() === DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_BELOW) {
        return drawing1
      }
      return drawing2
    }
    return drawing1
  }

  /** 计算某候选位置的图形数据 (Java calcValuesForOpt). */
  private calcValuesForOpt(option: DrawingDataDescriptor, toPlace: ElkNode, lastPlaced: ElkNode,
    drawing: DrawingData, placedRects: ElkNode[], nodeNodeSpacing: number): DrawingData {
    let x = 0
    let y = 0
    const drawingWidth = drawing.getDrawingWidth()
    const drawingHeight = drawing.getDrawingHeight()
    const heightToPlace = toPlace.height ?? 0
    const widthToPlace = toPlace.width ?? 0

    let width: number
    let height: number
    switch (option) {
      case DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_RIGHT:
        x = (lastPlaced.x ?? 0) + (lastPlaced.width ?? 0) + nodeNodeSpacing
        if (this.lpShift) {
          y = Calculations.calculateYforLPR(x, placedRects, lastPlaced, nodeNodeSpacing)
        } else {
          y = lastPlaced.y ?? 0
        }
        width = Calculations.getWidthLPRorLPB(drawingWidth, x, widthToPlace)
        height = Calculations.getHeightLPRorLPB(drawingHeight, y, heightToPlace)
        break
      case DrawingDataDescriptor.CANDIDATE_POSITION_LAST_PLACED_BELOW:
        y = (lastPlaced.y ?? 0) + (lastPlaced.height ?? 0) + nodeNodeSpacing
        if (this.lpShift) {
          x = Calculations.calculateXforLPB(y, placedRects, lastPlaced, nodeNodeSpacing)
        } else {
          x = lastPlaced.x ?? 0
        }
        width = Calculations.getWidthLPRorLPB(drawingWidth, x, widthToPlace)
        height = Calculations.getHeightLPRorLPB(drawingHeight, y, heightToPlace)
        break
      case DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_RIGHT:
        x = drawingWidth + nodeNodeSpacing
        y = 0
        width = drawingWidth + nodeNodeSpacing + widthToPlace
        height = Math.max(drawingHeight, heightToPlace)
        break
      case DrawingDataDescriptor.CANDIDATE_POSITION_WHOLE_DRAWING_BELOW:
        x = 0
        y = drawingHeight + nodeNodeSpacing
        width = Math.max(drawingWidth, widthToPlace)
        height = drawingHeight + nodeNodeSpacing + heightToPlace
        break
      default:
        throw new Error('[rectpacking] IllegalPlacementOption')
    }
    return new DrawingData(this.aspectRatio, width, height, option, x, y)
  }
}

// ── WidthApproximationStrategy 工厂 (Java) ──
export function runWidthApproximation(graph: ElkNode, ctx: InternalProperties, rectangles: ElkNode[]): void {
  const strategy = optStr<WidthApproximationStrategy>(graph, WIDTH_APPROXIMATION_STRATEGY, WidthApproximationStrategy.GREEDY)
  switch (strategy) {
    case WidthApproximationStrategy.GREEDY: {
      const aspectRatio = optNum(graph, ASPECT_RATIO)
      const padding = optPadding(graph)
      const goal = optStr(graph, WIDTH_APPROXIMATION_OPTIMIZATION_GOAL, OptimizationGoal.MAX_SCALE_DRIVEN)
      const lastPlaceShift = optBool(graph, WIDTH_APPROXIMATION_LAST_PLACE_SHIFT, true)
      const nodeNodeSpacing = optNum(graph, SPACING_NODE_NODE)
      DrawingUtil.resetCoordinates(rectangles)
      const firstIt = new AreaApproximation(aspectRatio, goal, lastPlaceShift)
      const drawing = firstIt.approxBoundingBox(rectangles, nodeNodeSpacing, padding)
      ctx.targetWidth = drawing.getDrawingWidth()
      break
    }
    case WidthApproximationStrategy.TARGET_WIDTH: {
      // Java TargetWidthWidthApproximator: hasProperty 检查 → 未设置抛异常.
      if (jsonOpt<unknown>(graph, WIDTH_APPROXIMATION_TARGET_WIDTH) !== undefined
        && jsonOpt<unknown>(graph, WIDTH_APPROXIMATION_TARGET_WIDTH) !== null) {
        ctx.targetWidth = optNum(graph, WIDTH_APPROXIMATION_TARGET_WIDTH)
      } else {
        throw new Error('[rectpacking] A target width has to be set if the TargetWidthWidthApproximator should be used.')
      }
      break
    }
    default:
      throw new Error(`[rectpacking] no implementation for width approximator ${strategy}`)
  }
}

