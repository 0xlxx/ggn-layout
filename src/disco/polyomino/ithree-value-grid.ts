/**
 * IThreeValueGrid — alg.common.polyomino.structures.IThreeValueGrid 接口 (0.12.0).
 * 离散 ℕ x ℕ 网格, 每格三态: empty / blocked / weakly blocked.
 */
export interface IThreeValueGrid {
  getWidth(): number
  getHeight(): number
  isEmpty(x: number, y: number): boolean
  isBlocked(x: number, y: number): boolean
  isWeaklyBlocked(x: number, y: number): boolean
  inBounds(x: number, y: number): boolean
  reinitialize(width: number, height: number): void
  setEmpty(x: number, y: number): void
  setBlocked(x: number, y: number): void
  setWeaklyBlocked(x: number, y: number): void
}

/** 越界异常 (Java IndexOutOfBoundsException 语义). */
export class GridIndexOutOfBoundsError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IndexOutOfBoundsException'
  }
}
