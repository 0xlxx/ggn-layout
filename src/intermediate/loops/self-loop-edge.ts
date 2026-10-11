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
 * SelfLoopEdge (对应 ELK intermediate.loops.SelfLoopEdge).
 */
import type { LEdge } from '../../graph/ledge.js'
import { PortSide } from '../../graph/enums.js'
import type { SelfHyperLoop } from './self-hyper-loop.js'
import type { SelfLoopPort } from './self-loop-port.js'

/** 单条自环边. */
export class SelfLoopEdge {
  private readonly lEdge: LEdge
  private slHyperLoop: SelfHyperLoop | null = null
  private readonly slSource: SelfLoopPort
  private readonly slTarget: SelfLoopPort

  constructor(lEdge: LEdge, slSource: SelfLoopPort, slTarget: SelfLoopPort) {
    this.lEdge = lEdge
    this.slSource = slSource
    this.slTarget = slTarget
    slSource.getOutgoingSLEdges().push(this)
    slTarget.getIncomingSLEdges().push(this)
  }

  getLEdge(): LEdge { return this.lEdge }
  getSLHyperLoop(): SelfHyperLoop | null { return this.slHyperLoop }
  setSLHyperLoop(slLoop: SelfHyperLoop): void { this.slHyperLoop = slLoop }
  getSLSource(): SelfLoopPort { return this.slSource }
  getSLTarget(): SelfLoopPort { return this.slTarget }

  getLabelSide(): PortSide {
    return this.slHyperLoop!.getSLLabels()!.getSide()
  }
}
