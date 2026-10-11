/**
 * LabelDummyRemover (对应 ELK intermediate.LabelDummyRemover) — P5 后移除 LABEL dummy,
 * 垂直布局下标签沿 x 递增放置 (附加覆盖 39-43 行).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType, Direction } from '../../src/index.js'
import { processLabelDummyRemoval } from '../../src/intermediate/label-dummy-remover.js'
import { ORIGIN, REPRESENTED_LABELS, LABEL_SIDE } from '../../src/options/internal-properties.js'
import { SPACING_EDGE_LABEL, SPACING_LABEL_LABEL, DIRECTION, EDGE_THICKNESS } from '../../src/options/layered-options.js'
import { Layer } from '../../src/graph/layer.js'
import type { LEdgeLabel } from '../../src/graph/ledge.js'
import { expectFiniteCoordinates } from './helpers/conservation.js'

function makeNode(): LNode {
  const n = new LNode()
  n.setType(NodeType.NORMAL)
  return n
}

function addPort(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

/** 构造: A --inEdge--> dummy(LABEL) --outEdge--> B; dummy 携带 representedLabels. */
function setup(labelSide: string, verticalDir: Direction, dummySize: { x: number, y: number }, dummyPos: { x: number, y: number }):
  { graph: LGraph, layer: Layer, a: LNode, b: LNode, dummy: LNode, inEdge: LEdge, outEdge: LEdge, labels: LEdgeLabel[] } {
  const graph = new LGraph()
  const layer = new Layer(graph)
  graph.getLayers().push(layer)
  graph.setProperty(DIRECTION, verticalDir)
  graph.setProperty(SPACING_EDGE_LABEL, 2)
  graph.setProperty(SPACING_LABEL_LABEL, 1)

  const a = makeNode()
  const b = makeNode()
  const dummy = new LNode()
  dummy.setType(NodeType.LABEL)
  dummy.size = { ...dummySize }
  dummy.position = { ...dummyPos }
  dummy.setLayer(layer)
  a.setLayer(layer)
  b.setLayer(layer)

  const aEast = addPort(a, PortSide.EAST)
  const dWest = addPort(dummy, PortSide.WEST)
  const dEast = addPort(dummy, PortSide.EAST)
  const bWest = addPort(b, PortSide.WEST)

  const inEdge = new LEdge()
  inEdge.setSource(aEast)
  inEdge.setTarget(dWest)
  const outEdge = new LEdge()
  outEdge.setSource(dEast)
  outEdge.setTarget(bWest)
  outEdge.setProperty(EDGE_THICKNESS, 1)

  dummy.setProperty(ORIGIN, inEdge)
  dummy.setProperty(LABEL_SIDE, labelSide)
  const labels: LEdgeLabel[] = [
    { text: 'L1', position: { x: 0, y: 0 }, size: { x: 5, y: 3 } },
    { text: 'L2', position: { x: 0, y: 0 }, size: { x: 7, y: 3 } },
  ]
  dummy.setProperty(REPRESENTED_LABELS, labels)
  return { graph, layer, a, b, dummy, inEdge, outEdge, labels }
}

describe('LabelDummyRemover (ELK Java 移植)', () => {
  it('垂直方向 (DOWN): 标签沿 x 递增, BELOW(leftAligned) 顶对齐 (y=labelPos.y)', () => {
    const { graph, layer, dummy, inEdge, outEdge, labels } = setup('BELOW', Direction.DOWN, { x: 30, y: 10 }, { x: 100, y: 200 })
    const bWest = outEdge.getTarget()!
    processLabelDummyRemoval(graph)

    // thickness=1, edgeLabelSpacing=2, labelLabelSpacing=1
    const edgeLabelSpacing = 2
    const thickness = 1
    const labelLabelSpacing = 1
    const currY = 200 + thickness + edgeLabelSpacing // BELOW 偏移
    // Java: leftAligned(BELOW) → y = labelPos.y (顶对齐, LabelDummyRemover.java:166-167), 非居中
    expect(labels[0]!.position).toEqual({ x: 100, y: currY })
    expect(labels[1]!.position).toEqual({ x: 100 + 5 + labelLabelSpacing, y: currY })

    // 标签数量守恒: representedLabels 全部迁移回原边
    expect(inEdge.getLabels()).toEqual(labels)
    expect(inEdge.getLabels()).toHaveLength(2)
    // dummy 从层移除; 入边重连到 B; outEdge 脱离图 (ELK joinAt 语义)
    expect(layer.getNodes()).not.toContain(dummy)
    expect(layer.getNodes().filter(n => n.getType() === NodeType.LABEL)).toHaveLength(0)
    expect(inEdge.getTarget()).toBe(bWest)
    expect(outEdge.getSource()).toBeNull()
    expect(outEdge.getTarget()).toBeNull()
    // 坐标有限
    expectFiniteCoordinates(graph)
  })

  it('垂直方向 (UP): 标签顺序反转放置 (Java Lists.reverse) + ABOVE 底对齐', () => {
    const { graph, layer, dummy, inEdge, labels } = setup('ABOVE', Direction.UP, { x: 30, y: 10 }, { x: 50, y: 60 })
    processLabelDummyRemoval(graph)
    const labelLabelSpacing = 1
    const labelSpaceY = dummy.size.y - 1 - 2 // 10 - 1 - 2 = 7
    // UP: effectiveLabels = reverse([L1,L2]) = [L2,L1] (LabelDummyRemover.java:154-158)
    // L2 (size.x=7) 先放 x=50; L1 (size.x=5) 后放 x=50+7+1=58
    expect(labels[0]!.position.x).toBe(50 + 7 + labelLabelSpacing) // L1 被反转后放到第二个
    expect(labels[1]!.position.x).toBe(50) // L2 先放
    // ABOVE(leftAligned=false) → y = labelPos.y + labelSpace.y - label.size.y = 60 + 7 - 3 = 64 (LabelDummyRemover.java:168-169)
    expect(labels[0]!.position.y).toBe(64)
    expect(labels[1]!.position.y).toBe(64)
    // 标签数量守恒: representedLabels 全部迁移回原边
    expect(inEdge.getLabels()).toHaveLength(2)
    expect(inEdge.getLabels()).toEqual(labels)
    expect(layer.getNodes()).not.toContain(dummy)
  })

  it('水平方向 (RIGHT): 标签沿 y 递增 (原分支回归)', () => {
    const { graph, layer, dummy, inEdge, labels } = setup('ABOVE', Direction.RIGHT, { x: 30, y: 10 }, { x: 50, y: 60 })
    processLabelDummyRemoval(graph)
    const labelLabelSpacing = 1
    const labelSpaceX = dummy.size.x
    expect(labels[0]!.position).toEqual({ x: 50 + (labelSpaceX - 5) / 2, y: 60 })
    expect(labels[1]!.position).toEqual({ x: 50 + (labelSpaceX - 7) / 2, y: 60 + 3 + labelLabelSpacing })
    expect(inEdge.getLabels()).toEqual(labels)
    expect(inEdge.getLabels()).toHaveLength(2)
    expect(layer.getNodes()).not.toContain(dummy)
    expect(layer.getNodes().filter(n => n.getType() === NodeType.LABEL)).toHaveLength(0)
  })
})
