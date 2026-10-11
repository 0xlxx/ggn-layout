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
 * GreedyCycleBreaker (对应 ELK org.eclipse.elk.alg.layered.p1cycles.GreedyCycleBreaker).
 *
 * 1:1 移植: 变量名与 Java 源码一致 (indeg/outdeg/mark/sources/sinks/nextLeft/nextRight...).
 * 算法: Eades/Lin/Smyth 1993 反馈弧集贪心.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { PRIORITY_DIRECTION } from '../options/layered-options.js'
import { RANDOM, CYCLIC } from '../options/internal-properties.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class GreedyCycleBreaker {
  private indeg: number[] = []
  private outdeg: number[] = []
  private mark: number[] = []
  private sources: LNode[] = []
  private sinks: LNode[] = []
  private random: { nextInt(bound: number): number } | null = null

  process(layeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Greedy cycle removal', 1)

    const nodes = layeredGraph.getLayerlessNodes()

    // initialize values for the algorithm (sum of priorities of incoming edges and outgoing
    // edges per node, and the ordering calculated for each node)
    let unprocessedNodeCount = nodes.length
    this.indeg = new Array(unprocessedNodeCount).fill(0)
    this.outdeg = new Array(unprocessedNodeCount).fill(0)
    this.mark = new Array(unprocessedNodeCount).fill(0)

    let index = 0
    for (const node of nodes) {
      // the node id is used as index for the indeg, outdeg, and mark arrays
      node.setGraph(layeredGraph)
      // Java 副作用: node.id 重设为 0..n-1 (GreedyCycleBreaker.java:110). DepthFirstModelOrderLayerer 的
      // isConnectedToCurrentLayer 在节点未入层时用 node.id 保存 desired layer — 依赖断环后的 0..n-1 初值.
      node.id = index

      for (const port of node.getPorts()) {
        // calculate the sum of edge priorities
        for (const edge of port.getIncomingEdges()) {
          // ignore self-loops
          if (edge.getSource() !== null && edge.getSource()!.getNode() === node) continue

          const priority = edge.getProperty(PRIORITY_DIRECTION)
          this.indeg[index] += priority > 0 ? priority + 1 : 1
        }

        for (const edge of port.getOutgoingEdges()) {
          // ignore self-loops
          if (edge.getTarget() !== null && edge.getTarget()!.getNode() === node) continue

          const priority = edge.getProperty(PRIORITY_DIRECTION)
          this.outdeg[index] += priority > 0 ? priority + 1 : 1
        }
      }

      // collect sources and sinks
      if (this.outdeg[index] === 0) {
        this.sinks.push(node)
      } else if (this.indeg[index] === 0) {
        this.sources.push(node)
      }
      index++
    }

    // next rank values used for sinks and sources (from right and from left)
    let nextRight = -1
    let nextLeft = 1

    // assign marks to all nodes
    const maxNodes: LNode[] = []
    this.random = layeredGraph.getProperty(RANDOM)
    if (process.env.GGN_GCB) {
      const all = nodes.map((n, i) => (n.getLabels()[0]?.text ?? n.id) + "(out=" + this.outdeg[i] + ",in=" + this.indeg[i] + ")").join(" ")
      console.error(`GGN_GCB init: ${all}`)
    }

    while (unprocessedNodeCount > 0) {
      // sinks are put to the right --> assign negative rank, which is later shifted to positive
      while (this.sinks.length > 0) {
        const sink = this.sinks.shift()!
        this.mark[nodes.indexOf(sink)] = nextRight--
        this.updateNeighbors(sink, nodes)
        unprocessedNodeCount--
      }

      // sources are put to the left --> assign positive rank
      while (this.sources.length > 0) {
        const source = this.sources.shift()!
        this.mark[nodes.indexOf(source)] = nextLeft++
        this.updateNeighbors(source, nodes)
        unprocessedNodeCount--
      }

      // while there are unprocessed nodes left that are neither sinks nor sources...
      if (unprocessedNodeCount > 0) {
        let maxOutflow = Number.MIN_SAFE_INTEGER

        // find the set of unprocessed node (=> mark == 0), with the largest out flow
        for (let i = 0; i < nodes.length; i++) {
          if (this.mark[i] === 0) {
            const outflow = this.outdeg[i] - this.indeg[i]
            if (outflow >= maxOutflow) {
              if (outflow > maxOutflow) {
                maxNodes.length = 0
                maxOutflow = outflow
              }
              maxNodes.push(nodes[i]!)
            }
          }
        }

        // randomly select a node from the ones with maximal outflow and put it left
        if (process.env.GGN_GCB) console.error(`GGN_GCB maxOutflow=${maxOutflow} maxNodes=[${maxNodes.map(n => (n.getLabels()[0]?.text ?? n.id) + "(out=" + this.outdeg[n.id] + ",in=" + this.indeg[n.id] + ")").join(" ")}]`)
        const maxNode = this.chooseNodeWithMaxOutflow(maxNodes)
        if (process.env.GGN_GCB) console.error(`GGN_GCB chose ${maxNode.getLabels()[0]?.text ?? maxNode.id}`)
        this.mark[nodes.indexOf(maxNode)] = nextLeft++
        this.updateNeighbors(maxNode, nodes)
        unprocessedNodeCount--
      }
    }

    // shift negative ranks to positive; this applies to sinks of the graph
    const shiftBase = nodes.length + 1
    for (let i = 0; i < nodes.length; i++) {
      if (this.mark[i] < 0) {
        this.mark[i] += shiftBase
      }
    }
    if (process.env.GGN_GCB) console.error(`GGN_GCB marks: ${nodes.map((n, i) => (n.getLabels()[0]?.text ?? n.id) + "=" + this.mark[i]).join(" ")}`)

    // reverse edges that point left
    for (const node of nodes) {
      for (const port of [...node.getPorts()]) {
        for (const edge of [...port.getOutgoingEdges()]) {
          const targetIx = nodes.indexOf(edge.getTarget()!.getNode()!)
          if (this.mark[nodes.indexOf(node)] > this.mark[targetIx]) {
            edge.reverse(layeredGraph, true)
            layeredGraph.setProperty(CYCLIC, true)
          }
        }
      }
    }

    this.dispose()
    monitor.done()
  }

  /** Choose a node among all nodes with the same maximum outflow (random). */
  protected chooseNodeWithMaxOutflow(nodes: LNode[]): LNode {
    return nodes[this.random!.nextInt(nodes.length)]!
  }

  /**
   * Updates indegree and outdegree values of the neighbors of the given node,
   * simulating its removal from the graph. The sources and sinks lists are
   * also updated.
   */
  private updateNeighbors(node: LNode, nodes: LNode[]): void {
    for (const port of node.getPorts()) {
      for (const edge of port.getConnectedEdges()) {
        const connectedPort = edge.getSource() === port ? edge.getTarget() : edge.getSource()
        if (connectedPort === null) continue
        const endpoint = connectedPort.getNode()!
        if (endpoint === null) continue

        // exclude self-loops
        if (node === endpoint) continue

        const priority = edge.getProperty(PRIORITY_DIRECTION)
        const p = priority < 0 ? 0 : priority
        const index = nodes.indexOf(endpoint)
        if (this.mark[index] === 0) {
          if (edge.getTarget() === connectedPort) {
            this.indeg[index] -= p + 1
            if (this.indeg[index] <= 0 && this.outdeg[index] > 0) {
              this.sources.push(endpoint)
            }
          } else {
            this.outdeg[index] -= p + 1
            if (this.outdeg[index] <= 0 && this.indeg[index] > 0) {
              this.sinks.push(endpoint)
            }
          }
        }
      }
    }
  }

  private dispose(): void {
    this.indeg = []
    this.outdeg = []
    this.mark = []
    this.sources = []
    this.sinks = []
  }
}

/** 移除未使用的类型引用 (LEdge 用于类型签名一致性). */
export type { LEdge }
