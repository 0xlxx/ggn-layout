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
 * LEdge (对应 ELK graph.LEdge).
 */
import { LGraphElement } from './lshape.js'
import type { LPort } from './lport.js'
import type { LNode } from './lnode.js'
import type { LGraph } from './lgraph.js'
import type { KVector } from './enums.js'
import { REVERSED } from '../options/internal-properties.js'

export interface LEdgeLabel {
  text: string
  position: KVector
  size: KVector
  placement?: string
  /** 单标签级中心标签放置策略覆盖 (对应 ELK EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY, LabelDummySwitcher 读取). */
  centerLabelPlacementStrategy?: string
}

export class LEdge extends LGraphElement {
  private source: LPort | null = null
  private target: LPort | null = null
  private bendPoints: KVector[] = []
  private labels: LEdgeLabel[] = []

  getSource(): LPort | null {
    return this.source
  }

  setSource(source: LPort | null): void {
    if (this.source !== null) {
      const edges = this.source.getOutgoingEdges()
      const idx = edges.indexOf(this)
      if (idx !== -1) edges.splice(idx, 1)
    }
    this.source = source
    if (this.source !== null) this.source.getOutgoingEdges().push(this)
  }

  getTarget(): LPort | null {
    return this.target
  }

  setTarget(target: LPort | null): void {
    if (this.target !== null) {
      const edges = this.target.getIncomingEdges()
      const idx = edges.indexOf(this)
      if (idx !== -1) edges.splice(idx, 1)
    }
    this.target = target
    if (this.target !== null) this.target.getIncomingEdges().push(this)
  }

  /** setTarget + 指定插入位置 (对应 ELK setTargetAndInsertAtIndex). */
  setTargetAndInsertAtIndex(targetPort: LPort | null, index: number): void {
    if (this.target !== null) {
      const edges = this.target.getIncomingEdges()
      const idx = edges.indexOf(this)
      if (idx !== -1) edges.splice(idx, 1)
    }
    this.target = targetPort
    if (this.target !== null) this.target.getIncomingEdges().splice(index, 0, this)
  }

  getBendPoints(): KVector[] {
    return this.bendPoints
  }

  getLabels(): LEdgeLabel[] {
    return this.labels
  }

  isSelfLoop(): boolean {
    return this.source !== null && this.target !== null
      && this.source.getNode() !== null && this.source.getNode() === this.target.getNode()
  }

  isInLayerEdge(): boolean {
    return this.source !== null && this.target !== null
      && !this.isSelfLoop()
      && this.source.getNode()!.getLayer() === this.target.getNode()!.getLayer()
  }

  getOther(port: LPort): LPort | null {
    if (this.source === port) return this.target
    if (this.target === port) return this.source
    return null
  }

  getOtherNode(node: LNode): LNode | null {
    if (this.source !== null && this.source.getNode() === node) return this.target?.getNode() ?? null
    if (this.target !== null && this.target.getNode() === node) return this.source?.getNode() ?? null
    return null
  }

  /** 反转边 (对应 ELK reverse): 交换 source/target + 反转弯点 + 交换 HEAD/TAIL label +
   * REVERSED 属性取反 (toggle, 不是恒置 true — ReversedEdgeRestorer 恢复时 true→false,
   * 否则恢复后 flag 仍 true 会被再次反转). inverted-ports 实证: east_input/west_output/feedback_edge. */
  reverse(layeredGraph: LGraph, adaptPorts: boolean): void {
    this.setProperty(REVERSED, !this.getProperty(REVERSED))
    const oldSource = this.source
    const oldTarget = this.target
    this.setSource(oldTarget)
    this.setTarget(oldSource)
    // ELK: 弯点随反转倒序 (路径端点顺序与边方向一致).
    this.bendPoints.reverse()
    // ELK: HEAD/TAIL label 互换.
    for (const label of this.labels) {
      if (label.placement === 'HEAD') label.placement = 'TAIL'
      else if (label.placement === 'TAIL') label.placement = 'HEAD'
    }
    if (adaptPorts) {
      // 端口的侧在 ELK 中由 PortSideProcessor 处理
      void layeredGraph
    }
  }
}
