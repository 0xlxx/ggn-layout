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
 * mrtree GraphBoundsProcessor — ELK alg.mrtree.intermediate.GraphBoundsProcessor 0.12.0.
 * 计算图的 min/max 包围盒 (position 为左上角 + size).
 */
import { TGraph, P_GRAPH_XMIN, P_GRAPH_YMIN, P_GRAPH_XMAX, P_GRAPH_YMAX, setProp } from '../graph.js'

export function graphBoundsProcessor(tGraph: TGraph): void {
  setProp(tGraph, P_GRAPH_XMIN, Math.min(...tGraph.getNodes().map((x) => x.getPosition().x)))
  setProp(tGraph, P_GRAPH_YMIN, Math.min(...tGraph.getNodes().map((x) => x.getPosition().y)))
  setProp(tGraph, P_GRAPH_XMAX, Math.max(...tGraph.getNodes().map((x) => x.getPosition().x + x.getSize().x)))
  setProp(tGraph, P_GRAPH_YMAX, Math.max(...tGraph.getNodes().map((x) => x.getPosition().y + x.getSize().y)))
}
