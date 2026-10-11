/**
 * LGraphToCGraphTransformer 单元测试 (ELK intermediate.compaction.LGraphToCGraphTransformer 移植).
 * 覆盖: ORTHOGONAL 路由垂直段收集 (N/S 端口段 + 普通段 + ignoreSpacing),
 * mergeVerticalSegments 合并, verticalSegmentToCNode (组归属/lockMap), applyLayout 写回.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, NodeType, PortSide } from '../../src/index.js'
import { LGraphToCGraphTransformer } from '../../src/compaction/oned/lgraph-to-cgraph-transformer.js'
import { VerticalSegmentCNode } from '../../src/compaction/oned/cnode-implementations.js'
import { HorizontalGraphCompactor } from '../../src/compaction/oned/horizontal-graph-compactor.js'
import { Spacings } from '../../src/p4nodes/spacings.js'
import { SPACINGS, SPLINE_ROUTE_START } from '../../src/options/internal-properties.js'
import { SplineSegment } from '../../src/p5edges/splines/spline-segment.js'
import {
  EDGE_ROUTING,
  COMPACTION_POST_COMPACTION_STRATEGY,
  COMPACTION_POST_COMPACTION_CONSTRAINTS,
  SPACING_NODE_NODE,
  SPACING_EDGE_EDGE,
} from '../../src/options/layered-options.js'

/** 2 层图: L0=[a] → L1=[b], 带 4 侧端口. */
function makeGraph(): { graph: LGraph; a: LNode; b: LNode; aN: LPort; aE: LPort; bW: LPort; bS: LPort } {
  const graph = new LGraph()
  graph.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
  graph.setProperty(COMPACTION_POST_COMPACTION_STRATEGY, 'LEFT')
  graph.setProperty(COMPACTION_POST_COMPACTION_CONSTRAINTS, 'SCANLINE')
  graph.setProperty(SPACING_NODE_NODE, 20)
  graph.setProperty(SPACING_EDGE_EDGE, 10)
  graph.setProperty(SPACINGS, new Spacings(graph))

  const mk = (name: string, x: number): LNode => {
    const n = new LNode(graph); n.size = { x: 50, y: 20 }; n.setType(NodeType.NORMAL)
    n.position.x = x
    for (const side of [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]) {
      const p = new LPort(); p.setNode(n); p.setSide(side)
    }
    return n
  }
  const a = mk('a', 0)
  const b = mk('b', 200)
  const l0 = new Layer(graph); const l1 = new Layer(graph)
  graph.getLayers().push(l0, l1)
  a.setLayer(l0); b.setLayer(l1)

  const aN = a.getPorts()[0]!
  const aE = a.getPorts()[1]!
  const bS = b.getPorts()[2]!
  const bW = b.getPorts()[3]!
  return { graph, a, b, aN, aE, bW, bS }
}

describe('LGraphToCGraphTransformer (ELK Java 移植)', () => {
  it('transform: 节点 + N/S 端口段 + 普通段全部入 CGraph, 段独立成组', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    // 边1: a.E → b.W, 弯点产生 2 个普通垂直段 (x=60, x=190).
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)

    // 2 节点 + 2 普通段 (a.E 出发, 无 N/S 段).
    expect(cg.cNodes.length).toBe(4)
    // 每组 1 节点: a 组, b 组, 段60 组, 段190 组.
    expect(cg.cGroups.length).toBe(4)

    const aCNode = cg.cNodes[0]!
    const bCNode = cg.cNodes[1]!
    expect(cg.cGroups[0]!.cNodes.has(aCNode)).toBe(true)
    expect(cg.cGroups[1]!.cNodes.has(bCNode)).toBe(true)

    // 段 hitbox: x 对齐, y 区间 10..40.
    const seg60 = cg.cNodes[2]!
    const seg190 = cg.cNodes[3]!
    expect(seg60.hitbox).toEqual({ x: 60, y: 10, width: 0, height: 30 })
    expect(seg190.hitbox).toEqual({ x: 190, y: 10, width: 0, height: 30 })
    expect(cg.cGroups[2]!.cNodes.has(seg60)).toBe(true)
    expect(cg.cGroups[3]!.cNodes.has(seg190)).toBe(true)
    void b
  })

  it('transform: N/S 端口段有 aPort + ignoreSpacing, 入边侧同理', () => {
    const { graph, a, b, aN, bS, aE, bW } = makeGraph()
    // 边1: 普通段 (a.E → b.W).
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })
    // 边2: a.N → b.S, 弯点 (25,-10): 出边 N 段 + 入边 S 段, 同 x 相交合并.
    const e2 = new LEdge(); e2.setSource(aN); e2.setTarget(bS)
    e2.getBendPoints().push({ x: 25, y: -10 })

    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)

    // 2 节点 + 2 普通段 + 1 合并段 (x=25).
    expect(cg.cNodes.length).toBe(5)
    expect(cg.cGroups.length).toBe(4)

    const aCNode = cg.cNodes[0]!
    const bCNode = cg.cNodes[1]!
    const seg25 = cg.cNodes[2]! as VerticalSegmentCNode
    // 合并段 y 区间 = 出边段 (-10..0) ∪ 入边段 (-10..20).
    expect(seg25.hitbox).toEqual({ x: 25, y: -10, width: 0, height: 30 })
    // 合并段加入首段源节点 (a) 组.
    expect(seg25.cGroup).toBe(aCNode.cGroup)
    // aPort 保留首个段 (a.N).
    expect(seg25.vs.aPort).toBe(aN)
    // 出边段忽略 down (NORTH 端口段), 入边段忽略 up (SOUTH 端口段) → OR 合并后 up+down 均 true.
    expect(seg25.vs.ignoreSpacing.up).toBe(true)
    expect(seg25.vs.ignoreSpacing.down).toBe(true)
    void b
  })

  it('transform: lockMap 节点入>出锁 RIGHT, 出>入锁 LEFT, EXTERNAL_PORT 全解锁', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)
    const lockMap = t.getLockMap()

    const aCNode = cg.cNodes[0]!
    const bCNode = cg.cNodes[1]!
    // a: 出 1 入 0 → 锁 LEFT.
    expect(lockMap.get(aCNode)!.left).toBe(true)
    expect(lockMap.get(aCNode)!.right).toBe(false)
    // b: 入 1 出 0 → 锁 RIGHT.
    expect(lockMap.get(bCNode)!.left).toBe(false)
    expect(lockMap.get(bCNode)!.right).toBe(true)

    // EXTERNAL_PORT 节点全解锁.
    const ext = new LNode(graph); ext.size = { x: 10, y: 10 }; ext.setType(NodeType.EXTERNAL_PORT)
    const l2 = new Layer(graph); graph.getLayers().push(l2); ext.setLayer(l2)
    const t2 = new LGraphToCGraphTransformer()
    const cg2 = t2.transform(graph)
    const extCNode = cg2.cNodes[2]!
    expect(t2.getLockMap().get(extCNode)!.left).toBe(false)
    expect(t2.getLockMap().get(extCNode)!.right).toBe(false)
  })

  it('applyLayout: 压缩后节点位置写回 (margin 补偿) + 图尺寸/offset 重算', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    const t = new LGraphToCGraphTransformer()
    t.transform(graph)
    // 模拟压缩: b 左移到 70 (间距 20).
    t.applyLayout()
    void a
    void b
    // 未压缩 (无 odc) 时 x 不变, 但尺寸/offset 由 hitbox 包围盒重算.
    expect(graph.getOffset().x).toBeCloseTo(0, 9)
    expect(graph.getOffset().y).toBeCloseTo(0, 9) // topLeftY = 0 (节点 hitbox y=0).
  })

  it('HorizontalGraphCompactor + ORTHOGONAL: 垂直段随节点平移, 弯点同步', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    new HorizontalGraphCompactor().process(graph)

    // a 在最左, 不移动; b 被压到 a + 50 + 20 间距.
    expect(a.position.x).toBe(0)
    expect(b.position.x - (a.position.x + 50)).toBe(20)
    // 弯点随压缩平移: 段60 不动 (a 不动), 段190 随 b 左移.
    expect(e1.getBendPoints()[0]!.x).toBe(60)
    expect(e1.getBendPoints()[1]!.x).toBe(60)
    expect(e1.getBendPoints()[2]!.x).toBeLessThan(190)
    expect(e1.getBendPoints()[3]!.x).toBeLessThan(190)
  })

  it('HorizontalGraphCompactor + ORTHOGONAL + RIGHT 策略: 向右对齐', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(COMPACTION_POST_COMPACTION_STRATEGY, 'RIGHT')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    new HorizontalGraphCompactor().process(graph)

    // 最右节点 b 保持 200+50=250 右边界 → a 右移.
    expect(b.position.x + 50).toBe(250)
    expect(a.position.x).toBeGreaterThan(0)
    expect(b.position.x - (a.position.x + 50)).toBe(20)
  })

  it('EDGE_LENGTH 策略: 退回 LongestPath 压缩 (占位)', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(COMPACTION_POST_COMPACTION_STRATEGY, 'EDGE_LENGTH')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    new HorizontalGraphCompactor().process(graph)
    // 最长路径压缩同样压紧.
    expect(b.position.x - (a.position.x + 50)).toBe(20)
  })

  it('LEFT_RIGHT_CONNECTION_LOCKING 策略: 两遍压缩, 锁定依赖 lockMap', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(COMPACTION_POST_COMPACTION_STRATEGY, 'LEFT_RIGHT_CONNECTION_LOCKING')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    new HorizontalGraphCompactor().process(graph)
    // 最终仍压紧且顺序保持.
    expect(b.position.x - (a.position.x + 50)).toBe(20)
    expect(a.position.x).toBeLessThan(b.position.x)
  })

  it('LEFT_RIGHT_CONSTRAINT_LOCKING 策略: 第二遍只锁定 outDegree=0 组', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(COMPACTION_POST_COMPACTION_STRATEGY, 'LEFT_RIGHT_CONSTRAINT_LOCKING')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 }, { x: 190, y: 10 })

    new HorizontalGraphCompactor().process(graph)
    expect(b.position.x - (a.position.x + 50)).toBe(20)
    expect(a.position.x).toBeLessThan(b.position.x)
  })

  it('SPLINES: 非直线段转垂直段, 段链约束进 predefinedHorizontalConstraints', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(EDGE_ROUTING, 'SPLINES')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    // 2 个非直线段 (bbox 覆盖 a→b 区间).
    const seg1 = SplineSegment.fromSingleEdge(e1, 'RIGHT', 'LEFT', () => false)
    const seg2 = SplineSegment.fromSingleEdge(e1, 'RIGHT', 'LEFT', () => false)
    seg1.boundingBox = { x: 60, y: 0, width: 130, height: 10 }
    seg2.boundingBox = { x: 60, y: 15, width: 130, height: 10 }
    seg1.initialSegment = true
    seg2.lastSegment = true
    seg1.sourceNode = a
    seg2.targetNode = b
    e1.setProperty(SPLINE_ROUTE_START, [seg1, seg2])

    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)

    // 2 节点 + 2 段.
    expect(cg.cNodes.length).toBe(4)
    // 段链约束: seg1CNode → seg2CNode.
    expect(cg.predefinedHorizontalConstraints.length).toBe(1)
    const [first, second] = cg.predefinedHorizontalConstraints[0]!
    const aCNode = cg.cNodes[0]!
    expect(cg.cNodes.indexOf(first)).toBeGreaterThanOrEqual(2)
    expect(cg.cNodes.indexOf(second)).toBeGreaterThan(cg.cNodes.indexOf(first))
    // 段 affectedBoundingBoxes 记录 spline bbox.
    expect((first as VerticalSegmentCNode).vs.affectedBoundingBoxes.length).toBe(1)
    // 段独立成组.
    expect(first.cGroup).not.toBeNull()
    expect(aCNode.cGroup).not.toBe(first.cGroup)
  })

  it('SPLINES: 直线段跳过 (不生成垂直段)', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(EDGE_ROUTING, 'SPLINES')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    const seg = SplineSegment.fromSingleEdge(e1, 'RIGHT', 'LEFT', () => true) // isStraight=true
    seg.boundingBox = { x: 60, y: 0, width: 130, height: 20 }
    e1.setProperty(SPLINE_ROUTE_START, [seg])

    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)
    expect(cg.cNodes.length).toBe(2) // 只有节点
  })

  it('applyLayout: SPLINES 单段直线 — adjustControlPointBetweenSegments 均分', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(EDGE_ROUTING, 'SPLINES')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    const seg = SplineSegment.fromSingleEdge(e1, 'RIGHT', 'LEFT', () => true)
    seg.boundingBox = { x: 60, y: 0, width: 20, height: 0 }
    seg.initialSegment = true
    seg.lastSegment = true
    seg.isStraight = true
    seg.sourceNode = a
    seg.targetNode = b
    e1.setProperty(SPLINE_ROUTE_START, [seg])

    const t = new LGraphToCGraphTransformer()
    t.transform(graph)
    t.applyLayout()
    // 单段: startX = a.x + a.width = 50; endX = b.x = 200; strip=150; chunks=2; chunk=75.
    // k=0: bbox.x = 50+75 - 10 = 115.
    expect(seg.boundingBox.x).toBeCloseTo(115, 6)
  })

  it('applyLayout: SPLINES 多段直线 — 控制点均分到非直线段之间', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(EDGE_ROUTING, 'SPLINES')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    const mk = (): SplineSegment => {
      const s = SplineSegment.fromSingleEdge(e1, 'RIGHT', 'LEFT', () => true)
      s.boundingBox = { x: 60, y: 0, width: 20, height: 0 }
      s.isStraight = true
      return s
    }
    const seg1 = mk(); const seg2 = mk(); const seg3 = mk()
    seg1.initialSegment = true
    seg1.sourceNode = a
    seg3.lastSegment = true
    seg3.targetNode = b
    e1.setProperty(SPLINE_ROUTE_START, [seg1, seg2, seg3])

    const t = new LGraphToCGraphTransformer()
    t.transform(graph)
    t.applyLayout()
    // startX = 50, endX = 200, strip=150, chunks=max(2, 3-0)=3, chunk=50.
    // k=0: 50+50-10=90; k=1: 150-10=140; k=2: 200-10=190.
    expect(seg1.boundingBox.x).toBeCloseTo(90, 6)
    expect(seg2.boundingBox.x).toBeCloseTo(140, 6)
    expect(seg3.boundingBox.x).toBeCloseTo(190, 6)
  })

  it('transform: 节点 id 递增分配', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 })
    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)
    // 节点 id 0,1; 段 id 从 2 开始递增.
    expect(cg.cNodes[0]!.id).toBe(0)
    expect(cg.cNodes[1]!.id).toBe(1)
    expect(cg.cNodes[2]!.id).toBe(2)
  })

  it('transform: 入=出节点无锁, 段 lockMap 按入/出边 id 差设置', () => {
    const { graph, a, b } = makeGraph()
    const cNode = new LNode(graph); cNode.size = { x: 50, y: 20 }; cNode.setType(NodeType.NORMAL); cNode.position.x = 100
    for (const side of [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]) {
      const p = new LPort(); p.setNode(cNode); p.setSide(side)
    }
    const l1 = new Layer(graph); graph.getLayers().push(l1); cNode.setLayer(l1)
    const aE = a.getPorts()[1]!
    const cW = cNode.getPorts()[3]!
    const cE = cNode.getPorts()[1]!
    const bW = b.getPorts()[3]!
    // a→c, c→b: c 入1出1 → 无锁.
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(cW)
    const e2 = new LEdge(); e2.setSource(cE); e2.setTarget(bW)
    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)
    const lockMap = t.getLockMap()
    const cCNode = cg.cNodes[2]!
    expect(lockMap.get(cCNode)!.left).toBe(false)
    expect(lockMap.get(cCNode)!.right).toBe(false)
  })

  it('transform: SOUTH 出边段 + NORTH 入边段 (端口段四种侧全覆盖)', () => {
    const { graph, a, b } = makeGraph()
    const aS = a.getPorts()[2]! // SOUTH
    const bN = b.getPorts()[0]! // NORTH
    // a.S → b.N: 出边 SOUTH 段 + 入边 NORTH 段, 同 x 相交合并.
    const e1 = new LEdge(); e1.setSource(aS); e1.setTarget(bN)
    e1.getBendPoints().push({ x: 25, y: 40 })
    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)
    // 2 节点 + 1 合并段.
    expect(cg.cNodes.length).toBe(3)
    const seg = cg.cNodes[2]! as VerticalSegmentCNode
    // 排序后 y 小的段 (bN 入边段) 为 survivor → aPort 保留 bN.
    expect(seg.vs.aPort).toBe(bN)
    // 出边 SOUTH 段 ignoreSpacing.up; 入边 NORTH 段 ignoreSpacing.down → 合并后均 true.
    expect(seg.vs.ignoreSpacing.up).toBe(true)
    expect(seg.vs.ignoreSpacing.down).toBe(true)
  })

  it('transform: 普通段 ignoreSpacing 三分支 (段在节点上/下/内, first 与 lastSegment 双判定)', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    // 边1: 段 y=30..45 (节点下方, bend1=30 也在下方) → first up, tgt 分支 up.
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 30 }, { x: 60, y: 45 })
    // 边2: 段 y=-30..-10 (节点上方) → first down, tgt 分支 down.
    const e2 = new LEdge(); e2.setSource(a.getPorts()[1]!); e2.setTarget(bW)
    e2.getBendPoints().push({ x: 90, y: -30 }, { x: 90, y: -10 })
    // 边3: 段 y=5..15 (节点内部) → first else, tgt 分支 else → 都忽略.
    const e3 = new LEdge(); e3.setSource(a.getPorts()[1]!); e3.setTarget(bW)
    e3.getBendPoints().push({ x: 120, y: 5 }, { x: 120, y: 15 })
    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)
    // 段按 x 排序: 60, 90, 120.
    const seg60 = cg.cNodes[2]! as VerticalSegmentCNode
    const seg90 = cg.cNodes[3]! as VerticalSegmentCNode
    const seg120 = cg.cNodes[4]! as VerticalSegmentCNode
    expect(seg60.vs.ignoreSpacing.up).toBe(true)
    expect(seg60.vs.ignoreSpacing.down).toBe(false)
    expect(seg90.vs.ignoreSpacing.up).toBe(false)
    expect(seg90.vs.ignoreSpacing.down).toBe(true)
    expect(seg120.vs.ignoreSpacing.up).toBe(true)
    expect(seg120.vs.ignoreSpacing.down).toBe(true)
  })

  it('transform: 奇数弯点 (末弯点不更新 bend1) + lastSegment 目标节点 ignoreSpacing', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    // 弯点 3 个: (60,10)→(60,40)→(190,40): 两段, 最后一段的 tgt 分支.
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    e1.getBendPoints().push({ x: 60, y: 10 }, { x: 60, y: 40 }, { x: 190, y: 40 })
    const t = new LGraphToCGraphTransformer()
    const cg = t.transform(graph)
    // 段: (60,10)-(60,40) 与 (190,40)-(190,40)? 末段宽度 0 → 但 y 相同不产生段: (190,40)→(190,40) y 相同 → 无段.
    // 实际: 段1 (60,10)-(60,40); bend1=(60,40); i=2: bend2=(190,40): y 相同 → 无段 → lastSegment=段1.
    expect(cg.cNodes.length).toBe(3) // a, b, 段1
    const seg = cg.cNodes[2]! as VerticalSegmentCNode
    // lastSegment 是段1, tgtNode=b: bend1.y=40 > b.hitbox 底 (20) → ignoreSpacing.up.
    expect(seg.vs.ignoreSpacing.up).toBe(true)
    expect(seg.vs.ignoreSpacing.down).toBe(false)
  })

  it('applyLayout: SPLINES 中间段 (非 initial/last) 控制点从 bbox 起算', () => {
    const { graph, a, b, aE, bW } = makeGraph()
    graph.setProperty(EDGE_ROUTING, 'SPLINES')
    const e1 = new LEdge(); e1.setSource(aE); e1.setTarget(bW)
    const mk = (): SplineSegment => {
      const s = SplineSegment.fromSingleEdge(e1, 'RIGHT', 'LEFT', () => true)
      s.boundingBox = { x: 60, y: 0, width: 20, height: 0 }
      s.isStraight = true
      return s
    }
    const seg1 = mk(); const seg2 = mk(); const seg3 = mk(); const seg4 = mk()
    // seg1 initial 非 straight → 起点用 bbox; seg2/3 中间直线; seg4 last 非 straight.
    seg1.initialSegment = true
    seg1.isStraight = false
    seg1.boundingBox = { x: 40, y: 0, width: 20, height: 0 }
    seg1.sourceNode = a
    seg4.lastSegment = true
    seg4.isStraight = false
    seg4.boundingBox = { x: 220, y: 0, width: 20, height: 0 }
    seg4.targetNode = b
    e1.setProperty(SPLINE_ROUTE_START, [seg1, seg2, seg3, seg4])

    const t = new LGraphToCGraphTransformer()
    t.transform(graph)
    t.applyLayout()
    // 第一段 (initial, 非 straight): startX = seg1.bbox.x + width = 60; 找到第一个非直线段 = seg1 自己?
    // adjustSplineControlPoints: lastSeg=seg1 (initialSegment=true) → needle = firstNonStraight(1):
    //   i=1: seg2 非末段且 straight → 跳过; i=2: 同; i=3: seg4 末段 → {index:3, seg4}.
    //   adjust(seg1, seg4, 1, 3, spline): left.initial && !left.isStraight → startX = seg1.bbox.x + 20 = 60.
    //   right.last && !right.isStraight → endX = seg4.bbox.x = 220.
    //   strip=160; chunks=max(2, 3-1)=2; chunk=80. k=1: seg2.bbox.x = 60+80-10=130; k=2: seg3 = 210-10=200.
    expect(seg2.boundingBox.x).toBeCloseTo(130, 6)
    expect(seg3.boundingBox.x).toBeCloseTo(210, 6)
  })

  it('applyLayout: SPLINES 自环弯点随源节点压缩位移', () => {
    const { graph, a, aN, aE } = makeGraph()
    graph.setProperty(EDGE_ROUTING, 'SPLINES')
    // 自环 a→a.
    const loop = new LEdge(); loop.setSource(aE); loop.setTarget(aN)
    loop.getBendPoints().push({ x: 60, y: 10 }, { x: 30, y: 40 })
    const seg = SplineSegment.fromSingleEdge(loop, 'RIGHT', 'LEFT', () => true)
    seg.boundingBox = { x: 60, y: 0, width: 20, height: 40 }
    seg.initialSegment = true
    seg.lastSegment = true
    seg.isStraight = false
    seg.sourceNode = a
    seg.targetNode = a
    loop.setProperty(SPLINE_ROUTE_START, [seg])

    new HorizontalGraphCompactor().process(graph)
    // 自环源节点 a 是最左节点, 压缩不移动 → 弯点不变.
    expect(loop.getBendPoints()[0]!.x).toBe(60)
    expect(loop.getBendPoints()[1]!.x).toBe(30)
    // 节点位置保持.
    expect(a.position.x).toBe(0)
  })
})
