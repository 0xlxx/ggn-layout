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
 * layout 布局参数 SSOT（类型安全 + 规范，2026-08-15）。
 *
 * 单一事实来源：每个参数定义一次——`id`（org.eclipse.elk.*）/ `shortKey`（elkt 短键，对齐
 * shared/opt-map.ts OPT_MAP）/ `type`（值类型，与 OPT_MAP 同构）/ `default`（ELK 标准默认，
 * **参考值**——各算法 DEFAULTS 可覆盖，如 force padding=50 vs core 12）/ `values`（枚举值域）/
 * `algorithm`（归属算法族）。
 *
 * 消费方（规范）：
 *  - 各算法 `src/<alg>/options.ts` 的字符串常量 = `CORE.<key>.id` / `ALG.<alg>.<key>.id`
 *    （**消除 core 参数跨算法重复定义**：此前 padding 定义 14 次、spacing.nodeNode 8 次）；
 *  - 算法 DEFAULTS 值保持各自覆盖（SSOT 的 default 是参考，不强制统一）；
 *  - 一致性校验测试：specs ↔ OPT_MAP（id/type 全等）、specs ↔ 各算法常量（id 引用）。
 *
 * 类型安全：`OptionSpec<T, I>` 的 `default: T` 由泛型约束（消费方 `spec.id` 为字面量类型）；
 * `type` 是运行时可校验元数据（与 OPT_MAP 同构，用于 elkt 转换校验），`default` 与 `type`
 * 无编译期关联约束（TS 无法表达）——以测试 `SpecsConsistencyTest` 校验 type 与 OPT_MAP 一致。
 */
export interface OptionSpec<T = unknown, I extends string = string> {
  /** org.eclipse.elk.* 全 id（I 泛型保留字面量类型——消费方 `spec.id` 不丢字符串字面量，DEFAULTS 索引安全） */
  readonly id: I
  /** elkt 短键（shared/opt-map.ts OPT_MAP 键；无对应短键的 internal 属性可省略） */
  readonly shortKey?: string
  readonly type: 'str' | 'num' | 'bool' | 'enumset' | 'object'
  /** ELK 标准默认（参考值；算法 DEFAULTS 可覆盖） */
  readonly default: T
  /** 枚举值域（type='str'/'enumset' 时） */
  readonly values?: readonly string[]
  /** 归属算法族（core/layered/disco/force/mrtree/radial/rectpacking/spore/topdownpacking/vertiflex） */
  readonly algorithm?: string
}

/** 简洁构造（类型安全：泛型推断 default + id 字面量）。 */
export function spec<T, I extends string>(s: OptionSpec<T, I>): OptionSpec<T, I> {
  return s
}

// ── core 参数（跨算法共用，单一定义——消除重复）──
export const CORE = {
  padding: spec({ id: 'org.eclipse.elk.padding', shortKey: 'padding', type: 'object', default: { top: 12, left: 12, right: 12, bottom: 12 }, algorithm: 'core' }),
  margins: spec({ id: 'org.eclipse.elk.margins', shortKey: 'margins', type: 'num', default: 0, algorithm: 'core' }),
  spacingNodeNode: spec({ id: 'org.eclipse.elk.spacing.nodeNode', shortKey: 'spacing.nodeNode', type: 'num', default: 20, algorithm: 'core' }),
  spacingEdgeNode: spec({ id: 'org.eclipse.elk.spacing.edgeNode', shortKey: 'spacing.edgeNode', type: 'num', default: 10, algorithm: 'core' }),
  spacingEdgeEdge: spec({ id: 'org.eclipse.elk.spacing.edgeEdge', shortKey: 'spacing.edgeEdge', type: 'num', default: 10, algorithm: 'core' }),
  spacingEdgeLabel: spec({ id: 'org.eclipse.elk.spacing.edgeLabel', shortKey: 'spacing.edgeLabel', type: 'num', default: 2, algorithm: 'core' }),
  spacingComponentComponent: spec({ id: 'org.eclipse.elk.spacing.componentComponent', shortKey: 'spacing.componentComponent', type: 'num', default: 20, algorithm: 'core' }),
  aspectRatio: spec({ id: 'org.eclipse.elk.aspectRatio', shortKey: 'aspectRatio', type: 'num', default: 1.6, algorithm: 'core' }),
  priority: spec({ id: 'org.eclipse.elk.priority', shortKey: 'priority', type: 'num', default: 1, algorithm: 'core' }),
  separateConnectedComponents: spec({ id: 'org.eclipse.elk.separateConnectedComponents', shortKey: 'separateConnectedComponents', type: 'bool', default: true, algorithm: 'core' }),
  omitNodeMicroLayout: spec({ id: 'org.eclipse.elk.omitNodeMicroLayout', shortKey: 'omitNodeMicroLayout', type: 'bool', default: false, algorithm: 'core' }),
  nodeSizeFixedGraphSize: spec({ id: 'org.eclipse.elk.nodeSize.fixedGraphSize', shortKey: 'nodeSize.fixedGraphSize', type: 'bool', default: false, algorithm: 'core' }),
  position: spec({ id: 'org.eclipse.elk.position', shortKey: 'position', type: 'str', default: 'UNDEFINED', algorithm: 'core' }),
  direction: spec({ id: 'org.eclipse.elk.direction', shortKey: 'direction', type: 'str', default: 'UNDEFINED', algorithm: 'core' }),
  debugMode: spec({ id: 'org.eclipse.elk.debugMode', shortKey: 'debugMode', type: 'bool', default: false, algorithm: 'core' }),
  interactive: spec({ id: 'org.eclipse.elk.interactive', shortKey: 'interactive', type: 'bool', default: false, algorithm: 'core' }),
  randomSeed: spec({ id: 'org.eclipse.elk.randomSeed', shortKey: 'randomSeed', type: 'num', default: 1, algorithm: 'core' }),
  edgeThickness: spec({ id: 'org.eclipse.elk.edge.thickness', shortKey: 'edge.thickness', type: 'num', default: 1, algorithm: 'core' }),
  edgeLabelsInline: spec({ id: 'org.eclipse.elk.edgeLabels.inline', shortKey: 'edgeLabels.inline', type: 'bool', default: false, algorithm: 'core' }),
  nodeSizeConstraints: spec({ id: 'org.eclipse.elk.nodeSize.constraints', shortKey: 'nodeSize.constraints', type: 'enumset', default: [], values: ['PORTS', 'PORT_LABELS', 'NODE_LABELS', 'MINIMUM_SIZE'], algorithm: 'core' }),
  nodeSizeMinimum: spec({ id: 'org.eclipse.elk.nodeSize.minimum', shortKey: 'nodeSize.minimum', type: 'str', default: 'UNDEFINED', algorithm: 'core' }),
  contentAlignment: spec({ id: 'org.eclipse.elk.contentAlignment', shortKey: 'contentAlignment', type: 'enumset', default: [], values: ['V_TOP', 'V_CENTER', 'V_BOTTOM', 'H_LEFT', 'H_CENTER', 'H_RIGHT'], algorithm: 'core' }),
  underlyingLayoutAlgorithm: spec({ id: 'org.eclipse.elk.underlyingLayoutAlgorithm', shortKey: 'underlyingLayoutAlgorithm', type: 'str', default: 'UNDEFINED', algorithm: 'core' }),
  structureExtractionStrategy: spec({ id: 'org.eclipse.elk.structure.structureExtractionStrategy', shortKey: 'structure.structureExtractionStrategy', type: 'str', default: 'UNDEFINED', algorithm: 'core' }),
  childAreaWidth: spec({ id: 'org.eclipse.elk.childArea.width', shortKey: 'childArea.width', type: 'num', default: 0, algorithm: 'core' }),
  childAreaHeight: spec({ id: 'org.eclipse.elk.childArea.height', shortKey: 'childArea.height', type: 'num', default: 0, algorithm: 'core' }),
  spacingIndividual: spec({ id: 'org.eclipse.elk.spacing.individual', shortKey: 'spacing.individual', type: 'str', default: 'UNDEFINED', algorithm: 'core' }),
  portConstraints: spec({ id: 'org.eclipse.elk.portConstraints', shortKey: 'portConstraints', type: 'str', default: 'UNDEFINED', values: ['UNDEFINED', 'FREE', 'FIXED_SIDE', 'FIXED_SIDES', 'FIXED_ORDER', 'FIXED_RATIO', 'FIXED_POS'], algorithm: 'core' }),
} as const

// ── 各算法专属参数 ──
export const ALG = {
  radial: {
    centerOnRoot: spec({ id: 'org.eclipse.elk.radial.centerOnRoot', shortKey: 'radial.centerOnRoot', type: 'bool', default: false, algorithm: 'radial' }),
    orderId: spec({ id: 'org.eclipse.elk.radial.orderId', shortKey: 'radial.orderId', type: 'num', default: 0, algorithm: 'radial' }),
    radius: spec({ id: 'org.eclipse.elk.radial.radius', shortKey: 'radial.radius', type: 'num', default: 0.0, algorithm: 'radial' }),
    rotate: spec({ id: 'org.eclipse.elk.radial.rotate', shortKey: 'radial.rotate', type: 'bool', default: false, algorithm: 'radial' }),
    rotationTargetAngle: spec({ id: 'org.eclipse.elk.radial.rotation.targetAngle', shortKey: 'radial.rotation.targetAngle', type: 'num', default: 0, algorithm: 'radial' }),
    rotationComputeAdditionalWedgeSpace: spec({ id: 'org.eclipse.elk.radial.rotation.computeAdditionalWedgeSpace', shortKey: 'radial.rotation.computeAdditionalWedgeSpace', type: 'bool', default: false, algorithm: 'radial' }),
    rotationOutgoingEdgeAngles: spec({ id: 'org.eclipse.elk.radial.rotation.outgoingEdgeAngles', shortKey: 'radial.rotation.outgoingEdgeAngles', type: 'bool', default: false, algorithm: 'radial' }),
    compactor: spec({ id: 'org.eclipse.elk.radial.compactor', shortKey: 'radial.compactor', type: 'str', default: 'NONE', values: ['NONE', 'RADIAL_COMPACTION', 'WEDGE_COMPACTION'], algorithm: 'radial' }),
    compactionStepSize: spec({ id: 'org.eclipse.elk.radial.compactionStepSize', shortKey: 'radial.compactionStepSize', type: 'num', default: 1, algorithm: 'radial' }),
    sorter: spec({ id: 'org.eclipse.elk.radial.sorter', shortKey: 'radial.sorter', type: 'str', default: 'NONE', values: ['NONE', 'POLAR_COORDINATE', 'ID'], algorithm: 'radial' }),
    wedgeCriteria: spec({ id: 'org.eclipse.elk.radial.wedgeCriteria', shortKey: 'radial.wedgeCriteria', type: 'str', default: 'NODE_SIZE', values: ['LEAF_NUMBER', 'NODE_SIZE'], algorithm: 'radial' }),
    optimizationCriteria: spec({ id: 'org.eclipse.elk.radial.optimizationCriteria', shortKey: 'radial.optimizationCriteria', type: 'str', default: 'NONE', values: ['NONE', 'EDGE_LENGTH', 'EDGE_LENGTH_BY_POSITION', 'CROSSING_MINIMIZATION_BY_POSITION'], algorithm: 'radial' }),
  },
  mrtree: {
    weighting: spec({ id: 'org.eclipse.elk.mrtree.weighting', shortKey: 'mrtree.weighting', type: 'str', default: 'MODEL_ORDER', values: ['MODEL_ORDER', 'DESCENDANTS', 'FAN', 'CONSTRAINT'], algorithm: 'mrtree' }),
    searchOrder: spec({ id: 'org.eclipse.elk.mrtree.searchOrder', shortKey: 'mrtree.searchOrder', type: 'str', default: 'DFS', values: ['DFS', 'BFS'], algorithm: 'mrtree' }),
    positionConstraint: spec({ id: 'org.eclipse.elk.mrtree.positionConstraint', shortKey: 'mrtree.positionConstraint', type: 'num', default: -1, algorithm: 'mrtree' }),
    edgeRoutingMode: spec({ id: 'org.eclipse.elk.mrtree.edgeRoutingMode', shortKey: 'mrtree.edgeRoutingMode', type: 'str', default: 'AVOID_OVERLAP', values: ['NONE', 'MIDDLE_TO_MIDDLE', 'AVOID_OVERLAP'], algorithm: 'mrtree' }),
    treeLevel: spec({ id: 'org.eclipse.elk.mrtree.treeLevel', shortKey: 'mrtree.treeLevel', type: 'num', default: 0, algorithm: 'mrtree' }),
    compaction: spec({ id: 'org.eclipse.elk.mrtree.compaction', shortKey: 'mrtree.compaction', type: 'bool', default: false, algorithm: 'mrtree' }),
    edgeEndTextureLength: spec({ id: 'org.eclipse.elk.mrtree.edgeEndTextureLength', shortKey: 'mrtree.edgeEndTextureLength', type: 'num', default: 7, algorithm: 'mrtree' }),
  },
  disco: {
    // spacingComponentComponent / edgeThickness 是 core 参数 → 从 CORE 引用（disco options.ts 用 CORE.*）
    componentCompactionStrategy: spec({ id: 'org.eclipse.elk.disco.componentCompaction.strategy', shortKey: 'disco.componentCompaction.strategy', type: 'str', default: 'POLYOMINO', values: ['POLYOMINO'], algorithm: 'disco' }),
    componentLayoutAlgorithm: spec({ id: 'org.eclipse.elk.disco.componentCompaction.componentLayoutAlgorithm', shortKey: 'disco.componentCompaction.componentLayoutAlgorithm', type: 'str', default: 'UNDEFINED', algorithm: 'disco' }),
    debugDiscoGraph: spec({ id: 'org.eclipse.elk.disco.debug.discoGraph', shortKey: 'disco.debug.discoGraph', type: 'bool', default: false, algorithm: 'disco' }),
    debugDiscoPolys: spec({ id: 'org.eclipse.elk.disco.debug.discoPolys', shortKey: 'disco.debug.discoPolys', type: 'bool', default: false, algorithm: 'disco' }),
    polyominoFill: spec({ id: 'org.eclipse.elk.alg.common.compaction.polyomino.fill', shortKey: 'alg.common.compaction.polyomino.fill', type: 'bool', default: true, algorithm: 'disco' }),
    polyominoLowLevelSort: spec({ id: 'org.eclipse.elk.alg.common.compaction.polyomino.lowLevelSort', shortKey: 'alg.common.compaction.polyomino.lowLevelSort', type: 'str', default: 'BY_SIZE_AND_SHAPE', values: ['BY_SIZE', 'BY_SIZE_AND_SHAPE'], algorithm: 'disco' }),
    polyominoHighLevelSort: spec({ id: 'org.eclipse.elk.alg.common.compaction.polyomino.highLevelSort', shortKey: 'alg.common.compaction.polyomino.highLevelSort', type: 'str', default: 'NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST', values: ['CORNER_CASES_THAN_SINGLE_SIDE_LAST', 'NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST'], algorithm: 'disco' }),
    polyominoTraversalStrategy: spec({ id: 'org.eclipse.elk.alg.common.compaction.polyomino.traversalStrategy', shortKey: 'alg.common.compaction.polyomino.traversalStrategy', type: 'str', default: 'QUADRANTS_LINE_BY_LINE', values: ['SPIRAL', 'LINE_BY_LINE', 'MANHATTAN', 'JITTER', 'QUADRANTS_MANHATTAN', 'QUADRANTS_LINE_BY_LINE', 'COMBINE_LINE_BY_LINE_MANHATTAN', 'COMBINE_JITTER_MANHATTAN', 'QUADRANTS_JITTER'], algorithm: 'disco' }),
  },
  force: {
    forceModel: spec({ id: 'org.eclipse.elk.force.model', shortKey: 'force.model', type: 'str', default: 'FRUCHTERMAN_REINGOLD', values: ['FRUCHTERMAN_REINGOLD', 'EADES'], algorithm: 'force' }),
    forceIterations: spec({ id: 'org.eclipse.elk.force.iterations', shortKey: 'force.iterations', type: 'num', default: 300, algorithm: 'force' }),
    forceRepulsivePower: spec({ id: 'org.eclipse.elk.force.repulsivePower', shortKey: 'force.repulsivePower', type: 'num', default: 0, algorithm: 'force' }),
    forceTemperature: spec({ id: 'org.eclipse.elk.force.temperature', shortKey: 'force.temperature', type: 'num', default: 0.001, algorithm: 'force' }),
    forceRepulsion: spec({ id: 'org.eclipse.elk.force.repulsion', shortKey: 'force.repulsion', type: 'num', default: 5.0, algorithm: 'force' }),
    stressFixed: spec({ id: 'org.eclipse.elk.stress.fixed', shortKey: 'stress.fixed', type: 'bool', default: false, algorithm: 'force' }),
    stressDesiredEdgeLength: spec({ id: 'org.eclipse.elk.stress.desiredEdgeLength', shortKey: 'stress.desiredEdgeLength', type: 'num', default: 100.0, algorithm: 'force' }),
    stressDimension: spec({ id: 'org.eclipse.elk.stress.dimension', shortKey: 'stress.dimension', type: 'str', default: 'XY', values: ['X', 'Y', 'XY'], algorithm: 'force' }),
    stressEpsilon: spec({ id: 'org.eclipse.elk.stress.epsilon', shortKey: 'stress.epsilon', type: 'num', default: 10e-4, algorithm: 'force' }),
    stressIterationLimit: spec({ id: 'org.eclipse.elk.stress.iterationLimit', shortKey: 'stress.iterationLimit', type: 'num', default: 2147483647, algorithm: 'force' }),
  },
  rectpacking: {
    widthApproximationStrategy: spec({ id: 'org.eclipse.elk.rectpacking.widthApproximation.strategy', shortKey: 'rectpacking.widthApproximation.strategy', type: 'str', default: 'GREEDY', values: ['GREEDY', 'TARGET_WIDTH'], algorithm: 'rectpacking' }),
    widthApproximationTargetWidth: spec({ id: 'org.eclipse.elk.rectpacking.widthApproximation.targetWidth', shortKey: 'rectpacking.widthApproximation.targetWidth', type: 'num', default: -1, algorithm: 'rectpacking' }),
    widthApproximationOptimizationGoal: spec({ id: 'org.eclipse.elk.rectpacking.widthApproximation.optimizationGoal', shortKey: 'rectpacking.widthApproximation.optimizationGoal', type: 'str', default: 'MAX_SCALE_DRIVEN', values: ['ASPECT_RATIO_DRIVEN', 'MAX_SCALE_DRIVEN', 'AREA_DRIVEN'], algorithm: 'rectpacking' }),
    widthApproximationLastPlaceShift: spec({ id: 'org.eclipse.elk.rectpacking.widthApproximation.lastPlaceShift', shortKey: 'rectpacking.widthApproximation.lastPlaceShift', type: 'bool', default: true, algorithm: 'rectpacking' }),
    packingStrategy: spec({ id: 'org.eclipse.elk.rectpacking.packing.strategy', shortKey: 'rectpacking.packing.strategy', type: 'str', default: 'COMPACTION', values: ['COMPACTION', 'SIMPLE', 'NONE'], algorithm: 'rectpacking' }),
    packingCompactionRowHeightReevaluation: spec({ id: 'org.eclipse.elk.rectpacking.packing.compaction.rowHeightReevaluation', shortKey: 'rectpacking.packing.compaction.rowHeightReevaluation', type: 'bool', default: false, algorithm: 'rectpacking' }),
    packingCompactionIterations: spec({ id: 'org.eclipse.elk.rectpacking.packing.compaction.iterations', shortKey: 'rectpacking.packing.compaction.iterations', type: 'num', default: 1, algorithm: 'rectpacking' }),
    whiteSpaceEliminationStrategy: spec({ id: 'org.eclipse.elk.rectpacking.whiteSpaceElimination.strategy', shortKey: 'rectpacking.whiteSpaceElimination.strategy', type: 'str', default: 'NONE', values: ['NONE', 'EQUAL_BETWEEN_STRUCTURES', 'TO_ASPECT_RATIO'], algorithm: 'rectpacking' }),
    trybox: spec({ id: 'org.eclipse.elk.rectpacking.trybox', shortKey: 'rectpacking.trybox', type: 'bool', default: false, algorithm: 'rectpacking' }),
    orderBySize: spec({ id: 'org.eclipse.elk.rectpacking.orderBySize', shortKey: 'rectpacking.orderBySize', type: 'bool', default: false, algorithm: 'rectpacking' }),
    desiredPosition: spec({ id: 'org.eclipse.elk.rectpacking.desiredPosition', shortKey: 'rectpacking.desiredPosition', type: 'num', default: -1, algorithm: 'rectpacking' }),
    currentPosition: spec({ id: 'org.eclipse.elk.rectpacking.currentPosition', shortKey: 'rectpacking.currentPosition', type: 'num', default: -1, algorithm: 'rectpacking' }),
    inNewRow: spec({ id: 'org.eclipse.elk.rectpacking.inNewRow', shortKey: 'rectpacking.inNewRow', type: 'bool', default: false, algorithm: 'rectpacking' }),
  },
  spore: {
    processingOrderTreeConstruction: spec({ id: 'org.eclipse.elk.processingOrder.treeConstruction', shortKey: 'processingOrder.treeConstruction', type: 'str', default: 'MINIMUM_SPANNING_TREE', values: ['MINIMUM_SPANNING_TREE', 'MAXIMUM_SPANNING_TREE'], algorithm: 'spore' }),
    processingOrderSpanningTreeCostFunction: spec({ id: 'org.eclipse.elk.processingOrder.spanningTreeCostFunction', shortKey: 'processingOrder.spanningTreeCostFunction', type: 'str', default: 'CIRCLE_UNDERLAP', values: ['CENTER_DISTANCE', 'CIRCLE_UNDERLAP', 'RECTANGLE_UNDERLAP', 'INVERTED_OVERLAP', 'MINIMUM_ROOT_DISTANCE'], algorithm: 'spore' }),
    processingOrderPreferredRoot: spec({ id: 'org.eclipse.elk.processingOrder.preferredRoot', shortKey: 'processingOrder.preferredRoot', type: 'str', default: 'UNDEFINED', algorithm: 'spore' }),
    processingOrderRootSelection: spec({ id: 'org.eclipse.elk.processingOrder.rootSelection', shortKey: 'processingOrder.rootSelection', type: 'str', default: 'CENTER_NODE', values: ['FIXED', 'CENTER_NODE'], algorithm: 'spore' }),
    compactionStrategy: spec({ id: 'org.eclipse.elk.compaction.compactionStrategy', shortKey: 'compaction.compactionStrategy', type: 'str', default: 'DEPTH_FIRST', values: ['DEPTH_FIRST'], algorithm: 'spore' }),
    compactionOrthogonal: spec({ id: 'org.eclipse.elk.compaction.orthogonal', shortKey: 'compaction.orthogonal', type: 'bool', default: false, algorithm: 'spore' }),
    overlapRemovalMaxIterations: spec({ id: 'org.eclipse.elk.overlapRemoval.maxIterations', shortKey: 'overlapRemoval.maxIterations', type: 'num', default: 64, algorithm: 'spore' }),
    overlapRemovalRunScanline: spec({ id: 'org.eclipse.elk.overlapRemoval.runScanline', shortKey: 'overlapRemoval.runScanline', type: 'bool', default: true, algorithm: 'spore' }),
  },
  topdownpacking: {
    hierarchicalNodeWidth: spec({ id: 'org.eclipse.elk.topdown.hierarchicalNodeWidth', shortKey: 'topdown.hierarchicalNodeWidth', type: 'num', default: 150, algorithm: 'topdownpacking' }),
    hierarchicalNodeAspectRatio: spec({ id: 'org.eclipse.elk.topdown.hierarchicalNodeAspectRatio', shortKey: 'topdown.hierarchicalNodeAspectRatio', type: 'num', default: 1.414, algorithm: 'topdownpacking' }),
    nodeArrangementStrategy: spec({ id: 'org.eclipse.elk.topdownpacking.nodeArrangement.strategy', shortKey: 'topdownpacking.nodeArrangement.strategy', type: 'str', default: 'LEFT_RIGHT_TOP_DOWN_NODE_PLACER', values: ['LEFT_RIGHT_TOP_DOWN_NODE_PLACER'], algorithm: 'topdownpacking' }),
    whitespaceEliminationStrategy: spec({ id: 'org.eclipse.elk.topdownpacking.whitespaceElimination.strategy', shortKey: 'topdownpacking.whitespaceElimination.strategy', type: 'str', default: 'BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR', values: ['BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR'], algorithm: 'topdownpacking' }),
  },
  vertiflex: {
    verticalConstraint: spec({ id: 'org.eclipse.elk.vertiflex.verticalConstraint', shortKey: 'vertiflex.verticalConstraint', type: 'num', default: 0, algorithm: 'vertiflex' }),
    layoutStrategy: spec({ id: 'org.eclipse.elk.vertiflex.layoutStrategy', shortKey: 'vertiflex.layoutStrategy', type: 'str', default: 'STRAIGHT', values: ['STRAIGHT', 'BEND'], algorithm: 'vertiflex' }),
    layerDistance: spec({ id: 'org.eclipse.elk.vertiflex.layerDistance', shortKey: 'vertiflex.layerDistance', type: 'num', default: 50, algorithm: 'vertiflex' }),
    considerNodeModelOrder: spec({ id: 'org.eclipse.elk.vertiflex.considerNodeModelOrder', shortKey: 'vertiflex.considerNodeModelOrder', type: 'bool', default: true, algorithm: 'vertiflex' }),
  },
} as const

/** 全部 OptionSpec 平铺（校验/遍历用）。 */
export const ALL_SPECS: readonly OptionSpec<unknown, string>[] = [
  ...Object.values(CORE),
  ...Object.values(ALG.radial),
  ...Object.values(ALG.mrtree),
  ...Object.values(ALG.disco),
  ...Object.values(ALG.force),
  ...Object.values(ALG.rectpacking),
  ...Object.values(ALG.spore),
  ...Object.values(ALG.topdownpacking),
  ...Object.values(ALG.vertiflex),
]
