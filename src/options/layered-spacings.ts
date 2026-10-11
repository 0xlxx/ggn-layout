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
 * LayeredSpacings (对应 ELK options.LayeredSpacings + core.util.ElkSpacings.AbstractSpacingsBuilder).
 * 便捷配置核心 spacing 值: 以 baseSpacing 为基准, 按各选项默认值/基准默认值比例生成 factor,
 * 再统一乘 baseSpacing 应用到图元素.
 */
import { Property } from '../graph/properties.js'
import type { MapPropertyHolder } from '../graph/properties.js'
import {
  SPACING_COMPONENT_COMPONENT, SPACING_EDGE_EDGE, SPACING_EDGE_LABEL, SPACING_EDGE_NODE,
  SPACING_LABEL_LABEL, SPACING_LABEL_NODE, SPACING_LABEL_PORT_HORIZONTAL, SPACING_LABEL_PORT_VERTICAL,
  SPACING_NODE_SELF_LOOP, SPACING_PORT_PORT, SPACING_EDGE_EDGE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE_BETWEEN_LAYERS, SPACING_NODE_NODE_BETWEEN_LAYERS, SPACING_NODE_NODE,
} from './layered-options.js'

export class LayeredSpacingsBuilder {
  private readonly baseSpacing: number
  private readonly factorMap = new Map<Property<number>, number>()
  private overwrite = false

  constructor(baseSpacing: number) {
    this.baseSpacing = baseSpacing
    // 基准选项自身 factor = 1
    this.factorMap.set(SPACING_NODE_NODE, 1.0)
    // 其余选项默认按「选项默认值 / 基准默认值」比例
    for (const option of LayeredSpacingsBuilder.dependentSpacingOptions()) {
      const baseDefault = SPACING_NODE_NODE.getDefault()
      const optionDefault = option.getDefault()
      const factor = baseDefault != null && optionDefault != null ? optionDefault / baseDefault : 1.0
      this.factorMap.set(option, factor)
    }
  }

  static dependentSpacingOptions(): Property<number>[] {
    return [
      SPACING_COMPONENT_COMPONENT, SPACING_EDGE_EDGE, SPACING_EDGE_LABEL, SPACING_EDGE_NODE,
      SPACING_LABEL_LABEL, SPACING_LABEL_NODE, SPACING_LABEL_PORT_HORIZONTAL, SPACING_LABEL_PORT_VERTICAL,
      SPACING_NODE_SELF_LOOP, SPACING_PORT_PORT, SPACING_EDGE_EDGE_BETWEEN_LAYERS,
      SPACING_EDGE_NODE_BETWEEN_LAYERS, SPACING_NODE_NODE_BETWEEN_LAYERS,
    ]
  }

  getFactors(): Map<Property<number>, number> {
    return this.factorMap
  }

  withFactor(spacingOption: Property<number>, factor: number): this {
    if (!this.factorMap.has(spacingOption)) {
      throw new Error(`'${spacingOption.getId()}' is not a configurable spacing option.`)
    }
    if (factor < 0) {
      throw new Error(`The factor for '${spacingOption.getId()}' must not be negative (${factor}).`)
    }
    if (spacingOption.getId() === SPACING_NODE_NODE.getId()) {
      throw new Error(`'${spacingOption.getId()}' is the base spacing option not allowed to use with 'withFactor'.`)
    }
    this.factorMap.set(spacingOption, factor)
    return this
  }

  withValue(spacingOption: Property<number>, value: number): this {
    if (!this.factorMap.has(spacingOption)) {
      throw new Error(`'${spacingOption.getId()}' is not a configurable spacing option.`)
    }
    if (value < 0) {
      throw new Error(`The value for '${spacingOption.getId()}' must not be negative (${value}).`)
    }
    if (spacingOption.getId() === SPACING_NODE_NODE.getId()) {
      throw new Error(`'${spacingOption.getId()}' is the base spacing option not allowed to use with 'withValue'.`)
    }
    this.factorMap.set(spacingOption, this.computeFactor(value))
    return this
  }

  withOverwrite(shallOverwrite: boolean): this {
    this.overwrite = shallOverwrite
    return this
  }

  private computeFactor(value: number): number {
    return value / this.baseSpacing
  }

  /** 构建一个把间距配置应用到任意 holder 的函数. */
  build(): (element: MapPropertyHolder) => void {
    const { baseSpacing, factorMap, overwrite } = this
    const { SPACING_NODE_NODE: base } = { SPACING_NODE_NODE }
    if (!overwrite && Math.abs(baseSpacing - base.getDefault()) < 1e-4) {
      return () => { /* 与默认一致且不允许覆盖: 不应用 */ }
    }
    return (element) => {
      for (const [option, factor] of factorMap) {
        element.setProperty(option, factor * baseSpacing)
      }
    }
  }

  apply(holder: MapPropertyHolder): void {
    this.build()(holder)
  }

  /** 返回应用到每个图元素的访问器函数. */
  toVisitor(): (e: MapPropertyHolder) => void {
    return this.build()
  }
}

/** 以 baseSpacing 为基准新建间距配置器 (对应 ELK LayeredSpacings.withBaseValue). */
export function layeredSpacingsWithBaseValue(baseSpacing: number): LayeredSpacingsBuilder {
  return new LayeredSpacingsBuilder(baseSpacing)
}
