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
 * LayerSizeAndGraphHeightCalculator (对应 ELK intermediate.LayerSizeAndGraphHeightCalculator).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { NodeType } from '../graph/enums.js'
import { SPACING_PORTS_SURROUNDING, ALIGNMENT } from '../options/layered-options.js'

export class LayerSizeAndGraphHeightCalculator {
  process(layeredGraph: LGraph): void {
    let minY = Number.POSITIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    let foundNodes = false
    for (const layer of layeredGraph.getLayers()) {
      const layerSize = layer.getSize()
      layerSize.x = 0.0
      layerSize.y = 0.0

      if (layer.getNodes().length === 0) continue
      foundNodes = true

      for (const node of layer.getNodes()) {
        layerSize.x = Math.max(layerSize.x, node.size.x + node.getMargin().left + node.getMargin().right)
      }

      const firstNode = layer.getNodes()[0]!
      const portsSurrounding = layeredGraph.getProperty(SPACING_PORTS_SURROUNDING)
      let top = firstNode.getPosition().y - firstNode.getMargin().top
      if (firstNode.getType() === NodeType.EXTERNAL_PORT) top -= portsSurrounding.top

      const lastNode = layer.getNodes()[layer.getNodes().length - 1]!
      let bottom = lastNode.getPosition().y + lastNode.size.y + lastNode.getMargin().bottom
      if (lastNode.getType() === NodeType.EXTERNAL_PORT) bottom += portsSurrounding.bottom

      layerSize.y = bottom - top
      minY = Math.min(minY, top)
      maxY = Math.max(maxY, bottom)
    }

    if (!foundNodes) {
      minY = 0
      maxY = 0
    }

    layeredGraph.getSize().y = maxY - minY
    layeredGraph.getOffset().y -= minY
    if (process.env.GGN_LS_DBG) console.error(`[LS] size.y=${layeredGraph.getSize().y} offset.y=${layeredGraph.getOffset().y} minY=${minY} node0=${layeredGraph.getLayers()[0]?.getNodes()[0]?.id} margin.top=${layeredGraph.getLayers()[0]?.getNodes()[0]?.getMargin().top}`)
  }
}

/** LGraphUtil.placeNodesHorizontally 等价: 设置层内节点 x 位置. */
export function placeNodesHorizontally(layer: { getNodes(): LNode[]; getSize(): { x: number; y: number } }, xoffset: number): void {
  let maxLeftMargin = 0
  let maxRightMargin = 0
  for (const node of layer.getNodes()) {
    maxLeftMargin = Math.max(maxLeftMargin, node.getMargin().left)
    maxRightMargin = Math.max(maxRightMargin, node.getMargin().right)
  }

  for (const node of layer.getNodes()) {
    // per-node alignment (ELK CoreOptions.ALIGNMENT: LEFT/RIGHT/CENTER 显式指定, 默认 AUTOMATIC → 按端口比例).
    const alignment = node.getProperty(ALIGNMENT)
    let ratio: number
    if (alignment === 'LEFT') ratio = 0.0
    else if (alignment === 'RIGHT') ratio = 1.0
    else if (alignment === 'CENTER') ratio = 0.5
    else {
      // default alignment: 按端口数量比例 (in/out ports)
      let inports = 0
      let outports = 0
      for (const port of node.getPorts()) {
        if (port.getIncomingEdges().length > 0) inports++
        if (port.getOutgoingEdges().length > 0) outports++
      }
      if (inports + outports === 0) {
        ratio = 0.5
      } else {
        ratio = outports / (inports + outports)
      }
    }

    const size = layer.getSize()
    const nodeSize = node.size.x
    let xpos = (size.x - nodeSize) * ratio
    if (ratio > 0.5) {
      xpos -= maxRightMargin * 2 * (ratio - 0.5)
    } else if (ratio < 0.5) {
      xpos += maxLeftMargin * 2 * (0.5 - ratio)
    }

    const leftMargin = node.getMargin().left
    if (xpos < leftMargin) xpos = leftMargin
    const rightMargin = node.getMargin().right
    if (xpos > size.x - rightMargin - nodeSize) xpos = size.x - rightMargin - nodeSize

    node.position.x = xoffset + xpos
    if (process.env.GGN_PH_DBG) console.error(`[PH] node ${node.id} layerW=${size.x} marginL=${leftMargin} marginR=${rightMargin} ratio=${ratio} xpos=${xpos} xoffset=${xoffset}`)
  }
}
