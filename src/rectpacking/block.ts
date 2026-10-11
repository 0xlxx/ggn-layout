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
 * 块 (util/Block.java): 高度相近矩形的有序集合, 从左到右布局.
 * 维护最小/最大/平均宽高; add/remove 时更新并通知父行.
 */
import type { ElkNode } from '../api/elk-json.js'
import { BlockRow } from './block-row.js'
import type { BlockStack } from './block-stack.js'
import type { RectRow } from './rect-row.js'

export class Block {
  private smallestRectWidth = Number.POSITIVE_INFINITY
  /** 最小宽 + spacing (所有矩形一列). */
  private minWidth = 0
  /** 当前宽 + spacing (无其他设置时等于 maxWidth). */
  private width = 0
  /** 最小高 + spacing (所有矩形一行). */
  private minHeight = 0
  private smallestRectHeight = Number.POSITIVE_INFINITY
  private averageHeight = 0
  /** 最大高 + spacing (所有矩形一列). */
  private maxHeight = 0
  /** 当前高 + spacing (无其他设置时等于 minHeight). */
  private height = 0
  private children: ElkNode[] = []
  private rows: BlockRow[] = []
  private x: number
  private y: number
  private parentRow: RectRow
  private stack: BlockStack | null = null
  private nodeNodeSpacing: number
  private fixed = false
  private positionFixed = false

  constructor(xCoord: number, yCoord: number, parentRow: RectRow, nodeNodeSpacing: number) {
    this.nodeNodeSpacing = nodeNodeSpacing
    this.parentRow = parentRow
    this.x = xCoord
    this.y = yCoord
    this.width = 0
    this.height = 0
  }

  /** 添加矩形 (Java addChild): 加入最后一行, 更新尺寸, 通知父行. */
  addChild(rect: ElkNode): void {
    if (this.rows.length === 0) {
      this.rows.push(new BlockRow(this.x, this.y, this.nodeNodeSpacing))
    }
    this.children.push(rect)
    this.rows[this.rows.length - 1]!.addRectangle(rect)
    this.adjustSizeAdd(rect)
  }

  /** 在新行添加矩形 (Java addChildInNewRow). */
  addChildInNewRow(rect: ElkNode): void {
    this.children.push(rect)
    const lastRow = this.getLastRow()
    this.rows.push(new BlockRow(this.x, lastRow.getY() + lastRow.getHeight() + this.nodeNodeSpacing, this.nodeNodeSpacing))
    this.getLastRow().addRectangle(rect)
    this.adjustSizeAdd(rect)
  }

  /** 移除矩形 (Java removeChild). */
  removeChild(rect: ElkNode): void {
    const idx = this.children.indexOf(rect)
    if (idx !== -1) this.children.splice(idx, 1)
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]!
      if (row.getNodes().includes(rect)) {
        row.removeRectangle(rect, true)
        if (row.getNodes().length === 0) {
          this.rows.splice(i, 1)
        }
        break
      }
    }
    this.adjustSizeAfterRemove()
  }

  /** 移动 block (Java setLocation): 调整矩形 + 行坐标. */
  setLocation(xCoord: number, yCoord: number): void {
    this.adjustChildrensXandY(xCoord - this.x, yCoord - this.y)
    for (const row of this.rows) {
      row.setX(row.getX() + xCoord - this.x)
      row.setY(row.getY() + yCoord - this.y)
    }
    this.x = xCoord
    this.y = yCoord
  }

  private adjustChildrensXandY(xChange: number, yChange: number): void {
    for (const rect of this.children) {
      rect.x = (rect.x ?? 0) + xChange
      rect.y = (rect.y ?? 0) + yChange
    }
  }

  /** 添加矩形后调整尺寸 (Java adjustSizeAdd). */
  private adjustSizeAdd(rect: ElkNode): void {
    const widthOfLastRow = this.getLastRow().getWidth()
    this.smallestRectWidth = Math.min(this.smallestRectWidth, rect.width ?? 0)
    this.width = Math.max(this.width, widthOfLastRow)
    this.minWidth = Math.max(this.minWidth, (rect.width ?? 0) + (this.children.length === 1 ? 0 : this.nodeNodeSpacing))

    this.smallestRectHeight = Math.min(this.smallestRectHeight, rect.height ?? 0)
    this.maxHeight += (rect.height ?? 0) + (this.children.length === 1 ? 0 : this.nodeNodeSpacing)
    this.minHeight = Math.max(this.minHeight, rect.height ?? 0)
    let totalHeight = this.rows.length > 0 ? (this.rows.length - 1) * this.nodeNodeSpacing : 0
    for (const row of this.rows) {
      totalHeight += row.getHeight()
    }
    this.height = totalHeight
    this.averageHeight = this.maxHeight / this.children.length
      - this.nodeNodeSpacing * ((this.children.length - 1) / this.children.length)
    this.parentRow.notifyAboutNodeChange()
  }

  /** 给定高度下可放下的最小宽度 (Java getWidthForTargetHeight). */
  getWidthForTargetHeight(height: number): number {
    if (this.maxHeight <= height) {
      return this.minWidth
    }
    if (this.fitsRectsInWidthHeight(this.minWidth, height, false)) {
      return this.minWidth
    }
    let upperBound = this.width
    let lowerBound = this.minWidth
    let viableWidth = this.width
    let newWidth = (upperBound - lowerBound) / 2 + lowerBound
    while (lowerBound + 1 < upperBound) {
      if (this.fitsRectsInWidthHeight(newWidth, height, false)) {
        viableWidth = newWidth
        upperBound = newWidth
      } else {
        lowerBound = newWidth
      }
      newWidth = (upperBound - lowerBound) / 2 + lowerBound
    }
    return viableWidth
  }

  /** 给定宽度下的高度 (Java getHeightForTargetWidth). */
  getHeightForTargetWidth(width: number): number {
    const bounds = this.layoutRectsInWidth(width, false)
    return bounds.height
  }

  /** 给定宽高能否放下 (Java placeRectsIn(width, height)). */
  placeRectsIn(width: number, height: number): boolean {
    return this.fitsRectsInWidthHeight(width, height, true)
  }

  /** 给定宽度放置矩形, 返回是否发生变化 (Java placeRectsIn(width)). */
  placeRectsInWidth(width: number): boolean {
    const oldWidth = this.width
    const oldHeight = this.height
    const bounds = this.layoutRectsInWidth(width, true)
    return bounds.width !== oldWidth || bounds.height !== oldHeight
  }

  /** 把矩形按给定宽度排成行 (Java placeRectsIn(width, placeRects)). */
  private layoutRectsInWidth(width: number, placeRects: boolean): { x: number; y: number; width: number; height: number } {
    let currentX = 0
    let currentY = this.y
    let currentWidth = 0
    let currentHeight = 0
    let maxHeightInRow = 0
    let widthInRow = 0
    let row = 0
    if (placeRects) {
      this.rows = []
      this.rows.push(new BlockRow(this.x, this.y, this.nodeNodeSpacing))
    }
    let index = 0
    for (const rect of this.children) {
      if (currentX + (rect.width ?? 0) + (index > 0 ? this.nodeNodeSpacing : 0) > width
        && maxHeightInRow > 0) {
        currentX = 0
        currentY += maxHeightInRow + this.nodeNodeSpacing
        currentWidth = Math.max(currentWidth, widthInRow)
        currentHeight += maxHeightInRow + this.nodeNodeSpacing
        maxHeightInRow = 0
        widthInRow = 0
        if (placeRects) {
          row++
          this.rows.push(new BlockRow(this.x, currentY, this.nodeNodeSpacing))
        }
        index = 0
      }
      widthInRow += (rect.width ?? 0) + (index > 0 ? this.nodeNodeSpacing : 0)
      maxHeightInRow = Math.max(maxHeightInRow, rect.height ?? 0)
      if (placeRects) {
        this.rows[row]!.addRectangle(rect)
      }
      currentX += (rect.width ?? 0) + (index > 0 ? this.nodeNodeSpacing : 0)
      index++
    }
    currentWidth = Math.max(currentWidth, widthInRow)
    currentHeight += maxHeightInRow
    if (placeRects) {
      this.width = currentWidth
      this.height = currentHeight
      this.parentRow.notifyAboutNodeChange()
    }
    return { x: this.x, y: this.y, width: currentWidth, height: currentHeight }
  }

  private fitsRectsInWidthHeight(width: number, height: number, placeRects: boolean): boolean {
    const bounds = this.layoutRectsInWidth(width, placeRects)
    return bounds.width <= width && bounds.height <= height
  }

  /** 添加后移除重算 (Java adjustSizeAfterRemove). */
  private adjustSizeAfterRemove(): void {
    let newWidth = 0
    let newHeight = 0
    const rowsToDelete: number[] = []
    let index = 0
    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i]!
      if (row.getNodes().length === 0) {
        rowsToDelete.push(i)
      } else {
        newWidth = Math.max(newWidth, row.getWidth())
        newHeight += row.getHeight() + (index > 0 ? this.nodeNodeSpacing : 0)
      }
      index++
    }
    for (let i = rowsToDelete.length - 1; i >= 0; i--) this.rows.splice(rowsToDelete[i]!, 1)
    this.height = newHeight
    this.width = newWidth

    this.minWidth = 0
    this.minHeight = 0
    this.maxHeight = 0
    this.smallestRectHeight = Number.POSITIVE_INFINITY
    this.smallestRectWidth = Number.POSITIVE_INFINITY
    for (const rect of this.children) {
      this.smallestRectWidth = Math.min(this.smallestRectWidth, rect.width ?? 0)
      this.minWidth = Math.max(this.minWidth, rect.width ?? 0)
      this.minHeight = Math.max(this.minHeight, rect.height ?? 0)
      this.smallestRectHeight = Math.min(this.smallestRectHeight, rect.height ?? 0)
      this.maxHeight += (rect.height ?? 0) + this.nodeNodeSpacing
    }
    this.averageHeight = this.maxHeight / this.children.length
      - this.nodeNodeSpacing * ((this.children.length - 1) / this.children.length)

    this.parentRow.notifyAboutNodeChange()
  }

  /** 把额外宽高均分给所有行并扩张 (Java expand). */
  expand(additionalWidthPerBlock: number, additionalHeightForBlock: number): void {
    const widthForRow = this.width + additionalWidthPerBlock
    this.width += additionalWidthPerBlock
    this.height += additionalHeightForBlock
    const additionalHeightForRow = additionalHeightForBlock / this.rows.length
    let index = 0
    for (const row of this.rows) {
      row.expand(widthForRow, additionalHeightForRow, index)
      index++
    }
  }

  getWidth(): number { return this.width }
  setWidth(width: number): void { this.width = width }
  getHeight(): number { return this.height }
  setHeight(height: number): void { this.height = height }
  getChildren(): ElkNode[] { return this.children }
  getX(): number { return this.x }
  getY(): number { return this.y }
  getParentRow(): RectRow { return this.parentRow }
  setParentRow(parentRow: RectRow): void { this.parentRow = parentRow }
  getMinWidth(): number { return this.minWidth }
  getMinHeight(): number { return this.minHeight }
  getMaxHeight(): number { return this.maxHeight }
  getSmallestRectHeight(): number { return this.smallestRectHeight }
  getAverageHeight(): number { return this.averageHeight }
  isFixed(): boolean { return this.fixed }
  setFixed(fixed: boolean): void { this.fixed = fixed }
  isPositionFixed(): boolean { return this.positionFixed }
  setPositionFixed(positionFixed: boolean): void { this.positionFixed = positionFixed }
  getRows(): BlockRow[] { return this.rows }
  getLastRowNewX(): number {
    const lastRow = this.getLastRow()
    return lastRow.getX() + lastRow.getWidth()
  }
  getLastRowY(): number {
    const lastRow = this.getLastRow()
    return lastRow.getY()
  }
  getLastRow(): BlockRow { return this.rows[this.rows.length - 1]! }
  getStack(): BlockStack { return this.stack! }
  setStack(stack: BlockStack): void { this.stack = stack }
  getSmallestRectWidth(): number { return this.smallestRectWidth }
  setSmallestRectWidth(v: number): void { this.smallestRectWidth = v }
  resetBlock(): void { this.adjustSizeAfterRemove() }
}
