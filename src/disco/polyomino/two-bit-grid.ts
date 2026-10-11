/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * TwoBitGrid — alg.common.polyomino.structures.TwoBitGrid (0.12.0).
 *
 * Java long[][] 位压缩 (每格 2 位: 00 empty / 01 blocked / 10 weakly blocked, 每 word 32 格 × 2 位 = 64 位).
 * JS number 位运算只有 32 位 — 每个 Java long 拆成两个 Uint32 lane, 用 typed array 存储.
 * 位布局与 Java 完全一致: bit 2*x 是 blocked, bit 2*x+1 是 weakly blocked.
 * 越界检查复刻 Java 行为 (显式 x >= xSize 检查 + 数组访问包装).
 */
import { GridIndexOutOfBoundsError } from './ithree-value-grid.js'
import type { IThreeValueGrid } from './ithree-value-grid.js'

const TWO_LSBS_MASK = 0x03
const EMPTY = 0x00
const BLOCKED = 0x01
const WEAKLY_BLOCKED = 0x02
const HALF_WORD = 32.0
const REST_MASK = 0x1F
const RIGHT_SHIFT = 5 // 2^5 = 32

export class TwoBitGrid implements IThreeValueGrid {
  /** 每行 wordsPerRow 个 64-bit word；每个 word 连续存低/高 32 位 lane。 */
  private grid: Uint32Array
  private wordsPerRow = 0
  private xSize: number
  private ySize: number

  constructor(width = 0, height = 0) {
    this.grid = new Uint32Array(0)
    this.xSize = 0
    this.ySize = 0
    this.reinitialize(width, height)
  }

  getWidth(): number {
    return this.xSize
  }

  getHeight(): number {
    return this.ySize
  }

  isEmpty(x: number, y: number): boolean {
    try {
      return this.retrieve(x, y) === EMPTY
    } catch {
      throw new GridIndexOutOfBoundsError(`Grid is only of size ${this.xSize}*${this.ySize}. Requested point (${x}, ${y}) is out of bounds.`)
    }
  }

  isBlocked(x: number, y: number): boolean {
    try {
      return this.retrieve(x, y) === BLOCKED
    } catch {
      throw new GridIndexOutOfBoundsError(`Grid is only of size ${this.xSize}*${this.ySize}. Requested point (${x}, ${y}) is out of bounds.`)
    }
  }

  isWeaklyBlocked(x: number, y: number): boolean {
    try {
      return this.retrieve(x, y) === WEAKLY_BLOCKED
    } catch {
      throw new GridIndexOutOfBoundsError(`Grid is only of size ${this.xSize}*${this.ySize}. Requested point (${x}, ${y}) is out of bounds.`)
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.xSize && y < this.ySize
  }

  reinitialize(width: number, height: number): void {
    this.wordsPerRow = Math.ceil(width / HALF_WORD)
    this.grid = new Uint32Array(this.wordsPerRow * height * 2)
    this.xSize = width
    this.ySize = height
  }

  setEmpty(x: number, y: number): void {
    this.set(x, y, false, false)
  }

  setBlocked(x: number, y: number): void {
    this.set(x, y, false, true)
  }

  setWeaklyBlocked(x: number, y: number): void {
    this.set(x, y, true, false)
  }

  toString(): string {
    let output = ' '
    let count = 0
    for (let x = 0; x < this.xSize; x++) {
      output += count.toString()
      count = this.incModTen(count)
    }
    output += '\n'
    count = 0
    for (let y = 0; y < this.ySize; y++) {
      output += count.toString()
      count = this.incModTen(count)
      for (let x = 0; x < this.xSize; x++) {
        const item = this.retrieve(x, y)
        if (item === EMPTY) {
          output += '_'
        } else if (item === BLOCKED) {
          output += 'X'
        } else {
          output += '0'
        }
      }
      output += '\n'
    }
    return output.substring(0, output.length - 1)
  }

  private retrieve(x: number, y: number): number {
    const xWord = x >> RIGHT_SHIFT
    if (x < 0 || y < 0 || y >= this.ySize || xWord >= this.wordsPerRow) {
      throw new GridIndexOutOfBoundsError(`Grid is only of size ${this.xSize}*${this.ySize}. Requested point (${x}, ${y}) is out of bounds.`)
    }
    const bitOffset = (x & REST_MASK) << 1
    const wordIndex = (y * this.wordsPerRow + xWord) * 2 + (bitOffset >>> 5)
    const value = (this.grid[wordIndex]! >>> (bitOffset & REST_MASK)) & TWO_LSBS_MASK
    return Number(value)
  }

  private set(x: number, y: number, msb: boolean, lsb: boolean): void {
    if (x >= this.xSize) {
      throw new GridIndexOutOfBoundsError(`Grid is only of size ${this.xSize}*${this.ySize}. Requested point (${x}, ${y}) is out of bounds.`)
    }
    const xWord = x >> RIGHT_SHIFT
    if (x < 0 || y < 0 || y >= this.ySize || xWord >= this.wordsPerRow) {
      throw new GridIndexOutOfBoundsError(`Grid is only of size ${this.xSize}*${this.ySize}. Requested point (${x}, ${y}) is out of bounds.`)
    }
    const bitOffset = (x & REST_MASK) << 1
    const wordIndex = (y * this.wordsPerRow + xWord) * 2 + (bitOffset >>> 5)
    const shift = bitOffset & REST_MASK
    let word = this.grid[wordIndex]!
    let mask = 1 << shift
    if (lsb) {
      word |= mask
    } else {
      word &= ~mask
    }
    mask <<= 1
    if (msb) {
      word |= mask
    } else {
      word &= ~mask
    }
    this.grid[wordIndex] = word
  }

  private incModTen(num: number): number {
    const eight = 8
    if (num > eight) {
      return 0
    }
    return num + 1
  }
}
