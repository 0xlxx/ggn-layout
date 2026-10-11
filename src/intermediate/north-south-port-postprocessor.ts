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
 * NorthSouthPortPostprocessor (对应 ELK intermediate.NorthSouthPortPostprocessor).
 * P5 后: 移除 NS dummy, 边重连回原端口 (插入 bendPoint).
 *
 * 现代 TS: 模块级函数 + 数组方法; 跳过 SPLINES 分支 (默认 ORTHOGONAL).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide } from '../graph/enums.js'
import { ORIGIN, SPLINE_NS_PORT_Y_COORD } from '../options/internal-properties.js'
import { EDGE_ROUTING, JUNCTION_POINTS } from '../options/layered-options.js'

function restoreEdges(ports: LPort[], isInput: boolean, addJunctionPoints: boolean): void {
  for (const port of ports) {
    const originPort = port.getProperty(ORIGIN) as LPort
    const x = originPort.getAbsoluteAnchor().x
    const y = port.getNode()!.getPosition().y
    const edges = isInput ? [...port.getIncomingEdges()] : [...port.getOutgoingEdges()]
    for (const edge of edges) {
      if (isInput) {
        edge.setTarget(originPort)
        edge.getBendPoints().push({ x, y })
      } else {
        edge.setSource(originPort)
        edge.getBendPoints().unshift({ x, y })
      }
      if (addJunctionPoints) {
        let jps = edge.getProperty(JUNCTION_POINTS)
        if (jps === null || jps === undefined) {
          jps = []
          edge.setProperty(JUNCTION_POINTS, jps)
        }
        jps.push({ x, y })
      }
    }
  }
}

function restoreSelfLoop(dummy: LNode): void {
  const selfLoop = dummy.getProperty(ORIGIN) as LEdge
  const inputPort = dummy.getPorts(PortSide.WEST)[0]!
  const outputPort = dummy.getPorts(PortSide.EAST)[0]!
  const originInput = inputPort.getProperty(ORIGIN) as LPort
  const originOutput = outputPort.getProperty(ORIGIN) as LPort

  selfLoop.setSource(originOutput)
  selfLoop.setTarget(originInput)

  const bp1 = { ...outputPort.getNode()!.getPosition() }
  bp1.x = originOutput.getAbsoluteAnchor().x
  selfLoop.getBendPoints().push(bp1)
  const bp2 = { ...inputPort.getNode()!.getPosition() }
  bp2.x = originInput.getAbsoluteAnchor().x
  selfLoop.getBendPoints().push(bp2)
}

export function processNorthSouthPortPost(layeredGraph: LGraph): void {
    const routing = layeredGraph.getProperty(EDGE_ROUTING)

    for (const layer of layeredGraph.getLayers()) {
      for (const node of [...layer.getNodes()]) {
        if (node.getType() !== NodeType.NORTH_SOUTH_PORT) continue

        if (routing === 'SPLINES') {
          // ELK NorthSouthPortPostprocessor.processSplineInputPort/OutputPort (L231-262):
          //   origin 端口记录 NS dummy 的 y (FinalSplineBendpointsCalculator 读它生成 NS 弯点),
          //   边重连回 origin 端口, 不插 bendPoint (spline 弯点由计算器统一生成).
          for (const port of node.getPorts()) {
            const originPort = port.getProperty(ORIGIN) as LPort
            originPort.setProperty(SPLINE_NS_PORT_Y_COORD, node.getPosition().y)
            if (port.getIncomingEdges().length > 0) {
              for (const e of [...port.getIncomingEdges()]) e.setTarget(originPort)
            }
            if (port.getOutgoingEdges().length > 0) {
              for (const e of [...port.getOutgoingEdges()]) e.setSource(originPort)
            }
          }
        } else if (node.getProperty(ORIGIN) instanceof LEdge) {
          restoreSelfLoop(node)
        } else {
          // 检查所有端口是否同一 origin (in/out 共享 dummy)
          const ports = node.getPorts()
          let sameOrigin = ports.length >= 2
          for (let i = 1; i < ports.length; i++) {
            if (ports[i]!.getProperty(ORIGIN) !== ports[i - 1]!.getProperty(ORIGIN)) {
              sameOrigin = false
              break
            }
          }
          if (ports.length < 2) sameOrigin = false

          for (const port of ports) {
            if (port.getIncomingEdges().length > 0) restoreEdges([port], true, sameOrigin)
            if (port.getOutgoingEdges().length > 0) restoreEdges([port], false, sameOrigin)
          }
        }

        node.setLayer(null)
      }
    }
  }
