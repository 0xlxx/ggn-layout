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
 * InLayerConstraintProcessor (对应 ELK intermediate.InLayerConstraintProcessor).
 * P4 前置: TOP/BOTTOM 层内约束节点移到层内首/尾 (外部端口 dummy 使用).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { InLayerConstraint } from '../graph/enums.js'

export function processInLayerConstraints(layeredGraph: LGraph): void {
  for (const layer of layeredGraph.getLayers()) {
    let topInsertionIndex = -1
    const bottomConstrained: LNode[] = []
    for (const [i, node] of [...layer.getNodes()].entries()) {
      const constraint = node.getInLayerConstraint()
      if (topInsertionIndex === -1) {
        if (constraint !== InLayerConstraint.TOP) topInsertionIndex = i
      } else if (constraint === InLayerConstraint.TOP) {
        node.setLayer(null)
        node.setLayerAt(topInsertionIndex++, layer)
      }
      if (constraint === InLayerConstraint.BOTTOM) bottomConstrained.push(node)
    }
    for (const node of bottomConstrained) {
      node.setLayer(null)
      node.setLayer(layer)
    }
  }
}
