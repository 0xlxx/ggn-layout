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
