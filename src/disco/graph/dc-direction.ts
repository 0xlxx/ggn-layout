/**
 * DCDirection — alg.disco.graph.DCDirection 枚举 (0.12.0). 四个基本方向.
 */
export enum DCDirection {
  NORTH = 'NORTH',
  EAST = 'EAST',
  SOUTH = 'SOUTH',
  WEST = 'WEST',
}

export namespace DCDirection {
  /** EAST/WEST 为水平, 否则垂直. */
  export function isHorizontal(dir: DCDirection): boolean {
    return dir === DCDirection.EAST || dir === DCDirection.WEST
  }
}
