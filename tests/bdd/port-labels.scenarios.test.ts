/**
 * 端口标签行为 — 直接 vitest BDD (由 port-labels.feature 迁移).
 */
import { describe, it } from 'vitest'
import { Harness, expectFiniteCoords, expectNoOverlap, expectPositiveSizes } from './bdd-helpers.js'

describe('端口标签行为', () => {
  it('端口不使布局越界', () => {
    const h = new Harness().node('A', 'B').fixedSidePorts('A', ['p1', 'WEST'], ['p2', 'EAST']).edge('A→B').layout()
    expectFiniteCoords(h)
    expectNoOverlap(h)
  })

  it.each([
    { side1: 'WEST', side2: 'EAST', name: 'WEST+EAST' },
    { side1: 'NORTH', side2: 'SOUTH', name: 'NORTH+SOUTH' },
  ])('不同端口侧布局稳定: $name', ({ side1, side2 }) => {
    const h = new Harness().node('A', 'B').fixedSidePorts('A', ['p1', side1], ['p2', side2]).edge('A→B').layout()
    expectFiniteCoords(h)
    expectPositiveSizes(h)
  })
})
