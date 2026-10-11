/**
 * labels 簇变异补测: labels/end-label-preprocessor.ts (ELK intermediate.EndLabelPreprocessor).
 * gatherLabels 收集 (HEAD 入边/TAIL 出边) + placeLabelsForPort 四侧放置 + N/S 重叠移除 + margin 扩展.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, Direction } from '../../src/index.js'
import { processEndLabelPreprocessing, gatherLabels } from '../../src/intermediate/labels/end-label-preprocessor.js'
import { END_LABELS, MAX_EDGE_THICKNESS } from '../../src/options/internal-properties.js'
import { SPACING_EDGE_LABEL, SPACING_LABEL_LABEL, DIRECTION, EDGE_THICKNESS } from '../../src/options/layered-options.js'
import { Layer } from '../../src/graph/layer.js'

function makeNode(g: LGraph, layer: Layer | null): LNode {
  const n = new LNode(g)
  n.size = { x: 100, y: 100 }
  if (layer) n.setLayer(layer)
  return n
}
function makePort(n: LNode, side: PortSide, x: number, y: number): LPort {
  const p = new LPort()
  p.setNode(n)
  p.size = { x: 8, y: 8 }
  p.setSide(side)
  p.getPosition().x = x
  p.getPosition().y = y
  return p
}
function headEdge(g: LGraph, tgt: LPort, text = 'H', size = { x: 10, y: 4 }): LEdge {
  const src = makeNode(g, null)
  const sp = makePort(src, PortSide.EAST, 0, 0)
  const e = new LEdge()
  e.setSource(sp)
  e.setTarget(tgt)
  e.setProperty(EDGE_THICKNESS, 1)
  e.getLabels().push({ text, position: { x: 0, y: 0 }, size, placement: 'HEAD' })
  return e
}
function tailEdge(g: LGraph, src: LPort, text = 'T', size = { x: 10, y: 4 }): LEdge {
  const tgt = makeNode(g, null)
  const tp = makePort(tgt, PortSide.WEST, 0, 0)
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tp)
  e.setProperty(EDGE_THICKNESS, 1)
  e.getLabels().push({ text, position: { x: 0, y: 0 }, size, placement: 'TAIL' })
  return e
}

describe('gatherLabels (端标签收集)', () => {
  it('入边 HEAD + 出边 TAIL → 全部收集, maxEdgeThickness = max', () => {
    const g = new LGraph()
    const n = makeNode(g, null)
    const w = makePort(n, PortSide.WEST, 0, 0)
    const e1 = headEdge(g, w)
    const e2 = tailEdge(g, w)
    e2.setProperty(EDGE_THICKNESS, 3)
    const entries = gatherLabels(w)
    expect(entries).not.toBeNull()
    expect(entries!.map(en => en.label.text).sort()).toEqual(['H', 'T'])
    expect(w.getProperty(MAX_EDGE_THICKNESS)).toBe(3)
  })

  it('仅 CENTER 标签 → null; 无边 → null', () => {
    const g = new LGraph()
    const n = makeNode(g, null)
    const w = makePort(n, PortSide.WEST, 0, 0)
    const e = new LEdge()
    const sp = makePort(makeNode(g, null), PortSide.EAST, 0, 0)
    e.setSource(sp)
    e.setTarget(w)
    e.getLabels().push({ text: 'C', position: { x: 0, y: 0 }, size: { x: 5, y: 3 }, placement: 'CENTER' })
    // 有 incident edge → 返回空数组 (maxEdgeThickness != -1), 不设 MAX_EDGE_THICKNESS
    expect(gatherLabels(w)).toEqual([])
    expect(w.hasProperty(MAX_EDGE_THICKNESS)).toBe(false)
    const w2 = makePort(n, PortSide.EAST, 0, 0)
    expect(gatherLabels(w2)).toBeNull()
  })
})

describe('processEndLabelPreprocessing 四侧放置 + margin', () => {
  function run(portSide: PortSide, direction: string): { g: LGraph; n: LNode; p: LPort; cell: unknown } {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    g.setProperty(DIRECTION, direction as Direction)
    g.setProperty(SPACING_EDGE_LABEL, 2)
    g.setProperty(SPACING_LABEL_LABEL, 1)
    const n = makeNode(g, layer)
    const p = makePort(n, portSide, portSide === PortSide.WEST ? 0 : portSide === PortSide.EAST ? 100 : 50, portSide === PortSide.NORTH ? 0 : portSide === PortSide.SOUTH ? 100 : 50)
    if (portSide === PortSide.WEST || portSide === PortSide.SOUTH || portSide === PortSide.NORTH) headEdge(g, p)
    else tailEdge(g, p)
    processEndLabelPreprocessing(g)
    const map = n.getProperty(END_LABELS) as Map<LPort, unknown>
    return { g, n, p, cell: map?.get(p) }
  }

  it('WEST 端口: cell 左侧 + 顶部对齐, margin.left 扩展', () => {
    const { n, cell } = run(PortSide.WEST, Direction.RIGHT)
    const c = cell as { cellRectangle: { x: number; y: number; width: number; height: number } }
    // width=10, height=4; x = -0 - 2 - 10 = -12; y = anchor(0,54) + 1 + 2 = 57
    expect(c.cellRectangle).toEqual({ x: -12, y: 57, width: 10, height: 4 })
    expect(n.getMargin().left).toBe(12)
    expect(n.getMargin().top).toBe(0)
    expect(n.getMargin().right).toBe(0)
    expect(n.getMargin().bottom).toBe(0)
  })

  it('EAST 端口: cell 右侧 + 顶部对齐, margin.right 扩展', () => {
    const { n, cell } = run(PortSide.EAST, Direction.RIGHT)
    const c = cell as { cellRectangle: { x: number; y: number; width: number; height: number } }
    // x = 100 + 0 + 2 = 102; y = anchor(100,54) + 1 + 2 = 57
    expect(c.cellRectangle).toEqual({ x: 102, y: 57, width: 10, height: 4 })
    expect(n.getMargin().right).toBe(12)
  })

  it('NORTH 端口: cell 上方 + 左侧对齐, margin.top 扩展', () => {
    const { n, cell } = run(PortSide.NORTH, Direction.RIGHT)
    const c = cell as { cellRectangle: { x: number; y: number; width: number; height: number } }
    // y = -0 - 2 - 4 = -6; x = anchor(54,0) + 1 + 2 = 57
    expect(c.cellRectangle).toEqual({ x: 57, y: -6, width: 10, height: 4 })
    expect(n.getMargin().top).toBe(6)
  })

  it('SOUTH 端口: cell 下方 + 左侧对齐, margin.bottom 扩展', () => {
    const { n, cell } = run(PortSide.SOUTH, Direction.RIGHT)
    const c = cell as { cellRectangle: { x: number; y: number; width: number; height: number } }
    // y = 100 + 0 + 2 = 102; x = anchor(54,100) + 1 + 2 = 57
    expect(c.cellRectangle).toEqual({ x: 57, y: 102, width: 10, height: 4 })
    expect(n.getMargin().bottom).toBe(6)
  })

  it('无端标签节点 → 不设 END_LABELS', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    g.setProperty(DIRECTION, Direction.RIGHT)
    const n = makeNode(g, layer)
    makePort(n, PortSide.WEST, 0, 50)
    processEndLabelPreprocessing(g)
    expect(n.hasProperty(END_LABELS)).toBe(false)
  })
})

describe('processEndLabelPreprocessing N/S 重叠移除', () => {
  it('2 个 NORTH 端口标签重叠 → 上方推开 (start = -margin - edgeLabelSpacing)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    g.setProperty(DIRECTION, Direction.RIGHT)
    g.setProperty(SPACING_EDGE_LABEL, 2)
    g.setProperty(SPACING_LABEL_LABEL, 1)
    const n = makeNode(g, layer)
    const p1 = makePort(n, PortSide.NORTH, 20, 0)
    const p2 = makePort(n, PortSide.NORTH, 25, 0)
    headEdge(g, p1, 'A', { x: 10, y: 4 })
    headEdge(g, p2, 'B', { x: 10, y: 4 })
    processEndLabelPreprocessing(g)
    const map = n.getProperty(END_LABELS) as Map<LPort, unknown>
    const c1 = (map.get(p1) as { cellRectangle: { x: number; y: number } }).cellRectangle
    const c2 = (map.get(p2) as { cellRectangle: { x: number; y: number } }).cellRectangle
    // 初始 y=-6 重叠 → p2 被推到 y=-12 (UP: start - h - yPos, gap=2*labelLabel=2)
    expect(c1.y).toBe(-6)
    expect(c2.y).toBe(-12) // gap = 2*labelLabelSpacing
    // margin.top = 11 (最上 cell 顶)
    expect(n.getMargin().top).toBe(12)
  })
})
