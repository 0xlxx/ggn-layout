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
 * LabelCell (对应 ELK alg.common.nodespacing.cellsystem.LabelCell).
 *
 * 端标签 (HEAD/TAIL) 收集容器: 管理一组标签的尺寸与放置.
 * horizontalLayoutMode=true (水平布局方向): 标签沿 y 纵向堆叠; false (垂直布局方向): 沿 x 横向堆叠.
 * 标签无独立 property 表 (ggn LEdgeLabel 为纯数据), END_LABEL_EDGE 用平行数组记录.
 */
import type { LEdgeLabel } from '../../graph/ledge.js'
import type { LEdge } from '../../graph/ledge.js'

/** 标签水平对齐 (对应 HorizontalLabelAlignment). */
export enum HorizontalLabelAlignment {
  LEFT = 'LEFT',
  CENTER = 'CENTER',
  RIGHT = 'RIGHT',
}

/** 标签垂直对齐 (对应 VerticalLabelAlignment). */
export enum VerticalLabelAlignment {
  TOP = 'TOP',
  CENTER = 'CENTER',
  BOTTOM = 'BOTTOM',
}

export interface LabelEntry {
  label: LEdgeLabel
  /** 标签所属边 (END_LABEL_EDGE; 长边拆分后可为 dummy 段边). */
  edge: LEdge | null
}

export class LabelCell {
  /** 水平/垂直布局模式. */
  private readonly horizontalLayoutMode: boolean
  /** 标签间 gap. */
  private readonly gap: number
  private horizontalAlignment: HorizontalLabelAlignment = HorizontalLabelAlignment.CENTER
  private verticalAlignment: VerticalLabelAlignment = VerticalLabelAlignment.CENTER
  private entries: LabelEntry[] = []
  private minimumContentAreaSize: { x: number; y: number } = { x: 0, y: 0 }
  /** 单元格矩形 (相对节点左上角; 最终坐标由 EndLabelPreprocessor 放置, Postprocessor 平移). */
  cellRectangle: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 0, height: 0 }

  constructor(gap: number, horizontalLayoutMode: boolean) {
    this.gap = gap
    this.horizontalLayoutMode = horizontalLayoutMode
  }

  getHorizontalAlignment(): HorizontalLabelAlignment {
    return this.horizontalAlignment
  }

  setHorizontalAlignment(alignment: HorizontalLabelAlignment): this {
    this.horizontalAlignment = alignment
    return this
  }

  getVerticalAlignment(): VerticalLabelAlignment {
    return this.verticalAlignment
  }

  setVerticalAlignment(alignment: VerticalLabelAlignment): this {
    this.verticalAlignment = alignment
    return this
  }

  /** 标签条目列表 (可重排 — EndLabelSorter 用它排序). */
  getEntries(): LabelEntry[] {
    return this.entries
  }

  hasLabels(): boolean {
    return this.entries.length > 0
  }

  addLabel(label: LEdgeLabel, edge: LEdge | null): void {
    this.entries.push({ label, edge })
    const labelSize = label.size
    if (this.horizontalLayoutMode) {
      this.minimumContentAreaSize.x = Math.max(this.minimumContentAreaSize.x, labelSize.x)
      this.minimumContentAreaSize.y += labelSize.y
      if (this.entries.length > 1) this.minimumContentAreaSize.y += this.gap
    } else {
      this.minimumContentAreaSize.x += labelSize.x
      this.minimumContentAreaSize.y = Math.max(this.minimumContentAreaSize.y, labelSize.y)
      if (this.entries.length > 1) this.minimumContentAreaSize.x += this.gap
    }
  }

  getMinimumWidth(): number {
    return this.minimumContentAreaSize.x
  }

  getMinimumHeight(): number {
    return this.minimumContentAreaSize.y
  }

  /** 根据 cell 矩形 + 对齐方式给每个标签赋坐标 (对应 LabelCell.applyLabelLayout). */
  applyLabelLayout(): void {
    if (this.horizontalLayoutMode) {
      this.applyHorizontalModeLabelLayout()
    } else {
      this.applyVerticalModeLabelLayout()
    }
  }

  private applyHorizontalModeLabelLayout(): void {
    const cellRect = this.cellRectangle
    let yPos = cellRect.y
    if (this.verticalAlignment === VerticalLabelAlignment.CENTER) {
      yPos += (cellRect.height - this.minimumContentAreaSize.y) / 2
    } else if (this.verticalAlignment === VerticalLabelAlignment.BOTTOM) {
      yPos += cellRect.height - this.minimumContentAreaSize.y
    }
    for (const entry of this.entries) {
      const labelSize = entry.label.size
      entry.label.position.y = yPos
      yPos += labelSize.y + this.gap
      switch (this.horizontalAlignment) {
        case HorizontalLabelAlignment.LEFT:
          entry.label.position.x = cellRect.x
          break
        case HorizontalLabelAlignment.CENTER:
          entry.label.position.x = cellRect.x + (cellRect.width - labelSize.x) / 2
          break
        case HorizontalLabelAlignment.RIGHT:
          entry.label.position.x = cellRect.x + cellRect.width - labelSize.x
          break
      }
    }
  }

  private applyVerticalModeLabelLayout(): void {
    const cellRect = this.cellRectangle
    let xPos = cellRect.x
    if (this.horizontalAlignment === HorizontalLabelAlignment.CENTER) {
      xPos += (cellRect.width - this.minimumContentAreaSize.x) / 2
    } else if (this.horizontalAlignment === HorizontalLabelAlignment.RIGHT) {
      xPos += cellRect.width - this.minimumContentAreaSize.x
    }
    for (const entry of this.entries) {
      const labelSize = entry.label.size
      entry.label.position.x = xPos
      xPos += labelSize.x + this.gap
      switch (this.verticalAlignment) {
        case VerticalLabelAlignment.TOP:
          entry.label.position.y = cellRect.y
          break
        case VerticalLabelAlignment.CENTER:
          entry.label.position.y = cellRect.y + (cellRect.height - labelSize.y) / 2
          break
        case VerticalLabelAlignment.BOTTOM:
          entry.label.position.y = cellRect.y + cellRect.height - labelSize.y
          break
      }
    }
  }
}
