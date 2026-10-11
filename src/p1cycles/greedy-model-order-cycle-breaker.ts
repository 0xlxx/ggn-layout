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
 * GreedyModelOrderCycleBreaker (对应 ELK p1cycles.GreedyModelOrderCycleBreaker).
 * GreedyCycleBreaker 变体: 最大 outflow 候选里选 model order 最小的节点.
 */
import type { LNode } from '../graph/lnode.js'
import type { LGraph } from '../graph/lgraph.js'
import { RANDOM, MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS, MODEL_ORDER } from '../options/internal-properties.js'
import { CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY, GroupOrderStrategy } from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'
import { GreedyCycleBreaker } from './greedy-cycle-breaker.js'
import { GroupModelOrderCalculator } from './group-model-order-calculator.js'

export class GreedyModelOrderCycleBreaker extends GreedyCycleBreaker {
  private layeredGraph!: LGraph

  override process(layeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    this.layeredGraph = layeredGraph
    super.process(layeredGraph, monitor)
  }

  /** 在最大 outflow 候选里选 model order 最小的节点. */
  protected chooseNodeWithMaxOutflow(nodes: LNode[]): LNode {
    let returnNode: LNode | null = null
    let minimumModelOrder = Number.MAX_SAFE_INTEGER
    const offset = Math.max(this.layeredGraph.getLayerlessNodes().length,
      this.layeredGraph.getProperty(MAX_MODEL_ORDER_NODES))
    const bigOffset = offset * this.layeredGraph.getProperty(CB_NUM_MODEL_ORDER_GROUPS)
    const moCalculator = new GroupModelOrderCalculator()
    const enforceGroupModelOrder = this.layeredGraph.getProperty(
      CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED
    for (const node of nodes) {
      if (node.hasProperty(MODEL_ORDER)) {
        const modelOrder = enforceGroupModelOrder
          ? moCalculator.computeConstraintGroupModelOrder(node, bigOffset, offset)
          : moCalculator.computeConstraintModelOrder(node, offset)
        if (minimumModelOrder > modelOrder) {
          minimumModelOrder = modelOrder
          returnNode = node
        }
      }
    }
    if (returnNode === null) {
      return nodes[this.layeredGraph.getProperty(RANDOM).nextInt(nodes.length)]!
    }
    return returnNode
  }
}
