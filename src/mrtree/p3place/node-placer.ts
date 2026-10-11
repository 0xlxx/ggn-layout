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
 * mrtree NodePlacer — ELK alg.mrtree.p3place.NodePlacer 0.12.0.
 * Walker 算法 (A Node-Positioning Algorithm for General Trees, J.Q.Walker II):
 * firstWalk 自底向上算 PRELIM/MODIFIER (apportion 处理子树重叠),
 * secondWalk 自顶向下定 XCOOR/YCOOR (round 到 int).
 * 方向 UNDEFINED → DOWN 并写回 graph.
 */
import { TGraph, TNode, P_PRELIM, P_MODIFIER, P_XCOOR, P_YCOOR, P_LEVELHEIGHT, P_LEFTSIBLING, P_LEFTNEIGHBOR, P_RIGHTSIBLING, P_ROOT, getBool, getNum, setProp } from '../graph.js'
import { getLeftMost } from '../tree-util.js'
import { DIRECTION, SPACING_NODE_NODE, Direction } from '../options.js'

export function nodePlacer(tGraph: TGraph): void {
  const spacing = getNum(tGraph, SPACING_NODE_NODE, 20)
  let direction = parseDirection(tGraph.props[DIRECTION])
  // Set Direction to DOWN if its UNDEFINED
  if (direction === Direction.UNDEFINED) {
    direction = Direction.DOWN
    tGraph.props[DIRECTION] = direction
  }

  const roots: TNode[] = []
  for (const tNode of tGraph.getNodes()) {
    if (getBool(tNode, P_ROOT, false)) roots.push(tNode)
  }
  const root = roots[0]

  firstWalk(root, 0, spacing, direction)
  secondWalk(root, -(getNum(root, P_LEVELHEIGHT, 0) / 2), 0, spacing)
}

function firstWalk(cN: TNode, level: number, spacing: number, direction: Direction): void {
  setProp(cN, P_MODIFIER, 0)
  const lS = getNode(cN, P_LEFTSIBLING)
  if (cN.isLeaf()) {
    if (lS !== null) {
      const p = getNum(lS, P_PRELIM, 0) + spacing + meanNodeWidth(lS, cN, direction)
      setProp(cN, P_PRELIM, p)
    } else {
      setProp(cN, P_PRELIM, 0)
    }
  } else {
    for (const child of cN.getChildren()) {
      firstWalk(child, level + 1, spacing, direction)
    }
    const children = cN.getChildren()
    const lM = children[0]
    const rM = children[children.length - 1]
    const midPoint = (getNum(rM, P_PRELIM, 0) + getNum(lM, P_PRELIM, 0)) / 2
    if (lS !== null) {
      const p = getNum(lS, P_PRELIM, 0) + spacing + meanNodeWidth(lS, cN, direction)
      setProp(cN, P_PRELIM, p)
      setProp(cN, P_MODIFIER, getNum(cN, P_PRELIM, 0) - midPoint)
      apportion(cN, level, spacing, direction)
    } else {
      setProp(cN, P_PRELIM, midPoint)
    }
  }
}

function apportion(cN: TNode, level: number, spacing: number, direction: Direction): void {
  const children = cN.getChildren()
  let leftmost: TNode | null = children.length > 0 ? children[0] : null
  let neighbor: TNode | null = leftmost !== null ? getNode(leftmost, P_LEFTNEIGHBOR) : null
  let compareDepth = 1
  while (leftmost !== null && neighbor !== null) {
    let leftModSum = 0
    let rightModSum = 0
    let ancestorLeftmost: TNode | null = leftmost
    let ancestorNeighbor: TNode | null = neighbor
    for (let i = 0; i < compareDepth; i++) {
      ancestorLeftmost = ancestorLeftmost!.getParent()
      ancestorNeighbor = ancestorNeighbor!.getParent()
      if (ancestorLeftmost === null || ancestorNeighbor === null) return
      rightModSum += getNum(ancestorLeftmost, P_MODIFIER, 0)
      leftModSum += getNum(ancestorNeighbor, P_MODIFIER, 0)
    }
    const prN = getNum(neighbor, P_PRELIM, 0)
    const prL = getNum(leftmost, P_PRELIM, 0)
    const mean = meanNodeWidth(leftmost, neighbor, direction)
    let moveDistance = prN + leftModSum + spacing + mean - prL - rightModSum
    if (0 < moveDistance) {
      let leftSibling: TNode | null = cN
      let leftSiblings = 0
      while (leftSibling !== null && leftSibling !== ancestorNeighbor) {
        leftSiblings++
        leftSibling = getNode(leftSibling, P_LEFTSIBLING)
      }
      if (leftSibling !== null) {
        let portion = moveDistance / leftSiblings
        leftSibling = cN
        while (leftSibling !== ancestorNeighbor) {
          if (leftSibling === null) break // 不可达 (Java while 条件保证)
          const newPr = getNum(leftSibling, P_PRELIM, 0) + moveDistance
          setProp(leftSibling, P_PRELIM, newPr)
          const newMod = getNum(leftSibling, P_MODIFIER, 0) + moveDistance
          setProp(leftSibling, P_MODIFIER, newMod)
          moveDistance -= portion
          leftSibling = getNode(leftSibling, P_LEFTSIBLING)
        }
      } else {
        return
      }
    }
    compareDepth++
    if (leftmost.isLeaf()) {
      leftmost = getLeftMost(cN.getChildren(), compareDepth)
    } else {
      leftmost = leftmost.getChildren()[0] ?? null
    }
    neighbor = leftmost !== null ? getNode(leftmost, P_LEFTNEIGHBOR) : null
  }
}

function meanNodeWidth(leftNode: TNode | null, rightNode: TNode | null, direction: Direction): number {
  let nodeWidth = 0
  if (leftNode !== null) {
    if (direction === Direction.UP || direction === Direction.DOWN) {
      nodeWidth += leftNode.getSize().x / 2
    } else {
      nodeWidth += leftNode.getSize().y / 2
    }
  }
  if (rightNode !== null) {
    if (direction === Direction.UP || direction === Direction.DOWN) {
      nodeWidth += rightNode.getSize().x / 2
    } else {
      nodeWidth += rightNode.getSize().y / 2
    }
  }
  return nodeWidth
}

function secondWalk(tNode: TNode | null, yCoor: number, modsum: number, spacing: number): void {
  if (tNode !== null) {
    // The x-position of the node is the sum of its prev x-coordinate and the modifiers of
    // all the node's ancestors and the adjust of the root location.
    const xTemp = getNum(tNode, P_PRELIM, 0) + modsum
    // The y-position of the node is the height of the node's ancestors levels and the
    // height nodes's level and the adjust of the root location.
    const yTemp = yCoor + (getNum(tNode, P_LEVELHEIGHT, 0) / 2)
    setProp(tNode, P_XCOOR, Math.round(xTemp))
    setProp(tNode, P_YCOOR, Math.round(yTemp))
    // Apply the modifier value for this node to all its offspring.
    if (!tNode.isLeaf()) {
      // This node got offsprings so we will step a level down and take care of them.
      const children = tNode.getChildren()
      secondWalk(children[0] ?? null, yCoor + getNum(tNode, P_LEVELHEIGHT, 0) + spacing, modsum + getNum(tNode, P_MODIFIER, 0), spacing)
    }
    // Go ahead with the sibling to the right. This is a dfs so we just layout the current
    // subtree.
    const rightSibling = getNode(tNode, P_RIGHTSIBLING)
    if (rightSibling !== null) {
      secondWalk(rightSibling, yCoor, modsum, spacing)
    }
  }
}

/** 节点属性值 (可能存 TNode 引用或 null). */
function getNode(n: TNode, key: string): TNode | null {
  const v = n.props[key]
  return v === undefined || v === null ? null : v as TNode
}

function parseDirection(v: unknown): Direction {
  if (v === undefined || v === null) return Direction.UNDEFINED
  const s = String(v).toUpperCase()
  if (s === 'UP') return Direction.UP
  if (s === 'LEFT') return Direction.LEFT
  if (s === 'RIGHT') return Direction.RIGHT
  if (s === 'DOWN') return Direction.DOWN
  return Direction.UNDEFINED
}
