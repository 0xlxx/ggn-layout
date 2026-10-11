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
