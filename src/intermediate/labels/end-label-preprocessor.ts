/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * EndLabelPreprocessor (对应 ELK intermediate.EndLabelPreprocessor).
 *
 * P4 前: 把所有端标签 (HEAD/TAIL) 收集进各端口对应的 LabelCell, 放置 label cell 矩形
 * (相对节点左上角), 并把节点 margin 扩展到包含端标签所需空间. 最终坐标等 P5 后
 * EndLabelPostprocessor 根据节点最终位置平移动画.
 *
 * 前提: 节点尺寸/端口位置已固定, 端口列表已按 PortListSorter 排序 (与 ELK 同槽依赖一致).
 */
import type { LGraph } from '../../graph/lgraph.js'
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import { PortSide, Direction } from '../../graph/enums.js'
import { EDGE_THICKNESS, SPACING_EDGE_LABEL, SPACING_LABEL_LABEL, DIRECTION, EdgeLabelPlacement } from '../../options/layered-options.js'
import { END_LABELS, MAX_EDGE_THICKNESS, PORT_DUMMY, ORIGIN } from '../../options/internal-properties.js'
import { LabelCell, HorizontalLabelAlignment, VerticalLabelAlignment, type LabelEntry } from './label-cell.js'
import { RectangleStripOverlapRemover, OverlapRemovalDirection } from './rectangle-strip-overlap-remover.js'

/** 特殊值: 端口无边关联 (ELK NO_INCIDENT_EDGE_THICKNESS). */
const NO_INCIDENT_EDGE_THICKNESS = -1

export function processEndLabelPreprocessing(layeredGraph: LGraph): void {
  const edgeLabelSpacing = layeredGraph.getProperty(SPACING_EDGE_LABEL)
  const labelLabelSpacing = layeredGraph.getProperty(SPACING_LABEL_LABEL)
  const direction = layeredGraph.getProperty(DIRECTION)
  const verticalLayout = direction === Direction.DOWN || direction === Direction.UP

  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      processNode(node, edgeLabelSpacing, labelLabelSpacing, verticalLayout)
    }
  }
}

function processNode(node: LNode, edgeLabelSpacing: number, labelLabelSpacing: number, verticalLayout: boolean): void {
  const portCount = node.getPorts().length
  const portLabelCells: (LabelCell | null)[] = new Array(portCount)

  for (let portIndex = 0; portIndex < portCount; portIndex++) {
    const port = node.getPorts()[portIndex]!
    port.id = portIndex
    portLabelCells[portIndex] = createConfiguredLabelCell(gatherLabels(port), labelLabelSpacing, verticalLayout)
  }

  placeLabels(node, portLabelCells, labelLabelSpacing, edgeLabelSpacing, verticalLayout)

  const portToLabelCellMap = new Map<LPort, unknown>()
  for (let index = 0; index < portLabelCells.length; index++) {
    const cell = portLabelCells[index]
    if (cell !== null) {
      portToLabelCellMap.set(node.getPorts()[index]!, cell)
    }
  }

  if (portToLabelCellMap.size > 0) {
    node.setProperty(END_LABELS, portToLabelCellMap)
    updateNodeMargins(node, portLabelCells)
  }
}

/** 创建已配置的 LabelCell (无标签时返回 null); 尺寸先设为最小尺寸. */
function createConfiguredLabelCell(entries: LabelEntry[] | null, labelLabelSpacing: number, verticalLayout: boolean): LabelCell | null {
  if (entries === null || entries.length === 0) {
    return null
  }

  const labelCell = new LabelCell(labelLabelSpacing, !verticalLayout)
  for (const entry of entries) {
    labelCell.addLabel(entry.label, entry.edge)
  }

  labelCell.cellRectangle.height = labelCell.getMinimumHeight()
  labelCell.cellRectangle.width = labelCell.getMinimumWidth()

  return labelCell
}

// ────────────────────────────────────────────────────────────────
// 标签收集
// ────────────────────────────────────────────────────────────────

/** 返回该端口应放置的全部端标签; 端口无边关联返回 null. */
export function gatherLabels(port: LPort): LabelEntry[] | null {
  const entries: LabelEntry[] = []
  let maxEdgeThickness = gatherLabelsInto(port, entries)

  // NS 端口 dummy 关联 (NorthSouthPortPreprocessor): 处理 dummy 上为当前端口创建的端口.
  const dummyNode = port.getProperty(PORT_DUMMY)
  if (dummyNode !== null && dummyNode !== undefined) {
    for (const dummyPort of dummyNode.getPorts()) {
      if (dummyPort.getProperty(ORIGIN) === port) {
        maxEdgeThickness = Math.max(maxEdgeThickness, gatherLabelsInto(dummyPort, entries))
      }
    }
  }

  if (entries.length > 0) {
    port.setProperty(MAX_EDGE_THICKNESS, maxEdgeThickness)
  }

  return maxEdgeThickness !== NO_INCIDENT_EDGE_THICKNESS ? entries : null
}

/** 把端口关联边的端标签加入列表, 返回最大边厚度. */
function gatherLabelsInto(port: LPort, targetList: LabelEntry[]): number {
  let maxEdgeThickness = -1
  const labels: LabelEntry[] = []

  for (const incidentEdge of port.getConnectedEdges()) {
    maxEdgeThickness = Math.max(maxEdgeThickness, incidentEdge.getProperty(EDGE_THICKNESS))

    if (incidentEdge.getSource() === port) {
      // 出边: TAIL 标签属于该端口
      for (const label of incidentEdge.getLabels()) {
        if (label.placement === EdgeLabelPlacement.TAIL) labels.push({ label, edge: incidentEdge })
      }
    } else {
      // 入边: HEAD 标签属于该端口
      for (const label of incidentEdge.getLabels()) {
        if (label.placement === EdgeLabelPlacement.HEAD) labels.push({ label, edge: incidentEdge })
      }
    }

    targetList.push(...labels)
    labels.length = 0
  }

  return maxEdgeThickness
}

// ────────────────────────────────────────────────────────────────
// 标签放置
// ────────────────────────────────────────────────────────────────

function placeLabels(node: LNode, portLabelCells: (LabelCell | null)[], labelLabelSpacing: number,
  edgeLabelSpacing: number, verticalLayout: boolean): void {
  for (const port of node.getPorts()) {
    const cell = portLabelCells[port.id]
    if (cell !== null) {
      placeLabelsForPort(port, cell, edgeLabelSpacing)
    }
  }

  // N/S 侧 (水平布局) 或 E/W 侧 (垂直布局) 的标签可能重叠, 需移除重叠.
  if (verticalLayout) {
    removeLabelOverlaps(node, portLabelCells, PortSide.EAST, 2 * labelLabelSpacing, edgeLabelSpacing)
    removeLabelOverlaps(node, portLabelCells, PortSide.WEST, 2 * labelLabelSpacing, edgeLabelSpacing)
  } else {
    removeLabelOverlaps(node, portLabelCells, PortSide.NORTH, 2 * labelLabelSpacing, edgeLabelSpacing)
    removeLabelOverlaps(node, portLabelCells, PortSide.SOUTH, 2 * labelLabelSpacing, edgeLabelSpacing)
  }
}

/** 放置单个端标签 cell (ELK EndLabelPreprocessor.placeLabels(LPort, LabelCell, double)). */
function placeLabelsForPort(port: LPort, labelCell: LabelCell, edgeLabelSpacing: number): void {
  const cellRect = labelCell.cellRectangle
  const nodeSize = port.getNode()!.getSize()
  const nodeMargin = port.getNode()!.getMargin()
  const portPos = port.getPosition()
  const portAnchor = { x: portPos.x + port.getAnchor().x, y: portPos.y + port.getAnchor().y }

  switch (port.getSide()) {
    case PortSide.NORTH:
      labelCell.setVerticalAlignment(VerticalLabelAlignment.BOTTOM)
      cellRect.y = -nodeMargin.top - edgeLabelSpacing - cellRect.height
      if (getLabelSide(labelCell) === 'ABOVE') {
        labelCell.setHorizontalAlignment(HorizontalLabelAlignment.RIGHT)
        cellRect.x = portAnchor.x - maxEdgeThickness(port) - edgeLabelSpacing - cellRect.width
      } else {
        labelCell.setHorizontalAlignment(HorizontalLabelAlignment.LEFT)
        cellRect.x = portAnchor.x + maxEdgeThickness(port) + edgeLabelSpacing
      }
      break

    case PortSide.EAST:
      labelCell.setHorizontalAlignment(HorizontalLabelAlignment.LEFT)
      cellRect.x = nodeSize.x + nodeMargin.right + edgeLabelSpacing
      if (getLabelSide(labelCell) === 'ABOVE') {
        labelCell.setVerticalAlignment(VerticalLabelAlignment.BOTTOM)
        cellRect.y = portAnchor.y - maxEdgeThickness(port) - edgeLabelSpacing - cellRect.height
      } else {
        labelCell.setVerticalAlignment(VerticalLabelAlignment.TOP)
        cellRect.y = portAnchor.y + maxEdgeThickness(port) + edgeLabelSpacing
      }
      break

    case PortSide.SOUTH:
      labelCell.setVerticalAlignment(VerticalLabelAlignment.TOP)
      cellRect.y = nodeSize.y + nodeMargin.bottom + edgeLabelSpacing
      if (getLabelSide(labelCell) === 'ABOVE') {
        labelCell.setHorizontalAlignment(HorizontalLabelAlignment.RIGHT)
        cellRect.x = portAnchor.x - maxEdgeThickness(port) - edgeLabelSpacing - cellRect.width
      } else {
        labelCell.setHorizontalAlignment(HorizontalLabelAlignment.LEFT)
        cellRect.x = portAnchor.x + maxEdgeThickness(port) + edgeLabelSpacing
      }
      break

    case PortSide.WEST:
      labelCell.setHorizontalAlignment(HorizontalLabelAlignment.RIGHT)
      cellRect.x = -nodeMargin.left - edgeLabelSpacing - cellRect.width
      if (getLabelSide(labelCell) === 'ABOVE') {
        labelCell.setVerticalAlignment(VerticalLabelAlignment.BOTTOM)
        cellRect.y = portAnchor.y - maxEdgeThickness(port) - edgeLabelSpacing - cellRect.height
      } else {
        labelCell.setVerticalAlignment(VerticalLabelAlignment.TOP)
        cellRect.y = portAnchor.y + maxEdgeThickness(port) + edgeLabelSpacing
      }
      break
  }
}

/** 移除给定侧端口端标签 cell 之间的重叠 (ELK removeLabelOverlaps). */
function removeLabelOverlaps(node: LNode, portLabelCells: (LabelCell | null)[], portSide: PortSide,
  labelLabelSpacing: number, edgeLabelSpacing: number): void {
  const overlapRemover = RectangleStripOverlapRemover
    .createForDirection(portSideToOverlapRemovalDirection(portSide))
    .withGap(labelLabelSpacing, labelLabelSpacing)
    .withStartCoordinate(calculateOverlapStartCoordinate(node, portSide, edgeLabelSpacing))

  for (const port of node.getPorts(portSide)) {
    const cell = portLabelCells[port.id]
    if (cell !== null) {
      overlapRemover.addRectangle(cell.cellRectangle)
    }
  }

  overlapRemover.removeOverlaps()
}

/** 重叠移除起始坐标 (ELK calculateOverlapStartCoordinate). */
function calculateOverlapStartCoordinate(node: LNode, portSide: PortSide, edgeLabelSpacing: number): number {
  const nodeSize = node.getSize()
  const nodeMargin = node.getMargin()
  switch (portSide) {
    case PortSide.NORTH: return -nodeMargin.top - edgeLabelSpacing
    case PortSide.SOUTH: return nodeSize.y + nodeMargin.bottom + edgeLabelSpacing
    case PortSide.EAST: return nodeSize.x + nodeMargin.right + edgeLabelSpacing
    case PortSide.WEST: return -nodeMargin.left - edgeLabelSpacing
    default: return 0
  }
}

// ────────────────────────────────────────────────────────────────
// 节点 margin 扩展
// ────────────────────────────────────────────────────────────────

/** 把 label cell 矩形并入节点 margin (ELK updateNodeMargins). */
function updateNodeMargins(node: LNode, labelCells: (LabelCell | null)[]): void {
  const nodeMargin = node.getMargin()
  const nodeSize = node.getSize()

  // 当前 margin 矩形
  let rect = {
    x: -nodeMargin.left,
    y: -nodeMargin.top,
    width: nodeMargin.left + nodeSize.x + nodeMargin.right,
    height: nodeMargin.top + nodeSize.y + nodeMargin.bottom,
  }

  for (const labelCell of labelCells) {
    if (labelCell !== null) {
      rect = unionRect(rect, labelCell.cellRectangle)
    }
  }

  nodeMargin.left = -rect.x
  nodeMargin.top = -rect.y
  nodeMargin.right = rect.width - nodeMargin.left - nodeSize.x
  nodeMargin.bottom = rect.height - nodeMargin.top - nodeSize.y
}

function unionRect(a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
  const minX = Math.min(a.x, b.x)
  const minY = Math.min(a.y, b.y)
  const maxX = Math.max(a.x + a.width, b.x + b.width)
  const maxY = Math.max(a.y + a.height, b.y + b.height)
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

// ────────────────────────────────────────────────────────────────
// 工具
// ────────────────────────────────────────────────────────────────

/** cell 第一个标签的 LABEL_SIDE (ELK getLabelSide; 默认 BELOW).
 * ggn LEdgeLabel 无属性表, LabelSideSelector 未移植 → 暂恒 BELOW (与 ELK 默认一致). */
function getLabelSide(_labelCell: LabelCell): string {
  return 'BELOW'
}

/** 端口侧 → 重叠移除方向 (ELK portSideToOverlapRemovalDirection). */
function portSideToOverlapRemovalDirection(portSide: PortSide): OverlapRemovalDirection {
  switch (portSide) {
    case PortSide.NORTH: return OverlapRemovalDirection.UP
    case PortSide.SOUTH: return OverlapRemovalDirection.DOWN
    case PortSide.EAST: return OverlapRemovalDirection.RIGHT
    case PortSide.WEST: return OverlapRemovalDirection.LEFT
    default: return OverlapRemovalDirection.UP
  }
}

/** 端口关联边的最大厚度 (ELK maxEdgeThickness). */
function maxEdgeThickness(port: LPort): number {
  return port.getProperty(MAX_EDGE_THICKNESS)
}
