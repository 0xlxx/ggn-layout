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
 * Successor 系列 — alg.common.polyomino.Successor* (0.12.0).
 * 候选位置 cost 函数: 给定当前位置返回下一试探位置 (BiFunction<Pair, Polyomino, Pair>).
 * 全部 1:1 复刻: SuccessorCombination / SuccessorJitter / SuccessorLineByLine /
 * SuccessorManhattan / SuccessorMaxNormWindingInMathPosSense / SuccessorQuadrantsGeneric.
 */
import { Pair } from '../geometry.js'
import { Direction } from './direction.js'
import type { Polyomino } from './polyomino.js'

export type SuccessorFun = (coords: Pair<number, number>, poly: Polyomino) => Pair<number, number>

/** SuccessorCombination: 有 extension 的 polyomino 走 externalFun, 否则 normalFun. */
export class SuccessorCombination {
  private normalFun: SuccessorFun
  private externalFun: SuccessorFun

  constructor(normalFun: SuccessorFun, externalFun: SuccessorFun) {
    this.normalFun = normalFun
    this.externalFun = externalFun
  }

  apply(coords: Pair<number, number>, poly: Polyomino): Pair<number, number> {
    if (poly.getPolyominoExtensions().length > 0) {
      return this.externalFun(coords, poly)
    }
    return this.normalFun(coords, poly)
  }
}

/** SuccessorJitter: 抖动螺旋. */
export class SuccessorJitter {
  apply(coords: Pair<number, number>, _poly: Polyomino): Pair<number, number> {
    const x = coords.getFirst()
    const y = coords.getSecond()
    let newX = x
    let newY = y
    const cost = Math.max(Math.abs(x), Math.abs(y))
    if (x <= 0 && x === y) {
      newX = 0
      newY = y - 1
    } else {
      if (x === -cost && y !== cost) {
        newX = y
        newY = x
        if (y >= 0) {
          newX++
        }
      } else {
        newX = -y
        newY = x
      }
    }
    return new Pair(newX, newY)
  }
}

/** SuccessorLineByLine: 逐行扫描. */
export class SuccessorLineByLine {
  apply(coords: Pair<number, number>, _poly: Polyomino): Pair<number, number> {
    const x = coords.getFirst()
    const y = coords.getSecond()
    if (x >= 0) {
      if (x === y) {
        return new Pair(-x - 1, -x - 1)
      }
      if (x === -y) {
        return new Pair(-x, y + 1)
      }
    }
    if (Math.abs(x) > Math.abs(y)) {
      if (x < 0) {
        return new Pair(-x, y)
      }
      return new Pair(-x, y + 1)
    }
    return new Pair(x + 1, y)
  }
}

/** SuccessorManhattan: 曼哈顿圈. */
export class SuccessorManhattan {
  apply(coords: Pair<number, number>, _poly: Polyomino): Pair<number, number> {
    const x = coords.getFirst()
    const y = coords.getSecond()
    let newX = x
    let newY = y
    if (x === 0 && y === 0) {
      newY -= 1
    } else {
      if (x === -1 && y <= 0) {
        newX = 0
        newY -= 2
      } else {
        if (x <= 0 && y > 0) {
          newX -= 1
          newY -= 1
        } else {
          if (x >= 0 && y < 0) {
            newX += 1
            newY += 1
          } else {
            if (x > 0 && y >= 0) {
              newX -= 1
              newY += 1
            } else {
              newX += 1
              newY -= 1
            }
          }
        }
      }
    }
    return new Pair(newX, newY)
  }
}

/** SuccessorMaxNormWindingInMathPosSense: 最大范数螺旋 (数学正向). */
export class SuccessorMaxNormWindingInMathPosSense {
  apply(coords: Pair<number, number>, _poly: Polyomino): Pair<number, number> {
    const x = coords.getFirst()
    const y = coords.getSecond()
    const cost = Math.max(Math.abs(x), Math.abs(y))
    if (x < cost && y === -cost) {
      return new Pair(x + 1, y)
    }
    if (x === cost && y < cost) {
      return new Pair(x, y + 1)
    }
    if (x >= -cost && y === cost) {
      return new Pair(x - 1, y)
    }
    // if (x == -cost && y > -cost)
    return new Pair(x, y - 1)
  }
}

/**
 * SuccessorQuadrantsGeneric: 按 polyomino extension 方向限定候选象限
 * (无效象限的候选位置递归重试), 每次 poly 变化时重新计算允许象限.
 */
export class SuccessorQuadrantsGeneric {
  private lastPoly: Polyomino | null = null
  private posX = true
  private posY = true
  private negX = true
  private negY = true
  private costFun: SuccessorFun

  constructor(costFun: SuccessorFun) {
    this.costFun = costFun
  }

  apply(coords: Pair<number, number>, poly: Polyomino): Pair<number, number> {
    if (poly !== this.lastPoly) {
      this.lastPoly = poly
      const dirSet = new Set(poly.getPolyominoExtensions().map((ext) => ext.getFirst()))
      this.posX = true
      this.posY = true
      this.negX = true
      this.negY = true
      let containsPos = dirSet.has(Direction.NORTH)
      const containsNeg = dirSet.has(Direction.SOUTH)
      // Beware of the non mathematical coordinate system (inverted y-axis)!
      if (containsPos && !containsNeg) {
        this.posY = false
      }
      if (!containsPos && containsNeg) {
        this.negY = false
      }
      containsPos = dirSet.has(Direction.EAST)
      const containsNeg2 = dirSet.has(Direction.WEST)
      if (containsPos && !containsNeg2) {
        this.negX = false
      }
      if (!containsPos && containsNeg2) {
        this.posX = false
      }
    }
    const nextCoords = this.costFun(coords, poly)
    const newX = nextCoords.getFirst()
    const newY = nextCoords.getSecond()
    // (0,0) is part of the positive quadrant
    let invalid = false
    if (newX < 0) {
      if (!this.negX) {
        invalid = true
      }
    } else {
      if (!this.posX) {
        invalid = true
      }
    }
    if (newY < 0) {
      if (!this.negY) {
        invalid = true
      }
    } else {
      if (!this.posY) {
        invalid = true
      }
    }
    if (invalid) {
      return this.apply(nextCoords, poly)
    }
    return nextCoords
  }
}
