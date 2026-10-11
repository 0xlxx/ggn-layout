/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * java.util.Random 的 TypeScript 移植 (与 ELK/GWT 语义一致).
 * nextInt(bound) 使用完整 Java/GWT 语义: 2 的幂分支 (n*next(31))>>31,
 * 否则 rejection sampling (bits % bound, 拒绝高位溢出). 之前用简化 next(31)%bound
 * 导致环图断环选择与 elkjs 不一致 (feedback_edge 等).
 *
 * P3 sweep 优化 (2026-08-12, p3-sweep 簇, 位级等价):
 * - 热路径 next(bits) 改为 Number 定点乘 (seed 拆 24+24 位, M 拆 0x5DE/0xECE66D),
 *   与 BigInt 实现逐位一致 (60M 步 × 5000 种子 + 边界种子验证 0 差异), 免 BigInt 分配.
 * - 冷路径 (构造器 / setSeed / nextLong) 保留 BigInt 语义, 调用次数每图 O(1).
 * - 随机序列与调用次数完全一致 (ORDERED 红线: sweep 方向 / barycenter 扰动逐位不变).
 */

const MULTIPLIER = 0x5DEECE66Dn
const ADDEND = 0xBn
const MASK = (1n << 48n) - 1n

// Number 定点: M = 0x5DEECE66D = 0x5DE * 2^24 + 0xECE66D
const M_LO = 0xECE66D
const M_HI = 0x5DE

/** RND 调试计数器 (process.env.GGN_RND_DBG 时使用). */
let __rnCounter = 0

export class JavaRandom {
  /** 低 48 位种子 (Number 可精确表示, < 2^53). */
  private seed: number

  constructor(seed?: number) {
    if (seed === undefined || seed === null) {
      // ELK: new Random() 使用时间种子.
      this.seed = Number((BigInt(Date.now() ^ (Math.random() * 0xFFFFFFFF)) ^ MULTIPLIER) & MASK)
    } else {
      this.seed = Number((BigInt(seed) ^ MULTIPLIER) & MASK)
    }
  }

  private next(bits: number): number {
    // seed = (seed * M + 0xB) & MASK, 拆 24+24 位定点乘 (与 BigInt 逐位一致).
    const seed = this.seed
    const lo = seed & 0xFFFFFF
    const hi = Math.floor(seed / 0x1000000)
    const t0 = lo * M_LO + 0xB
    const carry = Math.floor(t0 / 0x1000000)
    const t1 = hi * M_LO + lo * M_HI + carry
    this.seed = ((t1 & 0xFFFFFF) * 0x1000000) + (t0 & 0xFFFFFF)
    const v = Math.floor(this.seed / 2 ** (48 - bits))
    if (process.env.GGN_RND_DBG) {
      __rnCounter++
      const st = new Error().stack?.split('\n').slice(2, 6).map(l => { const m = l.trim().match(/at ([\w.]+)/); return m ? m[1] : '?' }).join('>') ?? ''
      console.error(`[RND] #${__rnCounter} bits=${bits} v=${v} ${st}`)
    }
    return v
  }

  nextInt(bound: number): number {
    // Java/GWT Random.nextInt(bound):
    //   - bound 是 2 的幂: (bound * next(31)) >> 31
    //   - 否则 rejection sampling: val = next(31) % bound, 拒绝 bits - val + (bound-1) < 0
    if ((bound & -bound) === bound) {
      return Math.floor((bound * this.next(31)) / 0x80000000)
    }
    let bits: number
    let val: number
    do {
      bits = this.next(31)
      val = bits % bound
    } while (bits - val + (bound - 1) < 0)
    return val
  }

  nextBoolean(): boolean {
    return this.next(1) !== 0
  }

  nextFloat(): number {
    return this.next(24) / 0x1000000
  }

  nextLong(): number {
    // ELK Java 语义 (java.util.Random.nextLong): ((long)next(32) << 32) + next(32).
    // 其中第二个 next(32) 是【有符号 int】: 当 r2 >= 2^31 (负) 时, 加法会从高位借 1,
    // 使低 48 位种子的高 16 位 = (r1 - 1) & 0xFFFF. 之前用无符号 BigInt(r2) 相加,
    // 导致 setSeed(randomSeed) 的种子在 r2 为负时错位 (~50% 分量) → P3 random 序列
    // 分叉 → 层序/barycenter/交叉数连锁差异 (flat01/north_south_ports_1 等实证).
    // LayerSweepCrossingMinimizer 用 nextLong() 作为 randomSeed 并 setSeed(seed) 重置;
    // setSeed 只用低 48 位 ((seed ^ MULTIPLIER) & MASK), 故返回无符号低 48 位即可.
    // 注: 之前用 elkjs(GWT) 语义 (hi24*2^24+lo24), 与 ELK Java 的 nextLong 值不同,
    // 导致 setSeed 后 random 序列不同 → GreedySwitch 第一遍 sweep 方向不同 (carTracking 实证).
    const r1 = this.next(32)
    const r2 = this.next(32)
    const borrow = r2 >= 0x80000000 ? 1n : 0n
    const value = ((BigInt(r1) - borrow) << 32n) + BigInt(r2)
    return Number(value & 0xFFFFFFFFFFFFn)
  }

  nextDouble(): number {
    // java.util.Random.nextDouble: ((next(26) << 27) + next(27)) / 2^53
    return (this.next(26) * 0x8000000 + this.next(27)) / 0x20000000000000
  }

  /** 重置种子 (ELK LayerSweepCrossingMinimizer.compareDifferentRandomizedLayouts). */
  setSeed(seed: number): void {
    this.seed = Number((BigInt(seed) ^ MULTIPLIER) & MASK)
  }

  private next31(): number {
    return this.next(31)
  }
}
