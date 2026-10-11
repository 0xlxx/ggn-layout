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
/** CGraph (对应 ELK layered compaction.oned.CGraph). */
import { Direction } from '../../graph/enums.js'
import type { CGroup } from './cgroup.js'
import type { CNode } from './cnode.js'

export class CGraph {
  cNodes: CNode[] = []
  cGroups: CGroup[] = []
  /** 预计算约束 (ELK CGraph.predefinedHorizontalConstraints; 段链先后, calculateConstraints 时按方向应用). */
  predefinedHorizontalConstraints: [CNode, CNode][] = []
  private supportedDirections: Set<Direction>

  constructor(supportedDirections: Iterable<Direction>) {
    this.supportedDirections = new Set(supportedDirections)
  }

  supports(direction: Direction): boolean {
    return this.supportedDirections.has(direction)
  }
}
