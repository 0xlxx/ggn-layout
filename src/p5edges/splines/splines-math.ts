/**
 * SplinesMath + ElkMath 子集 — FinalSplineBendpointsCalculator 依赖的数学工具.
 * (ELK SplinesMath.portSideToDirection / ElkMath.intersects|contains|approximateBezierSegment).
 */
import { PortSide } from '../../graph/enums.js'
import type { KVector } from '../../graph/enums.js'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const HALF_PI = Math.PI / 2
const DOUBLE_EQ_EPSILON = 0.00001

export function portSideToDirection(side: PortSide): number {
  switch (side) {
    case PortSide.NORTH: return 3 * HALF_PI
    case PortSide.EAST: return 0.0
    case PortSide.SOUTH: return HALF_PI
    case PortSide.WEST: return Math.PI
    default: return 0.0
  }
}

function fuzzyEquals(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance
}
function fuzzyCompare(a: number, b: number, tolerance: number): number {
  if (a < b - tolerance) return -1
  if (a > b + tolerance) return 1
  return 0
}

/** ElkMath.contains(rect, p): 点在矩形内 (边界不算). */
export function containsRectPoint(rect: Rect, p: KVector): boolean {
  const minX = rect.x
  const maxX = rect.x + rect.width
  const minY = rect.y
  const maxY = rect.y + rect.height
  return p.x > minX && p.x < maxX && p.y > minY && p.y < maxY
}

/** ElkMath.contains(rect, p1, p2): 线段两端都在矩形内. */
export function containsRectLine(rect: Rect, p1: KVector, p2: KVector): boolean {
  return containsRectPoint(rect, p1) && containsRectPoint(rect, p2)
}

/** ElkMath.intersects(l11,l12,l21,l22): 两线段相交 (端点触碰不算). */
export function intersectsLines(l11: KVector, l12: KVector, l21: KVector, l22: KVector): boolean {
  const u0 = l11
  const v0 = { x: l12.x - l11.x, y: l12.y - l11.y }
  const u1 = l21
  const v1 = { x: l22.x - l21.x, y: l22.y - l21.y }
  const x00 = u0.x, y00 = u0.y
  const x10 = u1.x, y10 = u1.y
  const x01 = v0.x, y01 = v0.y
  const x11 = v1.x, y11 = v1.y
  const d = x11 * y01 - x01 * y11
  if (fuzzyEquals(0, d, DOUBLE_EQ_EPSILON)) return false
  const s = (1 / d) * ((x00 - x10) * y01 - (y00 - y10) * x01)
  const t = (1 / d) * -(-(x00 - x10) * y11 + (y00 - y10) * x11)
  return fuzzyCompare(0, s, DOUBLE_EQ_EPSILON) < 0
    && fuzzyCompare(s, 1, DOUBLE_EQ_EPSILON) < 0
    && fuzzyCompare(0, t, DOUBLE_EQ_EPSILON) < 0
    && fuzzyCompare(t, 1, DOUBLE_EQ_EPSILON) < 0
}

/** ElkMath.intersects(rect, p1, p2): 线段与矩形相交 (含一端在矩形内). */
export function intersectsRectLine(rect: Rect, p1: KVector, p2: KVector): boolean {
  if (containsRectLine(rect, p1, p2)) return false
  const tl = { x: rect.x, y: rect.y }
  const tr = { x: rect.x + rect.width, y: rect.y }
  const br = { x: rect.x + rect.width, y: rect.y + rect.height }
  const bl = { x: rect.x, y: rect.y + rect.height }
  return intersectsLines(tl, tr, p1, p2)
    || intersectsLines(tr, br, p1, p2)
    || intersectsLines(br, bl, p1, p2)
    || intersectsLines(bl, tl, p1, p2)
}

/** ElkMath.getPointOnBezierSegment: 伯恩斯坦求值. */
export function getPointOnBezierSegment(t: number, controlPoints: KVector[]): KVector {
  const n = controlPoints.length - 1
  let px = 0
  let py = 0
  for (let j = 0; j <= n; j++) {
    const p = controlPoints[j]!
    const factor = binomial(n, j) * Math.pow(1 - t, n - j) * Math.pow(t, j)
    px += p.x * factor
    py += p.y * factor
  }
  return { x: px, y: py }
}

function binomial(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  let result = 1
  for (let i = 1; i <= k; i++) {
    result = result * (n - k + i) / i
  }
  return result
}

/** ElkMath.approximateBezierSegment(resultSize, cps...): 均匀采样曲线 (含终点不含起点). */
export function approximateBezierSegment(resultSize: number, controlPoints: KVector[]): KVector[] {
  if (resultSize <= 0) return []
  const result: KVector[] = []
  const dt = 1.0 / resultSize
  let t = 0
  for (let i = 0; i < resultSize; i++) {
    t += dt
    result.push(getPointOnBezierSegment(t, controlPoints))
  }
  return result
}
