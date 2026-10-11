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
 * CrossHierarchyEdge (对应 ELK compound.CrossHierarchyEdge).
 * 记录原始跨层级边在某个图内产生的段 (dummy 边).
 */
import type { LEdge } from '../graph/ledge.js'
import type { LGraph } from '../graph/lgraph.js'
import type { LPort } from '../graph/lport.js'
import { PortType } from '../graph/enums.js'
import { ORIGIN } from '../options/internal-properties.js'

export class CrossHierarchyEdge {
  private newEdge: LEdge
  private graph: LGraph
  private type: PortType

  constructor(newEdge: LEdge, graph: LGraph, type: PortType) {
    this.newEdge = newEdge
    this.graph = graph
    this.type = type
  }

  getNewEdge(): LEdge {
    return this.newEdge
  }

  getGraph(): LGraph {
    return this.graph
  }

  getType(): PortType {
    return this.type
  }

  /**
   * 段的真实源端口: 若 dummy 边端点所在节点是 EXTERNAL_PORT, 返回其 ORIGIN
   * (父节点上的真实端口), 否则返回端点本身.
   */
  getActualSource(): LPort | null {
    const source = this.newEdge.getSource()
    if (source !== null && source.getNode()!.getType().toString() === 'EXTERNAL_PORT') {
      return source.getNode()!.getProperty(ORIGIN) as LPort
    }
    return source
  }

  /** 段的真实目标端口. */
  getActualTarget(): LPort | null {
    const target = this.newEdge.getTarget()
    if (target !== null && target.getNode()!.getType().toString() === 'EXTERNAL_PORT') {
      return target.getNode()!.getProperty(ORIGIN) as LPort
    }
    return target
  }
}
