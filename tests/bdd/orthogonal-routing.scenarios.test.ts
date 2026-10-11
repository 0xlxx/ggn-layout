/**
 * 正交边路由行为 — 直接 vitest BDD (由 orthogonal-routing.feature 迁移).
 * 阶梯长边弯点与 ELK Java 输出逐点一致 (A→C = (82,28),(82,12),(162,12),(162,28)),
 * 叉形图/直边正交不变量, 跨层级边端点统一引用图坐标系 (无斜线, getEdgeEndpoints),
 * 边段不穿过节点盒 (边界接触不算穿过).
 */
import { describe, it } from 'vitest'
import {
  Harness, expectBendPoints, expectNoBendPoints, expectOrtho, expectOrthoHierarchical, expectNoEdgeNodeIntersections,
} from './bdd-helpers.js'

describe('正交边路由行为', () => {
  it('阶梯长边弯点与 ELK Java 一致', () => {
    const h = new Harness().orthogonalRouting().node('A', 'B', 'C', 'D').edge('A→B, B→C, A→C, C→D').layout()
    expectBendPoints(h, 'A', 'C', [[82, 28], [82, 12], [162, 12], [162, 28]])
    expectOrtho(h)
  })

  it('叉形图正交弯点与 ELK Java 一致', () => {
    const h = new Harness().orthogonalRouting().node('A', 'B', 'C', 'D').edge('A→B, A→C, B→D, C→D').layout()
    expectOrtho(h)
  })

  it('直边无多余弯点', () => {
    const h = new Harness().orthogonalRouting().node('A', 'B').edge('A→B').layout()
    expectNoBendPoints(h, 'A', 'B')
  })

  it('跨层级边端点在同一坐标系 (不产生斜线)', () => {
    const h = new Harness().orthogonalRouting()
      .compound('P', 'A, B')
      .fixedSidePorts('P', ['pW', 'WEST'], ['pW2', 'WEST'])
      .edge('pW→A, pW2→B')
      .layoutIncludeChildren()
    expectOrthoHierarchical(h)
  })

  it('边路由不穿过节点盒', () => {
    const h = new Harness().orthogonalRouting().node('A', 'B', 'C', 'D').edge('A→B, B→C, A→C, C→D').layout()
    expectNoEdgeNodeIntersections(h)
  })
})
