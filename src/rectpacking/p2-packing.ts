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
 * Phase 2: 装箱 (ELK alg.rectpacking.p2packing).
 *
 * - InitialPlacement: 把矩形按 targetWidth 分成行/块 (相似高度归入同块).
 * - Compaction: 行内/跨行压缩 — 块吸收、堆叠 (placeBelow)、并排 (placeBeside)、行高利用.
 * - RowFillingAndCompaction: 主循环 (初始放置 → 逐行压缩 → 尺寸计算).
 * - Compactor: COMPACTION 策略 (支持多次迭代); SimplePlacement: SIMPLE; NoPlacement: NONE.
 */
import type { ElkNode } from '../api/elk-json.js'
import {
  ASPECT_RATIO, SPACING_NODE_NODE, PACKING_STRATEGY, PACKING_COMPACTION_ITERATIONS,
  PACKING_COMPACTION_ROW_HEIGHT_REEVALUATION, IN_NEW_ROW, PackingStrategy,
  optNum, optStr, optBool, optPadding, type ElkPadding,
} from './options.js'
import { DrawingData, DrawingDataDescriptor, DrawingUtil, type InternalProperties } from './util.js'
import { Block } from './block.js'
import { BlockStack } from './block-stack.js'
import { RectRow } from './rect-row.js'

// ── InitialPlacement (p2packing/InitialPlacement.java) ──
const InitialPlacement = {
  /** 把矩形按 boundingWidth 排成 RectRow (Java place). */
  place(rectangles: ElkNode[], boundingWidth: number, nodeNodeSpacing: number, rowHeightReevaluation: boolean): RectRow[] {
    const rows: RectRow[] = []
    let row = new RectRow(0, nodeNodeSpacing)
    let drawingHeight = 0
    row.addBlock(new Block(0, 0, row, nodeNodeSpacing))
    let currentWidth = 0

    for (const rect of rectangles) {
      let block = row.getLastBlock()
      const potentialRowWidth = currentWidth + (rect.width ?? 0)
        + (row.getChildren()[0]!.getChildren().length === 0 ? 0 : nodeNodeSpacing)
      if (potentialRowWidth > boundingWidth || rectInNewRow(rect)) {
        currentWidth = 0
        drawingHeight += row.getHeight() + nodeNodeSpacing
        rows.push(row)
        row = new RectRow(drawingHeight, nodeNodeSpacing)
        block = new Block(0, row.getY(), row, nodeNodeSpacing)
        row.addBlock(block)
        currentWidth = 0
      }

      if (block.getChildren().length === 0
        || (!rowHeightReevaluation && isSimilarHeight(block, rect, nodeNodeSpacing))) {
        block.addChild(rect)
      } else {
        const newBlock = new Block(block.getX() + block.getWidth() + nodeNodeSpacing, row.getY(), row, nodeNodeSpacing)
        row.addBlock(newBlock)
        newBlock.addChild(rect)
      }
      currentWidth = (rect.x ?? 0) + (rect.width ?? 0)
    }
    rows.push(row)
    return rows
  },

  /** 尝试把矩形放入块 (Java placeRectInBlock): 同行尾或块内新行. */
  placeRectInBlock(row: RectRow, block: Block, rect: ElkNode, boundingWidth: number, nodeNodeSpacing: number): boolean {
    if (isSimilarHeight(block, rect, nodeNodeSpacing)) {
      if (block.getLastRowNewX() + (rect.width ?? 0) + nodeNodeSpacing <= boundingWidth
        && (block.getLastRowY() - row.getY() + (rect.height ?? 0) <= row.getHeight() || row.getChildren().length === 1)) {
        block.addChild(rect)
        return true
      } else if (block.getX() + (rect.width ?? 0) <= boundingWidth
        && (block.getY() + block.getHeight() + (rect.height ?? 0) + nodeNodeSpacing <= row.getY() + row.getHeight())) {
        block.addChildInNewRow(rect)
        return true
      }
    }
    return false
  },
}

/** 矩形高度与块内高度相近 (Java isSimilarHeight). */
function isSimilarHeight(block: Block, rect: ElkNode, _nodeNodeSpacing: number): boolean {
  const h = rect.height ?? 0
  if (h >= block.getSmallestRectHeight() && h <= block.getMinHeight()) {
    return true
  }
  return block.getAverageHeight() * 0.5 <= h && block.getAverageHeight() * 1.5 >= h
}

/** 读取 inNewRow 选项 (Java rect.getProperty(IN_NEW_ROW)). */
function rectInNewRow(rect: ElkNode): boolean {
  return optBool(rect, IN_NEW_ROW, false)
}

// ── Compaction (p2packing/Compaction.java) ──
const Compaction = {
  /**
   * 压缩给定行 (Java compact). 返回 { somethingWasChanged, compactRowAgain }.
   * compactRowAgain=true 表示下一块主导行高 → 需要重排当前行.
   */
  compact(rowIdx: number, rows: RectRow[], boundingWidth: number, nodeNodeSpacing: number,
    rowHeightReevaluation: boolean): { somethingWasChanged: boolean; compactRowAgain: boolean } {
    let somethingWasChanged = false
    let compactRowAgain = false
    const nextRowIndex = rowIdx + 1
    const row = rows[rowIdx]!
    const blocks = row.getChildren()
    let currentStack: BlockStack | null = null

    for (let blockId = 0; blockId < row.getNumberOfAssignedBlocks(); blockId++) {
      const block = blocks[blockId]!
      if (block.isFixed()) {
        continue
      }
      if (block.getChildren().length === 0) {
        row.removeBlock(block)
        blockId--
        somethingWasChanged = true
        continue
      }

      // 前面块变化后, 把可移动块放到新位置 (形成 stack).
      if (!block.isPositionFixed()) {
        if (currentStack !== null) {
          currentStack.updateDimension()
        }
        currentStack = new BlockStack(
          currentStack === null ? 0 : currentStack.getX() + currentStack.getWidth() + nodeNodeSpacing,
          row.getY(), nodeNodeSpacing)
        block.setLocation(currentStack.getX() + currentStack.getWidth(), row.getY())
        row.getStacks().push(currentStack)
        currentStack.addBlock(block)
        block.setPositionFixed(true)
      }

      // Optimization 1: 下一块能否放我上面/旁边/合并.
      let nextBlock: Block | null = null
      nextBlock = getNextBlock(rows, row, blockId, nextRowIndex)
      let wasFromNextRow = false
      if (nextBlock !== null) {
        wasFromNextRow = nextBlock.getParentRow() !== row
      }

      if (nextBlock !== null) {
        // 尝试把下一块的矩形吸收到当前块.
        if (nextBlock.getChildren().length !== 0
          && !rectInNewRow(nextBlock.getChildren()[0]!)) {
          useRowWidth(block, boundingWidth)
          somethingWasChanged = absorbBlocks(row, block, nextBlock, boundingWidth, nodeNodeSpacing) || somethingWasChanged
        } else {
          row.removeBlock(nextBlock)
          break
        }

        // 清理空块/空行.
        if (nextBlock.getChildren().length === 0) {
          if (rows.length > nextRowIndex) {
            rows[nextRowIndex]!.removeBlock(nextBlock)
          }
          nextBlock = null
          while (rows.length > nextRowIndex && rows[nextRowIndex]!.getChildren().length === 0) {
            rows.splice(nextRowIndex, 1)
          }
        }
        if (nextBlock === null) {
          blockId--
          continue
        }

        // 尝试把下一块放在当前块下方 (同 stack).
        if (!rectInNewRow(nextBlock.getChildren()[0]!)
          && placeBelow(rows, row, block, nextBlock, wasFromNextRow, boundingWidth, nextRowIndex, nodeNodeSpacing)) {
          somethingWasChanged = true
          continue
        }

        if (wasFromNextRow) {
          // 尝试并排: 当前块尽量变瘦.
          const oldRowHeight = row.getHeight()
          const nextBlockMinHeight = nextBlock.getMinHeight()
          if (!rectInNewRow(nextBlock.getChildren()[0]!)
            && placeBeside(rows, row, block, nextBlock, wasFromNextRow, boundingWidth, nextRowIndex,
              nodeNodeSpacing, rowHeightReevaluation)) {
            somethingWasChanged = true
            if (oldRowHeight < nextBlockMinHeight) {
              compactRowAgain = true
              nextBlock.setParentRow(row)
              break
            }
            continue
          } else if (useRowHeight(row, block)) {
            block.setFixed(true)
            somethingWasChanged = true
            continue
          }
        } else if (useRowHeight(row, block)) {
          block.setFixed(true)
          somethingWasChanged = true
          continue
        }

        // 只吸收了部分, 但整块没放进去.
        if (somethingWasChanged) {
          continue
        }
      }

      // Optimization 2: 让块用满行高.
      if (useRowHeight(row, block)) {
        block.setFixed(true)
        somethingWasChanged = true
        if (nextBlock !== null) {
          nextBlock.setPositionFixed(false)
        }
        continue
      } else {
        currentStack?.updateDimension()
      }
    }

    return { somethingWasChanged, compactRowAgain }
  },
}

/** 取下一个块: 本行下一块, 或下一行第一块 (Java getNextBlock). */
function getNextBlock(rows: RectRow[], row: RectRow, blockId: number, nextRowIndex: number): Block | null {
  if (blockId < row.getNumberOfAssignedBlocks() - 1) {
    return row.getChildren()[blockId + 1]!
  } else if (nextRowIndex < rows.length && rows[nextRowIndex]!.getChildren().length !== 0) {
    return rows[nextRowIndex]!.getChildren()[0]!
  }
  return null
}

/** 让块用满行高 (Java useRowHeight). */
function useRowHeight(row: RectRow, block: Block): boolean {
  let somethingWasChanged = false
  const previousWidth = block.getStack().getWidth()
  if (block.getHeight() < row.getHeight()) {
    const targetWidth = block.getStack().getWidthForFixedHeight(row.getHeight())
    if (block.getStack().getWidth() > targetWidth) {
      block.getStack().placeRectsIn(targetWidth)
      somethingWasChanged = previousWidth !== block.getStack().getWidth()
    }
  }
  return somethingWasChanged
}

/** 让块用满剩余行宽 (Java useRowWidth). */
function useRowWidth(block: Block, boundingWidth: number): void {
  block.placeRectsInWidth(boundingWidth - block.getX())
  block.getStack().updateDimension()
}

/** 把下一块中能放下的矩形逐个吸收到当前块 (Java absorbBlocks). */
function absorbBlocks(row: RectRow, block: Block, nextBlock: Block, boundingWidth: number, nodeNodeSpacing: number): boolean {
  let somethingWasChanged = false
  let rect = nextBlock.getChildren()[0]!
  while (InitialPlacement.placeRectInBlock(row, block, rect, boundingWidth, nodeNodeSpacing)) {
    somethingWasChanged = true
    nextBlock.removeChild(rect)
    if (nextBlock.getChildren().length === 0) {
      break
    }
    rect = nextBlock.getChildren()[0]!
  }
  if (nextBlock.getChildren().length === 0) {
    nextBlock.getParentRow().removeBlock(nextBlock)
  }
  if (somethingWasChanged) {
    block.getStack().updateDimension()
  }
  return somethingWasChanged
}

/** 尝试把下一块放到当前块下方 (同 stack, Java placeBelow). */
function placeBelow(rows: RectRow[], row: RectRow, block: Block, nextBlock: Block, wasFromNextRow: boolean,
  boundingWidth: number, nextRowIndex: number, nodeNodeSpacing: number): boolean {
  let somethingWasChanged = false
  const remainingWidth = boundingWidth - block.getX()
  const currentBlockMinHeight = block.getY() - row.getY() + block.getHeightForTargetWidth(remainingWidth)
  if (nextBlock.getMinWidth() + nodeNodeSpacing > remainingWidth) {
    return false
  }
  const nextBlockMinHeight = nextBlock.getHeightForTargetWidth(remainingWidth)

  if (currentBlockMinHeight + nodeNodeSpacing + nextBlockMinHeight <= row.getHeight()) {
    block.placeRectsInWidth(boundingWidth - block.getX())
    block.setFixed(true)
    nextBlock.placeRectsInWidth(boundingWidth - block.getX())
    nextBlock.setLocation(block.getX(), block.getY() + block.getHeight() + nodeNodeSpacing)
    nextBlock.setPositionFixed(true)
    block.getStack().addBlock(nextBlock)
    somethingWasChanged = true

    if (wasFromNextRow) {
      row.addBlock(nextBlock)
      nextBlock.setParentRow(row)
      if (rows.length > nextRowIndex) {
        rows[nextRowIndex]!.removeBlock(nextBlock)
        if (rows[nextRowIndex]!.getChildren().length === 0) {
          rows.splice(nextRowIndex, 1)
        }
      }
    }
  } else {
    block.getStack().updateDimension()
  }
  return somethingWasChanged
}

/** 尝试把下一块放到当前块旁边 (Java placeBeside). */
function placeBeside(rows: RectRow[], row: RectRow, block: Block, nextBlock: Block, wasFromNextRow: boolean,
  boundingWidth: number, nextRowIndex: number, nodeNodeSpacing: number, rowHeightReevaluation: boolean): boolean {
  let somethingWasChanged = false
  // 当前 stack 满足行高所需的最小宽度.
  const currentBlockMinWidth = block.getStack().getWidthForFixedHeight(row.getY() + row.getHeight() - block.getStack().getY())
  const shouldRowHeightBeReevaluated = nextBlock.getMinHeight() > row.getHeight() && rowHeightReevaluation

  let targetWidthOfNextBlock = boundingWidth - (block.getStack().getX() + currentBlockMinWidth - nodeNodeSpacing)
  const nextBlockHeight = nextBlock.getHeightForTargetWidth(targetWidthOfNextBlock)
  if (shouldRowHeightBeReevaluated && nextBlockHeight > nextBlock.getMinHeight()) {
    return false
  }

  if (shouldRowHeightBeReevaluated) {
    let potentialWidth = 0
    for (const stack of row.getStacks()) {
      potentialWidth += stack.getWidthForFixedHeight(nextBlock.getMinHeight()) + nodeNodeSpacing
    }
    targetWidthOfNextBlock = boundingWidth - potentialWidth
  }

  if (targetWidthOfNextBlock < nextBlock.getMinWidth()) {
    return false
  }
  const lastRowOptimization = nextRowIndex === rows.length - 1
    && targetWidthOfNextBlock >= rows[nextRowIndex]!.getWidth()

  if (!shouldRowHeightBeReevaluated && nextBlockHeight > row.getHeight() && !lastRowOptimization) {
    return false
  }
  if (lastRowOptimization || shouldRowHeightBeReevaluated || nextBlockHeight <= row.getHeight()) {
    if (lastRowOptimization && nextBlockHeight > row.getHeight()) {
      block.setHeight(nextBlockHeight)
      block.placeRectsInWidth(block.getWidthForTargetHeight(nextBlockHeight))
    } else {
      block.getStack().placeRectsIn(currentBlockMinWidth)
      block.setFixed(true)
    }

    nextBlock.placeRectsInWidth(boundingWidth - (block.getX() + block.getWidth()))
    nextBlock.setLocation(block.getStack().getX() + block.getStack().getWidth(), row.getY())
    row.addBlock(nextBlock)

    if (rows.length > nextRowIndex) {
      rows[nextRowIndex]!.removeBlock(nextBlock)
      if (rows[nextRowIndex]!.getChildren().length === 0) {
        rows.splice(nextRowIndex, 1)
      }
    }
    somethingWasChanged = true
    void wasFromNextRow
  }
  return somethingWasChanged
}

// ── RowFillingAndCompaction (p2packing/RowFillingAndCompaction.java) ──
export class RowFillingAndCompaction {
  readonly aspectRatio: number
  readonly nodeNodeSpacing: number
  potentialRowWidthDecreaseMin = Number.POSITIVE_INFINITY
  potentialRowWidthDecreaseMax = 0
  potentialRowWidthIncreaseMin = Number.POSITIVE_INFINITY
  potentialRowWidthIncreaseMax = 0

  constructor(aspectRatio: number, nodeNodeSpacing: number) {
    this.aspectRatio = aspectRatio
    this.nodeNodeSpacing = nodeNodeSpacing
  }

  /** 初始放置 + 逐行压缩 (Java start). */
  start(layoutGraph: ElkNode, padding: ElkPadding, ctx: InternalProperties): DrawingData {
    const targetWidth = ctx.targetWidth
    const minWidth = ctx.minWidth
    const minHeight = ctx.minHeight
    const rowHeightReevaluation = optBool(layoutGraph, PACKING_COMPACTION_ROW_HEIGHT_REEVALUATION, false)
    DrawingUtil.resetCoordinates(layoutGraph.children ?? [])

    const rows = InitialPlacement.place(layoutGraph.children ?? [], targetWidth, this.nodeNodeSpacing, rowHeightReevaluation)

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const currentRow = rows[rowIdx]!
      if (rowIdx !== 0) {
        const previousRow = rows[rowIdx - 1]!
        currentRow.setY(previousRow.getY() + previousRow.getHeight() + this.nodeNodeSpacing)
      }
      const result = Compaction.compact(rowIdx, rows, targetWidth, this.nodeNodeSpacing, rowHeightReevaluation)
      if (result.compactRowAgain) {
        for (const block of currentRow.getChildren()) {
          block.setFixed(false)
          block.setPositionFixed(false)
          block.resetBlock()
        }
        currentRow.resetStacks()
        currentRow.setWidth(targetWidth)
        rowIdx--
      } else {
        this.adjustWidthAndHeight(currentRow)
        if (rowIdx + 1 < rows.length) {
          // ★ Java 原样 bug: Increase 用 Decrease 值做 max/min (ELK 0.12.0 保留).
          this.potentialRowWidthIncreaseMax = Math.max(
            currentRow.getWidth() + this.nodeNodeSpacing + rows[rowIdx + 1]!.getFirstBlock().getWidth() - targetWidth,
            this.potentialRowWidthDecreaseMax)
          this.potentialRowWidthIncreaseMin = Math.min(
            currentRow.getWidth() + this.nodeNodeSpacing + rows[rowIdx + 1]!.getFirstBlock().getWidth() - targetWidth,
            this.potentialRowWidthDecreaseMin)
          if (currentRow.getStacks().length !== 0) {
            const lastStackWidth = currentRow.getStacks()[currentRow.getStacks().length - 1]!.getWidth()
              + (currentRow.getStacks().length <= 1 ? 0 : this.nodeNodeSpacing)
            this.potentialRowWidthDecreaseMax = Math.max(this.potentialRowWidthDecreaseMax, lastStackWidth)
            // ★ Java 原样: Min 用 DecreaseMax 做 min (ELK 0.12.0 保留).
            this.potentialRowWidthDecreaseMin = Math.min(this.potentialRowWidthDecreaseMax, lastStackWidth)
          }
        }
        // 只有一行一块多子行特例.
        if (rows.length === 1) {
          const lastStack = currentRow.getStacks()[currentRow.getStacks().length - 1]!
          const lastBlock = lastStack.getBlocks()[lastStack.getBlocks().length - 1]!
          for (const blockRow of lastBlock.getRows()) {
            this.potentialRowWidthDecreaseMax = Math.max(this.potentialRowWidthDecreaseMax, lastBlock.getWidth() - blockRow.getWidth())
            this.potentialRowWidthDecreaseMin = Math.min(this.potentialRowWidthDecreaseMin, lastBlock.getWidth() - blockRow.getWidth())
            this.potentialRowWidthIncreaseMax = Math.max(this.potentialRowWidthIncreaseMax, blockRow.getWidth() + this.nodeNodeSpacing)
            this.potentialRowWidthIncreaseMin = Math.min(this.potentialRowWidthIncreaseMin, blockRow.getWidth() + this.nodeNodeSpacing)
          }
        }
      }
    }

    const size = DrawingUtil.calculateDimensionsRows(rows, this.nodeNodeSpacing)
    const totalWidth = Math.max(size.x, minWidth - padding.left - padding.right)
    const height = Math.max(size.y, minHeight - padding.top - padding.bottom)
    const additionalHeight = height - size.y
    ctx.additionalHeight = additionalHeight
    ctx.rows = rows
    return new DrawingData(this.aspectRatio, totalWidth, size.y + additionalHeight, DrawingDataDescriptor.WHOLE_DRAWING)
  }

  private adjustWidthAndHeight(row: RectRow): void {
    let maxHeight = 0
    let maxWidth = 0
    let index = 0
    for (const stack of row.getStacks()) {
      stack.updateDimension()
      maxHeight = Math.max(maxHeight, stack.getHeight())
      maxWidth += stack.getWidth() + (index > 0 ? this.nodeNodeSpacing : 0)
      index++
    }
    row.setHeight(maxHeight)
    row.setWidth(maxWidth)
  }
}

// ── Compactor (p2packing/Compactor.java) ──
function cloneGraph(graph: ElkNode): ElkNode {
  const clone: ElkNode = {
    id: graph.id,
    width: graph.width,
    height: graph.height,
    x: graph.x,
    y: graph.y,
    layoutOptions: { ...graph.layoutOptions },
    children: (graph.children ?? []).map((child) => ({
      id: child.id,
      width: child.width,
      height: child.height,
      x: child.x,
      y: child.y,
      layoutOptions: { ...child.layoutOptions },
    })),
  }
  return clone
}

function copyPosition(node: ElkNode, other: ElkNode): void {
  other.width = node.width
  other.height = node.height
  other.x = node.x
  other.y = node.y
  for (let i = 0; i < (node.children ?? []).length; i++) {
    copyPosition(node.children![i]!, other.children![i]!)
  }
}

function copyRowWidthChangeValues(ctx: InternalProperties, compaction: RowFillingAndCompaction): void {
  ctx.minRowIncrease = compaction.potentialRowWidthIncreaseMin
  ctx.maxRowIncrease = compaction.potentialRowWidthIncreaseMax
  ctx.minRowDecrease = compaction.potentialRowWidthDecreaseMin
  ctx.maxRowDecrease = compaction.potentialRowWidthDecreaseMax
}

function configureSecondIteration(layoutGraph: ElkNode, clone: ElkNode, drawing: DrawingData, cloneCtx: InternalProperties): void {
  // Java: 只改 clone 上的 TARGET_WIDTH (clone.setProperty), 原图属性不变.
  const padding = optPadding(layoutGraph)
  const aspectRatio = optNum(layoutGraph, ASPECT_RATIO)
  if (layoutGraph.children!.length > 1
    && cloneCtx.minRowIncrease !== Number.POSITIVE_INFINITY
    && (drawing.getDrawingWidth() + padding.left + padding.right)
      / (drawing.getDrawingHeight() + padding.top + padding.bottom) < aspectRatio) {
    cloneCtx.targetWidth = cloneCtx.targetWidth + cloneCtx.minRowIncrease
  } else if (layoutGraph.children!.length > 1
    && cloneCtx.minRowDecrease !== Number.POSITIVE_INFINITY
    && (drawing.getDrawingWidth() + padding.left + padding.right)
      / (drawing.getDrawingHeight() + padding.top + padding.bottom) > aspectRatio) {
    cloneCtx.targetWidth = Math.max(cloneCtx.minWidth, cloneCtx.targetWidth - cloneCtx.minRowDecrease)
  }
  void clone
}

/** PACKING_STRATEGY=COMPACTION (Java Compactor.process). */
export function runCompactor(graph: ElkNode, ctx: InternalProperties, padding: ElkPadding): DrawingData {
  const aspectRatio = optNum(graph, ASPECT_RATIO)
  const nodeNodeSpacing = optNum(graph, SPACING_NODE_NODE)
  const rectangles = graph.children ?? []

  let secondIt = new RowFillingAndCompaction(aspectRatio, nodeNodeSpacing)
  let drawing = secondIt.start(graph, padding, ctx)
  copyRowWidthChangeValues(ctx, secondIt)

  let iterations = Math.trunc(optNum(graph, PACKING_COMPACTION_ITERATIONS))
  while (iterations > 1) {
    const clone = cloneGraph(graph)
    const oldSM = drawing.getScaleMeasure()
    // 克隆的 internal = 原图状态副本 (Java clone.copyProperties), configure 只改 clone 的 targetWidth.
    const cloneCtx: InternalProperties = {
      ...ctx,
      rows: [],
      additionalHeight: 0,
    }
    configureSecondIteration(graph, clone, drawing, cloneCtx)
    secondIt = new RowFillingAndCompaction(aspectRatio, nodeNodeSpacing)
    const newDrawing = secondIt.start(clone, padding, cloneCtx)

    const newSM = newDrawing.getScaleMeasure()
    if (newSM >= oldSM && newSM === newSM) {
      for (let i = 0; i < (clone.children ?? []).length; i++) {
        copyPosition(clone.children![i]!, rectangles[i]!)
      }
      copyRowWidthChangeValues(ctx, secondIt)
      drawing.setDrawingWidth(newDrawing.getDrawingWidth())
      drawing.setDrawingHeight(newDrawing.getDrawingHeight())
    }
    iterations--
  }

  ctx.drawingHeight = drawing.getDrawingHeight()
  ctx.drawingWidth = drawing.getDrawingWidth()
  return drawing
}

/** PACKING_STRATEGY=SIMPLE (Java SimplePlacement.process). */
export function runSimplePlacement(graph: ElkNode, ctx: InternalProperties, padding: ElkPadding): void {
  const targetWidth = ctx.targetWidth
  const nodeNodeSpacing = optNum(graph, SPACING_NODE_NODE)
  DrawingUtil.resetCoordinates(graph.children ?? [])

  const rows = InitialPlacement.place(graph.children ?? [], targetWidth, nodeNodeSpacing,
    optBool(graph, PACKING_COMPACTION_ROW_HEIGHT_REEVALUATION, false))
  let size: { x: number; y: number }
  if (rows === null) {
    size = DrawingUtil.calculateDimensions(graph.children ?? [])
  } else {
    for (const row of rows) {
      for (const block of row.getChildren()) {
        const stack = new BlockStack(block.getX(), block.getY(), nodeNodeSpacing)
        stack.addBlock(block)
        row.getStacks().push(stack)
      }
    }
    size = DrawingUtil.calculateDimensionsRows(rows, nodeNodeSpacing)
  }
  const width = Math.max(size.x, ctx.minWidth - padding.left - padding.right)
  const height = Math.max(size.y, ctx.minHeight - padding.top - padding.bottom)
  const additionalHeight = height - size.y
  ctx.additionalHeight = additionalHeight
  ctx.drawingWidth = width
  ctx.drawingHeight = height + additionalHeight
  ctx.rows = rows
}

/** PACKING_STRATEGY=NONE (Java NoPlacement.process). */
export function runNoPlacement(graph: ElkNode, ctx: InternalProperties, padding: ElkPadding): void {
  const size = DrawingUtil.calculateDimensions(graph.children ?? [])
  const width = Math.max(size.x, ctx.minWidth - padding.left - padding.right)
  const height = Math.max(size.y, ctx.minHeight - padding.top - padding.bottom)
  const additionalHeight = height - size.y
  ctx.additionalHeight = additionalHeight
  ctx.drawingWidth = width
  ctx.drawingHeight = height + additionalHeight
}

/** PACKING_STRATEGY 分派 (Java PackingStrategy.create). */
export function runPacking(graph: ElkNode, ctx: InternalProperties, padding: ElkPadding): DrawingData {
  const strategy = optStr<PackingStrategy>(graph, PACKING_STRATEGY, PackingStrategy.COMPACTION)
  switch (strategy) {
    case PackingStrategy.COMPACTION:
      return runCompactor(graph, ctx, padding)
    case PackingStrategy.SIMPLE:
      runSimplePlacement(graph, ctx, padding)
      return new DrawingData(optNum(graph, ASPECT_RATIO), ctx.drawingWidth, ctx.drawingHeight,
        DrawingDataDescriptor.WHOLE_DRAWING)
    case PackingStrategy.NONE:
      runNoPlacement(graph, ctx, padding)
      return new DrawingData(optNum(graph, ASPECT_RATIO), ctx.drawingWidth, ctx.drawingHeight,
        DrawingDataDescriptor.WHOLE_DRAWING)
    default:
      throw new Error(`[rectpacking] no implementation for packing strategy ${strategy}`)
  }
}

