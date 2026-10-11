/**
 * 复合图与端口行为 — 直接 vitest BDD (由 compound-ports.feature 迁移).
 */
import { describe, it } from 'vitest'
import {
  Harness, expectParentContains, expectParentSizeSufficient, expectPortSide, expectPortOnBoundary,
} from './bdd-helpers.js'

describe('复合图与端口行为', () => {
  it('复合节点包含其子节点', () => {
    const h = new Harness().compound('P', 'C1, C2').layoutIncludeChildren()
    expectParentContains(h, 'P', 'C1', 'C2')
  })

  it('复合节点尺寸覆盖子图内容', () => {
    const h = new Harness().compound('P', 'C1, C2').edge('C1→C2').layoutIncludeChildren()
    expectParentSizeSufficient(h, 'P')
  })

  it.each(['NORTH', 'SOUTH', 'EAST', 'WEST'])('FIXED_SIDE 端口布局后位于指定侧: %s', (side) => {
    const h = new Harness().fixedSidePorts('N', ['p1', side]).layout()
    expectPortSide(h, 'p1', side)
  })

  it.each(['NORTH', 'SOUTH', 'EAST', 'WEST'])('端口锚点贴节点边界: %s', (side) => {
    const h = new Harness().fixedSidePorts('N', ['p1', side]).layout()
    expectPortOnBoundary(h, 'p1', 'N')
  })
})
