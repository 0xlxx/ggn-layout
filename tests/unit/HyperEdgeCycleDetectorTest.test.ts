/**
 * HyperEdgeCycleDetector (ELK p5edges.orthogonal.HyperEdgeCycleDetector) 语义单元测试.
 * SSOT: ELK Java 0.12.0 HyperEdgeCycleDetector.java.
 *
 * 覆盖: initialize (mark 负序 + in/out/critical 权重)、computeLinearOrderingMarks
 * (sink/source 优先、maxOutflow 随机选、critical-first 规则、mark 平移)、
 * detectCycles 左向依赖收集 (source.mark > target.mark)、breakNonCriticalCycles 移除/反转.
 */
import { describe, expect, it } from 'vitest'
import { HyperEdgeSegment } from '../../src/p5edges/orthogonal/hyper-edge-segment.js'
import { DependencyType, HyperEdgeSegmentDependency } from '../../src/p5edges/orthogonal/hyper-edge-segment-dependency.js'
import { HyperEdgeCycleDetector } from '../../src/p5edges/orthogonal/hyper-edge-cycle-detector.js'
import { breakNonCriticalCycles } from '../../src/p5edges/orthogonal/orthogonal-routing-generator.js'
import { JavaRandom } from '../../src/util/java-random.js'

/** 确定性 random 工厂: JavaRandom(1).nextInt(3)=0 → 选 maxSegments 第一项 (最小 mark). */
function randomPickFirst(): JavaRandom { return new JavaRandom(1) }
/** 确定性 random 工厂: JavaRandom(3).nextInt(3)=2 → 选 maxSegments 最后一项 (最大 mark). */
function randomPickLast(): JavaRandom { return new JavaRandom(3) }

function makeSegment(incomingYs: number[], outgoingYs: number[]): HyperEdgeSegment {
  const seg = new HyperEdgeSegment()
  const map = new Map()
  const mockPort = (side: string, absY: number) => ({
    getSide: () => side,
    getNode: () => ({ position: { y: 0 } }),
    getPosition: () => ({ y: absY }),
    getAnchor: () => ({ y: 0 }),
    getConnectedPorts: () => [],
  }) as never
  for (const y of incomingYs) seg.addPortPositions(mockPort('EAST', y), map)
  for (const y of outgoingYs) seg.addPortPositions(mockPort('WEST', y), map)
  return seg
}

describe('HyperEdgeCycleDetector.detectCycles (ELK Java 移植)', () => {
  it('无环链 A→B→C: 不返回依赖, mark 沿边方向递增 (linear ordering)', () => {
    const a = makeSegment([10], [50]), b = makeSegment([20], [60]), c = makeSegment([30], [70])
    HyperEdgeSegmentDependency.createAndAddCritical(a, b)
    HyperEdgeSegmentDependency.createAndAddCritical(b, c)
    const segments = [a, b, c]

    const result = HyperEdgeCycleDetector.detectCycles(segments, true, randomPickFirst())
    expect(result).toEqual([])
    // marks 满足 source.mark < target.mark (沿边方向严格递增)
    expect(a.mark).toBeLessThan(b.mark)
    expect(b.mark).toBeLessThan(c.mark)
  })

  it('critical 3-环 A→B→C→A: 返回左向依赖 (mark 逆序的那条)', () => {
    const a = makeSegment([10], [50]), b = makeSegment([20], [60]), c = makeSegment([30], [70])
    HyperEdgeSegmentDependency.createAndAddCritical(a, b)
    HyperEdgeSegmentDependency.createAndAddCritical(b, c)
    HyperEdgeSegmentDependency.createAndAddCritical(c, a)
    const segments = [a, b, c]

    // unprocessed 按 mark 升序 [C(-3), B(-2), A(-1)]; randomPickFirst() 选 C 为 maxNode
    const result = HyperEdgeCycleDetector.detectCycles(segments, true, randomPickFirst())
    expect(result.length).toBe(1)
    const dep = result[0]!
    expect(dep.getSource()).toBe(b)
    expect(dep.getTarget()).toBe(c)
    expect(dep.getType()).toBe(DependencyType.CRITICAL)
    // 左向依赖判据成立
    expect(b.mark).toBeGreaterThan(c.mark)
  })

  it('random 选择不同 → 断环依赖不同 (maxNode 随机分支)', () => {
    const mk = () => {
      const a = makeSegment([10], [50]), b = makeSegment([20], [60]), c = makeSegment([30], [70])
      HyperEdgeSegmentDependency.createAndAddCritical(a, b)
      HyperEdgeSegmentDependency.createAndAddCritical(b, c)
      HyperEdgeSegmentDependency.createAndAddCritical(c, a)
      return [a, b, c] as const
    }
    const [a1, b1, c1] = mk()
    const r1 = HyperEdgeCycleDetector.detectCycles([a1, b1, c1], true, randomPickFirst())
    const [a2, b2, c2] = mk()
    const r2 = HyperEdgeCycleDetector.detectCycles([a2, b2, c2], true, randomPickLast())
    expect(r1.length).toBe(1)
    expect(r2.length).toBe(1)
    // 不同 maxNode → 不同断环依赖 (r1 = B→C, r2 = C→A)
    expect(r1[0]!.getSource()).toBe(b1)
    expect(r2[0]!.getSource()).toBe(c2)
  })

  it('criticalOnly=true 忽略 regular 依赖 (regular 环不返回)', () => {
    const a = makeSegment([10], [50]), b = makeSegment([20], [60]), c = makeSegment([30], [70])
    HyperEdgeSegmentDependency.createAndAddRegular(a, b, 2)
    HyperEdgeSegmentDependency.createAndAddRegular(b, c, 2)
    HyperEdgeSegmentDependency.createAndAddRegular(c, a, 2)
    const segments = [a, b, c]

    const criticalOnly = HyperEdgeCycleDetector.detectCycles(segments, true, randomPickFirst())
    expect(criticalOnly).toEqual([])
    // criticalOnly=false 会检测 regular 环
    const all = HyperEdgeCycleDetector.detectCycles(segments, false, randomPickFirst())
    expect(all.length).toBeGreaterThan(0)
    expect(all.every(d => d.getType() === DependencyType.REGULAR)).toBe(true)
  })

  it('critical-first 规则: 存在 criticalOut 且无 criticalIn 的段被直接选为 maxNode', () => {
    // A→B critical, B→C regular (权重 5): A 有 criticalOut 无 criticalIn
    const a = makeSegment([10], [50]), b = makeSegment([20], [60]), c = makeSegment([30], [70])
    HyperEdgeSegmentDependency.createAndAddCritical(a, b)
    HyperEdgeSegmentDependency.createAndAddRegular(b, c, 5)
    const segments = [a, b, c]

    const result = HyperEdgeCycleDetector.detectCycles(segments, false, randomPickFirst())
    // 断环后 B→C 若左向则返回 (regular 环)
    for (const d of result) {
      expect(d.getType()).toBe(DependencyType.REGULAR)
    }
    // A 的 critical 依赖不得被返回 (critical 必须指向右)
    expect(result.some(d => d.getType() === DependencyType.CRITICAL)).toBe(false)
  })
})

describe('breakNonCriticalCycles (ELK Java 移植)', () => {
  it('权重>0 的环依赖被反转 (数量不变), 断环后无环', () => {
    const a = makeSegment([10], [50]), b = makeSegment([20], [60]), c = makeSegment([30], [70])
    const d1 = HyperEdgeSegmentDependency.createAndAddRegular(a, b, 1)
    const d2 = HyperEdgeSegmentDependency.createAndAddRegular(b, c, 1)
    const d3 = HyperEdgeSegmentDependency.createAndAddRegular(c, a, 1)
    const segments = [a, b, c]

    breakNonCriticalCycles(segments, randomPickFirst())
    const total = segments.reduce((n, s) => n + s.getOutgoingSegmentDependencies().length, 0)
    // 反转不删依赖: 总数仍 3
    expect(total).toBe(3)
    expect([d1, d2, d3].filter(d => d.getSource() === null || d.getTarget() === null)).toEqual([])
    // 断环后无环: 从 a 沿 outgoing 可达性不含 a 自身
    const reachable = new Set<HyperEdgeSegment>()
    const queue = [a]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const d of cur.getOutgoingSegmentDependencies()) {
        const t = d.getTarget()!
        expect(t).not.toBe(a)
        if (!reachable.has(t)) { reachable.add(t); queue.push(t) }
      }
    }
  })

  it('权重=0 的环依赖被移除', () => {
    const a = makeSegment([10], [50]), b = makeSegment([20], [60])
    HyperEdgeSegmentDependency.createAndAddRegular(a, b, 0)
    HyperEdgeSegmentDependency.createAndAddRegular(b, a, 0)
    const segments = [a, b]

    breakNonCriticalCycles(segments, randomPickFirst())
    const total = segments.reduce((n, s) => n + s.getOutgoingSegmentDependencies().length, 0)
    expect(total).toBeLessThan(2)
  })
})

// ── 确定性随机不变量 (覆盖 updateNeighbors / maxOutflow / mark 平移 / breakNonCriticalCycles) ──

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randSegments(rng: () => number, count: number): HyperEdgeSegment[] {
  const segments: HyperEdgeSegment[] = []
  for (let i = 0; i < count; i++) {
    const seg = new HyperEdgeSegment()
    const map = new Map()
    const ins = new Set<number>(); const outs = new Set<number>()
    while (ins.size < 1 + Math.floor(rng() * 2)) ins.add(Math.round(rng() * 100))
    while (outs.size < 1 + Math.floor(rng() * 2)) outs.add(Math.round(rng() * 100))
    const mock = (side: string, absY: number) => ({
      getSide: () => side, getNode: () => ({ position: { y: 0 } }),
      getPosition: () => ({ y: absY }), getAnchor: () => ({ y: 0 }), getConnectedPorts: () => [],
    }) as never
    for (const y of ins) seg.addPortPositions(mock('EAST', y), map)
    for (const y of outs) seg.addPortPositions(mock('WEST', y), map)
    segments.push(seg)
  }
  return segments
}

function isAcyclic(segments: HyperEdgeSegment[]): boolean {
  const indeg = new Map<HyperEdgeSegment, number>()
  for (const s of segments) indeg.set(s, 0)
  for (const s of segments) for (const d of s.getOutgoingSegmentDependencies()) {
    indeg.set(d.getTarget()!, (indeg.get(d.getTarget()!) ?? 0) + 1)
  }
  const queue = segments.filter(s => (indeg.get(s) ?? 0) === 0)
  let seen = 0
  while (queue.length > 0) {
    const cur = queue.shift()!
    seen++
    for (const d of cur.getOutgoingSegmentDependencies()) {
      const t = d.getTarget()!
      indeg.set(t, (indeg.get(t) ?? 0) - 1)
      if ((indeg.get(t) ?? 0) === 0) queue.push(t)
    }
  }
  return seen === segments.length
}

describe('HyperEdgeCycleDetector 确定性随机不变量', () => {
  it('40 个随机图: 返回依赖均左向 (source.mark > target.mark), mark 互异', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = mulberry32(seed)
      const segments = randSegments(rng, 2 + Math.floor(rng() * 4))
      const n = segments.length
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue
          const p = rng()
          if (p < 0.35) HyperEdgeSegmentDependency.createAndAddCritical(segments[i]!, segments[j]!)
          else if (p < 0.7) HyperEdgeSegmentDependency.createAndAddRegular(segments[i]!, segments[j]!, 1 + Math.floor(rng() * 4))
        }
      }
      const result = HyperEdgeCycleDetector.detectCycles(segments, false, randomPickFirst())
      // mark 互异
      expect(new Set(segments.map(s => s.mark)).size).toBe(n)
      for (const d of result) {
        expect(d.getSource()!.mark).toBeGreaterThan(d.getTarget()!.mark)
      }
    }
  })

  it('40 个随机图 (criticalOnly): 只返回 critical 依赖且左向', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = mulberry32(seed)
      const segments = randSegments(rng, 2 + Math.floor(rng() * 4))
      const n = segments.length
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue
          const p = rng()
          if (p < 0.4) HyperEdgeSegmentDependency.createAndAddCritical(segments[i]!, segments[j]!)
          else if (p < 0.6) HyperEdgeSegmentDependency.createAndAddRegular(segments[i]!, segments[j]!, 1 + Math.floor(rng() * 3))
        }
      }
      const result = HyperEdgeCycleDetector.detectCycles(segments, true, randomPickFirst())
      for (const d of result) {
        expect(d.getType()).toBe(DependencyType.CRITICAL)
        expect(d.getSource()!.mark).toBeGreaterThan(d.getTarget()!.mark)
      }
    }
  })

  it('40 个随机 regular 图: breakNonCriticalCycles 后无环', () => {
    for (let seed = 0; seed < 40; seed++) {
      const rng = mulberry32(seed)
      const segments = randSegments(rng, 2 + Math.floor(rng() * 4))
      const n = segments.length
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (i === j) continue
          if (rng() < 0.4) {
            // 常规权重 (含 0 权重双向)
            const w = rng() < 0.2 ? 0 : 1 + Math.floor(rng() * 3)
            HyperEdgeSegmentDependency.createAndAddRegular(segments[i]!, segments[j]!, w)
          }
        }
      }
      breakNonCriticalCycles(segments, randomPickFirst())
      expect(isAcyclic(segments)).toBe(true)
    }
  })
})
