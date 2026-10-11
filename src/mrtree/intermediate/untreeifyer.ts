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
 * mrtree Untreeifyer — ELK alg.mrtree.intermediate.Untreeifyer 0.12.0.
 * 把 treeify 阶段移除的边重新插回图结构.
 */
import { TGraph, TEdge, P_REMOVABLE_EDGES, getProp } from '../graph.js'

export function untreeifyer(tGraph: TGraph): void {
  const edges = getProp<TEdge[]>(tGraph, P_REMOVABLE_EDGES, [])
  for (const tEdge of edges) {
    tEdge.getSource().getOutgoingEdges().push(tEdge)
    tEdge.getTarget().getIncomingEdges().push(tEdge)
  }
}
