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
 * SelfLoopPreprocessor (对应 ELK intermediate.SelfLoopPreProcessor).
 * P1 前置: 为有自环的节点安装 SelfLoopHolder, 隐藏自环边与纯自环端口.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LEdge } from '../graph/ledge.js'
import { PortConstraints } from '../graph/enums.js'
import { PORT_CONSTRAINTS } from '../options/layered-options.js'
import { GRAPH_PROPERTIES, GraphProperties } from '../options/internal-properties.js'
import { SelfLoopHolder } from './loops/self-loop-holder.js'

export function processSelfLoops(graph: LGraph): void {
    for (const lnode of graph.getLayerlessNodes()) {
      if (SelfLoopHolder.needsSelfLoopProcessing(lnode)) {
        const slHolder = SelfLoopHolder.install(lnode)
        hideSelfLoops(slHolder)
        hidePorts(slHolder)
      }
    }
  }

function hideSelfLoops(slHolder: SelfLoopHolder): void {
    for (const slLoop of slHolder.getSLHyperLoops()) {
      for (const slEdge of slLoop.getSLEdges()) {
        hideSelfLoop(slEdge.getLEdge())
      }
    }
  }

function hideSelfLoop(lEdge: LEdge): void {
    lEdge.setSource(null)
    lEdge.setTarget(null)
  }

function hidePorts(slHolder: SelfLoopHolder): void {
    const lNode = slHolder.getLNode()

    const nestedGraph = lNode.getNestedGraph()

    const orderFixed = PortConstraints.isOrderFixed(lNode.getProperty<PortConstraints>(PORT_CONSTRAINTS))
    const hierarchyMode = nestedGraph !== null
      && nestedGraph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)

    if (orderFixed || hierarchyMode) return

    for (const slPort of slHolder.getSLPortMap().values()) {
      if (slPort.hadOnlySelfLoops()) {
        const lPort = slPort.getLPort()
        lPort.setNode(null)
        slPort.setHidden(true)
        slHolder.setPortsHidden(true)
      }
    }
  }
