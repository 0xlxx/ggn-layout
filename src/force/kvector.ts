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
 * KVector — ELK core.math.KVector 的 TS 移植 (force/stress 布局用).
 * 与 graph/enums.ts 的 KVector interface 互不干扰, 本类带 Java 语义方法.
 */
import type { JavaRandom } from '../util/java-random.js'

export class KVector {
  x: number
  y: number

  constructor(x = 0, y = 0) {
    this.x = x
    this.y = y
  }

  clone(): KVector {
    return new KVector(this.x, this.y)
  }

  set(v: KVector): KVector {
    this.x = v.x
    this.y = v.y
    return this
  }

  add(v: KVector): KVector {
    this.x += v.x
    this.y += v.y
    return this
  }

  sub(v: KVector): KVector {
    this.x -= v.x
    this.y -= v.y
    return this
  }

  scale(f: number): KVector {
    this.x *= f
    this.y *= f
    return this
  }

  reset(): KVector {
    this.x = 0
    this.y = 0
    return this
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }

  distance(v: KVector): number {
    const dx = this.x - v.x
    const dy = this.y - v.y
    return Math.sqrt(dx * dx + dy * dy)
  }

  /** Java KVector.bound: 逐分量夹紧到 [min,max]. */
  bound(minx: number, miny: number, maxx: number, maxy: number): void {
    if (this.x < minx) this.x = minx
    else if (this.x > maxx) this.x = maxx
    if (this.y < miny) this.y = miny
    else if (this.y > maxy) this.y = maxy
  }

  /** Java KVector.wiggle(Random, maxLength): 随机扰动 (随机序列影响 force 结果). */
  wiggle(random: JavaRandom, maxLength: number): void {
    const length = 2 * random.nextDouble() * maxLength - maxLength
    const angle = 2 * Math.PI * random.nextDouble()
    this.x += length * Math.cos(angle)
    this.y += length * Math.sin(angle)
  }
}

/** ELK ElkMath.clipVector: 向量裁剪到 w×h 矩形内 (边锚点用). */
export function clipVector(v: KVector, width: number, height: number): KVector {
  const wh = width / 2
  const hh = height / 2
  const absx = Math.abs(v.x)
  const absy = Math.abs(v.y)
  let xscale = 1
  let yscale = 1
  if (absx > wh) xscale = wh / absx
  if (absy > hh) yscale = hh / absy
  v.scale(Math.min(xscale, yscale))
  return v
}
