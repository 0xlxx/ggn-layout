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
 * DCComponent — alg.disco.graph.DCComponent (0.12.0).
 * DCGraph 的一个连通分量 (元素集合 + 压缩器设置的偏移).
 * Java HashSet 迭代顺序不影响结果 (min/max 归约与短路布尔均与顺序无关).
 */
import { KVector } from '../../force/kvector.js'
import { Rect } from '../geometry.js'
import { DCDirection } from './dc-direction.js'
import type { DCElement } from './dc-element.js'

export class DCComponent {
  /** 相对原位置的偏移, 由压缩器设置. */
  private offset: KVector
  /** 分量内全部元素 (节点/边/标签...). */
  private shapes: Set<DCElement>
  /** 部分字段是否需要更新. */
  private changed = true
  /** 分量包围矩形尺寸. */
  private bounds: KVector | null = null
  /** 分量包围矩形左上角 (含 offset). */
  private minCornerOfBoundingRectangle: KVector | null = null
  /** 调试用 id. */
  private id = -1

  constructor() {
    this.offset = new KVector(0, 0)
    this.shapes = new Set()
  }

  setOffset(offset: KVector): void {
    this.changed = true
    this.offset = offset
  }

  getOffset(): KVector {
    return this.offset
  }

  getElements(): Set<DCElement> {
    return this.shapes
  }

  getDimensionsOfBoundingRectangle(): KVector {
    if (this.changed) {
      this.update()
    }
    return this.bounds!
  }

  getMinCorner(): KVector {
    if (this.changed) {
      this.update()
    }
    return this.minCornerOfBoundingRectangle!
  }

  intersects(rect: Rect): boolean {
    for (const elem of this.shapes) {
      if (elem.intersects(rect)) {
        return true
      }
    }
    return false
  }

  addElement(element: DCElement): void {
    this.changed = true
    this.shapes.add(element)
    element.setComponent(this)
  }

  addElements(elements: Iterable<DCElement>): void {
    for (const elem of elements) {
      this.addElement(elem)
    }
  }

  /** 更新包围矩形的位置与尺寸 (分量被修改后, 请求包围盒属性时调用). */
  private update(): void {
    this.changed = false
    let minX = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const elem of this.shapes) {
      const elemBounds = elem.getBounds()

      minX = Math.min(minX, elemBounds.x)
      maxX = Math.max(maxX, elemBounds.x + elemBounds.width)
      minY = Math.min(minY, elemBounds.y)
      maxY = Math.max(maxY, elemBounds.y + elemBounds.height)

      for (const ext of elem.getExtensions()) {
        const dir: DCDirection = ext.getDirection()
        let minPos: number
        let maxPos: number

        if (DCDirection.isHorizontal(dir)) {
          minPos = elemBounds.y + ext.getOffset().y
          maxPos = minPos + ext.getWidth()
          minY = Math.min(minY, minPos)
          maxY = Math.max(maxY, maxPos)
        } else {
          minPos = elemBounds.x + ext.getOffset().x
          maxPos = minPos + ext.getWidth()
          minX = Math.min(minX, minPos)
          maxX = Math.max(maxX, maxPos)
        }
      }
    }

    this.bounds = new KVector(maxX - minX, maxY - minY)
    this.minCornerOfBoundingRectangle = new KVector(minX + this.offset.x, minY + this.offset.y)
  }

  getId(): number {
    return this.id
  }

  setId(id: number): void {
    this.id = id
  }
}
