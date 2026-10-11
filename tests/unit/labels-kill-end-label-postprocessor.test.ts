/**
 * labels 簇变异补测: labels/end-label-postprocessor.ts (ELK intermediate.EndLabelPostprocessor).
 * P5 后: 节点最终坐标已知 → label cell 矩形平移世界坐标 + 标签赋最终坐标 + 清除 END_LABELS.
 * 仅 NORMAL / EXTERNAL_PORT 且带 END_LABELS 的节点参与.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, NodeType } from '../../src/index.js'
import { processEndLabelPostprocessing } from '../../src/intermediate/labels/end-label-postprocessor.js'
import { LabelCell } from '../../src/intermediate/labels/label-cell.js'
import { END_LABELS } from '../../src/options/internal-properties.js'
import { Layer } from '../../src/graph/layer.js'

function makeCell(labels: { text: string; size: { x: number; y: number } }[], rect: { x: number; y: number; width: number; height: number }): LabelCell {
  const c = new LabelCell(1, true)
  for (const l of labels) c.addLabel({ ...l, position: { x: 0, y: 0 } }, null)
  c.cellRectangle = { ...rect }
  return c
}

describe('EndLabelPostprocessor (ELK Java 移植)', () => {
  it('NORMAL 节点: cell 矩形平移到世界坐标, 标签赋最终坐标, END_LABELS 清除', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const a = new LNode(g)
    a.setLayer(layer)
    a.position = { x: 10, y: 20 }
    const p = new LPort()
    p.setNode(a)
    const cell = makeCell(
      [{ text: 'L1', size: { x: 5, y: 3 } }, { text: 'L2', size: { x: 4, y: 2 } }],
      { x: 0, y: 0, width: 10, height: 6 },
    )
    const map = new Map<LPort, unknown>([[p, cell]])
    a.setProperty(END_LABELS, map)

    processEndLabelPostprocessing(g)

    // rect 平移: (0,0) + (10,20) = (10,20)
    expect(cell.cellRectangle).toEqual({ x: 10, y: 20, width: 10, height: 6 })
    // vAlign CENTER (默认): yPos = 20 + (6-6)/2 = 20; L1 y=20, x = 10+(10-5)/2 = 12.5; L2 y=24
    const labels = cell.getEntries().map(e => e.label)
    expect(labels[0]!.position).toEqual({ x: 12.5, y: 20 })
    expect(labels[1]!.position).toEqual({ x: 13, y: 24 })
    // END_LABELS 清除
    expect(a.hasProperty(END_LABELS)).toBe(false)
  })

  it('EXTERNAL_PORT 节点同样处理; LABEL/NORMAL 无 END_LABELS 不处理', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)

    const ext = new LNode(g)
    ext.setType(NodeType.EXTERNAL_PORT)
    ext.setLayer(layer)
    ext.position = { x: 5, y: 5 }
    const ep = new LPort()
    ep.setNode(ext)
    const extCell = makeCell([{ text: 'E', size: { x: 6, y: 2 } }], { x: 1, y: 2, width: 8, height: 4 })
    ext.setProperty(END_LABELS, new Map([[ep, extCell]]))

    const labelNode = new LNode(g)
    labelNode.setType(NodeType.LABEL)
    labelNode.setLayer(layer)
    const lp = new LPort()
    lp.setNode(labelNode)
    const labelCell = makeCell([{ text: 'D', size: { x: 3, y: 3 } }], { x: 9, y: 9, width: 3, height: 3 })
    labelNode.setProperty(END_LABELS, new Map([[lp, labelCell]]))

    const plain = new LNode(g)
    plain.setLayer(layer)

    processEndLabelPostprocessing(g)

    // EXTERNAL_PORT: rect (1,2)+(5,5)=(6,7), 清除
    expect(extCell.cellRectangle).toEqual({ x: 6, y: 7, width: 8, height: 4 })
    expect(ext.hasProperty(END_LABELS)).toBe(false)
    // LABEL 类型: 不处理, 保持
    expect(labelCell.cellRectangle).toEqual({ x: 9, y: 9, width: 3, height: 3 })
    expect(labelNode.hasProperty(END_LABELS)).toBe(true)
    // 无 END_LABELS 的 NORMAL: 不崩
    expect(plain.hasProperty(END_LABELS)).toBe(false)
  })

  it('端口标签位置相对 cell 矩形 (hAlign LEFT + vAlign TOP)', () => {
    const g = new LGraph()
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const n = new LNode(g)
    n.setLayer(layer)
    n.position = { x: 100, y: -30 }
    const p = new LPort()
    p.setNode(n)
    const cell = makeCell([{ text: 'X', size: { x: 7, y: 2 } }], { x: 0, y: 0, width: 20, height: 2 })
    // 直接改默认对齐: LEFT/TOP → x=rect.x, y=rect.y
    cell.setVerticalAlignment('TOP' as never)
    cell.setHorizontalAlignment('LEFT' as never)
    n.setProperty(END_LABELS, new Map([[p, cell]]))

    processEndLabelPostprocessing(g)
    expect(cell.cellRectangle).toEqual({ x: 100, y: -30, width: 20, height: 2 })
    expect(cell.getEntries()[0]!.label.position).toEqual({ x: 100, y: -30 })
  })
})
