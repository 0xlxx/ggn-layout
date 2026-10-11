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
 * ReversedEdgeRestorer (对应 ELK intermediate.ReversedEdgeRestorer).
 * 反转回 P1 断环时反转的边 (compound 跨层级边恢复的前提).
 */
import type { LGraph } from '../graph/lgraph.js'
import { REVERSED } from '../options/internal-properties.js'

export function processReversedEdges(layeredGraph: LGraph): void {
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      for (const port of node.getPorts()) {
        for (const edge of [...port.getOutgoingEdges()]) {
          if (edge.getProperty(REVERSED)) {
            edge.reverse(layeredGraph, false)
          }
        }
      }
    }
  }
}
