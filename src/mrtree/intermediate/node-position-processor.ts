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
 * mrtree NodePositionProcessor — ELK alg.mrtree.intermediate.NodePositionProcessor 0.12.0.
 * 把 XCOOR/YCOOR 写入节点位置, 最后所有节点 position -= size/2 (中心 → 左上角).
 */
import { KVector } from '../../force/kvector.js'
import { TGraph, TNode, P_XCOOR, P_YCOOR, P_ROOT, getBool, getInt } from '../graph.js'

export function nodePositionProcessor(tGraph: TGraph): void {
  const root = tGraph.getNodes().find((tNode) => getBool(tNode, P_ROOT, false))
  if (root === undefined) return
  const pos = root.getPosition()
  pos.x = getInt(root, P_XCOOR, 0)
  pos.y = getInt(root, P_YCOOR, 0)

  let nextLevel = root.getChildrenCopy()
  do {
    nextLevel = setCoordinates(nextLevel)
  } while (nextLevel.length > 0)

  // Move node positions to their middle to achieve the same spacing between all nodes
  for (const n of tGraph.getNodes()) {
    n.getPosition().sub(new KVector(n.getSize().x / 2, n.getSize().y / 2))
  }
}

function setCoordinates(currentLevel: TNode[]): TNode[] {
  if (currentLevel.length === 0) return []
  const nextLevel: TNode[] = []
  for (const tNode of currentLevel) {
    nextLevel.push(...tNode.getChildrenCopy())
    const pos = tNode.getPosition()
    pos.x = getInt(tNode, P_XCOOR, 0)
    pos.y = getInt(tNode, P_YCOOR, 0)
  }
  return nextLevel
}
