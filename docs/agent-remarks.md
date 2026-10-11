# 子代理备注回流登记册 (Agent Remarks Registry)

> 流程 (2026-08-12 用户定): 子代理发现问题 → **主线程独立验证** → 验证通过后**回流到计划**
> (本登记册 + MODULES.tsv + 各簇简报 + 目标状态)。不允许子代理备注只留在汇报里被遗忘。
>
> 列: id | 来源簇 | 备注摘要 | 验证 | 处置 | 计划影响

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R82 | 布局参数 SSOT 化 | **elk-layout 所有参数 SSOT 化（类型安全 + 规范）**：新增 `src/options/specs.ts`（OptionSpec<T,I> 注册表 94 specs = CORE 28 + ALG 66，id/shortKey/type/default/values/algorithm 单一定义）；8 个算法 options.ts 常量改为 `CORE.<key>.id`/`ALG.<alg>.<key>.id`（**消除 core 重复定义**：padding 14 次、spacing.nodeNode 8 次）；graph/enums PORT_CONSTRAINTS_KEY + vertiflex SPACING_INDIVIDUAL 接线 CORE。类型安全：id 字面量保留 + default 泛型约束 + 一致性测试（specs↔OPT_MAP id/type 全等、id 唯一、values 合理性）。**对抗审阅（Feynman）P1/P2**：4 处 values/default 元数据错误（mrtree.weighting 值域串错、disco polyominoLowLevelSort、vertiflex.layoutStrategy、considerNodeModelOrder）+ 7 处值域不完整（SPIRAL/NONE/MAXIMUM_SPANNING_TREE/CENTER_DISTANCE 等）对照 ELK jar/melk 权威修正。迁移无行为变化（118 常量 0 差异、bit-exact 368/368、对齐 362/368、4767 全过）。 | ✅ 已实现 | 后续：layered-options Property ↔ specs 校验可补（127 Property 未纳入本次） |
| R81 | P2 发布边界 (Chandrasekhar/Hubble/McClintock) | ①A: layoutElkJsonBatch/diffElkLayout 含 Elk 违反命名；非 LayoutError 误标 INVALID_INPUT；平行/嵌套边 diff 漏报；abort 语义不清；②B: manifest 陈旧、Schema 未打包、options 泄漏 | ✅ 已按决策修复：改名 layoutJsonBatch/diffLayout/layoutJsonDiff、INTERNAL_ERROR 保真、判别联合、abort 批次终止、diff 按容器+id+顺序匹配、回调后复查、Schema 进 files、manifest 重生成 | **已修** (p0/api-contract): 2750 测试全绿（忽略 oracle）、verify 6 checks OK、四入口构建+Node 自引用 OK、bun pm pack 含 Schema 与四入口 | P2 落地；P0-P2 全部完成 |
| R80 | P1 API 契约 (Lagrange/Heisenberg/Zeno) | ①A: 3 个 bdd 套件在 worktree 因缺 glob 加载失败（环境问题，主工作区可解析）；demo 的 `as any` 未移除；②B: examples import 路径应为 ../src/public.js；③评审: 原样 NO-GO — LayoutOutput 类型与运行时保真不一致、空 sections 丢边、pick/summary 契约不全、public star 泄漏、verify 只查正则 | ✅ ①②已核实；③已按决策修复：LayoutOutput/LayoutOutputEdge 补索引签名、concise 保留未路由边、summary 规则文档化、public 显式白名单、verify 改真实导出枚举+manifest | **已修** (p0/api-contract): 2740 测试全绿（忽略 oracle），verify:public-api OK，tsdown 构建 OK，examples 3/3 运行 OK，tsc 零新增 | P1 落地（类型/裁剪/闭环/入口/文档/门禁）；P2 待办：package exports 子路径、batch/diff/cancel、ELK 属性 schema |
| R79 | P0 API 契约 (Huygens/Aquinas/Volta) | ①tsc --noEmit 全仓 ~2000 基线错误 (shared/ 与 tests/)，与本次改动无关；②B 在 validate.ts 复制算法支持集，A 未导出集合；③评审决策: 先校验后 clone、共享算法注册表、端点解析对齐 builder resolveRef、hyperedge 显式拒绝 | ✅ 基线在主分支复现 2000 错误；②已用 src/api/algorithms.ts 单一事实来源收敛；③已按决策集成，api+bdd+unit+core 2717 全绿 (忽略 oracle realworld)，新文件 tsc 0 新增 | **已修** (p0/api-contract 352198b): layoutElkJson 纯函数化 + validateLayoutInput/LayoutError 接线 + 输出保真 + 3 个 API BDD 测试文件 (38 场景) | P0 API 契约落地，P1 (入口收窄/类型收紧/文档栈) 待办 |
| R16 | Ampere (demo elkjs 对比) | ①递归改写节点级 org.* layoutOptions → elk.* 对 elkjs 0.12.0 输出 0 影响 (原生识别 org.* 前缀), 假设否证, 不纳入 final diff; ②真正差异: **compound 图 + UP 方向** elk-layout vs elkjs 节点 0/51 (RIGHT 51/51 Δ0.00) — 疑似 elk-layout direction 处理待查; ③版本不一致: 根 hoisted elkjs 0.11.1 vs elk-layout 0.12.0 | ✅ Ampere 12 图×4 方向实证 + 主线程复核 bun install 后全 0.12.0; **根因定位**: GraphTransformer 缺 transposeProperties (NODE_SIZE_MINIMUM/ALIGNMENT/POSITION) + placement 变换 + edgeLabelSide transpose → 容器尺寸/坐标错 (476 200x200 vs jar 200x100) | **已修** (本次): graph-transformer.ts 1:1 补齐 + label-and-node-size-processor 移除重复 effMin 补偿 (476 回归消除); blindCommunication LEFT/DOWN/UP 51/51 全等, verify 338/348 基线 + bdd 311/311 + oracle 1036/1036 | **已关闭** |
| R15 | 用户视觉验证 (demo-vite) | Blind Communication 层级图端点+弯折点脱离节点: ①demo 用 getEdgeEndpoints (挂载容器内容图坐标) + 单一边图偏移 → 端点差容器位置; ②弯点偏移用 srcNode 图而非 LCA 容器 → 弯点差 LCA 位置; ③elkjs 路径引用未定义 json.edgeKeys 崩溃 | ✅ verify 1/1 全等 (layout 正确), 定位 demo 渲染坐标系 bug | **已修** (main.ts: 端点=端口绝对锚点+按源/目标各自图偏移; 弯点=LCA 节点世界偏移 (elk-json.ts lcaNode 语义); elkjs edgeKeys 改 key 拼接; 复测端点 8px/0 脱离, 弯点仅 1 个长边合法绕行) | demo 渲染 1:1 |
| R01 | M2 (P2 分层) | TS GreedyCycleBreaker 缺 Java 副作用 `node.id=index`, DF layerer 依赖 | ✅ 对照 Java GreedyCycleBreaker.java L110 | R 簇 (0e0b401) 已补 | 策略注册里程碑 |
| R02 | M9 (NodeLabelPlacer) | provider 重放处 recenterNodeLabels 用 labelNode 而非 labelNodeSpacing, 与 margin 不同步 | ✅ labelNodeSpacing(node) 语义=节点级→图级→5 | **91d2ce2 已修** (recenter 改用 labelNodeSpacing) | label 间距一致性 |
| R03 | T4X3 (Nietzsche) | CMGroupModelOrderCalculator 公式: TS `offset+order` vs Java `offset*gid+order`; 属性类型 object 应为 number | ✅ 对照 CMGroupModelOrderCalculator.java L41 | **91d2ce2 已修** (公式 + 类型 object→number + 测试 8/8) | preserveorder 1:1 |
| R04 | T4-B (Kepler) | jar 批量 JVM 跨模型状态假差异 (inside_outside y=22 vs 12) | ✅ 隔离验证 ggn 与 jar 单模型一致 | 记录为 harness 现象 | 无 (验证 harness 注意项) |
| R05 | T4-B (Kepler) | ComponentGroupGraphPlacer 9 扇区放置分支未接线, 语料无触发模型 | ✅ 已核实差距 | **R05 已移植并接线** (component-group-graph-placer.ts + components-processor 装配, 4 bdd 场景, 全门禁绿) | 已关闭 |
| R06 | X1/Hubble/Nietzsche | mutate-batch.mjs 引用 stryker.config.ts (实际 .mjs) | ✅ 文件为 .mjs | 54384d0 + 合并保留 main 版 | 变异工具链 |
| R07 | Hubble | 顺带提交 package.json (apps/*) + bun.lock 环境噪音 | ✅ 非项目改动 | 合并时剔除 (b582fba) | 环境隔离纪律 |
| R08 | T4X3 (Nietzsche) | ENFORCED 分组特性未接线 (无 CROSSING_MINIMIZATION_ID 设置), 公式修复无实际影响但已对齐 | ✅ 已修 | 公式对齐后行为不变 | 1:1 对齐保险 |
| R09 | 多代理 | Issue665/Issue700 依赖 elk.stress (非 layered 算法未移植) | ✅ 已完成 | **stress/force (src/force) + rectpacking (src/rectpacking) 已移植** (见下方 R09 状态更新) | 语料无触发边缘算法 (mrtree/radial 等) 按需 |
| R13 | T5-G (orthogonal) | orthogonal 变异 3 轮 46.19%→60.78% 未达 70%: splitter/generator/cycledetector 幸存为等价/防御分支 + 需专门超边/环场景 | ✅ 已按新方法论 3 轮收尾 | 提交 9618d02 (+53 用例) | T6 续推 (splitter 38.1%/generator 61.5%/cycledetector 54.0%) |
| R14 | T5-C (labels) | labels 变异 3 轮 38.77%→66.02% 未达 70%: cell-system 507 幸存 (placement/margin 深水) + label-and-node-size 182 + label-side-selector 87 (SMART) + label-dummy-switcher 65 | ✅ 按新方法论 3 轮收尾 | 提交 4347552 (+122 用例 + 2 真 bug 修复) | T5-C2 续推中 (Copernicus) |
| R10 | D (demo) | 旧 3 个 realworld 子标题节点数 (87/80/300) 与实际不符 (51/50/220) | ✅ 已核实 | Mendel 已修正 | demo 数据准确性 |
| R11 | T5-C (labels) | LabelDummyInserter 双偏差: ①ggn LNode(graph) 构造器已入 layerlessNodes, 函数末尾再 push → dummy 重复 (Java LNode(LGraph) 只设引用, 由 LabelDummyInserter.java L116 addAll 一次加入); ②标签收集用反向 splice → REPRESENTED_LABELS 顺序反转 (Java L88-103 listIterator 正序) | ✅ 对照 Java LNode.java L106-108 + LabelDummyInserter.java L64-116 | 本次已修 (正序收集 + 去重 push) | labels 1:1 |
| R12 | T5-C (labels) | RectangleStripOverlapRemover DOWN 导出丢重叠避让偏移: importRectangle UP/DOWN 返回新对象副本, greedy 写 rectangle.y 不传回 original; Java importRectangle L175-183 `return rectangle` 共享引用 + export DOWN `+= startCoordinate` 依赖之 | ✅ 对照 RectangleStripOverlapRemover.java L175-183/200-223 + GreedyRectangleStripOverlapRemover | 本次已修 (UP/DOWN 返回原引用) | labels 1:1 |

## 回流动作 (验证通过 → 纳入计划)
- 代码级差异 (R01/R02/R03): 已修复并提交 → 记入 MODULES.tsv 对应行 + 本登记册 ✅。
- 工具链 (R06): 已修。环境纪律 (R07): 已在协议"合并协议"节注明剔除规则。
- 待办回流: R09 (elk.stress 非 layered 移植, Issue665/700 依赖) → 列入非 layered 里程碑。R05 已关闭 (0ed6224)。
- ~~新增待办 (R16): compound 图 + UP 方向 elk-layout vs elkjs 节点 0/51 — 需调查 elk-layout 的 direction/hierarchyHandling 处理 (demo compare 模式 UP 显示失真)。~~ **已关闭 (R16 修复)**: GraphTransformer 1:1 补齐 (transposeProperties/placement/alignment/position/edgeLabelSide) + 移除 label-and-node-size 重复 minimum 补偿; blind 4 方向 51/51 全等。
- 版本对齐 (R16): elkjs 全仓统一 ^0.12.0 (7836a89), 与 ELK Java 0.12.0 SSOT 一致。

## R09 状态更新 (2026-08-12 主线程)
- **stress/force 移植完成**: src/force/ (graph/kvector/options/force-models/stress-majorization/
  components-processor/elk-graph-importer/stress-layout), 接入 layoutElkJson 分派 (FORCE_ALG_IDS) +
  attachSubtreeEdges (嵌套边重挂载, Java LCA 语义) + elkgraph-builder collectEdges 跳过黑盒子树
  (否则黑盒内部边被解析成外部端口 → y+10 回归).
- **修正**: force spacing.nodeNode 默认 80 / edgeLabel 5 (Force.melk supports 覆盖 core 20/10);
  padding 字符串 "[top=10,...]" 解析 (否则 NaN).
- **验证**: tickets/665 1/1 全等 (verify); oracle 1030+6skip (665/588/mixing 由 api 路径覆盖);
  bdd 311; 696 0 失败. verify 339/348 (1 失败 = mixing, 见下).
- **新增待办 (R17)**: SEPARATE_CHILDREN 子图方向 (hierarchicalLayoutMixing 的 insideOtherDirection
  DOWN 子图 ggn 横向 vs jar 纵向) — layered hierarchyHandling 缺口, 非 stress 范畴.
- **新增待办 (R18)**: 588 跨层级边到非 layered 子图 — Java 抛 UnsupportedGraphException,
  ggn 不复刻 (布局成功), 1:1 行为差异.

## R17 状态更新 (2026-08-12 并行: Feynman worktree ggn-wt-r17, 主线程审查)
- **R17 已关闭**: SEPARATE_CHILDREN 子图在 INCLUDE 根下的方向 + parent 尺寸转置时序.
  根因: ggn doHierarchicalLayout lockstep 里, SEPARATE 子图 (insideOtherDirection DOWN) 的
  尺寸转置在 Phase D 太晚, 父图 Noutside (Phase C) 用 canonical 104x84 → 高差 20 + x 偏移 10.
  修复 (1452c1e): Phase C 内 SEPARATE 子图在父图 post-P3 前提前 TO_INTERNAL + 转置 parent
  + margin 重算, Phase D 跳过 (separateTransposed).
- **验证**: hierarchicalLayoutMixing 1/1 全等; verify 340/348 (差异 0); bdd 311; oracle 1030+6skip;
  696 0 失败.
- **R18 已关闭 (2026-08-12 并行: Ptolemy worktree ggn-wt-r18, 主线程审查)**: 588 跨层级边到非 layered 子图.
  elkgraph-builder assertNoCrossHierarchyEdge 复刻 Java ElkGraphImporter.transformEdge 跨层级边校验
  (点号 LCA 规则: 边容器在 layered 运行内 + 端点 black-box 后代 → 抛 UnsupportedGraphException;
  665 两端同处 stress 子图不误报). verify 343/348 对齐 (坐标 340 + 报错复刻 3: 588/verticalOrder/
  modelOrderCrossingMinimization); 提交 8f8884d.

## R09 rectpacking 完成 (2026-08-12 并行: Herschel worktree ggn-wt-rp, 主线程审查)
- **移植 org.eclipse.elk.rectpacking** (src/rectpacking/, 10 模块 ~2100 行): options/block/block-row/
  block-stack/rect-row/util + p1-width-approximation (Greedy/Area) + p2-packing (InitialPlacement/
  Compaction/RowFilling/Compactor) + p3-whitespace-elimination + rect-packing-layout (TRYBOX→box 降级
  或 p1/p2/p3 → translate/applyPadding/resizeNode). 接入 layoutElkJson RECTPACKING_ALG_IDS.
- **验证**: interactiveRectpacking_hierarchy/oneBigNode + interactiveLayout_mixedHierarchy 3/3 全等;
  bdd 317/317 (+6); oracle 1023+11skip; 696 0 失败; verify 342/348 (坐标 339 + 复刻 3).
- **harness 说明 (重要)**: lib 装入 rectpacking jar 后, Java 批量布局 4 个 self_loops 模型
  (insideSelfLoops/inside_outside/302/368) 输出变化 → verify 差异 4. 已用干净 fa7ff27 worktree 对照:
  无 rectpacking jar 时 343/348 差异 0, 有 jar 时 339/348 差异 4 — **非 ggn 回归, 是 jar 加入改变
  Java 批量 JVM 状态 (R04 同类 harness 现象)**. 单模型跑 302 通过.
- **P2/P3 生成器**: rectpacking 模型加入 skip (由 verify api 路径覆盖), 同 stress/force.

## 最终完成度 (2026-08-12, 见 docs/GOAL-AUDIT.md)
- verify 344/348 对齐 (坐标 339 + 报错复刻 5 + harness 豁免 3), Java 错误 0; bdd 317; oracle 1023+11skip; 696 0 失败.
- compound06/modelOrderCycleBreaking 报错复刻 (254ae9b): ggn 异常类名对齐 Java.
- verify harness 豁免 (632f061): 批量差异模型单独 JVM 复跑 (有/无 rectpacking jar), 全等即豁免.
- 368: Java 输出不一致 (oracle x=12 vs 实时 x=22), ggn 与 oracle 一致 — harness 边界, 不可 ggn 修复.

## topdownpacking 移植完成 (2026-08-12 并行: Euclid worktree ggn-wt-tdp, 主线程审查)
- src/topdownpacking/ (Grid + P1 LeftRightTopDownNodePlacer + P2 BottomRowEqualWhitespaceEliminator, 342 行)
- 自建触发语料 900/901/902 (根算法/子节点黑盒/自定义尺寸+内部边) + jar oracle; 3/3 全等
- attachSubtreeEdges 泛化到全部 black-box (最深优先 LCA, 嵌套黑盒): 修复 902 内部边误路由成自环 (y+30)
- verify 350/351 对齐 (差异 0), bdd 327, oracle 1023+11skip, 696 0 失败; 提交 755cc47

## spore 移植完成 (2026-08-12 并行: Noether worktree ggn-wt-spore, 主线程审查)
- src/spore/ 15 文件 1685 行 (sporeOverlap + sporeCompaction): ElkGraphImporter + ScanlineOverlapCheck +
  BowyerWatson + MinST/MaxST + GrowTree + DepthFirstCompaction; java-hash-set.ts 模拟 Java HashSet
  迭代序 (同权 tie-break 与 jar 全等)
- 自建触发语料 910-914 + jar oracle; 5/5 全等
- **verify 356/356 全部对齐** (坐标 351 + 复刻 5, 差异 0, Java 错误 0); bdd 337; oracle 1023+11skip; 696 0 失败
- 提交 32f3267

## NLA 并行批次 (2026-08-12, mrtree/radial/disco/vertiflex 4 worktree 并行)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R19 | radial | CoreOptions.PADDING 默认 = **12**（非 8；spore 的 8 是其 melk 专属覆盖）— 后续移植 NLA 算法注意 | ✅ Core.melk:275 `default = new ElkPadding(12)` | 已核实 | NLA 移植默认值注意项 |
| R20 | radial | 嵌套节点 id 全路径点号（"Ngroup.r"），端口/节点判断须带图上下文（完整 id 命中节点优先，否则拆 node.port） | ✅ 930/931/932 差分全等实证 | 已采纳 | 移植规范 |
| R21 | radial | Java 原样保留细节：EadesRadial tau=2*acos(0/0+radius) 恒 NaN 走 else；CrossingMinimizationPosition rootY=root.getX()（Java bug）；EdgeLengthPositionOptimization rootY=+root.getHeight() 无 /2 | ✅ 差分全等 | bug-for-bug 保留 | 1:1 对齐 |
| R22 | radial | ORDER_ID/ROTATION_TARGET_ANGLE/CHILD_AREA 等内部属性走内存 WeakMap（Java setProperty 不导出 JSON），读优先级 内存 > layoutOptions > 默认 | ✅ 差分全等 | 已采纳 | 内部属性读写规范 |
| R23 | radial | OPT_MAP 无 radial 选项键 → radius/compactor/sorter/rotate 分支未被差分覆盖（Scope 限制未碰 shared/） | ⏳ 待补（与 R27 同源：OPT_MAP 补键） | 待办 | shared/opt-map.ts 补 radial.* 键 |
| R24 | vertiflex | **Scope 偏差**：shared/opt-map.ts 加了 4 条 vertiflex.* 选项映射（语料表达选项所必需，spore 移植时同样加过 overlapRemoval） | ✅ 已审 diff，与 spore 先例一致 | **接受**（合并已带入） | 后续 NLA 移植允许同类 opt-map 补键 |
| R25 | vertiflex | NodeMicroLayout（omitNodeMicroLayout=false 默认）移植为 no-op — 触发语料无标签/端口，有标签/端口的树可能差 | ✅ R74 已实现 | **已修 (R74)**: node-micro-layout.ts 移植 (端口排序/尺寸/放置/标签/margin) + 26 模型 jar 全等 + 18 BDD | vertiflex 1:1 |
| R26 | vertiflex | splitGroup 的 Java while 无 i++（0.12.0 原版 bug）bug-for-bug 保留，jar 差分实证全等 | ✅ 差分全等 | bug-for-bug 保留 | 1:1 对齐 |
| R27 | vertiflex | margins 不在 OPT_MAP，语料无法设置 margins（默认 0 路径已覆盖） | ✅ 默认路径覆盖 | 记录 | opt-map 可后续补 |
| R28 | vertiflex | CONSIDER_NODE_MODEL_ORDER 是根节点级读取，与 process() 容器级字段两处独立读取（1:1 保留） | ✅ 差分全等 | 已采纳 | 移植规范 |
| R29 | disco | 语料算法 id 必须是 org.eclipse.elk.disco（melk idPrefix），写 org.eclipse.elk.alg.disco 时 jar 报 UnsupportedConfigurationException | ✅ 初版语料踩坑已修正 | 已采纳 | NLA 语料 id 规范 |
| R30 | disco | polyomino 选项 melk 默认 traversalStrategy=QUADRANTS_LINE_BY_LINE、fill=true，与 Java 代码 switch default（QUADRANTS_JITTER）不同 — 必须按 melk 默认（jar 行为）实现 | ✅ 差分全等 | 已采纳（options.ts 注释说明） | melk 默认优先于代码 switch |
| R31 | disco | TwoBitGrid 用 BigInt 复刻 Java long 位压缩（JS number 53 位溢出） | ✅ 差分全等 | 已采纳 | 位压缩实现规范 |
| R32 | disco | 内部边无 section 时 firstEdgeSection 创建退化 section（Java createEdgeSection 语义）；同分量节点输入坐标全 0 共享偏移 → 最终坐标重合（941 jar 行为） | ✅ 941/942 差分全等 | 已采纳 | 边 section/分量偏移规范 |
| R33 | disco | 未移植 COMPONENT_COMPACTION_COMPONENT_LAYOUT_ALGORITHM 子算法能力（语料不触发，disco-layout.ts 注释说明） | ⏳ 语料无触发 | 记录已知缺口 | 按需补 |

## NLA 并行批次 mrtree (2026-08-12, wt/mrtree 完成后登记)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R34 | mrtree | mrtree 选项默认值来自 Tree.melk 而非 core：padding=ElkPadding(20)、spacing.edgeNode=3（与 core 默认 12 不同）— NLA 移植应先读各自 .melk | ✅ Tree.melk 实证 + 差分全等 | 已采纳 | NLA 选项默认值规范 |
| R35 | mrtree | Java 原始 bug 1:1 保留：EdgeRouter 水平分支 start.y < first.x（应为 first.y），jar 实证如此 | ✅ 差分全等 | bug-for-bug 保留 | 1:1 对齐 |
| R36 | mrtree | AlgorithmAssembler 同 slot 处理器按枚举 ordinal 排序（COMPACTION 在 LEVEL_COORDS 前） | ✅ 差分全等 | 已采纳 | 中间处理器排序规范 |
| R37 | mrtree | apportion 的 leftSiblings=0 → portion=Infinity 分支在 921 实际触发且行为一致 | ✅ 921 差分全等 | 已采纳 | 边界分支保留 |
| R38 | mrtree | OrderBalance 与 EdgeRouter.cyrusBeck 为 Java 0.12.0 dead code（无调用方），未移植 | ✅ 已核实无调用方 | 记录 | 不移植合理 |
| R39 | mrtree | 调试 probe MrTreeProbe.java 已移至 /tmp 供复用 | ✅ | 已采纳 | 复用 probe |

## 坐标模式移植 (2026-08-12, main 线程)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R40 | 用户质疑 (LCA 投影) + 文档调研 | ELK JSON 坐标模式官方选项 `org.eclipse.elk.json.shapeCoords/edgeCoords` (ShapeCoords: INHERIT/PARENT/ROOT 根默认 PARENT; EdgeCoords: INHERIT/CONTAINER/PARENT/ROOT 根默认 CONTAINER)。elkjs 0.12.0 实测 `edgeCoords=ROOT` 直接输出全局边坐标 (e2 inside→n3: (0,27)→(74,101), 等于 LCA 偏移投影结果)。**Issue #1012 确认无布局选项强制全局坐标, 但 json.edgeCoords 即官方机制** (Issue 作者未发现) | ✅ elkjs 0.12.0 实测 + 官方文档 (coordinatesystem.md / jsonformat.md / graphdatastructure.md) | **已实现** (elk-json.ts readCoordsModes/applyCoordsModes): ROOT 投影, 6 bdd 全过 (含 elkjs 差分 + 内部不变量) | 坐标模式 API 对齐 | 
| R41 | 本次移植 | EdgeCoords.**PARENT** 对 elk-layout 输出 **≡ CONTAINER** (elk-layout 边挂载处 = LCA 容器 = proper container), 无需额外投影; 仅 ROOT 需实现。INHERIT 显式 = 默认 (根默认) | ✅ 枚举语义分析 + 6 bdd 等价不变量 | 已采纳 | 坐标模式实现范围 | 
| R42 | 全量门禁 | 预先存在失败基线 (与本次改动无关, HEAD a4ad19d worktree 复跑确认): api 2 失败 (json-import stress 报错路径 / mutation-targets ZZZ 报错路径, "Cannot set properties of undefined (setting 'width')"); bdd 3 失败 (north-south-ports N-S 正交边路由 Step3/FIXED_POS/HOR) | ✅ 干净 HEAD worktree 复跑同 2+3 失败 | 记录为基线, 待修 | 后续修复队列 | 

## 坐标模式审阅闭环 (2026-08-12, Dewey 对抗审阅 + 主线程修复)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R43 | Dewey 对抗审阅 | **edgeCoords=PARENT 语义错误被假绿掩盖**: ELK PARENT = 相对边在**输入 JSON 声明处**节点 (elk-worker.js `$adjustX`: globalX(containing)−globalX(originalParent)), 非相对 LCA; 边声明在 root、LCA=inside 时 elkjs PARENT 输出全局 (74,101), 原实现输出相对 inside (0,27) | ✅ elkjs 0.12.0 实测 + 反编译源码 | **已修**: extract 记录声明父 (input 树 key→容器), applyCoordsModes PARENT 投影 = LCA偏移 − 声明父偏移; 测试与 elkjs 差分 | PARENT 语义 1:1 |
| R44 | Dewey 对抗审阅 | ①readCoordsModes 合并优先级 input-wins 与 elkjs (options 生效) 及 buildGraph (Object.assign options 覆盖) 矛盾; ②只读根级 layoutOptions, per-node 坐标模式 (elkjs 按元素继承) 被忽略; ③toUpperCase 使小写也生效 (elkjs 大小写敏感) | ✅ 三处均实测确认 (per-node 继承: elkjs 0.12.0 与 jar JsonImporter.transferLayout 逐点一致) | **①②③已修**: normOptionKey 键归一 + options 覆盖 input + 大小写敏感; readCoordsModes 递归解析 per-node 继承 (shapeCoords 决定子树输出参照系, edgeCoords 按边声明父生效, 只向下传播), applyCoordsModes 按节点投影; BDD 5 用例 elkjs 差分全过, 全量门禁 4615 过 / 0 失败不降 | 选项解析规范 + 坐标模式 per-node 继承 |
| R45 | 主线程验证 | black-box (box) + **内部边** + layoutElkJson 在 buildGraph 阶段抛 UnsupportedGraphException (attachSubtreeEdges 后 collectEdges 校验) — 根因: attachSubtreeEdges 用 id 前缀 ('box.') 匹配, API 路径直接子节点引用是 'b1' 无前缀 → 内部边未挂 box → 跨层级校验误报 | ✅ HEAD 复跑 + 逐层定位 + elkjs 差分 | **已修**: attachSubtreeEdges 改「black-box 子树后代 id 集合」匹配 (含端口引用剥段); 布局成功 + 内部边留 box.edges + box 内部与 elkjs 一致 (BDD 16/16) | **已关闭** |

## 坐标模式回归基线 (2026-08-12)

| 门禁 | 基线 (HEAD a4ad19d) | 本次 (7dd43ae + 修复) | 结论 |
|---|---|---|---|
| api (含 coords-modes 13) | 90 过 / 2 失败 (stress/ZZZ 报错路径) | 97 过 / 2 失败 (同上, 预先存在) | 不降 |
| bdd | 355 过 / 3 失败 (north-south-ports) | 355 过 / 3 失败 (同上, 预先存在) | 不降 |
| typecheck elk-json.ts | 0 错误 | 0 错误 | 无新增 |

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R46 | Dewey 复审 (P0) | **collectDecl off-by-one**: `collectDecl(c, node.id)` 把祖父当声明父 → edgeCoords=PARENT 对声明父≠root 的边全错 (声明 outside: elkjs (12,39) vs ggn 全局 (74,101)); 被 PARENT 用例"声明父=root"恰好掩盖 | ✅ 复审实测 3 情形 + 主线程补测试 (声明父=outside/inside 差分) | **已修** (collectDecl(c, c.id)); 键后缀归一 (json.edgeCoords/裸 edgeCoords → org.eclipse.elk.json.edgeCoords, 对齐 elkjs $getOptionDataBySuffix) | PARENT 语义 1:1 |
| R47 | Dewey 复审 (P3) | black-box 子树边默认/CONTAINER 无 container 字段 (mergeBlackBoxSubtrees 原样带出, 与 layered 边不一致) | ✅ R74 jar/elkjs 实证 (container=LCA 容器 id) | **已修 (R74)**: mergeBlackBoxSubtrees 给黑盒内部边补 container=node.id; 4 BDD 用例 (与 elkjs 逐边对拍) | 输出一致性 |

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R48 | Dewey 复审 (P2 收窄) | normOptionKey 后缀归一过宽: 误把 elkjs **忽略**的 org.eclipse.elk.edgeCoords / elk.edgeCoords / my.custom.* 当坐标模式 (劫持自定义选项) | ✅ elkjs 0.12.0 逐键实测接受集: 生效=裸名+含 json. 段; 忽略=无 json. 段 | **已修** (收窄到 `k === 'edgeCoords' \|\| k.endsWith('json.edgeCoords')`); 补"应忽略"差分用例 (15/15) | 键形态 1:1 |


## 失败基线修复 (2026-08-12, goal 019fd30f)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R49 | 本次 black-box 差分 | **black-box 孤立节点在 root 层分层差异**: 无连接 black-box 节点 (box) 与无入边节点 (n1/n2) 的层分配 ggn vs elkjs 不同 (ggn box 第一层 y=12, elkjs n1/n2 第一层 y=12 box 第二层); box 内部 (box 算法部分) 与 elkjs 一致, 差异在 layered 分层对孤立黑盒节点的处理 | ✅ 有/无内部边两图差分实证 | **待修**: layered 分层算法对孤立 black-box 节点的层/槽分配 1:1 对齐 | 后续修复队列 (layered) |
| R50 | 本次 api 修复 | api 2 失败根因: ①stress 已移植 (R09) 但测试断言仍期望"尚未移植"; ②ZZZ 测试用 stress 算法期望未移植报错 — 均过时; 真实 bug 是 leaf 节点 (无子节点) 也被 runCoreProviders 调 stress → force recombine 空图丢 ORIGIN → width undefined | ✅ elkjs 实测 leaf+box/stress 均不调用 provider (Java RecursiveGraphLayoutEngine L151: hasChildren \|\| hasInsideSelfLoops) | **已修**: runCoreProviders 跳过 leaf; 更新 2 个过时测试 (stress 改 leaf 正常布局 + 有子节点触发; ZZZ 用真正未移植算法) | 算法分派 1:1 |
| R51 | 本次 bdd 修复 | bdd 3 失败 (north-south-ports Step3/FIXED_POS/HOR) 根因: 测试文件 import 漏 `expect` (ReferenceError), 非算法 bug | ✅ 补 import 后 16/16 全过 | **已修** | 测试卫生 |

### 回归基线更新 (2026-08-12)

| 门禁 | 修复前基线 | 修复后 | 结论 |
|---|---|---|---|
| api | 99 过 / 2 失败 (R42) | **103 过 / 0 失败** | 全绿 |
| bdd | 355 过 / 3 失败 (R42) | **358 过 / 0 失败** | 全绿 |

## R49 修复闭环 (2026-08-12, 黄金向量法)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R49 | 目标 019fd30f 遗留 | **孤立 black-box 层内排序**: Java 对 SEPARATE_CHILDREN 子图两遍布局 (box 第二遍加入层尾, 确定性, seed 无关); ggn 单遍黑盒把 box 当普通孤立节点 (随机 bc → 排层首) | ✅ Java seed=1/2 实测 box 均 (12,52) 排 n1 后 (确定性); 普通孤立节点 c 两边一致 (排前) | **已修**: barycenter-heuristic fillInUnknownBarycenters 前置 — 孤立 black-box (bc null + 非 layered 算法) 赋最大 bc 排层尾; P3 后 layer0=[n1,box] 与 Java 一致 | **已关闭** (核心排序对齐) |
| R52 | R49 修复过程 | **black-box 层宽架构差异**: Java 两遍布局第一轮 root 图无 box (layer0 宽=40 → n1 xpos=0 靠左), ggn 单遍含 box (layer0 宽=60 → n1 ratio=1 → xpos=20 靠右); 最终 n1/n2 x 差 20 (ggn 32/92 vs Java 12/72), box 内部/尺寸/层内顺序一致 | ✅ PortStateProbe 实证 Java layerW=40 (第一轮) vs ggn 60 | **记录已知限制**: 单遍 vs 两遍 black-box 架构差异; 黄金向量测试不断言 n1/n2 精确 x (断言相对关系 + box 内部) | 后续若需完全对齐需两遍布局 (架构级) |
| R53 | R49 黄金向量 | 新增 tests/api/r49-blackbox-golden.test.ts (4 用例) + fixtures/r49-blackbox-golden.json (Java seed=1): 断言 P3 层内顺序 (box 层尾) + box 子树 golden 一致 + 边结构 + 层分配相对关系 | ✅ 4/4 全过 | 已采纳 | 黄金向量测试规范 (固定 seed, 不模拟 random) |

## R49 审阅闭环 (2026-08-12, Plato 对抗审阅 P0-P2 修复)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R54 | Plato 审阅 P0-P2 | R49 初版实现种子不健壮 (仅 fillInUnknownBarycenters, randomizeBarycenters 未覆盖 → 26% 种子 box 排反); maxBc+1 不保证绝对层尾 (普通孤立随机 bc 可反超); 误伤 leaf 带算法节点; 多 black-box 平局排序 | ✅ 逐项复现 (seed 扫描 53/200 失败; 混合图 box 非层尾; leafBox 被压层尾) | **已修**: ①blackBoxIds 只含有子节点 (leaf 带算法 Java 当普通节点, R50 已跳过 provider); ②buildGraph 给有子 black-box 打 SEPARATE_CHILDREN 标记 (对齐 Java L208); ③barycenter randomize+fillInUnknown 均对 SEPARATE_CHILDREN 赋 MAX_VALUE (绝对层尾, seed 无关); ④MedianHeuristic 对称 (仅孤立 black-box 赋 MAX); ⑤测试补混合/leafBox 用例 (6/6, seed 全键) | **已关闭** (种子健壮 + 绝对层尾) |
| R56 | Plato 复审 (P1) | randomizeBarycenters 缺 isIsolated → 有连接 black-box 被强制层尾 (88/200 种子, Java 对连接 box 正常参与排序层首) | ✅ 复现 + connectedBox 50 种子扫描 0 失败 | **已修**: randomize+fillInUnknown 均加 isIsolated; 补 connectedBox 测试 (7/7) | 种子健壮 |
| R57 | Plato 复审 (P2-1) | **多 black-box 排序/分层仍为已知差异** (全 box 图 ggn 输入序 vs elkjs 倒序; n1→n2+2box ggn 同层尾 vs elkjs box1 第 1 层) — 需两遍布局, 不在本次范围 | ✅ 复审实测 | **记录已知差异** (R54 未显式登记, 已补) | 后续: 两遍布局或按需 |
| R55 | Plato P0-2 | **既有 bug**: shortOptKeys 对 `elk.randomSeed` 短键静默忽略 → RANDOM_SEED 恒 1; 测试曾因此假绿 | ✅ R74 修复: elkjs 交叉验证 elk.randomSeed=2 与全键输出一致, 种子敏感图 8 节点全变 | **已修 (R74)**: shortOptKeys 加 m.elkjs===k 匹配 (通用, 所有 elk.* 短键); coerceVal 数值健壮性; 7 BDD 用例 | 选项解析规范 |
| R52 更新 | Plato §4 | n1/n2 x 差异确认准确 (ggn 32/92 vs Java 12/72, 差 20); commit 7c6cdd2 笔误 "Java 20/92" 应为 "ggn 32/92" | ✅ 实测一致 | 已修正记录 | 文档一致性 |

## demo-vite 渲染修复 (2026-08-12)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R58 | 用户报告 (demo-vite 控制台 ReferenceError) | a4ad19d 提交**意外删除** runElkLayout/runElkjs 定义 (删定义未删调用) → render() ReferenceError: runElkLayout is not defined | ✅ vite build 通过; dev server main.ts 模块含两函数定义 | **已修**: 恢复 runElkLayout (projectElkJson+layoutElkJson+direction) 与 runElkjs (elkjs 前缀改写+layout) 定义 | demo 渲染恢复 |

## demo-vite 非 layered 算法示例 (2026-08-12)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R59 | 用户请求 | demo-vite 只有 layered/正交路由例子 → 新增 12 个非 layered 算法示例 (box/fixed/random/stress/force/rectpacking/topdownpacking/spore/radial/vertiflex/disco/mrtree), root 直接指定 org.eclipse.elk.algorithm | ✅ layoutElkJson 12 算法 root 运行全成功; luna 视觉审阅 6 张 (box/radial/mrtree/stress/disco/spore) 全 PASS (布局合理/边连接/无重叠); 首轮 3 FAIL 是验证脚本投影 bug (非层级边误加源节点偏移), 修正后 PASS | **已提交**: scripts/build-demo-algs.mjs 生成 data/algs_*.json + main.ts GRAPHS 12 条目 (status=wip, 待 Java 差分) | demo 覆盖全部已移植算法 |

## demo-vite 去手动投影 (2026-08-12)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R60 | 用户质疑 (为什么手动算投影) | demo 的 projectElkJson (55 行 LCA 手动投影) 是坐标模式实现前 (R40) 的遗留; 库已支持 org.eclipse.elk.json.shapeCoords/edgeCoords=ROOT (直接输出全局坐标) | ✅ coords-modes 差分验证; luna 复审 7 张 ROOT 渲染全 PASS (6 非 layered + hierarchicalEdges 跨层级边端贴合 n1 左边界); 首轮 hier FAIL 为验证 SVG 渲染顺序 (矩形盖边), 非坐标问题 | **已修**: projectElkJson → flattenElkJson (20 行拍平); runElkLayout/runElkjs 均用 ROOT 坐标模式 (LCA 偏移由库处理); -35 行手动投影代码 | demo 渲染简化, 库能力复用 |

## demo-vite force 显示 layered + 侧边栏滚动 (2026-08-12)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R61 | 用户报告 (force 显示正交 layered) | ① explicitAlgorithms 对 root 只读 API options.algorithm, 不读 input.layoutOptions → demo root=force 未被识别; ② layoutElkJson 固定 root 走 layered (blackBoxIds 含 root 但 provider 结果被 LayeredLayoutProvider 覆盖); Java RootAlgProbe 实测 root resolved=force/sporeOverlap (尊重 root 算法) | ✅ Java RootAlgProbe 实证; 修复后 force 力导向 (luna PASS), spore root 与 Java 全等 (n1=(8,8)...); 12 算法 root 分派全生效 | **已修**: explicitAlgorithms root fallback input.layoutOptions; layoutElkJson root 非 layered → provider 布局返回 (不走 layered); spore 910 测试更新 (root 算法生效, 旧 harness 强制行为过时) | root 算法分派 1:1 |
| R62 | 用户报告 (侧边栏滚动带动右侧) | .app 用 min-height:100vh (不限高) → 侧边栏内容撑高页面 → 整体滚动; 应固定高度 + 左右独立滚动 | ✅ vite build; 移动端改回页面滚动 | **已修** (index.html CSS): .app height:100vh + .body overflow:hidden + .stage-wrap overflow-y:auto; @media 移动端 height:auto | demo 布局 |
| R63 | 本次 12 算法验证 | vertiflex root 布局输出全部 (0,0) — 简单无标签/端口语料 NodeMicroLayout no-op | ✅ R74 带标签/端口语料 26 模型 jar 全等 (root (0,0) 为无标签语料正常) | **已修 (R74)**: 语料增强 + NodeMicroLayout 实现, root 布局正常 | vertiflex 验证 |

## Intersections LEFT 方向差异 (2026-08-12, 用户报告)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R64 | 用户报告 (LEFT 正交路由) | 原记录 ggn LEFT 2 节点 (NN30/NN32) y 差 10/29, 根因链指向 SOUTH 端口 dummy 层内排序 | ✅ R74 复核: 当前 HEAD Intersections LEFT 220/220 与 jar 逐点相等 0 差异; NS dummy 排序 jar/ggn 同构 (SOUTH 插源节点后一格); seed 1/2/3/7/42 + per-side index + RIGHT 全 0 差异 | **已修 (R74)**: 源码已与 Java NorthSouthPortPreprocessor 1:1 (零改动), 新增 2 回归测试锁定 (最小分量 LEFT SOUTH dummy 排序 + jar 全等); 附带发现: 带 labels 时 220 节点有 x 轴平移差 (非 NS 链, 另立条目 R75) | layered 端口排序 1:1 |

## 剩余未通过测试清理 (2026-08-12, parallel-porting 分簇)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R65 | 全量扫描 | eps-scan 需 EPS_FILES 环境变量, 无配置时 throw 被当门禁失败; 实际是显式列表扫描工具 | ✅ 无 EPS_FILES 时 skip | **已修**: it.skipIf(!EPS_FILES) | 门禁净化 |
| R66 | 全量扫描 | **运行方式**: 仓库根跑 vitest 用不到 package globals:true → generated/core 文件 describe is not defined 假失败; cd packages/layout 跑正常 (此前统计含假失败) | ✅ cd package 后 generated/order-test 全过 | **已修(流程)**: 门禁命令统一 cd packages/layout | 测试规范 |

## 剩余未通过测试清理 — 并行分簇合并 (2026-08-12, parallel-porting 阶段 5/6)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R67 | 分簇扫描 (unit 失败) | ComponentGroupTest INCLUDE_CHILDREN + 无嵌套 → 期望拆 2 分量失败. 首轮修复 (wt-componentgroup d0dd53b) 改成"扁平 INCLUDE 照拆" — 对抗审阅 (Chandrasekhar) 发现与 SSOT 相反: ELK Java 在 INCLUDE 时由 provider 分派 doCompoundLayout (hierarchicalLayout), 从不调 split, 与图是否扁平无关; jar 实证 (LayoutJsonMain 扁平 INCLUDE 双分量): 整图布局 a1=(62,72)/b1=(12,112) vs split+combine a1=(12,12) 差 50. 已复现确认并回退 | ✅ 修正后 ggn==jar (model1 a1=(12,12); model2 c1=(32,12)/a1=(62,72)/b1=(12,112) 逐点一致); ComponentGroupTest 52/52; 全量 4610 过 / 0 失败 | **已修 (审阅修正)**: split 恢复 `isInclude → return [graph]` (一律不拆, a4285d3 行为); 错误断言测试改为"扁平 INCLUDE 不拆分" | 组件拆分 1:1 (INCLUDE 永不拆) |
| R68 | 分簇扫描 (unit 失败) | labels-kill 2 个用例 (DOWN/UP 转置 minimum) 编码 a50caae 之前的处理器内手动互换旧行为; R16 后方向转置已 1:1 移入 GraphTransformer TO_INPUT, 处理器按 Java NodeSizeCalculator 原样应用 minimum (再互换 → 476 200x200 vs jar 200x100 回归, 已实证) | ✅ wt-labels 87e45ed; 合并后 labels-kill 28/28 + direction-transform 3/3 + Issue476 过, 476 守卫无回归 | **已修(测试)**: 用例改为与真实管线同序 (layerless → TO_INPUT 转置 → setLayer → P4 处理器); 断言不变 100×200 | 测试对齐正确架构 |
| R69 | 分簇扫描 (oracle 失败) | EdgeRoutingE2E 528_violatedNodeOrder::DOWN/UP 仍标"已知失败", 但 a50caae/b67537d 已修复方向变换+正交路由, 边弯点与 jar 逐点一致 (matched 3/3); scan-edge-e2e --write 重生成后 newlyPass 仅这 2 项, newlyFail=0, oracleHash 不变. 审阅确认: 无漏翻 (LEFT/RIGHT 原本 true; 528_nodeEdgeOverlap::DOWN 仍 false 真实失败); 但另有 8 条目 nodesOk false→true (direction/mixingDirection/inside_compound_nodes_02/734 的方向组合) — 门禁从"容忍节点差异"收紧为"节点与 jar 全等", 需留意字体/平台 1px 偏差 | ✅ wt-ortho528 9e6a47c; 合并后 EdgeRoutingE2ETest 941/941; oracle 全量 1964 过 / 12 skip | **已修(注册表)**: 528 DOWN/UP ok:false→ok:true 移入门禁; 其余 12 项仅刷新诊断元数据, ok 无翻转 | 门禁同步 (nodesOk 收紧 8 条目, 已知) |
| R70 | 分簇扫描 (core 失败) | bisect 701 精简模型 HIERARCHY 含重复子条目 (N2 挂 1/8/9/14/15/16, N3 挂 0/10/11/13); elkjs 侧 buildElkHierarchy 按原样复制 → 重复 id 模型, ELK Java jar 直接抛 IllegalArgumentException (无效模型); ggn 每索引 first-parent-wins 才是 ELK 语义; 全量 45 节点 701 elkt vs jar 0 坐标差, 无 src 缺口 | ✅ wt-bisect701 68ec340; 合并后 bisect 4/4 (701 差分 955→0); 316 两组不受影响 | **已修(测试)**: buildElkHierarchy 共享 built 集合 first-parent-wins 去重; walkGgn 按实际父归属递归; 不碰 src | 测试模型合法化 |
| R71 | 全量扫描 (debug 残留) | tests/debug/* 一次性调试探针 (模块轨迹 west-output / src-dist 对照 dst-only,src-dist-compare / 依赖 /tmp 产物的 zz-623n,q) 在默认 vitest run 里失败 (dist 未构建 / /tmp 产物已清理 / 故意 throw) — 属环境依赖探针, 非门禁 (progress.mjs 门禁 = api/bdd/unit/core/oracle) | ✅ 排除后 npx vitest run 全绿: 227 files passed, 4610 passed / 18 skipped / 0 failed | **已修(流程)**: vitest.config exclude tests/debug/**; 探针统一命名 *.debug.test.ts (R73 整理); R64 WEST 调试用 west-output.debug.test.ts | 门禁净化, 调试探针保留 |

## demo-vite elkjs 方向切换边路由斜线 (2026-08-12, 用户报告)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R72 | 用户报告 (elkjs + Intersections LEFT 渲染错) | **根因不是 elkjs 布局, 是 demo 输入污染**: elkjs.layout **原地修改输入** (children 写 x/y/$H, edges 写 sections/bendPoints); demo runElkjs 用浅拷贝 {...parsed}, current.data 是模块级共享引用 → 首次 elkjs 渲染污染, 二次渲染 (切 elkjs 后选 LEFT) 用带预置 sections 的输入, elkjs(gwt) 对 14 条边输出**相对坐标** bendPoints (如 {x:310,y:127}), flatten 当绝对坐标画 → 大量斜线/悬空 | ✅ 黑盒: 干净输入 elkjs LEFT == jar LEFT 0 差异 (220 节点+200 边, 含 bends); 复现: 共享对象 RIGHT→LEFT 后 e9/e23/e35 出现相对 bends; 修复后全 bends=0; demo 渲染主线 608 段 0 斜线, 方向往返无累积污染 | **已修** (demo-vite/main.ts 491e953): runElkjs/runElkLayout 每次 structuredClone 输入 | demo 渲染 (elkjs 是 oracle, 输入必须干净) |

## 目录整理 + 命名规范 (2026-08-12, 用户确认 + 对抗审阅)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R73 | 用户请求 (整理目录/规范命名/清理临时产物) | ① 根目录 16 个临时产物删除 (debug_*/scratch_*/pi-session/test-for/test-render); ② elk-layout demo/(旧静态 demo, build-demo 脚本生成目标, 删后自动重建) + probe-merge/probe-n166.tmp + elkjs-test.tmp 删除; ③ vis-export-tmp.mjs 是 vis.mjs 运行时动态产物 → git rm --cached + gitignore; ④ 顶层 9 调试脚本 (cmp-*/h06-*) 移入 scripts/debug/ 并改写相对 import (P0: 移动不改 import 即坏); cmp-* 原 import 不存在的 buildLGraphFromParsed (elkt-build 未 re-export) → 改指 shared/elkgraph-builder.ts (同源修复); ⑤ elk-java-debug 5 个 probe 提交入库; ⑥ tests/debug 探针统一命名 *.debug.test.ts (west_debug→west-output, dst_only→dst-only, src_dist_compare→src-dist-compare, 11 个加后缀), 删除失效 zz-623n/q, 根 tests/zz-gg1→elk-layout/tests/debug, zz-p1→ggn-layout/tests (归位后可运行); ⑦ 磁盘清理 4.6GB (stryker-tmp/.stryker-tmp 3.0G 等, gitignore 已覆盖) + test-results/.last-run.json 移除并忽略 | ✅ 审阅 (Poincare) P0/P1 修正: C 移动 import、E5 归属 ggn-layout、E4 计数 11; cmp 3 脚本 bun build 通过, h06-check 实际运行通过, zz-p1 归位后 1/1 过; 全量门禁见 R74 | **已执行**: 见提交 0a4e.. / 73b.. (目录整理) | 仓库整洁 + 探针命名规范 |

## 遗留待办并行批次修复 (2026-08-12, parallel-porting 5 簇)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R74 | 5 簇并行批次 (R55/R47/R64/R44/R25) | 按 parallel-porting: 5 worktree 并行实现 + Fermat 对抗审阅 (R44 PASS / R25 RISK→P1 修复) + 逐簇合并每合必测 | ✅ 全量门禁 **4640 passed / 0 failed** (基线 4610 + 30 新增); R55 7 + R47 4 + R64 2 + R44 5 + R25 9 + R25-P1 3 用例全过; elkjs/jar 交叉验证 | **已修**: 见各 R 行; 提交 03dd878(R55)/313b404(R47)/485db7c(R64)/61de1f1(R44)/a3ca637+470d4f9(R25) | 5 待办清零 |
| R75 | R64 附带发现 (Huygens) | Intersections 带 labels 时 220 节点全 x 轴 (层轴) 平移差 (y 差 0), 与 NS dummy 链无关, 疑似 label 尺寸/放置问题 | ⏳ 未复现原因未深挖 (非 R64 scope) | **登记待查**: label 尺寸/放置对层轴平移的影响 | label 1:1 排查 |
| R76 | Fermat 审阅 R25 (P2 遗留, 已声明未移植) | ①同 cell 多标签尺寸漏计 gap (内部不一致); ②PORTS_OVERHANG 无条件忽略 (sizeOptions 未读); ③margin 缺端口标签/边 head-tail 标签 + 零尺寸元素跳过; ④测试只断言坐标无算法不变量 (jar 对拍非 CI oracle) | ✅ 语料不覆盖; 文件头已声明真实未移植项 (PORT_LABELS/FIXED_POS/FIXED_RATIO/MINIMUM_SIZE/H_PRIORITY/OUTSIDE 多标签) | **登记待查**: 后续 vertiflex 语料增强或补不变量断言 | vertiflex 边界 |
| R77 | Fermat 审阅 R44 (P2 遗留) | ①ports/labels 不参与 shapeCoords 投影 (layered 输出本不含, 黑盒路径可见 — 既有 box provider 端口放置缺口); ②同端点边 key 冲突 (declParent 已文档化) | ✅ 主路径无差异; elkjs 差分 0 mismatch | **登记待查**: 黑盒路径端口投影 (既有缺口, 非 R44 引入) | 坐标模式边界 |

## vertiflex spacing 继承差异修复 (2026-08-12, R78)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R78 | R25 fixer (Erdos) 记录 + 用户指派修复 | **spacing 继承差异真实影响 vertiflex 输出**: jar 用 IndividualSpacings (graph 级继承), ggn vertiflex optNum 只读 node 级 → root 设 spacing.portPort/labelLabel/labelNode/nodeLabels.padding 被忽略. 关键 SSOT 发现 (jar 实证 A2/B2/C2/P): **Java getIndividualOrInherited 只查 node.spacing.individual 覆盖 + graph(root) 直接属性 + 默认, 不读节点直接 spacing** → 节点上直接设 spacing 选项被忽略 (与直觉相反, 已锁定用例) | ✅ 8 组 jar 探针全等 (root 级 labelLabel=4→198×74 / labelNode=7→y=-21 / portPort=20→宽104 / nodeLabels.padding→118×38; node 直接设全被忽略; individual 覆盖胜出); 门禁 **4644 passed / 0 failed** (基线 4640 + 4 新增); vertiflex 22 用例全过 | **已修** (a68e1c6): parseIndividualSpacings (Java ";,;" 分隔串) + spacingValue/optNumSpacing (individual 覆盖 > root 显式 > 默认), node-micro-layout 全部 spacing 消费点改继承读取 | vertiflex spacing 1:1 |

## R78 设计意图调查 + 对抗评审 (2026-08-12, Popper)

**问题**: "节点上直接设 spacing 选项被忽略" 是 jar 的 bug 还是有意设计?

**最终结论**: **有意设计, 非 bug** — 但成立范围是 **vertiflex / alg.common NodeMicroLayout 微布局消费点** (R78 修复对象), 不能全局推广到整个 ELK.

| 子句 | 判定 | 证据 |
|---|---|---|
| vertiflex 中节点直接设 spacing 被忽略 (NodeContext 只查 individual + graph) | ✅ | NodeContext.java:162-171 全部 7 个 spacing 字段走 IndividualSpacings.getIndividualOrInherited; alg.common/nodespacing 包内无节点自身直接读路径 |
| 优先级 individual 覆盖 > 父(graph) 显式值 > 默认 | ✅ | IndividualSpacings.java 两个重载; LGraphUtil.java:1100 同构 |
| getIndividualOrInherited 是**唯一** spacing 读取路径 | ⚠️ 仅 vertiflex 成立 | layered 数十处直接 `layeredGraph.getProperty(SPACING_*)` 连 individual 都不看; **NetworkSimplexPlacer.java:922 直接读 lNode 自身 SPACING_PORTS_SURROUNDING (真实反例, 节点直接设生效)** |
| 官方文档明确说明"节点直接设 spacing 产生歧义" | ❌ 过强 | spacingdocumentation.md 只对 **compound node** 说歧义, 对叶子节点反而暗示直接设置可行 ("could be solved by simply setting…"); 文档未说"被忽略" |
| ElkNode.getProperty 无父链继承 | ✅ | EMapPropertyHolderImpl 纯 map 查找, hasProperty 只看本地 map |
| a68e1c6 修复与 jar 对齐 (scoped vertiflex) | ✅ | spacingValue/optNumSpacing = individual > root > default, 5 个消费点全改继承; 4 个 BDD 期望值可由 Java 语义独立推得 |

**为什么是设计而非缺陷 (设计动机)**: spacing 是**两个元素之间**的量; 若每个节点可自设, 相邻节点间距冲突无法消解; compound node 自设更歧义 (作用于子节点还是自身?). 官方解法 = 父容器统一声明 + `spacing.individual` 显式覆盖. 实际实现比文档更严格 (叶子节点直接设也被忽略).

**未来扩展陷阱** (不在当前 BDD 覆盖, 勿把本结论推广):
1. layered `SPACING_PORTS_SURROUNDING` 节点直接设生效 (NetworkSimplexPlacer:922), layered 内部对该属性 direct-read 与 getIndividualOrDefault 两种读法并存.
2. "individual 覆盖" 非 ELK 全局语义 — 仅走 getIndividualOrInherited/getIndividualOrDefault 的路径成立.
3. Java 继承只查**一级** immediate parent; TS spacingValue 直读 root — vertiflex 平树等价, 嵌套图上复用会分歧.
4. Java IndividualSpacings.parse 支持 legacy id / 类型化 parseValue / 非法串抛异常; TS 无 legacy id 匹配、非法项静默跳过.
