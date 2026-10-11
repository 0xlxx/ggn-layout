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
 * mrtree RootProcessor — ELK alg.mrtree.intermediate.RootProcessor 0.12.0.
 * 找入边为空的节点为 root; 0 个 → DUMMY_ROOT; 多个 → SUPER_ROOT (dummy 边连接).
 */
import { TGraph, TNode, P_ROOT, P_DUMMY, setProp } from '../graph.js'

export function rootProcessor(tGraph: TGraph): void {
  const roots: TNode[] = []
  for (const node of tGraph.getNodes()) {
    if (node.getIncomingEdges().length === 0) {
      setProp(node, P_ROOT, true)
      roots.push(node)
    }
  }
  switch (roots.length) {
    case 0:
      // assert tGraph.getNodes().isEmpty()
      {
        const root = new TNode(0, tGraph, 'DUMMY_ROOT')
        setProp(root, P_ROOT, true)
        setProp(root, P_DUMMY, true)
        tGraph.getNodes().push(root)
      }
      break
    case 1:
      // perfect, we already have only one root
      break
    default: {
      const superRoot = new TNode(0, tGraph, 'SUPER_ROOT')
      for (const tRoot of roots) {
        superRoot.addChild(tRoot)
        setProp(tRoot, P_ROOT, false)
      }
      setProp(superRoot, P_ROOT, true)
      setProp(superRoot, P_DUMMY, true)
      tGraph.getNodes().push(superRoot)
      break
    }
  }
}
