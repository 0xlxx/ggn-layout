/**
 * labels 簇变异补测: label-dummy-inserter.ts (CENTER label dummy 创建/尺寸) +
 * label-dummy-remover.ts 补充 (joinAt 弯点守恒 / 调试 env 分支).
 */
import { describe, expect, it, vi } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType, Direction, PortConstraints } from '../../src/index.js'
import { processLabelDummyInsert } from '../../src/intermediate/label-dummy-inserter.js'
import { processLabelDummyRemoval } from '../../src/intermediate/label-dummy-remover.js'
import { ORIGIN, REPRESENTED_LABELS, LABEL_SIDE, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../../src/options/internal-properties.js'
import { PORT_CONSTRAINTS } from '../../src/options/layered-options.js'
import { SPACING_EDGE_LABEL, SPACING_LABEL_LABEL, DIRECTION, EDGE_THICKNESS } from '../../src/options/layered-options.js'
import { Layer } from '../../src/graph/layer.js'

function makeNode(g: LGraph, name = 'N'): LNode {
  const n = new LNode(g)
  n.size = { x: 20, y: 20 }
  return n
}
function makePort(n: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  return p
}
function makeEdge(a: LPort, b: LPort, thickness = 1): LEdge {
  const e = new LEdge()
  e.setSource(a)
  e.setTarget(b)
  e.setProperty(EDGE_THICKNESS, thickness)
  return e
}
function label(text: string, placement: string | undefined, size: { x: number; y: number }) {
  return { text, position: { x: 0, y: 0 }, size, placement }
}

describe('LabelDummyInserter (ELK Java 移植)', () => {
  function setup(direction: string) {
    const g = new LGraph()
    g.setProperty(DIRECTION, direction as Direction)
    g.setProperty(SPACING_EDGE_LABEL, 2)
    g.setProperty(SPACING_LABEL_LABEL, 1)
    const a = makeNode(g)
    const b = makeNode(g)
    const ap = makePort(a, PortSide.EAST)
    const bp = makePort(b, PortSide.WEST)
    const e = makeEdge(ap, bp, 1)
    return { g, a, b, ap, bp, e }
  }

  it('垂直方向 (DOWN): CENTER label 移入 dummy, HEAD/TAIL 保留在边', () => {
    const { g, e, bp } = setup(Direction.DOWN)
    e.getLabels().push(label('C', 'CENTER', { x: 5, y: 3 }))
    e.getLabels().push(label('H', 'HEAD', { x: 7, y: 4 }))
    e.getLabels().push(label('T', 'TAIL', { x: 6, y: 2 }))

    processLabelDummyInsert(g)

    const dummies = g.getLayerlessNodes().filter(n => n.getType() === NodeType.LABEL)
    expect(dummies).toHaveLength(1)
    const d = dummies[0]!
    expect(d.getProperty(ORIGIN)).toBe(e)
    expect((d.getProperty(REPRESENTED_LABELS) as { text: string }[]).map(l => l.text)).toEqual(['C'])
    expect(d.size).toEqual({ x: 5, y: 6 }) // 5+1 → -1; max h 3 + edgeLabelSpacing 2 + thickness 1
    expect(d.getProperty(PORT_CONSTRAINTS)).toBe(PortConstraints.FIXED_POS)
    expect(d.getProperty(LONG_EDGE_SOURCE)).toBe(e.getSource())
    expect(d.getProperty(LONG_EDGE_TARGET)).toBe(bp)
    // 原边 → dummy 输入; dummy 输出 → 目标 (HEAD 标签迁移到新边)
    const dIn = d.getPorts(PortSide.WEST)[0]!
    const dOut = d.getPorts(PortSide.EAST)[0]!
    expect(e.getTarget()).toBe(dIn)
    expect(dOut.getOutgoingEdges()[0]!.getTarget()).toBe(bp)
    expect(e.getLabels().map(l => l.text)).toEqual(['T'])
    expect(dOut.getOutgoingEdges()[0]!.getLabels().map(l => l.text)).toEqual(['H'])
  })

  it('水平方向 (RIGHT): x=max 宽, y=Σ高+gap', () => {
    const { g, e } = setup(Direction.RIGHT)
    e.getLabels().push(label('C1', 'CENTER', { x: 5, y: 3 }))
    e.getLabels().push(label('C2', 'CENTER', { x: 7, y: 4 }))
    processLabelDummyInsert(g)
    const d = g.getLayerlessNodes().filter(n => n.getType() === NodeType.LABEL)[0]!
    // y = thickness(1) + (4+1) + (3+1) + (2-1+1) = 12; x = max(5,7)=7
    expect(d.size).toEqual({ x: 7, y: 12 }) // splitEdge 种子 thickness=1 + Σ(h+gap) + (edgeLabel - labelLabel + thickness)
  })

  it('无 CENTER label → 不建 dummy; 边保留全部标签', () => {
    const { g, e } = setup(Direction.RIGHT)
    e.getLabels().push(label('H', 'HEAD', { x: 5, y: 3 }))
    e.getLabels().push(label('T', 'TAIL', { x: 5, y: 3 }))
    processLabelDummyInsert(g)
    expect(g.getLayerlessNodes().filter(n => n.getType() === NodeType.LABEL)).toHaveLength(0)
    expect(e.getLabels()).toHaveLength(2)
  })

  it('自环边 (同节点) → 不建 dummy', () => {
    const { g, e, ap } = setup(Direction.RIGHT)
    e.setTarget(ap) // 自环: 源=目标节点
    e.getLabels().push(label('C', 'CENTER', { x: 5, y: 3 }))
    processLabelDummyInsert(g)
    expect(g.getLayerlessNodes().filter(n => n.getType() === NodeType.LABEL)).toHaveLength(0)
  })

  it('UNDEFINED placement 归一化为 CENTER; 负 thickness 置 0', () => {
    const { g, e } = setup(Direction.DOWN)
    e.getLabels().push(label('U', 'UNDEFINED', { x: 5, y: 3 }))
    e.setProperty(EDGE_THICKNESS, -1)
    processLabelDummyInsert(g)
    const d = g.getLayerlessNodes().filter(n => n.getType() === NodeType.LABEL)[0]!
    expect(d.getProperty(REPRESENTED_LABELS)).toHaveLength(1)
    expect(e.getProperty(EDGE_THICKNESS)).toBe(0)
  })
})

describe('LabelDummyRemover 补充 (joinAt 弯点 + env 分支)', () => {
  function setup(labelSide: string, direction: string) {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    g.setProperty(DIRECTION, direction as Direction)
    g.setProperty(SPACING_EDGE_LABEL, 2)
    g.setProperty(SPACING_LABEL_LABEL, 1)
    const a = new LNode(g)
    const b = new LNode(g)
    const dummy = new LNode(g)
    dummy.setType(NodeType.LABEL)
    dummy.size = { x: 30, y: 10 }
    dummy.position = { x: 10, y: 20 }
    dummy.setLayer(layer)
    a.setLayer(layer)
    b.setLayer(layer)
    const aEast = makePort(a, PortSide.EAST)
    const dWest = makePort(dummy, PortSide.WEST)
    const dEast = makePort(dummy, PortSide.EAST)
    const bWest = makePort(b, PortSide.WEST)
    const inEdge = new LEdge(); inEdge.setSource(aEast); inEdge.setTarget(dWest)
    const outEdge = new LEdge(); outEdge.setSource(dEast); outEdge.setTarget(bWest)
    outEdge.setProperty(EDGE_THICKNESS, 1)
    outEdge.getBendPoints().push({ x: 1, y: 1 }, { x: 2, y: 2 })
    dummy.setProperty(ORIGIN, inEdge)
    dummy.setProperty(LABEL_SIDE, labelSide)
    dummy.setProperty(REPRESENTED_LABELS, [
      { text: 'L1', position: { x: 0, y: 0 }, size: { x: 5, y: 3 } },
    ])
    return { g, layer, dummy, inEdge, outEdge }
  }

  it('joinAt 不追加不必要弯点: 存活边弯点 = 丢弃边弯点 (无 absolute anchor)', () => {
    const { g, inEdge, outEdge } = setup('BELOW', Direction.DOWN)
    processLabelDummyRemoval(g)
    // joinAt(node, false) → 不追加 anchor; 弯点守恒 = 丢弃边的 2 个弯点
    expect(inEdge.getBendPoints()).toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }])
  })

  it('env 未设: 调试日志不输出 (GGN_LDR_DBG/GGN_LDR2 分支)', () => {
    const { g } = setup('BELOW', Direction.DOWN)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      processLabelDummyRemoval(g)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('env 设置: 调试日志输出 (GGN_LDR_DBG 分支 true)', () => {
    const { g } = setup('BELOW', Direction.DOWN)
    vi.stubEnv('GGN_LDR_DBG', '1')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      processLabelDummyRemoval(g)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[LDR]'))
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('env 设置: GGN_LDR2 日志输出', () => {
    const { g } = setup('BELOW', Direction.DOWN)
    vi.stubEnv('GGN_LDR2', '1')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      processLabelDummyRemoval(g)
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('[LDR2]'))
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
