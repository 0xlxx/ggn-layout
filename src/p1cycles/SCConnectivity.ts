/**
 * SCConnectivity (对应 ELK p1cycles.SCConnectivity).
 *
 * 基于 SCCModelOrderCycleBreaker: 对每个 SCC 找 model order 最小/最大节点,
 * 若最小节点的入度 > 最大节点的出度则反转最小节点的入边 (本 SCC 内), 否则反转最大节点的出边 (本 SCC 内).
 * 可选使用组 model order 作为主判据 (ENFORCED).
 *
 *   Precondition:  无自环
 *   Postcondition: 图无环
 */
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY,
  GroupOrderStrategy,
} from '../options/layered-options.js'
import { GroupModelOrderCalculator } from './group-model-order-calculator.js'
import { SCCModelOrderCycleBreaker } from './SCCModelOrderCycleBreaker.js'

export class SCConnectivity extends SCCModelOrderCycleBreaker {
  override findNodes(offset: number, bigOffset: number): void {
    for (let i = 0; i < this.stronglyConnectedComponents.length; i++) {
      const scc = this.stronglyConnectedComponents[i]!
      // 单节点 SCC 无需处理 (Tarjan 本就不登记, 保留 Java 分支).
      if (scc.size <= 1) continue

      let min: LNode | null = null
      let max: LNode | null = null
      let modelOrderMin = Number.MAX_SAFE_INTEGER
      let modelOrderMax = Number.MIN_SAFE_INTEGER
      const enforceGroupModelOrder = this.graph!.getProperty(
        CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED
      const calculator = new GroupModelOrderCalculator()

      // 遍历 SCC 找 model order 最小/最大节点.
      for (const n of scc) {
        if (min === null || max === null) {
          min = n
          modelOrderMin = enforceGroupModelOrder
            ? calculator.computeConstraintGroupModelOrder(n, bigOffset, offset)
            : calculator.computeConstraintModelOrder(n, offset)
          max = n
          modelOrderMax = modelOrderMin
        } else {
          const modelOrderCurrent = enforceGroupModelOrder
            ? calculator.computeConstraintGroupModelOrder(n, bigOffset, offset)
            : calculator.computeConstraintModelOrder(n, offset)
          if (modelOrderMin > modelOrderCurrent) {
            min = n
            modelOrderMin = modelOrderCurrent
          }
          if (modelOrderMax < modelOrderCurrent) {
            max = n
            modelOrderMax = modelOrderCurrent
          }
        }
      }

      // 最小节点入边多 → 反转其入边 (本 SCC 内); 否则反转最大节点出边 (本 SCC 内).
      const minIncoming = min!.getIncomingEdges()
      const maxOutgoing = max!.getOutgoingEdges()
      if (minIncoming.length > maxOutgoing.length) {
        for (const edge of minIncoming) {
          if (scc.has(edge.getSource()!.getNode()!)) {
            this.revEdges.push(edge)
          }
        }
      } else {
        for (const edge of maxOutgoing) {
          if (scc.has(edge.getTarget()!.getNode()!)) {
            this.revEdges.push(edge)
          }
        }
      }
    }
  }
}

/** 保持 LEdge 类型引用 (与 greedy-cycle-breaker.ts 风格一致). */
export type { LEdge }
