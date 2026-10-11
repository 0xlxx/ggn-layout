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
