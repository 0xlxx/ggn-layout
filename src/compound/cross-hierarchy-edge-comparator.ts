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

