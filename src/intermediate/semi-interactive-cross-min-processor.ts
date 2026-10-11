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
 * SemiInteractiveCrossMinProcessor (对应 ELK intermediate.SemiInteractiveCrossMinProcessor).
 *
 * 与全交互 InteractiveCrossingMinimizer 不同, 本处理器只对「设置了 POSITION 属性」的普通节点
 * 在同一层内按 POSITION.y 升序引入成对后继约束 (IN_LAYER_SUCCESSOR_CONSTRAINTS), 由 P3
 * LayerSweep 的 ForsterConstraintResolver 消费 → 保持用户指定的相对顺序, 其余节点自由排序.
 * 仅在 CROSSING_MINIMIZATION_SEMI_INTERACTIVE 时由 GraphConfigurator 加入 (P3 前置).
 *
 * ELK Java: SemiInteractiveCrossMinProcessor.process (0.12.0).
 */
import { LGraph } from '../graph/lgraph.js'
import { NodeType } from '../graph/enums.js'
import { POSITION } from '../options/layered-options.js'
import { IN_LAYER_SUCCESSOR_CONSTRAINTS, IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES } from '../options/internal-properties.js'

export function processSemiInteractiveCrossMin(graph: LGraph): void {
  let addedConstraints = false

  for (const layer of graph.getLayers()) {
    const positioned = layer.getNodes()
      .filter((n) => n.getType() === NodeType.NORMAL)
      .filter((n) => n.hasProperty(POSITION) && n.getProperty(POSITION) !== null)
      .sort((n1, n2) => {
        const p1 = n1.getProperty(POSITION)
        const p2 = n2.getProperty(POSITION)
        return (p1?.y ?? 0) - (p2?.y ?? 0)
      })
    for (let i = 0; i + 1 < positioned.length; i++) {
      const succ = positioned[i]!.getProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS) ?? []
      succ.push(positioned[i + 1]!)
      positioned[i]!.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, succ)
      addedConstraints = true
    }
  }

  if (addedConstraints) {
    graph.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES, true)
  }
}
