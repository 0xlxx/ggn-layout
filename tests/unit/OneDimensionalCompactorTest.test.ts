/**
 * OneDimensionalCompactor 附加语义测试 (覆盖 CompactionTest 未覆盖行):
 * setSpacingsHandler / setCompactionAlgorithm / setLockingStrategy / applyLockingStrategy /
 * forceConstraintsRecalculation / changeDirection default 分支 / mirrorHitboxes parentNode 分支.
 */
import { describe, expect, it, vi } from 'vitest'
import { Direction } from '../../src/index.js'
import { CGraph } from '../../src/compaction/oned/cgraph.js'
import { CNode } from '../../src/compaction/oned/cnode.js'
import { CGroup } from '../../src/compaction/oned/cgroup.js'
import { OneDimensionalCompactor } from '../../src/compaction/oned/oned-compactor.js'
import type { ElkRectangle } from '../../src/compaction/recthull/rectilinear-convex-hull.js'

const ALL = [Direction.LEFT, Direction.RIGHT, Direction.UP, Direction.DOWN]

function rect(x: number, y: number, width = 20, height = 20): ElkRectangle {
  return { x, y, width, height }
}

class CTestNode extends CNode {
  constructor(hitbox: ElkRectangle) {
    super()
    this.hitbox = hitbox
  }
  getHorizontalSpacing(): number { return 5 }
  getVerticalSpacing(): number { return 5 }
  applyElementPosition(): void {}
  getElementPosition(): number { return this.hitbox.x }
}

function makeCompactor(...nodes: CNode[]): OneDimensionalCompactor {
  const graph = new CGraph(ALL)
  for (const n of nodes) graph.cNodes.push(n)
  return new OneDimensionalCompactor(graph)
}

describe('OneDimensionalCompactor (ELK Java 移植)', () => {
  it('setSpacingsHandler: 自定义间距 handler 生效', () => {
    const a = new CTestNode(rect(0, 0))
    const b = new CTestNode(rect(50, 0))
    const compactor = makeCompactor(a, b)
    const handler = {
      getHorizontalSpacing: () => 13,
      getVerticalSpacing: () => 13,
    }
    const result = compactor.setSpacingsHandler(handler)
    expect(result).toBe(compactor)
    compactor.changeDirection(Direction.LEFT).compact()
    // 间距 13: b.x = 0 + 20 + 13 = 33
    expect(a.hitbox.x).toBe(0)
    expect(b.hitbox.x).toBe(33)
  })

  it('setCompactionAlgorithm: 自定义压缩算法被调用', () => {
    const a = new CTestNode(rect(0, 0))
    const compactor = makeCompactor(a)
    const spy = vi.fn()
    const custom = { compact: spy }
    const result = compactor.setCompactionAlgorithm(custom as never)
    expect(result).toBe(compactor)
    compactor.changeDirection(Direction.LEFT).compact()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(compactor)
  })

  it('setLockingStrategy + applyLockingStrategy: 重定位标记按策略设置', () => {
    const a = new CTestNode(rect(0, 0))
    const b = new CTestNode(rect(30, 0))
    const compactor = makeCompactor(a, b)
    compactor.changeDirection(Direction.LEFT)
    // 默认 locking strategy: !(cGroup.outDegree === 0) → 单节点组 outDegree=0 → 允许重定位
    expect(a.reposition).toBe(true)

    // 自定义策略: a 不重定位, b 重定位
    compactor.setLockingStrategy((pair) => pair.first === b)
    const result = compactor.applyLockingStrategy()
    expect(result).toBe(compactor)
    expect(a.reposition).toBe(false)
    expect(b.reposition).toBe(true)
    expect(a.cGroup!.reposition).toBe(false)
    expect(b.cGroup!.reposition).toBe(true)
  })

  it('applyLockingStrategy(dir) 显式方向', () => {
    const a = new CTestNode(rect(0, 0))
    const compactor = makeCompactor(a)
    compactor.direction = Direction.UNDEFINED
    const seen: Direction[] = []
    compactor.setLockingStrategy((pair) => { seen.push(pair.second); return true })
    compactor.applyLockingStrategy(Direction.RIGHT)
    expect(seen).toEqual([Direction.RIGHT])
    expect(a.reposition).toBe(true)
  })

  it('forceConstraintsRecalculation: 重新计算约束 (清掉手工添加的约束)', () => {
    const a = new CTestNode(rect(0, 0))
    const b = new CTestNode(rect(30, 0))
    const compactor = makeCompactor(a, b)
    compactor.setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
    compactor.changeDirection(Direction.LEFT)
    // 手工加一条约束
    a.constraints.push(b)
    expect(a.constraints).toContain(b)
    const result = compactor.forceConstraintsRecalculation()
    expect(result).toBe(compactor)
    // 重新计算后 a→b 仍存在 (几何上 a 在 b 左侧且垂直重叠)
    expect(a.constraints).toContain(b)
    // 不变量: 约束无自环, 数量与几何一致
    for (const n of compactor.cGraph.cNodes) {
      expect(n.constraints).not.toContain(n)
    }
  })

  it('changeDirection 未知旧方向走 default 分支', () => {
    const a = new CTestNode(rect(0, 0))
    const compactor = makeCompactor(a)
    ;(compactor as unknown as { direction: string }).direction = 'INVALID'
    compactor.changeDirection(Direction.LEFT)
    expect(compactor.direction).toBe(Direction.LEFT)
  })

  it('mirrorHitboxes: parentNode 非空时调整 cGroupOffset.x', () => {
    const parent = new CTestNode(rect(0, 0, 30, 30))
    const child = new CTestNode(rect(10, 5, 20, 20))
    child.parentNode = parent
    // 同组: parent 为 reference
    const group = new CGroup(parent, child)
    const graph = new CGraph(ALL)
    graph.cNodes.push(parent, child)
    graph.cGroups.push(group)
    const compactor = new OneDimensionalCompactor(graph)
    // 初始: reference=parent(x=0); child.cGroupOffset.x = 10
    expect(child.cGroupOffset.x).toBe(10)
    compactor.changeDirection(Direction.LEFT) // 先 LEFT (计算约束)
    compactor.changeDirection(Direction.RIGHT) // LEFT→RIGHT: mirror + reverse
    // mirrorHitboxes: child.hitbox.x = -10-20 = -30; child.cGroupOffset.x = -10 + 30 = 20
    expect(child.hitbox.x).toBe(-30)
    // mirrorHitboxes 内部 parentNode 分支改写 offset, 但随后 calculateGroupOffsets
    // 按镜像后的 hitbox 重算 (parent 与 child 同为 -30 → offset 0).
    expect(child.cGroupOffset.x).toBe(0)
    // parent: x = -0-30 = -30, offset 0
    expect(parent.hitbox.x).toBe(-30)
    expect(parent.cGroupOffset.x).toBe(0)
  })

  it('finish 后任何操作抛错', () => {
    const a = new CTestNode(rect(0, 0))
    const compactor = makeCompactor(a)
    compactor.changeDirection(Direction.LEFT).compact().finish()
    expect(() => compactor.compact()).toThrow('has been finished already')
    expect(() => compactor.changeDirection(Direction.RIGHT)).toThrow('has been finished already')
  })

  it('changeDirection 不支持的方向抛错', () => {
    const graph = new CGraph([Direction.LEFT])
    const a = new CTestNode(rect(0, 0))
    graph.cNodes.push(a)
    const compactor = new OneDimensionalCompactor(graph)
    expect(() => compactor.changeDirection(Direction.RIGHT)).toThrow('is not supported by the CGraph instance')
  })

  it('compact 重置 reposition 并保持约束 (不变量: 不重叠)', () => {
    const a = new CTestNode(rect(0, 0))
    const b = new CTestNode(rect(30, 0))
    const compactor = makeCompactor(a, b)
    compactor.setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
    compactor.changeDirection(Direction.LEFT).compact()
    expect(a.reposition).toBe(true)
    expect(b.reposition).toBe(true)
    // 不重叠: b.x >= a.x + a.width + 间距
    expect(b.hitbox.x).toBeGreaterThanOrEqual(a.hitbox.x + a.hitbox.width + 5)
  })
})
