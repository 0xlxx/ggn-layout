/**
 * SelfHyperLoopLabels (ELK intermediate.loops.SelfHyperLoopLabels) 语义单元测试.
 * SSOT: ELK Java 0.12.0 SelfHyperLoopLabels.java (layoutDirection.isHorizontal() → 标签垂直堆叠).
 */
import { describe, expect, it } from 'vitest'
import { Direction, PortSide } from '../../src/index.js'
import { LabelAlignment, SelfHyperLoopLabels } from '../../src/intermediate/loops/self-hyper-loop-labels.js'
import { makeGraph, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'

function makeLabels(direction: Direction, labelLabelSpacing = 5, sizes: { x: number; y: number }[] = [{ x: 10, y: 20 }, { x: 30, y: 5 }]): {
  labels: SelfHyperLoopLabels
  loopSLLabels: SelfHyperLoopLabels | null
} {
  const graph = makeGraph({ direction, labelLabelSpacing })
  const node = makeNode(graph)
  const [p1, p2] = makePorts(node, 0, 2, 0, 0)
  const edge = makeEdge(p1, p2)
  for (const s of sizes) addLabel(edge, 'l', s)
  const holder = installHolder(node)
  const loop = holder.getSLHyperLoops()[0]!
  return { labels: new SelfHyperLoopLabels(loop), loopSLLabels: loop.getSLLabels() }
}

describe('SelfHyperLoopLabels (ELK Java 移植)', () => {
  it('构造器从图读取方向与 labelLabelSpacing, 初始状态为空', () => {
    const { labels, loopSLLabels } = makeLabels(Direction.RIGHT, 7)
    // 初始包围盒/位置为零, 侧与对齐尚未确定
    expect(labels.getSize()).toEqual({ x: 0, y: 0 })
    expect(labels.getPosition()).toEqual({ x: 0, y: 0 })
    expect(labels.getSide()).toBeNull()
    expect(labels.getAlignment()).toBeNull()
    expect(labels.getAlignmentReferenceSLPort()).toBeNull()
    expect(labels.getLLabels()).toHaveLength(0)
    expect(labels.id).toBe(0)
    // 经由 addSelfLoopEdge 自动创建的实例与直接构造等价
    expect(loopSLLabels).not.toBeNull()
    expect(loopSLLabels!.getLLabels()).toHaveLength(2)
  })

  it('水平布局方向 (RIGHT/LEFT): 标签垂直堆叠 (isHorizontal → size.y 累加)', () => {
    for (const direction of [Direction.RIGHT, Direction.LEFT]) {
      const { labels } = makeLabels(direction, 5)
      labels.addLLabels([
        { text: 'a', position: { x: 0, y: 0 }, size: { x: 10, y: 20 } },
        { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 5 } },
      ])
      // size.x = max(10, 30); size.y = 20 + 5 + 5 (labelLabelSpacing)
      expect(labels.getSize()).toEqual({ x: 30, y: 30 })
      expect(labels.getLLabels()).toHaveLength(2)
    }
  })

  it('垂直布局方向 (DOWN/UP): 标签水平堆叠 (size.x 累加)', () => {
    for (const direction of [Direction.DOWN, Direction.UP]) {
      const { labels } = makeLabels(direction, 5)
      labels.addLLabels([
        { text: 'a', position: { x: 0, y: 0 }, size: { x: 10, y: 20 } },
        { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 5 } },
      ])
      // size.x = 10 + 5 + 30; size.y = max(20, 5)
      expect(labels.getSize()).toEqual({ x: 45, y: 20 })
    }
  })

  it('水平布局 applyPlacement: EAST/WEST/LEFT/RIGHT/CENTER 对齐 + 垂直堆叠 + offset', () => {
    const { labels } = makeLabels(Direction.RIGHT, 5)
    labels.addLLabels([
      { text: 'a', position: { x: 0, y: 0 }, size: { x: 10, y: 20 } },
      { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 5 } },
    ])
    const pos = labels.getPosition(); pos.x = 100; pos.y = 200

    // EAST: 标签靠左 (x = position.x)
    labels.setSide(PortSide.EAST)
    labels.setAlignment(LabelAlignment.CENTER)
    labels.applyPlacement({ x: 1, y: 2 })
    expect(labels.getLLabels()[0]!.position).toEqual({ x: 101, y: 202 })
    expect(labels.getLLabels()[1]!.position).toEqual({ x: 101, y: 227 }) // y = 200 + 20 + 5 + 2

    // WEST: 标签靠右 (x = position.x + size.x - label.size.x)
    labels.setSide(PortSide.WEST)
    labels.applyPlacement({ x: 0, y: 0 })
    expect(labels.getLLabels()[0]!.position.x).toBe(100 + 30 - 10) // 120
    expect(labels.getLLabels()[1]!.position.x).toBe(100 + 30 - 30) // 100

    // NORTH + LEFT: x = position.x
    labels.setSide(PortSide.NORTH)
    labels.setAlignment(LabelAlignment.LEFT)
    labels.applyPlacement({ x: 0, y: 0 })
    expect(labels.getLLabels()[0]!.position.x).toBe(100)
    expect(labels.getLLabels()[1]!.position.x).toBe(100)

    // NORTH + RIGHT: x = position.x + size.x - label.size.x
    labels.setAlignment(LabelAlignment.RIGHT)
    labels.applyPlacement({ x: 0, y: 0 })
    expect(labels.getLLabels()[0]!.position.x).toBe(120)
    expect(labels.getLLabels()[1]!.position.x).toBe(100)

    // NORTH + CENTER: 居中
    labels.setAlignment(LabelAlignment.CENTER)
    labels.applyPlacement({ x: 0, y: 0 })
    expect(labels.getLLabels()[0]!.position.x).toBe(100 + (30 - 10) / 2) // 110
    expect(labels.getLLabels()[1]!.position.x).toBe(100 + (30 - 30) / 2) // 100
  })

  it('垂直布局 applyPlacement: NORTH 底对齐, 其他顶对齐 + 水平堆叠', () => {
    const { labels } = makeLabels(Direction.DOWN, 5)
    labels.addLLabels([
      { text: 'a', position: { x: 0, y: 0 }, size: { x: 10, y: 20 } },
      { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 5 } },
    ])
    const pos = labels.getPosition(); pos.x = 100; pos.y = 200

    // NORTH: y 底对齐 (y = position.y + size.y - label.size.y)
    labels.setSide(PortSide.NORTH)
    labels.applyPlacement({ x: 1, y: 2 })
    expect(labels.getLLabels()[0]!.position).toEqual({ x: 101, y: 200 + 20 - 20 + 2 }) // y=202
    expect(labels.getLLabels()[1]!.position).toEqual({ x: 101 + 10 + 5, y: 200 + 20 - 5 + 2 }) // x=116, y=217

    // SOUTH (else): y 顶对齐
    labels.setSide(PortSide.SOUTH)
    labels.applyPlacement({ x: 0, y: 0 })
    expect(labels.getLLabels()[0]!.position).toEqual({ x: 100, y: 200 })
    expect(labels.getLLabels()[1]!.position).toEqual({ x: 100 + 10 + 5, y: 200 }) // x=115
  })

  it('setter/getter 往返 (side/alignment/alignmentReferenceSLPort/id)', () => {
    const { labels, loopSLLabels } = makeLabels(Direction.RIGHT)
    labels.setSide(PortSide.NORTH)
    labels.setAlignment(LabelAlignment.LEFT)
    labels.id = 42
    expect(labels.getSide()).toBe(PortSide.NORTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.LEFT)
    expect(labels.id).toBe(42)
    // alignmentReferenceSLPort 可置 null 或具体端口
    labels.setAlignmentReferenceSLPort(null)
    expect(labels.getAlignmentReferenceSLPort()).toBeNull()
    expect(loopSLLabels).not.toBeNull()
  })
})

describe('SelfHyperLoopLabels 间距与方向 (ELK Java 移植补充)', () => {
  it('3+ 标签: 相邻标签间各加一次 labelLabelSpacing (非首标签之后)', () => {
    // 水平布局 (RIGHT): size.y = sum(y) + (n-1)*spacing; 若错误地在首标签后也加 spacing 会多出一个
    for (const direction of [Direction.RIGHT, Direction.LEFT]) {
      const { labels } = makeLabels(direction, 5)
      labels.addLLabels([
        { text: 'a', position: { x: 0, y: 0 }, size: { x: 10, y: 20 } },
        { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 5 } },
        { text: 'c', position: { x: 0, y: 0 }, size: { x: 7, y: 8 } },
      ])
      // y = 20 + 5 + 5 + 8 + 5 = 43; 若首标签也加 spacing → 48
      expect(labels.getSize()).toEqual({ x: 30, y: 43 })
    }
    // 垂直布局 (DOWN): size.x = sum(x) + (n-1)*spacing
    for (const direction of [Direction.DOWN, Direction.UP]) {
      const { labels } = makeLabels(direction, 5)
      labels.addLLabels([
        { text: 'a', position: { x: 0, y: 0 }, size: { x: 10, y: 20 } },
        { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 5 } },
        { text: 'c', position: { x: 0, y: 0 }, size: { x: 7, y: 8 } },
      ])
      // x = 10 + 5 + 30 + 5 + 7 = 57
      expect(labels.getSize()).toEqual({ x: 57, y: 20 })
    }
  })

  it('LEFT 方向 applyPlacement: 与 RIGHT 同为水平堆叠 (垂直布局分支不介入)', () => {
    const { labels } = makeLabels(Direction.LEFT, 5)
    labels.addLLabels([
      { text: 'a', position: { x: 0, y: 0 }, size: { x: 10, y: 20 } },
      { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 5 } },
    ])
    const pos = labels.getPosition(); pos.x = 100; pos.y = 200
    labels.setSide(PortSide.NORTH)
    labels.setAlignment(LabelAlignment.CENTER)
    labels.applyPlacement({ x: 0, y: 0 })
    // 水平布局: x 居中, y 垂直堆叠
    expect(labels.getLLabels()[0]!.position).toEqual({ x: 100 + (30 - 10) / 2, y: 200 })
    expect(labels.getLLabels()[1]!.position).toEqual({ x: 100 + (30 - 30) / 2, y: 200 + 20 + 5 })
  })
})
