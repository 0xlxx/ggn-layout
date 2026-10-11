# elk-layout 算法差距清单 (oracle 56 失败)

> 来源: OPT_MAP 补齐后 (输入完整化) oracle 重新生成, 暴露的 ggn 与 ELK Java 真实算法差距。
> 之前"对称缺失"掩盖了这些差距 (两边都缺 padding 等选项), 现在输入完整, 差异显形。
> 这是**健康信号**: 验证体系在暴露真实算法缺口, 修复后 ggn 更接近 ELK。

## 概况

- oracle 总测试: 688 (examples 85 + tests 386 + tickets 217)
- 通过 654 / 失败 34 (2026-08-10 更新)
- 失败分类: 5 复刻 jar 报错 (已知, jar 自身报错) + 29 坐标/布局算法差距
- **已修 (2026-08-10)**: 628 — coerceVal object 的 Padding 解析支持 `;` 分隔
  (`[top=0.0;left=0.0,...]`, ELK 测试格式) → 此前只 split ',' → top/left 丢失 → NaN.
- **已修 (2026-08-10)**: 容器配置 padding 应用到子图 —
  buildLGraphFromParsed 此前只加 label padding, 未应用父节点 `org.eclipse.elk.padding`
  (489: [5,5,5,5] → 子节点在 12 vs jar 5). 修复: buildLGraphFromParsed + elkt2test 生成测试
  子图 padding = 配置 padding + label 占位 (全 4 边). 修 7 测试 (489×2, 457, 425, splines×3).
- **已修 (2026-08-10)**: 273_insideSelfLoopsWithLabels — nodeSize.minimum 裸键 `minimum` (OPT_MAP→
  nodeSize.minimum) 未转对象 → NODE_SIZE_MINIMUM 字符串 → 布局 NaN. 修复: elkt2test nodeOpts /
  buildLGraphFromParsed / applyGraphPropsToLGraph 三处特殊处理条件改为
  `m.ggn === 'org.eclipse.elk.nodeSize.minimum'` (涵盖裸键 minimum).
- **已修 (2026-08-10)**:
  1. flexible_ports 崩溃回归 — `coerceVal` 支持 `'object'` 类型
     (padding / spacing.portsSurrounding / nodeLabels.padding → 对象), 消除 NaN → network-simplex 崩溃 (56→54);
  2. contentAlignment 类别 (2 模型全修) — `coerceVal` 支持 `'enumset'` (contentAlignment /
     nodeLabels.placement → string[]), `resizeParentNode` 内容对齐 (H_CENTER/H_RIGHT/V_CENTER/V_BOTTOM),
     `horRestored` 分支应用 `nodeSize.minimum` (max(actualSize, minimum)) (54→52)。

## 复刻 jar 报错 (5, 已知, 非算法差距)

| 模型 | jar 行为 |
|---|---|
| examples/hierarchicalLayoutMixing, tickets/588, 665 | `algorithm 'elk.stress'/'stress' not found` (jar 缺 stress 插件) |
| examples/interactiveRectpacking_hierarchy | `algorithm 'rectpacking' not found` |
| examples/modelOrderCycleBreaking | `NullPointerException` (jar 自身 NPE) |

## 算法差距 (51) — 按根因分类

### A. 容器 OUTSIDE label spacing — 部分修复 (2026-08-10)
- ✅ direction, mixingDirection (calculateNodeMargin 补 OUTSIDE V_TOP label 区 → margin.top=5 → 层内间距对齐)
- ⏳ nodeLabelPlacement, insideNodeLabels_01, variants, outside_placement(2): label 有尺寸, 需完整 NodeLabelPlacer
- 模型: direction✅, mixingDirection✅, nodeLabelPlacement, insideNodeLabels_01, variants, outside_placement, outside_placement_hpriority
- **根因**: ELK 容器尺寸 = 内容框 + padding + **outside label 区** (NodeSizeCalculator);
  容器有 OUTSIDE V_TOP label 时, 顶部加 `nodeLabelSpacing` (默认 5) + label 高度。
  ggn `resizeParentNode` (src/layered-layout-provider.ts:151) 只算内容边界 + padding, **不含 outside label 区**。
- **实证**: direction 去掉 label 后 jar 布局 (容器高 54, 间距 74) 与 ggn 完全一致;
  有 label (0x0 OUTSIDE) 时 jar 容器高 59 (+5) → 间距 79 vs ggn 74。
- **修复方向** (已试, 未生效): 
  - 给容器高 +5 (resizeParentNode) ❌ jar 容器高仍 54, label 区在外;
  - 给容器 margin.top=5 ❌ ggn P4 层内放置不读 margin.top (y 不变)。
- **结论 (2026-08-10 完整根因链)**: ggn **没有节点 label 放置** (仅 recenterNodeLabelsRecursive
  居中 x; OUTSIDE V_TOP label 留在节点内 y=5)。ELK 用 `NodeLabelPlacer` 把 OUTSIDE label 放节点外
  (y 负 + spacing) → `calculateNodeMargin` margin.top=5 → P4 层内间距 (transformLayer 含 margin)
  → 容器间距 +5。ggn 缺 NodeLabelPlacer 移植 (大工程, alg.common 核心组件)。

### B. compaction 节点压缩 (约 8 个)
- 模型: compaction_oned/labels1, labels2, edgeLabelAndSplines, south_port,
  selfloop_crash, selfloop_spline, moreThanOneStraightSegmentPath(2)
- 状态: 未诊断 (ggn compaction 与 ELK OneDimensionalCompactor 差距)

### C. BK 节点放置 (约 4 个) — fixedAlignment/edgeStraightening 生效后
- 模型: node_placement/bk/classes_leftup, classes_rightup, straightEdgesLeft, straightEdgesRight
- 状态: OPT_MAP 补 `fixedAlignment`/`edgeStraightening` 后 ggn 应用, 但 BK 算法与 ELK 有差距

### D. highDegreeNodes (2) — 选项应用后 ggn 缺算法
- 模型: high_degree_nodes/Fan, high-degree-example
- 状态: ggn 未实现 ELK 的 high degree nodes 处理 (P3 前的 Hdm 分支)

### E. contentAlignment (2) — ✅ 已修 (2026-08-10)
- 模型: content_alignment/content_centered, content_centered_with_external_ports

### F. partitioning (1 模型 2 测试)
- 模型: user-hints/layered/partitioning (partitioning.activate 生效)

### G. flexible_ports (2) — portPort/nodeNode 简写生效
- 模型: node_placement/flexible_ports/graph01, graph02

### H. spacing/padding (约 7 个)
- 模型: spacing/components, spacing/nodesEdges, spacing/padding, spacing/ports,
  tickets/489_paddingAndMinSize_Large, 489_Small, 457_boxLayouterIgnoresMinimumSize, 475_fixedLayoutWithLongLabels

### I. splines / selfLoop / edgeLabel / insideSelfLoops (约 11 个)
- 模型: splines/north_south_ports_1, sloppy_overlaps_3, three_edges_inverted_ports(2),
  tickets/273_insideSelfLoopsWithLabels, 425_selfLoopInCompoundNode,
  edge_label_placement/edgeLabelSideSelection02, hierarchy01,
  port_label_placement/inside_compound_nodes_02, connected_components/flat01,
  tickets/628_hierarchyAwareLayoutProcessor, 701_portLabels

## 修复建议顺序

1. **A (容器 OUTSIDE label spacing)**: 根因已诊断 + 实证, 影响 7 个模型, 修复集中在 resizeParentNode — 先修
2. B/C (compaction/BK): 大算法, 单独里程碑
3. D/E/F/G (选项应用后 ggn 缺算法): 需要移植对应 ELK 处理器
4. H/I: 逐个诊断

## 验证方法

- 每修一个: `bun x vitest run tests/oracle/generated` 看失败数下降 + 不引入新失败
- 回归: `bun run test:bdd` + `bun run verify:json-path` + `bun run verify:elkg-elkt`

---

## 2026-08-11 会话更新 (splines 移植 + 布局侧差分 319/348)

### 本轮成果 (verify-elkg-java-layout: 300 → 319/348, 节点差异 2, 边差异 14)

1. **splines 管线顺序修正** (layered-layout-provider.ts):
   ELK After-Phase-5 槽位实测序: `LONG_EDGE_JOINER < NS_PORT_POSTPROCESSOR < HORIZONTAL_COMPACTOR <
   LABEL_DUMMY_REMOVER < FINAL_SPLINE_BENDPOINTS_CALCULATOR < ...`。
   - FinalSplineBendpointsCalculator 必须在 **HorizontalGraphCompactor 之后**:
     压缩器读 `SPLINE_ROUTE_START` 收集 spline 垂直段并回写 segment bbox; 计算器用压缩后的 bbox。
     此前计算器在压缩器前 → 清空 SPLINE_ROUTE_START → 压缩器看不到 spline 段 → 过度压缩
     (labels/selfloop 节点 x −20 = edgeEdgeSpacing)。
   - 必须在 **NorthSouthPortPostprocessor 之后**: NSPost 设 `SPLINE_NS_PORT_Y_COORD`
     (ELK NorthSouthPortPostprocessor.processSplineInput/OutputPort), 计算器读它生成 NS 弯点。
   - north_south_ports_1/2/3 由 NSPost SPLINES 分支补设该属性修复。

2. **压缩器直线段控制点重分布** (lgraph-to-cgraph-transformer.ts `adjustSplineControlPoints`):
   ELK LGraphToCGraphTransformer 的 spline 特判 (applyLayout SPLINES 分支):
   - 自环弯点按源节点压缩位移 offset;
   - 直线段 bbox 均分到非直线段之间 (`adjustControlPointBetweenSegments` + `firstNonStraightSegment`)。
   修复 labels1/labels2 等 (straight 段 CP 落在正确槽位)。

3. **验证 harness 平行边多重集比较** (verify-elkg-java-layout.ts normGraph):
   同 source/target 平行边在 ELK 输出里顺序可能不同 (sloppy_curvature 3 条边 22.5/28.5/34.5 vs
   34.5/28.5/22.5), 原 Map.set 同键覆盖造成假差异 → 每个 key 存全部 section, 排序后逐条比较。
   消除 12 个假失败 (纯顺序差异, 视觉等价)。

### 剩余 15 个失败分类 (均非本轮引入)

| 类别 | 模型 | 根因 |
|---|---|---|
| 内部自环端点 | inside_outside, 167, 548 | ELK 对 compound 节点走 CompoundGraphPreprocessor 外部端口路径 (端点=端口锚点), 简单节点走 SelfLoopRouter 路由槽位 (端点=节点边界投影)。ggn getEdgeEndpoints 统一用边界投影 → compound 路径差 8-10px。区分规则未定 (273/297 FIXED_SIDE 用边界, 167 FIXED_SIDE 用锚点)。 |
| 外部端口沿边位置 | all_four_port_sides, hierarchy09, 194 | 外部端口 dummy 沿节点边界的位置 (NORTH x / WEST y) 与 ELK 差 8-28px, 随模型变化 (端口 index/position 处理差异)。 |
| 层级边 | hierarchy01, 455 | 跨层级边路由 (分层/外部端口偏移)。 |
| 压缩器 spline 垂直段 | moreThanOneStraightSegmentPath(2) | 垂直段 CNode 被压缩器大幅左移 (-240/-100/-280) → 缺与相邻节点/段的约束。存量。 |
| 自环 | selfloop_crash, 288, 352 | 自环弯点/端口锚点 (spline/compound 变体)。 |
| 节点尺寸 | 298 | 内部自环节点宽 4 vs jar 44 (缺 NodeSizeCalculator 对内部自环的扩展)。 |
| 标签精度 | edgeLabelShouldBeCentered | y 差 0.02 (标签间距浮点)。 |
