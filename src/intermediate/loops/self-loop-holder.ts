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
 * SelfLoopHolder (对应 ELK intermediate.loops.SelfLoopHolder).
 * 持有单个节点所有自环的信息 (端口/超边/路由槽), 通过 SELF_LOOP_HOLDER 属性挂到节点.
 */
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import { NodeType } from '../../graph/enums.js'
import { PORT_SIDE_COUNT } from './port-side-util.js'
import { SelfHyperLoop } from './self-hyper-loop.js'
import { SelfLoopEdge } from './self-loop-edge.js'
import { SelfLoopPort } from './self-loop-port.js'

export class SelfLoopHolder {
  private readonly lNode: LNode
  private slHyperLoops: SelfHyperLoop[] = []
  private slPorts: Map<LPort, SelfLoopPort> = new Map()
  private arePortsHidden = false
  private routingSlotCount: number[] = new Array(PORT_SIDE_COUNT).fill(0)

  private constructor(node: LNode) {
    this.lNode = node
  }

  static needsSelfLoopProcessing(lNode: LNode): boolean {
    if (lNode.getType() !== NodeType.NORMAL) return false
    return lNode.getOutgoingEdges().some(e => e.isSelfLoop())
  }

  static install(lNode: LNode): SelfLoopHolder {
    // ELK install 有 `assert needsSelfLoopProcessing(lNode)` (测试依赖抛 AssertionError).
    if (!SelfLoopHolder.needsSelfLoopProcessing(lNode)) throw new Error('AssertionError: needsSelfLoopProcessing')
    const holder = new SelfLoopHolder(lNode)
    lNode.setProperty(SELF_LOOP_HOLDER_KEY, holder)
    holder.initialize()
    return holder
  }

  getLNode(): LNode { return this.lNode }
  getSLHyperLoops(): SelfHyperLoop[] { return this.slHyperLoops }
  getSLPortMap(): Map<LPort, SelfLoopPort> { return this.slPorts }
  arePortsHiddenFlag(): boolean { return this.arePortsHidden }
  setPortsHidden(hidden: boolean): void { this.arePortsHidden = hidden }
  getRoutingSlotCount(): number[] { return this.routingSlotCount }

  private initialize(): void {
    const slEdges: SelfLoopEdge[] = []
    for (const lEdge of this.lNode.getOutgoingEdges()) {
      if (lEdge.isSelfLoop()) {
        slEdges.push(new SelfLoopEdge(lEdge, this.selfLoopPortFor(lEdge.getSource()!), this.selfLoopPortFor(lEdge.getTarget()!)))
      }
    }

    // 重置端口 id 供 BFS 使用 (UNVISITED/VISITED)
    for (const slPort of this.slPorts.values()) {
      slPort.getLPort().id = 0
    }

    for (const slPort of this.slPorts.values()) {
      if (slPort.getLPort().id === 0) {
        this.slHyperLoops.push(this.initializeHyperLoop(slPort))
      }
    }
  }

  private selfLoopPortFor(lport: LPort): SelfLoopPort {
    let slPort = this.slPorts.get(lport)
    if (slPort === undefined) {
      slPort = new SelfLoopPort(lport)
      this.slPorts.set(lport, slPort)
    }
    return slPort
  }

  private initializeHyperLoop(slPort: SelfLoopPort): SelfHyperLoop {
    const slLoop = new SelfHyperLoop(this)
    const bfsQueue: SelfLoopPort[] = [slPort]
    while (bfsQueue.length > 0) {
      const currentSLPort = bfsQueue.shift()!
      currentSLPort.getLPort().id = 1
      for (const slEdge of currentSLPort.getOutgoingSLEdges()) {
        slLoop.addSelfLoopEdge(slEdge)
        const target = slEdge.getSLTarget()
        if (target.getLPort().id === 0) bfsQueue.push(target)
      }
      for (const slEdge of currentSLPort.getIncomingSLEdges()) {
        slLoop.addSelfLoopEdge(slEdge)
        const source = slEdge.getSLSource()
        if (source.getLPort().id === 0) bfsQueue.push(source)
      }
    }
    return slLoop
  }
}

import { SELF_LOOP_HOLDER as SELF_LOOP_HOLDER_KEY } from '../../options/internal-properties.js'
