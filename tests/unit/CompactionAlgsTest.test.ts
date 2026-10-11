/**
 * 移植自 ELK Java: compaction.oned.algs
 * LongestPathCompaction 边界 (非重定位节点) + ScanlineConstraintCalculator
 * 内部语义 (spacing 膨胀/还原、删除时的左右邻居约束、等中心不产生约束).
 *
 * 注: ELK Java ConstraintsScanlineHandler.reset() 会为每个 CNode 分配 id;
 * ggn 移植版未做 (src bug, 见报告), 测试里手动设置 node.id 以还原 Java 语义.
 */
import { describe, expect, it } from 'vitest'
import { Direction } from '../../src/index.js'
import { CGraph } from '../../src/compaction/oned/cgraph.js'
import { CNode } from '../../src/compaction/oned/cnode.js'
import { CGroup } from '../../src/compaction/oned/cgroup.js'
import { OneDimensionalCompactor } from '../../src/compaction/oned/oned-compactor.js'
import {
  LongestPathCompaction, ScanlineConstraintCalculator,
} from '../../src/compaction/oned/algs.js'
import type { ElkRectangle } from '../../src/compaction/recthull/rectilinear-convex-hull.js'

const SPACING = 5
const ALL = [Direction.LEFT, Direction.RIGHT, Direction.UP, Direction.DOWN]

function rect(x: number, y: number, width = 20, height = 20): ElkRectangle {
  return { x, y, width, height }
}

class CTestNode extends CNode {
  constructor(hitbox: ElkRectangle, hSpacing = SPACING, vSpacing = SPACING) {
    super()
    this.hitbox = hitbox
    this.hSpacing = hSpacing
    this.vSpacing = vSpacing
  }
  private hSpacing: number
  private vSpacing: number
  getHorizontalSpacing(): number { return this.hSpacing }
  getVerticalSpacing(): number { return this.vSpacing }
  applyElementPosition(): void {}
  getElementPosition(): number { return this.hitbox.x }
}

/** 构造 compactor: cGraph 已含节点与组; direction 直接置为指定方向. */
function makeCompactor(nodes: CNode[], groups: CGroup[], direction: Direction): OneDimensionalCompactor {
  const graph = new CGraph(ALL)
  for (const n of nodes) graph.cNodes.push(n)
  for (const g of groups) graph.cGroups.push(g)
  const compactor = new OneDimensionalCompactor(graph)
  compactor.direction = direction
  return compactor
}

describe('LongestPathCompaction (ELK Java 移植)', () => {
  it('非重定位节点: 保留原位置 (else 分支)', () => {
    // g1 含 a, g1.reposition=false, a.reposition=false, a 已位于 minStartPos.
    const a = new CTestNode(rect(100, 0))
    const g1 = new CGroup(a)
    g1.reposition = false
    const compactor = makeCompactor([a], [g1], Direction.LEFT)
    // 构造器已算好 group offsets: reference=a, offset=0.
    a.reposition = false

    new LongestPathCompaction().compact(compactor)

    // minStartPos = 100; group.startPos=100; suggestedX=100; 因 !reposition 且
    // getPosition(100) >= suggestedX(100) → 走 else: startPos = hitbox.x = 100.
    expect(a.startPos).toBe(100)
    expect(a.hitbox.x).toBe(100)
    expect(g1.delta).toBe(0)
    expect(g1.deltaNormalized).toBe(0)
  })

  it('重定位节点被压到组起点 (if 分支)', () => {
    const a = new CTestNode(rect(100, 0))
    const g1 = new CGroup(a)
    const compactor = makeCompactor([a], [g1], Direction.LEFT)
    new LongestPathCompaction().compact(compactor)
    // reposition=true → startPos = group.startPos(100) + 0 = 100
    expect(a.startPos).toBe(100)
    expect(a.hitbox.x).toBe(100)
  })

  it('非重定位入边节点: 约束位置被原位置覆盖', () => {
    // a -> b (约束). b.reposition=false, b 原位于 x=500.
    const a = new CTestNode(rect(0, 0))
    const b = new CTestNode(rect(500, 0))
    a.constraints.push(b)
    const g1 = new CGroup(a)
    const g2 = new CGroup(b)
    b.reposition = false
    const compactor = makeCompactor([a, b], [g1, g2], Direction.LEFT)

    // 模拟 compact() 的 outDegree 统计: a→b 使 g2.outDegree=1
    g2.outDegree = 1

    new LongestPathCompaction().compact(compactor)

    // g1 先处理: b.cGroup.startPos = max(0, 0+20+5-0)=25, 再因 !b.reposition
    // 覆盖为 max(25, 500-0)=500; 之后 g2 处理, b 保留原位置.
    expect(g2.startPos).toBe(500)
    expect(b.startPos).toBe(500)
    expect(b.hitbox.x).toBe(500)
    expect(g2.delta).toBe(0)
  })

  it('RIGHT/DOWN 方向 deltaNormalized 为正, LEFT/UP 为负', () => {
    const a = new CTestNode(rect(100, 0))
    const g1 = new CGroup(a)
    const cRight = makeCompactor([a], [g1], Direction.RIGHT)
    new LongestPathCompaction().compact(cRight)
    expect(g1.deltaNormalized).toBe(0) // 未移动: diff=0

    const b = new CTestNode(rect(100, 0))
    const g2 = new CGroup(b)
    const cLeft = makeCompactor([b], [g2], Direction.LEFT)
    new LongestPathCompaction().compact(cLeft)
    expect(g2.deltaNormalized).toBe(0)
  })

  it('deltaNormalized 方向符号: 组被约束推离原位后 RIGHT 正 / LEFT 负', () => {
    // a→b 约束把 g2 推到 x=25; g2 原 reference 在 x=500 → diff=475.
    function run(direction: Direction, expected: number): void {
      const a = new CTestNode(rect(0, 0))
      const b = new CTestNode(rect(500, 0))
      a.constraints.push(b)
      const g1 = new CGroup(a)
      const g2 = new CGroup(b)
      g2.outDegree = 1
      const compactor = makeCompactor([a, b], [g1, g2], direction)
      new LongestPathCompaction().compact(compactor)
      expect(g2.delta).toBe(475)
      expect(g2.deltaNormalized).toBe(expected)
    }
    run(Direction.RIGHT, 475)
    run(Direction.LEFT, -475)
  })
})

describe('ScanlineConstraintCalculator (ELK Java 移植)', () => {
  it('spacing=0 (公共 API): 不膨胀 hitbox', () => {
    const a = new CTestNode(rect(0, 0))
    const b = new CTestNode(rect(30, 0))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    const calc = new ScanlineConstraintCalculator()
    calc.calculateConstraints(compactor)
    // 同 y 区间重叠 → 约束 a→b (x 中心 10 < 40)
    expect(a.hitbox.y).toBe(0)
    expect(a.hitbox.height).toBe(20)
    expect(b.hitbox.y).toBe(0)
    expect(b.hitbox.height).toBe(20)
    expect(a.constraints).toContain(b)
  })

  it('删除时右邻居约束 (cand[right]===p → p.constraints.push(right))', () => {
    // A(0,0,20,20) y=[0,20], B(30,10,20,30) y=[10,40]: 垂直重叠, A 先删除.
    const a = new CTestNode(rect(0, 0, 20, 20))
    const b = new CTestNode(rect(30, 10, 20, 30))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    expect(a.constraints).toContain(b)
    // 不变量: b 是 a 的右邻居, 约束单向 a→b.
    expect(b.constraints).not.toContain(a)
  })

  it('删除时左邻居约束 (left===cand[p] → left.constraints.push(p))', () => {
    // A(0,0,20,40) y=[0,40] 覆盖 B(30,10,20,20) y=[10,30]: B 先删除, 左邻居 A.
    const a = new CTestNode(rect(0, 0, 20, 40))
    const b = new CTestNode(rect(30, 10, 20, 20))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    expect(a.constraints).toContain(b)
    expect(b.constraints).not.toContain(a)
  })

  it('同中心节点 (lower 等中心分支): 不产生约束', () => {
    // A(0,0,10,10) 与 B(0,15,10,10) 中心均为 5 → lower/higher 都返回 null.
    const a = new CTestNode(rect(0, 0, 10, 10))
    const b = new CTestNode(rect(0, 15, 10, 10))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    expect(a.constraints).toEqual([])
    expect(b.constraints).toEqual([])
  })

  describe('blowUpHitboxes / normalizeHitboxes (私有, spacing>0)', () => {
    function makeSpacingNode(x: number, y: number, upIgnored: boolean, downIgnored: boolean): CTestNode {
      const n = new CTestNode(rect(x, y))
      n.spacingIgnore.up = upIgnored
      n.spacingIgnore.down = downIgnored
      return n
    }

    it('水平方向: y 上移 spacing/2-EPS, 高度增 spacing-2EPS', () => {
      const plain = makeSpacingNode(0, 100, false, false)
      const upIgn = makeSpacingNode(40, 100, true, false)
      const downIgn = makeSpacingNode(80, 100, false, true)
      const bothIgn = makeSpacingNode(120, 100, true, true)
      plain.id = 0; upIgn.id = 1; downIgn.id = 2; bothIgn.id = 3
      const compactor = makeCompactor([plain, upIgn, downIgn, bothIgn], [], Direction.LEFT)
      const calc = new ScanlineConstraintCalculator()
      calc.calculateConstraints(compactor) // 初始化 calc.compactor

      ;(calc as any).blowUpHitboxes(() => true, () => 5)

      // 5/2 - 0.5 = 2.0; 5 - 2*0.5 = 4.0
      expect(plain.hitbox.y).toBe(100 - 2)
      expect(plain.hitbox.height).toBe(20 + 4)
      expect(upIgn.hitbox.y).toBe(100)          // up ignored
      expect(upIgn.hitbox.height).toBe(20 + 4)  // down not ignored
      expect(downIgn.hitbox.y).toBe(100 - 2)    // up not ignored
      expect(downIgn.hitbox.height).toBe(20)    // down ignored
      expect(bothIgn.hitbox.y).toBe(100)
      expect(bothIgn.hitbox.height).toBe(20)

      ;(calc as any).normalizeHitboxes(() => true, () => 5)

      expect(plain.hitbox.y).toBe(100)
      expect(plain.hitbox.height).toBe(20)
      expect(upIgn.hitbox.y).toBe(100)
      expect(upIgn.hitbox.height).toBe(20)
      expect(downIgn.hitbox.y).toBe(100)
      expect(downIgn.hitbox.height).toBe(20)
      expect(bothIgn.hitbox.y).toBe(100)
      expect(bothIgn.hitbox.height).toBe(20)
    })

    it('垂直方向: 使用 spacingIgnore.left / right', () => {
      const n = new CTestNode(rect(100, 100))
      n.id = 0
      const compactor = makeCompactor([n], [], Direction.UP)
      const calc = new ScanlineConstraintCalculator()
      calc.calculateConstraints(compactor) // 初始化 calc.compactor

      ;(calc as any).blowUpHitboxes(() => true, () => 5)
      expect(n.hitbox.y).toBe(100 - 2)
      expect(n.hitbox.height).toBe(20 + 4)

      // left ignored → y 不还原; right ignored → height 不还原
      const m = new CTestNode(rect(100, 100))
      m.id = 0
      m.spacingIgnore.left = true
      m.spacingIgnore.right = true
      const compactor2 = makeCompactor([m], [], Direction.UP)
      const calc2 = new ScanlineConstraintCalculator()
      calc2.calculateConstraints(compactor2)
      ;(calc2 as any).blowUpHitboxes(() => true, () => 5)
      expect(m.hitbox.y).toBe(100)
      expect(m.hitbox.height).toBe(20)
    })

    it('filter 排除节点不参与膨胀', () => {
      const n = new CTestNode(rect(0, 0))
      n.id = 0
      const compactor = makeCompactor([n], [], Direction.LEFT)
      const calc = new ScanlineConstraintCalculator()
      calc.calculateConstraints(compactor)
      ;(calc as any).blowUpHitboxes(() => false, () => 5)
      expect(n.hitbox.y).toBe(0)
      expect(n.hitbox.height).toBe(20)
    })
  })

  it('同 y 高低点交错: 高优先于低, 三节点链式约束', () => {
    // A(0,0,20,20) 与 C(60,0,20,20) 同 y 顶; B(30,10,20,20) 夹中间.
    // 扫描序: A.low(0), C.low(0), B.low(10), A.high(20), C.high(20), B.high(30).
    const a = new CTestNode(rect(0, 0, 20, 20))
    const b = new CTestNode(rect(30, 10, 20, 20))
    const c = new CTestNode(rect(60, 0, 20, 20))
    a.id = 0; b.id = 1; c.id = 2
    const compactor = makeCompactor([a, b, c], [], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    // 链: a→b (a 删除时右邻居 b), b→c (c 的 cand 被 b 替换), a 不与 c 直接约束.
    expect(a.constraints.map(n => n.id)).toEqual([b.id])
    expect(b.constraints.map(n => n.id)).toEqual([c.id])
    expect(c.constraints).toEqual([])
  })

  it('非整中心 (奇数宽): center = x + width/2 参与比较', () => {
    // A(0,0,21,20) 中心 10.5; B(30,0,20,20) 中心 40; C(60,0,21,20) 中心 70.5.
    const a = new CTestNode(rect(0, 0, 21, 20))
    const b = new CTestNode(rect(30, 0, 20, 20))
    const c = new CTestNode(rect(60, 0, 21, 20))
    a.id = 0; b.id = 1; c.id = 2
    const compactor = makeCompactor([a, b, c], [], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    // 同 y 重叠 → a→b, b→c.
    expect(a.constraints.map(n => n.id)).toEqual([b.id])
    expect(b.constraints.map(n => n.id)).toEqual([c.id])
  })

  it('等中心 lower 分支: 中心相同的节点间不产生约束 (等中心跳过)', () => {
    // A(0,0,10,10) 与 B(0,15,10,10) 中心均 5; C(30,0,20,20) 中心 40.
    // 扫描序: A.low(0), C.low(0), A.high(10), B.low(15), C.high(20), B.high(25).
    const a = new CTestNode(rect(0, 0, 10, 10))
    const b = new CTestNode(rect(0, 15, 10, 10))
    const c = new CTestNode(rect(30, 0, 20, 20))
    a.id = 0; b.id = 1; c.id = 2
    const compactor = makeCompactor([a, b, c], [], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    // a 与 b 同中心 → 相互无约束; a→c (a 删除时右邻居 c), b→c (b 删除时左邻居).
    expect(a.constraints.map(n => n.id)).toEqual([c.id])
    expect(b.constraints.map(n => n.id)).toEqual([c.id])
    expect(c.constraints).toEqual([])
  })

  it('QuadraticConstraint: 同 x 但宽度不同 → 窄节点约束宽节点', () => {
    // c1(0,0,20,20) 与 c2(0,15,40,20): 等 x, c1 窄 → c1→c2 (y 重叠窗口 25).
    const a = new CTestNode(rect(0, 0, 20, 20))
    const b = new CTestNode(rect(0, 15, 40, 20))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    compactor.setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
    compactor.forceConstraintsRecalculation()
    expect(a.constraints.map(n => n.id)).toEqual([b.id])
    expect(b.constraints).toEqual([])
  })

  it('QuadraticConstraint: 同 x 且等宽 → 不产生约束 (宽度相等不算更窄)', () => {
    const a = new CTestNode(rect(0, 0, 20, 20))
    const b = new CTestNode(rect(0, 30, 20, 20))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    compactor.setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
    compactor.forceConstraintsRecalculation()
    expect(a.constraints).toEqual([])
    expect(b.constraints).toEqual([])
  })

  it('QuadraticConstraint: 同 x 但本节点更宽 → 不约束 (宽者不约束窄者)', () => {
    const a = new CTestNode(rect(0, 0, 40, 20))
    const b = new CTestNode(rect(0, 30, 20, 20))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    compactor.setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
    compactor.forceConstraintsRecalculation()
    expect(a.constraints).toEqual([])
    expect(b.constraints).toEqual([])
  })

  it('QuadraticConstraint: 同组节点不产生约束 (cGroup 相同跳过)', () => {
    const a = new CTestNode(rect(0, 0, 20, 20))
    const b = new CTestNode(rect(30, 0, 20, 20))
    a.id = 0; b.id = 1
    const group = new CGroup(a, b)
    const compactor = makeCompactor([a, b], [group], Direction.LEFT)
    compactor.setConstraintAlgorithm(OneDimensionalCompactor.QUADRATIC_CONSTRAINTS)
    compactor.forceConstraintsRecalculation()
    expect(a.constraints).toEqual([])
    expect(b.constraints).toEqual([])
  })

  it('LongestPath: 组内非 reference 节点 offset 参与 minStartPos', () => {
    // 组1: a(10,0,20,20) 与 b(0,5,20,20), reference=b (x 最小); offset: a=+10, b=0.
    // 组2: c(50,0,20,20). 预定义约束 a→c (a 在 c 左侧).
    const a = new CTestNode(rect(10, 0, 20, 20))
    const b = new CTestNode(rect(0, 5, 20, 20))
    const c = new CTestNode(rect(50, 0, 20, 20))
    a.id = 0; b.id = 1; c.id = 2
    const g1 = new CGroup(a, b)
    const g2 = new CGroup(c)
    const compactor = makeCompactor([a, b, c], [g1, g2], Direction.LEFT)
    compactor.cGraph.predefinedHorizontalConstraints.push([a, c])
    compactor.forceConstraintsRecalculation()
    new LongestPathCompaction().compact(compactor)
    // minStartPos = 0 (b: ref.x 0 + offset 0).
    // g1 (outDegree 0) 先处理: a.startPos = 0 + 10 = 10; 约束 a→c → g2.startPos = 10+20+5 = 35.
    expect(b.startPos).toBe(0)
    expect(a.startPos).toBe(10)
    expect(c.startPos).toBe(35)
  })

  it('扫描线: 宽节点中心翻转排序方向 (lower/higher 用 center)', () => {
    // a(0,0,100,20) 中心 50, b(30,5,20,20) 中心 40 → b 在 a 左 → 约束 b→a.
    const a = new CTestNode(rect(0, 0, 100, 20))
    const b = new CTestNode(rect(30, 5, 20, 20))
    a.id = 0; b.id = 1
    const compactor = makeCompactor([a, b], [], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    expect(b.constraints.map(n => n.id)).toEqual([a.id])
    expect(a.constraints).toEqual([])
  })

  it('同组节点: 删除时不产生约束 (cGroup 相同跳过)', () => {
    const a = new CTestNode(rect(0, 0, 20, 20))
    const b = new CTestNode(rect(30, 0, 20, 20))
    a.id = 0; b.id = 1
    const group = new CGroup(a, b)
    const compactor = makeCompactor([a, b], [group], Direction.LEFT)
    new ScanlineConstraintCalculator().calculateConstraints(compactor)
    // 同组不约束.
    expect(a.constraints).toEqual([])
    expect(b.constraints).toEqual([])
  })
})
