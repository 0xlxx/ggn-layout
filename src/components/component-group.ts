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
 * ComponentGroup (对应 ELK layered components.ComponentGroup).
 * 连通分量分组: 九宫格扇区约束 (nw/n/ne/w/c/e/sw/s/se), 检查外部端口侧组合冲突.
 */
import { PortSide } from '../graph/enums.js'
import type { LGraph } from '../graph/lgraph.js'
import { EXT_PORT_CONNECTIONS } from '../options/internal-properties.js'

type SideSet = Set<PortSide>

function key(sides: SideSet): string {
  return [...sides].sort().join(',')
}

/** 9 种扇区组合对应的侧集合 (规范化 Set). */
export const S = {
  NONE: new Set<PortSide>(),
  WEST: new Set([PortSide.WEST]),
  EAST: new Set([PortSide.EAST]),
  NORTH: new Set([PortSide.NORTH]),
  SOUTH: new Set([PortSide.SOUTH]),
  NORTH_SOUTH: new Set([PortSide.NORTH, PortSide.SOUTH]),
  EAST_WEST: new Set([PortSide.EAST, PortSide.WEST]),
  NORTH_WEST: new Set([PortSide.NORTH, PortSide.WEST]),
  NORTH_EAST: new Set([PortSide.NORTH, PortSide.EAST]),
  SOUTH_WEST: new Set([PortSide.SOUTH, PortSide.WEST]),
  EAST_SOUTH: new Set([PortSide.EAST, PortSide.SOUTH]),
  NORTH_EAST_WEST: new Set([PortSide.NORTH, PortSide.EAST, PortSide.WEST]),
  NORTH_SOUTH_WEST: new Set([PortSide.NORTH, PortSide.SOUTH, PortSide.WEST]),
  EAST_SOUTH_WEST: new Set([PortSide.EAST, PortSide.SOUTH, PortSide.WEST]),
  NORTH_EAST_SOUTH: new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH]),
  NORTH_EAST_SOUTH_WEST: new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]),
}

/** 外部端口侧组合 → 必须不存在于组内的冲突侧组合. */
const CONSTRAINTS = new Map<string, Set<string>>()

function put(candidate: SideSet, ...conflicts: SideSet[]): void {
  const k = key(candidate)
  let list = CONSTRAINTS.get(k)
  if (list === undefined) { list = new Set(); CONSTRAINTS.set(k, list) }
  for (const c of conflicts) list.add(key(c))
}

put(S.NONE, S.NORTH_EAST_SOUTH_WEST)
put(S.WEST, S.NORTH_EAST_SOUTH_WEST, S.NORTH_SOUTH_WEST)
put(S.EAST, S.NORTH_EAST_SOUTH, S.NORTH_EAST_SOUTH_WEST)
put(S.NORTH, S.NORTH_EAST_SOUTH_WEST, S.NORTH_EAST_WEST)
put(S.SOUTH, S.EAST_SOUTH_WEST, S.NORTH_EAST_SOUTH_WEST)
put(S.NORTH_SOUTH, S.EAST_WEST, S.NORTH_EAST_SOUTH_WEST, S.NORTH_EAST_WEST, S.EAST_SOUTH_WEST)
put(S.EAST_WEST, S.NORTH_SOUTH, S.NORTH_SOUTH_WEST, S.NORTH_EAST_SOUTH, S.NORTH_EAST_SOUTH_WEST)
put(S.NORTH_WEST, S.NORTH_WEST, S.NORTH_EAST_WEST, S.NORTH_SOUTH_WEST)
put(S.NORTH_EAST, S.NORTH_EAST, S.NORTH_EAST_WEST, S.NORTH_EAST_SOUTH)
put(S.SOUTH_WEST, S.SOUTH_WEST, S.EAST_SOUTH_WEST, S.NORTH_SOUTH_WEST)
put(S.EAST_SOUTH, S.EAST_SOUTH, S.EAST_SOUTH_WEST, S.NORTH_EAST_SOUTH)
put(S.NORTH_EAST_WEST, S.NORTH, S.NORTH_SOUTH, S.NORTH_WEST, S.NORTH_EAST,
  S.NORTH_EAST_SOUTH_WEST, S.NORTH_EAST_WEST, S.NORTH_SOUTH_WEST, S.NORTH_EAST_SOUTH)
put(S.EAST_SOUTH_WEST, S.SOUTH, S.NORTH_SOUTH, S.SOUTH_WEST, S.EAST_SOUTH,
  S.EAST_SOUTH_WEST, S.NORTH_SOUTH_WEST, S.NORTH_EAST_SOUTH, S.NORTH_EAST_SOUTH_WEST)
put(S.NORTH_SOUTH_WEST, S.WEST, S.EAST_WEST, S.NORTH_WEST, S.SOUTH_WEST,
  S.NORTH_EAST_WEST, S.EAST_SOUTH_WEST, S.NORTH_SOUTH_WEST, S.NORTH_EAST_SOUTH_WEST)
put(S.NORTH_EAST_SOUTH, S.EAST, S.EAST_WEST, S.NORTH_EAST, S.EAST_SOUTH,
  S.NORTH_EAST_WEST, S.EAST_SOUTH_WEST, S.NORTH_EAST_SOUTH, S.NORTH_EAST_SOUTH_WEST)
put(S.NORTH_EAST_SOUTH_WEST, S.NONE, S.WEST, S.EAST, S.NORTH, S.SOUTH, S.NORTH_SOUTH,
  S.EAST_WEST, S.NORTH_EAST_WEST, S.EAST_SOUTH_WEST, S.NORTH_SOUTH_WEST,
  S.NORTH_EAST_SOUTH, S.NORTH_EAST_SOUTH_WEST)

export class ComponentGroup {
  private components = new Map<string, LGraph[]>()

  constructor(component?: LGraph) {
    if (component !== undefined) this.add(component)
  }

  add(component: LGraph): boolean {
    if (this.canAdd(component)) {
      const k = key(component.getProperty<Set<PortSide>>(EXT_PORT_CONNECTIONS) ?? new Set())
      const list = this.components.get(k)
      if (list === undefined) this.components.set(k, [component])
      else list.push(component)
      return true
    }
    return false
  }

  canAdd(component: LGraph): boolean {
    const candidateSides = component.getProperty<Set<PortSide>>(EXT_PORT_CONNECTIONS) ?? new Set()
    const constraints = CONSTRAINTS.get(key(candidateSides))
    if (constraints !== undefined) {
      for (const constraint of constraints) {
        const list = this.components.get(constraint)
        if (list !== undefined && list.length > 0) return false
      }
    }
    return true
  }

  getPortSides(): string[] {
    return [...this.components.keys()]
  }

  getComponents(): LGraph[] {
    return [...this.components.values()].flat()
  }

  getComponentsFor(connections: Set<PortSide>): LGraph[] {
    return this.components.get(key(connections)) ?? []
  }
}
