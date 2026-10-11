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
 * Polyomino — alg.common.polyomino.structures.Polyomino (0.12.0).
 * 低分辨率网格表示的 polyomino, 可挂 extension (方向 + 偏移 + 宽度).
 */
import { PlanarGrid } from './planar-grid.js'
import { UniqueTriple } from '../geometry.js'
import type { Direction } from './direction.js'

export class Polyomino extends PlanarGrid {
  /** 加入其他网格时, 左上角相对该网格的 x 坐标. */
  private x = 0
  /** 加入其他网格时, 左上角相对该网格的 y 坐标. */
  private y = 0

  private polyominoExtensions: UniqueTriple<Direction, number, number>[]

  constructor(width = 0, height = 0, extensions: UniqueTriple<Direction, number, number>[] = []) {
    super(width, height)
    this.polyominoExtensions = extensions
  }

  getX(): number {
    return this.x
  }

  getY(): number {
    return this.y
  }

  setX(val: number): void {
    this.x = val
  }

  setY(val: number): void {
    this.y = val
  }

  getPolyominoExtensions(): UniqueTriple<Direction, number, number>[] {
    return this.polyominoExtensions
  }

  /** 在 polyomino 边界附加 extension (方向 + 相对原点的水平/垂直偏移 + 离散格宽度). */
  addExtension(dir: Direction, offset: number, width: number): void {
    this.polyominoExtensions.push(new UniqueTriple(dir, offset, width))
  }
}
