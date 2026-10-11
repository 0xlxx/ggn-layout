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
 * NetworkSimplexCompaction (对应 ELK layered intermediate.compaction.NetworkSimplexCompaction).
 *
 * EDGE_LENGTH 后压缩策略: 把 CGraph 转成 network simplex 图 (每 CGroup 一个 NNode), 用
 * NetworkSimplex 求最小化边长的分层, 再把 layer 写回 cNode.hitbox.x. 与 LongestPath 的差别:
 * 后者只把节点推到约束允许的最左, 前者按边权 (EDGE_WEIGHT=100) 全局权衡边长远近 —
 * moreThanOneStraightSegmentPath 实证: n1 x=212 (NS) vs 122 (LongestPath).
 *
 * 移植 (2026-08-11): 1:1 对齐 Java 0.12.0 (SEPARATION_WEIGHT=1 / EDGE_WEIGHT=100;
 * 同边垂直段用 helper NNode + offsetDelta 修正偏移).
 */
import type { LNode } from '../../graph/lnode.js'
import type { LEdge } from '../../graph/ledge.js'
import type { LPort } from '../../graph/lport.js'
import { PortSide, Direction } from '../../graph/enums.js'
import type { CNode } from './cnode.js'
import { LNodeCNode, VerticalSegmentCNode } from './cnode-implementations.js'
import type { OneDimensionalCompactor } from './oned-compactor.js'
import type { ICompactionAlgorithm } from './algs.js'
import { NGraph } from '../../networksimplex/ngraph.js'
import { NNode, nn } from '../../networksimplex/nnode.js'
import { ne } from '../../networksimplex/nedge.js'
import { NetworkSimplex } from '../../networksimplex/network-simplex.js'
import {
  getLNodeOrNull, getVerticalSegmentOrNull, isVerticalSegmentsOfSameEdge,
} from './horizontal-graph-compactor.js'

/** 分离约束的权重 (只保证间距/顺序, 不参与边长权衡). */
const SEPARATION_WEIGHT = 1
/** 原始图边的权重 (边长最小化的主要目标). */
const EDGE_WEIGHT = 100

/** 端口是否输出 (ELK LPort.OUTPUT_PREDICATE: 有出边). */
function isOutputPort(port: LPort): boolean {
  return port.getOutgoingEdges().length > 0
}

/** 端口是否输入 (ELK LPort.INPUT_PREDICATE: 有入边). */
function isInputPort(port: LPort): boolean {
  return port.getIncomingEdges().length > 0
}

/** 端口侧是否 N/S (ELK PortSide.SIDES_NORTH_SOUTH). */
function isNorthSouthSide(side: PortSide): boolean {
  return side === PortSide.NORTH || side === PortSide.SOUTH
}

/** 方向是否水平 (ELK Direction.isHorizontal: LEFT/RIGHT). */
function isHorizontalDirection(direction: Direction): boolean {
  return direction === Direction.LEFT || direction === Direction.RIGHT
}

/** (int) Math.ceil(x) — Java 语义: 先上取整再向零截断 (负数时 -0.5 → 0). */
function intCeil(x: number): number {
  return Math.trunc(Math.ceil(x))
}

/**
 * NetworkSimplexCompaction (EDGE_LENGTH 压缩策略).
 */
export class NetworkSimplexCompaction implements ICompactionAlgorithm {
  private compactor!: OneDimensionalCompactor
  private networkSimplexGraph!: NGraph

  private nNodes: NNode[] = []
  private index = 0

  compact(theCompactor: OneDimensionalCompactor): void {
    this.compactor = theCompactor
    this.networkSimplexGraph = new NGraph()

    this.nNodes = new Array<NNode>(this.compactor.cGraph.cGroups.length)
    this.index = 0

    // #1 每个 CGroup → network simplex 图的一个 NNode
    for (const cGroup of this.compactor.cGraph.cGroups) {
      cGroup.id = this.index
      const nNode = nn().id(this.index).origin(cGroup).create(this.networkSimplexGraph)
      this.nNodes[this.index] = nNode
      this.index++
    }

    // #2 约束图边 → 分离约束
    this.addSeparationConstraints()

    // #3 原始图边 → 边长最小化约束
    this.addEdgeConstraints()

    // #4 network simplex 不允许不连通图 → 人工源节点连通
    this.addArtificialSourceNode()

    // #5 执行 network simplex
    NetworkSimplex.forGraph(this.networkSimplexGraph).execute()

    // #6 应用位置
    for (const cNode of this.compactor.cGraph.cNodes) {
      cNode.hitbox.x = this.nNodes[cNode.cGroup!.id]!.layer + cNode.cGroupOffset.x
    }
  }

  /** 组间间距/顺序约束 (ELK addSeparationConstraints). */
  private addSeparationConstraints(): void {
    for (const cNode of this.compactor.cGraph.cNodes) {
      for (const incNode of cNode.constraints) {
        // 同组节点之间无需约束
        if (cNode.cGroup === incNode.cGroup) continue

        const spacing = isHorizontalDirection(this.compactor.direction)
          ? this.compactor.spacingsHandler.getHorizontalSpacing(cNode, incNode)
          : this.compactor.spacingsHandler.getVerticalSpacing(cNode, incNode)

        // 约束边形式: cNode <-- incNode
        let delta = cNode.cGroupOffset.x + cNode.hitbox.width + spacing - incNode.cGroupOffset.x
        // network simplex 要求整数 delta
        delta = Math.ceil(delta)
        // 外部端口可能产生负值, 这里修正为 0
        delta = Math.max(0, delta)

        if (!isVerticalSegmentsOfSameEdge(cNode, incNode)) {
          // 初始段靠近节点更好看
          let weight = SEPARATION_WEIGHT
          if ((cNode instanceof VerticalSegmentCNode && incNode instanceof LNodeCNode)
            || (incNode instanceof VerticalSegmentCNode && cNode instanceof LNodeCNode)) {
            weight = 2
          }
          // 单条边即一个约束
          ne()
            .delta(delta)
            .weight(weight) // 小权重: 只保持间距
            .source(this.nNodes[cNode.cGroup!.id]!)
            .target(this.nNodes[incNode.cGroup!.id]!)
            .create()
        } else {
          // 同边垂直段比较特殊: 可能需要调整垂直段组的"顺序"以得到直线边
          // (同时不违反其它约束).
          const helper = nn().create(this.networkSimplexGraph)
          const offsetDelta = intCeil(incNode.cGroupOffset.x - cNode.cGroupOffset.x)

          // 若涉及端口, 轻微移动其一, 因为计算出的位置是整数
          let adjust = offsetDelta - (incNode.cGroupOffset.x - cNode.cGroupOffset.x)
          let port = getVerticalSegmentOrNull(cNode)?.aPort ?? null
          let alterOffset: CNode = cNode
          if (port === null) {
            port = getVerticalSegmentOrNull(incNode)?.aPort ?? null
            adjust = -adjust
            alterOffset = incNode
          }

          if (port !== null) {
            alterOffset.cGroupOffset.x -= adjust
            port.getPosition().x -= adjust
          }

          ne()
            .delta(Math.max(0, offsetDelta))
            .weight(SEPARATION_WEIGHT)
            .source(helper)
            .target(this.nNodes[cNode.cGroup!.id]!)
            .create()

          ne()
            .delta(Math.max(0, -offsetDelta))
            .weight(SEPARATION_WEIGHT)
            .source(helper)
            .target(this.nNodes[incNode.cGroup!.id]!)
            .create()
        }
      }
    }
  }

  /** 原始图边 → 边长最小化边 (ELK addEdgeConstraints). */
  private addEdgeConstraints(): void {
    // 收集原始边
    const lNodeMap = new Map<LNode, CNode>()
    const lEdgeMap = new Map<LEdge, CNode[]>()
    for (const cNode of this.compactor.cGraph.cNodes) {
      const lNode = getLNodeOrNull(cNode)
      if (lNode !== null) {
        lNodeMap.set(lNode, cNode)
      } else {
        const vs = getVerticalSegmentOrNull(cNode)
        if (vs !== null) {
          for (const e of vs.representedLEdges) {
            const list = lEdgeMap.get(e)
            if (list !== undefined) list.push(cNode)
            else lEdgeMap.set(e, [cNode])
          }
        }
      }
    }

    // 加 network simplex 边
    for (const cNode of this.compactor.cGraph.cNodes) {
      const lNode = getLNodeOrNull(cNode)
      if (lNode === null) continue
      for (const lEdge of lNode.getOutgoingEdges()) {
        // 忽略自环
        if (lEdge.isSelfLoop()) continue

        const srcPort = lEdge.getSource()
        const tgtPort = lEdge.getTarget()
        if (srcPort === null || tgtPort === null) continue

        // 直接相连的 N/S 端口由 addSeparationConstraints 处理 (间距 handler 会给垂直段 +1 像素)
        if (isNorthSouthSide(srcPort.getSide()) && isNorthSouthSide(tgtPort.getSide())) {
          continue
        }

        const target = lNodeMap.get(tgtPort.getNode()!)
        if (target === undefined) continue

        ne()
          .delta(0)
          .weight(EDGE_WEIGHT)
          .source(this.nNodes[cNode.cGroup!.id]!)
          .target(this.nNodes[target.cGroup!.id]!)
          .create()

        // 反装端口: 垂直段保持贴近节点
        if (srcPort.getSide() === PortSide.WEST && isOutputPort(srcPort)) {
          for (const n of lEdgeMap.get(lEdge) ?? []) {
            if (n.hitbox.x < cNode.hitbox.x) {
              const src = this.nNodes[n.cGroup!.id]!
              const tgt = this.nNodes[cNode.cGroup!.id]!
              if (src === tgt) continue
              ne().delta(1).weight(EDGE_WEIGHT).source(src).target(tgt).create()
            }
          }
        }

        if (tgtPort.getSide() === PortSide.EAST && isInputPort(tgtPort)) {
          for (const n of lEdgeMap.get(lEdge) ?? []) {
            if (n.hitbox.x > cNode.hitbox.x) {
              const src = this.nNodes[cNode.cGroup!.id]!
              const tgt = this.nNodes[n.cGroup!.id]!
              if (src === tgt) continue
              ne().delta(1).weight(EDGE_WEIGHT).source(src).target(tgt).create()
            }
          }
        }
      }
    }
  }

  /** 所有 (目前) 无入边的节点连到一个新的人工源节点 (ELK addArtificialSourceNode). */
  private addArtificialSourceNode(): void {
    const sources: NNode[] = []
    for (const n of this.networkSimplexGraph.nodes) {
      if (n.getIncomingEdges().length === 0) sources.push(n)
    }

    if (sources.length > 1) {
      const dummySource = nn().id(this.index++).create(this.networkSimplexGraph)
      for (const src of sources) {
        ne().delta(1).weight(0).source(dummySource).target(src).create()
      }
    }
  }
}
