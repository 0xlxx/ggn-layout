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
 * ModelOrderComponentGroup (对应 ELK layered components.ModelOrderComponentGroup).
 * 在 ComponentGroup 九宫格扇区约束之上叠加模型序约束 (MODEL_ORDER_CONSTRAINTS),
 * 并记录组内组件的加入顺序 (componentOrder).
 */
import { PortSide } from '../graph/enums.js'
import type { LGraph } from '../graph/lgraph.js'
import { EXT_PORT_CONNECTIONS } from '../options/internal-properties.js'
import { ComponentGroup } from './component-group.js'

type SideSet = Set<PortSide>

/** 扇区 key — 必须与 component-group.ts 内部规则一致 (排序后逗号拼接). */
function key(sides: SideSet): string {
  return [...sides].sort().join(',')
}

/** 15 种扇区组合 + NONE (与 ComponentGroup 的 S 表同构; 此处为模型序约束独立维护). */
const S = {
  NONE: new Set<PortSide>(),
  NORTH: new Set([PortSide.NORTH]),
  EAST: new Set([PortSide.EAST]),
  SOUTH: new Set([PortSide.SOUTH]),
  WEST: new Set([PortSide.WEST]),
  NORTH_EAST: new Set([PortSide.NORTH, PortSide.EAST]),
  NORTH_WEST: new Set([PortSide.NORTH, PortSide.WEST]),
  EAST_SOUTH: new Set([PortSide.EAST, PortSide.SOUTH]),
  SOUTH_WEST: new Set([PortSide.SOUTH, PortSide.WEST]),
  NORTH_SOUTH: new Set([PortSide.NORTH, PortSide.SOUTH]),
  EAST_WEST: new Set([PortSide.EAST, PortSide.WEST]),
  NORTH_EAST_WEST: new Set([PortSide.NORTH, PortSide.EAST, PortSide.WEST]),
  NORTH_SOUTH_WEST: new Set([PortSide.NORTH, PortSide.SOUTH, PortSide.WEST]),
  EAST_SOUTH_WEST: new Set([PortSide.EAST, PortSide.SOUTH, PortSide.WEST]),
  NORTH_EAST_SOUTH: new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH]),
  NORTH_EAST_SOUTH_WEST: new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]),
} as const satisfies Record<string, SideSet>

/** 模型序约束: key(candidate) → 若组内已存在这些扇区组件则拒绝加入 (父类 CONSTRAINTS 之外的附加约束). */
export const MODEL_ORDER_CONSTRAINTS = new Map<string, Set<string>>()

function put(candidate: SideSet, ...conflicts: SideSet[]): void {
  const k = key(candidate)
  let list = MODEL_ORDER_CONSTRAINTS.get(k)
  if (list === undefined) { list = new Set(); MODEL_ORDER_CONSTRAINTS.set(k, list) }
  for (const c of conflicts) list.add(key(c))
}

// ELK ModelOrderComponentGroup 静态块逐条搬移:
// Key (待加入分量) 放入已有 value (扇区) 的组件组时发生冲突.
// 例如: NORTH 不能与 NONE 同组, 因为它会放在 NONE 之上, 违反模型序.
put(S.NORTH, S.NONE)
put(S.WEST, S.NONE)
put(S.NORTH_EAST, S.NONE)
put(S.NORTH_WEST, S.NONE)
put(S.NORTH_SOUTH_WEST, S.NONE)
put(S.NORTH_EAST_WEST, S.NONE)

put(S.NORTH_WEST, S.NORTH)

put(S.NONE, S.EAST)
put(S.NORTH, S.EAST)
put(S.WEST, S.EAST)
put(S.NORTH_EAST, S.EAST)
put(S.NORTH_SOUTH, S.EAST)
put(S.NORTH_WEST, S.EAST)
put(S.NORTH_SOUTH_WEST, S.EAST)
put(S.NORTH_EAST_WEST, S.EAST)
put(S.EAST_WEST, S.EAST) // XXX

put(S.NONE, S.SOUTH)
put(S.NORTH, S.SOUTH)
put(S.EAST, S.SOUTH)
put(S.WEST, S.SOUTH)
put(S.NORTH_EAST, S.SOUTH)
put(S.NORTH_SOUTH, S.SOUTH)
put(S.NORTH_WEST, S.SOUTH)
put(S.EAST_WEST, S.SOUTH)
put(S.SOUTH_WEST, S.SOUTH)
put(S.NORTH_SOUTH_WEST, S.SOUTH)
put(S.NORTH_EAST_SOUTH, S.SOUTH)
put(S.NORTH_EAST_WEST, S.SOUTH)

put(S.NORTH, S.WEST)
put(S.NORTH_EAST, S.WEST)
put(S.NORTH_WEST, S.WEST)
put(S.NORTH_EAST_WEST, S.WEST)

put(S.NORTH, S.NORTH_EAST)
put(S.WEST, S.NORTH_EAST)
put(S.NORTH_WEST, S.NORTH_EAST)
put(S.NORTH_EAST, S.NORTH_EAST)
put(S.NORTH_SOUTH_WEST, S.NORTH_EAST)

// NW 无冲突: 它在第一槽位

// 仅在最后一槽位有冲突
put(S.NONE, S.EAST_SOUTH)
put(S.NORTH, S.EAST_SOUTH)
put(S.EAST, S.EAST_SOUTH)
put(S.SOUTH, S.EAST_SOUTH)
put(S.WEST, S.EAST_SOUTH)
put(S.NORTH_EAST, S.EAST_SOUTH)
put(S.NORTH_SOUTH, S.EAST_SOUTH)
put(S.NORTH_WEST, S.EAST_SOUTH)
put(S.SOUTH_WEST, S.EAST_SOUTH)
//        put(S.EAST_SOUTH, S.EAST_SOUTH);
put(S.EAST_WEST, S.EAST_SOUTH)
put(S.NORTH_EAST_WEST, S.EAST_SOUTH)
//        put(S.NORTH_EAST_SOUTH, S.EAST_SOUTH);
put(S.NORTH_SOUTH_WEST, S.EAST_SOUTH)
//        put(S.EAST_SOUTH_WEST, S.EAST_SOUTH);
put(S.NORTH_EAST_SOUTH_WEST, S.EAST_SOUTH)

put(S.NONE, S.SOUTH_WEST)
put(S.NORTH, S.SOUTH_WEST)
put(S.EAST, S.SOUTH_WEST)
put(S.WEST, S.SOUTH_WEST)
put(S.NORTH_EAST, S.SOUTH_WEST)
put(S.NORTH_SOUTH, S.SOUTH_WEST)
put(S.NORTH_WEST, S.SOUTH_WEST)
put(S.EAST_WEST, S.SOUTH_WEST)
put(S.NORTH_EAST_WEST, S.SOUTH_WEST)
put(S.NORTH_EAST_SOUTH, S.SOUTH_WEST)
put(S.NORTH_EAST_SOUTH_WEST, S.SOUTH_WEST)

put(S.NORTH, S.EAST_WEST)
put(S.WEST, S.EAST_WEST)
put(S.NORTH_EAST, S.EAST_WEST)
put(S.NORTH_WEST, S.EAST_WEST)
put(S.SOUTH_WEST, S.EAST_WEST)
put(S.NORTH_EAST_WEST, S.EAST_WEST)
put(S.NORTH_SOUTH_WEST, S.EAST_WEST)

// 无附加冲突

put(S.NONE, S.EAST_SOUTH_WEST)
put(S.NORTH, S.EAST_SOUTH_WEST)
put(S.EAST, S.EAST_SOUTH_WEST)
put(S.WEST, S.EAST_SOUTH_WEST)
put(S.NORTH_EAST, S.EAST_SOUTH_WEST)
put(S.NORTH_SOUTH, S.EAST_SOUTH_WEST)
put(S.NORTH_WEST, S.EAST_SOUTH_WEST)
put(S.EAST_WEST, S.EAST_SOUTH_WEST)
put(S.NORTH_EAST_WEST, S.EAST_SOUTH_WEST)

put(S.NORTH, S.NORTH_SOUTH_WEST)
put(S.EAST, S.NORTH_SOUTH_WEST)
put(S.SOUTH, S.NORTH_SOUTH_WEST)
put(S.NORTH_EAST, S.NORTH_SOUTH_WEST)

put(S.NONE, S.NORTH_EAST_SOUTH)
put(S.NORTH, S.NORTH_EAST_SOUTH)
put(S.SOUTH, S.NORTH_EAST_SOUTH)
put(S.WEST, S.NORTH_EAST_SOUTH)
put(S.NORTH_EAST, S.NORTH_EAST_SOUTH)
put(S.NORTH_SOUTH, S.NORTH_EAST_SOUTH)
put(S.NORTH_WEST, S.NORTH_EAST_SOUTH)

put(S.NORTH_WEST, S.NORTH_EAST_SOUTH_WEST)
put(S.NORTH_EAST, S.NORTH_EAST_SOUTH_WEST)

// 看似可解但源于 C, EW, W, E 顺序固定的冲突: EW 在 C 和 W, E 之前
put(S.EAST_WEST, S.NONE)
put(S.EAST_WEST, S.WEST)
put(S.EAST_WEST, S.EAST)

// 看似可解但源于 C, NS, N, S 顺序固定的冲突
put(S.NORTH_SOUTH, S.NONE)
put(S.NORTH_SOUTH, S.NORTH)
put(S.NORTH_SOUTH, S.SOUTH)

export class ModelOrderComponentGroup extends ComponentGroup {
  private componentOrder: LGraph[] = []

  constructor(component?: LGraph) {
    super()
    if (component !== undefined) {
      // ELK 构造器: add(component) + getComponentOrder().add(component) (组件序重复记录).
      this.add(component)
      this.componentOrder.push(component)
    }
  }

  /** 尝试加入组件: 父类扇区约束 + 模型序约束都通过才加入, 成功时记录模型序. */
  override add(component: LGraph): boolean {
    const added = super.add(component)
    if (added) this.componentOrder.push(component)
    return added
  }

  override canAdd(component: LGraph): boolean {
    if (!super.canAdd(component)) return false
    const candidateSides = component.getProperty<Set<PortSide>>(EXT_PORT_CONNECTIONS) ?? new Set()
    const modelOrderConstraints = MODEL_ORDER_CONSTRAINTS.get(key(candidateSides))
    if (modelOrderConstraints !== undefined) {
      for (const constraint of modelOrderConstraints) {
        if (this.hasSides(constraint)) return false
      }
    }
    return true
  }

  /** 组内是否已有该扇区组合的组件 (父类 components 表私有, 经公开 getComponentsFor 反查). */
  private hasSides(k: string): boolean {
    const sides = new Set<PortSide>(k === '' ? [] : k.split(',').map(s => s as PortSide))
    return this.getComponentsFor(sides).length > 0
  }

  /** 组内组件的模型序 (加入顺序). */
  getComponentOrder(): LGraph[] {
    return this.componentOrder
  }
}
