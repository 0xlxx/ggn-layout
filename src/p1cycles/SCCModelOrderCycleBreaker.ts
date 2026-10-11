/**
 * SCCModelOrderCycleBreaker (对应 ELK p1cycles.SCCModelOrderCycleBreaker, 抽象基类).
 *
 * 依赖 Tarjan 算法求强连通分量, 对每个 SCC 选出 model order (或 ENFORCED 组 model order)
 * 最大的节点, 反转其指向本 SCC 的出边, 循环直到图无环.
 *
 *   Precondition:  无自环
 *   Postcondition: 图无环
 *
 * 1:1 移植说明 (与 Java 的差异均为可观察行为等价):
 *   - Tarjan 状态 (TARJAN_ID/LOWLINK/ON_STACK) 用局部 Map 代替节点属性 — ggn 无这些内部属性,
 *     且 SCC 断环内部不读取, 外部不可见.
 *   - Java 在反转后给新 source 节点 LAYERING_LAYER_ID + 1 — ggn 无该属性 (层由 Layer 对象管理),
 *     跳过 (见 SCCModelOrderCycleBreaker.java:115).
 *   - ELK 0.12.0 bug 复刻: MAX_MODEL_ORDER_NODES 未设置时 getProperty 返回 null → Integer.intValue NPE.
 *     (ggn Property 默认 0 不抛错 → 用 hasProperty 精确复刻, 与 model-order-cycle-breaker.ts 一致.)
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS, CYCLIC } from '../options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY,
  GroupOrderStrategy,
} from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'
import { GroupModelOrderCalculator } from './group-model-order-calculator.js'

/**
 * Tarjan 强连通分量计算 (对应 ELK graph.Tarjan).
 * 只登记 size > 1 的 SCC (单节点 SCC 不加入列表, 与 Java 一致).
 */
export class Tarjan {
  private readonly edgesToBeReversed: LEdge[]
  private readonly stronglyConnectedComponents: Set<LNode>[]
  private readonly nodeToSCCID: Map<LNode, number>
  private index = 0
  private stack: LNode[] = []
  /** TARJAN_ID 的局部替代 (Java: 节点属性 InternalProperties.TARJAN_ID). */
  private tarjanId = new Map<LNode, number>()
  /** TARJAN_LOWLINK 的局部替代. */
  private tarjanLowlink = new Map<LNode, number>()
  /** TARJAN_ON_STACK 的局部替代. */
  private tarjanOnStack = new Map<LNode, boolean>()

  constructor(
    edgesToBeReversed: LEdge[],
    stronglyConnectedComponents: Set<LNode>[],
    nodeToSCCID: Map<LNode, number>,
  ) {
    this.edgesToBeReversed = edgesToBeReversed
    this.stronglyConnectedComponents = stronglyConnectedComponents
    this.nodeToSCCID = nodeToSCCID
  }

  tarjan(graph: LGraph): void {
    this.index = 0
    this.stack = []
    for (const node of graph.getLayerlessNodes()) {
      if ((this.tarjanId.get(node) ?? -1) === -1) {
        this.stronglyConnected(node)
        this.stack.length = 0
      }
    }
  }

  private stronglyConnected(v: LNode): void {
    this.tarjanId.set(v, this.index)
    this.tarjanLowlink.set(v, this.index)
    this.index++
    this.stack.push(v)
    this.tarjanOnStack.set(v, true)

    for (const edge of v.getConnectedEdges()) {
      // 已收集待反转的边按反方向遍历 (此用法下 revEdges 恒为空, 保留 Java 分支以 1:1 对齐).
      if (edge.getSource()!.getNode() !== v && !this.edgesToBeReversed.includes(edge)) continue
      if (edge.getSource()!.getNode() === v && this.edgesToBeReversed.includes(edge)) continue

      const target = edge.getTarget()!.getNode() === v
        ? edge.getSource()!.getNode()!
        : edge.getTarget()!.getNode()!

      if ((this.tarjanId.get(target) ?? -1) === -1) {
        this.stronglyConnected(target)
        this.tarjanLowlink.set(v, Math.min(this.tarjanLowlink.get(v)!, this.tarjanLowlink.get(target)!))
      } else if (this.tarjanOnStack.get(target)) {
        this.tarjanLowlink.set(v, Math.min(this.tarjanLowlink.get(v)!, this.tarjanId.get(target)!))
      }
    }

    if (this.tarjanLowlink.get(v) === this.tarjanId.get(v)) {
      const sCC = new Set<LNode>()
      let n: LNode
      do {
        n = this.stack.pop()!
        this.tarjanOnStack.set(n, false)
        sCC.add(n)
      } while (v !== n)
      if (sCC.size > 1) {
        const sccIndex = this.stronglyConnectedComponents.length
        this.stronglyConnectedComponents.push(sCC)
        for (const node of sCC) this.nodeToSCCID.set(node, sccIndex)
      }
    }
  }

  resetTarjan(graph: LGraph): void {
    for (const n of graph.getLayerlessNodes()) {
      this.tarjanOnStack.set(n, false)
      this.tarjanLowlink.set(n, -1)
      this.tarjanId.set(n, -1)
      this.stack.length = 0
      // Java 同时把边的 IS_PART_OF_CYCLE 置 false — ggn 无该内部属性且 SCC 断环不读取, 跳过.
    }
  }
}

/**
 * SCC 断环基类 (对应 ELK p1cycles.SCCModelOrderCycleBreaker).
 * findNodes 可被 SCConnectivity / SCCNodeTypeCycleBreaker 覆写.
 */
export class SCCModelOrderCycleBreaker {
  /** Tarjan 求出的强连通分量列表. */
  protected stronglyConnectedComponents: Set<LNode>[] = []
  /** 节点 → SCC id 映射. */
  protected nodeToSCCID = new Map<LNode, number>()
  /** 待反转的边. */
  protected revEdges: LEdge[] = []
  /** 当前图. */
  protected graph: LGraph | null = null

  process(layeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Model order cycle breaking', 1)

    this.graph = layeredGraph
    this.revEdges = []

    // 偏移量保证带层约束的节点 model order 与普通节点错开.
    // ELK 0.12.0 bug 复刻: MAX_MODEL_ORDER_NODES 未设置 → NPE (见文件头注释).
    if (!layeredGraph.hasProperty(MAX_MODEL_ORDER_NODES)) {
      throw new TypeError('Cannot invoke "java.lang.Integer.intValue()" because the return value of "org.eclipse.elk.alg.layered.graph.LGraph.getProperty(org.eclipse.elk.graph.properties.IProperty)" is null')
    }
    const offset = Math.max(layeredGraph.getLayerlessNodes().length,
      layeredGraph.getProperty(MAX_MODEL_ORDER_NODES))
    const bigOffset = offset * layeredGraph.getProperty(CB_NUM_MODEL_ORDER_GROUPS)

    while (true) {
      const t = new Tarjan(this.revEdges, this.stronglyConnectedComponents, this.nodeToSCCID)
      t.resetTarjan(layeredGraph)
      t.tarjan(layeredGraph)

      // 没有强连通分量 → 图已无环.
      if (this.stronglyConnectedComponents.length === 0) break

      this.findNodes(offset, bigOffset)

      // 反转收集到的边.
      for (const edge of this.revEdges) {
        edge.reverse(layeredGraph, false)
        layeredGraph.setProperty(CYCLIC, true)
      }

      this.stronglyConnectedComponents.length = 0
      this.nodeToSCCID.clear()
      this.revEdges.length = 0
    }

    monitor.done()
  }

  /**
   * 找出每个 SCC 内 model order (或组 model order) 最大的节点, 反转其指向本 SCC 的出边.
   */
  findNodes(offset: number, bigOffset: number): void {
    for (let i = 0; i < this.stronglyConnectedComponents.length; i++) {
      const scc = this.stronglyConnectedComponents[i]!
      let max: LNode | null = null
      const calculator = new GroupModelOrderCalculator()
      let maxModelOrder = Number.MIN_SAFE_INTEGER
      const enforceGroupModelOrder = this.graph!.getProperty(
        CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED
      for (const n of scc) {
        if (max === null) {
          // 第一个元素.
          max = n
          maxModelOrder = enforceGroupModelOrder
            ? calculator.computeConstraintGroupModelOrder(n, bigOffset, offset)
            : calculator.computeConstraintModelOrder(n, offset)
        } else {
          const modelOrderCurrent = enforceGroupModelOrder
            ? calculator.computeConstraintGroupModelOrder(n, bigOffset, offset)
            : calculator.computeConstraintModelOrder(n, offset)
          if (maxModelOrder < modelOrderCurrent) {
            max = n
            maxModelOrder = modelOrderCurrent
          }
        }
      }
      for (const edge of max!.getOutgoingEdges()) {
        // 只反转指向同一 SCC 的边.
        if (scc.has(edge.getTarget()!.getNode()!)) {
          this.revEdges.push(edge)
        }
      }
    }
  }
}

/** 保持 LEdge 类型引用 (与 greedy-cycle-breaker.ts 风格一致). */
export type { LEdge }
