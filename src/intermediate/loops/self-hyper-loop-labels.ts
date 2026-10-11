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
 * SelfHyperLoopLabels (对应 ELK intermediate.loops.SelfHyperLoopLabels).
 */
import type { LEdgeLabel } from '../../graph/ledge.js'
import type { KVector } from '../../graph/enums.js'
import { Direction, PortSide } from '../../graph/enums.js'
import { SPACING_LABEL_LABEL } from '../../options/layered-options.js'
import type { SelfHyperLoop } from './self-hyper-loop.js'
import type { SelfLoopPort } from './self-loop-port.js'

export enum LabelAlignment {
  CENTER = 'CENTER',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
  TOP = 'TOP',
}

/** 自环超边关联的标签集合. */
export class SelfHyperLoopLabels {
  id = 0
  private lLabels: LEdgeLabel[] = []
  private size: KVector = { x: 0, y: 0 }
  private position: KVector = { x: 0, y: 0 }
  private readonly layoutDirection: Direction
  private readonly labelLabelSpacing: number
  private side: PortSide | null = null
  private alignment: LabelAlignment | null = null
  private alignmentReferenceSLPort: SelfLoopPort | null = null

  constructor(slLoop: SelfHyperLoop) {
    const lNode = slLoop.getSLHolder().getLNode()
    this.layoutDirection = lNode.getGraph()!.getProperty(DIRECTION_PROP)
    this.labelLabelSpacing = lNode.getGraph()!.getProperty(SPACING_LABEL_LABEL)
  }

  addLLabels(newLLabels: LEdgeLabel[]): void {
    for (const newLLabel of newLLabels) {
      this.lLabels.push(newLLabel)
      this.updateSize(newLLabel)
    }
  }

  getLLabels(): LEdgeLabel[] { return this.lLabels }
  getSize(): KVector { return this.size }
  getPosition(): KVector { return this.position }
  getSide(): PortSide { return this.side! }
  setSide(side: PortSide): void { this.side = side }
  getAlignment(): LabelAlignment { return this.alignment! }
  setAlignment(alignment: LabelAlignment): void { this.alignment = alignment }
  getAlignmentReferenceSLPort(): SelfLoopPort | null { return this.alignmentReferenceSLPort }
  setAlignmentReferenceSLPort(port: SelfLoopPort | null): void { this.alignmentReferenceSLPort = port }

  private updateSize(newLLabel: LEdgeLabel): void {
    const newSize = newLLabel.size
    if (this.layoutDirection === Direction.LEFT || this.layoutDirection === Direction.RIGHT) {
      // 标签垂直堆叠
      this.size.x = Math.max(this.size.x, newSize.x)
      this.size.y += newSize.y
      if (this.lLabels.length > 1) this.size.y += this.labelLabelSpacing
    } else {
      // 标签水平堆叠
      this.size.x += newSize.x
      this.size.y = Math.max(this.size.y, newSize.y)
      if (this.lLabels.length > 1) this.size.x += this.labelLabelSpacing
    }
  }

  /** 应用包围盒位置到各标签 (相对节点原点, 由调用方加 offset). */
  applyPlacement(offset: KVector): void {
    if (this.layoutDirection === Direction.LEFT || this.layoutDirection === Direction.RIGHT) {
      this.applyPlacementForHorizontalLayout(offset)
    } else {
      this.applyPlacementForVerticalLayout(offset)
    }
  }

  private applyPlacementForHorizontalLayout(offset: KVector): void {
    let x = this.position.x
    let y = this.position.y
    for (const lLabel of this.lLabels) {
      const labelPos = lLabel.position
      if (this.alignment === LabelAlignment.LEFT || this.side === PortSide.EAST) {
        labelPos.x = x
      } else if (this.alignment === LabelAlignment.RIGHT || this.side === PortSide.WEST) {
        labelPos.x = x + this.size.x - lLabel.size.x
      } else {
        labelPos.x = x + (this.size.x - lLabel.size.x) / 2
      }
      labelPos.y = y
      labelPos.x += offset.x
      labelPos.y += offset.y
      y += lLabel.size.y + this.labelLabelSpacing
    }
  }

  private applyPlacementForVerticalLayout(offset: KVector): void {
    let x = this.position.x
    let y = this.position.y
    for (const lLabel of this.lLabels) {
      const labelPos = lLabel.position
      labelPos.x = x
      if (this.side === PortSide.NORTH) {
        labelPos.y = y + this.size.y - lLabel.size.y
      } else {
        labelPos.y = y
      }
      labelPos.x += offset.x
      labelPos.y += offset.y
      x += lLabel.size.x + this.labelLabelSpacing
    }
  }
}

import { DIRECTION as DIRECTION_PROP } from '../../options/layered-options.js'
