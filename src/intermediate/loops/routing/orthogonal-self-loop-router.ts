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
 * OrthogonalSelfLoopRouter (对应 ELK intermediate.loops.routing.OrthogonalSelfLoopRouter).
 * 正交路由自环: 计算 bendPoints 并扩展节点 margin (自环占用的空间).
 */
import type { KVector } from '../../../graph/enums.js'
import { PortSide } from '../../../graph/enums.js'
import { SPACING_EDGE_EDGE, SPACING_EDGE_LABEL, SPACING_NODE_SELF_LOOP } from '../../../options/layered-options.js'
import type { SelfHyperLoop } from '../self-hyper-loop.js'
import type { SelfHyperLoopLabels } from '../self-hyper-loop-labels.js'
import type { SelfLoopEdge } from '../self-loop-edge.js'
import type { SelfLoopHolder } from '../self-loop-holder.js'
import type { SelfLoopPort } from '../self-loop-port.js'
import { portSideLeft, portSideOrdinal, portSideRight } from '../port-side-util.js'

export enum EdgeRoutingDirection { CLOCKWISE, COUNTER_CLOCKWISE }

type Margin = { left: number; top: number; right: number; bottom: number }

export class OrthogonalSelfLoopRouter {
  routeSelfLoops(slHolder: SelfLoopHolder): void {
    const lNode = slHolder.getLNode()
    const nodeSize = lNode.size
    const nodeMargins = lNode.getMargin()

    const edgeEdgeDistance = lNode.getGraph()!.getProperty(SPACING_EDGE_EDGE)
    const edgeLabelDistance = lNode.getGraph()!.getProperty(SPACING_EDGE_LABEL)
    const nodeSLDistance = lNode.getGraph()!.getProperty(SPACING_NODE_SELF_LOOP)

    const newNodeMargins: Margin = { ...nodeMargins }

    const routingSlotPositions = this.computeRoutingSlotPositions(
      slHolder, edgeEdgeDistance, edgeLabelDistance, nodeSLDistance)

    for (const slLoop of slHolder.getSLHyperLoops()) {
      for (const slEdge of slLoop.getSLEdges()) {
        const lEdge = slEdge.getLEdge()
        const routingDirection = this.computeEdgeRoutingDirection(slEdge)
        const bendPoints = this.computeOrthogonalBendPoints(slEdge, routingDirection, routingSlotPositions)
        const modified = this.modifyBendPoints(slEdge, routingDirection, bendPoints)
        if (process.env.GGN_SL_DBG) {
          const loop = slEdge.getSLHyperLoop()
          const lm = loop?.getLeftmostPort()?.getLPort()
          const rm = loop?.getRightmostPort()?.getLPort()
          // eslint-disable-next-line no-console
          console.error(`GGN SLR dir=${routingDirection} left=${lm ? lm.id : '?'}(${lm ? lm.getSide() : '?'}) right=${rm ? rm.id : '?'}(${rm ? rm.getSide() : '?'}) bps=[${modified.map(b => b.x.toFixed(1) + ',' + b.y.toFixed(1)).join(';')}] nodeSz=${lNode.size.x},${lNode.size.y} margin=(${newNodeMargins.left},${newNodeMargins.top},${newNodeMargins.right},${newNodeMargins.bottom})`)
        }

        lEdge.getBendPoints().length = 0
        for (const bp of modified) lEdge.getBendPoints().push(bp)
        for (const bp of modified) this.updateNewNodeMargins(nodeSize, newNodeMargins, bp)
        if (process.env.GGN_SL_DBG2) console.error(`GGN SLR2 after update margin=(${newNodeMargins.left},${newNodeMargins.top},${newNodeMargins.right},${newNodeMargins.bottom})`)
      }

      const slLabels = slLoop.getSLLabels()
      if (slLabels !== null) {
        this.placeLabels(slLoop, slLabels, routingSlotPositions, edgeLabelDistance)
        this.updateNewNodeMarginsForLabels(nodeSize, newNodeMargins, slLabels)
      }
    }

    nodeMargins.left = newNodeMargins.left
    nodeMargins.top = newNodeMargins.top
    nodeMargins.right = newNodeMargins.right
    nodeMargins.bottom = newNodeMargins.bottom
  }

  private computeEdgeRoutingDirection(slEdge: SelfLoopEdge): EdgeRoutingDirection {
    const sourceLPort = slEdge.getSLSource().getLPort()
    const sourcePortSide = sourceLPort.getSide()
    const targetLPort = slEdge.getSLTarget().getLPort()
    const targetPortSide = targetLPort.getSide()

    if (sourcePortSide === targetPortSide) {
      return sourceLPort.id < targetLPort.id
        ? EdgeRoutingDirection.CLOCKWISE
        : EdgeRoutingDirection.COUNTER_CLOCKWISE
    } else if (portSideRight(sourcePortSide) === targetPortSide) {
      return EdgeRoutingDirection.CLOCKWISE
    } else if (portSideLeft(sourcePortSide) === targetPortSide) {
      return EdgeRoutingDirection.COUNTER_CLOCKWISE
    } else {
      const slLoop = slEdge.getSLHyperLoop()!
      if (slLoop.getOccupiedPortSides().has(portSideRight(sourcePortSide))) {
        return EdgeRoutingDirection.CLOCKWISE
      } else {
        return EdgeRoutingDirection.COUNTER_CLOCKWISE
      }
    }
  }

  private placeLabels(
    slLoop: SelfHyperLoop, slLabels: SelfHyperLoopLabels, routingSlotPositions: number[][], edgeLabelDistance: number,
  ): void {
    const labelSide = slLabels.getSide()
    let labelPosition = routingSlotPositions[portSideOrdinal(labelSide)]![slLoop.getRoutingSlot(labelSide)]!
    switch (labelSide) {
      case PortSide.NORTH:
        labelPosition -= edgeLabelDistance + slLabels.getSize().y
        slLabels.getPosition().y = labelPosition
        break
      case PortSide.SOUTH:
        labelPosition += edgeLabelDistance
        slLabels.getPosition().y = labelPosition
        break
      case PortSide.WEST:
        labelPosition -= edgeLabelDistance + slLabels.getSize().x
        slLabels.getPosition().x = labelPosition
        break
      case PortSide.EAST:
        labelPosition += edgeLabelDistance
        slLabels.getPosition().x = labelPosition
        break
    }
  }

  private updateNewNodeMargins(nodeSize: KVector, newNodeMargins: Margin, bendPoint: KVector): void {
    newNodeMargins.left = Math.max(newNodeMargins.left, -bendPoint.x)
    newNodeMargins.right = Math.max(newNodeMargins.right, bendPoint.x - nodeSize.x)
    newNodeMargins.top = Math.max(newNodeMargins.top, -bendPoint.y)
    newNodeMargins.bottom = Math.max(newNodeMargins.bottom, bendPoint.y - nodeSize.y)
  }

  private updateNewNodeMarginsForLabels(nodeSize: KVector, newNodeMargins: Margin, slLabels: SelfHyperLoopLabels): void {
    const pos = { ...slLabels.getPosition() }
    this.updateNewNodeMargins(nodeSize, newNodeMargins, pos)
    pos.x += slLabels.getSize().x
    pos.y += slLabels.getSize().y
    this.updateNewNodeMargins(nodeSize, newNodeMargins, pos)
  }

  // ── Routing Slot Positions ──

  private computeRoutingSlotPositions(
    slHolder: SelfLoopHolder, edgeEdgeDistance: number, edgeLabelDistance: number, nodeSLDistance: number,
  ): number[][] {
    const positions: number[][] = []
    for (const portSide of [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]) {
      positions[portSideOrdinal(portSide)] = new Array<number>(slHolder.getRoutingSlotCount()[portSideOrdinal(portSide)]).fill(0)
    }

    this.initializeWithMaxLabelHeight(positions, slHolder, PortSide.NORTH)
    this.initializeWithMaxLabelHeight(positions, slHolder, PortSide.SOUTH)

    this.computePositions(positions, slHolder, PortSide.NORTH, edgeEdgeDistance, edgeLabelDistance, nodeSLDistance)
    this.computePositions(positions, slHolder, PortSide.EAST, edgeEdgeDistance, edgeLabelDistance, nodeSLDistance)
    this.computePositions(positions, slHolder, PortSide.SOUTH, edgeEdgeDistance, edgeLabelDistance, nodeSLDistance)
    this.computePositions(positions, slHolder, PortSide.WEST, edgeEdgeDistance, edgeLabelDistance, nodeSLDistance)

    return positions
  }

  private initializeWithMaxLabelHeight(positions: number[][], slHolder: SelfLoopHolder, portSide: PortSide): void {
    const sidePositions = positions[portSideOrdinal(portSide)]!
    for (const slLoop of slHolder.getSLHyperLoops()) {
      const slLabels = slLoop.getSLLabels()
      if (slLabels !== null && slLabels.getSide() === portSide) {
        const routingSlot = slLoop.getRoutingSlot(portSide)
        sidePositions[routingSlot] = Math.max(sidePositions[routingSlot]!, slLabels.getSize().y)
      }
    }
  }

  private computePositions(
    positions: number[][], slHolder: SelfLoopHolder, portSide: PortSide,
    edgeEdgeDistance: number, edgeLabelDistance: number, nodeSelfLoopDistance: number,
  ): void {
    let currPos = this.computeBaselinePosition(slHolder, portSide, nodeSelfLoopDistance)
    const factor = portSide === PortSide.NORTH || portSide === PortSide.WEST ? -1 : 1
    const sidePositions = positions[portSideOrdinal(portSide)]!
    for (let slot = 0; slot < sidePositions.length; slot++) {
      let largestLabelSize = sidePositions[slot]!
      if (largestLabelSize > 0) {
        largestLabelSize += edgeLabelDistance
      }
      sidePositions[slot] = currPos
      currPos += factor * (largestLabelSize + edgeEdgeDistance)
    }
  }

  private computeBaselinePosition(slHolder: SelfLoopHolder, portSide: PortSide, nodeSelfLoopDistance: number): number {
    const lNode = slHolder.getLNode()
    const lMargins = lNode.getMargin()
    switch (portSide) {
      case PortSide.NORTH: return -lMargins.top - nodeSelfLoopDistance
      case PortSide.EAST: return lNode.size.x + lMargins.right + nodeSelfLoopDistance
      case PortSide.SOUTH: return lNode.size.y + lMargins.bottom + nodeSelfLoopDistance
      case PortSide.WEST: return -lMargins.left - nodeSelfLoopDistance
      default: throw new Error('Impossible')
    }
  }

  // ── Bend Points ──

  private computeOrthogonalBendPoints(
    slEdge: SelfLoopEdge, routingDirection: EdgeRoutingDirection, routingSlotPositions: number[][],
  ): KVector[] {
    const bendPoints: KVector[] = []
    this.addOuterBendPoint(slEdge, slEdge.getSLSource(), routingSlotPositions, bendPoints)
    this.addCornerBendPoints(slEdge, routingDirection, routingSlotPositions, bendPoints)
    this.addOuterBendPoint(slEdge, slEdge.getSLTarget(), routingSlotPositions, bendPoints)
    return bendPoints
  }

  protected modifyBendPoints(
    _slEdge: SelfLoopEdge, _routingDirection: EdgeRoutingDirection, bendPoints: KVector[],
  ): KVector[] {
    return bendPoints
  }

  private addOuterBendPoint(
    slEdge: SelfLoopEdge, slPort: SelfLoopPort, routingSlotPositions: number[][], bendPoints: KVector[],
  ): void {
    const slLoop = slEdge.getSLHyperLoop()!
    const lPort = slPort.getLPort()
    const portSide = lPort.getSide()

    const result = this.getBaseVector(portSide, slLoop.getRoutingSlot(portSide), routingSlotPositions)
    const anchor = { x: lPort.getPosition().x + lPort.getAnchor().x, y: lPort.getPosition().y + lPort.getAnchor().y }
    switch (lPort.getSide()) {
      case PortSide.NORTH: result.x += anchor.x; break
      case PortSide.SOUTH: result.x += anchor.x; break
      case PortSide.EAST: result.y += anchor.y; break
      case PortSide.WEST: result.y += anchor.y; break
    }
    bendPoints.push(result)
  }

  private addCornerBendPoints(
    slEdge: SelfLoopEdge, routingDirection: EdgeRoutingDirection, routingSlotPositions: number[][],
    bendPoints: KVector[],
  ): void {
    const lSourcePort = slEdge.getSLSource().getLPort()
    const lTargetPort = slEdge.getSLTarget().getLPort()
    if (lSourcePort.getSide() === lTargetPort.getSide()) return

    const slLoop = slEdge.getSLHyperLoop()!
    let currPortSide = lSourcePort.getSide()
    while (currPortSide !== lTargetPort.getSide()) {
      const nextPortSide = routingDirection === EdgeRoutingDirection.CLOCKWISE
        ? portSideRight(currPortSide)
        : portSideLeft(currPortSide)

      const currPortSideComponent = this.getBaseVector(currPortSide, slLoop.getRoutingSlot(currPortSide), routingSlotPositions)
      const nextPortSideComponent = this.getBaseVector(nextPortSide, slLoop.getRoutingSlot(nextPortSide), routingSlotPositions)

      bendPoints.push({
        x: currPortSideComponent.x + nextPortSideComponent.x,
        y: currPortSideComponent.y + nextPortSideComponent.y,
      })
      currPortSide = nextPortSide
    }
  }

  private getBaseVector(portSide: PortSide, routingSlot: number, routingSlotPositions: number[][]): KVector {
    const position = routingSlotPositions[portSideOrdinal(portSide)]![routingSlot]!
    switch (portSide) {
      case PortSide.NORTH:
      case PortSide.SOUTH:
        return { x: 0, y: position }
      case PortSide.EAST:
      case PortSide.WEST:
        return { x: position, y: 0 }
      default:
        throw new Error('Impossible')
    }
  }
}
