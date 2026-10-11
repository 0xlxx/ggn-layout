/**
 * PolyominoCompactor — alg.common.polyomino.PolyominoCompactor (0.12.0).
 * Freivalds et al. (2002) 启发式打包: 排序 → 每块从网格中心出发按 cost 函数试探
 * 直到不与其他块相交 → 写入网格. Comparator 全部 1:1 (含 reversed 反转).
 *
 * 注意 TS Array.sort 稳定 (ES2019+), 与 Java TimSort 稳定排序语义一致;
 * 多次 sort 时最后一次为主键.
 */
import {
  SuccessorCombination,
  SuccessorJitter,
  SuccessorLineByLine,
  SuccessorManhattan,
  SuccessorMaxNormWindingInMathPosSense,
  SuccessorQuadrantsGeneric,
} from './successors.js'
import type { SuccessorFun } from './successors.js'
import type { PlanarGrid } from './planar-grid.js'
import type { Polyomino } from './polyomino.js'
import type { Polyominoes } from './polyominoes.js'
import { Pair } from '../geometry.js'
import type { Direction } from './direction.js'
import type { UniqueTriple } from '../geometry.js'

type Comparator<T> = (a: T, b: T) => number

export class PolyominoCompactor {
  packPolyominoes(polyHolder: Polyominoes<Polyomino>): void {
    const polys = polyHolder.getPolyominoes()
    const grid = polyHolder.getGrid()

    // 1. Sort polyominoes by some strategy
    switch (polyHolder.lowLevelSort) {
      case 'BY_SIZE':
        polys.sort(reversed(compareMinPerimeter))
        break
      case 'BY_SIZE_AND_SHAPE':
      default:
        polys.sort(reversed(compareMinPerimeterWithShape))
        break
    }

    switch (polyHolder.highLevelSort) {
      case 'CORNER_CASES_THAN_SINGLE_SIDE_LAST':
        polys.sort(compareMinNumOfExtensions)
        polys.sort(compareSingleExtensionSideGreaterThanRest)
        polys.sort(compareCornerCasesGreaterThanRest)
        break
      case 'NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST':
      default:
        polys.sort(compareMinNumOfExtensions)
        polys.sort(compareMinNumOfExtensionDirections)
    }

    // 2. Initialize cost function.
    let successorBasedOnCost: SuccessorFun
    switch (polyHolder.traversalStrategy) {
      case 'SPIRAL':
        successorBasedOnCost = (c, p) => new SuccessorMaxNormWindingInMathPosSense().apply(c, p)
        break
      case 'LINE_BY_LINE':
        successorBasedOnCost = (c, p) => new SuccessorLineByLine().apply(c, p)
        break
      case 'MANHATTAN':
        successorBasedOnCost = (c, p) => new SuccessorManhattan().apply(c, p)
        break
      case 'JITTER':
        successorBasedOnCost = (c, p) => new SuccessorJitter().apply(c, p)
        break
      case 'QUADRANTS_MANHATTAN':
        successorBasedOnCost = (c, p) => new SuccessorQuadrantsGeneric((c2, p2) => new SuccessorManhattan().apply(c2, p2)).apply(c, p)
        break
      case 'QUADRANTS_LINE_BY_LINE':
        successorBasedOnCost = (c, p) => new SuccessorQuadrantsGeneric((c2, p2) => new SuccessorLineByLine().apply(c2, p2)).apply(c, p)
        break
      case 'COMBINE_LINE_BY_LINE_MANHATTAN':
        successorBasedOnCost = (c, p) => new SuccessorCombination(
          (c2, p2) => new SuccessorQuadrantsGeneric((c3, p3) => new SuccessorLineByLine().apply(c3, p3)).apply(c2, p2),
          (c2, p2) => new SuccessorQuadrantsGeneric((c3, p3) => new SuccessorManhattan().apply(c3, p3)).apply(c2, p2),
        ).apply(c, p)
        break
      case 'COMBINE_JITTER_MANHATTAN':
        successorBasedOnCost = (c, p) => new SuccessorCombination(
          (c2, p2) => new SuccessorQuadrantsGeneric((c3, p3) => new SuccessorJitter().apply(c3, p3)).apply(c2, p2),
          (c2, p2) => new SuccessorQuadrantsGeneric((c3, p3) => new SuccessorManhattan().apply(c3, p3)).apply(c2, p2),
        ).apply(c, p)
        break
      case 'QUADRANTS_JITTER':
      default:
        successorBasedOnCost = (c, p) => new SuccessorQuadrantsGeneric((c2, p2) => new SuccessorJitter().apply(c2, p2)).apply(c, p)
    }

    for (const poly of polys) {
      // 3. Start placement of each polyomino at the center of the grid
      let offX = 0
      let offY = 0
      let next = new Pair(offX, offY)

      // 4. Until no polyomino cell intersects with another polyomino already placed ...
      while (grid.intersectsWithCenterBasedPoly(poly, offX, offY)) {
        // ... get next trial position based on cost function
        next = successorBasedOnCost(next, poly)
        offX = next.getFirst()
        offY = next.getSecond()
      }
      // 5. When a valid position is found, mark all new cells in the underlying grid and save the position of the
      // polyomino's center relative to the grid's center
      grid.addFilledCellsFromPoly(poly, offX, offY)
    }
  }
}

/** Comparator.reversed(): 结果取反 (Java Comparator.reversed()). */
function reversed<T>(cmp: Comparator<T>): Comparator<T> {
  return (a, b) => -cmp(a, b)
}

/** MinPerimeterComparator (PlanarGrid: 半周长升序). */
function compareMinPerimeter(o1: PlanarGrid, o2: PlanarGrid): number {
  const halfPeri1 = o1.getWidth() + o1.getHeight()
  const halfPeri2 = o2.getWidth() + o2.getHeight()

  if (halfPeri1 < halfPeri2) {
    return -1
  }
  if (halfPeri1 === halfPeri2) {
    return 0
  }
  return 1
}

/** MinPerimeterComparatorWithShape: 短板平方 + 长板, 升序. */
function compareMinPerimeterWithShape(o1: PlanarGrid, o2: PlanarGrid): number {
  let width = o1.getWidth()
  let height = o1.getHeight()

  if (width < height) {
    width *= width
  } else {
    height *= height
  }

  let val1 = width + height

  width = o2.getWidth()
  height = o2.getHeight()

  if (width < height) {
    width *= width
  } else {
    height *= height
  }

  const val2 = width + height

  if (val1 < val2) {
    return -1
  }
  if (val1 === val2) {
    return 0
  }
  return 1
}

/** MinNumOfExtensionsComparator: extension 数量升序. */
function compareMinNumOfExtensions(o1: Polyomino, o2: Polyomino): number {
  const numExt1 = o1.getPolyominoExtensions().length
  const numExt2 = o2.getPolyominoExtensions().length

  if (numExt1 < numExt2) {
    return -1
  }
  if (numExt1 === numExt2) {
    return 0
  }
  return 1
}

/** 方向集 (Java parallelStream + toSet — 无序收集, 仅用 size/contains). */
function directionSet(poly: Polyomino): Set<Direction> {
  return new Set(poly.getPolyominoExtensions().map((ext: UniqueTriple<Direction, number, number>) => ext.getFirst()))
}

/** MinNumOfExtensionDirectionsComparator: extension 方向数升序. */
function compareMinNumOfExtensionDirections(o1: Polyomino, o2: Polyomino): number {
  const numDir1 = directionSet(o1).size
  const numDir2 = directionSet(o2).size

  if (numDir1 < numDir2) {
    return -1
  }
  if (numDir1 === numDir2) {
    return 0
  }
  return 1
}

/** SingleExtensionSideGreaterThanRestComparator: 恰 1 个方向的最不 minimal, 升序. */
function compareSingleExtensionSideGreaterThanRest(o1: Polyomino, o2: Polyomino): number {
  let numDir1 = directionSet(o1).size
  let numDir2 = directionSet(o2).size

  // more and less than 1 Extensions are considered more minimal
  numDir1 = numDir1 === 1 ? 1 : 0
  numDir2 = numDir2 === 1 ? 1 : 0

  if (numDir1 < numDir2) {
    return -1
  }
  if (numDir1 === numDir2) {
    return 0
  }
  return 1
}

/** CornerCasesGreaterThanRestComparator: 恰 2 个方向且一横一竖 (角点) 最不 minimal, 升序. */
function compareCornerCasesGreaterThanRest(o1: Polyomino, o2: Polyomino): number {
  let numDir1 = directionSet(o1).size
  // more and less than 2 Extensions are considered more minimal
  numDir1 = numDir1 === 2 ? 1 : 0
  if (numDir1 === 1) {
    const horizontalCount = [...directionSet(o1)].filter((x) => x === 'EAST' || x === 'WEST').length
    if (horizontalCount % 2 === 0) {
      // Both extensions are horizontal or vertical and thus not a "corner" case
      numDir1 = 0
    }
  }

  let numDir2 = directionSet(o2).size
  // more and less than 2 Extensions are considered more minimal
  numDir2 = numDir2 === 2 ? 1 : 0
  if (numDir2 === 1) {
    const horizontalCount = [...directionSet(o2)].filter((x) => x === 'EAST' || x === 'WEST').length
    if (horizontalCount % 2 === 0) {
      // Both extensions are horizontal or vertical and thus not a "corner" case
      numDir2 = 0
    }
  }

  if (numDir1 < numDir2) {
    return -1
  }
  if (numDir1 === numDir2) {
    return 0
  }
  return 1
}
