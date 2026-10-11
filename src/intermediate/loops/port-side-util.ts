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
 * 端口侧辅助 (ELK PortSide.ordinal 语义: NORTH=0, EAST=1, SOUTH=2, WEST=3, UNDEFINED=4).
 * ggn 的 PortSide 字符串枚举 ordinal 与 ELK 不一致, 统一用此映射.
 */
import { PortSide } from '../../graph/enums.js'

const SIDE_ORDINAL: Record<PortSide, number> = {
  [PortSide.NORTH]: 0,
  [PortSide.EAST]: 1,
  [PortSide.SOUTH]: 2,
  [PortSide.WEST]: 3,
  [PortSide.UNDEFINED]: 4,
}

export function portSideOrdinal(side: PortSide): number {
  return SIDE_ORDINAL[side]
}

/** ELK PortSide.right(): 顺时针下一侧. */
export function portSideRight(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.EAST
    case PortSide.EAST: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.WEST
    case PortSide.WEST: return PortSide.NORTH
    default: return PortSide.UNDEFINED
  }
}

/** ELK PortSide.left(): 逆时针下一侧. */
export function portSideLeft(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.WEST
    case PortSide.WEST: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.EAST
    case PortSide.EAST: return PortSide.NORTH
    default: return PortSide.UNDEFINED
  }
}

/** ELK PortSide.opposed(). */
export function portSideOpposed(side: PortSide): PortSide {
  switch (side) {
    case PortSide.NORTH: return PortSide.SOUTH
    case PortSide.SOUTH: return PortSide.NORTH
    case PortSide.EAST: return PortSide.WEST
    case PortSide.WEST: return PortSide.EAST
    default: return PortSide.UNDEFINED
  }
}

export const PORT_SIDE_COUNT = 5
