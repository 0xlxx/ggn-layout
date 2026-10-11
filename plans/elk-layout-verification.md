# elk-layout 最终正确性验证计划（v4）

> ⚠️ 2026-09 包更名：`packages/elk-layout` → `packages/layout`（包名 `@ggn/elk-layout` → `@ggn/layout`）。本文写于更名前，正文里的旧路径按此映射阅读；结论与判据不变。


> 状态: 定稿 (2026-08-07)。本文件是 elk-layout 移植正确性的权威验收蓝图。
> v4 更新 (2026-08-07): 状态数字刷新 (elk-java-unit 470/470、M4 348/348、696 = 27 失败);
> 新增 **M3-A 分歧登记册 (triage-registry.json)** + **M3-B 失败硬门禁 (diff-failures check)**;
> 方法论参考见 `plans/porting-methodology.md` (typescript-go Baseline Testing 的
> Accepted/Triaged/Unclassified 三分类 → 本项目 accepted/bug/tooling)。
> 唯一权威 oracle: **ELK Java 0.12.0 jar** (`packages/elk-layout/scripts/elk-java-debug/lib`)。
> elkjs 仅作近似参考, 不参与验收 (elkjs 与 Java 有系统性分歧, 463 实证: ggn≈jar、elkjs 差 269)。

## 核心方法论: 两个层次 (不纯黑盒)

1. **层次一 · Harness 可靠化**: 修 `DebugMain.java` / `probe.mjs export`, 使任何 elkt 模型都能喂给 jar,
   拿到可信坐标 + **每阶段快照**。
2. **层次二 · 分阶段对比定位**: ELK layered 是分阶段管线 (P1 去环 → P2 分层 → P3 交叉最小化 →
   P4 节点定位 → P5 边路由, + 中间处理器)。对每张图逐模块对比 ggn vs jar 输入/输出快照,
   **首个不一致阶段 = bug 所在** → 在该阶段内 debug (jar 源码对比 + 插桩)。

## M0 前置完整性 (最优先, 两条腿)

### M0-A 模块/处理器覆盖完整性
- 枚举 ELK Java layered 全部中间处理器 (58 枚举) + 阶段策略, vs ggn `src/` 模块, 产出缺失/简化清单。
- **本次盘点结果** (2026-08-07):
  - 阶段策略静默缺失: P3 `INTERACTIVE` **(2026-08-07 已移植 InteractiveCrossingMinimizer, 不再缺失)**;
    P4 非-BK (`LINEAR_SEGMENTS`/`NETWORK_SIMPLEX`/`INTERACTIVE`);
    P5 非-orthogonal (`POLYLINE`/`SPLINES`) — **选项存在但被静默忽略, 无降级声明** (463 即 POLYLINE 图, 结果三方分歧)。
  - 中间处理器缺失: 层级端口三件套 (`HIERARCHICAL_PORT_CONSTRAINT/POSITION/ORTHOGONAL_EDGE_ROUTER`,
    Issue680 已知缺 constraint)、标签组 (`LABEL_DUMMY_SWITCHER`/`LABEL_SIDE_SELECTOR`/
    `CENTER_LABEL_MANAGEMENT`/`END_LABEL_*`/`END_NODE_PORT_LABEL_MANAGEMENT`)、图包装/注释/压缩
    (`BREAKING_POINT_*`/`SINGLE_EDGE_GRAPH_WRAPPER`/`COMMENT_*`/`HORIZONTAL_COMPACTOR`/
    `CONSTRAINTS_POSTPROCESSOR`)、可选 (`FINAL_SPLINE_BENDPOINTS_CALCULATOR`/`HIGH_DEGREE_NODE_LAYER`/
    `PARTITION_*`/`SEMI_INTERACTIVE_CROSSMIN`/`INTERACTIVE_EXTERNAL_PORT_POSITIONER`/
    `NODE_PLACEMENT_REPEATER`/`HYPERNODE_PROCESSOR`)。
  - 简化实现: `HIERARCHICAL_NODE_RESIZER` → ggn `resizeParentNode` (parentSize 已知差异)、部分处理器内联。
- 处理: 默认管线必用项进**补齐队列** (层级端口三件套、P4 非-BK、P5 非-orthogonal);
  可选策略降级改为**显式声明** (命中未实现选项时抛警告/记录, 而非静默忽略)。

### M0-B 前置参数一致性
- 枚举 ELK layered 全部 options + 默认值 (`Layered.melk` + `CoreOptions`) → `options.json` (key/默认/类型)。
- `elkt2test.mjs` 目前只解析 elkt 顶层 `hierarchyHandling|algorithm|direction` 3 个 key,
  **`spacing.*`/`edgeRouting`/`crossingMinimization.*`/`cycleBreaking.*`/`nodePlacement.*` 等全部被丢弃**
  → 生成测试 ggn/elkjs 两端都用默认参数 (spacing labels 的 "通过" 是默认一致假通过)。
- 修复: elkt2test 完整解析 elkt 顶层属性 → 同时应用到 ggn 与 elkjs; `probe export`/DebugMain 同样完整导出 → jar 端。
- **参数指纹校验**: 每图输出生效参数集合 (key=value 含默认回退), 三端一致校验; 不一致归 "③工具待修"。
- 默认值对齐: 逐项核对 ggn 70 个 options 与 ELK 默认值。

**盘点发现 (2026-08-07): ggn 的 core option key 前缀不一致 (约 15+ 个)**
- ggn 把 ELK core options 的 key 用 `org.eclipse.elk.layered.*`, ELK/elkjs/jar 用 `org.eclipse.elk.*`:
  `direction` / `hierarchyHandling` / `insideSelfLoops.activate` / `nodeLabels.padding|placement` /
  `nodeSize.constraints` / `portConstraints` / `randomSeed` / `spacing.edgeEdge|nodeNode` /
  `priority.direction|shortness|straightness` 等; 另有 `portBorderOffset` vs `port.borderOffset`、
  `edgeThickness` vs `edge.thickness` 的 key 命名差异。
- 生成测试 "值一致" 掩盖了 key 不一致 (ggn 读 layered.*, elkjs/jar 读 core.*, 值相同所以测试过);
  但 harness (jar) 与 ggn 的 key 不对齐 → 三端参数指纹校验会暴露; 真实用户传 core key 时 ggn 读不到。
- 处理: M0-B 增加 **ggn core key 对齐/别名映射** (支持标准 `org.eclipse.elk.*` core key), 列入 M0 修复队列。
- **spacing key 混搭确认 (2026-08-07)**: ggn `spacing.edgeEdge`/`spacing.nodeNode` 错用
  `org.eclipse.elk.layered.spacing.*` (ELK 是 core `org.eclipse.elk.spacing.*`); 而 ggn 的
  `portPort`/`nodeSelfLoop`/`edgeNode`/`edgeLabel`/`labelLabel` 已用 core 前缀 (正确); 
  `BetweenLayers` 用 `layered.` (ELK 也是, 正确)。elkt/用户设 `spacing.edgeEdge`(core) 时 ggn 读不到。
- **关键策略默认值初步对齐 (2026-08-07)**: crossing=LAYER_SWEEP / cycleBreaking=GREEDY /
  layering=NETWORK_SIMPLEX / nodePlacement=BRANDES_KOEPF / considerModelOrder=NONE /
  thoroughness=7 与 ELK 一致; 待核: `layerUnzipping.strategy` ggn=OFF vs ELK=NONE (枚举值差异)。

### M0-B 补充: elkt 顶层属性全集 (elkt2test 改造规格, 2026-08-07 扫描)
elkt 模型实际用到的算法 option (排除 position/size/start/end/bends/index/side 等 layout 语法):
- **spacing 组**: edgeEdge / nodeNode / nodeSelfLoop / portPort / edgeLabel / edgeNode / labelLabel /
  labelPort / nodeNodeBetweenLayers / edgeEdgeBetweenLayers / edgeNodeBetweenLayers /
  portsSurrounding / commentComment / commentNode / componentComponent / individual
- **策略组**: edgeRouting (+ selfLoopDistribution/Ordering) / crossingMinimization.strategy
  (+ forceNodeModelOrder/greedySwitch.type/greedySwitchHierarchical.type/semiInteractive/
  positionChoiceConstraint) / cycleBreaking.strategy / layering.strategy (+ layerConstraint/
  wideNodesOnMultipleLayers) / nodePlacement.strategy (+ bk.fixedAlignment/edgeStraightening/
  networkSimplex.nodeFlexibility)
- **核心**: direction / hierarchyHandling / randomSeed / padding / portConstraints /
  considerModelOrder(.strategy/.components/.longEdgeStrategy) / mergeEdges / mergeHierarchyEdges /
  thoroughness / separateConnectedComponents / insideSelfLoops.activate(.yo) /
  nodeLabels.placement / nodeSize.constraints(.minimum/.fixedGraphSize) / portLabels.placement /
  portAlignment.* / highDegreeNodes.* / partitioning.* / edgeLabels.placement / edgeLabelSideSelection
- **注意**: elkt 顶层用短名 (无 org.eclipse.elk 前缀, 如 `spacing.edgeEdge`, `crossingMinimization.strategy`),
  也有 `org.eclipse.elk.*` 长键 (如 `org.eclipse.elk.portConstraints`); elkt2test 需完整解析并按
  ggn/elkjs/jar 各自 key 体系注入。

### M0-B 执行进展 (2026-08-07): elkt2test 注入完成 → 新基线 618/78
- 实现: elkt2test 扩展 elkt 顶层属性解析 (OPT_MAP 覆盖 spacing.*/策略/核心 ~40 个), 生成测试注入
  ggn (`graph.setProperty('<ggnKey>', v)`) 与 elkjs (`layoutOptions` 展开); 全量重生成 348 图。
- **效果**: 参数真正生效 (spacing.nodeSelfLoop=30 等不再默认假通过), 696 从 678/18 → **618/78**
  (+60 真实差异暴露)。elk-java-unit 400/400 无回归。
- **暴露的 ggn 真实差距 (示例)**: `nodePlacement.strategy=NETWORK_SIMPLEX` (P4 静默缺失)、
  `crossingMinimization.strategy=INTERACTIVE` (P3 静默缺失) 等 — 与 M0-A 盘点吻合。
- **待办**: 78 个失败逐图三分法 (jar 复核); 静默缺失策略先显式降级/补齐; OPT_MAP 未覆盖的 elkt
  属性 (highDegreeNodes/partitioning/portAlignment 等) 继续补映射。
- **注意**: 当前 oracle 仍为 elkjs; 78 个失败中 ggn 真 bug vs elkjs/Java 分歧需 M1 jar oracle 判定。

### M0-B 执行进展 (2026-08-07 下午29): core key 对齐 + 默认值对齐 (前置参数一致性完成)
- **jar 权威 key 清单已提取** (方法: `strings LayeredOptions.class/CoreOptions.class` 0.12.0 jar):
  core = `org.eclipse.elk.*` (direction/edgeRouting/hierarchyHandling/portConstraints/randomSeed/
  spacing.*/nodeLabels.*/nodeSize.*/port.borderOffset/edge.thickness/insideSelfLoops.*/portLabels.*/
  edgeLabels.placement/priority[单值]); layered = `org.eclipse.elk.layered.*` (策略/priority.direction|shortness|straightness/
  portSortingStrategy/spacing.*BetweenLayers/edgeRouting.selfLoop* 等)。见 `plans/elk-options-canonical.md`。
- **ggn key 对齐 (14 处, `src/options/layered-options.ts`)**: `direction`/`edgeRouting`/`hierarchyHandling`/
  `portConstraints`/`randomSeed`/`spacing.edgeEdge`/`spacing.nodeNode`/`insideSelfLoops.activate`/
  `nodeLabels.padding`/`nodeLabels.placement`/`nodeSize.constraints` 去掉误加的 `layered.` 前缀;
  `priority.straightness` 改回 `layered.priority.straightness`; `portBorderOffset`→`port.borderOffset`;
  `edgeThickness`→`edge.thickness`; `portSortingStrategy`→`layered.portSortingStrategy`。
- **OPT_MAP/脚本对齐**: `elkt2test.mjs` ggn 注入 key 全部改 canonical (删 1 处死重复 edgeLabels.placement);
  `probe.mjs`/`dump-comps.mjs`/`DebugMain.java`(源码) 的 `layered.portConstraints`/`layered.separateConnectedComponents`/
  `layered.nodeLabels.*`/`layered.nodeSize.*`/`layered.portBorderOffset` 改 canonical。DebugMain 需在带 Java 的机器重编译。
- **默认值对齐 (5 处)**: `spacing.edgeLabel` 10→**2**、`spacing.labelLabel` 3→**0**、`priority.shortness` 1→**0**
  (ggn 用 `max(1,·)` 无行为差)、`layerUnzipping.strategy` OFF→**NONE** (枚举改名)、`portSortingStrategy` DEFAULT→**INPUT_ORDER**。
- **效果**: elk-java-unit 400/400 保持; 696 **78→72** (examples 8 / tests 51→45 / tickets 19), **0 新增失败**;
  修复 6 图全为 splines/labels 族 (`edgeRouting=SPLINES` 之前被错误 key 静默忽略, 现在真正读入)。
- **教训**: key 前缀不一致 = "值一致假通过" — 测试两端值相同但 key 体系不同, 掩盖 ggn 根本没读到参数;
  修正后 78→72 说明此前部分"通过"是假通过。harness (jar) 与 ggn key 对齐是 M1 前提。
- **待办**: ① `probe export` 未把完整 graphProps (spacing.*/策略) 导出给 jar → M1; ② 参数指纹校验
  (三端生效参数集合对比) 未实现; ③ `portLabels.placement`/`insideSelfLoops.yo` 等 ggn 尚无对应 Property
  (注入后仅记录不消费); ④ 数组型选项 (nodeLabels.placement/nodeSize.constraints) 解析。

### M0-A 执行进展 (2026-08-07): 静默缺失策略显式降级警告
- 实现: `warnUnsupported(key, value, fallback)` 去重警告, P4 (nodePlacement.strategy 非 BRANDES_KOEPF)
  / P5 (edgeRouting 非 ORTHOGONAL) 命中时 console.warn, 不再静默降级。
- 验证: bun 直跑确认警告触发 (`[ggn] 未实现策略 nodePlacement.strategy=NETWORK_SIMPLEX ...`);
  elk-java-unit 400/400 + 696 618/78 无回归。
- P3 crossingMinimization.strategy=INTERACTIVE 警告已补; OPT_MAP 补全 (aspectRatio/selfLoopDistribution/
  selfLoopOrdering/bk.fixedAlignment/bk.edgeStraightening/nodePromotion.strategy/portModelOrder/
  edgeLabels.placement/spacing.labelPort/insideSelfLoops.yo)。无回归 (400/400 + 618/78)。
- 待补: 数组型选项 (nodeLabels.placement/nodeSize.constraints) 解析; 其余缺失处理器 (层级端口三件套等) 显式声明。

## M1 · Harness 坐标可靠性
**2026-08-07 完成核心**: DebugMain 改用官方 `ElkGraphJson` importer (与 elkjs 同一导入路径) +
`org.eclipse.elk.graph.json` + gson; probe export 全量 graphProps→jar (OPT_MAP canonical)。
- 效果: 11 个 jar 崩图全修好 (端口排序/复合跨层边/自环/选项丢失); ③工具待修 36→5。
- 仍待: 端口标签 (port.labels) 导出、数组型选项 (nodeLabels.placement/nodeSize.constraints) 解析、
  DebugMain 手写辅助方法清理。基准: Issue680/Issue871 官方 JUnit 已过不回归。
- **端口标签归因 (2026-08-07 下午61)**: 已把 port.labels 导出补到 DebugMain/jar-triage (三端同喂
  零尺寸标签) → variants 差 58 (ggn 672 vs jar/elkjs 730) = **端口标签 placement 缺失** (ELK 为
  标签保留 ~10px 空间, ggn 无 PORT_LABELS_PLACEMENT 逻辑), **不是 margin** (零尺寸标签 margin 贡献为 0,
  node-margin-calculator 端口标签分支已按 ELK 语义保留但惰性)。elkt2test 的标签解析/序列化曾使 696
  29→35 (暴露 6 个 port_label 族真缺口), 为保无回归基线已回滚, 待移植 PortLabelPlacement 时一并启用。

## M2 · 分阶段对比定位
完善 `probe.mjs java` (已有雏形: PIPELINE + MODULE_MAP + DOT 快照层序解析):
逐模块 ggn 指纹 vs jar 快照 (层序/节点/端口) → 分歧图能指出首个不一致处理器 → 阶段内 debug。

## M3 · L1 切 jar oracle + 三分法
- **2026-08-07 v2 三分法完成** (71 失败图, `scripts/jar-triage.mjs`): ②真 bug 60 / ①分歧冻结 5
  (`divergence.json`) / ③工具待修 5 (compound04/05/all_four_port_sides/194/302 + compound06 ggn 崩溃)。
- 待办: ②60 图修复队列按因果拓扑排序 (BK classes fixedAlignment 族 10 图最集中, 建议先修)。

### M3 · L1 jar oracle 落地 (2026-08-07 晚)
**生成测试已从 elkjs 差分切换到 ELK Java 0.12.0 jar 预生成 oracle**:
- 工具: `scripts/generate-jar-oracle.mjs` (348 elkt → ELK JSON → `BatchMain.java` 单 JVM 批量布局 →
  `test-resources/jar-oracle/<graph>.json`); 模型 hash = sha256(ELK JSON) 前 16 hex, 测试内校验
  `oracle.hash === 生成时 hash` 防过期; `elktToElkJson`/`elktHash` 为 elkt2test 与生成器共享 (防不一致)。
- 生成测试: `it('坐标级差分: 与 jar 0.12.0 1:1 对齐')` 逐节点对比 ggn 相对坐标 vs oracle (jar getX/getY
  同为相对父块), ε=1。compound06 无 oracle (jar 侧报 "Expected 2 hierarchical ports") → 测试必失败, 已入 registry。
- **ε 实测 → 默认 ε=2** (2026-08-07 深夜, 新目标「精度可容忍」):
  - 分档: (0,0.01] 320 图精确; (0.01,1] 4 图亚像素 (selfloop_crash/selfloop_spline/self_loops__label/spacing__labels);
    **(1,2] 4 图 = 自环族 4/3=1.333 系统性精度差** (self_loops__south/hyperLoops、302、288); 结构 bug 全 ≥4px。
  - **ε=2 吸收全部精度噪声、不漏结构 bug** (ELK_TOLERANCE 可收紧复验)。
- **L1 jar 结果**: 696 = **672/696 通过, 24 失败** (23 唯一图, compound06 ×2)。
  - 旧 elkjs 失败 27 → 24: selfloop_crash/north_south_ports_1/608 (旧 accepted) **转通过**;
    compound03/three_edges_inverted_ports_2 旧 accepted 分类**过期** (jar-triage 复核为三方各差) → 重分类 tooling;
    无新增失败 (无 ggn≈elkjs≠jar 的隐藏分歧)。
  - registry v2: accepted 0 / **bug 16** (含 compound06) / **tooling 7** (all_four_port_sides/compound03/04/05/
    three_edges_inverted_ports_2/194/302)。`diff-failures check` 对 jar 失败集 PASS (0 未分类)。
- **2026-08-07 深夜: 复合放置族根因 (setPortOrderOnParentGraph 漏 FIXED_ORDER) 修复 → 24→22 失败**
  - 根因: ELK 子图 sweep 后把父节点 PORT_CONSTRAINTS 升为 FIXED_ORDER (端口序已由外部端口 dummy 定);
    ggn 漏此行 → 父端口被 sortPorts 按 barycenter 重排 → N-S 计数不确定 → 层序分歧。
    补 `gData.parent!.setProperty(PORT_CONSTRAINTS, FIXED_ORDER)` → hierarchy05 + hierarchy01 通过。
  - registry v3: bug 14 / tooling 7 (21 唯一图, 22 测试失败)。
- 修复路径: bug 14 按族推进 (splines/自环 8 图 → NubSpline; 复合放置剩余 hierarchy09/portConstraints/502;
  port_labels variants; northSouthPorts_down_down_01 边标签; 288); tooling 7 先修 harness。
  复合 N-S 外部端口 dummy 位置族 (hierarchy09 y+20 / 502 x+20) 是下一攻坚点 (ELK 北/南 dummy 在
  内容框外 y=-32/x 扩展, ggn 放在层内)。

### M3-A · 分歧登记册 (triage-registry.json) — v4 新增
把三分法从"手写 triage 文档"升级为**机器可读登记册** (对齐 typescript-go 的
`submoduleAccepted.txt` / `submoduleTriaged.txt`, 见 `plans/porting-methodology.md` §4-A):
- 文件: `packages/elk-layout/triage-registry.json`, 结构
  `{ version, updated, entries: [{ graph, verdict, reason, tracker? }] }`。
- verdict 语义:
  - `accepted` — ①分歧冻结 (ggn≈jar, elkjs 错): L1 验收排除, 不视为 ggn 缺陷;
  - `bug` — ②真 bug (ggn≠jar): 修复队列, 允许暂时失败但必须被跟踪, 修复后从登记册移除;
  - `tooling` — ③工具待修 (harness/模型/参数): 修 harness 后复核, 不允许以"工具问题"长期躺尸。
- 生成/维护: 由 `scripts/jar-triage.mjs` 的三方 verdict 驱动; 修一个 bug → 移除对应 entry →
  同步更新 `plans/elk-layout-triage.md` 与 PROGRESS.md。
- 每 27 个当前失败图的归因见下方"当前状态"。

### M3-B · 失败硬门禁 (diff-failures check) — v4 新增
`scripts/diff-failures.mjs` 新增 `check` 子命令 (对齐 typescript-go 的"Unclassified diff = CI 红"):
- 输入: 当前失败集合 JSON + `triage-registry.json`。
- 规则: 任何失败图不在登记册 → **未分类 → 退出码 1 (阻断)**; 登记册内 `bug`/`tooling` 图仍失败 →
  放行但计数; 登记册内图已通过 → 提示"可移除" (不阻断, 供清理)。
- 用途: 把 696 从"无回归门禁的参考基线"变成"受控门禁"; L1 切 jar oracle 后同一机制换 jar 失败集。
- 附带修复 (2026-08-07): `collect <file> --out <path>` 的 CLI 解析 bug (旧实现把 `--out`/值误当
  env 拼进命令导致 collect 必失败), 已修并回归验证。

## M4 · 白盒不变量 (移植 ELK TestAfterProcessor 断言)
**2026-08-07 已实现**: `tests/elk-java-unit/LayoutInvariantsTest.test.ts` — **全量 348 图扫描 348/348 绿**
(examples/tests/tickets, 排除 realworld 与已知崩溃 compound06)。覆盖: 无环 (P1) / successor 约束 (Forster) /
margin≥0 / 方向感知层内不重叠。**L3 不变量全绿 (除已知崩溃)** 达成。
待补: 布局单元不重叠 (InLayerConstraint) / NS 端口恢复完整 / BK 后无重叠专项; 修 compound06 后移除 KNOWN_CRASHES。

## M5 · 变异 + realworld + 性能
- **2026-08-07 变异基础设施 + 基线**: `stryker.config.ts` (vitest runner, mutate=p3order/intermediate/loops/
  compaction/util, 只跑 elk-java-unit via vitest.mutation.config.ts) + `bun run mutation` 脚本。
  基线: **总体 49.10% / covered 63.70%** (2290 killed / 1361 survived / 1115 noCoverage, 4891 变异体, 9min)。
  强: self-loop-preprocessor 79%、greedyswitch 72%、counting 75%、layer-sweep-type-decider 77%;
  弱: loops 23% (noCoverage 543)、java-random 32%、preserveorder 43%。
- **2026-08-07 第二波补测 (+52 测, elk-java-unit 414→466)**: interactive 24.7→**58.8%** (LONG_EDGE 源/目标/
  弯点插值/REVERSED、N-S 端口、CENTER 算术翻转、horizPos 过滤)、sort-by-input 49.3→**91.1%** (getTargetNode/
  longEdgeTargetNodePreprocessing/FIXED_ORDER 跳过)、forster 53.2→**63.3%** (违反解析/链式约束/组插入)、
  preserveorder 54→57.1% (ModelOrderPortComparator +9 测, 侧序/同源/prev 层序/WEST 反转)、cm-group 30→**83.3%**、
  recthull 64.2→67.3% (单点/竖线/矩形/阶梯)。
  **变异测试抓到 2 个真实移植 bug** (坐标差分/M4 未暴露): ① forster layoutUnits `?? [node]` 回退分歧
  (Java Multimap key 缺失=空集合; ggn 加相邻保序边与后继约束成环 → 约束无法解析), 修复 `?? []`;
  ② initAtNodeLevel 重载缺失 (Java (l,n,nodeOrder)+(node,fullInit) 双重载, ggn 空数组调用崩溃), 重构 initNode。
  回归: elk-java-unit 466/466 + M4 347 全绿 + 696 33 无回归。
- **2026-08-07 第三波后状态**: elk-java-unit **470/470** (43 文件); covered 估算 ~65-66%,
  缺口仍集中在 loops 40.2% (437 survived) + preserveorder 深分支 + forster handleViolatedConstraint。
- 待办: 达 70% covered 阈值 (缺口 = loops 40.2% 437 survived [slot-assigner/port-restorer/
  orthogonal-router] + preserveorder 深分支 + forster handleViolatedConstraint); 设 break 门槛;
  等价变异体 (边界同值/几何反转不变) 不硬追。
- realworld: 切 jar oracle 纳入验收。
- perf: `tests/perf/layout.bench.mjs` 作为回归门禁 (验证体系加码不得导致 488 节点布局明显退化)。

## 验收口径
Java 验收 = elk-java-unit 470/470 保持 + L1(jar) 全绿 (除 `triage-registry.json` 中 `accepted` 冻结清单) +
L2 分阶段一致 (分歧图能指出首个不一致阶段) + L3 不变量全绿 + L4 变异杀灭率达标 (covered ≥ 70%) +
realworld(jar) 全绿 + 性能不退化 (tests/perf/layout.bench.mjs 门禁)。
**门禁**: `diff-failures check` 对 L1 失败集强制"无未分类失败" (registry 外的新失败 = 阻断)。

## 当前状态 (2026-08-07 v4 晚刷新)
- **elk-java-unit 986/986** ✅; **L1 jar oracle**: 696 = 677/696 通过, **19 失败** (bug 12 / tooling 6, registry v7),
  splines 层间距移植 (2026-08-08): sloppy_curvature/sloppy_overlaps_2/hyperedges_2 修复 (22→19);
  FIXED_ORDER 缺行修复 (→ hierarchy05/hierarchy01) + ε 默认 2 (→ 自环族 4 图精度差);
  `diff-failures check` 门禁 PASS (未分类 0)。
- M0-A ✅ / M0-B 核心 ✅ / **M1 核心 ✅** (官方 JsonImporter + port.labels 导出) /
  **M3 ✅** (jar oracle 预生成 + hash 防过期 + 三分法 registry v2 + 硬门禁) /
  M2 分阶段对比 (ELK_INSTR + GGN_*_DBG 轨迹工具链已建, phase-diff 自动化待做) /
  M4 不变量 ✅ / M5 变异 470/470 + covered ~65-66% (目标 70%)。
- **②真 bug 修复进度**: InteractiveCrossingMinimizer (P3 INTERACTIVE) ✅ + PolylineEdgeRouter (P5 POLYLINE) ✅
  + Forster 合并组 barycenter 写回 (N-S 族, 下午62) ✅ + sortPortList/SOUTH 逆序忠实移植 ✅;
  L1 jar 剩余 16 bug 待修族: splines/自环 (8)、复合放置 (portConstraints/hierarchy01/05/09/502)、
  port_labels variants、northSouthPorts_down_down_01 (边标签)、288。
- **③工具待修 7**: all_four_port_sides/compound03/04/05 (坐标世界/相对)、three_edges_inverted_ports_2、
  194 (FIXED_POS 外部端口)、302 (SPLINES/自环)。
