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
 * NodeMarginCalculator (对应 ELK alg.common NodeMarginCalculator + layered InnermostNodeMarginCalculator).
 *
 * 计算节点 margin = 包围盒 (节点 + 端口 + 端口 label) 超出节点边界部分.
 * LPort.position 相对节点原点.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { effectivePlacement, labelNodeSpacing, outsideNodeLabelMargins } from './labels/node-label-placer.js'

export function calculateNodeMargins(graph: LGraph): void {
  const layers = graph.getLayers()
  for (const layer of layers) {
    for (const node of layer.getNodes()) {
      calculateNodeMargin(node)
    }
  }
}

export function calculateNodeMargin(node: LNode): void {
  const size = node.getSize()
  let minX = 0
  let minY = 0
  let maxX = size.x
  let maxY = size.y

  // 端口自身 + 端口 label (ELK NodeMarginCalculator includePortLabels 默认 true)
  for (const port of node.getPorts()) {
    const p = port.getPosition()
    const s = port.getSize()
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + s.x)
    maxY = Math.max(maxY, p.y + s.y)
    for (const label of port.getLabels()) {
      const lp = label.position
      const ls = label.size
      minX = Math.min(minX, p.x + lp.x)
      minY = Math.min(minY, p.y + lp.y)
      maxX = Math.max(maxX, p.x + lp.x + ls.x)
      maxY = Math.max(maxY, p.y + lp.y + ls.y)
    }
  }

  // 节点 label (已按 placement 放置, ELK includeLabels)
  for (const label of node.getLabels()) {
    const p = label.position
    const s = label.size
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + s.x)
    maxY = Math.max(maxY, p.y + s.y)

    // ELK NodeLabelPlacer: OUTSIDE label 放节点外 → margin 含 label 区 (spacing + label 尺寸).
    // NodeLabelPlacer 已按 placement 放置 label (y 负 + nodeLabelSpacing), 此处按同一语义
    // 补 OUTSIDE 外扩增量, 使 margin.top/bottom/left/right 含 OUTSIDE label 区.
    const placement = effectivePlacement(label, node)
    if (placement.includes('OUTSIDE')) {
      const deltas = outsideNodeLabelMargins(s, placement, labelNodeSpacing(node))
      minX = Math.min(minX, -deltas.left)
      minY = Math.min(minY, -deltas.top)
      maxX = Math.max(maxX, size.x + deltas.right)
      maxY = Math.max(maxY, size.y + deltas.bottom)
    }
  }

  const margin = node.getMargin()
  margin.left = -minX
  margin.top = -minY
  margin.right = maxX - size.x
  margin.bottom = maxY - size.y
}
