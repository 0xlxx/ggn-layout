/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
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
