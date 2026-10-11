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
 * NubSpline (对应 ELK p5edges.splines.NubSpline) — 均匀/钳制 NURBS → Bezier 转换.
 *
 * 移植范围 (FinalSplineBendpointsCalculator 用): 构造 (钳制均匀 cubic, 维度 3) →
 * createUniformKnotVector → toBezier (Boehm knot 插入提高重数) → getBezierCP.
 * 自环/极值/求导等 ELK 未走到的分支不移植.
 */
import type { KVector } from '../../graph/enums.js'

const EPSILON = 0.000001

/** 极坐标控制点 (Boehm 算法中间态). */
class PolarCP {
  cp: KVector
  polarCoordinate: number[]

  constructor(controlPoint: KVector, polarCoordinate: number[])
  constructor(firstCP: PolarCP, secondCP: PolarCP, newKnot: number)
  constructor(a: KVector | PolarCP, b: number[] | PolarCP, newKnot?: number) {
    if (a instanceof PolarCP && b instanceof PolarCP && newKnot !== undefined) {
      // 从两个 PolarCP + 新 knot 计算: vectorC = ((b-c)*vectorA + (c-a)*vectorB) / (b-a)
      const firstFactor = a.polarCoordinate[0]!
      const secondFactor = b.polarCoordinate[b.polarCoordinate.length - 1]!
      const aScaled = { x: a.cp.x * (secondFactor - newKnot), y: a.cp.y * (secondFactor - newKnot) }
      const bScaled = { x: b.cp.x * (newKnot - firstFactor), y: b.cp.y * (newKnot - firstFactor) }
      const total = { x: aScaled.x + bScaled.x, y: aScaled.y + bScaled.y }
      const scale = 1.0 / (secondFactor - firstFactor)
      this.cp = { x: total.x * scale, y: total.y * scale }
      this.polarCoordinate = []
      let needsToBeAdded = true
      for (let i = 1; i < a.polarCoordinate.length; i++) {
        const nextKnot = a.polarCoordinate[i]!
        if (needsToBeAdded && nextKnot - newKnot > EPSILON) {
          this.polarCoordinate.push(newKnot)
          needsToBeAdded = false
        }
        this.polarCoordinate.push(nextKnot)
      }
      if (needsToBeAdded) this.polarCoordinate.push(newKnot)
    } else {
      this.cp = { x: (a as KVector).x, y: (a as KVector).y }
      this.polarCoordinate = [...(b as number[])]
    }
  }

  getCp(): KVector {
    return this.cp
  }
}

export class NubSpline {
  private knotVector: number[] = []
  private controlPoints: PolarCP[] = []
  private dimNUBS = 0
  private isClamped = false
  private isUniform = false
  private isBezier = false
  private minKnot = 0
  private maxKnot = 0

  constructor(clamped: boolean, dimension: number, kVectors: KVector[]) {
    if (dimension < 1) throw new Error('The dimension must be at least 1!')
    // 补控制点至至少 dimension+1 (ELK line 107-110: 头部复制首点)
    while (kVectors.length < dimension + 1) {
      kVectors.unshift({ ...kVectors[0]! })
    }
    this.dimNUBS = dimension
    this.isClamped = clamped
    this.isUniform = true
    this.isBezier = false
    this.createUniformKnotVector(clamped, kVectors.length + this.dimNUBS - 1)

    const polarCoordinate: number[] = []
    let knotIdx = 0
    for (let i = 0; i < this.dimNUBS - 1; i++) polarCoordinate.push(this.knotVector[knotIdx++]!)
    for (const kVector of kVectors) {
      polarCoordinate.push(this.knotVector[knotIdx++]!)
      this.controlPoints.push(new PolarCP(kVector, polarCoordinate))
      polarCoordinate.shift()
    }
  }

  private createUniformKnotVector(clamped: boolean, size: number): void {
    if (size < 2 * this.dimNUBS) throw new Error('The knot vector must have at least two time the dimension elements.')
    let mySize: number
    if (clamped) {
      this.minKnot = 0.0
      this.maxKnot = 1.0
      for (let i = 0; i < this.dimNUBS; i++) this.knotVector.push(0.0)
      mySize = size + 1 - 2 * this.dimNUBS
    } else {
      mySize = size + 1
      const ddim = this.dimNUBS
      this.minKnot = ddim / (mySize + 1)
      this.maxKnot = (mySize - ddim) / mySize
    }
    const fraction = mySize
    for (let i = 1; i < mySize; i++) this.knotVector.push(i / fraction)
    if (clamped) {
      for (let i = 0; i < this.dimNUBS; i++) this.knotVector.push(1.0)
    }
  }

  private getMultiplicity(knotToCheck: number): number {
    let multiplicity = 0
    for (const knot of this.knotVector) {
      if (Math.abs(knot - knotToCheck) < EPSILON) multiplicity++
    }
    return multiplicity
  }

  /** Boehm knot 插入 (对应 ELK insertKnotAtCurrentPosition, line 516-570). */
  private insertKnotAtCurrentPosition(insertions: number, knotToInsert: number, iterCP: ListItr<PolarCP>, iterKnot: ListItr<number>): void {
    const multiplicity = this.getMultiplicity(knotToInsert)
    for (let i = 0; i < insertions; i++) {
      iterKnot.add(knotToInsert)
      const newCPs: PolarCP[] = []
      let secondCP = iterCP.next()
      for (let j = multiplicity + i; j < this.dimNUBS; j++) {
        const firstCP = secondCP
        secondCP = iterCP.next()
        newCPs.push(new PolarCP(firstCP, secondCP, knotToInsert))
      }
      for (let j = multiplicity + i; j < this.dimNUBS; j++) {
        iterCP.previous()
        if (j > multiplicity + i) iterCP.remove()
      }
      for (const cp of newCPs) iterCP.add(cp)
      if (i < insertions - 1) {
        for (let j = multiplicity + i; j < this.dimNUBS; j++) iterCP.previous()
      }
    }
  }

  toBezier(): void {
    const iterKnot = new ListItr(this.knotVector)
    const iterCP = new ListItr(this.controlPoints)
    if (this.isClamped) {
      for (let i = 0; i < this.dimNUBS; i++) iterKnot.next()
    } else {
      for (let i = 0; i < this.dimNUBS - 1; i++) { iterKnot.next(); iterKnot.remove() }
    }

    let currentKnot = iterKnot.next()
    while (this.maxKnot - currentKnot > EPSILON) {
      const knotToCount = currentKnot
      let occurrence = 0
      while (Math.abs(currentKnot - knotToCount) < EPSILON) {
        occurrence++
        currentKnot = iterKnot.next()
        iterCP.next()
      }
      if (occurrence < this.dimNUBS) {
        iterKnot.previous()
        this.insertKnotAtCurrentPosition(this.dimNUBS - occurrence, knotToCount, iterCP, iterKnot)
        iterKnot.next()
      }
      iterCP.previous()
    }

    if (!this.isClamped) {
      for (let i = 0; i < this.dimNUBS - 1; i++) { iterKnot.next(); iterKnot.remove() }
    }
    this.isClamped = true
    this.isBezier = true
  }

  /** 原始控制点 (对应 ELK getControlPoints, NubSpline.java:316-329). 列表为快照, 可安全修改. */
  getControlPoints(): KVector[] {
    return this.controlPoints.map(cp => ({ x: cp.getCp().x, y: cp.getCp().y }))
  }

  /** Bezier 控制点 (对应 ELK getBezierCP(false, false)). */
  getBezierCP(): KVector[] {
    if (!this.isBezier) this.toBezier()
    const retVal: KVector[] = []
    for (let i = 1; i < this.controlPoints.length - 1; i++) {
      retVal.push({ x: this.controlPoints[i]!.getCp().x, y: this.controlPoints[i]!.getCp().y })
    }
    return retVal
  }
}

/** 精确 Java LinkedList ListItr 语义 (next/previous/remove/add + lastRet). */
class ListItr<T> {
  private items: T[]
  private cursor = 0
  private lastRet = -1
  constructor(items: T[]) { this.items = items }
  next(): T { const v = this.items[this.cursor]!; this.lastRet = this.cursor; this.cursor++; return v }
  previous(): T { this.cursor--; this.lastRet = this.cursor; return this.items[this.cursor]! }
  remove(): void {
    if (this.lastRet === -1) throw new Error('no last returned')
    if (this.lastRet < this.cursor) { this.items.splice(this.lastRet, 1); this.cursor-- }
    else { this.items.splice(this.lastRet, 1) }
    this.lastRet = -1
  }
  add(item: T): void { this.items.splice(this.cursor, 0, item); this.cursor++; this.lastRet = -1 }
}
