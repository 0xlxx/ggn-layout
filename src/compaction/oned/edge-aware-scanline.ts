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
 * EdgeAwareScanlineConstraintCalculation (对应 ELK intermediate.compaction.EdgeAwareScanlineConstraintCalculation).
 * P5 后压缩的默认约束算法 (COMPACTION_POST_COMPACTION_CONSTRAINTS=SCANLINE).
 *
 * 与普通 Scanline 的关键差异: 先对垂直段单独扫一遍 (段间约束), 再对全部元素扫一遍
 * (节点+段), 且第二遍前对 LNode hitbox 做 y 方向扩展 (minSpacing) 保证边与节点间距.
 * 段链先后约束走 CGraph.predefinedHorizontalConstraints (方向相关, oned-compactor 应用).
 */
import { OneDimensionalCompactor } from './oned-compactor.js'
import { ScanlineConstraintCalculator } from './algs.js'
import { LNodeCNode, VerticalSegmentCNode } from './cnode-implementations.js'
import type { CNode } from './cnode.js'
import type { CGroup } from './cgroup.js'
import type { LGraph } from '../../graph/lgraph.js'
import { NodeType } from '../../graph/enums.js'
import { EDGE_ROUTING, SPACING_NODE_NODE, SPACING_EDGE_EDGE } from '../../options/layered-options.js'

const SMALL_EPSILON = 0.01

export class EdgeAwareScanlineConstraintCalculation extends ScanlineConstraintCalculator {
  private readonly graph: LGraph
  private readonly verticalEdgeEdgeSpacing: number
  private readonly edgeRouting: string

  constructor(graph: LGraph) {
    super()
    this.graph = graph
    this.verticalEdgeEdgeSpacing = graph.getProperty(SPACING_EDGE_EDGE)
    this.edgeRouting = graph.getProperty(EDGE_ROUTING)
  }

  calculateConstraints(theCompactor: OneDimensionalCompactor): void {
    this.compactor = theCompactor
    if (this.edgeRouting === 'SPLINES') this.calculateForSpline()
    else this.calculateForOrthogonal()
  }

  /** 扩展/恢复节点或垂直段 hitbox (ELK alterHitbox). */
  private alterHitbox(n: CNode, spacing: number, fac: number): void {
    const delta = spacing * fac
    if (n instanceof VerticalSegmentCNode) {
      const vs = n.vs
      if (!vs.ignoreSpacing.up) {
        n.hitbox.y -= delta + SMALL_EPSILON
        n.hitbox.height += delta + SMALL_EPSILON
      } else if (!vs.ignoreSpacing.down) {
        n.hitbox.height += delta + SMALL_EPSILON
      }
    } else if (n instanceof LNodeCNode) {
      n.hitbox.y -= delta
      n.hitbox.height += 2 * delta
    }
  }

  /** 整体扩大 CGroup hitbox (ELK alterGroupedHitboxOrthogonal): master 节点 + 组内垂直段.
   *  正交路由时组 = master(节点) + 垂直段; 垂直段按 ignoreSpacing 反向扩大 (SMALL_EPSILON
   *  恢复不精确 → 段 hitbox 永久 ±0.02, 参与最终包围盒 topLeft 计算). */
  private alterGroupedHitboxOrthogonal(g: CGroup, spacing: number, fac: number): void {
    let master: CNode | null = null
    for (const n of g.cNodes) {
      if (n instanceof LNodeCNode) { master = n; break }
    }
    if (master === null) master = g.cNodes.values().next().value ?? null
    if (master === null) return

    this.alterHitbox(master, spacing, fac)
    if (g.cNodes.size === 1) return

    // 调整组内所有垂直段.
    const delta = spacing * fac
    for (const n of g.cNodes) {
      if (n === master || !(n instanceof VerticalSegmentCNode)) continue
      // n 代表垂直段 (组构造保证).
      const vs = n.vs
      if (vs.ignoreSpacing.up) {
        // 南向段.
        n.hitbox.y += delta + SMALL_EPSILON
        n.hitbox.height -= delta + SMALL_EPSILON
      } else if (vs.ignoreSpacing.down) {
        // 北向段.
        n.hitbox.height -= delta + SMALL_EPSILON
      }
    }
  }

  private calculateForSpline(): void {
    // 第一遍: 只扫垂直段 (段间约束; 段链约束已由 predefinedHorizontalConstraints 提供).
    this.sweep(n => n instanceof VerticalSegmentCNode, () => 0)

    // 最小间距: 外部端口 ∞; 段 edgeEdge/2; 节点 nodeNode/2.
    let minSpacing = Number.POSITIVE_INFINITY
    for (const n of this.compactor.cGraph.cNodes) {
      if (n instanceof LNodeCNode && n.lNode.getType() === NodeType.EXTERNAL_PORT) continue
      if (n instanceof VerticalSegmentCNode) {
        minSpacing = Math.min(minSpacing, Math.max(0, this.verticalEdgeEdgeSpacing / 2 - ScanlineConstraintCalculator.EPSILON))
      } else if (n instanceof LNodeCNode) {
        const spacing = this.graph.getProperty(SPACING_NODE_NODE)
        minSpacing = Math.min(minSpacing, Math.max(0, spacing / 2 - ScanlineConstraintCalculator.EPSILON))
      }
    }
    if (!Number.isFinite(minSpacing)) minSpacing = 0

    // 第二遍前扩展 LNode hitbox.
    const restore: [CNode, number][] = []
    for (const n of this.compactor.cGraph.cNodes) {
      if (n instanceof LNodeCNode) {
        this.alterHitbox(n, minSpacing, 1)
        restore.push([n, minSpacing])
      }
    }

    // 第二遍: 全部元素.
    this.sweep(_n => true, () => 0)

    for (const [n, sp] of restore) this.alterHitbox(n, sp, -1)
  }

  private calculateForOrthogonal(): void {
    // 第一遍: 只扫垂直段 (扩展 hitbox, 含 SMALL_EPSILON).
    const restoreSeg: [CNode, number][] = []
    for (const n of this.compactor.cGraph.cNodes) {
      if (n instanceof VerticalSegmentCNode) {
        const spacing = Math.max(0, this.verticalEdgeEdgeSpacing / 2 - ScanlineConstraintCalculator.EPSILON)
        this.alterHitbox(n, spacing, 1)
        restoreSeg.push([n, spacing])
      }
    }
    this.sweep(n => n instanceof VerticalSegmentCNode, () => 0)
    for (const [n, sp] of restoreSeg) this.alterHitbox(n, sp, -1)

    // 节点: 用 edgeEdge spacing.
    const restoreNode: [CNode, number][] = []
    for (const n of this.compactor.cGraph.cNodes) {
      if (n instanceof LNodeCNode) {
        const spacing = Math.max(0, this.graph.getProperty(SPACING_EDGE_EDGE) / 2 - ScanlineConstraintCalculator.EPSILON)
        this.alterHitbox(n, spacing, 1)
        restoreNode.push([n, spacing])
      }
    }
    this.sweep(n => n instanceof LNodeCNode, () => 0)
    for (const [n, sp] of restoreNode) this.alterHitbox(n, sp, -1)

    // 全部元素 (minSpacing).
    let minSpacing = Number.POSITIVE_INFINITY
    for (const n of this.compactor.cGraph.cNodes) {
      if (n instanceof LNodeCNode && n.lNode.getType() === NodeType.EXTERNAL_PORT) continue
      if (n instanceof VerticalSegmentCNode) {
        minSpacing = Math.min(minSpacing, Math.max(0, this.verticalEdgeEdgeSpacing / 2 - ScanlineConstraintCalculator.EPSILON))
      } else if (n instanceof LNodeCNode) {
        minSpacing = Math.min(minSpacing, Math.max(0, this.graph.getProperty(SPACING_NODE_NODE) / 2 - ScanlineConstraintCalculator.EPSILON))
      }
    }
    if (!Number.isFinite(minSpacing)) minSpacing = 0
    const restoreAll: [CGroup, number][] = []
    for (const g of this.compactor.cGraph.cGroups) {
      this.alterGroupedHitboxOrthogonal(g, minSpacing, 1)
      restoreAll.push([g, minSpacing])
    }
    this.sweep(_n => true, () => 0)
    for (const [g, sp] of restoreAll) this.alterGroupedHitboxOrthogonal(g, sp, -1)
  }
}
