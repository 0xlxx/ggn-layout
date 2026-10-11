/**
 * VerticalSegment 单元测试 (ELK intermediate.compaction.VerticalSegment 移植).
 * 覆盖: 构造 (hitbox/affectedBends/potentialGroupParents/representedLEdges/junctionPoints),
 * joinWith 合并, intersects 相交判定, compareTo 排序, ignoreSpacing/aPort 传递.
 */
import { describe, expect, it } from 'vitest'
import { LEdge } from '../../src/graph/ledge.js'
import { CNode } from '../../src/compaction/oned/cnode.js'
import { VerticalSegment } from '../../src/compaction/oned/vertical-segment.js'

function rectish(x: number, y: number, width: number, height: number) {
  return { x, y, width, height }
}

/** 直接用 CNode 子类充当 potentialGroupParents 的成员. */
class PNode extends CNode {
  getHorizontalSpacing(): number { return 0 }
  getVerticalSpacing(): number { return 0 }
  applyElementPosition(): void { this.hitbox.x = this.hitbox.x }
  getElementPosition(): number { return this.hitbox.x }
}

describe('VerticalSegment (ELK Java 移植)', () => {
  it('构造: hitbox 取两端点 min/max, affectedBends 含两个端点', () => {
    const e = new LEdge()
    const vs = new VerticalSegment({ x: 100, y: 200 }, { x: 100, y: 300 }, null, e)
    expect(vs.hitbox).toEqual(rectish(100, 200, 0, 100))
    expect(vs.affectedBends).toEqual([{ x: 100, y: 200 }, { x: 100, y: 300 }])
    expect(vs.representedLEdges).toEqual([e])
    expect(vs.potentialGroupParents).toEqual([])
    expect(vs.affectedBoundingBoxes).toEqual([])
    expect(vs.junctionPoints).toEqual([])
    expect(vs.constraints).toEqual([])
    expect(vs.joined).toEqual([])
  })

  it('构造: 端点顺序无关 (宽/高取绝对值)', () => {
    const vs = new VerticalSegment({ x: 300, y: 400 }, { x: 100, y: 200 }, null, new LEdge())
    expect(vs.hitbox).toEqual(rectish(100, 200, 200, 200))
  })

  it('构造: cNode 非空时加入 potentialGroupParents', () => {
    const p = new PNode()
    const vs = new VerticalSegment({ x: 0, y: 0 }, { x: 0, y: 10 }, p, new LEdge())
    expect(vs.potentialGroupParents).toEqual([p])
  })

  it('joinWith: 合并边/弯点/包围盒/约束/父节点候选, hitbox 取并集', () => {
    const e1 = new LEdge()
    const e2 = new LEdge()
    const vs1 = new VerticalSegment({ x: 50, y: 0 }, { x: 50, y: 100 }, null, e1)
    vs1.affectedBoundingBoxes.push({ x: 50, y: 0, width: 0, height: 100 })
    vs1.junctionPoints.push({ x: 50, y: 50 })
    const c1 = new PNode()
    vs1.potentialGroupParents.push(c1)
    const vs2 = new VerticalSegment({ x: 50, y: 50 }, { x: 50, y: 200 }, null, e2)
    vs2.ignoreSpacing.up = true

    vs1.joinWith(vs2)

    expect(vs1.representedLEdges).toEqual([e1, e2])
    expect(vs1.affectedBends).toHaveLength(4)
    expect(vs1.affectedBoundingBoxes).toHaveLength(1)
    expect(vs1.junctionPoints).toHaveLength(1)
    expect(vs1.potentialGroupParents).toEqual([c1])
    expect(vs1.hitbox).toEqual(rectish(50, 0, 0, 200))
    expect(vs1.ignoreSpacing.up).toBe(true)
    expect(vs1.joined).toEqual([vs2])
  })

  it('joinWith: 非同 x 段合并后 hitbox 覆盖两段并集', () => {
    const vs1 = new VerticalSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, null, new LEdge())
    const vs2 = new VerticalSegment({ x: 20, y: 5 }, { x: 30, y: 5 }, null, new LEdge())
    vs1.joinWith(vs2)
    expect(vs1.hitbox).toEqual(rectish(0, 0, 30, 5))
  })

  it('joinWith: aPort 为空时继承 other.aPort, 已有时保留', () => {
    const vs1 = new VerticalSegment({ x: 0, y: 0 }, { x: 0, y: 10 }, null, new LEdge())
    const vs2 = new VerticalSegment({ x: 0, y: 10 }, { x: 0, y: 20 }, null, new LEdge())
    vs2.aPort = {} as never
    vs1.joinWith(vs2)
    expect(vs1.aPort).toBe(vs2.aPort)

    const vs3 = new VerticalSegment({ x: 0, y: 0 }, { x: 0, y: 10 }, null, new LEdge())
    vs3.aPort = {} as never
    const vs4 = new VerticalSegment({ x: 0, y: 10 }, { x: 0, y: 20 }, null, new LEdge())
    vs4.aPort = {} as never
    const keep = vs3.aPort
    vs3.joinWith(vs4)
    expect(vs3.aPort).toBe(keep)
  })

  it('joinWith: 原段不变, other 的 joined 也被合并', () => {
    const inner = new VerticalSegment({ x: 0, y: 0 }, { x: 0, y: 5 }, null, new LEdge())
    const vs1 = new VerticalSegment({ x: 0, y: 0 }, { x: 0, y: 10 }, null, new LEdge())
    const vs2 = new VerticalSegment({ x: 0, y: 10 }, { x: 0, y: 20 }, null, new LEdge())
    vs2.joinWith(inner)
    vs1.joinWith(vs2)
    expect(vs1.joined).toEqual([inner, vs2])
    // other 段自身不变.
    expect(vs2.joined).toEqual([inner])
  })

  it('intersects: 同 x 且 y 区间重叠为 true', () => {
    const a = new VerticalSegment({ x: 50, y: 0 }, { x: 50, y: 100 }, null, new LEdge())
    const b = new VerticalSegment({ x: 50, y: 50 }, { x: 50, y: 150 }, null, new LEdge())
    expect(a.intersects(b)).toBe(true)
    expect(b.intersects(a)).toBe(true)
  })

  it('intersects: y 区间相离为 false', () => {
    const a = new VerticalSegment({ x: 50, y: 0 }, { x: 50, y: 100 }, null, new LEdge())
    const b = new VerticalSegment({ x: 50, y: 101 }, { x: 50, y: 150 }, null, new LEdge())
    expect(a.intersects(b)).toBe(false)
  })

  it('intersects: 恰好相接 (y+height === other.y) 为 true (fuzzy 相等不算小于)', () => {
    const a = new VerticalSegment({ x: 50, y: 0 }, { x: 50, y: 100 }, null, new LEdge())
    const b = new VerticalSegment({ x: 50, y: 100 }, { x: 50, y: 150 }, null, new LEdge())
    expect(a.intersects(b)).toBe(true)
  })

  it('intersects: x 不同为 false', () => {
    const a = new VerticalSegment({ x: 50, y: 0 }, { x: 50, y: 100 }, null, new LEdge())
    const b = new VerticalSegment({ x: 51, y: 0 }, { x: 51, y: 100 }, null, new LEdge())
    expect(a.intersects(b)).toBe(false)
  })

  it('compareTo: 先按 x 再按 y', () => {
    const a = new VerticalSegment({ x: 10, y: 100 }, { x: 10, y: 110 }, null, new LEdge())
    const b = new VerticalSegment({ x: 20, y: 0 }, { x: 20, y: 10 }, null, new LEdge())
    const c = new VerticalSegment({ x: 10, y: 0 }, { x: 10, y: 10 }, null, new LEdge())
    expect(a.compareTo(b)).toBeLessThan(0)
    expect(b.compareTo(a)).toBeGreaterThan(0)
    expect(c.compareTo(a)).toBeLessThan(0) // 同 x, y 小者在前
    expect(a.compareTo(c)).toBeGreaterThan(0)
  })

  it('compareTo: x fuzzy 相等 (差 <= 容差) 按 y 比较', () => {
    const a = new VerticalSegment({ x: 10.00001, y: 100 }, { x: 10.00001, y: 110 }, null, new LEdge())
    const b = new VerticalSegment({ x: 10, y: 0 }, { x: 10, y: 10 }, null, new LEdge())
    expect(a.compareTo(b)).toBeGreaterThan(0)
  })

  it('compareTo: 完全相等返回 0', () => {
    const a = new VerticalSegment({ x: 10, y: 0 }, { x: 10, y: 10 }, null, new LEdge())
    const b = new VerticalSegment({ x: 10, y: 0 }, { x: 10, y: 10 }, null, new LEdge())
    expect(a.compareTo(b)).toBe(0)
  })
})
