/**
 * DCPolyomino — alg.disco.structures.DCPolyomino (0.12.0).
 * 由 DCComponent 栅格化而来的低分辨率 polyomino (含扩展条带).
 */
import { KVector } from '../../force/kvector.js'
import { Rect } from '../geometry.js'
import { Polyomino } from '../polyomino/polyomino.js'
import { Direction } from '../polyomino/direction.js'
import type { DCComponent } from '../graph/dc-component.js'
import { DCDirection } from '../graph/dc-direction.js'
import type { DCElement } from '../graph/dc-element.js'

export class DCPolyomino extends Polyomino {
  /** 本 polyomino 代表的 DCComponent. */
  private representee: DCComponent
  /** polyomino 宽 (格). */
  private pWidth: number
  /** polyomino 高 (格). */
  private pHeight: number
  /** 单格在 DCComponent 坐标系中的宽. */
  private cellSizeX: number
  /** 单格在 DCComponent 坐标系中的高. */
  private cellSizeY: number

  constructor(comp: DCComponent, csX: number, csY: number) {
    super()
    this.cellSizeX = csX
    this.cellSizeY = csY
    this.representee = comp
    const compDims = comp.getDimensionsOfBoundingRectangle()

    this.pWidth = DCPolyomino.computeLowResDimension(compDims.x, this.cellSizeX)
    this.pHeight = DCPolyomino.computeLowResDimension(compDims.y, this.cellSizeY)

    this.reinitialize(this.pWidth, this.pHeight)

    this.fillCells()

    for (const elem of this.representee.getElements()) {
      if (elem.getExtensions().length > 0) {
        this.addExtensionsToPoly(elem)
      }
    }
  }

  /** 本 polyomino 左上角相对其 DCComponent 左上角的偏移. */
  getOffset(): KVector {
    const halfNeg = -0.5
    // KVector.sub(x, y) 双参 (Java 语义, 原地减)
    const dims = this.representee.getDimensionsOfBoundingRectangle().clone()
    dims.x -= this.pWidth * this.cellSizeX
    dims.y -= this.pHeight * this.cellSizeY
    return dims.scale(halfNeg)
  }

  /** polyomino 若以原坐标系绘制的左上角假设位置 (调试用). */
  getMinCornerOnCanvas(): KVector {
    return this.representee.getMinCorner().clone().sub(this.getOffset())
  }

  getCellSizeX(): number {
    return this.cellSizeX
  }

  getCellSizeY(): number {
    return this.cellSizeY
  }

  getId(): number {
    return this.representee.getId()
  }

  setId(id: number): void {
    this.representee.setId(id)
  }

  getRepresentee(): DCComponent {
    return this.representee
  }

  /** 给定组件宽高之一, 计算 polyomino 相应维度 (向上取整). */
  private static computeLowResDimension(dim: number, cellSize: number): number {
    const cellFit = dim / cellSize
    let fitTruncated = Math.trunc(cellFit)
    if (cellFit > fitTruncated) {
      fitTruncated++
    }
    return fitTruncated
  }

  /** 填充与 DCComponent 相交的 (假定为空的) polyomino 格. */
  private fillCells(): void {
    const compCorner = this.representee.getMinCorner()
    const polyoOffset = this.getOffset()

    const baseX = compCorner.x - polyoOffset.x
    let curX: number
    let curY = compCorner.y - polyoOffset.y

    for (let y = 0; y < this.pHeight; y++) {
      curX = baseX
      for (let x = 0; x < this.pWidth; x++) {
        if (this.representee.intersects(new Rect(curX, curY, this.cellSizeX, this.cellSizeY))) {
          this.setBlocked(x, y)
        }
        curX += this.cellSizeX
      }
      curY += this.cellSizeY
    }
  }

  /** 把 DCElement 的扩展条带加入 polyomino. */
  private addExtensionsToPoly(elem: DCElement): void {
    const extensions = elem.getExtensions()

    const compCorner = this.representee.getMinCorner()
    const polyoOffset = this.getOffset()

    let baseX = compCorner.x - polyoOffset.x
    const baseY = compCorner.y - polyoOffset.y

    const elemPos = elem.getBounds()

    baseX = elemPos.x - baseX
    const elemBaseY = elemPos.y - baseY

    for (const extension of extensions) {
      const pos = extension.getOffset()
      const xe = baseX + pos.x
      const ye = elemBaseY + pos.y

      const xp = Math.trunc(xe / this.cellSizeX)
      const yp = Math.trunc(ye / this.cellSizeY)

      const dir = extension.getDirection()
      let polyDir: Direction
      switch (dir) {
        case 'NORTH':
          polyDir = Direction.NORTH
          break
        case 'EAST':
          polyDir = Direction.EAST
          break
        case 'SOUTH':
          polyDir = Direction.SOUTH
          break
        default:
          polyDir = Direction.WEST
      }

      if (DCDirection.isHorizontal(dir)) {
        const ypPlusWidth = Math.trunc((ye + extension.getWidth()) / this.cellSizeY)
        this.addExtension(polyDir, yp, ypPlusWidth)
        if (dir === 'WEST') {
          this.weaklyBlockArea(0, yp, xp, ypPlusWidth)
        } else { // direction is EAST
          this.weaklyBlockArea(xp, yp, this.pWidth - 1, ypPlusWidth)
        }
      } else { // direction is vertical
        const xpPlusWidth = Math.trunc((xe + extension.getWidth()) / this.cellSizeX)
        this.addExtension(polyDir, xp, xpPlusWidth)
        if (dir === 'NORTH') {
          this.weaklyBlockArea(xp, 0, xpPlusWidth, yp)
        } else { // direction is SOUTH
          this.weaklyBlockArea(xp, yp, xpPlusWidth, this.pHeight - 1)
        }
      }
    }
  }
}
