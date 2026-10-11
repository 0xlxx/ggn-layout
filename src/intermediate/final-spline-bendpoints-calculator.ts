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
 * FinalSplineBendpointsCalculator (对应 ELK intermediate.FinalSplineBendpointsCalculator).
 *
 * SplineEdgeRouter 之后: 把每段 NUB 控制点 (Straight/Inverted/Conservative/Sloppy) 写入边弯点,
 * 再经 NubSpline (均匀钳制 cubic) 转 Bezier 控制点作为最终弯点 (CONSERVATIVE 时插入直线化 CP).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { PortSide } from '../graph/enums.js'
import { EDGE_ROUTING_SPLINES_MODE, COMPACTION_POST_COMPACTION_STRATEGY, SPACING_EDGE_EDGE_BETWEEN_LAYERS, SPACING_EDGE_NODE_BETWEEN_LAYERS } from '../options/layered-options.js'
import { SPLINE_ROUTE_START, SPLINE_EDGE_CHAIN, SPLINE_NS_PORT_Y_COORD } from '../options/internal-properties.js'
import { NubSpline } from '../p5edges/splines/nub-spline.js'
import { portSideToDirection, approximateBezierSegment, intersectsRectLine, containsRectLine, type Rect } from '../p5edges/splines/splines-math.js'
import { SplineSegment } from '../p5edges/splines/spline-segment.js'
import { isQualifiedAsStartingNode } from '../p5edges/splines/spline-edge-router.js'
import type { KVector } from '../graph/enums.js'

const NODE_TO_STRAIGHTENING_CP_GAP = 5
const SLOPPY_CENTER_CP_MULTIPLIER = 0.4
const ONE_HALF = 0.5

export function processFinalSplineBendpoints(layeredGraph: LGraph): void {
  const edgeEdgeSpacing = layeredGraph.getProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS)
  const edgeNodeSpacing = layeredGraph.getProperty(SPACING_EDGE_NODE_BETWEEN_LAYERS)
  const splineRoutingMode = layeredGraph.getProperty(EDGE_ROUTING_SPLINES_MODE)
  const compactionStrategy = layeredGraph.getProperty(COMPACTION_POST_COMPACTION_STRATEGY)

  // 每层节点按层内序编号 (src.id 用于邻居查询).
  for (const layer of layeredGraph.getLayers()) {
    let index = 0
    for (const n of layer.getNodes()) {
      n.id = index++
    }
  }

  // 收集 startEdges (SPLINE_ROUTE_START 的边)
  const startEdges: LEdge[] = []
  for (const layer of layeredGraph.getLayers()) {
    for (const n of layer.getNodes()) {
      for (const p of n.getPorts()) {
        for (const e of p.getOutgoingEdges()) {
          if (e.isSelfLoop()) continue
          if (e.hasProperty(SPLINE_ROUTE_START)) startEdges.push(e)
        }
      }
    }
  }

  // 先算控制点
  for (const e of startEdges) {
    const spline = e.getProperty(SPLINE_ROUTE_START)
    if (spline !== null && spline !== undefined) {
      for (const seg of spline) calculateControlPoints(seg, edgeEdgeSpacing, edgeNodeSpacing, splineRoutingMode, compactionStrategy)
      e.setProperty(SPLINE_ROUTE_START, null)
    }
  }
  // 再转 Bezier
  for (const e of startEdges) {
    const edgeChain = e.getProperty(SPLINE_EDGE_CHAIN)
    calculateBezierBendPoints(edgeChain ?? [], e, splineRoutingMode)
    e.setProperty(SPLINE_EDGE_CHAIN, null)
  }
}

function calculateControlPoints(segment: SplineSegment, edgeEdgeSpacing: number, edgeNodeSpacing: number, splineRoutingMode: string, compactionStrategy: string): void {
  if (segment.handled) return
  segment.handled = true

  for (const edge of segment.edges) {
    if (segment.isStraight && !segment.isHyperEdge()) {
      calculateControlPointsStraight(segment)
      continue
    }
    const ei = segment.edgeInformation.get(edge)!
    if (ei.invertedLeft || ei.invertedRight) {
      calculateControlPointsInvertedEdge(edge, segment, edgeNodeSpacing, edgeEdgeSpacing)
      continue
    }
    const sloppy = splineRoutingMode === 'SLOPPY'
      && (ei.normalSourceNode || ei.normalTargetNode)
      && segmentAllowsSloppyRouting(segment, compactionStrategy)
      && !segment.isHyperEdge()
    if (sloppy) {
      calculateControlPointsSloppy(edge, segment)
    } else {
      calculateControlPointsConservative(edge, segment, edgeNodeSpacing, edgeEdgeSpacing)
    }
  }

  if (segment.inverseOrder) {
    for (const edge of segment.edges) edge.getBendPoints().reverse()
  }
}

function calculateControlPointsStraight(segment: SplineSegment): void {
  const xStartPos = segment.boundingBox.x
  const xEndPos = segment.boundingBox.x + segment.boundingBox.width
  const halfway = { x: xStartPos + (xEndPos - xStartPos) / 2, y: segment.centerControlPointY }
  segment.edges[0]!.getBendPoints().push(halfway)
}

function calculateControlPointsInvertedEdge(edge: LEdge, containingSegment: SplineSegment, edgeNodeSpacing: number, edgeEdgeSpacing: number): void {
  const startXPos = containingSegment.boundingBox.x
  const endXPos = containingSegment.boundingBox.x + containingSegment.boundingBox.width
  const ei = containingSegment.edgeInformation.get(edge)!
  const ySourceAnchor = ei.startY
  const yTargetAnchor = ei.endY

  const sourceStraightCP: KVector = ei.invertedLeft
    ? { x: endXPos, y: ySourceAnchor }
    : { x: startXPos, y: ySourceAnchor }
  const targetStraightCP: KVector = ei.invertedRight
    ? { x: startXPos, y: yTargetAnchor }
    : { x: endXPos, y: yTargetAnchor }

  let centerXPos = startXPos
  if (!containingSegment.isWestOfInitialLayer) centerXPos += edgeNodeSpacing
  centerXPos += containingSegment.xDelta + containingSegment.rank * edgeEdgeSpacing

  const sourceVerticalCP = { x: centerXPos, y: ySourceAnchor }
  const targetVerticalCP = { x: centerXPos, y: yTargetAnchor }

  edge.getBendPoints().push(sourceStraightCP, sourceVerticalCP)
  if (containingSegment.edges.length > 1) {
    edge.getBendPoints().push({ x: centerXPos, y: containingSegment.centerControlPointY })
  }
  edge.getBendPoints().push(targetVerticalCP, targetStraightCP)
}

function calculateControlPointsConservative(edge: LEdge, containingSegment: SplineSegment, edgeNodeSpacing: number, edgeEdgeSpacing: number): void {
  const startXPos = containingSegment.boundingBox.x
  const endXPos = containingSegment.boundingBox.x + containingSegment.boundingBox.width
  const ei = containingSegment.edgeInformation.get(edge)!
  const ySourceAnchor = ei.startY
  const yTargetAnchor = ei.endY

  const sourceStraightCP = { x: startXPos, y: ySourceAnchor }
  const targetStraightCP = { x: endXPos, y: yTargetAnchor }

  let centerXPos = startXPos
  if (!containingSegment.isWestOfInitialLayer) centerXPos += edgeNodeSpacing
  centerXPos += containingSegment.xDelta + containingSegment.rank * edgeEdgeSpacing
  const sourceVerticalCP = { x: centerXPos, y: ySourceAnchor }
  const targetVerticalCP = { x: centerXPos, y: yTargetAnchor }

  edge.getBendPoints().push(sourceStraightCP, sourceVerticalCP)
  if (containingSegment.edges.length > 1) {
    edge.getBendPoints().push({ x: centerXPos, y: containingSegment.centerControlPointY })
  }
  edge.getBendPoints().push(targetVerticalCP, targetStraightCP)
}

function calculateControlPointsSloppy(edge: LEdge, containingSegment: SplineSegment): void {
  const ei = containingSegment.edgeInformation.get(edge)!
  const startXPos = containingSegment.boundingBox.x
  const endXPos = containingSegment.boundingBox.x + containingSegment.boundingBox.width
  const ySourceAnchor = ei.startY
  const yTargetAnchor = ei.endY
  const edgePointsDownwards = ySourceAnchor < yTargetAnchor

  const sourceStraightCP = { x: startXPos, y: ySourceAnchor }
  const targetStraightCP = { x: endXPos, y: yTargetAnchor }
  const centerXPos = (startXPos + endXPos) / 2
  const sourceVerticalCP = { x: centerXPos, y: ySourceAnchor }
  const targetVerticalCP = { x: centerXPos, y: yTargetAnchor }

  const centerYPos = computeSloppyCenterY(edge, ySourceAnchor, yTargetAnchor)
  const v1 = containingSegment.sourcePort!.getAbsoluteAnchor()
  const v2 = { x: centerXPos, y: centerYPos }
  const v3 = containingSegment.targetPort!.getAbsoluteAnchor()
  const approx = approximateBezierSegment(2, [v1, v2, v3])

  let shortCutSource = false
  const src = containingSegment.sourcePort!.getNode()
  if (src !== null && src.getLayer() !== null && ei.normalSourceNode) {
    const layer = src.getLayer()!
    const needToCheckSrc = edgePointsDownwards && src.id < layer.getNodes().length - 1
      || !edgePointsDownwards && src.id > 0
    if (!needToCheckSrc) {
      shortCutSource = true
    } else {
      const neighborIndex = edgePointsDownwards ? src.id + 1 : src.id - 1
      const neighbor = layer.getNodes()[neighborIndex]!
      const box = nodeToBoundingBox(neighbor)
      shortCutSource = !(intersectsRectLine(box, v1, approx[0]!) || containsRectLine(box, v1, approx[0]!))
    }
  }

  let shortCutTarget = false
  const tgt = containingSegment.targetPort!.getNode()
  if (tgt !== null && tgt.getLayer() !== null && ei.normalTargetNode) {
    const layer = tgt.getLayer()!
    const needToCheckTgt = edgePointsDownwards && tgt.id > 0
      || !edgePointsDownwards && tgt.id < layer.getNodes().length - 1
    if (!needToCheckTgt) {
      shortCutTarget = true
    } else {
      const neighborIndex = edgePointsDownwards ? tgt.id - 1 : tgt.id + 1
      const neighbor = layer.getNodes()[neighborIndex]!
      const box = nodeToBoundingBox(neighbor)
      shortCutTarget = !(intersectsRectLine(box, approx[0]!, v3) || containsRectLine(box, approx[0]!, v3))
    }
  }

  if (shortCutSource && shortCutTarget) {
    edge.getBendPoints().push(v2)
  }
  if (!shortCutSource) {
    edge.getBendPoints().push(sourceStraightCP, sourceVerticalCP)
  }
  if (!shortCutTarget) {
    edge.getBendPoints().push(targetVerticalCP, targetStraightCP)
  }
}

function nodeToBoundingBox(node: LNode): Rect {
  const pos = node.getPosition()
  const size = node.getSize()
  const m = node.getMargin()
  return { x: pos.x - m.left, y: pos.y - m.top, width: size.x + m.left + m.right, height: size.y + m.top + m.bottom }
}

function computeSloppyCenterY(edge: LEdge, ySourceAnchor: number, yTargetAnchor: number): number {
  let indegree = 0
  let outdegree = 0
  if (edge.getTarget() !== null) {
    for (const port of edge.getTarget()!.getNode()!.getPorts()) indegree += port.getIncomingEdges().length
  } else {
    indegree = 1
  }
  if (edge.getSource() !== null) {
    for (const port of edge.getSource()!.getNode()!.getPorts()) outdegree += port.getOutgoingEdges().length
  } else {
    outdegree = 1
  }
  const degreeDiff = Math.sign(outdegree - indegree)
  return ((yTargetAnchor + ySourceAnchor) / 2) + (yTargetAnchor - ySourceAnchor) * (SLOPPY_CENTER_CP_MULTIPLIER * degreeDiff)
}

function calculateBezierBendPoints(edgeChain: LEdge[], survivingEdge: LEdge | null, splineRoutingMode: string): void {
  if (edgeChain.length === 0) return
  const edge = survivingEdge !== null ? survivingEdge : edgeChain[0]!
  const sourcePort = edge.getSource()!

  if (!isQualifiedAsStartingNode(sourcePort.getNode()!)) {
    throw new Error('The target node of the edge must be a normal node or a northSouthPort.')
  }

  const allCP: KVector[] = [sourcePort.getAbsoluteAnchor()]
  if (typeof process !== 'undefined' && process.env.GGN_SPLINES_DBG) {
    console.error(`[FSBC] chain(${edgeChain.length}) source=(${allCP[0]!.x.toFixed(1)},${allCP[0]!.y.toFixed(1)})`)
    for (const ce of edgeChain) console.error(`[FSBC]   edgeBends: ${ce.getBendPoints().map(bp => `(${bp.x.toFixed(1)},${bp.y.toFixed(1)})`).join(' ')}`)
  }

  if (isNorthSouth(sourcePort.getSide())) {
    const y = sourcePort.getProperty(SPLINE_NS_PORT_Y_COORD)
    allCP.push({ x: sourcePort.getAbsoluteAnchor().x, y: y !== null && y !== undefined ? y : sourcePort.getAbsoluteAnchor().y })
  }

  let lastCP: KVector | null = null
  let addMidPoint = false
  for (const currentEdge of edgeChain) {
    const currentBendPoints = currentEdge.getBendPoints()
    if (currentBendPoints.length > 0) {
      if (addMidPoint) {
        const halfway = { x: (lastCP!.x + currentBendPoints[0]!.x) / 2, y: (lastCP!.y + currentBendPoints[0]!.y) / 2 }
        allCP.push(halfway)
        addMidPoint = false
      } else {
        addMidPoint = true
      }
      lastCP = { ...currentBendPoints[currentBendPoints.length - 1]! }
      allCP.push(...currentBendPoints.map((b) => ({ x: b.x, y: b.y })))
      currentBendPoints.length = 0
    }
  }

  const targetPort = edge.getTarget()!
  if (isNorthSouth(targetPort.getSide())) {
    const y = targetPort.getProperty(SPLINE_NS_PORT_Y_COORD)
    allCP.push({ x: targetPort.getAbsoluteAnchor().x, y: y !== null && y !== undefined ? y : targetPort.getAbsoluteAnchor().y })
  }
  allCP.push(targetPort.getAbsoluteAnchor())

  if (splineRoutingMode === 'CONSERVATIVE') {
    insertStraighteningControlPoints(allCP, sourcePort, targetPort)
  }

  if (typeof process !== 'undefined' && process.env.GGN_SPLINES_DBG) {
    console.error(`[FSBC] allCP(${allCP.length}): ${allCP.map(p => `(${p.x.toFixed(1)},${p.y.toFixed(1)})`).join(' ')}`)
  }
  const nubSpline = new NubSpline(true, 3, allCP)
  const bez = nubSpline.getBezierCP()
  if (typeof process !== 'undefined' && process.env.GGN_SPLINES_DBG) {
    console.error(`[FSBC] bezierCP(${bez.length}): ${bez.map(p => `(${p.x.toFixed(2)},${p.y.toFixed(2)})`).join(' ')}`)
  }
  edge.getBendPoints().push(...bez)
}

function insertStraighteningControlPoints(allCPs: KVector[], srcPort: LPort, tgtPort: LPort): void {
  // 起始
  const first = allCPs[0]!
  const second = allCPs[1]!
  const dir = portSideToDirection(srcPort.getSide())
  const v = { x: Math.cos(dir) * NODE_TO_STRAIGHTENING_CP_GAP, y: Math.sin(dir) * NODE_TO_STRAIGHTENING_CP_GAP }
  const v2 = { x: second.x - first.x, y: second.y - first.y }
  const straightenBeginning = { x: absMin(v.x, v2.x), y: absMin(v.y, v2.y) }
  straightenBeginning.x += first.x
  straightenBeginning.y += first.y
  allCPs.splice(1, 0, straightenBeginning)

  // 结束
  const last = allCPs[allCPs.length - 1]!
  const secondLast = allCPs[allCPs.length - 2]!
  const dir2 = portSideToDirection(tgtPort.getSide())
  const vv = { x: Math.cos(dir2) * NODE_TO_STRAIGHTENING_CP_GAP, y: Math.sin(dir2) * NODE_TO_STRAIGHTENING_CP_GAP }
  const vv2 = { x: secondLast.x - last.x, y: secondLast.y - last.y }
  const straightenEnding = { x: absMin(vv.x, vv2.x), y: absMin(vv.y, vv2.y) }
  straightenEnding.x += last.x
  straightenEnding.y += last.y
  allCPs.splice(allCPs.length - 1, 0, straightenEnding)
}

function absMin(d1: number, d2: number): number {
  return Math.abs(d1) < Math.abs(d2) ? d1 : d2
}

function segmentAllowsSloppyRouting(segment: SplineSegment, compactionStrategy: string): boolean {
  if (compactionStrategy === 'NONE') return true
  const startXPos = segment.boundingBox.x
  const endXPos = segment.boundingBox.x + segment.boundingBox.width
  if (segment.initialSegment && segment.sourceNode !== null) {
    const n = segment.sourceNode
    const t = segmentNodeDistanceThreshold(n)
    const nodeSegmentDistance = startXPos - (n.getPosition().x + n.getSize().x)
    if (nodeSegmentDistance > t) return false
  }
  if (segment.lastSegment && segment.targetNode !== null) {
    const n = segment.targetNode
    const t = segmentNodeDistanceThreshold(n)
    const nodeSegmentDistance = n.getPosition().x - endXPos
    if (nodeSegmentDistance > t) return false
  }
  return true
}

function segmentNodeDistanceThreshold(n: LNode): number {
  return n.getLayer()!.getSize().x - n.getSize().x / 2
}

function isNorthSouth(side: PortSide): boolean {
  return side === PortSide.NORTH || side === PortSide.SOUTH
}
