/**
 * cell 系统布局/端口放置/端口标签 — 直接单测 (T5-H cell 变异批次补测).
 *
 * 被测: src/intermediate/cell-system.ts
 *    computeCellSystemSize (尺寸) / layoutNodeCells (cell 矩形) /
 *    placeNodePorts (端口坐标) / placePortLabels (端口标签坐标, 相对端口).
 * 对照权威: ELK 0.12.0 NodeLabelAndSizeCalculator / PortPlacementCalculator /
 *           PortLabelPlacementCalculator (本文件 1:1 移植语义).
 * 不变量: Strip/Grid 对称布局 / DISTRIBUTED 2*portPort / BEGIN/CENTER/END/JUSTIFIED 偏移 /
 *         WEST/SOUTH 逆序放置 / OUTSIDE 首尾 margin 归零 / UNIFORM 统一 margin /
 *         FIXED 标签 bounds 进 padding/margin / INSIDE 标签 areaHeight 与 cell 宽 /
 *         labelsNextToPort 居中 / treatAsGroup 用整组高 / 多标签 gap 堆叠.
 */
import { describe, it, expect } from 'vitest'
import { LGraph, LNode, LPort, PortSide } from '../../src/index.js'
import {
  computeCellSystemSize, layoutNodeCells, placeNodePorts, placePortLabels,
} from '../../src/intermediate/cell-system.js'
import {
  NODE_SIZE_CONSTRAINTS, PORT_CONSTRAINTS, PORT_LABELS_PLACEMENT, SPACING_PORT_PORT,
  PORT_BORDER_OFFSET, NODE_SIZE_OPTIONS, PORT_ALIGNMENT_NORTH, PORT_ALIGNMENT_SOUTH,
  PORT_ALIGNMENT_EAST, PORT_ALIGNMENT_WEST, SPACING_LABEL_LABEL, SPACING_LABEL_PORT_HORIZONTAL,
  SPACING_LABEL_PORT_VERTICAL, SPACING_PORTS_SURROUNDING,
} from '../../src/options/layered-options.js'

interface PortSpec {
  side: PortSide
  w?: number
  h?: number
  borderOffset?: number
  labels?: { text: string; w: number; h: number; x: number; y: number }[]
}

function makeNode(opts: {
  size?: { x: number; y: number }
  constraints?: string[]
  portConstraints?: string
  portLabels?: string[]
  portPort?: number
  sizeOptions?: string[]
  ports?: PortSpec[]
  nodeLabels?: { text: string; w: number; h: number; placement?: string }[]
  align?: { north?: string; south?: string; east?: string; west?: string }
  surrounding?: { top: number; left: number; bottom: number; right: number }
  labelLabel?: number
  labelPortH?: number
  labelPortV?: number
  nested?: boolean
  treatAsGroup?: boolean
}): { graph: LGraph; node: LNode } {
  const graph = new LGraph()
  const node = new LNode(graph)
  node.size = opts.size ?? { x: 100, y: 50 }
  if (opts.constraints) node.setProperty(NODE_SIZE_CONSTRAINTS, opts.constraints)
  if (opts.portConstraints) node.setProperty(PORT_CONSTRAINTS, opts.portConstraints)
  if (opts.portLabels) node.setProperty(PORT_LABELS_PLACEMENT, opts.portLabels)
  if (opts.portPort !== undefined) graph.setProperty(SPACING_PORT_PORT, opts.portPort)
  if (opts.sizeOptions) node.setProperty(NODE_SIZE_OPTIONS, opts.sizeOptions)
  if (opts.surrounding) graph.setProperty(SPACING_PORTS_SURROUNDING, opts.surrounding)
  if (opts.labelLabel !== undefined) graph.setProperty(SPACING_LABEL_LABEL, opts.labelLabel)
  if (opts.labelPortH !== undefined) graph.setProperty(SPACING_LABEL_PORT_HORIZONTAL, opts.labelPortH)
  if (opts.labelPortV !== undefined) graph.setProperty(SPACING_LABEL_PORT_VERTICAL, opts.labelPortV)
  if (opts.align) {
    if (opts.align.north) node.setProperty(PORT_ALIGNMENT_NORTH, opts.align.north)
    if (opts.align.south) node.setProperty(PORT_ALIGNMENT_SOUTH, opts.align.south)
    if (opts.align.east) node.setProperty(PORT_ALIGNMENT_EAST, opts.align.east)
    if (opts.align.west) node.setProperty(PORT_ALIGNMENT_WEST, opts.align.west)
  }
  for (const p of opts.ports ?? []) {
    const port = new LPort()
    port.setNode(node)
    port.setSide(p.side)
    port.size = { x: p.w ?? 8, y: p.h ?? 8 }
    if (p.borderOffset !== undefined) port.setProperty(PORT_BORDER_OFFSET, p.borderOffset)
    if (p.labels) port.setLabels(p.labels.map(l => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.w, y: l.h } })))
  }
  for (const l of opts.nodeLabels ?? []) {
    const label: any = { text: l.text, position: { x: 0, y: 0 }, size: { x: l.w, y: l.h } }
    if (l.placement) label.placement = l.placement
    node.setLabels([...node.getLabels(), label])
  }
  if (opts.nested) node.setNestedGraph(new LGraph())
  if (opts.treatAsGroup) node.setProperty('org.eclipse.elk.portLabels.treatAsGroup', true)
  return { graph, node }
}

const N = PortSide.NORTH, S = PortSide.SOUTH, E = PortSide.EAST, W = PortSide.WEST
const pos = (node: LNode) => node.getPorts().map(p => ({ x: p.getPosition().x, y: p.getPosition().y }))
const lpos = (node: LNode) => node.getPorts().map(p => p.getLabels().map(l => ({ x: l.position.x, y: l.position.y })))

describe('layoutNodeCells — Strip/Grid 布局矩形 (Java layoutChildren*)', () => {
  it('单 NORTH 端口: N/S cell 矩形 + 中间行填充剩余空间 + available 偏移', () => {
    const { node, graph } = makeNode({ constraints: ['PORTS'], portPort: 10, ports: [{ side: N, w: 20, h: 8 }] })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 40, y: 0 })
    const layout = layoutNodeCells(node, graph, 100, 50)
    // rawHeightOf: AtomicCell content.y===0 → 0 (即使 padding=1) — N/S 矩形高 0
    expect(layout.inside[N]).toEqual({ x: 0, y: 0, width: 100, height: 0 })
    expect(layout.inside[S]).toEqual({ x: 0, y: 50, width: 100, height: 0 })
    expect(layout.inside[E]).toEqual({ x: 100, y: 0, width: 0, height: 50 })
    expect(layout.inside[W]).toEqual({ x: 0, y: 0, width: 0, height: 50 })
    expect(layout.middleRow).toEqual({ x: 0, y: 0, width: 100, height: 50 })
    expect(layout.available[N]).toEqual({ top: 1, left: 0 }) // portLabelSpacingV 进 N cell padding.top
    expect(layout.available[S]).toEqual({ top: 50, left: 0 })
  })

  it('N+S 端口 (有高): 对称后 N/S cell 高度 1/1, 中间行被压缩', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: S, w: 20, h: 8 },
      ],
    })
    // N cell content.y = 10 (INSIDE 标签 areaHeight) → minH 11; S cell minH 1; 对称 → 11/11
    const layout = layoutNodeCells(node, graph, 100, 50)
    expect(layout.inside[N].height).toBe(11)
    expect(layout.inside[S].height).toBe(11)
    expect(layout.inside[N].y).toBe(0)
    expect(layout.inside[S].y).toBe(39)
    expect(layout.middleRow.y).toBe(11)
    expect(layout.middleRow.height).toBe(28)
    expect(layout.available[N]).toEqual({ top: 1, left: 0 }) // rect.y(0)+padding.top(1)
  })

  it('W/E 端口 INSIDE 标签: 中间行横向对称 (eCell 31 + 对称 wCell 31)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [
        { side: W, w: 8, h: 12 },
        { side: E, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 62, y: 32 })
    const layout = layoutNodeCells(node, graph, 100, 50)
    // rawWidthOf(eCell)=31 → 对称 ws[0]=31 → W rect 宽 31; E rect x = 100-0-31 = 69
    expect(layout.inside[E]).toEqual({ x: 69, y: 0, width: 31, height: 50 })
    expect(layout.inside[W]).toEqual({ x: 0, y: 0, width: 31, height: 50 })
    expect(layout.middleRow).toEqual({ x: 0, y: 0, width: 100, height: 50 })
  })
})

describe('placeNodePorts — FREE 端口放置 (PortPlacementCalculator)', () => {
  it('单 NORTH DISTRIBUTED → CENTER + modifiedPortPlacementSize (计算值减 2*portPort)', () => {
    const { node, graph } = makeNode({ constraints: ['PORTS'], portPort: 10, ports: [{ side: N, w: 20, h: 8 }] })
    placeNodePorts(node, graph, 100, 50)
    expect(pos(node)).toEqual([{ x: 40, y: -8 }])
  })
  it('单 NORTH JUSTIFIED → 同样 CENTER + modifiedPortPlacementSize', () => {
    const { node, graph } = makeNode({ constraints: ['PORTS'], portPort: 10, align: { north: 'JUSTIFIED' }, ports: [{ side: N, w: 20, h: 8 }] })
    placeNodePorts(node, graph, 100, 50)
    expect(pos(node)).toEqual([{ x: 40, y: -8 }])
  })

  it.each([
    ['BEGIN', [0, 30]],
    ['CENTER', [25, 55]],
    ['END', [50, 80]],
    ['JUSTIFIED', [0, 80]],
  ] as [string, number[]][])('2 NORTH 端口 %s 对齐精确偏移', (align, expected) => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, align: { north: align },
      ports: [{ side: N, w: 20, h: 8 }, { side: N, w: 20, h: 8 }],
    })
    placeNodePorts(node, graph, 100, 50)
    expect(pos(node).map(p => p.x)).toEqual(expected)
  })

  it('4 NORTH DISTRIBUTED available<calculated → spaceBetween += (available-calculated)/(n+1)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10,
      ports: [1, 2, 3, 4].map(() => ({ side: N as PortSide, w: 20, h: 8 })),
    })
    placeNodePorts(node, graph, 100, 50)
    // calculated=130 > available=100 → spaceBetween=10-6=4, currentPos 从 4 起
    expect(pos(node).map(p => p.x)).toEqual([4, 28, 52, 76])
  })

  it('4 NORTH BEGIN 空间不足: 仅压缩 spaceBetween (首端口仍贴左缘)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, align: { north: 'BEGIN' },
      ports: [1, 2, 3, 4].map(() => ({ side: N as PortSide, w: 20, h: 8 })),
    })
    placeNodePorts(node, graph, 100, 50)
    const xs = pos(node).map(p => p.x)
    expect(xs[0]).toBe(0)
    expect(xs[1]).toBeCloseTo(26.6667, 3)
    expect(xs[3]).toBeCloseTo(80, 3)
  })

  it('PORTS_OVERHANG: 空间不足时允许越界 (CENTER + modified)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, sizeOptions: ['PORTS_OVERHANG'],
      ports: [1, 2, 3, 4].map(() => ({ side: N as PortSide, w: 20, h: 8 })),
    })
    placeNodePorts(node, graph, 100, 50)
    expect(pos(node).map(p => p.x)).toEqual([-5, 25, 55, 85])
  })

  it('WEST 端口逆序放置 (数组末端口在顶部), x 恒在节点左外', () => {
    const { node, graph } = makeNode({ constraints: ['PORTS'], portPort: 5, ports: [{ side: W, w: 8, h: 12 }, { side: W, w: 8, h: 12 }] })
    placeNodePorts(node, graph, 100, 50)
    const [p1, p2] = pos(node)
    expect(p1.x).toBe(-8); expect(p2.x).toBe(-8)
    expect(p1.y).toBeCloseTo(29.3333, 3) // 后放置 (数组首) 在底部
    expect(p2.y).toBeCloseTo(8.6667, 3)  // 前放置 (数组末) 在顶部
  })

  it('SOUTH 端口逆序放置 (数组末端口在左), y 由调用方加节点高 (此处 0)', () => {
    const { node, graph } = makeNode({ constraints: ['PORTS'], portPort: 10, ports: [{ side: S, w: 20, h: 8 }, { side: S, w: 20, h: 8 }] })
    placeNodePorts(node, graph, 100, 50)
    const [p1, p2] = pos(node)
    expect(p1.x).toBe(60) // 后放置 (数组首) 在右
    expect(p2.x).toBe(20) // 前放置 (数组末) 在左
    expect(p1.y).toBe(0); expect(p2.y).toBe(0)
  })

  it('EAST 2 端口 DISTRIBUTED: y 依次 = 10/30, x = width', () => {
    const { node, graph } = makeNode({ constraints: ['PORTS'], portPort: 6, ports: [{ side: E, w: 8, h: 10 }, { side: E, w: 8, h: 10 }] })
    placeNodePorts(node, graph, 100, 50)
    expect(pos(node)).toEqual([{ x: 100, y: 10 }, { x: 100, y: 30 }])
  })

  it('NORTH 端口 OUTSIDE 标签 margin 推进后续端口', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'L', w: 40, h: 10, x: 0, y: 0 }] },
        { side: N, w: 20, h: 8 },
      ],
    })
    placeNodePorts(node, graph, 100, 50)
    const xs = pos(node).map(p => p.x)
    expect(xs[0]).toBeCloseTo(6.3333, 3)
    expect(xs[1]).toBeCloseTo(73.6667, 3)
  })

  it('surrounding (ports.surrounding) 作为 N/S cell padding 计入 available', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, surrounding: { top: 0, left: 10, bottom: 0, right: 10 },
      ports: [{ side: N, w: 20, h: 8 }],
    })
    placeNodePorts(node, graph, 100, 50)
    // available = 100-20 = 80 → DISTRIBUTED add=(80-40)/2=20 → spaceBetween=30, currentPos=10+30=40
    expect(pos(node)).toEqual([{ x: 40, y: -8 }])
  })

  it('borderOffset 影响 N/S 的 y 与 E/W 的 x', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10,
      ports: [
        { side: N, w: 20, h: 8, borderOffset: 3 },
        { side: E, w: 8, h: 12, borderOffset: 4 },
      ],
    })
    placeNodePorts(node, graph, 100, 50)
    const [n, e] = pos(node)
    expect(n.y).toBe(-8 - 3)
    expect(e.x).toBe(100 + 4)
  })
})

describe('placePortLabels — INSIDE 端口标签 (PortLabelPlacementCalculator simple)', () => {
  it('INSIDE 扁平节点 NORTH: 标签居中于端口 + 相对端口 y=portSize.y+spacingV+pad', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [{ side: N, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -5, y: 9 }]])
  })

  it('INSIDE compound 节点 (labelsNextToPort=false): NORTH 标签在端口右侧', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'], nested: true,
      ports: [{ side: N, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: 21, y: 9 }]])
  })

  it('INSIDE SOUTH: y = -spacingV - pad - rect.height', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [{ side: S, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -5, y: -11 }]])
  })

  it('INSIDE WEST: 标签在端口右侧 (x=portSize.x+pad), y 居中', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [{ side: W, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: 9, y: 1 }]])
  })

  it('INSIDE EAST 多标签 (labelLabel=3 → gap=6): 堆叠 y + 右对齐 x (宽度不同→右对齐偏移)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'], labelLabel: 3,
      ports: [{ side: E, w: 8, h: 12, labels: [{ text: 'A', w: 40, h: 10, x: 0, y: 0 }, { text: 'B', w: 20, h: 14, x: 0, y: 10 }] }],
    })
    // rect.width=40, rect.x=-41; 右对齐: A x=-41, B x=-21; y 堆叠 1/17
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -41, y: 1 }, { x: -21, y: 17 }]])
  })

  it('INSIDE NORTH 多标签不同宽: CENTER 偏移按各自宽度', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'], labelLabel: 3,
      ports: [{ side: N, w: 20, h: 8, labels: [{ text: 'A', w: 40, h: 10, x: 0, y: 0 }, { text: 'B', w: 20, h: 14, x: 0, y: 10 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -10, y: 9 }, { x: 0, y: 25 }]])
  })

  it('INSIDE WEST 多标签不同宽: LEFT 对齐 (padding.left=0)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'], labelLabel: 3,
      ports: [{ side: W, w: 8, h: 12, labels: [{ text: 'A', w: 40, h: 10, x: 0, y: 0 }, { text: 'B', w: 20, h: 14, x: 0, y: 10 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: 9, y: 1 }, { x: 9, y: 17 }]])
  })

  it('INSIDE SOUTH borderOffset=-3: labelBorderOffset 用 pad.bottom (SOUTH 分支)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [{ side: S, w: 20, h: 8, borderOffset: -3, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    // pad.bottom=3 → labelBorderOffset=4 → rect.y = 3-4-10 = -11 (若误入 EAST 分支则 -8)
    expect(lpos(node)).toEqual([[{ x: -5, y: -11 }]])
  })
})

describe('placePortLabels — OUTSIDE 端口标签', () => {
  it('2 NORTH 端口: 首标签放左侧 (placeFirstPortDifferently), 其余在端口右侧', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: N, w: 20, h: 8, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -31, y: -11 }], [{ x: 21, y: -11 }]])
  })

  it('3 端口无 SPACE_EFFICIENT: 全部放右侧; SPACE_EFFICIENT 时仅首个放左侧', () => {
    const mk = (extra: string[]) => makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', ...extra],
      ports: [1, 2, 3].map(i => ({ side: N as PortSide, w: 20, h: 8, labels: [{ text: `L${i}`, w: 30, h: 10, x: 0, y: 0 }] })),
    })
    const a = mk([])
    placePortLabels(a.node, a.graph)
    expect(lpos(a.node).map(p => p[0]!.x)).toEqual([21, 21, 21])
    const b = mk(['SPACE_EFFICIENT'])
    placePortLabels(b.node, b.graph)
    expect(lpos(b.node).map(p => p[0]!.x)).toEqual([-31, 21, 21])
  })

  it('ALWAYS_SAME_SIDE: 2 端口标签都放右侧', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'ALWAYS_SAME_SIDE'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: N, w: 20, h: 8, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: 21, y: -11 }], [{ x: 21, y: -11 }]])
  })

  it('ALWAYS_OTHER_SAME_SIDE: 2 端口标签都放左侧 (alwaysAbove)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'ALWAYS_OTHER_SAME_SIDE'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: N, w: 20, h: 8, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -31, y: -11 }], [{ x: -31, y: -11 }]])
  })

  it('NEXT_TO_PORT_IF_POSSIBLE: EAST 无连接端口标签居中', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'],
      ports: [{ side: E, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: 9, y: 1 }]])
  })

  it('NEXT_TO_PORT_IF_POSSIBLE: SOUTH 无连接端口标签居中于端口下方', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'],
      ports: [{ side: S, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -5, y: 9 }]])
  })

  it('treatAsGroup + NEXT_TO_PORT: 整组高居中 (rect.height 而非首标签高)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'], treatAsGroup: true,
      ports: [{ side: E, w: 8, h: 12, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }, { text: 'B', w: 30, h: 14, x: 0, y: 10 }] }],
    })
    placePortLabels(node, graph)
    // 整组高 = 24 → rect.y = (12-24)/2 = -6; 非 group 则 rect.y = 1 → y=1/11
    expect(lpos(node)).toEqual([[{ x: 9, y: -6 }, { x: 9, y: 4 }]])
  })

  it('OUTSIDE NEXT_TO_PORT_IF_POSSIBLE: NORTH 无连接端口标签居中', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'],
      ports: [{ side: N, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -5, y: -11 }]])
  })

  it('OUTSIDE 2 SOUTH 端口: 首标签左移, 其余在右侧 (y 在端口下方)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE'],
      ports: [
        { side: S, w: 20, h: 8, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: S, w: 20, h: 8, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -31, y: 9 }], [{ x: 21, y: 9 }]])
  })

  it('OUTSIDE 2 WEST 端口: 首标签上方 (BOTTOM), 其余下方 (TOP)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE'],
      ports: [
        { side: W, w: 8, h: 12, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: W, w: 8, h: 12, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: -31, y: -11 }], [{ x: -31, y: 13 }]])
  })

  it('OUTSIDE 2 EAST 端口: 首标签上方 (BOTTOM), 其余下方 (TOP)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE'],
      ports: [
        { side: E, w: 8, h: 12, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: E, w: 8, h: 12, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: 9, y: -11 }], [{ x: 9, y: 13 }]])
  })

  it('FIXED placement ([]) → placePortLabels 不移动标签', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: [],
      ports: [{ side: N, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 10, x: 5, y: 5 }] }],
    })
    placePortLabels(node, graph)
    expect(lpos(node)).toEqual([[{ x: 5, y: 5 }]])
  })
})

describe('computeCellSystemSize — FIXED 标签 bounds (setupNodePaddingForPortsWithOffset/setupPortMargins)', () => {
  it('FIXED N 标签伸入节点内 (insidePart) → nodeContainer pad.top/bottom 对称计入高度', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: [],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 20, x: 0, y: -6 }] },
        { side: E, w: 8, h: 12 },
      ],
    })
    // insidePart = 20-6-8 = 6 → pad.top=6, 对称 pad.bottom=6; E 高 32 → 32+12=44
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 50, y: 44 })
  })

  it('FIXED S 标签伸入节点内 → pad.bottom/top 对称', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: [],
      ports: [
        { side: S, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 20, x: 0, y: -6 }] },
        { side: E, w: 8, h: 12 },
      ],
    })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 50, y: 44 })
  })

  it('FIXED E 标签伸入节点内 (b.x<0) → pad.left/right 对称计入宽度', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: [],
      ports: [
        { side: N, w: 20, h: 8 },
        { side: E, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: -5, y: 0 }] },
      ],
    })
    // insidePart = 5 → pad.right=5, 对称 pad.left=5; N 宽 40 → 40+10=50
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 50, y: 32 })
  })

  it('FIXED W 标签伸入节点内 (b.w+b.x > size.x) → pad 计入宽度', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: [],
      ports: [
        { side: N, w: 20, h: 8 },
        { side: W, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: -6, y: 0 }] },
      ],
    })
    // insidePart = 30-6-8 = 16 → pad.left=16, 对称 pad.right=16; N 宽 40 → 40+32=72
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 72, y: 32 })
  })

  it('FIXED E 标签 margin: 上超 (b.y<0) + 下超 (b.y+b.h>size.y) 分别计入', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: [],
      ports: [{ side: E, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 8 }] }],
    })
    // margin.bottom = 8+10-12 = 6 → content.y = 12+6+20 = 38
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 38 })
  })

  it('FIXED E 标签上超 (b.y<0) → margin.top 计入', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: [],
      ports: [{ side: E, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: -2 }] }],
    })
    // margin.top = 2 → content.y = 2+12+0+20 = 34
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 34 })
  })
})

describe('computeCellSystemSize — INSIDE 端口标签与 margin', () => {
  it('INSIDE E 标签: cell 宽 = maxW + spacingH (对称网格翻倍)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [{ side: E, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    // eCell.content.x = 30, padding.right = 1 → 31; 对称 → 31+31 = 62; 高 = 12+20 = 32
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 62, y: 32 })
  })

  it('INSIDE W 标签: cell 宽 = maxW + spacingH (padding.left 分支)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [{ side: W, w: 8, h: 12, labels: [{ text: 'L', w: 30, h: 10, x: 0, y: 0 }] }],
    })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 62, y: 32 })
  })

  it('INSIDE N 标签: N cell content.y = max 标签高, 对称使节点增高', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['INSIDE'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: N, w: 20, h: 8, labels: [{ text: 'B', w: 30, h: 14, x: 0, y: 0 }] },
      ],
    })
    // N cell content.x = 30+30+10+20 = 90 (INSIDE 标签 margin 居中 o=5); content.y = 14
    // → N minH 15, S 1 → 对称 15+15 = 30
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 90, y: 30 })
  })

  it('OUTSIDE N 2 端口标签: 首尾 margin 归零, 其余保留 spacingH+宽', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: N, w: 20, h: 8, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    // (0+20+31) + 10 + (0+20+0) + 20 = 101
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 101, y: 0 })
  })

  it('OUTSIDE E 2 端口标签: margin.bottom 保留 (last 归零)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE'],
      ports: [
        { side: E, w: 8, h: 12, labels: [{ text: 'A', w: 30, h: 10, x: 0, y: 0 }] },
        { side: E, w: 8, h: 12, labels: [{ text: 'B', w: 30, h: 10, x: 0, y: 0 }] },
      ],
    })
    // (0+12+11) + 10 + (0+12+0) + 20 = 65
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 65 })
  })

  it('OUTSIDE NEXT_TO_PORT 高标签: 居中 margin (o=(lh-ph)/2) 对称计入', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'],
      ports: [
        { side: E, w: 8, h: 12, labels: [{ text: 'A', w: 30, h: 30, x: 0, y: 0 }] },
        { side: E, w: 8, h: 12, labels: [{ text: 'B', w: 30, h: 30, x: 0, y: 0 }] },
      ],
    })
    // o=(30-12)/2=9 → first top=0/bottom=9, last top=9/bottom=0 → (0+12+9)+10+(9+12+0)+20 = 72
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 72 })
  })

  it('UNIFORM_PORT_SPACING + labelsNextToPort: margin 统一后 OUTSIDE 首尾再归零', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'], portPort: 10, portLabels: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'],
      sizeOptions: ['UNIFORM_PORT_SPACING'],
      ports: [
        { side: N, w: 20, h: 8, labels: [{ text: 'A', w: 40, h: 10, x: 0, y: 0 }] },
        { side: N, w: 20, h: 8 },
      ],
    })
    // port1 L=10/R=10 → uniform 两端口 R=10 → outside 归零 → (0+20+10)+10+(0+20+0)+20 = 80
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 80, y: 0 })
  })
})

describe('computeCellSystemSize — 约束/选项边界 (Java 语义)', () => {
  it('FIXED_POSITION 字符串约束: free=false (E/W 不贡献高度), 有端口也不增高', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portConstraints: 'FIXED_POSITION', portPort: 5,
      ports: [{ side: W, w: 8, h: 12 }],
    })
    graph.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, bottom: 10, right: 0 })
    // free=false → eCell 不贡献高 → 0; 若 free 误判 true → 42
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 0 })
  })

  it('FIXED_RATIO 字符串约束: free=false, E/W cell content 不参与尺寸', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portConstraints: 'FIXED_RATIO', portPort: 5,
      ports: [{ side: W, w: 8, h: 12 }],
    })
    graph.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, bottom: 10, right: 0 })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 0 })
  })

  it('负 portLabelSpacingV: N/S 空端口不设 padding (portLabelSpacingV>=0 守卫)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, labelPortV: -1,
      ports: [{ side: E, w: 8, h: 12 }],
    })
    // E 高 = 12+20 = 32 (DISTRIBUTED); N/S padding 0 → 不再因 spacingV 增高
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 32 })
  })

  it('UNIFORM_PORT_SPACING 无标签端口: 尺寸与普通一致', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, sizeOptions: ['UNIFORM_PORT_SPACING'],
      ports: [{ side: N, w: 20, h: 8 }, { side: N, w: 20, h: 8 }],
    })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 70, y: 0 })
  })

  it('treatAsGroup 属性读取 (true) 不改变尺寸计算 (影响标签放置, 见 placePortLabels)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, treatAsGroup: true,
      ports: [{ side: N, w: 20, h: 8 }],
    })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 40, y: 0 })
  })

  it('nestedGraph → treatAsCompoundNode=true, 尺寸不受影响 (端口约束默认 UNDEFINED)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 10, nested: true,
      ports: [{ side: N, w: 20, h: 8 }],
    })
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 40, y: 0 })
  })
})

describe('computeCellSystemSize — 网格 gap 与 OUTSIDE 节点标签路由', () => {
  it('H_PRIORITY + H_LEFT + V_TOP OUTSIDE → W 容器 (VERTICAL strip 贡献高)', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [{ text: 'L', w: 80, h: 12, placement: '[H_LEFT, V_TOP, OUTSIDE, H_PRIORITY]' }],
    })
    // W 容器高 12 (无 labelNode 间距参与高) → {0, 12}; 若误入 N 容器则 {160, 0}
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 0, y: 12 })
  })

  it('grid gap (labelCellSpacing = 2*labelLabel) 在多活动行之间插入', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'], labelLabel: 2,
      nodeLabels: [
        { text: 'A', w: 30, h: 10, placement: '[H_CENTER, V_TOP, INSIDE]' },
        { text: 'B', w: 30, h: 10, placement: '[H_CENTER, V_BOTTOM, INSIDE]' },
      ],
    })
    // 对称 10/10 + gap 4 + padding 10 = 34
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 40, y: 34 })
  })

  it('OUTSIDE H_LEFT/H_RIGHT 无 H_PRIORITY 且 V_TOP → N 容器 (对称翻倍宽)', () => {
    for (const placement of ['[H_LEFT, V_TOP, OUTSIDE]', '[H_RIGHT, V_TOP, OUTSIDE]']) {
      const { node, graph } = makeNode({
        constraints: ['NODE_LABELS'],
        nodeLabels: [{ text: 'L', w: 80, h: 12, placement }],
      })
      // N 容器 HORIZONTAL strip: 对称 → 80+80 = 160
      expect(computeCellSystemSize(node, graph)).toEqual({ x: 160, y: 0 })
    }
  })

  it('placement 字符串无括号但含尾随空格: trim 后识别 INSIDE (与括号版同尺寸)', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [{ text: 'L', w: 30, h: 10, placement: 'H_CENTER, V_TOP, INSIDE ' }],
    })
    // 若未 trim → 'INSIDE ' 判为 OUTSIDE → 尺寸不同; 正确 trim 后 = {40, 30}
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 40, y: 30 })
  })

  it('OUTSIDE N 容器 2 标签 (BEGIN+END): strip gap 在活动 cell 间插入', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'], labelLabel: 2,
      nodeLabels: [
        { text: 'A', w: 40, h: 10, placement: '[H_LEFT, V_TOP, OUTSIDE]' },
        { text: 'B', w: 30, h: 10, placement: '[H_RIGHT, V_TOP, OUTSIDE]' },
      ],
    })
    // 对称 40/40 + gap 4 = 84
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 84, y: 0 })
  })
})
