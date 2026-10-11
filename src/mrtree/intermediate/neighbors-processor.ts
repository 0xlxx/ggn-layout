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
 * mrtree NeighborsProcessor — ELK alg.mrtree.intermediate.NeighborsProcessor 0.12.0.
 * 按层设置 LEFTNEIGHBOR/RIGHTNEIGHBOR/LEFTSIBLING/RIGHTSIBLING (同层相邻/同父兄弟).
 */
import { TGraph, TNode, P_ROOT, P_LEFTNEIGHBOR, P_RIGHTNEIGHBOR, P_LEFTSIBLING, P_RIGHTSIBLING, getBool, setProp } from '../graph.js'

export function neighborsProcessor(tGraph: TGraph): void {
  const root = tGraph.getNodes().find((tNode) => getBool(tNode, P_ROOT, false))
  if (root === undefined) return
  setNeighbors(root.getChildren())
}

function setNeighbors(currentLevel: TNode[]): void {
  if (currentLevel.length === 0) return
  const nextLevel: TNode[] = []
  let lN: TNode | null = null
  for (const cN of currentLevel) {
    // Java 原版每轮新建数组 (concat) 产生 O(level²) 拷贝; push 顺序与结果完全一致
    for (const child of cN.getChildren()) nextLevel.push(child)
    if (lN !== null) {
      setProp(lN, P_RIGHTNEIGHBOR, cN)
      setProp(cN, P_LEFTNEIGHBOR, lN)
      if (cN.getParent() === lN.getParent()) {
        setProp(lN, P_RIGHTSIBLING, cN)
        setProp(cN, P_LEFTSIBLING, lN)
      }
    }
    lN = cN
  }
  setNeighbors(nextLevel)
}
