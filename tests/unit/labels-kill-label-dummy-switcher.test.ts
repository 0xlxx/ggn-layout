/**
 * labels 簇变异补测: label-dummy-switcher.ts (ELK intermediate.LabelDummySwitcher).
 * 覆盖 MEDIAN/HEAD/TAIL/WIDEST/CENTER/SPACE_EFFICIENT 策略 + 反转边 + 层交换 + LONG_EDGE_BEFORE_LABEL_DUMMY.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType, Direction } from '../../src/index.js'
import { processLabelDummySwitch } from '../../src/intermediate/label-dummy-switcher.js'
import {
  EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY, CenterEdgeLabelPlacementStrategy,
  SPACING_EDGE_NODE_BETWEEN_LAYERS, SPACING_NODE_NODE_BETWEEN_LAYERS, ALIGNMENT, DIRECTION,
} from '../../src/options/layered-options.js'
import { REPRESENTED_LABELS, LONG_EDGE_SOURCE, LONG_EDGE_TARGET, LONG_EDGE_BEFORE_LABEL_DUMMY, REVERSED } from '../../src/options/internal-properties.js'
import { Layer } from '../../src/graph/layer.js'

/**
 * 链: A(L0) → LE1(L1) → LABEL(L2) → LE2(L3) → LE3(L4) → LE4(L5) → B(L6).
 * label 索引 1 (leftLongEdgeDummies=[LE1]), 跨越层 1..5, 共 5 个 dummy.
 */
function makeChain(g: LGraph, strategy?: CenterEdgeLabelPlacementStrategy, reversed = false): {
  layers: Layer[]; label: LNode; le1: LNode; le2: LNode; le4: LNode; a: LNode; b: LNode
} {
  g.setProperty(SPACING_EDGE_NODE_BETWEEN_LAYERS, 10)
  g.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 20)
  if (strategy !== undefined) g.setProperty(EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY, strategy)
  const layers: Layer[] = []
  for (let i = 0; i < 7; i++) {
    const l = new Layer(g)
    layers.push(l)
    g.getLayers().push(l)
  }
  const a = new LNode(g); a.setLayer(layers[0]!)
  const b = new LNode(g); b.setLayer(layers[6]!)
  const le1 = new LNode(g); le1.setType(NodeType.LONG_EDGE); le1.setLayer(layers[1]!)
  const label = new LNode(g); label.setType(NodeType.LABEL); label.setLayer(layers[2]!)
  const le2 = new LNode(g); le2.setType(NodeType.LONG_EDGE); le2.setLayer(layers[3]!)
  const le3 = new LNode(g); le3.setType(NodeType.LONG_EDGE); le3.setLayer(layers[4]!)
  const le4 = new LNode(g); le4.setType(NodeType.LONG_EDGE); le4.setLayer(layers[5]!)
  label.setProperty(REPRESENTED_LABELS, [{ text: 'C', position: { x: 0, y: 0 }, size: { x: 10, y: 4 } }])
  const ins = new Map<LNode, LPort>()
  const outs = new Map<LNode, LPort>()
  for (const n of [a, le1, label, le2, le3, le4, b]) {
    n.size = { x: 10, y: 10 }
    const pIn = new LPort(); pIn.setNode(n); pIn.setSide(PortSide.WEST)
    const pOut = new LPort(); pOut.setNode(n); pOut.setSide(PortSide.EAST)
    ins.set(n, pIn)
    outs.set(n, pOut)
  }
  function link(src: LNode, tgt: LNode): LEdge {
    const e = new LEdge()
    e.setSource(outs.get(src)!)
    e.setTarget(ins.get(tgt)!)
    if (reversed) e.setProperty(REVERSED, true)
    return e
  }
  link(a, le1)
  link(le1, label)
  link(label, le2)
  link(le2, le3)
  link(le3, le4)
  link(le4, b)
  label.setProperty(LONG_EDGE_SOURCE, outs.get(a)!)
  label.setProperty(LONG_EDGE_TARGET, ins.get(b)!)
  return { layers, label, le1, le2, le4, a, b }
}

describe('LabelDummySwitcher 策略', () => {
  it('MEDIAN_LAYER (默认): label 移到中位层 (L3), 与 LE2 交换, LE1 置 LONG_EDGE_BEFORE_LABEL_DUMMY', () => {
    const g = new LGraph()
    const { label, le1, le2 } = makeChain(g)
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(3)
    expect(le2.getLayer()!.id).toBe(2)
    expect(le1.getProperty(LONG_EDGE_BEFORE_LABEL_DUMMY)).toBe(true)
  })

  it('HEAD_LAYER: label → 最右层 (L5), ALIGNMENT=RIGHT', () => {
    const g = new LGraph()
    const { label, le4 } = makeChain(g, CenterEdgeLabelPlacementStrategy.HEAD_LAYER)
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(5)
    expect(label.getProperty(ALIGNMENT)).toBe('RIGHT')
    expect(le4.getLayer()!.id).toBe(2) // 与 label 交换
  })

  it('TAIL_LAYER: label → 最左层 (L1), ALIGNMENT=LEFT', () => {
    const g = new LGraph()
    const { label, le1 } = makeChain(g, CenterEdgeLabelPlacementStrategy.TAIL_LAYER)
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(1)
    expect(label.getProperty(ALIGNMENT)).toBe('LEFT')
    expect(le1.getLayer()!.id).toBe(2)
  })

  it('HEAD_LAYER + 反转边 → 最左层, ALIGNMENT=LEFT', () => {
    const g = new LGraph()
    const { label } = makeChain(g, CenterEdgeLabelPlacementStrategy.HEAD_LAYER, true)
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(1)
    expect(label.getProperty(ALIGNMENT)).toBe('LEFT')
  })

  it('WIDEST_LAYER: label → 跨越层中最宽 NORMAL 层 (L5=100)', () => {
    const g = new LGraph()
    const { layers, label } = makeChain(g, CenterEdgeLabelPlacementStrategy.WIDEST_LAYER)
    for (let i = 1; i <= 5; i++) {
      const filler = new LNode(g)
      filler.size = { x: i === 5 ? 100 : 10, y: 10 }
      filler.setLayer(layers[i]!)
    }
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(5)
  })

  it('CENTER_LAYER: 累计宽度过半处 (L3=100 → target L3)', () => {
    const g = new LGraph()
    const { layers, label } = makeChain(g, CenterEdgeLabelPlacementStrategy.CENTER_LAYER)
    for (let i = 1; i <= 5; i++) {
      const filler = new LNode(g)
      filler.size = { x: i === 3 ? 100 : 10, y: 10 }
      filler.setLayer(layers[i]!)
    }
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(3)
  })

  it('SPACE_EFFICIENT_LAYER: 单层 label 平凡指派; 足够宽层直接放入', () => {
    const g = new LGraph()
    const { layers, label } = makeChain(g, CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER)
    layers[4]!.getSize().x = 100 // 足够容纳 label 宽 10
    processLabelDummySwitch(g)
    // assignToWiderLayer → 第一个 width >= dummyWidth 的层 = L4 (id 4)
    expect(label.getLayer()!.id).toBe(4)
  })

  it('SPACE_EFFICIENT_LAYER: 无足够宽层 → findPotentiallyWidestLayer 启发式', () => {
    const g = new LGraph()
    const { label } = makeChain(g, CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER)
    processLabelDummySwitch(g)
    // 所有层宽 0 → potential 全 0 → 最左层
    expect(label.getLayer()!.id).toBe(1)
  })

  it('标签级 centerLabelPlacementStrategy 覆盖图级默认', () => {
    const g = new LGraph()
    const { label } = makeChain(g, CenterEdgeLabelPlacementStrategy.MEDIAN_LAYER)
    label.setProperty(REPRESENTED_LABELS, [{
      text: 'C', position: { x: 0, y: 0 }, size: { x: 10, y: 4 },
      centerLabelPlacementStrategy: CenterEdgeLabelPlacementStrategy.HEAD_LAYER,
    }])
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(5)
  })
})

describe('LabelDummySwitcher 边界', () => {
  it('label 已在目标层 (中位) → 不交换', () => {
    // 链: A → LABEL → LE1 → B (label 索引 0, 跨越 1 层)
    const g = new LGraph()
    const l0 = new Layer(g); const l1 = new Layer(g); const l2 = new Layer(g)
    g.getLayers().push(l0, l1, l2)
    const a = new LNode(g); a.setLayer(l0)
    const label = new LNode(g); label.setType(NodeType.LABEL); label.setLayer(l1)
    const le = new LNode(g); le.setType(NodeType.LONG_EDGE); le.setLayer(l1)
    const b = new LNode(g); b.setLayer(l2)
    const insB = new Map<LNode, LPort>()
    const outsB = new Map<LNode, LPort>()
    for (const n of [a, label, le, b]) {
      const pIn = new LPort(); pIn.setNode(n); pIn.setSide(PortSide.WEST)
      const pOut = new LPort(); pOut.setNode(n); pOut.setSide(PortSide.EAST)
      insB.set(n, pIn)
      outsB.set(n, pOut)
    }
    label.setProperty(REPRESENTED_LABELS, [])
    const e1 = new LEdge(); e1.setSource(outsB.get(a)!); e1.setTarget(insB.get(label)!)
    const e2 = new LEdge(); e2.setSource(outsB.get(label)!); e2.setTarget(insB.get(le)!)
    const e3 = new LEdge(); e3.setSource(outsB.get(le)!); e3.setTarget(insB.get(b)!)
    void e1; void e2; void e3
    processLabelDummySwitch(g)
    // label 与 le 同层 (左右各有 0/1 dummy), 目标=当前 → 不交换
    expect(label.getLayer()!.id).toBe(1)
    expect(le.getLayer()!.id).toBe(1)
  })
})

describe('LabelDummySwitcher 幸存分支补测 (T5-C2)', () => {
  it('WIDEST_LAYER 并列最宽层 → 取最左 (严格 >)', () => {
    const g = new LGraph()
    const { layers, label } = makeChain(g, CenterEdgeLabelPlacementStrategy.WIDEST_LAYER)
    for (let i = 1; i <= 5; i++) {
      const filler = new LNode(g)
      filler.size = { x: i === 3 || i === 5 ? 100 : 10, y: 10 }
      filler.setLayer(layers[i]!)
    }
    processLabelDummySwitch(g)
    // widest 从 L1(10) 起; L3=100 首次超过 → widest=3; L5=100 不 >100 → 保持 3
    expect(label.getLayer()!.id).toBe(3)
  })

  it('CENTER_LAYER: minSpaceBetweenLayers = max(edgeNodeSpacing*2, nodeNodeSpacing)', () => {
    const g = new LGraph()
    const { layers, label } = makeChain(g, CenterEdgeLabelPlacementStrategy.CENTER_LAYER)
    g.setProperty(SPACING_EDGE_NODE_BETWEEN_LAYERS, 30) // *2 = 60 (makeChain 后覆盖)
    g.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 20) // max=60
    for (let i = 1; i <= 5; i++) {
      const filler = new LNode(g)
      filler.size = { x: i === 1 ? 100 : 10, y: 10 }
      filler.setLayer(layers[i]!)
    }
    processLabelDummySwitch(g)
    // sums(60): 100,170,240,310,380 → threshold 190 → 首个 ≥190 是 idx2 (240) → L3
    expect(label.getLayer()!.id).toBe(3)
  })

  it('HEAD_LAYER 仅入边反转 (出边未反转) → 最左层 + ALIGNMENT=LEFT', () => {
    const g = new LGraph()
    const { label } = makeChain(g, CenterEdgeLabelPlacementStrategy.HEAD_LAYER)
    label.getIncomingEdges()[0]!.setProperty(REVERSED, true)
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(1)
    expect(label.getProperty(ALIGNMENT)).toBe('LEFT')
  })

  it('TAIL_LAYER 仅出边反转 (入边未反转) → 最右层 + ALIGNMENT=RIGHT', () => {
    const g = new LGraph()
    const { label } = makeChain(g, CenterEdgeLabelPlacementStrategy.TAIL_LAYER)
    label.getOutgoingEdges()[0]!.setProperty(REVERSED, true)
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(5)
    expect(label.getProperty(ALIGNMENT)).toBe('RIGHT')
  })

  it('SPACE_EFFICIENT_LAYER: 单层 label (leftmost==rightmost) 平凡指派原地不动', () => {
    const g = new LGraph()
    g.setProperty(EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY, CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER)
    const l0 = new Layer(g); const l1 = new Layer(g); const l2 = new Layer(g)
    g.getLayers().push(l0, l1, l2)
    const a = new LNode(g); a.setLayer(l0)
    const label = new LNode(g); label.setType(NodeType.LABEL); label.setLayer(l1); label.size = { x: 10, y: 10 }
    const b = new LNode(g); b.setLayer(l2)
    const ins = new Map<LNode, LPort>(); const outs = new Map<LNode, LPort>()
    for (const n of [a, label, b]) {
      const pIn = new LPort(); pIn.setNode(n); pIn.setSide(PortSide.WEST)
      const pOut = new LPort(); pOut.setNode(n); pOut.setSide(PortSide.EAST)
      ins.set(n, pIn); outs.set(n, pOut)
    }
    label.setProperty(REPRESENTED_LABELS, [{ text: 'C', position: { x: 0, y: 0 }, size: { x: 10, y: 4 } }])
    const e1 = new LEdge(); e1.setSource(outs.get(a)!); e1.setTarget(ins.get(label)!)
    const e2 = new LEdge(); e2.setSource(outs.get(label)!); e2.setTarget(ins.get(b)!)
    void e1; void e2
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(1)
  })

  it('SPACE_EFFICIENT_LAYER: 层宽恰等于标签宽 → assignToWiderLayer 放入 (>= 边界)', () => {
    const g = new LGraph()
    const { layers, label } = makeChain(g, CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER)
    layers[2]!.getSize().x = 10 // label 宽 10, 恰好相等
    processLabelDummySwitch(g)
    // 第一个 size.x >= 10 的层 = L2 (id 2) → label 保持 L2
    expect(label.getLayer()!.id).toBe(2)
  })

  it('DIRECTION=DOWN: findMaxNonDummyNodeWidth 返回 0 → WIDEST 全 0 → 最左层', () => {
    const g = new LGraph()
    g.setProperty(DIRECTION, Direction.DOWN)
    const { layers, label } = makeChain(g, CenterEdgeLabelPlacementStrategy.WIDEST_LAYER)
    for (let i = 1; i <= 5; i++) {
      const filler = new LNode(g)
      filler.size = { x: i === 5 ? 100 : 10, y: 10 }
      filler.setLayer(layers[i]!)
    }
    processLabelDummySwitch(g)
    expect(label.getLayer()!.id).toBe(1)
  })

  it('多级左侧长边链: 所有左侧 LONG_EDGE dummy 均置 LONG_EDGE_BEFORE_LABEL_DUMMY', () => {
    // 链: A(L0) → LE1(L1) → LE2(L2) → LABEL(L3) → LE3(L4) → LE4(L5) → B(L6)
    // totalDummyCount=5, MEDIAN target=1+floor(4/2)=3=label 当前层 → 不交换, 左侧链保持
    const g = new LGraph()
    const layers: Layer[] = []
    for (let i = 0; i < 7; i++) { const l = new Layer(g); layers.push(l); g.getLayers().push(l) }
    const a = new LNode(g); a.setLayer(layers[0]!)
    const b = new LNode(g); b.setLayer(layers[6]!)
    const le1 = new LNode(g); le1.setType(NodeType.LONG_EDGE); le1.setLayer(layers[1]!)
    const le2 = new LNode(g); le2.setType(NodeType.LONG_EDGE); le2.setLayer(layers[2]!)
    const label = new LNode(g); label.setType(NodeType.LABEL); label.setLayer(layers[3]!)
    const le3 = new LNode(g); le3.setType(NodeType.LONG_EDGE); le3.setLayer(layers[4]!)
    const le4 = new LNode(g); le4.setType(NodeType.LONG_EDGE); le4.setLayer(layers[5]!)
    label.setProperty(REPRESENTED_LABELS, [{ text: 'C', position: { x: 0, y: 0 }, size: { x: 10, y: 4 } }])
    const ins = new Map<LNode, LPort>(); const outs = new Map<LNode, LPort>()
    for (const n of [a, le1, le2, label, le3, le4, b]) {
      n.size = { x: 10, y: 10 }
      const pIn = new LPort(); pIn.setNode(n); pIn.setSide(PortSide.WEST)
      const pOut = new LPort(); pOut.setNode(n); pOut.setSide(PortSide.EAST)
      ins.set(n, pIn); outs.set(n, pOut)
    }
    function link(src: LNode, tgt: LNode): LEdge {
      const e = new LEdge(); e.setSource(outs.get(src)!); e.setTarget(ins.get(tgt)!); return e
    }
    link(a, le1); link(le1, le2); link(le2, label); link(label, le3); link(le3, le4); link(le4, b)
    processLabelDummySwitch(g)
    expect(le1.getProperty(LONG_EDGE_BEFORE_LABEL_DUMMY)).toBe(true)
    expect(le2.getProperty(LONG_EDGE_BEFORE_LABEL_DUMMY)).toBe(true)
  })

  it('SPACE_EFFICIENT_LAYER: 多个非平凡标签 → findPotentiallyWidestLayer 启发式', () => {
    // 两条链共享同一跨越区间, 均无足够宽层 → 按宽度降序逐个指派
    const g = new LGraph()
    g.setProperty(EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY, CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER)
    const layers: Layer[] = []
    for (let i = 0; i < 5; i++) { const l = new Layer(g); layers.push(l); g.getLayers().push(l) }
    // 每条链: A(L0) → LABEL(L1) → LE(L2) → B(L3)
    function chain(width: number): LNode {
      const a = new LNode(g); a.setLayer(layers[0]!)
      const label = new LNode(g); label.setType(NodeType.LABEL); label.setLayer(layers[1]!); label.size = { x: width, y: 10 }
      const le = new LNode(g); le.setType(NodeType.LONG_EDGE); le.setLayer(layers[2]!)
      const b = new LNode(g); b.setLayer(layers[3]!)
      label.setProperty(REPRESENTED_LABELS, [{ text: 'C', position: { x: 0, y: 0 }, size: { x: width, y: 4 } }])
      const ins = new Map<LNode, LPort>(); const outs = new Map<LNode, LPort>()
      for (const n of [a, label, le, b]) {
        n.size = { x: 10, y: 10 }
        const pIn = new LPort(); pIn.setNode(n); pIn.setSide(PortSide.WEST)
        const pOut = new LPort(); pOut.setNode(n); pOut.setSide(PortSide.EAST)
        ins.set(n, pIn); outs.set(n, pOut)
      }
      const e1 = new LEdge(); e1.setSource(outs.get(a)!); e1.setTarget(ins.get(label)!)
      const e2 = new LEdge(); e2.setSource(outs.get(label)!); e2.setTarget(ins.get(le)!)
      const e3 = new LEdge(); e3.setSource(outs.get(le)!); e3.setTarget(ins.get(b)!)
      void e1; void e2; void e3
      return label
    }
    const l1 = chain(30)
    const l2 = chain(50)
    processLabelDummySwitch(g)
    // 无层可容纳 → 非平凡: [宽50, 宽30]; potential 均取最大未指派标签宽
    expect([l1.getLayer()!.id, l2.getLayer()!.id]).toEqual([1, 1])
  })
})
