/**
 * ELK cell 系统最小尺寸 — 直接 vitest BDD.
 *
 * 被测: src/intermediate/cell-system.ts (NodeLabelAndSizeCalculator 7 阶段尺寸部分移植).
 * 对照权威: ELK 0.12.0 plugins/org.eclipse.elk.alg.common/.../nodespacing/ (CellProbe 实测值).
 * 不变量: 网格叠加 (contribution flags) / AtomicCell content-0 不贡献 / 对称网格 /
 *         DISTRIBUTED 对齐 2*portPort / 负 borderOffset padding / MINIMUM_SIZE 20 下限.
 */
import { describe, it, expect } from 'vitest'
import { LGraph, LNode, LPort } from '../../src/index.js'
import { PortSide } from '../../src/graph/enums.js'
import { computeCellSystemSize } from '../../src/intermediate/cell-system.js'
import {
  NODE_SIZE_CONSTRAINTS, NODE_SIZE_MINIMUM, NODE_SIZE_OPTIONS, PORT_CONSTRAINTS,
  PORT_LABELS_PLACEMENT, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING, PORT_BORDER_OFFSET, NODE_LABELS_PLACEMENT,
} from '../../src/options/layered-options.js'

/** 建一个扁平节点: 显式尺寸 + 约束 + 端口/标签. */
function makeNode(opts: {
  size?: { x: number; y: number }
  constraints?: string[]
  portConstraints?: string
  portLabels?: string[]
  portPort?: number
  sizeOptions?: string[]
  min?: { x: number; y: number }
  ports?: { side: PortSide; w?: number; h?: number; borderOffset?: number; labels?: { text: string; w: number; h: number; x: number; y: number }[] }[]
  nodeLabels?: { text: string; w: number; h: number; placement?: string }[]
  nodeLabelsPlacement?: string[]
}): { graph: LGraph; node: LNode } {
  const graph = new LGraph()
  const node = new LNode(graph)
  node.size = opts.size ?? { x: 100, y: 50 }
  if (opts.constraints) node.setProperty(NODE_SIZE_CONSTRAINTS, opts.constraints)
  if (opts.portConstraints) node.setProperty(PORT_CONSTRAINTS, opts.portConstraints)
  if (opts.portLabels) node.setProperty(PORT_LABELS_PLACEMENT, opts.portLabels)
  if (opts.portPort !== undefined) graph.setProperty(SPACING_PORT_PORT, opts.portPort)
  if (opts.sizeOptions) node.setProperty(NODE_SIZE_OPTIONS, opts.sizeOptions)
  if (opts.min) node.setProperty(NODE_SIZE_MINIMUM, opts.min)
  for (const p of opts.ports ?? []) {
    const port = new LPort()
    port.setNode(node)
    port.setSide(p.side)
    port.size = { x: p.w ?? 8, y: p.h ?? 8 }
    if (p.borderOffset !== undefined) port.setProperty(PORT_BORDER_OFFSET, p.borderOffset)
    if (p.labels) port.setLabels(p.labels.map(l => ({ text: l.text, position: { x: l.x, y: l.y }, size: { x: l.w, y: l.h } })))
  }
  for (const l of opts.nodeLabels ?? []) {
    const label = { text: l.text, position: { x: 0, y: 0 }, size: { x: l.w, y: l.h } } as any
    if (l.placement) label.placement = l.placement
    ;(node.setLabels as any)([...node.getLabels(), label])
  }
  if (opts.nodeLabelsPlacement) node.setProperty(NODE_LABELS_PLACEMENT, opts.nodeLabelsPlacement)
  return { graph, node }
}

describe('cell 系统最小尺寸 (ELK NodeLabelAndSizeCalculator 移植)', () => {
  it('701 回归: NORTH 端口 20x20 borderOffset -8 + 50x17 标签 + PORTS/NODE_LABELS/PORT_LABELS → 60x52 (CellProbe 实测)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'NODE_LABELS', 'PORT_LABELS'],
      portConstraints: 'FIXED_SIDE',
      portLabels: [],
      portPort: 10,
      ports: [{ side: PortSide.NORTH, w: 20, h: 20, borderOffset: -8 }],
      nodeLabels: [{ text: 'MyNode1', w: 50, h: 17, placement: '[H_CENTER, V_TOP, INSIDE]' }],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell).toEqual({ x: 60, y: 52 })
  })

  it('701 回归: EAST 端口 + 对称网格 → 68x46 (端口高度 46 = 20 + 2*13 DISTRIBUTED)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'NODE_LABELS', 'PORT_LABELS'],
      portConstraints: 'FIXED_SIDE',
      portLabels: [],
      portPort: 13,
      ports: [{ side: PortSide.EAST, w: 20, h: 20, borderOffset: -8 }],
      nodeLabels: [{ text: 'MyNode2', w: 50, h: 17, placement: '[H_CENTER, V_TOP, INSIDE]' }],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell).toEqual({ x: 68, y: 46 })
  })

  it('DISTRIBUTED 对齐 (默认): N 端口侧宽 = 端口宽 + 2*portPort (46 = 20 + 2*13)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'],
      portPort: 13,
      ports: [{ side: PortSide.NORTH, w: 20, h: 20 }],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.x).toBe(46)
  })

  it('负 borderOffset → 节点 padding 计入 (NORTH -8 → nodeContainer pad.top=8)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'],
      portPort: 10,
      ports: [{ side: PortSide.NORTH, w: 20, h: 20, borderOffset: -8 }],
      nodeLabels: [{ text: 'L', w: 20, h: 10, placement: '[H_CENTER, V_TOP, INSIDE]' }],
    })
    const cell = computeCellSystemSize(node, graph)
    // ELK CellDump 实测 (constraints=[PORTS], 无 NODE_LABELS): N cell content.x=40 (20+2*10 DISTRIBUTED),
    // nodeContainer min=(40,0) — 网格/标签不贡献高度 (无 NODE_LABELS 约束), getMinimumHeight 为 0 时 padding 丢弃.
    expect(cell!.x).toBe(40)
    expect(cell!.y).toBe(0)
  })

  it('对称网格: V_TOP 标签强制底部行同高 (inner 44 = 17*2 + padding 10)', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [{ text: 'L', w: 50, h: 17, placement: '[H_CENTER, V_TOP, INSIDE]' }],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell).toEqual({ x: 60, y: 44 })
  })

  it('MINIMUM_SIZE 由调用方应用 (computeCellSystemSize 返回原始 cell; PORTS 分支在 processNodeLabels)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'MINIMUM_SIZE'],
      portPort: 10,
      ports: [{ side: PortSide.NORTH, w: 20, h: 20 }],
    })
    // 原始 cell 不含 20 下限 (NodeSizeCalculator 在 cell 之上取 max)
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.x).toBe(40)
  })

  it('固定约束 (空 或 仅 PORT_LABELS) → null (保留显式尺寸)', () => {
    const { node, graph } = makeNode({ constraints: [] })
    expect(computeCellSystemSize(node, graph)).toBeNull()
    const n2 = makeNode({ constraints: ['PORT_LABELS'] })
    expect(computeCellSystemSize(n2.node, n2.graph)).toBeNull()
  })

  it('多个 N 端口: 宽 = Σ宽 + (n-1)*portPort + 2*portPort (DISTRIBUTED)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'],
      portPort: 10,
      ports: [
        { side: PortSide.NORTH, w: 20, h: 8 },
        { side: PortSide.NORTH, w: 20, h: 8 },
        { side: PortSide.NORTH, w: 20, h: 8 },
      ],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.x).toBe(3 * 20 + 2 * 10 + 2 * 10) // 60 + 20 + 20 = 100
  })

  it('OUTSIDE 端口标签不使 cell 变宽 (E/W 端口贡献高度, 宽度为 0 → AtomicCell 特判)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'],
      portLabels: ['OUTSIDE'],
      portPort: 10,
      ports: [{ side: PortSide.EAST, w: 8, h: 8, labels: [{ text: 'label', w: 40, h: 10, x: 0, y: 0 }] }],
    })
    const cell = computeCellSystemSize(node, graph)
    // E 端口: 高度 = 8 + 2*10 = 28 (DISTRIBUTED), 含标签 margin (40x10 → margin.bottom=10+spacingV)
    // 宽度: N/S cell 空 → 0; E/W 不贡献宽 (content.x=0)
    expect(cell!.x).toBe(0)
    expect(cell!.y).toBeGreaterThanOrEqual(28)
  })

  it('FIXED 端口标签 (placement=[]) 按显式位置, 标签 bounds 进端口 margin', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'],
      portLabels: [],
      portPort: 10,
      ports: [{ side: PortSide.NORTH, w: 20, h: 20, labels: [{ text: 'fixed', w: 100, h: 17, x: -40, y: 21 }] }],
    })
    const cell = computeCellSystemSize(node, graph)
    // N 端口 margin: 标签 bounds x=-40..60 → left 40, right 40 → 宽 = 40+20+40 = 100 (DISTRIBUTED +20)
    expect(cell!.x).toBe(120)
  })
})

describe('cell 系统尺寸不变量 (算术钉住)', () => {
  it('SOUTH 端口与 NORTH 对称 (宽 = 端口宽 + 2*portPort)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 7,
      ports: [{ side: PortSide.SOUTH, w: 24, h: 8 }],
    })
    // PORTS 约束下 N/S cell 只贡献**宽** (PORT_LABELS 才贡献高); 高 0 (无 E/W 端口)
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 38, y: 0 })
  })

  it('WEST 端口贡献高度 (高 = 端口高 + 2*portPort), 宽 = 0 (content.x=0 AtomicCell 特判)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 5,
      ports: [{ side: PortSide.WEST, w: 8, h: 12 }],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.x).toBe(0)
    expect(cell!.y).toBe(22)
  })

  it('EAST 两个端口: 高 = Σ高 + portPort(中间) + 2*portPort(DISTRIBUTED)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'], portPort: 6,
      ports: [
        { side: PortSide.EAST, w: 8, h: 10 },
        { side: PortSide.EAST, w: 8, h: 10 },
      ],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.y).toBe(10 + 6 + 10 + 12) // 38
  })

  it('NODE_LABELS 标签 cell 含 padding (grid = maxLabel + 2*5)', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [{ text: 'L', w: 30, h: 12, placement: '[H_LEFT, V_CENTER, INSIDE]' }],
    })
    // V_CENTER → 中行 (不触发上下对称), 高 = 12 + 10
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 40, y: 22 })
  })

  it('多标签纵向堆叠: 高 = Σ标签高 (labelLabel gap=0)', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [
        { text: 'A', w: 50, h: 10, placement: '[H_CENTER, V_TOP, INSIDE]' },
        { text: 'B', w: 40, h: 14, placement: '[H_CENTER, V_TOP, INSIDE]' },
      ],
    })
    // 高 = (10+14) 行 + 对称下 24 + padding 10 = 58; 宽 = max(50,40)+10 = 60
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 60, y: 58 })
  })

  it('节点 padding (NODE_LABELS_PADDING) 参与网格尺寸', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [{ text: 'L', w: 20, h: 8, placement: '[H_CENTER, V_TOP, INSIDE]' }],
    })
    // 默认 padding 5: 宽 30, 高 8+8(对称)+10=26
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 30, y: 26 })
  })

  it('FIXED_RATIO 端口: E/W 不贡献高度 (freePortPlacement=false)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'],
      portConstraints: 'FIXED_RATIO',
      portLabels: [],
      portPort: 10,
      ports: [{ side: PortSide.EAST, w: 8, h: 30 }],
    })
    const cell = computeCellSystemSize(node, graph)
    // E cell content.y = 30 + 20 = 50, 但 FIXED_RATIO → E/W 不贡献 minHeight
    expect(cell!.y).toBe(0)
  })

  it('FIXED_POS 端口: E/W 不贡献高度 (freePortPlacement=false)', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS'],
      portConstraints: 'FIXED_POS',
      portPort: 10,
      ports: [{ side: PortSide.EAST, w: 8, h: 30 }],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.y).toBe(0)
  })

  it('UNIFORM_PORT_SPACING: 多端口 margin 统一为最大值', () => {
    const { node, graph } = makeNode({
      constraints: ['PORTS', 'PORT_LABELS'],
      portLabels: ['OUTSIDE'],
      sizeOptions: ['UNIFORM_PORT_SPACING'],
      portPort: 10,
      ports: [
        { side: PortSide.NORTH, w: 8, h: 8, labels: [{ text: 'wide', w: 60, h: 10, x: 0, y: 0 }] },
        { side: PortSide.NORTH, w: 8, h: 8 },
      ],
    })
    const cell = computeCellSystemSize(node, graph)
    // OUTSIDE 标签 → 端口1 margin.right = spacingH(1)+60 = 61; uniform → 两端口均 61,
    // 但 rightmost(端口2) margin.right 归零 (OUTSIDE 首尾规则)
    // 宽 = (0+8+61) + 10 + (0+8+0) + DISTRIBUTED 2*10 = 107
    expect(cell!.x).toBe(107)
  })

  it('grid gap (labelCellSpacing = 2*labelLabel) 仅在多活动行/列插入', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [
        { text: 'A', w: 30, h: 10, placement: '[H_CENTER, V_TOP, INSIDE]' },
        { text: 'B', w: 30, h: 10, placement: '[H_CENTER, V_BOTTOM, INSIDE]' },
      ],
    })
    // 对称网格: top=10, bottom=10 → 对称后 10/10; labelCellSpacing=0 → 高 20+10=30
    expect(computeCellSystemSize(node, graph)).toEqual({ x: 40, y: 30 })
  })
})

describe('cell 系统 OUTSIDE 节点标签', () => {
  it('OUTSIDE V_TOP 标签 → N 容器贡献宽 (NODE_LABELS 且非 OVERHANG)', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [{ text: 'out', w: 80, h: 12, placement: '[H_CENTER, V_TOP, OUTSIDE]' }],
    })
    // N 容器 (HORIZONTAL strip): 宽 80 + labelNode 间距 5 (padding.bottom) 不贡献宽
    // NODE_LABELS && !OVERHANG → width = max(内网格, N容器宽)
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.x).toBe(80)
  })

  it('OUTSIDE_NODE_LABELS_OVERHANG → 外部标签不贡献尺寸', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      sizeOptions: ['OUTSIDE_NODE_LABELS_OVERHANG'],
      nodeLabels: [{ text: 'out', w: 80, h: 12, placement: '[H_CENTER, V_TOP, OUTSIDE]' }],
    })
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.x).toBe(0)
  })

  it('OUTSIDE H_PRIORITY 标签 → W/E 容器贡献高', () => {
    const { node, graph } = makeNode({
      constraints: ['NODE_LABELS'],
      nodeLabels: [{ text: 'out', w: 12, h: 50, placement: '[H_LEFT, V_CENTER, OUTSIDE, H_PRIORITY]' }],
    })
    // W 容器 (VERTICAL strip): 高 50 + labelNode 5 (padding.right 不贡献高) → 高 50
    const cell = computeCellSystemSize(node, graph)
    expect(cell!.y).toBe(50)
  })
})

describe('updateVerticalInsidePortLabelCellPadding (Java CellSystemConfigurator phase 6)', () => {
  it('1 个 WEST 端口 (0x0) + PORTS + surrounding 10/10 → cell 高 28 (E/W padding 10→9; flexible_ports graph01 jar 实证)', () => {
    const { graph, node } = makeNode({
      size: { x: 60, y: 30 },
      constraints: ['PORTS', 'MINIMUM_SIZE'],
      portPort: 5,
      ports: [{ side: PortSide.WEST, w: 0, h: 0 }],
    })
    graph.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, bottom: 10, right: 0 })
    const cell = computeCellSystemSize(node, graph)
    // 调整前 30 (10+10+10); updateVertical: N/S minH=1 (portLabelSpacingV 无条件) →
    // topBorderOffset=1 → E/W padding 9/9 → 9+10+9=28 (jar LabelAndNodeSizeProcessor 实测 20x28)
    expect(cell).toEqual({ x: 0, y: 28 })
  })

  it('N/S 无端口时 cell minH = portLabelSpacingV (Java setupNorthOrSouthPortLabelCell 无条件) — 影响 E/W padding 调整', () => {
    const { graph, node } = makeNode({
      size: { x: 60, y: 30 },
      constraints: ['PORTS', 'MINIMUM_SIZE'],
      portPort: 5,
      ports: [{ side: PortSide.EAST, w: 0, h: 0 }],
    })
    graph.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, bottom: 10, right: 0 })
    const cell = computeCellSystemSize(node, graph)
    expect(cell).toEqual({ x: 0, y: 28 })
  })

  it('FIXED_POS 端口约束 → 不做 updateVertical 调整 (Java 提前返回)', () => {
    const { graph, node } = makeNode({
      size: { x: 60, y: 30 },
      constraints: ['PORTS'],
      portConstraints: 'FIXED_POS',
      portPort: 5,
      ports: [{ side: PortSide.WEST, w: 0, h: 0 }],
    })
    graph.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, bottom: 10, right: 0 })
    // FIXED_POS: E/W cell 由 fixed 分支定尺寸 (bottommostPortBorder), 不参与 updateVertical
    const cell = computeCellSystemSize(node, graph)
    // cell 高 = 0 (fixed 分支 content=0) 而非 28 — 验证 FIXED 跳过调整
    expect(cell).toEqual({ x: 0, y: 0 })
  })
})
