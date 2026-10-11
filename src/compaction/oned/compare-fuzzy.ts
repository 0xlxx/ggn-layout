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
