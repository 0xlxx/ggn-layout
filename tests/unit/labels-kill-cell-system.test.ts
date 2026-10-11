/**
 * labels 簇变异补测: cell-system.ts 布局/放置路径.
 * computeCellSystemSize 已由 cell-system.scenarios.test.ts 覆盖尺寸; 这里补
 * layoutNodeCells (cell 矩形) / placeNodePorts (端口坐标) / placePortLabels (标签坐标)
 * + 补充尺寸场景 (treatAsGroup/NEXT_TO_PORT/ALWAYS_SAME_SIDE/ASYMMETRICAL/FIXED_POSITION 字符串).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, PortSide } from '../../src/index.js'
import { computeCellSystemSize, layoutNodeCells, placeNodePorts, placePortLabels } from '../../src/intermediate/cell-system.js'
import {
  NODE_SIZE_CONSTRAINTS, NODE_SIZE_OPTIONS, PORT_CONSTRAINTS, PORT_LABELS_PLACEMENT, SPACING_PORT_PORT,
  PORT_BORDER_OFFSET, SPACING_LABEL_PORT_VERTICAL, SPACING_LABEL_PORT_HORIZONTAL, SPACING_LABEL_LABEL,
  SPACING_PORTS_SURROUNDING, SPACING_LABEL_NODE,
} from '../../src/options/layered-options.js'

interface PortSpec { side: PortSide; w?: number; h?: number; b?: number; labels?: { text: string; w: number; h: number }[] }
function mk(opts: {
  constraints?: string[]; options?: string[]; pc?: unknown; pl?: string[]; portPort?: number;
  surrounding?: { top: number; left: number; bottom: number; right: number };
  labelLabel?: number; spacingV?: number; spacingH?: number; labelNode?: number; ports?: PortSpec[];
}): { g: LGraph; n: LNode } {
  const g = new LGraph()
  if (opts.portPort !== undefined) g.setProperty(SPACING_PORT_PORT, opts.portPort)
  if (opts.surrounding) g.setProperty(SPACING_PORTS_SURROUNDING, opts.surrounding)
  if (opts.labelLabel !== undefined) g.setProperty(SPACING_LABEL_LABEL, opts.labelLabel)
  if (opts.spacingV !== undefined) g.setProperty(SPACING_LABEL_PORT_VERTICAL, opts.spacingV)
  if (opts.spacingH !== undefined) g.setProperty(SPACING_LABEL_PORT_HORIZONTAL, opts.spacingH)
  if (opts.labelNode !== undefined) g.setProperty(SPACING_LABEL_NODE, opts.labelNode)
  const n = new LNode(g)
  n.size = { x: 100, y: 100 }
  if (opts.constraints) n.setProperty(NODE_SIZE_CONSTRAINTS, opts.constraints)
  if (opts.options) n.setProperty(NODE_SIZE_OPTIONS, opts.options)
  if (opts.pc !== undefined) n.setProperty(PORT_CONSTRAINTS, opts.pc)
  if (opts.pl) n.setProperty(PORT_LABELS_PLACEMENT, opts.pl)
  for (const p of opts.ports ?? []) {
    const port = new LPort()
    port.setNode(n)
    port.setSide(p.side)
    port.size = { x: p.w ?? 8, y: p.h ?? 8 }
    if (p.b !== undefined) port.setProperty(PORT_BORDER_OFFSET, p.b)
    if (p.labels) port.setLabels(p.labels.map(l => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.w, y: l.h } })))
  }
  return { g, n }
}

describe('layoutNodeCells (cell 矩形)', () => {
  it('单 EAST 端口: E cell 右侧占满高, N/S cell 0 高', () => {
    const { g, n } = mk({ ports: [{ side: PortSide.EAST }] })
    const layout = layoutNodeCells(n, g, 100, 100)
    expect(layout.inside.EAST).toEqual({ x: 100, y: 0, width: 0, height: 100 })
    expect(layout.inside.NORTH).toEqual({ x: 0, y: 0, width: 100, height: 0 })
    expect(layout.inside.SOUTH).toEqual({ x: 0, y: 100, width: 100, height: 0 })
    expect(layout.middleRow).toEqual({ x: 0, y: 0, width: 100, height: 100 })
  })

  it('available: N/S cell 内起点 = rect + padding', () => {
    const { g, n } = mk({ ports: [{ side: PortSide.NORTH }, { side: PortSide.SOUTH }] })
    const layout = layoutNodeCells(n, g, 100, 100)
    // NORTH cell padding.top = portLabelSpacingV (默认 1)
    expect(layout.available.NORTH).toEqual({ top: 1, left: 0 })
    expect(layout.available.SOUTH).toEqual({ top: 100, left: 0 })
  })
})

describe('placeNodePorts (端口坐标)', () => {
  it('单 EAST 端口 → CENTER (DISTRIBUTED 单端口退化)', () => {
    const { g, n } = mk({ ports: [{ side: PortSide.EAST }] })
    placeNodePorts(n, g, 100, 100)
    const p = n.getPorts()[0]!
    expect(p.getPosition().x).toBe(100)
    expect(p.getPosition().y).toBe(46) // (100 - 8) / 2
  })

  it('2 EAST 端口 → DISTRIBUTED 等距 (spaceBetween = portPort + (avail-calc)/(n+1))', () => {
    const { g, n } = mk({ ports: [{ side: PortSide.EAST }, { side: PortSide.EAST }] })
    placeNodePorts(n, g, 100, 100)
    const [p1, p2] = n.getPorts()
    expect(p1!.getPosition().y).toBe(28)
    expect(p2!.getPosition().y).toBe(64)
    expect(p1!.getPosition().x).toBe(100)
  })

  it('WEST 端口 borderOffset -5 → x = -portW - offset', () => {
    const { g, n } = mk({ ports: [{ side: PortSide.WEST, b: -5 }] })
    placeNodePorts(n, g, 100, 100)
    expect(n.getPorts()[0]!.getPosition().x).toBe(-3)
  })

  it('NORTH 端口 → y = -portH; x 居中', () => {
    const { g, n } = mk({ ports: [{ side: PortSide.NORTH }] })
    placeNodePorts(n, g, 100, 100)
    const p = n.getPorts()[0]!
    expect(p.getPosition().y).toBe(-8)
    expect(p.getPosition().x).toBe(46)
  })
})

describe('placePortLabels (端口标签坐标)', () => {
  it('NORTH OUTSIDE 标签: rect 相对端口 (右对齐), y = -h - spacingV', () => {
    const { g, n } = mk({ pl: ['OUTSIDE'], ports: [{ side: PortSide.NORTH, labels: [{ text: 'L', w: 20, h: 6 }] }] })
    placeNodePorts(n, g, 100, 100)
    placePortLabels(n, g)
    const p = n.getPorts()[0]!
    expect(p.getLabels()[0]!.position).toEqual({ x: 9, y: -7 }) // portW 8 + spacingH 1; -6 - 1
  })

  it('EAST OUTSIDE NEXT_TO_PORT + treatAsGroup: 标签垂直居中于组高', () => {
    const { g, n } = mk({
      pl: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'],
      ports: [
        { side: PortSide.EAST, labels: [{ text: 'A', w: 20, h: 6 }, { text: 'B', w: 12, h: 6 }] },
        { side: PortSide.EAST, labels: [{ text: 'C', w: 14, h: 6 }] },
      ],
    })
    n.setProperty('org.eclipse.elk.portLabels.treatAsGroup', true)
    placePortLabels(n, g)
    const [p1, p2] = n.getPorts()
    // 组高 12 (6+6 gap 0) → A y = (8-12)/2 = -2; B y = 4; C y = (8-6)/2 = 1
    expect(p1!.getLabels()[0]!.position.y).toBe(-2)
    expect(p1!.getLabels()[1]!.position.y).toBe(4)
    expect(p2!.getLabels()[0]!.position.y).toBe(1)
  })

  it('NORTH OUTSIDE ALWAYS_SAME_SIDE: 多端口标签同侧 (右对齐)', () => {
    const { g, n } = mk({
      pl: ['OUTSIDE', 'ALWAYS_SAME_SIDE'],
      ports: [
        { side: PortSide.NORTH, labels: [{ text: 'A', w: 20, h: 6 }] },
        { side: PortSide.NORTH, labels: [{ text: 'B', w: 20, h: 6 }] },
      ],
    })
    placePortLabels(n, g)
    for (const p of n.getPorts()) {
      expect(p.getLabels()[0]!.position.x).toBe(9) // portW 8 + spacingH 1
      expect(p.getLabels()[0]!.position.y).toBe(-7)
    }
  })
})

describe('computeCellSystemSize 补充场景', () => {
  it('treatAsGroup + NEXT_TO_PORT (E 端口 2 个): 组高参与 cell', () => {
    const { g, n } = mk({
      constraints: ['PORTS'],
      pl: ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'],
      ports: [
        { side: PortSide.EAST, labels: [{ text: 'A', w: 20, h: 6 }, { text: 'B', w: 12, h: 6 }] },
        { side: PortSide.EAST, labels: [{ text: 'C', w: 14, h: 6 }] },
      ],
    })
    n.setProperty('org.eclipse.elk.portLabels.treatAsGroup', true)
    expect(computeCellSystemSize(n, g)).toEqual({ x: 0, y: 46 })
  })

  it('ALWAYS_SAME_SIDE OUTSIDE 2 N 端口 → 宽 = ΣportW + portPort + 2*portPort', () => {
    const { g, n } = mk({
      constraints: ['PORTS'],
      pl: ['OUTSIDE', 'ALWAYS_SAME_SIDE'],
      ports: [
        { side: PortSide.NORTH, labels: [{ text: 'A', w: 20, h: 6 }] },
        { side: PortSide.NORTH, labels: [{ text: 'B', w: 20, h: 6 }] },
      ],
    })
    expect(computeCellSystemSize(n, g)).toEqual({ x: 46, y: 0 })
  })

  it('ASYMMETRICAL: N/S 标签不对称 → 高 = 各自行高', () => {
    const { g, n } = mk({ options: ['ASYMMETRICAL'], constraints: ['NODE_LABELS'], labelLabel: 0 })
    n.setLabels([
      { text: 'T', position: { x: 0, y: 0 }, size: { x: 40, y: 10 }, placement: 'INSIDE V_TOP H_CENTER' },
      { text: 'B', position: { x: 0, y: 0 }, size: { x: 10, y: 30 }, placement: 'INSIDE V_BOTTOM H_CENTER' },
    ])
    expect(computeCellSystemSize(n, g)).toEqual({ x: 50, y: 50 })
  })

  it('字符串 "FIXED_POSITION" + FIXED 端口标签 bounds → 尺寸含标签', () => {
    const { g, n } = mk({
      pc: 'FIXED_POSITION', pl: [], constraints: ['PORTS', 'PORT_LABELS'],
      ports: [{ side: PortSide.NORTH, w: 20, h: 8, labels: [{ text: 'L', w: 30, h: 6 }] }],
    })
    expect(computeCellSystemSize(n, g)).toEqual({ x: 50, y: 0 })
  })

  it('空约束 → null (保留显式尺寸)', () => {
    const { g, n } = mk({})
    expect(computeCellSystemSize(n, g)).toBeNull()
  })
})

describe('computeCellSystemSize 网格/标签放置补充', () => {
  it('多标签端口 (labelLabel gap>0): E/W cell 高度仍由端口决定', () => {
    const { g, n } = mk({
      constraints: ['PORTS'], pl: ['OUTSIDE'], labelLabel: 2, spacingV: 1,
      ports: [{ side: PortSide.EAST, labels: [{ text: 'A', w: 20, h: 6 }, { text: 'B', w: 12, h: 6 }] }],
    })
    expect(computeCellSystemSize(n, g)).toEqual({ x: 0, y: 28 })
  })

  it('同 V_TOP cell 双标签堆叠 (gap=3) + 对称网格镜像底行', () => {
    const { g, n } = mk({ constraints: ['NODE_LABELS'], labelLabel: 3 })
    n.setLabels([
      { text: 'A', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'INSIDE V_TOP H_CENTER' },
      { text: 'B', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'INSIDE V_TOP H_CENTER' },
    ])
    expect(computeCellSystemSize(n, g)).toEqual({ x: 40, y: 68 })
  })

  it('elkt 方括号 placement 串解析 ([H_CENTER, V_TOP, INSIDE])', () => {
    const { g, n } = mk({ constraints: ['NODE_LABELS'], labelLabel: 0 })
    n.setLabels([{ text: 'A', position: { x: 0, y: 0 }, size: { x: 40, y: 10 }, placement: '[H_CENTER, V_TOP, INSIDE]' }])
    expect(computeCellSystemSize(n, g)).toEqual({ x: 50, y: 30 })
  })

  it('INSIDE H_PRIORITY H_LEFT + H_RIGHT → W/E 列贡献宽', () => {
    const { g, n } = mk({ constraints: ['NODE_LABELS'], labelLabel: 0 })
    n.setLabels([
      { text: 'L', position: { x: 0, y: 0 }, size: { x: 40, y: 10 }, placement: 'INSIDE H_PRIORITY H_LEFT V_CENTER' },
      { text: 'R', position: { x: 0, y: 0 }, size: { x: 60, y: 10 }, placement: 'INSIDE H_PRIORITY H_RIGHT V_CENTER' },
    ])
    expect(computeCellSystemSize(n, g)).toEqual({ x: 110, y: 20 })
  })

  it('负 borderOffset + FIXED 端口标签 bounds → nodeContainer padding', () => {
    const { g, n } = mk({
      pc: 'FIXED_POS', pl: [], constraints: ['PORTS', 'PORT_LABELS'],
      ports: [{ side: PortSide.NORTH, w: 20, h: 8, b: -10, labels: [{ text: 'L', w: 30, h: 6 }] }],
    })
    expect(computeCellSystemSize(n, g)).toEqual({ x: 50, y: 0 })
  })

  it('OUTSIDE V_TOP 节点标签 (NODE_LABELS, 非 OVERHANG) → N 容器贡献宽', () => {
    const { g, n } = mk({ constraints: ['NODE_LABELS'], labelNode: 7 })
    n.setLabels([{ text: 'L', position: { x: 0, y: 0 }, size: { x: 80, y: 12 }, placement: 'OUTSIDE V_TOP H_CENTER' }])
    expect(computeCellSystemSize(n, g)).toEqual({ x: 80, y: 0 })
  })

  it('MINIMUM_SIZE_ACCOUNTS_FOR_PADDING: 无其他约束 → 0 (贡献标志不影响空 cell)', () => {
    const { g, n } = mk({ constraints: ['MINIMUM_SIZE'], options: ['MINIMUM_SIZE_ACCOUNTS_FOR_PADDING'] })
    expect(computeCellSystemSize(n, g)).toEqual({ x: 0, y: 0 })
  })
})

describe('placeNodePorts 对齐补测 (T5-C2)', () => {
  const alignKey = (side: string) => `org.eclipse.elk.portAlignment.${side.toLowerCase()}`

  it('EAST 2 端口 JUSTIFIED: spaceBetween=portPort, 首端口 y=0', () => {
    const { g, n } = mk({ constraints: ['PORTS'] })
    n.setProperty(alignKey('east'), 'JUSTIFIED')
    mkPorts(n, PortSide.EAST, 2)
    placeNodePorts(n, g, 100, 100)
    const [p1, p2] = n.getPorts(PortSide.EAST)
    // content.y = 16 + 10 = 26 (JUSTIFIED 无 2*portPort); available=100 → add=(100-26)/1=74
    expect(p1!.getPosition().y).toBe(0)
    expect(p2!.getPosition().y).toBe(92) // spaceBetween = 10 + (100-26)/1 = 84 → 8+84
    expect(p1!.getPosition().x).toBe(100)
  })

  it('EAST 2 端口 CENTER: 整体居中', () => {
    const { g, n } = mk({ constraints: ['PORTS'] })
    n.setProperty(alignKey('east'), 'CENTER')
    mkPorts(n, PortSide.EAST, 2)
    placeNodePorts(n, g, 100, 100)
    const [p1, p2] = n.getPorts(PortSide.EAST)
    // content.y = 26; available=100 → currentPos += (100-26)/2 = 37
    expect(p1!.getPosition().y).toBe(37)
    expect(p2!.getPosition().y).toBe(55)
  })

  it('EAST 2 端口 END: 右对齐到底', () => {
    const { g, n } = mk({ constraints: ['PORTS'] })
    n.setProperty(alignKey('east'), 'END')
    mkPorts(n, PortSide.EAST, 2)
    placeNodePorts(n, g, 100, 100)
    const [p1, p2] = n.getPorts(PortSide.EAST)
    // currentPos += 100-26 = 74
    expect(p1!.getPosition().y).toBe(74)
    expect(p2!.getPosition().y).toBe(92)
  })

  it('EAST 2 端口 BEGIN: 顶部对齐', () => {
    const { g, n } = mk({ constraints: ['PORTS'] })
    n.setProperty(alignKey('east'), 'BEGIN')
    mkPorts(n, PortSide.EAST, 2)
    placeNodePorts(n, g, 100, 100)
    const [p1, p2] = n.getPorts(PortSide.EAST)
    expect(p1!.getPosition().y).toBe(0)
    expect(p2!.getPosition().y).toBe(18)
  })

  it('SOUTH 2 端口 DISTRIBUTED: 逆序放置 (ports[0] 靠右)', () => {
    const { g, n } = mk({ constraints: ['PORTS'] })
    mkPorts(n, PortSide.SOUTH, 2)
    placeNodePorts(n, g, 100, 100)
    const ports = n.getPorts(PortSide.SOUTH)
    expect(ports[0]!.getPosition().x).toBeGreaterThan(ports[1]!.getPosition().x)
  })
})

function mkPorts(n: LNode, side: PortSide, count: number): void {
  for (let i = 0; i < count; i++) {
    const port = new LPort()
    port.setNode(n)
    port.setSide(side)
    port.size = { x: 8, y: 8 }
  }
}

describe('placePortLabels 补测 (T5-C2)', () => {
  it('INSIDE NORTH: labelsNextToPort → 标签水平居中于端口 + y=portH+borderOffset+labelBorderOffset', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['INSIDE'],
      ports: [{ side: PortSide.NORTH, labels: [{ text: 'L', w: 20, h: 6 }] }],
    })
    placePortLabels(n, g)
    const p = n.getPorts()[0]!
    // rect.x=(8-20)/2=-6; labelBorderOffset=pad.top(0)+spacingV(1)=1 → rect.y=8+0+1=9
    expect(p.getLabels()[0]!.position).toEqual({ x: -6, y: 9 })
  })

  it('INSIDE EAST 容器节点 (无 NEXT_TO_PORT): labelsNextToPort=false → 标签在端口右侧', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['INSIDE'],
      ports: [{ side: PortSide.EAST, labels: [{ text: 'L', w: 20, h: 6 }] }],
    })
    n.setNestedGraph(new LGraph())
    placePortLabels(n, g)
    const p = n.getPorts()[0]!
    // rect.x = -0 - (pad.right 0 + spacingH 1) - 20 = -21; rect.y = 8 + 1 = 9; vAlign CENTER
    expect(p.getLabels()[0]!.position).toEqual({ x: -21, y: 9 })
  })

  it('OUTSIDE 2 EAST 端口: 首端口标签不同侧 (y=-h-spacingV), 其余在端口下', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['OUTSIDE'],
      ports: [
        { side: PortSide.EAST, labels: [{ text: 'A', w: 20, h: 6 }] },
        { side: PortSide.EAST, labels: [{ text: 'B', w: 20, h: 6 }] },
      ],
    })
    placePortLabels(n, g)
    const ports = n.getPorts(PortSide.EAST)
    expect(ports[0]!.getLabels()[0]!.position.y).toBe(-7) // -6 - spacingV 1
    expect(ports[1]!.getLabels()[0]!.position.y).toBe(9) // portSize.y 8 + spacingV 1
    expect(ports[0]!.getLabels()[0]!.position.x).toBe(9) // portSize.x 8 + spacingH 1
  })

  it('OUTSIDE SPACE_EFFICIENT 3 EAST 端口: 首标签不同侧', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['OUTSIDE', 'SPACE_EFFICIENT'],
      ports: [
        { side: PortSide.EAST, labels: [{ text: 'A', w: 20, h: 6 }] },
        { side: PortSide.EAST, labels: [{ text: 'B', w: 20, h: 6 }] },
        { side: PortSide.EAST, labels: [{ text: 'C', w: 20, h: 6 }] },
      ],
    })
    placePortLabels(n, g)
    const ports = n.getPorts(PortSide.EAST)
    expect(ports[0]!.getLabels()[0]!.position.y).toBe(-7)
    expect(ports[1]!.getLabels()[0]!.position.y).toBe(9)
  })
})

describe('computeCellSystemSize 端口标签 margin 补测 (T5-C2)', () => {
  it('INSIDE 标签高于端口 → labelsNextToPort margin 分摊 (E cell 高/宽)', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], options: ['ASYMMETRICAL'], pl: ['INSIDE'],
      ports: [{ side: PortSide.EAST, labels: [{ text: 'L', w: 20, h: 12 }] }],
    })
    // margin.top=bottom=(12-8)/2=2 → E cell content.y = 2+8+2 + 2*10 = 32 (单端口 DISTRIBUTED +20)
    // E 宽 = max label 宽 20 + padding.right spacingH 1 = 21
    expect(computeCellSystemSize(n, g)).toEqual({ x: 21, y: 32 })
  })

  it('OUTSIDE 2 N 端口 + PORT_LABELS: 标签 margin 首尾归零 → 宽 88', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['OUTSIDE'],
      ports: [
        { side: PortSide.NORTH, labels: [{ text: 'A', w: 20, h: 6 }] },
        { side: PortSide.NORTH, labels: [{ text: 'B', w: 20, h: 6 }] },
      ],
    })
    // N/S 非 nextToPort 只加右侧 margin; outside 末端口 right 归零 → (8+21)+(8+0)+10+20 = 67
    expect(computeCellSystemSize(n, g)).toEqual({ x: 67, y: 0 })
  })

  it('UNIFORM_PORT_SPACING: 3 N 端口 margin 统一为最大', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], options: ['UNIFORM_PORT_SPACING'], pl: ['OUTSIDE'],
      ports: [
        { side: PortSide.NORTH, labels: [{ text: 'A', w: 20, h: 6 }] },
        { side: PortSide.NORTH, labels: [{ text: 'B', w: 10, h: 6 }] },
        { side: PortSide.NORTH, labels: [{ text: 'C', w: 20, h: 6 }] },
      ],
    })
    // uniform: 各端口 mr=max(21,11,0)=21 → (8+21)+(8+21)+(8+0)+2*10+20 = 106
    expect(computeCellSystemSize(n, g)).toEqual({ x: 106, y: 0 })
  })
})

describe('computeCellSystemSize 节点标签容器补测 (T5-C2)', () => {
  it('OUTSIDE H_PRIORITY H_LEFT (V_CENTER) → W 容器贡献高 (labelNode padding)', () => {
    const { g, n } = mk({ constraints: ['NODE_LABELS'], labelNode: 7 })
    n.setLabels([{ text: 'L', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'OUTSIDE H_PRIORITY H_LEFT V_CENTER' }])
    // W 容器 (VERTICAL) minH = 10 + padding 0; minW = 30 + padding.right 7 = 37 → 宽由 N/S 容器决定 → 0
    expect(computeCellSystemSize(n, g)).toEqual({ x: 0, y: 10 })
  })

  it('OUTSIDE_NODE_LABELS_OVERHANG: outside 容器不贡献尺寸', () => {
    const { g, n } = mk({ constraints: ['NODE_LABELS'], options: ['OUTSIDE_NODE_LABELS_OVERHANG'] })
    n.setLabels([{ text: 'L', position: { x: 0, y: 0 }, size: { x: 80, y: 12 }, placement: 'OUTSIDE V_TOP H_CENTER' }])
    expect(computeCellSystemSize(n, g)).toEqual({ x: 0, y: 0 })
  })
})

describe('cell-system 第 2 波补测 (T5-C2)', () => {
  it('updateVerticalInsidePortLabelCellPadding: E/W cell top/bottom padding 减去边框偏移', () => {
    const { g, n } = mk({
      constraints: ['PORTS'],
      surrounding: { top: 10, left: 0, bottom: 12, right: 0 },
      ports: [{ side: PortSide.EAST }],
    })
    // eCell.padding.top=10→max(0,10-(0+1+0))=9; bottom=12→11; content.y=8+2*10=28 → minH=48
    expect(computeCellSystemSize(n, g)).toEqual({ x: 0, y: 48 })
  })

  it('INSIDE WEST 端口标签 → E/W cell 宽 = 标签宽 + padding.left spacingH', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], options: ['ASYMMETRICAL'], pl: ['INSIDE'],
      ports: [{ side: PortSide.WEST, labels: [{ text: 'L', w: 20, h: 6 }] }],
    })
    expect(computeCellSystemSize(n, g)).toEqual({ x: 21, y: 28 })
  })

  it('layoutNodeCells 对称: W/E cell 宽度镜像 (wCell 扩到 eCell 宽)', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['INSIDE'],
      ports: [
        { side: PortSide.WEST, labels: [{ text: 'L', w: 5, h: 6 }] },
        { side: PortSide.EAST, labels: [{ text: 'R', w: 20, h: 6 }] },
      ],
    })
    const lay = layoutNodeCells(n, g, 100, 100)
    // ws=[6,0,21] → 对称 ws[0]=21 → w1 = 100-21-21 = 58
    expect(lay.inside.WEST).toEqual({ x: 0, y: 0, width: 21, height: 100 })
    expect(lay.inside.EAST).toEqual({ x: 79, y: 0, width: 21, height: 100 })
    expect(lay.middleRow).toEqual({ x: 0, y: 0, width: 100, height: 100 }) // 纵向布局后未再改
  })

  it('placePortLabels INSIDE SOUTH: 标签在端口下方 (labelsNextToPort)', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['INSIDE'],
      ports: [{ side: PortSide.SOUTH, labels: [{ text: 'L', w: 20, h: 6 }] }],
    })
    placePortLabels(n, g)
    const p = n.getPorts()[0]!
    // rect.x=(8-20)/2=-6; rect.y = -0-(pad.bottom 0+spacingV 1)-6 = -7
    expect(p.getLabels()[0]!.position).toEqual({ x: -6, y: -7 })
  })

  it('placePortLabels OUTSIDE WEST: 标签在端口左侧', () => {
    const { g, n } = mk({
      constraints: ['PORTS', 'PORT_LABELS'], pl: ['OUTSIDE'],
      ports: [{ side: PortSide.WEST, labels: [{ text: 'L', w: 20, h: 6 }] }],
    })
    placePortLabels(n, g)
    const p = n.getPorts()[0]!
    // rect.y = 8+1 = 9; rect.x = -20-1 = -21; hAlign RIGHT → x=-21
    expect(p.getLabels()[0]!.position).toEqual({ x: -21, y: 9 })
  })
})
