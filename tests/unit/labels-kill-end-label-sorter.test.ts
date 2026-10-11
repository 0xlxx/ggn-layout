/**
 * labels 簇变异补测: labels/end-label-sorter.ts (ELK intermediate.EndLabelSorter).
 * 直接调用 processEndLabelSort, 覆盖守卫分支 / 非 NORMAL 跳过 / >=2 边界 /
 * null edge 组 / 分离端口 (OptionalChaining 防御) / 目标端口倒序.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, NodeType, PortSide } from '../../src/index.js'
import { processEndLabelSort } from '../../src/intermediate/labels/end-label-sorter.js'
import { LabelCell } from '../../src/intermediate/labels/label-cell.js'
import { END_LABELS } from '../../src/options/internal-properties.js'
import { Layer } from '../../src/graph/layer.js'

function makeNode(g: LGraph, layer: Layer, type = NodeType.NORMAL): LNode {
  const n = new LNode(g)
  n.setType(type)
  n.setLayer(layer)
  return n
}
function makePort(n: LNode, side = PortSide.WEST): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  return p
}
function addEdge(src: LPort, tgt: LPort, placement: string): void {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  e.getLabels().push({ text: 'L', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement })
}
function addEntry(cell: LabelCell, edge: LEdge | null, text: string): void {
  cell.addLabel({ text, position: { x: 0, y: 0 }, size: { x: 1, y: 1 } }, edge)
}
function entries(cell: LabelCell): (LEdge | null)[] {
  return cell.getEntries().map(e => e.edge)
}

describe('EndLabelSorter 守卫/遍历', () => {
  it('NORMAL 无 END_LABELS / 非 Map END_LABELS → 早返回不崩', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const a = makeNode(g, layer)
    a.setProperty(END_LABELS, undefined as never)
    const b = makeNode(g, layer)
    b.setProperty(END_LABELS, {} as never)
    processEndLabelSort(g)
    expect(true).toBe(true)
  })

  it('仅 NORMAL 节点参与排序: LABEL 型节点保持原序, NORMAL 型节点排序', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)

    // NORMAL 目标: 2 条 HEAD 边, cell 逆序 → 排序
    const src1 = makeNode(g, layer)
    const s1 = makePort(src1, PortSide.EAST)
    const src2 = makeNode(g, layer)
    const s2 = makePort(src2, PortSide.EAST)
    const tgt = makeNode(g, layer)
    const w = makePort(tgt, PortSide.WEST)
    const e1 = new LEdge(); e1.setSource(s1); e1.setTarget(w); e1.getLabels().push({ text: '1', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const e2 = new LEdge(); e2.setSource(s2); e2.setTarget(w); e2.getLabels().push({ text: '2', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const cell = new LabelCell(1, true)
    addEntry(cell, e2, '2')
    addEntry(cell, e1, '1')
    tgt.setProperty(END_LABELS, new Map([[w, cell]]))

    // LABEL 型节点: 2 条 HEAD 边, cell 逆序 → 不应排序
    const dsrc1 = makeNode(g, layer)
    const ds1 = makePort(dsrc1, PortSide.EAST)
    const dsrc2 = makeNode(g, layer)
    const ds2 = makePort(dsrc2, PortSide.EAST)
    const dnode = makeNode(g, layer, NodeType.LABEL)
    const dw = makePort(dnode, PortSide.WEST)
    const de1 = new LEdge(); de1.setSource(ds1); de1.setTarget(dw); de1.getLabels().push({ text: 'a', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const de2 = new LEdge(); de2.setSource(ds2); de2.setTarget(dw); de2.getLabels().push({ text: 'b', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const dcell = new LabelCell(1, true)
    addEntry(dcell, de2, 'b')
    addEntry(dcell, de1, 'a')
    dnode.setProperty(END_LABELS, new Map([[dw, dcell]]))

    processEndLabelSort(g)

    // NORMAL 排序: 按源端口 id 升序 → e1 先
    expect(entries(cell)).toEqual([e1, e2])
    // LABEL 型节点不排序 → 保持逆序
    expect(entries(dcell)).toEqual([de2, de1])
  })
})

describe('EndLabelSorter 排序语义', () => {
  it('恰好 2 条 HEAD 边 → 排序 (>= 2 边界)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const src1 = makeNode(g, layer); const s1 = makePort(src1, PortSide.EAST)
    const src2 = makeNode(g, layer); const s2 = makePort(src2, PortSide.EAST)
    const tgt = makeNode(g, layer); const w = makePort(tgt, PortSide.WEST)
    const e1 = new LEdge(); e1.setSource(s1); e1.setTarget(w); e1.getLabels().push({ text: '1', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const e2 = new LEdge(); e2.setSource(s2); e2.setTarget(w); e2.getLabels().push({ text: '2', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const cell = new LabelCell(1, true)
    addEntry(cell, e2, '2')
    addEntry(cell, e1, '1')
    tgt.setProperty(END_LABELS, new Map([[w, cell]]))
    processEndLabelSort(g)
    expect(entries(cell)).toEqual([e1, e2])
  })

  it('TAIL 边按目标节点顺序排序', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const src = makeNode(g, layer); const e = makePort(src, PortSide.EAST)
    const t1n = makeNode(g, layer); const t1 = makePort(t1n, PortSide.WEST)
    const t2n = makeNode(g, layer); const t2 = makePort(t2n, PortSide.WEST)
    const e1 = new LEdge(); e1.setSource(e); e1.setTarget(t1); e1.getLabels().push({ text: '1', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'TAIL' })
    const e2 = new LEdge(); e2.setSource(e); e2.setTarget(t2); e2.getLabels().push({ text: '2', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'TAIL' })
    const cell = new LabelCell(1, true)
    addEntry(cell, e2, '2')
    addEntry(cell, e1, '1')
    src.setProperty(END_LABELS, new Map([[e, cell]]))
    processEndLabelSort(g)
    expect(entries(cell)).toEqual([e1, e2])
  })

  it('同目标节点: 目标端口 id 倒序 (t2 先)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const src = makeNode(g, layer); const e = makePort(src, PortSide.EAST)
    const tgt = makeNode(g, layer)
    const t1 = makePort(tgt, PortSide.WEST)
    const t2 = makePort(tgt, PortSide.WEST)
    const e1 = new LEdge(); e1.setSource(e); e1.setTarget(t1); e1.getLabels().push({ text: '1', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'TAIL' })
    const e2 = new LEdge(); e2.setSource(e); e2.setTarget(t2); e2.getLabels().push({ text: '2', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'TAIL' })
    const cell = new LabelCell(1, true)
    addEntry(cell, e1, '1')
    addEntry(cell, e2, '2')
    src.setProperty(END_LABELS, new Map([[e, cell]]))
    processEndLabelSort(g)
    // t2.id > t1.id → 倒序 → e2 先
    expect(entries(cell)).toEqual([e2, e1])
  })

  it('分离目标端口 (node=null) → OptionalChaining 防御 + 目标端口倒序', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const src = makeNode(g, layer); const e = makePort(src, PortSide.EAST)
    const t1 = new LPort() // 未挂节点
    const t2 = new LPort()
    const e1 = new LEdge(); e1.setSource(e); e1.setTarget(t1); e1.getLabels().push({ text: '1', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'TAIL' })
    const e2 = new LEdge(); e2.setSource(e); e2.setTarget(t2); e2.getLabels().push({ text: '2', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'TAIL' })
    const cell = new LabelCell(1, true)
    addEntry(cell, e1, '1')
    addEntry(cell, e2, '2')
    src.setProperty(END_LABELS, new Map([[e, cell]]))
    processEndLabelSort(g)
    // node null → n?.id ?? 0 = 0 两边; t2.id > t1.id → e2 先
    expect(entries(cell)).toEqual([e2, e1])
  })

  it('null edge 条目: 与真实边同 cell, 比较器 null 分支稳定 (不崩)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const src1 = makeNode(g, layer); const s1 = makePort(src1, PortSide.EAST)
    const src2 = makeNode(g, layer); const s2 = makePort(src2, PortSide.EAST)
    const tgt = makeNode(g, layer); const w = makePort(tgt, PortSide.WEST)
    const e1 = new LEdge(); e1.setSource(s1); e1.setTarget(w); e1.getLabels().push({ text: '1', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const e2 = new LEdge(); e2.setSource(s2); e2.setTarget(w); e2.getLabels().push({ text: '2', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const cell = new LabelCell(1, true)
    addEntry(cell, e1, '1')
    addEntry(cell, null, 'NULL')
    addEntry(cell, e2, '2')
    tgt.setProperty(END_LABELS, new Map([[w, cell]]))
    processEndLabelSort(g)
    // e1 源 id 1 < e2 源 id 2 → e1 组先; null 组比较器返回 0, 稳定居中
    expect(entries(cell)).toEqual([e1, null, e2])
  })

  it('需排序端口不在 END_LABELS map (cell undefined) → sort 早返回不崩', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const src1 = makeNode(g, layer); const s1 = makePort(src1, PortSide.EAST)
    const src2 = makeNode(g, layer); const s2 = makePort(src2, PortSide.EAST)
    const tgt = makeNode(g, layer)
    const w = makePort(tgt, PortSide.WEST) // 不在 map 中
    const e1 = new LEdge(); e1.setSource(s1); e1.setTarget(w); e1.getLabels().push({ text: '1', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    const e2 = new LEdge(); e2.setSource(s2); e2.setTarget(w); e2.getLabels().push({ text: '2', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' })
    // END_LABELS 存在但 map 为空
    tgt.setProperty(END_LABELS, new Map())
    processEndLabelSort(g)
    expect(true).toBe(true)
  })
})
