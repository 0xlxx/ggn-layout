/**
 * SelfLoopType (ELK intermediate.loops.SelfLoopType) 语义单元测试.
 * SSOT: ELK Java 0.12.0 SelfLoopType.fromPortSides
 *  - UNDEFINED 侧 → throw IllegalArgumentException (SelfLoopType.java:31-34)
 *  - 空集合/非法数量 → 返回 null (SelfLoopType.java:52-54 default)
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { SelfLoopType, selfLoopTypeFromPortSides } from '../../src/intermediate/loops/self-loop-type.js'

describe('SelfLoopType (ELK Java 移植)', () => {
  it('单侧 → ONE_SIDE', () => {
    expect(selfLoopTypeFromPortSides(new Set([PortSide.NORTH]))).toBe(SelfLoopType.ONE_SIDE)
    expect(selfLoopTypeFromPortSides(new Set([PortSide.EAST]))).toBe(SelfLoopType.ONE_SIDE)
  })

  it('双侧相邻 → TWO_SIDES_CORNER, 双侧相对 → TWO_SIDES_OPPOSING', () => {
    expect(selfLoopTypeFromPortSides(new Set([PortSide.NORTH, PortSide.EAST]))).toBe(SelfLoopType.TWO_SIDES_CORNER)
    expect(selfLoopTypeFromPortSides(new Set([PortSide.EAST, PortSide.SOUTH]))).toBe(SelfLoopType.TWO_SIDES_CORNER)
    expect(selfLoopTypeFromPortSides(new Set([PortSide.EAST, PortSide.WEST]))).toBe(SelfLoopType.TWO_SIDES_OPPOSING)
    expect(selfLoopTypeFromPortSides(new Set([PortSide.NORTH, PortSide.SOUTH]))).toBe(SelfLoopType.TWO_SIDES_OPPOSING)
  })

  it('三侧/四侧', () => {
    expect(selfLoopTypeFromPortSides(new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH]))).toBe(SelfLoopType.THREE_SIDES)
    const all = new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST])
    expect(selfLoopTypeFromPortSides(all)).toBe(SelfLoopType.FOUR_SIDES)
  })

  it('UNDEFINED 侧 → throw IllegalArgumentException (ELK Java :31-34)', () => {
    expect(() => selfLoopTypeFromPortSides(new Set([PortSide.UNDEFINED, PortSide.NORTH])))
      .toThrow('Port sides must not contain UNDEFINED')
    expect(() => selfLoopTypeFromPortSides(new Set([PortSide.UNDEFINED]))).toThrow('Port sides must not contain UNDEFINED')
  })

  it('空集合 → null (ELK Java :52-54 default)', () => {
    expect(selfLoopTypeFromPortSides(new Set())).toBeNull()
  })
})
