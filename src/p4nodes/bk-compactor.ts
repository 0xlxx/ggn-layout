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
 * BKCompactor (对应 ELK p4nodes.bk.BKCompactor).
 *
 * 免分配 (簇 bk-node-placement):
 *  - 方向逆序遍历改为索引遍历 (去掉 [...layers].reverse() / [...nodes].reverse() 拷贝).
 *  - y 空位哨兵 null → NaN (配合 bk-aligned-layout 的 Float64Array).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { NeighborhoodInformation } from './neighborhood-information.js'
import { BKAlignedLayout, HDirection, VDirection } from './bk-aligned-layout.js'
import { SPACINGS } from '../options/internal-properties.js'
import { NODE_PLACEMENT_BK_EDGE_STRAIGHTENING, SPACING_NODE_NODE, EdgeStraighteningStrategy } from '../options/layered-options.js'
import { SimpleThresholdStrategy, NullThresholdStrategy, ThresholdStrategy } from './threshold-strategy.js'
import type { Spacings } from './spacings.js'

class ClassNode {
  classShift: number | null = null
  node!: LNode
  outgoing: ClassEdge[] = []
  indegree = 0
}

class ClassEdge {
  separation = 0
  target!: ClassNode
}

export class BKCompactor {
  private layeredGraph: LGraph
  private threshStrategy: ThresholdStrategy
  private ni: NeighborhoodInformation
  private spacings: Spacings
  private sinkNodes = new Map<LNode, ClassNode>()
  /** 复用池: ClassNode/ClassEdge 跨 compaction 免分配 (4 方向 × 每图). */
  private classNodePool: ClassNode[] = []
  private classEdgePool: ClassEdge[] = []

  constructor(layeredGraph: LGraph, ni: NeighborhoodInformation) {
    this.layeredGraph = layeredGraph
    this.ni = ni
    this.spacings = layeredGraph.getProperty(SPACINGS)
    this.threshStrategy =
      layeredGraph.getProperty(NODE_PLACEMENT_BK_EDGE_STRAIGHTENING) === EdgeStraighteningStrategy.IMPROVE_STRAIGHTNESS
        ? new SimpleThresholdStrategy()
        : new NullThresholdStrategy()
  }

  horizontalCompaction(bal: BKAlignedLayout): void {
    for (const layer of this.layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        bal.sink[node.id] = node
        bal.shift[node.id] = bal.vdir === VDirection.UP ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
      }
    }
    // 回收 ClassNode/ClassEdge 到复用池 (下次 compaction 复用, 免 GC)
    for (const n of this.sinkNodes.values()) {
      for (const e of n.outgoing) this.classEdgePool.push(e)
      n.outgoing.length = 0
      this.classNodePool.push(n)
    }
    this.sinkNodes.clear()

    const layers = this.layeredGraph.getLayers()
    const layerCount = layers.length
    const hdirLeft = bal.hdir === HDirection.LEFT
    const vdirUp = bal.vdir === VDirection.UP

    this.threshStrategy.init(bal, this.ni)
    bal.y.fill(Number.NaN)

    for (let li = 0; li < layerCount; li++) {
      const layer = layers[hdirLeft ? layerCount - 1 - li : li]!
      const nodes = layer.getNodes()
      const nodeCount = nodes.length
      for (let vi = 0; vi < nodeCount; vi++) {
        const v = nodes[vdirUp ? nodeCount - 1 - vi : vi]!
        if (bal.root[v.id] === v) this.placeBlock(v, bal)
      }
    }

    this.placeClasses(bal)

    for (let li = 0; li < layerCount; li++) {
      const layer = layers[hdirLeft ? layerCount - 1 - li : li]!
      for (const v of layer.getNodes()) {
        bal.y[v.id] = bal.y[bal.root[v.id]!.id]
        if (v === bal.root[v.id]) {
          const sinkShift = bal.shift[bal.sink[v.id]!.id]
          if ((bal.vdir === VDirection.UP && sinkShift > Number.NEGATIVE_INFINITY)
            || (bal.vdir === VDirection.DOWN && sinkShift < Number.POSITIVE_INFINITY)) {
            bal.y[v.id] = bal.y[v.id] + sinkShift
          }
        }
      }
    }

    this.threshStrategy.postProcess()
    if (process.env.GGN_BK_DBG) {
      console.error(`GGN BK done vdir=${bal.vdir} hdir=${bal.hdir} y=[${bal.y.join(', ')}] innerShift=[${bal.innerShift.join(', ')}]`)
    }
  }

  private placeBlock(root: LNode, bal: BKAlignedLayout): void {
    if (!Number.isNaN(bal.y[root.id])) return

    let isInitialAssignment = true
    bal.y[root.id] = 0.0

    let currentNode = root
    let thresh = bal.vdir === VDirection.DOWN ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY
    do {
      const currentIndexInLayer = this.ni.nodeIndex[currentNode.id]!
      const currentLayerSize = currentNode.getLayer()!.getNodes().length

      if ((bal.vdir === VDirection.DOWN && currentIndexInLayer > 0)
        || (bal.vdir === VDirection.UP && currentIndexInLayer < currentLayerSize - 1)) {
        let neighbor: LNode
        if (bal.vdir === VDirection.UP) neighbor = currentNode.getLayer()!.getNodes()[currentIndexInLayer + 1]!
        else neighbor = currentNode.getLayer()!.getNodes()[currentIndexInLayer - 1]!
        const neighborRoot = bal.root[neighbor.id]!

        this.placeBlock(neighborRoot, bal)

        thresh = this.threshStrategy.calculateThreshold(thresh, root, currentNode)

        if (bal.sink[root.id] === root) bal.sink[root.id] = bal.sink[neighborRoot.id]

        if (bal.sink[root.id] === bal.sink[neighborRoot.id]) {
          const spacing = this.spacings.getVerticalSpacing(currentNode, neighbor)
          if (bal.vdir === VDirection.UP) {
            const currentBlockPosition = bal.y[root.id]
            const newPosition = bal.y[neighborRoot.id]
              + bal.innerShift[neighbor.id] - neighbor.getMargin().top
              - spacing
              - currentNode.getMargin().bottom - currentNode.size.y
              - bal.innerShift[currentNode.id]
            if (isInitialAssignment) {
              isInitialAssignment = false
              bal.y[root.id] = Math.min(newPosition, thresh)
            } else {
              bal.y[root.id] = Math.min(currentBlockPosition, Math.min(newPosition, thresh))
            }
          } else {
            const currentBlockPosition = bal.y[root.id]
            const newPosition = bal.y[neighborRoot.id]
              + bal.innerShift[neighbor.id] + neighbor.size.y + neighbor.getMargin().bottom
              + spacing
              + currentNode.getMargin().top
              - bal.innerShift[currentNode.id]
            if (isInitialAssignment) {
              isInitialAssignment = false
              bal.y[root.id] = Math.max(newPosition, thresh)
            } else {
              bal.y[root.id] = Math.max(currentBlockPosition, Math.max(newPosition, thresh))
            }
          }
        } else {
          const spacing = this.layeredGraph.getProperty(SPACING_NODE_NODE)
          const sinkNode = this.getOrCreateClassNode(bal.sink[root.id]!, bal)
          const neighborSink = this.getOrCreateClassNode(bal.sink[neighborRoot.id]!, bal)
          if (bal.vdir === VDirection.UP) {
            const requiredSpace = bal.y[root.id]
              + bal.innerShift[currentNode.id] + currentNode.size.y + currentNode.getMargin().bottom
              + spacing
              - (bal.y[neighborRoot.id] + bal.innerShift[neighbor.id] - neighbor.getMargin().top)
            this.addClassEdge(sinkNode, neighborSink, requiredSpace)
          } else {
            const requiredSpace = bal.y[root.id]
              + bal.innerShift[currentNode.id] - currentNode.getMargin().top
              - bal.y[neighborRoot.id] - bal.innerShift[neighbor.id]
              - neighbor.size.y - neighbor.getMargin().bottom
              - spacing
            this.addClassEdge(sinkNode, neighborSink, requiredSpace)
          }
        }
      } else {
        thresh = this.threshStrategy.calculateThreshold(thresh, root, currentNode)
      }

      currentNode = bal.align[currentNode.id]!
    } while (currentNode !== root)

    this.threshStrategy.finishBlock(root)
  }

  private placeClasses(bal: BKAlignedLayout): void {
    const sinks: ClassNode[] = []
    for (const n of this.sinkNodes.values()) {
      if (n.indegree === 0) sinks.push(n)
    }

    while (sinks.length > 0) {
      const n = sinks.shift()!
      if (n.classShift === null) n.classShift = 0.0
      for (const e of n.outgoing) {
        if (e.target.classShift === null) {
          e.target.classShift = n.classShift + e.separation
        } else if (bal.vdir === VDirection.DOWN) {
          e.target.classShift = Math.min(e.target.classShift, n.classShift + e.separation)
        } else {
          e.target.classShift = Math.max(e.target.classShift, n.classShift + e.separation)
        }
        e.target.indegree--
        if (e.target.indegree === 0) sinks.push(e.target)
      }
    }

    for (const n of this.sinkNodes.values()) {
      bal.shift[n.node.id] = n.classShift!
    }
  }

  private addClassEdge(sinkNode: ClassNode, neighborSink: ClassNode, requiredSpace: number): void {
    const se = this.classEdgePool.pop() ?? new ClassEdge()
    se.target = neighborSink
    se.separation = requiredSpace
    neighborSink.indegree++
    sinkNode.outgoing.push(se)
  }

  private getOrCreateClassNode(sinkNode: LNode, bal: BKAlignedLayout): ClassNode {
    void bal
    let node = this.sinkNodes.get(sinkNode)
    if (node === undefined) {
      node = this.classNodePool.pop() ?? new ClassNode()
      node.classShift = null
      node.indegree = 0
      node.outgoing.length = 0
      node.node = sinkNode
      this.sinkNodes.set(node.node, node)
    }
    return node
  }
}
