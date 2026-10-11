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
 * InteractiveCycleBreaker (对应 ELK p1cycles.InteractiveCycleBreaker).
 *
 * cycleBreaking.strategy = INTERACTIVE: 按输入位置 (交互参考点 x) 反向指向左边的边,
 * 再 DFS 补断剩余环 (同 x 时可能漏).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { PortType } from '../graph/enums.js'
import { INTERACTIVE_REFERENCE_POINT } from '../options/layered-options.js'

/** 节点交互参考点 (对应 ELK LNode.getInteractiveReferencePoint; CENTER 默认). */
export function interactiveReferencePoint(node: LNode): { x: number; y: number } {
  const ref = node.getGraph()?.getProperty(INTERACTIVE_REFERENCE_POINT)
  const pos = node.getPosition()
  if (ref === 'TOP_LEFT') return { x: pos.x, y: pos.y }
  return { x: pos.x + node.getSize().x / 2, y: pos.y + node.getSize().y / 2 }
}

export function processInteractiveCycleBreak(layeredGraph: LGraph): void {
    // 第一遍: 反向指向左边的边 (target 交互参考点 x < source).
    const revEdges: LEdge[] = []
    for (const source of layeredGraph.getLayerlessNodes()) {
      source.id = 1
      const sourcex = interactiveReferencePoint(source).x
      for (const port of source.getPorts(PortType.OUTPUT)) {
        for (const edge of port.getOutgoingEdges()) {
          const target = edge.getTarget()?.getNode()
          if (target !== undefined && target !== null && target !== source) {
            const targetx = interactiveReferencePoint(target).x
            if (targetx < sourcex) revEdges.push(edge)
          }
        }
      }
    }
    for (const edge of revEdges) edge.reverse(layeredGraph, true)
    if (process.env.GGN_ICB_DBG) console.error(`[ICB] pass1 reversed ${revEdges.length}`)

    // 第二遍: DFS 补断 (同 x 时可能漏判).
    revEdges.length = 0
    for (const node of layeredGraph.getLayerlessNodes()) {
      if (node.id > 0) findCycles(node, revEdges, layeredGraph)
    }
    if (process.env.GGN_ICB_DBG) {
      const desc = revEdges.map((e) => String(e.getSource()?.getNode()?.id ?? '?') + '->' + String(e.getTarget()?.getNode()?.id ?? '?'))
      console.error(`[ICB] pass2 reversed ${revEdges.length}: ${desc.join(',')}`)
    }
    for (const edge of revEdges) edge.reverse(layeredGraph, true)
  }

  /** DFS: id<0 = 当前路径中 (回边即环); id>0 = 未访问; id=0 = 已访问. */
function findCycles(node1: LNode, revEdges: LEdge[], layeredGraph: LGraph): void {
    node1.id = -1
    for (const port of node1.getPorts(PortType.OUTPUT)) {
      for (const edge of port.getOutgoingEdges()) {
        const node2 = edge.getTarget()?.getNode()
        if (node2 !== undefined && node2 !== null && node1 !== node2) {
          if (node2.id < 0) {
            revEdges.push(edge)
          } else if (node2.id > 0) {
            findCycles(node2, revEdges, layeredGraph)
          }
        }
      }
    }
    node1.id = 0
  }
