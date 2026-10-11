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
 * DummySelfLoopProcessor (对应 ELK intermediate.DummySelfLoopProcessor).
 * P3 前置: 处理特殊自环形态 (EAST/WEST 互连等), 反转边或插入长边 dummy.
 */
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide, PortConstraints } from '../graph/enums.js'
import { ORIGIN, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, JUNCTION_POINTS } from '../options/layered-options.js'

export function processDummySelfLoops(layeredGraph: LGraph): void {
    if (process.env.GGN_DSL_DBG) {
      for (const n of layeredGraph.getAllNodes()) {
        if (n.getPorts().length >= 2) console.error(`[DSL] ${n.id} ports=${n.getPorts().map((p: LPort) => `${p.id}:${p.getSide()}`).join(',')}`)
      }
    }
    for (const layer of layeredGraph.getLayers()) {
      const createdDummies: LNode[] = []

      for (const node of layer.getNodes()) {
        for (const port of node.getPorts()) {
          const edges = [...port.getOutgoingEdges()]
          for (const edge of edges) {
            if (edge.getSource()!.getNode() !== edge.getTarget()!.getNode()) continue

            const sourcePort = edge.getSource()!
            const targetPort = edge.getTarget()!
            const sourcePortSide = sourcePort.getSide()
            const targetPortSide = targetPort.getSide()

            // 反转场景
            if ((sourcePortSide === PortSide.NORTH || sourcePortSide === PortSide.SOUTH)
              && targetPortSide === PortSide.WEST) {
              edge.reverse(layeredGraph, false)
            } else if (sourcePortSide === PortSide.SOUTH && targetPortSide === PortSide.NORTH) {
              edge.reverse(layeredGraph, false)
            } else if (sourcePortSide === PortSide.EAST && targetPortSide !== PortSide.EAST) {
              edge.reverse(layeredGraph, false)
            }

            // 重新读取 (反转后源/目标已交换)
            const srcSide = edge.getSource()!.getSide()
            const tgtSide = edge.getTarget()!.getSide()
            if (srcSide === PortSide.EAST && tgtSide === PortSide.WEST) {
              createdDummies.push(createDummy(layeredGraph, edge, edge.getTarget()!, edge.getSource()!))
            } else if (srcSide === PortSide.WEST && tgtSide === PortSide.EAST) {
              createdDummies.push(createDummy(layeredGraph, edge, edge.getSource()!, edge.getTarget()!))
            }
          }
        }
      }

      for (const dummy of createdDummies) {
        dummy.setLayer(layer)
      }
    }
    if (process.env.GGN_DSL_DBG) {
      for (const n of layeredGraph.getAllNodes()) {
        if (n.getPorts().length >= 2) console.error(`[DSL-END] ${n.id} ports=${n.getPorts().map((p: LPort) => `${p.id}:${p.getSide()}`).join(',')}`)
      }
    }
  }

function createDummy(layeredGraph: LGraph, edge: LEdge, sourcePort: LPort, targetPort: LPort): LNode {
    const dummyNode = new LNode(layeredGraph)
    dummyNode.setType(NodeType.LONG_EDGE)
    dummyNode.setProperty(ORIGIN, edge)
    dummyNode.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    dummyNode.setProperty(LONG_EDGE_SOURCE, sourcePort)
    dummyNode.setProperty(LONG_EDGE_TARGET, targetPort)

    const dummyInput = new LPort()
    dummyInput.setSide(PortSide.WEST)
    dummyInput.setNode(dummyNode)

    const dummyOutput = new LPort()
    dummyOutput.setSide(PortSide.EAST)
    dummyOutput.setNode(dummyNode)

    edge.setTarget(dummyInput)

    const dummyEdge = new LEdge()
    dummyEdge.copyProperties(edge)
    dummyEdge.setProperty(JUNCTION_POINTS, null)
    dummyEdge.setSource(dummyOutput)
    dummyEdge.setTarget(targetPort)

    return dummyNode
  }
