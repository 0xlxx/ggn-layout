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
 * ELK cell 系统最小尺寸计算 (NodeLabelAndSizeCalculator 7 阶段移植, 尺寸部分).
 *
 * 对照 Java (ELK 0.12.0):
 *   plugins/org.eclipse.elk.alg.common/.../nodespacing/
 *     NodeLabelAndSizeCalculator.java  (7 阶段编排)
 *     internal/NodeContext.java / PortContext.java
 *     internal/algorithm/*.java        (各阶段)
 *     cellsystem/*.java                (AtomicCell/LabelCell/Strip/Grid)
 *
 * 语义要点 (均按 Java 原样复刻):
 *   - 网格叠加 (contribution flags) 而非 max 合并; AtomicCell content 维度为 0 时不参与 min 尺寸;
 *   - Strip/Grid 对称 (无 ASYMMETRICAL 时 outer 行/列取 max);
 *   - 端口对齐默认 DISTRIBUTED → 端口侧 cell 需要 2*portPort 环绕间距;
 *   - 负 borderOffset / FIXED 端口标签 insidePart → nodeContainer padding;
 *   - 仅返回 cell 最小尺寸; MINIMUM_SIZE / fixedGraphSize / topdown 由调用方处理.
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { IProperty } from '../graph/properties.js'
import { PortSide } from '../graph/enums.js'
import {
  NODE_SIZE_CONSTRAINTS, NODE_SIZE_OPTIONS, PORT_CONSTRAINTS,
  PORT_LABELS_PLACEMENT, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING, NODE_LABELS_PADDING,
  SPACING_LABEL_LABEL, SPACING_LABEL_NODE, SPACING_LABEL_PORT_HORIZONTAL, SPACING_LABEL_PORT_VERTICAL,
  PORT_BORDER_OFFSET, NODE_LABELS_PLACEMENT, PORT_ALIGNMENT_DEFAULT, PORT_ALIGNMENT_NORTH,
  PORT_ALIGNMENT_SOUTH, PORT_ALIGNMENT_EAST, PORT_ALIGNMENT_WEST,
  INSIDE_SELF_LOOPS_ACTIVATE,
} from '../options/layered-options.js'

export interface Padding { top: number; left: number; bottom: number; right: number }
const ZERO: Padding = { top: 0, left: 0, bottom: 0, right: 0 }
const CLONE = (p: Padding): Padding => ({ ...p })
/** 四侧遍历顺序 (ELK 遍历固定为 NORTH/SOUTH/EAST/WEST — 与 Java 一致, 不改). */
const SIDES: PortSide[] = [PortSide.NORTH, PortSide.SOUTH, PortSide.EAST, PortSide.WEST]

// ────────────────────────────────────────────────────────────────
// Cell primitives (cellsystem/*.java)
// ────────────────────────────────────────────────────────────────

export interface Rect { x: number; y: number; width: number; height: number }

abstract class Cell {
  padding: Padding = CLONE(ZERO)
  // Java Cell 默认 false; CellSystemConfigurator 按约束置 true.
  contributesMinWidth = false
  contributesMinHeight = false
  /** 布局后矩形 (layoutChildrenHorizontally/Vertically 写入). */
  rect: Rect = { x: 0, y: 0, width: 0, height: 0 }
  abstract getMinimumWidth(): number
  abstract getMinimumHeight(): number
}

class AtomicCell extends Cell {
  content = { x: 0, y: 0 }
  getMinimumWidth(): number { return this.content.x + this.padding.left + this.padding.right }
  getMinimumHeight(): number { return this.content.y + this.padding.top + this.padding.bottom }
}

type HAlign = 'LEFT' | 'CENTER' | 'RIGHT'
type VAlign = 'TOP' | 'CENTER' | 'BOTTOM'

class LabelCell extends Cell {
  content = { x: 0, y: 0 }
  private gap: number
  /** 持有的 label 对象 (可写 position; ELK LabelAdapter). */
  private labelRefs: { position: { x: number; y: number }; size: { x: number; y: number } }[] = []
  private hAlign: HAlign = 'CENTER'
  private vAlign: VAlign = 'CENTER'
  constructor(gap: number) { super(); this.gap = gap }
  addLabel(w: number, h: number, ref?: { position: { x: number; y: number }; size: { x: number; y: number } }): void {
    if (this.content.y > 0) this.content.y += this.gap
    this.content.x = Math.max(this.content.x, w)
    this.content.y += h
    if (ref) this.labelRefs.push(ref)
  }
  setHorizontalAlignment(a: HAlign): void { this.hAlign = a }
  setVerticalAlignment(a: VAlign): void { this.vAlign = a }
  getLabels(): { position: { x: number; y: number }; size: { x: number; y: number } }[] { return this.labelRefs }
  /**
   * LabelCell.applyLabelLayout (horizontal mode): 按 cell rect + 对齐放置标签.
   * 注意: cell rect 对端口标签是相对端口的, 因此写出的 label.position 也是相对端口 (ELK 语义).
   */
  applyLabelLayout(): void {
    const cellRect = this.rect
    let yPos = cellRect.y
    if (this.vAlign === 'CENTER') yPos += (cellRect.height - this.content.y) / 2
    else if (this.vAlign === 'BOTTOM') yPos += cellRect.height - this.content.y
    for (const label of this.labelRefs) {
      const lw = label.size.x
      label.position.y = yPos
      yPos += label.size.y + this.gap
      if (this.hAlign === 'LEFT') label.position.x = cellRect.x + this.padding.left
      else if (this.hAlign === 'CENTER') label.position.x = cellRect.x + this.padding.left + (cellRect.width - lw) / 2
      else label.position.x = cellRect.x + cellRect.width - this.padding.right - lw
    }
  }
  getMinimumWidth(): number { return this.content.x + this.padding.left + this.padding.right }
  getMinimumHeight(): number { return this.content.y + this.padding.top + this.padding.bottom }
}

/** ContainerCell.minWidthOfCell/minHeightOfCell: AtomicCell content 维度为 0 → 0. */
function minWidthOf(c: Cell | null, respect: boolean): number {
  if (c === null) return 0
  if (respect && !c.contributesMinWidth) return 0
  if (c instanceof AtomicCell && c.content.x === 0) return 0
  return c.getMinimumWidth()
}
/** minWidthOfCell/minHeightOfCell 的 respect=false 变体: AtomicCell content 维度 0 仍返回 0. */
function rawWidthOf(c: Cell | null): number {
  if (c === null) return 0
  if (c instanceof AtomicCell && c.content.x === 0) return 0
  return c.getMinimumWidth()
}
function rawHeightOf(c: Cell | null): number {
  if (c === null) return 0
  if (c instanceof AtomicCell && c.content.y === 0) return 0
  return c.getMinimumHeight()
}

function minHeightOf(c: Cell | null, respect: boolean): number {
  if (c === null) return 0
  if (respect && !c.contributesMinHeight) return 0
  if (c instanceof AtomicCell && c.content.y === 0) return 0
  return c.getMinimumHeight()
}

class StripContainerCell extends Cell {
  mode: 'VERTICAL' | 'HORIZONTAL'
  symmetrical: boolean
  gap: number
  /** [BEGIN, CENTER, END] */
  cells: (Cell | null)[] = [null, null, null]
  constructor(mode: 'VERTICAL' | 'HORIZONTAL', symmetrical: boolean, gap: number) {
    super(); this.mode = mode; this.symmetrical = symmetrical; this.gap = gap
  }
  getMinimumWidth(): number {
    let width: number
    if (this.mode === 'VERTICAL') {
      // 免中间数组: reduce(max, 0) 语义 = Math.max(0, w0, w1, w2) (求和顺序不变).
      width = Math.max(0, minWidthOf(this.cells[0], true), minWidthOf(this.cells[1], true), minWidthOf(this.cells[2], true))
    } else {
      let w0 = minWidthOf(this.cells[0], true)
      const w1 = minWidthOf(this.cells[1], true)
      let w2 = minWidthOf(this.cells[2], true)
      if (this.symmetrical) { w0 = Math.max(w0, w2); w2 = w0 }
      let sum = 0; let active = 0
      if (w0 > 0) { sum += w0; active++ }
      if (w1 > 0) { sum += w1; active++ }
      if (w2 > 0) { sum += w2; active++ }
      width = active > 1 ? sum + this.gap * (active - 1) : sum
    }
    return width > 0 ? width + this.padding.left + this.padding.right : 0
  }
  getMinimumHeight(): number {
    let height: number
    if (this.mode === 'VERTICAL') {
      let h0 = minHeightOf(this.cells[0], true)
      const h1 = minHeightOf(this.cells[1], true)
      let h2 = minHeightOf(this.cells[2], true)
      if (this.symmetrical) { h0 = Math.max(h0, h2); h2 = h0 }
      let sum = 0; let active = 0
      if (h0 > 0) { sum += h0; active++ }
      if (h1 > 0) { sum += h1; active++ }
      if (h2 > 0) { sum += h2; active++ }
      height = active > 1 ? sum + this.gap * (active - 1) : sum
    } else {
      height = Math.max(0, minHeightOf(this.cells[0], true), minHeightOf(this.cells[1], true), minHeightOf(this.cells[2], true))
    }
    return height > 0 ? height + this.padding.top + this.padding.bottom : 0
  }
}

class GridContainerCell extends Cell {
  symmetrical: boolean
  gap: number
  /** 3x3: cells[row][col] (BEGIN/CENTER/END) */
  cells: (Cell | null)[][] = [[null, null, null], [null, null, null], [null, null, null]]
  constructor(symmetrical: boolean, gap: number) { super(); this.symmetrical = symmetrical; this.gap = gap }
  private minHeightOfRow(row: number, respect: boolean): number {
    let max = 0
    for (let c = 0; c < 3; c++) max = Math.max(max, minHeightOf(this.cells[row]![c], respect))
    return max
  }
  /** 单行三列 min 宽按 BEGIN/CENTER/END 顺序累加 (与 sumWithGaps 语义一致, 免数组).
   * 注意: Java Grid 列宽不做对称 (仅行高 minRowHeights 对称), 此处不可加 symmetrical. */
  private minColumnWidthSum(row: number, respect: boolean): number {
    const cells = this.cells[row]!
    const w0 = minWidthOf(cells[0], respect)
    const w1 = minWidthOf(cells[1], respect)
    const w2 = minWidthOf(cells[2], respect)
    let sum = 0; let active = 0
    if (w0 > 0) { sum += w0; active++ }
    if (w1 > 0) { sum += w1; active++ }
    if (w2 > 0) { sum += w2; active++ }
    return active > 1 ? sum + this.gap * (active - 1) : sum
  }
  getMinimumWidth(): number {
    // 行序 0,1,2 取 max (与 `for row 0..2 width=max(width, sum)` 顺序一致).
    const width = Math.max(this.minColumnWidthSum(0, true), this.minColumnWidthSum(1, true), this.minColumnWidthSum(2, true))
    return width > 0 ? width + this.padding.left + this.padding.right : 0
  }
  getMinimumHeight(): number {
    let h0 = this.minHeightOfRow(0, true)
    const h1 = this.minHeightOfRow(1, true)
    let h2 = this.minHeightOfRow(2, true)
    if (this.symmetrical) { h0 = Math.max(h0, h2); h2 = h0 }
    let sum = 0; let active = 0
    if (h0 > 0) { sum += h0; active++ }
    if (h1 > 0) { sum += h1; active++ }
    if (h2 > 0) { sum += h2; active++ }
    const h = active > 1 ? sum + this.gap * (active - 1) : sum
    return h > 0 ? h + this.padding.top + this.padding.bottom : 0
  }
}

// ────────────────────────────────────────────────────────────────
// 上下文
// ────────────────────────────────────────────────────────────────

interface PortMargin { left: number; right: number; top: number; bottom: number }
interface PortCtx {
  port: LPort
  margin: PortMargin
  labelsNextToPort: boolean
  labelCell: LabelCell | null
  /** FIXED 端口标签的 bounds (相对端口), 供固定分支 margin 与 insidePart 使用. */
  fixedLabelBounds: { x: number; y: number; w: number; h: number } | null
}

export interface CellCtx {
  node: LNode
  graph: LGraph | null
  treatAsCompoundNode: boolean
  /** ELK areSizeConstraintsFixed: 空约束或仅 PORT_LABELS → 节点尺寸不参与 cell 计算. */
  sizeFixed: boolean
  constraints: string[]
  sizeOptions: string[]
  portConstraints: string
  portLabelsPlacement: string[]
  portLabelsTreatAsGroup: boolean
  symmetry: boolean
  portPort: number
  surrounding: Padding
  nodeLabelsPadding: Padding
  labelLabelSpacing: number
  labelCellSpacing: number
  nodeLabelSpacing: number
  portLabelSpacingH: number
  portLabelSpacingV: number
  portContexts: Map<PortSide, PortCtx[]>
  /** 是否至少一个端口有标签 cell (免 placePortLabels 空扫描). */
  hasPortLabelCells: boolean
  nodeContainer: StripContainerCell
  middleRow: StripContainerCell
  insideGrid: GridContainerCell
  insidePortLabelCells: Map<PortSide, AtomicCell>
  outsideNodeLabelContainers: Map<PortSide, StripContainerCell>
}

function nodeOrGraphProp<T>(node: LNode, graph: LGraph | null, key: IProperty<T>, def: T): T {
  // ggn getProperty 未设置时返回默认值 — 必须先 hasProperty 判断 (不能把默认值当显式值).
  // node/graph 共用同一 property key (ELK targets parents + nodes), 免每调用 6 个闭包.
  if (node.hasProperty(key)) return node.getProperty(key)
  if (graph && graph.hasProperty(key)) return graph.getProperty(key)
  return def
}

function getPortAlignment(ctx: CellCtx, side: PortSide): string {
  const key = side === PortSide.NORTH ? PORT_ALIGNMENT_NORTH
    : side === PortSide.SOUTH ? PORT_ALIGNMENT_SOUTH
    : side === PortSide.EAST ? PORT_ALIGNMENT_EAST : PORT_ALIGNMENT_WEST
  const v = ctx.node.hasProperty(key) ? ctx.node.getProperty(key) : undefined
  if (v && v !== 'DISTRIBUTED') return v
  return nodeOrGraphProp(ctx.node, ctx.graph, PORT_ALIGNMENT_DEFAULT, 'DISTRIBUTED')
}

function isFixedPortLabels(placement: string[]): boolean {
  return !placement.includes('INSIDE') && !placement.includes('OUTSIDE')
}

/** 端口标签 bounds (相对端口): 所有标签的并集. */
function portLabelBounds(port: LPort): { x: number; y: number; w: number; h: number } | null {
  const labels = port.getLabels()
  if (labels.length === 0) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const l of labels) {
    minX = Math.min(minX, l.position.x); minY = Math.min(minY, l.position.y)
    maxX = Math.max(maxX, l.position.x + l.size.x); maxY = Math.max(maxY, l.position.y + l.size.y)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// ────────────────────────────────────────────────────────────────
// 阶段实现
// ────────────────────────────────────────────────────────────────

/** Phase 1: PortContextCreator — 建端口上下文 + 端口标签 cell (非 FIXED 时). */
function createPortContexts(ctx: CellCtx, ignoreInsidePortLabels: boolean): void {
  for (const side of SIDES) ctx.portContexts.set(side, [])
  const fixed = isFixedPortLabels(ctx.portLabelsPlacement)
  // ELK PortContextCreator: imPortLabels = !ignoreInsidePortLabels || !placement.contains(INSIDE)
  const collect = !fixed && (!ignoreInsidePortLabels || !ctx.portLabelsPlacement.includes('INSIDE'))
  const wantsNextToPort = ctx.portLabelsPlacement.includes('NEXT_TO_PORT_IF_POSSIBLE')
  for (const port of ctx.node.getPorts()) {
    const side = port.getSide()
    if (side === PortSide.UNDEFINED) continue
    // ELK PortContext.labelsNextToPort: INSIDE → 扁平节点 true (compound 需 NEXT_TO_PORT 且无内部连接);
    // OUTSIDE → NEXT_TO_PORT 且无连接; FIXED → false.
    let labelsNextToPort = false
    if (ctx.portLabelsPlacement.includes('INSIDE')) {
      labelsNextToPort = true
      if (ctx.treatAsCompoundNode) labelsNextToPort = wantsNextToPort
    } else if (ctx.portLabelsPlacement.includes('OUTSIDE')) {
      labelsNextToPort = wantsNextToPort && port.getConnectedEdges().length === 0
    }
    const pc: PortCtx = {
      port,
      margin: { left: 0, right: 0, top: 0, bottom: 0 },
      labelsNextToPort,
      labelCell: null,
      fixedLabelBounds: fixed ? portLabelBounds(port) : null,
    }
    if (collect) {
      const labels = port.getLabels()
      if (labels.length > 0) {
        const lc = new LabelCell(ctx.labelCellSpacing)
        for (const l of labels) lc.addLabel(l.size.x, l.size.y, l)
        pc.labelCell = lc
        ctx.hasPortLabelCells = true
      }
    }
    ctx.portContexts.get(side)!.push(pc)
  }
}

/** Phase 1: NodeLabelCellCreator — inside 标签入网格; outside 标签入对应容器. */
function createNodeLabelCells(ctx: CellCtx): void {
  const grid = ctx.insideGrid
  grid.padding = CLONE(ctx.nodeLabelsPadding)
  const outside = ctx.outsideNodeLabelContainers
  const nodePlacement = ctx.node.getProperty(NODE_LABELS_PLACEMENT)
  for (const label of ctx.node.getLabels()) {
    // 免重复 split/filter/map: 一次解析 placement 元素 (去括号 trim 空串).
    const plRaw = Array.isArray(label.placement) ? label.placement
      : String(label.placement ?? '').split(/[\s,]+/)
    const pl: string[] = []
    for (const x of plRaw) {
      const t = x.replace(/^\[+|\]+$/g, '').trim()
      if (t) pl.push(t)
    }
    const eff: string[] = pl.length > 0 ? pl : nodePlacement ?? []
    const inside = eff.includes('INSIDE')
    const v = eff.includes('V_BOTTOM') ? 'bottom' : eff.includes('V_CENTER') ? 'center' : 'top'
    const h = eff.includes('H_RIGHT') ? 'right' : eff.includes('H_LEFT') ? 'left' : 'center'
    const row = v === 'bottom' ? 2 : v === 'center' ? 1 : 0
    const col = h === 'right' ? 2 : h === 'left' ? 0 : 1
    if (inside) {
      let cell = grid.cells[row]![col] as LabelCell | null
      if (!cell) { cell = new LabelCell(ctx.labelCellSpacing); grid.cells[row]![col] = cell }
      cell.addLabel(label.size.x, label.size.y)
    } else {
      // OUTSIDE: N/S 容器 (HORIZONTAL strip, col=BEGIN/CENTER/END); W/E 容器 (VERTICAL strip, row=...)
      let container: StripContainerCell
      if (v === 'bottom') container = outside.get(PortSide.SOUTH)!
      else if (h === 'left' && (eff.includes('H_PRIORITY') || v === 'center')) container = outside.get(PortSide.WEST)!
      else if (h === 'right' && (eff.includes('H_PRIORITY') || v === 'center')) container = outside.get(PortSide.EAST)!
      else container = outside.get(PortSide.NORTH)!
      const cell = new LabelCell(ctx.labelCellSpacing)
      cell.addLabel(label.size.x, label.size.y)
      // N/S 容器是 HORIZONTAL strip: [BEGIN,CENTER,END]; W/E 是 VERTICAL strip: 放 CENTER.
      if (container.mode === 'HORIZONTAL') container.cells[col] = cell
      else container.cells[1] = cell
    }
  }
}

/** Phase 2: setupNodePaddingForPortsWithOffset — 负 borderOffset + FIXED 标签 insidePart → nodeContainer padding. */
function setupNodePaddingForPortsWithOffset(ctx: CellCtx): void {
  const pad = ctx.nodeContainer.padding
  for (const [side, ports] of ctx.portContexts) {
    for (const pc of ports) {
      const borderOffset = pc.port.getProperty(PORT_BORDER_OFFSET) ?? 0
      if (borderOffset < 0) {
        const extend = -borderOffset
        if (side === PortSide.NORTH) pad.top = Math.max(pad.top, extend)
        else if (side === PortSide.SOUTH) pad.bottom = Math.max(pad.bottom, extend)
        else if (side === PortSide.EAST) pad.right = Math.max(pad.right, extend)
        else pad.left = Math.max(pad.left, extend)
      }
      if (isFixedPortLabels(ctx.portLabelsPlacement) && pc.fixedLabelBounds) {
        const b = pc.fixedLabelBounds
        const ps = pc.port.size
        let insidePart = 0
        if (side === PortSide.NORTH) insidePart = Math.max(0, b.h + b.y - (ps.y + borderOffset))
        else if (side === PortSide.SOUTH) insidePart = Math.max(0, -b.y - borderOffset)
        else if (side === PortSide.EAST) insidePart = Math.max(0, -b.x - borderOffset)
        else insidePart = Math.max(0, b.w + b.x - (ps.x + borderOffset))
        const symmetry = ctx.symmetry
        if (side === PortSide.NORTH) {
          const bigger = insidePart > pad.top
          pad.top = Math.max(pad.top, insidePart)
          if (symmetry && bigger) { pad.top = Math.max(pad.top, pad.bottom); pad.bottom = pad.top + borderOffset }
        } else if (side === PortSide.SOUTH) {
          const bigger = insidePart > pad.bottom
          pad.bottom = Math.max(pad.bottom, insidePart)
          if (symmetry && bigger) { pad.bottom = Math.max(pad.bottom, pad.top); pad.top = pad.bottom + borderOffset }
        } else if (side === PortSide.EAST) {
          const bigger = insidePart > pad.right
          pad.right = Math.max(pad.right, insidePart)
          if (symmetry && bigger) { pad.right = Math.max(pad.left, pad.right); pad.left = pad.right + borderOffset }
        } else {
          const bigger = insidePart > pad.left
          pad.left = Math.max(pad.left, insidePart)
          if (symmetry && bigger) { pad.left = Math.max(pad.left, pad.right); pad.right = pad.left + borderOffset }
        }
      }
    }
  }
}

/**
 * Java CellSystemConfigurator.updateVerticalInsidePortLabelCellPadding (phase 6):
 * E/W inside port label cell 的 top/bottom padding 减掉「nodeContainer padding + N/S cell minH +
 * labelCellSpacing」的边框偏移 — 端口外环绕间距会落在 nodeContainer padding / N/S cell 已占空间内,
 * 避免重复计入 → 节点高度更紧凑 (flexible_ports graph01: E/W padding 10/10+10=30 → 9/9+10=28, jar 实证).
 * 仅 free 端口放置 (FIXED_RATIO/FIXED_POS 提前返回, Java 语义).
 */
function updateVerticalInsidePortLabelCellPadding(ctx: CellCtx): void {
  const pc = ctx.portConstraints
  if (pc === 'FIXED_RATIO' || String(pc) === 'FIXED_RATIO' || pc === 'FIXED_POS' || String(pc) === 'FIXED_POSITION') return
  const eCell = ctx.insidePortLabelCells.get(PortSide.EAST)!
  const wCell = ctx.insidePortLabelCells.get(PortSide.WEST)!
  const nCell = ctx.insidePortLabelCells.get(PortSide.NORTH)!
  const sCell = ctx.insidePortLabelCells.get(PortSide.SOUTH)!
  const topBorderOffset = ctx.nodeContainer.padding.top + nCell.getMinimumHeight() + ctx.labelCellSpacing
  const bottomBorderOffset = ctx.nodeContainer.padding.bottom + sCell.getMinimumHeight() + ctx.labelCellSpacing
  // Java 取 east/west 两 cell 的 max (空侧 cell padding=0 不能把有端口侧拖成 0 — graph01 n1_2 实证)
  const topPadding = Math.max(0, eCell.padding.top - topBorderOffset, wCell.padding.top - topBorderOffset)
  const bottomPadding = Math.max(0, eCell.padding.bottom - bottomBorderOffset, wCell.padding.bottom - bottomBorderOffset)
  eCell.padding.top = topPadding
  wCell.padding.top = topPadding
  eCell.padding.bottom = bottomPadding
  wCell.padding.bottom = bottomPadding
}

/**
 * Phase 3 端口尺寸: N/S → cell.content.x; E/W → cell.content.y.
 * 对齐 Horizontal/VerticalPortPlacementSizeCalculator.
 */
function calculatePortPlacementSize(ctx: CellCtx): void {
  for (const side of SIDES) {
    const cell = ctx.insidePortLabelCells.get(side)!
    const ports = ctx.portContexts.get(side)!
    if (ports.length === 0) {
      // 无端口: 清空 padding (Java 置 0); N/S 垂直 padding 例外 —
      // Java InsidePortLabelCellCreator.setupNorthOrSouthPortLabelCell 无条件设
      // N top / S bottom = portLabelSpacingV (HorizontalPortPlacementSizeCalculator 空端口分支只清 left/right),
      // 使 NORTH/SOUTH cell minH = portLabelSpacingV → 影响 updateVerticalInsidePortLabelCellPadding 的
      // topBorderOffset (flexible_ports graph01: E/W padding 10→9, 节点高 30→28 实证).
      if (side === PortSide.NORTH || side === PortSide.SOUTH) {
        cell.padding.left = 0; cell.padding.right = 0
        if (ctx.portLabelSpacingV >= 0) {
          if (side === PortSide.NORTH) cell.padding.top = ctx.portLabelSpacingV
          else cell.padding.bottom = ctx.portLabelSpacingV
        }
      } else { cell.padding.top = 0; cell.padding.bottom = 0 }
      continue
    }
    // padding = surrounding
    if (side === PortSide.NORTH || side === PortSide.SOUTH) {
      cell.padding.left = ctx.surrounding.left
      cell.padding.right = ctx.surrounding.right
      // InsidePortLabelCellCreator.setupNorthOrSouthPortLabelCell: N top / S bottom = portLabelSpacingV
      // (负 spacing 不用 — ELK 注释: 避免增大节点; 701 LabelInside 88 = 18+44+18+8 实测).
      if (ctx.portLabelSpacingV >= 0) {
        if (side === PortSide.NORTH) cell.padding.top = ctx.portLabelSpacingV
        else cell.padding.bottom = ctx.portLabelSpacingV
      }
    } else {
      cell.padding.top = ctx.surrounding.top
      cell.padding.bottom = ctx.surrounding.bottom
    }
    if (ctx.constraints.includes('PORT_LABELS')) setupPortMargins(ctx, side)
    const isHoriz = side === PortSide.NORTH || side === PortSide.SOUTH
    let size = 0
    for (let i = 0; i < ports.length; i++) {
      const pc = ports[i]!
      size += (isHoriz ? pc.margin.left + pc.port.size.x + pc.margin.right : pc.margin.top + pc.port.size.y + pc.margin.bottom)
      if (i < ports.length - 1) size += ctx.portPort
    }
    if (getPortAlignment(ctx, side) === 'DISTRIBUTED') size += 2 * ctx.portPort
    if (isHoriz) cell.content.x = size
    else cell.content.y = size
    // PortLabelPlacementCalculator.simpleInsidePortLabelPlacement (Phase5): INSIDE 标签 → N/S cell content.y
    // = 最大标签 cell 高 (对称使 N/S 等高 → 节点增高; 701 LabelInside 52→88 实测).
    // constrainedPlacement (FIXED_POS / 无 PORT_LABELS 约束) 不增长.
    const freePlacement = ctx.portConstraints !== 'FIXED_POS' && String(ctx.portConstraints) !== 'FIXED_POSITION'
    if (isHoriz && ctx.portLabelsPlacement.includes('INSIDE')
      && ctx.constraints.includes('PORT_LABELS') && freePlacement) {
      let maxH = 0
      for (const pc of ports) if (pc.labelCell) maxH = Math.max(maxH, pc.labelCell.getMinimumHeight())
      if (maxH > 0) cell.content.y = maxH
    }
    // InsidePortLabelCellCreator.setupEastOrWestPortLabelCell: INSIDE 标签 → E/W cell 宽 = 最大标签宽
    // (calculateWidthDueToLabels); content.x>0 时加 portLabelSpacingH padding.
    if (!isHoriz && ctx.portLabelsPlacement.includes('INSIDE')) {
      let maxW = 0
      for (const pc of ports) if (pc.labelCell) maxW = Math.max(maxW, pc.labelCell.getMinimumWidth())
      if (maxW > 0) {
        cell.content.x = maxW
        if (side === PortSide.EAST) cell.padding.right = ctx.portLabelSpacingH
        else cell.padding.left = ctx.portLabelSpacingH
      }
    }
  }
}

/** setupPortMargins (H/V 共用): 标签 margin + outside 首尾归零 + uniform 统一. */
function setupPortMargins(ctx: CellCtx, side: PortSide): void {
  const ports = ctx.portContexts.get(side)!
  const outside = ctx.portLabelsPlacement.includes('OUTSIDE')
  const uniform = ctx.sizeOptions.includes('UNIFORM_PORT_SPACING')
  // compute margins
  for (const pc of ports) {
    const lw = pc.labelCell ? pc.labelCell.getMinimumWidth() : 0
    const lh = pc.labelCell ? pc.labelCell.getMinimumHeight() : 0
    if (pc.labelCell) {
      const isHoriz = side === PortSide.NORTH || side === PortSide.SOUTH
      if (isHoriz) {
        if (pc.labelsNextToPort) {
          const pw = pc.port.size.x
          if (lw > pw) { const o = (lw - pw) / 2; pc.margin.left = o; pc.margin.right = o }
        } else {
          pc.margin.right = ctx.portLabelSpacingH + lw
        }
      } else {
        if (pc.labelsNextToPort) {
          const ph = pc.port.size.y
          if (lh > ph) { const o = (lh - ph) / 2; pc.margin.top = o; pc.margin.bottom = o }
        } else {
          pc.margin.bottom = ctx.portLabelSpacingV + lh
        }
      }
    } else if (isFixedPortLabels(ctx.portLabelsPlacement) && pc.fixedLabelBounds) {
      const b = pc.fixedLabelBounds
      const isHoriz = side === PortSide.NORTH || side === PortSide.SOUTH
      if (isHoriz) {
        if (b.x < 0) pc.margin.left = -b.x
        if (b.x + b.w > pc.port.size.x) pc.margin.right = b.x + b.w - pc.port.size.x
      } else {
        if (b.y < 0) pc.margin.top = -b.y
        if (b.y + b.h > pc.port.size.y) pc.margin.bottom = b.y + b.h - pc.port.size.y
      }
    }
  }
  if (outside) {
    const first = ports[0]!
    const last = ports[ports.length - 1]!
    if (side === PortSide.NORTH || side === PortSide.SOUTH) { first.margin.left = 0; last.margin.right = 0 }
    else { first.margin.top = 0; last.margin.bottom = 0 }
  }
  if (uniform) {
    // 循环取 max (避免 Math.max(...大数组) 栈溢出; 顺序无关, 结果一致).
    let maxL = 0, maxR = 0, maxT = 0, maxB = 0
    for (const pc of ports) {
      if (pc.margin.left > maxL) maxL = pc.margin.left
      if (pc.margin.right > maxR) maxR = pc.margin.right
      if (pc.margin.top > maxT) maxT = pc.margin.top
      if (pc.margin.bottom > maxB) maxB = pc.margin.bottom
    }
    for (const pc of ports) { pc.margin.left = maxL; pc.margin.right = maxR; pc.margin.top = maxT; pc.margin.bottom = maxB }
    if (outside) {
      const first = ports[0]!; const last = ports[ports.length - 1]!
      if (side === PortSide.NORTH || side === PortSide.SOUTH) { first.margin.left = 0; last.margin.right = 0 }
      else { first.margin.top = 0; last.margin.bottom = 0 }
    }
  }
}

/** Phase 4: CellSystemConfigurator — contribution flags. */
function configureSizeContributions(ctx: CellCtx): void {
  if (ctx.constraints.length === 0) return
  const ic = ctx.insidePortLabelCells
  const free = ctx.portConstraints !== 'FIXED_RATIO' && ctx.portConstraints !== 'FIXED_POS'
    && String(ctx.portConstraints) !== 'FIXED_RATIO' && String(ctx.portConstraints) !== 'FIXED_POSITION'
  if (ctx.constraints.includes('PORTS')) {
    ic.get(PortSide.NORTH)!.contributesMinWidth = true
    ic.get(PortSide.SOUTH)!.contributesMinWidth = true
    ic.get(PortSide.EAST)!.contributesMinHeight = free
    ic.get(PortSide.WEST)!.contributesMinHeight = free
    ctx.middleRow.contributesMinHeight = free
    if (ctx.constraints.includes('PORT_LABELS')) {
      ic.get(PortSide.NORTH)!.contributesMinHeight = true
      ic.get(PortSide.SOUTH)!.contributesMinHeight = true
      ic.get(PortSide.EAST)!.contributesMinWidth = true
      ic.get(PortSide.WEST)!.contributesMinWidth = true
      ctx.middleRow.contributesMinWidth = true
    }
  }
  if (ctx.constraints.includes('NODE_LABELS')) {
    ctx.insideGrid.contributesMinHeight = true
    ctx.insideGrid.contributesMinWidth = true
    ctx.middleRow.contributesMinHeight = true
    ctx.middleRow.contributesMinWidth = true
    const overhang = ctx.sizeOptions.includes('OUTSIDE_NODE_LABELS_OVERHANG')
    // Java CellSystemConfigurator: 每个 label cell 单独置贡献标志 (inside=true, outside=!overhang).
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const cell = ctx.insideGrid.cells[r]![c]
      if (cell) { cell.contributesMinHeight = true; cell.contributesMinWidth = true }
    }
    for (const side of SIDES) {
      const cont = ctx.outsideNodeLabelContainers.get(side)!
      cont.contributesMinHeight = !overhang
      cont.contributesMinWidth = !overhang
      for (const cell of cont.cells) if (cell) { cell.contributesMinHeight = !overhang; cell.contributesMinWidth = !overhang }
    }
  }
  if (ctx.constraints.includes('MINIMUM_SIZE') && ctx.sizeOptions.includes('MINIMUM_SIZE_ACCOUNTS_FOR_PADDING')) {
    ctx.middleRow.contributesMinHeight = true
    ctx.middleRow.contributesMinWidth = true
    if (!ctx.insideGrid.contributesMinHeight) {
      ctx.insideGrid.contributesMinHeight = true
      ctx.insideGrid.contributesMinWidth = true
    }
  }
}

// ────────────────────────────────────────────────────────────────
// 主入口
// ────────────────────────────────────────────────────────────────

export interface CellSizeResult {
  /** cell 系统最小尺寸 (不包含 MINIMUM_SIZE / fixedGraphSize 处理). */
  min: { x: number; y: number }
}

/**
 * 计算节点 cell 最小尺寸. 返回 null 表示"约束固定" (ELK areSizeConstraintsFixed:
 * 空约束或仅 PORT_LABELS) → 调用方保留显式尺寸.
 */
export function buildCellContext(node: LNode, graph: LGraph | null, ignoreInsidePortLabels: boolean): CellCtx {
  const constraints: string[] = node.hasProperty(NODE_SIZE_CONSTRAINTS)
    ? node.getProperty(NODE_SIZE_CONSTRAINTS)
    : (graph?.getProperty(NODE_SIZE_CONSTRAINTS) ?? [])
  const sizeFixed = constraints.length === 0 || (constraints.length === 1 && constraints[0] === 'PORT_LABELS')

  // 注意: 不回退 DEFAULT_MINIMUM_SIZE — 容器 minimum 由调用方 (applyNestedGraphMinimumSizes) 处理,
  // 且 701/316/491 实证: sizeOptions 含 DEFAULT_MINIMUM_SIZE 时容器 content 处理异常 (回退不触发才是 ELK 语义).
  const sizeOptions: string[] = node.hasProperty(NODE_SIZE_OPTIONS)
    ? node.getProperty(NODE_SIZE_OPTIONS)
    : (graph && graph.hasProperty(NODE_SIZE_OPTIONS) ? graph.getProperty(NODE_SIZE_OPTIONS) : [])
  const portConstraints: string = String(node.getProperty(PORT_CONSTRAINTS) ?? 'UNDEFINED')
  const portLabelsPlacement: string[] = node.hasProperty(PORT_LABELS_PLACEMENT)
    ? node.getProperty(PORT_LABELS_PLACEMENT)
    : ['OUTSIDE']
  const portLabelsTreatAsGroup = node.getProperty<boolean>('org.eclipse.elk.portLabels.treatAsGroup') === true

  const symmetry = !sizeOptions.includes('ASYMMETRICAL')
  const portPort = nodeOrGraphProp(node, graph, SPACING_PORT_PORT, 10)
  const surrounding: Padding = nodeOrGraphProp(node, graph, SPACING_PORTS_SURROUNDING, CLONE(ZERO))
  const nodeLabelsPadding: Padding = nodeOrGraphProp(node, graph, NODE_LABELS_PADDING, { top: 5, right: 5, bottom: 5, left: 5 })
  const labelLabelSpacing = nodeOrGraphProp(node, graph, SPACING_LABEL_LABEL, 0)
  const labelCellSpacing = 2 * labelLabelSpacing
  const nodeLabelSpacing = nodeOrGraphProp(node, graph, SPACING_LABEL_NODE, 5)
  const portLabelSpacingH = nodeOrGraphProp(node, graph, SPACING_LABEL_PORT_HORIZONTAL, 1)
  const portLabelSpacingV = nodeOrGraphProp(node, graph, SPACING_LABEL_PORT_VERTICAL, 1)

  // cell 结构 (NodeContext 构造 + InsidePortLabelCellCreator + NodeLabelCellCreator)
  const nodeContainer = new StripContainerCell('VERTICAL', symmetry, 0)
  const middleRow = new StripContainerCell('HORIZONTAL', symmetry, 0)
  nodeContainer.cells[1] = middleRow
  const insideGrid = new GridContainerCell(symmetry, labelCellSpacing)
  middleRow.cells[1] = insideGrid
  const ic = new Map<PortSide, AtomicCell>()
  const nCell = new AtomicCell(); const sCell = new AtomicCell()
  const wCell = new AtomicCell(); const eCell = new AtomicCell()
  ic.set(PortSide.NORTH, nCell); ic.set(PortSide.SOUTH, sCell)
  ic.set(PortSide.WEST, wCell); ic.set(PortSide.EAST, eCell)
  nodeContainer.cells[0] = nCell; nodeContainer.cells[2] = sCell
  middleRow.cells[0] = wCell; middleRow.cells[2] = eCell

  const outside = new Map<PortSide, StripContainerCell>()
  outside.set(PortSide.NORTH, new StripContainerCell('HORIZONTAL', symmetry, labelCellSpacing))
  outside.set(PortSide.SOUTH, new StripContainerCell('HORIZONTAL', symmetry, labelCellSpacing))
  outside.set(PortSide.WEST, new StripContainerCell('VERTICAL', symmetry, labelCellSpacing))
  outside.set(PortSide.EAST, new StripContainerCell('VERTICAL', symmetry, labelCellSpacing))
  outside.get(PortSide.NORTH)!.padding.bottom = nodeLabelSpacing
  outside.get(PortSide.SOUTH)!.padding.top = nodeLabelSpacing
  outside.get(PortSide.WEST)!.padding.right = nodeLabelSpacing
  outside.get(PortSide.EAST)!.padding.left = nodeLabelSpacing

  const ctx: CellCtx = {
    node, graph, treatAsCompoundNode: node.getNestedGraph() !== null || node.getProperty(INSIDE_SELF_LOOPS_ACTIVATE), sizeFixed,
    constraints, sizeOptions, portConstraints, portLabelsPlacement, portLabelsTreatAsGroup, symmetry,
    portPort, surrounding, nodeLabelsPadding, labelLabelSpacing, labelCellSpacing, nodeLabelSpacing,
    portLabelSpacingH, portLabelSpacingV,
    portContexts: new Map(), hasPortLabelCells: false,
    nodeContainer, middleRow, insideGrid, insidePortLabelCells: ic, outsideNodeLabelContainers: outside,
  }

  createPortContexts(ctx, ignoreInsidePortLabels)
  createNodeLabelCells(ctx)
  setupNodePaddingForPortsWithOffset(ctx)
  calculatePortPlacementSize(ctx)
  configureSizeContributions(ctx)
  updateVerticalInsidePortLabelCellPadding(ctx)
  return ctx
}

/**
 * 基于已构建上下文的 cell 最小尺寸 (免重复 buildCellContext; 语义与 computeCellSystemSize 一致).
 * 调用方必须保证 ctx 构建后未发生会影响其状态的图结构变更 (端口/标签/属性).
 */
export function computeCellSystemSizeWithCtx(ctx: CellCtx): { x: number; y: number } | null {
  if (ctx.sizeFixed) return null
  const { nodeContainer } = ctx
  const constraints = ctx.constraints
  const sizeOptions = ctx.sizeOptions
  const outside = ctx.outsideNodeLabelContainers
  // Phase 5/6: min 尺寸
  let w = nodeContainer.getMinimumWidth()
  let h = nodeContainer.getMinimumHeight()

  // NODE_LABELS && !OUTSIDE_NODE_LABELS_OVERHANG → outside N/S 容器贡献宽, E/W 贡献高
  if (constraints.includes('NODE_LABELS') && !sizeOptions.includes('OUTSIDE_NODE_LABELS_OVERHANG')) {
    w = Math.max(w, outside.get(PortSide.NORTH)!.getMinimumWidth(), outside.get(PortSide.SOUTH)!.getMinimumWidth())
    h = Math.max(h, outside.get(PortSide.EAST)!.getMinimumHeight(), outside.get(PortSide.WEST)!.getMinimumHeight())
  }
  return { x: w, y: h }
}

export function computeCellSystemSize(node: LNode, graph: LGraph | null, ignoreInsidePortLabels = false): { x: number; y: number } | null {
  return computeCellSystemSizeWithCtx(buildCellContext(node, graph, ignoreInsidePortLabels))
}

// ────────────────────────────────────────────────────────────────
// cell 布局 (layoutChildrenHorizontally/Vertically) + 端口放置矩形
// ────────────────────────────────────────────────────────────────

/** StripContainerCell.layoutChildrenVertically (VERTICAL strip): BEGIN 顶对齐, END 底对齐, CENTER 填充. */
function layoutStripVertical(strip: StripContainerCell, rect: Rect): void {
  let h0 = rawHeightOf(strip.cells[0])
  const h1 = rawHeightOf(strip.cells[1])
  let h2 = rawHeightOf(strip.cells[2])
  if (strip.symmetrical) { h0 = Math.max(h0, h2); h2 = h0 }
  if (strip.cells[0]) strip.cells[0]!.rect = { x: rect.x, y: rect.y + strip.padding.top, width: rect.width, height: h0 }
  if (strip.cells[2]) strip.cells[2]!.rect = { x: rect.x, y: rect.y + rect.height - strip.padding.bottom - h2, width: rect.width, height: h2 }
  let free = rect.height - strip.padding.top - strip.padding.bottom
  if (h0 > 0) free -= h0
  if (h2 > 0) free -= h2
  const h1c = Math.max(h1, free)
  if (strip.cells[1]) strip.cells[1]!.rect = { x: rect.x, y: rect.y + strip.padding.top + h0, width: rect.width, height: h1c }
}

/** StripContainerCell.layoutChildrenHorizontally (HORIZONTAL strip): BEGIN 左对齐, END 右对齐, CENTER 填充. */
function layoutStripHorizontal(strip: StripContainerCell, rect: Rect): void {
  let w0 = rawWidthOf(strip.cells[0])
  const w1 = rawWidthOf(strip.cells[1])
  let w2 = rawWidthOf(strip.cells[2])
  if (strip.symmetrical) { w0 = Math.max(w0, w2); w2 = w0 }
  if (strip.cells[0]) strip.cells[0]!.rect = { x: rect.x + strip.padding.left, y: rect.y, width: w0, height: rect.height }
  if (strip.cells[2]) strip.cells[2]!.rect = { x: rect.x + rect.width - strip.padding.right - w2, y: rect.y, width: w2, height: rect.height }
  let free = rect.width - strip.padding.left - strip.padding.right
  if (w0 > 0) { free -= w0 + strip.gap; w0 += strip.gap }
  if (w2 > 0) { free -= w2 + strip.gap }
  const w1c = Math.max(w1, free)
  if (strip.cells[1]) strip.cells[1]!.rect = { x: rect.x + strip.padding.left + w0 - (w1c - free) / 2, y: rect.y, width: w1c, height: rect.height }
}

export interface NodeCellLayout {
  /** 各侧 inside port label cell 的矩形 (节点坐标). */
  inside: Record<string, Rect>
  /** 中间行 (nodeContainerMiddleRow) 矩形. */
  middleRow: Rect
  /** N/S 端口可用空间 = cell 矩形高度/宽度 - padding. */
  available: Record<string, { top: number; left: number }>
}

/**
 * 按节点最终尺寸对 cell 系统做布局, 返回各 inside port label cell 矩形.
 * 对齐 StripContainerCell.layoutChildren* 的 raw 规则 (AtomicCell content-0 → 0).
 */
export function layoutNodeCells(node: LNode, graph: LGraph | null, width: number, height: number, ignoreInsidePortLabels = false): NodeCellLayout {
  const ctx = buildCellContext(node, graph, ignoreInsidePortLabels)
  const nodeRect: Rect = { x: 0, y: 0, width, height }
  layoutStripVertical(ctx.nodeContainer, nodeRect)
  // 递归: 中间行横向布局 (其 rect 已由纵向布局写入)
  const midRect = ctx.middleRow.rect
  layoutStripHorizontal(ctx.middleRow, midRect)
  const out: NodeCellLayout = { inside: {}, middleRow: midRect, available: {} }
  for (const side of SIDES) {
    const cell = ctx.insidePortLabelCells.get(side)!
    out.inside[String(side)] = { ...cell.rect }
    if (side === PortSide.NORTH || side === PortSide.SOUTH) {
      out.available[String(side)] = { top: cell.rect.y + cell.padding.top, left: cell.rect.x + cell.padding.left }
    }
  }
  return out
}

/** PortPlacementCalculator.modifiedPortPlacementSize: DISTRIBUTED → -2*portPort. */
function modifiedPortPlacementSize(ctx: CellCtx, oldAlignment: string, size: number): number {
  return oldAlignment === 'DISTRIBUTED' ? size - 2 * ctx.portPort : size
}

/**
 * PortPlacementCalculator.placeVerticalPorts/placeHorizontalPorts (FREE 放置) —
 * 基于 cell 矩形 + content 尺寸 + 对齐 (BEGIN/CENTER/END/DISTRIBUTED/JUSTIFIED) 的 ELK 语义.
 * FIXED_POS/FIXED_RATIO 由调用方 (processNode) 处理.
 */
export function placeNodePortsWithCtx(ctx: CellCtx, width: number, height: number): void {
  const nodeRect: Rect = { x: 0, y: 0, width, height }
  layoutStripVertical(ctx.nodeContainer, nodeRect)
  layoutStripHorizontal(ctx.middleRow, ctx.middleRow.rect)

  const overhang = ctx.sizeOptions.includes('PORTS_OVERHANG')
  for (const side of SIDES) {
    const ports = ctx.portContexts.get(side)!
    if (ports.length === 0) continue
    const cell = ctx.insidePortLabelCells.get(side)!
    const rect = cell.rect
    const pad = cell.padding
    const isHoriz = side === PortSide.NORTH || side === PortSide.SOUTH
    let alignment = getPortAlignment(ctx, side)
    let calculated = isHoriz ? cell.content.x : cell.content.y
    // 单端口 DISTRIBUTED/JUSTIFIED → CENTER + modifiedPortPlacementSize
    if ((alignment === 'DISTRIBUTED' || alignment === 'JUSTIFIED') && ports.length === 1) {
      calculated = modifiedPortPlacementSize(ctx, alignment, calculated)
      alignment = 'CENTER'
    }
    const available = (isHoriz ? rect.width : rect.height) - (isHoriz ? pad.left + pad.right : pad.top + pad.bottom)
    let currentPos = isHoriz ? rect.x + pad.left : rect.y + pad.top
    let spaceBetween = ctx.portPort

    if (available < calculated && !overhang) {
      if (alignment === 'DISTRIBUTED') {
        spaceBetween += (available - calculated) / (ports.length + 1)
        currentPos += spaceBetween
      } else {
        spaceBetween += (available - calculated) / (ports.length - 1)
      }
    } else {
      if (available < calculated) {
        calculated = modifiedPortPlacementSize(ctx, alignment, calculated)
        alignment = 'CENTER'
      }
      switch (alignment) {
        case 'BEGIN': break
        case 'CENTER': currentPos += (available - calculated) / 2; break
        case 'END': currentPos += available - calculated; break
        case 'DISTRIBUTED': {
          const add = (available - calculated) / (ports.length + 1)
          spaceBetween += Math.max(0, add)
          currentPos += spaceBetween
          break
        }
        case 'JUSTIFIED': {
          const add = (available - calculated) / (ports.length - 1)
          spaceBetween += Math.max(0, add)
          break
        }
        default: break
      }
    }

    // 放置顺序: ELK portContexts 排序 = NORTH/EAST 升序, SOUTH/WEST 降序 (volatileId).
    // 免 [...ports].reverse() 拷贝: 反向侧用下标逆序访问, 放置顺序与 reverse 完全一致.
    const reverse = side === PortSide.WEST || side === PortSide.SOUTH
    for (let i = 0; i < ports.length; i++) {
      const pc = reverse ? ports[ports.length - 1 - i]! : ports[i]!
      const borderOffset = pc.port.getProperty(PORT_BORDER_OFFSET) ?? 0
      if (isHoriz) {
        pc.port.getPosition().x = currentPos + pc.margin.left
        pc.port.getPosition().y = side === PortSide.NORTH
          ? -pc.port.size.y - borderOffset
          : borderOffset
        currentPos += pc.margin.left + pc.port.size.x + pc.margin.right + spaceBetween
      } else {
        pc.port.getPosition().y = currentPos + pc.margin.top
        pc.port.getPosition().x = side === PortSide.EAST
          ? width + borderOffset
          : -pc.port.size.x - borderOffset
        currentPos += pc.margin.top + pc.port.size.y + pc.margin.bottom + spaceBetween
      }
    }
  }
}

export function placeNodePorts(node: LNode, graph: LGraph | null, width: number, height: number): void {
  placeNodePortsWithCtx(buildCellContext(node, graph, false), width, height)
}

// ────────────────────────────────────────────────────────────────
// 端口标签放置 (PortLabelPlacementCalculator + LabelCell.applyLabelLayout)
// ────────────────────────────────────────────────────────────────

/** PortLabelPlacementCalculator.portLabelBorderOffsetForPortSide: 标签相对节点边框的偏移. */
function portLabelBorderOffsetForPortSide(ctx: CellCtx, side: PortSide): number {
  const pad = ctx.nodeContainer.padding
  switch (side) {
    case PortSide.NORTH: return pad.top + ctx.portLabelSpacingV
    case PortSide.SOUTH: return pad.bottom + ctx.portLabelSpacingV
    case PortSide.EAST: return pad.right + ctx.portLabelSpacingH
    case PortSide.WEST: return pad.left + ctx.portLabelSpacingH
    default: return 0
  }
}

/** NodeLabelAndSizeUtilities.isFirstOutsidePortLabelPlacedDifferently. */
function isFirstOutsidePortLabelPlacedDifferently(ctx: CellCtx, side: PortSide): boolean {
  const portContexts = ctx.portContexts.get(side)!
  if (portContexts.length >= 2) {
    // portContexts 按 ELK comparePortContexts 排序 (N/E 升序, S/W 降序) → 迭代第一个 = 排序首.
    const firstPort = side === PortSide.SOUTH || side === PortSide.WEST
      ? portContexts[portContexts.length - 1]!
      : portContexts[0]!
    const alwaysSameSide = ctx.portLabelsPlacement.includes('ALWAYS_SAME_SIDE')
    const spaceEfficient = ctx.portLabelsPlacement.includes('SPACE_EFFICIENT')
    return !firstPort.labelsNextToPort && !alwaysSameSide
      && (portContexts.length === 2 || spaceEfficient)
  }
  return false
}

/** PortLabelPlacementCalculator.simpleInsidePortLabelPlacement (INSIDE 且非 constrained). */
function simpleInsidePortLabelPlacement(ctx: CellCtx, side: PortSide): void {
  let insideNorthOrSouthPortLabelAreaHeight = 0
  const labelBorderOffset = portLabelBorderOffsetForPortSide(ctx, side)
  const isHoriz = side === PortSide.NORTH || side === PortSide.SOUTH
  for (const pc of ctx.portContexts.get(side)!) {
    const lc = pc.labelCell
    if (lc === null || lc.getLabels().length === 0) continue
    const portSize = pc.port.size
    const borderOffset = pc.port.getProperty(PORT_BORDER_OFFSET) ?? 0
    const rect = lc.rect
    rect.width = lc.getMinimumWidth()
    rect.height = lc.getMinimumHeight()
    switch (side) {
      case PortSide.NORTH:
        rect.x = pc.labelsNextToPort ? (portSize.x - rect.width) / 2 : portSize.x + ctx.portLabelSpacingH
        rect.y = portSize.y + borderOffset + labelBorderOffset
        lc.setHorizontalAlignment('CENTER'); lc.setVerticalAlignment('TOP')
        break
      case PortSide.SOUTH:
        rect.x = pc.labelsNextToPort ? (portSize.x - rect.width) / 2 : portSize.x + ctx.portLabelSpacingH
        rect.y = -borderOffset - labelBorderOffset - rect.height
        lc.setHorizontalAlignment('CENTER'); lc.setVerticalAlignment('BOTTOM')
        break
      case PortSide.EAST:
        rect.x = -borderOffset - labelBorderOffset - rect.width
        if (pc.labelsNextToPort) {
          const labelHeight = ctx.portLabelsTreatAsGroup ? rect.height : lc.getLabels()[0]!.size.y
          rect.y = (portSize.y - labelHeight) / 2
        } else {
          rect.y = portSize.y + ctx.portLabelSpacingV
        }
        lc.setHorizontalAlignment('RIGHT'); lc.setVerticalAlignment('CENTER')
        break
      case PortSide.WEST:
        rect.x = portSize.x + borderOffset + labelBorderOffset
        if (pc.labelsNextToPort) {
          const labelHeight = ctx.portLabelsTreatAsGroup ? rect.height : lc.getLabels()[0]!.size.y
          rect.y = (portSize.y - labelHeight) / 2
        } else {
          rect.y = portSize.y + ctx.portLabelSpacingV
        }
        lc.setHorizontalAlignment('LEFT'); lc.setVerticalAlignment('CENTER')
        break
    }
    if (isHoriz) insideNorthOrSouthPortLabelAreaHeight = Math.max(insideNorthOrSouthPortLabelAreaHeight, rect.height)
  }
  if (insideNorthOrSouthPortLabelAreaHeight > 0) {
    ctx.insidePortLabelCells.get(side)!.content.y = insideNorthOrSouthPortLabelAreaHeight
  }
}

/** PortLabelPlacementCalculator.simpleOutsidePortLabelPlacement. */
function simpleOutsidePortLabelPlacement(ctx: CellCtx, side: PortSide): void {
  let placeFirstPortDifferently = isFirstOutsidePortLabelPlacedDifferently(ctx, side)
  const alwaysAbove = ctx.portLabelsPlacement.includes('ALWAYS_OTHER_SAME_SIDE')
  for (const pc of ctx.portContexts.get(side)!) {
    const lc = pc.labelCell
    if (lc === null || lc.getLabels().length === 0) continue
    const portSize = pc.port.size
    const rect = lc.rect
    rect.width = lc.getMinimumWidth()
    rect.height = lc.getMinimumHeight()
    switch (side) {
      case PortSide.NORTH:
        if (pc.labelsNextToPort) { rect.x = (portSize.x - rect.width) / 2; lc.setHorizontalAlignment('CENTER') }
        else if (placeFirstPortDifferently || alwaysAbove) { rect.x = -rect.width - ctx.portLabelSpacingH; lc.setHorizontalAlignment('RIGHT') }
        else { rect.x = portSize.x + ctx.portLabelSpacingH; lc.setHorizontalAlignment('LEFT') }
        rect.y = -rect.height - ctx.portLabelSpacingV
        lc.setVerticalAlignment('BOTTOM')
        break
      case PortSide.SOUTH:
        if (pc.labelsNextToPort) { rect.x = (portSize.x - rect.width) / 2; lc.setHorizontalAlignment('CENTER') }
        else if (placeFirstPortDifferently || alwaysAbove) { rect.x = -rect.width - ctx.portLabelSpacingH; lc.setHorizontalAlignment('RIGHT') }
        else { rect.x = portSize.x + ctx.portLabelSpacingH; lc.setHorizontalAlignment('LEFT') }
        rect.y = portSize.y + ctx.portLabelSpacingV
        lc.setVerticalAlignment('TOP')
        break
      case PortSide.EAST:
        if (pc.labelsNextToPort) {
          const labelHeight = ctx.portLabelsTreatAsGroup ? rect.height : lc.getLabels()[0]!.size.y
          rect.y = (portSize.y - labelHeight) / 2
          lc.setVerticalAlignment('CENTER')
        } else if (placeFirstPortDifferently || alwaysAbove) {
          rect.y = -rect.height - ctx.portLabelSpacingV
          lc.setVerticalAlignment('BOTTOM')
        } else {
          rect.y = portSize.y + ctx.portLabelSpacingV
          lc.setVerticalAlignment('TOP')
        }
        rect.x = portSize.x + ctx.portLabelSpacingH
        lc.setHorizontalAlignment('LEFT')
        break
      case PortSide.WEST:
        if (pc.labelsNextToPort) {
          const labelHeight = ctx.portLabelsTreatAsGroup ? rect.height : lc.getLabels()[0]!.size.y
          rect.y = (portSize.y - labelHeight) / 2
          lc.setVerticalAlignment('CENTER')
        } else if (placeFirstPortDifferently || alwaysAbove) {
          rect.y = -rect.height - ctx.portLabelSpacingV
          lc.setVerticalAlignment('BOTTOM')
        } else {
          rect.y = portSize.y + ctx.portLabelSpacingV
          lc.setVerticalAlignment('TOP')
        }
        rect.x = -rect.width - ctx.portLabelSpacingH
        lc.setHorizontalAlignment('RIGHT')
        break
    }
    placeFirstPortDifferently = false
  }
}

/**
 * PortLabelPlacementCalculator.placePortLabels + LabelPlacer (端口标签部分):
 * INSIDE/OUTSIDE 标签 cell 矩形定位 (相对端口) + LabelCell.applyLabelLayout 写 label.position.
 * constrained 变体 (RectangleStripOverlapRemover) 暂未移植 — 701 等 simple 路径已覆盖.
 */
export function placePortLabelsWithCtx(ctx: CellCtx): void {
  const placement = ctx.portLabelsPlacement
  const inside = placement.includes('INSIDE')
  const outside = placement.includes('OUTSIDE')
  if (!inside && !outside) return
  // 无任何端口标签 cell → 放置循环为空操作 (INSIDE/OUTSIDE 扫描全 skip), 直接返回.
  if (!ctx.hasPortLabelCells) return
  for (const side of SIDES) {
    if (inside) simpleInsidePortLabelPlacement(ctx, side)
    else simpleOutsidePortLabelPlacement(ctx, side)
  }
  // LabelPlacer.placeLabels: 所有端口标签 cell 应用布局 (写 label.position).
  for (const side of SIDES) {
    for (const pc of ctx.portContexts.get(side)!) {
      if (pc.labelCell) pc.labelCell.applyLabelLayout()
    }
  }
}

export function placePortLabels(node: LNode, graph: LGraph | null): void {
  if (process.env.GGN_PPL_DBG) console.error(`[PPL] ${String(node.id)} type=${node.getType()} placement=${JSON.stringify(node.getProperty('org.eclipse.elk.portLabels.placement'))} portLabels=${node.getPorts().flatMap(pt => pt.getLabels().map(l => l.text)).join(',')}`)
  placePortLabelsWithCtx(buildCellContext(node, graph, false))
}
