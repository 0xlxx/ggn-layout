/**
 * OrthogonalRoutingGenerator (ELK p5edges.orthogonal.OrthogonalRoutingGenerator) 语义单元测试.
 * SSOT: ELK Java 0.12.0 OrthogonalRoutingGenerator.java + WestToEastRoutingStrategy.java.
 *
 * 覆盖: routeEdges 槽数 + 弯点 (2 弯点 / split S 形 4 弯点)、超边合并、critical 冲突环 → splitSegments、
 * regular 依赖 → breakNonCriticalCycles、topologicalNumbering 槽位分配、routeEdgesSlotCount (NaN 不生成弯点)、
 * routeEdgesForDirection (SOUTH_TO_NORTH / NORTH_TO_SOUTH 弯点方向)、countCrossings.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide } from '../../src/index.js'
import { OrthogonalRoutingGenerator, countCrossings, topologicalNumbering, breakNonCriticalCycles } from '../../src/p5edges/orthogonal/orthogonal-routing-generator.js'
import { HyperEdgeSegment } from '../../src/p5edges/orthogonal/hyper-edge-segment.js'
import { HyperEdgeSegmentDependency } from '../../src/p5edges/orthogonal/hyper-edge-segment-dependency.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { SOUTH_TO_NORTH, NORTH_TO_SOUTH } from '../../src/p5edges/orthogonal/orthogonal-routing-generator.js'

const randomStub = new JavaRandom(1)

function nodeAt(g: LGraph, x: number, y: number): LNode {
  const n = new LNode(g)
  n.position = { x, y }
  n.size = { x: 20, y: 20 }
  return n
}

/** 端口: side + 绝对锚点 (anchor 归零后 position 对齐绝对坐标). */
function portAt(n: LNode, side: PortSide, absX: number, absY: number): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  p.setAnchor({ x: 0, y: 0 })
  p.position = { x: absX - n.position.x, y: absY - n.position.y }
  return p
}

function edge(s: LPort, t: LPort): LEdge {
  const e = new LEdge()
  e.setSource(s)
  e.setTarget(t)
  return e
}

function ortho(bps: { x: number; y: number }[]): boolean {
  for (let i = 1; i < bps.length; i++) {
    const a = bps[i - 1]!, b = bps[i]!
    if (Math.abs(a.x - b.x) > 1e-6 && Math.abs(a.y - b.y) > 1e-6) return false
  }
  return true
}

describe('OrthogonalRoutingGenerator.routeEdges (W-E)', () => {
  it('斜对角边: 槽数 2 + 每边 2 个正交弯点 (segmentX = startPos + slot*edgeSpacing)', () => {
    const g = new LGraph()
    const A = nodeAt(g, 0, 10), B = nodeAt(g, 0, 20)
    const D = nodeAt(g, 100, 50), E = nodeAt(g, 100, 60)
    const pA = portAt(A, PortSide.EAST, 20, 10), pB = portAt(B, PortSide.EAST, 20, 20)
    const pD = portAt(D, PortSide.WEST, 0, 50), pE = portAt(E, PortSide.WEST, 0, 60)
    const eAD = edge(pA, pD), eBE = edge(pB, pE)

    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdges([A, B], [D, E], 10, randomStub)

    expect(slots).toBe(2)
    // S1 (A→D) slot=1 → segmentX=30; S2 (B→E) slot=0 → segmentX=10
    expect(eAD.getBendPoints().map(p => [p.x, p.y])).toEqual([[30, 10], [30, 50]])
    expect(eBE.getBendPoints().map(p => [p.x, p.y])).toEqual([[10, 20], [10, 60]])
    expect(ortho(eAD.getBendPoints())).toBe(true)
    expect(ortho(eBE.getBendPoints())).toBe(true)
  })

  it('直线边 (源/目标 Y 一致): 槽数 0, 无弯点', () => {
    const g = new LGraph()
    const A = nodeAt(g, 0, 10), D = nodeAt(g, 100, 10)
    const pA = portAt(A, PortSide.EAST, 20, 10), pD = portAt(D, PortSide.WEST, 0, 10)
    const eAD = edge(pA, pD)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdges([A], [D], 10, randomStub)
    expect(slots).toBe(0)
    expect(eAD.getBendPoints().length).toBe(0)
  })

  it('超边: 一个 EAST 端口连多个 WEST 端口 → 单 segment, 槽数 1, 每条边 2 弯点', () => {
    const g = new LGraph()
    const A = nodeAt(g, 0, 10)
    const D1 = nodeAt(g, 100, 50), D2 = nodeAt(g, 100, 70)
    const pA = portAt(A, PortSide.EAST, 20, 10)
    const pD1 = portAt(D1, PortSide.WEST, 0, 50), pD2 = portAt(D2, PortSide.WEST, 0, 70)
    const e1 = edge(pA, pD1), e2 = edge(pA, pD2)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdges([A], [D1, D2], 10, randomStub)
    expect(slots).toBe(1)
    for (const e of [e1, e2]) {
      const bps = e.getBendPoints()
      expect(bps.length).toBe(2)
      expect(Math.abs(bps[0]!.x - 10) < 1e-6).toBe(true)
      expect(Math.abs(bps[0]!.x - bps[1]!.x) < 1e-6).toBe(true)
    }
  })

  it('critical 冲突环 → splitSegments: 拆分段所在边生成 S 形 4 弯点, 全部正交', () => {
    // S1: 10→55, S2: 55→90, S3: 90→10; incoming/outgoing 最小间距 35 → criticalThreshold=7,
    // 相邻段 outgoing/incoming 差 0 → 全部 critical 冲突 → 3 环 → split.
    const g = new LGraph()
    const A = nodeAt(g, 0, 10), B = nodeAt(g, 0, 55), C = nodeAt(g, 0, 90)
    const D = nodeAt(g, 100, 55), E = nodeAt(g, 100, 90), F = nodeAt(g, 100, 10)
    const pA = portAt(A, PortSide.EAST, 20, 10), pB = portAt(B, PortSide.EAST, 20, 55), pC = portAt(C, PortSide.EAST, 20, 90)
    const pD = portAt(D, PortSide.WEST, 0, 55), pE = portAt(E, PortSide.WEST, 0, 90), pF = portAt(F, PortSide.WEST, 0, 10)
    const eAD = edge(pA, pD), eBE = edge(pB, pE), eCF = edge(pC, pF)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdges([A, B, C], [D, E, F], 10, randomStub)

    expect(slots).toBeGreaterThanOrEqual(2)
    const all = [eAD, eBE, eCF]
    const sBends = all.filter(e => e.getBendPoints().length === 4)
    // 至少一条边被 S 形拆分 (4 弯点)
    expect(sBends.length).toBeGreaterThan(0)
    // 其余边 2 弯点
    for (const e of all) {
      expect([2, 4]).toContain(e.getBendPoints().length)
      expect(ortho(e.getBendPoints())).toBe(true)
    }
  })

  it('routeEdgesSlotCount (startPos=NaN): 只算槽数, 不生成弯点', () => {
    const g = new LGraph()
    const A = nodeAt(g, 0, 10), B = nodeAt(g, 0, 20)
    const D = nodeAt(g, 100, 50), E = nodeAt(g, 100, 60)
    const pA = portAt(A, PortSide.EAST, 20, 10), pB = portAt(B, PortSide.EAST, 20, 20)
    const pD = portAt(D, PortSide.WEST, 0, 50), pE = portAt(E, PortSide.WEST, 0, 60)
    const eAD = edge(pA, pD), eBE = edge(pB, pE)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdgesSlotCount([A, B], [D, E], randomStub)
    expect(slots).toBe(2)
    expect(eAD.getBendPoints().length).toBe(0)
    expect(eBE.getBendPoints().length).toBe(0)
  })
})

describe('OrthogonalRoutingGenerator.routeEdgesForDirection (N-S)', () => {
  it('SOUTH_TO_NORTH: 向上 (segmentY = startPos - slot*spacing), 弯点正交', () => {
    const g = new LGraph()
    const A = nodeAt(g, 10, 0), B = nodeAt(g, 50, 0)
    const D = nodeAt(g, 10, 0), E = nodeAt(g, 50, 0)
    // A→D: 10→39; B→E: 50→60 (regular 冲突 → S1 slot=1)
    const pA = portAt(A, PortSide.NORTH, 10, 0), pB = portAt(B, PortSide.NORTH, 50, 0)
    const pD = portAt(D, PortSide.SOUTH, 41, 0), pE = portAt(E, PortSide.SOUTH, 60, 0)
    const eAD = edge(pA, pD), eBE = edge(pB, pE)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdgesForDirection([A, B], [D, E], randomStub,
      PortSide.NORTH, PortSide.SOUTH, SOUTH_TO_NORTH.positionFn, 100)
    expect(slots).toBe(2)
    // S1 (A→D) slot=1 → segmentY = 100 - 20 = 80; S2 (B→E) slot=0 → 100
    expect(eAD.getBendPoints().map(p => [p.x, p.y])).toEqual([[10, 80], [41, 80]])
    expect(eBE.getBendPoints().map(p => [p.x, p.y])).toEqual([[50, 100], [60, 100]])
  })

  it('NORTH_TO_SOUTH: 向下 (segmentY = startPos + slot*spacing)', () => {
    const g = new LGraph()
    const A = nodeAt(g, 10, 0), B = nodeAt(g, 50, 0)
    const D = nodeAt(g, 10, 0), E = nodeAt(g, 50, 0)
    const pA = portAt(A, PortSide.SOUTH, 10, 0), pB = portAt(B, PortSide.SOUTH, 50, 0)
    const pD = portAt(D, PortSide.NORTH, 41, 0), pE = portAt(E, PortSide.NORTH, 60, 0)
    const eAD = edge(pA, pD), eBE = edge(pB, pE)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdgesForDirection([A, B], [D, E], randomStub,
      PortSide.SOUTH, PortSide.NORTH, NORTH_TO_SOUTH.positionFn, 100)
    expect(slots).toBe(2)
    // S1 (A→D) slot=1 → segmentY = 100 + 20 = 120; S2 (B→E) slot=0 → 100
    expect(eAD.getBendPoints().map(p => [p.x, p.y])).toEqual([[10, 120], [41, 120]])
    expect(eBE.getBendPoints().map(p => [p.x, p.y])).toEqual([[50, 100], [60, 100]])
  })
})

describe('OrthogonalRoutingGenerator 工具函数', () => {
  it('countCrossings: 位置落在 [start,end] 区间内计数, 超过 end 提前终止', () => {
    expect(countCrossings([5, 10, 15, 20, 25], 10, 20)).toBe(3)
    expect(countCrossings([30], 10, 20)).toBe(0)
    expect(countCrossings([], 10, 20)).toBe(0)
  })
})

// ── 补充分支覆盖: N-S 位置函数 / 多坐标冲突 / 双向等值依赖 / N-S split / topologicalNumbering ──

describe('OrthogonalRoutingGenerator 补充分支', () => {
  it('nsPortPositionOnHyperNode: node.x + port.x + anchor.x (非零 anchor)', () => {
    const g = new LGraph()
    // node@x=5, port offset x=3, anchor x=2 → 10
    const A = nodeAt(g, 5, 0), D = nodeAt(g, 5, 0)
    const pA = new LPort(); pA.setNode(A); pA.setSide(PortSide.NORTH)
    pA.position = { x: 3, y: 0 }; pA.setAnchor({ x: 2, y: 0 })
    const pD = new LPort(); pD.setNode(D); pD.setSide(PortSide.SOUTH)
    pD.position = { x: 43, y: 0 }; pD.setAnchor({ x: 2, y: 0 })  // → 50
    const e = edge(pA, pD)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdgesForDirection([A], [D], randomStub,
      PortSide.NORTH, PortSide.SOUTH, SOUTH_TO_NORTH.positionFn, 100)
    expect(slots).toBe(1)
    // sourceX=10, targetX=50, segmentY=100
    expect(e.getBendPoints().map(p => [p.x, p.y])).toEqual([[10, 100], [50, 100]])
  })

  it('超边多坐标: countConflicts 遍历两个有序列表 (多轮推进)', () => {
    const g = new LGraph()
    // S1: 超边 out [20,40,60] (A EAST → D1/D2/D3 WEST)
    const A = nodeAt(g, 0, 10)
    const D1 = nodeAt(g, 100, 20), D2 = nodeAt(g, 100, 40), D3 = nodeAt(g, 100, 60)
    const pA = portAt(A, PortSide.EAST, 20, 10)
    const pD1 = portAt(D1, PortSide.WEST, 0, 20), pD2 = portAt(D2, PortSide.WEST, 0, 40), pD3 = portAt(D3, PortSide.WEST, 0, 60)
    edge(pA, pD1); edge(pA, pD2); edge(pA, pD3)
    // S2: B EAST → E1/E2 WEST in [30, 50]
    const B = nodeAt(g, 0, 30)
    const E1 = nodeAt(g, 100, 50), E2 = nodeAt(g, 100, 90)
    const pB = portAt(B, PortSide.EAST, 20, 30)
    const pE1 = portAt(E1, PortSide.WEST, 0, 50), pE2 = portAt(E2, PortSide.WEST, 0, 90)
    edge(pB, pE1); edge(pB, pE2)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdges([A, B], [D1, D2, D3, E1, E2], 10, randomStub)
    // 两条超边 (S1: in[10] out[20,40,60]; S2: in[30] out[50,90]) → 依赖后 ≥2 槽
    expect(slots).toBeGreaterThanOrEqual(1)
  })

  it('双向等值依赖: depValue1 === depValue2 > 0 → 双向 zero-weight regular 依赖, 随后被断环移除', () => {
    const g = new LGraph()
    // S1: 10→40, S2: 20→30 (S2 完全在 S1 跨度内 → 交叉数双向相等=1)
    const A = nodeAt(g, 0, 10), B = nodeAt(g, 0, 20)
    const D = nodeAt(g, 100, 40), E = nodeAt(g, 100, 30)
    const pA = portAt(A, PortSide.EAST, 20, 10), pB = portAt(B, PortSide.EAST, 20, 20)
    const pD = portAt(D, PortSide.WEST, 0, 40), pE = portAt(E, PortSide.WEST, 0, 30)
    const e1 = edge(pA, pD), e2 = edge(pB, pE)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdges([A, B], [D, E], 10, randomStub)
    // 双向 zero-weight 依赖被断环 (移除一条, 保留另一条) → 2 槽
    expect(slots).toBe(2)
    expect(e1.getBendPoints().length).toBe(2)
    expect(e2.getBendPoints().length).toBe(2)
    // 保留依赖 S2→S1 → S1 slot=1 → segmentX=30
    expect(e1.getBendPoints()[0]!.x).toBe(30)
    expect(e2.getBendPoints()[0]!.x).toBe(10)
  })

  it('N-S critical 冲突环 → split: 生成 S 形 4 弯点', () => {
    const g = new LGraph()
    const A = nodeAt(g, 10, 0), B = nodeAt(g, 55, 0), C = nodeAt(g, 90, 0)
    const D = nodeAt(g, 10, 0), E = nodeAt(g, 55, 0), F = nodeAt(g, 90, 0)
    const pA = portAt(A, PortSide.NORTH, 10, 0), pB = portAt(B, PortSide.NORTH, 55, 0), pC = portAt(C, PortSide.NORTH, 90, 0)
    const pD = portAt(D, PortSide.SOUTH, 55, 0), pE = portAt(E, PortSide.SOUTH, 90, 0), pF = portAt(F, PortSide.SOUTH, 10, 0)
    const eAD = edge(pA, pD), eBE = edge(pB, pE), eCF = edge(pC, pF)
    const gen = new OrthogonalRoutingGenerator(20)
    const slots = gen.routeEdgesForDirection([A, B, C], [D, E, F], randomStub,
      PortSide.NORTH, PortSide.SOUTH, SOUTH_TO_NORTH.positionFn, 100)
    expect(slots).toBeGreaterThanOrEqual(2)
    const all = [eAD, eBE, eCF]
    const sBends = all.filter(e => e.getBendPoints().length === 4)
    expect(sBends.length).toBeGreaterThan(0)
    for (const e of all) {
      expect([2, 4]).toContain(e.getBendPoints().length)
      expect(ortho(e.getBendPoints())).toBe(true)
    }
  })
})

describe('topologicalNumbering 直接单元测试', () => {
  it('右向目标链: 无 incoming 坐标的段收到 maxRank 并向左回填', () => {
    // S1→S2→S3, 全部无 incoming 连接坐标 → S3 为 rightward target
    const s1 = new HyperEdgeSegment(), s2 = new HyperEdgeSegment(), s3 = new HyperEdgeSegment()
    // 用 mock 端口建坐标: 只有 WEST (outgoing)
    const map = new Map()
    const mk = (side: string, y: number) => ({
      getSide: () => side, getNode: () => ({ position: { y: 0 } }),
      getPosition: () => ({ y }), getAnchor: () => ({ y: 0 }), getConnectedPorts: () => [],
    }) as never
    s1.addPortPositions(mk('WEST', 10), map)
    s2.addPortPositions(mk('WEST', 20), map)
    s3.addPortPositions(mk('WEST', 30), map)
    HyperEdgeSegmentDependency.createAndAddRegular(s1, s2, 1)
    HyperEdgeSegmentDependency.createAndAddRegular(s2, s3, 1)
    const segments = [s1, s2, s3]
    const rank = topologicalNumbering(segments)
    expect(rank).toBe(3)
    expect(s1.getRoutingSlot()).toBe(0)
    expect(s2.getRoutingSlot()).toBe(1)
    expect(s3.getRoutingSlot()).toBe(2)
  })

  it('随机 acyclic regular 图: 每条依赖 target.slot ≥ source.slot + 1', () => {
    // 复用随机段构造 (从 cycle detector 测试的 mulberry 思路内联简化)
    let a = 12345
    const rng = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
    for (let seed = 0; seed < 30; seed++) {
      a = seed
      const n = 2 + Math.floor(rng() * 4)
      const segments: HyperEdgeSegment[] = []
      for (let i = 0; i < n; i++) {
        const seg = new HyperEdgeSegment()
        const map = new Map()
        const mk = (side: string, y: number) => ({
          getSide: () => side, getNode: () => ({ position: { y: 0 } }),
          getPosition: () => ({ y }), getAnchor: () => ({ y: 0 }), getConnectedPorts: () => [],
        }) as never
        const ins = new Set<number>(); const outs = new Set<number>()
        while (ins.size < 1 + Math.floor(rng() * 2)) ins.add(Math.round(rng() * 100))
        while (outs.size < 1 + Math.floor(rng() * 2)) outs.add(Math.round(rng() * 100))
        for (const y of ins) seg.addPortPositions(mk('EAST', y), map)
        for (const y of outs) seg.addPortPositions(mk('WEST', y), map)
        segments.push(seg)
      }
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && rng() < 0.35) HyperEdgeSegmentDependency.createAndAddRegular(segments[i]!, segments[j]!, 1 + Math.floor(rng() * 3))
        }
      }
      breakNonCriticalCycles(segments, randomStub)
      topologicalNumbering(segments)
      for (const s of segments) {
        for (const d of s.getOutgoingSegmentDependencies()) {
          expect(d.getTarget()!.getRoutingSlot()).toBeGreaterThanOrEqual(s.getRoutingSlot() + 1)
        }
      }
    }
  })
})
