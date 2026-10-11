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
