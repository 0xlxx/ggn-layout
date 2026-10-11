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
 * spore 几何基础 — ELK core.math.KVector/ElkRectangle + ElkMath + alg.common.utils.Utils
 * 0.12.0 的 TS 移植 (spore 专用, 不依赖 layered LGraph 几何).
 *
 * - KVector 复用 src/force/kvector.ts (Java KVector 语义: clone/add/sub/scale/length/distance),
 *   缺失方法 (negate/scaleToLength/equalsFuzzily) 以独立函数提供.
 * - Rect 对应 ElkRectangle (x/y/width/height + getCenter/getPosition/角点).
 * - fuzzyCompare 对应 com.google.common.math.DoubleMath.fuzzyCompare (epsilon 内视为相等).
 */
import { KVector } from '../force/kvector.js'

/** DoubleMath.fuzzyCompare: a<b → -1, 相等(epsilon 内) → 0, a>b → 1. */
export function fuzzyCompare(a: number, b: number, epsilon: number): number {
  return Math.abs(a - b) <= epsilon ? 0 : a < b ? -1 : 1
}

/** KVector.negate. */
export function negate(v: KVector): KVector {
  v.x = -v.x
  v.y = -v.y
  return v
}

/** KVector.scaleToLength. */
export function scaleToLength(v: KVector, length: number): KVector {
  const l = v.length()
  if (l > 0) v.scale(length / l)
  return v
}

/** KVector.equalsFuzzily (默认 fuzzyness 0.05, Java DEFAULT_FUZZYNESS). */
export function equalsFuzzily(a: KVector, b: KVector, fuzzyness = 0.05): boolean {
  return Math.abs(a.x - b.x) <= fuzzyness && Math.abs(a.y - b.y) <= fuzzyness
}

/** 精确相等 (Java KVector.equals: x == x && y == y) — 作为 Map/Set 键. */
export function vkey(v: KVector): string {
  return `${v.x},${v.y}`
}

/** ElkRectangle (axis-aligned). */
export class Rect {
  x: number
  y: number
  width: number
  height: number

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x
    this.y = y
    this.width = width
    this.height = height
  }

  clone(): Rect {
    return new Rect(this.x, this.y, this.width, this.height)
  }

  /** 左上角坐标. */
  getPosition(): KVector {
    return new KVector(this.x, this.y)
  }

  getTopLeft(): KVector {
    return this.getPosition()
  }

  getTopRight(): KVector {
    return new KVector(this.x + this.width, this.y)
  }

  getBottomLeft(): KVector {
    return new KVector(this.x, this.y + this.height)
  }

  getBottomRight(): KVector {
    return new KVector(this.x + this.width, this.y + this.height)
  }

  getCenter(): KVector {
    return new KVector(this.x + this.width / 2, this.y + this.height / 2)
  }
}

/**
 * Utils.overlap: 两轴对齐矩形中心连线需拉伸多少倍才能恰好相触.
 * 前提: 中心点不同.
 */
export function overlap(r1: Rect, r2: Rect): number {
  const horizontalOverlap = Math.min(Math.abs(r1.x - (r2.x + r2.width)), Math.abs(r1.x + r1.width - r2.x))
  const verticalOverlap = Math.min(Math.abs(r1.y - (r2.y + r2.height)), Math.abs(r1.y + r1.height - r2.y))
  const horizontalCenterDistance = Math.abs(r1.x + r1.width / 2 - (r2.x + r2.width / 2))
  if (horizontalCenterDistance > r1.width / 2 + r2.width / 2) return 1.0
  const verticalCenterDistance = Math.abs(r1.y + r1.height / 2 - (r2.y + r2.height / 2))
  if (verticalCenterDistance > r1.height / 2 + r2.height / 2) return 1.0
  if (horizontalCenterDistance === 0.0 && verticalCenterDistance === 0.0) return 0
  if (horizontalCenterDistance === 0.0) return verticalOverlap / verticalCenterDistance + 1
  if (verticalCenterDistance === 0.0) return horizontalOverlap / horizontalCenterDistance + 1
  return Math.min(horizontalOverlap / horizontalCenterDistance, verticalOverlap / verticalCenterDistance) + 1
}

/** TEdge 的最小几何描述 (仅线段端点, 无相等语义; 见 graph.ts TEdge). */
export interface Seg {
  u: KVector
  v: KVector
}

/** Utils.getRectEdges: 矩形四条边. */
export function getRectEdges(r: Rect): Seg[] {
  return [
    { u: r.getTopLeft(), v: r.getTopRight() },
    { u: r.getTopLeft(), v: r.getBottomLeft() },
    { u: r.getBottomRight(), v: r.getTopRight() },
    { u: r.getBottomRight(), v: r.getBottomLeft() },
  ]
}

/**
 * ElkMath.intersects2: 线段 (p, p+r) 与 (q, q+s) 的交点, 无交点 → null.
 */
export function intersects2(p: KVector, r: KVector, q: KVector, s: KVector): KVector | null {
  const pq = q.clone().sub(p)
  const pqXr = cross(pq, r)
  const rXs = cross(r, s)
  const t = cross(pq, s) / rXs
  const u = pqXr / rXs
  if (rXs === 0) {
    if (pqXr === 0) {
      // 共线: 返回距 s 中点最近的端点 (在 s 范围内)
      const center = q.clone().add(s.clone().scale(0.5))
      const d1 = p.distance(center)
      const d2 = p.clone().add(r).distance(center)
      const l = s.length() * 0.5
      if (d1 < d2 && d1 <= l) return p.clone()
      if (d2 <= l) return p.clone().add(r)
      return null
    }
    return null // 平行
  }
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return p.clone().add(r.clone().scale(t))
  }
  return null
}

/** KVector.crossProduct. */
export function cross(v: KVector, w: KVector): number {
  return v.x * w.y - v.y * w.x
}

/**
 * ElkMath.distance: 线段 (a1,a2) 与 (b1,b2) 沿方向 v 的可达距离.
 * 若 v 方向无法从一线段到达另一线段, 返回 +Infinity.
 */
export function distanceBetweenSegments(a1: KVector, a2: KVector, b1: KVector, b2: KVector, v: KVector): number {
  return Math.min(traceRays(a1, a2, b1, b2, v), traceRays(b1, b2, a1, a2, negate(v.clone())))
}

function traceRays(a1: KVector, a2: KVector, b1: KVector, b2: KVector, v: KVector): number {
  let result = Number.POSITIVE_INFINITY
  let endpointHit = false

  // (b + v) 与 a 相交: 捕获一条射线恰好命中 a 端点而另一条过短的边界情况
  const edgeCaseP = intersects2(a1, a2.clone().sub(a1), b1.clone().add(v), b2.clone().sub(b1))
  const edgeCase = edgeCaseP !== null && !(equalsFuzzily(edgeCaseP, a1) || equalsFuzzily(edgeCaseP, a2))

  // 从 b1 沿 v 追踪射线到 a
  const i1 = intersects2(a1, a2.clone().sub(a1), b1, v)
  if (i1 !== null) {
    if (equalsFuzzily(i1, a1) === equalsFuzzily(i1, a2) || edgeCase) {
      result = Math.min(result, i1.sub(b1).length())
    } else {
      endpointHit = true
    }
  }

  // 从 b2 沿 v 追踪射线到 a
  const i2 = intersects2(a1, a2.clone().sub(a1), b2, v)
  if (i2 !== null) {
    if (endpointHit || equalsFuzzily(i2, a1) === equalsFuzzily(i2, a2) || edgeCase) {
      result = Math.min(result, i2.sub(b2).length())
    }
  }

  return result
}

/** ElkMath.DOUBLE_EQ_EPSILON. */
const DOUBLE_EQ_EPSILON = 0.00001

/**
 * ElkMath.shortestDistance: 两矩形最短距离.
 * 分离 (水平/垂直方向至少一个间隙) → 正值; 相交 → 负的侵入距离; 接触 → 0.
 */
export function shortestDistance(r1: Rect, r2: Rect): number {
  const rightDist = r2.x - (r1.x + r1.width)
  const leftDist = r1.x - (r2.x + r2.width)
  const topDist = r1.y - (r2.y + r2.height)
  const bottomDist = r2.y - (r1.y + r1.height)
  const horzDist = Math.max(leftDist, rightDist)
  const vertDist = Math.max(topDist, bottomDist)
  if (
    (fuzzyCompare(horzDist, 0, DOUBLE_EQ_EPSILON) >= 0)
    !== (fuzzyCompare(vertDist, 0, DOUBLE_EQ_EPSILON) >= 0)
  ) {
    // case 1: 一个方向分离, 另一个相交/接触 → 轴对齐距离
    return Math.max(vertDist, horzDist)
  }
  if (fuzzyCompare(horzDist, 0, DOUBLE_EQ_EPSILON) > 0) {
    // case 2: 两个方向都分离 → 欧氏距离
    return Math.sqrt(vertDist * vertDist + horzDist * horzDist)
  }
  // case 3: 两个方向都侵入/接触 → 负的侵入距离
  return -Math.sqrt(vertDist * vertDist + horzDist * horzDist)
}

/** ElkMath.clipVector: 向量裁剪到 w×h 盒内 (边锚点用, applyPositions). */
export function clipVector(v: KVector, width: number, height: number): KVector {
  const wh = width / 2
  const hh = height / 2
  const absx = Math.abs(v.x)
  const absy = Math.abs(v.y)
  let xscale = 1
  let yscale = 1
  if (absx > wh) xscale = wh / absx
  if (absy > hh) yscale = hh / absy
  v.scale(Math.min(xscale, yscale))
  return v
}
