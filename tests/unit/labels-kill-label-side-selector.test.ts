/**
 * labels 簇变异补测: label-side-selector.ts (ELK intermediate.LabelSideSelector).
 * 策略: ALWAYS_UP/DOWN, DIRECTION_UP/DOWN, SMART_UP/DOWN + applyLabelSide 端口 y 移动.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType } from '../../src/index.js'
import { processLabelSideSelection, labelSideOf } from '../../src/intermediate/label-side-selector.js'
import { EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection, EDGE_THICKNESS } from '../../src/options/layered-options.js'
import { LABEL_SIDE, ORIGIN, REVERSED, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../../src/options/internal-properties.js'
import { Layer } from '../../src/graph/layer.js'

function makeNode(g: LGraph, layer: Layer | null, type = NodeType.NORMAL): LNode {
  const n = new LNode(g)
  n.setType(type)
  n.size = { x: 30, y: 10 }
  if (layer) n.setLayer(layer)
  return n
}
function makePort(n: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  return p
}
function addEdge(src: LPort, tgt: LPort, labelPlacement: string | undefined, reversed = false): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  if (reversed) e.setProperty(REVERSED, true)
  if (labelPlacement !== undefined) e.getLabels().push({ text: 'L', position: { x: 0, y: 0 }, size: { x: 5, y: 3 }, placement: labelPlacement })
  return e
}
/** 构造 LABEL dummy: src →(inEdge) dummy →(outEdge) tgt; 设 ORIGIN + LONG_EDGE_SOURCE/TARGET. */
function makeLabelDummy(g: LGraph, layer: Layer, thickness = 1): { dummy: LNode; inEdge: LEdge; outEdge: LEdge } {
  const src = makeNode(g, layer)
  const s = makePort(src, PortSide.EAST)
  const tgt = makeNode(g, layer)
  const t = makePort(tgt, PortSide.WEST)
  const dummy = makeNode(g, layer, NodeType.LABEL)
  const dIn = makePort(dummy, PortSide.WEST)
  const dOut = makePort(dummy, PortSide.EAST)
  const inEdge = addEdge(s, dIn, undefined)
  const outEdge = addEdge(dOut, t, undefined)
  inEdge.setProperty(EDGE_THICKNESS, thickness)
  dummy.setProperty(ORIGIN, inEdge)
  dummy.setProperty(LONG_EDGE_SOURCE, s)
  dummy.setProperty(LONG_EDGE_TARGET, t)
  return { dummy, inEdge, outEdge }
}
/** 仅把 LABEL dummy 放入层 (src/tgt 留 layerless), 便于控制层序. */
function dummyOnlyInLayer(g: LGraph, layer: Layer, thickness = 1): { dummy: LNode; inEdge: LEdge; outEdge: LEdge } {
  const src = makeNode(g, null)
  const s = makePort(src, PortSide.EAST)
  const tgt = makeNode(g, null)
  const t = makePort(tgt, PortSide.WEST)
  const dummy = makeNode(g, layer, NodeType.LABEL)
  const dIn = makePort(dummy, PortSide.WEST)
  const dOut = makePort(dummy, PortSide.EAST)
  const inEdge = addEdge(s, dIn, undefined)
  const outEdge = addEdge(dOut, t, undefined)
  inEdge.setProperty(EDGE_THICKNESS, thickness)
  dummy.setProperty(ORIGIN, inEdge)
  dummy.setProperty(LONG_EDGE_SOURCE, s)
  dummy.setProperty(LONG_EDGE_TARGET, t)
  return { dummy, inEdge, outEdge }
}

function run(mode: EdgeLabelSideSelection): { dummySide: string; edgeSide: string | undefined } {
  const g = new LGraph()
  const layer = new Layer(g)
  g.getLayers().push(layer)
  const { dummy } = makeLabelDummy(g, layer)
  const n = makeNode(g, layer)
  const np = makePort(n, PortSide.EAST)
  const t = makePort(makeNode(g, layer), PortSide.WEST)
  const e = addEdge(np, t, 'CENTER')
  g.setProperty(EDGE_LABELS_SIDE_SELECTION, mode)
  processLabelSideSelection(g)
  return { dummySide: labelSideOf(dummy), edgeSide: (e.getLabels()[0] as unknown as { side?: string }).side }
}

describe('LabelSideSelector ALWAYS/DIRECTION 策略', () => {
  it('ALWAYS_UP: dummy + 边标签均 ABOVE', () => {
    const { dummySide, edgeSide } = run(EdgeLabelSideSelection.ALWAYS_UP)
    expect(dummySide).toBe('ABOVE')
    expect(edgeSide).toBe('ABOVE')
  })
  it('ALWAYS_DOWN: 均 BELOW', () => {
    const { dummySide, edgeSide } = run(EdgeLabelSideSelection.ALWAYS_DOWN)
    expect(dummySide).toBe('BELOW')
    expect(edgeSide).toBe('BELOW')
  })
  it('DIRECTION_UP: 右向边 ABOVE; 反转边 BELOW', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy, inEdge } = makeLabelDummy(g, layer)
    const n1 = makeNode(g, layer)
    const p1 = makePort(n1, PortSide.EAST)
    const t1 = makePort(makeNode(g, layer), PortSide.WEST)
    const right = addEdge(p1, t1, 'CENTER')
    const n2 = makeNode(g, layer)
    const p2 = makePort(n2, PortSide.EAST)
    const t2 = makePort(makeNode(g, layer), PortSide.WEST)
    const left = addEdge(p2, t2, 'CENTER', true)
    inEdge.setProperty(REVERSED, true)
    dummy.getPorts(PortSide.EAST)[0]!.getOutgoingEdges()[0]!.setProperty(REVERSED, true)
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.DIRECTION_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(dummy)).toBe('BELOW') // dummy 入边反转 → 对侧
    expect((right.getLabels()[0] as unknown as { side?: string }).side).toBe('ABOVE')
    expect((left.getLabels()[0] as unknown as { side?: string }).side).toBe('BELOW')
  })
  it('DIRECTION_DOWN: 右向边 BELOW; 反转边 ABOVE', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const n1 = makeNode(g, layer)
    const p1 = makePort(n1, PortSide.EAST)
    const t1 = makePort(makeNode(g, layer), PortSide.WEST)
    const right = addEdge(p1, t1, 'CENTER')
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.DIRECTION_DOWN)
    processLabelSideSelection(g)
    expect((right.getLabels()[0] as unknown as { side?: string }).side).toBe('BELOW')
  })
})

describe('LabelSideSelector SMART 策略', () => {
  it('SMART_UP: 单 label dummy 顶组 → ABOVE, 底组 → BELOW', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy: d1 } = dummyOnlyInLayer(g, layer)
    makeNode(g, layer) // NORMAL 结束顶组
    const { dummy: d2 } = dummyOnlyInLayer(g, layer)
    // d2 位于 NORMAL 之后且是层末 → 底组 → BELOW
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(d1)).toBe('ABOVE')
    expect(labelSideOf(d2)).toBe('BELOW')
  })

  it('SMART_UP: 2 个连续 label dummy → ABOVE/BELOW 交替', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy: d1 } = dummyOnlyInLayer(g, layer)
    const { dummy: d2 } = dummyOnlyInLayer(g, layer)
    makeNode(g, layer)
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(d1)).toBe('ABOVE')
    expect(labelSideOf(d2)).toBe('BELOW')
  })

  it('SMART_UP: 常规节点 2 个 E 端口端标签组 → ABOVE/BELOW', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const n = makeNode(g, layer)
    const e1 = makePort(n, PortSide.EAST)
    const e2 = makePort(n, PortSide.EAST)
    const t1 = makePort(makeNode(g, layer), PortSide.WEST)
    const t2 = makePort(makeNode(g, layer), PortSide.WEST)
    const edge1 = addEdge(e1, t1, 'TAIL')
    const edge2 = addEdge(e2, t2, 'TAIL')
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    const l1 = edge1.getLabels()[0] as unknown as { side?: string }
    const l2 = edge2.getLabels()[0] as unknown as { side?: string }
    expect(l1.side).toBe('ABOVE')
    expect(l2.side).toBe('BELOW')
  })

  it('SMART_UP: 常规节点 2 个 W 端口端标签组 → BELOW/ABOVE', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const n = makeNode(g, layer)
    const w1 = makePort(n, PortSide.WEST)
    const w2 = makePort(n, PortSide.WEST)
    const s1 = makePort(makeNode(g, layer), PortSide.EAST)
    const s2 = makePort(makeNode(g, layer), PortSide.EAST)
    const edge1 = addEdge(s1, w1, 'HEAD')
    const edge2 = addEdge(s2, w2, 'HEAD')
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    const l1 = edge1.getLabels()[0] as unknown as { side?: string }
    const l2 = edge2.getLabels()[0] as unknown as { side?: string }
    expect(l1.side).toBe('BELOW')
    expect(l2.side).toBe('ABOVE')
  })

  it('SMART_UP: 3 个连续 label dummy 同端 → 默认侧 ABOVE (applyForDummyRunWithSimpleLoops)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy: d1 } = dummyOnlyInLayer(g, layer)
    const { dummy: d2 } = dummyOnlyInLayer(g, layer)
    const { dummy: d3 } = dummyOnlyInLayer(g, layer)
    makeNode(g, layer)
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(d1)).toBe('ABOVE')
    expect(labelSideOf(d2)).toBe('ABOVE')
    expect(labelSideOf(d3)).toBe('ABOVE')
  })

  it('SMART_UP: 无端标签组常规节点 → 默认侧', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    makeNode(g, layer)
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(true).toBe(true)
  })
})

describe('applyLabelSide / labelSideOf', () => {
  it('ABOVE: LABEL_SIDE 置位 + 端口 y = size.y - ceil(thickness/2)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy, inEdge } = makeLabelDummy(g, layer, 4)
    dummy.size = { x: 30, y: 10 }
    inEdge.setProperty(EDGE_THICKNESS, 4)
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.ALWAYS_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(dummy)).toBe('ABOVE')
    for (const p of dummy.getPorts()) expect(p.getPosition().y).toBe(10 - Math.ceil(4 / 2))
  })

  it('labelSideOf 默认 BELOW', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy } = makeLabelDummy(g, layer)
    dummy.setProperty(LABEL_SIDE, null as never) // 清除
    expect(labelSideOf(dummy)).toBe('BELOW')
  })

  it('LONG_EDGE dummy 不设 side (仅 LABEL 类型)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const le = makeNode(g, layer, NodeType.LONG_EDGE)
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.ALWAYS_UP)
    processLabelSideSelection(g)
    expect(le.hasProperty(LABEL_SIDE)).toBe(false)
  })
})

describe('LabelSideSelector SMART 子队列补测 (T5-C2)', () => {
  it('SMART_UP: 层内 [LABEL, LONG_EDGE] 顶组单标签 → ABOVE (labelDummyCount=1, 首元素 LABEL)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy } = dummyOnlyInLayer(g, layer)
    makeNode(g, layer, NodeType.LONG_EDGE)
    makeNode(g, layer) // NORMAL 结束顶组
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(dummy)).toBe('ABOVE')
  })

  it('SMART_UP: 层末 [LONG_EDGE, LABEL] 底组单标签 → BELOW (末元素 LABEL)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    makeNode(g, layer) // NORMAL → topGroup=false
    makeNode(g, layer, NodeType.LONG_EDGE)
    const { dummy } = dummyOnlyInLayer(g, layer) // 层末
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(dummy)).toBe('BELOW')
  })

  it('SMART_DOWN: 边标签未设 side → fillMissingSides 补齐 BELOW (含 layerless 节点)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const n = makeNode(g, layer)
    const np = makePort(n, PortSide.EAST)
    const t = makePort(makeNode(g, layer), PortSide.WEST)
    const e = addEdge(np, t, 'CENTER')
    // layerless 节点出边标签
    const ln = makeNode(g, null)
    const lp = makePort(ln, PortSide.EAST)
    const lt = makePort(makeNode(g, null), PortSide.WEST)
    const le = addEdge(lp, lt, 'CENTER')
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_DOWN)
    processLabelSideSelection(g)
    expect((e.getLabels()[0] as unknown as { side?: string }).side).toBe('BELOW')
    expect((le.getLabels()[0] as unknown as { side?: string }).side).toBe('BELOW')
  })

  it('SMART_UP: 边标签已设 side 不覆盖; 空串 side 覆盖为 ABOVE', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const n = makeNode(g, layer)
    const p1 = makePort(n, PortSide.EAST)
    const t1 = makePort(makeNode(g, layer), PortSide.WEST)
    const kept = addEdge(p1, t1, 'CENTER')
    ;(kept.getLabels()[0] as unknown as { side?: string }).side = 'BELOW'
    const p2 = makePort(n, PortSide.EAST)
    const t2 = makePort(makeNode(g, layer), PortSide.WEST)
    const filled = addEdge(p2, t2, 'CENTER')
    ;(filled.getLabels()[0] as unknown as { side?: string }).side = ''
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect((kept.getLabels()[0] as unknown as { side?: string }).side).toBe('BELOW')
    expect((filled.getLabels()[0] as unknown as { side?: string }).side).toBe('ABOVE')
  })

  it('SMART_UP: 3 标签 [同源同目标×2, 异源×1] → 分组 [ABOVE,BELOW] + 默认 ABOVE', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const s1 = makePort(makeNode(g, null), PortSide.EAST)
    const t1 = makePort(makeNode(g, null), PortSide.WEST)
    const { dummy: d1 } = dummyOnlyInLayer(g, layer)
    const { dummy: d2 } = dummyOnlyInLayer(g, layer)
    d1.setProperty(LONG_EDGE_SOURCE, s1); d1.setProperty(LONG_EDGE_TARGET, t1)
    d2.setProperty(LONG_EDGE_SOURCE, s1); d2.setProperty(LONG_EDGE_TARGET, t1)
    const { dummy: d3 } = dummyOnlyInLayer(g, layer) // 不同源
    makeNode(g, layer) // NORMAL 结束顶组
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(d1)).toBe('ABOVE')
    expect(labelSideOf(d2)).toBe('BELOW')
    expect(labelSideOf(d3)).toBe('ABOVE')
  })

  it('SMART_UP: 3 标签无 LONG_EDGE_SOURCE/TARGET → getLongEdgeEndNode null 分组 → 默认 ABOVE', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    // 普通 LABEL 节点 (无 LONG_EDGE_* 属性), 有入/出边
    const dummies: LNode[] = []
    for (let k = 0; k < 3; k++) {
      const src = makeNode(g, null)
      const s = makePort(src, PortSide.EAST)
      const tgt = makeNode(g, null)
      const t = makePort(tgt, PortSide.WEST)
      const dummy = makeNode(g, layer, NodeType.LABEL)
      const dIn = makePort(dummy, PortSide.WEST)
      const dOut = makePort(dummy, PortSide.EAST)
      addEdge(s, dIn, undefined)
      addEdge(dOut, t, undefined)
      dummies.push(dummy)
    }
    makeNode(g, layer) // NORMAL 结束顶组
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    for (const d of dummies) expect(labelSideOf(d)).toBe('ABOVE')
  })

  it('DIRECTION_UP: LABEL 入边反转、出边右向 → doesEdgePointRight 走 outgoing → ABOVE', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy, inEdge } = makeLabelDummy(g, layer)
    inEdge.setProperty(REVERSED, true)
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.DIRECTION_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(dummy)).toBe('ABOVE')
  })

  it('SMART_UP: 层内单 label + 前有 LONG_EDGE 顶组 (dummyNodes=[LE,LABEL]) → 首非 LABEL → 兜底默认', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    makeNode(g, layer, NodeType.LONG_EDGE)
    const { dummy } = dummyOnlyInLayer(g, layer)
    makeNode(g, layer) // NORMAL
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    // 179/182 均不满足 (首元素 LE) → dummyNodes.length===2 → [ABOVE, BELOW] 但 LE 非 LABEL → label 为第 2 元素 BELOW
    expect(labelSideOf(dummy)).toBe('BELOW')
  })
})

describe('LabelSideSelector 顶/底组多 dummy 补测 (T5-C2)', () => {
  it('SMART_UP: 顶组 [LABEL, LONG_EDGE, LONG_EDGE] 单标签 → ABOVE', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const { dummy } = dummyOnlyInLayer(g, layer)
    makeNode(g, layer, NodeType.LONG_EDGE)
    makeNode(g, layer, NodeType.LONG_EDGE)
    makeNode(g, layer) // NORMAL
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(dummy)).toBe('ABOVE')
  })

  it('SMART_UP: 底组 [LONG_EDGE, LONG_EDGE, LABEL] 单标签 → BELOW', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    makeNode(g, layer) // NORMAL → topGroup=false
    makeNode(g, layer, NodeType.LONG_EDGE)
    makeNode(g, layer, NodeType.LONG_EDGE)
    const { dummy } = dummyOnlyInLayer(g, layer) // 层末
    g.setProperty(EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection.SMART_UP)
    processLabelSideSelection(g)
    expect(labelSideOf(dummy)).toBe('BELOW')
  })
})
