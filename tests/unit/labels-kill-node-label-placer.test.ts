/**
 * labels 簇变异补测: node-label-placer.ts (OUTSIDE 放置/间距/margin 增量纯函数)
 * + node-margin-calculator.ts (端口/端口标签/节点标签 OUTSIDE margin).
 * 语义对照: ELK alg.common NodeLabelCellCreator/NodeLabelLocation + NodeMarginCalculator
 * (includePortLabels + includeLabels; OUTSIDE label 盒超出节点边界部分 = spacing + label 尺寸).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, PortSide } from '../../src/index.js'
import {
  effectivePlacement, isHorizontalOutsideSide, placeOutsideNodeLabel, outsideNodeLabelMargins, labelNodeSpacing,
} from '../../src/intermediate/labels/node-label-placer.js'
import { calculateNodeMargin, calculateNodeMargins } from '../../src/intermediate/node-margin-calculator.js'
import { NODE_LABELS_PLACEMENT, SPACING_LABEL_NODE } from '../../src/options/layered-options.js'
import { Layer } from '../../src/graph/layer.js'

describe('effectivePlacement (ELK NodeLabelsPlacement 解析)', () => {
  it('label.placement 字符串按空白/逗号拆分', () => {
    const g = new LGraph()
    const n = new LNode(g)
    expect(effectivePlacement({ position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'OUTSIDE V_TOP H_CENTER' }, n))
      .toEqual(['OUTSIDE', 'V_TOP', 'H_CENTER'])
    expect(effectivePlacement({ position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'OUTSIDE,V_TOP' }, n))
      .toEqual(['OUTSIDE', 'V_TOP'])
  })

  it('label.placement 数组原样返回; 未设置回退节点级 NODE_LABELS_PLACEMENT', () => {
    const g = new LGraph()
    const n = new LNode(g)
    expect(effectivePlacement({ position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: ['H_LEFT', 'V_TOP'] as never }, n))
      .toEqual(['H_LEFT', 'V_TOP'])
    n.setProperty(NODE_LABELS_PLACEMENT, ['OUTSIDE', 'H_LEFT'])
    expect(effectivePlacement({ position: { x: 0, y: 0 }, size: { x: 1, y: 1 } }, n)).toEqual(['OUTSIDE', 'H_LEFT'])
  })

  it('均未设置 → 空数组 (ELK 默认 fixed)', () => {
    const g = new LGraph()
    const n = new LNode(g)
    expect(effectivePlacement({ position: { x: 0, y: 0 }, size: { x: 1, y: 1 } }, n)).toEqual([])
    expect(effectivePlacement({ position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: '' }, n)).toEqual([])
    expect(effectivePlacement({ position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: '   ' }, n)).toEqual([])
  })
})

describe('isHorizontalOutsideSide (OUT_L_*/OUT_R_* 判定)', () => {
  it('H_PRIORITY + H_LEFT/H_RIGHT → 水平侧', () => {
    expect(isHorizontalOutsideSide(['H_PRIORITY', 'H_LEFT'])).toBe(true)
    expect(isHorizontalOutsideSide(['H_PRIORITY', 'H_RIGHT', 'V_TOP'])).toBe(true)
    expect(isHorizontalOutsideSide(['H_PRIORITY', 'V_TOP'])).toBe(false)
  })
  it('!H_PRIORITY + V_CENTER + H_LEFT/H_RIGHT → 水平侧', () => {
    expect(isHorizontalOutsideSide(['V_CENTER', 'H_LEFT'])).toBe(true)
    expect(isHorizontalOutsideSide(['V_CENTER', 'H_RIGHT', 'V_TOP'])).toBe(true)
    expect(isHorizontalOutsideSide(['H_LEFT'])).toBe(false)
    expect(isHorizontalOutsideSide(['V_CENTER'])).toBe(false)
    expect(isHorizontalOutsideSide(['H_PRIORITY', 'H_LEFT', 'V_TOP'])).toBe(true)
  })
})

describe('placeOutsideNodeLabel (ELK NodeLabelLocation)', () => {
  const SIZE = { x: 100, y: 50 }
  const L = { x: 30, y: 10 }
  const SP = 5
  function placed(placement: string[]): { x: number; y: number } {
    const label = { position: { x: 0, y: 0 }, size: { ...L } }
    placeOutsideNodeLabel(label as never, SIZE, placement, SP)
    return { ...label.position }
  }
  it('垂直侧 V_TOP: y=-h-spacing, x 按 H 对齐', () => {
    expect(placed(['OUTSIDE', 'V_TOP', 'H_CENTER'])).toEqual({ x: 35, y: -15 })
    expect(placed(['OUTSIDE', 'V_TOP', 'H_LEFT'])).toEqual({ x: 0, y: -15 })
    expect(placed(['OUTSIDE', 'V_TOP', 'H_RIGHT'])).toEqual({ x: 70, y: -15 })
  })
  it('垂直侧 V_BOTTOM: y=nodeH+spacing', () => {
    expect(placed(['OUTSIDE', 'V_BOTTOM', 'H_CENTER'])).toEqual({ x: 35, y: 55 })
  })
  it('水平侧 H_PRIORITY+H_LEFT: x=-w-spacing, y 按 V 对齐', () => {
    expect(placed(['OUTSIDE', 'H_PRIORITY', 'H_LEFT', 'V_TOP'])).toEqual({ x: -35, y: 0 })
    expect(placed(['OUTSIDE', 'H_PRIORITY', 'H_LEFT', 'V_CENTER'])).toEqual({ x: -35, y: 20 })
    expect(placed(['OUTSIDE', 'H_PRIORITY', 'H_LEFT', 'V_BOTTOM'])).toEqual({ x: -35, y: 40 })
  })
  it('水平侧 H_PRIORITY+H_RIGHT: x=nodeW+spacing', () => {
    expect(placed(['OUTSIDE', 'H_PRIORITY', 'H_RIGHT', 'V_CENTER'])).toEqual({ x: 105, y: 20 })
    expect(placed(['OUTSIDE', 'H_PRIORITY', 'H_RIGHT', 'V_TOP'])).toEqual({ x: 105, y: 0 })
  })
  it('!H_PRIORITY+V_CENTER+H_LEFT → 水平侧 (V_CENTER 判定)', () => {
    expect(placed(['OUTSIDE', 'V_CENTER', 'H_LEFT'])).toEqual({ x: -35, y: 20 })
    expect(placed(['OUTSIDE', 'V_CENTER', 'H_RIGHT'])).toEqual({ x: 105, y: 20 })
  })
})

describe('outsideNodeLabelMargins (NodeMarginCalculator 外扩增量)', () => {
  it('垂直侧 V_TOP/V_BOTTOM → top/bottom = spacing + 高', () => {
    expect(outsideNodeLabelMargins({ x: 30, y: 10 }, ['OUTSIDE', 'V_TOP', 'H_CENTER'], 5))
      .toEqual({ top: 15, left: 0, right: 0, bottom: 0 })
    expect(outsideNodeLabelMargins({ x: 30, y: 10 }, ['OUTSIDE', 'V_BOTTOM', 'H_LEFT'], 7))
      .toEqual({ top: 0, left: 0, right: 0, bottom: 17 })
  })
  it('水平侧 H_LEFT/H_RIGHT → left/right = spacing + 宽', () => {
    expect(outsideNodeLabelMargins({ x: 30, y: 10 }, ['OUTSIDE', 'H_PRIORITY', 'H_LEFT', 'V_TOP'], 5))
      .toEqual({ top: 0, left: 35, right: 0, bottom: 0 })
    expect(outsideNodeLabelMargins({ x: 30, y: 10 }, ['OUTSIDE', 'H_PRIORITY', 'H_RIGHT', 'V_BOTTOM'], 5))
      .toEqual({ top: 0, left: 0, right: 35, bottom: 0 })
  })
  it('无方向标志 (仅 OUTSIDE) → 全 0', () => {
    expect(outsideNodeLabelMargins({ x: 30, y: 10 }, ['OUTSIDE'], 5))
      .toEqual({ top: 0, left: 0, right: 0, bottom: 0 })
    expect(outsideNodeLabelMargins({ x: 30, y: 10 }, ['OUTSIDE', 'H_CENTER', 'V_CENTER'], 5))
      .toEqual({ top: 0, left: 0, right: 0, bottom: 0 })
  })
})

describe('labelNodeSpacing (节点级 → 图级 → 默认 5)', () => {
  it('节点级优先', () => {
    const g = new LGraph()
    const n = new LNode(g)
    n.setProperty(SPACING_LABEL_NODE, 12)
    g.setProperty(SPACING_LABEL_NODE, 7)
    expect(labelNodeSpacing(n)).toBe(12)
  })
  it('图级回退', () => {
    const g = new LGraph()
    const n = new LNode(g)
    g.setProperty(SPACING_LABEL_NODE, 7)
    expect(labelNodeSpacing(n)).toBe(7)
  })
  it('默认 5', () => {
    const g = new LGraph()
    const n = new LNode(g)
    expect(labelNodeSpacing(n)).toBe(5)
  })
})

describe('calculateNodeMargin (ELK NodeMarginCalculator)', () => {
  function nodeWith(size: { x: number; y: number }): LNode {
    const n = new LNode()
    n.size = { ...size }
    return n
  }

  function expectMargin(n: LNode, m: { left: number; top: number; right: number; bottom: number }): void {
    const got = n.getMargin()
    expect(got.left).toBeCloseTo(m.left, 9)
    expect(got.top).toBeCloseTo(m.top, 9)
    expect(got.right).toBeCloseTo(m.right, 9)
    expect(got.bottom).toBeCloseTo(m.bottom, 9)
  }

  function addPort(n: LNode, side: PortSide, x: number, y: number, w = 8, h = 8): LPort {
    const p = new LPort()
    p.setNode(n)
    p.setSide(side)
    p.size = { x: w, y: h }
    p.getPosition().x = x
    p.getPosition().y = y
    return p
  }

  it('无端口/标签 → margin 全 0', () => {
    const n = nodeWith({ x: 100, y: 100 })
    calculateNodeMargin(n)
    expectMargin(n, { left: 0, top: 0, right: 0, bottom: 0 })
  })

  it('四侧端口越界 → margin 含端口盒 (WEST/NORTH 负, EAST/SOUTH 正)', () => {
    const n = nodeWith({ x: 100, y: 100 })
    addPort(n, PortSide.WEST, -20, 30)
    addPort(n, PortSide.NORTH, 40, -10)
    addPort(n, PortSide.EAST, 100, 30)
    addPort(n, PortSide.SOUTH, 40, 100)
    calculateNodeMargin(n)
    expectMargin(n, { left: 20, top: 10, right: 8, bottom: 8 })
  })

  it('端口标签超出端口盒 → margin 扩展到标签盒', () => {
    const n = nodeWith({ x: 100, y: 100 })
    const w = addPort(n, PortSide.WEST, 0, 0)
    w.setLabels([{ text: 'L', position: { x: -30, y: 5 }, size: { x: 20, y: 5 } }])
    const e = addPort(n, PortSide.EAST, 95, 0)
    e.setLabels([{ text: 'R', position: { x: 10, y: 0 }, size: { x: 20, y: 5 } }])
    calculateNodeMargin(n)
    // WEST 标签盒 x ∈ [-30, -10] → left=30; EAST 标签盒 x ∈ [105,125] → right=25
    expectMargin(n, { left: 30, top: 0, right: 25, bottom: 0 })
  })

  it('节点 INSIDE label 超出右/下缘 → margin.right/bottom 扩展', () => {
    const n = nodeWith({ x: 100, y: 100 })
    n.setLabels([{ text: 'L', position: { x: 80, y: 80 }, size: { x: 30, y: 30 } }])
    calculateNodeMargin(n)
    expectMargin(n, { left: 0, top: 0, right: 10, bottom: 10 })
  })

  it('节点 INSIDE label 超左上 (position 负) → margin.left/top', () => {
    const n = nodeWith({ x: 100, y: 100 })
    n.setLabels([{ text: 'L', position: { x: -10, y: -10 }, size: { x: 10, y: 10 } }])
    calculateNodeMargin(n)
    expectMargin(n, { left: 10, top: 10, right: 0, bottom: 0 })
  })

  it('OUTSIDE label 未放置 (0,0) → OUTSIDE 外扩增量 = spacing + 尺寸', () => {
    const n = nodeWith({ x: 100, y: 100 })
    n.setLabels([
      { text: 'T', position: { x: 0, y: 0 }, size: { x: 50, y: 14 }, placement: 'OUTSIDE V_TOP H_CENTER' },
      { text: 'B', position: { x: 0, y: 0 }, size: { x: 50, y: 14 }, placement: 'OUTSIDE V_BOTTOM H_CENTER' },
      { text: 'L', position: { x: 0, y: 0 }, size: { x: 50, y: 14 }, placement: 'OUTSIDE H_PRIORITY H_LEFT V_CENTER' },
      { text: 'R', position: { x: 0, y: 0 }, size: { x: 50, y: 14 }, placement: 'OUTSIDE H_PRIORITY H_RIGHT V_CENTER' },
    ])
    calculateNodeMargin(n)
    // V_TOP/V_BOTTOM: spacing(5)+h(14)=19; H_LEFT/H_RIGHT: 5+w(50)=55
    expectMargin(n, { left: 55, top: 19, right: 55, bottom: 19 })
  })

  it('calculateNodeMargins 遍历所有层所有节点', () => {
    const g = new LGraph()
    const layer1 = new Layer(g)
    const layer2 = new Layer(g)
    g.getLayers().push(layer1, layer2)
    const n1 = nodeWith({ x: 50, y: 50 })
    const n2 = nodeWith({ x: 50, y: 50 })
    n1.setLayer(layer1)
    n2.setLayer(layer2)
    addPort(n1, PortSide.EAST, 50, 10)
    addPort(n2, PortSide.WEST, -5, 10)
    calculateNodeMargins(g)
    expectMargin(n1, { left: 0, top: 0, right: 8, bottom: 0 })
    expectMargin(n2, { left: 5, top: 0, right: 0, bottom: 0 })
  })
})
