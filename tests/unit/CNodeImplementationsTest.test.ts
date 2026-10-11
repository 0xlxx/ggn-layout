/**
 * LNodeCNode / VerticalSegmentCNode 单元测试 (ELK LGraphToCGraphTransformer 的 CNode 实现).
 * 覆盖: margin hitbox 计算, applyElementPosition 写回 (margin 补偿), 垂直段弯点/包围盒/
 * junctionPoints 平移, spacing 方法参与默认间距 handler.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LEdge, Direction } from '../../src/index.js'
import { CGraph } from '../../src/compaction/oned/cgraph.js'
import { CGroup } from '../../src/compaction/oned/cgroup.js'
import { OneDimensionalCompactor } from '../../src/compaction/oned/oned-compactor.js'
import { LNodeCNode, VerticalSegmentCNode } from '../../src/compaction/oned/cnode-implementations.js'
import { VerticalSegment } from '../../src/compaction/oned/vertical-segment.js'
import { LongestPathCompaction } from '../../src/compaction/oned/algs.js'

function mkNode(x: number): LNode {
  const g = new LGraph()
  const n = new LNode(g)
  n.size = { x: 50, y: 20 }
  n.position.x = x
  return n
}

describe('LNodeCNode (ELK Java 移植)', () => {
  it('构造: hitbox = 位置 - margin, 尺寸 + margin', () => {
    const n = mkNode(100)
    n.getMargin().left = 5
    n.getMargin().top = 3
    n.getMargin().right = 7
    n.getMargin().bottom = 4
    const c = new LNodeCNode(n)
    expect(c.hitbox).toEqual({ x: 95, y: -3, width: 62, height: 27 })
  })

  it('构造: 零 margin 时 hitbox = 位置与尺寸', () => {
    const n = mkNode(10)
    n.position.y = 20
    const c = new LNodeCNode(n)
    expect(c.hitbox).toEqual({ x: 10, y: 20, width: 50, height: 20 })
  })

  it('applyElementPosition: x 写回 = hitbox.x + margin.left', () => {
    const n = mkNode(100)
    n.getMargin().left = 5
    const c = new LNodeCNode(n)
    c.hitbox.x = 95
    c.applyElementPosition()
    expect(n.position.x).toBe(100)
  })

  it('getHorizontalSpacing/getVerticalSpacing: 返回 0 (默认间距参与)', () => {
    const n = mkNode(0)
    const c = new LNodeCNode(n)
    expect(c.getHorizontalSpacing()).toBe(0)
    expect(c.getVerticalSpacing()).toBe(0)
    expect(c.getElementPosition()).toBe(c.hitbox.x)
  })

  it('默认 spacing handler + LongestPath: 重叠节点约束压缩到间距 0', () => {
    const n1 = mkNode(0)
    const n2 = mkNode(100)
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const c1 = new LNodeCNode(n1)
    const c2 = new LNodeCNode(n2)
    c1.id = 0; c2.id = 1
    cg.cNodes.push(c1, c2)
    const g1 = new CGroup(c1)
    const g2 = new CGroup(c2)
    cg.cGroups.push(g1, g2)
    // 手工约束 c1→c2.
    c1.constraints.push(c2)
    const odc = new OneDimensionalCompactor(cg)
      .setCompactionAlgorithm(new LongestPathCompaction())
    odc.direction = Direction.LEFT
    odc.compact()
    // spacing 0: c2 紧贴 c1 (c1 起点 = 节点 x 最小值 0).
    expect(c2.startPos).toBe(50)
  })
})

describe('VerticalSegmentCNode (ELK Java 移植)', () => {
  it('applyElementPosition: 弯点/包围盒/junctionPoints 随 deltaX 平移', () => {
    const vs = new VerticalSegment({ x: 60, y: 0 }, { x: 60, y: 30 }, null, new LEdge())
    vs.affectedBoundingBoxes.push({ x: 55, y: 0, width: 10, height: 30 })
    vs.junctionPoints.push({ x: 60, y: 15 })
    const c = new VerticalSegmentCNode(vs)
    c.hitboxPreCompaction = { x: 60, y: 0, width: 0, height: 30 }
    c.hitbox.x = 40 // 压缩位移 -20.
    c.applyElementPosition()
    expect(vs.affectedBends[0]!.x).toBe(40)
    expect(vs.affectedBends[1]!.x).toBe(40)
    expect(vs.affectedBoundingBoxes[0]!.x).toBe(35)
    expect(vs.junctionPoints[0]!.x).toBe(40)
  })

  it('applyElementPosition: 无 hitboxPreCompaction 时 deltaX=0 (不动)', () => {
    const vs = new VerticalSegment({ x: 60, y: 0 }, { x: 60, y: 30 }, null, new LEdge())
    const c = new VerticalSegmentCNode(vs)
    c.applyElementPosition()
    expect(vs.affectedBends[0]!.x).toBe(60)
    expect(vs.affectedBends[1]!.x).toBe(60)
  })

  it('spacing 方法与 getElementPosition', () => {
    const vs = new VerticalSegment({ x: 60, y: 0 }, { x: 60, y: 30 }, null, new LEdge())
    const c = new VerticalSegmentCNode(vs)
    expect(c.getHorizontalSpacing()).toBe(0)
    expect(c.getVerticalSpacing()).toBe(0)
    expect(c.getElementPosition()).toBe(60)
  })
})
