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
 * mrtree LevelCoordinatesProcessor — ELK alg.mrtree.intermediate.LevelCoordinatesProcessor 0.12.0.
 * 每层 LEVELMIN/LEVELMAX = 该层节点在布局方向上的 min/max 坐标.
 */
import { TGraph, P_LEVELMIN, P_LEVELMAX, getInt, setProp } from '../graph.js'
import { TREE_LEVEL } from '../options.js'

export function levelCoordinatesProcessor(tGraph: TGraph): void {
  // levels: [min, max] 对 (Java Pair<Double,Double>)
  const levels: { first: number; second: number }[] = []
  // Set up levels
  for (const n of tGraph.getNodes()) {
    while (getInt(n, TREE_LEVEL, 0) > levels.length - 1) {
      levels.push({ first: Number.MAX_VALUE, second: -Number.MAX_VALUE })
    }
    const curLevel = getInt(n, TREE_LEVEL, 0)
    const horizontal = tGraph.props['org.eclipse.elk.direction'] === 'LEFT' || tGraph.props['org.eclipse.elk.direction'] === 'RIGHT'
    if (horizontal) {
      if (n.getPosition().x < levels[curLevel].first) levels[curLevel].first = n.getPosition().x
      if (n.getPosition().x + n.getSize().x > levels[curLevel].second) levels[curLevel].second = n.getPosition().x + n.getSize().x
    } else {
      if (n.getPosition().y < levels[curLevel].first) levels[curLevel].first = n.getPosition().y
      if (n.getPosition().y + n.getSize().y > levels[curLevel].second) levels[curLevel].second = n.getPosition().y + n.getSize().y
    }
  }
  // Set node properties
  for (const n of tGraph.getNodes()) {
    const curLevel = getInt(n, TREE_LEVEL, 0)
    setProp(n, P_LEVELMIN, levels[curLevel].first)
    setProp(n, P_LEVELMAX, levels[curLevel].second)
  }
}
