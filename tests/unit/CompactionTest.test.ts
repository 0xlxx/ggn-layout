/**
 * 移植自 ELK Java: compaction/CompactionTest.java
 * 一维压实器 (OneDimensionalCompactor + QUADRATIC/SCANLINE 约束) 的全方向验证.
 */
import { describe, expect, it } from 'vitest'
import { Direction } from '../../src/index.js'
import { CGraph } from '../../src/compaction/oned/cgraph.js'
import { CNode } from '../../src/compaction/oned/cnode.js'
import { CGroup } from '../../src/compaction/oned/cgroup.js'
import { OneDimensionalCompactor } from '../../src/compaction/oned/oned-compactor.js'
import type { ElkRectangle } from '../../src/compaction/recthull/rectilinear-convex-hull.js'

const EPSILON = 0.0001
const SPACING = 5
const ALL = [Direction.LEFT, Direction.RIGHT, Direction.UP, Direction.DOWN]

function rect(x: number, y: number, width = 20, height = 20): ElkRectangle {
  return { x, y, width, height }
}

class CTestNode extends CNode {
  constructor(hitbox: ElkRectangle) {
    super()
    this.hitbox = hitbox
  }
  getHorizontalSpacing(): number { return SPACING }
  getVerticalSpacing(): number { return SPACING }
  applyElementPosition(): void { this.hitbox.x = this.hitbox.x }
  getElementPosition(): number { return this.hitbox.x }
}

class CTestNodeSpacing extends CTestNode {
  private hSpacing: number
  private vSpacing: number
  constructor(hitbox: ElkRectangle, hSpacing: number, vSpacing: number) {
    super(hitbox)
    this.hSpacing = hSpacing
    this.vSpacing = vSpacing
  }
  getHorizontalSpacing(): number { return this.hSpacing }
  getVerticalSpacing(): number { return this.vSpacing }
}

function compacter(graph: CGraph): OneDimensionalCompactor {
  return new OneDimensionalCompactor(graph)
    .setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
}

function assertPos(actual: number, expected: number, msg?: string): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(EPSILON)
}

describe('Compaction (ELK Java 移植)', () => {
  it('testLeftCompaction', () => {
    const graph = new CGraph(ALL)
    const left = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(left)
    const right = new CTestNode(rect(30, 0, 20, 20)); graph.cNodes.push(right)
    compacter(graph).changeDirection(Direction.LEFT).compact().finish()
    assertPos(left.hitbox.x, 0)
    assertPos(right.hitbox.x, 25)
  })

  it('testLeftCompactionEqualCoordinate', () => {
    const graph = new CGraph(ALL)
    const top = new CTestNodeSpacing(rect(0, 0, 20, 20), 0, 0); graph.cNodes.push(top)
    const bot = new CTestNodeSpacing(rect(30, 20, 20, 20), 0, 0); graph.cNodes.push(bot)
    compacter(graph)
      .setConstraintAlgorithm(OneDimensionalCompactor.SCANLINE_CONSTRAINTS)
      .changeDirection(Direction.LEFT).compact().finish()
    assertPos(top.hitbox.x, 0)
    assertPos(bot.hitbox.x, 0)
  })

  it('testLeftCompactionSpacingAware', () => {
    const graph = new CGraph(ALL)
    const left = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(left)
    const right = new CTestNode(rect(30, 20 + SPACING - 1, 20, 20)); graph.cNodes.push(right)
    compacter(graph).changeDirection(Direction.LEFT).compact().finish()
    assertPos(left.hitbox.x, 0)
    assertPos(right.hitbox.x, 25)
  })

  it('testRightCompaction', () => {
    const graph = new CGraph(ALL)
    const left = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(left)
    const right = new CTestNode(rect(30, 0, 20, 20)); graph.cNodes.push(right)
    compacter(graph).changeDirection(Direction.RIGHT).compact().finish()
    assertPos(left.hitbox.x, 5)
    assertPos(right.hitbox.x, 30)
  })

  it('testUpCompaction', () => {
    const graph = new CGraph(ALL)
    const upper = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(upper)
    const lower = new CTestNode(rect(0, 30, 20, 20)); graph.cNodes.push(lower)
    compacter(graph).changeDirection(Direction.UP).compact().finish()
    assertPos(upper.hitbox.y, 0)
    assertPos(lower.hitbox.y, 25)
  })

  it('testDownCompaction', () => {
    const graph = new CGraph(ALL)
    const upper = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(upper)
    const lower = new CTestNode(rect(0, 30, 20, 20)); graph.cNodes.push(lower)
    compacter(graph).changeDirection(Direction.DOWN).compact().finish()
    assertPos(upper.hitbox.y, 5)
    assertPos(lower.hitbox.y, 30)
  })

  it('testLeftGroupCompaction', () => {
    const graph = new CGraph(ALL)
    const left = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(left)
    const upperRight = new CTestNode(rect(40, 5, 20, 20)); graph.cNodes.push(upperRight)
    const lowerRight = new CTestNode(rect(30, 25, 20, 20)); graph.cNodes.push(lowerRight)
    const group = new CGroup(upperRight, lowerRight); graph.cGroups.push(group)
    compacter(graph).changeDirection(Direction.LEFT).compact().finish()
    assertPos(left.hitbox.x, 0)
    assertPos(upperRight.hitbox.x, 25)
    assertPos(lowerRight.hitbox.x, 15)
  })

  it('testRightGroupCompaction', () => {
    const graph = new CGraph(ALL)
    const left = new CTestNode(rect(0, 5, 20, 20)); graph.cNodes.push(left)
    const upperRight = new CTestNode(rect(40, 0, 20, 20)); graph.cNodes.push(upperRight)
    const lowerRight = new CTestNode(rect(10, 25, 20, 20)); graph.cNodes.push(lowerRight)
    const group = new CGroup(left, lowerRight); graph.cGroups.push(group)
    compacter(graph).changeDirection(Direction.RIGHT).compact().finish()
    assertPos(left.hitbox.x, 15)
    assertPos(upperRight.hitbox.x, 40)
    assertPos(lowerRight.hitbox.x, 25)
  })

  it('testUpGroupCompaction', () => {
    const graph = new CGraph(ALL)
    const upperLeft = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(upperLeft)
    const lowerLeft = new CTestNode(rect(5, 40, 20, 20)); graph.cNodes.push(lowerLeft)
    const right = new CTestNode(rect(25, 30, 20, 20)); graph.cNodes.push(right)
    const group = new CGroup(lowerLeft, right); graph.cGroups.push(group)
    compacter(graph).changeDirection(Direction.UP).compact().finish()
    assertPos(upperLeft.hitbox.y, 0)
    assertPos(lowerLeft.hitbox.y, 25)
    assertPos(right.hitbox.y, 15)
  })

  it('testDownGroupCompaction', () => {
    const graph = new CGraph(ALL)
    const upperLeft = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(upperLeft)
    const lowerLeft = new CTestNode(rect(5, 40, 10, 20)); graph.cNodes.push(lowerLeft)
    const right = new CTestNode(rect(25, 10, 20, 20)); graph.cNodes.push(right)
    const group = new CGroup(upperLeft, right); graph.cGroups.push(group)
    compacter(graph).changeDirection(Direction.DOWN).compact().finish()
    assertPos(upperLeft.hitbox.y, 15)
    assertPos(lowerLeft.hitbox.y, 40)
    assertPos(right.hitbox.y, 25)
  })

  it('testNoSpacingAppliedWithinGroups', () => {
    const graph = new CGraph(ALL)
    const one = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(one)
    const two = new CTestNode(rect(20, 10, 20, 20)); graph.cNodes.push(two)
    const three = new CTestNode(rect(40, 20, 20, 20)); graph.cNodes.push(three)
    const g1 = new CGroup(one, two, three); graph.cGroups.push(g1)
    const four = new CTestNode(rect(22, 80, 20, 20)); graph.cNodes.push(four)
    const five = new CTestNode(rect(42, 90, 20, 20)); graph.cNodes.push(five)
    const six = new CTestNode(rect(62, 100, 20, 20)); graph.cNodes.push(six)
    const g2 = new CGroup(four, five, six); graph.cGroups.push(g2)
    compacter(graph)
      .changeDirection(Direction.LEFT).compact()
      .changeDirection(Direction.RIGHT).compact()
      .changeDirection(Direction.UP).compact()
      .changeDirection(Direction.DOWN).compact()
      .finish()
    assertPos(one.hitbox.x, 0); assertPos(one.hitbox.y, 0)
    assertPos(two.hitbox.x, 20); assertPos(two.hitbox.y, 10)
    assertPos(three.hitbox.x, 40); assertPos(three.hitbox.y, 20)
    assertPos(four.hitbox.x, 0); assertPos(four.hitbox.y, 35)
    assertPos(five.hitbox.x, 20); assertPos(five.hitbox.y, 45)
    assertPos(six.hitbox.x, 40); assertPos(six.hitbox.y, 55)
  })

  it('testSubsequentDirectionsCompaction', () => {
    const graph = new CGraph(ALL)
    const one = new CTestNode(rect(0, 0, 20, 20)); graph.cNodes.push(one)
    const two = new CTestNode(rect(25, 0, 20, 20)); graph.cNodes.push(two)
    const three = new CTestNode(rect(0, 25, 20, 20)); graph.cNodes.push(three)
    const four = new CTestNode(rect(25, 25, 20, 20)); graph.cNodes.push(four)
    for (const d1 of ALL) {
      for (const d2 of ALL) {
        for (const d3 of ALL) {
          for (const d4 of ALL) {
            compacter(graph)
              .changeDirection(d1).compact()
              .changeDirection(d2).compact()
              .changeDirection(d3).compact()
              .changeDirection(d4).compact()
              .finish()
            const msg = `${d1} ${d2} ${d3} ${d4}`
            assertPos(one.hitbox.x, 0, msg); assertPos(one.hitbox.y, 0, msg)
            assertPos(two.hitbox.x, 25, msg); assertPos(two.hitbox.y, 0, msg)
            assertPos(three.hitbox.x, 0, msg); assertPos(three.hitbox.y, 25, msg)
            assertPos(four.hitbox.x, 25, msg); assertPos(four.hitbox.y, 25, msg)
          }
        }
      }
    }
  })

  it('testHorizontalSpacings', () => {
    const graph = new CGraph(ALL)
    const one = new CTestNodeSpacing(rect(0, 0, 20, 20), 5, 0); graph.cNodes.push(one)
    const two = new CTestNodeSpacing(rect(50, 0, 20, 20), 7, 0); graph.cNodes.push(two)
    const three = new CTestNodeSpacing(rect(150, 0, 20, 20), 10, 0); graph.cNodes.push(three)
    compacter(graph).changeDirection(Direction.LEFT).compact().finish()
    assertPos(one.hitbox.x, 0); assertPos(two.hitbox.x, 27); assertPos(three.hitbox.x, 57)
    compacter(graph).changeDirection(Direction.RIGHT).compact().finish()
    assertPos(one.hitbox.x, 0); assertPos(two.hitbox.x, 27); assertPos(three.hitbox.x, 57)
    compacter(graph).changeDirection(Direction.LEFT).compact().finish()
    assertPos(one.hitbox.x, 0); assertPos(two.hitbox.x, 27); assertPos(three.hitbox.x, 57)
  })

  it('testVerticalSpacingDuringHorizontalCompaction', () => {
    const graph = new CGraph(ALL)
    const one = new CTestNodeSpacing(rect(150, 11, 20, 20), 0, 10); graph.cNodes.push(one)
    const two = new CTestNodeSpacing(rect(0, 40, 20, 20), 0, 5); graph.cNodes.push(two)
    const three = new CTestNodeSpacing(rect(150, 76, 20, 20), 0, 15); graph.cNodes.push(three)
    compacter(graph).changeDirection(Direction.LEFT).compact().finish()
    assertPos(one.hitbox.x, 20)
    assertPos(two.hitbox.x, 0)
    assertPos(three.hitbox.x, 0)
  })

  it('testVeticalSpacings', () => {
    const graph = new CGraph(ALL)
    const one = new CTestNodeSpacing(rect(0, 0, 20, 20), 0, 5); graph.cNodes.push(one)
    const two = new CTestNodeSpacing(rect(0, 50, 20, 20), 0, 7); graph.cNodes.push(two)
    const three = new CTestNodeSpacing(rect(0, 150, 20, 20), 0, 10); graph.cNodes.push(three)
    compacter(graph).changeDirection(Direction.UP).compact().finish()
    assertPos(one.hitbox.y, 0); assertPos(two.hitbox.y, 27); assertPos(three.hitbox.y, 57)
    compacter(graph).changeDirection(Direction.DOWN).compact().finish()
    assertPos(one.hitbox.y, 0); assertPos(two.hitbox.y, 27); assertPos(three.hitbox.y, 57)
    compacter(graph).changeDirection(Direction.UP).compact().finish()
    assertPos(one.hitbox.y, 0); assertPos(two.hitbox.y, 27); assertPos(three.hitbox.y, 57)
  })

  it('testHorizontalSpacingDuringVerticalCompaction', () => {
    const graph = new CGraph(ALL)
    const one = new CTestNodeSpacing(rect(16, 150, 20, 20), 5, 0); graph.cNodes.push(one)
    const two = new CTestNodeSpacing(rect(40, 0, 20, 20), 10, 0); graph.cNodes.push(two)
    const three = new CTestNodeSpacing(rect(76, 150, 20, 20), 15, 0); graph.cNodes.push(three)
    compacter(graph).changeDirection(Direction.UP).compact().finish()
    assertPos(one.hitbox.y, 20)
    assertPos(two.hitbox.y, 0)
    assertPos(three.hitbox.y, 0)
  })
})
