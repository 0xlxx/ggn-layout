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
 * LayeredLayoutProvider (对应 ELK org.eclipse.elk.alg.layered.LayeredLayoutProvider).
 */
import type { LGraph } from './graph/lgraph.js'
import type { LNode } from './graph/lnode.js'
import { LPort } from './graph/lport.js'
import { RANDOM } from './options/internal-properties.js'
import { RANDOM_SEED } from './options/layered-options.js'
import { JavaRandom } from './util/java-random.js'
import { GreedyCycleBreaker } from './p1cycles/greedy-cycle-breaker.js'
import { processInteractiveCycleBreak } from './p1cycles/interactive-cycle-breaker.js'
import { processModelOrderCycleBreak } from './p1cycles/model-order-cycle-breaker.js'
import { GreedyModelOrderCycleBreaker } from './p1cycles/greedy-model-order-cycle-breaker.js'
import { EdgeAndLayerConstraintEdgeReverser } from './intermediate/edge-and-layer-constraint-edge-reverser.js'
import { HyperedgeDummyMerger } from './intermediate/hyperedge-dummy-merger.js'
import { NetworkSimplexLayerer } from './p2layers/network-simplex-layerer.js'
import { LongestPathLayerer } from './p2layers/longest-path-layerer.js'
import { LongestPathSourceLayerer } from './p2layers/longest-path-source-layerer.js'
import { processLabelDummyInsert } from './intermediate/label-dummy-inserter.js'
import { processLabelDummySwitch } from './intermediate/label-dummy-switcher.js'
import { processLabelDummyRemoval } from './intermediate/label-dummy-remover.js'
import { NodePromotion } from './p2layers/node-promotion.js'
import { LayerSweepCrossingMinimizer } from './p3order/layer-sweep-crossing-minimizer.js'
import { InteractiveCrossingMinimizer } from './p3order/interactive-crossing-minimizer.js'
import { CrossMinType } from './p3order/port-distributors.js'
import { BKNodePlacer } from './p4nodes/bk-node-placer.js'
import { processSimpleNodePlace } from './p4nodes/simple-node-placer.js'
import { processInteractiveNodePlace } from './p4nodes/interactive-node-placer.js'
import { NetworkSimplexPlacer } from './p4nodes/network-simplex-placer.js'
import { Spacings } from './p4nodes/spacings.js'
import { SPACINGS, GRAPH_PROPERTIES, GraphProperties, GREEDY_SWITCH_ACTIVE } from './options/internal-properties.js'
import { SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS, SPACING_COMPONENT_COMPONENT, SPACING_EDGE_EDGE, SPACING_EDGE_NODE, SPACING_EDGE_EDGE_BETWEEN_LAYERS, SPACING_EDGE_NODE_BETWEEN_LAYERS, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING, NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, NODE_PLACEMENT_STRATEGY, NodePlacementStrategy, EDGE_ROUTING, DIRECTION, PORT_CONSTRAINTS, PORT_BORDER_OFFSET, HIERARCHY_HANDLING, FEEDBACK_EDGES, EdgeLabelPlacement, COMPACTION_POST_COMPACTION_STRATEGY, PORT_LABELS_PLACEMENT } from './options/layered-options.js'
import { LayerSizeAndGraphHeightCalculator } from './p5edges/layer-size-calculator.js'
import { OrthogonalEdgeRouter } from './p5edges/orthogonal-edge-router.js'
import { HorizontalGraphCompactor } from './compaction/oned/horizontal-graph-compactor.js'
import { PolylineEdgeRouter } from './p5edges/polyline-edge-router.js'
import { SplineEdgeRouter } from './p5edges/splines/spline-edge-router.js'
import { processFinalSplineBendpoints } from './intermediate/final-spline-bendpoints-calculator.js'
import { processPortSides } from './intermediate/port-side-processor.js'
import { PortConstraints, Direction, PortSide, NodeType } from './graph/enums.js'
import { processLongEdgeSplit } from './intermediate/long-edge-splitter.js'
import { processLongEdgeJoin } from './intermediate/long-edge-joiner.js'
import { calculateNodeMargins, calculateNodeMargin } from './intermediate/node-margin-calculator.js'
import { CompoundGraphPreprocessor } from './compound/compound-graph-preprocessor.js'
import { ComponentsProcessor, computeComponentSize } from './components/components-processor.js'
import { processCompoundGraphPost } from './compound/compound-graph-postprocessor.js'
import { LayerConstraintPreprocessor } from './intermediate/layer-constraint-preprocessor.js'
import { processLayerConstraintPost } from './intermediate/layer-constraint-postprocessor.js'
import { processInteractiveLayering } from './p2layers/interactive-layerer.js'
import { DepthFirstCycleBreaker } from './p1cycles/DepthFirstCycleBreaker.js'
import { BFSNodeOrderCycleBreaker } from './p1cycles/BFSNodeOrderCycleBreaker.js'
import { DFSNodeOrderCycleBreaker } from './p1cycles/DFSNodeOrderCycleBreaker.js'
import { SCConnectivity } from './p1cycles/SCConnectivity.js'
import { SCCNodeTypeCycleBreaker } from './p1cycles/SCCNodeTypeCycleBreaker.js'
import { CoffmanGrahamLayerer } from './p2layers/CoffmanGrahamLayerer.js'
import { BreadthFirstModelOrderLayerer } from './p2layers/BreadthFirstModelOrderLayerer.js'
import { DepthFirstModelOrderLayerer } from './p2layers/DepthFirstModelOrderLayerer.js'
import { MinWidthLayerer } from './p2layers/MinWidthLayerer.js'
import { StretchWidthLayerer } from './p2layers/StretchWidthLayerer.js'
import { processLinearSegmentsNodePlace } from './p4nodes/linear-segments-node-placer.js'
import { processConstraintsPost } from './intermediate/constraints-postprocessor.js'
import { processHypernodes } from './intermediate/hypernodes-processor.js'
import { processNodePlacementRepeat } from './intermediate/node-placement-repeater.js'
import { processInteractiveExternalPortPosition } from './intermediate/interactive-external-port-positioner.js'
import { processBreakingPointInsertion } from './intermediate/wrapping/breaking-point-inserter.js'
import { processBreakingPoints } from './intermediate/wrapping/breaking-point-processor.js'
import { processBreakingPointRemoval } from './intermediate/wrapping/breaking-point-remover.js'
import { LAYERING_STRATEGY, WRAPPING_STRATEGY, WrappingStrategy, INTERACTIVE_LAYOUT, GENERATE_POSITION_AND_LAYER_IDS, NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT, HYPERNODE } from './options/layered-options.js'
import { processReversedEdges } from './intermediate/reversed-edge-restorer.js'
import { processPortListSort } from './intermediate/port-list-sorter.js'
import { processNorthSouthPorts } from './intermediate/north-south-port-preprocessor.js'
import { processSelfLoops } from './intermediate/self-loop-preprocessor.js'
import { processHierarchicalPortDummySize } from './intermediate/hierarchical-port-dummy-size-processor.js'
import { HierarchicalPortConstraintProcessor } from './intermediate/hierarchical-port-constraint-processor.js'
import { processHierarchicalPortPosition } from './intermediate/hierarchical-port-position-processor.js'
import { processHierarchicalPortOrthogonalRouting } from './intermediate/hierarchical-port-orthogonal-edge-router.js'
import { processInLayerConstraints } from './intermediate/in-layer-constraint-processor.js'
import { labelNodeSpacing } from './intermediate/labels/node-label-placer.js'
import { processSelfLoopPost } from './intermediate/self-loop-postprocessor.js'
import { SelfLoopPortRestorer } from './intermediate/self-loop-port-restorer.js'
import { processSelfLoopRouter } from './intermediate/self-loop-router.js'
import { processDummySelfLoops } from './intermediate/dummy-self-loop-processor.js'
import { processNorthSouthPortPost } from './intermediate/north-south-port-postprocessor.js'
import { processInvertedPorts } from './intermediate/inverted-port-processor.js'
import { processLabelAndNodeSize } from './intermediate/label-and-node-size-processor.js'
import { computeCellSystemSize } from './intermediate/cell-system.js'
import { detectComments, processCommentPreprocessing, processCommentNodeMargins, processCommentPost, addCommentMarginToNode } from './intermediate/comment-processors.js'
import { GraphTransformer, TransformMode } from './intermediate/graph-transformer.js'
import { processEndLabelPreprocessing } from './intermediate/labels/end-label-preprocessor.js'
import { processLabelSideSelection } from './intermediate/label-side-selector.js'
import { processEndLabelSort } from './intermediate/labels/end-label-sorter.js'
import { processEndLabelPostprocessing } from './intermediate/labels/end-label-postprocessor.js'
import { ORIGINAL_PORT_CONSTRAINTS, EXT_PORT_SIDE, ORIGIN, EXT_PORT_REPLACED_DUMMIES } from './options/internal-properties.js'
import { initializePort } from './graph/lgraph-util.js'
import { sortByInputModelProcess } from './intermediate/sort-by-input-model-processor.js'
import { processSemiInteractiveCrossMin } from './intermediate/semi-interactive-cross-min-processor.js'
import { processPartitionPre, processPartitionMid, processPartitionPost, collectPartitions } from './intermediate/partition-processors.js'
import { processHighDegreeNodeLayering } from './intermediate/high-degree-node-layering-processor.js'
import { setPortSide } from './intermediate/port-side-processor.js'
import { alternatingLayerUnzip } from './intermediate/unzipping/alternating-layer-unzipper.js'
import { assignModelOrdersRecursive, prepareInsideSelfLoopsRecursive } from './intermediate/elk-graph-importer.js'
import { CONSIDER_MODEL_ORDER_STRATEGY, CROSSING_MINIMIZATION_STRATEGY, CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE, CROSSING_MINIMIZATION_GREEDY_SWITCH_ACTIVATION_THRESHOLD, CROSSING_MINIMIZATION_SEMI_INTERACTIVE, HIGH_DEGREE_NODES_TREATMENT, LAYER_UNZIPPING_STRATEGY, CYCLE_BREAKING_STRATEGY, LAYERING_NODE_PROMOTION_STRATEGY, CycleBreakingStrategy, OrderingStrategy, PORT_SORTING_STRATEGY, DIRECTION_CONGRUENCY, NODE_LABELS_PLACEMENT, NODE_LABELS_PADDING, NODE_SIZE_CONSTRAINTS, NODE_SIZE_MINIMUM, NODE_SIZE_OPTIONS } from './options/layered-options.js'

export interface IElkProgressMonitor {
  begin(name: string, work?: number): void
  done(): void
}

export class NullProgressMonitor implements IElkProgressMonitor {
  begin(): void {}
  done(): void {}
}

/** 自底向上收集所有图 (ELK collectAllGraphsBottomUp). */
function collectAllGraphsBottomUp(root: LGraph): LGraph[] {
  const graphs: LGraph[] = []
  const stack: LGraph[] = [root]
  while (stack.length > 0) {
    const g = stack.pop()!
    for (const node of g.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null) stack.push(nested)
    }
    graphs.push(g)
  }
  return graphs.reverse()
}

/**
 * 计算外部端口 (父节点上的分层端口) 的最终位置 (ELK LGraphUtil.getExternalPortPosition).
 * 端口 top-left 相对父节点原点; 同时把端口 dummy 移到图边界外 (compound 后处理器会移除).
 */
function getExternalPortPosition(
  graph: LGraph,
  portDummy: LNode,
  portWidth: number,
  portHeight: number,
): { x: number; y: number } {
  const portPosition = { x: portDummy.position.x + portDummy.size.x / 2, y: portDummy.position.y + portDummy.size.y / 2 }
  const portOffset = portDummy.getProperty(PORT_BORDER_OFFSET)
  const graphSize = graph.getSize()
  const padding = graph.getPadding()
  const graphOffset = graph.getOffset()

  const _origin = portDummy.getProperty(ORIGIN)
  if (process.env.GGN_EP_DBG) console.error(`[EP] side=${portDummy.getProperty(EXT_PORT_SIDE)} origin=${_origin instanceof LPort ? _origin.id : '?'} dummy=(${portDummy.position.x.toFixed(1)},${portDummy.position.y.toFixed(1)})`)
  switch (portDummy.getProperty(EXT_PORT_SIDE)) {
    case PortSide.NORTH:
      portPosition.x += padding.left + graphOffset.x - portWidth / 2
      portPosition.y = -portHeight - portOffset
      portDummy.position.y = -(padding.top + portOffset + graphOffset.y)
      break
    case PortSide.EAST:
      portPosition.x = graphSize.x + padding.left + padding.right + portOffset
      portPosition.y += padding.top + graphOffset.y - portHeight / 2
      portDummy.position.x = graphSize.x + padding.right + portOffset - graphOffset.x
      break
    case PortSide.SOUTH:
      portPosition.x += padding.left + graphOffset.x - portWidth / 2
      portPosition.y = graphSize.y + padding.top + padding.bottom + portOffset
      portDummy.position.y = graphSize.y + padding.bottom + portOffset - graphOffset.y
      break
    case PortSide.WEST:
      portPosition.x = -portWidth - portOffset
      portPosition.y += padding.top + graphOffset.y - portHeight / 2
      portDummy.position.x = -(padding.left + portOffset + graphOffset.x)
      break
    default:
      break
  }
  return portPosition
}

/** 递归处理 compound 图: 拆分跨层级边 → 自底向上布局 → 合并. */
/** 子图布局后: 父节点尺寸 = 子图内容 + padding (ELK HierarchicalNodeResizingProcessor 精简版). */
function resizeParentNode(parent: LNode, includeChildren: boolean): void {
  const child = parent.getNestedGraph()
  if (child === null) return
  const nodes = child.getAllNodes()
  if (process.env.GGN_RP_DBG) console.error(`[RP] ${parent.id} allNodes=${nodes.map(n => n.getType() + '@' + n.position.x + ',' + n.position.y + ' side=' + n.getProperty(EXT_PORT_SIDE)).join('|')}`)
  if (nodes.length === 0) return

  // 边界集合 = NORMAL + 有边的 NS 外部 dummy (决定父尺寸, ELK 内容框含 NS dummy);
  // 平移集合 = 仅 NORMAL (ELK 内部节点坐标 pre-padding, W-E/NS dummy 原位,
  //  getExternalPortPosition 里再加 padding; NS dummy 平移会导致 padding 双加).
  // 边界集合 = NORMAL + LONG_EDGE (600: 长边 dummy 在 y=-11 扩展内容高) + W-E 外部端口 dummy
  //   (任意, 含无边; 例 multilabels_compound: 无边 W-E dummy 到 y=37 → 父高 61)
  //   + 有边 NS dummy (hierarchy03/04/06, 685/686 需要).
  // 无边 NS dummy 不计入 (193/148: 顶部边界 dummy 不应扩父尺寸, ELK 用 graph offset 处理).
  const inBounds = (n: LNode): boolean => {
    const t = n.getType()
    if (t === NodeType.NORMAL || t === NodeType.LONG_EDGE) return true
    if (t === NodeType.EXTERNAL_PORT) {
      // INCLUDE_CHILDREN: W-E dummy + 有边 NS dummy 计入父尺寸 (multilabels_compound/hierarchy03 等);
      // SEPARATE_CHILDREN: 普通层级边 dummy 排除 (外部连接由父端口 margin 表达, 不应扩父内容框 — Issue680);
      // 但 inside self loop 图 (无 NORMAL 内容) 的 dummy 必须计入 (节点需容纳内部自环).
      if (!includeChildren && hasContentNodes) return false
      const side = n.getProperty(EXT_PORT_SIDE)
      if (side === PortSide.WEST || side === PortSide.EAST) return true
      return n.getPorts().some(p => p.getConnectedEdges().length > 0)
    }
    return false
  }
  // inside self loop 图: 嵌套图只有 ExternalPort dummy (无 NORMAL 内容) → SEPARATE 也需计入
  // 父尺寸 (ELK HierarchicalNodeResizingProcessor 按图实际尺寸 resize, 含内部自环 dummy).
  const hasContentNodes = nodes.some(n => n.getType() === NodeType.NORMAL || n.getType() === NodeType.LONG_EDGE)
  const bounded = nodes.filter(inBounds)
  if (process.env.GGN_RP_DBG) console.error(`[RP] ${parent.id} include=${includeChildren} hasContent=${hasContentNodes} inBounds=${nodes.map(n => n.getType() + ':' + inBounds(n)).join('|')}`)
  if (process.env.GGN_RP_DBG) {
    console.error(`[RP] parent=${parent.id} bounded=${bounded.map(n => n.id + ':' + n.getType() + '@' + n.position.x + ',' + n.position.y + '[' + n.size.x + 'x' + n.size.y + ']').join(' | ')}`)
  }
  if (bounded.length === 0) return
  let minX = Number.POSITIVE_INFINITY, minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY
  // 平移基准: 内容节点 (NORMAL/LONG_EDGE) 的 min; x 方向排除 E/W 外部端口 dummy
  // (router Step5 把它们定位在边界外 -pad.left, 若计入 minX 内容会被多平移 padding — 194),
  // y 方向保留 N/S dummy (router 定位在 -offset.y, 内容应整体下移 offset).
  let shiftMinX = Number.POSITIVE_INFINITY, shiftMinY = Number.POSITIVE_INFINITY
  for (const n of bounded) {
    // ELK HierarchicalNodeResizingProcessor: 内容框含节点 margin (端口/label 外扩).
    const m = n.getMargin()
    minX = Math.min(minX, n.position.x - m.left)
    minY = Math.min(minY, n.position.y - m.top)
    maxX = Math.max(maxX, n.position.x + n.size.x + m.right)
    maxY = Math.max(maxY, n.position.y + n.size.y + m.bottom)
    if (n.getType() === NodeType.EXTERNAL_PORT) {
      const px = n.position.x
      const outOfBoundsX = px < 0 || px > child.getSize().x
      if (outOfBoundsX) {
        // 外部端口 dummy 被 router 定位到内容区外 (WEST/NORTH dummy x<0 或 EAST x>size.x):
        // 其 x 不应参与内容平移 (内容平移量 = offset+padding, 与图边界 dummy 无关 — 194/hierarchy03);
        // 但 y 是内容内位置 (或 N/S offset 部分) 需保留.
        shiftMinY = Math.min(shiftMinY, n.position.y - m.top)
        continue
      }
      // 边界内 (BK 位置 x=0, 无 router 时): 照常参与 (416/377 等依赖).
    }
    shiftMinX = Math.min(shiftMinX, n.position.x - m.left)
    shiftMinY = Math.min(shiftMinY, n.position.y - m.top)
  }

  const pad = child.getPadding()
  const oldW = parent.size.x, oldH = parent.size.y
  // GGN_HIER_ORTHO (HOR 已运行): ELK HierarchicalNodeResizingProcessor 语义 —
  // 父尺寸 = 图 actualSize (size + padding), 与外部端口 dummy 位置无关;
  // 内容平移量 = offset + padding (ELK applyOffsetPadding: final = content + offset + pad),
  // 即 shiftMin = -offset. 默认路径保持 bounds 兼容逻辑 (历史测试依赖).
  // ELK HierarchicalNodeResizingProcessor: 父尺寸 = 图 actualSize (size + padding).
  // bounds 会多减 min (portConstraints: minX=10 → 169 vs jar 155+24=179) 且漏 LabelDummyRemover
  // 已移除的 LABEL dummy (273: 子图高 33 → 57 而非 40).
  let newW = child.getSize().x + pad.left + pad.right
  let newH = child.getSize().y + pad.top + pad.bottom
  // ELK HierarchicalNodeResizingProcessor.resizeGraph: adjustedSize = max(actualSize, nodeSize.minimum)
  // (minimum 由 applyNestedGraphMinimumSizes 写入 = 父 cell 尺寸, 316 端口高 430 实证).
  const nestedMin = child.getProperty(NODE_SIZE_MINIMUM)
  if (nestedMin) {
    newW = Math.max(newW, nestedMin.x)
    newH = Math.max(newH, nestedMin.y)
  }
  // GGN_HIER_ORTHO + HOR 已恢复 N/S dummy (EXT_PORT_REPLACED_DUMMIES 非空):
  // ELK HierarchicalNodeResizingProcessor 语义 — 父尺寸 = 图 actualSize (size + padding),
  // 与外部端口 dummy 位置无关; 内容平移量 = offset + padding (ELK applyOffsetPadding).
  // 仅 HOR 跑过的图适用 (无 N/S dummy 的图保持 bounds 兼容逻辑).
  const horRestored = HIER_ORTHO_ENABLED
    && child.getProperty(EXT_PORT_REPLACED_DUMMIES)?.length > 0
  if (horRestored) {
    // ELK HierarchicalNodeResizingProcessor.resizeGraph: adjustedSize = max(actualSize, nodeSize.minimum)
    // (horRestored 也须应用 minimum — content_centered_with_external_ports: 外部端口 + 900x400 最小 → 容器 900x400,
    //  否则 newW=332 → contentAlignment 不触发, 内容不居中)
    newW = child.getSize().x + pad.left + pad.right
    newH = child.getSize().y + pad.top + pad.bottom
    if (nestedMin) {
      newW = Math.max(newW, nestedMin.x)
      newH = Math.max(newH, nestedMin.y)
    }
  }
  // ELK HierarchicalNodeResizingProcessor.resizeGraphNoReallyIMeanIt: 容器比内容大时,
  // 按 CONTENT_ALIGNMENT 调整子图 offset (内容在节点盒内对齐: H_CENTER/H_RIGHT/V_CENTER/V_BOTTOM).
  // (content_centered: MINIMUM_SIZE 900x400 + [V_CENTER,H_CENTER] → 内容居中; 此前缺 → 内容左上, oracle 差大)
  {
    const oldW = child.getSize().x + pad.left + pad.right
    const oldH = child.getSize().y + pad.top + pad.bottom
    const contentAlign = parent.getProperty<string[]>('org.eclipse.elk.contentAlignment') ?? []
    if (newW > oldW || newH > oldH) {
      const off = child.getOffset()
      if (newW > oldW) {
        if (contentAlign.includes('H_CENTER')) off.x += (newW - oldW) / 2
        else if (contentAlign.includes('H_RIGHT')) off.x += newW - oldW
      }
      if (newH > oldH) {
        if (contentAlign.includes('V_CENTER')) off.y += (newH - oldH) / 2
        else if (contentAlign.includes('V_BOTTOM')) off.y += newH - oldH
      }
    }
  }
  // ELK ElkGraphLayoutTransferrer: 嵌套图最终坐标 = 图内坐标 + graph.offset + 父 padding
  // (内容平移量 = offset + padding, 不是 bounds minX — portConstraints 实证: n7 marginL=5 → minX=10
  //  错平移 2, ELK 用 offset.x=0 → 平移 12). 统一用 -offset 语义.
  shiftMinX = -child.getOffset().x
  shiftMinY = -child.getOffset().y
  if (process.env.GGN_RP_DBG) {
    console.error(`[RP] parent=${parent.id} min=(${minX},${minY}) max=(${maxX},${maxY}) shiftMin=(${shiftMinX},${shiftMinY}) pad=[${pad.left},${pad.top},${pad.right},${pad.bottom}] newW=${newW} newH=${newH} graphSize=(${child.getSize().x},${child.getSize().y}) offset=(${child.getOffset().x},${child.getOffset().y})`)
  }

  const dx = pad.left - shiftMinX, dy = pad.top - shiftMinY
  // ELK HierarchicalNodeResizingProcessor: 子图坐标已含 padding (applyOffsetPadding), 不平移;
  // 平移会双加 padding (Issue680 child (12,57) → (37,12)). INCLUDE 内容框 pre-padding 才需平移.
  if (includeChildren && (dx !== 0 || dy !== 0)) {
    for (const n of nodes) {
      if (n.getType() === NodeType.NORMAL) {
        n.position.x += dx
        n.position.y += dy
      }
    }
    // 边弯点与 NORMAL 节点同步平移 (内容平移量 dx/dy, 与 doSimpleLayoutInner/combine 一致).
    // INCLUDE 分层路径的 P5 路由 / NS 后处理在 pre-padding 坐标生成弯点, 节点平移后弯点不随动
    // → N/S 外部端口层级边斜线 (tmp-ns-port 实证: 弯点差恰为 (pad.left,pad.top)).
    const seenEdges = new Set<object>()
    for (const n of nodes) {
      for (const port of n.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          if (seenEdges.has(edge)) continue
          seenEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += dx
            bp.y += dy
          }
          // ★ 边标签随节点同步平移 (ELK: 标签坐标在段边, resize 平移 NORMAL 节点时标签不随动
          //   → 层级图 label 位置差 padding, Issue905). 段边标签 postprocessor 拷回 origEdge 前在此平移.
          for (const label of edge.getLabels()) {
            label.position.x += dx
            label.position.y += dy
          }
        }
      }
    }
  }

  // ELK HierarchicalNodeResizingProcessor.graphLayoutToNode: 有外部端口时,
  // 端口位置由 getExternalPortPosition 定 (WEST x = -portWidth - portOffset, 使父端口外扩进 margin),
  // 父端口约束转 FIXED_POS, resize 不再按比例缩放端口.
  if (child.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
    parent.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    parent.getGraph()!.getProperty(GRAPH_PROPERTIES).add(GraphProperties.NON_FREE_PORTS)
    for (const childNode of child.getAllNodes()) {
      const origin = childNode.getProperty(ORIGIN)
      if (origin instanceof LPort) {
        const port = origin
        const pp = getExternalPortPosition(child, childNode, port.getSize().x, port.getSize().y)
        if (process.env.GGN_EP_DBG2) console.error(`[EP2] parent=${parent.id} dummy=(${childNode.position.x.toFixed(1)},${childNode.position.y.toFixed(1)})[${childNode.size.x.toFixed(1)}x${childNode.size.y.toFixed(1)}] side=${childNode.getProperty(EXT_PORT_SIDE)} padTop=${child.getPadding().top} offY=${child.getOffset().y} -> port y=${pp.y.toFixed(1)}`)
        port.getPosition().x = pp.x
        port.getPosition().y = pp.y
        port.setSide(childNode.getProperty(EXT_PORT_SIDE))
        if (process.env.GGN_EP_DBG) console.error(`[EP-after] parent=${parent.id} port=${port.id} set=(${pp.x.toFixed(1)},${pp.y.toFixed(1)})`)
      }
    }
    // W-E 外部端口 dummy 的 y 与 NORMAL 内容节点同步平移 (INCLUDE 路径 resize 只平移 NORMAL):
    // 段边 (NORMAL 端口 → W-E dummy) 的源锚点已随节点平移 (+dy), 目标锚点必须同约定,
    // 否则段边斜线 → CompoundGraphPostprocessor 合并把源点当必要弯点 (hierarchy01 E1-E3 b157 实证;
    // jar 的 W-E dummy y = 端口绝对 y (145,35), ggn 旧值 = 端口相对 y (138,23), 差恰为 padding.top).
    // x 由 getExternalPortPosition 单独定 (EAST=内容右缘, WEST=内容左缘), 不随 NORMAL 平移.
    // 仅当图内有 NORMAL 内容 (平移确实发生) 才动 dummy; dummy 端口标签 (CGP 内部尺寸占位, 空文本)
    // 反向补偿保持图级坐标不变 — 平移会让占位标签随动, Issue701 端口标签重叠检查误报.
    if (includeChildren && dy !== 0 && nodes.some(n => n.getType() === NodeType.NORMAL)) {
      for (const childNode of child.getAllNodes()) {
        if (childNode.getType() !== NodeType.EXTERNAL_PORT) continue
        const side = childNode.getProperty(EXT_PORT_SIDE)
        if (side === PortSide.WEST || side === PortSide.EAST) {
          childNode.position.y += dy
          for (const port of childNode.getPorts()) {
            for (const label of port.getLabels()) {
              label.position.y -= dy
            }
          }
        }
      }
    }
    parent.size.x = newW
    parent.size.y = newH
    // 分层锁步后 resize 在 canonical 坐标做: 子图尺寸必须覆盖内容, 使方向回变换的
    // 镜像/转置偏移 = 父节点新尺寸 (hierarchicalEdges UP/LEFT 实证: 图尺寸 109 → 133 才对).
    child.getSize().x = newW
    child.getSize().y = newH
    return
  }

  // 无外部端口: 端口位置按比例调整 (ELK LGraphUtil.resizeNode).
  if (oldW > 0 && oldH > 0) {
    const ratioX = newW / oldW, ratioY = newH / oldH
    const diffX = newW - oldW, diffY = newH - oldH
    for (const port of parent.getPorts()) {
      switch (port.getSide()) {
        case PortSide.NORTH:
          port.getPosition().x *= ratioX
          break
        case PortSide.EAST:
          port.getPosition().x += diffX
          port.getPosition().y *= ratioY
          break
        case PortSide.SOUTH:
          port.getPosition().x *= ratioX
          port.getPosition().y += diffY
          break
        case PortSide.WEST:
          port.getPosition().y *= ratioY
          break
        default:
          break
      }
    }
  }
  parent.size.x = newW
  parent.size.y = newH
  // 子图尺寸同步为父节点新尺寸 (方向回变换的镜像/转置偏移用; 非外部端口图同样需要 —
  // reverseEdge/hierarchicalLayoutMixing LEFT/UP 嵌套内容 -24 实证).
  child.getSize().x = newW
  child.getSize().y = newH
}

/** INCLUDE_CHILDREN 布局: 两遍 — 先子图独立布局 (父节点尺寸扩展), 再整图布局 (跨层边约束生效), 最后坐标拆回 (相对父). */
function doIncludeChildrenLayout(root: LGraph, monitor: IElkProgressMonitor, hooks?: LayoutPhaseHooks): void {
  // 0. 子图先独立布局: 得到子图内容尺寸, 父节点扩展 (整图布局时父尺寸参与 BK, 与 elkjs INCLUDE 一致).
  const graphs = collectAllGraphsBottomUp(root)
  for (const graph of graphs) {
    if (graph === root) continue
    if (graph.getLayers().length === 0 || graph.getLayerlessNodes().length > 0) {
      doSimpleLayout(graph, monitor, hooks)
      const parent = graph.getParentNode()
      if (parent !== null && HIER_ORTHO_ENABLED && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
        processHierarchicalPortOrthogonalRouting(graph)
      }
      if (parent !== null) resizeParentNode(parent, true)
    }
  }

  // 1. 压平: 所有图节点移入根图层外列表, 清空子图层 (整图重新分层).
  const parents: LNode[] = []
  const allGraphs: LGraph[] = [root]
  {
    const stack: LGraph[] = [root]
    while (stack.length > 0) {
      const g = stack.pop()!
      for (const n of g.getAllNodes()) {
        const nested = n.getNestedGraph()
        if (nested !== null) {
          parents.push(n)
          stack.push(nested)
          allGraphs.push(nested)
        }
        if (!root.getLayerlessNodes().includes(n)) {
          root.getLayerlessNodes().push(n)
        }
      }
    }
  }
  for (const g of allGraphs) {
    for (const layer of g.getLayers()) {
      for (const n of layer.getNodes()) {
        if (!root.getLayerlessNodes().includes(n)) {
          root.getLayerlessNodes().push(n)
        }
      }
      layer.getNodes().length = 0
    }
    g.getLayers().length = 0
  }

  // 2. 整图布局 (所有层级节点一起: 层分配/排序/BK 受跨层边约束).
  doSimpleLayout(root, monitor, hooks)
  if (process.env.GGN_INC_DBG) {
    for (const n of parents) {
      console.error(`[INC-after2] parent=${n.id} size=${JSON.stringify(n.size)} pos=${JSON.stringify(n.position)}`)
      const child = n.getNestedGraph()
      if (child) console.error(`  child size=${JSON.stringify(child.getSize())} offset=${JSON.stringify(child.getOffset())}`)
    }
  }

  // 3. 拆回: 叶子到根 — 子图节点坐标相对父.
  for (const parent of parents.reverse()) {
    const child = parent.getNestedGraph()
    if (child === null) continue
    const px = parent.position.x, py = parent.position.y
    for (const c of child.getAllNodes()) {
      c.position.x -= px
      c.position.y -= py
    }
  }
}


/** INCLUDE_CHILDREN 层级布局 (ELK hierarchicalLayout 语义):
 *  1. 自底向上: 每图跑 pre-P3 处理器 (P1/P2/中间处理器)
 *  2. 根跑 P3 (LayerSweepCrossingMinimizer 扫入子图)
 *  3. 自底向上: 每图跑 post-P3 处理器 (P4/P5/后处理器)
 *  4. 根应用 offset+padding; 子图坐标相对父 (由父位置决定世界坐标).
 */

/** pre-P3 相位 (ELK hierarchicalLayout 的 pre-P3 段): P1/P2/中间处理器. */
function runGraphPreP3(graph: LGraph, monitor: IElkProgressMonitor, hooks?: LayoutPhaseHooks): void {
  // ELK ElkGraphImporter.initializePort: 所有 side-fixed 约束端口侧 UNDEFINED 时按位置计算
  // (FIXED_SIDE/FIXED_ORDER/FIXED_POS/FIXED_RATIO; isSideFixed). 必须在 GraphTransformer(in) 之前,
  // 方向变换才能转置端口侧 (graph02 flexible_ports 实证: FIXED_ORDER 端口导入期定 WEST, DOWN 变换后成 NORTH).
  const initDir = graph.getProperty(DIRECTION) === Direction.UNDEFINED ? Direction.RIGHT : graph.getProperty(DIRECTION)
  for (const node of graph.getAllNodes()) {
    const pc = node.getProperty(PORT_CONSTRAINTS)
    if (!PortConstraints.isSideFixed(pc)) continue
    for (const port of node.getPorts()) {
      initializePort(port, pc, initDir)
    }
  }

  // ElkGraphImporter 等价: 收集图属性 (决定中间处理器启用条件). ELK 在导入期 (方向变换前)
  // 用**原始端口侧**收集 NORTH_SOUTH_PORTS — ggn 若在变换后收集, DOWN/UP 的流侧端口 (SOUTH/NORTH)
  // 转成 canonical EAST/WEST 后会被误判为 N-S → 错误创建 NS dummy → 节点 +10 偏移 (south_port DOWN 实证).
  const props = graph.getProperty(GRAPH_PROPERTIES)
  // ELK getDirection: UNDEFINED 时按 aspectRatio 默认 (>=1 → RIGHT).
  const rawDir = graph.getProperty(DIRECTION)
  const dir = rawDir === Direction.UNDEFINED ? Direction.RIGHT : rawDir
  for (const node of graph.getLayerlessNodes()) {
    const pc = node.getProperty(PORT_CONSTRAINTS)
    if (pc !== PortConstraints.FREE && pc !== PortConstraints.UNDEFINED) {
      props.add(GraphProperties.NON_FREE_PORTS)
    }
    // 超节点 (ELK ElkGraphImporter: HYPERNODE → HYPERNODES + HYPEREDGES 图属性, 端口约束置 FREE).
    if (node.getProperty(HYPERNODE)) {
      props.add(GraphProperties.HYPERNODES)
      props.add(GraphProperties.HYPEREDGES)
      node.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
    }
    // 分区布局 (ELK ElkGraphImporter: PARTITIONING_ACTIVATE → GraphProperties.PARTITIONS).
    collectPartitions(graph)
    for (const port of node.getPorts()) {
      const side = port.getSide()
      const verticalPort = dir === Direction.RIGHT || dir === Direction.LEFT
        ? side === PortSide.NORTH || side === PortSide.SOUTH
        : side === PortSide.EAST || side === PortSide.WEST
      if (verticalPort) props.add(GraphProperties.NORTH_SOUTH_PORTS)
      if (port.getIncomingEdges().length + port.getOutgoingEdges().length > 1) {
        props.add(GraphProperties.HYPEREDGES)
      }
      for (const e of port.getOutgoingEdges()) {
        if (e.getTarget() !== null && e.getTarget()!.getNode() === node) {
          props.add(GraphProperties.SELF_LOOPS)
        }
        // ELK ElkGraphImporter: 边标签 placement 决定 CENTER_LABELS/END_LABELS 图属性
        // (默认 CENTER; UNDEFINED 归一化为 CENTER).
        for (const label of e.getLabels()) {
          if (label.placement === EdgeLabelPlacement.HEAD || label.placement === EdgeLabelPlacement.TAIL) {
            props.add(GraphProperties.END_LABELS)
          } else {
            props.add(GraphProperties.CENTER_LABELS)
          }
        }
      }
    }
  }

  // ELK DIRECTION_PREPROCESSOR (GraphTransformer TO_INPUT_DIRECTION): P1 前把非 RIGHT 方向
  // 变换到内部 LTR (节点/端口/边/标签坐标 + 端口侧 + 端口 index 反转). 布局后对称变换回.
  runModule('GraphTransformer(in)', hooks, graph, () => new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(graph))

  // ELK GraphConfigurator.copyPortConstraints: P3 transfer 会把约束改为 FIXED_ORDER,
  // 先保存原始约束 (端口放置方向判断用).
  for (const node of graph.getAllNodes()) {

    if (!node.hasProperty(ORIGINAL_PORT_CONSTRAINTS)) {
      node.setProperty(ORIGINAL_PORT_CONSTRAINTS, node.getProperty(PORT_CONSTRAINTS))
    }
  }
  // favorStraightEdges 默认由 edgeRouting 决定 (ELK GraphConfigurator: ORTHOGONAL → true).
  if (graph.getProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES) === null
    || graph.getProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES) === undefined) {
    graph.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, graph.getProperty(EDGE_ROUTING) === 'ORTHOGONAL')
  }

  // comment box 预处理 (ELK CommentPreprocessor: P1 前置, COMMENTS 时).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) {
    runModule('CommentPreprocessor', hooks, graph, () => processCommentPreprocessing(graph))
  }

  // 边方向约束反转 (ELK EdgeAndLayerConstraintEdgeReverser: 由 layering 策略添加 —
  //  NONE/INTERACTIVE 不添加, NetworkSimplex/LongestPath 等添加; P1 最前, inverted-ports 依赖).
  // ★ 必须在 SelfLoopPreprocessor 之前 (ELK addBefore(P1) 拓扑序: reverser 在 SLPP 前) —
  //   inside_outside 实证: N1 FIXED_SIDE + 自环 (inside yo 使 P2 netFlow>0/P1 netFlow<0) →
  //   reverser 的 allPortsReversed 反转 E2 (P2→P1 变 P1→P2) → 自环走上侧 (y=22);
  //   顺序反了 SLPP 先隐藏 E2 → reverser 看不到边 → 不反转 → 自环走下侧 (y=12, §41).
  if (graph.getProperty(LAYERING_STRATEGY) !== 'INTERACTIVE') {
    runModule('EdgeAndLayerConstraintEdgeReverser', hooks, graph, () => new EdgeAndLayerConstraintEdgeReverser().process(graph))
  }

  // 自环隐藏 (ELK SelfLoopPreprocessor: P1 前置, SELF_LOOPS 时).
  const hasSelfLoops = graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.SELF_LOOPS)

  if (hasSelfLoops) {
    runModule('SelfLoopPreprocessor', hooks, graph, () => processSelfLoops(graph))
  }

  // 分区预处理器 (ELK PartitionPreprocessor: P1 前, 反转高→低分区边, 防断环破坏分区序).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.PARTITIONS)) {
    runModule('PartitionPreprocessor', hooks, graph, () => processPartitionPre(graph))
  }
  // 交互式外部端口定位 (ELK InteractiveExternalPortPositioner: P1 前, INTERACTIVE 断环/分层时).
  if (graph.getProperty(CYCLE_BREAKING_STRATEGY) === CycleBreakingStrategy.INTERACTIVE
    || graph.getProperty(LAYERING_STRATEGY) === 'INTERACTIVE') {
    runModule('InteractiveExternalPortPositioner', hooks, graph, () => processInteractiveExternalPortPosition(graph))
  }
  const cbStrategy = graph.getProperty(CYCLE_BREAKING_STRATEGY)
  if (cbStrategy === CycleBreakingStrategy.MODEL_ORDER) {
    runModule('ModelOrderCycleBreaker', hooks, graph, () => processModelOrderCycleBreak(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.GREEDY_MODEL_ORDER) {
    runModule('GreedyModelOrderCycleBreaker', hooks, graph, () => new GreedyModelOrderCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.DEPTH_FIRST) {
    runModule('DepthFirstCycleBreaker', hooks, graph, () => new DepthFirstCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.SCC_CONNECTIVITY) {
    runModule('SCConnectivity', hooks, graph, () => new SCConnectivity().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.SCC_NODE_TYPE) {
    runModule('SCCNodeTypeCycleBreaker', hooks, graph, () => new SCCNodeTypeCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.DFS_NODE_ORDER) {
    runModule('DFSNodeOrderCycleBreaker', hooks, graph, () => new DFSNodeOrderCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.BFS_NODE_ORDER) {
    runModule('BFSNodeOrderCycleBreaker', hooks, graph, () => new BFSNodeOrderCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.INTERACTIVE) {
    runModule('InteractiveCycleBreaker', hooks, graph, () => processInteractiveCycleBreak(graph))
  } else {
    runModule('GreedyCycleBreaker', hooks, graph, () => new GreedyCycleBreaker().process(graph, monitor))
  }
  // P1 断环完成 (测试钩子: 断环后图应无环 — 输出边在 ReversedEdgeRestorer 会恢复原方向, 不在此时检查).
  hooks?.afterPhase?.('P1', graph)

  // CENTER 边标签 dummy (ELK LabelDummyInserter: P2 前, 为边标签预留空间).
  runModule('LabelDummyInserter', hooks, graph, () => processLabelDummyInsert(graph))

  // 隐藏 FIRST_SEPARATE/LAST_SEPARATE (外部端口 dummy) (ELK LayerConstraintPreprocessor).
  runModule('LayerConstraintPreprocessor', hooks, graph, () => new LayerConstraintPreprocessor().process(graph))

  // P2: layering.strategy 分发 (INTERACTIVE / LONGEST_PATH_SOURCE / LONGEST_PATH_SINK / 默认 NETWORK_SIMPLEX).
  // 分区中处理器 (ELK PartitionMidprocessor: P2 前, 相邻分区加约束边 → 小分区在左).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.PARTITIONS)) {
    runModule('PartitionMidprocessor', hooks, graph, () => processPartitionMid(graph))
  }
  const layeringStrategy = graph.getProperty(LAYERING_STRATEGY)
  if (layeringStrategy === 'INTERACTIVE') {
    runModule('InteractiveLayerer', hooks, graph, () => processInteractiveLayering(graph, monitor))
  } else if (layeringStrategy === 'LONGEST_PATH_SOURCE') {
    runModule('LongestPathSourceLayerer', hooks, graph, () => new LongestPathSourceLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'LONGEST_PATH' || layeringStrategy === 'LONGEST_PATH_SINK') {
    runModule('LongestPathLayerer', hooks, graph, () => new LongestPathLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'COFFMAN_GRAHAM') {
    runModule('CoffmanGrahamLayerer', hooks, graph, () => new CoffmanGrahamLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'BF_MODEL_ORDER') {
    runModule('BreadthFirstModelOrderLayerer', hooks, graph, () => new BreadthFirstModelOrderLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'DF_MODEL_ORDER') {
    runModule('DepthFirstModelOrderLayerer', hooks, graph, () => new DepthFirstModelOrderLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'MIN_WIDTH') {
    runModule('MinWidthLayerer', hooks, graph, () => new MinWidthLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'STRETCH_WIDTH') {
    runModule('StretchWidthLayerer', hooks, graph, () => new StretchWidthLayerer().process(graph, monitor))
  } else {
    runModule('NetworkSimplexLayerer', hooks, graph, () => new NetworkSimplexLayerer().process(graph, monitor))
  }

  hooks?.afterPhase?.('P2', graph)
  // 高连通节点树移动 (ELK HighDegreeNodeLayeringProcessor: P3 前, NodePromotion 之前; 把扇出/扇入树移到独立层).
  if (graph.getProperty(HIGH_DEGREE_NODES_TREATMENT)) {
    runModule('HighDegreeNodeLayeringProcessor', hooks, graph, () => processHighDegreeNodeLayering(graph))
  }

  // 节点提升 (ELK NodePromotion: P2 后 P3 前, 减少 dummy 节点).
  // 顺序对齐 Java IntermediateProcessorStrategy: NODE_PROMOTION(70) 在
  // LAYER_CONSTRAINT_POSTPROCESSOR(72) 之前 — NodePromotion 期间 E/W 外部端口 dummy
  // 仍被 LayerConstraintPreprocessor 隐藏 (提升不碰/不穿), LCPost 才恢复边界层.
  // (TS 之前顺序颠倒 → NodePromotion 撞上已恢复的 dummy → 无限提升死循环 + P3 边界层错乱.)
  if (graph.getProperty(LAYERING_NODE_PROMOTION_STRATEGY) !== 'NONE') {
    runModule('NodePromotion', hooks, graph, () => new NodePromotion().process(graph, monitor))
  }
  // 恢复 FIRST/LAST 与 hidden 节点 (ELK LayerConstraintPostprocessor: P3 前, NodePromotion 之后).
  runModule('LayerConstraintPostprocessor', hooks, graph, () => processLayerConstraintPost(graph))

  // 分区后处理器 (ELK PartitionPostprocessor: P3 前, NodePromotion/LCPost 之后, 移除 PARTITION_DUMMY 端口).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.PARTITIONS)) {
    runModule('PartitionPostprocessor', hooks, graph, () => processPartitionPost(graph))
  }

  // ELK 管线顺序: HierarchicalPortConstraintProcessor 在 LongEdgeSplitter 之前 (Layered.melk P2/P3 中间).
  // ggn 默认 LongEdgeSplitter 在前 (历史兼容); GGN_HIER_ORTHO 开启时用 ELK 顺序 — 否则 N/S 边被长边拆分,
  // temp 落在更远的层 → 段几何与 ELK 不同 (hierarchy09 northSlots=0 vs jar 1).
  if (HIER_ORTHO_ENABLED && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
    runModule('HierarchicalPortConstraintProcessor', hooks, graph, () => new HierarchicalPortConstraintProcessor().process(graph))
  }
  // 断点插入 (ELK BreakingPointInserter: P3 前, MULTI_EDGE wrapping 时; LongEdgeSplitter 之前).
  if (graph.getProperty(WRAPPING_STRATEGY) === WrappingStrategy.MULTI_EDGE) {
    runModule('BreakingPointInserter', hooks, graph, () => processBreakingPointInsertion(graph))
  }
  runModule('LongEdgeSplitter', hooks, graph, () => processLongEdgeSplit(graph))
  runModule('PortSideProcessor', hooks, graph, () => processPortSides(graph))
  // 反向端口 dummy (ELK InvertedPortProcessor: P3 前置, 处理 EAST 输入口/WEST 输出口的边).
  // ★ 管线对齐 (2026-08-10): ELK 装配条件按路由类型 —
  //   Polyline/SplineEdgeRouter 的 BASELINE 无条件; OrthogonalEdgeRouter 在
  //   NON_FREE_PORTS || FEEDBACK_EDGES || HYPEREDGES (此前漏 HYPEREDGES 与 SPLINES/POLYLINE 无条件).
  //   处理器内部自判断 (无反向端口时为空操作), 无条件装配安全.
  const erRouting = graph.getProperty(EDGE_ROUTING)
  const needInvertedPort = erRouting === 'POLYLINE' || erRouting === 'SPLINES'
    || (erRouting === 'ORTHOGONAL' && (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)
      || graph.getProperty(FEEDBACK_EDGES) || graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.HYPEREDGES)))
  if (needInvertedPort) {
    runModule('InvertedPortProcessor', hooks, graph, () => processInvertedPorts(graph))
  }

  // 特殊自环形态 dummy (ELK DummySelfLoopProcessor: P3 前置, 与 InvertedPortProcessor 同槽).
  if (hasSelfLoops) {
    runModule('DummySelfLoopProcessor', hooks, graph, () => processDummySelfLoops(graph))
  }

  // 按输入顺序排序节点/端口 (ELK SortByInputModelProcessor: P3 前置, considerModelOrder != NONE 时).
  // 扁平路径在 doSimpleLayoutInner 有; 层级路径 (INCLUDE_CHILDREN) 也必须跑 — 724 实证:
  // considerModelOrder NODES_AND_EDGES + INCLUDE_CHILDREN 时缺此步 → 节点序错 → Node2 x 差 30.
  if (graph.getProperty(CONSIDER_MODEL_ORDER_STRATEGY) !== OrderingStrategy.NONE) {
    runModule('SortByInputModel', hooks, graph, () => sortByInputModelProcess(graph))
  }

  // 端口按约束排序 (ELK PortListSorter: P3 前置).
  runModule('PortListSorter', hooks, graph, () => processPortListSort(graph))

  // 层级端口约束 (ELK HierarchicalPortConstraintProcessor: OrthogonalEdgeRouter 在 EXTERNAL_PORTS 时 P3 前添加).
  // GGN_HIER_ORTHO 时已在 LongEdgeSplitter 前执行 (ELK 顺序), 这里跳过避免重复.
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS) && !HIER_ORTHO_ENABLED) {
    runModule('HierarchicalPortConstraintProcessor', hooks, graph, () => new HierarchicalPortConstraintProcessor().process(graph))
  }

  // semi-interactive 交叉最小化约束 (ELK SemiInteractiveCrossMinProcessor: P3 前置, POSITION.y 排序,
  // 与 HierarchicalPortConstraintProcessor 同槽; ForsterConstraintResolver 在 P3 消费).
  if (graph.getProperty(CROSSING_MINIMIZATION_SEMI_INTERACTIVE)) {
    runModule('SemiInteractiveCrossMinProcessor', hooks, graph, () => processSemiInteractiveCrossMin(graph))
  }


  // NS 端口 dummy (ELK NorthSouthPortPreprocessor: P3 前置, 非自由端口且有 NS 端口时).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)
    && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NORTH_SOUTH_PORTS)) {
    runModule('NorthSouthPortPreprocessor', hooks, graph, () => processNorthSouthPorts(graph))
  }


}

/** post-P3 相位 (ELK hierarchicalLayout 的 post-P3 段): P4/P5/后处理器. */
function runGraphPostP3(graph: LGraph, monitor: IElkProgressMonitor, hooks?: LayoutPhaseHooks,
  skipOutTransform = false): void {
  // hasSelfLoops 在 pre-P3 段收集 (GRAPH_PROPERTIES.SELF_LOOPS).
  const hasSelfLoops = graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.SELF_LOOPS)
  // 预计算间距 (ELK GraphConfigurator).
  graph.setProperty(SPACINGS, new Spacings(graph))

  // 自环端口恢复 (ELK SelfLoopPortRestorer: 在父图 BK 前, 子图 BK 后 — elkjs 实证
  //   child BK → root SLRestorer → root SLRouter → root BK).
  if (hasSelfLoops) {
    runModule('SelfLoopPortRestorer', hooks, graph, () => new SelfLoopPortRestorer().process(graph))
  }




  // 层内 TOP/BOTTOM 约束 (ELK InLayerConstraintProcessor: P4 前, 外部端口 dummy 定位).
  runModule('InLayerConstraintProcessor', hooks, graph, () => processInLayerConstraints(graph))

  // 端口放置 (ELK LabelAndNodeSizeProcessor: P4 前端口位置分布).
  runModule('LabelAndNodeSizeProcessor', hooks, graph, () => processLabelAndNodeSize(graph))

  // 节点 margin (端口/label 外扩空间, ELK InnermostNodeMarginCalculator).
  runModule('NodeMarginCalculator', hooks, graph, () => calculateNodeMargins(graph))
  // comment margin (ELK CommentNodeMarginCalculator: InnermostNodeMarginCalculator 之后累加 —
  // 顺序反了会被 Innermost 重置, comment_boxes margin.top=40 丢失实证).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) {
    runModule('CommentNodeMarginCalculator', hooks, graph, () => processCommentNodeMargins(graph))
  }

  // 端标签 (HEAD/TAIL) 收集 → LabelCell 布局 → 节点 margin 扩展 (ELK EndLabelPreprocessor: P4 前,
  // 仅 END_LABELS 图属性时由 P5 路由器注册; enum 序在 InnermostNodeMarginCalculator 之后).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.END_LABELS)) {
    runModule('EndLabelPreprocessor', hooks, graph, () => processEndLabelPreprocessing(graph))
  }

  // 长边中心标签 dummy 交换到最优层 (ELK LabelDummySwitcher: P4 前 — SplineEdgeRouter L108/
  // OrthogonalEdgeRouter L158/PolylineEdgeRouter L141 的 CENTER_EDGE_LABEL_PROCESSING_ADDITIONS 在
  // CENTER_LABELS 时注册; 运行在 P3 crossing minimization 之后, 交换保持层内节点顺序,
  // END_LABEL_PREPROCESSOR 之后、LABEL_SIDE_SELECTOR 之前).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.CENTER_LABELS)) {
    runModule('LabelDummySwitcher', hooks, graph, () => processLabelDummySwitch(graph))
  }

  // 边标签侧选择 (ELK LabelSideSelector: EndLabelPreprocessor 后, 决定 CENTER 标签 ABOVE/BELOW,
  // 写入 LABEL dummy 的 LABEL_SIDE; END_LABELS 或 CENTER_LABELS 时运行).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.END_LABELS) || graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.CENTER_LABELS)) {
    runModule('LabelSideSelector', hooks, graph, () => processLabelSideSelection(graph))
  }

  // 超边 dummy 合并 (ELK HyperedgeDummyMerger: P4 前, 同源/同 target 的 LONG_EDGE dummy 合并).
  // 仅 ORTHOGONAL 路由运行 — ELK 只在 OrthogonalEdgeRouter 的处理器配置里注册
  // (OrthogonalEdgeRouter.java line 117); SplineEdgeRouter 的 BASELINE 配置不包含它,
  // SPLINES 图合并 dummy 会改变层结构 → BK 垂直坐标偏离 jar.
  // ★ 必须在 LabelDummySwitcher/LabelSideSelector 之后: switcher 设置 LONG_EDGE_BEFORE_LABEL_DUMMY
  //   (ELK L609-643), merger 依此判定「标签分支前的长边 dummy 可合并」; 顺序反了 → 带标签超边
  //   不共享 trunk → label detour 弯点缺失 (hyperedge_labels 实证).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.HYPEREDGES)
    && graph.getProperty(EDGE_ROUTING) !== 'SPLINES') {
    runModule('HyperedgeDummyMerger', hooks, graph, () => new HyperedgeDummyMerger().process(graph))
  }

  // 层级端口 dummy 尺寸 (ELK HierarchicalPortDummySizeProcessor: P4 前, NS 外部端口宽度).
  runModule('HierarchicalPortDummySizeProcessor', hooks, graph, () => processHierarchicalPortDummySize(graph))

  // 自环路由 (ELK SelfLoopRouter: 父图 BK 前, RoutingDirector→LabelPlacer→SlotAssigner→路由, 扩展 margin).
  if (hasSelfLoops) {
    runModule('SelfLoopRouter', hooks, graph, () => processSelfLoopRouter(graph))
  }

  // 断点处理 (ELK BreakingPointProcessor: P4 前, MULTI_EDGE wrapping 时).
  if (graph.getProperty(WRAPPING_STRATEGY) === WrappingStrategy.MULTI_EDGE) {
    runModule('BreakingPointProcessor', hooks, graph, () => processBreakingPoints(graph))
  }

  // P4 分发: SIMPLE → SimpleNodePlacer; INTERACTIVE → InteractiveNodePlacer;
  // NETWORK_SIMPLEX → NetworkSimplexPlacer; 其余非 BK 显式降级.
  const npStrategy = graph.getProperty(NODE_PLACEMENT_STRATEGY)
  if (npStrategy === NodePlacementStrategy.SIMPLE) {
    runModule('SimpleNodePlacer', hooks, graph, () => processSimpleNodePlace(graph))
  } else if (npStrategy === NodePlacementStrategy.INTERACTIVE) {
    runModule('InteractiveNodePlacer', hooks, graph, () => processInteractiveNodePlace(graph))
  } else if (npStrategy === NodePlacementStrategy.NETWORK_SIMPLEX) {
    runModule('NetworkSimplexPlacer', hooks, graph, () => new NetworkSimplexPlacer().process(graph))
  } else if (npStrategy === NodePlacementStrategy.LINEAR_SEGMENTS) {
    runModule('LinearSegmentsNodePlacer', hooks, graph, () => processLinearSegmentsNodePlace(graph))
  } else {
    if (npStrategy !== NodePlacementStrategy.BRANDES_KOEPF) {
      warnUnsupported('nodePlacement.strategy', String(npStrategy), 'BRANDES_KOEPF')
    }
    runModule('BKNodePlacer', hooks, graph, () => new BKNodePlacer().process(graph))
  }
  hooks?.afterPhase?.('BK', graph)

  // 第二遍节点放置 (ELK NodePlacementRepeater: P4 后, 弹性节点 + RECOMPUTE 选项时).
  if (graph.getLayerlessNodes().length > 0 && graph.hasProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT)) {
    runModule('NodePlacementRepeater', hooks, graph, () => processNodePlacementRepeat(graph))
  }

  runModule('LayerSizeAndGraphHeightCalculator', hooks, graph, () => new LayerSizeAndGraphHeightCalculator().process(graph))
  // 层级端口位置 (ELK HierarchicalPortPositionProcessor: 节点放置器在 EXTERNAL_PORTS 时 P5 前添加).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
    runModule('HierarchicalPortPositionProcessor', hooks, graph, () => processHierarchicalPortPosition(graph))
  }
  // P5 分发: POLYLINE → PolylineEdgeRouter; SPLINES → SplineEdgeRouter (层间距含 SLOPPY, 弯点待补);
  // 其余 → OrthogonalEdgeRouter (ELK SplineEdgeRouter 不再降级).
  const er = graph.getProperty(EDGE_ROUTING)
  if (er === 'POLYLINE') {
    runModule('PolylineEdgeRouter', hooks, graph, () => new PolylineEdgeRouter().process(graph))
  } else if (er === 'SPLINES') {
    runModule('SplineEdgeRouter', hooks, graph, () => new SplineEdgeRouter().process(graph))
  } else {
    if (er !== 'ORTHOGONAL' && er !== undefined && er !== null) {
      warnUnsupported('edgeRouting', String(er), 'ORTHOGONAL')
    }
    runModule('OrthogonalEdgeRouter', hooks, graph, () => new OrthogonalEdgeRouter().process(graph))
  }
  hooks?.afterPhase?.('P5', graph)
  // 节点 layerId/positionId 输出 (ELK ConstraintsPostprocessor: P5 后, interactiveLayout / generatePositionAndLayerIds 时).
  if (graph.getProperty(INTERACTIVE_LAYOUT) || graph.getProperty(GENERATE_POSITION_AND_LAYER_IDS)) {
    runModule('ConstraintsPostprocessor', hooks, graph, () => processConstraintsPost(graph))
  }
  // 超节点移动 (ELK HypernodesProcessor: P5 后, HYPERNODES 图属性时 — OrthogonalEdgeRouter 注册).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.HYPERNODES)) {
    runModule('HypernodesProcessor', hooks, graph, () => processHypernodes(graph))
  }
  // ELK 管线顺序 (slot 17-22 / 层级 27-31 实测): P5 → LongEdgeJoiner → NorthSouthPortPostprocessor →
  // HorizontalGraphCompactor → LabelDummyRemover → EndLabelSorter → ReversedEdgeRestorer (→ HPOER → …).
  runModule('LongEdgeJoiner', hooks, graph, () => processLongEdgeJoin(graph))
  // 自环恢复 (ELK SelfLoopPostprocessor: After phase 5 槽位按 IntermediateProcessorStrategy 枚举序
  // SELF_LOOP_POSTPROCESSOR < NORTH_SOUTH_PORT_POSTPROCESSOR < HORIZONTAL_COMPACTOR <
  // LABEL_DUMMY_REMOVER < FINAL_SPLINE_BENDPOINTS_CALCULATOR) — 必须在 LongEdgeJoiner 之后、
  // 压缩器与 FinalSplineBendpointsCalculator 之前: (1) 自环边先挂回端口, FSBC 的 sloppy 中心 Y 度差
  // 才计入自环 (selfloop_crash Nn4->Nn5 b232,126.55 实证; 否则 b232,158.95); (2) 压缩器
  // LGraphToCGraphTransformer SPLINES 分支按源节点压缩位移偏移自环弯点; (3) 在 ReversedEdgeRestorer
  // 之前, 否则 reverser 反转的自环 (REVERSED=true) 恢复时方向无法还原 (insideSelfLoops EAST→WEST 差 6).
  if (hasSelfLoops) {
    runModule('SelfLoopPostprocessor', hooks, graph, () => processSelfLoopPost(graph))
  }
  // 断点移除 (ELK BreakingPointRemover: P5 后, LongEdgeJoiner/SelfLoopPost 之后, NS 后置之前).
  if (graph.getProperty(WRAPPING_STRATEGY) === WrappingStrategy.MULTI_EDGE) {
    runModule('BreakingPointRemover', hooks, graph, () => processBreakingPointRemoval(graph))
  }
  // NS dummy 移除 + 边恢复 (ELK NorthSouthPortPostprocessor: P5 后、LongEdgeJoiner 后).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)
    && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NORTH_SOUTH_PORTS)) {
    runModule('NorthSouthPortPostprocessor', hooks, graph, () => processNorthSouthPortPost(graph))
  }
  // ★ HORIZONTAL_COMPACTOR (ELK GraphConfigurator: postCompaction != NONE && edgeRouting != POLYLINE;
  //  同槽依赖: 在 LabelDummyRemover 之前 (labels 参与压缩)、ReversedEdgeRestorer 之前.
  //  NS dummy 必须先合并回真实节点, 否则压缩器看不到 N-S 边 (south_port 实证).
  const postCompactionStrategy = graph.getProperty(COMPACTION_POST_COMPACTION_STRATEGY)
  if (postCompactionStrategy !== 'NONE' && graph.getProperty(EDGE_ROUTING) !== 'POLYLINE') {
    runModule('HorizontalGraphCompactor', hooks, graph, () => new HorizontalGraphCompactor().process(graph))
  }
  // CENTER 边标签 dummy 移除 + 标签放置 (ELK LabelDummyRemover: P5 后、压缩器之后).
  runModule('LabelDummyRemover', hooks, graph, () => processLabelDummyRemoval(graph))
  // ELK 槽位 (After Phase 5 序): LONG_EDGE_JOINER < NS_PORT_POSTPROCESSOR < HORIZONTAL_COMPACTOR <
  // LABEL_DUMMY_REMOVER < FINAL_SPLINE_BENDPOINTS_CALCULATOR. 必须在压缩器之后 (压缩器读
  // SPLINE_ROUTE_START 收集 spline 垂直段并回写 segment bbox, 计算器用压缩后的 bbox/节点位置),
  // 在 NSPost 之后 (NSPost 设 SPLINE_NS_PORT_Y_COORD, 计算器读它算 NS 弯点).
  if (er === 'SPLINES') {
    runModule('FinalSplineBendpointsCalculator', hooks, graph, () => processFinalSplineBendpoints(graph))
  }
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) {
    runModule('CommentPostprocessor', hooks, graph, () => processCommentPost(graph))
  }
  runModule('EndLabelSorter', hooks, graph, () => processEndLabelSort(graph))
  runModule('ReversedEdgeRestorer', hooks, graph, () => processReversedEdges(graph))
  // ★ 层级端口正交路由 (ELK HierarchicalPortOrthogonalEdgeRouter: After phase 5).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
    runModule('HierarchicalPortOrthogonalEdgeRouter', hooks, graph, () => processHierarchicalPortOrthogonalRouting(graph))
  }
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.END_LABELS)) {
    runModule('EndLabelPostprocessor', hooks, graph, () => processEndLabelPostprocessing(graph))
  }


  // ELK DIRECTION_POSTPROCESSOR (GraphTransformer TO_INTERNAL_LTR): P5 后把内部 LTR 结果变换回原方向.
  // INCLUDE_CHILDREN 分层布局时推迟到全部图布局完再统一变换 (ELK lockstep: 每图
  // HierarchicalNodeResizingProcessor → GraphTransformer(out) 同槽执行, resize 在 canonical 坐标下做,
  // 否则父图仍 canonical 时子图端口已变回原方向 → 外部端口侧错乱 — hierarchicalEdges UP 实证).
  if (!skipOutTransform) {
    runModule('GraphTransformer(out)', hooks, graph, () => new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(graph))
    // 方向变换回后重算 margin: canonical 时算的 margin (端口 EAST → margin.right=5) 变换回后
    // 端口侧变化 (SOUTH), 残留 margin 会多算分量尺寸 (flat01 DOWN 分量宽 67 vs jar 62).
    if (process.env.GGN_MR_DBG) console.error(`MR entry parent=${graph.getParentNode()?.id ?? "root"} layers=${graph.getLayers().length} nodes=${graph.getLayers().reduce((a,l)=>a+l.getNodes().length,0)}`)
    for (const layer of graph.getLayers()) {
      for (const node of layer.getNodes()) {
        calculateNodeMargin(node)
        if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) addCommentMarginToNode(node)
        if (process.env.GGN_MR_DBG && node.size.x === 50 && node.position.x < 20) {
          const m = node.getMargin();
          console.error(`MR node=${node.id} margin=(${m.left},${m.top},${m.right},${m.bottom}) ports=${node.getPorts().map(p => p.getSide() + "@" + p.getPosition().x + "," + p.getPosition().y).join("|")}`)
        }
      }
    }
  }


}

/** SEPARATE/独立子图 (DOWN/UP) 布局后, parent 尺寸是 canonical (resize 时 LTR);
 * 若 parent 所在父图为 RIGHT/UNDEFINED (不会由父图 TO_INTERNAL 转置), 需在此转置回
 * (hierarchicalLayoutMixing insideOtherDirection 104x84 vs jar 84x104 实证). */
function transposeParentSizeForSeparate(graph: LGraph): void {
  const parent = graph.getParentNode()
  if (parent === null) return
  const gdir = graph.getProperty(DIRECTION)
  if (gdir !== Direction.DOWN && gdir !== Direction.UP) return
  const pdir = parent.getGraph()?.getProperty(DIRECTION)
  if (pdir !== Direction.RIGHT && pdir !== Direction.UNDEFINED) return
  const t = parent.size.x
  parent.size.x = parent.size.y
  parent.size.y = t
  const pt = parent.getPadding()
  const tmp = pt.left
  pt.left = pt.top
  pt.top = tmp
  const tmp2 = pt.right
  pt.right = pt.bottom
  pt.bottom = tmp2
}

/** 是否为 SEPARATE_CHILDREN 子图 (容器节点显式 hierarchyHandling=SEPARATE_CHILDREN).
 * Java RecursiveGraphLayoutEngine 把这类子图从 INCLUDE 层级布局中切出, 先完整独立布局
 * (含 TO_INTERNAL 变换回), 父图布局时直接用最终尺寸 — ggn lockstep 里 SEPARATE 子图
 * 必须在父图 post-P3 (Phase C) 之前完成变换回 (hierarchicalLayoutMixing 实证). */
function isSeparateChildGraph(graph: LGraph): boolean {
  const parent = graph.getParentNode()
  if (parent === null) return false
  return parent.getProperty(HIERARCHY_HANDLING) === 'SEPARATE_CHILDREN'
}


function doHierarchicalLayout(root: LGraph, monitor: IElkProgressMonitor, hooks?: LayoutPhaseHooks): void {
  // ELK ElkLayered.hierarchicalLayout 入口: 层级处理器一致性校验 (子图 CM 策略 ≠ 根图即抛).
  const graphs = collectAllGraphsBottomUp(root)
  reviewAndCorrectHierarchicalProcessors(root, graphs)
  // 随机数生成器 (ELK GraphConfigurator): 每个图各自 new Random(randomSeed), 不共享实例
  // (elkjs/ELK Java: GraphConfigurator.prepareGraphForLayout 逐图设置 RANDOM).
  for (const graph of graphs) {
    if (graph.getProperty(RANDOM) === undefined) {
      const randomSeed = graph.getProperty(RANDOM_SEED)
      graph.setProperty(RANDOM, randomSeed === 0 ? new JavaRandom() : new JavaRandom(randomSeed))
    }
  }

  // ── Phase A: pre-P3 (每图, 自底向上); fixed 子图跳过 (475) ──
  for (const graph of graphs) {
    if (isFixedNestedGraph(graph)) continue
    runGraphPreP3(graph, monitor, hooks)
  }

  // ── Phase B: P3 (仅根, 扫入子图) ──
  const rootG = graphs[graphs.length - 1]!
  const rootCms = rootG.getProperty(CROSSING_MINIMIZATION_STRATEGY)
  if (rootCms === 'INTERACTIVE') {
    runModule('InteractiveCrossingMinimizer', hooks, rootG, () => new InteractiveCrossingMinimizer().process(rootG))
    hooks?.afterPhase?.('P3', rootG)
  } else if (rootCms === 'MEDIAN_LAYER_SWEEP') {
    runModule('LayerSweepCrossingMinimizer', hooks, rootG, () => new LayerSweepCrossingMinimizer(CrossMinType.MEDIAN).process(rootG, monitor))
    hooks?.afterPhase?.('P3', rootG)
  } else {
    runModule('LayerSweepCrossingMinimizer', hooks, rootG, () => new LayerSweepCrossingMinimizer(CrossMinType.BARYCENTER).process(rootG, monitor))
    hooks?.afterPhase?.('P3', rootG)
  }
  // ELK: 层级 (INCLUDE_CHILDREN) 图 greedy switch 默认 OFF
  // (CROSSING_MINIMIZATION_GREEDY_SWITCH_HIERARCHICAL_TYPE 默认 OFF), 不跑第二遍.
  // 非层级图的第二遍 GREEDY 在 doSimpleLayoutInner (P4 前).
  if (process.env.GGN_GREEDY_HIER) {
    runModule('GreedySwitchHeuristic', hooks, rootG, () => new LayerSweepCrossingMinimizer(CrossMinType.TWO_SIDED_GREEDY_SWITCH).process(rootG, monitor))
    hooks?.afterPhase?.('GreedySwitch', rootG)
  }

  // ── Phase C: post-P3 (每图, 自底向上), 保持 canonical (不先变换回原方向); fixed 子图跳过 (475) ──
  // SEPARATE_CHILDREN 子图在 Phase C 内提前变换回 (父图需要其最终尺寸), Phase D 跳过.
  const separateTransposed = new Set<LGraph>()
  for (const graph of graphs) {
    if (isFixedNestedGraph(graph)) continue
    runGraphPostP3(graph, monitor, hooks, true)
    // 子图布局完成: 父节点尺寸扩展 (含子图内容). ELK lockstep: resize 在 canonical 坐标下做
    // (父图仍 canonical, 子图端口侧不能先变回原方向).
    const parent = graph.getParentNode()
    // ★ HPOER 已在 runGraphPostP3 内 (EndLabelPostprocessor 前, ELK After phase 5) 执行 —
    // 这里不再重复调用, 否则 Step3 size.y 调整累积 (502: n1 高 74 vs jar 54, 差 20).
    if (parent !== null) resizeParentNode(parent, true)
    // ★ SEPARATE_CHILDREN 子图: 必须在此 (父图 post-P3 之前) 完成 TO_INTERNAL 变换回 —
    // Java RecursiveGraphLayoutEngine 严格自底向上: SEPARATE 子图先完整独立布局 (尺寸定型
    // 84x104), 父图 Noutside 布局才用正确尺寸; ggn lockstep 若拖到 Phase D, 父图 (Phase C)
    // 用的是 canonical 104x84 → Noutside 高差 20 + insideOtherDirection x 偏移 10.
    if (isSeparateChildGraph(graph)) {
      runModule('GraphTransformer(out)', hooks, graph, () => new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(graph))
      // SEPARATE 子图 (DOWN/UP) 的 parent 尺寸 canonical → 转置回 (父图 RIGHT 时不自动转置).
      transposeParentSizeForSeparate(graph)
      // 方向变换回后重算 margin (同 doSimpleLayoutInner / Phase D)
      for (const layer of graph.getLayers()) {
        for (const node of layer.getNodes()) {
          calculateNodeMargin(node)
        }
      }
      separateTransposed.add(graph)
    }
  }

  // ── Phase D: 全部图变换回原方向 (ELK lockstep 同槽, 自底向上); SEPARATE 子图已在 Phase C 变换回 ──
  for (const graph of graphs) {
    if (separateTransposed.has(graph)) continue
    runModule('GraphTransformer(out)', hooks, graph, () => new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(graph))
    // SEPARATE 子图 (DOWN/UP) 的 parent 尺寸 canonical → 转置回 (父图 RIGHT 时不自动转置).
    transposeParentSizeForSeparate(graph)
    // 方向变换回后重算 margin (同 doSimpleLayoutInner)
    for (const layer of graph.getLayers()) {
      for (const node of layer.getNodes()) {
        calculateNodeMargin(node)
      }
    }
  }

  // ── 根 offset+padding ──
  const offset = root.getOffset()
  const padding = root.getPadding()
  for (const node of root.getAllNodes()) {
    node.position.x += offset.x + padding.left
    node.position.y += offset.y + padding.top
  }
  // 根图边弯点与节点同步平移 (根 NS 后处理/路由在 pre-padding 坐标生成弯点, 平移后不随动
  // → 根级 N/S 外部端口边斜线; 嵌套边弯点已由 resizeParentNode 平移, 此处只涉及根内边,
  // 跨层级 dummy 边在子图内, 不在 root.getAllNodes 的端口连接集里 — tmp-ns-port 实证).
  const rootDx = offset.x + padding.left
  const rootDy = offset.y + padding.top
  if (rootDx !== 0 || rootDy !== 0) {
    const seenRootEdges = new Set<object>()
    for (const node of root.getAllNodes()) {
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          if (seenRootEdges.has(edge)) continue
          seenRootEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += rootDx
            bp.y += rootDy
          }
        }
      }
    }
  }
  hooks?.afterPhase?.('done', root)
}

/** 子图继承父节点方向 (ELK ElkGraphImporter.createLGraph: parentGraphDirection), 需在 compound preprocessor 前.
 * INCLUDE_CHILDREN: 嵌套图方向 = 父图方向 (importHierarchicalGraph 强制覆盖, 节点 direction 忽略);
 * SEPARATE_CHILDREN: 子图独立布局, 用节点自身 direction (hierarchicalLayoutMixing insideOtherDirection DOWN 实证). */
function propagateNestedDirections(graph: LGraph): void {
  const graphDir = graph.getProperty(DIRECTION)
  for (const node of graph.getLayerlessNodes()) {
    const nested = node.getNestedGraph()
    if (nested === null) continue
    if (nested.getProperty(DIRECTION) === Direction.UNDEFINED) {
      const nodeHh = node.getProperty<string>('org.eclipse.elk.hierarchyHandling')
      const nodeDir = node.getProperty<string>('org.eclipse.elk.direction')
      if (nodeHh === 'SEPARATE_CHILDREN' && nodeDir !== undefined && nodeDir !== Direction.UNDEFINED) {
        nested.setProperty(DIRECTION, nodeDir as Direction)
      } else if (graphDir !== Direction.UNDEFINED) {
        nested.setProperty(DIRECTION, graphDir)
      }
    }
    propagateNestedDirections(nested)
  }
}

/** 库级 pc 传播 (ELK ElkGraphImporter.createLGraph.copyProperties): 嵌套 LGraph 继承父节点 portConstraints. */
function propagateNestedPortConstraints(graph: LGraph): void {
  for (const node of graph.getLayerlessNodes()) {
    const nested = node.getNestedGraph()
    if (nested === null) continue
    if (nested.getProperty(PORT_CONSTRAINTS) === PortConstraints.UNDEFINED) {
      const parentPc = node.getProperty(PORT_CONSTRAINTS)
      if (parentPc !== PortConstraints.UNDEFINED) {
        nested.setProperty(PORT_CONSTRAINTS, parentPc)
        if (process.env.GGN_PC_DBG) console.error('[PC] ' + node.id + ' pc ' + parentPc + ' -> nested')
      }
    }
    propagateNestedPortConstraints(nested)
  }
}

/** ELK ElkGraphImporter.createLGraph.copyProperties (子集): 容器节点级图选项 → 嵌套 LGraph.
 * ELK 把节点 layoutOptions 全量复制到嵌套图; ggn 只定向补移植所需 (crossingMinimization.strategy 等).
 * 缺此传播时, 嵌套图策略恒为默认 → reviewAndCorrectHierarchicalProcessors 永远不触发 (verticalOrder 实证). */
/** 容器节点级图选项 → 嵌套 LGraph 的完整清单 (ELK ElkGraphImporter.createLGraph.copyProperties:
 * 节点 layoutOptions 全量复制到嵌套图; ggn 按需定向复制已移植的选项, 未列出选项保持默认).
 * transform_direction 实证: 缺 portSortingStrategy/edgeRouting/directionCongruency/randomSeed
 * 传播 → 嵌套图端口排序/路由/随机种子全错. */
const NESTED_GRAPH_OPTS = [
  CROSSING_MINIMIZATION_STRATEGY,
  // 断环/分层策略 (three_edges_inverted_ports_2 实证: 未传播 → 嵌套图用 GREEDY/NETWORK_SIMPLEX
  // 而非 INTERACTIVE → 反转边数不同 → inverted dummy 2 vs 3).
  CYCLE_BREAKING_STRATEGY,
  LAYERING_STRATEGY,
  // semi-interactive / interactiveLayout (增量布局: 容器 INTERACTIVE 组合传播到嵌套图,
  // 否则复合图内部 P3 走默认 LAYER_SWEEP, 层内顺序每轮翻转 — ggn 流式复合图实证).
  CROSSING_MINIMIZATION_SEMI_INTERACTIVE,
  INTERACTIVE_LAYOUT,
  PORT_SORTING_STRATEGY,
  EDGE_ROUTING,
  DIRECTION_CONGRUENCY,
  RANDOM_SEED,
  CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE, CROSSING_MINIMIZATION_GREEDY_SWITCH_ACTIVATION_THRESHOLD,
  NODE_LABELS_PLACEMENT,
  // ELK 只在顶层图 PARTITIONING_ACTIVATE 激活分区 (ElkGraphImporter.java:119 topLevelGraph),
  // 嵌套图 activate 被忽略 (partitioning.elkt 容器级 activate → 布局与 default 相同 — jar 实证).
  // 传播到嵌套图会错误激活分区 → 同分区节点强排同层. 故不传播.
  // 间距选项 (628: 容器 spacing.nodeNodeBetweenLayers=10 未传播 → 嵌套图用默认 20, 差 10).
  SPACING_NODE_NODE,
  SPACING_NODE_NODE_BETWEEN_LAYERS,
  SPACING_EDGE_EDGE,
  SPACING_EDGE_EDGE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE,
  SPACING_EDGE_NODE_BETWEEN_LAYERS,
  SPACING_PORT_PORT,
  SPACING_PORTS_SURROUNDING,
  // ELK createLGraph.copyProperties 全量复制节点 layoutOptions 到嵌套图: 父容器 portLabels.placement
  // 决定外部端口 dummy 标签放置 (placeExternalPortDummyLabels 用图级 placement; 701 Fixed [] 容器实证).
  PORT_LABELS_PLACEMENT,
  // ⚠️ 不含 NODE_SIZE_*: 容器 nodeSize.minimum 只作用于容器自身 (ELK NodeLabelAndSizeUtilities:226
  // 只读节点级 minimum, 不回退图级; content_alignment 实证: 传播后嵌套图节点被撑成 900x400).
]

function propagateNestedGraphOptions(graph: LGraph): void {
  for (const node of graph.getLayerlessNodes()) {
    const nested = node.getNestedGraph()
    if (nested === null) continue
    // ⚠️ 不传播节点 direction: ELK v0.12.0 importHierarchicalGraph 强制嵌套图方向 = 父图方向
    // (createLGraph.copyProperties 后 setProperty(parentGraphDirection) 覆盖), 节点 direction 被忽略
    // (transform_direction 实证: 4 组内部坐标完全相同). 方向变换在 GraphTransformer 里按节点 direction 处理.
    for (const prop of NESTED_GRAPH_OPTS) {
      if (node.hasProperty(prop)) {
        // 联合 Property 类型 (number|string|string[]) — setProperty/getProperty 用 any 桥接
        // (ggn 属性系统以字符串 id 为 key, 值类型由调用点约定).
        ;(nested.setProperty as (p: unknown, v: unknown) => LGraph)(prop, node.getProperty(prop as never))
        if (process.env.GGN_PROP_DBG && String(prop) === 'org.eclipse.elk.spacing.portPort') {
          console.error(`[PROPDBG] propagate portPort=${String(node.getProperty(prop as never))} to nested of ${String(node.id)}`)
        }
      }
    }
    propagateNestedGraphOptions(nested)
  }
}

/** ELK ElkLayered.reviewAndCorrectHierarchicalProcessors: 层级感知处理器 (IHierarchyAwareLayoutProcessor,
 * 如 INTERACTIVE/NONE crossing minimization) 必须由根图统一指定 — 任一子图策略 ≠ 根图策略即抛
 * UnsupportedGraphException (0.12.0 源码 ElkLayered.java:336-355). */
function reviewAndCorrectHierarchicalProcessors(root: LGraph, graphs: LGraph[]): void {
  const parentCms = root.getProperty(CROSSING_MINIMIZATION_STRATEGY)
  for (const child of graphs) {
    if (child === root) continue
    const childCms = child.getProperty(CROSSING_MINIMIZATION_STRATEGY)
    if (childCms !== parentCms) {
      const desc = child.getParentNode()?.id ?? 'G-unlayered'
      throw new Error(
        'UnsupportedGraphException: The hierarchy aware processor ' + childCms +
        ' in child node ' + desc +
        ' is only allowed if the root node specifies the same hierarchical processor.')
    }
  }
}


/** ELK 导入期 initializePort: 所有 side-fixed 节点端口 UNDEFINED 时按位置定侧.
 * 必须在 CompoundGraphPreprocessor 建 dummy 之前 (CGP 用 port.getSide() 决定 dummy 侧;
 * 延迟到 pre-P3 会让 CGP 建出 UNDEFINED 侧 dummy, 与后续 WEST/EAST 端口错配 → sortPortDummies 崩溃). */
function initializeAllPortSides(root: LGraph): void {
  const stack: LGraph[] = [root]
  while (stack.length > 0) {
    const graph = stack.pop()!
    const initDir = graph.getProperty(DIRECTION) === Direction.UNDEFINED ? Direction.RIGHT : graph.getProperty(DIRECTION)
    for (const node of graph.getAllNodes()) {
      const pc = node.getProperty(PORT_CONSTRAINTS)
      if (!PortConstraints.isSideFixed(pc)) continue
      for (const port of node.getPorts()) initializePort(port, pc, initDir)
    }
    for (const node of graph.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null) stack.push(nested)
    }
  }
}

export function doCompoundLayout(root: LGraph, monitor: IElkProgressMonitor, hooks?: LayoutPhaseHooks): void {
  // 给子图继承方向 (SEPARATE: 子图独立布局需要; INCLUDE: 整图布局后子图 GraphTransformer 需按方向变换,
  // 否则 LEFT/DOWN/UP 下嵌套节点不镜像/转置 — hierarchicalEdges 实证 source x=12 vs ELK 230).
  propagateNestedDirections(root)
  propagateNestedGraphOptions(root)
  if (HIER_ORTHO_ENABLED) propagateNestedPortConstraints(root)
  // ELK 导入期定侧 (CGP 之前).
  initializeAllPortSides(root)
  runModule('CompoundGraphPreprocessor', hooks, root, () => new CompoundGraphPreprocessor().process(root))

  // INCLUDE_CHILDREN (elkjs 测试口径): 层级驱动 (自底向上 pre-P3 → 根 P3 → post-P3).
  if (root.getProperty(HIERARCHY_HANDLING) === 'INCLUDE_CHILDREN') {
    doHierarchicalLayout(root, monitor, hooks)
    runModule('CompoundGraphPostprocessor', hooks, root, () => processCompoundGraphPost(root))
    return
  }

  // 自底向上: 叶子图先布局 (ELK hierarchicalLayout).
  const graphs = collectAllGraphsBottomUp(root)
  for (const graph of graphs) {
    if (isFixedNestedGraph(graph)) continue // algorithm:fixed 容器子图保持输入位置 (475)
    if (graph.getLayers().length === 0 || graph.getLayerlessNodes().length > 0) {
      doSimpleLayout(graph, monitor, hooks)
      // ELK ComponentGroupGraphPlacer 单分量 WE 合并: target.size = offset - componentSpacing;
      // 仅外部端口 dummy (0 宽内容, inside-self-loop 嵌套图) 时 size.x 变负 (-spacing) → 父节点
      // resize 到 actualSize (size+padding) = 4×32 (实证: Nparent 24→4, §40). 有内容 (size.x>0)
      // 或空图 (ELK components.isEmpty → (0,0)) 不变.
      const parent = graph.getParentNode()
      if (process.env.GGN_CG_DBG) console.error(`[CG] graph=${graph.getParentNode()?.id ?? 'ROOT'} size=(${graph.getSize().x},${graph.getSize().y}) ext=${graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)} layerless=${graph.getLayerlessNodes().length} parent=${parent !== null}`)
      if (parent !== null && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)
        && graph.getSize().x === 0 && graph.getAllNodes().some((n) => n.getType() === NodeType.EXTERNAL_PORT)) {
        // ELK SEPARATE 内容图走 ComponentsProcessor.split + ComponentGroupGraphPlacer (external ports):
        //   - 单分量 (W-E 外部端口 dummy 同组): 组尺寸 = offset - componentSpacing → size.x = -spacing
        //     (jar 562/ex: 父节点 4×32);
        //   - 多分量 (含孤立外部端口 dummy): 各组分排后 broadestRow ≥ componentSpacing → size.x = +spacing
        //     (jar 298: P2-P5 自环分量 + 孤立 P4 → 内容图 20×20 → 父 44×44).
        // ggn 的 CGP 只给自环端口建 dummy (未连端口如 298 P4 不在嵌套图内, 布局后才由 CGP 补),
        // 故按「dummy 连通分量数 + 父节点未建 dummy 的端口数」补尺寸.
        const uniqNodes: LNode[] = []
        const seenNode = new Set<LNode>()
        for (const n of graph.getAllNodes()) {
          if (!seenNode.has(n)) { seenNode.add(n); uniqNodes.push(n) }
        }
        const visited = new Set<LNode>()
        const dfs = (start: LNode): void => {
          const stack = [start]
          while (stack.length > 0) {
            const n = stack.pop()!
            if (visited.has(n)) continue
            visited.add(n)
            for (const p of n.getPorts()) {
              for (const other of p.getConnectedPorts()) {
                const on = other.getNode()
                if (on !== null && !visited.has(on)) stack.push(on)
              }
            }
          }
        }
        let components = 0
        for (const n of uniqNodes) {
          if (!visited.has(n)) { dfs(n); components++ }
        }
        const dummyOrigins = new Set<LPort>()
        for (const n of uniqNodes) {
          const o = n.getProperty(ORIGIN)
          if (o instanceof LPort) dummyOrigins.add(o)
        }
        for (const p of parent.getPorts()) {
          if (!dummyOrigins.has(p)) components++
        }
        if (process.env.GGN_CG_DBG) console.error(`[CG] components=${components} nodes=${uniqNodes.map(n => n.id + ':o' + String((n.getProperty(ORIGIN) as { id?: string } | null)?.id ?? '?')).join(' ')}`)
        graph.getSize().x = components > 1
          ? graph.getProperty(SPACING_COMPONENT_COMPONENT)
          : -graph.getProperty(SPACING_COMPONENT_COMPONENT)
        if (process.env.GGN_CG_DBG) console.error(`[CG] -> set size.x = ${graph.getSize().x}`)
      }
      // 子图布局完成: 父节点尺寸扩展到包含子图 (影响根层布局).
      if (parent !== null && HIER_ORTHO_ENABLED && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
        processHierarchicalPortOrthogonalRouting(graph)
      }
      if (parent !== null) {
        resizeParentNode(parent, false)
        transposeParentSizeForSeparate(graph)
      }
    }
  }

  runModule('CompoundGraphPostprocessor', hooks, root, () => processCompoundGraphPost(root))
}

/** 阶段钩子 (探针调试用): 每个模块执行前后回调 + 关键阶段 (P3/BK/done) 回调. */
export interface LayoutPhaseHooks {
  beforeModule?: (name: string, graph: LGraph) => void
  afterModule?: (name: string, graph: LGraph) => void
  afterPhase?: (phase: string, graph: LGraph) => void
}

/** 执行单个模块并触发前后钩子. */
function runModule(name: string, hooks: LayoutPhaseHooks | undefined, graph: LGraph, fn: () => void): void {
  if (process.env.GGN_PIPE_DBG) {
    const pn = graph.getParentNode()
    const pnName = pn ? (pn.getLabels()[0]?.text ?? '#' + pn.id) : 'root'
    console.error(`GGN_PIPE ${pnName} ${name}`)
  }
  hooks?.beforeModule?.(name, graph)
  fn()
  hooks?.afterModule?.(name, graph)
}

/** 单图布局: 连通分量拆分 → 每分量布局 → 合并 (ELK ComponentsProcessor). */
export function doSimpleLayout(graph: LGraph, monitor: IElkProgressMonitor, hooks?: LayoutPhaseHooks): void {
  // 随机数生成器 (ELK GraphConfigurator): split 前设置, 分量 copyProperties 共享同一实例 (序列延续).
  if (graph.getProperty(RANDOM) === undefined) {
    const randomSeed = graph.getProperty(RANDOM_SEED)
    graph.setProperty(RANDOM, randomSeed === 0 ? new JavaRandom() : new JavaRandom(randomSeed))
  }
  // GreedySwitch 激活判断 (ELK GraphConfigurator.activateGreedySwitchFor): 必须在 split 前用根图节点数
  // (carTracking 50 节点 > 默认阈值 40 → 不激活; 分量图上判断会误激活, 导致层序与 jar 分歧).
  const interactiveCrossMin = graph.getProperty(CROSSING_MINIMIZATION_SEMI_INTERACTIVE)
    || graph.getProperty(CROSSING_MINIMIZATION_STRATEGY) === 'INTERACTIVE'
  const greedyType = graph.getProperty(CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE)
  const activationThreshold = graph.getProperty(CROSSING_MINIMIZATION_GREEDY_SWITCH_ACTIVATION_THRESHOLD)
  const graphSize = graph.getLayerlessNodes().length
  const greedySwitchActive = !interactiveCrossMin && greedyType !== 'OFF'
    && (activationThreshold === 0 || activationThreshold > graphSize)
  graph.setProperty(GREEDY_SWITCH_ACTIVE, greedySwitchActive)
  const components = new ComponentsProcessor().split(graph)
  if (components.length === 1) {
    doSimpleLayoutInner(graph, monitor, hooks)
  } else {
    for (const comp of components) {
      doSimpleLayoutInner(comp, monitor, hooks, false)
      // 分量布局完成: 节点移回 layerless (combine 依赖 layerless 列表, ELK layout 末尾语义).
      for (const layer of comp.getLayers()) {
        // 拷贝遍历: setLayer(null) 会 splice 当前节点, 直接遍历会跳过下一个.
        for (const node of [...layer.getNodes()]) {
          if (!comp.getLayerlessNodes().includes(node)) {
            comp.getLayerlessNodes().push(node)
          }
          node.setLayer(null)
        }
        layer.getNodes().length = 0
      }
      comp.getLayers().length = 0
      computeComponentSize(comp)
    }
    new ComponentsProcessor().combine(components, graph)
    hooks?.afterPhase?.('combine', graph)
    // combine 后统一应用 offset+padding (ElkGraphLayoutTransferrer 语义: 整图一次).
    const offset = graph.getOffset()
    const padding = graph.getPadding()
    const dx = offset.x + padding.left
    const dy = offset.y + padding.top
    // 节点与边弯点同步平移 (与 doSimpleLayoutInner 一致; 多分量图 combine 路径之前只移节点
    // → 弯点留在 canonical 坐标, 差 padding — edge__and_port_labels 实证).
    const seenEdges = new Set<object>()
    for (const node of graph.getLayerlessNodes()) {
      node.position.x += dx
      node.position.y += dy
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          if (seenEdges.has(edge)) continue
          seenEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += dx
            bp.y += dy
          }
        }
      }
    }
  }
}

/** 显式声明静默缺失策略 (M0-A): 命中未实现策略时去重警告, 不再静默降级. */
const warnedUnsupported = new Set<string>()
function warnUnsupported(key: string, value: string, fallback: string): void {
  const id = `${key}=${value}`
  if (warnedUnsupported.has(id)) return
  warnedUnsupported.add(id)
  console.warn(`[ggn] 未实现策略 ${key}=${value}，降级为 ${fallback}（与 ELK 不一致，待移植/显式降级）`)
}

/** 单图布局 (单分量, 无拆分): P1 断环 → P2 分层 → P3 排序 → P4 定位 → P5 路由. */
function doSimpleLayoutInner(graph: LGraph, monitor: IElkProgressMonitor, hooks?: LayoutPhaseHooks, applyOffsetPadding = true): void {
  // ELK ElkGraphImporter.initializePort: 所有 side-fixed 约束端口侧 UNDEFINED 时按位置计算
  // (FIXED_SIDE/FIXED_ORDER/FIXED_POS/FIXED_RATIO; isSideFixed). 必须在 GraphTransformer(in) 之前,
  // 方向变换才能转置端口侧 (graph02 flexible_ports 实证: FIXED_ORDER 端口导入期定 WEST, DOWN 变换后成 NORTH).
  const initDir = graph.getProperty(DIRECTION) === Direction.UNDEFINED ? Direction.RIGHT : graph.getProperty(DIRECTION)
  for (const node of graph.getAllNodes()) {
    const pc = node.getProperty(PORT_CONSTRAINTS)
    if (!PortConstraints.isSideFixed(pc)) continue
    for (const port of node.getPorts()) {
      initializePort(port, pc, initDir)
    }
  }

  // ElkGraphImporter 等价: 收集图属性 (决定中间处理器启用条件). ELK 在导入期 (方向变换前)
  // 用**原始端口侧**收集 NORTH_SOUTH_PORTS — ggn 若在变换后收集, DOWN/UP 的流侧端口 (SOUTH/NORTH)
  // 转成 canonical EAST/WEST 后会被误判为 N-S → 错误创建 NS dummy → 节点 +10 偏移 (south_port DOWN 实证).
  const props = graph.getProperty(GRAPH_PROPERTIES)
  // ELK getDirection: UNDEFINED 时按 aspectRatio 默认 (>=1 → RIGHT).
  const rawDir = graph.getProperty(DIRECTION)
  const dir = rawDir === Direction.UNDEFINED ? Direction.RIGHT : rawDir
  for (const node of graph.getLayerlessNodes()) {
    const pc = node.getProperty(PORT_CONSTRAINTS)
    if (pc !== PortConstraints.FREE && pc !== PortConstraints.UNDEFINED) {
      props.add(GraphProperties.NON_FREE_PORTS)
    }
    // 超节点 (ELK ElkGraphImporter: HYPERNODE → HYPERNODES + HYPEREDGES 图属性, 端口约束置 FREE).
    if (node.getProperty(HYPERNODE)) {
      props.add(GraphProperties.HYPERNODES)
      props.add(GraphProperties.HYPEREDGES)
      node.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
    }
    // 分区布局 (ELK ElkGraphImporter: PARTITIONING_ACTIVATE → GraphProperties.PARTITIONS).
    collectPartitions(graph)
    for (const port of node.getPorts()) {
      const side = port.getSide()
      const verticalPort = dir === Direction.RIGHT || dir === Direction.LEFT
        ? side === PortSide.NORTH || side === PortSide.SOUTH
        : side === PortSide.EAST || side === PortSide.WEST
      if (verticalPort) props.add(GraphProperties.NORTH_SOUTH_PORTS)
      if (port.getIncomingEdges().length + port.getOutgoingEdges().length > 1) {
        props.add(GraphProperties.HYPEREDGES)
      }
      for (const e of port.getOutgoingEdges()) {
        if (e.getTarget() !== null && e.getTarget()!.getNode() === node) {
          props.add(GraphProperties.SELF_LOOPS)
        }
        // ELK ElkGraphImporter: 边标签 placement 决定 CENTER_LABELS/END_LABELS 图属性
        // (默认 CENTER; UNDEFINED 归一化为 CENTER).
        for (const label of e.getLabels()) {
          if (label.placement === EdgeLabelPlacement.HEAD || label.placement === EdgeLabelPlacement.TAIL) {
            props.add(GraphProperties.END_LABELS)
          } else {
            props.add(GraphProperties.CENTER_LABELS)
          }
        }
      }
    }
  }

  // ELK DIRECTION_PREPROCESSOR (GraphTransformer TO_INPUT_DIRECTION): P1 前把非 RIGHT 方向
  // 变换到内部 LTR (节点/端口/边/标签坐标 + 端口侧 + 端口 index 反转). 布局后对称变换回.
  runModule('GraphTransformer(in)', hooks, graph, () => new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(graph))

  // ELK GraphConfigurator.copyPortConstraints: P3 transfer 会把约束改为 FIXED_ORDER,
  // 先保存原始约束 (端口放置方向判断用).
  for (const node of graph.getAllNodes()) {

    if (!node.hasProperty(ORIGINAL_PORT_CONSTRAINTS)) {
      node.setProperty(ORIGINAL_PORT_CONSTRAINTS, node.getProperty(PORT_CONSTRAINTS))
    }
  }
  // favorStraightEdges 默认由 edgeRouting 决定 (ELK GraphConfigurator: ORTHOGONAL → true).
  if (graph.getProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES) === null
    || graph.getProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES) === undefined) {
    graph.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, graph.getProperty(EDGE_ROUTING) === 'ORTHOGONAL')
  }

  // comment box 预处理 (ELK CommentPreprocessor: P1 前置, COMMENTS 时).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) {
    runModule('CommentPreprocessor', hooks, graph, () => processCommentPreprocessing(graph))
  }

  // 边方向约束反转 (ELK EdgeAndLayerConstraintEdgeReverser: 由 layering 策略添加 —
  //  NONE/INTERACTIVE 不添加, NetworkSimplex/LongestPath 等添加; P1 最前, inverted-ports 依赖).
  // ★ 必须在 SelfLoopPreprocessor 之前 (ELK addBefore(P1) 拓扑序: reverser 在 SLPP 前) —
  //   inside_outside 实证: N1 FIXED_SIDE + 自环 (inside yo 使 P2 netFlow>0/P1 netFlow<0) →
  //   reverser 的 allPortsReversed 反转 E2 (P2→P1 变 P1→P2) → 自环走上侧 (y=22);
  //   顺序反了 SLPP 先隐藏 E2 → reverser 看不到边 → 不反转 → 自环走下侧 (y=12, §41).
  if (graph.getProperty(LAYERING_STRATEGY) !== 'INTERACTIVE') {
    runModule('EdgeAndLayerConstraintEdgeReverser', hooks, graph, () => new EdgeAndLayerConstraintEdgeReverser().process(graph))
  }

  // 自环隐藏 (ELK SelfLoopPreprocessor: P1 前置, SELF_LOOPS 时).
  const hasSelfLoops = graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.SELF_LOOPS)

  if (hasSelfLoops) {
    runModule('SelfLoopPreprocessor', hooks, graph, () => processSelfLoops(graph))
  }

  // 分区预处理器 (ELK PartitionPreprocessor: P1 前, 反转高→低分区边, 防断环破坏分区序).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.PARTITIONS)) {
    runModule('PartitionPreprocessor', hooks, graph, () => processPartitionPre(graph))
  }
  // 交互式外部端口定位 (ELK InteractiveExternalPortPositioner: P1 前, INTERACTIVE 断环/分层时).
  if (graph.getProperty(CYCLE_BREAKING_STRATEGY) === CycleBreakingStrategy.INTERACTIVE
    || graph.getProperty(LAYERING_STRATEGY) === 'INTERACTIVE') {
    runModule('InteractiveExternalPortPositioner', hooks, graph, () => processInteractiveExternalPortPosition(graph))
  }
  const cbStrategy = graph.getProperty(CYCLE_BREAKING_STRATEGY)
  if (cbStrategy === CycleBreakingStrategy.MODEL_ORDER) {
    runModule('ModelOrderCycleBreaker', hooks, graph, () => processModelOrderCycleBreak(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.GREEDY_MODEL_ORDER) {
    runModule('GreedyModelOrderCycleBreaker', hooks, graph, () => new GreedyModelOrderCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.DEPTH_FIRST) {
    runModule('DepthFirstCycleBreaker', hooks, graph, () => new DepthFirstCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.SCC_CONNECTIVITY) {
    runModule('SCConnectivity', hooks, graph, () => new SCConnectivity().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.SCC_NODE_TYPE) {
    runModule('SCCNodeTypeCycleBreaker', hooks, graph, () => new SCCNodeTypeCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.DFS_NODE_ORDER) {
    runModule('DFSNodeOrderCycleBreaker', hooks, graph, () => new DFSNodeOrderCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.BFS_NODE_ORDER) {
    runModule('BFSNodeOrderCycleBreaker', hooks, graph, () => new BFSNodeOrderCycleBreaker().process(graph, monitor))
  } else if (cbStrategy === CycleBreakingStrategy.INTERACTIVE) {
    runModule('InteractiveCycleBreaker', hooks, graph, () => processInteractiveCycleBreak(graph))
  } else {
    runModule('GreedyCycleBreaker', hooks, graph, () => new GreedyCycleBreaker().process(graph, monitor))
  }
  // P1 断环完成 (测试钩子: 断环后图应无环 — 输出边在 ReversedEdgeRestorer 会恢复原方向, 不在此时检查).
  hooks?.afterPhase?.('P1', graph)

  // CENTER 边标签 dummy (ELK LabelDummyInserter: P2 前, 为边标签预留空间).
  runModule('LabelDummyInserter', hooks, graph, () => processLabelDummyInsert(graph))

  // 隐藏 FIRST_SEPARATE/LAST_SEPARATE (外部端口 dummy) (ELK LayerConstraintPreprocessor).
  runModule('LayerConstraintPreprocessor', hooks, graph, () => new LayerConstraintPreprocessor().process(graph))

  // P2: layering.strategy 分发 (INTERACTIVE / LONGEST_PATH_SOURCE / LONGEST_PATH_SINK / 默认 NETWORK_SIMPLEX).
  // 分区中处理器 (ELK PartitionMidprocessor: P2 前, 相邻分区加约束边 → 小分区在左).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.PARTITIONS)) {
    runModule('PartitionMidprocessor', hooks, graph, () => processPartitionMid(graph))
  }
  const layeringStrategy = graph.getProperty(LAYERING_STRATEGY)
  if (layeringStrategy === 'INTERACTIVE') {
    runModule('InteractiveLayerer', hooks, graph, () => processInteractiveLayering(graph, monitor))
  } else if (layeringStrategy === 'LONGEST_PATH_SOURCE') {
    runModule('LongestPathSourceLayerer', hooks, graph, () => new LongestPathSourceLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'LONGEST_PATH' || layeringStrategy === 'LONGEST_PATH_SINK') {
    runModule('LongestPathLayerer', hooks, graph, () => new LongestPathLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'COFFMAN_GRAHAM') {
    runModule('CoffmanGrahamLayerer', hooks, graph, () => new CoffmanGrahamLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'BF_MODEL_ORDER') {
    runModule('BreadthFirstModelOrderLayerer', hooks, graph, () => new BreadthFirstModelOrderLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'DF_MODEL_ORDER') {
    runModule('DepthFirstModelOrderLayerer', hooks, graph, () => new DepthFirstModelOrderLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'MIN_WIDTH') {
    runModule('MinWidthLayerer', hooks, graph, () => new MinWidthLayerer().process(graph, monitor))
  } else if (layeringStrategy === 'STRETCH_WIDTH') {
    runModule('StretchWidthLayerer', hooks, graph, () => new StretchWidthLayerer().process(graph, monitor))
  } else {
    runModule('NetworkSimplexLayerer', hooks, graph, () => new NetworkSimplexLayerer().process(graph, monitor))
  }

  hooks?.afterPhase?.('P2', graph)
  // 高连通节点树移动 (ELK HighDegreeNodeLayeringProcessor: P3 前, NodePromotion 之前; 把扇出/扇入树移到独立层).
  if (graph.getProperty(HIGH_DEGREE_NODES_TREATMENT)) {
    runModule('HighDegreeNodeLayeringProcessor', hooks, graph, () => processHighDegreeNodeLayering(graph))
  }

  // 节点提升 (ELK NodePromotion: P2 后 P3 前, 减少 dummy 节点).
  // 顺序对齐 Java IntermediateProcessorStrategy: NODE_PROMOTION(70) 在
  // LAYER_CONSTRAINT_POSTPROCESSOR(72) 之前 — NodePromotion 期间 E/W 外部端口 dummy
  // 仍被 LayerConstraintPreprocessor 隐藏 (提升不碰/不穿), LCPost 才恢复边界层.
  // (TS 之前顺序颠倒 → NodePromotion 撞上已恢复的 dummy → 无限提升死循环 + P3 边界层错乱.)
  if (graph.getProperty(LAYERING_NODE_PROMOTION_STRATEGY) !== 'NONE') {
    runModule('NodePromotion', hooks, graph, () => new NodePromotion().process(graph, monitor))
  }
  // 恢复 FIRST/LAST 与 hidden 节点 (ELK LayerConstraintPostprocessor: P3 前, NodePromotion 之后).
  runModule('LayerConstraintPostprocessor', hooks, graph, () => processLayerConstraintPost(graph))

  // 分区后处理器 (ELK PartitionPostprocessor: P3 前, NodePromotion/LCPost 之后, 移除 PARTITION_DUMMY 端口).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.PARTITIONS)) {
    runModule('PartitionPostprocessor', hooks, graph, () => processPartitionPost(graph))
  }

  // ELK 管线顺序: LongEdgeSplitter(5) → PortSideProcessor(6) — dummy 端口 side 需先拆分.
  // 断点插入 (ELK BreakingPointInserter: P3 前, MULTI_EDGE wrapping 时; LongEdgeSplitter 之前).
  if (graph.getProperty(WRAPPING_STRATEGY) === WrappingStrategy.MULTI_EDGE) {
    runModule('BreakingPointInserter', hooks, graph, () => processBreakingPointInsertion(graph))
  }
  runModule('LongEdgeSplitter', hooks, graph, () => processLongEdgeSplit(graph))
  runModule('PortSideProcessor', hooks, graph, () => processPortSides(graph))

  // 反向端口 dummy (ELK InvertedPortProcessor: P3 前置, 处理 EAST 输入口/WEST 输出口的边).
  // ★ 管线对齐 (2026-08-10): ELK 装配条件按路由类型 —
  //   Polyline/SplineEdgeRouter 的 BASELINE 无条件; OrthogonalEdgeRouter 在
  //   NON_FREE_PORTS || FEEDBACK_EDGES || HYPEREDGES (此前漏 HYPEREDGES 与 SPLINES/POLYLINE 无条件).
  //   处理器内部自判断 (无反向端口时为空操作), 无条件装配安全.
  const erRouting = graph.getProperty(EDGE_ROUTING)
  const needInvertedPort = erRouting === 'POLYLINE' || erRouting === 'SPLINES'
    || (erRouting === 'ORTHOGONAL' && (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)
      || graph.getProperty(FEEDBACK_EDGES) || graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.HYPEREDGES)))
  if (needInvertedPort) {
    runModule('InvertedPortProcessor', hooks, graph, () => processInvertedPorts(graph))
  }

  // 特殊自环形态 dummy (ELK DummySelfLoopProcessor: P3 前置, 与 InvertedPortProcessor 同槽).
  if (hasSelfLoops) {
    runModule('DummySelfLoopProcessor', hooks, graph, () => processDummySelfLoops(graph))
  }

  // 端口按约束排序 (ELK PortListSorter: P3 前置).
  runModule('PortListSorter', hooks, graph, () => processPortListSort(graph))

  // 层级端口约束 (ELK HierarchicalPortConstraintProcessor: OrthogonalEdgeRouter 在 EXTERNAL_PORTS 时 P3 前添加).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
    runModule('HierarchicalPortConstraintProcessor', hooks, graph, () => new HierarchicalPortConstraintProcessor().process(graph))
  }

  // semi-interactive 交叉最小化约束 (ELK SemiInteractiveCrossMinProcessor: P3 前置, POSITION.y 排序).
  if (graph.getProperty(CROSSING_MINIMIZATION_SEMI_INTERACTIVE)) {
    runModule('SemiInteractiveCrossMinProcessor', hooks, graph, () => processSemiInteractiveCrossMin(graph))
  }


  // ELK SortByInputModelProcessor: P3 前置 (CONSIDER_MODEL_ORDER_STRATEGY != NONE 时按输入顺序排序).
  // 顺序必须与 ELK 一致: SortByInputModel 在 NorthSouthPortPreprocessor 之前 (jar 实证 9-SortByInputModel → 10-NorthSouthPortPreprocessor),
  // 否则 NS dummy 先建后 comparator 看到的是 dummy 源端口, incoming=WEST 排序会反转.
  if (graph.getProperty(CONSIDER_MODEL_ORDER_STRATEGY) !== OrderingStrategy.NONE) {
    runModule('SortByInputModel', hooks, graph, () => sortByInputModelProcess(graph))
  }

  // NS 端口 dummy (ELK NorthSouthPortPreprocessor: P3 前置, 非自由端口且有 NS 端口时).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)
    && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NORTH_SOUTH_PORTS)) {
    runModule('NorthSouthPortPreprocessor', hooks, graph, () => processNorthSouthPorts(graph))
  }

  // P3 分发: NONE=NoCrossingMinimizer (保持 model order, 但 greedy switch 仍按 ELK 配置跑);
  // INTERACTIVE=InteractiveCrossingMinimizer; 默认 LAYER_SWEEP.
  const crossingMinStrategy = graph.getProperty(CROSSING_MINIMIZATION_STRATEGY)
  // ELK activateGreedySwitchFor: INTERACTIVE/semiInteractive 不跑 greedy switch (classes_two_* 回归修复).
  // ELK GraphConfigurator.activateGreedySwitchFor 已在 doSimpleLayout split 前计算 (根图节点数),
  // 分量图继承该标记; GGN_GREEDY_OFF 仍可调试关闭.
  const runGreedy = !process.env.GGN_GREEDY_OFF && graph.getProperty(GREEDY_SWITCH_ACTIVE)
  if (crossingMinStrategy === 'INTERACTIVE') {
    runModule('InteractiveCrossingMinimizer', hooks, graph, () => new InteractiveCrossingMinimizer().process(graph))
    hooks?.afterPhase?.('P3', graph)
  } else if (crossingMinStrategy === 'MEDIAN_LAYER_SWEEP') {
    runModule('LayerSweepCrossingMinimizer', hooks, graph, () => new LayerSweepCrossingMinimizer(CrossMinType.MEDIAN).process(graph, monitor))
    hooks?.afterPhase?.('P3', graph)
  } else if (crossingMinStrategy !== 'NONE') {
    runModule('LayerSweepCrossingMinimizer', hooks, graph, () => new LayerSweepCrossingMinimizer(CrossMinType.BARYCENTER).process(graph, monitor))
    hooks?.afterPhase?.('P3', graph)
  }
  // 断点处理 (ELK BreakingPointProcessor: P4 前, MULTI_EDGE wrapping 时; greedy switch 之前).
  if (graph.getProperty(WRAPPING_STRATEGY) === WrappingStrategy.MULTI_EDGE) {
    runModule('BreakingPointProcessor', hooks, graph, () => processBreakingPoints(graph))
  }
  // ELK 默认在 P4 前追加第二遍 TWO_SIDED_GREEDY_SWITCH (NONE 策略也跑; 调试 GGN_GREEDY_OFF 可关).
  if (runGreedy) {
    runModule('GreedySwitchHeuristic', hooks, graph, () => new LayerSweepCrossingMinimizer(CrossMinType.TWO_SIDED_GREEDY_SWITCH).process(graph, monitor))
    hooks?.afterPhase?.('GreedySwitch', graph)
  }
  // 预计算间距 (ELK GraphConfigurator).
  graph.setProperty(SPACINGS, new Spacings(graph))

  // 自环端口恢复 (ELK SelfLoopPortRestorer: P4 前, 恢复隐藏端口 + 计算自环类型).
  if (hasSelfLoops) {
    runModule('SelfLoopPortRestorer', hooks, graph, () => new SelfLoopPortRestorer().process(graph))
  }

  // 层内 TOP/BOTTOM 约束 (ELK InLayerConstraintProcessor: P4 前, 外部端口 dummy 定位).

  runModule('InLayerConstraintProcessor', hooks, graph, () => processInLayerConstraints(graph))

  // 端口放置 (ELK LabelAndNodeSizeProcessor: P4 前端口位置分布).
  runModule('LabelAndNodeSizeProcessor', hooks, graph, () => processLabelAndNodeSize(graph))

  // 节点 margin (端口/label 外扩空间, ELK InnermostNodeMarginCalculator).
  runModule('NodeMarginCalculator', hooks, graph, () => calculateNodeMargins(graph))
  // comment margin (ELK CommentNodeMarginCalculator: InnermostNodeMarginCalculator 之后累加 —
  // 顺序反了会被 Innermost 重置, comment_boxes margin.top=40 丢失实证).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) {
    runModule('CommentNodeMarginCalculator', hooks, graph, () => processCommentNodeMargins(graph))
  }

  // 端标签 (HEAD/TAIL) 收集 → LabelCell 布局 → 节点 margin 扩展 (ELK EndLabelPreprocessor: P4 前,
  // 仅 END_LABELS 图属性时由 P5 路由器注册; enum 序在 InnermostNodeMarginCalculator 之后).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.END_LABELS)) {
    runModule('EndLabelPreprocessor', hooks, graph, () => processEndLabelPreprocessing(graph))
  }

  // 长边中心标签 dummy 交换到最优层 (ELK LabelDummySwitcher: P4 前 — SplineEdgeRouter L108/
  // OrthogonalEdgeRouter L158/PolylineEdgeRouter L141 的 CENTER_EDGE_LABEL_PROCESSING_ADDITIONS 在
  // CENTER_LABELS 时注册; 运行在 P3 crossing minimization 之后, 交换保持层内节点顺序,
  // END_LABEL_PREPROCESSOR 之后、LABEL_SIDE_SELECTOR 之前).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.CENTER_LABELS)) {
    runModule('LabelDummySwitcher', hooks, graph, () => processLabelDummySwitch(graph))
  }

  // 边标签侧选择 (ELK LabelSideSelector: EndLabelPreprocessor 后, 决定 CENTER 标签 ABOVE/BELOW,
  // 写入 LABEL dummy 的 LABEL_SIDE; END_LABELS 或 CENTER_LABELS 时运行).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.END_LABELS) || graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.CENTER_LABELS)) {
    runModule('LabelSideSelector', hooks, graph, () => processLabelSideSelection(graph))
  }

  // 超边 dummy 合并 (ELK HyperedgeDummyMerger: P4 前, 同源/同 target 的 LONG_EDGE dummy 合并).
  // 仅 ORTHOGONAL 路由运行 — ELK 只在 OrthogonalEdgeRouter 的处理器配置里注册
  // (OrthogonalEdgeRouter.java line 117); SplineEdgeRouter 的 BASELINE 配置不包含它,
  // SPLINES 图合并 dummy 会改变层结构 → BK 垂直坐标偏离 jar.
  // ★ 必须在 LabelDummySwitcher/LabelSideSelector 之后: switcher 设置 LONG_EDGE_BEFORE_LABEL_DUMMY
  //   (ELK L609-643), merger 依此判定「标签分支前的长边 dummy 可合并」; 顺序反了 → 带标签超边
  //   不共享 trunk → label detour 弯点缺失 (hyperedge_labels 实证).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.HYPEREDGES)
    && graph.getProperty(EDGE_ROUTING) !== 'SPLINES') {
    runModule('HyperedgeDummyMerger', hooks, graph, () => new HyperedgeDummyMerger().process(graph))
  }

  // 层级端口 dummy 尺寸 (ELK HierarchicalPortDummySizeProcessor: P4 前, NS 外部端口宽度).
  runModule('HierarchicalPortDummySizeProcessor', hooks, graph, () => processHierarchicalPortDummySize(graph))

  // 自环路由 (ELK SelfLoopRouter: 父图 BK 前, RoutingDirector→LabelPlacer→SlotAssigner→路由, 扩展 margin).
  if (hasSelfLoops) {
    runModule('SelfLoopRouter', hooks, graph, () => processSelfLoopRouter(graph))
  }

  // 层拆 (ELK AlternatingLayerUnzipper: P4 前, LAYER_UNZIPPING_STRATEGY=ALTERNATING 时).
  if (graph.getProperty(LAYER_UNZIPPING_STRATEGY) === 'ALTERNATING') {
    runModule('AlternatingLayerUnzipper', hooks, graph, () => alternatingLayerUnzip(graph))
  }
  // P4 分发: SIMPLE → SimpleNodePlacer; INTERACTIVE → InteractiveNodePlacer;
  // NETWORK_SIMPLEX → NetworkSimplexPlacer; 其余非 BK 显式降级.
  const npStrategy = graph.getProperty(NODE_PLACEMENT_STRATEGY)
  if (npStrategy === NodePlacementStrategy.SIMPLE) {
    runModule('SimpleNodePlacer', hooks, graph, () => processSimpleNodePlace(graph))
  } else if (npStrategy === NodePlacementStrategy.INTERACTIVE) {
    runModule('InteractiveNodePlacer', hooks, graph, () => processInteractiveNodePlace(graph))
  } else if (npStrategy === NodePlacementStrategy.NETWORK_SIMPLEX) {
    runModule('NetworkSimplexPlacer', hooks, graph, () => new NetworkSimplexPlacer().process(graph))
  } else if (npStrategy === NodePlacementStrategy.LINEAR_SEGMENTS) {
    runModule('LinearSegmentsNodePlacer', hooks, graph, () => processLinearSegmentsNodePlace(graph))
  } else {
    if (npStrategy !== NodePlacementStrategy.BRANDES_KOEPF) {
      warnUnsupported('nodePlacement.strategy', String(npStrategy), 'BRANDES_KOEPF')
    }
    runModule('BKNodePlacer', hooks, graph, () => new BKNodePlacer().process(graph))
  }
  hooks?.afterPhase?.('BK', graph)

  // 第二遍节点放置 (ELK NodePlacementRepeater: P4 后, 弹性节点 + RECOMPUTE 选项时).
  if (graph.getLayerlessNodes().length > 0 && graph.hasProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT)) {
    runModule('NodePlacementRepeater', hooks, graph, () => processNodePlacementRepeat(graph))
  }

  runModule('LayerSizeAndGraphHeightCalculator', hooks, graph, () => new LayerSizeAndGraphHeightCalculator().process(graph))
  // 层级端口位置 (ELK HierarchicalPortPositionProcessor: 节点放置器在 EXTERNAL_PORTS 时 P5 前添加).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) {
    runModule('HierarchicalPortPositionProcessor', hooks, graph, () => processHierarchicalPortPosition(graph))
  }
  // P5 分发: POLYLINE → PolylineEdgeRouter; SPLINES → SplineEdgeRouter (层间距含 SLOPPY, 弯点待补);
  // 其余 → OrthogonalEdgeRouter (ELK SplineEdgeRouter 不再降级).
  const er = graph.getProperty(EDGE_ROUTING)
  if (er === 'POLYLINE') {
    runModule('PolylineEdgeRouter', hooks, graph, () => new PolylineEdgeRouter().process(graph))
  } else if (er === 'SPLINES') {
    runModule('SplineEdgeRouter', hooks, graph, () => new SplineEdgeRouter().process(graph))
  } else {
    if (er !== 'ORTHOGONAL' && er !== undefined && er !== null) {
      warnUnsupported('edgeRouting', String(er), 'ORTHOGONAL')
    }
    runModule('OrthogonalEdgeRouter', hooks, graph, () => new OrthogonalEdgeRouter().process(graph))
  }
    hooks?.afterPhase?.('P5', graph)
  // 节点 layerId/positionId 输出 (ELK ConstraintsPostprocessor: P5 后, interactiveLayout / generatePositionAndLayerIds 时).
  if (graph.getProperty(INTERACTIVE_LAYOUT) || graph.getProperty(GENERATE_POSITION_AND_LAYER_IDS)) {
    runModule('ConstraintsPostprocessor', hooks, graph, () => processConstraintsPost(graph))
  }
  // 超节点移动 (ELK HypernodesProcessor: P5 后, HYPERNODES 图属性时 — OrthogonalEdgeRouter 注册).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.HYPERNODES)) {
    runModule('HypernodesProcessor', hooks, graph, () => processHypernodes(graph))
  }
  // ELK 管线顺序 (slot 17-22 实测): P5 → LongEdgeJoiner → NorthSouthPortPostprocessor →
  // HorizontalGraphCompactor → LabelDummyRemover → EndLabelSorter → ReversedEdgeRestorer.
  runModule('LongEdgeJoiner', hooks, graph, () => processLongEdgeJoin(graph))
  // 自环恢复 (ELK SelfLoopPostprocessor: After phase 5 槽位按 IntermediateProcessorStrategy 枚举序
  // SELF_LOOP_POSTPROCESSOR < NORTH_SOUTH_PORT_POSTPROCESSOR < HORIZONTAL_COMPACTOR <
  // LABEL_DUMMY_REMOVER < FINAL_SPLINE_BENDPOINTS_CALCULATOR) — 必须在 LongEdgeJoiner 之后、
  // 压缩器与 FinalSplineBendpointsCalculator 之前: (1) 自环边先挂回端口, FSBC 的 sloppy 中心 Y 度差
  // 才计入自环 (selfloop_crash Nn4->Nn5 b232,126.55 实证; 否则 b232,158.95); (2) 压缩器
  // LGraphToCGraphTransformer SPLINES 分支按源节点压缩位移偏移自环弯点; (3) 在 ReversedEdgeRestorer
  // 之前, 否则 reverser 反转的自环 (REVERSED=true) 恢复时方向无法还原 (insideSelfLoops EAST→WEST 差 6).
  if (hasSelfLoops) {
    runModule('SelfLoopPostprocessor', hooks, graph, () => processSelfLoopPost(graph))
  }
  // 断点移除 (ELK BreakingPointRemover: P5 后, LongEdgeJoiner/SelfLoopPost 之后, NS 后置之前).
  if (graph.getProperty(WRAPPING_STRATEGY) === WrappingStrategy.MULTI_EDGE) {
    runModule('BreakingPointRemover', hooks, graph, () => processBreakingPointRemoval(graph))
  }
  // NS dummy 移除 + 边恢复 (ELK NorthSouthPortPostprocessor: P5 后、LongEdgeJoiner 后).
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)
    && graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NORTH_SOUTH_PORTS)) {
    runModule('NorthSouthPortPostprocessor', hooks, graph, () => processNorthSouthPortPost(graph))
  }
  // ★ HORIZONTAL_COMPACTOR (ELK GraphConfigurator: postCompaction != NONE && edgeRouting != POLYLINE;
  //  同槽依赖: 在 LabelDummyRemover 之前 (labels 参与压缩)、ReversedEdgeRestorer 之前.
  //  NS dummy 必须先合并回真实节点, 否则压缩器看不到 N-S 边 (south_port 实证).
  const postCompactionStrategy = graph.getProperty(COMPACTION_POST_COMPACTION_STRATEGY)
  if (postCompactionStrategy !== 'NONE' && graph.getProperty(EDGE_ROUTING) !== 'POLYLINE') {
    runModule('HorizontalGraphCompactor', hooks, graph, () => new HorizontalGraphCompactor().process(graph))
  }
  // CENTER 边标签 dummy 移除 + 标签放置 (ELK LabelDummyRemover: P5 后、压缩器之后).
  runModule('LabelDummyRemover', hooks, graph, () => processLabelDummyRemoval(graph))
  // ELK 槽位 (After Phase 5 序): LONG_EDGE_JOINER < NS_PORT_POSTPROCESSOR < HORIZONTAL_COMPACTOR <
  // LABEL_DUMMY_REMOVER < FINAL_SPLINE_BENDPOINTS_CALCULATOR. 必须在压缩器之后 (压缩器读
  // SPLINE_ROUTE_START 收集 spline 垂直段并回写 segment bbox, 计算器用压缩后的 bbox/节点位置),
  // 在 NSPost 之后 (NSPost 设 SPLINE_NS_PORT_Y_COORD, 计算器读它算 NS 弯点).
  if (er === 'SPLINES') {
    runModule('FinalSplineBendpointsCalculator', hooks, graph, () => processFinalSplineBendpoints(graph))
  }
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) {
    runModule('CommentPostprocessor', hooks, graph, () => processCommentPost(graph))
  }
  runModule('EndLabelSorter', hooks, graph, () => processEndLabelSort(graph))
  runModule('ReversedEdgeRestorer', hooks, graph, () => processReversedEdges(graph))
  if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.END_LABELS)) {
    runModule('EndLabelPostprocessor', hooks, graph, () => processEndLabelPostprocessing(graph))
  }

  // ELK DIRECTION_POSTPROCESSOR (GraphTransformer TO_INTERNAL_LTR): P5 后把内部 LTR 结果变换回原方向.
  runModule('GraphTransformer(out)', hooks, graph, () => new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(graph))
  // 仅非 RIGHT 方向 (真发生了变换) 才重算 margin — RIGHT 重算会清掉自环/comment margin
  // (inside_outside 实证: 自环 margin 在 BK 前由 SelfLoopRouter 扩展, 重算后丢 → 自环位置差 10).
  const marginRecalcDir = graph.getProperty(DIRECTION)
  if (marginRecalcDir !== Direction.RIGHT && marginRecalcDir !== Direction.UNDEFINED) {
    for (const layer of graph.getLayers()) {
      for (const node of layer.getNodes()) {
        calculateNodeMargin(node)
        // 保留 comment margin (ELK CommentNodeMarginCalculator 在 P4 前加, 方向变换后不丢 —
        // 否则分量尺寸缺 comment 空间 → combine 不预留 → 节点/comment 重叠).
        if (graph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.COMMENTS)) addCommentMarginToNode(node)
      }
    }
  }

  // ElkGraphLayoutTransferrer 等价: 坐标 + offset + padding.
  // 分量布局时跳过 (combine 后对整图统一加一次, 避免 padding 叠加).
  if (applyOffsetPadding) {
    const offset = graph.getOffset()
    const padding = graph.getPadding()
    const dx = offset.x + padding.left
    const dy = offset.y + padding.top
    // 边弯点与节点同步平移 (P5 路由用平移前坐标, 否则弯点错位); seen 跨节点共享防双移.
    const seenEdges = new Set<object>()
    for (const node of graph.getAllNodes()) {
      // ELK ElkGraphLayoutTransferrer.applyLayout: EXTERNAL_PORT dummy 不随 offset+padding 平移
      // (representsExternalPort && parentLNode==null → 只经 getExternalPortPosition 定端口位置;
      // 平移会让 dummy.y=pad.top → getExternalPortPosition 再加一次 pad.top → 自环槽位 y 差 12,
      // insideSelfLoops 普通自环 4 弯点 y=50 vs jar 38).
      if (node.getType() === NodeType.EXTERNAL_PORT) continue
      node.position.x += dx
      node.position.y += dy
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          if (seenEdges.has(edge)) continue
          seenEdges.add(edge)
          for (const bp of edge.getBendPoints()) {
            bp.x += dx
            bp.y += dy
          }
        }
      }
    }
  }

  hooks?.afterPhase?.('done', graph)
}

/** 层级外部端口正交路由 (N-S 三件套) 默认启用; GGN_HIER_ORTHO=0 可显式关闭 (调试/回归对比). */
const HIER_ORTHO_ENABLED = process.env.GGN_HIER_ORTHO !== '0'

/** ELK ElkGraphImporter.calculateMinimumGraphSize: 容器节点 cell 尺寸 → 嵌套图 nodeSize.minimum.
 * 布局前计算 (PORTS/PORT_LABELS/NODE_LABELS/MINIMUM_SIZE 贡献), 写入 nested minimum + 补 MINIMUM_SIZE
 * 约束; HierarchicalNodeResizingProcessor.resizeGraph 用 max(actualSize, minSize) 保住 cell 尺寸
 * (316 实证: 父端口高 430 经 minimum 传递, 宽 224 来自 nested 内容). */
function applyNestedGraphMinimumSizes(root: LGraph): void {
  for (const graph of collectAllGraphsBottomUp(root)) {
    for (const node of graph.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested === null) continue
      const constraints = node.getProperty(NODE_SIZE_CONSTRAINTS)
      if (!constraints || constraints.length === 0) continue
      // ELK 导入期 ensureDefinedPortSide: FREE 端口按 netFlow 定侧 (无边 → 0 → WEST/RIGHT 的 opposed),
      // 必须先于 cell 尺寸统计 (316 端口 UNDEFINED → cellH=0 实证).
      const pc = node.getProperty(PORT_CONSTRAINTS)
      if (!PortConstraints.isSideFixed(pc)) {
        // ELK Java 导入期 ensureDefinedPortSide：FREE 端口按 netFlow 定侧但**方向感知**
        //（javap ElkGraphImporter 实证：PortSide.fromDirection(direction) + calcPortSide(port,
        // direction)）。此前 ggn 恒定 EAST/WEST（LTR 语义）→ DOWN/UP 下 FREE 端口侧错误 →
        // computeCellSystemSize 的 PORT_LABELS 贡献方向错（304 DOWN min=(60,100) vs ELK Java
        // (100,60)，2026-08-16 审阅 P1-1 实证）。setPortSide 加 direction 参数（默认 RIGHT 兼容）。
        const initDir = graph.getProperty(DIRECTION) === Direction.UNDEFINED ? Direction.RIGHT : graph.getProperty(DIRECTION)
        for (const port of node.getPorts()) {
          if (port.getSide() === PortSide.UNDEFINED) setPortSide(port, false, initDir)
        }
      }
      const cell = computeCellSystemSize(node, graph, true) ?? { x: node.size.x, y: node.size.y }
      // ELK calculateMinimumGraphSize: configuredMinSize = max(minSize, configuredMinSize),
      // configuredMinSize 在 import 期已初始化为节点显式 nodeSize.minimum (content_centered 900x400).
      const curMin = nested.getProperty(NODE_SIZE_MINIMUM) ?? { x: 0, y: 0 }
      const nodeMin = node.getProperty(NODE_SIZE_MINIMUM) ?? { x: 0, y: 0 }
      const merged = { x: Math.max(curMin.x, nodeMin.x), y: Math.max(curMin.y, nodeMin.y) }
      nested.setProperty(NODE_SIZE_MINIMUM, { x: Math.max(merged.x, cell.x), y: Math.max(merged.y, cell.y) })
      if (process.env.GGN_CELL_DBG) console.error(`[CELL] ${node.id} lbl=${node.getLabels().map(l => String(l.text).slice(0, 25)).join('|')} constraints=${JSON.stringify(constraints)} ports=${node.getPorts().map(p => p.id + '@' + p.getSide()).join(',')} cell=${cell.x},${cell.y} merged=${JSON.stringify(merged)} sizeOpts=${JSON.stringify(node.hasProperty(NODE_SIZE_OPTIONS) ? node.getProperty(NODE_SIZE_OPTIONS) : 'unset')}`)
      const nc = nested.getProperty(NODE_SIZE_CONSTRAINTS)
      if (!nc.includes('MINIMUM_SIZE')) nested.setProperty(NODE_SIZE_CONSTRAINTS, [...nc, 'MINIMUM_SIZE'])
    }
  }
}

/** 节点/图是否用 fixed 布局 (ELK CoreOptions.ALGORITHM='fixed' → FixedLayoutProvider: 保持输入位置).
 * 475 实证: compound 节点 algorithm:fixed → 子图不跑 layered, 节点保持 (0,0); 根图仍用 layered. */
function isFixedAlgorithm(holder: { getProperty<T>(p: unknown): T }): boolean {
  return holder.getProperty<string>('org.eclipse.elk.algorithm') === 'fixed'
}

/** 嵌套图是否 fixed (algorithm 设在容器节点上; ELK createLGraph.copyProperties 传给嵌套图). */
function isFixedNestedGraph(graph: LGraph): boolean {
  const parent = graph.getParentNode()
  if (parent === null) return false
  return parent.getProperty<string>('org.eclipse.elk.algorithm') === 'fixed'
}

/** ELK LayoutAlgorithmHandler: 校验算法选项 — ELK 0.12.0 未打包的算法 (mrtree/radial 等) 抛错复刻 jar 行为.
 * box/fixed/layered 等 jar 支持的算法不抛 (ggn 用 layered 布局, 简单图与 jar 巧合一致).
 * stress/force (R09) / rectpacking 已移植 → 不再抛错. */
function checkAlgorithmSupported(root: LGraph): void {
  // ELK 0.12.0 未注册的算法 (jar 抛 UnsupportedConfigurationException) — 语料实测集合.
  const UNSUPPORTED = new Set<string>()
  const algoKey = 'org.eclipse.elk.algorithm'
  const check = (node: LNode): void => {
    const algo = node.getProperty<string>(algoKey)
    if (algo && UNSUPPORTED.has(algo)) {
      throw new Error(`Layout algorithm '${algo}' not found`)
    }
    const nested = node.getNestedGraph()
    if (nested !== null) {
      for (const c of nested.getLayerlessNodes()) check(c)
    }
  }
  // 根图算法不校验: BatchMain/RecursiveGraphLayoutEngine 强制根用 layered (oneBigNode 根 rectpacking 照常布局);
  // 只有嵌套节点上的未支持算法抛错 (hierarchicalLayoutMixing/588/665/rectpacking_hierarchy 实证).
  for (const n of root.getLayerlessNodes()) check(n)
}

export class LayeredLayoutProvider {
  private hooks?: LayoutPhaseHooks

  /** 注入阶段钩子 (探针调试用). */
  setHooks(hooks: LayoutPhaseHooks): void {
    this.hooks = hooks
  }

  layout(graph: LGraph, monitor?: IElkProgressMonitor): void {
    const progressMonitor = monitor ?? new NullProgressMonitor()
    // ELK LayoutAlgorithmHandler: 遇到不支持的算法 (rectpacking/stress 等) 抛 UnsupportedConfigurationException.
    checkAlgorithmSupported(graph)
    // ElkGraphImporter 等价: 布局前按需赋 MODEL_ORDER (节点/边), 供 model-order 相关策略使用.
    assignModelOrdersRecursive(graph)
    // ElkGraphImporter 等价: activate + yo 自环的节点补嵌套图 (无子节点也成 compound),
    // 使 parentNodes 检测进入 compound 路径 (ELK importHierarchicalGraph hasInsideSelfLoops).
    prepareInsideSelfLoopsRecursive(graph)
    // ELK 导入期定侧 (importer ensureDefinedPortSide) 必须在 calculateMinimumGraphSize 之前
    // (cell 尺寸按端口侧统计; 316 端口 UNDEFINED → 侧未定则 cellH=0).
    // 嵌套方向必须**先于** initializeAllPortSides / applyNestedGraphMinimumSizes 传播——
    // 深层 nested graph 的 DIRECTION 在 build 后仍为 UNDEFINED（root 的直接子图由 layout 前
    // graphProps 携带方向；第二层及更深需递归继承父图方向，2026-08-16 审阅 Kepler P1 实证：
    // 两层嵌套 + FREE port 下 GGN 内层 54×60 vs ELK Java 54×54）。此前 propagateNestedDirections
    // 只在 doCompoundLayout 内调用，晚于 applyNestedGraphMinimumSizes → 深层端口定侧回落 RIGHT 错。
    propagateNestedDirections(graph)
    initializeAllPortSides(graph)
    // ELK ElkGraphImporter.calculateMinimumGraphSize: 容器 cell 尺寸 → nested minimum (P4 前).
    applyNestedGraphMinimumSizes(graph)
    // ELK GraphConfigurator: comment box 检测 → COMMENTS 图属性.
    if (detectComments(graph)) graph.getProperty(GRAPH_PROPERTIES).add(GraphProperties.COMMENTS)
    const parentNodes = graph.getLayerlessNodes().filter(n => n.getNestedGraph() !== null)

    if (parentNodes.length > 0) {
      doCompoundLayout(graph, progressMonitor, this.hooks)
    } else {
      doSimpleLayout(graph, progressMonitor, this.hooks)
    }
    // 布局完成: 节点标签按最终方向/尺寸水平居中重放 (ELK cell-system 默认 H_CENTER;
    // 方向转置 (DOWN/UP) 后内部帧放置的标签位置需按最终尺寸重算 — Issue476).
    recenterNodeLabelsRecursive(graph)
    // B16e: NODE_LABELS 约束叶子节点 cell/尺寸分离收尾 — 全 0 尺寸标签时 ELK 节点 = 0×0
    // (标签盒), 但布局占位 cell = 标签盒 + NODE_LABELS_PADDING (insideNodeLabels_01 实证:
    // NN 0×0 于 (17,17), 图 34×34 = cell 10×10 + padding 24). ggn 布局时用 cell 尺寸,
    // 收尾恢复节点尺寸 = 标签盒并把节点居中于 cell.
    collapseZeroLabelCells(graph)
  }
}

/** 递归: 0 尺寸标签的 NODE_LABELS 约束叶子节点 → 节点尺寸收缩到标签盒, 居中于原 cell. */
function collapseZeroLabelCells(g: LGraph): void {
  for (const n of g.getAllNodes()) {
    if (n.getNestedGraph() !== null) collapseZeroLabelCells(n.getNestedGraph()!)
    const constraints = n.hasProperty(NODE_SIZE_CONSTRAINTS)
      ? n.getProperty(NODE_SIZE_CONSTRAINTS)
      : n.getGraph()?.getProperty(NODE_SIZE_CONSTRAINTS) ?? []
    if (!constraints.includes('NODE_LABELS')) continue
    // 有 PORTS/PORT_LABELS 约束时 cell 由端口/端口标签占位决定, 节点不收缩 (inside_port_labels 实证).
    if (constraints.includes('PORTS') || constraints.includes('PORT_LABELS')) continue
    // 有 MINIMUM_SIZE 约束时节点尺寸由 minimum (默认 20×20) 决定, 不收缩 (hierarchy01 Workflow 实证).
    if (constraints.includes('MINIMUM_SIZE')) continue
    if (n.getNestedGraph() !== null) continue
    const labels = n.getLabels()
    if (labels.length === 0) continue
    let maxW = 0, maxH = 0
    for (const l of labels) {
      maxW = Math.max(maxW, l.size.x)
      maxH = Math.max(maxH, l.size.y)
    }
    if (maxW > 0 || maxH > 0) continue
    if (n.size.x === 0 && n.size.y === 0) continue
    const cell = { x: n.size.x, y: n.size.y }
    n.size.x = 0
    n.size.y = 0
    n.position.x += cell.x / 2
    n.position.y += cell.y / 2
    // 标签 position 相对节点原点; 节点收缩后标签应在节点原点 (ELK 0 尺寸标签于 (0,0)).
    for (const l of labels) {
      l.position.x = 0
      l.position.y = 0
    }
  }
}

/** 递归重放节点标签: INSIDE 按 H placement 水平对齐 (H_CENTER 居中, H_LEFT/RIGHT 靠边);
 * OUTSIDE 按 ELK NodeLabelLocation 放节点外 (H_PRIORITY → WEST/EAST, 否则 NORTH/SOUTH),
 * 方向变换回后按最终尺寸重算. placement 回退节点属性 (nodeLabelPlacement 实证). */
function recenterNodeLabelsRecursive(g: LGraph): void {
  for (const n of g.getAllNodes()) {
    if (n.getNestedGraph() !== null) recenterNodeLabelsRecursive(n.getNestedGraph()!)
    // Issue682: H_CENTER 居中于内容区 (size - NODE_LABELS_PADDING 左右), 否则布局后覆盖掉 padding 偏移.
    const pad = n.hasProperty(NODE_LABELS_PADDING)
      ? n.getProperty(NODE_LABELS_PADDING)
      : n.getGraph()?.getProperty(NODE_LABELS_PADDING) ?? { left: 0, right: 0, top: 0, bottom: 0 }
    const pl = pad.left ?? 0
    const pr = pad.right ?? 0
    const labelNode = labelNodeSpacing(n)
    for (const label of n.getLabels()) {
      const raw = (label as { placement?: string }).placement ?? n.getProperty(NODE_LABELS_PLACEMENT) ?? ''
      const p = Array.isArray(raw) ? raw : String(raw).split(/[\s,]+/).filter(Boolean)
      if (p.includes('OUTSIDE')) {
        const hPri = p.includes('H_PRIORITY')
        const hasH = p.includes('H_LEFT') || p.includes('H_RIGHT')
        const hSide = (hPri && hasH) || (!hPri && p.includes('V_CENTER') && hasH)
        if (hSide) {
          if (p.includes('H_RIGHT')) label.position.x = n.size.x + labelNode
          else label.position.x = -label.size.x - labelNode
          if (p.includes('V_BOTTOM')) label.position.y = n.size.y - label.size.y
          else if (p.includes('V_CENTER')) label.position.y = (n.size.y - label.size.y) / 2
          else label.position.y = 0
        } else {
          if (p.includes('V_BOTTOM')) label.position.y = n.size.y + labelNode
          else label.position.y = -label.size.y - labelNode
          if (p.includes('H_RIGHT')) label.position.x = n.size.x - label.size.x
          else if (p.includes('H_LEFT')) label.position.x = 0
          else label.position.x = (n.size.x - label.size.x) / 2
        }
        continue
      }
      if (p.includes('H_LEFT')) label.position.x = pl
      else if (p.includes('H_RIGHT')) label.position.x = n.size.x - label.size.x - pr
      else label.position.x = pl + (n.size.x - pl - pr - label.size.x) / 2
    }
  }
}
