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
 * HypernodesProcessor (对应 ELK intermediate.HypernodesProcessor).
 * P5 后置: 把 <=2 端口的超节点移到连接边首弯点处 — 用新建 N/S 端口替代弯点重接边,
 * 使超节点占据边的汇聚/分叉点.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { LPort } from '../graph/lport.js'
import { PortSide, type KVector } from '../graph/enums.js'
import { HYPERNODE, JUNCTION_POINTS } from '../options/layered-options.js'

export function processHypernodes(layeredGraph: LGraph): void {
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (!node.getProperty(HYPERNODE) || node.getPorts().length > 2) continue

      let topEdges = 0
      let rightEdges = 0
      let bottomEdges = 0
      let leftEdges = 0
      for (const port of node.getPorts()) {
        switch (port.getSide()) {
          case PortSide.NORTH: topEdges++; break
          case PortSide.EAST: rightEdges++; break
          case PortSide.SOUTH: bottomEdges++; break
          case PortSide.WEST: leftEdges++; break
        }
      }
      // 有上下边不移动 (ELK: don't move the node if there are any edges to the top or bottom).
      if (topEdges === 0 && bottomEdges === 0) {
        moveHypernode(layeredGraph, node, leftEdges <= rightEdges)
      }
    }
  }
}

/**
 * 移动超节点: right=true 移向下一层 (替代出边首弯点), 否则移向前一层 (替代入边末弯点).
 */
function moveHypernode(layeredGraph: LGraph, hypernode: LNode, right: boolean): void {
  // 找构成超边首个 join point 的边 (弯点最靠候选方向的一批).
  const bendEdges: LEdge[] = []
  let bendx = Number.MAX_SAFE_INTEGER
  let diffx = Number.MAX_SAFE_INTEGER
  let diffy = Number.MAX_SAFE_INTEGER
  if (right) {
    bendx = layeredGraph.getSize().x
    for (const port of hypernode.getPorts()) {
      for (const edge of port.getOutgoingEdges()) {
        const bendPoints = edge.getBendPoints()
        if (bendPoints.length === 0) continue
        const firstPoint = bendPoints[0]!
        if (firstPoint.x < bendx) {
          diffx = bendx - firstPoint.x
          diffy = Number.MAX_SAFE_INTEGER
          bendEdges.length = 0
          bendx = firstPoint.x
        }
        if (firstPoint.x <= bendx) {
          bendEdges.push(edge)
          if (bendPoints.length > 1) {
            diffy = Math.min(diffy, Math.abs(bendPoints[1]!.y - firstPoint.y))
          }
        }
      }
    }
  } else {
    for (const port of hypernode.getPorts()) {
      for (const edge of port.getIncomingEdges()) {
        const bendPoints = edge.getBendPoints()
        if (bendPoints.length === 0) continue
        const lastPoint = bendPoints[bendPoints.length - 1]!
        if (lastPoint.x > bendx) {
          diffx = lastPoint.x - bendx
          diffy = Number.MAX_SAFE_INTEGER
          bendEdges.length = 0
          bendx = lastPoint.x
        }
        if (lastPoint.x >= bendx) {
          bendEdges.push(edge)
          if (bendPoints.length > 1) {
            diffy = Math.min(diffy, Math.abs(bendPoints[bendPoints.length - 2]!.y - lastPoint.y))
          }
        }
      }
    }
  }

  if (bendEdges.length === 0 || diffx <= hypernode.size.x / 2 || diffy <= hypernode.size.y / 2) return

  // 为边创建新端口 (ELK: 上下侧各一, 水平居中).
  const northPort = new LPort()
  northPort.setNode(hypernode)
  northPort.setSide(PortSide.NORTH)
  northPort.position.x = hypernode.size.x / 2
  const southPort = new LPort()
  southPort.setNode(hypernode)
  southPort.setSide(PortSide.SOUTH)
  southPort.position.x = hypernode.size.x / 2
  southPort.position.y = hypernode.size.y

  // 用新端口替换被消除的弯点.
  for (const edge of bendEdges) {
    let first: KVector
    let second: KVector
    if (right) {
      first = edge.getBendPoints().shift()!
      second = edge.getBendPoints().length === 0
        ? edge.getTarget()!.getAbsoluteAnchor()
        : edge.getBendPoints()[0]!
      if (second.y >= first.y) {
        edge.setSource(southPort)
      } else {
        edge.setSource(northPort)
      }
    } else {
      first = edge.getBendPoints().pop()!
      second = edge.getBendPoints().length === 0
        ? edge.getSource()!.getAbsoluteAnchor()
        : edge.getBendPoints()[edge.getBendPoints().length - 1]!
      if (second.y >= first.y) {
        edge.setTarget(southPort)
      } else {
        edge.setTarget(northPort)
      }
    }
    // 移除与消除弯点碰撞的 junction points (KVector 相等 = x/y 相同).
    const junctionPoints = edge.getProperty(JUNCTION_POINTS) as { x: number; y: number }[] | null
    if (junctionPoints !== null && junctionPoints !== undefined) {
      const idx = junctionPoints.findIndex(p => p.x === first.x && p.y === first.y)
      if (idx !== -1) junctionPoints.splice(idx, 1)
    }
  }
  // 节点移到弯点处 (ELK: 节点中心对准 bendx).
  hypernode.position.x = bendx - hypernode.size.x / 2
}
