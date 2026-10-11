/**
 * VerticalSegment (对应 ELK intermediate.compaction.VerticalSegment).
 * 正交/样条路由中的垂直段: 压缩时作为 CNode 参与, 把弯点/包围盒随节点一起平移.
 */
import type { LEdge } from '../../graph/ledge.js'
import type { LPort } from '../../graph/lport.js'
import type { CNode } from './cnode.js'
import { Quadruplet } from './quadruplet.js'
import { CompareFuzzy } from './compare-fuzzy.js'

export interface RectangleLike {
  x: number
  y: number
  width: number
  height: number
}

/** 可被平移的点 (弯点/包围盒/交点). */
export interface PointLike {
  x: number
  y: number
}

export class VerticalSegment {
  /** 可能成为该段 CNode 的父 group 的节点. */
  potentialGroupParents: CNode[] = []
  /** 组成该段 (至少部分) 的边. */
  representedLEdges: LEdge[] = []
  /** 位于该段 hitbox 内的弯点. */
  affectedBends: PointLike[] = []
  /** 压缩后需调整的包围盒 (如 spline). */
  affectedBoundingBoxes: RectangleLike[] = []
  /** 该段占用的区域. */
  hitbox: RectangleLike = { x: 0, y: 0, width: 0, height: 0 }
  /** 原始边在弯点之间的 junction points. */
  junctionPoints: PointLike[] = []
  /** 特定侧忽略间距. */
  ignoreSpacing = new Quadruplet()
  /** 预计算约束 (段链先后). */
  constraints: VerticalSegment[] = []
  /** 正交边从 N/S 端口出入的端口. */
  aPort: LPort | null = null
  /** 与本段合并的段. */
  joined: VerticalSegment[] = []

  constructor(bend1: PointLike, bend2: PointLike, cNode: CNode | null, lEdge: LEdge) {
    this.affectedBends.push(bend1)
    this.affectedBends.push(bend2)
    this.hitbox.x = Math.min(bend1.x, bend2.x)
    this.hitbox.y = Math.min(bend1.y, bend2.y)
    this.hitbox.width = Math.abs(bend1.x - bend2.x)
    this.hitbox.height = Math.abs(bend1.y - bend2.y)
    if (cNode !== null) this.potentialGroupParents.push(cNode)  // ELK:111
    this.representedLEdges.push(lEdge)
  }

  /** 合并另一个段 (该段不变). */
  joinWith(other: VerticalSegment): this {
    this.representedLEdges.push(...other.representedLEdges)
    this.affectedBends.push(...other.affectedBends)
    this.affectedBoundingBoxes.push(...other.affectedBoundingBoxes)
    this.junctionPoints.push(...other.junctionPoints)
    this.constraints.push(...other.constraints)
    this.potentialGroupParents.push(...other.potentialGroupParents)

    const newX = Math.min(this.hitbox.x, other.hitbox.x)
    const newY = Math.min(this.hitbox.y, other.hitbox.y)
    const maxX = Math.max(this.hitbox.x + this.hitbox.width, other.hitbox.x + other.hitbox.width)
    const maxY = Math.max(this.hitbox.y + this.hitbox.height, other.hitbox.y + other.hitbox.height)
    this.hitbox = { x: newX, y: newY, width: maxX - newX, height: maxY - newY }

    this.ignoreSpacing.applyOr(other.ignoreSpacing)
    if (this.aPort === null) this.aPort = other.aPort
    this.joined.push(...other.joined)
    this.joined.push(other)
    return this
  }

  /** 是否与另一段相交 (同 x 且 y 区间重叠). */
  intersects(other: VerticalSegment): boolean {
    return CompareFuzzy.eq(this.hitbox.x, other.hitbox.x)
      && !(CompareFuzzy.lt(this.hitbox.y + this.hitbox.height, other.hitbox.y)
        || CompareFuzzy.lt(other.hitbox.y + other.hitbox.height, this.hitbox.y))
  }

  /** 排序: 先按 x, 再按 y. */
  compareTo(other: VerticalSegment): number {
    const d = CompareFuzzy.eq(this.hitbox.x, other.hitbox.x) ? 0 : (this.hitbox.x < other.hitbox.x ? -1 : 1)
    if (d === 0) return this.hitbox.y - other.hitbox.y
    return d
  }
}
