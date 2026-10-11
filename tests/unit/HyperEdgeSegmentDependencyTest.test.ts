/**
 * HyperEdgeSegmentDependency (ELK p5edges.orthogonal.HyperEdgeSegmentDependency) 语义单元测试.
 * SSOT: ELK Java 0.12.0 HyperEdgeSegmentDependency.java.
 *
 * 覆盖: 构造 (REGULAR/CRITICAL) + 列表双向登记、remove 双向摘除、reverse 反转、
 * getType/getSource/getTarget/getWeight 取值、setSource/setTarget 迁移 (旧段列表摘除).
 */
import { describe, expect, it } from 'vitest'
import { HyperEdgeSegment } from '../../src/p5edges/orthogonal/hyper-edge-segment.js'
import { DependencyType, HyperEdgeSegmentDependency } from '../../src/p5edges/orthogonal/hyper-edge-segment-dependency.js'

describe('HyperEdgeSegmentDependency (ELK Java 移植)', () => {
  it('createAndAddRegular: REGULAR 类型 + 指定权重 + 双向登记', () => {
    const s = new HyperEdgeSegment(), t = new HyperEdgeSegment()
    const dep = HyperEdgeSegmentDependency.createAndAddRegular(s, t, 7)
    expect(dep.getType()).toBe(DependencyType.REGULAR)
    expect(dep.getWeight()).toBe(7)
    expect(dep.getSource()).toBe(s)
    expect(dep.getTarget()).toBe(t)
    // 登记到 source 的 outgoing 与 target 的 incoming 列表
    expect(s.getOutgoingSegmentDependencies()).toEqual([dep])
    expect(t.getIncomingSegmentDependencies()).toEqual([dep])
  })

  it('createAndAddCritical: CRITICAL 类型 + 权重 = CRITICAL_DEPENDENCY_WEIGHT(1)', () => {
    const s = new HyperEdgeSegment(), t = new HyperEdgeSegment()
    const dep = HyperEdgeSegmentDependency.createAndAddCritical(s, t)
    expect(dep.getType()).toBe(DependencyType.CRITICAL)
    expect(dep.getWeight()).toBe(HyperEdgeSegmentDependency.CRITICAL_DEPENDENCY_WEIGHT)
    expect(s.getOutgoingSegmentDependencies()).toEqual([dep])
    expect(t.getIncomingSegmentDependencies()).toEqual([dep])
  })

  it('remove: 从 source.outgoing 与 target.incoming 双向摘除, 引用置空', () => {
    const s = new HyperEdgeSegment(), t = new HyperEdgeSegment()
    const dep = HyperEdgeSegmentDependency.createAndAddCritical(s, t)
    dep.remove()
    expect(s.getOutgoingSegmentDependencies()).toEqual([])
    expect(t.getIncomingSegmentDependencies()).toEqual([])
    expect(dep.getSource()).toBeNull()
    expect(dep.getTarget()).toBeNull()
    // 重复 remove 幂等
    dep.remove()
    expect(s.getOutgoingSegmentDependencies()).toEqual([])
  })

  it('reverse: 源/目标互换, 列表同步迁移', () => {
    const s = new HyperEdgeSegment(), t = new HyperEdgeSegment()
    const dep = HyperEdgeSegmentDependency.createAndAddRegular(s, t, 3)
    dep.reverse()
    expect(dep.getSource()).toBe(t)
    expect(dep.getTarget()).toBe(s)
    expect(t.getOutgoingSegmentDependencies()).toEqual([dep])
    expect(s.getIncomingSegmentDependencies()).toEqual([dep])
    expect(s.getOutgoingSegmentDependencies()).toEqual([])
    expect(t.getIncomingSegmentDependencies()).toEqual([])
  })

  it('多个依赖独立登记/摘除 (列表追加顺序)', () => {
    const a = new HyperEdgeSegment(), b = new HyperEdgeSegment(), c = new HyperEdgeSegment()
    const d1 = HyperEdgeSegmentDependency.createAndAddRegular(a, b, 1)
    const d2 = HyperEdgeSegmentDependency.createAndAddRegular(a, c, 2)
    expect(a.getOutgoingSegmentDependencies()).toEqual([d1, d2])
    expect(b.getIncomingSegmentDependencies()).toEqual([d1])
    expect(c.getIncomingSegmentDependencies()).toEqual([d2])
    d1.remove()
    expect(a.getOutgoingSegmentDependencies()).toEqual([d2])
    expect(b.getIncomingSegmentDependencies()).toEqual([])
  })

  it('setSource/setTarget 迁移: 从旧段列表摘除并登记到新段', () => {
    const a = new HyperEdgeSegment(), b = new HyperEdgeSegment(), c = new HyperEdgeSegment()
    const dep = HyperEdgeSegmentDependency.createAndAddCritical(a, b)
    // 经 remove/reverse 之外的路径: 直接调用 (Java setSource 语义)
    // @ts-expect-error 私有 setSource 仅测试用
    dep.setSource(c)
    // @ts-expect-error 私有 setTarget 仅测试用
    dep.setTarget(a)
    expect(dep.getSource()).toBe(c)
    expect(dep.getTarget()).toBe(a)
    expect(c.getOutgoingSegmentDependencies()).toEqual([dep])
    expect(a.getIncomingSegmentDependencies()).toEqual([dep])
    expect(a.getOutgoingSegmentDependencies()).toEqual([])
    expect(b.getIncomingSegmentDependencies()).toEqual([])
  })
})
