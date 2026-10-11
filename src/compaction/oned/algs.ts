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
 * compaction/oned 算法 (对应 ELK layered compaction.oned.algs):
 * ICompactionAlgorithm / IConstraintCalculationAlgorithm / LongestPathCompaction /
 * QuadraticConstraintCalculation / ScanlineConstraintCalculator.
 */
import { Direction } from '../../graph/enums.js'
import { CompareFuzzy } from './compare-fuzzy.js'
import type { CGroup } from './cgroup.js'
import type { CNode } from './cnode.js'
import type { OneDimensionalCompactor } from './oned-compactor.js'
import { scanlineExecute, type EventHandler } from '../recthull/scanline.js'

export interface ICompactionAlgorithm {
  compact(compactor: OneDimensionalCompactor): void
}

export interface IConstraintCalculationAlgorithm {
  calculateConstraints(compactor: OneDimensionalCompactor): void
}

/** 最长路径压缩: 类似 longest path layering. */
export class LongestPathCompaction implements ICompactionAlgorithm {
  compact(compactor: OneDimensionalCompactor): void {
    let minStartPos = Number.POSITIVE_INFINITY
    for (const cNode of compactor.cGraph.cNodes) {
      minStartPos = Math.min(minStartPos, cNode.cGroup!.reference!.hitbox.x + cNode.cGroupOffset.x)
    }

    const sinks: CGroup[] = []
    for (const group of compactor.cGraph.cGroups) {
      group.startPos = minStartPos
      if (group.outDegree === 0) sinks.push(group)
    }

    while (sinks.length > 0) {
      const group = sinks.shift()!
      let diff = group.reference!.hitbox.x

      for (const node of group.cNodes) {
        const suggestedX = group.startPos + node.cGroupOffset.x
        if (node.cGroup!.reposition || node.getPosition() < suggestedX) {
          node.startPos = suggestedX
        } else {
          node.startPos = node.hitbox.x
        }
      }

      diff -= group.reference!.startPos
      group.delta += diff
      if (compactor.direction === Direction.RIGHT || compactor.direction === Direction.DOWN) {
        group.deltaNormalized += diff
      } else {
        group.deltaNormalized -= diff
      }

      for (const node of group.cNodes) {
        for (const incNode of node.constraints) {
          const spacing = compactor.direction === Direction.LEFT || compactor.direction === Direction.RIGHT
            ? compactor.spacingsHandler.getHorizontalSpacing(node, incNode)
            : compactor.spacingsHandler.getVerticalSpacing(node, incNode)

          incNode.cGroup!.startPos = Math.max(incNode.cGroup!.startPos,
            node.startPos + node.hitbox.width + spacing - incNode.cGroupOffset.x)

          if (!incNode.reposition) {
            incNode.cGroup!.startPos = Math.max(incNode.cGroup!.startPos,
              incNode.getPosition() - incNode.cGroupOffset.x)
          }

          incNode.cGroup!.outDegree--
          if (incNode.cGroup!.outDegree === 0) sinks.push(incNode.cGroup!)
        }
      }
    }

    for (const cNode of compactor.cGraph.cNodes) {
      cNode.applyPosition()
    }
  }
}

/** 二次约束计算: B 与 A 的右影重叠则加约束 A->B. */
export class QuadraticConstraintCalculation implements IConstraintCalculationAlgorithm {
  calculateConstraints(compactor: OneDimensionalCompactor): void {
    for (const cNode of compactor.cGraph.cNodes) cNode.constraints.length = 0

    for (const cNode1 of compactor.cGraph.cNodes) {
      for (const cNode2 of compactor.cGraph.cNodes) {
        if (cNode1 === cNode2) continue
        if (cNode1.cGroup !== null && cNode1.cGroup === cNode2.cGroup) continue

        const spacing = compactor.direction === Direction.LEFT || compactor.direction === Direction.RIGHT
          ? compactor.spacingsHandler.getVerticalSpacing(cNode1, cNode2)
          : compactor.spacingsHandler.getHorizontalSpacing(cNode1, cNode2)

        if (cNode1 !== cNode2.parentNode
          && (cNode2.hitbox.x > cNode1.hitbox.x
            || (cNode1.hitbox.x === cNode2.hitbox.x && cNode1.hitbox.width < cNode2.hitbox.width))
          && CompareFuzzy.gt(cNode2.hitbox.y + cNode2.hitbox.height + spacing, cNode1.hitbox.y)
          && CompareFuzzy.lt(cNode2.hitbox.y, cNode1.hitbox.y + cNode1.hitbox.height + spacing)) {
          cNode1.constraints.push(cNode2)
        }
      }
    }
  }
}

/** 扫面线约束计算 (Lengauer 10.2.2.1.1.1). */
export class ScanlineConstraintCalculator implements IConstraintCalculationAlgorithm {
  protected static readonly EPSILON = 0.5

  protected compactor!: OneDimensionalCompactor

  calculateConstraints(theCompactor: OneDimensionalCompactor): void {
    this.compactor = theCompactor
    this.sweep(() => true, () => 0)
  }

  protected sweep(filterFun: (n: CNode) => boolean, spacingFun: (n: CNode) => number): void {
    this.blowUpHitboxes(filterFun, spacingFun)
    const points: Timestamp[] = []
    for (const n of this.compactor.cGraph.cNodes) {
      if (filterFun(n)) {
        points.push(new Timestamp(n, true))
        points.push(new Timestamp(n, false))
      }
    }
    // ELK ScanlineConstraintCalculator.reset:241-247 — 为所有 cGraph 节点分配递增 id
    // (cand 以 node.id 为索引; components compaction 的 CRectNode 不自带 id).
    let index = 0
    for (const n of this.compactor.cGraph.cNodes) {
      if (filterFun(n)) n.id = index++
    }
    this.handler.reset(this.compactor.cGraph.cNodes.length)
    scanlineExecute(points, constraintsScanlineComparator, this.handler)
    this.normalizeHitboxes(filterFun, spacingFun)
  }

  protected blowUpHitboxes(filter: (n: CNode) => boolean, spacingFun: (n: CNode) => number): void {
    for (const n of this.compactor.cGraph.cNodes) {
      if (!filter(n)) continue
      const spacing = spacingFun(n)
      if (spacing > 0) {
        if (!(this.compactor.direction === Direction.LEFT || this.compactor.direction === Direction.RIGHT
          ? n.spacingIgnore.up : n.spacingIgnore.left)) {
          n.hitbox.y -= Math.max(0, spacing / 2 - ScanlineConstraintCalculator.EPSILON)
        }
        if (!(this.compactor.direction === Direction.LEFT || this.compactor.direction === Direction.RIGHT
          ? n.spacingIgnore.down : n.spacingIgnore.right)) {
          n.hitbox.height += Math.max(0, spacing - 2 * ScanlineConstraintCalculator.EPSILON)
        }
      }
    }
  }

  protected normalizeHitboxes(filter: (n: CNode) => boolean, spacingFun: (n: CNode) => number): void {
    for (const n of this.compactor.cGraph.cNodes) {
      if (!filter(n)) continue
      const spacing = spacingFun(n)
      if (spacing > 0) {
        if (!(this.compactor.direction === Direction.LEFT || this.compactor.direction === Direction.RIGHT
          ? n.spacingIgnore.up : n.spacingIgnore.left)) {
          n.hitbox.y += Math.max(0, spacing / 2 - ScanlineConstraintCalculator.EPSILON)
        }
        if (!(this.compactor.direction === Direction.LEFT || this.compactor.direction === Direction.RIGHT
          ? n.spacingIgnore.down : n.spacingIgnore.right)) {
          n.hitbox.height -= spacing - 2 * ScanlineConstraintCalculator.EPSILON
        }
      }
    }
  }

  protected readonly handler = new ConstraintsScanlineHandler()
}

class Timestamp {
  constructor(public readonly node: CNode, public readonly low: boolean) {}
}

function tsY(p: Timestamp): number {
  return p.low ? p.node.hitbox.y : p.node.hitbox.y + p.node.hitbox.height
}

const constraintsScanlineComparator = (p1: Timestamp, p2: Timestamp): number => {
  const cmp = tsY(p1) - tsY(p2)
  if (cmp === 0) {
    if (!p1.low && p2.low) return -1
    if (!p2.low && p1.low) return 1
  }
  return cmp
}

class ConstraintsScanlineHandler implements EventHandler<Timestamp> {
  private intervals: CNode[] = []
  private cand: (CNode | null)[] = []

  reset(size: number): void {
    this.intervals = []
    this.cand = new Array<CNode | null>(size)
  }

  handle(p: Timestamp): void {
    if (p.low) this.insert(p)
    else this.delete(p)
  }

  private insert(p: Timestamp): void {
    this.intervals.push(p.node)
    this.intervals.sort((c1, c2) => (c1.hitbox.x + c1.hitbox.width / 2) - (c2.hitbox.x + c2.hitbox.width / 2))

    this.cand[p.node.id] = this.lower(p.node)
    const right = this.higher(p.node)
    if (right !== null) this.cand[right.id] = p.node
  }

  private delete(p: Timestamp): void {
    const left = this.lower(p.node)
    if (left !== null && left === this.cand[p.node.id]) {
      if (left.cGroup !== null && left.cGroup !== p.node.cGroup) {
        left.constraints.push(p.node)
      }
    }

    const right = this.higher(p.node)
    if (right !== null && this.cand[right.id] === p.node) {
      if (right.cGroup !== null && right.cGroup !== p.node.cGroup) {
        p.node.constraints.push(right)
      }
    }

    this.intervals.splice(this.intervals.indexOf(p.node), 1)
  }

  private lower(node: CNode): CNode | null {
    const key = node.hitbox.x + node.hitbox.width / 2
    let result: CNode | null = null
    for (const n of this.intervals) {
      const k = n.hitbox.x + n.hitbox.width / 2
      if (k < key) result = n
      else if (k === key && n !== node && result === null) { /* same center; treat as lower? TreeSet semantics */ }
      else if (k > key) break
    }
    return result
  }

  private higher(node: CNode): CNode | null {
    const key = node.hitbox.x + node.hitbox.width / 2
    for (const n of this.intervals) {
      const k = n.hitbox.x + n.hitbox.width / 2
      if (k > key) return n
    }
    return null
  }
}
