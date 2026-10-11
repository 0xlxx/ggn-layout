/**
 * NubSpline (对应 ELK p5edges.splines.NubSpline).
 * 非均匀 (此处仅 uniform+clamped) B-Spline → Bezier 控制点转换.
 * 仅移植自环路由所需的 clamped uniform 三次路径 (NubSpline.java:103-143, 409-443, 516-569, 848-942):
 *  - 构造: uniform knot vector + PolarCP 极坐标形式 (de Boor 记号)
 *  - toBezier: 插入 knot 使每个内部 knot 重数达到 dim (升阶到 Bezier 段)
 *  - getBezierCP(false,false): 去掉首尾 CP (source/target vector) 后返回 Bezier 控制点
 * Java ListIterator 语义用 ListCursor 模拟 (next/previous/add/remove 与 JDK 一致).
 */

/** 允许误差 (NubSpline.EPSILON). */
const EPSILON = 0.000001

/** 模拟 java.util.ListIterator (仅本文件用到的操作). */
class ListCursor<T> {
  private list: T[]
  /** 游标: 位于 index 与 index-1 之间; next() 返回 list[index] 并前进. */
  private cursor = 0
  /** 最近一次 next/previous 返回的元素位置 (供 remove). -1 = 无. */
  private lastReturned = -1

  constructor(list: T[]) {
    this.list = list
  }

  next(): T {
    if (this.cursor >= this.list.length) throw new Error('NoSuchElementException')
    this.lastReturned = this.cursor
    const v = this.list[this.cursor]!
    this.cursor++
    return v
  }

  hasNext(): boolean {
    return this.cursor < this.list.length
  }

  previous(): T {
    if (this.cursor <= 0) throw new Error('NoSuchElementException')
    this.cursor--
    this.lastReturned = this.cursor
    return this.list[this.cursor]!
  }

  /** 在游标前插入 (JDK add: 插入后 lastReturned 无效). */
  add(el: T): void {
    this.list.splice(this.cursor, 0, el)
    this.cursor++
    this.lastReturned = -1
  }

  /** 移除最近一次 next/previous 返回的元素 (JDK remove 语义). */
  remove(): void {
    if (this.lastReturned < 0) throw new Error('IllegalStateException')
    this.list.splice(this.lastReturned, 1)
    if (this.cursor > this.lastReturned) this.cursor--
    this.lastReturned = -1
  }
}

/** 极坐标形式的控制点 (NubSpline.PolarCP). */
class PolarCP {
  cp: { x: number; y: number }
  polarCoordinate: number[]

  constructor(controlPoint: { x: number; y: number }, polarCoordinate: number[])
  /** 由两个相邻 PolarCP 计算新控制点 (NubSpline.PolarCP(firstCP, secondCP, newKnot)). */
  constructor(firstCP: PolarCP, secondCP: PolarCP, newKnot: number)
  constructor(a: { x: number; y: number } | PolarCP, b: number[] | PolarCP, c?: number) {
    if (a instanceof PolarCP && b instanceof PolarCP && c !== undefined) {
      // vectorC = ((b-c) * vectorA + (c-a) * vectorB) / (b-a)
      const firstFactor = a.polarCoordinate[0]!
      const secondFactor = b.polarCoordinate[b.polarCoordinate.length - 1]!
      const aScaled = { x: a.cp.x * (secondFactor - c), y: a.cp.y * (secondFactor - c) }
      const bScaled = { x: b.cp.x * (c - firstFactor), y: b.cp.y * (c - firstFactor) }
      this.cp = {
        x: (aScaled.x + bScaled.x) / (secondFactor - firstFactor),
        y: (aScaled.y + bScaled.y) / (secondFactor - firstFactor),
      }
      this.polarCoordinate = []
      // 从 firstCP 取 W (跳过第一个元素), 按序插入 newKnot
      let needsToBeAdded = true
      for (let i = 1; i < a.polarCoordinate.length; i++) {
        const nextKnot = a.polarCoordinate[i]!
        if (needsToBeAdded && nextKnot - c > EPSILON) {
          this.polarCoordinate.push(c)
          needsToBeAdded = false
        }
        this.polarCoordinate.push(nextKnot)
      }
      if (needsToBeAdded) this.polarCoordinate.push(c)
    } else {
      this.cp = { x: (a as { x: number; y: number }).x, y: (a as { x: number; y: number }).y }
      this.polarCoordinate = [...(b as number[])]
    }
  }

  getCp(): { x: number; y: number } { return this.cp }
}

/** clamped uniform NubSpline → Bezier 控制点 (自环路由用). */
export class NubSpline {
  private knotVector: number[] = []
  private controlPoints: PolarCP[] = []
  private dim: number
  private isClamped: boolean
  private isBezier = false
  private minKnot = 0
  private maxKnot = 0

  constructor(clamped: boolean, dimension: number, kVectors: { x: number; y: number }[]) {
    if (dimension < 1) throw new Error('The dimension must be at least 1!')
    // fill the list of control-points to be at least equal to dimension + 1
    while (kVectors.length <= dimension) {
      kVectors.unshift({ ...kVectors[0]! })
    }
    if (kVectors.length < dimension + 1) {
      throw new Error('At (least dimension + 1) control points are necessary!')
    }
    this.dim = dimension
    this.isClamped = clamped
    this.isBezier = false
    this.createUniformKnotVector(clamped, kVectors.length + dimension - 1)

    const polarCoordinate: number[] = []
    const knotIter = new ListCursor(this.knotVector)
    for (let i = 0; i < dimension - 1; i++) polarCoordinate.push(knotIter.next())
    for (const kVector of kVectors) {
      polarCoordinate.push(knotIter.next())
      this.controlPoints.push(new PolarCP(kVector, polarCoordinate))
      polarCoordinate.shift()
    }
  }

  private createUniformKnotVector(clamped: boolean, size: number): void {
    if (size < 2 * this.dim) {
      throw new Error('The knot vector must have at least two time the dimension elements.')
    }
    let mySize: number
    if (clamped) {
      this.minKnot = 0
      this.maxKnot = 1
      for (let i = 0; i < this.dim; i++) this.knotVector.push(0)
      mySize = size + 1 - 2 * this.dim
    } else {
      mySize = size + 1
      const ddim = this.dim
      this.minKnot = ddim / (mySize + 1)
      this.maxKnot = (mySize - ddim) / mySize
    }
    const fraction = mySize
    for (let i = 1; i < mySize; i++) this.knotVector.push(i / fraction)
    if (this.isClamped) {
      for (let i = 0; i < this.dim; i++) this.knotVector.push(1)
    }
  }

  private getMultiplicity(knotToCheck: number): number {
    let count = 0
    for (const currentKnot of this.knotVector) {
      const diff = currentKnot - knotToCheck
      if (diff > EPSILON) return count
      else if (diff > -EPSILON) count++
    }
    return count
  }

  private insertKnotAtCurrentPosition(insertions: number, knotToInsert: number,
    iterCP: ListCursor<PolarCP>, iterKnot: ListCursor<number>): void {
    const multiplicity = this.getMultiplicity(knotToInsert)
    for (let i = 0; i < insertions; i++) {
      // 插入新 knot
      iterKnot.add(knotToInsert)

      const newCPs: PolarCP[] = []
      let secondCP = iterCP.next()
      for (let j = multiplicity + i; j < this.dim; j++) {
        const firstCP = secondCP
        secondCP = iterCP.next()
        newCPs.push(new PolarCP(firstCP, secondCP, knotToInsert))
      }

      // 回退并删除被重复使用的 CP
      for (let j = multiplicity + i; j < this.dim; j++) {
        iterCP.previous()
        if (j > multiplicity + i) iterCP.remove()
      }

      // 加入新 CP
      for (const cp of newCPs) iterCP.add(cp)

      // 若还有插入, 回到第一个新 CP 之前
      if (i < insertions - 1) {
        for (let j = multiplicity + i; j < this.dim; j++) {
          iterCP.previous()
        }
      }
    }
  }

  /** 升阶到 Bezier 形式 (NubSpline.toBezier). */
  toBezier(): void {
    const iterKnot = new ListCursor(this.knotVector)
    const iterCP = new ListCursor(this.controlPoints)

    if (this.isClamped) {
      for (let i = 0; i < this.dim; i++) iterKnot.next()
    } else {
      for (let i = 0; i < this.dim - 1; i++) {
        iterKnot.next()
        iterKnot.remove()
      }
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
      if (occurrence < this.dim) {
        iterKnot.previous()
        this.insertKnotAtCurrentPosition(this.dim - occurrence, knotToCount, iterCP, iterKnot)
        iterKnot.next()
      }
      iterCP.previous()
    }

    if (!this.isClamped) {
      for (let i = 0; i < this.dim - 1; i++) {
        iterKnot.next()
        iterKnot.remove()
      }
    }
    this.isClamped = true
    this.isBezier = true
  }

  /**
   * Bezier 控制点 (NubSpline.getBezierCP(withSourceVector=false, withTargetVector=false)).
   * 默认去掉 source/target vector (首尾 CP).
   */
  getBezierCP(withSourceVector = false, withTargetVector = false): { x: number; y: number }[] {
    if (!this.isBezier) this.toBezier()
    const retVal: { x: number; y: number }[] = []
    const iter = this.controlPoints[Symbol.iterator]()
    if (!withSourceVector) iter.next()
    let cur = iter.next()
    while (!cur.done) {
      retVal.push(cur.value.getCp())
      cur = iter.next()
    }
    if (!withTargetVector) retVal.pop()
    return retVal
  }
}
