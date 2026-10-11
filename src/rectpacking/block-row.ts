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
 * Block 内的行 (util/BlockRow.java).
 * 一行内的矩形从左到右排列, 记录行宽高; expand 时把额外宽高均分给矩形.
 */
import type { ElkNode } from '../api/elk-json.js'

export class BlockRow {
  private x: number
  private y: number
  /** 行宽 + nodeNodeSpacing 已包含在 rect 位置里, 宽度 = 最后 rect 右边 - x. */
  private width = 0
  /** 行高 = 最大节点高 (+spacing 在 updateRow 后减掉). */
  private height = 0
  private readonly nodeNodeSpacing: number
  private rects: ElkNode[] = []

  constructor(x: number, y: number, nodeNodeSpacing: number) {
    this.x = x
    this.y = y
    this.nodeNodeSpacing = nodeNodeSpacing
  }

  /** 在行尾添加矩形 (Java addRectangle). */
  addRectangle(rect: ElkNode): boolean {
    rect.x = this.x + this.width + (this.rects.length === 0 ? 0 : this.nodeNodeSpacing)
    rect.y = this.y
    this.height = Math.max(this.height, rect.height ?? 0)
    this.width += (rect.width ?? 0) + (this.rects.length === 0 ? 0 : this.nodeNodeSpacing)
    this.rects.push(rect)
    return true
  }

  removeRectangle(rect: ElkNode, update: boolean): void {
    const idx = this.rects.indexOf(rect)
    if (idx !== -1) this.rects.splice(idx, 1)
    if (update) this.updateRow()
  }

  /** 重算所有矩形坐标 + 行宽高 (Java updateRow). */
  updateRow(): void {
    let width = 0
    let height = 0
    for (const rect of this.rects) {
      rect.x = this.x + width
      rect.y = this.y
      width += (rect.width ?? 0) + this.nodeNodeSpacing
      height = Math.max(height, (rect.height ?? 0) + this.nodeNodeSpacing)
    }
    this.width = width - this.nodeNodeSpacing
    this.height = height - this.nodeNodeSpacing
  }

  /** 扩宽/加高: 额外宽度均分给每个矩形, 矩形高度 = 新行高 (Java expand). */
  expand(widthForRow: number, additionalHeightForRow: number, index: number): void {
    const additionalWidthForRect = (widthForRow - this.width) / this.rects.length
    let i = 0
    this.height += additionalHeightForRow
    this.width = widthForRow
    for (const rect of this.rects) {
      const oldWidth = rect.width ?? 0
      const oldHeight = rect.height ?? 0
      rect.x = (rect.x ?? 0) + i * additionalWidthForRect
      rect.y = (rect.y ?? 0) + index * additionalHeightForRow
      rect.width = (rect.width ?? 0) + additionalWidthForRect
      rect.height = this.height
      i++
      // ElkUtil.translate(rect, (newWidth,newHeight), (oldWidth,oldHeight)):
      // 内容对齐 (topLeft 默认 → 无位移), 见 rect-packing-layout.contentAlignTranslate.
      const newWidth = rect.width
      const newHeight = rect.height
      contentAlignTranslate(rect, newWidth, newHeight, oldWidth, oldHeight)
    }
  }

  getY(): number { return this.y }
  setY(y: number): void { this.y = y }
  getWidth(): number { return this.width }
  getHeight(): number { return this.height }
  getNodes(): ElkNode[] { return this.rects }
  getX(): number { return this.x }
  setX(x: number): void { this.x = x }
}

/** ElkUtil.translate(parent, newSize, oldSize) 的内容对齐位移 (topLeft 默认无位移). */
function contentAlignTranslate(_node: ElkNode, _newWidth: number, _newHeight: number, _oldWidth: number, _oldHeight: number): void {
  // 默认 contentAlignment = topLeft → xTranslate/yTranslate = 0.
  // 当前 rectpacking 触发模型无 H_CENTER/H_RIGHT/V_CENTER/V_BOTTOM 配置, 保持无副作用;
  // 完整内容对齐见 rect-packing-layout.ts (translate 汇总).
  void _node; void _newWidth; void _newHeight; void _oldWidth; void _oldHeight
}
