/**
 * SplinesMath (src/p5edges/splines/splines-math.ts) 纯函数单元测试.
 * SSOT: ELK Java 0.12.0 p5edges.splines.SplinesMath / ElkMath (intersects|contains|
 * approximateBezierSegment|getPointOnBezierSegment|portSideToDirection).
 * 覆盖: 方向映射 / 矩形包含 (边界不算) / 线段相交 (端点触碰不算) / 线段-矩形相交 /
 * Bernstein 求值 / 均匀采样 (含终点不含起点) / 空采样退化.
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/graph/enums.js'
import {
  portSideToDirection,
  containsRectPoint,
  containsRectLine,
  intersectsLines,
  intersectsRectLine,
  getPointOnBezierSegment,
  approximateBezierSegment,
  type Rect,
} from '../../src/p5edges/splines/splines-math.js'

const RECT: Rect = { x: 0, y: 0, width: 10, height: 10 }

describe('portSideToDirection (ELK SplinesMath.portSideToDirection)', () => {
  it('四个主方向 + 未定义侧', () => {
    expect(portSideToDirection(PortSide.NORTH)).toBeCloseTo((3 * Math.PI) / 2, 12)
    expect(portSideToDirection(PortSide.EAST)).toBe(0)
    expect(portSideToDirection(PortSide.SOUTH)).toBeCloseTo(Math.PI / 2, 12)
    expect(portSideToDirection(PortSide.WEST)).toBeCloseTo(Math.PI, 12)
    expect(portSideToDirection(PortSide.UNDEFINED)).toBe(0)
  })
})

describe('containsRectPoint / containsRectLine (ElkMath.contains)', () => {
  it('内部为 true, 边界不算, 外部为 false', () => {
    expect(containsRectPoint(RECT, { x: 5, y: 5 })).toBe(true)
    expect(containsRectPoint(RECT, { x: 0.001, y: 9.999 })).toBe(true)
    // 四条边界 (严格 < >)
    expect(containsRectPoint(RECT, { x: 0, y: 5 })).toBe(false)
    expect(containsRectPoint(RECT, { x: 10, y: 5 })).toBe(false)
    expect(containsRectPoint(RECT, { x: 5, y: 0 })).toBe(false)
    expect(containsRectPoint(RECT, { x: 5, y: 10 })).toBe(false)
    // 角点
    expect(containsRectPoint(RECT, { x: 0, y: 0 })).toBe(false)
    expect(containsRectPoint(RECT, { x: 10, y: 10 })).toBe(false)
    // 外部
    expect(containsRectPoint(RECT, { x: -1, y: 5 })).toBe(false)
    expect(containsRectPoint(RECT, { x: 11, y: 5 })).toBe(false)
    expect(containsRectPoint(RECT, { x: 5, y: -1 })).toBe(false)
    expect(containsRectPoint(RECT, { x: 5, y: 11 })).toBe(false)
  })

  it('containsRectLine: 两端都在矩形内才 true', () => {
    expect(containsRectLine(RECT, { x: 2, y: 2 }, { x: 8, y: 8 })).toBe(true)
    expect(containsRectLine(RECT, { x: 2, y: 2 }, { x: 12, y: 8 })).toBe(false)
    expect(containsRectLine(RECT, { x: 2, y: 2 }, { x: 0, y: 8 })).toBe(false)
  })
})

describe('intersectsLines (ElkMath.intersects)', () => {
  it('真交叉为 true (含斜线/垂直线/水平线)', () => {
    // 对角线交叉
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true)
    // 垂直与水平交叉
    expect(intersectsLines({ x: 5, y: -5 }, { x: 5, y: 15 }, { x: -5, y: 5 }, { x: 15, y: 5 })).toBe(true)
    // 斜线交叉 (非中点)
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 }, { x: 10, y: 0 })).toBe(true)
  })

  it('平行/共线/端点触碰/退化线段均为 false', () => {
    // 平行不相交
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 5 }, { x: 10, y: 15 })).toBe(false)
    // 共线重叠 (d=0)
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 5, y: 5 }, { x: 15, y: 15 })).toBe(false)
    // 端点触碰不算
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 10 }, { x: 20, y: 0 })).toBe(false)
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 })).toBe(false)
    // 一条线段退化为点
    expect(intersectsLines({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 10 })).toBe(false)
  })

  it('s/t 越界 (近错过) 为 false', () => {
    // 投影交点不在两线段范围内
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: -1 }, { x: 5, y: -5 })).toBe(false)
    expect(intersectsLines({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 15, y: -1 }, { x: 15, y: -5 })).toBe(false)
  })
})

describe('intersectsRectLine (ElkMath.intersects(rect, p1, p2))', () => {
  it('两端都在矩形内为 false (整段内含)', () => {
    expect(intersectsRectLine(RECT, { x: 2, y: 2 }, { x: 8, y: 8 })).toBe(false)
  })

  it('穿过矩形为 true (水平/垂直/斜线)', () => {
    expect(intersectsRectLine(RECT, { x: -5, y: 5 }, { x: 15, y: 5 })).toBe(true)
    expect(intersectsRectLine(RECT, { x: 5, y: -5 }, { x: 5, y: 15 })).toBe(true)
    expect(intersectsRectLine(RECT, { x: -5, y: 2 }, { x: 15, y: 8 })).toBe(true)
  })

  it('一端在矩形内一端在外为 true', () => {
    expect(intersectsRectLine(RECT, { x: 5, y: 5 }, { x: 15, y: 5 })).toBe(true)
    expect(intersectsRectLine(RECT, { x: 5, y: 5 }, { x: 5, y: 15 })).toBe(true)
  })

  it('完全在矩形外为 false (含贴边不穿)', () => {
    expect(intersectsRectLine(RECT, { x: -5, y: -5 }, { x: 15, y: -5 })).toBe(false)
    expect(intersectsRectLine(RECT, { x: -5, y: -5 }, { x: -5, y: 15 })).toBe(false)
    // 沿左边界垂直穿过: 与边界共线/端点触碰不算
    expect(intersectsRectLine(RECT, { x: 0, y: -5 }, { x: 0, y: 15 })).toBe(false)
  })
})

describe('getPointOnBezierSegment (Bernstein 求值)', () => {
  it('线性 (2 CP): t=0/0.25/0.75/1', () => {
    const cps = [{ x: 0, y: 0 }, { x: 10, y: 10 }]
    expect(getPointOnBezierSegment(0, cps)).toEqual({ x: 0, y: 0 })
    expect(getPointOnBezierSegment(1, cps)).toEqual({ x: 10, y: 10 })
    const p = getPointOnBezierSegment(0.25, cps)
    expect(p.x).toBeCloseTo(2.5, 12)
    expect(p.y).toBeCloseTo(2.5, 12)
    const q = getPointOnBezierSegment(0.75, cps)
    expect(q.x).toBeCloseTo(7.5, 12)
    expect(q.y).toBeCloseTo(7.5, 12)
  })

  it('二次 (3 CP): t=0.5 中点', () => {
    const cps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const p = getPointOnBezierSegment(0.5, cps)
    expect(p.x).toBeCloseTo(5, 12)
    expect(p.y).toBeCloseTo(2.5, 12)
  })

  it('三次 (4 CP): t=0.5 精确 Bernstein 权重', () => {
    const cps = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }]
    const p = getPointOnBezierSegment(0.5, cps)
    // 1/8, 3/8, 3/8, 1/8
    expect(p.x).toBeCloseTo(5, 12)
    expect(p.y).toBeCloseTo(7.5, 12)
  })

  it('端点 t=0/t=1 恒为首/末 CP', () => {
    const cps = [{ x: 3, y: 4 }, { x: 10, y: 20 }, { x: -5, y: 7 }, { x: 8, y: -2 }]
    expect(getPointOnBezierSegment(0, cps)).toEqual({ x: 3, y: 4 })
    expect(getPointOnBezierSegment(1, cps)).toEqual({ x: 8, y: -2 })
  })
})

describe('approximateBezierSegment (均匀采样)', () => {
  it('resultSize <= 0 返回空', () => {
    expect(approximateBezierSegment(0, [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toEqual([])
    expect(approximateBezierSegment(-3, [{ x: 0, y: 0 }, { x: 10, y: 10 }])).toEqual([])
  })

  it('线性 4 采样: dt=0.25, 含终点不含起点', () => {
    const pts = approximateBezierSegment(4, [{ x: 0, y: 0 }, { x: 10, y: 0 }])
    expect(pts).toHaveLength(4)
    expect(pts[0]).toEqual({ x: 2.5, y: 0 })
    expect(pts[1]).toEqual({ x: 5, y: 0 })
    expect(pts[2]).toEqual({ x: 7.5, y: 0 })
    expect(pts[3]).toEqual({ x: 10, y: 0 })
  })

  it('二次 4 采样: 逐点精确', () => {
    const cps = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
    const pts = approximateBezierSegment(4, cps)
    expect(pts).toHaveLength(4)
    const exp = [
      [3.75, 0.625],
      [5, 2.5],
      [3.75, 5.625],
      [0, 10],
    ]
    pts.forEach((p, i) => {
      expect(p.x).toBeCloseTo(exp[i]![0]!, 12)
      expect(p.y).toBeCloseTo(exp[i]![1]!, 12)
    })
  })

  it('三次 3 采样: dt=1/3', () => {
    const cps = [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 0 }]
    const pts = approximateBezierSegment(3, cps)
    expect(pts).toHaveLength(3)
    expect(pts[0]!.x).toBeCloseTo(70 / 27, 12)
    expect(pts[0]!.y).toBeCloseTo(20 / 3, 12)
    expect(pts[1]!.x).toBeCloseTo(200 / 27, 12)
    expect(pts[1]!.y).toBeCloseTo(20 / 3, 12)
    expect(pts[2]).toEqual({ x: 10, y: 0 })
  })

  it('resultSize=1: 只含终点 (t=1)', () => {
    const pts = approximateBezierSegment(1, [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }])
    expect(pts).toHaveLength(1)
    expect(pts[0]).toEqual({ x: 0, y: 100 })
  })
})
