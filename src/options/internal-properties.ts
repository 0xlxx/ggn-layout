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
 * InternalProperties (对应 ELK org.eclipse.elk.alg.layered.options.InternalProperties).
 */
import { Property } from '../graph/properties.js'
import { PortSide } from '../graph/enums.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import type { JavaRandom } from '../util/java-random.js'
import type { CrossHierarchyEdge } from '../compound/cross-hierarchy-edge.js'

export enum GraphProperties {
  EXTERNAL_PORTS = 'EXTERNAL_PORTS',
  NON_FREE_PORTS = 'NON_FREE_PORTS',
  NORTH_SOUTH_PORTS = 'NORTH_SOUTH_PORTS',
  SELF_LOOPS = 'SELF_LOOPS',
  CENTER_LABELS = 'CENTER_LABELS',
  HYPEREDGES = 'HYPEREDGES',
  END_LABELS = 'END_LABELS',
  COMMENTS = 'COMMENTS',
  PARTITIONS = 'PARTITIONS',
  HYPERNODES = 'HYPERNODES',
}

/** 元素来源 (端口 dummy → 真实端口; 真实端口 → 其 dummy; 标签 → 原边). */
export const ORIGIN = new Property<LPort | LEdge | object>('org.eclipse.elk.layered.internal.origin')

/** 节点上方/下方的 comment box 节点列表 (ELK TOP_COMMENTS/BOTTOM_COMMENTS). */
export const TOP_COMMENTS = new Property<LNode[]>('org.eclipse.elk.layered.internal.topComments')
export const BOTTOM_COMMENTS = new Property<LNode[]>('org.eclipse.elk.layered.internal.bottomComments')
/** comment box 连接的真实节点端口 (ELK COMMENT_CONN_PORT). */
export const COMMENT_CONN_PORT = new Property<LPort>('org.eclipse.elk.layered.internal.commentConnPort')

/** 外部端口 dummy 代表的端口侧. */
export const EXT_PORT_SIDE = new Property<PortSide>('org.eclipse.elk.layered.internal.extPortSide', PortSide.UNDEFINED)

/** 外部端口原尺寸. */
export const EXT_PORT_SIZE = new Property<{ x: number; y: number }>('org.eclipse.elk.layered.internal.extPortSize')

/** 端口对应的 dummy 节点. */
export const PORT_DUMMY = new Property<LNode>('org.eclipse.elk.layered.internal.portDummy')

/** 端口是否连接内部 (复合端口). */
export const INSIDE_CONNECTIONS = new Property<boolean>('org.eclipse.elk.layered.internal.insideConnections', false)

/** 外部端口 dummy 的固定位置/比例. */
export const PORT_RATIO_OR_POSITION = new Property<number>('org.eclipse.elk.layered.internal.portRatioOrPosition', 0)

/** 原边 → 段集合 (顶层图). */
export const CROSS_HIERARCHY_MAP = new Property<Map<LEdge, CrossHierarchyEdge[]>>('org.eclipse.elk.layered.internal.crossHierarchyMap')

/** 随机数生成器. */
export const SPLINE_ROUTE_START = new Property<import('../p5edges/splines/spline-segment.js').SplineSegment[] | null>('org.eclipse.elk.layered.internal.splineRouteStart', null)
export const SPLINE_EDGE_CHAIN = new Property<import('../graph/ledge.js').LEdge[] | null>('org.eclipse.elk.layered.internal.splineEdgeChain', null)
/** 最终弯点归属边 (wrapping remover 显式指定, 对应 ELK SPLINE_SURVIVING_EDGE). */
export const SPLINE_SURVIVING_EDGE = new Property<import('../graph/ledge.js').LEdge | null>('org.eclipse.elk.layered.internal.splineSurvivingEdge', null)
export const SPLINE_NS_PORT_Y_COORD = new Property<number | null>('org.eclipse.elk.layered.internal.splineNsPortYCoord', null)
export const RANDOM = new Property<JavaRandom>('org.eclipse.elk.layered.internal.random')
/** GreedySwitch 激活标记 (ELK GraphConfigurator.activateGreedySwitchFor, 根图 split 前计算; 分量 copyProperties 继承). */
export const GREEDY_SWITCH_ACTIVE = new Property<boolean>('org.eclipse.elk.layered.internal.greedySwitchActive', false)

/** 图是否有环 (P1 反转边后置 true). */
export const REVERSED = new Property<boolean>('org.eclipse.elk.layered.internal.reversed', false)
export const CYCLIC = new Property<boolean>('org.eclipse.elk.layered.internal.cyclic', false)

/** 断点信息 (wrapping, 对应 ELK BREAKING_POINT_INFO; start/end 两个 dummy 共享同一 BPInfo). */
export const BREAKING_POINT_INFO = new Property<import('../intermediate/wrapping/bp-info.js').BPInfo | null>('org.eclipse.elk.layered.internal.breakingPointInfo', null)

/** 分区约束边/端口 (ELK PARTITION_DUMMY). */
export const PARTITION_DUMMY = new Property<boolean>('org.eclipse.elk.layered.internal.partitionDummy', false)

/** 收集端口标记. */
export const INPUT_COLLECT = new Property<boolean>('org.eclipse.elk.layered.internal.inputCollect', false)
export const OUTPUT_COLLECT = new Property<boolean>('org.eclipse.elk.layered.internal.outputCollect', false)

/** 隐藏的节点 (LayerConstraintPreprocessor). */
export const HIDDEN_NODES = new Property<LNode[]>('org.eclipse.elk.layered.internal.hiddenNodes')

/** 隐藏时断开的对端端口. */
export const ORIGINAL_OPPOSITE_PORT = new Property<LPort>('org.eclipse.elk.layered.internal.originalOppositePort')

/** 标签原属的跨层级边. */
export const ORIGINAL_LABEL_EDGE = new Property<LEdge>('org.eclipse.elk.layered.internal.originalLabelEdge')

/** 连通分量连接到的外部端口侧集合. */
export const EXT_PORT_CONNECTIONS = new Property<Set<PortSide>>('org.eclipse.elk.layered.internal.extPortConnections')

/** 输入图中元素顺序 (对应 ELK InternalProperties.MODEL_ORDER). */
export const MODEL_ORDER = new Property<number>('org.eclipse.elk.layered.internal.modelOrder', 0)
export const MAX_MODEL_ORDER_NODES = new Property<number>('org.eclipse.elk.layered.internal.maxModelOrderNodes', 0)

/** 断环 model order 组数 (对应 ELK InternalProperties.CB_NUM_MODEL_ORDER_GROUPS). */
export const CB_NUM_MODEL_ORDER_GROUPS = new Property<number>('org.eclipse.elk.layered.internal.modelOrderGroups.cb.number', 0)

export const TARGET_NODE_MODEL_ORDER = new Property<Map<object, number>>('org.eclipse.elk.layered.internal.targetNodeModelOrder')
export const LONG_EDGE_TARGET_NODE = new Property<object>('org.eclipse.elk.layered.internal.longEdgeTargetNode')

/** NS 端口 dummy 替换关系. */
export const EXT_PORT_REPLACED_DUMMY = new Property<LNode>('org.eclipse.elk.layered.internal.extPortReplacedDummy')
export const EXT_PORT_REPLACED_DUMMIES = new Property<LNode[]>('org.eclipse.elk.layered.internal.extPortReplacedDummies')

/** postprocessor 设置的端点偏移. */
export const TARGET_OFFSET = new Property<{ x: number; y: number }>('org.eclipse.elk.layered.internal.targetOffset')

/** 图属性集合 (Set<GraphProperties>). */
export const GRAPH_PROPERTIES = new Property<Set<GraphProperties>>('org.eclipse.elk.layered.internal.graphProperties', new Set())

/** 层内布局单元 (NS dummy 关联). */
export const IN_LAYER_LAYOUT_UNIT = new Property<LNode>('org.eclipse.elk.layered.internal.inLayerLayoutUnit')

/** barycenter 关联节点. */
export const BARYCENTER_ASSOCIATES = new Property<LNode[]>('org.eclipse.elk.layered.internal.barycenterAssociates')
export const IN_LAYER_SUCCESSOR_CONSTRAINTS = new Property<LNode[]>('org.eclipse.elk.layered.internal.inLayerSuccessorConstraints')
export const IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES = new Property<boolean>('org.eclipse.elk.layered.internal.inLayerSuccessorConstraintsBetweenNonDummies', false)
export const CROSSING_HINT = new Property<number>('org.eclipse.elk.layered.internal.crossingHint', 0)

/** LABEL dummy 代表的边标签列表 (对应 ELK InternalProperties.REPRESENTED_LABELS). */
export const REPRESENTED_LABELS = new Property<unknown[]>('org.eclipse.elk.layered.internal.representedLabels', [])

/** 边标签在边的哪一侧 (对应 ELK LabelSide ABOVE/BELOW). */
export const LABEL_SIDE = new Property<string>('org.eclipse.elk.layered.internal.labelSide', 'BELOW')

/** 端口是否为输出端口 (NS preprocessor 重连前记录, 供 SOUTH 镜像判定). */
export const PORT_IS_OUTPUT = new Property<boolean>('org.eclipse.elk.layered.internal.portIsOutput', false)

/** 强制节点模型顺序 (P3). */
export const CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER = new Property<boolean>('org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder', false)

/** 层级 sweepiness. */
export const CROSSING_MINIMIZATION_HIERARCHICAL_SWEEPINESS = new Property<number>('org.eclipse.elk.layered.crossingMinimization.hierarchicalSweepiness', 0.1)

/** 预计算间距 (GraphConfigurator 挂载). */
export const SPACINGS = new Property<import('../p4nodes/spacings.js').Spacings>('org.eclipse.elk.layered.internal.spacings')

/** 长边 dummy 的源/目标端口. */
export const LONG_EDGE_SOURCE = new Property<LPort>('org.eclipse.elk.layered.internal.longEdgeSource')
export const LONG_EDGE_TARGET = new Property<LPort>('org.eclipse.elk.layered.internal.longEdgeTarget')
export const LONG_EDGE_HAS_LABEL_DUMMIES = new Property<boolean>('org.eclipse.elk.layered.internal.longEdgeHasLabelDummies', false)
export const LONG_EDGE_BEFORE_LABEL_DUMMY = new Property<boolean>('org.eclipse.elk.layered.internal.longEdgeBeforeLabelDummy', false)
export const END_LABEL_EDGE = new Property<LEdge>('org.eclipse.elk.layered.internal.endLabelEdge')
export const SELF_LOOP_HOLDER = new Property<object>('org.eclipse.elk.layered.internal.selfLoopHolder')
export const ORIGINAL_PORT_CONSTRAINTS = new Property<string>('org.eclipse.elk.layered.internal.originalPortConstraints')

/** 长边 dummy 原始位置 (InteractiveCrossingMinimizer 计算, interactive node placer 用). */
export const ORIGINAL_DUMMY_NODE_POSITION = new Property<number>('org.eclipse.elk.layered.internal.originalDummyNodePosition')

/** 边原始弯点 (InteractiveCrossingMinimizer 重建弯点链用). */
export const ORIGINAL_BENDPOINTS = new Property<import('../graph/enums.js').KVector[]>('org.eclipse.elk.layered.internal.originalBendPoints')


/** LNode 级端标签 (HEAD/TAIL) 集合: 端口 → LabelCell (对应 ELK InternalProperties.END_LABELS). */
export const END_LABELS = new Property<Map<LPort, unknown>>('org.eclipse.elk.layered.internal.endLabels')

/** 端口关联边的最大厚度 (EndLabelPreprocessor.gatherLabels 记录, 对应 ELK MAX_EDGE_THICKNESS). */
export const MAX_EDGE_THICKNESS = new Property<number>('org.eclipse.elk.layered.internal.maxEdgeThickness', 0)
