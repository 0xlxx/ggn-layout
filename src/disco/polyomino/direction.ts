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
