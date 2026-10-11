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
 * CrossHierarchyEdgeComparator (对应 ELK compound.CrossHierarchyEdgeComparator).
 * 段排序: OUTPUT 在前 (深者先), INPUT 在后 (浅者先).
 */
import type { CrossHierarchyEdge } from './cross-hierarchy-edge.js'
import type { LGraph } from '../graph/lgraph.js'
import { PortType } from '../graph/enums.js'

function hierarchyLevel(graph: LGraph, top: LGraph): number {
  let level = 0
  let current = graph
  // 分量拆分后层级链可能断开 (子图 parentNode 在分量图): 断链时停止, 返回当前深度.
  while (current !== top) {
    const parent = current.getParentNode()
    if (parent === null) break
    const parentGraph = parent.getGraph()
    if (parentGraph === null) break
    current = parentGraph
    level++
  }
  return level
}

export function compareCrossHierarchyEdges(a: CrossHierarchyEdge, b: CrossHierarchyEdge, topGraph: LGraph): number {
    const aType = a.getType()
    const bType = b.getType()

    if (aType === PortType.OUTPUT && bType === PortType.INPUT) return -1
    if (aType === PortType.INPUT && bType === PortType.OUTPUT) return 1

    if (aType === PortType.OUTPUT) {
      // 同为 OUTPUT: 深者在前 (from deeper to higher).
      return hierarchyLevel(b.getGraph(), topGraph) - hierarchyLevel(a.getGraph(), topGraph)
    }
    // 同为 INPUT: 浅者在前 (from higher to deeper).
    return hierarchyLevel(a.getGraph(), topGraph) - hierarchyLevel(b.getGraph(), topGraph)
  }

