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
 * NORTH/SOUTH 外部端口 dummy 宽度: 按 edgeEdgeBetweenLayers*2 递增/递减, 使纵向边段间距一致 (P4 前运行).
 * 对应 ELK intermediate.HierarchicalPortDummySizeProcessor, 依赖 EXT_PORT_SIDE.
 *
 * ELK 依据:
 *   - HierarchicalPortDummySizeProcessor.java:71  读 SPACING_EDGE_EDGE_BETWEEN_LAYERS (非 SPACING_EDGE_EDGE)
 *   - HierarchicalPortDummySizeProcessor.java:119 setWidths 内对每个 N/S dummy 设 ALIGNMENT=CENTER
 */
import type { LGraph } from '../graph/lgraph.js'
import type { Layer } from '../graph/layer.js'
import type { LNode } from '../graph/lnode.js'
import { NodeType, PortSide } from '../graph/enums.js'
import { EXT_PORT_SIDE } from '../options/internal-properties.js'
import { SPACING_EDGE_EDGE_BETWEEN_LAYERS, ALIGNMENT } from '../options/layered-options.js'

export function processHierarchicalPortDummySize(layeredGraph: LGraph): void {
  // ELK HierarchicalPortDummySizeProcessor.java:71-72
  const delta = layeredGraph.getProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS) * 2
  for (const layer of layeredGraph.getLayers()) {
    const { north, south } = partitionExternalPortDummies(layer)
    setWidths(north, /* topDown */ true, delta)
    setWidths(south, /* topDown */ false, delta)
  }
}

/** 按侧收集层内的 N/S 外部端口 dummy. */
function partitionExternalPortDummies(layer: Layer): { north: LNode[]; south: LNode[] } {
  const north: LNode[] = []
  const south: LNode[] = []
  for (const node of layer.getNodes()) {
    if (node.getType() !== NodeType.EXTERNAL_PORT) continue
    const side = node.getProperty(EXT_PORT_SIDE)
    if (side === PortSide.NORTH) north.push(node)
    else if (side === PortSide.SOUTH) south.push(node)
  }
  return { north, south }
}

/** 北侧 top→down 递增, 南侧 bottom→up 递增 (镜像). */
function setWidths(nodes: LNode[], topDown: boolean, delta: number): void {
  let width = topDown ? 0 : delta * (nodes.length - 1)
  const step = topDown ? delta : -delta
  for (const node of nodes) {
    // ELK HierarchicalPortDummySizeProcessor.java:119
    node.setProperty(ALIGNMENT, 'CENTER')
    node.size.x = width
    for (const port of node.getPorts(PortSide.EAST)) port.getPosition().x = width
    width += step
  }
}
