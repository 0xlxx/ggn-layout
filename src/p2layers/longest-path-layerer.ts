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
 * LongestPathLayerer (对应 ELK p2layers.LongestPathLayerer).
 * 最基础的分层算法: 按到 sink 的最长路径分配层 (height = 层数 - 层索引).
 * 注: 图需已无环 (断环后).
 */
import type { LGraph } from '../graph/lgraph.js'
import { Layer } from '../graph/layer.js'
import type { LNode } from '../graph/lnode.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class LongestPathLayerer {
  private layeredGraph!: LGraph
  private nodeHeights = new Map<LNode, number>()

  process(theLayeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Longest path layering', 1)
    this.layeredGraph = theLayeredGraph
    const nodes = theLayeredGraph.getLayerlessNodes()
    this.nodeHeights = new Map()
    for (const node of nodes) this.nodeHeights.set(node, -1)

    for (const node of nodes) this.visit(node)

    // 清空未分层节点 (所有节点已入层).
    nodes.length = 0
    this.layeredGraph = null as unknown as LGraph
    this.nodeHeights = new Map()
    monitor.done()
  }

  private visit(node: LNode): number {
    const height = this.nodeHeights.get(node)!
    if (height >= 0) return height
    let maxHeight = 1
    for (const port of node.getPorts()) {
      for (const edge of port.getOutgoingEdges()) {
        const targetNode = edge.getTarget()!.getNode()!
        // 忽略自环
        if (node !== targetNode) {
          const targetHeight = this.visit(targetNode)
          maxHeight = Math.max(maxHeight, targetHeight + 1)
        }
      }
    }
    this.putNode(node, maxHeight)
    return maxHeight
  }

  private putNode(node: LNode, height: number): void {
    const layers = this.layeredGraph.getLayers()
    // 保证层数 >= height
    for (let i = layers.length; i < height; i++) {
      layers.unshift(new Layer(this.layeredGraph))
    }
    // 层索引 = 层数 - height
    node.setLayer(layers[layers.length - height]!)
    this.nodeHeights.set(node, height)
  }
}
