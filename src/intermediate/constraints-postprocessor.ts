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
 * ConstraintsPostprocessor (对应 ELK intermediate.ConstraintsPostprocessor).
 * P5 后置: 为每个 NORMAL 节点写层 ID + 层内位置 ID (LAYERING_LAYER_ID /
 * CROSSING_MINIMIZATION_POSITION_ID); 空层不递增层号, dummy 节点不获得 ID.
 */
import type { LGraph } from '../graph/lgraph.js'
import { NodeType } from '../graph/enums.js'
import { LAYERING_LAYER_ID, CROSSING_MINIMIZATION_POSITION_ID } from '../options/layered-options.js'

export function processConstraintsPost(layeredGraph: LGraph): void {
  let layerIndex = 0

  for (const layer of layeredGraph.getLayers()) {
    let posIndex = 0
    let nodeLayer = false
    for (const node of layer.getNodes()) {
      if (node.getType() === NodeType.NORMAL) {
        nodeLayer = true
        node.setProperty(LAYERING_LAYER_ID, layerIndex)
        node.setProperty(CROSSING_MINIMIZATION_POSITION_ID, posIndex)
        posIndex++
      }
    }
    // 空层不递增层号 (ELK: layers with no nodes in it should not increase the layer id).
    if (nodeLayer) {
      layerIndex++
    }
  }
}
