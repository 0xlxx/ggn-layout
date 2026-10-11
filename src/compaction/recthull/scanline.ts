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
