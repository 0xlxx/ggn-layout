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
 * ELK 属性系统 1:1 移植.
 *
 * 来源: org.eclipse.elk.graph.properties.{Property, IProperty, IPropertyHolder, MapPropertyHolder}
 *
 * P1 热属性直读字段化 (label-and-node-size-processor 优化, 2026-08-12):
 *   - Property 增加 slot 字段; options/layered-options.ts 底部 registerFastProperty 登记热属性.
 *   - 已登记属性在 MapPropertyHolder 上用 O(1) 数组槽位 (this.fast[slot]) 直读/直写,
 *     绕过 Map hash 查找 + 装箱 (getProperty @src/graph/properties.ts:59 热点).
 *   - getProperty/setProperty/hasProperty/copyProperties 语义与 Map 路径完全一致:
 *     缺省默认值 / 对象默认值首次读取缓存 / set 后 get 可见 / null|undefined 删除 /
 *     copyProperties 全量复制 (Map + fast 槽位).
 *   - 引用类型值 (数组/对象) 与 Map 路径存储同一引用, 别名语义不变 (单一事实来源),
 *     不引入新的原地改污染.
 */

/** 属性定义: 唯一 id + 默认值. */
export interface IProperty<T> {
  getId(): string
  getDefault(): T
}

/** 热属性槽位登记 (id → 槽位 + 默认值). */
interface FastSlot {
  id: string
  slot: number
  defaultValue: unknown
}

/** 已登记热属性槽位表 (数组下标 = 槽位). */
const FAST_SLOTS: FastSlot[] = []
/** id → 槽位 (字符串 key 访问热属性时反查; Property 对象走 prop.slot O(1)). */
const FAST_BY_ID = new Map<string, FastSlot>()

/** 登记热属性 (按 id 幂等; 同 id 不同 Property 实例复用同一槽位). */
export function registerFastProperty(property: Property<unknown>): void {
  const id = property.getId()
  let fast = FAST_BY_ID.get(id)
  if (fast === undefined) {
    fast = { id, slot: FAST_SLOTS.length, defaultValue: property.getDefault() }
    FAST_SLOTS.push(fast)
    FAST_BY_ID.set(id, fast)
  }
  property.slot = fast.slot
}

/** 登记无 Property 常量的热字符串 key (如 portLabels.treatAsGroup; 缺省 undefined). */
export function registerFastStringKey(id: string, defaultValue: unknown = undefined): void {
  if (FAST_BY_ID.has(id)) return
  const fast = { id, slot: FAST_SLOTS.length, defaultValue }
  FAST_SLOTS.push(fast)
  FAST_BY_ID.set(id, fast)
}

/** 属性定义 (对应 ELK Property<T>). */
export class Property<T> implements IProperty<T> {
  private readonly id: string
  private readonly defaultValue: T
  /** 热属性直读槽位 (P1; -1 = 未登记, 走 Map 路径). */
  slot = -1

  constructor(id: string, defaultValue?: T) {
    this.id = id
    this.defaultValue = defaultValue as T
  }

  getId(): string {
    return this.id
  }

  getDefault(): T {
    return this.defaultValue
  }

  equals(other: unknown): boolean {
    return other instanceof Property && this.id === other.id
  }

  toString(): string {
    return this.id
  }
}

/** 属性持有者 (对应 ELK IPropertyHolder / MapPropertyHolder). */
export class MapPropertyHolder {
  // ELK 属性以 ID 字符串为 key (同 id 不同默认值的 Property 共享取值/设置).
  // 兼容旧代码直接传字符串 key 的调用 (as any).
  private propertyMap: Map<string, unknown> | null = null
  /** 热属性直读字段: slot → value (undefined = 未设置). 惰性分配. */
  private fast: unknown[] | null = null

  setProperty<T>(property: IProperty<T> | string, value: T): this {
    if (typeof property === 'string') {
      const fast = FAST_BY_ID.get(property)
      if (fast !== undefined) {
        this.setFast(fast.slot, value)
        return this
      }
    } else {
      const slot = (property as Property<T>).slot
      if (slot >= 0) {
        this.setFast(slot, value)
        return this
      }
    }
    const id = typeof property === 'string' ? property : property.getId()
    if (value === null || value === undefined) {
      this.getProperties().delete(id)
    } else {
      this.getProperties().set(id, value)
    }
    return this
  }

  getProperty<T>(property: IProperty<T> | string): T {
    let slot = -1
    if (typeof property === 'string') {
      const fast = FAST_BY_ID.get(property)
      if (fast !== undefined) slot = fast.slot
    } else {
      slot = (property as Property<T>).slot
    }
    if (slot >= 0) {
      // 内联 fastGet: 热读占绝对多数, 避免每次槽位命中都经过方法调用.
      const arr = this.fast
      if (arr !== null) {
        const value = arr[slot]
        if (value !== undefined) return value as T
      }
      const def = FAST_SLOTS[slot]!.defaultValue
      if (def !== null && typeof def === 'object') (this.fast ??= [])[slot] = def
      return def as T
    }
    const map = this.propertyMap
    if (map) {
      const value = map.get(typeof property === 'string' ? property : property.getId())
      if (value !== undefined) return value as T
    }
    if (typeof property === 'string') return undefined as T
    // ELK: 默认值为 Cloneable 时缓存副本 (用户修改后再次 get 返回同一对象).
    const defaultValue = property.getDefault()
    if (defaultValue !== null && typeof defaultValue === 'object') {
      this.getProperties().set(property.getId(), defaultValue)
    }
    return defaultValue
  }

  hasProperty(property: IProperty<unknown> | string): boolean {
    if (typeof property === 'string') {
      const fast = FAST_BY_ID.get(property)
      if (fast !== undefined) return this.fast !== null && this.fast[fast.slot] !== undefined
    } else {
      const slot = (property as Property<unknown>).slot
      if (slot >= 0) return this.fast !== null && this.fast[slot] !== undefined
    }
    return this.propertyMap !== null && this.propertyMap.has(typeof property === 'string' ? property : property.getId())
  }

  copyProperties(other: IPropertyHolder | null): this {
    if (!other) return this
    const otherMap = other.getAllProperties()
    if (otherMap.size > 0) {
      for (const [k, v] of otherMap) this.setProperty(k, v)
    }
    // 热属性字段复制: getAllProperties 只含 Map, fast 槽位单独同步 (setProperty 按 id 路由).
    const otherFast = (other as MapPropertyHolder).fast
    if (otherFast !== null) {
      for (let s = 0; s < otherFast.length; s++) {
        const v = otherFast[s]
        if (v !== undefined) {
          if (FAST_SLOTS[s] !== undefined) (this.fast ??= [])[s] = v
        }
      }
    }
    return this
  }

  getAllProperties(): Map<string, unknown> {
    return this.propertyMap ?? EMPTY_MAP
  }

  /** 热属性直写: null|undefined = 删除 (槽位置 undefined). */
  private setFast(slot: number, value: unknown): void {
    if (value === null || value === undefined) {
      const arr = this.fast
      if (arr !== null) arr[slot] = undefined
    } else {
      (this.fast ??= [])[slot] = value
    }
  }

  private getProperties(): Map<string, unknown> {
    if (!this.propertyMap) this.propertyMap = new Map()
    return this.propertyMap
  }
}

const EMPTY_MAP = new Map<string, unknown>()

export interface IPropertyHolder {
  setProperty<T>(property: IProperty<T> | string, value: T): this
  getProperty<T>(property: IProperty<T> | string): T
  hasProperty(property: IProperty<unknown> | string): boolean
  copyProperties(other: IPropertyHolder | null): this
  getAllProperties(): Map<string, unknown>
}
