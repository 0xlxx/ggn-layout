/**
 * BFSNodeOrderCycleBreaker (对应 ELK p1cycles.BFSNodeOrderCycleBreaker).
 *
 * 广度优先遍历: 目标节点已访问且当前节点非 source / 目标非 sink 时, 反转该 model order
 * 桶内全部边; 否则入队. 出边按目标 model order 排序 (ENFORCED 时按组 model order),
 * 无 model order 的目标按高位唯一值排最后.
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

export class BFSNodeOrderCycleBreaker {
  /** source 节点集合 (无入边). */
  private sources = new Set<LNode>()
  /** sink 节点集合 (无出边). */
  private sinks = new Set<LNode>()
  /** 节点是否已访问. */
  private visited: boolean[] = []
  /** BFS 队列. */
  private bfsQueue: LNode[] = []
  /** 待反转的边. */
  private edgesToBeReversed: LEdge[] = []
  private graph: LGraph | null = null

  process(graph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Breadth-first cycle removal', 1)

    this.graph = graph
    const nodes = graph.getLayerlessNodes()

    this.bfsQueue = []
    this.sources = new Set()
    this.sinks = new Set()
    this.visited = new Array(nodes.length).fill(false)
    this.edgesToBeReversed = []

    // 找所有 source 和 sink.
    let index = 0
    for (const node of nodes) {
      node.id = index
      if (node.getIncomingEdges().length === 0) this.sources.add(node)
      if (node.getOutgoingEdges().length === 0) this.sinks.add(node)
      index++
    }

    // 从每个 source 顺序 BFS.
    for (const source of this.sources) {
      this.bfsQueue.push(source)
      this.bfsLoop()
    }

    this.bfsLoop()

    // 从第一个未访问节点再 BFS (必在环中).
    let changed = true
    while (changed) {
      changed = false
      for (let i = 0; i < nodes.length; i++) {
        if (!this.visited[i]) {
          this.bfsQueue.push(nodes[i]!)
          changed = true
          break
        }
      }
      this.bfsLoop()
    }

    // 反转回边.
    for (const edge of this.edgesToBeReversed) {
      edge.reverse(graph, true)
      graph.setProperty(CYCLIC, true)
    }

    // 清理.
    this.sources = new Set()
    this.visited = []
    this.bfsQueue = []
    this.edgesToBeReversed = []

    monitor.done()
  }

  private bfsLoop(): void {
    while (this.bfsQueue.length > 0) {
      this.bfs(this.bfsQueue.shift()!)
    }
  }

  private bfs(n: LNode): void {
    if (this.visited[n.id]) return
    this.visited[n.id] = true

    // 目标 model order → 边桶. 每桶按 model order 排序访问.
    const modelOrderMap = new Map<number, LEdge[]>()
    const groupModelOrder = this.graph!.getProperty(
      CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED

    for (const e of n.getOutgoingEdges()) {
      const target = e.getTarget()!.getNode()!
      if (!target.hasProperty(MODEL_ORDER)) {
        // 无 model order 的目标: 高位唯一值, 第一个最后访问, 第二个倒数第二.
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

    // 所有不同 model order 按升序访问 (TreeSet 语义).
    const modelOrderSet = [...modelOrderMap.keys()].sort((a, b) => a - b)

    for (const key of modelOrderSet) {
      const bucket = modelOrderMap.get(key)!
      const out = bucket[0]!
      // 自环不访问 (整桶跳过, 与 Java 对 iterator().next() 的 isSelfLoop 判断一致).
      if (out.isSelfLoop()) continue

      const target = out.getTarget()!.getNode()!
      // 目标已访问且当前节点非 source、目标非 sink → 反转该桶全部边.
      if (this.visited[target.id] && !this.sources.has(n) && !this.sinks.has(target)) {
        this.edgesToBeReversed.push(...bucket)
      } else {
        this.bfsQueue.push(target)
      }
    }
  }
}

/** 保持 LGraph 类型引用 (与 greedy-cycle-breaker.ts 风格一致). */
export type { LGraph }
