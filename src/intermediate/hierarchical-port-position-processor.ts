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
 * HierarchicalPortPositionProcessor (对应 ELK intermediate.HierarchicalPortPositionProcessor).
 *
 * P5 前: 对 FIXED_RATIO/FIXED_POS 的 E/W 外部端口 dummy, 按 PORT_RATIO_OR_POSITION 固定 y 坐标
 * (FIXED_RATIO 时乘以图高).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { Layer } from '../graph/layer.js'
import { NodeType, PortSide, PortConstraints } from '../graph/enums.js'
import { EXT_PORT_SIDE, PORT_RATIO_OR_POSITION } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, PORT_ANCHOR } from '../options/layered-options.js'

export function processHierarchicalPortPosition(layeredGraph: LGraph): void {
    const layers = layeredGraph.getLayers()
    if (layers.length > 0) fixCoordinates(layers[0]!, layeredGraph)
    if (layers.length > 1) fixCoordinates(layers[layers.length - 1]!, layeredGraph)
  }

function fixCoordinates(layer: Layer, layeredGraph: LGraph): void {
    const portConstraints = layeredGraph.getProperty(PORT_CONSTRAINTS)
    if (!(PortConstraints.isRatioFixed(portConstraints) || PortConstraints.isPosFixed(portConstraints))) return

    const graphHeight = layeredGraph.getActualSize().y
    for (const node of layer.getNodes()) {
      if (node.getType() !== NodeType.EXTERNAL_PORT) continue
      const side = node.getProperty(EXT_PORT_SIDE)
      if (side !== PortSide.EAST && side !== PortSide.WEST) continue

      let finalYCoordinate = node.getProperty(PORT_RATIO_OR_POSITION)
      if (portConstraints === PortConstraints.FIXED_RATIO) {
        finalYCoordinate *= graphHeight
      }
      node.getPosition().y = finalYCoordinate - (node.getProperty(PORT_ANCHOR)?.y ?? 0)  // ELK PORT_ANCHOR 默认 KVector.ZERO
      // ELK L123: borderToContentAreaCoordinates(false, true) — 边界坐标转内容坐标: y -= pad.top + offset.y
      // (548 inside-self-loop 实证: 缺此步 → dummy y=-5 而非 -17 → 父端口 y=7 而非 -5 → margin.top 0 而非 5)
      node.position.y -= layeredGraph.getPadding().top + layeredGraph.getOffset().y
    }
  }
