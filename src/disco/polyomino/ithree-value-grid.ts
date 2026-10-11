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
