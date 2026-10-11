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
 * RectilinearConvexHull (对应 ELK compaction.recthull.RectilinearConvexHull).
 * 四点式 rectilinear 凸包: 四条 staircase (Q1..Q4), scanline 找凸角 + 补凹角.
 */
import { Point, Quadrant } from './point.js'
import { scanlineExecute, type EventHandler } from './scanline.js'

export interface ElkRectangle {
  x: number
  y: number
  width: number
  height: number
}

const RIGHT_LOW_FIRST = (p1: Point, p2: Point): number => {
  if (p1.x === p2.x) return p1.y - p2.y
  return p1.x - p2.x
}
const RIGHT_HIGH_FIRST = (p1: Point, p2: Point): number => {
  if (p1.x === p2.x) return p2.y - p1.y
  return p1.x - p2.x
}
const LEFT_LOW_FIRST = (p1: Point, p2: Point): number => {
  if (p1.x === p2.x) return p1.y - p2.y
  return p2.x - p1.x
}
const LEFT_HIGH_FIRST = (p1: Point, p2: Point): number => {
  if (p1.x === p2.x) return p2.y - p1.y
  return p2.x - p1.x
}

/** Q1/Q4 同 x 时: Q1,Q4 < Q2,Q3; Q1,Q2 凹角在凸角前. */
const RIGHT_SPECIAL_ORDER = (p1: Point, p2: Point): number => {
  if (p1.x === p2.x) {
    if (p1.quadrant === p2.quadrant || Quadrant.isBothLeftOrBothRight(p1.quadrant!, p2.quadrant!)) {
      const val = Quadrant.isLeft(p1.quadrant!) ? 1 : -1
      if (p1.convex && !p2.convex) return val
      if (!p1.convex && p2.convex) return -val
    }
    return QuadrantOrdinal[p1.quadrant!] - QuadrantOrdinal[p2.quadrant!]
  }
  return p1.x - p2.x
}

const QuadrantOrdinal: Record<Quadrant, number> = { [Quadrant.Q1]: 0, [Quadrant.Q4]: 1, [Quadrant.Q2]: 2, [Quadrant.Q3]: 3 }

/** 找一条 staircase 的凸角: 按象限方向扫面, y 超过当前 maximalY 的点入列. */
class MaximalElementsEventHandler implements EventHandler<Point> {
  points: Point[] = []
  private maximalY: number
  private readonly compare: (a: number, b: number) => number

  constructor(private readonly quadrant: Quadrant) {
    if (quadrant === Quadrant.Q1 || quadrant === Quadrant.Q2) {
      this.compare = (a, b) => b - a
      this.maximalY = Number.POSITIVE_INFINITY
    } else {
      this.compare = (a, b) => a - b
      this.maximalY = Number.NEGATIVE_INFINITY
    }
  }

  handle(p: Point): void {
    if (this.compare(p.y, this.maximalY) > 0) {
      this.points.push(new Point(p.x, p.y, this.quadrant))
      this.maximalY = p.y
    }
  }
}

/** 找竖直段并生成矩形. */
class RectangleEventHandler implements EventHandler<Point> {
  rects: ElkRectangle[] = []
  private minY: Point | null = null
  private maxY: Point | null = null
  private lastX: number
  queued: ElkRectangle | null = null
  private queuedPnt: Point | null = null

  constructor(xMin1: Point | null, xMin2: Point | null) {
    this.lastX = Math.min(xMin1?.x ?? 0, xMin2?.x ?? 0)
  }

  handle(p: Point): void {
    if (this.queued !== null && (p.x !== this.queuedPnt!.x || Quadrant.isOneLeftOneRight(this.queuedPnt!.quadrant!, p.quadrant!))) {
      this.rects.push(this.queued)
      this.lastX = this.queued.x + this.queued.width
      this.queued = null
      this.queuedPnt = null
    }

    if (Quadrant.isUpper(p.quadrant!)) this.minY = p
    else this.maxY = p

    if ((p.quadrant === Quadrant.Q1 && !p.convex) || (p.quadrant === Quadrant.Q2 && p.convex)
      || (p.quadrant === Quadrant.Q3 && p.convex) || (p.quadrant === Quadrant.Q4 && !p.convex)) {
      if (this.minY !== null && this.maxY !== null) {
        const r: ElkRectangle = { x: this.lastX, y: this.minY.y, width: p.x - this.lastX, height: this.maxY.y - this.minY.y }
        this.queued = r
        this.queuedPnt = p
      }
    }
  }
}

export class RectilinearConvexHull {
  private readonly hull: Point[] = []
  private xMax1: Point | null = null
  private xMax2: Point | null = null
  private xMin1: Point | null = null
  private xMin2: Point | null = null
  private yMax1: Point | null = null
  private yMax2: Point | null = null
  private yMin1: Point | null = null
  private yMin2: Point | null = null

  static of(points: Iterable<Point>): RectilinearConvexHull {
    const rch = new RectilinearConvexHull()
    for (const p of points) {
      if (rch.xMax1 === null || p.x >= rch.xMax1.x) { rch.xMax2 = rch.xMax1; rch.xMax1 = p }
      if (rch.xMin1 === null || p.x <= rch.xMin1.x) { rch.xMin2 = rch.xMin1; rch.xMin1 = p }
      if (rch.yMax1 === null || p.y >= rch.yMax1.y) { rch.yMax2 = rch.yMax1; rch.yMax1 = p }
      if (rch.yMin1 === null || p.y <= rch.yMin1.y) { rch.yMin2 = rch.yMin1; rch.yMin1 = p }
    }

    const q1 = new MaximalElementsEventHandler(Quadrant.Q1)
    scanlineExecute(points, RIGHT_LOW_FIRST, q1)
    const q4 = new MaximalElementsEventHandler(Quadrant.Q4)
    scanlineExecute(points, RIGHT_HIGH_FIRST, q4)
    const q2 = new MaximalElementsEventHandler(Quadrant.Q2)
    scanlineExecute(points, LEFT_LOW_FIRST, q2)
    const q3 = new MaximalElementsEventHandler(Quadrant.Q3)
    scanlineExecute(points, LEFT_HIGH_FIRST, q3)

    addConcaveCorners(q1.points, Quadrant.Q1)
    addConcaveCorners(q2.points, Quadrant.Q2)
    addConcaveCorners(q3.points, Quadrant.Q3)
    addConcaveCorners(q4.points, Quadrant.Q4)

    rch.hull.length = 0
    rch.hull.push(...q1.points, ...[...q2.points].reverse(), ...q3.points, ...[...q4.points].reverse())
    return rch
  }

  getHull(): Point[] {
    return this.hull
  }

  splitIntoRectangles(): ElkRectangle[] {
    const handler = new RectangleEventHandler(this.xMin1, this.xMin2)
    scanlineExecute(this.hull, RIGHT_SPECIAL_ORDER, handler)
    if (handler.queued !== null) handler.rects.push(handler.queued)
    return handler.rects
  }
}

function addConcaveCorners(pts: Point[], q: Quadrant): void {
  const out: Point[] = []
  let last = pts[0]!
  out.push(last)
  for (let i = 1; i < pts.length; i++) {
    const next = pts[i]!
    const p = new Point(next.x, last.y, q)
    p.convex = false
    out.push(p, next)
    last = next
  }
  pts.length = 0
  pts.push(...out)
}
