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
 * BKAlignedLayout (对应 ELK p4nodes.bk.BKAlignedLayout).
 *
 * 免分配/类型化 (簇 bk-node-placement):
 *  - 数值/布尔数组 (blockSize/innerShift/shift/y/su/od) 改为 Float64Array/Uint8Array,
 *    连续内存 + 免装箱; y 的空位哨兵从 null 改为 NaN (Float64Array 无 null).
 *  - root/align/sink 保持 LNode 引用数组 (对象引用无法进 typed array).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { Spacings } from './spacings.js'
import { SPACINGS } from '../options/internal-properties.js'
import type { NeighborhoodInformation } from './neighborhood-information.js'

export enum VDirection {
  DOWN,
  UP,
}

export enum HDirection {
  RIGHT,
  LEFT,
}

/** y 数组空位哨兵 (原 null; Float64Array 用 NaN). */
const Y_NULL = Number.NaN

export class BKAlignedLayout {
  root: (LNode | null)[] = []
  blockSize: Float64Array = new Float64Array(0)
  align: (LNode | null)[] = []
  innerShift: Float64Array = new Float64Array(0)
  sink: (LNode | null)[] = []
  shift: Float64Array = new Float64Array(0)
  y: Float64Array = new Float64Array(0)
  vdir: VDirection | null
  hdir: HDirection | null
  su: Uint8Array = new Uint8Array(0)
  od: Uint8Array = new Uint8Array(0)
  layeredGraph: LGraph
  spacings: Spacings

  constructor(layeredGraph: LGraph, nodeCount: number, vdir: VDirection | null, hdir: HDirection | null) {
    this.layeredGraph = layeredGraph
    this.spacings = layeredGraph.getProperty(SPACINGS)
    this.root = new Array<LNode | null>(nodeCount)
    this.blockSize = new Float64Array(nodeCount)
    this.align = new Array<LNode | null>(nodeCount)
    this.innerShift = new Float64Array(nodeCount)
    this.sink = new Array<LNode | null>(nodeCount)
    this.shift = new Float64Array(nodeCount)
    this.y = new Float64Array(nodeCount)
    this.su = new Uint8Array(nodeCount)
    this.od = new Uint8Array(nodeCount)
    this.od.fill(1)
    this.vdir = vdir
    this.hdir = hdir
  }

  cleanup(): void {
    this.root = []
    this.blockSize = new Float64Array(0)
    this.align = []
    this.innerShift = new Float64Array(0)
    this.sink = []
    this.shift = new Float64Array(0)
    this.y = new Float64Array(0)
  }

  layoutSize(): number {
    let min = Number.POSITIVE_INFINITY
    let max = Number.NEGATIVE_INFINITY
    for (const layer of this.layeredGraph.getLayers()) {
      for (const n of layer.getNodes()) {
        const yMin = this.y[n.id]
        const yMax = yMin + this.blockSize[this.root[n.id]!.id]
        min = Math.min(min, yMin)
        max = Math.max(max, yMax)
      }
    }
    return max - min
  }

  calculateDelta(src: LPort, tgt: LPort): number {
    const srcPos = this.y[src.getNode()!.id] + this.innerShift[src.getNode()!.id]
      + src.getPosition().y + src.getAnchor().y
    const tgtPos = this.y[tgt.getNode()!.id] + this.innerShift[tgt.getNode()!.id]
      + tgt.getPosition().y + tgt.getAnchor().y
    return tgtPos - srcPos
  }

  shiftBlock(rootNode: LNode, delta: number): void {
    let current = rootNode
    do {
      this.y[current.id] += delta
      current = this.align[current.id]!
    } while (current !== rootNode)
  }

  checkSpaceAbove(blockRoot: LNode, delta: number, ni: NeighborhoodInformation): number {
    let availableSpace = delta
    const rootNode = blockRoot
    let current = rootNode
    do {
      current = this.align[current.id]!
      const minYCurrent = this.getMinY(current)
      const neighbor = this.getUpperNeighbor(current, ni)
      if (neighbor !== null) {
        const maxYNeighbor = this.getMaxY(neighbor)
        availableSpace = Math.min(availableSpace,
          minYCurrent - (maxYNeighbor + this.spacings.getVerticalSpacing(current, neighbor)))
      }
    } while (rootNode !== current)
    return availableSpace
  }

  checkSpaceBelow(blockRoot: LNode, delta: number, ni: NeighborhoodInformation): number {
    let availableSpace = delta
    const rootNode = blockRoot
    let current = rootNode
    do {
      current = this.align[current.id]!
      const maxYCurrent = this.getMaxY(current)
      const neighbor = this.getLowerNeighbor(current, ni)
      if (neighbor !== null) {
        const minYNeighbor = this.getMinY(neighbor)
        availableSpace = Math.min(availableSpace,
          minYNeighbor - (maxYCurrent + this.spacings.getVerticalSpacing(current, neighbor)))
      }
    } while (rootNode !== current)
    return availableSpace
  }

  getMinY(n: LNode): number {
    const rootNode = this.root[n.id]!
    return this.y[rootNode.id] + this.innerShift[n.id] - n.getMargin().top
  }

  getMaxY(n: LNode): number {
    const rootNode = this.root[n.id]!
    return this.y[rootNode.id] + this.innerShift[n.id] + n.size.y + n.getMargin().bottom
  }

  getLowerNeighbor(n: LNode, ni: NeighborhoodInformation): LNode | null {
    const l = n.getLayer()!
    const layerIndex = ni.nodeIndex[n.id]!
    return layerIndex < l.getNodes().length - 1 ? l.getNodes()[layerIndex + 1]! : null
  }

  getUpperNeighbor(n: LNode, ni: NeighborhoodInformation): LNode | null {
    const l = n.getLayer()!
    const layerIndex = ni.nodeIndex[n.id]!
    return layerIndex > 0 ? l.getNodes()[layerIndex - 1]! : null
  }
}

