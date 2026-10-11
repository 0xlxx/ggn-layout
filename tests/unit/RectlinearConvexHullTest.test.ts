/**
 * 移植自 ELK Java: compaction/recthull/RectlinearConvexHullTest.java
 */
import { describe, expect, it } from 'vitest'
import { Point } from '../../src/compaction/recthull/point.js'
import { RectilinearConvexHull, type ElkRectangle } from '../../src/compaction/recthull/rectilinear-convex-hull.js'

describe('RectlinearConvexHull (ELK Java 移植)', () => {
  it('testCross', () => {
    const points = [
      new Point(0, 1), new Point(1, 1), new Point(1, 0),
      new Point(2, 0), new Point(2, 1), new Point(3, 1),
      new Point(3, 2), new Point(2, 2), new Point(2, 3),
      new Point(1, 3), new Point(1, 2), new Point(0, 2),
    ]
    const rch = RectilinearConvexHull.of(points)
    expect(rch.getHull().map(p => [p.x, p.y])).toEqual(points.map(p => [p.x, p.y]))

    const expectedRects: ElkRectangle[] = [
      { x: 0, y: 1, width: 1, height: 1 },
      { x: 1, y: 0, width: 1, height: 3 },
      { x: 2, y: 1, width: 1, height: 1 },
    ]
    const actualRects = rch.splitIntoRectangles()
    expect(containsInAnyOrder(expectedRects, actualRects)).toBe(true)
  })

  it('testLittleRobot', () => {
    const points = [
      new Point(0, 2), new Point(1, 2), new Point(1, 1), new Point(2, 1), new Point(2, 0),
      new Point(2, 0), new Point(2, 1), new Point(3, 1), new Point(3, 2), new Point(4, 2),
      new Point(4, 2), new Point(3, 2), new Point(3, 3), new Point(2, 3), new Point(2, 4),
      new Point(2, 4), new Point(2, 3), new Point(1, 3), new Point(1, 2), new Point(0, 2),
    ]
    const rch = RectilinearConvexHull.of(points)
    expect(rch.getHull().map(p => [p.x, p.y])).toEqual(points.map(p => [p.x, p.y]))

    const actualRects = rch.splitIntoRectangles()
    const expectedRects: ElkRectangle[] = [
      { x: 0, y: 2, width: 1, height: 0 },
      { x: 1, y: 1, width: 1, height: 2 },
      { x: 2, y: 0, width: 0, height: 4 },
      { x: 2, y: 1, width: 1, height: 2 },
      { x: 3, y: 2, width: 1, height: 0 },
    ]
    expect(containsInAnyOrder(expectedRects, actualRects)).toBe(true)
  })
})

function containsInAnyOrder<T>(needles: T[], haystack: T[]): boolean {
  const remaining = [...haystack]
  for (const needle of needles) {
    const idx = remaining.findIndex(h => rectEq(h as any, needle as any))
    if (idx === -1) return false
    remaining.splice(idx, 1)
  }
  return true
}

function rectEq(a: ElkRectangle, b: ElkRectangle): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
}

// ============================================================================
// M5 变异补测: 边界/退化输入 (单点/竖线/横线/矩形/阶梯), 覆盖 of() 极值扫描与
// RIGHT_SPECIAL_ORDER 同 x 分支 / RectangleEventHandler 分支.
// ============================================================================

describe('RectlinearConvexHull 边界用例 (M5 变异补测)', () => {
  it('单点: 每象限扫描都会选中该点 → 4 个重复点', () => {
    const p = new Point(3, 4)
    const rch = RectilinearConvexHull.of([p])
    const hull = rch.getHull().map(q => [q.x, q.y])
    expect(hull.length).toBe(4)
    expect(hull.every(q => q[0] === 3 && q[1] === 4)).toBe(true)
  })

  it('两点竖线 (同 x): hull 保留两点', () => {
    const rch = RectilinearConvexHull.of([new Point(1, 0), new Point(1, 2)])
    const hull = rch.getHull().map(p => [p.x, p.y])
    expect(hull).toContainEqual([1, 0])
    expect(hull).toContainEqual([1, 2])
  })

  it('三点横线 (同 y): hull 保留端点', () => {
    const rch = RectilinearConvexHull.of([new Point(0, 0), new Point(1, 0), new Point(2, 0)])
    const hull = rch.getHull().map(p => [p.x, p.y])
    expect(hull).toContainEqual([0, 0])
    expect(hull).toContainEqual([2, 0])
  })

  it('矩形 (4 角): splitIntoRectangles 产出单矩形', () => {
    // 顺时针: 左上(0,2) 右上(2,2) 右下(2,0) 左下(0,0) → 矩形 [0,0,2,2]
    const points = [
      new Point(0, 2), new Point(1, 2), new Point(2, 2), new Point(2, 1), new Point(2, 0),
      new Point(1, 0), new Point(0, 0), new Point(0, 1),
    ]
    const rch = RectilinearConvexHull.of(points)
    const rects = rch.splitIntoRectangles()
    expect(rects).toContainEqual({ x: 0, y: 0, width: 2, height: 2 })
  })

  it('多段阶梯矩形拆分: 每段楼梯一个矩形', () => {
    // 台阶形: (0,0) (1,0) (1,1) (2,1) (2,2) (3,2) (3,0) 逆时针回 (0,0)
    const points = [
      new Point(0, 0), new Point(1, 0), new Point(1, 1), new Point(2, 1),
      new Point(2, 2), new Point(3, 2), new Point(3, 0), new Point(0, 0),
    ]
    const rch = RectilinearConvexHull.of(points)
    const rects = rch.splitIntoRectangles()
    // 至少包含两个非零矩形 (楼梯拆分)
    const nonZero = rects.filter(r => r.width > 0 && r.height > 0)
    expect(nonZero.length).toBeGreaterThanOrEqual(2)
  })

  it('hull 顺序稳定: 逆时针遍历 (Q1→Q2 反向→Q3→Q4 反向)', () => {
    const points = [
      new Point(0, 2), new Point(1, 2), new Point(2, 2), new Point(2, 1), new Point(2, 0),
      new Point(1, 0), new Point(0, 0), new Point(0, 1),
    ]
    const rch = RectilinearConvexHull.of(points)
    const hull = rch.getHull()
    // 逆时针: Q1 最左下点 (0,0) 开始 → Q2 (2,0) → Q3 (2,2) → Q4 (0,2)
    expect(hull.map(p => [p.x, p.y])).toEqual([[0, 0], [2, 0], [2, 2], [0, 2]])
  })

  it('RIGHT_SPECIAL_ORDER: 同 x 同侧象限 + 凹/凸角组合排序 (凸角前于凹角)', () => {
    // 点集产生 hull: Q1 凹角 (10,15) 与 Q4 凸角 (10,20) 同 x 同侧 → convex 分支排序.
    const rch = RectilinearConvexHull.of([new Point(5, 15), new Point(10, 10), new Point(10, 20), new Point(15, 15)])
    const hull = rch.getHull()
    // 同 x=10 的同侧对: Q1 凸 (10,10) 在前, Q1 凹 (10,15) 在后; Q4 凸 (10,20) 在 Q4 凹 (10,15) 前.
    const q1 = hull.filter(p => p.quadrant === 'Q1')
    expect(q1.map(p => [p.x, p.y, p.convex])).toEqual([[5, 15, true], [10, 15, false], [10, 10, true]])
    const q4 = hull.filter(p => p.quadrant === 'Q4')
    expect(q4.map(p => [p.x, p.y, p.convex])).toEqual([[10, 20, true], [10, 15, false], [5, 15, true]])
    // splitIntoRectangles: xMin2=null → lastX=0; 凹角检测产出 3 矩形.
    const rects = rch.splitIntoRectangles()
    expect(rects).toEqual([
      { x: 0, y: 15, width: 10, height: 0 },
      { x: 10, y: 10, width: 0, height: 10 },
      { x: 10, y: 15, width: 5, height: 0 },
    ])
  })

  it('of() 边界: 同 x 等值点替换 top2 (xMax1/xMin1 保持最新点)', () => {
    // (10,20) 与 (10,10) 同 x: Q1 保留 y 递减序列 → (10,10); Q4 保留 y 递增序列 → (10,20).
    const rch = RectilinearConvexHull.of([new Point(10, 20), new Point(10, 10)])
    const hull = rch.getHull()
    expect(hull.filter(p => p.quadrant === 'Q1').map(p => [p.x, p.y])).toEqual([[10, 10]])
    expect(hull.filter(p => p.quadrant === 'Q4').map(p => [p.x, p.y])).toEqual([[10, 20]])
  })
})
