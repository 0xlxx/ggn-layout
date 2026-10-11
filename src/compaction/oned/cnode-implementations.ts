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
 * LNodeCNode / VerticalSegmentCNode — CNode 具体实现 (对应 ELK LGraphToCGraphTransformer 的
 * transformNodes / verticalSegmentToCNode). origin 分别为 LNode / VerticalSegment.
 */
import type { LNode } from '../../graph/lnode.js'
import { CNode } from './cnode.js'
import type { VerticalSegment } from './vertical-segment.js'

/** 节点 CNode: hitbox = 节点位置 - margin, 尺寸 + margin (ELK transformNodes). */
export class LNodeCNode extends CNode {
  constructor(public readonly lNode: LNode) {
    super()
    const m = lNode.getMargin()
    const pos = lNode.getPosition()
    const size = lNode.getSize()
    this.hitbox = {
      x: pos.x - m.left,
      y: pos.y - m.top,
      width: size.x + m.left + m.right,
      height: size.y + m.top + m.bottom,
    }
  }

  getHorizontalSpacing(): number { return 0 }
  getVerticalSpacing(): number { return 0 }

  /** 压缩后写回 LNode 的 x (ELK applyLayout: lNode.getPosition().x = hitbox.x + margin.left). */
  applyElementPosition(): void {
    this.lNode.getPosition().x = this.hitbox.x + this.lNode.getMargin().left
  }

  getElementPosition(): number { return this.hitbox.x }
}

/** 垂直段 CNode: 压缩后平移弯点/包围盒/junction points (ELK applyLayout). */
export class VerticalSegmentCNode extends CNode {
  constructor(public readonly vs: VerticalSegment) {
    super()
    this.hitbox = { ...vs.hitbox }
  }

  getHorizontalSpacing(): number { return 0 }
  getVerticalSpacing(): number { return 0 }

  applyElementPosition(): void {
    const pre = this.hitboxPreCompaction
    const deltaX = pre === null ? 0 : this.hitbox.x - pre.x
    for (const b of this.vs.affectedBends) b.x += deltaX
    for (const bb of this.vs.affectedBoundingBoxes) bb.x += deltaX
    for (const jp of this.vs.junctionPoints) jp.x += deltaX
  }

  getElementPosition(): number { return this.hitbox.x }
}
