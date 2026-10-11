/**
 * Polyomino — alg.common.polyomino.structures.Polyomino (0.12.0).
 * 低分辨率网格表示的 polyomino, 可挂 extension (方向 + 偏移 + 宽度).
 */
import { PlanarGrid } from './planar-grid.js'
import { UniqueTriple } from '../geometry.js'
import type { Direction } from './direction.js'

export class Polyomino extends PlanarGrid {
  /** 加入其他网格时, 左上角相对该网格的 x 坐标. */
  private x = 0
  /** 加入其他网格时, 左上角相对该网格的 y 坐标. */
  private y = 0

  private polyominoExtensions: UniqueTriple<Direction, number, number>[]

  constructor(width = 0, height = 0, extensions: UniqueTriple<Direction, number, number>[] = []) {
    super(width, height)
    this.polyominoExtensions = extensions
  }

  getX(): number {
    return this.x
  }

  getY(): number {
    return this.y
  }

  setX(val: number): void {
    this.x = val
  }

  setY(val: number): void {
    this.y = val
  }

  getPolyominoExtensions(): UniqueTriple<Direction, number, number>[] {
    return this.polyominoExtensions
  }

  /** 在 polyomino 边界附加 extension (方向 + 相对原点的水平/垂直偏移 + 离散格宽度). */
  addExtension(dir: Direction, offset: number, width: number): void {
    this.polyominoExtensions.push(new UniqueTriple(dir, offset, width))
  }
}
