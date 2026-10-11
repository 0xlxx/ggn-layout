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
 * LongEdgeJoiner (对应 ELK intermediate.LongEdgeJoiner).
 * 合并 LONG_EDGE dummy 的入/出边 (保留入边, 丢弃出边, 汇合弯点/标签/连接点).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { NodeType, PortSide } from '../graph/enums.js'
import { UNNECESSARY_BENDPOINTS, JUNCTION_POINTS } from '../options/layered-options.js'

export function processLongEdgeJoin(layeredGraph: LGraph): void {
  const addUnnecessaryBendpoints = layeredGraph.getProperty(UNNECESSARY_BENDPOINTS)
  for (const layer of layeredGraph.getLayers()) {
    const nodes = layer.getNodes()
    for (let i = nodes.length - 1; i >= 0; i--) {
      const node = nodes[i]!
      if (node.getType() === NodeType.LONG_EDGE) {
        joinAt(node, addUnnecessaryBendpoints)
        nodes.splice(i, 1)
      }
    }
  }
}

export function joinAt(longEdgeDummy: LNode, addUnnecessaryBendpoints: boolean): void {
  const westPort = longEdgeDummy.getPorts(PortSide.WEST)[0]!
  const eastPort = longEdgeDummy.getPorts(PortSide.EAST)[0]!
  const inputPortEdges = westPort.getIncomingEdges()
  const outputPortEdges = eastPort.getOutgoingEdges()
  let edgeCount = inputPortEdges.length

  const unnecessaryBendpoint = longEdgeDummy.getPorts()[0]!.getAbsoluteAnchor()

  while (edgeCount-- > 0) {
    const survivingEdge = inputPortEdges[0]!
    const droppedEdge = outputPortEdges[0]!

    // KIPRA-1670: 保留入边要插到目标端口入边列表的相同索引 (保证与出边配对假设).
    const targetIncomingEdges = droppedEdge.getTarget()!.getIncomingEdges()
    const droppedEdgeListIndex = targetIncomingEdges.indexOf(droppedEdge)
    survivingEdge.setTargetAndInsertAtIndex(droppedEdge.getTarget(), droppedEdgeListIndex)

    droppedEdge.setSource(null)
    droppedEdge.setTarget(null)

    const survivingBendPoints = survivingEdge.getBendPoints()
    if (addUnnecessaryBendpoints) survivingBendPoints.push({ ...unnecessaryBendpoint })
    for (const bendPoint of droppedEdge.getBendPoints()) survivingBendPoints.push({ ...bendPoint })

    for (const label of droppedEdge.getLabels()) survivingEdge.getLabels().push(label)

    const survivingJunctionPoints = survivingEdge.getProperty(JUNCTION_POINTS) as unknown[] | null
    const droppedJunctionsPoints = droppedEdge.getProperty(JUNCTION_POINTS) as unknown[] | null
    if (droppedJunctionsPoints !== null && droppedJunctionsPoints !== undefined) {
      if (survivingJunctionPoints === null || survivingJunctionPoints === undefined) {
        survivingEdge.setProperty(JUNCTION_POINTS, [...droppedJunctionsPoints])
      } else {
        survivingJunctionPoints.push(...droppedJunctionsPoints)
      }
    }
  }
}
