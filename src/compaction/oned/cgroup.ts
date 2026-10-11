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
/** CGroup (对应 ELK layered compaction.oned.CGroup) — 组内相对距离保持. */
import type { CNode } from './cnode.js'

export class CGroup {
  startPos = Number.NEGATIVE_INFINITY
  delta = 0
  deltaNormalized = 0
  cNodes: Set<CNode>
  incomingConstraints: Set<CNode>
  outDegree = 0
  reference: CNode | null = null
  id = 0
  reposition = true

  constructor(...inputCNodes: CNode[]) {
    this.cNodes = new Set()
    this.incomingConstraints = new Set()
    this.outDegree = 0
    for (const cNode of inputCNodes) {
      if (this.reference === null) this.reference = cNode
      this.addCNode(cNode)
    }
  }

  addCNode(cNode: CNode): void {
    if (cNode.cGroup !== null) throw new Error('CNode belongs to another CGroup.')
    this.cNodes.add(cNode)
    cNode.cGroup = this
  }

  removeCNode(cNode: CNode): boolean {
    const removed = this.cNodes.delete(cNode)
    if (removed) cNode.cGroup = null
    return removed
  }
}
