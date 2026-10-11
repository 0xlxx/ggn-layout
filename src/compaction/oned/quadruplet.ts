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
/** Quadruplet (对应 ELK compaction.oned.Quadruplet) — 4 方向锁/间距忽略标记. */
import { Direction } from '../../graph/enums.js'

export class Quadruplet {
  left = false
  right = false
  up = false
  down = false

  constructor(l = false, r = false, u = false, d = false) {
    this.set(l, r, u, d)
  }

  set(l: boolean, r: boolean, u: boolean, d: boolean): void
  /** 2 参重载 (对应 ELK Quadruplet.set(value, direction)): 只设置单个方向的字段. */
  set(value: boolean, direction: Direction): void
  set(a: boolean, b: boolean | Direction, c?: boolean, d?: boolean): void {
    if (typeof b === 'boolean') {
      this.left = a; this.right = b; this.up = c ?? false; this.down = d ?? false
    } else {
      this.setDirection(a, b)
    }
  }

  setDirection(value: boolean, direction: Direction): void {
    switch (direction) {
      case Direction.LEFT: this.left = value; break
      case Direction.RIGHT: this.right = value; break
      case Direction.UP: this.up = value; break
      case Direction.DOWN: this.down = value; break
      default: break
    }
  }

  /** 逐方向 OR (ELK Quadruplet.applyOr). */
  applyOr(other: Quadruplet): void {
    this.left = this.left || other.left
    this.right = this.right || other.right
    this.up = this.up || other.up
    this.down = this.down || other.down
  }

  get(direction: Direction): boolean {
    switch (direction) {
      case Direction.LEFT: return this.left
      case Direction.RIGHT: return this.right
      case Direction.UP: return this.up
      case Direction.DOWN: return this.down
      default: return false
    }
  }
}
