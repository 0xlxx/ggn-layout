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
 * DepthFirstCompaction — ELK alg.common.spore.DepthFirstCompaction 0.12.0.
 *
 * 深度优先压缩: 先压缩子树, 再把每个子树作为整体沿「父中心 - 子中心」方向
 * 平移, 直到与树内其它节点最小 underlap 为 0 (或正交方向受限).
 */
import { KVector } from '../force/kvector.js'
import { Tree, Node, FUZZINESS } from './graph.js'
import { fuzzyCompare, scaleToLength } from './geometry.js'
import { Rect } from './geometry.js'

/** 执行压缩 (Java DepthFirstCompaction.compact(tree, orthogonal)). */
export function depthFirstCompaction(tree: Tree<Node>, orthogonal: boolean): void {
  compactTree(tree, orthogonal)
}

function compactTree(tree: Tree<Node>, orthogonal: boolean): void {
  // 先压缩当前节点的子树
  for (const child of tree.children) compactTree(child, orthogonal)

  for (const child of tree.children) {
    // 子树需移动的方向与距离 (父中心 - 子中心)
    const compactionVector = tree.node.vertex.clone().sub(child.node.vertex)

    if (orthogonal) {
      const rt = tree.node.rect
      const rc = child.node.rect
      // 限制到较大坐标轴
      if (Math.abs(compactionVector.x) >= Math.abs(compactionVector.y)) {
        compactionVector.y = 0
        // 垂直维度重叠 → 缩放到正交间距
        if (rc.y + rc.height > rt.y && rc.y < rt.y + rt.height) {
          scaleToLength(compactionVector, Math.max(rt.x - (rc.x + rc.width), rc.x - (rt.x + rt.width)))
        }
      } else {
        compactionVector.x = 0
        if (rc.x + rc.width > rt.x && rc.x < rt.x + rt.width) {
          scaleToLength(compactionVector, Math.max(rt.y - (rc.y + rc.height), rc.y - (rt.y + rt.height)))
        }
      }
    } else {
      scaleToLength(compactionVector, tree.node.underlap(child.node))
    }

    // 子树可移动的最大距离 = 最小 underlap
    let minUnderlap = compactionVector.length()

    // 子树内任意节点与树内其余节点在压缩方向的最小 underlap
    minUnderlap = getMinUnderlap(tree, child, minUnderlap, compactionVector)

    scaleToLength(compactionVector, minUnderlap)
    translateSubtree(child, compactionVector)
  }
}

/** 计算 tree 内节点与 child 子树节点的最小距离 (Java getMinUnderlap). */
function getMinUnderlap(tree: Tree<Node>, child: Tree<Node>, currentMinUnderlap: number, compactionVector: KVector): number {
  let minUnderlap = Math.min(
    currentMinUnderlap,
    minUnderlapWithSubtree(tree.node, child, currentMinUnderlap, compactionVector),
  )
  for (const c of tree.children) {
    if (c !== child) {
      minUnderlap = Math.min(minUnderlap, getMinUnderlap(c, child, minUnderlap, compactionVector))
    }
  }
  return minUnderlap
}

/** 节点 r 与子树 tree 的最小距离 (Java minUnderlapWithSubtree). */
function minUnderlapWithSubtree(r: Node, tree: Tree<Node>, currentMinUnderlap: number, compactionVector: KVector): number {
  let minUnderlap = currentMinUnderlap
  for (const child of tree.children) {
    const c = child.node
    if (r.touches(c)) {
      // 已接触: 判断压缩方向是否会把它们推向彼此
      if (
        (fuzzyCompare(c.rect.x, r.rect.x + r.rect.width, FUZZINESS) === 0 && compactionVector.x < 0)
        || (fuzzyCompare(c.rect.x + c.rect.width, r.rect.x, FUZZINESS) === 0 && compactionVector.x > 0)
        || (fuzzyCompare(c.rect.y, r.rect.y + r.rect.height, FUZZINESS) === 0 && compactionVector.y < 0)
        || (fuzzyCompare(c.rect.y + c.rect.height, r.rect.y, FUZZINESS) === 0 && compactionVector.y > 0)
      ) {
        minUnderlap = 0
        break
      }
    } else {
      minUnderlap = Math.min(minUnderlap, r.distance(c, compactionVector))
    }
    minUnderlap = Math.min(minUnderlap, minUnderlapWithSubtree(r, child, minUnderlap, compactionVector))
  }
  return minUnderlap
}

/** 平移整棵子树 (Java translateSubtree). */
function translateSubtree(tree: Tree<Node>, compactionVector: KVector): void {
  tree.node.translate(compactionVector)
  for (const c of tree.children) translateSubtree(c, compactionVector)
}

export type { Rect }
