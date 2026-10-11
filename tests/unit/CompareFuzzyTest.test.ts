/**
 * CompareFuzzy (对应 ELK compaction.oned.CompareFuzzy) + CNode 基类方法.
 * 语义: 容差 TOLERANCE=0.0001 内的浮点比较视为相等.
 */
import { describe, expect, it } from 'vitest'
import { CompareFuzzy } from '../../src/compaction/oned/compare-fuzzy.js'
import { CNode } from '../../src/compaction/oned/cnode.js'

class TestCNode extends CNode {
  getHorizontalSpacing(): number { return 0 }
  getVerticalSpacing(): number { return 0 }
  applyElementPosition(): void { this.hitbox.x = this.startPos }
  getElementPosition(): number { return this.hitbox.x }
}

describe('CompareFuzzy (ELK Java 移植)', () => {
  it('eq: 差值在容差内为 true', () => {
    expect(CompareFuzzy.eq(1.0, 1.0)).toBe(true)
    expect(CompareFuzzy.eq(1.0, 1.00005)).toBe(true)
    expect(CompareFuzzy.eq(1.0, 1.0001)).toBe(true) // 边界: <= TOLERANCE
  })

  it('eq: 差值恰好等于容差 (TOLERANCE) 为 true', () => {
    // 边界: |d1-d2| === TOLERANCE (0.0001) → <= 判定 → true.
    expect(CompareFuzzy.eq(0.0001, 0)).toBe(true)
    expect(CompareFuzzy.eq(0.0001, 0.0002)).toBe(true)
  })

  it('eq: 差值超过容差为 false', () => {
    expect(CompareFuzzy.eq(1.0, 1.0002)).toBe(false)
    expect(CompareFuzzy.eq(0.0, 0.5)).toBe(false)
  })

  it('gt/lt: 超过容差才严格大于/小于', () => {
    expect(CompareFuzzy.gt(2.0, 1.0)).toBe(true)
    expect(CompareFuzzy.gt(1.0002, 1.0)).toBe(true)
    expect(CompareFuzzy.gt(1.00005, 1.0)).toBe(false) // 容差内视为相等
    expect(CompareFuzzy.lt(1.0, 2.0)).toBe(true)
    expect(CompareFuzzy.lt(1.0, 1.00005)).toBe(false)
    expect(CompareFuzzy.lt(1.0, 1.0002)).toBe(true)
  })

  it('ge: 大于或容差内相等', () => {
    expect(CompareFuzzy.ge(2.0, 1.0)).toBe(true)
    expect(CompareFuzzy.ge(1.00005, 1.0)).toBe(true)
    expect(CompareFuzzy.ge(1.0, 1.00005)).toBe(true) // 容差内相等
    expect(CompareFuzzy.ge(1.0, 2.0)).toBe(false)
  })

  it('le: 小于或容差内相等', () => {
    expect(CompareFuzzy.le(1.0, 2.0)).toBe(true)
    expect(CompareFuzzy.le(1.00005, 1.0)).toBe(true) // 容差内相等
    expect(CompareFuzzy.le(1.0, 1.00005)).toBe(true)
    expect(CompareFuzzy.le(2.0, 1.0)).toBe(false)
  })
})

describe('CNode 基类', () => {
  it('getPosition 返回 hitbox.x', () => {
    const n = new TestCNode()
    n.hitbox = { x: 42, y: 7, width: 10, height: 10 }
    expect(n.getPosition()).toBe(42)
  })

  it('applyPosition 把 startPos 写回 hitbox.x', () => {
    const n = new TestCNode()
    n.hitbox = { x: 1, y: 0, width: 5, height: 5 }
    n.startPos = 99
    n.applyPosition()
    expect(n.hitbox.x).toBe(99)
  })

  it('默认字段: 无约束、无父节点、reposition=true、lock 全 false', () => {
    const n = new TestCNode()
    expect(n.cGroup).toBeNull()
    expect(n.parentNode).toBeNull()
    expect(n.constraints).toEqual([])
    expect(n.reposition).toBe(true)
    expect(n.lock.left).toBe(false)
    expect(n.startPos).toBe(Number.NEGATIVE_INFINITY)
    expect(n.cGroupOffset).toEqual({ x: 0, y: 0 })
  })
})
