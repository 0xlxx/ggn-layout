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
 * Layer (对应 ELK graph.Layer).
 */
import type { LGraph } from './lgraph.js'
import type { LNode } from './lnode.js'
import type { KVector } from './enums.js'

export class Layer {
  id = 0
  private owner: LGraph | null = null
  private size: KVector = { x: 0, y: 0 }
  private nodes: LNode[] = []

  constructor(graph: LGraph | null = null) {
    // ELK Java: Layer 构造器不自动加入 graph (只保存 owner), 由调用方显式 add.
    this.owner = graph
  }

  getGraph(): LGraph | null {
    return this.owner
  }

  getSize(): KVector {
    return this.size
  }

  getNodes(): LNode[] {
    return this.nodes
  }

  getIndex(): number {
    if (this.owner === null) return -1
    return this.owner.getLayers().indexOf(this)
  }
}
