/*
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout. It is original work of the GGN project and
 * is made available under the terms of the MIT License.
 *
 * SPDX-License-Identifier: MIT
 * License text: LICENSE.
 */
/** Layout pipeline phases exposed by the synchronous control hook. */
export type LayoutPhase = 'validate' | 'clone' | 'dispatch' | 'extract' | 'format'

/**
 * Progress reported at a layout phase boundary.
 *
 * `completed` is the current phase sequence number for the synchronous API;
 * `total` is intentionally optional because the inner algorithm is not
 * instrumented as a cancellable work queue.
 */
export interface LayoutProgressEvent {
  phase: LayoutPhase
  completed: number
  total?: number
  graphId?: string
}

/**
 * Optional progress and cooperative-cancellation controls for layout.
 *
 * The synchronous API checks `signal.aborted` only at phase boundaries
 * (`validate`, `clone`, `dispatch`, `extract`, and `format`). It cannot
 * guarantee that an inner layout algorithm stops immediately. When an abort
 * is observed, layout throws `LayoutError` with code `ABORTED` and the phase
 * in which the abort was detected. If `onProgress` itself triggers
 * `signal.abort()`, the abort is re-checked immediately after the callback
 * and takes effect before the next phase begins any real work.
 */
export interface LayoutControl {
  signal?: AbortSignal
  onProgress?: (event: LayoutProgressEvent) => void
}
