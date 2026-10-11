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
 * SCCNodeTypeCycleBreaker (对应 ELK p1cycles.SCCNodeTypeCycleBreaker).
 *
 * 扩展 SCCModelOrderCycleBreaker: 优先把「指定 source 组 id」的最小 model order 节点当 source
 * (反转其入边), 否则优先把「指定 target 组 id」的最大 model order 节点当 target (反转其出边),
 * 否则按连通性 (入度 vs 出度) 决定.
 *
 *   Precondition:  无自环
 *   Postcondition: 图无环
 *
 * 选项 (ggn layered-options.ts 未登记, 本地定义同 id Property, 与 Java
 * LayeredOptions.CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_PREFERRED_SOURCE_ID/TARGET_ID 一致):
 *   org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cbPreferredSourceId
 *   org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cbPreferredTargetId
 */
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { Property } from '../graph/properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
  GroupOrderStrategy,
} from '../options/layered-options.js'
import { GroupModelOrderCalculator } from './group-model-order-calculator.js'
import { SCCModelOrderCycleBreaker } from './SCCModelOrderCycleBreaker.js'

/** 断环首选 source 组 id (对应 ELK cbPreferredSourceId, 默认 0). */
export const CB_PREFERRED_SOURCE_ID = new Property<number>(
  'org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cbPreferredSourceId', 0)
/** 断环首选 target 组 id (对应 ELK cbPreferredTargetId, 默认 0). */
export const CB_PREFERRED_TARGET_ID = new Property<number>(
  'org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cbPreferredTargetId', 0)

export class SCCNodeTypeCycleBreaker extends SCCModelOrderCycleBreaker {
  override findNodes(offset: number, bigOffset: number): void {
    for (let i = 0; i < this.stronglyConnectedComponents.length; i++) {
      const scc = this.stronglyConnectedComponents[i]!
      if (scc.size <= 1) continue

      let min: LNode | null = null
      let max: LNode | null = null
      let modelOrderMin = Number.MAX_SAFE_INTEGER
      let modelOrderMax = Number.MIN_SAFE_INTEGER
      const enforceGroupModelOrder = this.graph!.getProperty(
        CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED
      const calculator = new GroupModelOrderCalculator()

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

      const preferredSourceId = this.graph!.getProperty(CB_PREFERRED_SOURCE_ID)
      const preferredTargetId = this.graph!.getProperty(CB_PREFERRED_TARGET_ID)

      // 最小 model order 节点是首选 source → 反转其入边 (本 SCC 内).
      if (min!.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID) === preferredSourceId) {
        for (const edge of min!.getIncomingEdges()) {
          if (scc.has(edge.getSource()!.getNode()!)) {
            this.revEdges.push(edge)
          }
        }
      } else if (max!.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID) === preferredTargetId) {
        // 最大 model order 节点是首选 target → 反转其出边.
        // 1:1 复刻 Java: 该分支按 edge.getSource() 判 SCC (恒为 max 自身 → 全部出边),
        // 而非 getTarget() (SCCNodeTypeCycleBreaker.java:94).
        for (const edge of max!.getOutgoingEdges()) {
          if (scc.has(edge.getSource()!.getNode()!)) {
            this.revEdges.push(edge)
          }
        }
      } else {
        // 回退到连通性判断.
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
}

/** 保持 LEdge 类型引用 (与 greedy-cycle-breaker.ts 风格一致). */
export type { LEdge }
