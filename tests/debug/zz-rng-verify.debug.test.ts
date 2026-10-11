import { describe, it } from 'vitest'
import { JavaRandom } from '../../src/util/java-random.js'

class StdRandom {
  private seed: bigint
  constructor(seed: number) { this.seed = (BigInt(seed) ^ 0x5DEECE66Dn) & 0xFFFFFFFFFFFFn }
  next(bits: number): number {
    this.seed = (this.seed * 0x5DEECE66Dn + 0xBn) & 0xFFFFFFFFFFFFn
    return Number(this.seed >> BigInt(48 - bits))
  }
  nextInt(bound: number): number {
    if ((bound & -bound) === bound) return Math.floor((bound * this.next(31)) / 0x80000000)
    let bits: number, val: number
    do { bits = this.next(31); val = bits % bound } while (bits - val + (bound - 1) < 0)
    return val
  }
  nextBoolean(): boolean { return this.next(1) !== 0 }
  nextFloat(): number { return this.next(24) / 0x1000000 }
  nextLong(): number { return ((this.next(32) & 0xFFFF) * 0x100000000) + this.next(32) }
  nextDouble(): number { return (this.next(26) * 0x8000000 + this.next(27)) / 0x20000000000000 }
}

describe('rng-verify', () => {
  it('isolate first divergence', () => {
    const ggn = new JavaRandom(1)
    const std = new StdRandom(1)
    for (let i = 0; i < 300; i++) {
      const a = ggn.next(31), b = std.next(31)
      if (a !== b) { console.log(`next(31) #${i}: ggn=${a} std=${b}`); return }
    }
    console.log('next(31) 300 全一致')
    for (let i = 0; i < 100; i++) {
      const a = ggn.nextInt(4), b = std.nextInt(4)
      if (a !== b) { console.log(`nextInt(4) #${i}: ggn=${a} std=${b}`); return }
      const a7 = ggn.nextInt(7), b7 = std.nextInt(7)
      if (a7 !== b7) { console.log(`nextInt(7) #${i}: ggn=${a7} std=${b7}`); return }
      const ab = ggn.nextBoolean(), bb = std.nextBoolean()
      if (ab !== bb) { console.log(`nextBoolean #${i}: ggn=${ab} std=${bb}`); return }
      const af = ggn.nextFloat(), bf = std.nextFloat()
      if (af !== bf) { console.log(`nextFloat #${i}: ggn=${af} std=${bf}`); return }
      const ad = ggn.nextDouble(), bd = std.nextDouble()
      if (ad !== bd) { console.log(`nextDouble #${i}: ggn=${ad} std=${bd}`); return }
      const al = ggn.nextLong(), bl = std.nextLong()
      if (al !== bl) { console.log(`nextLong #${i}: ggn=${al} std=${bl}`); return }
    }
    console.log('全部一致')
  })
})
