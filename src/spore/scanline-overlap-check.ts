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
 * ScanlineOverlapCheck — ELK alg.common.spore.ScanlineOverlapCheck 0.12.0.
 *
 * 扫描线检测重叠: 所有节点上下边界按 y 排序 (low 先于 high), 维护按 x 排序的
 * 活跃区间集合; 节点插入时与集合内所有区间比较 x 方向重叠 → 调 overlapHandler.
 * 返回无向重叠边集合 (端点用 originalVertex 标识, Java TEdge 语义).
 */
import { KVector } from '../force/kvector.js'
import { fuzzyCompare } from './geometry.js'
import { FUZZINESS, Node, TEdge } from './graph.js'
import { JavaHashSet } from './java-hash-set.js'

/** 重叠回调 (Java IOverlapHandler). */
export type OverlapHandler = (n1: Node, n2: Node) => void

/** 扫描线时间戳: 节点上边界 (low=true) 或下边界 (low=false). */
interface Timestamp {
  node: Node
  low: boolean
}

/** 时间戳排序: y 坐标 (下边界 = rect.y + height), 相等时 low 先. */
function compareTimestamps(p1: Timestamp, p2: Timestamp): number {
  const y1 = p1.low ? p1.node.rect.y : p1.node.rect.y + p1.node.rect.height
  const y2 = p2.low ? p2.node.rect.y : p2.node.rect.y + p2.node.rect.height
  const cmp = y1 < y2 ? -1 : y1 > y2 ? 1 : 0
  if (cmp === 0) {
    if (!p1.low && p2.low) return -1
    if (!p2.low && p1.low) return 1
  }
  return cmp
}

/** 活跃区间排序: 左边界 x, 再 originalVertex.x, 再 originalVertex.y (唯一). */
function compareNodesLeft(n1: Node, n2: Node): number {
  const c = n1.rect.x < n2.rect.x ? -1 : n1.rect.x > n2.rect.x ? 1 : 0
  if (c !== 0) return c
  const cx = n1.originalVertex.x < n2.originalVertex.x ? -1 : n1.originalVertex.x > n2.originalVertex.x ? 1 : 0
  if (cx !== 0) return cx
  const cy = n1.originalVertex.y < n2.originalVertex.y ? -1 : n1.originalVertex.y > n2.originalVertex.y ? 1 : 0
  return cy
}

/** x 方向重叠检测 (Java ScanlineOverlapCheck.overlap, 仅 x 轴). */
function xOverlap(n1: Node, n2: Node): boolean {
  if (n1 === n2) return false
  return (
    fuzzyCompare(n1.rect.x, n2.rect.x + n2.rect.width, FUZZINESS) < 0
    && fuzzyCompare(n2.rect.x, n1.rect.x + n1.rect.width, FUZZINESS) < 0
  )
}

/**
 * 执行一次扫描线重叠检测.
 * @param nodes 待检测节点
 * @param handler 对每个重叠对回调 (Java IOverlapHandler)
 */
export function sweepOverlaps(nodes: Node[], handler: OverlapHandler): void {
  const points: Timestamp[] = []
  for (const n of nodes) {
    points.push({ node: n, low: true })
    points.push({ node: n, low: false })
  }
  points.sort(compareTimestamps)

  // 活跃区间 (有序数组, 模拟 Java TreeSet 迭代语义)
  const active: Node[] = []
  const findInsert = (n: Node): number => {
    let lo = 0
    let hi = active.length
    while (lo < hi) {
      const mid = (lo + hi) >>> 1
      if (compareNodesLeft(active[mid]!, n) < 0) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  for (const p of points) {
    if (p.low) {
      const idx = findInsert(p.node)
      if (active[idx] !== undefined && compareNodesLeft(active[idx]!, p.node) === 0) {
        throw new Error('Invalid hitboxes for scanline overlap calculation.')
      }
      active.splice(idx, 0, p.node)
      // 与当前活跃区间比较 x 重叠 (Java: 从最左开始; 遇首个不重叠且已发现重叠则停止)
      let overlapsFound = false
      for (const other of active) {
        if (xOverlap(p.node, other)) {
          handler(p.node, other)
          overlapsFound = true
        } else {
          if (overlapsFound) break
        }
      }
    } else {
      const idx = active.findIndex((n) => n === p.node)
      if (idx !== -1) active.splice(idx, 1)
    }
  }
}

/** 便捷封装: 返回无向重叠边集合 (Java OverlapRemovalLayoutProvider overlapHandler → HashSet<TEdge>). */
export function findOverlapEdges(nodes: Node[]): JavaHashSet<TEdge> {
  const edges = new JavaHashSet<TEdge>()
  const handler: OverlapHandler = (n1, n2) => {
    edges.add(new TEdge(n1.originalVertex, n2.originalVertex))
  }
  sweepOverlaps(nodes, handler)
  return edges
}

export type { KVector }
