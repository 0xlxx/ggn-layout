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
 * Scanline (对应 ELK compaction.recthull.Scanline) — 扫面线算法脚手架.
 */
export interface EventHandler<T> {
  handle(p: T): void
}

export function scanlineExecute<T>(points: Iterable<T>, comparator: (a: T, b: T) => number, eventHandler: EventHandler<T>): void {
  // 复制并排序 (会重排副本).
  const copy = [...points]
  copy.sort(comparator)
  for (const p of copy) eventHandler.handle(p)
}
