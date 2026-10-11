/**
 * JavaRandom 移植单测 (java.util.Random 1:1, 参考值来自 JVM 21 实测).
 * 覆盖 nextInt(2 幂/非 2 幂/拒绝采样)/nextBoolean/nextFloat/nextDouble/setSeed.
 *
 * ★ 黄金向量 (golden vectors): 下方 nextLong48/nextBoolean/nextFloat/nextDouble/nextInt100
 * 数组由真实 JVM 21 生成 (scripts 侧 RandGolden.java, 见 /tmp/RandGolden.java), 逐位断言.
 * 2026-08-10 曾因 nextLong 有符号借位 bug (第二个 next(32) 按无符号加) 导致 setSeed 种子
 * 错位 (~50% 分量) → flat01/north_south_ports_1 层序连锁差异. 此测试专门防此类回归:
 * 任何对 java-random.ts 的改动都必须先过这里, 再跑 oracle.
 */
import { describe, expect, it, vi } from 'vitest'
import { JavaRandom } from '../../src/util/java-random.js'

describe('JavaRandom (java.util.Random 移植)', () => {
  it('seed=1 的 nextInt/nextBoolean/nextFloat/nextDouble 与 JVM 一致', () => {
    const r = new JavaRandom(1)
    expect(r.nextInt(100)).toBe(85)
    expect(r.nextInt(2147483647)).toBe(215764588) // MAX 非 2 幂 (rejection, JVM 实测)
    expect(r.nextInt(32)).toBe(13)                 // 2 的幂分支
    expect(r.nextInt(7)).toBe(0)                   // rejection sampling
    expect(r.nextInt(1000)).toBe(254)
    expect(r.nextBoolean()).toBe(false)
    expect(r.nextFloat()).toBeCloseTo(0.332717, 5)
    expect(r.nextDouble()).toBeCloseTo(0.6588672394716129, 10)
  })

  it('seed=42 序列确定', () => {
    const r = new JavaRandom(42)
    expect([r.nextInt(100), r.nextInt(100), r.nextInt(100)]).toEqual([30, 63, 48])
  })

  it('setSeed 重置后序列复现', () => {
    const r = new JavaRandom(1)
    r.nextInt(100) // 消耗若干
    r.nextInt(100)
    r.setSeed(1)
    expect(r.nextInt(100)).toBe(85)
  })

  it('nextLong 与有界 nextInt 相互独立推进', () => {
    // 修正: 原实现无无界 nextInt (TS 只移植了有界版), 原用例调用 r.nextInt() 得 NaN 且
    // Object.is(NaN, NaN)=true 恒过 — 改用真正的无界方法 nextLong (GWT 语义).
    const r = new JavaRandom(7)
    const a = r.nextLong()
    const b = r.nextInt(100)
    const r2 = new JavaRandom(7)
    expect(r2.nextLong()).toBe(a)
    expect(r2.nextInt(100)).toBe(b)
  })

  it.each([
    // [seed, nextLong 低 48 位序列 (JVM 21 Random(seed).nextLong() & (2^48-1))]
    [1, [234690329484504, 15871654099346, 225382859454704, 265964384650717, 239507608897640, 252278445029394, 100855107427198, 5169225379556]],
    [42, [172851193613047, 206575247933480, 66949701417803, 173184710903149, 117364668566682, 114063384614876, 156789420285064, 119811078077984]],
    [123456789, [112883608892673, 222957141959344, 65576490950436, 1762764056975, 145974904634927, 18290076732291, 3371617987324, 6465979923002]],
  ] as const)('seed=%i: nextLong 低 48 位与 JVM 一致 (有符号借位语义)', (seed, expected) => {
    const r = new JavaRandom(seed)
    for (const e of expected) expect(r.nextLong()).toBe(e)
  })

  it.each([
    // [seed, nextBoolean 序列 (JVM 21)]
    [1, [true, false, false, false, false, false, false, true]],
    [42, [true, false, true, false, false, true, false, true]],
    [123456789, [true, true, false, false, false, false, true, false]],
  ] as const)('seed=%i: nextBoolean 序列与 JVM 一致', (seed, expected) => {
    const r = new JavaRandom(seed)
    for (const e of expected) expect(r.nextBoolean()).toBe(e)
  })

  it.each([
    // [seed, nextFloat 序列 (JVM 21, 1e-6 容差)]
    [1, [0.7308782, 0.100473166, 0.4100808, 0.40743977, 0.2077148, 0.036235332, 0.332717, 0.6588672]],
    [42, [0.7275637, 0.054665208, 0.6832234, 0.0479393, 0.3087194, 0.9420735, 0.27707845, 0.70771056]],
  ] as const)('seed=%i: nextFloat 序列与 JVM 一致', (seed, expected) => {
    const r = new JavaRandom(seed)
    for (const e of expected) expect(r.nextFloat()).toBeCloseTo(e, 6)
  })

  it.each([
    // [seed, nextDouble 序列 (JVM 21, 1e-12 容差)]
    [1, [0.7308781907032909, 0.41008081149220166, 0.20771484130971707, 0.3327170559595112, 0.9677559094241207, 0.006117182265761301, 0.9637047970232077, 0.9398653887819098]],
    [42, [0.7275636800328681, 0.6832234717598454, 0.30871945533265976, 0.27707849007413665, 0.6655489517945736, 0.9033722646721782, 0.36878291341130565, 0.2757480694417024]],
  ] as const)('seed=%i: nextDouble 序列与 JVM 一致', (seed, expected) => {
    const r = new JavaRandom(seed)
    for (const e of expected) expect(r.nextDouble()).toBeCloseTo(e, 12)
  })

  it.each([
    // [seed, nextInt(100) 序列 (JVM 21)]
    [1, [85, 88, 47, 13, 54, 4, 34, 6]],
    [42, [30, 63, 48, 84, 70, 25, 5, 18]],
    [123456789, [65, 0, 83, 44, 90, 54, 33, 7]],
  ] as const)('seed=%i: nextInt(100) 序列与 JVM 一致', (seed, expected) => {
    const r = new JavaRandom(seed)
    for (const e of expected) expect(r.nextInt(100)).toBe(e)
  })
})

describe('JavaRandom 属性测试 (固定种子, 断言不变量而非具体值)', () => {
  const SEEDS = [0, 1, 7, 42, 123456789, 987654321]
  const BOUNDS = [1, 2, 3, 7, 10, 16, 100, 1000, 65536, 536870912, 2147483647]

  it.each(SEEDS)('seed=%i: nextInt(bound) 落在 [0, bound) 且同种子序列确定', (seed) => {
    const r1 = new JavaRandom(seed)
    const r2 = new JavaRandom(seed)
    for (const bound of BOUNDS) {
      for (let i = 0; i < 200; i++) {
        const a = r1.nextInt(bound)
        expect(a).toBe(r2.nextInt(bound))
        expect(a).toBeGreaterThanOrEqual(0)
        expect(a).toBeLessThan(bound)
      }
    }
  })

  it.each(SEEDS)('seed=%i: nextDouble/nextFloat 在 [0,1) 且确定', (seed) => {
    const r1 = new JavaRandom(seed)
    const r2 = new JavaRandom(seed)
    for (let i = 0; i < 1000; i++) {
      const d1 = r1.nextDouble()
      expect(d1).toBe(r2.nextDouble())
      expect(d1).toBeGreaterThanOrEqual(0)
      expect(d1).toBeLessThan(1)
      const f1 = r1.nextFloat()
      expect(f1).toBe(r2.nextFloat())
      expect(f1).toBeGreaterThanOrEqual(0)
      expect(f1).toBeLessThan(1)
    }
  })

  it('统计均匀性: seed=1 的 10000 次 nextInt(10) 每桶计数在合理范围 (500..1500)', () => {
    const r = new JavaRandom(1)
    const buckets = new Array<number>(10).fill(0)
    for (let i = 0; i < 10000; i++) buckets[r.nextInt(10)]!++
    for (const c of buckets) {
      expect(c).toBeGreaterThan(500)
      expect(c).toBeLessThan(1500)
    }
  })

  it.each(SEEDS)('seed=%i: setSeed 后序列可复现', (seed) => {
    const r = new JavaRandom(seed)
    const seq1 = Array.from({ length: 50 }, () => r.nextInt(1000))
    r.setSeed(seed)
    const seq2 = Array.from({ length: 50 }, () => r.nextInt(1000))
    expect(seq2).toEqual(seq1)
  })

  it('大界 nextInt 与有界 nextInt 相互独立推进 (多种子)', () => {
    for (const seed of [0, 1, 42, 999]) {
      const r1 = new JavaRandom(seed)
      const r2 = new JavaRandom(seed)
      for (let i = 0; i < 50; i++) {
        expect(r1.nextInt(2147483647)).toBe(r2.nextInt(2147483647))
        expect(r1.nextInt(1000)).toBe(r2.nextInt(1000))
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4X3 补测: 默认构造 (时间种子) / GGN_RND_DBG 调试输出 / next31 私有方法.
// ─────────────────────────────────────────────────────────────────────────────

describe('JavaRandom T4X3 补测', () => {
  it('默认构造 (无种子): 不抛错且序列在有效范围', () => {
    const r = new JavaRandom()
    for (let i = 0; i < 100; i++) {
      const v = r.nextInt(100)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(100)
      expect(Number.isInteger(v)).toBe(true)
    }
    const r2 = new JavaRandom()
    expect(r2.nextDouble()).toBeGreaterThanOrEqual(0)
    expect(r2.nextDouble()).toBeLessThan(1)
  })

  it('GGN_RND_DBG: nextInt 打印 [RND] 调试行', () => {
    vi.stubEnv('GGN_RND_DBG', '1')
    const errors: string[] = []
    const orig = console.error
    console.error = (msg: unknown) => { errors.push(String(msg)) }
    try {
      const r = new JavaRandom(1)
      r.nextInt(100)
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('[RND] #1 bits=31')
      expect(errors[0]).toContain('nextInt')
    } finally {
      console.error = orig
      vi.unstubAllEnvs()
    }
  })

  it('next31 (private): 等价于 next(31) 序列', () => {
    const r = new JavaRandom(7)
    const a = (r as unknown as { next31(): number }).next31()
    const b = r.nextInt(1 << 30) // 非 2 幂 → 内部先 next(31)
    void a
    expect(Number.isInteger(b)).toBe(true)
    expect(b).toBeGreaterThanOrEqual(0)
    // 与 nextInt(2 的幂) 推进一致: 幂分支也用 next(31)
    const r2 = new JavaRandom(7)
    const c = (r2 as unknown as { next31(): number }).next31()
    const r3 = new JavaRandom(7)
    const d = r3.nextInt(1073741824) // 2^30 幂分支 → (bound * next(31)) >> 31
    expect(d).toBe(Math.floor((1073741824 * c) / 0x80000000))
  })
})
