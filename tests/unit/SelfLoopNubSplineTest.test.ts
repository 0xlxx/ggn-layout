/**
 * NubSpline (src/intermediate/loops/routing/nub-spline.ts) 语义单元测试.
 * SSOT: ELK Java 0.12.0 p5edges/splines/NubSpline.java (clamped uniform 三次 B-Spline → Bezier).
 * 覆盖: clamped/unclamped 构造、toBezier 升阶、getBezierCP 首尾 CP 裁剪 (source/target vector)、
 * ListCursor (JDK ListIterator) 语义路径、维度/点数错误分支.
 */
import { describe, expect, it } from 'vitest'
import { NubSpline } from '../../src/intermediate/loops/routing/nub-spline.js'

function close(x: number, y: number, digits = 6): void {
  expect(x).toBeCloseTo(y, digits)
}

describe('NubSpline (ELK Java 移植, loops/routing)', () => {
  it('clamped cubic 4 CP: 已是 Bezier 形, getBezierCP 默认裁剪首尾 CP', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    const cp = s.getBezierCP()
    expect(cp).toHaveLength(2)
    close(cp[0]!.x, 100); close(cp[0]!.y, 0)
    close(cp[1]!.x, 100); close(cp[1]!.y, 100)
  })

  it('getBezierCP 开关: withSourceVector/withTargetVector 决定首尾 CP 保留', () => {
    const pts = [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ]
    const both = new NubSpline(true, 3, pts).getBezierCP(true, true)
    expect(both).toHaveLength(4)
    close(both[0]!.x, 0); close(both[0]!.y, 0)
    close(both[3]!.x, 0); close(both[3]!.y, 100)

    const src = new NubSpline(true, 3, pts).getBezierCP(true, false)
    expect(src).toHaveLength(3)
    close(src[0]!.x, 0); close(src[0]!.y, 0)
    close(src[2]!.x, 100); close(src[2]!.y, 100)

    const tgt = new NubSpline(true, 3, pts).getBezierCP(false, true)
    expect(tgt).toHaveLength(3)
    close(tgt[0]!.x, 100); close(tgt[0]!.y, 0)
    close(tgt[2]!.x, 0); close(tgt[2]!.y, 100)
  })

  it('clamped cubic 6 CP: 3 段 Bezier, 裁剪后 8 CP', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    const cp = s.getBezierCP()
    expect(cp).toHaveLength(8)
    // 用精确的逐点断言 (Boehm knot 插入 + 极坐标平均)
    close(cp[0]!.x, 50); close(cp[0]!.y, 0)
    close(cp[1]!.x, 75); close(cp[1]!.y, 0)
    close(cp[2]!.x, 87.5); close(cp[2]!.y, 25 / 3)
    close(cp[3]!.x, 100); close(cp[3]!.y, 50 / 3)
    close(cp[4]!.x, 100); close(cp[4]!.y, 100 / 3)
    close(cp[5]!.x, 100); close(cp[5]!.y, 54.166666666666664)
    close(cp[6]!.x, 100); close(cp[6]!.y, 75)
    close(cp[7]!.x, 100); close(cp[7]!.y, 100)
  })

  it('unclamped cubic 4 CP: 非钳制 knot vector + toBezier 去首尾 knot', () => {
    const s = new NubSpline(false, 3, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    const cp = s.getBezierCP()
    expect(cp).toHaveLength(4)
    close(cp[0]!.x, 100); close(cp[0]!.y, 0)
    close(cp[1]!.x, 100); close(cp[1]!.y, 100 / 3)
    close(cp[2]!.x, 100); close(cp[2]!.y, 100 / 3)
    close(cp[3]!.x, 100); close(cp[3]!.y, 100)
  })

  it('unclamped getBezierCP(true,true): 保留首尾 CP', () => {
    const cp = new NubSpline(false, 3, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ]).getBezierCP(true, true)
    expect(cp).toHaveLength(6)
    close(cp[0]!.x, 0); close(cp[0]!.y, 0)
    close(cp[5]!.x, 0); close(cp[5]!.y, 100)
  })

  it('dimension 2 (quadratic) clamped: 单段 Bezier 裁剪后 1 CP', () => {
    const cp = new NubSpline(true, 2, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 },
    ]).getBezierCP()
    expect(cp).toHaveLength(1)
    close(cp[0]!.x, 100); close(cp[0]!.y, 0)
  })

  it('对称自环型 CP: 弯点关于节点中心 x 对称 (spline 自环不变量)', () => {
    const cp = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: -20, y: 20 }, { x: -20, y: -20 }, { x: 0, y: -20 },
    ]).getBezierCP()
    expect(cp).toHaveLength(8)
    close(cp[0]!.x, 20); close(cp[0]!.y, 0)
    close(cp[1]!.x, 20); close(cp[1]!.y, 10)
    close(cp[2]!.x, 40 / 3); close(cp[2]!.y, 15)
    close(cp[3]!.x, 20 / 3); close(cp[3]!.y, 20)
    close(cp[4]!.x, -20 / 3); close(cp[4]!.y, 20)
    close(cp[5]!.x, -40 / 3); close(cp[5]!.y, 10)
    close(cp[6]!.x, -20); close(cp[6]!.y, 0)
    close(cp[7]!.x, -20); close(cp[7]!.y, -20)
    // 对称性: 首尾镜像对关于 x=0
    close(cp[0]!.x + cp[7]!.x, 0)
    close(cp[1]!.x + cp[6]!.x, 0)
    close(cp[2]!.x + cp[5]!.x, 0)
    close(cp[3]!.x + cp[4]!.x, 0)
  })

  it('重复调用 getBezierCP 幂等 (toBezier 只执行一次)', () => {
    const s = new NubSpline(true, 3, [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
    ])
    const first = s.getBezierCP()
    const second = s.getBezierCP()
    expect(second).toEqual(first)
  })

  it('构造错误: dimension < 1 抛异常', () => {
    expect(() => new NubSpline(true, 0, [{ x: 0, y: 0 }, { x: 1, y: 1 }])).toThrow(/dimension must be at least 1/)
  })

  it('控制点自动补齐到 dimension+1: 少于 dim+1 个点时复制首点', () => {
    // 2 个点, dim 3 → 补齐到 4 个点 (首点复制)
    const s = new NubSpline(true, 3, [{ x: 5, y: 5 }, { x: 100, y: 100 }])
    const cp = s.getBezierCP()
    // 补齐后 clamped cubic 4 CP → 裁剪后 2 CP = 复制的首点
    expect(cp).toHaveLength(2)
    close(cp[0]!.x, 5); close(cp[0]!.y, 5)
    close(cp[1]!.x, 5); close(cp[1]!.y, 5)
  })
})
