/** OPT_MAP + 值类型转换 — 共享纯模块 (无 node 依赖, scripts 与 demo 共用).
 * elkt 短键 → ggn/elkjs 完整 key + 类型. 从 scripts/elkt2test.mjs 提取, 单一来源. */

export interface OptMeta {
  ggn: string
  elkjs: string
  type: 'str' | 'num' | 'bool' | 'enumset' | 'object'
  values?: string[]
}

export const OPT_MAP: Record<string, OptMeta> = {
  'direction': { ggn: 'org.eclipse.elk.direction', elkjs: 'elk.direction', type: 'str' },
  'position': { ggn: 'org.eclipse.elk.position', elkjs: 'elk.position', type: 'str' },
  'edgeRouting': { ggn: 'org.eclipse.elk.edgeRouting', elkjs: 'elk.edgeRouting', type: 'str' },
  'spacing.nodeNode': { ggn: 'org.eclipse.elk.spacing.nodeNode', elkjs: 'elk.spacing.nodeNode', type: 'num' },
  'spacing.edgeEdge': { ggn: 'org.eclipse.elk.spacing.edgeEdge', elkjs: 'elk.spacing.edgeEdge', type: 'num' },
  'spacing.nodeSelfLoop': { ggn: 'org.eclipse.elk.spacing.nodeSelfLoop', elkjs: 'elk.spacing.nodeSelfLoop', type: 'num' },
  'spacing.portPort': { ggn: 'org.eclipse.elk.spacing.portPort', elkjs: 'elk.spacing.portPort', type: 'num' },
  'spacing.edgeNode': { ggn: 'org.eclipse.elk.spacing.edgeNode', elkjs: 'elk.spacing.edgeNode', type: 'num' },
  'spacing.edgeLabel': { ggn: 'org.eclipse.elk.spacing.edgeLabel', elkjs: 'elk.spacing.edgeLabel', type: 'num' },
  'spacing.labelLabel': { ggn: 'org.eclipse.elk.spacing.labelLabel', elkjs: 'elk.spacing.labelLabel', type: 'num' },
  'spacing.labelNode': { ggn: 'org.eclipse.elk.spacing.labelNode', elkjs: 'elk.spacing.labelNode', type: 'num' },
  'spacing.edgeEdgeBetweenLayers': { ggn: 'org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers', elkjs: 'elk.layered.spacing.edgeEdgeBetweenLayers', type: 'num' },
  'spacing.nodeNodeBetweenLayers': { ggn: 'org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers', elkjs: 'elk.layered.spacing.nodeNodeBetweenLayers', type: 'num' },
  'spacing.edgeNodeBetweenLayers': { ggn: 'org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers', elkjs: 'elk.layered.spacing.edgeNodeBetweenLayers', type: 'num' },
  'crossingMinimization.strategy': { ggn: 'org.eclipse.elk.layered.crossingMinimization.strategy', elkjs: 'elk.layered.crossingMinimization.strategy', type: 'str' },
  'crossingMinimization.greedySwitch.type': { ggn: 'org.eclipse.elk.layered.crossingMinimization.greedySwitch.type', elkjs: 'elk.layered.crossingMinimization.greedySwitch.type', type: 'str' },
  'cycleBreaking.strategy': { ggn: 'org.eclipse.elk.layered.cycleBreaking.strategy', elkjs: 'elk.layered.cycleBreaking.strategy', type: 'str' },
  'layering.strategy': { ggn: 'org.eclipse.elk.layered.layering.strategy', elkjs: 'elk.layered.layering.strategy', type: 'str' },
  'nodePlacement.strategy': { ggn: 'org.eclipse.elk.layered.nodePlacement.strategy', elkjs: 'elk.layered.nodePlacement.strategy', type: 'str' },
  'considerModelOrder.strategy': { ggn: 'org.eclipse.elk.layered.considerModelOrder.strategy', elkjs: 'elk.layered.considerModelOrder.strategy', type: 'str' },
  'mergeEdges': { ggn: 'org.eclipse.elk.layered.mergeEdges', elkjs: 'elk.layered.mergeEdges', type: 'bool' },
  'mergeHierarchyEdges': { ggn: 'org.eclipse.elk.layered.mergeHierarchyEdges', elkjs: 'elk.layered.mergeHierarchyEdges', type: 'bool' },
  'feedbackEdges': { ggn: 'org.eclipse.elk.layered.feedbackEdges', elkjs: 'elk.layered.feedbackEdges', type: 'bool' },
  'thoroughness': { ggn: 'org.eclipse.elk.layered.thoroughness', elkjs: 'elk.layered.thoroughness', type: 'num' },
  'randomSeed': { ggn: 'org.eclipse.elk.randomSeed', elkjs: 'elk.randomSeed', type: 'num' },
  'separateConnectedComponents': { ggn: 'org.eclipse.elk.separateConnectedComponents', elkjs: 'elk.separateConnectedComponents', type: 'bool' },
  'hierarchyHandling': { ggn: 'org.eclipse.elk.hierarchyHandling', elkjs: 'elk.hierarchyHandling', type: 'str' },
  'portConstraints': { ggn: 'org.eclipse.elk.portConstraints', elkjs: 'elk.portConstraints', type: 'str' },
  'insideSelfLoops.activate': { ggn: 'org.eclipse.elk.insideSelfLoops.activate', elkjs: 'elk.insideSelfLoops.activate', type: 'bool' },
  'generatePositionAndLayerIds': { ggn: 'org.eclipse.elk.layered.generatePositionAndLayerIds', elkjs: 'elk.layered.generatePositionAndLayerIds', type: 'bool' },
  'nodeLabels.placement': { ggn: 'org.eclipse.elk.nodeLabels.placement', elkjs: 'elk.nodeLabels.placement', type: 'enumset', values: ['H_LEFT', 'H_CENTER', 'H_RIGHT', 'V_TOP', 'V_CENTER', 'V_BOTTOM', 'INSIDE', 'OUTSIDE', 'H_PRIORITY'] },
  'portLabels.placement': { ggn: 'org.eclipse.elk.portLabels.placement', elkjs: 'elk.portLabels.placement', type: 'enumset', values: ['OUTSIDE', 'INSIDE', 'NEXT_TO_PORT_IF_POSSIBLE', 'ALWAYS_SAME_SIDE', 'ALWAYS_OTHER_SAME_SIDE', 'SPACE_EFFICIENT'] },
  'allowNonFlowPortsToSwitchSides': { ggn: 'org.eclipse.elk.layered.allowNonFlowPortsToSwitchSides', elkjs: 'elk.layered.allowNonFlowPortsToSwitchSides', type: 'bool' },
  'directionCongruency': { ggn: 'org.eclipse.elk.layered.directionCongruency', elkjs: 'elk.layered.directionCongruency', type: 'str' },
  'portSortingStrategy': { ggn: 'org.eclipse.elk.layered.portSortingStrategy', elkjs: 'elk.portSortingStrategy', type: 'str' },
  'aspectRatio': { ggn: 'org.eclipse.elk.aspectRatio', elkjs: 'elk.aspectRatio', type: 'num' },
  'edgeRouting.selfLoopDistribution': { ggn: 'org.eclipse.elk.layered.edgeRouting.selfLoopDistribution', elkjs: 'elk.layered.edgeRouting.selfLoopDistribution', type: 'str' },
  'edgeRouting.selfLoopOrdering': { ggn: 'org.eclipse.elk.layered.edgeRouting.selfLoopOrdering', elkjs: 'elk.layered.edgeRouting.selfLoopOrdering', type: 'str' },
  'nodePlacement.bk.fixedAlignment': { ggn: 'org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment', elkjs: 'elk.layered.nodePlacement.bk.fixedAlignment', type: 'str' },
  'nodePlacement.bk.edgeStraightening': { ggn: 'org.eclipse.elk.layered.nodePlacement.bk.edgeStraightening', elkjs: 'elk.layered.nodePlacement.bk.edgeStraightening', type: 'str' },
  'layering.nodePromotion.strategy': { ggn: 'org.eclipse.elk.layered.layering.nodePromotion.strategy', elkjs: 'elk.layered.layering.nodePromotion.strategy', type: 'str' },
  'considerModelOrder.portModelOrder': { ggn: 'org.eclipse.elk.layered.considerModelOrder.portModelOrder', elkjs: 'elk.layered.considerModelOrder.portModelOrder', type: 'bool' },
  'edgeLabels.placement': { ggn: 'org.eclipse.elk.edgeLabels.placement', elkjs: 'elk.edgeLabels.placement', type: 'str' },
  'spacing.labelPort': { ggn: 'org.eclipse.elk.spacing.labelPortHorizontal', elkjs: 'elk.spacing.labelPortHorizontal', type: 'num' },
  'insideSelfLoops.yo': { ggn: 'org.eclipse.elk.insideSelfLoops.yo', elkjs: 'elk.insideSelfLoops.yo', type: 'bool' },
  // ── 节点级选项 (SSOT 保真: elktToElkJson/generateTest 都经 OPT_MAP 发射/应用) ──
  'nodeSize.constraints': { ggn: 'org.eclipse.elk.nodeSize.constraints', elkjs: 'elk.nodeSize.constraints', type: 'enumset', values: ['PORTS', 'PORT_LABELS', 'NODE_LABELS', 'MINIMUM_SIZE'] },
  'nodeSize.minimum': { ggn: 'org.eclipse.elk.nodeSize.minimum', elkjs: 'elk.nodeSize.minimum', type: 'str' },
  'nodeSize.options': { ggn: 'org.eclipse.elk.nodeSize.options', elkjs: 'elk.nodeSize.options', type: 'str' },
  'nodeLabels.padding': { ggn: 'org.eclipse.elk.nodeLabels.padding', elkjs: 'elk.nodeLabels.padding', type: 'object' },
  'nodeLabels.spacing': { ggn: 'org.eclipse.elk.nodeLabels.spacing', elkjs: 'elk.nodeLabels.spacing', type: 'num' },
  'layerConstraint': { ggn: 'org.eclipse.elk.layered.layering.layerConstraint', elkjs: 'elk.layered.layering.layerConstraint', type: 'str' },
  'layering.layerConstraint': { ggn: 'org.eclipse.elk.layered.layering.layerConstraint', elkjs: 'elk.layered.layering.layerConstraint', type: 'str' },
  'layering.layerChoiceConstraint': { ggn: 'org.eclipse.elk.layered.layering.layerChoiceConstraint', elkjs: 'elk.layered.layering.layerChoiceConstraint', type: 'num' },
  'crossingMinimization.positionChoiceConstraint': { ggn: 'org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint', elkjs: 'elk.layered.crossingMinimization.positionChoiceConstraint', type: 'num' },
  'crossingMinimization.semiInteractive': { ggn: 'org.eclipse.elk.layered.crossingMinimization.semiInteractive', elkjs: 'elk.layered.crossingMinimization.semiInteractive', type: 'bool' },
  'algorithm': { ggn: 'org.eclipse.elk.algorithm', elkjs: 'elk.algorithm', type: 'str' },
  'partitioning.partition': { ggn: 'org.eclipse.elk.partitioning.partition', elkjs: 'elk.partitioning.partition', type: 'num' },
  'spacing.portNode': { ggn: 'org.eclipse.elk.spacing.portNode', elkjs: 'elk.spacing.portNode', type: 'num' },
  'portAlignment.default': { ggn: 'org.eclipse.elk.portAlignment.default', elkjs: 'elk.portAlignment.default', type: 'str' },
  'portAlignment.west': { ggn: 'org.eclipse.elk.portAlignment.west', elkjs: 'elk.portAlignment.west', type: 'str' },
  'portAlignment.east': { ggn: 'org.eclipse.elk.portAlignment.east', elkjs: 'elk.portAlignment.east', type: 'str' },
  'portAlignment.north': { ggn: 'org.eclipse.elk.portAlignment.north', elkjs: 'elk.portAlignment.north', type: 'str' },
  'portAlignment.south': { ggn: 'org.eclipse.elk.portAlignment.south', elkjs: 'elk.portAlignment.south', type: 'str' },
  'commentBox': { ggn: 'org.eclipse.elk.commentBox', elkjs: 'elk.commentBox', type: 'bool' },
  'desiredPosition': { ggn: 'org.eclipse.elk.desiredPosition', elkjs: 'elk.desiredPosition', type: 'str' },
  'interactiveLayout': { ggn: 'org.eclipse.elk.interactiveLayout', elkjs: 'elk.interactiveLayout', type: 'bool' },
  // ── 补齐 (2026-08-10, 从 ELK jar 注册表反射; 此前缺失导致 elktToElkJson 不发射/ggn 不应用) ──
  // core 选项
  'padding': { ggn: 'org.eclipse.elk.padding', elkjs: 'elk.padding', type: 'object' },
  'noLayout': { ggn: 'org.eclipse.elk.noLayout', elkjs: 'elk.noLayout', type: 'bool' },
  'expandNodes': { ggn: 'org.eclipse.elk.expandNodes', elkjs: 'elk.expandNodes', type: 'bool' },
  'debugMode': { ggn: 'org.eclipse.elk.debugMode', elkjs: 'elk.debugMode', type: 'bool' },
  'alignment': { ggn: 'org.eclipse.elk.alignment', elkjs: 'elk.alignment', type: 'str' },
  'contentAlignment': { ggn: 'org.eclipse.elk.contentAlignment', elkjs: 'elk.contentAlignment', type: 'enumset', values: ['V_TOP', 'V_CENTER', 'V_BOTTOM', 'H_LEFT', 'H_CENTER', 'H_RIGHT'] },
  'spacing.portsSurrounding': { ggn: 'org.eclipse.elk.spacing.portsSurrounding', elkjs: 'elk.spacing.portsSurrounding', type: 'object' },
  'spacing.individual': { ggn: 'org.eclipse.elk.spacing.individual', elkjs: 'elk.spacing.individual', type: 'str' },
  'spacing.commentComment': { ggn: 'org.eclipse.elk.spacing.commentComment', elkjs: 'elk.spacing.commentComment', type: 'num' },
  'spacing.commentNode': { ggn: 'org.eclipse.elk.spacing.commentNode', elkjs: 'elk.spacing.commentNode', type: 'num' },
  'spacing.componentComponent': { ggn: 'org.eclipse.elk.spacing.componentComponent', elkjs: 'elk.spacing.componentComponent', type: 'num' },
  'portLabels.treatAsGroup': { ggn: 'org.eclipse.elk.portLabels.treatAsGroup', elkjs: 'elk.portLabels.treatAsGroup', type: 'bool' },
  'partitioning.activate': { ggn: 'org.eclipse.elk.partitioning.activate', elkjs: 'elk.partitioning.activate', type: 'bool' },
  // layered 选项
  'fixedAlignment': { ggn: 'org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment', elkjs: 'elk.layered.nodePlacement.bk.fixedAlignment', type: 'str' },
  'edgeStraightening': { ggn: 'org.eclipse.elk.layered.nodePlacement.bk.edgeStraightening', elkjs: 'elk.layered.nodePlacement.bk.edgeStraightening', type: 'str' },
  'mode': { ggn: 'org.eclipse.elk.layered.edgeRouting.splines.mode', elkjs: 'elk.layered.edgeRouting.splines.mode', type: 'str' },
  'postCompaction.strategy': { ggn: 'org.eclipse.elk.layered.compaction.postCompaction.strategy', elkjs: 'elk.layered.compaction.postCompaction.strategy', type: 'str' },
  'compaction.connectedComponents': { ggn: 'org.eclipse.elk.layered.compaction.connectedComponents', elkjs: 'elk.layered.compaction.connectedComponents', type: 'bool' },
  'edgeLabels.sideSelection': { ggn: 'org.eclipse.elk.layered.edgeLabels.sideSelection', elkjs: 'elk.layered.edgeLabels.sideSelection', type: 'str' },
  'edgeLabels.centerLabelPlacementStrategy': { ggn: 'org.eclipse.elk.layered.edgeLabels.centerLabelPlacementStrategy', elkjs: 'elk.layered.edgeLabels.centerLabelPlacementStrategy', type: 'str' },
  'highDegreeNodes.threshold': { ggn: 'org.eclipse.elk.layered.highDegreeNodes.threshold', elkjs: 'elk.layered.highDegreeNodes.threshold', type: 'num' },
  'highDegreeNodes.treatment': { ggn: 'org.eclipse.elk.layered.highDegreeNodes.treatment', elkjs: 'elk.layered.highDegreeNodes.treatment', type: 'bool' },
  'highDegreeNodes.treeHeight': { ggn: 'org.eclipse.elk.layered.highDegreeNodes.treeHeight', elkjs: 'elk.layered.highDegreeNodes.treeHeight', type: 'num' },
  'considerModelOrder.components': { ggn: 'org.eclipse.elk.layered.considerModelOrder.components', elkjs: 'elk.layered.considerModelOrder.components', type: 'str' },
  'considerModelOrder.longEdgeStrategy': { ggn: 'org.eclipse.elk.layered.considerModelOrder.longEdgeStrategy', elkjs: 'elk.layered.considerModelOrder.longEdgeStrategy', type: 'str' },
  'considerModelOrder.crossingCounterNodeInfluence': { ggn: 'org.eclipse.elk.layered.considerModelOrder.crossingCounterNodeInfluence', elkjs: 'elk.layered.considerModelOrder.crossingCounterNodeInfluence', type: 'num' },
  'crossingMinimization.greedySwitchHierarchical.type': { ggn: 'org.eclipse.elk.layered.crossingMinimization.greedySwitchHierarchical.type', elkjs: 'elk.layered.crossingMinimization.greedySwitchHierarchical.type', type: 'str' },
  'crossingMinimization.forceNodeModelOrder': { ggn: 'org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder', elkjs: 'elk.layered.crossingMinimization.forceNodeModelOrder', type: 'bool' },
  'nodeFlexibility': { ggn: 'org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility', elkjs: 'elk.layered.nodePlacement.networkSimplex.nodeFlexibility', type: 'str' },
  'nodeFlexibility.default': { ggn: 'org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default', elkjs: 'elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default', type: 'str' },
  // elkt 短键/别名 (ELK 注册用完整 key; elkt 里写短名/简写)
  'portPort': { ggn: 'org.eclipse.elk.spacing.portPort', elkjs: 'elk.spacing.portPort', type: 'num' },
  'nodeNode': { ggn: 'org.eclipse.elk.spacing.nodeNode', elkjs: 'elk.spacing.nodeNode', type: 'num' },
  'minimum': { ggn: 'org.eclipse.elk.nodeSize.minimum', elkjs: 'elk.nodeSize.minimum', type: 'str' },
  'greedySwitch.type': { ggn: 'org.eclipse.elk.layered.crossingMinimization.greedySwitch.type', elkjs: 'elk.layered.crossingMinimization.greedySwitch.type', type: 'str' },
  'positionChoiceConstraint': { ggn: 'org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint', elkjs: 'elk.layered.crossingMinimization.positionChoiceConstraint', type: 'num' },
  'sideSelection': { ggn: 'org.eclipse.elk.layered.edgeLabels.sideSelection', elkjs: 'elk.layered.edgeLabels.sideSelection', type: 'str' },
  // 第二轮扫描补充
  'nodeSize.fixedGraphSize': { ggn: 'org.eclipse.elk.nodeSize.fixedGraphSize', elkjs: 'elk.nodeSize.fixedGraphSize', type: 'bool' },
  // topdown 选项 (org.eclipse.elk.topdown.*, topdownpacking/box 等 topdown provider 用)
  'topdown.hierarchicalNodeWidth': { ggn: 'org.eclipse.elk.topdown.hierarchicalNodeWidth', elkjs: 'elk.topdown.hierarchicalNodeWidth', type: 'num' },
  'topdown.hierarchicalNodeAspectRatio': { ggn: 'org.eclipse.elk.topdown.hierarchicalNodeAspectRatio', elkjs: 'elk.topdown.hierarchicalNodeAspectRatio', type: 'num' },
  'topdownpacking.nodeArrangement.strategy': { ggn: 'org.eclipse.elk.topdownpacking.nodeArrangement.strategy', elkjs: 'elk.topdownpacking.nodeArrangement.strategy', type: 'str' },
  'topdownpacking.whitespaceElimination.strategy': { ggn: 'org.eclipse.elk.topdownpacking.whitespaceElimination.strategy', elkjs: 'elk.topdownpacking.whitespaceElimination.strategy', type: 'str' },
  // vertiflex 选项 (org.eclipse.elk.vertiflex.*, alg.vertiflex; idPrefix org.eclipse.elk.vertiflex)
  'vertiflex.verticalConstraint': { ggn: 'org.eclipse.elk.vertiflex.verticalConstraint', elkjs: 'elk.vertiflex.verticalConstraint', type: 'num' },
  'vertiflex.layoutStrategy': { ggn: 'org.eclipse.elk.vertiflex.layoutStrategy', elkjs: 'elk.vertiflex.layoutStrategy', type: 'str' },
  'vertiflex.layerDistance': { ggn: 'org.eclipse.elk.vertiflex.layerDistance', elkjs: 'elk.vertiflex.layerDistance', type: 'num' },
  'vertiflex.considerNodeModelOrder': { ggn: 'org.eclipse.elk.vertiflex.considerNodeModelOrder', elkjs: 'elk.vertiflex.considerNodeModelOrder', type: 'bool' },
  // spore 选项 (org.eclipse.elk.*, alg.spore; idPrefix org.eclipse.elk)
  'overlapRemoval.maxIterations': { ggn: 'org.eclipse.elk.overlapRemoval.maxIterations', elkjs: 'elk.overlapRemoval.maxIterations', type: 'num' },
  'overlapRemoval.runScanline': { ggn: 'org.eclipse.elk.overlapRemoval.runScanline', elkjs: 'elk.overlapRemoval.runScanline', type: 'bool' },
  'processingOrder.treeConstruction': { ggn: 'org.eclipse.elk.processingOrder.treeConstruction', elkjs: 'elk.processingOrder.treeConstruction', type: 'str' },
  'processingOrder.spanningTreeCostFunction': { ggn: 'org.eclipse.elk.processingOrder.spanningTreeCostFunction', elkjs: 'elk.processingOrder.spanningTreeCostFunction', type: 'str' },
  'processingOrder.rootSelection': { ggn: 'org.eclipse.elk.processingOrder.rootSelection', elkjs: 'elk.processingOrder.rootSelection', type: 'str' },
  'processingOrder.preferredRoot': { ggn: 'org.eclipse.elk.processingOrder.preferredRoot', elkjs: 'elk.processingOrder.preferredRoot', type: 'str' },
  'compaction.compactionStrategy': { ggn: 'org.eclipse.elk.compaction.compactionStrategy', elkjs: 'elk.compaction.compactionStrategy', type: 'str' },
  'compaction.orthogonal': { ggn: 'org.eclipse.elk.compaction.orthogonal', elkjs: 'elk.compaction.orthogonal', type: 'bool' },
  'structure.structureExtractionStrategy': { ggn: 'org.eclipse.elk.structure.structureExtractionStrategy', elkjs: 'elk.structure.structureExtractionStrategy', type: 'str' },
  'underlyingLayoutAlgorithm': { ggn: 'org.eclipse.elk.underlyingLayoutAlgorithm', elkjs: 'elk.underlyingLayoutAlgorithm', type: 'str' },
  'interactiveReferencePoint': { ggn: 'org.eclipse.elk.layered.interactiveReferencePoint', elkjs: 'elk.layered.interactiveReferencePoint', type: 'str' },
  'considerModelOrder': { ggn: 'org.eclipse.elk.layered.considerModelOrder.strategy', elkjs: 'elk.layered.considerModelOrder.strategy', type: 'str' },
  'portAlignment': { ggn: 'org.eclipse.elk.portAlignment.default', elkjs: 'elk.portAlignment.default', type: 'str' },
}

/** elkt 字符串反转义 (Xtext STRING 规则): \' → ', \" → ", \\ → \. */
export function unescapeElkt(s: string): string {
  return s.replace(/\\(['"\\])/g, (_: string, c: string) => c)
}

export function coerceVal(meta: OptMeta, raw: string) {
  let v = raw.trim()
  // 去引号 (ELK 复杂值如 padding/nodeLabels.placement 带引号)
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (meta.type === 'num') {
    // B4: Java LayoutOptionData.parseValue 对非法数值 (NumberFormatException) 返回 null → 选项不设置 (默认).
    const n = Number(v)
    return Number.isFinite(n) ? n : undefined
  }
  if (meta.type === 'bool') {
    // B4: Java Boolean.parseBoolean/Boolean.valueOf 是大小写不敏感 (仅 "true" 为真).
    return v.toLowerCase() === 'true'
  }
  if (meta.type === 'enumset') {
    // ELK EnumSet: "[A, B]" / "[A B C]" / "A B" → string[]
    // B3: Java enumSetForStringArray 按 [\[\]\s,]+ 切分; 括号形式仅按逗号切会把 "A B C" 合成单元素.
    const m = v.match(/^\[([^\]]*)\]$/)
    const parts = (m ? m[1]! : v).split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
    // ELK enumSetForStringArray: 任一分量非法 → 整个 enumset null → 选项不设置 (默认).
    // 实证: portLabels.placement: FIXED → [OUTSIDE] 默认 (fixed_positions_01).
    if (meta.values) {
      for (const part of parts) if (!meta.values.includes(part)) return undefined
    }
    return parts
  }
  if (meta.type === 'object') {
    // ELK 复杂对象: "[top=...,left=...,bottom=...,right=...]" (Padding) 或 "(w,h)" (向量)
    const pad = v.match(/^\[([^\]]*)\]$/)
    if (pad) {
      const obj: Record<string, number> = {}
      for (const kv of pad[1]!.split(/[,;]/)) {
        const eq = kv.split('=')
        if (eq.length === 2) {
          // B4: 分量非 finite（"top=foo"/"top=1.2.3"）→ 整个 padding 无效 → 不设置（Kepler 2026-08-16）
          const n = Number(eq[1]!.trim())
          if (!Number.isFinite(n)) return undefined
          obj[eq[0]!.trim()] = n
        }
      }
      return obj
    }
    const vec = v.match(/^\(([\d.]+)\s*,\s*([\d.]+)\)$/)
    if (vec) return { x: Number(vec[1]), y: Number(vec[2]) }
    // ELK 复杂对象标量/非法形态（审阅 P0-1/Kepler 2026-08-16）：ELK Java 实测（elkjs oracle）
    // 标量 padding（0 / "0" / 20 / "20"）与非法字符串（"foo"/"NaN"/"0px"）都是**无效形态** →
    // parseValue 失败 → 选项不设置 → 默认（root padding 默认 12、nodeLabels.padding 默认 5）。
    // 此前 coerceVal 返回字符串原样 → 消费处 padding.top undefined → NaN 坐标（比崩溃更危险：
    // 结构完整但坐标非法）。修复 = 非对象语法一律返回 undefined（B4 不设置），消费处走默认，
    // 坐标 finite；不 invent 四边对象（与 elkjs 实测 childA.y=12 对齐——标量不生效，非四边 0）。
    return undefined
  }
  return unescapeElkt(v)
}
