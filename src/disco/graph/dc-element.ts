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
 * DCElement — alg.disco.graph.DCElement (0.12.0).
 * DCGraph 的元素: 节点/边/标签统一表示为闭合多边形 (顶点链),
 * 短层级边由 DCExtension 表示.
 */
import { KVector } from '../../force/kvector.js'
import { KVectorChain, Rect, rectIntersectsChain, rectContainsChain } from '../geometry.js'
import type { DCExtension } from './dc-extension.js'
import type { DCComponent } from './dc-component.js'

export class DCElement {
  /** 多边形顶点链表示的形状. */
  private readonly shape: KVectorChain
  /** shape 的包围盒. */
  private readonly bounds: Rect
  /** 所属 DCComponent. */
  private cp: DCComponent | null = null
  /** 调试用顶点坐标数组 (x_0, y_0, ...). */
  private coords: number[] | null = null
  /** 调试用父节点坐标. */
  private parentCoords: KVector | null = null
  /** 挂在本元素上的短层级边扩展. */
  private extensions: DCExtension[] = []

  constructor(polyPath: KVectorChain) {
    this.shape = polyPath
    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY
    const pts = polyPath.toArray()
    for (const v of pts) {
      minX = Math.min(minX, v.x)
      minY = Math.min(minY, v.y)
      maxX = Math.max(maxX, v.x)
      maxY = Math.max(maxY, v.y)
    }
    this.bounds = new Rect(minX, minY, maxX - minX, maxY - minY)
  }

  /** 分量压缩后需加到元素原位置的偏移 (来自所属 DCComponent). */
  getOffset(): KVector {
    return this.cp!.getOffset()
  }

  /** 顶点坐标 (调试用, 缓存). */
  getCoords(): number[] {
    if (this.coords !== null) {
      return this.coords
    }
    this.coords = new Array<number>(this.shape.size() * 2)
    let i = 0
    this.shape.each((c) => {
      this.coords![i] = c.x
      this.coords![i + 1] = c.y
      i += 2
    })
    return this.coords
  }

  addExtension(extension: DCExtension): void {
    this.extensions.push(extension)
  }

  getExtensions(): DCExtension[] {
    return this.extensions
  }

  getBounds(): Rect {
    return this.bounds
  }

  setParentCoords(pCoords: KVector): void {
    this.parentCoords = pCoords
  }

  getParentcoords(): KVector | null {
    return this.parentCoords
  }

  setComponent(comp: DCComponent): void {
    this.cp = comp
  }

  /** 与矩形相交或完全包含矩形 (ElkMath.intersects || ElkMath.contains). */
  intersects(rect: Rect): boolean {
    return rectIntersectsChain(rect, this.shape) || rectContainsChain(rect, this.shape)
  }
}
