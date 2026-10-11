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
