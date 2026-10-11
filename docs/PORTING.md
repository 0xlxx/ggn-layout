---
description: layout 移植标准 (SSOT=ELK Java 0.12.0, 方法论=Bun-in-Rust / typescript-go)
---

# layout 移植标准 (PORTING.md)

> 来源: [Rewriting Bun in Rust](https://bun.com/blog/bun-in-rust) (动态工作流/对抗审查/错误当工单)
>       + microsoft/typescript-go (file-by-file 保守移植 / 快照基线)
> 一句话: **移植不是重写** —— 机械对齐 ELK Java 语义, 用语言无关测试当唯一裁判,
>        对抗审查兜质量, 失败按模块当工单并行修, 出问题修流程不手修代码。

## 1. 定性: 移植, 不是重写

- **1:1 机械移植**: src/ 目录结构、类名、方法名、注释尽量与 ELK Java 源码一一对应,
  便于后续 ELK 上游发版时用 diff 增量搬运。
- **最小行为变更**: 先忠实对齐 Java 语义 (含怪癖), 再谈用现代 TS 语法重构。
- **TS 现代语法**: 在"语义等价"前提下用 TS 简洁/高性能写法; 不为移植而保留 Java 设计模式
  (如过度抽象/继承), 但**结构对齐优先于"更优雅"**。
- **反模式**: 不 stub、不跳过、不假装绿; "需要一大段注释解释 workaround 没问题" = 代码是错的。

## 2. SSOT (单一事实源)

| 层 | 标准 | 说明 |
|---|---|---|
| 验收 | **ELK Java 0.12.0 jar** | 所有坐标/结构对比以 jar 输出为 oracle |
| 单元测试 | **elk-java-unit** (移植 ELK Java JUnit) | 断言=结构性质 (不崩/无未分层/无空层/无反向边) + 坐标 |
| 差分 | elkjs 0.12.0 | 仅交叉参考/无回归基线, 不参与验收 |
| 基线 | 696 (examples/tests/tickets) | 失败集合与 triage-registry 逐名对比, 无新增 |

> **SSOT 源码 checkout 版本固定**: 本地参考源码 `/Users/bjorn/ai-dev/tmp/elk` 当前是
> **0.13.0-SNAPSHOT (master)** — 审阅时发现与其 v0.12.0 tag 在该文件上无 diff, 但为防基线
> 不一致, 移植前应 `git checkout v0.12.0` 固定到与 jar 一致版本 (2026-08-12 对抗审阅 P2#3)。

## 2.1 门禁运行约定

- **一律 `cd packages/layout` 再跑 vitest** (package vitest config `globals:true`; 仓库根跑会
  `describe is not defined` 假失败, R66)。
- **门禁范围** = `tests/api/` + `tests/bdd/` + `tests/unit/` + `tests/core/` + `tests/oracle/`;
  `tests/debug/` 是一次性调试探针 (模块轨迹/src-dist 对照/依赖 /tmp 产物), 已从默认
  `vitest run` 排除 (R71), 需要时显式 `npx vitest run tests/debug/<file>`。

## 3. 角色编组 (每任务簇)

| 角色 | 人数 | 职责 |
|---|---|---|
| Implementer (实现者) | 1 | 只写代码, 不审; 按失败簇领任务 |
| Adversarial Reviewer (对抗审查) | 2 | 独立上下文, **只看 diff**, 默认代码是错的; 专找"语法相同语义不同" |
| Fixer (修复者) | 1 | 应用审查结论 |
| Verifier (验证者) | 1 | 阶段 diff + 相关测试 + 696 无回归; 失败归因反馈 |
| Test-Quality Reviewer (测试质量) | 1 (共享) | 审测试冗余/是否覆盖算法性质, 不只靠覆盖率 |

- 并行原则: 失败簇之间**无因果依赖**才并行; 各簇独立文件集, 禁止并发全量测试。
- 人 (主编) 不计数: 分任务、盯 SSOT、拍板、**修流程不手修代码**。

## 4. 流程 (Bun 五步落地方案)

1. **出考卷**: 每个移植模块先有"语言无关断言" (性质/不变量/坐标), 再动代码。
2. **定规范**: 本文件 + 陷阱表 (§6); 新陷阱即时追加。
3. **试运行**: 新模块先 1 个实现+2 审+1 修跑通, 再铺开。
4. **全量执行/错误当工单**: 失败按模块分组 → 各簇 1 写 2 审 1 修 1 验证;
   隔离防踩踏 (独立文件集, 只跑相关 batch)。
5. **验证**: 阶段 diff → 696 无回归 → 全量 elk-java-unit 无新增 → 人工确认 → 合并。

## 5. 阶段 diff (渲染管线式定位)

ELK layered 是分阶段算法, 每阶段输入/输出与 jar 对比可二分定位 bug:

```
P1 断环 (cycleBreaking) → P2 分层 (layering + NodePromotion) → P3 排序 (crossingMin)
→ P4 节点放置 (BK) → P5 边路由 (orthogonal) → 后处理 (restore/resize)
```

- 工具: `scripts/stage-diff.mjs` + `scripts/generate-jar-oracle.mjs` (jar 每阶段快照)。
- 归因必须回答: "差异发生在哪个阶段 + 属于哪类陷阱", 否则不算收敛。

## 6. 陷阱表 (已踩的坑, 持续追加)

### 6.1 管线顺序 (IntermediateProcessorStrategy 枚举序)
- **NodePromotion (ordinal 70) 必须在 LayerConstraintPostprocessor (72) 之前**。
- 反了会: E/W 外部端口 dummy 在 NodePromotion 期间已恢复 → 无限提升死循环 + P3 边界层错乱。
- 检查: `layered-layout-provider.ts` 顺序 vs Java `IntermediateProcessorStrategy.java`。

### 6.1b ★ 管线对齐差异清单 (2026-08-10, GGN_PIPE_DBG vs ELK DebugMain 序列对比)

> 方法: ggn runModule 加 GGN_PIPE_DBG 日志; ELK 用 DebugMain Before_<Module> 快照; 对同一图
> (labels1 = SPLINES+postCompaction) 逐模块 diff. 交叉验证: ast-grep outline (CNode 子类
> LNodeCNode/VerticalSegmentCNode; VerticalSegment 被 transformer 引用; oned-compactor 经
> HorizontalGraphCompactor 被 layered-layout-provider import).

| ELK 处理器 | ELK 装配条件 | ggn 状态 | 影响 |
|---|---|---|---|
| InvertedPortProcessor | SPLINES/POLYLINE 无条件 (BASELINE); ORTHOGONAL: NON_FREE_PORTS\|\|FEEDBACK_EDGES\|\|HYPEREDGES | **已修** (原只 NON_FREE_PORTS\|\|FEEDBACK_EDGES, 缺 SPLINES/POLYLINE 无条件 + HYPEREDGES) | labels1 等反向边图 |
| HORIZONTAL_COMPACTOR | postCompaction != NONE && edgeRouting != POLYLINE (P5 后) | **已接入 + ORTHOGONAL 已放开 (2026-08-10 深夜)** — VerticalSegment/LNodeCNode/LGraphToCGraphTransformer/HorizontalGraphCompactor/EdgeAwareScanline 补齐; collectVerticalSegmentsOrthogonal + potentialGroupParents; **管线顺序对齐 ELK slot 17-22** (P5 → LongEdgeJoiner → NorthSouthPortPostprocessor → Compactor → LabelDummyRemover → EndLabelSorter → ReversedEdgeRestorer; 层级 root 另有 HPOER). NS dummy 必须先合并回真实节点 (south_port 实证) | compaction_oned 24/24; south_port 压缩后 101.33=ELK ✓; P2/P3 4→3 失败 |
| FINAL_SPLINE_BENDPOINTS_CALCULATOR | SPLINES 后 (P5 后) | **缺失** — 不生成 spline 弯点 | spline 边/弯点 |
| CONSTRAINTS_POSTPROCESSOR | INTERACTIVE_LAYOUT \|\| GENERATE_POSITION_AND_LAYER_IDS | 缺失 | interactive 图 |
| CENTER_LABEL_MANAGEMENT / END_NODE_PORT_LABEL_MANAGEMENT | LABEL_MANAGER != null (默认 null, programmatic-only) | **已核实覆盖** (默认不触发; doManageLabels 空间累计/center dummy 尺寸由 LabelDummyInserter 等价实现) | 自定义 label manager (ggn 无 ILabelManager, 测试无法触发) |
| HIERARCHICAL_NODE_RESIZER | INCLUDE_CHILDREN (P5 后) | 缺失 | 层级图尺寸 |
| INTERACTIVE_EXTERNAL_PORT_POSITIONER / HYPERNODE_PROCESSOR | INTERACTIVE / HYPERNODES | 缺失 | 特殊场景 |
| SINGLE_EDGE_GRAPH_WRAPPER / BREAKING_POINT_* | WRAPPING_STRATEGY != OFF | 缺失 | wrapping 图 |
| NODE_PLACEMENT_REPEATER | 有 flexible 节点 && recomputeNodePlacement != null (默认 null) | 缺失 (默认不触发) | #1194 |
| DIRECTION_PRE/POSTPROCESSOR | LEFT/DOWN/UP | ggn 用 GraphTransformer(in/out) 代替 | 方向图 (已验证等价) |

### 6.2 层内边 (in-layer edge)
- ELK 层内边**同侧** (WEST-WEST / EAST-EAST); **异侧 (EAST→WEST 同层) = 图构建/分层异常信号**。
- crossing counting: 层间 `countCrossingsBetweenLayers` 应跳过层内边;
  层内 `countInLayerCrossingsOnPorts` 只数本侧集合内的 otherEnd (Java 对未分配端口 position=0 自然跳过)。

### 6.3 EXTERNAL_PORT dummy
- **根图不应有 EXTERNAL_PORT** (Java 根图无); 子图有 (INCLUDE_CHILDREN 正常)。
- 根图出现 = CompoundGraphPreprocessor 层级边处理错误 (该嵌套的没嵌套)。

### 6.4 排序比较器
- Java `MODEL_ORDER_NODE_COMPARATOR_*`: 任一方无 MODEL_ORDER 时 `return 0` (稳定序)。
- 把无 MO 当 0 参与排序会重排层内顺序 → 影响提升判定与 P3 节点序。

### 6.5 遗留值污染 (portPositions)
- `CrossingsCounter.portPositions` 跨多次计数复用; 未覆盖端口保留旧值。
- Java int[] 默认 0 → positionOf 未分配=0 → `0 > pos` false 自然跳过;
  TS 必须 `?? 0` 对齐, 不能用 guard 硬跳过合法计数 (会少计 crossing)。

### 6.6 迭代/极值
- `Math.max(...keys)` 在 keys 上万会展开栈溢出 + 每节点全量拷贝 (O(n³)); 用循环/缓存。
- do-while 的 keys 快照 vs Java keySet().size() 实时: 新 key 只产生在游标已越过一侧, 无行为差异。

### 6.7 通用 TS 语义陷阱 (速查)
- `%` 对负数 (Java 向零, JS 向负无穷) → 用 `((a % b) + b) % b` 或 Math.floorMod。
- `Math.round` 的 .5 行为: Java 向正无穷, JS 向 +∞ (一致) 但负数注意。
- `Array.prototype.sort` 稳定性: V8 稳定 (ES2019+), Java TimSort 稳定; 比较器必须严格传递。
- `Map`/`Set` 迭代序 = 插入序 (与 Java LinkedHashMap 一致); `HashMap` 无序 ≠ LinkedHashMap。
- `list.splice` 修改引用数组 → for 循环索引需回退 (Java `nodeIndex--` 同理)。

### 6.8 CompoundGraphPostprocessor 缺 copyLabelsBack (跨层级边标签)
- 现象: 层级图 (INCLUDE_CHILDREN) 跨层级边的边标签布局后丢失 (原边 labels 空).
- 机制: CGP 把原边标签移到段边 → LabelDummyRemover 恢复回段边 → TS postprocessor 只重连原边丢弃段边
  (标签随之丢); Java 有 copyLabelsBack (CompoundGraphPostprocessor.java:177-178/238-257) 拷回原边 + 坐标转换.
- 修复: postprocessor 段循环拷段边标签回 origEdge (LEdgeLabel 无 propertyMap → 无条件拷; offset=coordSystemOffset).
- 注意: 拷回后 done 阶段仍可能空 (多图 CROSS_HIERARCHY_MAP 归属 / postprocessor 后清空, 待查).


### 6.9 处理器钩子图归属 (runner.ts vs runner-per-graph.ts)
- Java @TestAfterProcessor 收到**模块实际处理的 LGraph** (whitebox); runner.ts 的钩子闭包固定检查根图 →
  层级图 (INCLUDE_CHILDREN) 下子图执行的模块会在根图中间态上误报 (ReversedEdgeRestorer 78/550 假失败).
- 需要逐图断言的移植测试用 `runAllPerGraph` (runner-per-graph.ts), afterModule 收到实际图.
- 内部 LGraph 保留 dummy (EXTERNAL_PORT/LONG_EDGE), Java @Test(ElkNode) 检查输出图 (dummy 已移除) →
  布局后断言需过滤 NORMAL 节点 (Issue455/515).

### 6.10 PolylineEdgeRouter 弯点 (P5)
- TS 早期只实现层定位+节点重放, 缺 processNode/addBendPoint/processInLayerEdge → polyline 边缺弯点穿过节点
  (Issue515: e0 缺 bend (62,12) → 斜线穿 Nn3). 0.12.0 Java PolylineEdgeRouter.java:322-506 需完整移植:
  - processNode: E/W 端口弯点 = 层左右边界 + 端口锚点 y; x 距 ≤ maxAcceptableXDiff 且非 in-layer dummy 跳过;
    NORTH_SOUTH_PORT 用 ORIGIN 端口锚点 x (并移动 dummy 位置).
  - addBendPoint: in-layer 或锚点≠弯点才插入; 源端口 prepend, 目标 append; junction points 去重.
  - MIN_VERT_DIFF=1.0: 对端锚点 y 与弯点 y 差 ≤1 跳过.

### 6.11 ElkMath.intersects 语义 (测试用)
- `intersects(rect, p1, p2)`: 两端点都在矩形**内部** (严格, 边界算 outside) → false; 否则与 4 条边做
  线段-线段相交 (`intersects(l11,l12,l21,l22)`), 平行/共线 → false; 相交条件 `0<s,t<1` **严格开区间**
  (fuzzyCompare eps=1e-5) — "touching" (端点落在线上) 不算相交.
- 用 AABB 保守判定 (含边界/touching) 会误报 (Issue515 edge e1 起点在盒右边界 x=62 被误判相交).

### 6.12 Java getProperty 未设置返回 null, TS 返回 undefined
- Java `p != null` (宽松) vs TS `!== null` (严格) — undefined 漏过 → 后续 hasProperty 崩溃
  (BasicConsiderModelOrder PREFER_NODES: model-order-port-comparator.ts:99).
- 从 getProperty 取值并对照 Java `!= null` 的检查, TS 必须用 `!= null` (宽松).

### 6.13 harness 输入保真: node label size
- elkt2test parseElkt 解析 node label 时不读 size (width/height=0); elktToElkJson (build) 完全跳过
  node labels → oracle 输入无 label. NODE_LABELS 约束节点尺寸差 (724 x 差 10; 与 Issue905 同源).
- 修复需: ① parseElkt 解析 label size; ② elktToElkJson 发射 node labels (含 size/position); ③ 重生成 jar oracle.


### 6.14 NODE_SIZE_CONSTRAINTS 默认值 (ELK = 全部约束)
- ELK 0.12.0 默认 `nodeSize.constraints` = 全部 SizeConstraint (PORTS/PORT_LABELS/NODE_LABELS/MINIMUM_SIZE,
  elkjs NODE_SIZE_CONSTRAINTS_DEFAULT = all); TS 默认 [] → 无显式约束节点忽略 label 尺寸
  (905 N1 高 124 vs jar 150: N1 label L1 占内容区顶部 → N2 y=26).
- 容器节点 (有子图) 的 NODE_LABELS: jar 把 label 盒计入内容区顶部 (N2 放在 label 下方);
  TS 默认 [] 时 label 不占位 → 内容起点 y=0.

### 6.15 HierarchicalPortOrthogonalEdgeRouter 槽位 = After phase 5 (非 Before)
- Java javadoc "After phase 5" (elkjs 枚举序 46 在 HierarchicalPortPositionProcessor(42) 之后).
- OER (phase5) 的 placeNodesHorizontally 会重置 E/W dummy x → HPOER 必须在 P5 后重新修正
  (WEST→-offset.x-padding.left); 且必须在 EndLabelPostprocessor 之前 (端标签锚定 dummy 位置, Issue905).
- TS 之前: 无 N/S dummy 时提前 return 跳过 fixCoordinates + 调用在 Phase C (晚于 EndLabelPostprocessor).


### 6.16 node label 输入保真 + 容器占位 (elkt-build/elkt2test)
- elkt2test parseElkt: node label 的 layout size/position/placement 此前丢失 (label 块行走 stack[null]
  分支被跳过; _inLayout 分支拦截) → 现在解析; elktToElkJson 发射 node labels (text/size/x/y/placement).
- edge.thickness: 解析 org.eclipse.elk.^edge.thickness → edges 第 7 元素 → 发射 properties → 应用 EDGE_THICKNESS
  (905 边标签 y 差 1).
- 容器节点 (有子图) inside node label 占位: ElkGraphImporter.importGraph (0.12.0:617) 把
  computeInsideNodeLabelPadding 加到子图 LGraph padding (lPadding.add) → TS buildLGraphFromParsed
  设子图 padding.top = max(配置, label 底部). 905 N1 label bottom=26 → 子图 padding.top=26 → N2 内容起点 26.
- 标签随节点平移: resizeParentNode 平移 NORMAL 节点/边弯点时同步平移边标签 (段边标签 postprocessor 前).
- 剩余 (905 y 差 12): BKNodePlacer 放置 WEST 外部端口 dummy y (TS 35 vs jar 47, 差 12) —
  BK 输入受 label 占位 (padding.top=26) 影响; getExternalPortPosition 基于 dummy → P1 y=61 vs 73
  → 标签 y 差 12. 需对齐 BK 对 label 占位/dummy 位置的 cell 语义 (系统性, 68 图回归 + oracle 重生成).

## 7. 验证命令速查

```bash
# 单模块
bun run --filter @ggn/layout test tests/elk-java-unit/<File>.test.ts
# 阶段 diff (ggn vs jar)
bun scripts/stage-diff.mjs diff
# 696 无回归硬门禁
bun run --filter @ggn/layout verify:696
# 全量 elk-java-unit (排除 realworld_batch 防超时)
cd packages/layout && ./node_modules/.bin/vitest run tests/elk-java-unit --exclude 'tests/elk-official/generated/realworld_batch.test.ts'
# 分批变异 (低 CPU)
bun scripts/mutate-batch.mjs <batch>
```


## 8. 失败收敛流程 (Bun"错误当工单"落地)

每个失败/回归必须走五步闭环, 完成才算收敛:

1. **定位阶段**: 用阶段 diff (P1-P5) / 插桩, 回答"差异发生在哪个阶段".
2. **归因陷阱**: 对照 §6 陷阱表, 判断属于哪类 (管线顺序/层内边/比较器/遗留值/迭代序/坐标补偿…);
   不属于任何已知类 → 新增陷阱条目.
3. **对抗审查**: 深水区 (涉及多模块交互/有回归风险) 必须配 1 个审查 agent:
   独立上下文, 只看 diff, 假设代码是错的, 对照 ELK Java 源码 (或 elkjs 编译产物当 oracle).
4. **修复 + 验证矩阵** (§9): 按修复类型跑对应验证; 全量无新增失败才可合并.
5. **沉淀**: 更新陷阱表 + PROGRESS.md 工单 (标记 closed).

## 9. 工单模板 (PROGRESS.md)

```markdown
## [日期] 工单 <name>: <一句话根因>
- 失败: <测试/图, 数量>
- 阶段: <P1-P5>
- 根因: <机制 + 证据>
- 修复: <函数/改法>
- 验证: <跑的验证 + 结果>
- 陷阱表: <新增/更新条目>
```

## 10. 验证矩阵 (修复类型 → 必跑验证)

| 修复类型 | 必跑 |
|---|---|
| 管线/分层 (P1-P3) | NodePromotionTest + 全量 elk-java-unit + 696 |
| 边路由/端点 (P5) | BasicEdgeRouterTest + EdgeRoutingE2E |
| 尺寸/标签 (cell) | Issue682/905 + 全量 elk-java-unit |
| 图构建 (CGP/import) | 相关单测 + 696 collect-all + E2E |
| 任何修复 | 全量 elk-java-unit 无新增失败 (对比基线) |
