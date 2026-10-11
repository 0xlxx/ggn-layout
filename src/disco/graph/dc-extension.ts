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
 * DCExtension — alg.disco.graph.DCExtension (0.12.0).
 * 短层级边概念化为半无限条带, 止于某 DCElement 并挂在其上.
 */
import { KVector } from '../../force/kvector.js'
import { DCDirection } from './dc-direction.js'
import type { DCElement } from './dc-element.js'

export class DCExtension {
  private parent: DCElement
  private direction: DCDirection
  /** 相对元素左上角的偏移 (各坐标系原点在显示区左上角). */
  private offset: KVector
  private width: number

  /**
   * 创建 beam 状扩展.
   *
   * @param parent 扩展附着元素
   * @param direction 扩展指向的基本方向
   * @param middlePos 扩展在元素上的精确附着点 (宽度 > 1 时, 该点把 beam 精确切半)
   * @param width 扩展宽度
   */
  constructor(parent: DCElement, direction: DCDirection, middlePos: KVector, width: number) {
    this.parent = parent
    this.direction = direction
    this.width = width

    const bounds = parent.getBounds()
    this.offset = new KVector(-bounds.x, -bounds.y)
    this.offset.add(middlePos)
    // adjust position so that the Vector describes the left bound of the extension when viewed clock wise
    const halfWidth = width / 2
    // If horizontal extension ...
    if (DCDirection.isHorizontal(direction)) {
      // ... subtract half the width vertically (KVector.sub(x, y) 原地)
      this.offset.y -= halfWidth
    } else {
      // other case is analog
      this.offset.x -= halfWidth
    }

    parent.addExtension(this)
  }

  getParent(): DCElement {
    return this.parent
  }

  getDirection(): DCDirection {
    return this.direction
  }

  getOffset(): KVector {
    return this.offset
  }

  getWidth(): number {
    return this.width
  }
}
