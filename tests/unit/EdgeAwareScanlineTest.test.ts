/**
 * EdgeAwareScanlineConstraintCalculation 单元测试 (ELK intermediate.compaction.EdgeAwareScanline 移植).
 * 覆盖: SPLINES / ORTHOGONAL 双分支的两遍扫描流程, alterHitbox (段/节点), alterGroupedHitboxOrthogonal,
 * minSpacing 计算与 hitbox 恢复.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LEdge, Direction, NodeType } from '../../src/index.js'
import { CGraph } from '../../src/compaction/oned/cgraph.js'
import { CGroup } from '../../src/compaction/oned/cgroup.js'
import { OneDimensionalCompactor } from '../../src/compaction/oned/oned-compactor.js'
import { LNodeCNode, VerticalSegmentCNode } from '../../src/compaction/oned/cnode-implementations.js'
import { VerticalSegment } from '../../src/compaction/oned/vertical-segment.js'
import { EdgeAwareScanlineConstraintCalculation } from '../../src/compaction/oned/edge-aware-scanline.js'
import { Spacings } from '../../src/p4nodes/spacings.js'
import { SPACINGS } from '../../src/options/internal-properties.js'
import {
  EDGE_ROUTING,
  SPACING_NODE_NODE,
  SPACING_EDGE_EDGE,
} from '../../src/options/layered-options.js'

/** 构造带 2 节点的 LGraph (节点互相独立成组). */
function makeGraph(edgeRouting: string): { graph: LGraph; a: LNode; b: LNode } {
  const graph = new LGraph()
  graph.setProperty(EDGE_ROUTING, edgeRouting)
  graph.setProperty(SPACING_NODE_NODE, 20)
  graph.setProperty(SPACING_EDGE_EDGE, 10)
  graph.setProperty(SPACINGS, new Spacings(graph))
  const a = new LNode(graph); a.size = { x: 50, y: 20 }; a.setType(NodeType.NORMAL); a.position.x = 0
  const b = new LNode(graph); b.size = { x: 50, y: 20 }; b.setType(NodeType.NORMAL); b.position.x = 100
  return { graph, a, b }
}

function nodeCNode(node: LNode): LNodeCNode {
  return new LNodeCNode(node)
}

describe('EdgeAwareScanlineConstraintCalculation (ELK Java 移植)', () => {
  it('SPLINES: 两遍扫描, 重叠节点产生约束, hitbox 恢复原样', () => {
    const { graph, a, b } = makeGraph('SPLINES')
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    ca.id = 0; cb.id = 1
    cg.cNodes.push(ca, cb)
    // 节点独立成组.
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    cg.cGroups.push(gA, gB)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)

    // 两节点 y 重叠 → 约束 a→b.
    expect(ca.constraints).toContain(cb)
    expect(cb.constraints).not.toContain(ca)
    // 约束方向: a 在左, b 在右 (LEFT 压缩目标在左).
    // hitbox 经 blowUp/normalize 成对恢复.
    expect(ca.hitbox).toEqual({ x: 0, y: 0, width: 50, height: 20 })
    expect(cb.hitbox).toEqual({ x: 100, y: 0, width: 50, height: 20 })
  })

  it('SPLINES: 压缩后节点保持 spacing 间距', () => {
    const { graph, a, b } = makeGraph('SPLINES')
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    ca.id = 0; cb.id = 1
    cg.cNodes.push(ca, cb)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    cg.cGroups.push(gA, gB)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
      .setSpacingsHandler({ getHorizontalSpacing: () => 20, getVerticalSpacing: () => 0 })
    odc.compact()
    // LongestPath: b >= a + 50 + spacing(节点 20) → EdgeAwareScanline 约束由扫描线给出.
    expect(cb.startPos).toBeGreaterThanOrEqual(ca.startPos + 50 + 20)
  })

  it('SPLINES: 带垂直段 — 段不扩展, 节点按 minSpacing 扩展后整体扫描', () => {
    const { graph, a, b } = makeGraph('SPLINES')
    const edge = new LEdge()
    const vs = new VerticalSegment({ x: 60, y: 0 }, { x: 60, y: 30 }, null, edge)
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    const cv = new VerticalSegmentCNode(vs)
    ca.id = 0; cb.id = 1; cv.id = 2
    cg.cNodes.push(ca, cb, cv)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    const gV = new CGroup(cv)
    cg.cGroups.push(gA, gB, gV)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)

    // SPLINES 分支: 只有节点扩展, 段保持原样 → a→段, 段→b (a 与 b 不直接约束).
    expect(ca.constraints.map(c => c.id)).toEqual([cv.id])
    expect(cv.constraints.map(c => c.id)).toEqual([cb.id])
    // 节点精确恢复; 段未被 alter → 无残留.
    expect(ca.hitbox).toEqual({ x: 0, y: 0, width: 50, height: 20 })
    expect(cb.hitbox).toEqual({ x: 100, y: 0, width: 50, height: 20 })
    expect(cv.hitbox).toEqual({ x: 60, y: 0, width: 0, height: 30 })
  })

  it('SPLINES: EXTERNAL_PORT 节点被 minSpacing 排除 (∞ 不参与)', () => {
    const { graph, a, b } = makeGraph('SPLINES')
    const ext = new LNode(graph); ext.size = { x: 10, y: 10 }; ext.setType(NodeType.EXTERNAL_PORT); ext.position.x = 50; ext.position.y = 100
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    const ce = nodeCNode(ext)
    ca.id = 0; cb.id = 1; ce.id = 2
    cg.cNodes.push(ca, cb, ce)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    const gE = new CGroup(ce)
    cg.cGroups.push(gA, gB, gE)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)
    // ext 在 y=100 与节点不相交 → 无约束.
    expect(ce.constraints.length).toBe(0)
    // 外部端口不参与 minSpacing → 但其他节点仍产生约束.
    expect(ca.constraints).toContain(cb)
  })

  it('ORTHOGONAL: 垂直段先扫 (段间约束), 节点与组扩展后整体扫描', () => {
    const { graph, a, b } = makeGraph('ORTHOGONAL')
    // 构造一个垂直段: x=60, y 区间 0..30 (位于两节点之间).
    const edge = new LEdge()
    const vs = new VerticalSegment({ x: 60, y: 0 }, { x: 60, y: 30 }, null, edge)
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    const cv = new VerticalSegmentCNode(vs)
    ca.id = 0; cb.id = 1; cv.id = 2
    cg.cNodes.push(ca, cb, cv)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    const gV = new CGroup(cv)
    cg.cGroups.push(gA, gB, gV)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)

    // 段 60 位于 a(0-50) 与 b(100-150) 之间 → 约束: a→段, 段→b (a 与 b 也重叠 → a→b).
    expect(ca.constraints.map(c => c.id)).toEqual([cb.id, cv.id])
    expect(cv.constraints.map(c => c.id)).toEqual([cb.id])
    // 恢复后 hitbox 与构造一致 (alter 成对); 段经组扩展残留 ±0.04 (SMALL_EPSILON 不对称, 与 Java 一致).
    expect(ca.hitbox).toEqual({ x: 0, y: 0, width: 50, height: 20 })
    expect(cb.hitbox).toEqual({ x: 100, y: 0, width: 50, height: 20 })
    expect(cv.hitbox.x).toBe(60)
    expect(cv.hitbox.y).toBeCloseTo(-0.04, 2)
    expect(cv.hitbox.width).toBeCloseTo(0, 2)
    expect(cv.hitbox.height).toBeCloseTo(30.04, 2)
  })

  it('ORTHOGONAL: N/S 端口段 (ignoreSpacing.up) 参与 alterGroupedHitboxOrthogonal 反向扩展', () => {
    const { graph, a } = makeGraph('ORTHOGONAL')
    const b = new LNode(graph); b.size = { x: 50, y: 20 }; b.setType(NodeType.NORMAL); b.position.x = 100; b.position.y = 50
    // 段与 a 同组 (南向端口段: ignoreSpacing.up=true).
    const edge = new LEdge()
    const vs = new VerticalSegment({ x: 20, y: 20 }, { x: 20, y: 40 }, a as never, edge)
    vs.ignoreSpacing.up = true
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    const cv = new VerticalSegmentCNode(vs)
    ca.id = 0; cb.id = 1; cv.id = 2
    cg.cNodes.push(ca, cb, cv)
    // a 组 = master(a) + 段 (N/S 端口段归属源节点组).
    const gA = new CGroup(ca)
    gA.addCNode(cv)
    const gB = new CGroup(cb)
    cg.cGroups.push(gA, gB)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)

    // 组扩展后恢复: 段 y 残留 +0.02 (SMALL_EPSILON 不对称); height 第一遍 +0.02 与组 -0.02 抵消 → 20.
    expect(cv.hitbox.x).toBe(20)
    expect(cv.hitbox.y).toBeCloseTo(20.02, 2)
    expect(cv.hitbox.width).toBeCloseTo(0, 2)
    expect(cv.hitbox.height).toBeCloseTo(20, 2)
    expect(ca.hitbox).toEqual({ x: 0, y: 0, width: 50, height: 20 })
  })

  it('ORTHOGONAL: 段 y 区间相离 → 段间无约束', () => {
    const { graph, a, b } = makeGraph('ORTHOGONAL')
    const edge = new LEdge()
    // 段在 y=100, 与节点完全分离.
    const vs = new VerticalSegment({ x: 60, y: 100 }, { x: 60, y: 130 }, null, edge)
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    const cv = new VerticalSegmentCNode(vs)
    ca.id = 0; cb.id = 1; cv.id = 2
    cg.cNodes.push(ca, cb, cv)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    const gV = new CGroup(cv)
    cg.cGroups.push(gA, gB, gV)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)

    // 段与节点 y 不相交 → 无约束涉及段.
    expect(ca.constraints).not.toContain(cv)
    expect(cv.constraints).toHaveLength(0)
  })

  it('ORTHOGONAL: up+down 双忽略段 — alterHitbox 两分支都不执行', () => {
    const { graph, a, b } = makeGraph('ORTHOGONAL')
    const edge = new LEdge()
    const vs = new VerticalSegment({ x: 60, y: 0 }, { x: 60, y: 30 }, null, edge)
    vs.ignoreSpacing.up = true
    vs.ignoreSpacing.down = true
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    const cv = new VerticalSegmentCNode(vs)
    ca.id = 0; cb.id = 1; cv.id = 2
    cg.cNodes.push(ca, cb, cv)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    const gV = new CGroup(cv)
    cg.cGroups.push(gA, gB, gV)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)

    // 双忽略段: 第一遍 alterHitbox 无操作; 独立组扩展走 alterHitbox 也无操作 → 无残留.
    expect(cv.hitbox).toEqual({ x: 60, y: 0, width: 0, height: 30 })
    // 段仍参与约束: a→段 (y 重叠).
    expect(ca.constraints).toContain(cv)
  })

  it('SPLINES: 节点初始不重叠, minSpacing 扩展后重叠 → 约束产生', () => {
    const { graph, a } = makeGraph('SPLINES')
    const b = new LNode(graph); b.size = { x: 50, y: 10 }; b.setType(NodeType.NORMAL)
    b.position.x = 100; b.position.y = 15 // y 差 5 < minSpacing 9.5 → 扩展后重叠.
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    ca.id = 0; cb.id = 1
    cg.cNodes.push(ca, cb)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    cg.cGroups.push(gA, gB)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)
    // 扩展后重叠 → a→b.
    expect(ca.constraints.map(c => c.id)).toEqual([cb.id])
    // 恢复精确.
    expect(ca.hitbox).toEqual({ x: 0, y: 0, width: 50, height: 20 })
    expect(cb.hitbox).toEqual({ x: 100, y: 15, width: 50, height: 10 })
  })

  it('ORTHOGONAL: 空组 (无成员) 的 alterGroupedHitboxOrthogonal 直接返回', () => {
    const { graph, a } = makeGraph('ORTHOGONAL')
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    ca.id = 0
    cg.cNodes.push(ca)
    const gA = new CGroup(ca)
    const gEmpty = new CGroup() // 空组 (无 master).
    cg.cGroups.push(gA, gEmpty)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)
    // 空组被跳过, 不抛错.
    expect(ca.hitbox).toEqual({ x: 0, y: 0, width: 50, height: 20 })
  })

  it('SPLINES: 全 EXTERNAL_PORT 图 → minSpacing 回落 0', () => {
    const { graph } = makeGraph('SPLINES')
    const ext1 = new LNode(graph); ext1.size = { x: 10, y: 10 }; ext1.setType(NodeType.EXTERNAL_PORT)
    ext1.position.x = 0
    const ext2 = new LNode(graph); ext2.size = { x: 10, y: 10 }; ext2.setType(NodeType.EXTERNAL_PORT)
    ext2.position.x = 100; ext2.position.y = 5
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const c1 = nodeCNode(ext1)
    const c2 = nodeCNode(ext2)
    c1.id = 0; c2.id = 1
    cg.cNodes.push(c1, c2)
    const g1 = new CGroup(c1)
    const g2 = new CGroup(c2)
    cg.cGroups.push(g1, g2)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)
    // minSpacing=0 → 无扩展; 外部端口 y 重叠 (5) → 约束仍产生 (hitbox 未扩展, 原样重叠).
    expect(c1.hitbox).toEqual({ x: 0, y: 0, width: 10, height: 10 })
    expect(c1.constraints).toContain(c2)
  })

  it('ORTHOGONAL: 段 y 区间相离 → 段间无约束', () => {
    const { graph, a, b } = makeGraph('ORTHOGONAL')
    const edge = new LEdge()
    // 段在 y=100, 与节点完全分离.
    const vs = new VerticalSegment({ x: 60, y: 100 }, { x: 60, y: 130 }, null, edge)
    const cg = new CGraph([Direction.LEFT, Direction.RIGHT])
    const ca = nodeCNode(a)
    const cb = nodeCNode(b)
    const cv = new VerticalSegmentCNode(vs)
    ca.id = 0; cb.id = 1; cv.id = 2
    cg.cNodes.push(ca, cb, cv)
    const gA = new CGroup(ca)
    const gB = new CGroup(cb)
    const gV = new CGroup(cv)
    cg.cGroups.push(gA, gB, gV)

    const odc = new OneDimensionalCompactor(cg)
      .setConstraintAlgorithm(new EdgeAwareScanlineConstraintCalculation(graph))
    odc.changeDirection(Direction.LEFT)

    // 段与节点 y 不相交 → 无约束涉及段.
    expect(ca.constraints).not.toContain(cv)
    expect(cv.constraints).toHaveLength(0)
  })
})
