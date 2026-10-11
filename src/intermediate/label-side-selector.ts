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
 * LabelSideSelector (对应 ELK intermediate.LabelSideSelector).
 *
 * 按 edgeLabels.sideSelection 策略决定 CENTER 边标签放在边的哪一侧 (ABOVE/BELOW/INLINE),
 * 写入 LABEL_DUMMY 节点的 LABEL_SIDE 属性 (label-dummy-remover 据此放置).
 * 策略: ALWAYS_UP/DOWN (全 ABOVE/BELOW) / DIRECTION_UP/DOWN (按边方向) / SMART_UP/DOWN (启发式).
 *
 * 注意: SMART 的端标签 (HEAD/TAIL) 分支依赖 EndLabelPreprocessor.gatherLabels (端标签机制,
 * 见 EndLabel 移植); 此处先实现 ALWAYS/DIRECTION 与 dummy 序列分支.
 */
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js' // instanceof 需要值导入 (edgeLabelSideSelection02 ReferenceError 实证)
import type { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide } from '../graph/enums.js'
import { LABEL_SIDE, ORIGIN, REVERSED, LONG_EDGE_SOURCE, LONG_EDGE_TARGET } from '../options/internal-properties.js'
import { EDGE_LABELS_SIDE_SELECTION, EdgeLabelSideSelection, EDGE_THICKNESS, SPACING_EDGE_LABEL } from '../options/layered-options.js'
import { gatherLabels } from './labels/end-label-preprocessor.js'

type LabelSide = 'ABOVE' | 'BELOW' | 'INLINE'

export function processLabelSideSelection(layeredGraph: LGraph): void {
  const mode = layeredGraph.getProperty(EDGE_LABELS_SIDE_SELECTION)
  switch (mode) {
    case EdgeLabelSideSelection.ALWAYS_UP:
      sameSide(layeredGraph, 'ABOVE')
      break
    case EdgeLabelSideSelection.ALWAYS_DOWN:
      sameSide(layeredGraph, 'BELOW')
      break
    case EdgeLabelSideSelection.DIRECTION_UP:
      basedOnDirection(layeredGraph, 'ABOVE')
      break
    case EdgeLabelSideSelection.DIRECTION_DOWN:
      basedOnDirection(layeredGraph, 'BELOW')
      break
    case EdgeLabelSideSelection.SMART_UP:
      smart(layeredGraph, 'ABOVE')
      fillMissingSides(layeredGraph, 'ABOVE')
      break
    case EdgeLabelSideSelection.SMART_DOWN:
      smart(layeredGraph, 'BELOW')
      fillMissingSides(layeredGraph, 'BELOW')
      break
    default:
      break
  }
}

/** 兜底: smart 策略未覆盖的边标签 (如 EXTERNAL_PORT dummy 段边上的 HEAD/TAIL)
 * 设默认侧 — ELK 中这些标签由层级标签转移机制移到 LABEL dummy, ggn 的转移缺口在此补偿,
 * 保证「布局后所有边标签有 side」不变量 (LabelSideSelectorTest). */
function fillMissingSides(graph: LGraph, side: LabelSide): void {
  const visit = (n: LNode): void => {
    for (const edge of n.getOutgoingEdges()) {
      for (const label of edge.getLabels()) {
        const l = label as { side?: string }
        if (l.side === undefined || l.side === '') l.side = side
      }
    }
  }
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) visit(node)
  }
  for (const node of graph.getLayerlessNodes()) visit(node)
}

/** 所有标签放同侧. */
function sameSide(graph: LGraph, side: LabelSide): void {
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (node.getType() === NodeType.LABEL) applyLabelSide(node, side)
      for (const edge of node.getOutgoingEdges()) applyLabelSideToEdge(edge, side)
    }
  }
}

/** 按边方向: 向右 → side, 向左 → 对侧. */
function basedOnDirection(graph: LGraph, sideForRightward: LabelSide): void {
  const opposite = sideForRightward === 'ABOVE' ? 'BELOW' : 'ABOVE'
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (node.getType() === NodeType.LABEL) {
        applyLabelSide(node, doesEdgePointRight(node) ? sideForRightward : opposite)
      }
      for (const edge of node.getOutgoingEdges()) {
        applyLabelSideToEdge(edge, doesEdgePointRight(edge) ? sideForRightward : opposite)
      }
    }
  }
}

// ── SMART 策略 (ELK smart): 层内 LABEL/LONG_EDGE dummy 连续段启发式 ──

function smart(graph: LGraph, defaultSide: LabelSide): void {
  const dummyQueue: LNode[] = []
  for (const layer of graph.getLayers()) {
    let topGroup = true
    let labelDummiesInQueue = 0
    for (const node of layer.getNodes()) {
      switch (node.getType()) {
        case NodeType.LABEL:
          labelDummiesInQueue++
          dummyQueue.push(node)
          break
        case NodeType.LONG_EDGE:
          dummyQueue.push(node)
          break
        case NodeType.NORMAL:
          smartForRegularNode(node, defaultSide)
          if (dummyQueue.length > 0) {
            smartForConsecutiveDummyRun(dummyQueue, labelDummiesInQueue, topGroup, false, defaultSide)
          }
          topGroup = false
          labelDummiesInQueue = 0
          break
        default:
          if (dummyQueue.length > 0) {
            smartForConsecutiveDummyRun(dummyQueue, labelDummiesInQueue, topGroup, false, defaultSide)
          }
          topGroup = false
          labelDummiesInQueue = 0
      }
    }
    if (dummyQueue.length > 0) {
      smartForConsecutiveDummyRun(dummyQueue, labelDummiesInQueue, topGroup, true, defaultSide)
    }
  }
}

/** ELK smartForConsecutiveDummyNodeRun: 特殊情形 → 否则默认侧 (简单环 ABOVE/BELOW 交替). */
/** ELK smartForRegularNode: 按端口侧分组端标签, 2 组 → ABOVE/BELOW (按侧), 否则默认侧. */
function smartForRegularNode(node: LNode, defaultSide: LabelSide): void {
  const endLabelQueue: { label: unknown; edge: unknown }[][] = []
  let currentPortSide: PortSide | null = null
  for (const port of node.getPorts()) {
    if (port.getSide() !== currentPortSide) {
      if (endLabelQueue.length > 0) {
        smartForRegularNodePortEndLabels(endLabelQueue, currentPortSide!, defaultSide)
      }
      endLabelQueue.length = 0
      currentPortSide = port.getSide()
    }
    const portEndLabels = gatherLabels(port)
    if (portEndLabels !== null) endLabelQueue.push(portEndLabels)
  }
  if (endLabelQueue.length > 0) {
    smartForRegularNodePortEndLabels(endLabelQueue, currentPortSide!, defaultSide)
  }
}

/** ELK smartForRegularNodePortEndLabels: 队列 2 组 → 按端口侧 ABOVE/BELOW 交替, 否则默认侧. */
function smartForRegularNodePortEndLabels(
  endLabelQueue: { label: unknown; edge: unknown }[][], portSide: PortSide, defaultSide: LabelSide,
): void {
  if (endLabelQueue.length === 2) {
    if (portSide === PortSide.NORTH || portSide === PortSide.EAST) {
      applyLabelSideToLabels(endLabelQueue[0]!, 'ABOVE')
      applyLabelSideToLabels(endLabelQueue[1]!, 'BELOW')
    } else {
      applyLabelSideToLabels(endLabelQueue[0]!, 'BELOW')
      applyLabelSideToLabels(endLabelQueue[1]!, 'ABOVE')
    }
  } else {
    for (const labelList of endLabelQueue) applyLabelSideToLabels(labelList, defaultSide)
  }
}

/** 给一组端标签设置 side. */
function applyLabelSideToLabels(labels: { label: unknown; edge: unknown }[], side: LabelSide): void {
  for (const entry of labels) {
    ;(entry.label as { side?: string }).side = side
  }
}

function smartForConsecutiveDummyRun(
  dummyNodes: LNode[], labelDummyCount: number, topGroup: boolean, bottomGroup: boolean, defaultSide: LabelSide,
): void {
  if (topGroup && (!bottomGroup || dummyNodes.length > 1) && labelDummyCount === 1
    && dummyNodes[0]!.getType() === NodeType.LABEL) {
    applyLabelSide(dummyNodes[0]!, 'ABOVE')
  } else if (bottomGroup && (!topGroup || dummyNodes.length > 1) && labelDummyCount === 1
    && dummyNodes[dummyNodes.length - 1]!.getType() === NodeType.LABEL) {
    applyLabelSide(dummyNodes[dummyNodes.length - 1]!, 'BELOW')
  } else if (dummyNodes.length === 2) {
    applyLabelSide(dummyNodes[0]!, 'ABOVE')
    applyLabelSide(dummyNodes[1]!, 'BELOW')
  } else {
    applyForDummyRunWithSimpleLoops(dummyNodes, labelDummyCount, defaultSide)
  }
  dummyNodes.length = 0
}

/** ELK applyForDummyNodeRunWithSimpleLoops: 连续 label dummy 连接相同节点 → ABOVE/BELOW 交替. */
function applyForDummyRunWithSimpleLoops(dummyNodes: LNode[], labelDummyCount: number, defaultSide: LabelSide): void {
  const labelDummyRun: LNode[] = []
  let prevSource: LNode | null = null
  let prevTarget: LNode | null = null
  for (const currentDummy of dummyNodes) {
    const currSource = getLongEdgeEndNode(currentDummy, true)
    const currTarget = getLongEdgeEndNode(currentDummy, false)
    if (prevSource !== currSource || prevTarget !== currTarget) {
      applyLabelSidesToLabelDummyRun(labelDummyRun, defaultSide)
      prevSource = currSource
      prevTarget = currTarget
    }
    labelDummyRun.push(currentDummy)
  }
  applyLabelSidesToLabelDummyRun(labelDummyRun, defaultSide)
  void labelDummyCount
}

function applyLabelSidesToLabelDummyRun(labelDummyRun: LNode[], defaultSide: LabelSide): void {
  if (labelDummyRun.length === 0) return
  if (labelDummyRun.length === 2) {
    applyLabelSide(labelDummyRun[0]!, 'ABOVE')
    applyLabelSide(labelDummyRun[1]!, 'BELOW')
  } else {
    for (const dummy of labelDummyRun) applyLabelSide(dummy, defaultSide)
  }
  labelDummyRun.length = 0
}

/** ELK getLongEdgeEndNode: LONG_EDGE_SOURCE/TARGET 端口所属节点. */
function getLongEdgeEndNode(dummy: LNode, source: boolean): LNode | null {
  const endPort = dummy.getProperty<unknown>(source ? LONG_EDGE_SOURCE : LONG_EDGE_TARGET)
  if (endPort === null || endPort === undefined) return null
  return (endPort as { getNode(): LNode }).getNode()
}

// ── Helper (ELK applyLabelSide / doesEdgePointRight) ──

/** 设置 LABEL dummy 的 LABEL_SIDE, ABOVE 时移动端口 y 预留空间 (ELK applyLabelSide(LNode)). */
function applyLabelSide(labelDummy: LNode, side: LabelSide): void {
  if (labelDummy.getType() !== NodeType.LABEL) return
  const effectiveSide: LabelSide = side
  labelDummy.setProperty(LABEL_SIDE, effectiveSide)
  if (effectiveSide !== 'BELOW') {
    const originEdge = labelDummy.getProperty(ORIGIN) as LEdge
    const thickness = originEdge?.getProperty(EDGE_THICKNESS) ?? 0
    let portPos = 0
    if (effectiveSide === 'ABOVE') {
      portPos = labelDummy.size.y - Math.ceil(thickness / 2)
    } else if (effectiveSide === 'INLINE') {
      const spacing = labelDummy.getGraph()?.getProperty(SPACING_EDGE_LABEL) ?? 0
      portPos = Math.ceil((labelDummy.size.y - spacing - thickness)) / 2
      labelDummy.size.y -= spacing
      labelDummy.size.y -= thickness
    }
    for (const port of labelDummy.getPorts()) port.getPosition().y = portPos
  }
}

/** 边标签: 设置标签 side (ELK applyLabelSide(LEdge); ggn LEdgeLabel 用 side 字段承载). */
function applyLabelSideToEdge(edge: LEdge, side: LabelSide): void {
  for (const label of edge.getLabels()) {
    ;(label as { side?: string }).side = side
  }
}

/** ELK doesEdgePointRight: 边未反转 → 右; LABEL dummy 的入/出边任一右 → 右. */
function doesEdgePointRight(target: LEdge | LNode): boolean {
  if (target instanceof LNode) {
    const incoming = target.getIncomingEdges()[0]
    const outgoing = target.getOutgoingEdges()[0]
    if (incoming && doesEdgePointRight(incoming)) return true
    if (outgoing && doesEdgePointRight(outgoing)) return true
    return false
  }
  return !target.getProperty(REVERSED)
}

/** 供 label-dummy-remover 读取的 side (兼容 LABEL_SIDE 属性语义). */
export function labelSideOf(node: LNode): string {
  return node.getProperty<string>(LABEL_SIDE) ?? 'BELOW'
}
