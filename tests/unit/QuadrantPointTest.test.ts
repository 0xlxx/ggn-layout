/**
 * Point + Quadrant 单元测试 (ELK compaction.recthull.Point/Quadrant 移植).
 * 覆盖: isUpper/isLeft/isBothLeftOrBothRight/isOneLeftOneRight 全象限组合, Point.equals.
 */
import { describe, expect, it } from 'vitest'
import { Point, Quadrant } from '../../src/compaction/recthull/point.js'

describe('Quadrant (ELK Java 移植)', () => {
  it('isUpper: Q1/Q2 为上, Q3/Q4 为下', () => {
    expect(Quadrant.isUpper(Quadrant.Q1)).toBe(true)
    expect(Quadrant.isUpper(Quadrant.Q2)).toBe(true)
    expect(Quadrant.isUpper(Quadrant.Q3)).toBe(false)
    expect(Quadrant.isUpper(Quadrant.Q4)).toBe(false)
  })

  it('isLeft: Q1/Q4 为左, Q2/Q3 为右', () => {
    expect(Quadrant.isLeft(Quadrant.Q1)).toBe(true)
    expect(Quadrant.isLeft(Quadrant.Q4)).toBe(true)
    expect(Quadrant.isLeft(Quadrant.Q2)).toBe(false)
    expect(Quadrant.isLeft(Quadrant.Q3)).toBe(false)
  })

  it('isBothLeftOrBothRight: 同侧象限对 (Q1-Q4, Q2-Q3) 为 true', () => {
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q1, Quadrant.Q4)).toBe(true)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q4, Quadrant.Q1)).toBe(true)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q2, Quadrant.Q3)).toBe(true)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q3, Quadrant.Q2)).toBe(true)
  })

  it('isBothLeftOrBothRight: 同象限或异侧为 false', () => {
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q1, Quadrant.Q1)).toBe(false)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q4, Quadrant.Q4)).toBe(false)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q2, Quadrant.Q2)).toBe(false)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q3, Quadrant.Q3)).toBe(false)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q1, Quadrant.Q2)).toBe(false)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q1, Quadrant.Q3)).toBe(false)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q4, Quadrant.Q2)).toBe(false)
    expect(Quadrant.isBothLeftOrBothRight(Quadrant.Q4, Quadrant.Q3)).toBe(false)
  })

  it('isOneLeftOneRight: 一左一右组合 (Q1-Q2/Q3, Q4-Q3/Q2) 为 true', () => {
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q1, Quadrant.Q2)).toBe(true)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q1, Quadrant.Q3)).toBe(true)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q4, Quadrant.Q3)).toBe(true)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q4, Quadrant.Q2)).toBe(true)
  })

  it('isOneLeftOneRight: 其他组合为 false', () => {
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q1, Quadrant.Q1)).toBe(false)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q1, Quadrant.Q4)).toBe(false)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q2, Quadrant.Q1)).toBe(false)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q2, Quadrant.Q3)).toBe(false)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q3, Quadrant.Q2)).toBe(false)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q3, Quadrant.Q4)).toBe(false)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q4, Quadrant.Q1)).toBe(false)
    expect(Quadrant.isOneLeftOneRight(Quadrant.Q4, Quadrant.Q4)).toBe(false)
  })
})

describe('Point (ELK Java 移植)', () => {
  it('构造: 无 quadrant 时默认为 null, convex 默认 true', () => {
    const p = new Point(1, 2)
    expect(p.x).toBe(1)
    expect(p.y).toBe(2)
    expect(p.quadrant).toBeNull()
    expect(p.convex).toBe(true)
  })

  it('构造: 指定 quadrant 生效', () => {
    const p = new Point(1, 2, Quadrant.Q3)
    expect(p.quadrant).toBe(Quadrant.Q3)
  })

  it('equals: 同 x 同 y 为 true', () => {
    expect(new Point(5, 6).equals(new Point(5, 6))).toBe(true)
  })

  it('equals: x 或 y 不同为 false', () => {
    expect(new Point(5, 6).equals(new Point(7, 6))).toBe(false)
    expect(new Point(5, 6).equals(new Point(5, 7))).toBe(false)
    expect(new Point(5, 6).equals(new Point(7, 8))).toBe(false)
  })
})
