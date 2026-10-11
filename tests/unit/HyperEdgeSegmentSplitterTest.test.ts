/**
 * HyperEdgeSegmentSplitter (ELK p5edges.orthogonal.HyperEdgeSegmentSplitter) 语义单元测试.
 * SSOT: ELK Java 0.12.0 HyperEdgeSegmentSplitter.java.
 *
 * 覆盖: splitSegments 全流程 — findFreeAreas (空隙 ≥2×threshold)、
 * decideWhichSegmentsToSplit (普通边优先拆, 超边保留)、computePositionToSplitAndUpdateFreeAreas
 * (选 area 中心 / 无 area 拆段中心)、splitAt 后 partner 接管 outgoing、updateDependencies
 * (segment→cause→partner 两条 critical + 与其余段补依赖)、useArea 分裂、按段长度升序拆.
 */
import { describe, expect, it } from 'vitest'
import { HyperEdgeSegment } from '../../src/p5edges/orthogonal/hyper-edge-segment.js'
import { DependencyType, HyperEdgeSegmentDependency } from '../../src/p5edges/orthogonal/hyper-edge-segment-dependency.js'
import { splitSegments } from '../../src/p5edges/orthogonal/hyper-edge-segment-splitter.js'
import { HyperEdgeCycleDetector } from '../../src/p5edges/orthogonal/hyper-edge-cycle-detector.js'
import { JavaRandom } from '../../src/util/java-random.js'

/** 最小 LPort mock: side + 绝对 y. */
function mockPort(side: string, absY: number) {
  const node = { position: { y: 0 } }
  return {
    getSide: () => side,
    getNode: () => node,
    getPosition: () => ({ y: absY }),
    getAnchor: () => ({ y: 0 }),
    getConnectedPorts: () => [],
  } as never
}

/** 用 EAST/WEST 端口构造 W-E segment (incoming=EAST 坐标, outgoing=WEST 坐标). */
function makeSegment(incomingYs: number[], outgoingYs: number[]): HyperEdgeSegment {
  const seg = new HyperEdgeSegment()
  const map = new Map()
  for (const y of incomingYs) seg.addPortPositions(mockPort('EAST', y), map)
  for (const y of outgoingYs) seg.addPortPositions(mockPort('WEST', y), map)
  return seg
}

function outgoingOf(seg: HyperEdgeSegment, target: HyperEdgeSegment): HyperEdgeSegmentDependency | undefined {
  return seg.getOutgoingSegmentDependencies().find(d => d.getTarget() === target)
}

describe('HyperEdgeSegmentSplitter.splitSegments (ELK Java 移植)', () => {
  it('空依赖: 不拆分不新增段', () => {
    const segments = [makeSegment([10], [50]), makeSegment([20], [60])]
    splitSegments([], segments, 5)
    expect(segments.length).toBe(2)
    expect(segments[0]!.getSplitPartner()).toBeNull()
  })

  it('单条 critical 依赖 + 可用空隙: 拆在空隙中心, partner 接管 outgoing, 补 critical 依赖链', () => {
    // S1 [10,50], S2 [20,60]; 依赖 S1→S2 (critical).
    // coords 排序 [10,20,50,60] → 空隙 [15,15],[25,45],[55,55]; 最优 [15,15] (crossings=0).
    const s1 = makeSegment([10], [50])
    const s2 = makeSegment([20], [60])
    HyperEdgeSegmentDependency.createAndAddCritical(s1, s2)
    const segments = [s1, s2]

    splitSegments([s1.getOutgoingSegmentDependencies()[0]!], segments, 5)

    expect(segments.length).toBe(3)
    const partner = s1.getSplitPartner()
    expect(partner).not.toBeNull()
    // 触发段: splitBy = 拆因 (s2); partner: dummy
    expect(s1.getSplitBy()).toBe(s2)
    expect(partner!.isDummy()).toBe(true)
    expect(partner!.getSplitPartner()).toBe(s1)
    // 拆分点: 原段 outgoing 只留链接点; partner incoming=链接点, outgoing 接管
    expect([...s1.getOutgoingConnectionCoordinates()]).toEqual([15])
    expect([...partner!.getIncomingConnectionCoordinates()]).toEqual([15])
    expect([...partner!.getOutgoingConnectionCoordinates()]).toEqual([50])
    // 依赖链: s1 → s2 → partner (两条 critical)
    const d1 = outgoingOf(s1, s2)
    const d2 = outgoingOf(s2, partner!)
    expect(d1?.getType()).toBe(DependencyType.CRITICAL)
    expect(d1?.getWeight()).toBe(HyperEdgeSegmentDependency.CRITICAL_DEPENDENCY_WEIGHT)
    expect(d2?.getType()).toBe(DependencyType.CRITICAL)
    expect(partner!.getIncomingSegmentDependencies().map(d => d.getSource())).toContain(s2)
  })

  it('超边 vs 普通边: 优先拆普通边 (source 超边 + target 普通边 → 拆 target)', () => {
    const hs = makeSegment([10, 20, 30], [50])   // 4 端口 → 超边
    const n = makeSegment([40], [60])            // 2 端口 → 普通边
    expect(hs.representsHyperedge()).toBe(true)
    expect(n.representsHyperedge()).toBe(false)
    HyperEdgeSegmentDependency.createAndAddCritical(hs, n)
    const segments = [hs, n]

    splitSegments([hs.getOutgoingSegmentDependencies()[0]!], segments, 5)

    expect(segments.length).toBe(3)
    expect(n.getSplitPartner()).not.toBeNull()
    expect(n.getSplitBy()).toBe(hs)
    expect(hs.getSplitPartner()).toBeNull() // 超边未被拆
    // 新依赖: n → hs (拆后重新生成), hs → partner
    expect(outgoingOf(n, hs)?.getType()).toBe(DependencyType.CRITICAL)
    expect(outgoingOf(hs, n.getSplitPartner()!)?.getType()).toBe(DependencyType.CRITICAL)
  })

  it('无可用空隙: 拆在段自身中心, 不选 area', () => {
    // 坐标 [10,20] 紧邻 (gap=10 < 2*threshold=20) → 无空隙
    const s1 = makeSegment([10], [20])
    const s2 = makeSegment([30], [40])
    HyperEdgeSegmentDependency.createAndAddCritical(s1, s2)
    const segments = [s1, s2]

    splitSegments([s1.getOutgoingSegmentDependencies()[0]!], segments, 10)

    expect(segments.length).toBe(3)
    const partner = s1.getSplitPartner()!
    // 无 area → 拆在段中心 (10+20)/2 = 15
    expect([...s1.getOutgoingConnectionCoordinates()]).toEqual([15])
    expect([...partner.getIncomingConnectionCoordinates()]).toEqual([15])
    expect([...partner.getOutgoingConnectionCoordinates()]).toEqual([20])
  })

  it('多依赖环: 逐条拆 (跳过已在拆集), 按段长度升序', () => {
    // 环 S1→S2→S3→S1; S3 最长 (len 60), S1/S2 len 40
    const s1 = makeSegment([10], [50])   // len 40
    const s2 = makeSegment([20], [60])   // len 40
    const s3 = makeSegment([30], [90])   // len 60
    HyperEdgeSegmentDependency.createAndAddCritical(s1, s2)
    HyperEdgeSegmentDependency.createAndAddCritical(s2, s3)
    HyperEdgeSegmentDependency.createAndAddCritical(s3, s1)
    const segments = [s1, s2, s3]

    // 环依赖全部传入
    const deps = [s1, s2, s3].flatMap(seg => seg.getOutgoingSegmentDependencies())
    splitSegments(deps, segments, 5)

    // S3 最长 → 不被拆 (只拆 S1、S2); 每段各 +1 partner
    expect(s3.getSplitPartner()).toBeNull()
    expect(s1.getSplitPartner()).not.toBeNull()
    expect(s2.getSplitPartner()).not.toBeNull()
    expect(segments.length).toBe(5)
    // S1 拆因 = S2; S2 拆因 = S3 (decideWhichSegmentsToSplit 逐依赖判定)
    expect(s1.getSplitBy()).toBe(s2)
    expect(s2.getSplitBy()).toBe(s3)
  })

  it('拆后与第三段补依赖 (updateDependencies 补全)', () => {
    // 依赖 S1→S2 critical; 第三段 T 与 S1 空间重叠 → 拆后需与 T 建立依赖
    const s1 = makeSegment([10], [50])
    const s2 = makeSegment([20], [60])
    const t = makeSegment([15], [55])  // 与 S1 重叠
    HyperEdgeSegmentDependency.createAndAddCritical(s1, s2)
    const segments = [s1, s2, t]

    splitSegments([s1.getOutgoingSegmentDependencies()[0]!], segments, 5)

    const partner = s1.getSplitPartner()!
    expect(segments.length).toBe(4)
    // updateDependencies 只与「非 s1/s2/partner」的段补依赖 → t 应参与
    const tRelated = [...t.getOutgoingSegmentDependencies(), ...t.getIncomingSegmentDependencies()]
    expect(tRelated.length).toBeGreaterThan(0)
    expect(tRelated.every(d => d.getSource() === t || d.getTarget() === t)).toBe(true)
  })
})

// ── 确定性随机不变量 (覆盖分支组合: useArea 分裂 / rateArea / chooseBestAreaIndex / 多依赖环) ──

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randCoords(rng: () => number): number[] {
  const set = new Set<number>()
  const count = 1 + Math.floor(rng() * 2)
  while (set.size < count) set.add(Math.round(rng() * 100))
  return [...set].sort((a, b) => a - b)
}

function randSegments(rng: () => number): HyperEdgeSegment[] {
  const segments: HyperEdgeSegment[] = []
  const n = 2 + Math.floor(rng() * 4)
  for (let i = 0; i < n; i++) {
    const seg = new HyperEdgeSegment()
    const map = new Map()
    for (const y of randCoords(rng)) seg.addPortPositions(mockPort('EAST', y), map)
    for (const y of randCoords(rng)) seg.addPortPositions(mockPort('WEST', y), map)
    segments.push(seg)
  }
  return segments
}

describe('HyperEdgeSegmentSplitter 确定性随机不变量', () => {
  it('40 个随机 critical 环图: 拆分后 partner 链接/坐标/依赖一致', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = mulberry32(seed)
      const segments = randSegments(rng)
      const n = segments.length
      const originalOutgoing = new Map<HyperEdgeSegment, number[]>()
      for (const s of segments) originalOutgoing.set(s, [...s.getOutgoingConnectionCoordinates()])

      // 构造 critical 环 i→(i+1)%n + 随机额外 critical 依赖
      for (let i = 0; i < n; i++) HyperEdgeSegmentDependency.createAndAddCritical(segments[i]!, segments[(i + 1) % n]!)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i !== j && rng() < 0.15) HyperEdgeSegmentDependency.createAndAddCritical(segments[i]!, segments[j]!)
        }
      }

      const cycleDeps = HyperEdgeCycleDetector.detectCycles(segments, true, new JavaRandom(1))
      const before = segments.length
      splitSegments(cycleDeps, segments, 2)

      // 拆分段数 = 新增段数
      const splitCount = segments.filter(s => s.getSplitBy() !== null).length
      expect(segments.length).toBe(before + splitCount)
      // 每对 split 恰好一个 splitBy; 互为 partner
      for (const s of segments) {
        const p = s.getSplitPartner()
        if (p !== null) {
          expect(p.getSplitPartner()).toBe(s)
          expect((s.getSplitBy() === null) !== (p.getSplitBy() === null)).toBe(true)
        }
        // extent = min/max 连接坐标
        const all = [...s.getIncomingConnectionCoordinates(), ...s.getOutgoingConnectionCoordinates()]
        if (all.length > 0) {
          expect(s.getStartCoordinate()).toBe(Math.min(...all))
          expect(s.getEndCoordinate()).toBe(Math.max(...all))
          expect(s.getStartCoordinate()).toBeLessThanOrEqual(s.getEndCoordinate())
        }
      }
      // 依赖双向登记一致
      for (const s of segments) {
        for (const d of s.getOutgoingSegmentDependencies()) {
          expect(d.getSource()).toBe(s)
          expect(d.getTarget()!.getIncomingSegmentDependencies()).toContain(d)
        }
      }
      // partner 接管原段全部 outgoing 坐标
      for (const s of segments) {
        if (s.getSplitBy() !== null && s.getSplitPartner() !== null) {
          expect([...s.getSplitPartner()!.getOutgoingConnectionCoordinates()]).toEqual(originalOutgoing.get(s))
        }
      }
    }
  })
})
