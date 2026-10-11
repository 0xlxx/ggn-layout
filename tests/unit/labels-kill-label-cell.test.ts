/**
 * labels 簇变异补测: labels/label-cell.ts (ELK alg.common cellsystem.LabelCell).
 * 语义: horizontalLayoutMode=true → 标签沿 y 纵向堆叠 (x=max 宽, y=Σ高+gap);
 *       false → 沿 x 横向堆叠 (y=max 高). applyLabelLayout 按 cell 矩形 + 对齐给标签赋坐标.
 */
import { describe, expect, it } from 'vitest'
import { LabelCell, HorizontalLabelAlignment, VerticalLabelAlignment } from '../../src/intermediate/labels/label-cell.js'

function label(size: { x: number; y: number }, text = 'L') {
  return { text, position: { x: 0, y: 0 }, size }
}

describe('LabelCell 水平模式 (horizontalLayoutMode=true, 纵向堆叠)', () => {
  it('addLabel 累计: minWidth=max 宽, minHeight=Σ高+gap', () => {
    const c = new LabelCell(2, true)
    expect(c.getMinimumWidth()).toBe(0)
    expect(c.getMinimumHeight()).toBe(0)
    c.addLabel(label({ x: 5, y: 3 }), null)
    c.addLabel(label({ x: 7, y: 4 }), null)
    expect(c.getMinimumWidth()).toBe(7)
    expect(c.getMinimumHeight()).toBe(9) // 3 + 2 + 4
    expect(c.hasLabels()).toBe(true)
  })

  it('applyLabelLayout 水平模式 V_TOP/CENTER/BOTTOM + H_LEFT/CENTER/RIGHT', () => {
    const c = new LabelCell(2, true)
    const l1 = label({ x: 5, y: 3 })
    const l2 = label({ x: 7, y: 4 })
    c.addLabel(l1, null)
    c.addLabel(l2, null)
    c.cellRectangle = { x: 10, y: 20, width: 20, height: 30 }

    c.setVerticalAlignment(VerticalLabelAlignment.TOP)
    c.setHorizontalAlignment(HorizontalLabelAlignment.LEFT)
    c.applyLabelLayout()
    expect(l1.position).toEqual({ x: 10, y: 20 })
    expect(l2.position).toEqual({ x: 10, y: 25 })

    c.setVerticalAlignment(VerticalLabelAlignment.CENTER)
    c.applyLabelLayout()
    // yPos = 20 + (30 - 9)/2 = 30.5; x CENTER: 10 + (20-5)/2 = 17.5 / 10+(20-7)/2 = 16.5
    c.setHorizontalAlignment(HorizontalLabelAlignment.CENTER)
    c.applyLabelLayout()
    expect(l1.position.y).toBeCloseTo(30.5, 9)
    expect(l1.position.x).toBeCloseTo(17.5, 9)
    expect(l2.position.y).toBeCloseTo(35.5, 9)
    expect(l2.position.x).toBeCloseTo(16.5, 9)

    c.setVerticalAlignment(VerticalLabelAlignment.BOTTOM)
    c.applyLabelLayout()
    expect(l1.position.y).toBeCloseTo(41, 9) // 20 + 30 - 9
    expect(l2.position.y).toBeCloseTo(46, 9)

    c.setVerticalAlignment(VerticalLabelAlignment.TOP)
    c.setHorizontalAlignment(HorizontalLabelAlignment.RIGHT)
    c.applyLabelLayout()
    expect(l1.position.x).toBe(10 + 20 - 5)
    expect(l2.position.x).toBe(10 + 20 - 7)
  })
})

describe('LabelCell 垂直模式 (horizontalLayoutMode=false, 横向堆叠)', () => {
  it('addLabel 累计: minWidth=Σ宽+gap, minHeight=max 高', () => {
    const c = new LabelCell(3, false)
    c.addLabel(label({ x: 5, y: 3 }), null)
    c.addLabel(label({ x: 7, y: 4 }), null)
    expect(c.getMinimumWidth()).toBe(15) // 5 + 3 + 7
    expect(c.getMinimumHeight()).toBe(4)
    expect(c.hasLabels()).toBe(true)
  })

  it('applyLabelLayout 垂直模式 H_LEFT/CENTER/RIGHT + V_TOP/CENTER/BOTTOM', () => {
    const c = new LabelCell(3, false)
    const l1 = label({ x: 5, y: 3 })
    const l2 = label({ x: 7, y: 4 })
    c.addLabel(l1, null)
    c.addLabel(l2, null)
    c.cellRectangle = { x: 10, y: 20, width: 30, height: 40 }

    c.setHorizontalAlignment(HorizontalLabelAlignment.LEFT)
    c.setVerticalAlignment(VerticalLabelAlignment.TOP)
    c.applyLabelLayout()
    expect(l1.position).toEqual({ x: 10, y: 20 })
    expect(l2.position).toEqual({ x: 18, y: 20 })

    c.setHorizontalAlignment(HorizontalLabelAlignment.CENTER)
    c.applyLabelLayout()
    // xPos = 10 + (30 - 15)/2 = 17.5; V CENTER: L1 y = 20 + (40-3)/2 = 38.5
    c.setVerticalAlignment(VerticalLabelAlignment.CENTER)
    c.applyLabelLayout()
    expect(l1.position.x).toBeCloseTo(17.5, 9)
    expect(l2.position.x).toBeCloseTo(25.5, 9)
    expect(l1.position.y).toBeCloseTo(38.5, 9)
    expect(l2.position.y).toBeCloseTo(38, 9)

    c.setHorizontalAlignment(HorizontalLabelAlignment.RIGHT)
    c.applyLabelLayout()
    expect(l1.position.x).toBe(10 + 30 - 15)
    expect(l2.position.x).toBe(10 + 30 - 7)

    c.setHorizontalAlignment(HorizontalLabelAlignment.LEFT)
    c.setVerticalAlignment(VerticalLabelAlignment.BOTTOM)
    c.applyLabelLayout()
    expect(l1.position.y).toBe(20 + 40 - 3)
    expect(l2.position.y).toBe(20 + 40 - 4)
  })
})

describe('LabelCell 边界', () => {
  it('单标签无 gap 累计', () => {
    const c = new LabelCell(5, true)
    c.addLabel(label({ x: 8, y: 6 }), null)
    expect(c.getMinimumWidth()).toBe(8)
    expect(c.getMinimumHeight()).toBe(6)
  })

  it('getEntries 返回实时数组 (EndLabelSorter 重排用)', () => {
    const c = new LabelCell(1, true)
    const l1 = label({ x: 1, y: 1 }, 'a')
    const l2 = label({ x: 1, y: 1 }, 'b')
    c.addLabel(l1, null)
    c.addLabel(l2, null)
    const entries = c.getEntries()
    expect(entries).toHaveLength(2)
    entries.reverse()
    expect(c.getEntries().map(e => e.label.text)).toEqual(['b', 'a'])
  })

  it('默认对齐 CENTER/CENTER; 空 cell 不崩', () => {
    const c = new LabelCell(1, true)
    expect(c.getHorizontalAlignment()).toBe(HorizontalLabelAlignment.CENTER)
    expect(c.getVerticalAlignment()).toBe(VerticalLabelAlignment.CENTER)
    expect(c.hasLabels()).toBe(false)
    c.cellRectangle = { x: 0, y: 0, width: 10, height: 10 }
    c.applyLabelLayout()
    expect(c.getMinimumWidth()).toBe(0)
    expect(c.getMinimumHeight()).toBe(0)
  })
})
