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
 * IThreeValueGrid — alg.common.polyomino.structures.IThreeValueGrid 接口 (0.12.0).
 * 离散 ℕ x ℕ 网格, 每格三态: empty / blocked / weakly blocked.
 */
export interface IThreeValueGrid {
  getWidth(): number
  getHeight(): number
  isEmpty(x: number, y: number): boolean
  isBlocked(x: number, y: number): boolean
  isWeaklyBlocked(x: number, y: number): boolean
  inBounds(x: number, y: number): boolean
  reinitialize(width: number, height: number): void
  setEmpty(x: number, y: number): void
  setBlocked(x: number, y: number): void
  setWeaklyBlocked(x: number, y: number): void
}

/** 越界异常 (Java IndexOutOfBoundsException 语义). */
export class GridIndexOutOfBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IndexOutOfBoundsException'
  }
}
