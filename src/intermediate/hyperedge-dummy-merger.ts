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
 * HyperedgeDummyMerger (对应 ELK intermediate.HyperedgeDummyMerger).
 * P4 前置: 合并相邻且同源/同 target 的 LONG_EDGE dummy (inverted-ports 多条边指向同一
 * 端口的 dummy 合并成一个), 减少路由槽数. ggn 之前缺失 → hyperedge+inverted 图槽数多 1.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import { NodeType, PortSide } from '../graph/enums.js'
import {
  LONG_EDGE_SOURCE, LONG_EDGE_TARGET, LONG_EDGE_HAS_LABEL_DUMMIES, LONG_EDGE_BEFORE_LABEL_DUMMY,
} from '../options/internal-properties.js'

export class HyperedgeDummyMerger {
  process(layeredGraph: LGraph): void {
    if (process.env.GGN_HM_DBG) console.error('[HM] process called, layers=' + layeredGraph.getLayers().length)
    this.identifyHyperedges(layeredGraph)

    for (const layer of layeredGraph.getLayers()) {
      const nodes = layer.getNodes()
      if (nodes.length === 0) continue

      let lastNode: LNode | null = null
      let lastNodeType: string | null = null
      for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex++) {
        const currNode = nodes[nodeIndex]!
        const currNodeType = currNode.getType()

        // ELK: 合并后 nodeIndex-- 抵消 for 的 ++, lastNode 保持 mergeTarget,
        // 下一轮检查 mergeTarget 之后的节点 (避免 self-merge 死循环).
        if (currNodeType === NodeType.LONG_EDGE && lastNodeType === NodeType.LONG_EDGE && lastNode !== null) {
          const state = this.checkMergeAllowed(currNode, lastNode)
          if (state.allowMerge) {
            this.mergeNodes(currNode, lastNode, state.sameSource, state.sameTarget)
            nodes.splice(nodeIndex, 1)
            nodeIndex--
            continue
          }
        }

        lastNode = currNode
        lastNodeType = currNodeType
      }
    }
  }

  private checkMergeAllowed(currNode: LNode, lastNode: LNode): { allowMerge: boolean; sameSource: boolean; sameTarget: boolean } {
    const currHasLabelDummies = currNode.getProperty<boolean>(LONG_EDGE_HAS_LABEL_DUMMIES)
    const lastHasLabelDummies = lastNode.getProperty<boolean>(LONG_EDGE_HAS_LABEL_DUMMIES)
    const currSource = currNode.getProperty<LPort | null>(LONG_EDGE_SOURCE)
    const lastSource = lastNode.getProperty<LPort | null>(LONG_EDGE_SOURCE)
    const currTarget = currNode.getProperty<LPort | null>(LONG_EDGE_TARGET)
    const lastTarget = lastNode.getProperty<LPort | null>(LONG_EDGE_TARGET)

    const sameSource = currSource !== null && currSource !== undefined && currSource === lastSource
    const sameTarget = currTarget !== null && currTarget !== undefined && currTarget === lastTarget

    if (!currHasLabelDummies && !lastHasLabelDummies) {
      // assumption: long edge dummies always have two ports, both have the same id
      const currPortId = currNode.getPorts()[0]?.id
      const lastPortId = lastNode.getPorts()[0]?.id
      return { allowMerge: currPortId === lastPortId, sameSource, sameTarget }
    }

    const eligibleForSourceMerging =
      (!currHasLabelDummies || currNode.getProperty<boolean>(LONG_EDGE_BEFORE_LABEL_DUMMY))
      && (!lastHasLabelDummies || lastNode.getProperty<boolean>(LONG_EDGE_BEFORE_LABEL_DUMMY))
    const eligibleForTargetMerging =
      (!currHasLabelDummies || !currNode.getProperty<boolean>(LONG_EDGE_BEFORE_LABEL_DUMMY))
      && (!lastHasLabelDummies || !lastNode.getProperty<boolean>(LONG_EDGE_BEFORE_LABEL_DUMMY))

    return {
      allowMerge: (sameSource && eligibleForSourceMerging) || (sameTarget && eligibleForTargetMerging),
      sameSource,
      sameTarget,
    }
  }

  private mergeNodes(mergeSource: LNode, mergeTarget: LNode, keepSourcePort: boolean, keepTargetPort: boolean): void {
    const mergeTargetInputPort = mergeTarget.getPorts(PortSide.WEST)[0]!
    const mergeTargetOutputPort = mergeTarget.getPorts(PortSide.EAST)[0]!

    for (const port of mergeSource.getPorts()) {
      while (port.getIncomingEdges().length > 0) {
        port.getIncomingEdges()[0]!.setTarget(mergeTargetInputPort)
      }
      while (port.getOutgoingEdges().length > 0) {
        port.getOutgoingEdges()[0]!.setSource(mergeTargetOutputPort)
      }
    }

    if (!keepSourcePort) mergeTarget.setProperty(LONG_EDGE_SOURCE, null)
    if (!keepTargetPort) mergeTarget.setProperty(LONG_EDGE_TARGET, null)
  }

  /** 给端口分配超边 index (DFS: 同端口连接的端口 + 同 LONG_EDGE dummy 的另一端口同组). */
  private identifyHyperedges(layeredGraph: LGraph): void {
    const ports: LPort[] = []
    for (const layer of layeredGraph.getLayers()) {
      for (const node of layer.getNodes()) {
        ports.push(...node.getPorts())
      }
    }
    for (const p of ports) p.id = -1

    let index = 0
    for (const p of ports) {
      if (p.id === -1) {
        this.dfs(p, index++)
      }
    }
  }

  private dfs(p: LPort, index: number): void {
    p.id = index
    for (const p2 of p.getConnectedPorts()) {
      if (p2.id === -1) this.dfs(p2, index)
    }
    if (p.getNode()!.getType() === NodeType.LONG_EDGE) {
      for (const p2 of p.getNode()!.getPorts()) {
        if (p2 !== p && p2.id === -1) this.dfs(p2, index)
      }
    }
  }
}
