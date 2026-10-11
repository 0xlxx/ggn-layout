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
