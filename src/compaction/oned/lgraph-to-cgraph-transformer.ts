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
 * LGraphToCGraphTransformer (对应 ELK intermediate.compaction.LGraphToCGraphTransformer).
 * 把 LGraph 转成 CGraph (节点 + 垂直段), 压缩后 applyLayout 写回 LGraph.
 *
 * 移植范围 (2026-08-10 首版): 节点 → LNodeCNode (含 margin hitbox + lock);
 * spline 垂直段 → VerticalSegmentCNode (依赖 SPLINE_ROUTE_START, ggn SplineEdgeRouter 待补).
 * 约束由 OneDimensionalCompactor 的 scanline/quadratic 自动计算 (ELK HorizontalGraphCompactor 默认
 * COMPACTION_POST_COMPACTION_CONSTRAINTS=SCANLINE → EdgeAwareScanline; 节点-only 版用通用 scanline).
 */
import { CGraph } from './cgraph.js'
import { CGroup } from './cgroup.js'
import { CNode } from './cnode.js'
import { LNodeCNode, VerticalSegmentCNode } from './cnode-implementations.js'
import { Quadruplet } from './quadruplet.js'
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import { NodeType, Direction, PortSide } from '../../graph/enums.js'
import { CompareFuzzy } from './compare-fuzzy.js'
import { EDGE_ROUTING } from '../../options/layered-options.js'
import { SPLINE_ROUTE_START } from '../../options/internal-properties.js'
import type { SplineSegment } from '../../p5edges/splines/spline-segment.js'
import { VerticalSegment } from './vertical-segment.js'

export class LGraphToCGraphTransformer {
  private cGraph!: CGraph
  private layeredGraph!: LGraph
  private edgeRouting!: string
  private nodesMap = new Map<LNode, LNodeCNode>()
  private verticalSegmentsMap = new Map<VerticalSegment, VerticalSegmentCNode>()
  private lockMap = new Map<CNode, Quadruplet>()

  transform(inputGraph: LGraph): CGraph {
    this.layeredGraph = inputGraph
    this.edgeRouting = inputGraph.getProperty(EDGE_ROUTING)
    this.cGraph = new CGraph([Direction.LEFT, Direction.RIGHT])
    this.nodesMap = new Map()
    this.verticalSegmentsMap = new Map()
    this.lockMap = new Map()

    this.transformNodes()
    this.transformEdges()
    return this.cGraph
  }

  getLockMap(): Map<CNode, Quadruplet> {
    return this.lockMap
  }

  private transformNodes(): void {
    let nextId = 0
    for (const layer of this.layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        // comment box 并入所在节点 margin (ELK: commentOffsets 单独处理, 首版跳过 comment 图).
        const cNode = new LNodeCNode(node)
        cNode.id = nextId++
        this.cGraph.cNodes.push(cNode)

        // 节点独立成组 (ELK: CGroup.of().nodes(cNode).master(cNode)).
        const group = new CGroup(cNode)
        this.cGraph.cGroups.push(group)

        // locking (仅 LEFT_RIGHT_CONNECTION_LOCKING 用): 入/出边差决定锁侧.
        const nodeLock = new Quadruplet()
        this.lockMap.set(cNode, nodeLock)
        const difference = node.getIncomingEdges().length - node.getOutgoingEdges().length
        if (difference < 0) nodeLock.set(true, Direction.LEFT)
        else if (difference > 0) nodeLock.set(true, Direction.RIGHT)
        if (node.getType() === NodeType.EXTERNAL_PORT) nodeLock.set(false, false, false, false)

        this.nodesMap.set(node, cNode)
      }
    }
  }

  private transformEdges(): void {
    let verticalSegments: VerticalSegment[]
    if (this.edgeRouting === 'ORTHOGONAL') {
      verticalSegments = this.collectVerticalSegmentsOrthogonal()
    } else if (this.edgeRouting === 'SPLINES') {
      verticalSegments = this.collectVerticalSegmentsSplines()
    } else {
      verticalSegments = []
    }
    this.mergeVerticalSegments(verticalSegments)
    // 段链预计算约束 (ELK transformEdges 在 mergeVerticalSegments **之后** 单独遍历
    // verticalSegmentsMap: 前向段此时已全部入 map; 放 verticalSegmentToCNode 内会因
    // 前向未映射而丢链约束 — moreThanOneStraightSegmentPath 垂直段塌缩实证).
    for (const [vs, vsNode] of this.verticalSegmentsMap) {
      for (const otherVs of vs.constraints) {
        const otherNode = this.verticalSegmentsMap.get(otherVs)
        if (otherNode) this.cGraph.predefinedHorizontalConstraints.push([vsNode, otherNode])
      }
    }
  }

  /** 收集正交路由的垂直段 (对应 ELK collectVerticalSegmentsOrthogonal, line 219-329). */
  private collectVerticalSegmentsOrthogonal(): VerticalSegment[] {
    const verticalSegments: VerticalSegment[] = []
    for (const layer of this.layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        const cNode = this.nodesMap.get(node)
        if (!cNode) continue

        for (const edge of node.getOutgoingEdges()) {
          const bends = edge.getBendPoints()
          if (bends.length === 0) continue
          let first = true
          let lastSegment: VerticalSegment | null = null
          let bend1 = bends[0]!
          let bend2: { x: number; y: number } | null = null
          const src = edge.getSource()!

          if (src.getSide() === PortSide.NORTH) {
            const vs = new VerticalSegment(bend1, { x: bend1.x, y: cNode.hitbox.y }, cNode, edge)
            vs.ignoreSpacing.down = true
            vs.aPort = src
            verticalSegments.push(vs)
          }
          if (src.getSide() === PortSide.SOUTH) {
            const vs = new VerticalSegment(bend1, { x: bend1.x, y: cNode.hitbox.y + cNode.hitbox.height }, cNode, edge)
            vs.ignoreSpacing.up = true
            vs.aPort = src
            verticalSegments.push(vs)
          }

          for (let i = 1; i < bends.length; i++) {
            bend2 = bends[i]!
            if (!CompareFuzzy.eq(bend1.y, bend2.y)) {
              lastSegment = new VerticalSegment(bend1, bend2, null, edge)
              verticalSegments.push(lastSegment)
              if (first) {
                first = false
                if (bend2.y < cNode.hitbox.y) lastSegment.ignoreSpacing.down = true
                else if (bend2.y > cNode.hitbox.y + cNode.hitbox.height) lastSegment.ignoreSpacing.up = true
                else { lastSegment.ignoreSpacing.up = true; lastSegment.ignoreSpacing.down = true }
              }
            }
            if (i + 1 < bends.length) bend1 = bend2
          }

          if (lastSegment !== null) {
            const tgtNode = this.nodesMap.get(edge.getTarget()!.getNode()!)
            if (tgtNode) {
              if (bend1.y < tgtNode.hitbox.y) lastSegment.ignoreSpacing.down = true
              else if (bend1.y > tgtNode.hitbox.y + tgtNode.hitbox.height) lastSegment.ignoreSpacing.up = true
              else { lastSegment.ignoreSpacing.up = true; lastSegment.ignoreSpacing.down = true }
            }
          }
        }

        for (const edge of node.getIncomingEdges()) {
          const bends = edge.getBendPoints()
          if (bends.length === 0) continue
          const bend1 = bends[bends.length - 1]!
          const tgt = edge.getTarget()!
          if (tgt.getSide() === PortSide.NORTH) {
            const vs = new VerticalSegment(bend1, { x: bend1.x, y: cNode.hitbox.y }, cNode, edge)
            vs.ignoreSpacing.down = true
            vs.aPort = tgt
            verticalSegments.push(vs)
          }
          if (tgt.getSide() === PortSide.SOUTH) {
            const vs = new VerticalSegment(bend1, { x: bend1.x, y: cNode.hitbox.y + cNode.hitbox.height }, cNode, edge)
            vs.ignoreSpacing.up = true
            vs.aPort = tgt
            verticalSegments.push(vs)
          }
        }
      }
    }
    return verticalSegments
  }

  /** 收集 spline 非直线段的垂直段 (对应 ELK collectVerticalSegmentsSplines, line 329-361). */
  private collectVerticalSegmentsSplines(): VerticalSegment[] {
    const verticalSegments: VerticalSegment[] = []
    let nextId = this.cGraph.cNodes.length
    for (const layer of this.layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        for (const edge of node.getOutgoingEdges()) {
          const spline = edge.getProperty(SPLINE_ROUTE_START)
          if (!spline || spline.length === 0) continue
          let lastVs: VerticalSegment | null = null
          for (const s of spline) {
            if (s.isStraight) continue
            const leftTop = { x: s.boundingBox.x, y: s.boundingBox.y }
            const rightBottom = { x: s.boundingBox.x + s.boundingBox.width, y: s.boundingBox.y + s.boundingBox.height }
            const vs = new VerticalSegment(leftTop, rightBottom, null, s.edges[0]!)
            vs.affectedBoundingBoxes.push(s.boundingBox)
            verticalSegments.push(vs)
            if (lastVs !== null) lastVs.constraints.push(vs)
            lastVs = vs
          }
        }
      }
    }
    void nextId
    return verticalSegments
  }

  /** 合并相交垂直段 (对应 ELK mergeVerticalSegments + verticalSegmentToCNode, line 362-433). */
  private mergeVerticalSegments(verticalSegments: VerticalSegment[]): void {
    if (verticalSegments.length === 0) return
    verticalSegments.sort((a, b) => a.compareTo(b))

    let survivor = verticalSegments[0]!
    for (let i = 1; i < verticalSegments.length; i++) {
      const next = verticalSegments[i]!
      if (survivor.intersects(next)) {
        survivor.joinWith(next)
      } else {
        this.verticalSegmentToCNode(survivor)
        survivor = next
      }
    }
    this.verticalSegmentToCNode(survivor)
  }

  private verticalSegmentToCNode(vs: VerticalSegment): void {
    const cNode = new VerticalSegmentCNode(vs)
    cNode.id = this.cGraph.cNodes.length
    this.cGraph.cNodes.push(cNode)
    if (vs.potentialGroupParents.length > 0) {
      // N/S 端口段加入源节点组 (ELK line 402-407).
      const parentGroup = vs.potentialGroupParents[0]!.cGroup
      if (parentGroup) parentGroup.addCNode(cNode)
    } else {
      // 段独立成组.
      const group = new CGroup(cNode)
      this.cGraph.cGroups.push(group)
    }

    const vsLock = new Quadruplet()
    this.lockMap.set(cNode, vsLock)
    const inc = new Set<number>()
    const out = new Set<number>()
    for (const e of vs.representedLEdges) {
      if (e.getSource()) inc.add(e.getSource()!.id)
      if (e.getTarget()) out.add(e.getTarget()!.id)
    }
    const difference = inc.size - out.size
    if (difference < 0) { vsLock.set(true, Direction.LEFT); vsLock.set(false, Direction.RIGHT) }
    else if (difference > 0) { vsLock.set(false, Direction.LEFT); vsLock.set(true, Direction.RIGHT) }

    for (const other of vs.joined) this.verticalSegmentsMap.set(other, cNode)
    this.verticalSegmentsMap.set(vs, cNode)
  }

  /** 压缩后写回 LGraph 并重算图尺寸/offset (ELK applyLayout). */
  applyLayout(): void {
    // 1. 节点 x (margin.left 补偿).
    for (const cNode of this.cGraph.cNodes) {
      if (cNode instanceof LNodeCNode) cNode.applyElementPosition()
    }

    // 2. 垂直段平移 (当前无垂直段).
    for (const cNode of this.cGraph.cNodes) {
      if (cNode instanceof VerticalSegmentCNode) cNode.applyElementPosition()
    }

    // 3. spline 特判 (ELK LGraphToCGraphTransformer.applyLayout 的 SPLINES 分支):
    //    自环弯点按源节点压缩位移偏移; 直线段控制点重分布到非直线段之间.
    if (this.edgeRouting === 'SPLINES') {
      // 3a. 自环弯点 offset (ELK: cNode.hitbox - hitboxPreCompaction).
      for (const layer of this.layeredGraph.getLayers()) {
        for (const node of layer.getNodes()) {
          for (const sl of node.getOutgoingEdges()) {
            if (!sl.isSelfLoop()) continue
            const lNode = sl.getSource()!.getNode()!
            const cNode = this.nodesMap.get(lNode)
            if (cNode === undefined || cNode.hitboxPreCompaction === null) continue
            const deltaX = cNode.hitbox.x - cNode.hitboxPreCompaction.x
            for (const b of sl.getBendPoints()) b.x += deltaX
          }
        }
      }
      // 3b. 直线段控制点重分布 (ELK adjustSplineControlPoints).
      for (const layer of this.layeredGraph.getLayers()) {
        for (const node of layer.getNodes()) {
          for (const edge of node.getOutgoingEdges()) {
            const spline = edge.getProperty(SPLINE_ROUTE_START)
            if (spline !== null && spline !== undefined && spline.length > 0) {
              this.adjustSplineControlPoints(spline)
            }
          }
        }
      }
    }

    // 4. 新图尺寸/offset (ELK: 所有 CNode hitbox 包围盒).
    let topLeftX = Number.POSITIVE_INFINITY
    let topLeftY = Number.POSITIVE_INFINITY
    let bottomRightX = Number.NEGATIVE_INFINITY
    let bottomRightY = Number.NEGATIVE_INFINITY
    for (const cNode of this.cGraph.cNodes) {
      topLeftX = Math.min(topLeftX, cNode.hitbox.x)
      topLeftY = Math.min(topLeftY, cNode.hitbox.y)
      bottomRightX = Math.max(bottomRightX, cNode.hitbox.x + cNode.hitbox.width)
      bottomRightY = Math.max(bottomRightY, cNode.hitbox.y + cNode.hitbox.height)
    }
    if (process.env.GGN_COMPACT_DBG) {
      console.error(`[CMP] topLeft=(${topLeftX},${topLeftY}) bottomRight=(${bottomRightX},${bottomRightY}) nodes=${this.cGraph.cNodes.length}`)
    }
    if (Number.isFinite(topLeftX)) {
      // ELK: offset.reset().add(topLeft.negate()) — 重置而非累加 (压缩前 offset 可能已被
      // SplineEdgeRouter/LayerSize 设置; 累加会双倍偏移, labels1 实证 offset.y 191.33 = 2*95.67).
      this.layeredGraph.getOffset().x = -topLeftX
      this.layeredGraph.getOffset().y = -topLeftY
      this.layeredGraph.getSize().x = bottomRightX - topLeftX
      this.layeredGraph.getSize().y = bottomRightY - topLeftY
    }
  }

  /** 重分布 spline 直线段控制点 (对应 ELK adjustSplineControlPoints). */
  private adjustSplineControlPoints(spline: SplineSegment[]): void {
    if (spline.length === 0) return
    let lastSeg = spline[0]!

    // 单段: 循环恰好跑一次 (ELK: leftIdx=1, rightIdx=0).
    if (spline.length === 1) {
      this.adjustControlPointBetweenSegments(lastSeg, lastSeg, 1, 0, spline)
      return
    }

    let i = 1
    while (i < spline.length) {
      if (lastSeg.initialSegment || !lastSeg.isStraight) {
        const needle = this.firstNonStraightSegment(spline, i)
        if (needle !== null) {
          const j = needle.index
          const nextSeg = needle.segment
          this.adjustControlPointBetweenSegments(lastSeg, nextSeg, i, j, spline)
          i = j + 1
          lastSeg = nextSeg
        }
      }
    }
  }

  /** 找下一个非直线段 (或末段) (对应 ELK firstNonStraightSegment). */
  private firstNonStraightSegment(spline: SplineSegment[], index: number): { index: number; segment: SplineSegment } | null {
    if (index < 0 || index >= spline.length) return null
    for (let i = index; i < spline.length; i++) {
      const seg = spline[i]!
      if (i === spline.length - 1 || !seg.isStraight) {
        return { index: i, segment: seg }
      }
    }
    return null
  }

  /** 把 [leftIdx, rightIdx) 之间的直线段 bbox 均分到可用区间 (对应 ELK adjustControlPointBetweenSegments). */
  private adjustControlPointBetweenSegments(
    left: SplineSegment, right: SplineSegment,
    leftIdx: number, rightIdx: number,
    spline: SplineSegment[],
  ): void {
    let startX: number
    let idx1 = leftIdx
    if (left.initialSegment && left.isStraight) {
      const n = this.nodesMap.get(left.sourceNode!)
      startX = n!.hitbox.x + n!.hitbox.width
      idx1--
    } else {
      startX = left.boundingBox.x + left.boundingBox.width
    }

    let endX: number
    let idx2 = rightIdx
    if (right.lastSegment && right.isStraight) {
      const n = this.nodesMap.get(right.targetNode!)
      endX = n!.hitbox.x
      idx2++
    } else {
      endX = right.boundingBox.x
    }

    const strip = endX - startX
    const chunks = Math.max(2, idx2 - idx1)
    const chunk = strip / chunks

    let newPos = startX + chunk
    for (let k = idx1; k < idx2; k++) {
      const adjust = spline[k]!
      const width = adjust.boundingBox.width
      adjust.boundingBox.x = newPos - width / 2
      newPos += chunk
    }
  }
}
