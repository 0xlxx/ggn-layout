/**
 * LayeredOptions (对应 ELK org.eclipse.elk.alg.layered.options.LayeredOptions).
 * 逐步加入移植所需的属性键.
 */
import { Property, type IPropertyHolder, registerFastProperty, registerFastStringKey } from '../graph/properties.js'
import { Direction, PortConstraints, PortSide, type KVector } from '../graph/enums.js'
import { ComponentOrderingStrategy } from '../components/component-ordering-strategy.js'

/** 边优先级 (影响断环选择与排序). */
export const PRIORITY_DIRECTION = new Property<number>('org.eclipse.elk.layered.priority.direction', 0)

/** 布局方向. */
export const DIRECTION = new Property<Direction>('org.eclipse.elk.direction', Direction.UNDEFINED)
export const ASPECT_RATIO = new Property<number>('org.eclipse.elk.aspectRatio', 1.6)
export const PORT_BORDER_OFFSET = new Property<number>('org.eclipse.elk.port.borderOffset', 0)
export const PORT_INDEX = new Property<number | null>('org.eclipse.elk.port.index', null)
export const PORT_SORTING_STRATEGY = new Property<string>('org.eclipse.elk.layered.portSortingStrategy', 'INPUT_ORDER')
export const PORT_SIDE = new Property<PortSide>('org.eclipse.elk.port.side', PortSide.UNDEFINED)
export const PORT_ANCHOR = new Property<{ x: number; y: number }>('org.eclipse.elk.port.anchor')
export const LAYERING_LAYER_CONSTRAINT = new Property<string>('org.eclipse.elk.layered.layering.layerConstraint')
export const EDGE_CONSTRAINT = new Property<string>('org.eclipse.elk.layered.internal.edgeConstraint')
export const IN_LAYER_CONSTRAINT = new Property<string>('org.eclipse.elk.layered.internal.inLayerConstraint')

/** 端口约束. */
export const PORT_CONSTRAINTS = new Property<PortConstraints>('org.eclipse.elk.portConstraints', PortConstraints.UNDEFINED)

/** 是否允许反馈边 (ELK LayeredOptions.feedbackEdges): true 时即使无 non-free 端口也跑 InvertedPortProcessor. */
export const FEEDBACK_EDGES = new Property<boolean>('org.eclipse.elk.layered.feedbackEdges', false)

/** 合并层级边 (external port 合并). */
export const MERGE_HIERARCHY_EDGES = new Property<boolean>('org.eclipse.elk.layered.mergeHierarchyEdges', true)

/** 合并边 (ELK LGraphUtil.createPort 合并分支: 每侧共享收集端口). */
export const MERGE_EDGES = new Property<boolean>('org.eclipse.elk.layered.mergeEdges', false)

/** 后压缩策略 (ELK LayeredOptions.COMPACTION_POST_COMPACTION_STRATEGY, 默认 NONE). */
export const COMPACTION_POST_COMPACTION_STRATEGY = new Property<string>('org.eclipse.elk.layered.compaction.postCompaction.strategy', 'NONE')
/** 后压缩约束计算策略 (默认 SCANLINE). */
export const COMPACTION_POST_COMPACTION_CONSTRAINTS = new Property<string>('org.eclipse.elk.layered.compaction.postCompaction.constraints', 'SCANLINE')

/** 是否保留非必要弯点. */
export const UNNECESSARY_BENDPOINTS = new Property<boolean>('org.eclipse.elk.layered.unnecessaryBendpoints', false)

/** 激活 inside self loops. */
export const INSIDE_SELF_LOOPS_ACTIVATE = new Property<boolean>('org.eclipse.elk.insideSelfLoops.activate', false)

/** 边是否在节点内部路由 (ELK CoreOptions.insideSelfLoops.yo, 默认 false). */
export const INSIDE_SELF_LOOPS_YO = new Property<boolean>('org.eclipse.elk.insideSelfLoops.yo', false)

/** 端口环绕间距 (ELK spacing.portsSurrounding, 外部端口层高度计算用). */
export const SPACING_PORTS_SURROUNDING = new Property<{ top: number; left: number; bottom: number; right: number }>('org.eclipse.elk.spacing.portsSurrounding', { top: 0, left: 0, bottom: 0, right: 0 })

/** 个体间距覆盖 (对应 ELK CoreOptions.SPACING_INDIVIDUAL, 值: IPropertyHolder). */
export const SPACING_INDIVIDUAL = new Property<IPropertyHolder | null>('org.eclipse.elk.spacing.individual', null)

/** 边到边间距. */
export const SPACING_EDGE_EDGE = new Property<number>('org.eclipse.elk.spacing.edgeEdge', 10)

/** 节点到节点间距 (层内). */
export const SPACING_NODE_NODE = new Property<number>('org.eclipse.elk.spacing.nodeNode', 20)

/** 层间距. */
export const SPACING_NODE_NODE_BETWEEN_LAYERS = new Property<number>('org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers', 20)

/** 随机种子 (0 = 时间种子). */
export const RANDOM_SEED = new Property<number>('org.eclipse.elk.randomSeed', 1)

/** 边长度优先级 (P2 权重). */
export const PRIORITY_SHORTNESS = new Property<number>('org.eclipse.elk.layered.priority.shortness', 0)

/** 算法彻底性 (P2 迭代上限因子). */
export const THOROUGHNESS = new Property<number>('org.eclipse.elk.layered.thoroughness', 7)

/** 层级处理. */
export const HIERARCHY_HANDLING = new Property<string | null>('org.eclipse.elk.hierarchyHandling', null)

/** 交叉最小化策略 (默认 LAYER_SWEEP). */
export const CROSSING_MINIMIZATION_STRATEGY = new Property<string>('org.eclipse.elk.layered.crossingMinimization.strategy', 'LAYER_SWEEP')

/** 是否拆分连通分量 (默认 true). */
export const SEPARATE_CONNECTED_COMPONENTS = new Property<boolean>('org.eclipse.elk.separateConnectedComponents', true)

/** 强制保持节点模型序 (对应 ELK crossingMinimization.forceNodeModelOrder, 默认 false; ModelOrderBarycenterHeuristic 读取). */
export { CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER } from './internal-properties.js'

/** 交互式布局 (对应 ELK CoreOptions.INTERACTIVE_LAYOUT, 默认 false; ConstraintsPostprocessor 触发). */
export const INTERACTIVE_LAYOUT = new Property<boolean>('org.eclipse.elk.interactiveLayout', false)

/** 输出节点 layerId/positionId (对应 ELK LayeredOptions.GENERATE_POSITION_AND_LAYER_IDS, 默认 false; ConstraintsPostprocessor 触发). */
export const GENERATE_POSITION_AND_LAYER_IDS = new Property<boolean>('org.eclipse.elk.layered.generatePositionAndLayerIds', false)


/** P2 分层策略 (对应 ELK LayeringStrategy). */
export const LAYERING_STRATEGY = new Property<string>('org.eclipse.elk.layered.layering.strategy', 'NETWORK_SIMPLEX')

// ── P4 BK 选项 ──

export enum NodePlacementStrategy {
  SIMPLE = 'SIMPLE',
  INTERACTIVE = 'INTERACTIVE',
  LINEAR_SEGMENTS = 'LINEAR_SEGMENTS',
  BRANDES_KOEPF = 'BRANDES_KOEPF',
  NETWORK_SIMPLEX = 'NETWORK_SIMPLEX',
}

export enum FixedAlignment {
  NONE = 'NONE',
  LEFTUP = 'LEFTUP',
  RIGHTUP = 'RIGHTUP',
  LEFTDOWN = 'LEFTDOWN',
  RIGHTDOWN = 'RIGHTDOWN',
  BALANCED = 'BALANCED',
}

export enum OrderingStrategy {
  NONE = 'NONE',
  NODES_AND_EDGES = 'NODES_AND_EDGES',
  PREFER_EDGES = 'PREFER_EDGES',
  PREFER_NODES = 'PREFER_NODES',
}

export enum LongEdgeOrderingStrategy {
  DUMMY_NODE_OVER = 'DUMMY_NODE_OVER',
  DUMMY_NODE_UNDER = 'DUMMY_NODE_UNDER',
  EQUAL = 'EQUAL',
}

export enum GroupOrderStrategy {
  ONLY_WITHIN_GROUP = 'ONLY_WITHIN_GROUP',
  MODEL_ORDER = 'MODEL_ORDER',
  ENFORCED = 'ENFORCED',
}

export enum CycleBreakingStrategy {
  GREEDY = 'GREEDY',
  GREEDY_MODEL_ORDER = 'GREEDY_MODEL_ORDER',
  MODEL_ORDER = 'MODEL_ORDER',
  DEPTH_FIRST = 'DEPTH_FIRST',
  INTERACTIVE = 'INTERACTIVE',
  SCC_CONNECTIVITY = 'SCC_CONNECTIVITY',
  SCC_NODE_TYPE = 'SCC_NODE_TYPE',
  DFS_NODE_ORDER = 'DFS_NODE_ORDER',
  BFS_NODE_ORDER = 'BFS_NODE_ORDER',
}

export enum LayerUnzippingStrategy {
  NONE = 'NONE',
  ALTERNATING = 'ALTERNATING',
}

export enum EdgeRouting {
  ORTHOGONAL = 'ORTHOGONAL',
  POLYLINE = 'POLYLINE',
}

export enum EdgeRoutingOld {}

export enum EdgeStraighteningStrategy {
  NONE = 'NONE',
  IMPROVE_STRAIGHTNESS = 'IMPROVE_STRAIGHTNESS',
}

export const NODE_PLACEMENT_STRATEGY = new Property<NodePlacementStrategy>('org.eclipse.elk.layered.nodePlacement.strategy', NodePlacementStrategy.BRANDES_KOEPF)

/** 考虑输入模型顺序的策略 (对应 ELK CONSIDER_MODEL_ORDER_STRATEGY). */
export const CONSIDER_MODEL_ORDER_STRATEGY = new Property<OrderingStrategy>('org.eclipse.elk.layered.considerModelOrder.strategy', OrderingStrategy.NONE)
export const CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER = new Property<boolean>('org.eclipse.elk.layered.considerModelOrder.portModelOrder', false)
export const CONSIDER_MODEL_ORDER_LONG_EDGE_STRATEGY = new Property<LongEdgeOrderingStrategy>('org.eclipse.elk.layered.considerModelOrder.longEdgeOrderingStrategy', LongEdgeOrderingStrategy.EQUAL)
export const CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY = new Property<GroupOrderStrategy>('org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cmGroupOrderStrategy', GroupOrderStrategy.MODEL_ORDER)
export const CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS = new Property<number[]>('org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cmEnforcedGroupOrders', [])
export const CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID = new Property<number | null>('org.eclipse.elk.layered.considerModelOrder.groupModelOrder.crossingMinimizationId', null)

/** 是否跳过 MODEL_ORDER 赋值 (对应 ELK CONSIDER_MODEL_ORDER_NO_MODEL_ORDER, importer 用). */
export const CONSIDER_MODEL_ORDER_NO_MODEL_ORDER = new Property<boolean>('org.eclipse.elk.layered.considerModelOrder.noModelOrder', false)

/** 分量模型序策略 (对应 ELK considerModelOrder.components, 默认 NONE; ComponentsProcessor split/combine 读取). */
export const CONSIDER_MODEL_ORDER_COMPONENTS = new Property<ComponentOrderingStrategy>('org.eclipse.elk.layered.considerModelOrder.components', ComponentOrderingStrategy.NONE)

/** 非流端口是否允许换侧 (对应 ELK allowNonFlowPortsToSwitchSides, 默认 false). */
export const ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES = new Property<boolean>('org.eclipse.elk.layered.allowNonFlowPortsToSwitchSides', false)

/** 断环分组 ID (对应 ELK groupModelOrder.cycleBreakingId, 默认 0). */
export const CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID = new Property<number>('org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cycleBreakingId', 0)

/** 断环分组排序策略 (对应 ELK groupModelOrder.cbGroupOrderStrategy, 默认 ONLY_WITHIN_GROUP). */
export const CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY = new Property<GroupOrderStrategy>('org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cbGroupOrderStrategy', GroupOrderStrategy.ONLY_WITHIN_GROUP)

/** 断环策略 (对应 ELK CYCLE_BREAKING_STRATEGY). */
export const CYCLE_BREAKING_STRATEGY = new Property<CycleBreakingStrategy>('org.eclipse.elk.layered.cycleBreaking.strategy', CycleBreakingStrategy.GREEDY)

/** 节点提升策略 (对应 ELK LAYERING_NODE_PROMOTION_STRATEGY, 默认 NONE). */
export const LAYERING_NODE_PROMOTION_STRATEGY = new Property<string>('org.eclipse.elk.layered.layering.nodePromotion.strategy', 'NONE')

/** 节点提升最大迭代次数 (对应 ELK nodePromotion.maxIterations, 默认 0). */
export const LAYERING_NODE_PROMOTION_MAX_ITERATIONS = new Property<number>('org.eclipse.elk.layered.layering.nodePromotion.maxIterations', 0)

/** Coffman-Graham 每层最大节点数 (对应 ELK layering.coffmanGraham.layerBound, 默认 Integer.MAX_VALUE). */
export const LAYERING_COFFMAN_GRAHAM_LAYER_BOUND = new Property<number>('org.eclipse.elk.layered.layering.coffmanGraham.layerBound', 0x7fffffff)

/** MinWidth 层宽上限 (对应 ELK layering.minWidth.upperBoundOnWidth, 默认 4; -1 = 遍历 1..4 取最优). */
export const LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH = new Property<number>('org.eclipse.elk.layered.layering.minWidth.upperBoundOnWidth', 4)

/** MinWidth 上层估计缩放因子 (对应 ELK layering.minWidth.upperLayerEstimationScalingFactor, 默认 2; -1 = 遍历 1..2 取最优). */
export const LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR = new Property<number>('org.eclipse.elk.layered.layering.minWidth.upperLayerEstimationScalingFactor', 2)

/** 节点标签内边距 (对应 ELK NODE_LABELS_PADDING, ElkPadding top/right/bottom/left). */
export const NODE_LABELS_PADDING = new Property<{ top: number; right: number; bottom: number; left: number }>('org.eclipse.elk.nodeLabels.padding', { top: 5, right: 5, bottom: 5, left: 5 })

/** 节点尺寸约束 (对应 ELK NODE_SIZE_CONSTRAINTS, 如 ['NODE_LABELS']). */
export const NODE_SIZE_CONSTRAINTS = new Property<string[]>('org.eclipse.elk.nodeSize.constraints', [])
/** 节点显式位置 (对应 ELK CoreOptions.POSITION, KVector) — semi-interactive 交叉最小化用. */
export const POSITION = new Property<KVector | null>('org.eclipse.elk.position', null)

/** 分区布局激活 (对应 ELK PARTITIONING_ACTIVATE, 默认 false). */
export const PARTITIONING_ACTIVATE = new Property<boolean>('org.eclipse.elk.partitioning.activate', false)
/** 节点分区编号 (对应 ELK PARTITIONING_PARTITION, 可空). */
export const PARTITIONING_PARTITION = new Property<number | null>('org.eclipse.elk.partitioning.partition', null)

/** 高连通节点处理 (对应 ELK highDegreeNodes.*, jar 经后缀匹配; ggn 无 alg 前缀键). */
export const HIGH_DEGREE_NODES_TREATMENT = new Property<boolean>('org.eclipse.elk.layered.highDegreeNodes.treatment', false)
export const HIGH_DEGREE_NODES_THRESHOLD = new Property<number>('org.eclipse.elk.layered.highDegreeNodes.threshold', 16)
export const HIGH_DEGREE_NODES_TREE_HEIGHT = new Property<number>('org.eclipse.elk.layered.highDegreeNodes.treeHeight', 5)

/** 节点最小尺寸 (对应 ELK NODE_SIZE_MINIMUM, KVector; MINIMUM_SIZE 约束时生效). */
export const NODE_SIZE_MINIMUM = new Property<{ x: number; y: number }>('org.eclipse.elk.nodeSize.minimum', { x: 0, y: 0 })
/** 节点尺寸选项 (对应 ELK NODE_SIZE_OPTIONS, 如 ['DEFAULT_MINIMUM_SIZE']). */
export const NODE_SIZE_OPTIONS = new Property<string[]>('org.eclipse.elk.nodeSize.options', [])
/** 固定图尺寸 (对应 ELK NODE_SIZE_FIXED_GRAPH_SIZE; true 时节点尺寸 = max(显式, cell 最小)). */
export const NODE_SIZE_FIXED_GRAPH_SIZE = new Property<boolean>('org.eclipse.elk.nodeSize.fixedGraphSize', false)

/** 节点标签放置 (对应 ELK NODE_LABELS_PLACEMENT, 如 ['INSIDE','H_CENTER','V_TOP']). */
export const NODE_LABELS_PLACEMENT = new Property<string[]>('org.eclipse.elk.nodeLabels.placement', [])
/** 端口标签放置 (对应 ELK PORT_LABELS_PLACEMENT; 默认 [OUTSIDE], 显式 [] 表示 FIXED). */
export const PORT_LABELS_PLACEMENT = new Property<string[]>('org.eclipse.elk.portLabels.placement', ['OUTSIDE'])
/** 端口对齐 (对应 ELK PORT_ALIGNMENT_*; 默认 DISTRIBUTED). */
export const PORT_ALIGNMENT_DEFAULT = new Property<string>('org.eclipse.elk.portAlignment.default', 'DISTRIBUTED')
export const PORT_ALIGNMENT_NORTH = new Property<string>('org.eclipse.elk.portAlignment.north', 'DISTRIBUTED')
export const PORT_ALIGNMENT_SOUTH = new Property<string>('org.eclipse.elk.portAlignment.south', 'DISTRIBUTED')
export const PORT_ALIGNMENT_EAST = new Property<string>('org.eclipse.elk.portAlignment.east', 'DISTRIBUTED')
export const PORT_ALIGNMENT_WEST = new Property<string>('org.eclipse.elk.portAlignment.west', 'DISTRIBUTED')

/** 层拆策略 (对应 ELK LAYER_UNZIPPING_STRATEGY). */
export const LAYER_UNZIPPING_STRATEGY = new Property<LayerUnzippingStrategy>('org.eclipse.elk.layered.layerUnzipping.strategy', LayerUnzippingStrategy.NONE)
export const LAYER_UNZIPPING_LAYER_SPLIT = new Property<number>('org.eclipse.elk.layered.layerUnzipping.layerSplit', 2)
export const LAYER_UNZIPPING_MINIMIZE_EDGE_LENGTH = new Property<boolean>('org.eclipse.elk.layered.layerUnzipping.minimizeEdgeLength', false)
export const LAYER_UNZIPPING_RESET_ON_LONG_EDGES = new Property<boolean>('org.eclipse.elk.layered.layerUnzipping.resetOnLongEdges', true)


/** 由 GraphConfigurator 自动设置: edgeRouting === ORTHOGONAL. ELK 默认 ORTHOGONAL → true. */
export const NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES = new Property<boolean | null>('org.eclipse.elk.layered.nodePlacement.favorStraightEdges', null)

export const NODE_PLACEMENT_BK_FIXED_ALIGNMENT = new Property<FixedAlignment>('org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment', FixedAlignment.NONE)

export const NODE_PLACEMENT_BK_EDGE_STRAIGHTENING = new Property<EdgeStraighteningStrategy>('org.eclipse.elk.layered.nodePlacement.bk.edgeStraightening', EdgeStraighteningStrategy.IMPROVE_STRAIGHTNESS)

/** 边直边优先级. */
export const PRIORITY_STRAIGHTNESS = new Property<number>('org.eclipse.elk.layered.priority.straightness', 0)

/** 边到边间距. */
export const SPACING_PORT_PORT = new Property<number>('org.eclipse.elk.spacing.portPort', 10)
export const SPACING_EDGE_NODE = new Property<number>('org.eclipse.elk.spacing.edgeNode', 10)

/** 边路由. */
export const EDGE_ROUTING = new Property<string>('org.eclipse.elk.edgeRouting', 'ORTHOGONAL')
/** comment box (对应 ELK COMMENT_BOX, 默认 false). */
export const COMMENT_BOX = new Property<boolean>('org.eclipse.elk.commentBox', false)
export const SPACING_COMMENT_COMMENT = new Property<number>('org.eclipse.elk.spacing.commentComment', 10)
export const SPACING_COMMENT_NODE = new Property<number>('org.eclipse.elk.spacing.commentNode', 10)

/** SPLINES 路由模式 (ELK EDGE_ROUTING_SPLINES_MODE, 默认 SLOPPY — Layered.melk line 615-623). */
export const EDGE_ROUTING_SPLINES_MODE = new Property<'SLOPPY' | 'CONSERVATIVE'>('org.eclipse.elk.layered.edgeRouting.splines.mode', 'SLOPPY')

/** sloppy 层距系数 (ELK EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR, 默认 0.2 — Layered.melk line 630-635). */
export const EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR = new Property<number>('org.eclipse.elk.layered.edgeRouting.splines.sloppy.layerSpacingFactor', 0.2)

export const SPACING_EDGE_EDGE_BETWEEN_LAYERS = new Property<number>('org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers', 10)
export const SPACING_EDGE_NODE_BETWEEN_LAYERS = new Property<number>('org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers', 10)

export enum EdgeLabelPlacement {
  UNDEFINED = 'UNDEFINED',
  HEAD = 'HEAD',
  CENTER = 'CENTER',
  TAIL = 'TAIL',
}

export const EDGE_THICKNESS = new Property<number>('org.eclipse.elk.edge.thickness', 1)
export const SPACING_EDGE_LABEL = new Property<number>('org.eclipse.elk.spacing.edgeLabel', 2)
export const SPACING_NODE_SELF_LOOP = new Property<number>('org.eclipse.elk.spacing.nodeSelfLoop', 10)
export const SPACING_LABEL_LABEL = new Property<number>('org.eclipse.elk.spacing.labelLabel', 0)
export const SPACING_LABEL_NODE = new Property<number>('org.eclipse.elk.spacing.labelNode', 5)
export const SPACING_LABEL_PORT_HORIZONTAL = new Property<number>('org.eclipse.elk.spacing.labelPortHorizontal', 1)
export const SPACING_LABEL_PORT_VERTICAL = new Property<number>('org.eclipse.elk.spacing.labelPortVertical', 1)
export const SPACING_COMPONENT_COMPONENT = new Property<number>('org.eclipse.elk.spacing.componentComponent', 20)
export const SELF_LOOP_DISTRIBUTION = new Property<'NORTH' | 'NORTH_SOUTH' | 'EQUALLY'>('org.eclipse.elk.layered.edgeRouting.selfLoopDistribution', 'NORTH')
export const SELF_LOOP_ORDERING = new Property<'SEQUENCED' | 'STACKED' | 'REVERSE_STACKED'>('org.eclipse.elk.layered.edgeRouting.selfLoopOrdering', 'STACKED')
export const DIRECTION_CONGRUENCY = new Property<'READING_DIRECTION' | 'ROTATION'>('org.eclipse.elk.layered.directionCongruency', 'READING_DIRECTION')
export const JUNCTION_POINTS = new Property<unknown[] | null>('org.eclipse.elk.junctionPoints', null)
export const EDGE_LABELS_PLACEMENT = new Property<EdgeLabelPlacement>('org.eclipse.elk.edgeLabels.placement', EdgeLabelPlacement.UNDEFINED)

/** 边标签侧选择策略 (对应 ELK EdgeLabelSideSelection, 默认 SMART_DOWN). */
export enum EdgeLabelSideSelection {
  ALWAYS_UP = 'ALWAYS_UP',
  ALWAYS_DOWN = 'ALWAYS_DOWN',
  DIRECTION_UP = 'DIRECTION_UP',
  DIRECTION_DOWN = 'DIRECTION_DOWN',
  SMART_UP = 'SMART_UP',
  SMART_DOWN = 'SMART_DOWN',
}
export const EDGE_LABELS_SIDE_SELECTION = new Property<EdgeLabelSideSelection>('org.eclipse.elk.layered.edgeLabels.sideSelection', EdgeLabelSideSelection.SMART_DOWN)

/** 交互式参考点 (对应 ELK INTERACTIVE_REFERENCE_POINT, 默认 CENTER). */
export const INTERACTIVE_REFERENCE_POINT = new Property<'CENTER' | 'TOP_LEFT'>('org.eclipse.elk.layered.interactiveReferencePoint', 'CENTER')

/** polyline 斜边区域宽 (对应 ELK EDGE_ROUTING_POLYLINE_SLOPED_EDGE_ZONE_WIDTH, 默认 10). */
export const EDGE_ROUTING_POLYLINE_SLOPED_EDGE_ZONE_WIDTH = new Property<number>('org.eclipse.elk.layered.edgeRouting.polyline.slopedEdgeZoneWidth', 2)

/** greedy switch 类型 (对应 ELK CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE, 默认 TWO_SIDED). */
export const CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE = new Property<string>('org.eclipse.elk.layered.crossingMinimization.greedySwitch.type', 'TWO_SIDED')

/** greedy switch 激活阈值 (对应 ELK CROSSING_MINIMIZATION_GREEDY_SWITCH_ACTIVATION_THRESHOLD, 默认 40; 0=强制激活). */
export const CROSSING_MINIMIZATION_GREEDY_SWITCH_ACTIVATION_THRESHOLD = new Property<number>('org.eclipse.elk.layered.crossingMinimization.greedySwitch.activationThreshold', 40)

/** 层级 greedy switch 类型 (对应 ELK CROSSING_MINIMIZATION_GREEDY_SWITCH_HIERARCHICAL_TYPE, 默认 OFF). */
export const CROSSING_MINIMIZATION_GREEDY_SWITCH_HIERARCHICAL_TYPE = new Property<string>('org.eclipse.elk.layered.crossingMinimization.greedySwitchHierarchical.type', 'OFF')

/** semi-interactive 交叉最小化 (对应 ELK CROSSING_MINIMIZATION_SEMI_INTERACTIVE, 默认 false). */
export const CROSSING_MINIMIZATION_SEMI_INTERACTIVE = new Property<boolean>('org.eclipse.elk.layered.crossingMinimization.semiInteractive', false)

/** 网络单纯形节点弹性 (对应 ELK NodeFlexibility, 默认 NONE). */
export enum NodeFlexibility {
  NONE = 'NONE',
  PORT_POSITION = 'PORT_POSITION',
  NODE_SIZE_WHERE_SPACE_PERMITS = 'NODE_SIZE_WHERE_SPACE_PERMITS',
  NODE_SIZE = 'NODE_SIZE',
}

/** 每节点弹性 (对应 ELK NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY). */
export const NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY = new Property<NodeFlexibility>('org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility', NodeFlexibility.NONE)

/** 弹性默认值 (对应 ELK NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, 默认 NONE). */
export const NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT = new Property<NodeFlexibility>('org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default', NodeFlexibility.NONE)

/** 节点对齐 (对应 ELK CoreOptions.ALIGNMENT, 默认 AUTOMATIC). */
export const ALIGNMENT = new Property<string>('org.eclipse.elk.alignment', 'AUTOMATIC')

/** 中心边标签放置策略 (对应 ELK CenterEdgeLabelPlacementStrategy — Layered.melk L1041+). */
export enum CenterEdgeLabelPlacementStrategy {
  /** 放跨越层的中间层 (默认). */
  MEDIAN_LAYER = 'MEDIAN_LAYER',
  /** 放最靠近边尾的层. */
  TAIL_LAYER = 'TAIL_LAYER',
  /** 放最靠近边头的层. */
  HEAD_LAYER = 'HEAD_LAYER',
  /** 放入使图最紧凑的层 (启发式). */
  SPACE_EFFICIENT_LAYER = 'SPACE_EFFICIENT_LAYER',
  /** 放入跨越层中最宽的层 (实验性). */
  WIDEST_LAYER = 'WIDEST_LAYER',
  /** 放入最接近边物理中心的层 (实验性). */
  CENTER_LAYER = 'CENTER_LAYER',
}

/** 长边中心标签放置层策略 (对应 ELK EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY, 默认 MEDIAN_LAYER). */
export const EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY = new Property<CenterEdgeLabelPlacementStrategy>(
  'org.eclipse.elk.layered.edgeLabels.centerLabelPlacementStrategy',
  CenterEdgeLabelPlacementStrategy.MEDIAN_LAYER,
)

/** 节点所在层 ID (对应 ELK LAYERING_LAYER_ID, output option, 默认 -1; ConstraintsPostprocessor 写入). */
export const LAYERING_LAYER_ID = new Property<number>('org.eclipse.elk.layered.layering.layerId', -1)

/** 节点在层内位置 ID (对应 ELK CROSSING_MINIMIZATION_POSITION_ID, output option, 默认 -1; ConstraintsPostprocessor 写入). */
export const CROSSING_MINIMIZATION_POSITION_ID = new Property<number>('org.eclipse.elk.layered.crossingMinimization.positionId', -1)

/** 超节点标记 (对应 ELK HYPERNODE, 默认 false; HypernodesProcessor 读取). */
export const HYPERNODE = new Property<boolean>('org.eclipse.elk.hypernode', false)

/** 第二遍节点放置算法 (对应 ELK NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT, 默认 null; NodePlacementRepeater 读取). */
export const NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT = new Property<NodePlacementStrategy | null>(
  'org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility.recomputeNodePlacement',
  null,
)
// ─── wrapping (断行) — 对应 ELK options.WrappingStrategy/CuttingStrategy/ValidifyStrategy + Layered.melk wrapping 组 ───

/** 图 wrapping 策略 (对应 ELK WrappingStrategy, 默认 OFF). */
export enum WrappingStrategy {
  /** 不 wrapping. */
  OFF = 'OFF',
  /** 每个 cut 点仅允许一条边向后 wrap (仅能在单边连接的层对间切割). */
  SINGLE_EDGE = 'SINGLE_EDGE',
  /** 允许一个 cut 点多条边向后 wrap (附加目标: 最小化向后 wrap 的边数). */
  MULTI_EDGE = 'MULTI_EDGE',
}

/** 切割策略 (对应 ELK CuttingStrategy, 默认 MSD). */
export enum CuttingStrategy {
  /** 基于目标纵横比的切割启发式. */
  ARD = 'ARD',
  /** 最大化缩放值驱动的切割启发式. */
  MSD = 'MSD',
  /** 用户通过 WRAPPING_CUTTING_CUTS 手动指定切割点. */
  MANUAL = 'MANUAL',
}

/** 切割点合法化策略 (对应 ELK ValidifyStrategy, 默认 GREEDY). */
export enum ValidifyStrategy {
  /** 不修改切割点. */
  NO = 'NO',
  /** 将非法切割点向后增加直到合法. */
  GREEDY = 'GREEDY',
  /** 选择最近 (向后/向前) 的合法切割点. */
  LOOK_BACK = 'LOOK_BACK',
}

/** wrapping 策略 (对应 ELK WRAPPING_STRATEGY, 默认 OFF). */
export const WRAPPING_STRATEGY = new Property<WrappingStrategy>('org.eclipse.elk.layered.wrapping.strategy', WrappingStrategy.OFF)

/** 额外包裹边间距 (加到常规 edgeNode 间距上, 默认 10 — Layered.melk L849). */
export const WRAPPING_ADDITIONAL_EDGE_SPACING = new Property<number>('org.eclipse.elk.layered.wrapping.additionalEdgeSpacing', 10)

/** wrapping 校正因子 (内部乘到 aspectRatio, 默认 1.0 — Layered.melk L863). */
export const WRAPPING_CORRECTION_FACTOR = new Property<number>('org.eclipse.elk.layered.wrapping.correctionFactor', 1.0)

/** 切割策略 (对应 ELK WRAPPING_CUTTING_STRATEGY, 默认 MSD). */
export const WRAPPING_CUTTING_STRATEGY = new Property<CuttingStrategy>('org.eclipse.elk.layered.wrapping.cutting.strategy', CuttingStrategy.MSD)

/** 手动指定的切割点 (对应 ELK WRAPPING_CUTTING_CUTS). */
export const WRAPPING_CUTTING_CUTS = new Property<number[] | null>('org.eclipse.elk.layered.wrapping.cutting.cuts', null)

/** MSD 自由度: 初始 cut 数可偏离范围 (默认 1, lowerBound 0 — Layered.melk L896). */
export const WRAPPING_CUTTING_MSD_FREEDOM = new Property<number>('org.eclipse.elk.layered.wrapping.cutting.msd.freedom', 1)

/** 切割点合法化策略 (对应 ELK WRAPPING_VALIDIFY_STRATEGY, 默认 GREEDY). */
export const WRAPPING_VALIDIFY_STRATEGY = new Property<ValidifyStrategy>('org.eclipse.elk.layered.wrapping.validify.strategy', ValidifyStrategy.GREEDY)

/** 用户禁用的切割索引 (对应 ELK WRAPPING_VALIDIFY_FORBIDDEN_INDICES). */
export const WRAPPING_VALIDIFY_FORBIDDEN_INDICES = new Property<number[] | null>('org.eclipse.elk.layered.wrapping.validify.forbiddenIndices', null)

/** 改进切割点 (multi-edge, 默认 true — Layered.melk L952). */
export const WRAPPING_MULTI_EDGE_IMPROVE_CUTS = new Property<boolean>('org.eclipse.elk.layered.wrapping.multiEdge.improveCuts', true)

/** 改进切割时的距离惩罚 (默认 2.0 — Layered.melk L960). */
export const WRAPPING_MULTI_EDGE_DISTANCE_PENALTY = new Property<number>('org.eclipse.elk.layered.wrapping.multiEdge.distancePenalty', 2.0)

/** 改进被包裹的边 (缩短 wrap 边的长度, 默认 true — Layered.melk L963). */
export const WRAPPING_MULTI_EDGE_IMPROVE_WRAPPED_EDGES = new Property<boolean>('org.eclipse.elk.layered.wrapping.multiEdge.improveWrappedEdges', true)

// ── P1 热属性直读字段化注册 (label-and-node-size-processor 优化, 2026-08-12) ──
// 依据只读探测 (perf-run --phase small/medium/large): 该处理器 (含 cell-system / node-label-placer)
// 每节点每属性一次 Map hash 查找 + 装箱 (getProperty @properties.ts 热点). 登记后
// MapPropertyHolder 用 O(1) 槽位直读/直写, getProperty 兼容层语义不变.
// ⚠ 必须在本模块求值期注册: elkgraph-builder 用字符串 key setProperty 建图 — 若注册晚于建图,
// 已设值会写进 Map 而读取走槽位 → 语义不一致.
registerFastProperty(PORT_BORDER_OFFSET)
registerFastProperty(PORT_CONSTRAINTS)
registerFastProperty(INSIDE_SELF_LOOPS_ACTIVATE)
registerFastProperty(SPACING_PORTS_SURROUNDING)
registerFastProperty(NODE_LABELS_PADDING)
registerFastProperty(NODE_SIZE_CONSTRAINTS)
registerFastProperty(NODE_SIZE_OPTIONS)
registerFastProperty(NODE_SIZE_MINIMUM)
registerFastProperty(NODE_LABELS_PLACEMENT)
registerFastProperty(PORT_LABELS_PLACEMENT)
registerFastProperty(PORT_ALIGNMENT_DEFAULT)
registerFastProperty(PORT_ALIGNMENT_NORTH)
registerFastProperty(PORT_ALIGNMENT_SOUTH)
registerFastProperty(PORT_ALIGNMENT_EAST)
registerFastProperty(PORT_ALIGNMENT_WEST)
registerFastProperty(SPACING_PORT_PORT)
registerFastProperty(SPACING_LABEL_LABEL)
registerFastProperty(SPACING_LABEL_NODE)
registerFastProperty(SPACING_LABEL_PORT_HORIZONTAL)
registerFastProperty(SPACING_LABEL_PORT_VERTICAL)
// 无 Property 常量的热字符串 key (端口标签组模式; 缺省 undefined).
registerFastStringKey('org.eclipse.elk.portLabels.treatAsGroup')
