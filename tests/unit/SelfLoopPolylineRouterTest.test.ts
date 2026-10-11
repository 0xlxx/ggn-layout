/**
 * PolylineSelfLoopRouter (src/intermediate/loops/routing/polyline-self-loop-router.ts) 语义单元测试.
 * SSOT: ELK Java 0.12.0 PolylineSelfLoopRouter.java (cutCorners 三弯点一组切角).
 * 覆盖: 常规/小距离切角、近零偏移清零 (TOLERANCE)、错误分支 (≤2 弯点).
 */
import { describe, expect, it } from 'vitest'
import { kvector } from '../../src/graph/enums.js'
import { cutPolylineCorners } from '../../src/intermediate/loops/routing/polyline-self-loop-router.js'

describe('SelfLoopPolylineRouter cutPolylineCorners (ELK Java 移植)', () => {
  it('常规切角: 每角两代点, 距角点 distance', () => {
    const input = [
      kvector(0, 0), kvector(100, 0), kvector(100, 100), kvector(-100, 100), kvector(-100, -100), kvector(0, -100),
    ]
    const expected = [
      kvector(90, 0), kvector(100, 10), kvector(100, 90), kvector(90, 100),
      kvector(-90, 100), kvector(-100, 90), kvector(-100, -90), kvector(-90, -100),
    ]
    expect(cutPolylineCorners(input, 10)).toEqual(expected)
  })

  it('小距离 (切角受限): effectiveDistance 受相邻段长度约束', () => {
    const input = [
      kvector(0, 0), kvector(100, 0), kvector(100, 100), kvector(-100, 100), kvector(-100, -100), kvector(0, -100),
    ]
    const expected = [
      kvector(50, 0), kvector(100, 50), kvector(100, 50), kvector(50, 100),
      kvector(-20, 100), kvector(-100, 20), kvector(-100, -50), kvector(-50, -100),
    ]
    expect(cutPolylineCorners(input, 80)).toEqual(expected)
  })

  it('单角 (3 弯点): 只处理一个角', () => {
    const input = [kvector(0, 0), kvector(100, 0), kvector(100, 100)]
    expect(cutPolylineCorners(input, 10)).toEqual([kvector(90, 0), kvector(100, 10)])
  })

  it('近零偏移清零: 方向分量在 TOLERANCE 内归零 (保持轴对齐)', () => {
    // corner=(100.005,0), next=(100,100): offset2.x = -0.005 (< TOLERANCE) 清零 →
    // out[1].x = corner.x = 100.005 (若未清零则 90.005)
    const input = [kvector(0, 0), kvector(100.005, 0), kvector(100, 100)]
    const out = cutPolylineCorners(input, 10)
    expect(out[0]!.x).toBeCloseTo(90.005, 6)
    expect(out[0]!.y).toBe(0)
    expect(out[1]!.x).toBeCloseTo(100.005, 6)
    expect(out[1]!.y).toBeCloseTo(10, 6)
  })

  it('切角距离上限: effectiveDistance 取两段最小的一半 (第一段较短)', () => {
    // 第一段长 20, 第二段长 100 → effectiveDistance = 10
    const input = [kvector(0, 0), kvector(20, 0), kvector(20, 100)]
    expect(cutPolylineCorners(input, 50)).toEqual([kvector(10, 0), kvector(20, 10)])
  })

  it('错误分支: ≤2 弯点抛 AssertionError', () => {
    expect(() => cutPolylineCorners([kvector(0, 0), kvector(1, 1)], 10)).toThrow(/bendPoints/)
    expect(() => cutPolylineCorners([kvector(0, 0)], 10)).toThrow(/bendPoints/)
  })
})
