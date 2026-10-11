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
