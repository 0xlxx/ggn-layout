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
 * GraphStats (对应 ELK wrapping.GraphStats) — 延迟收集分层图统计信息.
 *
 * 构造时只计算纵横比与最长路径 (层数); 宽度/高度/切割合法性均为按需惰性计算并缓存.
 * 方向为竖直 (UP/DOWN) 时纵横比取倒数 (ELK 内部始终按左→右处理, 导入时不调整纵横比).
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.GraphStats
 */
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import type { Layer } from '../../graph/layer.js'
import { NodeType, Direction } from '../../graph/enums.js'
import { ORIGIN } from '../../options/internal-properties.js'
import {
  ASPECT_RATIO, DIRECTION, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS,
  WRAPPING_CORRECTION_FACTOR, WRAPPING_VALIDIFY_FORBIDDEN_INDICES,
} from '../../options/layered-options.js'

export class GraphStats {
  readonly graph: LGraph
  private spacing = 0
  private inLayerSpacing = 0

  /** 校正后的期望纵横比 (竖直方向取倒数). */
  readonly dar: number
  /** 最长路径 = 层数. */
  readonly longestPath: number

  // 按需惰性计算
  private maxWidth: number | null = null
  private maxHeight: number | null = null
  private sumWidth: number | null = null

  private widths: number[] | null = null
  private heights: number[] | null = null

  private cutsAllowed: boolean[] | null = null

  constructor(graph: LGraph) {
    this.graph = graph

    const dir = graph.getProperty(DIRECTION)
    const aspectRatio = graph.getProperty(ASPECT_RATIO)
    const correction = graph.getProperty(WRAPPING_CORRECTION_FACTOR)
    if (dir === Direction.LEFT || dir === Direction.RIGHT || dir === Direction.UNDEFINED) {
      this.dar = aspectRatio * correction
    } else {
      this.dar = 1 / (aspectRatio * correction)
    }

    this.spacing = graph.getProperty(SPACING_NODE_NODE_BETWEEN_LAYERS)
    this.inLayerSpacing = graph.getProperty(SPACING_NODE_NODE)

    this.longestPath = graph.getLayers().length
  }

  /* ── 近似估计 ─────────────────────────────────────────────── */

  /** @return 该层任何节点的最大宽度 (含 margin 与层间距). */
  getApproximateLayerWidth(l: Layer): number {
    return this.determineLayerWidth(l)
  }

  /** @return 当前分层近似宽度 (各层层宽之和). */
  getApproximateLayeringWidth(): number {
    return this.getSumWidth()
  }

  /** @return 应用 {@code cuts} 后新分层的近似宽度 (所有 chunk 宽度的最大值). */
  getApproximateChunkBasedLayeringWidth(cuts: number[]): number {
    if (cuts.length === 0) {
      return this.getApproximateLayeringWidth()
    }
    let width = 0
    let lowIdx = 0
    for (const highIdx of cuts) {
      width = Math.max(width, this.determineChunkWidth(lowIdx, highIdx))
      lowIdx = highIdx
    }
    width = Math.max(width, this.determineChunkWidth(lowIdx, this.graph.getLayers().length))
    return width
  }

  /** @return 该层层高之和 (节点高 + margin + 层内间距, 含 NORTH_SOUTH_PORT 入边的 origin 高). */
  getApproximateLayerHeight(l: Layer): number {
    return this.determineLayerHeight(l)
  }

  /** @return 当前分层近似高度 (任何层的最大高度). */
  getApproximateLayeringHeight(): number {
    return this.getMaxHeight()
  }

  /** @return 应用 {@code cuts} 后新分层的近似高度 (各 chunk 高度的最大值之和). */
  getApproximateChunkBasedLayeringHeight(cuts: number[]): number {
    if (cuts.length === 0) {
      return 0
    }
    let height = 0
    let lowIdx = 0
    for (const highIdx of cuts) {
      height += this.determineChunkHeight(lowIdx, highIdx)
      lowIdx = highIdx
    }
    height += this.determineChunkHeight(lowIdx, this.graph.getLayers().length)
    return height
  }

  /* ── 宽度 ─────────────────────────────────────────────────── */

  getMaxWidth(): number {
    if (this.maxWidth === null) {
      this.maxWidth = this.determineWidth((a, b) => Math.max(a, b))
    }
    return this.maxWidth
  }

  getSumWidth(): number {
    if (this.sumWidth === null) {
      this.sumWidth = this.determineWidth((a, b) => a + b)
    }
    return this.sumWidth
  }

  getWidths(): number[] {
    if (this.widths === null) {
      this.initWidthsAndHeights()
    }
    return this.widths!
  }

  private initWidthsAndHeights(): void {
    const n = this.longestPath
    const widths = new Array<number>(n)
    const heights = new Array<number>(n)
    for (let i = 0; i < n; i++) {
      const l = this.graph.getLayers()[i]!
      widths[i] = this.determineLayerWidth(l)
      heights[i] = this.determineLayerHeight(l)
    }
    this.widths = widths
    this.heights = heights
  }

  private determineWidth(fun: (a: number, b: number) => number): number {
    const layers = this.graph.getLayers()
    let acc = this.determineLayerWidth(layers[0]!)
    for (let i = 1; i < layers.length; i++) {
      acc = fun(acc, this.determineLayerWidth(layers[i]!))
    }
    return acc
  }

  /** @return 层内任何节点宽 + 左右 margin + 层间间距的最大值. */
  private determineLayerWidth(l: Layer): number {
    let maxW = 0
    for (const n of l.getNodes()) {
      const nW = n.getSize().x + n.getMargin().right + n.getMargin().left + this.spacing
      maxW = Math.max(maxW, nW)
    }
    return maxW
  }

  /** @return [lowIdx, highIdx) 层宽之和. */
  private determineChunkWidth(lowIdx: number, highIdx: number): number {
    let width = 0
    for (let i = lowIdx; i < highIdx; i++) {
      width += this.determineLayerWidth(this.graph.getLayers()[i]!)
    }
    return width
  }

  /* ── 高度 ─────────────────────────────────────────────────── */

  getMaxHeight(): number {
    if (this.maxHeight === null) {
      this.maxHeight = this.determineHeight((a, b) => Math.max(a, b))
    }
    return this.maxHeight
  }

  getHeights(): number[] {
    if (this.heights === null) {
      this.initWidthsAndHeights()
    }
    return this.heights!
  }

  private determineHeight(fun: (a: number, b: number) => number): number {
    const layers = this.graph.getLayers()
    let acc = this.determineLayerHeight(layers[0]!)
    for (let i = 1; i < layers.length; i++) {
      acc = fun(acc, this.determineLayerHeight(layers[i]!))
    }
    return acc
  }

  private determineLayerHeight(layer: Layer): number {
    let lH = 0
    for (const n of layer.getNodes()) {
      lH += n.getSize().y + n.getMargin().bottom + n.getMargin().top + this.inLayerSpacing
      for (const inc of n.getIncomingEdges()) {
        if (inc.getSource()!.getNode()!.getType() === NodeType.NORTH_SOUTH_PORT) {
          const origin = inc.getSource()!.getNode()!.getProperty(ORIGIN) as LNode
          lH += origin.getSize().y + origin.getMargin().bottom + origin.getMargin().top
        }
      }
    }
    return lH
  }

  /** @return [lowIdx, highIdx) 层高最大值. */
  private determineChunkHeight(lowIdx: number, highIdx: number): number {
    let height = 0
    for (let i = lowIdx; i < highIdx; i++) {
      height = Math.max(height, this.determineLayerHeight(this.graph.getLayers()[i]!))
    }
    return height
  }

  /* ── 切割合法性 ───────────────────────────────────────────── */

  /** @return 是否允许在 {@code layerIndex} 之前切割. */
  isCutAllowed(layerIndex: number): boolean {
    if (this.cutsAllowed === null) {
      this.initCutAllowed()
    }
    return this.cutsAllowed![layerIndex]!
  }

  private initCutAllowed(): void {
    if (this.cutsAllowed !== null) {
      return
    }

    const cutAllowed = new Array<boolean>(this.graph.getLayers().length)
    cutAllowed[0] = false

    if (this.graph.hasProperty(WRAPPING_VALIDIFY_FORBIDDEN_INDICES)) {
      // 用户指定的禁用索引
      const forbidden = this.graph.getProperty(WRAPPING_VALIDIFY_FORBIDDEN_INDICES)
      if (forbidden !== null) {
        for (const f of forbidden) {
          if (f > 0 && f < cutAllowed.length) {
            cutAllowed[f] = false
          }
        }
      }
    } else {
      // 默认行为: 逐层判断
      const layers = this.graph.getLayers()
      for (let i = 1; i < layers.length; i++) {
        cutAllowed[i] = this.isCutAllowedPerLayer(layers[i]!)
      }
    }

    this.cutsAllowed = cutAllowed
  }

  getCutsAllowed(): boolean[] {
    if (this.cutsAllowed === null) {
      this.initCutAllowed()
    }
    return this.cutsAllowed!
  }

  /** @return 是否允许在该层之前切割: 层内所有入边必须来自单个 (源, 目标) 节点对. */
  private isCutAllowedPerLayer(layer: Layer): boolean {
    let cutAllowed = true
    let n1: LNode | null = null
    let n2: LNode | null = null
    check:
    for (const tgt of layer.getNodes()) {
      for (const e of tgt.getIncomingEdges()) {
        // 检查不同的目标
        if (n1 !== null && n1 !== tgt) {
          cutAllowed = false
          break check
        }
        n1 = tgt
        // 检查不同的源
        const src = e.getSource()!.getNode()!
        if (n2 !== null && n2 !== src) {
          cutAllowed = false
          break check
        }
        n2 = src
      }
    }
    return cutAllowed
  }
}
