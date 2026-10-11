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
 * ThresholdStrategy (对应 ELK p4nodes.bk.ThresholdStrategy).
 */
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import type { NeighborhoodInformation } from './neighborhood-information.js'
import { BKAlignedLayout, HDirection, VDirection } from './bk-aligned-layout.js'

export abstract class ThresholdStrategy {
  static THRESHOLD = Number.MAX_VALUE
  static EPSILON = 0.0001
  protected bal!: BKAlignedLayout
  protected ni!: NeighborhoodInformation
  protected blockFinished = new Set<LNode>()
  protected postProcessablesQueue: Postprocessable[] = []
  protected postProcessablesStack: Postprocessable[] = []

  init(theBal: BKAlignedLayout, theNi: NeighborhoodInformation): void {
    this.bal = theBal
    this.ni = theNi
    this.blockFinished.clear()
    this.postProcessablesQueue = []
    this.postProcessablesStack = []
  }

  finishBlock(n: LNode): void {
    this.blockFinished.add(n)
  }

  abstract calculateThreshold(oldThresh: number, blockRoot: LNode, currentNode: LNode): number
  abstract postProcess(): void

  protected getOther(edge: LEdge, n: LNode): LNode {
    if (edge.getSource()!.getNode() === n) return edge.getTarget()!.getNode()!
    if (edge.getTarget()!.getNode() === n) return edge.getSource()!.getNode()!
    throw new Error('Node neither source nor target of edge')
  }
}

export class NullThresholdStrategy extends ThresholdStrategy {
  calculateThreshold(oldThresh: number, blockRoot: LNode, currentNode: LNode): number {
    void blockRoot
    void currentNode
    return this.bal.vdir === VDirection.UP ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
  }

  postProcess(): void {}
}

export class SimpleThresholdStrategy extends ThresholdStrategy {
  /** getBound 常用路径免分配: 复用 scratch Postprocessable (仅非排队路径). */
  private scratchPostprocessable: Postprocessable | null = null

  calculateThreshold(oldThresh: number, blockRoot: LNode, currentNode: LNode): number {
    const isRoot = blockRoot === currentNode
    const isLast = this.bal.align[currentNode.id] === blockRoot
    if (!(isRoot || isLast)) return oldThresh
    let t = oldThresh
    if (isRoot) t = this.getBound(blockRoot, true)
    if (!Number.isFinite(t) && isLast) t = this.getBound(currentNode, false)
    return t
  }

  private pickEdge(pp: Postprocessable): Postprocessable {
    const edges = pp.isRoot
      ? (this.bal.hdir === HDirection.RIGHT ? pp.free.getIncomingEdges() : pp.free.getOutgoingEdges())
      : (this.bal.hdir === HDirection.LEFT ? pp.free.getIncomingEdges() : pp.free.getOutgoingEdges())

    let hasEdges = false
    for (const e of edges) {
      const onlyDummies = this.bal.od[this.bal.root[pp.free.id]!.id]
      if (!onlyDummies && e.isInLayerEdge()) continue
      if (this.bal.su[this.bal.root[pp.free.id]!.id] || this.bal.su[this.bal.root[pp.free.id]!.id]) continue
      hasEdges = true
      if (this.blockFinished.has(this.bal.root[this.getOther(e, pp.free).id]!)) {
        pp.hasEdges = true
        pp.edge = e
        return pp
      }
    }
    pp.hasEdges = hasEdges
    pp.edge = null
    return pp
  }

  private getBound(blockNode: LNode, isRoot: boolean): number {
    const invalid = this.bal.vdir === VDirection.UP ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY
    let pp = this.scratchPostprocessable
    if (pp === null) {
      pp = new Postprocessable(blockNode, isRoot)
      this.scratchPostprocessable = pp
    } else {
      pp.free = blockNode
      pp.isRoot = isRoot
      pp.hasEdges = false
      pp.edge = null
    }
    const pick = this.pickEdge(pp)

    if (pick.edge === null && pick.hasEdges) {
      const queued = new Postprocessable(blockNode, isRoot)
      queued.hasEdges = pick.hasEdges
      this.postProcessablesQueue.push(queued)
      return invalid
    } else if (pick.edge !== null) {
      let threshold: number
      const left = pick.edge.getSource()!
      const right = pick.edge.getTarget()!
      if (isRoot) {
        const rootPort = this.bal.hdir === HDirection.RIGHT ? right : left
        const otherPort = this.bal.hdir === HDirection.RIGHT ? left : right
        const otherRoot = this.bal.root[otherPort.getNode()!.id]!
        threshold = this.bal.y[otherRoot.id]!
          + this.bal.innerShift[otherPort.getNode()!.id]! + otherPort.getPosition().y + otherPort.getAnchor().y
          - this.bal.innerShift[rootPort.getNode()!.id]! - rootPort.getPosition().y - rootPort.getAnchor().y
      } else {
        const rootPort = this.bal.hdir === HDirection.LEFT ? right : left
        const otherPort = this.bal.hdir === HDirection.LEFT ? left : right
        threshold = this.bal.y[this.bal.root[otherPort.getNode()!.id]!.id]!
          + this.bal.innerShift[otherPort.getNode()!.id]! + otherPort.getPosition().y + otherPort.getAnchor().y
          - this.bal.innerShift[rootPort.getNode()!.id]! - rootPort.getPosition().y - rootPort.getAnchor().y
      }
      this.bal.su[this.bal.root[left.getNode()!.id]!.id] = 1
      this.bal.su[this.bal.root[right.getNode()!.id]!.id] = 1
      return threshold
    }
    return invalid
  }

  postProcess(): void {
    while (this.postProcessablesQueue.length > 0) {
      const pp = this.postProcessablesQueue.shift()!
      const pick = this.pickEdge(pp)
      if (pick.edge === null) continue
      const edge = pick.edge
      const onlyDummies = this.bal.od[this.bal.root[pp.free.id]!.id]
      if (!onlyDummies && edge.isInLayerEdge()) continue
      const moved = this.process(pp)
      if (!moved) this.postProcessablesStack.push(pp)
    }
    while (this.postProcessablesStack.length > 0) {
      this.process(this.postProcessablesStack.pop()!)
    }
  }

  private process(pp: Postprocessable): boolean {
    const edge = pp.edge!
    let fix: LEdge['source']
    let block: LEdge['source']
    if (edge.getSource()!.getNode() === pp.free) {
      fix = edge.getTarget()!
      block = edge.getSource()!
    } else {
      fix = edge.getSource()!
      block = edge.getTarget()!
    }

    const delta = this.bal.calculateDelta(fix, block)

    if (delta > 0 && delta < ThresholdStrategy.THRESHOLD) {
      const availableSpace = this.bal.checkSpaceAbove(block.getNode()!, delta, this.ni)
      this.bal.shiftBlock(block.getNode()!, -availableSpace)
      return availableSpace > 0
    } else if (delta < 0 && -delta < ThresholdStrategy.THRESHOLD) {
      const availableSpace = this.bal.checkSpaceBelow(block.getNode()!, -delta, this.ni)
      this.bal.shiftBlock(block.getNode()!, availableSpace)
      return availableSpace > 0
    }
    return false
  }
}

export class Postprocessable {
  free: LNode
  isRoot: boolean
  hasEdges = false
  edge: LEdge | null = null

  constructor(free: LNode, isRoot: boolean) {
    this.free = free
    this.isRoot = isRoot
  }
}
