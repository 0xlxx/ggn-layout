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
 * mrtree CompactionProcessor — ELK alg.mrtree.intermediate.CompactionProcessor 0.12.0.
 * 一维压缩 (COMPACTION 选项开启时): 扫描线求节点约束 (COMPACT_CONSTRAINTS),
 * 沿布局方向按约束/父节点压缩; AVOID_OVERLAP 时保持层内并记录层级上移
 * (COMPACT_LEVEL_ASCENSION + 更新 TREE_LEVEL).
 */
import { KVector } from '../../force/kvector.js'
import { TGraph, TNode, P_COMPACT_CONSTRAINTS, P_COMPACT_LEVEL_ASCENSION, P_ROOT, getBool, getInt, getNum, getProp, setProp } from '../graph.js'
import { getLowestParent, getDirectionVector } from '../tree-util.js'
import {
  COMPACTION, DIRECTION, SPACING_NODE_NODE, EDGE_ROUTING_MODE, TREE_LEVEL,
  EdgeRoutingMode, Direction,
} from '../options.js'

export function compactionProcessor(tGraph: TGraph): void {
  if (!getBool(tGraph, COMPACTION, false)) {
    return // leave if option is not set
  }
  const dir = tGraph.props[DIRECTION] as string | undefined
  const direction = (dir === 'UP' ? Direction.UP : dir === 'LEFT' ? Direction.LEFT : dir === 'RIGHT' ? Direction.RIGHT : Direction.DOWN) as Direction
  const nodeNodeSpacing = getNum(tGraph, SPACING_NODE_NODE, 20)
  const levels = setUpLevels(tGraph, direction)
  computeNodeConstraints(tGraph, nodeNodeSpacing / 2 / 2)

  // Simple one dimensional compaction \w level preservation
  const nodes = tGraph.getNodes()
  const dirVec = getDirectionVector(direction)
  nodes.sort((x, y) => {
    const dx = dirVec.x * x.getPosition().x + dirVec.y * x.getPosition().y
    const dy = dirVec.x * y.getPosition().x + dirVec.y * y.getPosition().y
    return dx - dy
  })
  for (const n of nodes) {
    // Root nodes aren't compactable
    if (!getBool(n, P_ROOT, false)) {
      const d = getLowestDependentNode(n, direction)
      const p = getLowestParent(n, tGraph)
      let newPos = 0
      let newPosSize = 0
      if (d !== null) {
        // n has a dependent node
        const pos = d.getPosition()
        switch (direction) {
          case Direction.LEFT:
            newPos = pos.x - nodeNodeSpacing - n.getSize().x
            if (p !== null && p.getPosition().x - nodeNodeSpacing - n.getSize().x < newPos) {
              newPos = p.getPosition().x - nodeNodeSpacing - n.getSize().x
            }
            newPosSize = newPos + n.getSize().x
            break
          case Direction.RIGHT:
            newPos = pos.x + d.getSize().x + nodeNodeSpacing
            if (p !== null && p.getPosition().x + nodeNodeSpacing > newPos) {
              newPos = p.getPosition().x + p.getSize().x + nodeNodeSpacing
            }
            newPosSize = newPos + n.getSize().x
            break
          case Direction.UP:
            newPos = pos.y - nodeNodeSpacing - n.getSize().y
            if (p !== null && p.getPosition().y - nodeNodeSpacing - n.getSize().y < newPos) {
              newPos = p.getPosition().y - nodeNodeSpacing - n.getSize().y
            }
            newPosSize = newPos + n.getSize().y
            break
          case Direction.DOWN:
            newPos = pos.y + d.getSize().y + nodeNodeSpacing
            if (p !== null && p.getPosition().y + nodeNodeSpacing > newPos) {
              newPos = p.getPosition().y + p.getSize().y + nodeNodeSpacing
            }
            newPosSize = newPos + n.getSize().y
            break
        }
      } else if (p !== null) {
        // n does not have a dependent node but a parent
        switch (direction) {
          case Direction.LEFT:
            newPos = p.getPosition().x - nodeNodeSpacing - n.getSize().x
            newPosSize = newPos + n.getSize().x
            break
          case Direction.RIGHT:
            newPos = p.getPosition().x + p.getSize().x + nodeNodeSpacing
            newPosSize = newPos + n.getSize().x
            break
          case Direction.UP:
            newPos = p.getPosition().y - nodeNodeSpacing - n.getSize().y
            newPosSize = newPos + n.getSize().y
            break
          case Direction.DOWN:
            newPos = p.getPosition().y + p.getSize().y + nodeNodeSpacing
            newPosSize = newPos + n.getSize().y
            break
        }
      }
      if (getProp(tGraph, EDGE_ROUTING_MODE, EdgeRoutingMode.AVOID_OVERLAP) === EdgeRoutingMode.AVOID_OVERLAP) {
        let level = levels.find((l) => l.first <= newPos && l.second >= newPosSize)
        if (level !== undefined) {
          // The Node ended up within a level
          if (direction === Direction.LEFT || direction === Direction.RIGHT) {
            n.getPosition().x = newPos
          } else {
            n.getPosition().y = newPos
          }
        } else {
          if (direction === Direction.LEFT || direction === Direction.UP) {
            // Skip the first level as it only contains the SUPER_ROOT here
            level = levels.slice(1).find((l) => l.first <= newPos)
          } else {
            // Skip the first level as it only contains the SUPER_ROOT here
            level = levels.slice(1).find((l) => l.first >= newPos)
          }
          // Force n into the found level
          if (level !== undefined) {
            if (direction === Direction.LEFT || direction === Direction.RIGHT) {
              n.getPosition().x = level.first
            } else {
              n.getPosition().y = level.first
            }
          }
        }
        // Update Tree Level of node
        if (level !== undefined) {
          const newIndex = levels.indexOf(level)
          if (newIndex > 0 && newIndex !== n.props[TREE_LEVEL]) {
            setProp(n, P_COMPACT_LEVEL_ASCENSION, true)
            n.props[TREE_LEVEL] = newIndex
          }
        }
      } else {
        // In case of Aggressive Compaction just set the parameters
        if (direction === Direction.LEFT || direction === Direction.RIGHT) {
          n.getPosition().x = newPos
        } else {
          n.getPosition().y = newPos
        }
      }
    }
  }
}

function setUpLevels(tGraph: TGraph, dir: Direction): { first: number; second: number }[] {
  const levels: { first: number; second: number }[] = []
  for (const n of tGraph.getNodes()) {
    // Adapt levels size to the current level
    while (getInt(n, TREE_LEVEL, 0) > levels.length - 1) {
      levels.push({ first: Number.MAX_VALUE, second: -Number.MAX_VALUE })
    }
    // Update level bounds
    const curLevel = getInt(n, TREE_LEVEL, 0)
    if (dir === Direction.LEFT || dir === Direction.RIGHT) {
      if (n.getPosition().x < levels[curLevel].first) levels[curLevel].first = n.getPosition().x
      if (n.getPosition().x + n.getSize().x > levels[curLevel].second) levels[curLevel].second = n.getPosition().x + n.getSize().x
    } else {
      if (n.getPosition().y < levels[curLevel].first) levels[curLevel].first = n.getPosition().y
      if (n.getPosition().y + n.getSize().y > levels[curLevel].second) levels[curLevel].second = n.getPosition().y + n.getSize().y
    }
  }
  return levels
}

function computeNodeConstraints(tGraph: TGraph, nodeNodeSpacing: number): void {
  const d = tGraph.props['org.eclipse.elk.direction'] as string | undefined
  const direction = (d === 'UP' ? Direction.UP : d === 'LEFT' ? Direction.LEFT : d === 'RIGHT' ? Direction.RIGHT : Direction.DOWN) as Direction
  const right = (direction === Direction.LEFT || direction === Direction.RIGHT) ? Direction.DOWN : Direction.RIGHT
  // Get a filtered list of all relevant nodes
  const actualNodes = tGraph.getNodes().filter((x) => !String(x.getLabel() ?? '').includes('SUPER_ROOT'))

  // Build the point list by adding the upper left node edges, then the lower left ones and sorting all of them
  const points: { node: TNode; vec: KVector; upper: boolean }[] = []
  for (const x of actualNodes) {
    const v = x.getPosition().clone()
    v.x -= nodeNodeSpacing
    v.y -= nodeNodeSpacing
    points.push({ node: x, vec: v, upper: true })
  }
  for (const x of actualNodes) {
    const v = x.getPosition().clone()
    v.x += x.getSize().x + nodeNodeSpacing
    v.y += x.getSize().y + nodeNodeSpacing
    points.push({ node: x, vec: v, upper: false })
  }
  const rightVec = getDirectionVector(right)
  points.sort((x, y) => {
    const dx = rightVec.x * x.vec.x + rightVec.y * x.vec.y
    const dy = rightVec.x * y.vec.x + rightVec.y * y.vec.y
    return dx - dy
  })

  // Set up set sorted by the node positions projections onto a 1D space given by the direction vector
  const dirVec = getDirectionVector(direction)
  const s: TNode[] = []
  const proj = (n: TNode): number => dirVec.x * n.getPosition().x + dirVec.y * n.getPosition().y
  const sortedInsert = (n: TNode): void => {
    const p = proj(n)
    let lo = 0
    let hi = s.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (proj(s[mid]) < p) lo = mid + 1
      else hi = mid
    }
    s.splice(lo, 0, n)
  }
  const headSetLast = (n: TNode): TNode | undefined => {
    const p = proj(n)
    let lo = 0
    let hi = s.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (proj(s[mid]) < p) lo = mid + 1
      else hi = mid
    }
    return lo > 0 ? s[lo - 1] : undefined
  }
  const getRightElement = (n: TNode): TNode => {
    const idx = s.indexOf(n)
    return s[idx + 1]
  }
  const cand = new Map<TNode, TNode>()

  // Scanline
  for (const p of points) {
    const r = p.node
    if (p.upper) {
      sortedInsert(r)
      if (headSetLast(r) !== undefined) {
        cand.set(r, headSetLast(r) as TNode)
      }
      if (s.length - (s.indexOf(r) + 1) > 1) {
        cand.set(getRightElement(r), r)
      }
    } else {
      // This deviates a bit from the proposed pseudo code but we need to check if right and left even exist
      if (headSetLast(r) !== undefined) {
        const leftNode = headSetLast(r) as TNode
        if (leftNode === cand.get(r)) {
          const cons = getProp<TNode[]>(r, P_COMPACT_CONSTRAINTS, [])
          cons.push(leftNode)
        }
      }
      if (s.length - (s.indexOf(r) + 1) > 1) {
        const rightNode = getRightElement(r)
        if (cand.get(rightNode) === r) {
          const cons = getProp<TNode[]>(rightNode, P_COMPACT_CONSTRAINTS, [])
          cons.push(r)
        }
      }
      s.splice(s.indexOf(r), 1)
    }
  }
}

function getLowestDependentNode(n: TNode, d: Direction): TNode | null {
  const cons = getProp<TNode[]>(n, P_COMPACT_CONSTRAINTS, [])
  if (cons === null || cons.length < 1) {
    return null
  }
  if (cons.length === 1) {
    return cons[0]
  }
  let lowestCons: TNode | null = null
  switch (d) {
    case Direction.LEFT:
      lowestCons = cons.reduce((a, b) => (a.getPosition().x <= b.getPosition().x ? a : b))
      break
    case Direction.RIGHT:
      lowestCons = cons.reduce((a, b) => (a.getPosition().x + a.getSize().x >= b.getPosition().x + b.getSize().x ? a : b))
      break
    case Direction.UP:
      lowestCons = cons.reduce((a, b) => (a.getPosition().y <= b.getPosition().y ? a : b))
      break
    case Direction.DOWN:
      lowestCons = cons.reduce((a, b) => (a.getPosition().y + a.getSize().y >= b.getPosition().y + b.getSize().y ? a : b))
      break
  }
  return lowestCons
}
