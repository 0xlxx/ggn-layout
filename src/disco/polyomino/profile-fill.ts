/**
 * ProfileFill — alg.common.polyomino.ProfileFill (0.12.0).
 * 四方向可见轮廓填充 polyomino 孔洞 (要求孔洞格 8-连通, 否则可能误填).
 */
import type { Polyomino } from './polyomino.js'

export namespace ProfileFill {
  /** 填充 polyomino 的孔洞. */
  export function fillPolyomino(poly: Polyomino): void {
    const width = poly.getWidth()
    const northProfile = new Array<number>(width)
    const southProfile = new Array<number>(width)

    const height = poly.getHeight()
    const eastProfile = new Array<number>(height)
    const westProfile = new Array<number>(height)

    // Compute visible profiles from all four cardinal directions.
    for (let xi = 0; xi < width; xi++) {
      let y = 0
      while (y < height && !poly.isBlocked(xi, y)) {
        y++
      }
      northProfile[xi] = y
    }

    for (let xi = 0; xi < width; xi++) {
      let y = height - 1
      while (y >= 0 && !poly.isBlocked(xi, y)) {
        y--
      }
      southProfile[xi] = y
    }

    for (let yi = 0; yi < height; yi++) {
      let x = 0
      while (x < width && !poly.isBlocked(x, yi)) {
        x++
      }
      eastProfile[yi] = x
    }

    for (let yi = 0; yi < height; yi++) {
      let x = width - 1
      while (x >= 0 && !poly.isBlocked(x, yi)) {
        x--
      }
      westProfile[yi] = x
    }

    // Fill all cells between these computed bounds.
    for (let xi = 0; xi < width; xi++) {
      for (let yi = 0; yi < height; yi++) {
        if (xi < westProfile[yi] && xi > eastProfile[yi] && yi < southProfile[xi] && yi > northProfile[xi]) {
          poly.setBlocked(xi, yi)
        }
      }
    }
  }
}
