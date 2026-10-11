/**
 * LayeredSpacingsBuilder 附加语义测试 (覆盖 LayeredSpacingTest 未覆盖行):
 * withFactor/withValue 的非法参数抛错、base option 保护、withOverwrite、computeFactor、
 * build 默认值 no-op 分支、toVisitor.
 */
import { describe, expect, it } from 'vitest'
import { MapPropertyHolder } from '../../src/graph/properties.js'
import { Property } from '../../src/graph/properties.js'
import { LNode } from '../../src/index.js'
import { layeredSpacingsWithBaseValue, LayeredSpacingsBuilder } from '../../src/options/layered-spacings.js'
import {
  SPACING_NODE_NODE, SPACING_EDGE_EDGE, SPACING_EDGE_NODE,
} from '../../src/options/layered-options.js'

const UNKNOWN = new Property<number>('org.example.unknownSpacing', 10)

describe('LayeredSpacingsBuilder (ELK Java 移植)', () => {
  it('withFactor: 未知选项抛错', () => {
    const builder = layeredSpacingsWithBaseValue(33.0)
    expect(() => builder.withFactor(UNKNOWN, 2.0))
      .toThrow(`'${UNKNOWN.getId()}' is not a configurable spacing option.`)
  })

  it('withFactor: 负因子抛错', () => {
    const builder = layeredSpacingsWithBaseValue(33.0)
    expect(() => builder.withFactor(SPACING_EDGE_EDGE, -1))
      .toThrow(`The factor for '${SPACING_EDGE_EDGE.getId()}' must not be negative (-1).`)
  })

  it('withFactor: base option (nodeNode) 抛错', () => {
    const builder = layeredSpacingsWithBaseValue(33.0)
    expect(() => builder.withFactor(SPACING_NODE_NODE, 2.0))
      .toThrow(`'${SPACING_NODE_NODE.getId()}' is the base spacing option not allowed to use with 'withFactor'.`)
  })

  it('withValue: 未知选项抛错', () => {
    const builder = layeredSpacingsWithBaseValue(33.0)
    expect(() => builder.withValue(UNKNOWN, 5))
      .toThrow(`'${UNKNOWN.getId()}' is not a configurable spacing option.`)
  })

  it('withValue: 负值抛错', () => {
    const builder = layeredSpacingsWithBaseValue(33.0)
    expect(() => builder.withValue(SPACING_EDGE_EDGE, -2))
      .toThrow(`The value for '${SPACING_EDGE_EDGE.getId()}' must not be negative (-2).`)
  })

  it('withValue: base option (nodeNode) 抛错', () => {
    const builder = layeredSpacingsWithBaseValue(33.0)
    expect(() => builder.withValue(SPACING_NODE_NODE, 5))
      .toThrow(`'${SPACING_NODE_NODE.getId()}' is the base spacing option not allowed to use with 'withValue'.`)
  })

  it('withValue: 计算 factor = value / baseSpacing 并应用', () => {
    const builder = layeredSpacingsWithBaseValue(33.0)
    const result = builder.withValue(SPACING_EDGE_EDGE, 66.0)
    expect(result).toBe(builder)
    expect(builder.getFactors().get(SPACING_EDGE_EDGE)).toBeCloseTo(2.0, 10)
    const node = new LNode()
    builder.apply(node)
    expect(node.getProperty(SPACING_EDGE_EDGE)).toBeCloseTo(66.0, 10)
  })

  it('withOverwrite(false) + 默认 baseSpacing: build 为 no-op', () => {
    const builder = layeredSpacingsWithBaseValue(SPACING_NODE_NODE.getDefault())
    builder.withOverwrite(false)
    const node = new LNode()
    const apply = builder.build()
    apply(node)
    expect(node.hasProperty(SPACING_EDGE_NODE)).toBe(false)
    // apply() 同样 no-op
    const node2 = new LNode()
    builder.apply(node2)
    expect(node2.hasProperty(SPACING_EDGE_NODE)).toBe(false)
  })

  it('withOverwrite(true) + 默认 baseSpacing: 强制应用', () => {
    const builder = layeredSpacingsWithBaseValue(SPACING_NODE_NODE.getDefault())
    builder.withOverwrite(true)
    const node = new LNode()
    builder.apply(node)
    expect(node.getProperty(SPACING_EDGE_NODE)).toBeCloseTo(SPACING_EDGE_NODE.getDefault(), 10)
  })

  it('toVisitor 返回应用到元素的函数', () => {
    const builder = layeredSpacingsWithBaseValue(44.0)
    const visitor = builder.toVisitor()
    const node = new LNode()
    visitor(node)
    expect(node.getProperty(SPACING_NODE_NODE)).toBeCloseTo(44.0, 10)
    // factor = 1 for nodeNode
    expect(node.getProperty(SPACING_EDGE_EDGE)).toBeCloseTo(44.0 * (SPACING_EDGE_EDGE.getDefault() / SPACING_NODE_NODE.getDefault()), 10)
  })

  it('dependentSpacingOptions 不含 base option 且均为已注册选项', () => {
    const deps = LayeredSpacingsBuilder.dependentSpacingOptions()
    const options = layeredSpacingsWithBaseValue(33.0).getFactors()
    for (const opt of deps) {
      expect(options.has(opt)).toBe(true)
    }
    expect(deps).not.toContain(SPACING_NODE_NODE)
    expect(options.has(SPACING_NODE_NODE)).toBe(true)
  })

  it('factor 乘积有限且 baseSpacing 非负时不抛错', () => {
    const builder = layeredSpacingsWithBaseValue(10)
    const holder = new MapPropertyHolder()
    builder.apply(holder)
    expect(holder.getProperty(SPACING_NODE_NODE)).toBe(10)
  })
})
