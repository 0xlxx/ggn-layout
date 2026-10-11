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
 * mrtree NodeOrderer — ELK alg.mrtree.p2order.NodeOrderer 0.12.0.
 * 节点排序: FAN/DESCENDANTS → orderLevelFanDescendants (内节点先, 叶子填充);
 * CONSTRAINT → orderLevelConstraint (positionConstraint 放置).
 * MODEL_ORDER 不改变顺序.
 */
import { TGraph, TNode, TEdge, P_ROOT, P_FAN, P_DESCENDANTS, P_POSITION, getBool, getInt, setProp } from '../graph.js'
import { WEIGHTING, POSITION_CONSTRAINT, OrderWeighting } from '../options.js'

export function nodeOrderer(tGraph: TGraph): void {
  // find the root node
  const root = tGraph.getNodes().find((x) => getBool(x, P_ROOT, false))
  if (root === undefined) return

  // call the right orderLevel on the first level, which is the root
  const weighting = tGraph.props[WEIGHTING] as string | undefined
  if (weighting === OrderWeighting.FAN || weighting === OrderWeighting.DESCENDANTS) {
    orderLevelFanDescendants([root], weighting)
  } else if (weighting === OrderWeighting.CONSTRAINT) {
    orderLevelConstraint([root])
  }
}

function orderLevelFanDescendants(currentLevel: TNode[], weighting: string | undefined): void {
  const sortProperty = weighting === OrderWeighting.DESCENDANTS ? P_DESCENDANTS : P_FAN
  let pos = 0
  // sort all nodes in this level by their fan out
  // so the leaves are at the end of the list
  const level = [...currentLevel]
  level.sort((a, b) => getInt(a, sortProperty, 0) - getInt(b, sortProperty, 0))
  // find the first occurrence of a leave in the list
  let firstOcc = level.length
  let notNull = true
  for (let k = level.length - 1; k >= 0 && notNull; k--) {
    const tNode = level[k]
    if (getInt(tNode, sortProperty, 0) === 0) {
      firstOcc--
    } else {
      notNull = false
    }
  }
  // Separate the level into leaves and inner nodes
  const inners = level.slice(0, firstOcc)
  const leaves = level.slice(firstOcc)
  // check if their are inner nodes left
  if (inners.length === 0) {
    // leave the leaves in their order
    for (const tENode of leaves) {
      setProp(tENode, P_POSITION, pos++)
    }
  } else {
    // order each level of descendants of the inner nodes
    for (const tPNode of inners) {
      setProp(tPNode, P_POSITION, pos++)
      // set the position of the children and set them in order
      const children = tPNode.getChildrenCopy()
      orderLevelFanDescendants(children, weighting)
      // order the children by their reverse position
      children.sort((a, b) => getInt(b, P_POSITION, 0) - getInt(a, P_POSITION, 0))
      // reset the list of children with the new order
      const sortedOutEdges: TEdge[] = []
      for (const tNode of children) {
        for (const tEdge of tPNode.getOutgoingEdges()) {
          if (tEdge.getTarget() === tNode) {
            sortedOutEdges.push(tEdge)
          }
        }
      }
      tPNode.getOutgoingEdges().splice(0)
      tPNode.getOutgoingEdges().push(...sortedOutEdges)
      // fill gaps with leafs
      let fillGap = tPNode.getOutgoingEdges().length
      notNull = true
      for (let k = leaves.length - 1; 0 < fillGap && notNull && k >= 0; k--) {
        const tNode = leaves[k]
        if (getInt(tNode, sortProperty, 0) === 0) {
          setProp(tNode, P_POSITION, pos++)
          fillGap--
          leaves.splice(k, 1)
        } else {
          notNull = false
        }
      }
    }
  }
}

function orderLevelConstraint(currentLevel: TNode[]): void {
  const undefinedNodes = currentLevel.filter((x) => getInt(x, POSITION_CONSTRAINT, -1) < 0)
  const inBoundNodes = currentLevel.filter(
    (x) => getInt(x, POSITION_CONSTRAINT, -1) < currentLevel.length && getInt(x, POSITION_CONSTRAINT, -1) >= 0,
  )
  const outOfBoundNodes = currentLevel.filter((x) => getInt(x, POSITION_CONSTRAINT, -1) >= currentLevel.length)
  const sortedNodes: (TNode | undefined)[] = new Array<TNode | undefined>(currentLevel.length).fill(undefined)
  // Priority 1: Set non duplicate constraints
  for (let i = 0; i < inBoundNodes.length; i++) {
    const curNode = inBoundNodes[i]
    const targetPos = getInt(curNode, POSITION_CONSTRAINT, -1)
    if (targetPos >= 0 && targetPos < inBoundNodes.length && sortedNodes[targetPos] === undefined) {
      sortedNodes[targetPos] = curNode
      inBoundNodes.splice(i, 1)
      i--
    }
  }
  // Priority 2: Set duplicate constraints
  for (let i = 0; i < inBoundNodes.length; i++) {
    const curNode = inBoundNodes[i]
    const targetPos = getInt(curNode, POSITION_CONSTRAINT, -1)
    for (let j = 0; ; j++) {
      let newTargetPos = targetPos + j
      if (newTargetPos < sortedNodes.length && newTargetPos >= 0 && sortedNodes[newTargetPos] === undefined) {
        sortedNodes[newTargetPos] = curNode
        inBoundNodes.splice(i, 1)
        i--
        break
      }
      newTargetPos = targetPos - j
      if (newTargetPos < sortedNodes.length && newTargetPos >= 0 && sortedNodes[newTargetPos] === undefined) {
        sortedNodes[newTargetPos] = curNode
        inBoundNodes.splice(i, 1)
        i--
        break
      }
    }
  }
  // Priority 3: Set out of bounds constraints
  outOfBoundNodes.sort((x, y) => -compareInt(getInt(x, POSITION_CONSTRAINT, -1), getInt(y, POSITION_CONSTRAINT, -1)))
  for (let i = sortedNodes.length - 1; i >= 0; i--) {
    if (sortedNodes[i] === undefined && outOfBoundNodes.length > 0) {
      sortedNodes[i] = outOfBoundNodes.shift()
    }
  }
  // Priority 4: Set no constraint nodes
  for (let i = 0; i < sortedNodes.length; i++) {
    if (sortedNodes[i] === undefined && undefinedNodes.length > 0) {
      sortedNodes[i] = undefinedNodes.shift()
    }
  }
  // Set final node positions
  for (let i = 0; i < sortedNodes.length; i++) {
    setProp(sortedNodes[i] as TNode, P_POSITION, i)
  }
  // Recursive calls, apply node positions
  const inners = currentLevel.filter((x) => getInt(x, P_FAN, 0) !== 0)
  for (const tPNode of inners) {
    // Recursive call
    const children = tPNode.getChildrenCopy()
    orderLevelConstraint(children)
    // Order the children by their position
    children.sort((a, b) => getInt(a, P_POSITION, 0) - getInt(b, P_POSITION, 0))
    // Reset the list of children with the new order
    const sortedOutEdges: TEdge[] = []
    for (const tNode of children) {
      for (const tEdge of tPNode.getOutgoingEdges()) {
        if (tEdge.getTarget() === tNode) {
          sortedOutEdges.push(tEdge)
        }
      }
    }
    tPNode.getOutgoingEdges().splice(0)
    tPNode.getOutgoingEdges().push(...sortedOutEdges)
  }
}

function compareInt(a: number, b: number): number {
  return a < b ? -1 : a > b ? 1 : 0
}
