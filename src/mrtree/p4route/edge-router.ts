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
 * mrtree EdgeRouter — ELK alg.mrtree.p4route.EdgeRouter 0.12.0.
 *
 * MIDDLE_TO_MIDDLE: 边源/目标中心 + toNodeBorder 修正.
 * AVOID_OVERLAP: setStartPoints (出边均匀分布) → specialEdges (多级边经层内间隙,
 *   环边沿图两侧; MultiLevelEdgeNodeNodeGap 重算 bend) → setEndPoints (入边端部,
 *   含陡峭端部额外 bend).
 * 默认模式 AVOID_OVERLAP; 弯点不足 2 的边 fallback middleToMiddle.
 *
 * 注意: Java 原始 bug (first.x vs first.y) 1:1 保留.
 */
import type { BendTriple } from './multi-level-edge-node-node-gap.js'
import { KVector } from '../../force/kvector.js'
import { TGraph, TEdge, TNode, P_LEVELMIN, P_LEVELMAX, P_COMPACT_LEVEL_ASCENSION, P_GRAPH_XMIN, P_GRAPH_YMIN, P_GRAPH_XMAX, P_GRAPH_YMAX, getBool, getNum, getInt } from '../graph.js'
import { getRoot, getAllOutgoingEdges, getAllIncomingEdges, getFirstPoint, getLastPoint, toNodeBorder, isCycleInducing, getUniqueLong } from '../tree-util.js'
import { EDGE_ROUTING_MODE, SPACING_EDGE_NODE, EDGE_END_TEXTURE_LENGTH, DIRECTION, TREE_LEVEL, EdgeRoutingMode, Direction } from '../options.js'
import { MultiLevelEdgeNodeNodeGap } from './multi-level-edge-node-node-gap.js'

export function edgeRouter(tGraph: TGraph): void {
  const mode = tGraph.props[EDGE_ROUTING_MODE] as string | undefined
  if (mode === EdgeRoutingMode.MIDDLE_TO_MIDDLE) {
    for (const tEdge of tGraph.getEdges()) {
      middleToMiddleEdgeRoute(tEdge)
    }
  } else if (mode === EdgeRoutingMode.AVOID_OVERLAP || mode === undefined || mode === null) {
    avoidOverlap(tGraph)
    // fallback
    for (const e of tGraph.getEdges()) {
      if (e.getBendPoints().length < 2) {
        middleToMiddleEdgeRoute(e)
      }
    }
  }
}

function middleToMiddleEdgeRoute(tEdge: TEdge): void {
  const bendPoints = tEdge.getBendPoints()
  // add the source port and target points to the vector chain
  const source = tEdge.getSource()
  const target = tEdge.getTarget()
  const sourcePoint = new KVector(source.getPosition().x + source.getSize().x / 2, source.getPosition().y + source.getSize().y / 2)
  const targetPoint = new KVector(target.getPosition().x + target.getSize().x / 2, target.getPosition().y + target.getSize().y / 2)
  bendPoints.unshift(sourcePoint)
  bendPoints.push(targetPoint)
  // correct the source and target points
  toNodeBorder(sourcePoint, bendPoints[1], tEdge.getSource().getSize())
  toNodeBorder(targetPoint, bendPoints[bendPoints.length - 2], tEdge.getTarget().getSize())
}

function avoidOverlap(tGraph: TGraph): void {
  const root = getRoot(tGraph)
  const nodeBendpointPadding = getNum(tGraph, SPACING_EDGE_NODE, 3)
  const edgeEndTexturePadding = getNum(tGraph, EDGE_END_TEXTURE_LENGTH, 7)
  const d = parseDirection(tGraph.props[DIRECTION])
  avoidOverlapSetStartPoints(tGraph, d, nodeBendpointPadding)
  avoidOverlapSpecialEdges(tGraph, root, d, nodeBendpointPadding, edgeEndTexturePadding)
  avoidOverlapSetEndPoints(tGraph, d, nodeBendpointPadding, edgeEndTexturePadding)
}

function avoidOverlapSpecialEdges(tGraph: TGraph, root: TNode, d: Direction, nodeBendpointPadding: number, edgeEndTexturePadding: number): void {
  let sideOneEdges = 0
  let sideTwoEdges = 0 // Counts how many edges are routed along the sides of the tree
  const nodeGaps = new Map<string, MultiLevelEdgeNodeNodeGap>()
  const maxLevel = Math.max(...tGraph.getNodes().map((x) => getInt(x, TREE_LEVEL, 0))) + 1
  const outsPerLevel = new Array<number>(maxLevel).fill(0)
  const insPerLevel = new Array<number>(maxLevel).fill(0)

  const distictEdges = [...new Set(tGraph.getEdges())]
  for (const e of distictEdges) {
    const sourceLevel = getInt(e.getSource(), TREE_LEVEL, 0)
    const targetLevel = getInt(e.getTarget(), TREE_LEVEL, 0)
    const levelDiff = targetLevel - sourceLevel
    if (levelDiff > 1) {
      // Multi level edges
      for (let curLevel = sourceLevel + 1; curLevel < targetLevel; curLevel++) {
        const nextLevelNodes = tGraph.getNodes().filter((x) => getInt(x, TREE_LEVEL, 0) === curLevel)
        // Find the node gap in the next level through which we can route our multi level edge
        let i = 0
        if (d === Direction.LEFT || d === Direction.RIGHT) {
          nextLevelNodes.sort((x, y) => x.getPosition().y - y.getPosition().y)
          for (i = 0; i < nextLevelNodes.length; i++) {
            const interpolation = (curLevel - sourceLevel) / (targetLevel - sourceLevel)
            if (nextLevelNodes[i].getPosition().y > (e.getSource().getPosition().y * (1 - interpolation) + e.getTarget().getPosition().y * interpolation)) {
              break
            }
          }
          // Skip unnecessary level side bendPoints
          if (nextLevelNodes.length > 0) {
            const start = e.getBendPoints().length === 0 ? e.getSource().getPosition().clone() : e.getBendPoints()[e.getBendPoints().length - 1]
            const lastNode = nextLevelNodes[nextLevelNodes.length - 1]
            const last = lastNode.getPosition().clone().add(lastNode.getSize())
            const firstNode = nextLevelNodes[0]
            const first = firstNode.getPosition().clone().add(firstNode.getSize())
            if (i >= nextLevelNodes.length - 1 && start.y > last.y && e.getTarget().getPosition().y > last.y) {
              continue
            }
            // Java 原始 bug: 用 first.x 而非 first.y (1:1 保留)
            if (i <= 0 && start.y < first.x && e.getTarget().getPosition().y < first.y) {
              continue
            }
          }
        } else {
          nextLevelNodes.sort((x, y) => x.getPosition().x - y.getPosition().x)
          for (i = 0; i < nextLevelNodes.length; i++) {
            const interpolation = (curLevel - sourceLevel) / (targetLevel - sourceLevel)
            if (nextLevelNodes[i].getPosition().x > (e.getSource().getPosition().x * (1 - interpolation) + e.getTarget().getPosition().x * interpolation)) {
              break
            }
          }
          // Skip unnecessary level side bendPoints
          if (nextLevelNodes.length > 0) {
            const start = e.getBendPoints().length === 0 ? e.getSource().getPosition().clone() : e.getBendPoints()[e.getBendPoints().length - 1]
            const lastNode = nextLevelNodes[nextLevelNodes.length - 1]
            const last = lastNode.getPosition().clone().add(lastNode.getSize())
            const firstNode = nextLevelNodes[0]
            const first = firstNode.getPosition().clone().add(firstNode.getSize())
            if (i >= nextLevelNodes.length - 1 && start.x > last.x && e.getTarget().getPosition().x > last.x) {
              continue
            }
            if (i <= 0 && start.x < first.x && e.getTarget().getPosition().x < first.x) {
              continue
            }
          }
        }
        // Add multi level edge gap to nodeGaps
        const bend1 = new KVector()
        const bend2 = new KVector()
        e.getBendPoints().push(bend1)
        e.getBendPoints().push(bend2)
        let gap: MultiLevelEdgeNodeNodeGap
        const bendTriple: BendTriple = { first: bend1, second: bend2, third: e }
        const key = getUniqueLong(curLevel, i)
        if (!nodeGaps.has(key)) {
          gap = new MultiLevelEdgeNodeNodeGap(
            i === 0 ? null : nextLevelNodes[i - 1],
            i === nextLevelNodes.length ? null : nextLevelNodes[i],
            bendTriple,
            tGraph,
          )
          nodeGaps.set(key, gap)
        } else {
          gap = nodeGaps.get(key) as MultiLevelEdgeNodeNodeGap
          gap.addBendPoints(bendTriple)
        }
        // Increment end of level edge counters
        if (!(d === Direction.LEFT || d === Direction.RIGHT)) {
          if (gap.isOnFirstNodeSide() && (gap.getNeighborTwo() as TNode).getPosition().x <= getNum(tGraph, P_GRAPH_XMIN, 0)) {
            sideOneEdges++
          }
          if (gap.isOnLastNodeSide() && (gap.getNeighborOne() as TNode).getPosition().x + (gap.getNeighborOne() as TNode).getSize().x >= getNum(tGraph, P_GRAPH_XMAX, 0)) {
            sideTwoEdges++
          }
        } else {
          if (gap.isOnFirstNodeSide() && (gap.getNeighborTwo() as TNode).getPosition().y <= getNum(tGraph, P_GRAPH_YMIN, 0)) {
            sideOneEdges++
          }
          if (gap.isOnLastNodeSide() && (gap.getNeighborOne() as TNode).getPosition().y + (gap.getNeighborOne() as TNode).getSize().y >= getNum(tGraph, P_GRAPH_YMAX, 0)) {
            sideTwoEdges++
          }
        }
      }
    } else if (levelDiff === 0) {
      // Fallback for edges that come from and go to the same level
      middleToMiddleEdgeRoute(e)
    } else if (levelDiff < 0) {
      outsPerLevel[sourceLevel]++
      insPerLevel[targetLevel]++
      const sides = avoidOverlapHandleCycleInducingEdges(e, d, tGraph, sideOneEdges, sideTwoEdges, nodeBendpointPadding, edgeEndTexturePadding, insPerLevel[targetLevel], outsPerLevel[sourceLevel])
      sideOneEdges = sides[0]
      sideTwoEdges = sides[1]
    }
  }
}

function avoidOverlapHandleCycleInducingEdges(
  e: TEdge, d: Direction, tGraph: TGraph,
  sideOneEdgesIn: number, sideTwoEdgesIn: number,
  nodeBendpointPadding: number, edgeEndTexturePadding: number,
  ins: number, outs: number,
): [number, number] {
  let sideOneEdges = sideOneEdgesIn
  let sideTwoEdges = sideTwoEdgesIn
  const s = e.getSource()
  const t = e.getTarget()
  // Compute bendTmp which is the coordinate at the end of the graph the edge will be routed along
  let bendTmp = 0
  if (d === Direction.LEFT || d === Direction.RIGHT) {
    const middleTree = tGraph.getNodes().map((x) => x.getPosition().y + x.getSize().y / 2).reduce((a, b) => a + b, 0) / tGraph.getNodes().length
    if (s.getPosition().y + s.getSize().y / 2 > middleTree) {
      sideTwoEdges++
      bendTmp = Math.max(...tGraph.getNodes().map((x) => x.getPosition().y + x.getSize().y + nodeBendpointPadding * sideTwoEdges))
    } else {
      sideOneEdges++
      bendTmp = Math.min(...tGraph.getNodes().map((x) => x.getPosition().y - nodeBendpointPadding * sideOneEdges))
    }
  } else {
    const middleTree = tGraph.getNodes().map((x) => x.getPosition().x + x.getSize().x / 2).reduce((a, b) => a + b, 0) / tGraph.getNodes().length
    if (s.getPosition().x + s.getSize().x / 2 > middleTree) {
      sideTwoEdges++
      bendTmp = Math.max(...tGraph.getNodes().map((x) => x.getPosition().x + x.getSize().x + nodeBendpointPadding * sideTwoEdges))
    } else {
      sideOneEdges++
      bendTmp = Math.min(...tGraph.getNodes().map((x) => x.getPosition().x - nodeBendpointPadding * sideOneEdges))
    }
  }
  // Set bendPoints
  if (d === Direction.LEFT) {
    e.getBendPoints().push(new KVector(getNum(s, P_LEVELMIN, 0) - nodeBendpointPadding, bendTmp))
    e.getBendPoints().push(new KVector(t.getPosition().x + t.getSize().x + nodeBendpointPadding + edgeEndTexturePadding, bendTmp))
    e.getBendPoints().push(new KVector(t.getPosition().x + t.getSize().x + nodeBendpointPadding + edgeEndTexturePadding, t.getPosition().y + t.getSize().y / 2))
    e.getBendPoints().push(new KVector(t.getPosition().x + t.getSize().x, t.getPosition().y + t.getSize().y / 2))
  } else if (d === Direction.RIGHT) {
    e.getBendPoints().push(new KVector(getNum(s, P_LEVELMAX, 0) + nodeBendpointPadding, s.getPosition().y + s.getSize().y / 2))
    e.getBendPoints().push(new KVector(s.getPosition().x + s.getSize().x + nodeBendpointPadding, bendTmp))
    e.getBendPoints().push(new KVector(t.getPosition().x - nodeBendpointPadding - edgeEndTexturePadding, bendTmp))
    e.getBendPoints().push(new KVector(t.getPosition().x - nodeBendpointPadding - edgeEndTexturePadding, t.getPosition().y + t.getSize().y / 2))
    e.getBendPoints().push(new KVector(t.getPosition().x, t.getPosition().y + t.getSize().y / 2))
  } else if (d === Direction.UP) {
    e.getBendPoints().push(new KVector(bendTmp, getNum(s, P_LEVELMIN, 0) - nodeBendpointPadding))
    e.getBendPoints().push(new KVector(bendTmp, t.getPosition().y + t.getSize().y + nodeBendpointPadding + edgeEndTexturePadding))
    e.getBendPoints().push(new KVector(t.getPosition().x + t.getSize().x / 2, t.getPosition().y + t.getSize().y + nodeBendpointPadding + edgeEndTexturePadding))
    e.getBendPoints().push(new KVector(t.getPosition().x + t.getSize().x / 2, t.getPosition().y + t.getSize().y + nodeBendpointPadding))
  } else {
    if (e.getBendPoints().length > 0) {
      e.getBendPoints()[e.getBendPoints().length - 1].y = getNum(s, P_LEVELMAX, 0) + nodeBendpointPadding * outs
    }
    e.getBendPoints().push(new KVector(bendTmp, getNum(s, P_LEVELMAX, 0) + nodeBendpointPadding * outs))
    e.getBendPoints().push(new KVector(bendTmp, t.getPosition().y - nodeBendpointPadding * ins - edgeEndTexturePadding))
  }
  return [sideOneEdges, sideTwoEdges]
}

function avoidOverlapSetStartPoints(tGraph: TGraph, d: Direction, nodeBendpointPadding: number): void {
  for (const n of tGraph.getNodes()) {
    if (n.getLabel() === 'SUPER_ROOT') {
      continue
    }
    // Get a list of all outgoing edges from n
    const outs = getAllOutgoingEdges(n, tGraph)
    if (d === Direction.LEFT || d === Direction.RIGHT) {
      outs.sort((x, y) => getFirstPoint(x).y - getFirstPoint(y).y)
    } else {
      outs.sort((x, y) => getFirstPoint(x).x - getFirstPoint(y).x)
    }
    // Set the bendPoints for all outs
    const num = outs.length
    for (let i = 0; i < num; i++) {
      if (getBool(n, P_COMPACT_LEVEL_ASCENSION, false) && !isCycleInducing(outs[i], tGraph)) {
        continue
      }
      const interpolation = num === 1 ? 0.5 : (i + 1) / (num + 1)
      if (d === Direction.LEFT) {
        const levelEndCoord = getNum(n, P_LEVELMIN, 0)
        const y = n.getPosition().y + n.getSize().y * interpolation
        outs[i].getBendPoints().unshift(new KVector(Math.min(levelEndCoord, n.getPosition().x - nodeBendpointPadding), y))
        outs[i].getBendPoints().unshift(new KVector(n.getPosition().x, y))
      } else if (d === Direction.RIGHT) {
        const levelEndCoord = getNum(n, P_LEVELMAX, 0) + nodeBendpointPadding
        const y = n.getPosition().y + n.getSize().y * interpolation
        outs[i].getBendPoints().unshift(new KVector(levelEndCoord, y))
        outs[i].getBendPoints().unshift(new KVector(n.getPosition().x + n.getSize().x, y))
      } else if (d === Direction.UP) {
        const levelEndCoord = getNum(n, P_LEVELMIN, 0)
        const x = n.getPosition().x + n.getSize().x * interpolation
        outs[i].getBendPoints().unshift(new KVector(x, Math.min(n.getPosition().y - nodeBendpointPadding, levelEndCoord)))
        outs[i].getBendPoints().unshift(new KVector(x, n.getPosition().y))
      } else {
        const levelEndCoord = getNum(n, P_LEVELMAX, 0) + nodeBendpointPadding
        const x = n.getPosition().x + n.getSize().x * interpolation
        outs[i].getBendPoints().unshift(new KVector(x, levelEndCoord))
        outs[i].getBendPoints().unshift(new KVector(x, n.getPosition().y + n.getSize().y))
      }
    }
  }
}

function avoidOverlapSetEndPoints(tGraph: TGraph, d: Direction, nodeBendpointPadding: number, edgeEndTexturePadding: number): void {
  const steepEndEdgeTheresholdDistance = 50
  const steepEndEdgeRatio = 5.3
  const steepEndEdgeSampleHeight = 40
  for (const n of tGraph.getNodes()) {
    if (n.getLabel() === 'SUPER_ROOT') {
      continue
    }
    // Get the incoming edges and sort them by their current bendPoints
    const ins = getAllIncomingEdges(n, tGraph)
    if (d === Direction.LEFT || d === Direction.RIGHT) {
      ins.sort((x, y) => getLastPoint(x).y - getLastPoint(y).y)
    } else {
      ins.sort((x, y) => getLastPoint(x).x - getLastPoint(y).x)
    }
    // Set the bendPoints
    const num = ins.length
    for (let i = 0; i < num; i++) {
      const interpolation = num === 1 ? 0.5 : (1 + i) / (num + 1)
      if (d === Direction.LEFT) {
        const levelStartCoord = getNum(n, P_LEVELMAX, 0)
        // Only add level bendPoint if the distance is great enough
        if (n.getPosition().x + n.getSize().x + edgeEndTexturePadding < levelStartCoord) {
          ins[i].getBendPoints().push(new KVector(levelStartCoord + nodeBendpointPadding, n.getPosition().y + n.getSize().y * interpolation))
        // If the angle of the end piece is too steep, add another bendpoint
        } else if (ins[i].getBendPoints().length > 0) {
          const lastX = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].x
          const nextX = n.getPosition().x + n.getSize().x / 2
          const lastY = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].y
          const nextY = n.getPosition().y + n.getSize().y / 2
          if (edgeEndTexturePadding > 0 && Math.abs(lastY - nextY) / (Math.abs(lastX - nextX) / steepEndEdgeSampleHeight) > steepEndEdgeTheresholdDistance) {
            if (nextY > lastY) {
              // Place it to the left
              ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x + edgeEndTexturePadding / steepEndEdgeRatio, n.getPosition().y + n.getSize().y * interpolation - edgeEndTexturePadding / 2))
            } else {
              // Place it to the right
              ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x + edgeEndTexturePadding / steepEndEdgeRatio, n.getPosition().y + n.getSize().y * interpolation + edgeEndTexturePadding / 2))
            }
          }
        }
        ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x, n.getPosition().y + n.getSize().y * interpolation))
      } else if (d === Direction.RIGHT) {
        const levelStartCoord = getNum(n, P_LEVELMIN, 0)
        // Only add level bendPoint if the distance is great enough
        if (n.getPosition().x - edgeEndTexturePadding > levelStartCoord) {
          ins[i].getBendPoints().push(new KVector(levelStartCoord - nodeBendpointPadding, n.getPosition().y + n.getSize().y * interpolation))
        // If the angle of the end piece is too steep, add another bendpoint
        } else if (ins[i].getBendPoints().length > 0) {
          const lastX = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].x
          const nextX = n.getPosition().x + n.getSize().x / 2
          const lastY = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].y
          const nextY = n.getPosition().y + n.getSize().y / 2
          if (edgeEndTexturePadding > 0 && Math.abs(lastY - nextY) / (Math.abs(lastX - nextX) / steepEndEdgeSampleHeight) > steepEndEdgeTheresholdDistance) {
            if (nextY > lastY) {
              ins[i].getBendPoints().push(new KVector(n.getPosition().x - edgeEndTexturePadding / steepEndEdgeRatio, n.getPosition().y + n.getSize().y * interpolation - edgeEndTexturePadding / 2))
            } else {
              ins[i].getBendPoints().push(new KVector(n.getPosition().x - edgeEndTexturePadding / steepEndEdgeRatio, n.getPosition().y + n.getSize().y * interpolation + edgeEndTexturePadding / 2))
            }
          }
        }
        ins[i].getBendPoints().push(new KVector(n.getPosition().x, n.getPosition().y + n.getSize().y * interpolation))
      } else if (d === Direction.UP) {
        const levelStartCoord = getNum(n, P_LEVELMAX, 0)
        // Only add level bendPoint if the distance is great enough
        if (n.getPosition().y + n.getSize().y + edgeEndTexturePadding < levelStartCoord) {
          ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation, levelStartCoord + nodeBendpointPadding))
        // If the angle of the end piece is too steep, add another bendpoint
        } else if (ins[i].getBendPoints().length > 0) {
          const lastX = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].x
          const nextX = n.getPosition().x + n.getSize().x / 2
          const lastY = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].y
          const nextY = n.getPosition().y + n.getSize().y / 2
          if (edgeEndTexturePadding > 0 && Math.abs(lastX - nextX) / (Math.abs(lastY - nextY) / steepEndEdgeSampleHeight) > steepEndEdgeTheresholdDistance) {
            if (nextX > lastX) {
              ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation - edgeEndTexturePadding / 2, n.getPosition().y + edgeEndTexturePadding / steepEndEdgeRatio + n.getSize().y))
            } else {
              ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation + edgeEndTexturePadding / 2, n.getPosition().y + edgeEndTexturePadding / steepEndEdgeRatio + n.getSize().y))
            }
          }
        }
        ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation, n.getPosition().y + n.getSize().y))
      } else {
        const levelStartCoord = getNum(n, P_LEVELMIN, 0)
        // For cycle inducing edges add the end piece
        if (isCycleInducing(ins[i], tGraph)) {
          ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation, ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].y))
        // Only add level bendPoint if the distance is great enough
        } else if (n.getPosition().y - edgeEndTexturePadding > levelStartCoord) {
          ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation, levelStartCoord - nodeBendpointPadding))
        // If the angle of the end piece is too steep, add another bend point
        } else if (ins[i].getBendPoints().length > 0) {
          const lastX = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].x
          const nextX = n.getPosition().x + n.getSize().x / 2
          const lastY = ins[i].getBendPoints()[ins[i].getBendPoints().length - 1].y
          const nextY = n.getPosition().y + n.getSize().y / 2
          if (edgeEndTexturePadding > 0 && Math.abs(lastX - nextX) / (Math.abs(lastY - nextY) / steepEndEdgeSampleHeight) > steepEndEdgeTheresholdDistance) {
            if (nextX > lastX) {
              ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation - edgeEndTexturePadding / 2, n.getPosition().y - edgeEndTexturePadding / steepEndEdgeRatio))
            } else {
              ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation + edgeEndTexturePadding / 2, n.getPosition().y - edgeEndTexturePadding / steepEndEdgeRatio))
            }
          }
        }
        ins[i].getBendPoints().push(new KVector(n.getPosition().x + n.getSize().x * interpolation, n.getPosition().y))
      }
    }
  }
}

function parseDirection(v: unknown): Direction {
  if (v === undefined || v === null) return Direction.DOWN
  const s = String(v).toUpperCase()
  if (s === 'UP') return Direction.UP
  if (s === 'LEFT') return Direction.LEFT
  if (s === 'RIGHT') return Direction.RIGHT
  return Direction.DOWN
}
