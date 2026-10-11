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
 * 块堆叠 (util/BlockStack.java): compaction 阶段行内 blocks 上下堆叠.
 */
import type { Block } from './block.js'

export class BlockStack {
  private blocks: Block[] = []
  private x: number
  private y: number
  private width = 0
  private height = 0
  private nodeNodeSpacing: number

  constructor(x: number, y: number, nodeNodeSpacing: number) {
    this.x = x
    this.y = y
    this.nodeNodeSpacing = nodeNodeSpacing
  }

  addBlock(block: Block): void {
    block.setStack(this)
    this.width = Math.max(this.width, block.getWidth())
    this.height += block.getHeight() + (this.blocks.length === 0 ? 0 : this.nodeNodeSpacing)
    this.blocks.push(block)
  }

  /** 重算 stack 宽高 (Java updateDimension). */
  updateDimension(): void {
    let height = 0
    let width = 0
    let index = 0
    for (const block of this.blocks) {
      width = Math.max(width, block.getWidth())
      height += block.getHeight() + (index > 0 ? this.nodeNodeSpacing : 0)
      index++
    }
    this.height = height
    this.width = width
  }

  setLocation(x: number, y: number): void {
    const xDiff = x - this.x
    const yDiff = y - this.y
    for (const block of this.blocks) {
      block.setLocation(block.getX() + xDiff, block.getY() + yDiff)
    }
    this.x = x
    this.y = y
  }

  /** 满足给定高度所需的最小宽度 (二分; 单 block 特例走 block.getWidthForTargetHeight). */
  getWidthForFixedHeight(height: number): number {
    if (this.blocks.length === 1) {
      return this.blocks[0]!.getWidthForTargetHeight(height)
    }
    const minWidth = this.getMinimumWidth()
    let upperBound = this.width
    let lowerBound = minWidth
    let viableWidth = this.width
    let newWidth = (upperBound - lowerBound) / 2 + lowerBound
    while (lowerBound + 1 < upperBound) {
      let totalHeight = 0
      for (const block of this.blocks) {
        totalHeight += block.getHeightForTargetWidth(newWidth)
      }
      if (totalHeight < height) {
        viableWidth = newWidth
        upperBound = newWidth
      } else {
        lowerBound = newWidth
      }
      newWidth = (upperBound - lowerBound) / 2 + lowerBound
    }
    return viableWidth
  }

  /** 在给定宽度内放置所有 blocks 并更新 stack 尺寸 (Java placeRectsIn). */
  placeRectsIn(targetWidth: number): void {
    let currentY = this.getY()
    let currentWidth = 0
    for (const block of this.blocks) {
      block.setLocation(this.x, currentY)
      block.placeRectsInWidth(targetWidth)
      currentWidth = Math.max(currentWidth, block.getWidth())
      currentY += block.getHeight() + this.nodeNodeSpacing
    }
    this.width = currentWidth
    this.height = currentY
  }

  /** 额外宽/高均分给 blocks (Java expand). */
  expand(additionalWidth: number, additionalHeight: number): void {
    let index = 0
    const additionalHeightPerBlock = additionalHeight / this.blocks.length
    for (const block of this.blocks) {
      block.setLocation(block.getX(), block.getY() + index * additionalHeightPerBlock)
      block.expand(this.getWidth() - block.getWidth() + additionalWidth, additionalHeightPerBlock)
      index++
    }
  }

  private getMinimumWidth(): number {
    let minWidth = 0
    for (const block of this.blocks) {
      minWidth = Math.max(minWidth, block.getMinWidth())
    }
    return minWidth
  }

  getBlocks(): Block[] { return this.blocks }
  getX(): number { return this.x }
  getY(): number { return this.y }
  getWidth(): number { return this.width }
  setWidth(width: number): void { this.width = width }
  getHeight(): number { return this.height }
  setHeight(height: number): void { this.height = height }
}
