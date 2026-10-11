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
 * SelfLoopPort (对应 ELK intermediate.loops.SelfLoopPort).
 */
import type { LPort } from '../../graph/lport.js'
import type { SelfLoopEdge } from './self-loop-edge.js'

/** 至少连接一条自环边的端口. */
export class SelfLoopPort {
  private readonly lPort: LPort
  private readonly onlySelfLoops: boolean
  private readonly incomingSLEdges: SelfLoopEdge[] = []
  private readonly outgoingSLEdges: SelfLoopEdge[] = []
  private hidden = false

  constructor(lPort: LPort) {
    this.lPort = lPort
    this.onlySelfLoops = lPort.getConnectedEdges().length > 0
      && lPort.getConnectedEdges().every(e => e.isSelfLoop())
  }

  getLPort(): LPort { return this.lPort }
  hadOnlySelfLoops(): boolean { return this.onlySelfLoops }
  isHidden(): boolean { return this.hidden }
  setHidden(hidden: boolean): void { this.hidden = hidden }
  getIncomingSLEdges(): SelfLoopEdge[] { return this.incomingSLEdges }
  getOutgoingSLEdges(): SelfLoopEdge[] { return this.outgoingSLEdges }

  /** 自环净流量 = 入自环 - 出自环. */
  getSLNetFlow(): number {
    return this.incomingSLEdges.length - this.outgoingSLEdges.length
  }
}
