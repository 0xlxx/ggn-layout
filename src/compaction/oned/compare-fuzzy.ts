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
/** CompareFuzzy (对应 ELK compaction.oned.CompareFuzzy) — 容差浮点比较. */
const TOLERANCE = 0.0001

function fuzzyCompare(d1: number, d2: number): number {
  if (Math.abs(d1 - d2) <= TOLERANCE) return 0
  return d1 < d2 ? -1 : 1
}

export const CompareFuzzy = {
  eq(d1: number, d2: number): boolean { return fuzzyCompare(d1, d2) === 0 },
  gt(d1: number, d2: number): boolean { return fuzzyCompare(d1, d2) > 0 },
  lt(d1: number, d2: number): boolean { return fuzzyCompare(d1, d2) < 0 },
  ge(d1: number, d2: number): boolean { return fuzzyCompare(d1, d2) >= 0 },
  le(d1: number, d2: number): boolean { return fuzzyCompare(d1, d2) <= 0 },
}
