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
 * SplineSelfLoopRouter (对应 ELK intermediate.loops.routing.SplineSelfLoopRouter).
 * 把正交自环弯点转为样条 (clamped uniform 三次 B-Spline) 的 Bezier 控制点:
 *  - 相邻正交弯点取中点并沿当前端口侧外移 edgeLabelDistance (SplineSelfLoopRouter.java:79-107)
 *  - 首尾加入 source/target 端口锚点 (SplineSelfLoopRouter.java:47-57)
 *  - NubSpline bezier 转换后去掉首尾 CP 作为最终弯点/占位 (与 ELK 一致).
 */
import { PortSide } from '../../../graph/enums.js'
import { SPACING_EDGE_LABEL } from '../../../options/layered-options.js'
import type { SelfLoopEdge } from '../self-loop-edge.js'
import type { SelfLoopPort } from '../self-loop-port.js'
import { portSideLeft, portSideRight } from '../port-side-util.js'
import { NubSpline } from './nub-spline.js'
import { EdgeRoutingDirection, OrthogonalSelfLoopRouter } from './orthogonal-self-loop-router.js'

/** KVector 别名 (正交路由器同构). */
type KVector = { x: number; y: number }

/** SplinesMath.portSideToDirection: 从节点中心到该侧的弧度 (SplinesMath.java:169-179). */
function portSideToDirection(side: PortSide): number {
  switch (side) {
    case PortSide.NORTH: return Math.PI * 1.5
    case PortSide.EAST: return 0
    case PortSide.SOUTH: return Math.PI * 0.5
    case PortSide.WEST: return Math.PI
    default: return 0
  }
}

/** new KVector(angle): 单位方向向量. */
function vectorFromAngle(angle: number): KVector {
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

export class SplineSelfLoopRouter extends OrthogonalSelfLoopRouter {
  protected modifyBendPoints(
    slEdge: SelfLoopEdge, routingDirection: EdgeRoutingDirection, bendPoints: KVector[],
  ): KVector[] {
    const edgeLabelDistance = slEdge.getSLHyperLoop()!.getSLHolder().getLNode()
      .getGraph()!.getProperty(SPACING_EDGE_LABEL)

    // 首尾包含 source/target 端口锚点
    const splineBendPoints: KVector[] = [this.relativePortAnchor(slEdge.getSLSource())]
    this.addSplineControlPoints(slEdge, routingDirection, bendPoints, splineBendPoints, edgeLabelDistance)
    splineBendPoints.push(this.relativePortAnchor(slEdge.getSLTarget()))

    return new NubSpline(true, 3, splineBendPoints).getBezierCP()
  }

  private relativePortAnchor(slPort: SelfLoopPort): KVector {
    const lPort = slPort.getLPort()
    return { x: lPort.getPosition().x + lPort.getAnchor().x, y: lPort.getPosition().y + lPort.getAnchor().y }
  }

  /** 在每对相邻正交弯点间插入中点, 并沿当前端口侧外移 edgeLabelDistance (SplineSelfLoopRouter.java:59-77,81-102). */
  private addSplineControlPoints(
    slEdge: SelfLoopEdge, routingDirection: EdgeRoutingDirection,
    orthoBendPoints: KVector[], newBendPoints: KVector[], edgeLabelDistance: number,
  ): void {
    if (orthoBendPoints.length < 2) throw new Error('AssertionError: orthoBendPoints.size() >= 2')

    let currPortSide = slEdge.getSLSource().getLPort().getSide()
    let firstBP = orthoBendPoints[0]!

    for (let secondBPIndex = 1; secondBPIndex < orthoBendPoints.length; secondBPIndex++) {
      const secondBP = orthoBendPoints[secondBPIndex]!

      newBendPoints.push(firstBP)

      const midBP: KVector = {
        x: (firstBP.x + secondBP.x) * 0.5,
        y: (firstBP.y + secondBP.y) * 0.5,
      }
      const offset = vectorFromAngle(portSideToDirection(currPortSide))
      midBP.x += offset.x * edgeLabelDistance
      midBP.y += offset.y * edgeLabelDistance
      newBendPoints.push(midBP)

      firstBP = secondBP
      currPortSide = routingDirection === EdgeRoutingDirection.CLOCKWISE
        ? portSideRight(currPortSide)
        : portSideLeft(currPortSide)
    }

    newBendPoints.push(orthoBendPoints[orthoBendPoints.length - 1]!)
  }
}
