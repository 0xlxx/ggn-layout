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
 * disco 几何基础 — ELK core.math (KVectorChain/ElkRectangle/ElkMath) + core.util (Pair/Quadruple)
 * + alg.common.utils.UniqueTriple 的 TS 移植 (0.12.0, 1:1 对齐).
 *
 * - KVector 复用 src/force/kvector.ts (clone/add/sub/scale Java 语义).
 * - Rect 对应 ElkRectangle (x/y/width/height, 角点).
 * - intersects/contains 对应 ElkMath.intersects/contains (DOUBLE_EQ_EPSILON = 1e-5).
 */
import { KVector } from '../force/kvector.js'

/** ElkMath.DOUBLE_EQ_EPSILON. */
export const DOUBLE_EQ_EPSILON = 0.00001

/** DoubleMath.fuzzyEquals: |a-b| ≤ epsilon. */
export function fuzzyEquals(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon
}

/** DoubleMath.fuzzyCompare: a<b → -1, 相等(epsilon 内) → 0, a>b → 1. */
export function fuzzyCompare(a: number, b: number, epsilon: number): number {
  return Math.abs(a - b) <= epsilon ? 0 : a < b ? -1 : 1
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

  getTopLeft(): KVector {
    return new KVector(this.x, this.y)
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
}

/**
 * KVectorChain — ELK core.math.KVectorChain (ArrayList<KVector> + remove() 取首 + add(idx, v) 插入).
 * 方法语义 1:1: getFirst/getLast/get(idx)/size/add/remove/iterator/reverse (返回反转副本).
 */
export class KVectorChain {
  private points: KVector[] = []

  add(v: KVector): KVector {
    this.points.push(v)
    return v
  }

  addAt(index: number, v: KVector): KVector {
    this.points.splice(index, 0, v)
    return v
  }

  /** remove(): 取出并删除第一个点 (Java KVectorChain.remove()). */
  remove(): KVector {
    const p = this.points[0]
    this.points.splice(0, 1)
    return p
  }

  get(index: number): KVector {
    return this.points[index]
  }

  getFirst(): KVector {
    return this.points[0]
  }

  getLast(): KVector {
    return this.points[this.points.length - 1]
  }

  size(): number {
    return this.points.length
  }

  toArray(): KVector[] {
    return this.points
  }

  /** 迭代全部点 (含构造迭代器时快照, Java Iterator 语义). */
  each(fn: (v: KVector) => void): void {
    for (const p of this.points) fn(p)
  }

  /** reverse(): 返回反转后的新链 (Java KVectorChain.reverse 返回新链). */
  reverse(): KVectorChain {
    const out = new KVectorChain()
    for (let i = this.points.length - 1; i >= 0; i--) out.add(this.points[i].clone())
    return out
  }

  /** 从数组构造 (点对象共享, 不克隆 — ElkUtil.createVectorChain 语义). */
  static of(points: KVector[]): KVectorChain {
    const c = new KVectorChain()
    for (const p of points) c.add(p)
    return c
  }
}

/** 线段与线段相交 (ElkMath.intersects(KVector l11, KVector l12, KVector l21, KVector l22)). */
export function segIntersects(l11: KVector, l12: KVector, l21: KVector, l22: KVector): boolean {
  const u0 = l11
  const v0 = l12.clone().sub(l11)
  const u1 = l21
  const v1 = l22.clone().sub(l21)
  const x00 = u0.x
  const y00 = u0.y
  const x10 = u1.x
  const y10 = u1.y
  const x01 = v0.x
  const y01 = v0.y
  const x11 = v1.x
  const y11 = v1.y

  const d = x11 * y01 - x01 * y11
  if (fuzzyEquals(0, d, DOUBLE_EQ_EPSILON)) {
    return false
  }
  const s = (1 / d) * ((x00 - x10) * y01 - (y00 - y10) * x01)
  const t = (1 / d) * -(-(x00 - x10) * y11 + (y00 - y10) * x11)

  // use < instead of <= to not recognize "touching" as intersection
  const intersects =
    // 0 < s
    fuzzyCompare(0, s, DOUBLE_EQ_EPSILON) < 0
    // s < 1
    && fuzzyCompare(s, 1, DOUBLE_EQ_EPSILON) < 0
    // 0 < t
    && fuzzyCompare(0, t, DOUBLE_EQ_EPSILON) < 0
    // t < 1
    && fuzzyCompare(t, 1, DOUBLE_EQ_EPSILON) < 0
  return intersects
}

/** ElkMath.contains(rect, point): 严格包含 (边界点不算). */
export function rectContainsPoint(rect: Rect, p: KVector): boolean {
  const minX = rect.x
  const maxX = rect.x + rect.width
  const minY = rect.y
  const maxY = rect.y + rect.height
  return (p.x > minX && p.x < maxX) && (p.y > minY && p.y < maxY)
}

/** ElkMath.contains(rect, p1, p2): 两点都在矩形内. */
export function rectContainsSeg(rect: Rect, p1: KVector, p2: KVector): boolean {
  return rectContainsPoint(rect, p1) && rectContainsPoint(rect, p2)
}

/** ElkMath.contains(rect, path): 全部顶点都在矩形内 (含闭合段, <2 点 → false). */
export function rectContainsChain(rect: Rect, path: KVectorChain): boolean {
  if (path.size() < 2) {
    return false
  }
  const first = path.getFirst()
  let p1 = first
  for (let i = 1; i < path.size(); i++) {
    const p2 = path.get(i)
    if (!rectContainsSeg(rect, p1, p2)) {
      return false
    }
    p1 = p2
  }
  if (!rectContainsSeg(rect, p1, first)) {
    return false
  }
  return true
}

/** ElkMath.intersects(rect, p1, p2): 线段与矩形任一边相交. */
export function rectIntersectsSeg(rect: Rect, p1: KVector, p2: KVector): boolean {
  // simple cases first: fully contained
  if (rectContainsSeg(rect, p1, p2)) {
    return false
  }
  return segIntersects(rect.getTopLeft(), rect.getTopRight(), p1, p2)
    || segIntersects(rect.getTopRight(), rect.getBottomRight(), p1, p2)
    || segIntersects(rect.getBottomRight(), rect.getBottomLeft(), p1, p2)
    || segIntersects(rect.getBottomLeft(), rect.getTopLeft(), p1, p2)
}

/** ElkMath.intersects(rect, path): 闭合多边形任一边与矩形相交 (<2 点 → false). */
export function rectIntersectsChain(rect: Rect, path: KVectorChain): boolean {
  if (path.size() < 2) {
    return false
  }
  const first = path.getFirst()
  let p1 = first
  for (let i = 1; i < path.size(); i++) {
    const p2 = path.get(i)
    if (rectIntersectsSeg(rect, p1, p2)) {
      return true
    }
    p1 = p2
  }
  if (rectIntersectsSeg(rect, p1, first)) {
    return true
  }
  return false
}

/**
 * Pair — ELK core.util.Pair (不可变双元组, getFirst/getSecond).
 */
export class Pair<A, B> {
  private first: A
  private second: B

  constructor(first: A, second: B) {
    this.first = first
    this.second = second
  }

  getFirst(): A {
    return this.first
  }

  getSecond(): B {
    return this.second
  }
}

/**
 * Quadruple — ELK core.util.Quadruple (getFirst..getFourth).
 */
export class Quadruple<A, B, C, D> {
  private first: A
  private second: B
  private third: C
  private fourth: D

  constructor(first: A, second: B, third: C, fourth: D) {
    this.first = first
    this.second = second
    this.third = third
    this.fourth = fourth
  }

  getFirst(): A {
    return this.first
  }

  getSecond(): B {
    return this.second
  }

  getThird(): C {
    return this.third
  }

  getFourth(): D {
    return this.fourth
  }
}

/**
 * UniqueTriple — alg.common.utils.UniqueTriple (getFirst/getSecond/getThird, equals 全字段).
 */
export class UniqueTriple<A, B, C> {
  private first: A
  private second: B
  private third: C

  constructor(first: A, second: B, third: C) {
    this.first = first
    this.second = second
    this.third = third
  }

  getFirst(): A {
    return this.first
  }

  getSecond(): B {
    return this.second
  }

  getThird(): C {
    return this.third
  }

  equals(o: unknown): boolean {
    if (!(o instanceof UniqueTriple)) {
      return false
    }
    return this.first === o.first && this.second === o.second && this.third === o.third
  }
}

/**
 * ElkPadding — ELK core.math.ElkPadding (top/left/right/bottom, getHorizontal/getVertical).
 */
export class ElkPadding {
  top: number
  left: number
  right: number
  bottom: number

  constructor(top = 0, left = 0, right = 0, bottom = 0) {
    this.top = top
    this.left = left
    this.right = right
    this.bottom = bottom
  }

  getHorizontal(): number {
    return this.left + this.right
  }

  getVertical(): number {
    return this.top + this.bottom
  }
}
