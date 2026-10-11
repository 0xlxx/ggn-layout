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
 * Point (对应 ELK compaction.recthull.Point) + Quadrant 枚举.
 */
export enum Quadrant {
  // 顺序重要: Q1, Q4, Q2, Q3
  Q1 = 'Q1',
  Q4 = 'Q4',
  Q2 = 'Q2',
  Q3 = 'Q3',
}

export namespace Quadrant {
  export function isUpper(q: Quadrant): boolean { return q === Quadrant.Q1 || q === Quadrant.Q2 }
  export function isLeft(q: Quadrant): boolean { return q === Quadrant.Q1 || q === Quadrant.Q4 }
  /** 两个象限是否同在左侧或同在右侧. */
  export function isBothLeftOrBothRight(q1: Quadrant, q2: Quadrant): boolean {
    return (q1 === Quadrant.Q1 && q2 === Quadrant.Q4) || (q1 === Quadrant.Q4 && q2 === Quadrant.Q1)
      || (q1 === Quadrant.Q3 && q2 === Quadrant.Q2) || (q1 === Quadrant.Q2 && q2 === Quadrant.Q3)
  }
  /** 一个在左一个在右. */
  export function isOneLeftOneRight(q1: Quadrant, q2: Quadrant): boolean {
    return (q1 === Quadrant.Q1 && (q2 === Quadrant.Q2 || q2 === Quadrant.Q3))
      || (q1 === Quadrant.Q4 && (q2 === Quadrant.Q3 || q2 === Quadrant.Q2))
  }
}

/** rectilinear 凸包专用点. */
export class Point {
  x: number
  y: number
  quadrant: Quadrant | null = null
  convex = true

  constructor(x: number, y: number, quadrant?: Quadrant) {
    this.x = x
    this.y = y
    if (quadrant !== undefined) this.quadrant = quadrant
  }

  equals(other: Point): boolean {
    return this.x === other.x && this.y === other.y
  }
}
