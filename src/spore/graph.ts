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
 * spore 图结构 — ELK alg.common.TEdge/Tree + alg.common.spore.Node + alg.spore.graph.Graph 0.12.0.
 *
 * - TEdge: 无向边 (两个 KVector 端点), 相等与端点顺序无关 (Java TEdge.equals/hashCode).
 * - Tree<T>: 通用树.
 * - Node: 矩形 + 中心点 (originalVertex 恒等于创建时中心, vertex 可平移, rect 随之).
 * - Graph: vertices/tEdges/tree + 策略 (treeConstruction/compaction/costFunction/root).
 */
import { KVector } from '../force/kvector.js'
import { Rect, overlap, fuzzyCompare, distanceBetweenSegments, getRectEdges, vkey } from './geometry.js'
import type { Seg } from './geometry.js'
import { kvectorJavaHash } from './java-hash-set.js'
import type { JavaHashable } from './java-hash-set.js'
import type { JavaHashSet } from './java-hash-set.js'

/** spore InternalProperties.FUZZINESS. */
export const FUZZINESS = 0.0001

/** TEdge: 无向边, 端点 u/v 为 KVector (Java TEdge, 相等与方向无关). */
export class TEdge implements JavaHashable {
  u: KVector
  v: KVector

  constructor(u: KVector, v: KVector) {
    this.u = u
    this.v = v
  }

  /** 无向规范键 (端点精确相等, Java TEdge.equals 语义). */
  key(): string {
    const ku = vkey(this.u)
    const kv = vkey(this.v)
    return ku <= kv ? `${ku}|${kv}` : `${kv}|${ku}`
  }

  /** 是否包含顶点 w (精确相等). */
  contains(w: KVector): boolean {
    return (this.u.x === w.x && this.u.y === w.y) || (this.v.x === w.x && this.v.y === w.y)
  }

  /** Java TEdge.hashCode = KVector.hashCode(u) + KVector.hashCode(v) (int 溢出). */
  javaHash(): number {
    return (kvectorJavaHash(this.u.x, this.u.y) + kvectorJavaHash(this.v.x, this.v.y)) | 0
  }

  /** Java TEdge.equals: 端点相同 (方向无关), 精确 double 相等. */
  javaEquals(other: unknown): boolean {
    if (!(other instanceof TEdge)) return false
    const o = other
    return (
      (this.u.x === o.u.x && this.u.y === o.u.y && this.v.x === o.v.x && this.v.y === o.v.y)
      || (this.u.x === o.v.x && this.u.y === o.v.y && this.v.x === o.u.x && this.v.y === o.u.y)
    )
  }
}

/** 通用树 (Java Tree<T>). */
export class Tree<T> {
  node: T
  children: Tree<T>[]

  constructor(node: T) {
    this.node = node
    this.children = []
  }
}

/** spore Node: 矩形 + 中心点. */
export class Node {
  /** 创建时的中心点, 用于与源元素匹配 (迭代中更新为当前 rect 中心). */
  originalVertex: KVector
  /** 可平移的中心点. */
  vertex: KVector
  /** 节点包围盒 (含 spacing 与 margin). */
  rect: Rect

  constructor(v: KVector, r: Rect) {
    this.originalVertex = v
    this.vertex = v.clone()
    this.rect = r.clone()
  }

  /** 按向量平移矩形与中心点 (Java Node.translate). */
  translate(v: KVector): void {
    this.vertex.add(v)
    this.rect.x += v.x
    this.rect.y += v.y
  }

  /** 设置新的中心点 (平移保持矩形一致). */
  setCenterPosition(p: KVector): void {
    this.translate(p.clone().sub(this.vertex))
  }

  /**
   * 与另一节点的 underlap: 沿中心连线两节点可相互靠近而不碰撞的距离.
   * (Java Node.underlap)
   */
  underlap(other: Node): number {
    const horizontalCenterDistance = Math.abs(this.rect.getCenter().x - other.rect.getCenter().x)
    const verticalCenterDistance = Math.abs(this.rect.getCenter().y - other.rect.getCenter().y)
    let horizontalUnderlap = 0
    let verticalUnderlap = 0
    let hScale = 1
    let vScale = 1
    if (horizontalCenterDistance > this.rect.width / 2 + other.rect.width / 2) {
      horizontalUnderlap = Math.min(
        Math.abs(this.rect.x - (other.rect.x + other.rect.width)),
        Math.abs(this.rect.x + this.rect.width - other.rect.x),
      )
      hScale = 1 - horizontalUnderlap / horizontalCenterDistance
    }
    if (verticalCenterDistance > this.rect.height / 2 + other.rect.height / 2) {
      verticalUnderlap = Math.min(
        Math.abs(this.rect.y - (other.rect.y + other.rect.height)),
        Math.abs(this.rect.y + this.rect.height - other.rect.y),
      )
      vScale = 1 - verticalUnderlap / verticalCenterDistance
    }
    const scale = Math.min(hScale, vScale)
    return (1 - scale) * Math.sqrt(horizontalCenterDistance * horizontalCenterDistance + verticalCenterDistance * verticalCenterDistance)
  }

  /**
   * 沿方向 v 移动 other 而不与本节点碰撞的最大距离 (Java Node.distance).
   */
  distance(other: Node, v: KVector): number {
    let result = Number.POSITIVE_INFINITY
    for (const e1 of getRectEdges(this.rect)) {
      for (const e2 of getRectEdges(other.rect)) {
        const d = distanceBetweenSegments(e1.u, e1.v, e2.u, e2.v, v)
        result = Math.min(result, d)
      }
    }
    return result
  }

  /** 两节点是否接触 (含重叠, fuzzy 比较). */
  touches(other: Node): boolean {
    return (
      fuzzyCompare(this.rect.x, other.rect.x + other.rect.width, FUZZINESS) <= 0
      && fuzzyCompare(other.rect.x, this.rect.x + this.rect.width, FUZZINESS) <= 0
      && fuzzyCompare(this.rect.y, other.rect.y + other.rect.height, FUZZINESS) <= 0
      && fuzzyCompare(other.rect.y, this.rect.y + this.rect.height, FUZZINESS) <= 0
    )
  }
}

/** 生成树代价函数 (Java ICostFunction). */
export type CostFunction = (edge: TEdge) => number

/** spore 策略枚举. */
export enum TreeConstructionStrategy {
  MINIMUM_SPANNING_TREE = 'MINIMUM_SPANNING_TREE',
  MAXIMUM_SPANNING_TREE = 'MAXIMUM_SPANNING_TREE',
}

export enum CompactionStrategy {
  DEPTH_FIRST = 'DEPTH_FIRST',
}

/** spore Graph. */
export class Graph {
  vertices: Node[] = []
  tEdges: JavaHashSet<TEdge> | null = null
  treeConstructionStrategy: TreeConstructionStrategy
  tree: Tree<Node> | null = null
  compactionStrategy: CompactionStrategy
  costFunction: CostFunction
  preferredRoot: Node | null = null
  orthogonalCompaction = false
  /** GrowTreePhase 置位: 是否存在需要消除的重叠 (对应 InternalProperties.OVERLAPS_EXISTED). */
  overlapsExisted = true

  constructor(costFun: CostFunction, treeStrategy: TreeConstructionStrategy, compStrategy: CompactionStrategy) {
    this.costFunction = costFun
    this.treeConstructionStrategy = treeStrategy
    this.compactionStrategy = compStrategy
  }
}

/** 调试辅助 (对应 Utils.overlap 的外部使用 — GrowTreePhase 直接用 geometry.overlap). */
export { overlap }
export type { Seg }
