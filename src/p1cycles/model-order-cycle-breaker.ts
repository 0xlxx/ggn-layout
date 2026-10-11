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
 * ModelOrderCycleBreaker (对应 ELK p1cycles.ModelOrderCycleBreaker).
 * 反转所有「逆 model order」的边 (target model order < source model order), 使图无环.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LEdge } from '../graph/ledge.js'
import { PortType } from '../graph/enums.js'
import { MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS, CYCLIC } from '../options/internal-properties.js'
import { CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY, GroupOrderStrategy } from '../options/layered-options.js'
import type { IElkProgressMonitor } from '../layered-layout-provider.js'
import { GroupModelOrderCalculator } from './group-model-order-calculator.js'

export function processModelOrderCycleBreak(layeredGraph: LGraph, monitor: IElkProgressMonitor): void {
    monitor.begin('Model order cycle breaking', 1)

    // 收集逆 model order 的边.
    const revEdges: LEdge[] = []
    // ELK 0.12.0 bug 复刻 (modelOrderCycleBreaking): ModelOrderCycleBreaker.java:70
    // `Math.max(size, layeredGraph.getProperty(MAX_MODEL_ORDER_NODES))` — 该图 MAX_MODEL_ORDER_NODES
    // 未设置时 ELK getProperty 返回 null (Property 无默认) → Integer.intValue NPE.
    // ggn Property 默认 0 → 不抛错 → 用 hasProperty 精确复刻.
    if (!layeredGraph.hasProperty(MAX_MODEL_ORDER_NODES)) {
      throw new TypeError('NullPointerException: Cannot invoke "java.lang.Integer.intValue()" because the return value of "org.eclipse.elk.alg.layered.graph.LGraph.getProperty(org.eclipse.elk.graph.properties.IProperty)" is null')
    }
    const offset = Math.max(layeredGraph.getLayerlessNodes().length,
      layeredGraph.getProperty(MAX_MODEL_ORDER_NODES))
    const bigOffset = offset * layeredGraph.getProperty(CB_NUM_MODEL_ORDER_GROUPS)
    const enforceGroupModelOrder = layeredGraph.getProperty(
      CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ENFORCED

    for (const source of layeredGraph.getLayerlessNodes()) {
      const calculator = new GroupModelOrderCalculator()
      const modelOrderSource = enforceGroupModelOrder
        ? calculator.computeConstraintGroupModelOrder(source, bigOffset, offset)
        : calculator.computeConstraintModelOrder(source, offset)

      for (const port of source.getPorts(PortType.OUTPUT)) {
        for (const edge of port.getOutgoingEdges()) {
          const target = edge.getTarget()!.getNode()!
          const modelOrderTarget = enforceGroupModelOrder
            ? calculator.computeConstraintGroupModelOrder(target, bigOffset, offset)
            : calculator.computeConstraintModelOrder(target, offset)
          if (modelOrderTarget < modelOrderSource) revEdges.push(edge)
        }
      }
    }

    // 反转收集到的边.
    for (const edge of revEdges) {
      edge.reverse(layeredGraph, true)
      layeredGraph.setProperty(CYCLIC, true)
    }
    monitor.done()
  }
