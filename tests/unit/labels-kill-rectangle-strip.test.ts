/**
 * labels 簇变异补测: labels/rectangle-strip-overlap-remover.ts
 * (ELK alg.common RectangleStripOverlapRemover).
 * 覆盖 4 个方向 (UP/DOWN/LEFT/RIGHT) + gap + startCoordinate + 重叠/无重叠.
 */
import { describe, expect, it } from 'vitest'
import { RectangleStripOverlapRemover, OverlapRemovalDirection } from '../../src/intermediate/labels/rectangle-strip-overlap-remover.js'

function run(dir: OverlapRemovalDirection, rects: { x: number; y: number; width: number; height: number }[],
  start: number, gap = 2): { strip: number; rects: { x: number; y: number; width: number; height: number }[] } {
  const remover = RectangleStripOverlapRemover.createForDirection(dir).withGap(gap, gap).withStartCoordinate(start)
  for (const r of rects) remover.addRectangle({ ...r })
  const strip = remover.removeOverlaps()
  return { strip, rects: remover.getRectangleNodes().map(n => ({ ...n.originalRectangle })) }
}

describe('RectangleStripOverlapRemover (ELK 移植)', () => {
  it('DOWN 无重叠: 全部平移 start, strip = max 高', () => {
    const { strip, rects } = run(OverlapRemovalDirection.DOWN,
      [{ x: 0, y: 0, width: 10, height: 5 }, { x: 20, y: 0, width: 10, height: 5 }], 10)
    expect(rects[0]).toEqual({ x: 0, y: 10, width: 10, height: 5 })
    expect(rects[1]).toEqual({ x: 20, y: 10, width: 10, height: 5 })
    expect(strip).toBe(5)
  })

  it('DOWN 重叠: 后一个推到前一个下方 + gap', () => {
    const { strip, rects } = run(OverlapRemovalDirection.DOWN,
      [{ x: 0, y: 0, width: 10, height: 5 }, { x: 5, y: 0, width: 10, height: 5 }], 10)
    expect(rects[0].y).toBe(10)
    expect(rects[1].y).toBe(17) // 10 + 5 + 2
    expect(strip).toBe(12)
  })

  it('UP 重叠: export 公式 y = start - h - y (坐标翻转)', () => {
    const { strip, rects } = run(OverlapRemovalDirection.UP,
      [{ x: 0, y: 0, width: 10, height: 5 }, { x: 5, y: 0, width: 10, height: 5 }], 10)
    expect(rects[0].y).toBe(10 - 5 - 0) // 5
    expect(rects[1].y).toBe(10 - 5 - 7) // -2
    expect(strip).toBe(12)
  })

  it('RIGHT 重叠: 交换 x/y 坐标空间', () => {
    const { strip, rects } = run(OverlapRemovalDirection.RIGHT,
      [{ x: 0, y: 0, width: 10, height: 5 }, { x: 5, y: 0, width: 10, height: 5 }], 10)
    expect(rects[0].x).toBe(10 + 0)
    expect(rects[1].x).toBe(10 + 12)
    expect(strip).toBe(22)
  })

  it('LEFT 重叠: export 公式 x = start - h - y', () => {
    const { strip, rects } = run(OverlapRemovalDirection.LEFT,
      [{ x: 0, y: 0, width: 10, height: 5 }, { x: 5, y: 0, width: 10, height: 5 }], 10)
    expect(rects[0].x).toBe(10 - 10 - 0)
    expect(rects[1].x).toBe(10 - 10 - 12)
    expect(strip).toBe(22)
  })

  it('3 矩形: 扫描线移出活跃集 (while 循环)', () => {
    const { strip, rects } = run(OverlapRemovalDirection.DOWN,
      [{ x: 0, y: 0, width: 10, height: 5 }, { x: 5, y: 0, width: 10, height: 5 }, { x: 30, y: 0, width: 5, height: 5 }], 0)
    // C (x=30) 不与 A/B 相交 → 不被推挤
    expect(rects[0].y).toBe(0)
    expect(rects[1].y).toBe(7)
    expect(rects[2].y).toBe(0)
    expect(strip).toBe(12)
  })

  it('withGap/getVerticalGap/getRectangleNodes 接口', () => {
    const r = RectangleStripOverlapRemover.createForDirection(OverlapRemovalDirection.DOWN)
    expect(r.withGap(3, 4)).toBe(r)
    expect(r.getVerticalGap()).toBe(4)
    r.addRectangle({ x: 0, y: 0, width: 1, height: 1 })
    expect(r.getRectangleNodes()).toHaveLength(1)
  })
})
