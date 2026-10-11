# ELK 布局选项接口参考（ELK Java 0.12.0 → ggn-layout）

> **Status**: 🟢 Active
> **Last Updated**: 2026-08-14
> **Parent**: [文档索引](../../README.md)
> **Objective**: 移植 ELK Java 0.12.0 布局选项接口（CoreOptions / LayeredOptions）到本项目的权威对照表——选项键、TS Property、类型、默认值一一对应；供 `kernel:layout` 接线与消费方查表。

## 1. 背景与来源（为什么有这份文档）

`本仓库` 是 ELK Java 0.12.0（`org.eclipse.elk`）的 1:1 TypeScript 移植。
**布局选项是用户与布局引擎之间的接口契约**：图 JSON 中的 `layoutOptions` 声明如何映射到内部属性、
缺省时回落到什么默认值，直接决定布局结果。本表从移植代码（SSOT）提取：

- 主表来源：`src/options/layered-options.ts`（`Property` 常量的第二个构造参数 = 默认值）
- 其他算法模块：各自目录下的 `options.ts`（`DEFAULTS` 对象），见 [§6 其他算法模块选项](#6-其他算法模块选项)
- 内部属性（`*.internal.*`，非用户接口）：`src/options/internal-properties.ts`，不在本表列出，见 [§8 边界](#8-边界与内部属性)

> 与早期草稿 `plans/elk-options-canonical.md`（2026-08-07）相比，本表已按当前代码补齐并核对默认值
> （如 `spacing.edgeLabel = 2`、`portSortingStrategy = INPUT_ORDER` 等修正，见 [§7 针对性修改记录](#7-针对性修改记录相对-elk-java-早期移植)）。

## 2. 阅读约定

| 列 | 含义 |
| :--- | :--- |
| 选项键 | ELK 规范键（`org.eclipse.elk.*`） |
| TS Property | 移植后的常量名（`src/options/layered-options.ts` 导出） |
| 类型 | TS 类型（联合类型中的 `|` 在表格内写作 `\|`） |
| 默认值 | 未显式设置时的回落值（`MapPropertyHolder.getProperty` → `Property.getDefault()`） |

**三端键体系**：

- jar / 本仓库 Property id：`org.eclipse.elk.*`（规范键）
- elkjs / JSON `layoutOptions`：`elk.*` 短键（解析层自动映射，大小写不敏感）

**默认值语义**：未显式设置时，`getProperty` 回落 `Property.getDefault()`（对象型默认值首次读取缓存副本，
见 `src/graph/properties.ts`）。`—（无默认）` 表示该属性缺省为 `undefined`，通常由算法/处理器运行时写入。

<!-- 本文件数据由 scripts/gen-options-ref.mjs 生成；手工修改请同步脚本。 -->
## 核心选项（`org.eclipse.elk.*`）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.direction` | `DIRECTION` | Direction | Direction.UNDEFINED |
| `org.eclipse.elk.aspectRatio` | `ASPECT_RATIO` | number | 1.6 |
| `org.eclipse.elk.port.borderOffset` | `PORT_BORDER_OFFSET` | number | 0 |
| `org.eclipse.elk.port.index` | `PORT_INDEX` | number \| null | null |
| `org.eclipse.elk.port.side` | `PORT_SIDE` | PortSide | PortSide.UNDEFINED |
| `org.eclipse.elk.port.anchor` | `PORT_ANCHOR` | { x: number; y: number } | —（无默认） |
| `org.eclipse.elk.portConstraints` | `PORT_CONSTRAINTS` | PortConstraints | PortConstraints.UNDEFINED |
| `org.eclipse.elk.insideSelfLoops.activate` | `INSIDE_SELF_LOOPS_ACTIVATE` | boolean | false |
| `org.eclipse.elk.insideSelfLoops.yo` | `INSIDE_SELF_LOOPS_YO` | boolean | false |
| `org.eclipse.elk.randomSeed` | `RANDOM_SEED` | number | 1 |
| `org.eclipse.elk.hierarchyHandling` | `HIERARCHY_HANDLING` | string \| null | null |
| `org.eclipse.elk.separateConnectedComponents` | `SEPARATE_CONNECTED_COMPONENTS` | boolean | true |
| `org.eclipse.elk.interactiveLayout` | `INTERACTIVE_LAYOUT` | boolean | false |
| `org.eclipse.elk.nodeLabels.padding` | `NODE_LABELS_PADDING` | { top: number; right: number; bottom: number; left: number } | `{ top: 5, right: 5, bottom: 5, left: 5 }` |
| `org.eclipse.elk.nodeSize.constraints` | `NODE_SIZE_CONSTRAINTS` | string[] | `[]` |
| `org.eclipse.elk.position` | `POSITION` | KVector \| null | null |
| `org.eclipse.elk.partitioning.activate` | `PARTITIONING_ACTIVATE` | boolean | false |
| `org.eclipse.elk.partitioning.partition` | `PARTITIONING_PARTITION` | number \| null | null |
| `org.eclipse.elk.nodeSize.minimum` | `NODE_SIZE_MINIMUM` | { x: number; y: number } | `{ x: 0, y: 0 }` |
| `org.eclipse.elk.nodeSize.options` | `NODE_SIZE_OPTIONS` | string[] | `[]` |
| `org.eclipse.elk.nodeSize.fixedGraphSize` | `NODE_SIZE_FIXED_GRAPH_SIZE` | boolean | false |
| `org.eclipse.elk.nodeLabels.placement` | `NODE_LABELS_PLACEMENT` | string[] | `[]` |
| `org.eclipse.elk.portLabels.placement` | `PORT_LABELS_PLACEMENT` | string[] | `['OUTSIDE']` |
| `org.eclipse.elk.portAlignment.default` | `PORT_ALIGNMENT_DEFAULT` | string | 'DISTRIBUTED' |
| `org.eclipse.elk.portAlignment.north` | `PORT_ALIGNMENT_NORTH` | string | 'DISTRIBUTED' |
| `org.eclipse.elk.portAlignment.south` | `PORT_ALIGNMENT_SOUTH` | string | 'DISTRIBUTED' |
| `org.eclipse.elk.portAlignment.east` | `PORT_ALIGNMENT_EAST` | string | 'DISTRIBUTED' |
| `org.eclipse.elk.portAlignment.west` | `PORT_ALIGNMENT_WEST` | string | 'DISTRIBUTED' |
| `org.eclipse.elk.edgeRouting` | `EDGE_ROUTING` | string | 'ORTHOGONAL' |
| `org.eclipse.elk.commentBox` | `COMMENT_BOX` | boolean | false |
| `org.eclipse.elk.edge.thickness` | `EDGE_THICKNESS` | number | 1 |
| `org.eclipse.elk.junctionPoints` | `JUNCTION_POINTS` | unknown[] \| null | null |
| `org.eclipse.elk.edgeLabels.placement` | `EDGE_LABELS_PLACEMENT` | EdgeLabelPlacement | EdgeLabelPlacement.UNDEFINED |
| `org.eclipse.elk.alignment` | `ALIGNMENT` | string | 'AUTOMATIC' |
| `org.eclipse.elk.hypernode` | `HYPERNODE` | boolean | false |

## Layered 策略选项（`org.eclipse.elk.layered.*`）

### 断环（P1）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.cycleBreaking.strategy` | `CYCLE_BREAKING_STRATEGY` | CycleBreakingStrategy | CycleBreakingStrategy.GREEDY |

### 分层（P2）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.layering.layerConstraint` | `LAYERING_LAYER_CONSTRAINT` | string | —（无默认） |
| `org.eclipse.elk.layered.layering.strategy` | `LAYERING_STRATEGY` | string | 'NETWORK_SIMPLEX' |
| `org.eclipse.elk.layered.layering.nodePromotion.strategy` | `LAYERING_NODE_PROMOTION_STRATEGY` | string | 'NONE' |
| `org.eclipse.elk.layered.layering.nodePromotion.maxIterations` | `LAYERING_NODE_PROMOTION_MAX_ITERATIONS` | number | 0 |
| `org.eclipse.elk.layered.layering.coffmanGraham.layerBound` | `LAYERING_COFFMAN_GRAHAM_LAYER_BOUND` | number | 0x7fffffff |
| `org.eclipse.elk.layered.layering.minWidth.upperBoundOnWidth` | `LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH` | number | 4 |
| `org.eclipse.elk.layered.layering.minWidth.upperLayerEstimationScalingFactor` | `LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR` | number | 2 |
| `org.eclipse.elk.layered.layering.layerId` | `LAYERING_LAYER_ID` | number | -1 |

### 交叉最小化（P3）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.crossingMinimization.strategy` | `CROSSING_MINIMIZATION_STRATEGY` | string | 'LAYER_SWEEP' |
| `org.eclipse.elk.layered.crossingMinimization.greedySwitch.type` | `CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE` | string | 'TWO_SIDED' |
| `org.eclipse.elk.layered.crossingMinimization.greedySwitch.activationThreshold` | `CROSSING_MINIMIZATION_GREEDY_SWITCH_ACTIVATION_THRESHOLD` | number | 40 |
| `org.eclipse.elk.layered.crossingMinimization.greedySwitchHierarchical.type` | `CROSSING_MINIMIZATION_GREEDY_SWITCH_HIERARCHICAL_TYPE` | string | 'OFF' |
| `org.eclipse.elk.layered.crossingMinimization.semiInteractive` | `CROSSING_MINIMIZATION_SEMI_INTERACTIVE` | boolean | false |
| `org.eclipse.elk.layered.crossingMinimization.positionId` | `CROSSING_MINIMIZATION_POSITION_ID` | number | -1 |

### 节点放置（P4）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.nodePlacement.strategy` | `NODE_PLACEMENT_STRATEGY` | NodePlacementStrategy | NodePlacementStrategy.BRANDES_KOEPF |
| `org.eclipse.elk.layered.nodePlacement.favorStraightEdges` | `NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES` | boolean \| null | null |
| `org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment` | `NODE_PLACEMENT_BK_FIXED_ALIGNMENT` | FixedAlignment | FixedAlignment.NONE |
| `org.eclipse.elk.layered.nodePlacement.bk.edgeStraightening` | `NODE_PLACEMENT_BK_EDGE_STRAIGHTENING` | EdgeStraighteningStrategy | EdgeStraighteningStrategy.IMPROVE_STRAIGHTNESS |
| `org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility` | `NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY` | NodeFlexibility | NodeFlexibility.NONE |
| `org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default` | `NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT` | NodeFlexibility | NodeFlexibility.NONE |
| `org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility.recomputeNodePlacement` | `NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT` | NodePlacementStrategy \| null | null |

### 模型序（P3/P4）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.considerModelOrder.strategy` | `CONSIDER_MODEL_ORDER_STRATEGY` | OrderingStrategy | OrderingStrategy.NONE |
| `org.eclipse.elk.layered.considerModelOrder.portModelOrder` | `CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER` | boolean | false |
| `org.eclipse.elk.layered.considerModelOrder.longEdgeOrderingStrategy` | `CONSIDER_MODEL_ORDER_LONG_EDGE_STRATEGY` | LongEdgeOrderingStrategy | LongEdgeOrderingStrategy.EQUAL |
| `org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cmGroupOrderStrategy` | `CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY` | GroupOrderStrategy | GroupOrderStrategy.MODEL_ORDER |
| `org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cmEnforcedGroupOrders` | `CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS` | number[] | `[]` |
| `org.eclipse.elk.layered.considerModelOrder.groupModelOrder.crossingMinimizationId` | `CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID` | number \| null | null |
| `org.eclipse.elk.layered.considerModelOrder.noModelOrder` | `CONSIDER_MODEL_ORDER_NO_MODEL_ORDER` | boolean | false |
| `org.eclipse.elk.layered.considerModelOrder.components` | `CONSIDER_MODEL_ORDER_COMPONENTS` | ComponentOrderingStrategy | ComponentOrderingStrategy.NONE |
| `org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cycleBreakingId` | `CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID` | number | 0 |
| `org.eclipse.elk.layered.considerModelOrder.groupModelOrder.cbGroupOrderStrategy` | `CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY` | GroupOrderStrategy | GroupOrderStrategy.ONLY_WITHIN_GROUP |

### 边路由（P5）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.edgeRouting.splines.mode` | `EDGE_ROUTING_SPLINES_MODE` | 'SLOPPY' \| 'CONSERVATIVE' | 'SLOPPY' |
| `org.eclipse.elk.layered.edgeRouting.splines.sloppy.layerSpacingFactor` | `EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR` | number | 0.2 |
| `org.eclipse.elk.layered.edgeRouting.selfLoopDistribution` | `SELF_LOOP_DISTRIBUTION` | 'NORTH' \| 'NORTH_SOUTH' \| 'EQUALLY' | 'NORTH' |
| `org.eclipse.elk.layered.edgeRouting.selfLoopOrdering` | `SELF_LOOP_ORDERING` | 'SEQUENCED' \| 'STACKED' \| 'REVERSE_STACKED' | 'STACKED' |
| `org.eclipse.elk.layered.edgeRouting.polyline.slopedEdgeZoneWidth` | `EDGE_ROUTING_POLYLINE_SLOPED_EDGE_ZONE_WIDTH` | number | 2 |

### 边标签

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.edgeLabels.sideSelection` | `EDGE_LABELS_SIDE_SELECTION` | EdgeLabelSideSelection | EdgeLabelSideSelection.SMART_DOWN |
| `org.eclipse.elk.layered.edgeLabels.centerLabelPlacementStrategy` | `EDGE_LABELS_CENTER_LABEL_PLACEMENT_STRATEGY` | CenterEdgeLabelPlacementStrategy | CenterEdgeLabelPlacementStrategy.MEDIAN_LAYER |

### 包装（wrapping）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.wrapping.strategy` | `WRAPPING_STRATEGY` | WrappingStrategy | WrappingStrategy.OFF |
| `org.eclipse.elk.layered.wrapping.additionalEdgeSpacing` | `WRAPPING_ADDITIONAL_EDGE_SPACING` | number | 10 |
| `org.eclipse.elk.layered.wrapping.correctionFactor` | `WRAPPING_CORRECTION_FACTOR` | number | 1.0 |
| `org.eclipse.elk.layered.wrapping.cutting.strategy` | `WRAPPING_CUTTING_STRATEGY` | CuttingStrategy | CuttingStrategy.MSD |
| `org.eclipse.elk.layered.wrapping.cutting.cuts` | `WRAPPING_CUTTING_CUTS` | number[] \| null | null |
| `org.eclipse.elk.layered.wrapping.cutting.msd.freedom` | `WRAPPING_CUTTING_MSD_FREEDOM` | number | 1 |
| `org.eclipse.elk.layered.wrapping.validify.strategy` | `WRAPPING_VALIDIFY_STRATEGY` | ValidifyStrategy | ValidifyStrategy.GREEDY |
| `org.eclipse.elk.layered.wrapping.validify.forbiddenIndices` | `WRAPPING_VALIDIFY_FORBIDDEN_INDICES` | number[] \| null | null |
| `org.eclipse.elk.layered.wrapping.multiEdge.improveCuts` | `WRAPPING_MULTI_EDGE_IMPROVE_CUTS` | boolean | true |
| `org.eclipse.elk.layered.wrapping.multiEdge.distancePenalty` | `WRAPPING_MULTI_EDGE_DISTANCE_PENALTY` | number | 2.0 |
| `org.eclipse.elk.layered.wrapping.multiEdge.improveWrappedEdges` | `WRAPPING_MULTI_EDGE_IMPROVE_WRAPPED_EDGES` | boolean | true |

### 压缩（compaction）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.compaction.postCompaction.strategy` | `COMPACTION_POST_COMPACTION_STRATEGY` | string | 'NONE' |
| `org.eclipse.elk.layered.compaction.postCompaction.constraints` | `COMPACTION_POST_COMPACTION_CONSTRAINTS` | string | 'SCANLINE' |

### 分层拆解（layer unzipping）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.layerUnzipping.strategy` | `LAYER_UNZIPPING_STRATEGY` | LayerUnzippingStrategy | LayerUnzippingStrategy.NONE |
| `org.eclipse.elk.layered.layerUnzipping.layerSplit` | `LAYER_UNZIPPING_LAYER_SPLIT` | number | 2 |
| `org.eclipse.elk.layered.layerUnzipping.minimizeEdgeLength` | `LAYER_UNZIPPING_MINIMIZE_EDGE_LENGTH` | boolean | false |
| `org.eclipse.elk.layered.layerUnzipping.resetOnLongEdges` | `LAYER_UNZIPPING_RESET_ON_LONG_EDGES` | boolean | true |

### 端口排序

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.portSortingStrategy` | `PORT_SORTING_STRATEGY` | string | 'INPUT_ORDER' |

### 高次节点

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.highDegreeNodes.treatment` | `HIGH_DEGREE_NODES_TREATMENT` | boolean | false |
| `org.eclipse.elk.layered.highDegreeNodes.threshold` | `HIGH_DEGREE_NODES_THRESHOLD` | number | 16 |
| `org.eclipse.elk.layered.highDegreeNodes.treeHeight` | `HIGH_DEGREE_NODES_TREE_HEIGHT` | number | 5 |

### 输出 id

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.generatePositionAndLayerIds` | `GENERATE_POSITION_AND_LAYER_IDS` | boolean | false |

### 交互参考点

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.interactiveReferencePoint` | `INTERACTIVE_REFERENCE_POINT` | 'CENTER' \| 'TOP_LEFT' | 'CENTER' |

### 其他

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.layered.priority.direction` | `PRIORITY_DIRECTION` | number | 0 |
| `org.eclipse.elk.layered.feedbackEdges` | `FEEDBACK_EDGES` | boolean | false |
| `org.eclipse.elk.layered.mergeHierarchyEdges` | `MERGE_HIERARCHY_EDGES` | boolean | true |
| `org.eclipse.elk.layered.mergeEdges` | `MERGE_EDGES` | boolean | false |
| `org.eclipse.elk.layered.unnecessaryBendpoints` | `UNNECESSARY_BENDPOINTS` | boolean | false |
| `org.eclipse.elk.layered.priority.shortness` | `PRIORITY_SHORTNESS` | number | 0 |
| `org.eclipse.elk.layered.thoroughness` | `THOROUGHNESS` | number | 7 |
| `org.eclipse.elk.layered.allowNonFlowPortsToSwitchSides` | `ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES` | boolean | false |
| `org.eclipse.elk.layered.priority.straightness` | `PRIORITY_STRAIGHTNESS` | number | 0 |
| `org.eclipse.elk.layered.directionCongruency` | `DIRECTION_CONGRUENCY` | 'READING_DIRECTION' \| 'ROTATION' | 'READING_DIRECTION' |

## 间距选项（`org.eclipse.elk.spacing.*`）

| 选项键 | TS Property | 类型 | 默认值 |
| :--- | :--- | :--- | :--- |
| `org.eclipse.elk.spacing.portsSurrounding` | `SPACING_PORTS_SURROUNDING` | { top: number; left: number; bottom: number; right: number } | `{ top: 0, left: 0, bottom: 0, right: 0 }` |
| `org.eclipse.elk.spacing.individual` | `SPACING_INDIVIDUAL` | IPropertyHolder \| null | null |
| `org.eclipse.elk.spacing.edgeEdge` | `SPACING_EDGE_EDGE` | number | 10 |
| `org.eclipse.elk.spacing.nodeNode` | `SPACING_NODE_NODE` | number | 20 |
| `org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers` | `SPACING_NODE_NODE_BETWEEN_LAYERS` | number | 20 |
| `org.eclipse.elk.spacing.portPort` | `SPACING_PORT_PORT` | number | 10 |
| `org.eclipse.elk.spacing.edgeNode` | `SPACING_EDGE_NODE` | number | 10 |
| `org.eclipse.elk.spacing.commentComment` | `SPACING_COMMENT_COMMENT` | number | 10 |
| `org.eclipse.elk.spacing.commentNode` | `SPACING_COMMENT_NODE` | number | 10 |
| `org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers` | `SPACING_EDGE_EDGE_BETWEEN_LAYERS` | number | 10 |
| `org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers` | `SPACING_EDGE_NODE_BETWEEN_LAYERS` | number | 10 |
| `org.eclipse.elk.spacing.edgeLabel` | `SPACING_EDGE_LABEL` | number | 2 |
| `org.eclipse.elk.spacing.nodeSelfLoop` | `SPACING_NODE_SELF_LOOP` | number | 10 |
| `org.eclipse.elk.spacing.labelLabel` | `SPACING_LABEL_LABEL` | number | 0 |
| `org.eclipse.elk.spacing.labelNode` | `SPACING_LABEL_NODE` | number | 5 |
| `org.eclipse.elk.spacing.labelPortHorizontal` | `SPACING_LABEL_PORT_HORIZONTAL` | number | 1 |
| `org.eclipse.elk.spacing.labelPortVertical` | `SPACING_LABEL_PORT_VERTICAL` | number | 1 |
| `org.eclipse.elk.spacing.componentComponent` | `SPACING_COMPONENT_COMPONENT` | number | 20 |
## 6. 其他算法模块选项

layered 之外，`layoutElkJson` 按 `org.eclipse.elk.algorithm` 分派到各算法模块；每个模块的默认值在
各自 `options.ts` 的 `DEFAULTS` 对象中（读取走 `optOf(graph, key, DEFAULTS[key])`）。

| 模块 | 参数文件 | 关键默认值 |
| :--- | :--- | :--- |
| force / stress | `src/force/options.ts` | `spacing.nodeNode = 80`、`padding = 50`、`iterations = 300`、`forceModel = FRUCHTERMAN_REINGOLD`、`repulsion = 5.0`、`temperature = 0.001`；stress `desiredEdgeLength = 100`、`epsilon = 10e-4` |
| radial | `src/radial/options.ts` | `spacing.nodeNode = 20`、`compactor = NONE`、`sorter = NONE`、`wedgeCriteria = NODE_SIZE`、`optimizationCriteria = NONE` |
| mrtree | `src/mrtree/options.ts` | `padding = 20`、`spacing.nodeNode = 20`、`spacing.edgeNode = 3`、`searchOrder = DFS`、`weighting = MODEL_ORDER`、`edgeRoutingMode = AVOID_OVERLAP`、`edgeEndTextureLength = 7` |
| disco | `src/disco/options.ts` | `padding = 12`、`spacing.componentComponent = 20`、`edge.thickness = 1`、`componentCompaction = POLYOMINO`、`traversal = QUADRANTS_LINE_BY_LINE` |
| rectpacking | `src/rectpacking/options.ts` | `aspectRatio = 1.3`、`padding = 15`、`spacing.nodeNode = 15`、`packing = COMPACTION`、`whitespaceElimination = NONE` |
| topdownpacking | `src/topdownpacking/options.ts` | `padding = 12`、`spacing.nodeNode = 20`、`hierarchicalNodeWidth = 150`、`hierarchicalNodeAspectRatio = 1.414` |
| spore | `src/spore/options.ts` | `padding = 8`、`spacing.nodeNode = 8`、`structureExtraction = DELAUNAY_TRIANGULATION`、`spanningTree = MINIMUM_SPANNING_TREE`、`rootSelection = CENTER_NODE`、`compaction = DEPTH_FIRST` |
| vertiflex | `src/vertiflex/options.ts` | `padding = 12`、`spacing.nodeNode = 20`、`layerDistance = 50`、`layoutStrategy = STRAIGHT`、`considerNodeModelOrder = true` |
| box / fixed / random | `src/api/core-providers.ts` | box `padding = 15`、`spacing = 15`；random 默认 `aspectRatio = 1.6`、种子程序性 |

## 7. 针对性修改记录（相对 ELK Java / 早期移植）

| 项 | 说明 | 依据 |
| :--- | :--- | :--- |
| 键前缀 | JSON 支持 `elk.*` 短键映射 `org.eclipse.elk.*`（大小写不敏感） | `src/api/elk-json.ts` |
| `spacing.edgeLabel` 默认 `2` | 早期误用 10，已按 ELK 修正 | `layered-options.ts:287` |
| `spacing.labelLabel` 默认 `0` | 早期误用 3，已按 ELK 修正 | canonical 清单 |
| `portSortingStrategy` 默认 `INPUT_ORDER` | 早期误用 `DEFAULT`（ELK 枚举无此值） | `layered-options.ts:17` |
| `layerUnzipping.strategy` 默认 `NONE` | 枚举 `OFF → NONE` 对齐 | canonical 清单 |
| `priority.shortness` 默认 `0` | 早期误用 1 | canonical 清单 |
| core 键归属 | `direction` / `edgeRouting` / `portConstraints` / `hierarchyHandling` 等早期误挂 `layered.*`，已修正回 core | canonical 清单 |
| 命名约束 | 新增公共符号/文件名不含 `ELK`/`Elk`（`layoutElkJson`/`ElkNode` 兼容名保留） | `docs/api-workflow.md` |
| spacing 基准 | `LayeredSpacingsBuilder` 以 `spacing.nodeNode`（20）为基准按比例派生其余 spacing factor | `src/options/layered-spacings.ts` |

## 8. 边界与内部属性

- `org.eclipse.elk.layered.internal.*`（如 `EDGE_CONSTRAINT` / `IN_LAYER_CONSTRAINT`）与
  `src/options/internal-properties.ts` 中的运行时属性（`MODEL_ORDER`、`SPACINGS`、`GRAPH_PROPERTIES` 等）
  **不是用户接口**，由算法/处理器写入，消费方不应依赖。
- 未定义 `Property` 常量的 core 键（解析层按需处理，不在本表）：`padding`、`edge.type`、单值全局
  `priority`、`portLabels.treatAsGroup`（热字符串 key，默认 `undefined`，见 `properties.ts` 的
  `registerFastStringKey`）。待办清单见 `plans/elk-options-canonical.md` §待办。

## 9. 重新生成

数据部分由脚本从代码提取，防不一致：

```sh
node scripts/gen-options-ref.mjs   # 输出三张表（core / layered / spacing）
```

手工修改 `layered-options.ts` 后重跑本脚本并更新本文 `Last Updated`。

---
