/**
 * 分层布局核心行为 — 直接 vitest BDD (由 core-layout.feature 迁移).
 * 断言只覆盖算法真实保证的性质 (L3 不变量 + elk-java-unit 验证过的行为).
 */
import { describe, it } from 'vitest'
import {
  Harness, expectLayered, expectLayerOrderNonDecreasing, expectP1Acyclic, expectNoOverlap,
  expectFiniteCoords, expectPositiveSizes, expectSourceRelative, expectIsolatedPositioned,
} from './bdd-helpers.js'

describe('分层布局核心行为', () => {
  it('无环 DAG 按边方向分层', () => {
    const h = new Harness().node('A', 'B', 'C').edge('A→B, B→C').layout()
    expectLayered(h)
    expectLayerOrderNonDecreasing(h)
  })

  it('有环图在布局后被去环 (无环)', () => {
    const h = new Harness().node('A', 'B', 'C').edge('A→B, B→C, C→A').layout()
    expectP1Acyclic(h)
  })

  it('布局后节点不重叠 (同层与跨层)', () => {
    const h = new Harness().node('A', 'B', 'C', 'D').edge('A→B, B→D, A→C, C→D').layout()
    expectNoOverlap(h)
  })

  it('布局结果坐标有限且非负扩展', () => {
    const h = new Harness().node('A', 'B').edge('A→B').layout()
    expectFiniteCoords(h)
    expectPositiveSizes(h)
  })

  it.each([
    { dir: 'RIGHT', pos: 'left' as const, name: 'A 在 B 左侧' },
    { dir: 'LEFT', pos: 'right' as const, name: 'A 在 B 右侧' },
    { dir: 'DOWN', pos: 'above' as const, name: 'A 在 B 上方' },
    { dir: 'UP', pos: 'below' as const, name: 'A 在 B 下方' },
  ])('布局方向沿坐标推进: $name', ({ dir, pos }) => {
    const h = new Harness().direction(dir).node('A', 'B').edge('A→B').layout()
    expectSourceRelative(h, 'A', 'B', pos)
  })

  it('连通分量独立布局', () => {
    const h = new Harness().node('A', 'B', 'C').edge('A→B').layout()
    expectIsolatedPositioned(h, 'C')
  })
})
