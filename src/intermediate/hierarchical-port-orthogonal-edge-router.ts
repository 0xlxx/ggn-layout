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
 * HierarchicalPortOrthogonalEdgeRouter (对应 ELK intermediate.HierarchicalPortOrthogonalEdgeRouter).
 *
 * P4/P5 边界: 恢复 HPC 移除的原始 N/S 外部端口 dummy 并定位 (Step1+2), 清理临时替换 dummy (Step4)。
 * 完整版含 Step3 正交边路由 (调整 offset/size, 用 OrthogonalRoutingGenerator 的 SOUTH_TO_NORTH /
 * NORTH_TO_SOUTH 方向策略统计路由槽) 与 Step5/6 坐标修正。
 *
 * 默认由环境开关 GGN_HIER_ORTHO 启用; 默认路径 (未启用) 行为不变。
 */
import type { LGraph } from '../graph/lgraph.js'
import type { Layer } from '../graph/layer.js'
import type { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide, PortConstraints } from '../graph/enums.js'
import {
  EXT_PORT_SIDE, EXT_PORT_SIZE, EXT_PORT_REPLACED_DUMMY, EXT_PORT_REPLACED_DUMMIES, PORT_RATIO_OR_POSITION, RANDOM, ORIGIN,
} from '../options/internal-properties.js'
import { PORT_CONSTRAINTS, PORT_ANCHOR, SPACING_PORT_PORT, SPACING_NODE_NODE, SPACING_EDGE_EDGE } from '../options/layered-options.js'
import { OrthogonalRoutingGenerator, SOUTH_TO_NORTH, NORTH_TO_SOUTH } from '../p5edges/orthogonal/orthogonal-routing-generator.js'

export function processHierarchicalPortOrthogonalRouting(layeredGraph: LGraph): void {
  // 完整流程 (ELK HierarchicalPortOrthogonalEdgeRouter Step1-6):
  // Step1 恢复 HPC 移除的原始 N/S dummy (需 EXT_PORT_REPLACED_DUMMIES, 即嵌套图 pc=FIXED_SIDE 时 HPC N/S 运行)。
  // ★ 无 N/S dummy (仅 E/W) 时不得提前 return: Java HierarchicalPortOrthogonalEdgeRouter.process()
  //   的 Step5 fixCoordinates (修正 E/W dummy x: WEST→-offset.x-padding.left 等) 无条件执行
  //   (Issue905: 提前 return 使 WEST dummy x=0 而非 -12 → TAIL 标签右移 padding.left).
  const northSouthDummies = restoreNorthSouthDummies(layeredGraph)
  // Step2 定位 x/y (FIXED_SIDE: x=连接端口平均; y 用当前 offset).
  setNorthSouthDummyCoordinates(layeredGraph, northSouthDummies)
  // Step3 正交边路由 + 调整 offset/size (ELK HierarchicalPortOrthogonalEdgeRouter.routeEdges :511-595):
  //   北向 (SOUTH_TO_NORTH): startPos = -nodeSpacing - offset.y, slots>0 → offset.y += h, size.y += h;
  //   南向 (NORTH_TO_SOUTH): startPos = size.y + nodeSpacing - offset.y (北向调整后), slots>0 → size.y += h.
  routeNorthSouthEdges(layeredGraph, northSouthDummies)
  // Step4 清理临时替换 dummy (重连边到原始 dummy + 迁移弯点, ELK 精确语义).
  removeTemporaryNorthSouthDummies(layeredGraph)
  // Step5 修正 E/W dummy x + FIXED_POS/RATIO y + 图高, 并重设 N/S y (offset 变化后).
  fixExternalPortCoordinates(layeredGraph)
  // Step6 修正 E/W dummy 出入边的斜线段 (弯点 y 对齐端口锚点).
  correctSlantedEdgeSegments(layeredGraph)
}

export function collectNorthSouthDummies(layeredGraph: LGraph): LNode[] {
  const out: LNode[] = []
  for (const node of layeredGraph.getAllNodes()) {
    if (node.getType() !== NodeType.EXTERNAL_PORT) continue
    const side = node.getProperty(EXT_PORT_SIDE)
    if (side === PortSide.NORTH || side === PortSide.SOUTH) out.push(node)
  }
  return out
}

// ── Step 1: 恢复原始 N/S dummy ──

export function restoreNorthSouthDummies(layeredGraph: LGraph): LNode[] {
  const replaced = layeredGraph.getProperty(EXT_PORT_REPLACED_DUMMIES)
  if (replaced === undefined || replaced === null || replaced.length === 0) return []
  const restored: LNode[] = []
  for (const dummy of replaced) {
    restoreDummy(dummy)
    restored.push(dummy)
  }
  // 把替换 dummy 连回原始 dummy
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (node.getType() !== NodeType.EXTERNAL_PORT) continue
      const replacedDummy = node.getProperty<LNode>(EXT_PORT_REPLACED_DUMMY)
      if (replacedDummy !== undefined && replacedDummy !== null) {
        connectNodeToDummy(node, replacedDummy)
      }
    }
  }
  // 原始 dummy 归入最后一层 (位置由 Step2 定, 层只是归属)
  const layers = layeredGraph.getLayers()
  for (const dummy of restored) dummy.setLayer(layers[layers.length - 1]!)
  return restored
}

export function restoreDummy(dummy: LNode): void {
  const portSide = dummy.getProperty(EXT_PORT_SIDE)
  const dummyPort = dummy.getPorts()[0]!
  if (portSide === PortSide.NORTH) dummyPort.setSide(PortSide.SOUTH)
  else if (portSide === PortSide.SOUTH) dummyPort.setSide(PortSide.NORTH)
}

export function connectNodeToDummy(node: LNode, dummy: LNode): void {
  const outPort = new LPort()
  outPort.setNode(node)
  outPort.setSide(node.getProperty(EXT_PORT_SIDE))
  const inPort = dummy.getPorts()[0]!
  const edge = new LEdge()
  edge.setSource(outPort)
  edge.setTarget(inPort)
}

// ── Step 2: 定位 N/S dummy ──

export function setNorthSouthDummyCoordinates(layeredGraph: LGraph, northSouthDummies: LNode[]): void {
  const constraints = layeredGraph.getProperty(PORT_CONSTRAINTS)
  const graphSize = layeredGraph.getSize()
  const graphPadding = layeredGraph.getPadding()
  const graphWidth = graphSize.x + graphPadding.left + graphPadding.right
  // ggn 的 resizeParentNode 平移公式为 dy = pad.top - minY (padding 单独计入),
  // 故此处 northY 不含 -padding.top, 避免 padding 双算 (ELK 用 getActualSize 无此问题).
  const northY = 0 - layeredGraph.getOffset().y
  const southY = graphSize.y + graphPadding.top + graphPadding.bottom - layeredGraph.getOffset().y
  if (process.env.GGN_HOR_DBG) console.error(`[HOR] Step2 offset=(${layeredGraph.getOffset().x},${layeredGraph.getOffset().y}) size=(${graphSize.x},${graphSize.y}) pad=[${graphPadding.left},${graphPadding.top},${graphPadding.right},${graphPadding.bottom}] northY=${northY} southY=${southY}`)

  const northernDummies: LNode[] = []
  const southernDummies: LNode[] = []

  for (const dummy of northSouthDummies) {
    switch (constraints) {
      case PortConstraints.FREE:
      case PortConstraints.FIXED_SIDE:
      case PortConstraints.FIXED_ORDER:
        calculateNorthSouthDummyPositions(dummy)
        break
      case PortConstraints.FIXED_RATIO:
        applyNorthSouthDummyRatio(dummy, graphWidth)
        break
      case PortConstraints.FIXED_POS:
        applyNorthSouthDummyPosition(dummy)
        graphSize.x = Math.max(graphSize.x, dummy.getPosition().x + dummy.getSize().x / 2)
        break
      default:
        break
    }
    switch (dummy.getProperty(EXT_PORT_SIDE)) {
      case PortSide.NORTH:
        dummy.getPosition().y = northY
        northernDummies.push(dummy)
        break
      case PortSide.SOUTH:
        dummy.getPosition().y = southY
        southernDummies.push(dummy)
        break
      default:
        break
    }
  }

  if (constraints === PortConstraints.FREE || constraints === PortConstraints.FIXED_SIDE) {
    ensureUniquePositions(northernDummies, layeredGraph)
    ensureUniquePositions(southernDummies, layeredGraph)
  } else if (constraints === PortConstraints.FIXED_ORDER) {
    restoreProperOrder(northernDummies, layeredGraph)
    restoreProperOrder(southernDummies, layeredGraph)
  }
}

export function calculateNorthSouthDummyPositions(dummy: LNode): void {
  const dummyInPort = dummy.getPorts()[0]!
  if (dummyInPort.getDegree() === 0) {
    dummy.getPosition().x = 0
    return
  }
  let posSum = 0
  for (const connectedPort of dummyInPort.getConnectedPorts()) {
    posSum += connectedPort.getNode()!.getPosition().x + connectedPort.getPosition().x
      + connectedPort.getAnchor().x
  }
  const anchor = dummy.getProperty<{ x: number; y: number }>(PORT_ANCHOR)
  const offset = anchor === null || anchor === undefined ? 0 : anchor.x
  dummy.getPosition().x = posSum / dummyInPort.getDegree() - offset
}

function applyNorthSouthDummyRatio(dummy: LNode, width: number): void {
  const anchor = dummy.getProperty<{ x: number; y: number }>(PORT_ANCHOR)
  const offset = anchor === null || anchor === undefined ? 0 : anchor.x
  dummy.getPosition().x = width * dummy.getProperty(PORT_RATIO_OR_POSITION) - offset
}

function applyNorthSouthDummyPosition(dummy: LNode): void {
  const anchor = dummy.getProperty<{ x: number; y: number }>(PORT_ANCHOR)
  const offset = anchor === null || anchor === undefined ? 0 : anchor.x
  dummy.getPosition().x = dummy.getProperty(PORT_RATIO_OR_POSITION) - offset
}

function ensureUniquePositions(dummies: LNode[], graph: LGraph): void {
  if (dummies.length === 0) return
  dummies.sort((a, b) => a.getPosition().x - b.getPosition().x)
  assignAscendingCoordinates(dummies, graph)
}

function restoreProperOrder(dummies: LNode[], graph: LGraph): void {
  if (dummies.length === 0) return
  dummies.sort((a, b) => a.getProperty(PORT_RATIO_OR_POSITION) - b.getProperty(PORT_RATIO_OR_POSITION))
  assignAscendingCoordinates(dummies, graph)
}

function assignAscendingCoordinates(dummies: LNode[], graph: LGraph): void {
  const spacing = graph.getProperty(SPACING_PORT_PORT)
  let nextValid = dummies[0]!.getPosition().x + dummies[0]!.getSize().x
    + dummies[0]!.getMargin().right + spacing
  for (let index = 1; index < dummies.length; index++) {
    const pos = dummies[index]!.getPosition()
    const size = dummies[index]!.getSize()
    const margin = dummies[index]!.getMargin()
    const delta = pos.x - margin.left - nextValid
    if (delta < 0) pos.x -= delta
    const graphSize = graph.getSize()
    graphSize.x = Math.max(graphSize.x, pos.x + size.x)
    nextValid = pos.x + size.x + margin.right + spacing
  }
}

/** 统计 N/S 路由槽数 (复用 OrthogonalRoutingGenerator 方向参数化; 直线段不占槽). */
export function countRoutingSlots(layeredGraph: LGraph, dummies: LNode[]): { northSlots: number; southSlots: number } {
  const northDummies = dummies.filter(d => d.getProperty(EXT_PORT_SIDE) === PortSide.NORTH)
  const southDummies = dummies.filter(d => d.getProperty(EXT_PORT_SIDE) === PortSide.SOUTH)
  const random = layeredGraph.getProperty(RANDOM)
  // B19: ELK HierarchicalPortOrthogonalEdgeRouter 用 SPACING_EDGE_EDGE 作 edgeSpacing
  // (conflictThreshold = 0.5*edgeSpacing, 见 OrthogonalRoutingGenerator.java:72,134);
  // 旧写死 0 → 冲突检测阈值 0, 近距端口段 (all_four_port_sides: 128 vs 130, 差 2 < 5) 漏判
  // → 槽数 1 vs ELK 2 → offset.y 差 10 → 子节点 y 整体偏移 (alignment 修复暴露).
  const gen = new OrthogonalRoutingGenerator(layeredGraph.getProperty(SPACING_EDGE_EDGE))
  const sourcesOf = (ds: LNode[]): LNode[] => {
    const set = new Set<LNode>()
    for (const d of ds) {
      const port = d.getPorts()[0]
      if (port === undefined || port === null) continue
      for (const e of port.getIncomingEdges()) {
        const src = e.getSource()?.getNode()
        if (src !== null && src !== undefined) set.add(src)
      }
    }
    return [...set]
  }
  // ELK routeEdges (HierarchicalPortOrthogonalEdgeRouter.java:511-595):
  //   northern routing = SOUTH_TO_NORTH 策略 (sourceSide=NORTH, targetSide=SOUTH);
  //   southern routing = NORTH_TO_SOUTH 策略 (sourceSide=SOUTH, targetSide=NORTH).
  // 位置函数 = getPortPositionOnHyperNode (N-S: node.x + port.x + anchor.x).
  const northSlots = northDummies.length === 0 ? 0
    : gen.routeEdgesForDirection(sourcesOf(northDummies), northDummies, random,
        SOUTH_TO_NORTH.sourceSide, SOUTH_TO_NORTH.targetSide, SOUTH_TO_NORTH.positionFn)
  const southSlots = southDummies.length === 0 ? 0
    : gen.routeEdgesForDirection(sourcesOf(southDummies), southDummies, random,
        NORTH_TO_SOUTH.sourceSide, NORTH_TO_SOUTH.targetSide, NORTH_TO_SOUTH.positionFn)
  if (process.env.GGN_HOR_DBG) console.error(`GGN_HOR slots north=${northSlots} south=${southSlots} graphSize=(${layeredGraph.getSize().x},${layeredGraph.getSize().y})`)
  return { northSlots, southSlots }
}


/** ELK HierarchicalPortOrthogonalEdgeRouter.routeEdges (Step3 完整版): 北/南向路由 N/S 外部端口边.
 * 与 countRoutingSlots 的槽数逻辑一致, 但额外生成边弯点 (Java routeEdges → routingStrategy.calculateBendPoints).
 * 顺序: 先北向后南向, 北向调整 offset/size 后再算南向 startPos (与 Java 一致).
 */
function routeNorthSouthEdges(layeredGraph: LGraph, northSouthDummies: LNode[]): void {
  const northDummies = northSouthDummies.filter(d => d.getProperty(EXT_PORT_SIDE) === PortSide.NORTH)
  const southDummies = northSouthDummies.filter(d => d.getProperty(EXT_PORT_SIDE) === PortSide.SOUTH)
  const random = layeredGraph.getProperty(RANDOM)
  const nodeSpacing = layeredGraph.getProperty(SPACING_NODE_NODE)
  const edgeSpacing = layeredGraph.getProperty(SPACING_EDGE_EDGE)
  const gen = new OrthogonalRoutingGenerator(edgeSpacing)
  const sourcesOf = (ds: LNode[]): LNode[] => {
    const set = new Set<LNode>()
    for (const d of ds) {
      const port = d.getPorts()[0]
      if (port === undefined || port === null) continue
      for (const e of port.getIncomingEdges()) {
        const src = e.getSource()?.getNode()
        if (src !== null && src !== undefined) set.add(src)
      }
    }
    return [...set]
  }
  // 北向路由 (ELK routeEdges 北向调用, startPos = -nodeSpacing - offset.y).
  if (northDummies.length > 0) {
    const northSlots = gen.routeEdgesForDirection(
      sourcesOf(northDummies), northDummies, random,
      SOUTH_TO_NORTH.sourceSide, SOUTH_TO_NORTH.targetSide, SOUTH_TO_NORTH.positionFn,
      -nodeSpacing - layeredGraph.getOffset().y,
    )
    if (northSlots > 0) {
      const h = nodeSpacing + (northSlots - 1) * edgeSpacing
      layeredGraph.getOffset().y += h
      layeredGraph.getSize().y += h
    }
  }
  // 南向路由 (ELK routeEdges 南向调用, startPos = size.y + nodeSpacing - offset.y, 北向调整后).
  if (southDummies.length > 0) {
    const southSlots = gen.routeEdgesForDirection(
      sourcesOf(southDummies), southDummies, random,
      NORTH_TO_SOUTH.sourceSide, NORTH_TO_SOUTH.targetSide, NORTH_TO_SOUTH.positionFn,
      layeredGraph.getSize().y + nodeSpacing - layeredGraph.getOffset().y,
    )
    if (southSlots > 0) {
      layeredGraph.getSize().y += nodeSpacing + (southSlots - 1) * edgeSpacing
    }
  }
}

/** Step5 (ELK fixCoordinates): 首/末层 E/W dummy 定 x (WEST=-offset.x-pad.left, EAST=size.x+pad.right-offset.x), 再定 N/S y. */
export function fixExternalPortCoordinates(layeredGraph: LGraph): void {
  // ELK fixCoordinates (Step5): 两遍 — 先 E/W dummy x + FIXED_RATIO/FIXED_POS y (可能改图高),
  // 再 N/S dummy y. ggn 坐标系: N/S y 用 -offset.y (padding 由 resizeParentNode 单独计入).
  const layers = layeredGraph.getLayers()
  if (layers.length === 0) return
  fixLayerExternalPorts(layers[0]!, layeredGraph)
  fixLayerExternalPorts(layers[layers.length - 1]!, layeredGraph)
}

function fixLayerExternalPorts(layer: Layer, layeredGraph: LGraph): void {
  const constraints = layeredGraph.getProperty(PORT_CONSTRAINTS)
  const pad = layeredGraph.getPadding()
  const offset = layeredGraph.getOffset()
  const size = layeredGraph.getSize()
  const actualSizeY = size.y + pad.top + pad.bottom
  let newActualGraphHeight = actualSizeY

  // 迭代 1: E/W dummy x + (FIXED_RATIO/FIXED_POS) y
  for (const node of layer.getNodes()) {
    if (node.getType() !== NodeType.EXTERNAL_PORT) continue
    const side = node.getProperty(EXT_PORT_SIDE)
    const nodePosition = node.getPosition()
    let extPortSize = node.getProperty<{ x: number; y: number }>(EXT_PORT_SIZE)
    if (extPortSize === undefined || extPortSize === null) {
      const origin = node.getProperty(ORIGIN)
      extPortSize = origin instanceof LPort ? origin.getSize() : { x: 0, y: 0 }
    }
    switch (side) {
      case PortSide.EAST:
        nodePosition.x = size.x + pad.right - offset.x
        break
      case PortSide.WEST:
        nodePosition.x = -offset.x - pad.left
        break
    }
    let requiredActualGraphHeight = 0
    if (side === PortSide.EAST || side === PortSide.WEST) {
      const anchor = node.getProperty<{ x: number; y: number }>(PORT_ANCHOR)
      const anchorY = anchor === null || anchor === undefined ? 0 : anchor.y
      if (constraints === PortConstraints.FIXED_RATIO) {
        const ratio = node.getProperty(PORT_RATIO_OR_POSITION) ?? 0  // ELK 属性默认 0, 避免 NaN
        nodePosition.y = size.y * ratio - anchorY
        requiredActualGraphHeight = nodePosition.y + extPortSize.y
        nodePosition.y -= pad.top + offset.y  // borderToContentAreaCoordinates(false, true)
      } else if (constraints === PortConstraints.FIXED_POS) {
        const pos = node.getProperty(PORT_RATIO_OR_POSITION) ?? 0  // ELK 属性默认 0, 避免 NaN
        nodePosition.y = pos - anchorY
        requiredActualGraphHeight = nodePosition.y + extPortSize.y
        nodePosition.y -= pad.top + offset.y
      }
    }
    newActualGraphHeight = Math.max(newActualGraphHeight, requiredActualGraphHeight)
  }
  // 图高调整 (仅当内容高被外部端口 y 撑大)
  size.y += newActualGraphHeight - actualSizeY

  // 迭代 2: N/S dummy y (ggn 坐标系: 不含 padding, resize 单独计入)
  for (const node of layer.getNodes()) {
    if (node.getType() !== NodeType.EXTERNAL_PORT) continue
    const side = node.getProperty(EXT_PORT_SIDE)
    const nodePosition = node.getPosition()
    switch (side) {
      case PortSide.NORTH:
        nodePosition.y = -offset.y
        break
      case PortSide.SOUTH:
        nodePosition.y = size.y + pad.top + pad.bottom - offset.y
        break
    }
  }
}

// ── Step 4: 清理临时替换 dummy ──

export function removeTemporaryNorthSouthDummies(layeredGraph: LGraph): void {
  // ELK 精确语义: 临时 dummy 的入/出边重连到原始 dummy (迁移弯点), 断开 origin 边, 移除临时 dummy.
  const nodesToRemove: LNode[] = []
  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (node.getType() !== NodeType.EXTERNAL_PORT) continue
      if (!node.hasProperty(EXT_PORT_REPLACED_DUMMY)) continue
      // 分类端口 (HPC createDummy: WEST=入, EAST=出; connectNodeToDummy 新增 origin 端口连原始 dummy).
      let nodeInPort: LPort | null = null
      let nodeOutPort: LPort | null = null
      let nodeOriginPort: LPort | null = null
      for (const port of node.getPorts()) {
        switch (port.getSide()) {
          case PortSide.WEST: nodeInPort = port; break
          case PortSide.EAST: nodeOutPort = port; break
          default: nodeOriginPort = port
        }
      }
      if (nodeInPort === null || nodeOutPort === null || nodeOriginPort === null) continue
      const nodeToOriginEdge = nodeOriginPort.getOutgoingEdges()[0]
      if (nodeToOriginEdge === undefined) continue
      // 入边弯点: origin 边弯点 + 开头插 (originPort.pos + node.pos)
      const incomingEdgeBendPoints: { x: number; y: number }[] =
        nodeToOriginEdge.getBendPoints().map(bp => ({ ...bp }))
      const firstBendPoint = {
        x: nodeOriginPort.getPosition().x + node.getPosition().x,
        y: nodeOriginPort.getPosition().y + node.getPosition().y,
      }
      incomingEdgeBendPoints.unshift(firstBendPoint)
      // 出边弯点: 反转 + 末尾 (originPort.pos + node.pos)
      const outgoingEdgeBendPoints: { x: number; y: number }[] =
        [...nodeToOriginEdge.getBendPoints()].reverse().map(bp => ({ ...bp }))
      outgoingEdgeBendPoints.push({ ...firstBendPoint })
      // 原始 dummy 及其端口
      const replacedDummy = node.getProperty<LNode>(EXT_PORT_REPLACED_DUMMY)!
      const replacedDummyPort = replacedDummy.getPorts()[0]!
      // 重连入边 → 原始 dummy 端口, 弯点末尾追加
      for (const edge of [...nodeInPort.getIncomingEdges()]) {
        edge.setTarget(replacedDummyPort)
        edge.getBendPoints().push(...incomingEdgeBendPoints.map(bp => ({ ...bp })))
      }
      // 重连出边 ← 原始 dummy 端口, 弯点开头插入
      for (const edge of [...nodeOutPort.getOutgoingEdges()]) {
        edge.setSource(replacedDummyPort)
        edge.getBendPoints().unshift(...outgoingEdgeBendPoints.map(bp => ({ ...bp })))
      }
      // 断开 origin 边
      nodeToOriginEdge.setSource(null)
      nodeToOriginEdge.setTarget(null)
      nodesToRemove.push(node)
    }
  }
  for (const node of nodesToRemove) {
    node.setLayer(null)
    // ELK Java: LNode 构造不加入 layerlessNodes, setLayer(null) 后 dummy 彻底移除.
    // TS LNode(graph) 构造会 push layerlessNodes, 且 P2 后创建的替换 dummy 不会被 layerer
    // 清理 → 残留 layerlessNodes → resizeParentNode (getAllNodes) 用其 ORIGIN LPort 覆盖
    // 真实外部端口位置 (194 实证: p1/p3 被残留替换 dummy (190,171)/(200,65) 覆盖成 208,
    // jar 为 198/216). 与 Java 语义对齐: 删除时同时移出 layerlessNodes.
    const idx = layeredGraph.getLayerlessNodes().indexOf(node)
    if (idx !== -1) layeredGraph.getLayerlessNodes().splice(idx, 1)
  }
}

// ── Step 6: 斜线段修正 (ELK correctSlantedEdgeSegments) ──

/** E/W 外部端口 dummy 出入边的首/末弯点 y 对齐端口锚点 (修正 fixCoordinates 引入的斜线段). */
export function correctSlantedEdgeSegments(layeredGraph: LGraph): void {
  const layers = layeredGraph.getLayers()
  if (layers.length === 0) return
  correctSlantedEdgeSegmentsInLayer(layers[0]!)
  correctSlantedEdgeSegmentsInLayer(layers[layers.length - 1]!)
}

function correctSlantedEdgeSegmentsInLayer(layer: Layer): void {
  for (const node of layer.getNodes()) {
    if (node.getType() !== NodeType.EXTERNAL_PORT) continue
    const side = node.getProperty(EXT_PORT_SIDE)
    if (side !== PortSide.EAST && side !== PortSide.WEST) continue
    for (const port of node.getPorts()) {
      for (const edge of port.getConnectedEdges()) {
        const bendPoints = edge.getBendPoints()
        if (bendPoints.length === 0) continue
        const sourcePort = edge.getSource()
        if (sourcePort !== null && sourcePort.getNode() === node) {
          bendPoints[0]!.y = sourcePort.getAbsoluteAnchor().y
        }
        const targetPort = edge.getTarget()
        if (targetPort !== null && targetPort.getNode() === node) {
          bendPoints[bendPoints.length - 1]!.y = targetPort.getAbsoluteAnchor().y
        }
      }
    }
  }
}
