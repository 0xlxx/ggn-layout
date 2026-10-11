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
 * BPInfo (对应 ELK BreakingPointInserter.BPInfo) — 单个断点的全部关联元素.
 *
 * 一个断点把边 e=(u,v) 拆成:
 * <pre>
 *  u --nodeStartEdge--> startMarker --startEndEdge--> endMarker --e--> v
 * </pre>
 * start/end 两个 dummy 共享同一 BPInfo 实例 (挂在 InternalProperties.BREAKING_POINT_INFO).
 * 链式结构 (prev/next) 把同一原边被多次切割产生的 BPInfo 串起来.
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.BreakingPointInserter.BPInfo
 */
import type { LNode } from '../../graph/lnode.js'
import type { LEdge } from '../../graph/ledge.js'
import { BREAKING_POINT_INFO } from '../../options/internal-properties.js'

export class BPInfo {
  /** start dummy (切分后靠"左"的标记节点). */
  readonly start: LNode
  /** end dummy (切分后靠"右"的标记节点). */
  readonly end: LNode

  readonly nodeStartEdge: LEdge
  readonly startEndEdge: LEdge
  /** 被拆分 (重定向到 endMarker) 的原边. */
  readonly originalEdge: LEdge

  /** performWrapping 后补填: 链两端的 in-layer dummy/边. */
  startInLayerDummy: LNode | null = null
  startInLayerEdge: LEdge | null = null
  endInLayerDummy: LNode | null = null
  endInLayerEdge: LEdge | null = null

  /** 同一原边被多次切割时的链. */
  prev: BPInfo | null = null
  next: BPInfo | null = null

  constructor(startDummy: LNode, endDummy: LNode, nodeStartEdge: LEdge, startEndEdge: LEdge, originalEdge: LEdge) {
    this.start = startDummy
    this.end = endDummy
    this.nodeStartEdge = nodeStartEdge
    this.startEndEdge = startEndEdge
    this.originalEdge = originalEdge
  }

  /** @return {@code true} 如果 {@code n} 是该断点的 start dummy. */
  static isStart(n: LNode): boolean {
    const bpi = n.getProperty(BREAKING_POINT_INFO)
    return bpi !== null && bpi.start === n
  }

  /** @return {@code true} 如果 {@code n} 是该断点的 end dummy. */
  static isEnd(n: LNode): boolean {
    const bpi = n.getProperty(BREAKING_POINT_INFO)
    return bpi !== null && bpi.end === n
  }
}
