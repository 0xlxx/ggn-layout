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
 * CoffmanGrahamLayerer (对应 ELK p2layers.CoffmanGrahamLayerer) — 1:1 移植.
 *
 * 在每层最大 (原始) 节点数受限的前提下分层, 上限由
 * LAYERING_COFFMAN_GRAHAM_LAYER_BOUND 指定 (Coffman & Graham, 1972).
 *
 * Precondition: 图无环.
 * Postcondition: 所有节点已分层, 边只连接层号递增的节点, 且每层节点数 ≤ 上限.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { Layer } from '../graph/layer.js'
import { LAYERING_COFFMAN_GRAHAM_LAYER_BOUND } from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

/**
 * 最小二叉堆 (Java PriorityQueue 等价): poll 返回 compare 序最小的元素.
 * siftUp/siftDown 与 Java PriorityQueue 相同, 保证任意 (含不一致) 比较器下
 * 的 poll 序列与 Java 完全一致.
 */
class BinaryHeap<T> {
  private heap: T[] = []

  constructor(private readonly compare: (a: T, b: T) => number) {}

  isEmpty(): boolean {
    return this.heap.length === 0
  }

  push(item: T): void {
    this.heap.push(item)
    this.siftUp(this.heap.length - 1)
  }

  poll(): T | undefined {
    if (this.heap.length === 0) return undefined
    const result = this.heap[0]
    const last = this.heap.pop()!
    if (this.heap.length > 0) {
      this.heap[0] = last
      this.siftDown(0)
    }
    return result
  }

  private siftUp(k: number): void {
    const item = this.heap[k]!
    while (k > 0) {
      const parent = (k - 1) >> 1
      const p = this.heap[parent]!
      if (this.compare(item, p) >= 0) break
      this.heap[k] = p
      k = parent
    }
    this.heap[k] = item
  }

  private siftDown(k: number): void {
    const n = this.heap.length
    const item = this.heap[k]!
    while (true) {
      let child = 2 * k + 1
      if (child >= n) break
      let c = this.heap[child]!
      const right = child + 1
      if (right < n) {
        const r = this.heap[right]!
        if (this.compare(c, r) > 0) {
          child = right
          c = r
        }
      }
      if (this.compare(item, c) <= 0) break
      this.heap[k] = c
      k = child
    }
    this.heap[k] = item
  }
}

export class CoffmanGrahamLayerer {
  /** Used during dfs of the transitive reduction algorithm. */
  private nodeMark: boolean[] = []
  /** A marked edge is one that is not part of the transitive reduction. */
  private edgeMark: boolean[] = []

  /** Used to identify sources during computation of the topological ordering. */
  private inDeg: number[] = []
  /** Used to identify sinks during layer assignment. */
  private outDeg: number[] = []

  /** The calculated topological order which forms the basis for the layering. */
  private topoOrd: number[] = []

  /** For each node, stores the positions of incoming nodes in the topological ordering.
   *  Due to the way the positions are added to the lists, one can assume that the
   *  lists are sorted. */
  private inTopo = new Map<LNode, number[]>()

  process(layeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Coffman-Graham Layering', 1)

    if (layeredGraph.getLayerlessNodes().length === 0) {
      monitor.done()
      return
    }

    // the maximum number of allowed nodes per layer
    const w = layeredGraph.getProperty(LAYERING_COFFMAN_GRAHAM_LAYER_BOUND)

    // initialization, assign indexes and initialize arrays
    let index = 0
    let edgeIndex = 0
    for (const n of layeredGraph.getLayerlessNodes()) {
      n.id = index++
      for (const e of n.getOutgoingEdges()) {
        e.id = edgeIndex++
      }
    }
    this.nodeMark = new Array(index).fill(false)
    this.edgeMark = new Array(edgeIndex).fill(false)
    this.inDeg = new Array(index).fill(0)
    this.outDeg = new Array(index).fill(0)
    this.topoOrd = new Array(index).fill(0)
    this.inTopo.clear()

    // --------------------------
    // #1 Remove transitive edges
    // --------------------------
    this.transitiveReduction(layeredGraph)

    // -------------------------------
    // #2 Compute topological ordering
    // -------------------------------
    const sources = new BinaryHeap<LNode>((u, v) => this.compareNodesInTopo(u, v))

    // for each node, determine its current in-degree and remember initial sources
    for (const v of layeredGraph.getLayerlessNodes()) {
      for (const e of v.getIncomingEdges()) {
        if (!this.edgeMark[e.id]) {
          this.inDeg[v.id]++
        }
      }
      if (this.inDeg[v.id] === 0) {
        sources.push(v)
      }
    }

    // compute topological ordering
    let i = 0
    while (!sources.isEmpty()) {
      const v = sources.poll()!
      // assign number of topological order
      this.topoOrd[v.id] = i++

      // update the rest of the graph
      for (const e of v.getOutgoingEdges()) {
        if (this.edgeMark[e.id]) {
          continue
        }
        const tgt = e.getTarget()!.getNode()!
        this.inDeg[tgt.id]--
        const list = this.inTopo.get(tgt) ?? []
        list.push(this.topoOrd[v.id])
        this.inTopo.set(tgt, list)
        if (this.inDeg[tgt.id] === 0) {
          sources.push(tgt) // 'tgt' is added according to its priority
        }
      }
    }

    // --------------------------
    // #3 Actual layer assignment
    // --------------------------
    // note that this time we start with sinks and work our way to the original graph's sources

    // set of candidate nodes, that is nodes for which all successors have been placed
    // highest priority first
    const sinks = new BinaryHeap<LNode>((n1, n2) => {
      const a = this.topoOrd[n1.id]
      const b = this.topoOrd[n2.id]
      return a > b ? -1 : a < b ? 1 : 0
    })
    for (const v of layeredGraph.getLayerlessNodes()) {
      for (const e of v.getOutgoingEdges()) {
        if (!this.edgeMark[e.id]) {
          this.outDeg[v.id]++
        }
      }
      if (this.outDeg[v.id] === 0) {
        sinks.push(v)
      }
    }

    // assign the layers
    const layers: Layer[] = []
    let currentLayer = this.createLayer(layeredGraph, layers)
    while (!sinks.isEmpty()) {
      // select a node for which all outgoing nodes have been placed,
      // and with maximum value in the topological sort
      const u = sinks.poll()!

      // start a new layer if the current one is already full,
      // or an in-layer edge would be introduced
      if (this.isLayerFull(currentLayer, w) || !this.canAdd(u, currentLayer)) {
        currentLayer = this.createLayer(layeredGraph, layers)
      }

      // place the node in the layer
      u.setLayer(currentLayer)

      // update out-degrees and collect the new sinks
      for (const e of u.getIncomingEdges()) {
        if (this.edgeMark[e.id]) {
          continue
        }
        const src = e.getSource()!.getNode()!
        this.outDeg[src.id]--
        if (this.outDeg[src.id] === 0) {
          sinks.push(src)
        }
      }
    }

    // the layers were created in inverse order
    for (let j = layers.length - 1; j >= 0; --j) {
      layeredGraph.getLayers().push(layers[j]!)
    }

    // clear layerless nodes
    layeredGraph.getLayerlessNodes().length = 0

    monitor.done()
  }

  private isLayerFull(layer: Layer, w: number): boolean {
    return layer.getNodes().length >= w
  }

  /** @return true if node {@code n} can be added to layer {@code l} without introducing in-layer edges. */
  private canAdd(n: LNode, l: Layer): boolean {
    for (const e of n.getOutgoingEdges()) {
      const v = e.getTarget()!.getNode()!
      if (v.getLayer() === l) {
        return false
      }
    }
    return true
  }

  /** @return a newly created layer for the passed graph. The layer is <b>appended</b> to the passed list of layers.
   *         Note that the layer is not yet added to the graph's list of layers. */
  private createLayer(graph: LGraph, layers: Layer[]): Layer {
    const aLayer = new Layer(graph)
    layers.push(aLayer)
    return aLayer
  }

  private compareNodesInTopo(u: LNode, v: LNode): number {
    const inListU = this.inTopo.get(u) ?? []
    const inListV = this.inTopo.get(v) ?? []

    // find the node with the lower associated maximum value in 'inTopo'
    // break ties by ignoring all equal maxima
    let iu = inListU.length - 1
    let iv = inListV.length - 1
    while (iu >= 0 && iv >= 0) {
      const a = inListU[iu]!
      const b = inListV[iv]!
      if (a !== b) {
        return a < b ? -1 : 1
      }
      iu--
      iv--
    }

    // Java 语义: ListIterator.hasNext() 仅在列表为空时为 false (previous() 后 cursor < size),
    // 故此处只看列表是否为空, 不看是否被消费完.
    if (inListU.length === 0 && inListV.length === 0) {
      // If the two nodes are the same, a secondary criterion is needed.
      // Else use the node id as a last resort.
      if (u.id < v.id) {
        return -1 // u < v
      } else if (u.id > v.id) {
        return 1 // u > v
      }
      // Else they are equal.
      return 0 // u == v
    } else if (inListU.length === 0) {
      return -1 // u < v
    } else {
      return 1 // u > v
    }
  }

  /** Remove transitive edges. */
  private transitiveReduction(graph: LGraph): void {
    for (const start of graph.getLayerlessNodes()) {
      this.nodeMark.fill(false)
      for (const out of start.getOutgoingEdges()) {
        this.dfs(start, out.getTarget()!.getNode()!)
      }
    }
  }

  private dfs(start: LNode, v: LNode): void {
    if (this.nodeMark[v.id]) {
      return
    }

    for (const out of v.getOutgoingEdges()) {
      const w = out.getTarget()!.getNode()!
      for (const transitive of w.getIncomingEdges()) {
        if (transitive.getSource()!.getNode() === start) {
          this.edgeMark[transitive.id] = true
        }
      }
      this.dfs(start, w)
    }

    this.nodeMark[v.id] = true
  }
}
