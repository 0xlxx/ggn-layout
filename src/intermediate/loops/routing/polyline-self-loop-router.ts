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
 * PolylineSelfLoopRouter (对应 ELK intermediate.loops.routing.PolylineSelfLoopRouter).
 * 正交弯点切角: 首尾补端口锚点, 每个角用两个距角点 CORNER_DISTANCE 的点代替
 * (PolylineSelfLoopRouter.java:42-97).
 */
import type { SelfLoopEdge } from '../self-loop-edge.js'
import { EdgeRoutingDirection, OrthogonalSelfLoopRouter } from './orthogonal-self-loop-router.js'

type KVector = { x: number; y: number }

/** 角点切角距离 (PolylineSelfLoopRouter.CORNER_DISTANCE). */
const CORNER_DISTANCE = 10
/** 双精度容差 (PolylineSelfLoopRouter.TOLERANCE). */
const TOLERANCE = 0.01

function nearZeroToZero(v: KVector): KVector {
  return {
    x: v.x >= -TOLERANCE && v.x <= TOLERANCE ? 0 : v.x,
    y: v.y >= -TOLERANCE && v.y <= TOLERANCE ? 0 : v.y,
  }
}

/** 正交弯点切角 (PolylineSelfLoopRouter.cutCorners 独立函数版, 供单测). */
export function cutPolylineCorners(bendPoints: KVector[], distance: number): KVector[] {
  return new PolylineSelfLoopRouter().cutCorners(bendPoints, distance)
}

export class PolylineSelfLoopRouter extends OrthogonalSelfLoopRouter {
  protected modifyBendPoints(
    slEdge: SelfLoopEdge, _routingDirection: EdgeRoutingDirection, bendPoints: KVector[],
  ): KVector[] {
    const lSourcePort = slEdge.getSLSource().getLPort()
    bendPoints.unshift({ x: lSourcePort.getPosition().x + lSourcePort.getAnchor().x, y: lSourcePort.getPosition().y + lSourcePort.getAnchor().y })

    const lTargetPort = slEdge.getSLTarget().getLPort()
    bendPoints.push({ x: lTargetPort.getPosition().x + lTargetPort.getAnchor().x, y: lTargetPort.getPosition().y + lTargetPort.getAnchor().y })

    return this.cutCorners(bendPoints, CORNER_DISTANCE)
  }

  /** 三弯点一组切角 (PolylineSelfLoopRouter.cutCorners). */
  cutCorners(bendPoints: KVector[], distance: number): KVector[] {
    if (bendPoints.length <= 2) throw new Error('AssertionError: bendPoints.size() > 2')
    const result: KVector[] = []

    let previous: KVector | null = null
    let corner = bendPoints[0]!
    let next = bendPoints[1]!

    for (let i = 2; i < bendPoints.length; i++) {
      previous = corner
      corner = next
      next = bendPoints[i]!

      const offset1 = nearZeroToZero({ x: previous.x - corner.x, y: previous.y - corner.y })
      const offset2 = nearZeroToZero({ x: next.x - corner.x, y: next.y - corner.y })

      let effectiveDistance = distance
      effectiveDistance = Math.min(effectiveDistance, Math.abs(offset1.x + offset1.y) / 2)
      effectiveDistance = Math.min(effectiveDistance, Math.abs(offset2.x + offset2.y) / 2)

      offset1.x = Math.sign(offset1.x) * effectiveDistance
      offset1.y = Math.sign(offset1.y) * effectiveDistance
      offset2.x = Math.sign(offset2.x) * effectiveDistance
      offset2.y = Math.sign(offset2.y) * effectiveDistance

      result.push({ x: offset1.x + corner.x, y: offset1.y + corner.y })
      result.push({ x: offset2.x + corner.x, y: offset2.y + corner.y })
    }

    return result
  }
}
