/**
 * Direction — alg.common.polyomino.structures.Direction 枚举 (0.12.0).
 */
export enum Direction {
  NORTH = 'NORTH',
  EAST = 'EAST',
  SOUTH = 'SOUTH',
  WEST = 'WEST',
}

export namespace Direction {
  /** EAST/WEST 视为水平, NORTH/SOUTH 垂直. */
  export function isHorizontal(dir: Direction): boolean {
    return dir === Direction.EAST || dir === Direction.WEST
  }
}
