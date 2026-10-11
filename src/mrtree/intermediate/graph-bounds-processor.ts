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
