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
 * ELK graph 枚举与基础类型.
 * 来源: org.eclipse.elk.alg.layered.graph.NodeType / org.eclipse.elk.core.options.PortSide 等
 */
import { CORE } from '../options/specs.js'

/** 节点类型 (对应 ELK NodeType). */
export enum NodeType {
  NORMAL = 'NORMAL',
  LONG_EDGE = 'LONG_EDGE',
  EXTERNAL_PORT = 'EXTERNAL_PORT',
  NORTH_SOUTH_PORT = 'NORTH_SOUTH_PORT',
  LABEL = 'LABEL',
  BREAKING_POINT = 'BREAKING_POINT',
  PLACEHOLDER = 'PLACEHOLDER',
  NONSHIFTING_PLACEHOLDER = 'NONSHIFTING_PLACEHOLDER',
}

/** 端口侧 (对应 ELK PortSide). */
export enum PortSide {
  UNDEFINED = 'UNDEFINED',
  NORTH = 'NORTH',
  EAST = 'EAST',
  SOUTH = 'SOUTH',
  WEST = 'WEST',
}

export const SIDES_NONE: PortSide[] = []
export const SIDES_NORTH = [PortSide.NORTH]
export const SIDES_EAST = [PortSide.EAST]
export const SIDES_SOUTH = [PortSide.SOUTH]
export const SIDES_WEST = [PortSide.WEST]
export const SIDES_EAST_WEST = [PortSide.EAST, PortSide.WEST]
export const SIDES_NORTH_SOUTH = [PortSide.NORTH, PortSide.SOUTH]
export const SIDES_NORTH_EAST = [PortSide.NORTH, PortSide.EAST]
export const SIDES_EAST_SOUTH = [PortSide.EAST, PortSide.SOUTH]
export const SIDES_SOUTH_WEST = [PortSide.SOUTH, PortSide.WEST]
export const SIDES_NORTH_WEST = [PortSide.NORTH, PortSide.WEST]
export const SIDES_NORTH_EAST_SOUTH = [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH]
export const SIDES_EAST_SOUTH_WEST = [PortSide.EAST, PortSide.SOUTH, PortSide.WEST]
export const SIDES_SOUTH_WEST_NORTH = [PortSide.SOUTH, PortSide.WEST, PortSide.NORTH]
export const SIDES_WEST_NORTH_EAST = [PortSide.WEST, PortSide.NORTH, PortSide.EAST]
export const SIDES_NORTH_EAST_WEST = [PortSide.NORTH, PortSide.EAST, PortSide.WEST]
export const SIDES_NORTH_SOUTH_WEST = [PortSide.NORTH, PortSide.SOUTH, PortSide.WEST]
export const SIDES_NORTH_EAST_SOUTH_WEST = [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]

/** 外部端口类型 (对应 ELK PortType). */
export enum PortType {
  UNDEFINED = 'UNDEFINED',
  INPUT = 'INPUT',
  OUTPUT = 'OUTPUT',
}

/** 布局方向 (对应 ELK Direction). */
export enum Direction {
  UNDEFINED = 'UNDEFINED',
  RIGHT = 'RIGHT',
  LEFT = 'LEFT',
  DOWN = 'DOWN',
  UP = 'UP',
}

/** 端口约束 (对应 ELK PortConstraints). */
export enum PortConstraints {
  UNDEFINED = 'UNDEFINED',
  FREE = 'FREE',
  FIXED_SIDE = 'FIXED_SIDE',
  FIXED_ORDER = 'FIXED_ORDER',
  FIXED_RATIO = 'FIXED_RATIO',
  FIXED_POS = 'FIXED_POS',
}

export namespace PortConstraints {
  export function isSideFixed(c: PortConstraints): boolean {
    return c === PortConstraints.FIXED_SIDE || c === PortConstraints.FIXED_ORDER
      || c === PortConstraints.FIXED_RATIO || c === PortConstraints.FIXED_POS
  }
  export function isPosFixed(c: PortConstraints): boolean {
    return c === PortConstraints.FIXED_POS
  }
  export function isRatioFixed(c: PortConstraints): boolean {
    return c === PortConstraints.FIXED_RATIO
  }

  export function isOrderFixed(c: PortConstraints): boolean {
    return c === PortConstraints.FIXED_ORDER || c === PortConstraints.FIXED_RATIO
      || c === PortConstraints.FIXED_POS
  }
}

/** 层约束 (对应 ELK LayerConstraint). */
export enum LayerConstraint {
  NONE = 'NONE',
  FIRST = 'FIRST',
  FIRST_SEPARATE = 'FIRST_SEPARATE',
  LAST = 'LAST',
  LAST_SEPARATE = 'LAST_SEPARATE',
}

/** 层内约束 (对应 ELK InLayerConstraint). */
export enum InLayerConstraint {
  NONE = 'NONE',
  TOP = 'TOP',
  BOTTOM = 'BOTTOM',
}

/** 边约束 (对应 ELK EdgeConstraint). */
export enum EdgeConstraint {
  NONE = 'NONE',
  OUTGOING_ONLY = 'OUTGOING_ONLY',
  INCOMING_ONLY = 'INCOMING_ONLY',
}

/** 2D 向量 (对应 ELK KVector). */
export interface KVector {
  x: number
  y: number
}

export function kvector(x = 0, y = 0): KVector {
  return { x, y }
}

export function kvectorSum(...vs: KVector[]): KVector {
  return { x: vs.reduce((s, v) => s + v.x, 0), y: vs.reduce((s, v) => s + v.y, 0) }
}

export namespace PortSide {
  export function opposed(side: PortSide): PortSide {
    switch (side) {
      case PortSide.NORTH: return PortSide.SOUTH
      case PortSide.SOUTH: return PortSide.NORTH
      case PortSide.EAST: return PortSide.WEST
      case PortSide.WEST: return PortSide.EAST
      default: return PortSide.UNDEFINED
    }
  }
  export function isVertical(side: PortSide): boolean {
    return side === PortSide.NORTH || side === PortSide.SOUTH
  }
  export function isHorizontal(side: PortSide): boolean {
    return side === PortSide.EAST || side === PortSide.WEST
  }
}

export namespace PortConstraints2 {
  export const PORT_CONSTRAINTS_KEY = CORE.portConstraints.id
}
