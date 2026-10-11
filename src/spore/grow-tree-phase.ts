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
 * GrowTreePhase — ELK alg.spore.p3execution.GrowTreePhase 0.12.0.
 *
 * P3 执行 (overlap removal): 前序遍历生成树, 每条父→子边按 Utils.overlap
 * 拉伸因子 t 沿「子 original - 父 original」方向伸长, 消除父子的矩形重叠;
 * 任一 t > 1 置 OVERLAPS_EXISTED (驱动外层迭代).
 */
import { Tree, Node, Graph } from './graph.js'
import { overlap } from './geometry.js'

export function growTreePhase(graph: Graph): void {
  graph.overlapsExisted = false
  growAt(graph.tree!, graph)
}

function growAt(r: Tree<Node>, graph: Graph): void {
  for (const c of r.children) {
    // 子节点随父节点平移
    c.node.translate(r.node.vertex.clone().sub(r.node.originalVertex))

    // 消除父-子重叠所需的伸长因子
    const t = overlap(r.node.rect, c.node.rect)
    if (t > 1.0) graph.overlapsExisted = true

    // 沿父 original → 子 original 方向伸长
    c.node.setCenterPosition(r.node.vertex.clone().add(
      c.node.originalVertex.clone().sub(r.node.originalVertex).scale(t),
    ))

    growAt(c, graph)
  }
}
