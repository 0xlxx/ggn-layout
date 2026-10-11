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
 * DepthFirstCycleBreaker (对应 ELK p1cycles.DepthFirstCycleBreaker).
 *
 * 深度优先遍历: 从每个 source (无入边) 出发 DFS, 剩余未访问节点 (必在环中) 再 DFS;
 * 指向当前 DFS 路径上 active 节点的边是回边, 反转之.
 * 迭代顺序 = 边顺序 (与 DFSNodeOrderCycleBreaker 用 model order 排序不同).
 *
 *   Precondition:  无层图
 *   Postcondition: 图无环
 *
 * 不支持 PRIORITY_DIRECTION 与层约束 (与 Java 一致).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { CYCLIC } from '../options/internal-properties.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class DepthFirstCycleBreaker {
  /** source 节点 (无入边). */
  private sources: LNode[] = []
  /** 节点是否已访问. */
  private visited: boolean[] = []
  /** 节点是否在当前 DFS 路径上 (回边判据). */
  private active: boolean[] = []
  /** 待反转的回边. */
  private edgesToBeReversed: LEdge[] = []

  process(graph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Depth-first cycle removal', 1)

    const nodes = graph.getLayerlessNodes()
    const nodeCount = nodes.length

    this.sources = []
    this.visited = new Array(nodeCount).fill(false)
    this.active = new Array(nodeCount).fill(false)
    this.edgesToBeReversed = []

    let index = 0
    for (const node of nodes) {
      // 节点 id 用作 visited/active 数组下标.
      node.id = index
      if (node.getIncomingEdges().length === 0) {
        this.sources.push(node)
      }
      index++
    }

    // 从每个 source 出发 DFS.
    for (const source of this.sources) {
      this.dfs(source)
    }

    // 未访问节点必在环中, 再 DFS.
    for (let i = 0; i < nodeCount; i++) {
      if (!this.visited[i]) {
        this.dfs(nodes[i]!)
      }
    }

    // 反转回边.
    for (const edge of this.edgesToBeReversed) {
      edge.reverse(graph, true)
      graph.setProperty(CYCLIC, true)
    }

    // 清理.
    this.sources = []
    this.visited = []
    this.active = []
    this.edgesToBeReversed = []

    monitor.done()
  }

  private dfs(n: LNode): void {
    if (this.visited[n.id]) return

    this.visited[n.id] = true
    this.active[n.id] = true

    for (const out of n.getOutgoingEdges()) {
      // 忽略自环.
      if (out.isSelfLoop()) continue

      const target = out.getTarget()!.getNode()!
      // 指向 active 节点 = 当前路径回边, 反转.
      if (this.active[target.id]) {
        this.edgesToBeReversed.push(out)
      } else {
        this.dfs(target)
      }
    }

    this.active[n.id] = false
  }
}

/** 保持 LGraph 类型引用 (与 greedy-cycle-breaker.ts 风格一致). */
export type { LGraph }
