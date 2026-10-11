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
 * mrtree LevelProcessor — ELK alg.mrtree.intermediate.LevelProcessor 0.12.0.
 * BFS 逐层设置 TREE_LEVEL.
 */
import { TGraph, TNode, P_ROOT, getBool } from '../graph.js'
import { TREE_LEVEL } from '../options.js'

export function levelProcessor(tGraph: TGraph): void {
  const gloLevelMap = new Map<number, number>()
  const roots = tGraph.getNodes().filter((x) => getBool(x, P_ROOT, false))
  setLevel(roots, 0, gloLevelMap)
  for (const tNode of tGraph.getNodes()) {
    const level = gloLevelMap.get(tNode.id) ?? 0
    tNode.props[TREE_LEVEL] = level
  }
}

function setLevel(currentLevel: TNode[], level: number, gloLevelMap: Map<number, number>): void {
  if (currentLevel.length > 0) {
    const nextLevel: TNode[] = []
    for (const tNode of currentLevel) {
      gloLevelMap.set(tNode.id, level)
      for (const tChild of tNode.getChildren()) nextLevel.push(tChild)
    }
    setLevel(nextLevel, level + 1, gloLevelMap)
  }
}
