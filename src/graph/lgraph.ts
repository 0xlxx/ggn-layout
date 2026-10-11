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
 * LGraph (对应 ELK graph.LGraph).
 */
import { MapPropertyHolder } from './properties.js'
import { Direction, type KVector } from './enums.js'
import type { LNode } from './lnode.js'
import type { Layer } from './layer.js'
import { GRAPH_PROPERTIES } from '../options/internal-properties.js'

export interface LPadding {
  left: number
  top: number
  right: number
  bottom: number
}

export class LGraph extends MapPropertyHolder {
  constructor() {
    super()
    // 每图独立 GRAPH_PROPERTIES Set (默认值是共享 Set, getProperty 会缓存到图属性表,
    // 直接 .add 会污染所有未显式设置的图 → 跨测试/跨图状态泄漏).
    this.setProperty(GRAPH_PROPERTIES, new Set())
  }

  id = 0
  private size: KVector = { x: 0, y: 0 }
  private padding: LPadding = { left: 12, top: 12, right: 12, bottom: 12 }
  private offset: KVector = { x: 0, y: 0 }
  private layerlessNodes: LNode[] = []
  private layers: Layer[] = []
  private parentNode: LNode | null = null
  private direction: Direction = Direction.UNDEFINED

  getSize(): KVector {
    return this.size
  }

  getPadding(): LPadding {
    return this.padding
  }

  /** 设置图内边距 (对应 ELK CoreOptions.PADDING / ElkPadding). */
  setPadding(padding: Partial<LPadding>): void {
    this.padding = { ...this.padding, ...padding }
  }

  /** 实际尺寸 = size + padding (对应 ELK getActualSize). */
  getActualSize(): KVector {
    return {
      x: this.size.x + this.padding.left + this.padding.right,
      y: this.size.y + this.padding.top + this.padding.bottom,
    }
  }

  getOffset(): KVector {
    return this.offset
  }

  getLayerlessNodes(): LNode[] {
    return this.layerlessNodes
  }

  getLayers(): Layer[] {
    return this.layers
  }

  getParentNode(): LNode | null {
    return this.parentNode
  }

  setParentNode(parentNode: LNode | null): void {
    this.parentNode = parentNode
  }

  getDirection(): Direction {
    return this.direction
  }

  setDirection(direction: Direction): void {
    this.direction = direction
  }

  /** 层节点数组 (对应 ELK toNodeArray). */
  toNodeArray(): LNode[][] {
    return this.layers.map(l => [...l.getNodes()])
  }

  /** 所有节点 (层内 + 未分层). */
  getAllNodes(): LNode[] {
    let count = this.layerlessNodes.length
    for (const layer of this.layers) count += layer.getNodes().length
    const result = new Array<LNode>(count)
    let index = 0
    for (const layer of this.layers) {
      for (const node of layer.getNodes()) result[index++] = node
    }
    for (const node of this.layerlessNodes) result[index++] = node
    return result
  }
}
