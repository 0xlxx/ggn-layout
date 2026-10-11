/**
 * NubSpline (src/p5edges/splines/nub-spline.ts) 单元测试.
 * SSOT: ELK Java 0.12.0 p5edges.splines.NubSpline (jar NubSplineProbe 直跑生成参考值).
 * 覆盖: clamped/unclamped 构造 + 均匀 knot vector / Boehm knot 插入升阶 (多内部 knot:
 * n=6/7/8) / getBezierCP 首尾 CP 裁剪 / getControlPoints 快照 / 自动补齐到 dimension+1 /
 * 幂等 / dimension<1 错误分支.
 */
import { describe, expect, it } from 'vitest'
import { NubSpline } from '../../src/p5edges/splines/nub-spline.js'

function expectCP(actual: { x: number; y: number }[], expected: number[][], msg: string): void {
  expect(actual.length, `${msg}: 点数`).toBe(expected.length)
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]!.x, `${msg}[${i}].x`).toBeCloseTo(expected[i]![0]!, 9)
    expect(actual[i]!.y, `${msg}[${i}].y`).toBeCloseTo(expected[i]![1]!, 9)
  }
}

describe('NubSpline (p5edges/splines, jar 0.12.0 oracle)', () => {
  it('clamped cubic 4 CP: 已是 Bezier 形, 裁剪首尾 → 2 CP', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    expectCP(s.getBezierCP(), [[100, 0], [100, 100]], '4CP')
  })

  it('clamped cubic 6 CP: Boehm 插入 1 内部 knot → 8 CP 精确值', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    expectCP(s.getBezierCP(), [
      [50, 0],
      [74.99999999999999, 0],
      [87.49999999999999, 8.333333333333332],
      [100, 16.666666666666664],
      [99.99999999999997, 33.33333333333333],
      [99.99999999999997, 54.16666666666664],
      [99.99999999999997, 74.99999999999999],
      [100, 100],
    ], '6CP')
  })

  it('clamped cubic 7 CP: 2 内部 knot → 11 CP 精确值', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }, { x: -20, y: 20 }, { x: -20, y: -20 },
    ])
    expectCP(s.getBezierCP(), [
      [10, 0],
      [15, 0],
      [17.5, 3.333333333333333],
      [20, 6.666666666666666],
      [20, 13.333333333333332],
      [16.666666666666664, 16.666666666666664],
      [13.333333333333332, 20],
      [6.666666666666666, 20],
      [-1.666666666666667, 20],
      [-10, 20],
      [-20, 20],
    ], '7CP')
  })

  it('clamped cubic 8 CP: 3 内部 knot → 14 CP 精确值', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }, { x: 15, y: 5 }, { x: 20, y: 10 },
      { x: 25, y: 15 }, { x: 30, y: 20 }, { x: 35, y: 25 },
    ])
    expectCP(s.getBezierCP(), [
      [5, 0],
      [7.5, 0],
      [9.583333333333334, 0.8333333333333335],
      [11.666666666666668, 1.6666666666666667],
      [13.333333333333332, 3.333333333333333],
      [14.999999999999996, 4.999999999999999],
      [16.666666666666664, 6.666666666666666],
      [18.333333333333332, 8.333333333333332],
      [20, 9.999999999999998],
      [21.666666666666668, 11.666666666666666],
      [23.33333333333334, 13.333333333333336],
      [25.41666666666667, 15.41666666666667],
      [27.5, 17.500000000000004],
      [30, 20],
    ], '8CP')
  })

  it('unclamped cubic 4 CP: 非钳制 knot vector + toBezier 去首尾 → 4 CP', () => {
    const s = new NubSpline(false, 3, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    expectCP(s.getBezierCP(), [
      [100, 0],
      [100, 33.33333333333333],
      [100, 33.33333333333333],
      [100, 100],
    ], 'unclamped4')
  })

  it('unclamped cubic 5 CP: 1 内部 knot → 7 CP', () => {
    const s = new NubSpline(false, 3, [
      { x: 0, y: 0 }, { x: 40, y: 0 }, { x: 80, y: 20 }, { x: 80, y: 40 }, { x: 0, y: 40 },
    ])
    expectCP(s.getBezierCP(), [
      [40, 0],
      [53.33333333333333, 6.666666666666666],
      [53.33333333333333, 6.666666666666666],
      [80, 20],
      [80, 26.666666666666664],
      [80, 26.666666666666664],
      [80, 40],
    ], 'unclamped5')
  })

  it('unclamped cubic 6 CP → 10 CP', () => {
    const s = new NubSpline(false, 3, [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 20 }, { x: 40, y: 30 }, { x: 50, y: 40 },
    ])
    expectCP(s.getBezierCP(), [
      [10, 0],
      [13.333333333333332, 3.333333333333333],
      [13.333333333333332, 3.333333333333333],
      [20, 10],
      [23.333333333333332, 13.333333333333334],
      [23.33333333333333, 13.333333333333332],
      [30, 20],
      [33.333333333333336, 23.333333333333336],
      [33.333333333333336, 23.333333333333332],
      [40, 30.000000000000004],
    ], 'unclamped6')
  })

  it('dimension 2 (quadratic) clamped: 单段 → 1 CP', () => {
    const s = new NubSpline(true, 2, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
    ])
    expectCP(s.getBezierCP(), [[100, 0]], 'quad')
  })

  it('dimension 2 unclamped 4 CP → 4 CP', () => {
    const s = new NubSpline(false, 2, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    expectCP(s.getBezierCP(), [
      [100, 0],
      [99.99999999999999, 0],
      [100, 100],
      [99.99999999999999, 99.99999999999999],
    ], 'quad-unclamped')
  })

  it('控制点自动补齐到 dimension+1 (2 CP, dim 3 → 复制首点)', () => {
    const s = new NubSpline(true, 3, [{ x: 5, y: 5 }, { x: 100, y: 100 }])
    expectCP(s.getBezierCP(), [[5, 5], [5, 5]], 'pad')
  })

  it('getControlPoints: 快照 (修改返回数组不影响内部) + 首尾锚定输入点', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 0 },
    ]
    const s = new NubSpline(true, 3, pts)
    const cps = s.getControlPoints()
    expect(cps[0]).toEqual({ x: 0, y: 0 })
    expect(cps[cps.length - 1]).toEqual({ x: 40, y: 0 })
    expect(cps).toHaveLength(5)
    // 修改快照不影响内部
    cps[0]!.x = 999
    expect(s.getControlPoints()[0]).toEqual({ x: 0, y: 0 })
  })

  it('重复调用 getBezierCP 幂等', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }, { x: 30, y: 10 }, { x: 40, y: 0 },
    ])
    expect(s.getBezierCP()).toEqual(s.getBezierCP())
  })

  it('dimension < 1 抛异常', () => {
    expect(() => new NubSpline(true, 0, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(/dimension must be at least 1/)
  })
})
