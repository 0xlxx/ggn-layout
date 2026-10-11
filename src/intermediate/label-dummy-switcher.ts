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
 * LabelDummySwitcher (对应 ELK intermediate.LabelDummySwitcher, 756 行).
 *
 * 把 LABEL dummy 节点与长边 dummy 交换位置, 使中心边标签落到其长边跨越层的"最优"层
 * (CenterEdgeLabelPlacementStrategy 决定目标层). 运行在 P3 crossing minimization 之后
 * (ELK IntermediateProcessorStrategy "Before Phase 4": END_LABEL_PREPROCESSOR 之后、
 * LABEL_SIDE_SELECTOR 之前), 因此交换时保持层内节点顺序 (swapNodes 按层内位置交换).
 *
 * 额外维护 LONG_EDGE_BEFORE_LABEL_DUMMY 属性: 标签 dummy 左侧的所有长边 dummy 置 true,
 * 防止 HyperedgeDummyMerger 把标签错误合并进超边.
 *
 * ELK 行号依据:
 *  - 策略枚举: CenterEdgeLabelPlacementStrategy.java L21-59 (MEDIAN/TAIL/HEAD/SPACE_EFFICIENT/WIDEST/CENTER)
 *  - 默认策略: Layered.melk L1045 `default = CenterEdgeLabelPlacementStrategy.MEDIAN_LAYER`
 *  - 主流程: LabelDummySwitcher.java L112-160 (process)
 *  - 交换: L557-607 (swapNodes) / assignLayer L533-554 / ithDummyNode L742-755
 *  - LONG_EDGE_BEFORE_LABEL_DUMMY: L609-643
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { Layer } from '../graph/layer.js'
import { NodeType, PortType, Direction } from '../graph/enums.js'
import { REPRESENTED_LABELS, LONG_EDGE_BEFORE_LABEL_DUMMY, REVERSED } from '../options/internal-properties.js'
import {
  CenterEdgeLabelPlacementStrategy,
  EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY,
  SPACING_EDGE_NODE_BETWEEN_LAYERS,
  SPACING_NODE_NODE_BETWEEN_LAYERS,
  ALIGNMENT,
  DIRECTION,
} from '../options/layered-options.js'

/** 枚举顺序 (ELK values()): 影响非宽度策略/宽度策略两轮的执行顺序. */
const STRATEGY_ORDER: CenterEdgeLabelPlacementStrategy[] = [
  CenterEdgeLabelPlacementStrategy.MEDIAN_LAYER,
  CenterEdgeLabelPlacementStrategy.TAIL_LAYER,
  CenterEdgeLabelPlacementStrategy.HEAD_LAYER,
  CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER,
  CenterEdgeLabelPlacementStrategy.WIDEST_LAYER,
  CenterEdgeLabelPlacementStrategy.CENTER_LAYER,
]

/** 是否基于层宽度信息 (ELK CenterEdgeLabelPlacementStrategy.usesLabelSizeInformation). */
function usesLabelSizeInformation(strategy: CenterEdgeLabelPlacementStrategy): boolean {
  return strategy === CenterEdgeLabelPlacementStrategy.WIDEST_LAYER
    || strategy === CenterEdgeLabelPlacementStrategy.CENTER_LAYER
    || strategy === CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER
}

/**
 * 主入口: 把中心标签 dummy 交换到长边最优层.
 */
export function processLabelDummySwitch(layeredGraph: LGraph): void {
  // 图级默认策略 (无更具体策略时假定, ELK L116-118).
  const defaultPlacementStrategy = layeredGraph.getProperty(EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY)

  // 给层分配 0 基 id.
  assignIdsToLayers(layeredGraph)

  // 按策略收集 label dummy 信息.
  const labelDummyInfos = gatherLabelDummyInfos(layeredGraph, defaultPlacementStrategy)

  // 若有宽度策略激活, 计算每层宽度 (此后 layerWidths 全零或等于每层最宽非 dummy 节点).
  let layerWidths: number[] = new Array(layeredGraph.getLayers().length).fill(0)
  for (const strategy of STRATEGY_ORDER) {
    if (usesLabelSizeInformation(strategy) && labelDummyInfos.get(strategy)!.length > 0) {
      layerWidths = calculateLayerWidths(layeredGraph)
      break
    }
  }

  // 先处理非宽度策略 (可能改变层宽, 影响后续宽度策略).
  for (const strategy of STRATEGY_ORDER) {
    if (!usesLabelSizeInformation(strategy)) {
      processStrategy(labelDummyInfos.get(strategy)!, layerWidths)
    }
  }
  // 再执行宽度策略.
  for (const strategy of STRATEGY_ORDER) {
    if (usesLabelSizeInformation(strategy)) {
      processStrategy(labelDummyInfos.get(strategy)!, layerWidths)
    }
  }
}

/** 给每层赋 0 基 id (ELK assignIdsToLayers L164-172). */
function assignIdsToLayers(layeredGraph: LGraph): void {
  let layerIndex = 0
  for (const layer of layeredGraph.getLayers()) {
    layer.id = layerIndex
    layerIndex++
  }
}

/** 收集图的 LABEL dummy, 按放置策略分组 (ELK gatherLabelDummyInfos L176-198). */
function gatherLabelDummyInfos(
  layeredGraph: LGraph,
  defaultPlacementStrategy: CenterEdgeLabelPlacementStrategy,
): Map<CenterEdgeLabelPlacementStrategy, LabelDummyInfo[]> {
  const infos = new Map<CenterEdgeLabelPlacementStrategy, LabelDummyInfo[]>()
  for (const strategy of STRATEGY_ORDER) infos.set(strategy, [])

  for (const layer of layeredGraph.getLayers()) {
    for (const node of layer.getNodes()) {
      if (node.getType() === NodeType.LABEL) {
        const dummyInfo = new LabelDummyInfo(node, defaultPlacementStrategy)
        infos.get(dummyInfo.placementStrategy)!.push(dummyInfo)
      }
    }
  }
  return infos
}

/** 填充层宽度数组 (按层 id 索引) (ELK calculateLayerWidths L202-210). */
function calculateLayerWidths(layeredGraph: LGraph): number[] {
  const layerWidths = new Array(layeredGraph.getLayers().length).fill(0)
  for (const layer of layeredGraph.getLayers()) {
    layerWidths[layer.id] = findMaxNonDummyNodeWidth(layer)
  }
  return layerWidths
}

/** 层内最宽 NORMAL 节点宽度 (ELK LGraphUtil.findMaxNonDummyNodeWidth(layer, false) L313-333). */
function findMaxNonDummyNodeWidth(layer: Layer): number {
  const graph = layer.getGraph()
  if (graph !== null && (graph.getProperty(DIRECTION) === Direction.DOWN || graph.getProperty(DIRECTION) === Direction.UP)) {
    return 0.0
  }
  let maxWidth = 0.0
  for (const node of layer.getNodes()) {
    if (node.getType() === NodeType.NORMAL) {
      maxWidth = Math.max(maxWidth, node.getSize().x)
    }
  }
  return maxWidth
}

/** 对给定策略的 label dummy 列表执行交换 (ELK processStrategy L214-246). */
function processStrategy(labelDummyInfos: LabelDummyInfo[], layerWidths: number[]): void {
  if (labelDummyInfos.length === 0) return

  if (labelDummyInfos[0]!.placementStrategy === CenterEdgeLabelPlacementStrategy.SPACE_EFFICIENT_LAYER) {
    computeSpaceEfficientAssignment(labelDummyInfos, layerWidths)
  } else {
    for (const labelDummyInfo of labelDummyInfos) {
      switch (labelDummyInfo.placementStrategy) {
        case CenterEdgeLabelPlacementStrategy.CENTER_LAYER:
          assignLayer(labelDummyInfo, findCenterLayerTargetId(labelDummyInfo, layerWidths), layerWidths)
          break
        case CenterEdgeLabelPlacementStrategy.MEDIAN_LAYER:
          assignLayer(labelDummyInfo, findMedianLayerTargetId(labelDummyInfo), layerWidths)
          break
        case CenterEdgeLabelPlacementStrategy.WIDEST_LAYER:
          assignLayer(labelDummyInfo, findWidestLayerTargetId(labelDummyInfo, layerWidths), layerWidths)
          break
        case CenterEdgeLabelPlacementStrategy.HEAD_LAYER:
          setEndLayerNodeAlignment(labelDummyInfo)
          assignLayer(labelDummyInfo, findEndLayerTargetId(labelDummyInfo, true), layerWidths)
          break
        case CenterEdgeLabelPlacementStrategy.TAIL_LAYER:
          setEndLayerNodeAlignment(labelDummyInfo)
          assignLayer(labelDummyInfo, findEndLayerTargetId(labelDummyInfo, false), layerWidths)
          break
      }
      updateLongEdgeSourceLabelDummyInfo(labelDummyInfo)
    }
  }
}

// ── Widest Layer ──

/** 选跨越层中最宽的层 (ELK findWidestLayerTargetId L250-264). */
function findWidestLayerTargetId(labelDummyInfo: LabelDummyInfo, layerWidths: number[]): number {
  let widestLayerIndex = labelDummyInfo.leftmostLayerId
  for (let index = widestLayerIndex + 1; index <= labelDummyInfo.rightmostLayerId; index++) {
    if (layerWidths[index]! > layerWidths[widestLayerIndex]!) {
      widestLayerIndex = index
    }
  }
  return widestLayerIndex
}

// ── Center Layer ──

/** 选接近边物理中心的层 (ELK findCenterLayerTargetId L272-294). */
function findCenterLayerTargetId(labelDummyInfo: LabelDummyInfo, layerWidths: number[]): number {
  const layerWidthSums = computeLayerWidthSums(labelDummyInfo, layerWidths)
  const threshold = layerWidthSums[layerWidthSums.length - 1]! / 2
  for (let i = 0; i < layerWidthSums.length; i++) {
    if (layerWidthSums[i]! >= threshold) {
      return labelDummyInfo.leftmostLayerId + i
    }
  }
  // 理论不可达.
  return labelDummyInfo.leftmostLayerId + labelDummyInfo.leftLongEdgeDummies.length
}

/** 累计层宽数组 (entry i = 层 [0..i] 的估计总宽) (ELK computeLayerWidthSums L296-329). */
function computeLayerWidthSums(labelDummyInfo: LabelDummyInfo, layerWidths: number[]): number[] {
  const lgraph = labelDummyInfo.labelDummy.getGraph()!
  const edgeNodeSpacing = lgraph.getProperty(SPACING_EDGE_NODE_BETWEEN_LAYERS) * 2
  const nodeNodeSpacing = lgraph.getProperty(SPACING_NODE_NODE_BETWEEN_LAYERS)
  const minSpaceBetweenLayers = Math.max(edgeNodeSpacing, nodeNodeSpacing)

  const layerWidthSums = new Array<number>(labelDummyInfo.totalDummyCount())
  let currentWidthSum = -minSpaceBetweenLayers
  let currentIndex = 0

  for (const leftDummy of labelDummyInfo.leftLongEdgeDummies) {
    currentWidthSum += layerWidths[leftDummy.getLayer()!.id]! + minSpaceBetweenLayers
    layerWidthSums[currentIndex++] = currentWidthSum
  }
  currentWidthSum += layerWidths[labelDummyInfo.labelDummy.getLayer()!.id]! + minSpaceBetweenLayers
  layerWidthSums[currentIndex++] = currentWidthSum
  for (const rightDummy of labelDummyInfo.rightLongEdgeDummies) {
    currentWidthSum += layerWidths[rightDummy.getLayer()!.id]! + minSpaceBetweenLayers
    layerWidthSums[currentIndex++] = currentWidthSum
  }
  return layerWidthSums
}

// ── Median Layer ──

/** 选跨越层的中位层 (取下中位数) (ELK findMedianLayerTargetId L336-343). */
function findMedianLayerTargetId(labelDummyInfo: LabelDummyInfo): number {
  const layers = labelDummyInfo.totalDummyCount()
  const lowerMedian = Math.floor((layers - 1) / 2)
  return labelDummyInfo.leftmostLayerId + lowerMedian
}

// ── End Layer ──

/** 选最靠近原边头/尾的层 (考虑反转) (ELK findEndLayerTargetId L352-363). */
function findEndLayerTargetId(labelDummyInfo: LabelDummyInfo, headLayer: boolean): number {
  const reversed = isPartOfReversedEdge(labelDummyInfo)
  if ((headLayer && !reversed) || (!headLayer && reversed)) {
    return labelDummyInfo.rightmostLayerId
  }
  return labelDummyInfo.leftmostLayerId
}

/** 为端部策略设置 ALIGNMENT (ELK setEndLayerNodeAlignment L366-381). */
function setEndLayerNodeAlignment(labelDummyInfo: LabelDummyInfo): void {
  const isHeadLabel = labelDummyInfo.placementStrategy === CenterEdgeLabelPlacementStrategy.HEAD_LAYER
  const isPartOfReversedEdgeFlag = isPartOfReversedEdge(labelDummyInfo)
  if ((isHeadLabel && !isPartOfReversedEdgeFlag) || (!isHeadLabel && isPartOfReversedEdgeFlag)) {
    labelDummyInfo.labelDummy.setProperty(ALIGNMENT, 'RIGHT')
  } else {
    labelDummyInfo.labelDummy.setProperty(ALIGNMENT, 'LEFT')
  }
}

/** 标签 dummy 是否属于反转边 (ELK isPartOfReversedEdge L384-397). */
function isPartOfReversedEdge(labelDummyInfo: LabelDummyInfo): boolean {
  const incoming = labelDummyInfo.labelDummy.getIncomingEdges()[0]!
  const outgoing = labelDummyInfo.labelDummy.getOutgoingEdges()[0]!
  return incoming.getProperty(REVERSED) || outgoing.getProperty(REVERSED)
}

// ── Space Efficient ──

/**
 * 空间高效启发式 (ELK computeSpaceEfficientAssignment L405-422):
 * 先做平凡指派 (只有单一可选层 / 可放入已足够宽的层), 剩余标签按宽度降序,
 * 逐个放入当前潜在宽度最大的层.
 */
function computeSpaceEfficientAssignment(labelDummyInfos: LabelDummyInfo[], layerWidths: number[]): void {
  const nonTrivialLabels = performTrivialAssignments(labelDummyInfos, layerWidths)
  if (nonTrivialLabels.length === 0) return

  nonTrivialLabels.sort((info1, info2) => info2.labelDummy.getSize().x - info1.labelDummy.getSize().x)

  const labelCount = nonTrivialLabels.length
  for (let labelIndex = 0; labelIndex < labelCount; labelIndex++) {
    assignLayer(nonTrivialLabels[labelIndex]!, findPotentiallyWidestLayer(nonTrivialLabels, labelIndex, layerWidths), layerWidths)
  }
}

/** 平凡指派: 仅单一可选层 / 可放入足够宽层; 返回剩余标签 (ELK performTrivialAssignments L425-443). */
function performTrivialAssignments(labelDummyInfos: LabelDummyInfo[], layerWidths: number[]): LabelDummyInfo[] {
  const remainingLabels: LabelDummyInfo[] = []
  for (const labelDummyInfo of labelDummyInfos) {
    if (labelDummyInfo.leftmostLayerId === labelDummyInfo.rightmostLayerId) {
      assignLayer(labelDummyInfo, labelDummyInfo.leftmostLayerId, layerWidths)
    } else if (!assignToWiderLayer(labelDummyInfo, layerWidths)) {
      remainingLabels.push(labelDummyInfo)
    }
  }
  return remainingLabels
}

/** 尝试放入第一个宽度足够容纳标签的层; 无则返回 false (ELK assignToWiderLayer L446-466). */
function assignToWiderLayer(labelDummyInfo: LabelDummyInfo, layerWidths: number[]): boolean {
  const dummyWidth = labelDummyInfo.labelDummy.getSize().x
  const graph = labelDummyInfo.labelDummy.getGraph()!
  const validLayers = graph.getLayers().slice(labelDummyInfo.leftmostLayerId, labelDummyInfo.rightmostLayerId + 1)
  for (const layer of validLayers) {
    if (layer.getSize().x >= dummyWidth) {
      assignLayer(labelDummyInfo, layer.id, layerWidths)
      return true
    }
  }
  return false
}

/** 返回潜在宽度最大的层下标 (ELK findPotentiallyWidestLayer L469-518). */
function findPotentiallyWidestLayer(
  labelDummyInfos: LabelDummyInfo[], labelIndex: number, layerWidths: number[],
): number {
  const labelCount = labelDummyInfos.length
  const labelDummyInfo = labelDummyInfos[labelIndex]!
  const labelDummyWidth = labelDummyInfo.labelDummy.getSize().x

  let widestLayerIndex = labelDummyInfo.leftmostLayerId
  let widestLayerWidth = 0

  for (let layer = labelDummyInfo.leftmostLayerId; layer <= labelDummyInfo.rightmostLayerId; layer++) {
    if (labelDummyWidth <= layerWidths[layer]!) {
      return layer
    }
    let potentialWidth = layerWidths[layer]!

    // 找该层中最大的未指派标签 (除当前标签外).
    let largestUnassignedLabel: LabelDummyInfo | null = null
    for (let label = labelIndex + 1; label < labelCount; label++) {
      const currLabelInfo = labelDummyInfos[label]!
      if (currLabelInfo.leftmostLayerId <= layer && currLabelInfo.rightmostLayerId >= layer) {
        largestUnassignedLabel = currLabelInfo
      }
    }
    if (largestUnassignedLabel !== null) {
      potentialWidth = Math.max(potentialWidth, largestUnassignedLabel.labelDummy.getSize().x)
    }
    // 多个最宽层时取最左.
    if (potentialWidth > widestLayerWidth) {
      widestLayerIndex = layer
      widestLayerWidth = potentialWidth
    }
  }
  return widestLayerIndex
}

// ── Swapping Utilities ──

/** 把 label dummy 指派到目标层 (必要时与目标层长边 dummy 交换) (ELK assignLayer L529-551). */
function assignLayer(labelDummyInfo: LabelDummyInfo, targetLayerIndex: number, layerWidths: number[]): void {
  // 目标层非 label dummy 当前所在位置时, 与链上该位置的长边 dummy 交换.
  if (targetLayerIndex !== labelDummyInfo.leftmostLayerId + labelDummyInfo.leftLongEdgeDummies.length) {
    swapNodes(labelDummyInfo.labelDummy, labelDummyInfo.ithDummyNode(targetLayerIndex - labelDummyInfo.leftmostLayerId))
  }

  // 更新 label dummy 新所在层的宽度.
  const newLayerId = labelDummyInfo.labelDummy.getLayer()!.id
  layerWidths[newLayerId] = Math.max(layerWidths[newLayerId]!, labelDummyInfo.labelDummy.getSize().x)
}

/**
 * 交换 label dummy 与长边 dummy 的层位置并重连边 (ELK swapNodes L556-607).
 * 运行在 crossing minimization 之后, 必须保持层内节点顺序 — 按位置交换而非简单 move.
 */
function swapNodes(labelDummy: LNode, longEdgeDummy: LNode): void {
  const layer1 = labelDummy.getLayer()!
  const layer2 = longEdgeDummy.getLayer()!

  const dummy1LayerPosition = layer1.getNodes().indexOf(labelDummy)
  const dummy2LayerPosition = layer2.getNodes().indexOf(longEdgeDummy)

  // 两个 dummy 各有一个输入/输出端口.
  const inputPort1 = labelDummy.getPorts(PortType.INPUT)[0]!
  const outputPort1 = labelDummy.getPorts(PortType.OUTPUT)[0]!
  const inputPort2 = longEdgeDummy.getPorts(PortType.INPUT)[0]!
  const outputPort2 = longEdgeDummy.getPorts(PortType.OUTPUT)[0]!

  // 交换前先快照各自入/出边.
  const incomingEdges1 = [...inputPort1.getIncomingEdges()]
  const outgoingEdges1 = [...outputPort1.getOutgoingEdges()]
  const incomingEdges2 = [...inputPort2.getIncomingEdges()]
  const outgoingEdges2 = [...outputPort2.getOutgoingEdges()]

  // 第一个 dummy 放入第二个 dummy 的层, 并把第二个 dummy 的边重连到第一个.
  labelDummy.setLayerAt(dummy2LayerPosition, layer2)
  for (const edge of incomingEdges2) edge.setTarget(inputPort1)
  for (const edge of outgoingEdges2) edge.setSource(outputPort1)

  // 第二个 dummy 放入第一个 dummy 的层, 并把第一个 dummy 的边重连到第二个.
  longEdgeDummy.setLayerAt(dummy1LayerPosition, layer1)
  for (const edge of incomingEdges1) edge.setTarget(inputPort2)
  for (const edge of outgoingEdges1) edge.setSource(outputPort2)
}

/** 更新 label dummy 前驱长边 dummy 的 LONG_EDGE_BEFORE_LABEL_DUMMY (ELK updateLongEdgeSourceLabelDummyInfo L610-619). */
function updateLongEdgeSourceLabelDummyInfo(labelDummyInfo: LabelDummyInfo): void {
  doUpdateLongEdgeLabelDummyInfo(labelDummyInfo.labelDummy)
}

/** 从 label dummy 沿入边向左遍历, 把每个长边 dummy 的 LONG_EDGE_BEFORE_LABEL_DUMMY 置 true (ELK L621-643). */
function doUpdateLongEdgeLabelDummyInfo(labelDummy: LNode): void {
  let longEdgeDummy = labelDummy.getIncomingEdges()[0]!.getSource()!.getNode()!
  while (longEdgeDummy.getType() === NodeType.LONG_EDGE) {
    longEdgeDummy.setProperty(LONG_EDGE_BEFORE_LABEL_DUMMY, true)
    longEdgeDummy = longEdgeDummy.getIncomingEdges()[0]!.getSource()!.getNode()!
  }
}

// ── Label Dummy Info ──

/** 封装 label dummy 及其左右长边 dummy / 跨越层范围 (ELK LabelDummyInfo L648-756). */
class LabelDummyInfo {
  labelDummy: LNode
  placementStrategy: CenterEdgeLabelPlacementStrategy
  leftLongEdgeDummies: LNode[] = []
  rightLongEdgeDummies: LNode[] = []
  leftmostLayerId: number
  rightmostLayerId: number

  constructor(labelDummy: LNode, defaultPlacementStrategy: CenterEdgeLabelPlacementStrategy) {
    this.labelDummy = labelDummy
    this.placementStrategy = defaultPlacementStrategy

    this.gatherLeftLongEdgeDummies()
    this.gatherRightLongEdgeDummies()

    this.leftmostLayerId = this.leftLongEdgeDummies.length === 0
      ? labelDummy.getLayer()!.id
      : this.leftLongEdgeDummies[0]!.getLayer()!.id
    this.rightmostLayerId = this.rightLongEdgeDummies.length === 0
      ? labelDummy.getLayer()!.id
      : this.rightLongEdgeDummies[this.rightLongEdgeDummies.length - 1]!.getLayer()!.id

    // 标签级覆盖 (取第一个有覆盖的标签, ELK L121-127).
    for (const label of labelDummy.getProperty<unknown[]>(REPRESENTED_LABELS)) {
      const override = (label as { centerLabelPlacementStrategy?: string }).centerLabelPlacementStrategy
      if (override !== undefined && override !== null) {
        this.placementStrategy = override as CenterEdgeLabelPlacementStrategy
        break
      }
    }
  }

  /** 收集 label dummy 左侧同边长的长边 dummy (层序, 首元素最左) (ELK L684-699). */
  private gatherLeftLongEdgeDummies(): void {
    let source: LNode = this.labelDummy
    do {
      source = source.getIncomingEdges()[0]!.getSource()!.getNode()!
      if (source.getType() === NodeType.LONG_EDGE) {
        this.leftLongEdgeDummies.push(source)
      }
    } while (source.getType() === NodeType.LONG_EDGE)
    this.leftLongEdgeDummies.reverse()
  }

  /** 收集 label dummy 右侧同边长的长边 dummy (层序, 首元素最左) (ELK L702-716). */
  private gatherRightLongEdgeDummies(): void {
    let target: LNode = this.labelDummy
    do {
      target = target.getOutgoingEdges()[0]!.getTarget()!.getNode()!
      if (target.getType() === NodeType.LONG_EDGE) {
        this.rightLongEdgeDummies.push(target)
      }
    } while (target.getType() === NodeType.LONG_EDGE)
  }

  /** 边上 dummy 总数 (长边 + 标签) (ELK totalDummyCount L720-723). */
  totalDummyCount(): number {
    return this.rightmostLayerId - this.leftmostLayerId + 1
  }

  /** 从最左数第 i 个 dummy (ELK ithDummyNode L726-738). */
  ithDummyNode(i: number): LNode {
    if (i < this.leftLongEdgeDummies.length) {
      return this.leftLongEdgeDummies[i]!
    }
    if (i === this.leftLongEdgeDummies.length) {
      return this.labelDummy
    }
    return this.rightLongEdgeDummies[i - this.leftLongEdgeDummies.length - 1]!
  }
}
