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
 * PlanarGrid — alg.common.polyomino.structures.PlanarGrid (0.12.0).
 * 中心基准坐标网格 (center-based ↔ origin-based 转换), polyomino 放置/相交检测.
 */
import { TwoBitGrid } from './two-bit-grid.js'
import { GridIndexOutOfBoundsError } from './ithree-value-grid.js'
import { Quadruple } from '../geometry.js'
import type { UniqueTriple } from '../geometry.js'
import { Direction } from './direction.js'
import type { Polyomino } from './polyomino.js'

export class PlanarGrid extends TwoBitGrid {
  /** 网格中心 x (非整时截断). */
  private xCenter: number
  /** 网格中心 y (非整时截断). */
  private yCenter: number

  constructor(width = 0, height = 0) {
    super(width, height)
    this.xCenter = (width - 1) >> 1
    this.yCenter = (height - 1) >> 1
  }

  isEmptyCenterBased(x: number, y: number): boolean {
    try {
      return this.isEmpty(x + this.xCenter, y + this.yCenter)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      throw new GridIndexOutOfBoundsError(`${m} Given center based coordinates were (${x}, ${y}).`)
    }
  }

  isBlockedCenterBased(x: number, y: number): boolean {
    try {
      return this.isBlocked(x + this.xCenter, y + this.yCenter)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      throw new GridIndexOutOfBoundsError(`${m} Given center based coordinates were (${x}, ${y}).`)
    }
  }

  isWeaklyBlockedCenterBased(x: number, y: number): boolean {
    try {
      return this.isWeaklyBlocked(x + this.xCenter, y + this.yCenter)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      throw new GridIndexOutOfBoundsError(`${m} Given center based coordinates were (${x}, ${y}).`)
    }
  }

  inBoundsCenterBased(x: number, y: number): boolean {
    let xt = x
    let yt = y
    xt += this.xCenter
    yt += this.yCenter
    return this.inBounds(xt, yt)
  }

  intersectsWithCenterBased(other: PlanarGrid, xOffset: number, yOffset: number): boolean {
    for (let x = 0; x < other.getWidth(); x++) {
      const xTranslated = x - other.getCenterX() + xOffset
      for (let y = 0; y < other.getHeight(); y++) {
        const yTranslated = y - other.getCenterY() + yOffset
        if (this.inBoundsCenterBased(xTranslated, yTranslated)
          && ((!(other.isEmpty(x, y)) && this.isBlockedCenterBased(xTranslated, yTranslated))
            || (other.isBlocked(x, y) && !(this.isEmptyCenterBased(xTranslated, yTranslated))))) {
          return true
        }
      }
    }
    return false
  }

  /** Polyomino 重载: 网格相交 + 扩展 (extension) 区域相交检测. */
  intersectsWithCenterBasedPoly(other: Polyomino, xOffset: number, yOffset: number): boolean {
    if (this.intersectsWithCenterBased(other, xOffset, yOffset)) {
      return true
    }
    for (const ext of other.getPolyominoExtensions()) {
      let intersects = false

      // Some transformations of the coordinates, as center based coordinates aren't that practical for
      // checking the extensions
      const leftX = this.getCenterX() - other.getCenterX() + xOffset
      const rightX = leftX + other.getWidth()
      const topY = this.getCenterY() - other.getCenterY() + yOffset
      const bottomY = topY + other.getHeight()

      switch (ext.getFirst()) {
        case Direction.NORTH:
          intersects = this.weaklyIntersectsArea(leftX + ext.getSecond(), 0, leftX + ext.getThird(), topY - 1)
          break
        case Direction.EAST:
          intersects = this.weaklyIntersectsArea(rightX, topY + ext.getSecond(), this.getWidth() - 1, topY + ext.getThird())
          break
        case Direction.SOUTH:
          intersects = this.weaklyIntersectsArea(leftX + ext.getSecond(), bottomY, leftX + ext.getThird(), this.getHeight() - 1)
          break
        default: // WEST
          intersects = this.weaklyIntersectsArea(0, topY + ext.getSecond(), leftX - 1, topY + ext.getThird())
      }
      if (intersects) {
        return true
      }
    }
    return false
  }

  addFilledCellsFrom(other: PlanarGrid, xOffset: number, yOffset: number): void {
    for (let x = 0; x < other.getWidth(); x++) {
      const xTranslated = x - other.getCenterX() + xOffset
      for (let y = 0; y < other.getHeight(); y++) {
        const yTranslated = y - other.getCenterY() + yOffset
        if (other.isBlocked(x, y)) {
          if (!this.isWeaklyBlockedCenterBased(xTranslated, yTranslated)) {
            // Might throw exception.
            this.setBlockedCenterBased(xTranslated, yTranslated)
          }
        } else {
          // (priorities for overwriting: blocked > weakly_blocked > empty)
          // Might throw exception.
          if (other.isWeaklyBlocked(x, y)) {
            if (!this.isBlockedCenterBased(xTranslated, yTranslated)) {
              this.setWeaklyBlockedCenterBased(xTranslated, yTranslated)
            }
          }
        }
      }
    }
  }

  /** Polyomino 重载: 格点 + 扩展区域 + 记录 other 的中心位置. */
  addFilledCellsFromPoly(other: Polyomino, xOffset: number, yOffset: number): void {
    // Might throw exception.
    this.addFilledCellsFrom(other, xOffset, yOffset)
    other.setX(this.xCenter - other.getCenterX() + xOffset)
    other.setY(this.yCenter - other.getCenterY() + yOffset)

    for (const ext of other.getPolyominoExtensions()) {
      switch (ext.getFirst()) {
        case Direction.NORTH:
          this.weaklyBlockArea(other.getX() + ext.getSecond(), 0, other.getX() + ext.getThird(), other.getY() - 1)
          break
        case Direction.EAST:
          this.weaklyBlockArea(other.getX() + other.getWidth(), other.getY() + ext.getSecond(), this.getWidth() - 1,
            other.getY() + ext.getThird())
          break
        case Direction.SOUTH:
          this.weaklyBlockArea(other.getX() + ext.getSecond(), other.getY() + other.getHeight(),
            other.getX() + ext.getThird(), this.getHeight() - 1)
          break
        default: // WEST
          this.weaklyBlockArea(0, other.getY() + ext.getSecond(), other.getX() - 1, other.getY() + ext.getThird())
      }
    }
  }

  /** 所有 blocked 格的边界: Quadruple(minX, minY, width, height). */
  getFilledBounds(): Quadruple<number, number, number, number> {
    const gridWidth = this.getWidth()
    const gridHeight = this.getHeight()
    let minX = Number.MAX_SAFE_INTEGER
    let maxX = Number.MIN_SAFE_INTEGER
    let minY = Number.MAX_SAFE_INTEGER
    let maxY = Number.MIN_SAFE_INTEGER
    for (let xi = 0; xi < gridWidth; ++xi) {
      for (let yi = 0; yi < gridHeight; ++yi) {
        if (this.isBlocked(xi, yi)) {
          minX = Math.min(minX, xi)
          maxX = Math.max(maxX, xi)
          minY = Math.min(minY, yi)
          maxY = Math.max(maxY, yi)
        }
      }
    }
    const width = maxX - minX + 1
    const height = maxY - minY + 1

    return new Quadruple(minX, minY, width, height)
  }

  weaklyBlockArea(xUpperLeft: number, yUpperleft: number, xBottomRight: number, yBottomRight: number): void {
    for (let yi = yUpperleft; yi <= yBottomRight; yi++) {
      for (let xi = xUpperLeft; xi <= xBottomRight; xi++) {
        if (!this.isBlocked(xi, yi)) {
          // Might throw IndexOutOfBoundsException
          this.setWeaklyBlocked(xi, yi)
        }
      }
    }
  }

  weaklyIntersectsArea(xUpperLeft: number, yUpperleft: number, xBottomRight: number, yBottomRight: number): boolean {
    for (let yi = yUpperleft; yi <= yBottomRight; yi++) {
      for (let xi = xUpperLeft; xi <= xBottomRight; xi++) {
        // Might throw IndexOutOfBoundsException
        if (this.isBlocked(xi, yi)) {
          return true
        }
      }
    }
    return false
  }

  getCenterX(): number {
    return this.xCenter
  }

  getCenterY(): number {
    return this.yCenter
  }

  override reinitialize(width: number, height: number): void {
    super.reinitialize(width, height)
    this.xCenter = (width - 1) >> 1
    this.yCenter = (height - 1) >> 1
  }

  setBlockedCenterBased(x: number, y: number): void {
    try {
      this.setBlocked(x + this.xCenter, y + this.yCenter)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      throw new GridIndexOutOfBoundsError(`${m} Given center based coordinates were (${x}, ${y}).`)
    }
  }

  setEmptyCenterBased(x: number, y: number): void {
    try {
      this.setEmpty(x + this.xCenter, y + this.yCenter)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      throw new GridIndexOutOfBoundsError(`${m} Given center based coordinates were (${x}, ${y}).`)
    }
  }

  setWeaklyBlockedCenterBased(x: number, y: number): void {
    try {
      this.setWeaklyBlocked(x + this.xCenter, y + this.yCenter)
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e)
      throw new GridIndexOutOfBoundsError(`${m} Given center based coordinates were (${x}, ${y}).`)
    }
  }
}

// 仅供类型引用 (PlanarGrid 的 Polyomino 重载在 polyomino.ts 内通过本类实现).
export type { UniqueTriple }
