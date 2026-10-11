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
 * DFSNodeOrderCycleBreaker (对应 ELK p1cycles.DFSNodeOrderCycleBreaker).
 *
 * 与 DepthFirstCycleBreaker 相同但用节点 (model) order 决定访问顺序: 出边按目标
 * model order 升序 (ENFORCED 时按组 model order) 访问; 指向 active 节点的边是回边,
 * 反转该桶全部边.
 *
 *   Precondition:  无层图
 *   Postcondition: 图无环
 *
 * 不支持 PRIORITY_DIRECTION 与层约束 (与 Java 一致).
 * 注: Java 用 HashSet 存桶, 桶内首边迭代序不确定; ggn 用插入序 (桶[0]), 行为确定性等价.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { CYCLIC, MODEL_ORDER, MAX_MODEL_ORDER_NODES } from '../options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
  GroupOrderStrategy,
} from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'

export class DFSNodeOrderCycleBreaker {
  /** source 节点 (无入边). */
  private sources: LNode[] = []
  /** 节点是否已访问. */
  private visited: boolean[] = []
  /** 节点是否在当前 DFS 路径上 (回边判据). */
  private active: boolean[] = []
  /** 待反转的边. */
  private edgesToBeReversed: LEdge[] = []
  private graph: LGraph | null = null

  process(graph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Depth-first cycle removal', 1)

    this.graph = graph
    const nodes = graph.getLayerlessNodes()
    const nodeCount = nodes.length

    this.sources = []
    this.visited = new Array(nodeCount).fill(false)
    this.active = new Array(nodeCount).fill(false)
    this.edgesToBeReversed = []

    let index = 0
    for (const node of nodes) {
      node.id = index
      if (node.getIncomingEdges().length === 0) this.sources.push(node)
      index++
    }

    for (const source of this.sources) {
      this.dfs(source)
    }

    for (let i = 0; i < nodeCount; i++) {
      if (!this.visited[i]) {
        this.dfs(nodes[i]!)
      }
    }

    for (const edge of this.edgesToBeReversed) {
      edge.reverse(graph, true)
      graph.setProperty(CYCLIC, true)
    }

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

    const modelOrderMap = new Map<number, LEdge[]>()
    const groupModelOrder = this.graph!.getProperty(
      CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED

    // 按目标 model order 建桶 (无 model order 的给高位唯一值排最后).
    for (const e of n.getOutgoingEdges()) {
      const target = e.getTarget()!.getNode()!
      if (!target.hasProperty(MODEL_ORDER)) {
        modelOrderMap.set(2147483647 - modelOrderMap.size, [e])
      } else {
        let targetModelOrder = 0
        if (groupModelOrder) {
          const maxModelOrderGroupSize = this.graph!.getProperty(MAX_MODEL_ORDER_NODES)
          targetModelOrder = maxModelOrderGroupSize
            * target.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID)
            + target.getProperty(MODEL_ORDER)
        } else {
          targetModelOrder = target.getProperty(MODEL_ORDER)
        }
        const bucket = modelOrderMap.get(targetModelOrder)
        if (bucket !== undefined) bucket.push(e)
        else modelOrderMap.set(targetModelOrder, [e])
      }
    }

    const modelOrderSet = [...modelOrderMap.keys()].sort((a, b) => a - b)

    for (const key of modelOrderSet) {
      const bucket = modelOrderMap.get(key)!
      const out = bucket[0]!
      if (out.isSelfLoop()) continue

      const target = out.getTarget()!.getNode()!
      // 指向 active 节点 = 当前路径回边, 反转该桶全部边.
      if (this.active[target.id]) {
        this.edgesToBeReversed.push(...bucket)
      } else {
        this.dfs(target)
      }
    }

    this.active[n.id] = false
  }
}

/** 保持 LGraph 类型引用 (与 greedy-cycle-breaker.ts 风格一致). */
export type { LGraph }
