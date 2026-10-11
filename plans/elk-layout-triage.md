# elk-layout 696 失败三分法分类 (2026-08-07 v2, 官方 JsonImporter 后)

> ⚠️ 2026-09 包更名：`packages/elk-layout` → `packages/layout`（包名 `@ggn/elk-layout` → `@ggn/layout`）。本文写于更名前，正文里的旧路径按此映射阅读；结论与判据不变。


> 方法: `scripts/jar-triage.mjs` (ggn vs elkjs vs ELK Java 0.12.0 jar, ε=1)。
> 71 个失败 elkt 文件。jar = oracle (SSOT)。DebugMain 改用官方 ElkGraphJson importer 后:
> ③工具待修 36→5 (jar 崩 11→0), ①分歧冻结 4→5, ②真 bug 30→60。
>
> **2026-08-07 晚: L1 已切 jar oracle** (生成测试 = ggn vs 预生成 jar oracle, 见 verification 计划 M3)。
> 下方 60/5/5 是 elkjs 差分时代的历史快照; **当前权威 = `triage-registry.json` v2**
> (accepted 0 / bug 16 / tooling 7, 对应 L1 jar 24 失败)。本文件保留历史归因供追溯。

## ① 分歧冻结 (ggn≈jar, elkjs 错) → divergence.json 排除 (5 图) (5 图)
- `tests/layered/compaction_oned/selfloop/selfloop_crash.elkt` (5 节点)
- `tests/layered/connected_components/compound03.elkt` (21 节点)
- `tests/layered/splines/north_south_ports_1.elkt` (5 节点)
- `tests/layered/splines/three_edges_inverted_ports_2.elkt` (5 节点)
- `tickets/layered/608_unnecessaryCrossingMinimization.elkt` (3 节点)

## 机器可读登记册 (2026-08-07 方法论落地)

> 本文件的分类清单已同步为机器可读 `packages/elk-layout/triage-registry.json`
> (verdict: accepted/bug/tooling + reason), 并由 `scripts/diff-failures.mjs check`
> 作为失败硬门禁的数据源 (未分类失败 = CI 阻断)。本文件保留为人工可读的归因/历史快照;
> **变更以 registry 为准** (修一个 bug → 从 registry 移除对应 entry 并同步本文件)。

## ② 真 bug (ggn≠jar, jar≈elkjs) → 修复队列 (按 jar 输出修) (60 图)
- `examples/general/spacing/nodesEdges.elkt` (6 节点)
- `examples/ports/portConstraints.elkt` (9 节点)
- `examples/user-hints/interactive-constraints/interactiveLayeredLayout_motor_pseudo_positions.elkt` (6 节点)
- `examples/user-hints/interactive-constraints/interactiveLayeredLayout_nodeSizes.elkt` (2 节点)
- `examples/user-hints/interactive-constraints/interactiveLayeredLayout_nodeSizes_pseudo_positions.elkt` (2 节点)
- `examples/user-hints/interactive-constraints/interactiveLayeredLayout_separateComponents.elkt` (4 节点)
- `examples/user-hints/interactive-constraints/interactiveLayeredLayout_separateComponents_pseudo_positions.elkt` (4 节点)
- `examples/user-hints/model-order/modelOrderNoCrossingMin.elkt` (5 节点)
- `tests/core/label_placement/port_labels/variants.elkt` (18 节点)
- `tests/layered/compaction_oned/splines/moreThanOneStraightSegmentPath.elkt` (10 节点)
- `tests/layered/compaction_oned/splines/moreThanOneStraightSegmentPath2.elkt` (6 节点)
- `tests/layered/cross_counting/north_south_fixed_side.elkt` (21 节点)
- `tests/layered/edge_label_placement/hierarchy01.elkt` (19 节点)
- `tests/layered/edge_label_placement/northSouthPorts_down_down_01.elkt` (3 节点)
- `tests/layered/hierarchical_ports/hierarchy05.elkt` (8 节点)
- `tests/layered/hierarchical_ports/hierarchy09.elkt` (8 节点)
- `tests/layered/high_degree_nodes/Fan.elkt` (43 节点)
- `tests/layered/inverted_ports/feedback_edge.elkt` (4 节点)
- `tests/layered/labels/edge_label_layer_selection/end_layers_01.elkt` (8 节点)
- `tests/layered/labels/edge_label_side_selection/smart_04.elkt` (2 节点)
- `tests/layered/labels/edge_label_side_selection/smart_05.elkt` (4 节点)
- `tests/layered/labels_ordering/headLabels_singlePorts.elkt` (6 节点)
- `tests/layered/labels_ordering/tailLabels_singlePorts.elkt` (6 节点)
- `tests/layered/node_placement/KIPRA-1426/demo2-KIPRA-1426.elkt` (13 节点)
- `tests/layered/node_placement/bk/classes/classes_leftdown.elkt` (7 节点)
- `tests/layered/node_placement/bk/classes/classes_leftup.elkt` (7 节点)
- `tests/layered/node_placement/bk/classes/classes_rightdown.elkt` (7 节点)
- `tests/layered/node_placement/bk/classes/classes_rightup.elkt` (7 节点)
- `tests/layered/node_placement/bk/classes/classes_two_leftdown.elkt` (12 节点)
- `tests/layered/node_placement/bk/classes/classes_two_leftup.elkt` (12 节点)
- `tests/layered/node_placement/bk/classes/classes_two_rightdown.elkt` (12 节点)
- `tests/layered/node_placement/bk/classes/classes_two_rightdown_surrounded.elkt` (17 节点)
- `tests/layered/node_placement/bk/classes/classes_two_rightup.elkt` (12 节点)
- `tests/layered/node_placement/bk/classes/classes_two_samesize.elkt` (9 节点)
- `tests/layered/node_placement/flexible_ports/graph02.elkt` (4 节点)
- `tests/layered/north_south_ports/north_south_fixed_side.elkt` (21 节点)
- `tests/layered/self_loops/fixedSide.elkt` (6 节点)
- `tests/layered/self_loops/free.elkt` (7 节点)
- `tests/layered/self_loops/hyperLoops.elkt` (2 节点)
- `tests/layered/self_loops/south.elkt` (1 节点)
- `tests/layered/splines/hyperedges/hyperedges_2.elkt` (4 节点)
- `tests/layered/splines/sloppy_curvature.elkt` (3 节点)
- `tests/layered/splines/sloppy_overlaps_2.elkt` (5 节点)
- `tests/layered/splines/sloppy_overlaps_3.elkt` (6 节点)
- `tickets/layered/143_smallVerticalEdgeSegmentSpacing.elkt` (2 节点)
- `tickets/layered/288_selfLoopsCauseNPE_a.elkt` (3 节点)
- `tickets/layered/318_overlappingHorizontalEdgeSegments.elkt` (2 节点)
- `tickets/layered/341_polylineUnnecessaryBendpoints.elkt` (9 节点)
- `tickets/layered/347_polylineOnEdgeLabels.elkt` (6 节点)
- `tickets/layered/453_interactiveProblems.elkt` (4 节点)
- `tickets/layered/463_aioobe_with_self_loops.elkt` (11 节点)
- `tickets/layered/502_collapsingCompoundNode.elkt` (4 节点)
- `tickets/layered/504_brokenHyperedges.elkt` (5 节点)
- `tickets/layered/515_polylineOverNodeIncOut.elkt` (4 节点)
- `tickets/layered/515_polylineOverNodeIncoming.elkt` (3 节点)
- `tickets/layered/515_polylineOverNodeOutgoing.elkt` (3 节点)
- `tickets/layered/541_invertedComplexHeadLabels.elkt` (2 节点)
- `tickets/layered/541_invertedSimpleHeadLabels.elkt` (2 节点)
- `tickets/layered/734_nodeEdgeSpacingFlatMoreComplex.elkt` (3 节点)
- `tickets/layered/870_networkSimplexNodePlacer.elkt` (3 节点)

## ② 真 bug (ggn 崩溃) → 修复队列 (1 图)
- `tests/layered/connected_components/compound06.elkt` (3 节点)

## ③ 工具待修 (三方各差, 需进一步查 harness/模型) (5 图)
- `tests/layered/connected_components/all_four_port_sides.elkt` (4 节点)
- `tests/layered/connected_components/compound04.elkt` (5 节点)
- `tests/layered/connected_components/compound05.elkt` (7 节点)
- `tickets/layered/194_excessiveWhiteSpace.elkt` (10 节点)
- `tickets/layered/302_brokenSplineSelfLoops.elkt` (1 节点)

