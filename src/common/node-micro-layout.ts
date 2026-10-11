/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * vertiflex NodeMicroLayout 移植 (ELK alg.common NodeMicroLayout 0.12.0 + nodespacing).
 *
 * Java 管线 (NodeMicroLayout.execute):
 *   1. NodeDimensionCalculation.sortPortLists            — 端口列表排序 (仅 order-fixed 约束);
 *   2. NodeDimensionCalculation.calculateLabelAndNodeSizes — 节点尺寸(含标签/端口) + 端口位置 + 标签位置;
 *   3. NodeDimensionCalculation.calculateNodeMargins     — 节点 margin = 节点+标签+端口包围盒溢出.
 *
 * 移植范围 (与 jar 差分验证的语料):
 *   - 节点标签: 显式 width/height (缺省视为 0, ELK JSON import 不做文本尺寸近似);
 *     placement 缺省 = fixed (空集 → 标签位置不动, 但参与 margin 计算, 位置 (0,0)).
 *   - 端口: 必须带 port.side (否则 Java PortContextCreator 抛 IllegalArgumentException);
 *     portConstraints 缺省 UNDEFINED → 自由放置 (DISTRIBUTED 对齐, spacing.portPort 默认 10);
 *     FIXED_SIDES/FIXED_ORDER 同走自由放置; FIXED_POS/FIXED_RATIO 保持输入位置 (未移植).
 *   - nodeSize.constraints: 缺省空 (= fixed, 尺寸不变); NODE_LABELS 与
 *     PORTS (N/S 端口宽 + E/W 端口高) 按 cell 系统最小尺寸计算 (与 jar 一致, 包括无对应
 *     端口/标签时该轴塌缩为 0); PORT_LABELS 单独设置视为 fixed (Java EFFECTIVELY_FIXED).
 *   - NODE_LABELS 内部标签: GridContainerCell 非 tabular 多 cell 语义 — 每行内各列宽求和
 *     (含列间 gap=labelCellSpacing=2*labelLabelSpacing) 再取行 max; 行高按 T/C/B 求和
 *     (行间插同 gap); 默认对称 (sizeOptions 无 ASYMMETRICAL 时 L/R 列、T/B 行取等宽/等高);
 *     仅当内容 > 0 才计入 nodeLabels.padding (否则该轴贡献 0).
 *   - NODE_LABELS 外部标签: 无 OUTSIDE_NODE_LABELS_OVERHANG 时按 NodeSizeCalculator
 *     setNodeWidth/Height 把外侧容器并入节点尺寸 (宽: N/S 横向 strip 列求和; 高: E/W 纵向
 *     strip 行求和); OVERHANG 时外侧标签不贡献尺寸 (节点塌缩, 标签溢出由 margin 表达).
 *   - spacing 继承 (Java IndividualSpacings.getIndividualOrInherited): spacing.portPort /
 *     spacing.labelNode / spacing.labelLabel / spacing.portsSurrounding / nodeLabels.padding
 *     按 node.spacing.individual 覆盖 > root(graph) 显式值 > 默认 读取; 节点自身直接 spacing
 *     不被读取 (jar 实证, NodeContext 只查 individual + graph) — 见 options.ts optNumSpacing.
 *   - 未移植 (记录差异): 端口标签 (PORT_LABELS 尺寸/位置)、FIXED_POS/FIXED_RATIO 端口、
 *     MINIMUM_SIZE 约束、H_PRIORITY 标签组合、多标签同 location cell 堆叠 (OUTSIDE 尺寸
 *     已按 LabelCell 语义计入, 但 OUTSIDE 多标签放置未移植) — 这些语料不在 BDD 覆盖内.
 */
import type { ElkNode, ElkPort } from '../api/elk-json.js'
import { jsonOpt, optNumSpacing, spacingValue } from './options-helper.js'

// ── 选项 id (core) ──
const PORT_SIDE = 'org.eclipse.elk.port.side'
const PORT_CONSTRAINTS = 'org.eclipse.elk.portConstraints'
const SIZE_CONSTRAINTS = 'org.eclipse.elk.nodeSize.constraints'
const NODE_LABELS_PLACEMENT = 'org.eclipse.elk.nodeLabels.placement'
const NODE_LABELS_PADDING = 'org.eclipse.elk.nodeLabels.padding'
const SPACING_PORT_PORT = 'org.eclipse.elk.spacing.portPort'
const SPACING_LABEL_NODE = 'org.eclipse.elk.spacing.labelNode'
const SPACING_PORTS_SURROUNDING = 'org.eclipse.elk.spacing.portsSurrounding'
const PORT_ALIGNMENT_DEFAULT = 'org.eclipse.elk.portAlignment.default'
const PORT_ALIGNMENT_SIDES = { NORTH: 'org.eclipse.elk.portAlignment.north', EAST: 'org.eclipse.elk.portAlignment.east', SOUTH: 'org.eclipse.elk.portAlignment.south', WEST: 'org.eclipse.elk.portAlignment.west' } as const
const MARGINS = 'org.eclipse.elk.margins'

type PortSide = 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'
type PortAlignment = 'BEGIN' | 'CENTER' | 'END' | 'DISTRIBUTED' | 'JUSTIFIED'
type PortConstraints = 'UNDEFINED' | 'FREE' | 'FIXED_SIDE' | 'FIXED_SIDES' | 'FIXED_ORDER' | 'FIXED_RATIO' | 'FIXED_POS'

/** Java PortSide.ordinal: UNDEFINED=0, NORTH=1, EAST=2, SOUTH=3, WEST=4. */
const SIDE_ORDINAL: Record<string, number> = { UNDEFINED: 0, NORTH: 1, EAST: 2, SOUTH: 3, WEST: 4 }

/** 解析 "[A B C]" 或数组 → 元素名数组 (Java EnumSet 解析). */
function parseEnumSet(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === 'string') {
    const m = v.match(/^\[(.*)\]$/)
    return (m ? m[1] : v).split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/** 读取端口 side (缺省 UNDEFINED). */
function portSideOf(port: ElkPort): string {
  const v = jsonOpt<string>(port, PORT_SIDE)
  return typeof v === 'string' && v.trim() !== '' ? v.trim().toUpperCase() : 'UNDEFINED'
}

/** 读取节点 portConstraints (缺省 UNDEFINED, Java CoreOptions 默认). */
function portConstraintsOf(node: ElkNode): PortConstraints {
  const v = jsonOpt<unknown>(node, PORT_CONSTRAINTS)
  if (typeof v === 'string') {
    const t = v.trim().toUpperCase()
    if (['UNDEFINED', 'FREE', 'FIXED_SIDE', 'FIXED_SIDES', 'FIXED_ORDER', 'FIXED_RATIO', 'FIXED_POS'].includes(t)) return t as PortConstraints
  }
  return 'UNDEFINED'
}

/** 读取 nodeSize.constraints (缺省空 = fixed). */
function sizeConstraintsOf(node: ElkNode): string[] {
  return parseEnumSet(jsonOpt<unknown>(node, SIZE_CONSTRAINTS))
}

/** 读取端口对齐 (per-side > default; Java NodeContext.getPortAlignment, 缺省 DISTRIBUTED). */
function portAlignmentOf(node: ElkNode, side: PortSide): PortAlignment {
  const perSide = jsonOpt<unknown>(node, PORT_ALIGNMENT_SIDES[side])
  const def = jsonOpt<unknown>(node, PORT_ALIGNMENT_DEFAULT)
  const v = perSide ?? def
  if (typeof v === 'string') {
    const t = v.trim().toUpperCase()
    if (['BEGIN', 'CENTER', 'END', 'DISTRIBUTED', 'JUSTIFIED'].includes(t)) return t as PortAlignment
  }
  return 'DISTRIBUTED'
}

/** 读取 spacing.portsSurrounding (ElkMargin, 缺省 0). */
function portsSurroundingOf(root: ElkNode, node: ElkNode): { top: number; left: number; right: number; bottom: number } {
  const v = spacingValue(root, node, SPACING_PORTS_SURROUNDING)
  const num = (k: string): number => {
    if (typeof v === 'object' && v !== null) {
      const o = v as Record<string, unknown>
      return typeof o[k] === 'number' ? o[k] as number : 0
    }
    return 0
  }
  if (typeof v === 'string') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    return { top: m['top'] ?? 0, left: m['left'] ?? 0, right: m['right'] ?? 0, bottom: m['bottom'] ?? 0 }
  }
  return { top: num('top'), left: num('left'), right: num('right'), bottom: num('bottom') }
}

/** nodeLabels.padding (ElkPadding, 缺省 5 — CoreOptions.NODE_LABELS_PADDING 默认 new ElkPadding(5)). */
function nodeLabelsPaddingOf(root: ElkNode, node: ElkNode): { top: number; left: number; right: number; bottom: number } {
  const v = spacingValue(root, node, NODE_LABELS_PADDING)
  if (typeof v === 'number') return { top: v, left: v, right: v, bottom: v }
  if (typeof v === 'string') {
    const m: Record<string, number> = {}
    for (const part of v.replace(/^\[|\]$/g, '').split(',')) {
      const [k, val] = part.split('=').map((t) => t.trim())
      const n = Number(val)
      if (k !== undefined && Number.isFinite(n)) m[k] = n
    }
    const n = (k: string): number => m[k] ?? 5
    return { top: n('top'), left: n('left'), right: n('right'), bottom: n('bottom') }
  }
  return { top: 5, left: 5, right: 5, bottom: 5 }
}

/**
 * NodeMicroLayout.forGraph(graph).execute() — 处理 graph 的直接子节点
 * (Java NodeLabelAndSizeCalculator.process: graph.getNodes(), 不递归).
 */
export function nodeMicroLayout(graph: ElkNode): void {
  for (const node of graph.children ?? []) {
    processNode(graph, node)
  }
}

/** 处理单个节点 (Java NodeLabelAndSizeCalculator.process + NodeMarginCalculator.processNode). */
function processNode(root: ElkNode, node: ElkNode): void {
  const ports = node.ports ?? []
  const labels = node.labels ?? []
  // 嵌套容器（compound）尺寸由内部子图决定（黑盒 provider 先自底向上布局、容器尺寸定型），
  // 外部 force/stress/radial/vertiflex 只把它当普通节点定位——此处按 NODE_LABELS 重算会覆盖
  // 子图容器尺寸（2026-08-16 实证：force 内嵌 box 子图，box 布局 82×174 被重算成 138×42 →
  // 子节点溢出容器）。容器标签/端口同样由内部子图/渲染层处理，整体跳过。
  if ((node.children?.length ?? 0) > 0) return
  if (ports.length === 0 && labels.length === 0) return

  // Java PortContextCreator: 端口必须有 side, 否则抛异常.
  for (const port of ports) {
    if (portSideOf(port) === 'UNDEFINED') {
      throw new Error('[elk-common] Label and node size calculator can only be used with ports that have port sides assigned.')
    }
  }

  const portConstraints = portConstraintsOf(node)

  // 1) sortPortLists — 仅 order-fixed (Java NodeAdapter.sortPortList: isOrderFixed 才排序).
  if (portConstraints === 'FIXED_ORDER' || portConstraints === 'FIXED_RATIO' || portConstraints === 'FIXED_POS') {
    sortPorts(ports)
  }

  // 2) 节点尺寸 (Java NodeSizeCalculator.setNodeWidth/Height).
  let nodeW = node.width ?? 0
  let nodeH = node.height ?? 0
  const sizeConstraints = sizeConstraintsOf(node)
  const fixed = sizeConstraints.length === 0
    || (sizeConstraints.length === 1 && sizeConstraints[0] === 'PORT_LABELS')
  if (!fixed) {
    const min = cellMinimumSize(root, node, ports, labels, sizeConstraints)
    nodeW = min.w
    nodeH = min.h
    node.width = nodeW
    node.height = nodeH
  }

  // 3) 端口放置 (Java PortPlacementCalculator.placeHorizontalPorts/placeVerticalPorts).
  if (portConstraints !== 'FIXED_POS' && portConstraints !== 'FIXED_RATIO') {
    placeFreePorts(root, node, ports, portConstraints, nodeW, nodeH)
  }

  // 4) 标签放置 (Java LabelPlacer.placeLabels).
  placeLabels(root, node, labels, nodeW, nodeH)

  // 5) 节点 margin (Java NodeMarginCalculator.processNode).
  setNodeMargins(node, nodeW, nodeH)
}

// ─────────────────────────────────────────────────────────────
// 1. 端口列表排序 (ElkGraphAdapters.PortComparator)

/** PortComparator: side 顺时针 (NORTH,EAST,SOUTH,WEST), 同侧按 portIndex 再按位置. */
function sortPorts(ports: ElkPort[]): void {
  const indexOf = (p: ElkPort): number | null => {
    const v = jsonOpt<unknown>(p, 'org.eclipse.elk.portIndex')
    if (v === undefined || v === null) return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  ports.sort((a, b) => {
    const sa = portSideOf(a)
    const sb = portSideOf(b)
    const diff = (SIDE_ORDINAL[sa] ?? 0) - (SIDE_ORDINAL[sb] ?? 0)
    if (diff !== 0) return diff
    const ia = indexOf(a)
    const ib = indexOf(b)
    if (ia !== null && ib !== null && ia !== ib) return ia - ib
    const ax = a.x ?? 0
    const ay = a.y ?? 0
    const bx = b.x ?? 0
    const by = b.y ?? 0
    switch (sa) {
      case 'NORTH': return ax - bx
      case 'EAST': return ay - by
      case 'SOUTH': return bx - ax
      case 'WEST': return by - ay
      default: return 0
    }
  })
}

// ─────────────────────────────────────────────────────────────
// 2. 节点尺寸 (cell 系统最小尺寸, 自由端口场景)

/**
 * cell 系统最小尺寸 (Java NodeSizeCalculator: 非 fixed 约束时 nodeSize = cell 最小,
 * 而非 max(输入尺寸, 最小)).
 */
function cellMinimumSize(
  root: ElkNode,
  node: ElkNode,
  ports: ElkPort[],
  labels: NonNullable<ElkNode['labels']>,
  sizeConstraints: string[],
): { w: number; h: number } {
  const spacing = optNumSpacing(root, node, SPACING_PORT_PORT, 10)
  const surrounding = portsSurroundingOf(root, node)
  const pad = nodeLabelsPaddingOf(root, node)

  let minW = 0
  let minH = 0

  if (sizeConstraints.includes('NODE_LABELS')) {
    // Java NodeLabelCellCreator + CellSystemConfigurator + NodeSizeCalculator.setNodeWidth/Height:
    //   - INSIDE 标签 → insideNodeLabelContainer (GridContainerCell 非 tabular; gap = labelCellSpacing
    //     = 2*labelLabelSpacing; padding = nodeLabels.padding; symmetry = !ASYMMETRICAL).
    //   - 每个 location 一个 LabelCell (横向模式): 宽 = max 标签宽, 高 = 标签高之和 + labelLabelSpacing 间隔.
    //   - OUTSIDE 标签 → 4 个 StripContainerCell (N/S 横向, W/E 纵向; 同 gap/symmetry;
    //     N.padding.bottom = S.padding.top = W.padding.right = E.padding.left = spacing.labelNode).
    //     NodeSizeCalculator: NODE_LABELS && !OUTSIDE_NODE_LABELS_OVERHANG 时
    //     width = max(width, N.minW, S.minW), height = max(height, E.minH, W.minH).
    const labelLabelSpacing = optNumSpacing(root, node, 'org.eclipse.elk.spacing.labelLabel', 0)
    const cellGap = 2 * labelLabelSpacing // NodeContext.labelCellSpacing
    const sizeOptions = parseEnumSet(jsonOpt<unknown>(node, 'org.eclipse.elk.nodeSize.options'))
    const symmetrical = !sizeOptions.includes('ASYMMETRICAL')
    const overhang = sizeOptions.includes('OUTSIDE_NODE_LABELS_OVERHANG')

    // LabelCell (横向模式): w = max 标签宽, h = 标签高之和, n = 标签数 (最小高 = h + (n-1)*labelLabelSpacing).
    const cell = (cur: { w: number; h: number; n: number } | undefined, w: number, h: number):
      { w: number; h: number; n: number } => {
      const c = cur ?? { w: 0, h: 0, n: 0 }
      c.w = Math.max(c.w, w)
      c.h += h
      c.n += 1
      return c
    }

    // ── INSIDE: GridContainerCell 最小尺寸 (非 tabular) ──
    // 宽度: 每行内各列求和 (含列间 gap) 再取行 max; 高度: sumWithGaps(行高, 行间 gap).
    const insideCells = new Map<string, { row: number; col: number; w: number; h: number; n: number }>()
    for (const label of labels) {
      const loc = resolveLabelLocation(node, label)
      if (!loc.startsWith('IN_')) continue
      const parts = loc.split('_')
      const row = 'TCB'.indexOf(parts[1] ?? '')
      const col = 'LCR'.indexOf(parts[2] ?? '')
      if (row < 0 || col < 0) continue
      const key = `${row}${col}`
      insideCells.set(key, { row, col, ...cell(insideCells.get(key), label.width ?? 0, label.height ?? 0) })
    }
    if (insideCells.size > 0) {
      const rowColWidths: number[][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
      const rowHeights: number[] = [0, 0, 0]
      for (const c of insideCells.values()) {
        rowColWidths[c.row]![c.col] = Math.max(rowColWidths[c.row]![c.col]!, c.w)
        rowHeights[c.row] = Math.max(rowHeights[c.row]!, c.h + Math.max(0, c.n - 1) * labelLabelSpacing)
      }
      let gridW = 0
      for (const widths of rowColWidths) {
        if (symmetrical) {
          const sym = Math.max(widths[0]!, widths[2]!)
          widths[0] = sym
          widths[2] = sym
        }
        gridW = Math.max(gridW, sumWithGaps(widths, cellGap))
      }
      if (symmetrical) {
        const sym = Math.max(rowHeights[0]!, rowHeights[2]!)
        rowHeights[0] = sym
        rowHeights[2] = sym
      }
      const gridH = sumWithGaps(rowHeights, cellGap)
      // GridContainerCell.getMinimumWidth/Height: 仅当内容 > 0 时才计入 padding, 否则贡献 0.
      if (gridW > 0) minW = Math.max(minW, gridW + pad.left + pad.right)
      if (gridH > 0) minH = Math.max(minH, gridH + pad.top + pad.bottom)
    }

    // ── OUTSIDE: StripContainerCell 最小尺寸 (仅 !OUTSIDE_NODE_LABELS_OVERHANG 时贡献) ──
    // N/S 为横向 strip: 贡献宽 = 各列 cell 最小宽求和 (列间 gap); W/E 为纵向 strip:
    // 贡献高 = 各行 cell 最小高求和 (行间 gap). cell 最小宽 = max 标签宽, 最小高 = 标签高之和
    // + labelLabelSpacing 间隔 (LabelCell 横向模式, 同 INSIDE).
    if (!overhang) {
      const nsCells: Record<'N' | 'S', ({ w: number; h: number; n: number } | undefined)[]> =
        { N: [undefined, undefined, undefined], S: [undefined, undefined, undefined] }
      const weCells: Record<'W' | 'E', ({ w: number; h: number; n: number } | undefined)[]> =
        { W: [undefined, undefined, undefined], E: [undefined, undefined, undefined] }
      for (const label of labels) {
        const loc = resolveLabelLocation(node, label)
        if (loc.startsWith('IN_')) continue
        const parts = loc.split('_')
        const v = parts[1] ?? ''
        const h = parts[2] ?? ''
        if (v === 'T' || v === 'B') {
          const col = 'LCR'.indexOf(h)
          if (col < 0) continue
          const side = v === 'T' ? 'N' : 'S'
          nsCells[side]![col] = cell(nsCells[side]![col], label.width ?? 0, label.height ?? 0)
        } else if (v === 'L' || v === 'R') {
          const row = 'TCB'.indexOf(h)
          if (row < 0) continue
          const side = v === 'L' ? 'W' : 'E'
          weCells[side]![row] = cell(weCells[side]![row], label.width ?? 0, label.height ?? 0)
        }
        // 其它 (UNDEFINED / 无效组合) → 不进 cell
      }
      // N/S: getMinimumWidth = sumWithGaps(colWidths) + padding.left/right (0).
      let outsideW = 0
      for (const side of ['N', 'S'] as const) {
        const widths = nsCells[side]!.map((c) => c?.w ?? 0)
        if (symmetrical) {
          const sym = Math.max(widths[0]!, widths[2]!)
          widths[0] = sym
          widths[2] = sym
        }
        outsideW = Math.max(outsideW, sumWithGaps(widths, cellGap))
      }
      // W/E: getMinimumHeight = sumWithGaps(rowHeights) + padding.top/bottom (0).
      let outsideH = 0
      for (const side of ['W', 'E'] as const) {
        const heights = weCells[side]!.map((c) => c ? c.h + Math.max(0, c.n - 1) * labelLabelSpacing : 0)
        if (symmetrical) {
          const sym = Math.max(heights[0]!, heights[2]!)
          heights[0] = sym
          heights[2] = sym
        }
        outsideH = Math.max(outsideH, sumWithGaps(heights, cellGap))
      }
      minW = Math.max(minW, outsideW)
      minH = Math.max(minH, outsideH)
    }
  }

  if (sizeConstraints.includes('PORTS')) {
    // N/S 端口 cell 贡献宽, E/W 端口 cell 贡献高 (CellSystemConfigurator).
    for (const side of ['NORTH', 'SOUTH'] as const) {
      const onSide = ports.filter((p) => portSideOf(p) === side)
      if (onSide.length === 0) continue
      const alignment = portAlignmentOf(node, side)
      const w = freePortsMinSize(onSide.map((p) => p.width ?? 0), spacing, alignment)
        + surrounding.left + surrounding.right
      minW = Math.max(minW, w)
    }
    for (const side of ['EAST', 'WEST'] as const) {
      const onSide = ports.filter((p) => portSideOf(p) === side)
      if (onSide.length === 0) continue
      const alignment = portAlignmentOf(node, side)
      const h = freePortsMinSize(onSide.map((p) => p.height ?? 0), spacing, alignment)
        + surrounding.top + surrounding.bottom
      minH = Math.max(minH, h)
    }
  }

  return { w: minW, h: minH }
}

/** Java sumWithGaps (GridContainerCell/StripContainerCell): 正值求和, 相邻正值间插 gap. */
function sumWithGaps(values: number[], gap: number): number {
  let sum = 0
  let active = 0
  for (const v of values) {
    if (v > 0) {
      sum += v
      active++
    }
  }
  return active > 1 ? sum + gap * (active - 1) : sum
}

/** 自由端口单侧最小尺寸 (HorizontalPortPlacementSizeCalculator.portWidthPlusPortPortSpacing). */
function freePortsMinSize(sizes: number[], spacing: number, alignment: PortAlignment): number {
  if (sizes.length === 0) return 0
  let result = sizes.reduce((a, b) => a + b, 0)
  if (sizes.length > 1) result += (sizes.length - 1) * spacing
  if (alignment === 'DISTRIBUTED') result += 2 * spacing
  return result
}

// ─────────────────────────────────────────────────────────────
// 3. 端口放置 (PortPlacementCalculator, 自由场景)

/**
 * 自由端口放置: NORTH/SOUTH 沿水平轴, EAST/WEST 沿垂直轴.
 * 放置顺序 = portContexts (Java TreeMultimap): 同侧 NORTH/EAST 输入序, SOUTH/WEST 反序.
 */
function placeFreePorts(root: ElkNode, node: ElkNode, ports: ElkPort[], _constraints: PortConstraints, nodeW: number, nodeH: number): void {
  const spacing = optNumSpacing(root, node, SPACING_PORT_PORT, 10)
  const surrounding = portsSurroundingOf(root, node)

  for (const side of ['NORTH', 'SOUTH'] as const) {
    const onSide = side === 'SOUTH' ? [...ports.filter((p) => portSideOf(p) === side)].reverse() : ports.filter((p) => portSideOf(p) === side)
    const positions = placeAlongAxis(onSide, nodeW, spacing, surrounding.left, surrounding.right, portAlignmentOf(node, side), (p) => p.width ?? 0)
    for (let i = 0; i < onSide.length; i++) {
      const port = onSide[i]!
      port.x = positions[i]!
      port.y = side === 'NORTH' ? -(port.height ?? 0) : nodeH
    }
  }
  for (const side of ['EAST', 'WEST'] as const) {
    const onSide = side === 'WEST' ? [...ports.filter((p) => portSideOf(p) === side)].reverse() : ports.filter((p) => portSideOf(p) === side)
    const positions = placeAlongAxis(onSide, nodeH, spacing, surrounding.top, surrounding.bottom, portAlignmentOf(node, side), (p) => p.height ?? 0)
    for (let i = 0; i < onSide.length; i++) {
      const port = onSide[i]!
      port.y = positions[i]!
      port.x = side === 'WEST' ? -(port.width ?? 0) : nodeW
    }
  }
}

/**
 * 单轴自由端口位置序列 (Java placeHorizontalFreePorts/placeVerticalFreePorts).
 * portMargin 全 0 (本移植不含端口标签; Java 仅在 PORT_LABELS 约束时设置).
 */
function placeAlongAxis(
  portsOnSide: ElkPort[],
  mainSize: number,
  spacing: number,
  surroundingMin: number,
  surroundingMax: number,
  alignment: PortAlignment,
  sizeOf: (p: ElkPort) => number,
): number[] {
  const n = portsOnSide.length
  if (n === 0) return []
  const sizes = portsOnSide.map(sizeOf)

  let minSize = sizes.reduce((a, b) => a + b, 0)
  if (n > 1) minSize += (n - 1) * spacing
  if (alignment === 'DISTRIBUTED') minSize += 2 * spacing

  const available = mainSize - surroundingMin - surroundingMax
  let current = surroundingMin
  let spaceBetween = spacing
  let a = alignment
  let min = minSize

  // 单端口 DISTRIBUTED/JUSTIFIED → CENTER (Java modifiedPortPlacementSize).
  if ((a === 'DISTRIBUTED' || a === 'JUSTIFIED') && n === 1) {
    if (a === 'DISTRIBUTED') min = minSize - 2 * spacing
    a = 'CENTER'
  }

  if (available < min) {
    // 不允许 overhang → 压缩间距 (Java: !PORTS_OVERHANG 分支; 默认无 PORTS_OVERHANG).
    if (a === 'DISTRIBUTED') {
      spaceBetween += (available - min) / (n + 1)
      current += spaceBetween
    } else {
      spaceBetween += (available - min) / (n - 1)
    }
  } else {
    switch (a) {
      case 'BEGIN': break
      case 'CENTER': current += (available - min) / 2; break
      case 'END': current += available - min; break
      case 'DISTRIBUTED': {
        const additional = (available - min) / (n + 1)
        spaceBetween += Math.max(0, additional)
        current += spaceBetween
        break
      }
      case 'JUSTIFIED': {
        const additional = (available - min) / (n - 1)
        spaceBetween += Math.max(0, additional)
        break
      }
    }
  }

  const positions: number[] = []
  for (let i = 0; i < n; i++) {
    positions.push(current)
    current += sizes[i]! + spaceBetween
  }
  return positions
}

// ─────────────────────────────────────────────────────────────
// 4. 标签放置 (NodeLabelLocation + LabelPlacer)

interface ElkLabelLike { text: string; x?: number; y?: number; width?: number; height?: number }

/** 标签 placement 解析 (label 级覆盖 node 级; Java NodeLabelCellCreator.handleNodeLabel). */
function labelPlacementOf(node: ElkNode, label: ElkLabelLike): string[] {
  const v = jsonOpt<unknown>(label as { layoutOptions?: Record<string, unknown>; properties?: Record<string, unknown> }, NODE_LABELS_PLACEMENT)
  const base = v !== undefined ? parseEnumSet(v) : parseEnumSet(jsonOpt<unknown>(node, NODE_LABELS_PLACEMENT))
  return base
}

/** 该标签是否有有效 INSIDE 位置 (Java NodeLabelLocation.isInsideLocation). */
function isInsideLabelPlacement(node: ElkNode, label: ElkLabelLike): boolean {
  const loc = resolveLabelLocation(node, label)
  return loc.startsWith('IN_')
}

/**
 * placement 集合 → NodeLabelLocation (Java NodeLabelLocation.fromNodeLabelPlacement:
 * 按枚举序逐位置精确匹配 assignedPlacements; 空集 → UNDEFINED).
 */
function resolveLabelLocation(node: ElkNode, label: ElkLabelLike): string {
  const set = labelPlacementOf(node, label)
  const key = [...set].sort().join(' ')
  const table: { loc: string; sets: string[][] }[] = [
    { loc: 'OUT_T_L', sets: [['OUTSIDE', 'V_TOP', 'H_LEFT']] },
    { loc: 'OUT_T_C', sets: [['OUTSIDE', 'V_TOP', 'H_CENTER'], ['OUTSIDE', 'V_TOP', 'H_CENTER', 'H_PRIORITY']] },
    { loc: 'OUT_T_R', sets: [['OUTSIDE', 'V_TOP', 'H_RIGHT']] },
    { loc: 'OUT_B_L', sets: [['OUTSIDE', 'V_BOTTOM', 'H_LEFT']] },
    { loc: 'OUT_B_C', sets: [['OUTSIDE', 'V_BOTTOM', 'H_CENTER'], ['OUTSIDE', 'V_BOTTOM', 'H_CENTER', 'H_PRIORITY']] },
    { loc: 'OUT_B_R', sets: [['OUTSIDE', 'V_BOTTOM', 'H_RIGHT']] },
    { loc: 'OUT_L_T', sets: [['OUTSIDE', 'H_LEFT', 'V_TOP', 'H_PRIORITY']] },
    { loc: 'OUT_L_C', sets: [['OUTSIDE', 'H_LEFT', 'V_CENTER'], ['OUTSIDE', 'H_LEFT', 'V_CENTER', 'H_PRIORITY']] },
    { loc: 'OUT_L_B', sets: [['OUTSIDE', 'H_LEFT', 'V_BOTTOM', 'H_PRIORITY']] },
    { loc: 'OUT_R_T', sets: [['OUTSIDE', 'H_RIGHT', 'V_TOP', 'H_PRIORITY']] },
    { loc: 'OUT_R_C', sets: [['OUTSIDE', 'H_RIGHT', 'V_CENTER'], ['OUTSIDE', 'H_RIGHT', 'V_CENTER', 'H_PRIORITY']] },
    { loc: 'OUT_R_B', sets: [['OUTSIDE', 'H_RIGHT', 'V_BOTTOM', 'H_PRIORITY']] },
    { loc: 'IN_T_L', sets: [['INSIDE', 'V_TOP', 'H_LEFT'], ['INSIDE', 'V_TOP', 'H_LEFT', 'H_PRIORITY']] },
    { loc: 'IN_T_C', sets: [['INSIDE', 'V_TOP', 'H_CENTER'], ['INSIDE', 'V_TOP', 'H_CENTER', 'H_PRIORITY']] },
    { loc: 'IN_T_R', sets: [['INSIDE', 'V_TOP', 'H_RIGHT'], ['INSIDE', 'V_TOP', 'H_RIGHT', 'H_PRIORITY']] },
    { loc: 'IN_C_L', sets: [['INSIDE', 'V_CENTER', 'H_LEFT'], ['INSIDE', 'V_CENTER', 'H_LEFT', 'H_PRIORITY']] },
    { loc: 'IN_C_C', sets: [['INSIDE', 'V_CENTER', 'H_CENTER'], ['INSIDE', 'V_CENTER', 'H_CENTER', 'H_PRIORITY']] },
    { loc: 'IN_C_R', sets: [['INSIDE', 'V_CENTER', 'H_RIGHT'], ['INSIDE', 'V_CENTER', 'H_RIGHT', 'H_PRIORITY']] },
    { loc: 'IN_B_L', sets: [['INSIDE', 'V_BOTTOM', 'H_LEFT'], ['INSIDE', 'V_BOTTOM', 'H_LEFT', 'H_PRIORITY']] },
    { loc: 'IN_B_C', sets: [['INSIDE', 'V_BOTTOM', 'H_CENTER'], ['INSIDE', 'V_BOTTOM', 'H_CENTER', 'H_PRIORITY']] },
    { loc: 'IN_B_R', sets: [['INSIDE', 'V_BOTTOM', 'H_RIGHT'], ['INSIDE', 'V_BOTTOM', 'H_RIGHT', 'H_PRIORITY']] },
  ]
  for (const { loc, sets } of table) {
    for (const s of sets) {
      if ([...s].sort().join(' ') === key) return loc
    }
  }
  return 'UNDEFINED'
}

/** 放置标签 (Java LabelPlacer; 仅有效位置; UNDEFINED 不动). */
function placeLabels(root: ElkNode, node: ElkNode, labels: ElkLabelLike[], nodeW: number, nodeH: number): void {
  const pad = nodeLabelsPaddingOf(root, node)
  const spacing = optNumSpacing(root, node, SPACING_LABEL_NODE, 5)
  const gap = optNumSpacing(root, node, 'org.eclipse.elk.spacing.labelLabel', 0)

  // INSIDE: 每个 location 一个 LabelCell (横向模式: 纵向堆叠, 宽取 max), cell 矩形 = 节点矩形 - padding.
  const insideGroups = new Map<string, ElkLabelLike[]>()
  for (const label of labels) {
    const loc = resolveLabelLocation(node, label)
    if (!loc.startsWith('IN_')) continue
    const arr = insideGroups.get(loc) ?? []
    arr.push(label)
    insideGroups.set(loc, arr)
  }
  const cellX = pad.left
  const cellY = pad.top
  const cellW = Math.max(0, nodeW - pad.left - pad.right)
  const cellH = Math.max(0, nodeH - pad.top - pad.bottom)
  for (const [loc, group] of insideGroups) {
    const vAlign = loc.split('_')[1]! // T | C | B
    const hAlign = loc.split('_')[2]! // L | C | R
    const stackH = group.reduce((a, l) => a + (l.height ?? 0), 0) + Math.max(0, group.length - 1) * gap
    let y: number
    if (vAlign === 'T') y = cellY
    else if (vAlign === 'B') y = cellY + cellH - stackH
    else y = cellY + (cellH - stackH) / 2
    for (const label of group) {
      const w = label.width ?? 0
      const h = label.height ?? 0
      let x: number
      if (hAlign === 'L') x = cellX
      else if (hAlign === 'R') x = cellX + cellW - w
      else x = cellX + (cellW - w) / 2
      label.x = x
      label.y = y
      y += h + gap
    }
  }

  // OUTSIDE: 单标签位置 (多标签同 location 的 cell 堆叠未移植, 见文件头注释).
  for (const label of labels) {
    const loc = resolveLabelLocation(node, label)
    if (loc.startsWith('IN_')) continue
    const w = label.width ?? 0
    const h = label.height ?? 0
    let x: number | undefined
    let y: number | undefined
    switch (loc) {
      case 'OUT_T_L': x = 0; y = -(h + spacing); break
      case 'OUT_T_C': x = (nodeW - w) / 2; y = -(h + spacing); break
      case 'OUT_T_R': x = nodeW - w; y = -(h + spacing); break
      case 'OUT_B_L': x = 0; y = nodeH + spacing; break
      case 'OUT_B_C': x = (nodeW - w) / 2; y = nodeH + spacing; break
      case 'OUT_B_R': x = nodeW - w; y = nodeH + spacing; break
      case 'OUT_L_T': x = -(w + spacing); y = 0; break
      case 'OUT_L_C': x = -(w + spacing); y = (nodeH - h) / 2; break
      case 'OUT_L_B': x = -(w + spacing); y = nodeH - h; break
      case 'OUT_R_T': x = nodeW + spacing; y = 0; break
      case 'OUT_R_C': x = nodeW + spacing; y = (nodeH - h) / 2; break
      case 'OUT_R_B': x = nodeW + spacing; y = nodeH - h; break
      default: continue // UNDEFINED → 位置不动
    }
    label.x = x
    label.y = y
  }
}

// ─────────────────────────────────────────────────────────────
// 5. 节点 margin (NodeMarginCalculator.processNode)

/** 包围盒 union (ElkRectangle.union 语义). */
function unionBox(
  box: { x: number; y: number; w: number; h: number },
  x: number, y: number, w: number, h: number,
): void {
  if (w <= 0 && h <= 0) return
  const minX = Math.min(box.x, x)
  const minY = Math.min(box.y, y)
  const maxX = Math.max(box.x + box.w, x + w)
  const maxY = Math.max(box.y + box.h, y + h)
  box.x = minX
  box.y = minY
  box.w = maxX - minX
  box.h = maxY - minY
}

/** 计算并写入节点 margins (Java NodeMarginCalculator.processNode). */
function setNodeMargins(node: ElkNode, nodeW: number, nodeH: number): void {
  const box = { x: 0, y: 0, w: nodeW, h: nodeH }
  for (const label of node.labels ?? []) {
    unionBox(box, label.x ?? 0, label.y ?? 0, label.width ?? 0, label.height ?? 0)
  }
  for (const port of node.ports ?? []) {
    unionBox(box, port.x ?? 0, port.y ?? 0, port.width ?? 0, port.height ?? 0)
  }
  const margin = {
    top: Math.max(0, -box.y),
    bottom: Math.max(0, box.y + box.h - nodeH),
    left: Math.max(0, -box.x),
    right: Math.max(0, box.x + box.w - nodeW),
  }
  node.layoutOptions = { ...node.layoutOptions, [MARGINS]: margin }
}
