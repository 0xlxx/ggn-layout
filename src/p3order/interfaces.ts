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
 * ICrossingMinimizationHeuristic (对应 ELK p3order.ICrossingMinimizationHeuristic).
 */
import type { LNode } from '../graph/lnode.js'
import type { IInitializable } from './all-crossings-counter.js'

export interface ICrossingMinimizationHeuristic extends IInitializable {
  alwaysImproves(): boolean
  setFirstLayerOrder(order: LNode[][], forwardSweep: boolean): boolean
  minimizeCrossings(order: LNode[][], freeLayerIndex: number, forwardSweep: boolean, isFirstSweep: boolean): boolean
  isDeterministic(): boolean
}
