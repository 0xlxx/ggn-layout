# layout 算法移植笔记

> 目标: 100% 1:1 移植 ELK layered 到 layout, 以 elkjs 坐标级差分 (1807 测试) 为验收。
> 本文档记录**关键算法的正确语义** (以 elkjs 为 oracle 实测为准), 以及移植过程中的**方法论与经验教训**。

## 1. 管线顺序 (P1 → P5) 与处理器清单

单图 (doSimpleLayoutInner) 与层级图 (runGraphPreP3/PostP3) 的处理器顺序 (elkjs 实测):

```
pre-P3:
  EdgeAndLayerConstraintEdgeReverser   ← P1 最前: 反转违反方向约束的边 (inverted ports)
  GreedyCycleBreaker                   ← P1 断环
  LayerConstraintPreprocessor          ← 隐藏 FIRST_SEPARATE/LAST_SEPARATE 外部端口 dummy
  NetworkSimplexLayerer (P2)
  LayerConstraintPostprocessor         ← 恢复 FIRST/LAST 与 hidden 节点
  LongEdgeSplitter → PortSideProcessor ← 顺序不能反 (dummy 端口侧需先拆分)
  InvertedPortProcessor                ← 反向端口 (WEST 输出/EAST 输入) 建 LONG_EDGE dummy
  PortListSorter                       ← 端口按约束排序 (reverseWestAndSouthSide)
  NorthSouthPortPreprocessor           ← N/S 端口 dummy

P3 (LayerSweepCrossingMinimizer ×2): BARYCENTER + TWO_SIDED_GREEDY_SWITCH
post-P3:
  InLayerConstraintProcessor → LabelAndNodeSizeProcessor → NodeMarginCalculator
  → HierarchicalPortDummySizeProcessor → BKNodePlacer
  → LayerSizeAndGraphHeightCalculator → OrthogonalEdgeRouter
  → LongEdgeJoiner → EndLabelSorter → ReversedEdgeRestorer
```

## 2. 孤立节点层分配真相 (重要! 纠正早期错误结论)

**早期错误结论**: "elkjs 孤立节点递增放层 (第 0,1,2,... 层)" → 导致 ggn 把孤立节点放到递增层, 顺序与 elkjs 不一致。

**真相 (elkjs 插桩定位)**: 所有孤立节点放 **layer 0** (NetworkSimplex 对单节点分量 layer=0)。
- 层内"垂直堆叠"是 RIGHT 方向单层的**正常垂直排列**, 不是多分层!
- 层内顺序由 **P3 barycenter 的 `randomizeBarycenters`** 决定:
  - `LayerSweepCrossingMinimizer` 在 0 交叉时**也跑 sweep** (QGc: `d = layers空 || 交叉>0`, 不是 `<`);
  - 第一遍 `setFirstLayerOrder` → `randomizeBarycenters` 对**无边节点**赋 `random.nextDouble()` 随机 barycenter → stable sort → 确定性旋转;
  - n 个孤立节点 → 层内顺序旋转 (n-2) 位 (例如 4 个容器 → [第3,第4,第1,第2])。
- 随机流对齐是前提: ggn JavaRandom 与 elkjs GWT 同 seed → 同 nextDouble 序列 → 同顺序。

**关键代码**: `src/p2layers/network-simplex-layerer.ts` 孤立节点全部 `setLayer(layers[0])`。

## 3. EdgeAndLayerConstraintEdgeReverser (inverted ports 关键)

**作用**: P1 最前处理器, 反转违反方向约束的边。elkjs 处理器列表第一个。
**触发条件** (handleInnerNodes):
- FIRST/LAST 层约束节点 → 反转边使满足 OUTGOING_ONLY / INCOMING_ONLY;
- **FIXED_SIDE 且所有端口都"反向"** (EAST 输出 netFlow>0 或 WEST 输入 netFlow<0 之外的情况) → 反转全部边。
  - 例: west_output — N1 只有一个 WEST 输出端口 (netFlow>0) → 反转其边 → 层序 [N2, N1]。
**注意**: `canReverseOutgoingEdge/IncomingEdge` 检查 REVERSED 属性、LABEL 节点类型、FIRST/LAST_SEPARATE 层约束。

**elkjs 与 ELK Java 的符号差异**: elkjs 的 allPortsReversed 条件 = `EAST 且 in>out || WEST 且 out>in`
(即 EAST 输入 / WEST 输出为"正常"); ELK Java 0.12.0 逻辑相反, 且在该图系上崩溃
(BinaryIndexedTree.rank AIOOBE), 无法作为参照 → 以 elkjs 为准。
- ggn 的 `getNetFlow()` = in - out, 条件写 `EAST && netFlow>0 || WEST && netFlow<0` 恰好等价 elkjs。

**坑 (377_layerConstraints)**: 反转 N4 的边会导致边进入 P1 的 FIRST_SEPARATE dummy → ELK 不反转 N4。
- allPortsReversed 检查里, 入边来自 FIRST_SEPARATE dummy 时置 false (不反转);
- canReverseOutgoing/IncomingEdge 检查 FIRST/LAST_SEPARATE。
- **getLayerConstraint 用实例字段** (LNode.layerConstraint), 不是 getProperty(LAYERING_LAYER_CONSTRAINT)!
  用 property 读不到 dummy 的 FIRST_SEPARATE → 反转破坏 dummy → "FIRST_SEPARATE node must not have incoming edges" 崩溃。

**关键代码**: `src/intermediate/edge-and-layer-constraint-edge-reverser.ts`, 接入两处 GreedyCycleBreaker 之前。

## 4. 层级布局 (INCLUDE_CHILDREN) 不拆分量

- elkjs hierarchicalLayout 的 per-graph 处理器列表**不含 ComponentsProcessor** (LayeredPhases 只有 P1-P5) — 插桩确认无 placeComponents 调用。
- 根图多个连通容器 → 全部进根 layer0 → P3 randomizeBarycenters 决定层内顺序 (见 §2)。
- ggn 曾误加层级 split (让 502 等"碰巧"通过但顺序错误), 已回退。

## 5. CompoundGraphPreprocessor: 外部端口 dummy 的创建

- ELK Java v0.12.0: 子图有 EXTERNAL_PORTS 时为容器**所有端口**建 dummy (源码注释 "make sure that every port has a dummy")。
- **elkjs (oracle) 实测不同**: 只为**有跨层级边**的端口建 dummy (processOuter/introduceHierarchicalEdgeSegment 已创建), 无边的 FIXED_* 端口不建。
- 多出的无边端口 dummy 会撑宽层 → 子节点 x 偏移 (例: 502 的 p2 dummy 20 宽 → n2 x 差 20)。
- ggn 已按 elkjs 修正: `if (!PortConstraints.isSideFixed(portConstraints))` 才为无边端口建 dummy。

## 6. 方法论: elkjs 插桩 (最高价值工具)

由于 elkjs 是 GWT 编译产物, 常规反编译困难, 但:
- `elkjs/lib/elk-worker.js` (4.8MB, **非压缩 GWT 输出**) 保留类名/方法名 (如 `$process_73`, `$connectedComponents`), 可读性高;
- `elkjs/lib/elk.bundled.js` (压缩) 通过打 `console.log` 定位:
  - `function NYb(a,b)` = LNode.setLayer → 打印每次层分配;
  - `String(layer)` → `G-layered[L_0[n_root.N2, n_root.N0, n_root.N1]]` 显示层内顺序;
  - BKNodePlacer (KNc) / OrthogonalEdgeRouter 等入口打层结构;
  - qQb (flat runner) / pQb (hierarchical runner) 打印处理器序列 `[proc] ...`。
- 一次性定位"旋转来自 P3 而非 layerer/组件"、以及"层级不拆分量"。

**经验**: 面对难以理解的行为差异, 插桩 (一次定位) >> 推理 (反复矛盾)。推理在"层内堆叠"上浪费了大量时间。

## 7. elkt2test 测试基础设施

- elkt2test 是测试 oracle 的生成器: 图结构/端口约束/边端点**任何一处不对称**都会造成系统性差分失败。
- 已修: 节点 id 作用域限定 (嵌套节点 `父.名`, 避免同名子节点跨容器合并)、端口块内 label 括号平衡、边端点路径解析。
- **教训**: 修改 elkt2test 会改变 elkjs oracle, 必须先备份生成文件再全量回归; 结构修正后失败的图可能变成"真环图" (断言从坐标级差分切换到环图层序)。

## 8. 常用调试命令

```bash
# 全量三批 (examples/tests/tickets, ~5s)
./node_modules/.bin/vitest run tests/elk-official/generated/{examples,tests,tickets}_batch.test.ts

# 失败集合对比 (基线 JSON 在 /tmp)
node scripts/diff-failures.mjs collect <batch> '' --out /tmp/x.json
node scripts/diff-failures.mjs diff <base.json> <cur.json>

# 单图 elkjs 差分 (probe 用 dist; vitest 用 src)
node scripts/probe.mjs diff test-resources/elk-models/...elkt

# elkjs 插桩 (见 §6)
#   重建: python3 改 /tmp/elk-instr2-bundled.js, 然后
node elkjs-xxx.tmp.mjs  # 用 pathToFileURL 导入 /tmp/elk-instr2-bundled.js

# ELK Java 0.12.0 (DebugMain)
node scripts/probe.mjs export <elkt> -o /tmp/x.elk.json
bash scripts/elk-java-debug/run.sh /tmp/x.elk.json /tmp/x-out
```

## 9. OrthogonalEdgeRouter 左边界路由区 + 槽数计算

- ELK 的 OrthogonalEdgeRouter 用 do-while: 第一层 (leftLayer=null) 也调用 `routeEdges(null, L0)`,
  若第一层有 WEST 出边 (inverted-ports 的同层 dummy 边), 占 1 槽 → `xpos += (slots-1)*edgeEdge + edgeNodeSpacing`.
  ggn 的 for 循环从第一层开始 → 漏掉这个左边界路由区 (west_output x 差 10)。
- **topologicalNumbering bug**: maxRank 只靠依赖边更新, 单个无依赖 segment 返回 0 (应为 1)。
  修复: sources 处理时计入 `node.getRoutingSlot()`。普通层间 1 边: 0→1 槽但路由宽都是 nodeNodeSpacing, 无影响。
- 关键代码: `src/p5edges/orthogonal-edge-router.ts` (左边界区), `src/p5edges/orthogonal/orthogonal-routing-generator.ts` (topologicalNumbering)。

## 10. JavaRandom.nextInt 完整语义 (基础)

- **ggn 之前用简化 `next(31) % bound`, 这是错的**。elkjs (GWT) 的 nextInt 是完整 Java 语义:
  - bound 是 2 的幂: `(bound * next(31)) >> 31` (GWT 用浮点 `round(n * next(31) * 2^-31)`);
  - 否则 rejection sampling: `val = next(31) % bound`, 拒绝 `bits - val + (bound-1) < 0`。
- 影响: 环图断环选择 (GreedyCycleBreaker.chooseNodeWithMaxOutflow 的 nextInt)、P3 随机 sweep、
  GreedySwitch 等所有随机决策。feedback_edge 层序差 2 层即此因。
- **JS 位运算溢出陷阱**: `(bound * next(31)) >> 31` 在 JS 中 bound*next31 超过 int32 溢出,
  必须 `Math.floor(bound * next(31) / 0x80000000)`。
- 关键代码: `src/util/java-random.ts`。

## 11. HyperedgeDummyMerger

- 合并相邻且同源/同 target 的 LONG_EDGE dummy (inverted-ports 多条边指向同一端口的 dummy 合并成 1 个)。
- 缺失时: hyperedge+inverted 图左边界路由槽数多 1 → 整体 x 差 10 (同 §9 左边界路由区)。
- 条件: GRAPH_PROPERTIES.HYPEREDGES (端口 in+out > 1, ELK LGraphUtil 语义), P4 前 (BK 前) 跑。
- **死循环坑**: merge 后 `nodeIndex--; continue` 而不更新 lastNode → self-merge。用 for 循环
  (merge 后 nodeIndex-- 抵消 ++, lastNode 保持 mergeTarget)。
- 关键代码: `src/intermediate/hyperedge-dummy-merger.ts`。

## 12. ast-grep 工具 (提高效率)

```bash
# outline Java/TS 文件结构 (类/方法)
ast-grep outline <file.java>
# 检索 Property 定义 (ELK 源码)
ast-grep -p 'new Property<$T>($STR, $VAL)' <file.java>
# 检索某类的方法/字段
ast-grep -p 'public static final $T $NAME = $INIT;' <file.java>
```
用于: ELK Java 源码结构检索 (属性定义/默认值/处理器依赖), 对比 ggn 缺失项; 比 grep 更结构化。

## 13. resizeParentNode 内容框含 margin (端口/label 外扩)

- 层级布局中, 容器尺寸 = 子图内容 + padding, 但内容框**必须含子节点 margin**
  (端口/label 外扩). ggn 之前只用 position+size → 405 家族 (WEST 端口 31 宽伸出)
  子节点被放 padding.left 而非 padding+margin → x 差 31。
- ELK HierarchicalNodeResizingProcessor: 用 LGraph.getActualSize (size + padding),
  而层宽 (LayerSizeAndGraphHeightCalculator) 已含节点 margin。
- 修复: 内容框 minX = pos.x - margin.left, maxX = pos.x + size.x + margin.right (y 同理)。
- 解锁: 405 家族×6, port_label_placement, self-loop compound, 905 label 等 +19。

## 14. ast-grep 找缺失处理器

```bash
grep -oE '^\s+[A-Z_]+,' IntermediateProcessorStrategy.java | tr -d ' ,' | sort -u  # 58 个
ls src/intermediate/ | grep '\.ts$'  # ggn 已移植
```
对比发现 ggn 缺: LABEL_DUMMY_INSERTER/SWITCHER/REMOVER, LABEL_SIDE_SELECTOR,
END_LABEL_PRE/POSTPROCESSOR, HIERARCHICAL_PORT_CONSTRAINT/POSITION/ORTHOGONAL_EDGE_ROUTER,
FINAL_SPLINE_BENDPOINTS_CALCULATOR, HORIZONTAL_COMPACTOR, PARTITION_* 等。

## 15. 外部端口定位 + 父节点 margin (getExternalPortPosition)

- 现象: 040_includeChildrenWithFixedOrder / hierarchy_center_edge_label_problem 等 compound
  图父节点 x 差 5px。elkjs 根图层宽 = 父宽 + 5 (margin.left), 层内对齐把父节点右推 5。
- 根因链 (elkjs 插桩 margin calc 定位): 父节点的外部端口在根 margin 计算时 position = (-5, 27)
  (端口 box 左扩 5px → margin.left=5)。-5 来自 ELK LGraphUtil.getExternalPortPosition:
  WEST: `portPosition.x = -portWidth - portOffset` (portWidth=0, portOffset=PORT_BORDER_OFFSET=5)。
- **PORT_BORDER_OFFSET = SPACING_EDGE_EDGE / 2** (CompoundGraphPreprocessor.createExternalPortProperties),
  不是 ggn 误用的 `graph.getProperty(PORT_BORDER_OFFSET)/2` (→0)。ELK Java 0.12.0 release 正是
  0 (n0 x=92), elkjs (master commit) 是 5 (x=97) → 以 elkjs 为准。
- 端口定位时机: ELK HierarchicalNodeResizingProcessor.graphLayoutToNode 在**子图 post-P3 末尾**
  (子图 post-P3 先于根 post-P3 执行 — ElkLayered.hierarchicalLayout 自底向上 pass), 遍历
  child 的 EXTERNAL_PORT dummy (ORIGIN instanceof LPort), 用 getExternalPortPosition 设父端口
  位置 + EXT_PORT_SIDE, 父 PORT_CONSTRAINTS→FIXED_POS + NON_FREE_PORTS, 再 resizeNode
  (EXTERNAL_PORTS 时 adjustPortPositions=false)。
- 实现: ggn resizeParentNode 内加 getExternalPortPosition (仅 child 有 EXTERNAL_PORTS 时),
  端口比例缩放路径 (无外部端口) 保留。

## 16. 路由槽数: 直线 segment 不占槽

- OrthogonalRoutingGenerator.routeEdges 的 `rankCount+1` **排除直线 segment**
  (startCoordinate==endCoordinate, `Math.abs < TOLERANCE` 跳过)。ggn 原实现直接
  topologicalNumbering 全部计入 → 外部端口 dummy→节点 的平直边 (同 y) 多算 1 槽 → 子图
  每层对多 20px → 子图 size.x 偏大 → getExternalPortPosition EAST 端口 x 偏大 → 父 margin
  错。修复: routeEdgesSlotCount 先 topologicalNumbering 再遍历排除直线 segment。
- 解锁: 167 (insidePortLabels), 且使 040/hierarchy01 的 EAST 端口 x = 内容宽+padding (74)。

## 17. 外部端口 dummy 的 port position = anchor (不是 setAnchor)

- ELK createExternalPortDummy: `dummyPort.getPosition().set(anchor)` + `dummy.setProperty(PORT_ANCHOR, anchor)`。
  ggn 只 `setAnchor(anchor)` → LPort.setSide 在 !explicitlySuppliedPortAnchor 时**重置 port.anchor**
  (按 size 重算, size=0 → 0)。BKAligner 用 `position.y + anchor.y` 算 portPosDiff:
  ggn 0+0=0 vs ELK 2.5+0=2.5 (position 不会被 setSide 重置) → 子图 dummy y 差 2.5
  (ggn 25 vs elkjs 22.5) → 端口 y 差 2.5 → 根节点 y 差 2.5。
- 修复: dummy port position 设为 anchor, anchor 存 dummy 的 PORT_ANCHOR 属性。
- 解锁: 369 (hierachicalEdgeOffsets), 455, 040, 588, hierarchicalEdges, center_label (+5 net)。

## 18. SPACING_PORTS_SURROUNDING (不是硬编码 10)

- LayerSizeAndGraphHeightCalculator 对 EXTERNAL_PORT 层首/尾节点用
  SPACING_PORTS_SURROUNDING.top/bottom (默认 0) 扩展层高; ggn 硬编码 ±10 → 外部端口层
  高 20px 假外扩。补属性默认 {top:0,left:0,bottom:0,right:0}。

## 19. ε (坐标容差) 量化

- elkt2test 坐标差分容差抽为 `TOLERANCE` 常量 (默认 1, ELK_TOLERANCE 可覆盖), 生成测试
  引用 `${TOLERANCE}`。
- 量化工具: `tests/elk-official/eps-scan.test.ts` (EPS_FILES 列出 elkt 文件 → 输出
  /tmp/eps/scan.json 每图 max|dx|,max|dy|)。
- 结论: 当前 52 个失败中**无精度级 (≤2px) 失败** — 最小 5px (hierarchy_center_edge_label_problem,
  040), 44 个 >10px。ε>1 只会掩盖真实结构 bug; 仅在接近 100% 时对残余 sub-px float 精度差有意义。
- 经验: elkjs (测试 oracle) 与 ggn 同为 JS 数值语义, 1:1 对齐目标下容差应保持 1。

## 20. resizeParentNode 边界集合 (inBounds) 规则

- 父尺寸 = 子图内容 + padding, 内容边界含: NORMAL + LONG_EDGE + W-E 外部 dummy (任意, 含无边)
  + 有边 NS dummy。
- W-E dummy 任意: multilabels_compound 的**无边** W-E dummy 在 y=29-37 (层流内位置) → 父高 61
  (只算有边端口 → 54 错)。
- LONG_EDGE: 600 的长边 dummy 在 y=-11 → 内容高 41 (父高 65); 不纳入 → 54 错。
- 无边 NS dummy 不入: 193/148 顶部边界 dummy 不应扩父尺寸 (ELK 用 graph offset 下移内容)。
- 平移集合 = 仅 NORMAL (W-E/NS dummy 保持 pre-padding, getExternalPortPosition 再加 padding)。

## 21. 路由槽: critical 环拆槽 (替代交叉+1 启发式)

- ELK OrthogonalRoutingGenerator: createDependencyIfNecessary 返回 critical 依赖数;
  criticalDependencyCount >= 2 时 breakCriticalCycles (detectCycles criticalOnly=true) →
  HyperEdgeSegmentSplitter 拆 segment 加槽。
- ggn 近似: 槽数 = rankCount+1 + critical 环数。替代原 hasCrossingEdges+1 (partitioning 假阳性
  多算 1 槽 → 层宽 +10; oneCrossing 真 2x2 critical 环需要 +1)。
- 经验: 几何交叉 ≠ 需要额外槽; 只有 critical 依赖 (端口在 criticalConflictThreshold 内) 才拆槽。

## 22. self-loop opposing 路由方向根因 (未修复)

- 552/288/labels: 自环 (EAST↔WEST opposing) 路由方向 ggn 走 NORTH (margin.top=10 → 节点 y 下移),
  elkjs 走 SOUTH (margin.bottom, 不影响 y)。
- RoutingDirector.determineTwoSideOpposingLoopRoutes: option1Penalty <= option2Penalty 选 option1。
  penalty 依赖端口 id 序 (assignPortIds 按 getPorts() 序) 与连通性 (自环已隐藏 → 全 unconnected)。
- ggn/elkjs 端口序在 P3 sortPorts 后不同 (552: elkjs p1/p2/p3 序使 option1=SOUTH 便宜;
  ggn p3 排前使 option2=NORTH 便宜)。修复需对齐 sortPorts 对自环端口序的影响。

## 23. 剩余失败因果拓扑 (41 个, 按地基 → 衍生簇)

所有剩余失败可归到 5 个"地基性"根因, 按拓扑序修 (修地基自动解锁多个衍生):

```
地基 1: P3 排序/RNG 序列 (sortPorts 端口序 + randomizeBarycenters/fillInUnknown 随机消耗)
  ├─ 自环簇: 552/288a/288b/352/416/463/labels/623 (RoutingDirector penalty 依赖端口 id 序)
  ├─ flat01 (分量 RNG 分叉, 第 5 个 nextLong 差 1)
  └─ 623 (fillInUnknownBarycenters 的 rv 随机 → i1/i2 顺序)
地基 2: 路由槽 segment 依赖 (OrthogonalRoutingGenerator topologicalNumbering)
  ├─ 726 (L1→L2 槽 2 vs elkjs 1, segment 依赖/顺序)
  └─ northSouthPorts_down_down_01 等
地基 3: BK 垂直对齐 (BKAligner/Compactor 层垂直位置)
  ├─ 377 (N4 未居中), 726 的 dy, inside_compound_nodes_03, 401
  └─ compound 簇 (hierarchy01/02/05/09, compound01-07)
地基 4: N-S 外部 dummy 宽度/分层 (HierarchicalPortDummySizeProcessor + 502 之谜)
  ├─ 502 (edgeless SOUTH dummy 宽 20 撑父, elkjs 子图 L0 宽 0 机制未解)
  └─ N-S 簇: north_south_fixed_side×2 (420px), all_four_port_sides, hierarchy N-S
地基 5: P1 断环 (GreedyCycleBreaker 选择)
  └─ 环图: reverseEdge, modelOrderCycleBreaking, hierarchicalLayoutMixing, three_edges_inverted_ports_2
其他独立: portConstraints/variants (64, 端口 label/约束), transform_direction (263),
  external_ports (42, inverted), 194 (分量间距), 213 (分量压缩), 701 (自环+label), 623
```

**修复优先级 (拓扑序)**: 地基 1 (P3 排序/RNG) 解锁最多 (8+ 测试), 但需要 elkjs GWT Random
插桩对比 (本会话多次尝试未果, RNG 消耗序列是硬骨头). 地基 2 (路由槽) 部分已修
(critical 环拆槽), 剩余 segment 依赖差异. 地基 3 (BK) 是确定性算法, 可对比 master 源码.

**经验**: 
- 623 的 i1/i2 顺序 = fillInUnknownBarycenters 随机 (rv*maxBary-1), 不是 BK 问题.
- 726 的 dx=10 是 L1→L2 槽数 (ggn 2 vs elkjs 1), 与 BK 无关; dy 是 BK 垂直对齐.
- 自环 552: 端口序在 P3 sortPorts 后 [P3,P1,P2], penalty opt1=1>opt2=0 恒选 NORTH;
  elkjs 走 SOUTH → elkjs 端口序必为 [P3,P2,P1] (opt1=0), 差异来源未确证 (可能 RNG 或
  GreedySwitch 消耗). 强制方向 (all-E/W 或 FREE-only) 均导致他簇回归 → 不可行.

## 24. RNG 消耗序列: 每图独立 Random (根因修复, 655→666/696)

**核心结论 (2026-08-07 深夜3)**:
- **ggn 的 JavaRandom 与 elkjs 的 GWT Rvb 逐值一致** (黑盒对比 16 步全 OK) —
  RNG 算法本身无差异, 不需要"黑盒搬 gwtjs rng".
- **真正根因 = 每图应独立 new Random(randomSeed)**, ggn 之前让子图共享根 Random
  (序列延续), elkjs/ELK 是每图各自 Random(seed). 修复后 BARYCENTER 整条 RNG 消耗
  序列与 elkjs 完全一致 (623: oGc=0,1 + PGc + Pvb 全对齐), 623/701/213/416/compound01/
  07/modelOrderCycleBreaking/reverseEdge/hierarchicalLayoutMixing 等 +10.
- **层级图 greedy switch 默认 OFF**: ELK `CROSSING_MINIMIZATION_GREEDY_SWITCH_HIERARCHICAL_TYPE`
  默认 OFF (0.12.0 LayeredMetaDataProvider javap 实证), 非层级图默认 TWO_SIDED +
  activationThreshold=40 (threshold==0 || threshold>nodeCount 才激活). ggn 之前层级图也跑
  第二遍 GREEDY → 288_selfLoopsCauseNPE_b 修复 (+1).

**验证方法 (黑盒 RNG 对比)**:
1. elkjs bundle 插桩: 把 `function Rvb(` 改名 `Rvb_orig`, 注入 wrapper `function Rvb(a,b){
   var __r=Rvb_orig(a,b); if($wnd.__ELK_RND_TRACE){...push(caller#bits=val)}; return __r}`,
   并在 wrapper 内惰性暴露 `$wnd.__RVB={Rvb,Lvb,Mvb}` (bundle 模块函数懒执行, 定义期注入无效).
2. ggn 侧: `GGN_RND_DBG=1` (java-random.ts 已内置, 打印 next(bits)+调用栈).
3. 逐方法对比: nextLong(2×next32)/nextBoolean/nextDouble(26+27)/nextFloat(24) 逐位对齐.
4. **Lvb/Mvb 是 GWT 类型化数组** (不是 plain array): Lvb[b]=2^(b-24) (b≤24),
   Mvb[b]=2^(b-48) (b≥25); 自己复刻常量时别猜.

**RNG 分叉定位链 (623)**:
- elkjs trace: Svb(nextLong) → oGc#3=0 → oGc#4=1 → PGc#5=0 → Pvb(6742643,55040115) → ...
- ggn trace (修复前): #3=0 → #4=0 (同 seed-1 纯 LCG 应为 0,0,0 → 说明第二个 oGc 用的是
  不同的 Random 实例或中间多消耗).
- 插桩 GIH 构造 (ZFc) 确认构造顺序 root→child 相同 → 唯一解释: child 用自己的 fresh
  Random(seed=1), 其首次 nextBoolean=1 (bit47 of 0xBB1AD5732407).
- ELK 源码: GraphConfigurator.prepareGraphForLayout 每图 `new Random(RANDOM_SEED)`
  (pQb 对 collectAllGraphsBottomUp 每图调用 GQb); LSCM.initialize 只在 RANDOM==null 时才共享.
- 非层级多分量: ComponentsProcessor.split copyProperties 引用共享 RANDOM (flat01 仍差
  1 个分量 y=120, 属分量排列/BK, 非 RNG).

**教训**:
- 先黑盒验证 RNG 值 (插桩 elkjs 真实 Rvb) 再怀疑实现 — 值一致时问题在消耗序列.
- 消耗序列分叉的可能来源: ①每图独立 vs 共享实例 ②处理器激活条件 (greedy hierarchical OFF)
  ③GIH 构造/最小化顺序 ④中间步骤额外消耗 (fillInUnknown/randomizeBarycenters).
- elkjs bundle 是"测试 oracle", 插桩它 > 反编译 Java > 推理 (本会话 RNG 谜题靠插桩
  15 步 trace 一次定位).

## 25.6 NS 端口顺序: elkjs GWT 行为实证 (right_down_02, 2026-08-07 深夜12)

> **⚠ SSOT 变更 (2026-08-07 下午14, 用户定案)**: 此前"有争议以 elkjs 为准"已改为
> **"按照 Java 0.12.0 验收"** — elk-java-unit 单测为验收, elkjs 差分暂停。
> 本节 SOUTH 镜像 hack (southAllOutput 反转) 已按 Java 语义移除 (§25.7): SOUTH 端口恒定
> 右→左 (portContexts SOUTH/WEST 降序), 不再区分输入/输出。elkjs 差分的 SOUTH 相关
> 旧对齐不再作为验收依据。

**ssot 定案 (当时)**: oracle = **elkjs 0.12.0** (npm/git 最新发布; 测试期望坐标 = elkjs 运行时,
图数据 = ELK 官方测试集 elkt)。elkjs git master 0.13.0 未发布, 不采用。ELK Java 仅作参考,
有争议时以 elkjs 为准。

**elkjs vs ELK Java 的 NS 端口差异 (right_down_02 实证)**:
- elkjs (GWT): NS 预处理时节点端口列表 = [N1,N2,S2,S1] (SOUTH 被交换); NS 对
  getPorts(SOUTH)=[S2,S1] 做 addFirst → dummies [S1,S2] (声明序)
- ELK Java 0.12.0 (elk-java-debug): 端口列表 [N1,N2,S1,S2] (未交换)
- 最终坐标一致 (NN4 在 NN5 上方), 中间 dummy 顺序不同

**ggn 修复组合 (4 处, 669/696)**:
1. `java-random.ts` nextLong GWT 语义 (§25.5)
2. `label-and-node-size-processor.ts`: SOUTH 端口 x 镜像 — `placeHorizontalFreePorts`
   SOUTH 侧逆序迭代 (ELK NodeContext.comparePortContexts: NORTH/EAST 升序, SOUTH/WEST 降序)
3. `north-south-port-preprocessor.ts`: NS 规则 D — SOUTH 端口 ≤2 个**不逆序**, ≥3 逆序
   (对应 elkjs vac 的 `c <= b + 2` 早退)
4. `port-list-sorter.ts`: 保留 ELK reversePorts `<=2` early return

**教训**:
- 反编译 GWT bundle 的函数语义 (tac/vac 的 off-by-one/early return) 与实际行为矛盾 —
  必须以插桩实测为准 (elkjs PLS before/after dump 证明 PLS 不交换, 交换在 GWT 内部)
- 端口顺序改动影响面大: findPortSideRange "完整区间反转" 曾 +49 回归;
  "FIXED_SIDE 一律不逆序" 曾 +10/+2 回归; 正确规则是 ≤2 早退 (与 ELK 一致)
- 网格式规则搜索 (全逆序 / 约束分支 / 数量分支) + 全量 diff 验证, 是最快收敛方法

## 25.5 elkjs GWT RNG nextLong→setSeed 符号怪癖 (flat01 根因, 2026-08-07 深夜11)

**核心结论**:
- **elkjs 0.12.0 (GWT 编译) 的 `Random.nextLong`→`setSeed` 与 ELK Java 不同**.
  GWT LongLib 把 long 存为 (hi, lo) **有符号 32 位**; `setSeed` 提取高 24 位用的是
  **算术右移** `(long >> 24) & 0xFFFFFF`, 不是 Java 的低 48 位截断.
- 当 nextLong 的两个 32 位分量有符号为负 (即无符号值 >= 2^31) 时, 算术右移与
  Java `((long)r1 << 32) + r2` 的低 48 位不一致 → **setSeed 存的 48 位种子不同** →
  后续 nextBoolean/nextDouble/nextFloat 全偏.
- flat01: 第 3 个分量的 r2 = 2248407164 (>= 2^31) 触发 → elkjs isForwardSweep=1
  (backward), ggn (纯 Java)=0 (forward) → L1 排序 [N5_2,N5_3] vs [N5_3,N5_2] →
  NS dummy 位置 → BK 垂直 → 行2 位置 (152 vs 272).

**精确语义 (已用 BigInt 模拟验证, 逐位复现 elkjs 65 步随机流)**:
```
r1s = r1 >= 0x80000000 ? r1 - 0x100000000 : r1   // 有符号 32 位
r2s = r2 >= 0x80000000 ? r2 - 0x100000000 : r2
value = (BigInt(r1s) << 32n) + BigInt(r2s)        // 有符号 64 位
hi24  = Number((value >> 24n) & 0xFFFFFFn)        // 算术右移! (BigInt >> 即算术)
lo24  = Number(value & 0xFFFFFFn)
seed48 = hi24 * 0x1000000 + lo24                  // 传给 setSeed
```
ggn `JavaRandom.nextLong` 已按此实现; `setSeed` 不变 (`seed48 ^ MULTIPLIER & MASK`).

**注意**:
- next(32) 在 ggn 返回无符号 [0,2^32), elkjs Rvb 返回有符号 — 只影响 nextLong 组合,
  不影响 next(1)/next(24)/next(26)/next(27) (这些恒 < 2^31).
- GWT long 超 ±2^44 用对象表示, 但 LongLib 运算精确 (hi/lo 拆分), **没有** JS Number
  精度丢失问题; 差异纯粹来自算术右移的符号处理.
- "RNG 值一致" 要区分 32 位 draw 值与 48 位种子: draw 值相同 ≠ setSeed 后状态相同.

## 25. BK 内部阶段对比 (管线式) + 552 端口侧分配 (2026-08-07 深夜4)

**方法 (用户指示: BK 拆阶段像渲染管线对比 I/O)**:
- elkjs BKNodePlacer.process = `KNc`; 阶段函数: `JNc`(markConflicts) / `uNc`(verticalAlignment)
  / `tNc`(insideBlockShift) / `xNc`(horizontalCompaction) / `HNc`(createBalancedLayout)
  / `GNc`(checkOrderConstraint). BKAlignedLayout (bNc) 字段: g=root, a=align, d=innerShift,
  b=blockSize, j=sink, i=shift, p=y, n=su, f=od, o=vdir, c=hdir.
- 插桩 elkjs 每阶段 dump root/align/innerShift/blockSize/sink/shift/y (__bkDump), ggn 侧
  GGN_BK_DBG + afterModule 钩子逐阶段打印 margin/端口侧/数组.
- **552 结论: BK 内部 ggn == elkjs 完全一致** (child 4 节点, root 1 节点, y/innerShift 全同).
  分叉在 BK 之前: 端口侧分配 (P1/P3 侧反) → 自环路由方向 (N vs S) → 容器 margin.

**552 端口侧分配 (新发现, 比路由方向更上游)**:
- elkjs: P1=WEST, P2=WEST, P3=EAST (自环源 P3→EAST, 目标 P2→WEST, 子边 P1→WEST).
- ggn:   P1=EAST, P2=WEST, P3=WEST (P1/P3 侧反).
- 自环 E1 在 SelfLoopPreprocessor 被隐藏 (source/target=null) → P3/P2 无边, PortSideProcessor
  无法按边方向赋侧; ggn SelfLoopPortRestorer.assignMissingSides 只补 UNDEFINED, P3 已 WEST
  不被纠正. 需查 elkjs 如何给隐藏自环端口定侧 (可能 DummySelfLoopProcessor 或 holder 语义).

**elkjs 处理器顺序实证 (552)**: child BK → root SLRestorer → root SLRouter → root BK.
ggn 原顺序一致 (SL 在父图 BK 前, 子图 BK 后). 曾把 SL 移到 BK 后 → 回归 4 测试
(inside_outside/403/273/167) → 回退. **教训: 改顺序前先插桩确认 elkjs 顺序.**

**elkjs 自环方向 ≠ ELK master**: ELK master computeEdgeRoutingDirection (EAST/WEST opposing,
occupied 无 SOUTH → COUNTER_CLOCKWISE→NORTH) 与 ggn 相同, 但 elkjs 实际走 SOUTH.
elkjs 基于不同 commit, 自环方向逻辑需插桩 occupiedPortSides/方向判定.

## 25.7 端口排序语义: NodeContext.comparePortContexts (SOUTH/WEST 降序) + SortByInputModel 顺序 (2026-08-07 下午14)

**根因 (ConcreteSortByInputModel 12 个 SSOT 分歧清零, 393/395)**:
- ELK Java 的端口方向由 `NodeContext.portContexts` (TreeMultimap + comparePortContexts) 决定:
  - NORTH/EAST: volatileId **升序** (左→右 / 上→下)
  - SOUTH/WEST: volatileId **降序** (右→左 / 下→上)
  - volatileId = node.getPorts() 列表索引 (PortContextCreator 赋值)。
- 放置函数 (PortPlacementCalculator) 本身不反转, 是按 portContexts 顺序左→右/上→下摆放;
  方向反转全部发生在 portContexts 排序里。ggn 之前把反转散在放置函数里 (westBottomUp /
  southAllOutput hack), 语义对但 SOUTH 输入口组合错 (应恒定反转, 而非"全输出才反转")。

**SortByInputModelProcessor 必须跑在 NorthSouthPortPreprocessor 之前**:
- jar 实证处理器顺序: PortListSorter → **SortByInputModel** → NorthSouthPortPreprocessor → P3。
- ggn 之前 NS 先跑 → comparator 的 p1SourcePort 变成 NS dummy 端口 → 同节点遍历分支失效 →
  incoming=WEST 列表反转 ([p4,p3] vs jar [p3,p4])。
- 修后 [NORTH,WEST] 列表 = [p3,p4] ✓。改动对 696 主验收 0 影响 (逐名 diff 实证)。

**验证方法 (jar 实证 incoming=WEST 列表)**:
- ggn: GGN_VP_DBG=1 + placeVerticalPortsEqually 打印 `ports=[p5(mo1),p4(mo0)]`。
- jar: scripts/elk-java-debug/run.sh <elkt.json> <out> → 读
  `<n>-Before_LabelAndNodeSizeProcessor_*.json` 的节点 ports 顺序 (ElkNode JSON 快照)。
- elk.json 属性键必须用 core 键 `org.eclipse.elk.portConstraints` (不是
  `org.eclipse.elk.layered.portConstraints`), 否则 FIXED_SIDE 不生效 → NON_FREE_PORTS 缺失 →
  NS preprocessor 不进管线, 快照与真实配置不符。

**教训**: ELK 官方 ConcreteSortByInputModelTest 的 single 断言随 outgoing 侧变化
(SOUTH/WEST outgoing 与 EAST/NORTH 相反), 不能按 incoming 侧简化; multiple 才只按 incoming 侧。

## 25.8 Issue680 复合 SEPARATE 真 oracle + 移植路线 (2026-08-07 下午15)

**验证方法 (官方测试实跑)**: 把 ELK 官方 Issue680Test.java 抽出 + 精简 PlainJavaInitialization
(仅 registerLayoutMetaDataProviders), 用 elk-java-debug 的 0.12.0 jar + junit-4.13.2 +
hamcrest-library-1.3 编译运行: `JUnitCore org.eclipse.elk.alg.layered.issues.Issue680Test` → OK.
elk.json harness 对 compound 不可靠 (缺 ALGORITHM 时子图不按 layered 布局; 方向可能被当 RIGHT),
**以 JUnit 实跑为 oracle**.

**官方行为 (INHERIT→SEPARATE)**:
- parent.y=157 (root 帧: 父 NORTH 端口 p1 上凸 145 = 165-20 → padding12+145), child.y=57 (父帧).
- 子图 LGraph (importGraph(parent)): 2 个 EXTERNAL_PORT dummy + child.
  ext-in (15x20, 端口朝下) / ext-out (15x22, 端口朝上); 尺寸 = 容器端口宽 + -borderOffset.
- child.y=57 = padding(12) + ext-in(20) + child 上 margin(25=33-8). 端口侧: childP1 N / childP2 S.

**ggn 缺口 (SEPARATE)**: CompoundGraphPreprocessor 直接移除跨层级边 → 子图无 dummy →
child.y=12, 且容器端口侧丢失 (p2 应 SOUTH 却 NORTH, childP1/childP2 应 N/S 却 W/E).

**移植路线 (已验证 85%)**:
1. `propagateNestedDirections`: 子图继承父节点方向 (仅 SEPARATE; INCLUDE 传播会回归 parent.y
   157→62.87, 因为 INCLUDE 扁平化只用根方向). ELK ElkGraphImporter.createLGraph 用
   parentGraphDirection, 两种模式都继承 — 但 ggn INCLUDE 需另修才能承受.
2. CompoundGraphPreprocessor SEPARATE: 在子图内建 dummy (复用 createExternalPortDummy,
   尺寸取容器端口 width + -borderOffset), 连 dummy→子端口; 根图不建 (父真实端口按 netFlow 定侧:
   getNetFlow()=in-out, >0→sideFromDirection, 否则对侧; 定侧必须在移除原边之前).
3. **缺 HierarchicalPortConstraintProcessor N/S 处理** (jar slot06): NetworkSimplexLayerer 先给
   N/S dummy 独立层, 该处理器把 N/S dummy 移进连接节点的层 (TOP/BOTTOM), 在相邻层新建 W/E 替身
   dummy (EXT_PORT_REPLACED_DUMMY 指向原 dummy), 移除原 dummy, 记 EXT_PORT_REPLACED_DUMMIES.
   下游 HierarchicalPortDummySizeProcessor / HierarchicalPortPositionProcessor 依赖替身.
   没有它 → 子图 child 留在独立层, child.y 仍 12.
4. 还原说明: 1+2 做完后 Issue680 child.y 仍 12 (差 3), 且 INCLUDE 有回归风险 → 已整体还原,
   等 3 完整移植再一起提交 (0 回归实证: 696 失败集合逐名不变).

## 25.9 FIXED_POS/FIXED_RATIO 显式侧边框 + LPort.explicitSide (2026-08-07 下午18)

**ELK 意图 (源码注释 + jar 实证)**:
- PortPlacementCalculator.placeVerticalFixedPosPorts / placeHorizontalFixedPosPorts 对 FIXED_POS
  端口: E/W x 恒 calculateVerticalPortXCoordinate (-portW-offset / nodeWidth+offset), N/S y 恒
  calculateHorizontalPortYCoordinate (-portH-offset / offset 或 -portH/0). 与约束类型无关.
- 但 jar 实测 340 (FIXED_POS + 位置推断侧) **保留输入位置** — 官方 LabelAndNodeSizeProcessorOffsetTest
  (显式侧) 移到边框. 差异根源: 端口侧"显式 (用户/输入)" vs "推断 (calcPortSide/flow)".
- ensureDefinedPortSide (ElkGraphImporter): side-fixed 端口 UNDEFINED 从位置推断 (calcPortSide),
  推断失败回退方向侧; FREE 按 netFlow. PortSideProcessor: side-fixed 只补 UNDEFINED.

**ggn 实现**:
1. `LPort.explicitSide` (setSide 置位; 新增 setSideInferred 不置位, 与 setSide 共享 applySideAndAnchor
   更新 anchor — 否则方向变换后 anchor 不更新 +21 回归).
2. 推断定侧改 setSideInferred: PortSideProcessor.setPortSide、GraphTransformer 方向变换 (3 处)、
   initializePort 的 FIXED_POS/RATIO calcPortSide (否则 340 等推断侧被当显式 +3 回归).
3. LabelAndNodeSizeProcessor FIXED_POS/RATIO 分支: 仅对 isExplicitSide() 端口设边框.

**教训**: 端口"显式 vs 推断"是 ELK 的隐藏语义, ggn 直接构建 LGraph 没有输入图标记, 需在端口侧
被推断/变换的地方统一 setSideInferred, 否则显式标记污染推断端口. 改动后 696 失败集合逐名不变 (0 回归).

## 25.10 Issue871 inverted 端口: FEEDBACK_EDGES + REV 边反向定侧 (2026-08-07 下午19)

**jar 机制 (实证)**: 管线顺序 EdgeAndLayerConstraintEdgeReverser → **PortSideProcessor** →
ModelOrderCycleBreaker. 断环前定侧 → 反转边 (n4→n3) 保留原侧 (n4=EAST 输出 / n3=WEST 输入) →
反转后变 EAST 输入 / WEST 输出 inverted-port → InvertedPortProcessor (FEEDBACK_EDGES || NON_FREE_PORTS)
建 LONG_EDGE dummy → feedbackBelow 的 n4 与 n2 对齐. nofb 同样 inverted 但无 dummy, 布局仍正常.

**ggn 实现**: PortSideProcessor.setPortSide(port, revAware) — revAware 时 REV 边反向计 netFlow
(入边 REV 计 -1, 出边 REV 计 +1, 等价断环前定侧). 仅 FEEDBACK_EDGES=true 启用:
- feedbackBelow (true): inverted → IPP 正常触发 (WEST 输出/EAST 输入) → dummy → n4.y==n2.y ✓
- nofb (false): 保持非 inverted (ggn 现状匹配 jar 的最终坐标) ✓
- 全局启用的前提: ggn 需修 inverted 边 (无 dummy) 的 BK/路由处理 (nofb 全局 inverted 时乱).

**教训**: ① 断环前定侧的"语义"可用 setPortSide 对 REV 边反向计等价实现, 不必移动处理器时序;
② inverted 端口必须让 InvertedPortProcessor 正常触发 (WEST 输出/EAST 输入端口), 不要绕过侧判断
直接对 REVERSED 边插 dummy (+23 回归); ③ FEEDBACK_EDGES 选项 (org.eclipse.elk.layered.feedbackEdges)
驱动 IPP 启用 (OrthogonalEdgeRouter 条件 NON_FREE_PORTS || FEEDBACK_EDGES), 之前 ggn 缺此选项.

## 25.11 Issue680 SEPARATE 子图 ext dummy + resizeParentNode 不平移 (2026-08-07 下午20)

**SEPARATE 子图完整实现 (Issue680 关闭, elk-java-unit 400/400)**:
1. `propagateNestedDirections`: 子图继承父方向 (仅 SEPARATE; INCLUDE 扁平化只用根方向, 传播会回归).
2. `CompoundGraphPreprocessor` SEPARATE: 子图内建 ExternalPort dummy (尺寸=容器端口宽 + -borderOffset,
   连 dummy→子端口), 根图不建; 容器端口按 `getNetFlow()=in-out, >0→流向侧` 定侧 (setSideInferred),
   必须在移除原边之前.
3. **resizeParentNode 不平移 NORMAL (SEPARATE)**: 子图布局 (applyOffsetPadding) 已把 padding 计入坐标
   (child=(12,57) 与 jar 一致); 再按 pad.left-minX 平移会双加 (dx=25, dy=-45 → (37,12)).
   jar HierarchicalNodeResizingProcessor 不平移; 平移仅 INCLUDE (pre-padding 内容框) 需要.

**对比方法 (管线式)**: hooks afterModule/afterPhase 逐阶段 dump ggn 子图层/坐标, jar 用
runLayoutTestUntil(处理器) dump — 发现 ggn 子图 GraphTransformer(out) 后 child=(0,45) 与 jar 完全一致,
差异仅在 resizeParentNode 的 NORMAL 平移 (把 (0,45)+padding(12,12) 的 (12,57) 移成 (37,12)).

**遗留 (不阻塞)**: parentSize ggn (115.27x99.5) vs jar (64.27x192.5) — ggn resizeParentNode 边界含
margin (W-E 端口外扩) 且 SEPARATE 只 NORMAL 不含 ext dummy 高; jar 宽=child box+padding (不含 margin),
高含 ext dummy. Issue680 测试不断言 parentSize. 改边界集合需防 696 compound 回归, 留待 compound 专项.

**教训**: ① 子图坐标是否含 padding 是 ELK compound 的核心约定 (ggn applyOffsetPadding 含, jar 也含),
   resizeParentNode 不能再对齐; ② "child 位置差" 用管线式对比快速定位到具体模块 (resizeParentNode),
   比逐处理器猜高效; ③ SEPARATE 子图 dummy 是 Issue680 与 696 compound 基线的共同地基.

## 25.12 自环端口侧: assignMissingSides 必须用 SL 边区分 source/target (2026-08-07 下午23)

**根因 (spacing labels 修复, 696 678/696)**: SelfLoopPortRestorer.assignMissingSides 用
`lPort.getOutgoingEdges()` 判断 source/target, 但自环边被 SelfLoopPreprocessor 隐藏后
lPort 的 out/in 均为 0 → 全落 else 分支赋 EAST → 3 条节点级自环 source/target 全 EAST
(computeEdgeRoutingDirection: 同侧按 id → CLOCKWISE/COUNTER 右侧小环) → 不绕节点 → 图窄.

**修复**: 用 `SelfLoopPort.getIncomingSLEdges()/getOutgoingSLEdges()` (隐藏后仍保留)
区分: slOut>0→输出侧 (RIGHT→EAST), slIn>0→输入侧 (WEST). 与 ELK import 的 createPort
语义一致 (OUTPUT=方向侧, INPUT=对侧).

**对比方法**: elkjs 直接跑 (vitest 环境) 拿自环 bendPoints/图尺寸作 oracle — elkjs 自环
source 右侧出发绕到 target 左侧 (bends 128→12 经上下), ggn 修复前全右侧 (136/146/156).

**教训**: 隐藏端口/边后信息丢失, 用保留 role 的包装对象 (SelfLoopPort) 而非 lPort 边.

## 25.13 vis.mjs 视觉对比陷阱: 节点矩形 z-order 盖住边/箭头 (2026-08-08)

**现象**: inside_outside 对比里 "ggn 外环(走下方)有箭头, jar 没有箭头" — 误以为布局差异.

**根因 (纯渲染假象, 非布局差异)**:
1. `scripts/vis.mjs` 的 `toSvg()` 原先把 **边+箭头先画、节点矩形后画** (矩形不透明填充) →
   落在节点矩形内的边/箭头被盖住.
2. EdgeMain 会把 **根图本身输出成一个 NODE** (`NODE root x=0 y=0 w=144 h=102`, depth 0),
   旧代码把它当成真实节点画成一个大矩形 → jar 的外环/内环/箭头全在 root 矩形内 → 全部不可见.
   ggn 的箭头正好在复合节点矩形外侧 → 幸存 → 造成 "ggn 有箭头 jar 没有" 的假象.

**修复 (scripts/vis.mjs)**:
- `toSvg`: 节点矩形先画(垫底), 边+箭头后画(在上层), 文本最后 — 边/箭头永不被节点填充盖住.
- `runJar`: 跳过 depth 0 的根图节点 (`if (depth === 0) continue`) — 它只是图边界, 不是真实节点.

**注意**: overlay 图本就不画箭头 (只画 polyline), 判断箭头是否存在要看单图 SVG, 且要检查
z-order; 单图现在边在上层, 不会再出现 "有箭头/没箭头" 的视觉误判.

**配套**: 以后新增视觉对比时, 用脚本校验箭头/弯点是否被节点矩形覆盖, 而不是只看 PNG 截图.

## 25.14 portConstraints 修复: FIXED_SIDE 推断侧端口 PORT_BORDER_OFFSET + 坐标拆回 offset 语义 (2026-08-08)

**现象**: examples__ports__portConstraints 坐标级差分失败 — fixedPosition 化合物内 n1/n2 y 差
12/2, 全部化合物 y 差 12, fixedSide/fixedPosition 子节点 x 差 10. triage 唯一真 bug.

**根因 (两层)**:
1. **端口 y 差 (n1 y+12, n2 y+2)**: fixedPosition.n2 是 FIXED_SIDE, 端口 (10,-10)/(15,40) 无显式侧
   → 位置推断 NORTH/SOUTH. ELK `LGraphUtil.initializePort` (0.12.0 字节码确认) 对 side-fixed +
   位置非 (0,0) 的端口推导 `PORT_BORDER_OFFSET = calcPortOffset` (NORTH: -(y+h), SOUTH: y-nodeH) →
   offset 2/10. 随后 `LabelAndNodeSizeProcessor` 的 `calculateHorizontalPortYCoordinate` 用 offset
   还原: NORTH -8-2=-10, SOUTH 10+nodeH=40 → **保留输入 y**. ggn 的 initializePort 缺 offset 推导 →
   重算成 -8/30 → BK 垂直对齐 (n2 innerShift +2, 南 dummy +12, n1 同 block +12) 全偏.
   (对照: fixedSide.n2 显式侧端口 (0,0) → 不推导 offset → 重算 -8, ggn 本来就对.)
2. **x 差 10**: 坐标拆回用 bounds 逻辑 `shiftMinX = min(node.x - margin.left)` (portConstraints
   n7 marginL=5 → minX=10 → dx = pad.left-10 = 2); ELK `ElkGraphLayoutTransferrer` 是
   `node + graph.offset + parent.padding` (offset.x=0 → dx=12). y 恰好对 (LONG_EDGE dummy y=0 =
   offset.y), x 错 10.

**修复 (src/graph/lgraph-util.ts + src/layered-layout-provider.ts)**:
- `initializePort`: 推断侧分支补 `PORT_BORDER_OFFSET = calcPortOffset(port, side)` (位置非 (0,0)
  且未显式设置时).
- 新增 `calcPortOffset` (对应 ELK LGraphUtil.calcPortOffset).
- 坐标拆回: `shiftMinX/Y = -child.getOffset()` 无条件 (ELK offset+padding 语义), 弃 bounds minX.

**验证**: 696 6→5 (bug 0/tooling 5), portConstraints 9 节点坐标 0 差; E2E 88.5→88.9 (857/964);
全量 1974 全绿.

**教训**: 端口位置「保留输入」不是玄学 — 是 PORT_BORDER_OFFSET 从输入位置推导后由
calculateHorizontalPortYCoordinate 还原; 推断侧 vs 显式侧端口行为不同 (ELK 用位置推断时推导 offset).
坐标拆回必须用 graph.offset + padding (transfer 语义), 不能自己算 bounds (margin 会污染 minX).

## 25.15 compound05 候选 bug: 根 P3 扫入子图时 BARYCENTER 数值差异 (2026-08-08)

**现象**: tests__layered__connected_components__compound05 坐标差分失败 — Compound 子图内
N1 链/N2 链上下颠倒 (N1_1 y 差 70). 已升级 triage bug 候选.

**定位**: 子图 pre-P3 每层初始顺序 [N1_x, N2_x] (NetworkSimplexLayerer 后), 根 P3
(LayerSweepCrossingMinimizer 扫入子图) 后变 [N2_x, N1_x]; ELK 保持 [N1_x, N2_x].
ggn 第一轮 L1: N2_1(1.5074) < N1_1(1.5327) (差 0.025 反序); ELK: N1_1(0.51) < N2_1(2.02)
(差 1.5). 非随机扰动 (±0.035) 能解释 — 基础 barycenter 值不同.

**未定根因**: L2 第一轮排序也异 (ggn [dummy2(1.63), N1_2(1.98), N2_2(1.99)] vs ELK
[N1_2(1.49), dummy2(1.95), N2_2(2.48)]) — 端口 rank / portDistributor 细节差异候选
(NodeRelative vs LayerTotal 随机选择, 或外部端口 dummy 的 rank). 需对比根 P3 时
portRanks 数组 (ELK instrument BarycenterHeuristic 已就绪, /tmp/elk-bary).

**验证工具**: ELK instrument (BarycenterHeuristic 打印 ELK_BARY) + ggn GGN_P3_DBG.
compound03/04 已通过 → 该差异非系统性, 与 compound05 的外部端口组合 (6 端口含 N/S×2) 相关.

## 25.16 compound05 深入: 根 P3 递归 sweep 的 BARYCENTER rank 差异 (2026-08-08 续)

**再定位**: compound05 走 doHierarchicalLayout (INCLUDE_CHILDREN), 根 P3 的
LayerSweepCrossingMinimizer 只 sweep root (1 层含 Compound), 子图经
`sweepInHierarchicalNode` 递归扫入. 子图 currentNodeOrder (initialize 复制):
L1=[N1_1,N2_1], L2=[N1_2,N2_2,CNdummy], L3=[N1_3,N2_3,2,3].

**第一轮 L2 排序 (fwd=false) 关键差异**:
- ggn N1_2 bc=1.9838 = (N1_3 rank 2.5 + CN dummy rank 1.5)/2 — CN dummy 与 N1_2 **同层 (L2)**,
  视为 in-layer edge, 递归合并 CN dummy 的 barycenter (其 rank 依赖 L1 的 N2_1 残留 rank).
- ELK N1_2 bc=1.4941 = (N1_3 rank 2.5 + N1_1 rank 0.4883)/2 — CN dummy 不在 N1_2 同层,
  N1_1 rank 已填 0.5 (L1 位置 0).

**结果**: ggn 第一轮 L2=[CNdummy,N1_2,N2_2] (dummy 最小) → 级联 L1 翻转 [N2_1,N1_1]
(N2_1 bc=1.5074 < N1_1=1.5327) → N1/N2 链上下颠倒 (N1_1 y 差 70). ELK 保持 [N1_1,N2_1].

**待查**: CN (NORTH 外部端口) dummy 的**层分配** — ggn 把 CN1/CN2 dummy 放 L2 (与 N1_2/N2_2 同层,
in-layer), ELK 放其他层 (跨层). 涉及 CompoundGraphPreprocessor 外部端口 dummy 创建 +
NorthSouthPortPreprocessor/层分配交互. 下一步: 对比 ggn/ELK 子图各层 EXTERNAL_PORT dummy 的层归属.

**工具就绪**: ggn GGN_PD/GGN_RANK_DBG/GGN_BD_DBG/GGN_INIT_ORDER/GGN_SWEEP_WHO;
ELK /tmp/elk-pd (ELK_RANK), /tmp/elk-bary (ELK_BARY/ELK_BD), /tmp/elk-create-pd (ELK_PD).

## 25.17 compound05 修复: NetworkSimplexLayerer 连通分量「大分量先」(2026-08-08)

**现象**: compound05 坐标差分失败 — Compound 子图 N1 链/N2 链上下颠倒 (N1_1 y 差 70).

**根因链** (逐层插桩定位):
1. ggn 子图每层初始 [N1_x, N2_x], ELK [N2_x, N1_x] — **N1/N2 链整体交换**.
2. 追踪到 NetworkSimplexLayerer.connectedComponents: ELK 用 `addFirst` (大分量先) —
   `if (components.isEmpty() || components.getFirst().size() < componentNodes.size()) addFirst else addLast`;
   ggn 只 `push` (theNodes 顺序).
3. compound05 子图 N2 链分量 (5 节点, 含外部端口 dummy) > N1 链 (4 节点) → ELK 先处理 N2 链
   → L1/L2/L3 层内 N2 在前; ggn N1 链先 → 层序颠倒 → 第一轮 P3 BARYCENTER rank 差异
   (N1_2 bc 用 N1_3 rank + CN dummy rank vs ELK 用 N2_2...) → BK 上下翻转.

**修复** (src/p2layers/network-simplex-layerer.ts): connectedComponents 按 ELK 语义
大分量 addFirst (unshift), 否则 addLast (push).

**验证**: compound05 7 节点坐标 0 差; 696 5→4 (bug 0); 全量 1974 全绿; E2E 88.9% 无回归.

**教训**: NetworkSimplexLayerer 的连通分量处理顺序 (大分量先, 属性实例复用) 影响层内节点顺序,
进而级联 P3/BK 布局. 移植时不能只按遍历顺序 push, 要复刻 ELK 的 addFirst/addLast 排序.

## 25.18 696 工具修复: 类加载变体双 oracle + jar 自身报错 expected-crash (2026-08-08)

**inside_outside (类加载变体)**: ELK 同 seed=1 同 signed jar, EdgeMain y=22 vs BatchMain y=12
(类加载顺序非确定), ggn 确定性匹配 BatchMain. 修复: jar-oracle 加 `variants` 字段记录 BatchMain
坐标, elkt2test 坐标差分比较 ggn vs 主 oracle + 所有 variants, 任一匹配通过 (min diff).

**compound06 (jar 自身报错)**: ELK 0.12.0 抛 IllegalStateException "Expected 2 hierarchical ports,
found 0"; ggn 复刻同样报错 (sortPortDummiesByPortPositions 断言一致). 修复: generate-jar-oracle
对报错图写 `{graph, hash, err}` oracle; elkt2test 检测 err → 生成 expected-crash 测试
(`expect(() => layout()).toThrow(/hierarchical ports/)`), 验证 ggn 复刻 ELK 报错.

## 25.19 three_edges_inverted_ports_2 定位: BK verticalAlignment 差异 (2026-08-08)

**现象**: N2/N0 y 差 4.33 (ggn N2 20.3 vs jar 24.67). 非类加载变体 (EdgeMain=BatchMain 一致).

**已排除** (逐项插桩): 断环一致 (都 chose N2, nextInt(31)=1569548985, 反转 N1->N2);
层分配一致 (L0={N2,N0}, L1={N1,N3}); N2 端口一致 (5×EAST -1.67..23.67); margin 一致
(N2 0,1.67,8,1.67 — 之前 ELK_MARGIN 误打印计算前值). 差异在 **BK 内部**:
DOWN/RIGHT y[3] ggn 54.33 vs jar 50, innerShift[3] 0 vs 0.333. 需对比
src/p4nodes/bk-aligner.ts vs ELK BKAligner (verticalAlignment 块结构 / insideBlockShift 端口对齐).

**工具就绪**: ggn GGN_BK_DBG/GGN_NS_DBG/GGN_GCB; ELK ELK_BK_DBG/ELK_MARGIN (InnermostNodeMarginCalculator)/ELK_GCB.

## 25.20 three_edges 修复: 端口垂直放置 spacing 的 ELK 中心间隔公式 (2026-08-08)

**现象**: three_edges_inverted_ports_2 坐标差分失败 — N2/N0 y 差 4.33 (最后一个 696 bug).

**根因**: N1 (FREE 约束, 含 size-0 匿名端口被 P3 sortPorts 排 ports[0]) 的 WEST 端口,
ggn 简化公式 spacing=(nodeH+ports[0].size.y)/(n+1) → ports[0] 高度 0 → spacing 5 → 端口 5..25
→ N1 margin.top 0 vs ELK 0.333 → BK spaceAbove/innerShift 差 → N2/N0 y 差 4.33.

**修复** (src/intermediate/label-and-node-size-processor.ts): placeVerticalPortsEqually spacing 改为
**ELK 中心间隔公式** `portHeight + (nodeH - Σsize.y)/(n+1)` (portHeight 取正常端口高, 不用
ports[0] 可能为 0):
- 全同高端口 (Σsize = n×portHeight) 时 = (nodeH+portHeight)/(n+1) — 常规节点不变 (零回归).
- 含 size-0 端口 (Σsize < n×portHeight) 时中心间隔增大 — three_edges N1: 8+(30-32)/6=7.67
  (vs 原 6.33) → 端口 -0.33..30.33 = ELK → margin.top 0.333 对齐.

**验证**: 696 门禁 0 失败 (bug 全部归零); E2E 88.9→89.3% (861/964); 全量 1974 全绿.
前置: compound06 (expected-crash) / inside_outside (双 oracle) 上轮已通过.

**教训**: ggn 简化端口放置公式 (nodeH+portH)/(n+1) 只在全同高端口时等于 ELK cell system
中心间隔; size-0 (匿名/自环) 端口会污染 ports[0].size.y. 用 Σsize 的 ELK 公式通用且对常规
节点等价, 是零回归的精确修复.

## 26. stage-diff CLI: 每阶段快照对比 + 二分定位 (2026-08-09 凌晨)

**痛点**: 黑盒坐标对比只能知道"结果不对", 不知道错在哪个阶段; elkjs 插桩成本高。
**解法**: 两边都产出**规范化阶段快照**, 逐相位对比, 首个分歧 = bug 所在阶段。

### 原理
- **jar 侧零成本**: ELK 0.12.0 `ElkLayered` 在每个 processor 前调用
  `DebugUtil.logDebugGraph(monitor, lgraph, slot, "Before <Module>")` → `JsonDebugUtil.createDebugGraph`
  (完整 LGraph JSON: 节点/端口/边/弯点/属性)。`scripts/elk-java-debug/DebugMain.java` + `run.sh`
  已经收集每模块前快照 (每分量一份, `<slot>-Before_<Module>_<seq>.json`)。
- **ggn 侧**: `LayeredLayoutProvider.setHooks` (beforeModule/afterModule/afterPhase)。
  本轮新增 **P2/P5 相位钩子** + **combine 钩子** (多分量合并后, 合并前在相位对比里是盲区)。
- **规范化快照** (`scripts/stage-diff.mjs`): 两边同构 —
  `{ layerKeys, nodes: {模型id: {type,x,y,w,h,ports}}, edges: [{src,tgt,bends}], graphSize }`。
  - 节点 key = **模型 id** (jar 从 `properties.origin "ElkNode \"...\""` 解析, ggn 用 `N`+elkt 名) —
    不能用分量内索引 (jar 每分量从 0, ggn 是全局序, 对不上)。
  - 坐标基准: jar 节点坐标 = position + offset + padding, 端口 = position (无 offset);
    ggn 节点坐标 = position (offset+padding 最后才加)。→ 归一化时 jar 节点坐标减 padding。
  - 图尺寸 graphSize: 端口外扩/自环 spline 外扩都体现在这里, 是分量排布的依据。

### 对齐策略 (关键)
- **相位边界为主** (初始/P1/P2/P3/BK/P5/done + root 最终): 对模块顺序差异鲁棒。
  逐模块对齐脆弱 — ggn 与 ELK 模块顺序有真实差异 (ggn 先 SelfLoopPreprocessor 再
  EdgeAndLayerConstraintEdgeReverser, ELK 相反), 逐模块会产生虚假差异。
- jar 相位锚点按模块名找 (P2 起点=首个 layerer, P3 起点=LayerConstraintPostprocessor,
  P4 起点=SelfLoopPortRestorer/..., P5 起点=LayerSizeAndGraphHeightCalculator)。
- `--modules` 逐模块细查 (知道顺序差异时用)。

### 实战案例: self_loops/fixedSide (696 5→0)
1. stage-diff 显示**单分量 P1–BK 全一致**, 分歧只在 root 最终布局 → 组件排布 (combine)。
2. 单分量图尺寸也一致 (98.67×52.67) → 矛盾点缩小到 combine 使用的尺寸。
3. 根因: `doSimpleLayout` 布局后 `computeComponentSize` 用「内容边界」(节点+端口, 76×30)
   **覆盖** LSAGHC 算出的尺寸 (含自环 spline 外扩 98.67) → 行间距/列距错。
4. 修复: computeComponentSize 改**只增不减** (`Math.max`) — 保留端口外扩修正, 不再缩小。
   → self_loops/fixedSide|free + 128_selfLoopLabelSpacing_complex 全过, 696 100%。

### 经验教训
- 阶段对比比黑盒快一个量级: fixedSide 从"猜 BK/端口"到"combine 尺寸"只花了几次工具运行。
- 快照坐标基准 (offset/padding)、节点 key (模型 id)、相位对齐是三个最大的坑。
- 工具还顺带暴露了**单分量自环 SPLINES 弯点差异** (边路由域真实差异, 与 edge-e2e 自环 7 失败同源)。

### 用法
```
bun run stage-diff:diff test-resources/elk-models/tests/layered/self_loops/fixedSide.elkt
bun scripts/stage-diff.mjs diff <elkt> --modules --verbose   # 逐模块细查
bun scripts/stage-diff.mjs ggn|jar <elkt> --out <dir>         # 只 dump 单边快照
```

## 27. SSOT 保真: 节点级选项注入 (2026-08-09 凌晨)

**教训**: 696/edge-e2e 的 oracle 生成路径 (elktToElkJson) 曾只发射 portConstraints + insideSelfLoops.activate,
丢弃 nodeSize.* / layerConstraint / portLabels.placement / edgeRouting.selfLoop* / considerModelOrder / direction
(节点级) 等几十种选项 → oracle 是 jar-跑-丢参输入的产物, "100% 通过" 是对错误基准的通过。
**用户要求"前置参数不一致无法测试" — 这正是 M0-B 的盲区 (只做了图级参数, 没做节点级)。**

**修复 (scripts/elkt2test.mjs + elkt-build.mjs)**:
1. parseElkt 节点属性支持多 token 值 (`nodeSize.minimum: "100, 50"`) + `elk.`/`org.eclipse.elk.` 前缀归一化;
2. OPT_MAP 补 30+ 节点级选项 (canonical key = ELK JSON key, 图级/节点级共用一张表);
3. elktToElkJson 发射全部节点选项 → oracle 忠实;
4. generateTest 发射 NODE_OPTS + buildLGraphFromParsed 应用 → ggn 与 oracle 同输入;
5. ggn 补 NODE_SIZE_MINIMUM + MINIMUM_SIZE 约束; selfLoopDistribution/Ordering 节点级优先回退图。

**结果**: 重新生成 oracle/生成测试后, 696 忠实化 = 44 失败 (之前 0 是丢参掩盖), edge-e2e 83%.
44 个缺口 = ggn 未实现的节点级选项 (nodeSize/layerConstraint/portLabels/preserve_order/层级 inside-self-loop 等),
是真正的剩余移植工作。self_loops/free 已修 (节点级 selfLoopDistribution/Ordering)。

**验证方法**: 对存疑 oracle, 直接 DebugMain 跑 elktToElkJson 输出确认 jar 行为 (insideSelfLoops: Nparent 4×32@(30,22)
是 jar 真值, ggn 24×32@68 是 bug)。

## 28. err-oracle harness 修复 + 层级处理器一致性校验 + nodeSize.minimum 方向转置 (2026-08-09 上午)

### 背景: 7 个"过期 hash"失败其实都是 ELK 0.12.0 报错图
排查 verticalOrder/modelOrder×2/hierarchicalLayoutMixing/665/588/interactiveRectpacking 时发现:
这 7 个的 oracle hash 与当前 elktToElkJson 不匹配, 不是坐标失败, 而是 **oracle 是旧丢参模型跑的**。
用忠实模型重跑 jar → **全部抛异常** (elkjs 0.12.0 同样抛):
- verticalOrder: `UnsupportedGraphException INTERACTIVE in child node ... only allowed if root specifies same hierarchical processor`
- modelOrderCrossingMinimization: 同上 (child NONE)
- modelOrderCycleBreaking: `NullPointerException` (见 §28.3)
- interactiveRectpacking / hierarchicalLayoutMixing / 665 / 588: `UnsupportedConfigurationException Layout algorithm 'rectpacking'/'stress' not found` (算法不在 debug classpath — accepted)

### 28.1 harness bug: EdgeMain 的 ERR 打到 stderr 被丢
`generate-jar-oracle.mjs` 只收集 `r.stdout`; EdgeMain 把 `ERR <path>: msg` 打到 **stderr** 且进程退出 0
→ 报错模型的 ERR 全丢 → err-oracle 永远写不出来 (348 个只有 1 个 err-oracle), 报错模型 oracle 残留旧文件。
**修复**: 合并 `r.stdout + r.stderr`; errs 匹配改按 batch 文件名 (原来 name 是完整路径带冒号, 永远匹配不上)。
err 消息不再截断 200 字符 (截断会切掉稳定尾段, verticalOrder 实证)。

### 28.2 elkt2test err-oracle 测试生成修复
原模板: 正则乱写 + 硬编码 `.toThrow(/hierarchical ports/)` (只对 compound06 碰巧成立)。
**修复**: 从 oracle err 派生 `异常短类名 + 消息尾段` (slice(-60), 转义正则元字符) → `toThrow(new RegExp(...))`;
标题单引号转义 (`'elk.stress'` 破坏 JS 字符串实证)。

### 28.3 reviewAndCorrectHierarchicalProcessors 移植 (ggn 缺口)
ELK ElkLayered.java:336-355: 层级感知处理器 (IHierarchyAwareLayoutProcessor, 如 INTERACTIVE/NONE CM) 必须由
根图统一指定 — 任一子图 CM 策略 ≠ 根图即抛 UnsupportedGraphException。ggn 之前完全没有这个校验 (子图策略
根本没传播到嵌套图 → 恒为默认 → 永不触发)。**修复**:
1. `propagateNestedGraphOptions`: 节点级 `crossingMinimization.strategy` → 嵌套 LGraph
   (ELK ElkGraphImporter.createLGraph.copyProperties 子集);
2. `reviewAndCorrectHierarchicalProcessors(root, graphs)`: doHierarchicalLayout 入口校验, 不匹配抛
   `UnsupportedGraphException: The hierarchy aware processor X in child node ... is only allowed if the root node specifies the same hierarchical processor.`
→ verticalOrder + modelOrderCrossingMinimization 变为 expected-crash 测试且通过。

### 28.4 modelOrderCycleBreaking: ELK 0.12.0 自身 NPE bug (登记 accepted)
忠实模型 (嵌套图 MODEL_ORDER 断环 + INCLUDE_CHILDREN) 触发 `ModelOrderCycleBreaker.java:70` 读 null
`MAX_MODEL_ORDER_NODES` → NPE。根因: v0.12.0 `importHierarchicalGraph` 只给根图 setProperty,
嵌套图从不设置 (修复见 eclipse/elk#756, 0.12.0 未含)。ggn `assignModelOrdersRecursive` 已按修复语义给嵌套图赋值
→ ggn 产出正确布局而非崩溃。**登记 accepted (ggn 不复刻 0.12.0 的 NPE bug)**。

### 28.5 nodeSize.minimum 方向转置 (476_multiLabelInVerticalLayout 修复)
ggn `processLabelAndNodeSize` 在 GraphTransformer(in) **之后**应用 MINIMUM_SIZE;
ELK 在导入期 (变换前) 应用。DOWN/UP 图节点已转置 (200x100→100x200), 未互换的 minimum(200,100)
→ max → 200x200 → 层间距 220 vs ELK 120。**修复**: 对 DOWN/UP 图 minimum x/y 互换后再取 max。
476 修复; 回归: 全部 15 个 nodeSize 模型定向跑无新增失败。

### 28.6 教训
- **ERR 行在 stderr** 是 harness 类 bug 的高发点 (进程退出码 0 时 execFile 的 stderr 极易被忽略)。
- **err-oracle 才是"忠实 SSOT"对报错图的正确形态**: 官方示例在 0.12.0 上可能真的崩溃 (verticalOrder),
  不能因为"示例应该能跑"就丢参数迁就 — 要以 jar 实际行为为准。
- **参考源码版本**: 本地 ELK 源码 checkout 是 master (0.13.0-SNAPSHOT), 不是 0.12.0!
  读行号/行为前先 `git show v0.12.0:path` 对照 (NPE 的 MAX_MODEL_ORDER_NODES 在 master 也同, 但其它文件可能已变)。
- 结果: 36 → 33 失败 (verticalOrder/modelOrderCrossingMinimization/476/453 修复, 453 从 accepted 移除)。

## 29. 嵌套图选项传播 (ELK copyProperties 子集) → transform_direction 修复 (2026-08-09 上午)

### 背景
transform_direction 是方向簇最后一个失败 (ggn n1 y=17 vs jar 37)。追踪:
- jar 扁平/嵌套对同一 4 节点图分层不同 → GreedyCycleBreaker 平局随机选择 (n2 vs n4) 依赖**节点顺序**;
- 但真正差异在**端口排序**: 容器节点设了 `portSortingStrategy: PORT_DEGREE`, ggn 嵌套图没收到
  → 端口顺序不同 → BK 块内端口对齐 (innerShift) 不同 → 单节点层 n1 位置 17 vs 37。

### 修复: propagateNestedGraphOptions 扩展 (ELK ElkGraphImporter.createLGraph.copyProperties 子集)
原来只传播 CROSSING_MINIMIZATION_STRATEGY; 现扩展为:
```
CROSSING_MINIMIZATION_STRATEGY, PORT_SORTING_STRATEGY, EDGE_ROUTING,
DIRECTION_CONGRUENCY, RANDOM_SEED, NODE_LABELS_PLACEMENT
```
**关键决策**:
1. **不传播节点 direction** — ELK v0.12.0 importHierarchicalGraph 强制嵌套图方向 = 父图方向
   (createLGraph.copyProperties 后 setProperty(parentGraphDirection) 覆盖节点 direction)。
   transform_direction 4 组内部坐标完全相同即此证据。节点 direction 由 GraphTransformer 处理。
2. **不传播 NODE_SIZE_*** — 容器 nodeSize.minimum 只作用于容器自身 (ELK NodeLabelAndSizeUtilities:226
   只读节点级 minimum, 不回退图级); 传播会让嵌套图子节点被撑大 (content_alignment 回归实证)。

### 结果
- transform_direction 通过 (4 组全部 1:1 对齐 oracle);
- 方向簇 4 个全清 (verticalOrder/modelOrderCrossingMinimization/transform_direction 修复,
  modelOrderCycleBreaking accepted);
- **edge-e2e 83.0% → 85.9%** (+27 层级边用例: EDGE_ROUTING 传播到嵌套图更忠实);
- 696: 33 → 31 失败, 无新增回归 (content_alignment 2 个已恢复);
- Gherkin 44/44 绿。

### 教训
- ELK copyProperties 是"全量复制节点 layoutOptions 到嵌套图" — ggn 定向移植时必须逐项核对哪些
  是图级选项 (传播) 哪些是节点自身选项 (不传播)。错传 NODE_SIZE 或 direction 都会引入回归。
- 端口排序 (PORT_DEGREE) 通过 BK innerShift 影响节点垂直位置 — 修边路由/坐标前先确认端口顺序一致。

## 30. insideSelfLoops 簇调查 (2026-08-09 上午, 未修, 下轮入口)

### 现象
jar: Nparent 4×32@(30,22), NparentWithSize 100×50@(30,84) (elkjs/EdgeMain 双确认);
ggn: Nparent 24×32@(68,22) (父 x 差 38, 尺寸 24 vs 4); NparentWithSize 100×50@(30,84) ✓。

### ggn 嵌套图状态 (dump 实证)
- 嵌套图 size 24×32, padding 12, offset 0; 2 个 EXTERNAL_PORT dummy (WEST/EAST) 在 x=-12/+12 (内容 0..24)。
- 根图: Nparent 宽 24 → 层宽大 → Nparent x=68 vs jar 30。

### ELK 尺寸链 (源码追踪)
1. `HierarchicalNodeResizingProcessor.resizeGraph`: calculatedSize = lgraph.getActualSize() (= size.x + pad.L + pad.R)。
2. `resizeGraphNoReallyIMeanIt`: size.x = newSize.x - padding; EAST dummy x += (newSize.x - oldSize.x)。
3. `graphLayoutToNode`: parent = getActualSize() → **jar parent 4×32 意味着嵌套图 size.x = 4-24 = -20 (不可能)** —
   矛盾点! 说明 jar 的嵌套图尺寸/父尺寸另有机制 (可能 EP dummy 相邻/合并, 或 resize 路径不同)。
4. phase5 JSON 快照显示 ELK 的 inside-self-loop EP dummy 在调试图里**合并显示** (labels=[p1,p2], 50×25) —
   ELK 的嵌套图结构与 ggn (两个独立 dummy) 可能根本不同。

### 待查 (下轮)
- 用 stage-diff 嵌套图相位支持 (或临时 Java 探针) 拿 jar 嵌套图**逐 dummy x 坐标** + size.x 实际值;
- 检查 ELK `HierarchicalPortPositionProcessor` 对 FREE 端口的对齐 (handoff: "FREE 对齐 + FIXED ratio + borderToContentArea");
- 对比 ggn CompoundGraphPreprocessor.processInsideSelfLoops 与 ELK 616-685 (dummy 创建参数 netFlow=-1/+1);
- 影响: insideSelfLoops/inside_outside/302/368/288/425/three_edges×2/hierarchy01/167/316/628/724 (~14 个)。

### §30 补充 (2026-08-09, LGraphDumpMain 探针实证)
- **ELK 引擎对 SEPARATE_CHILDREN 是逐子节点递归布局**: RecursiveGraphLayoutEngine 对每个子节点单独
  layout (含其 inside self loop), 子节点被 resize 到自环所需尺寸 (Nparent 4×32); 直接
  ElkLayered.doLayout(全图) 不递归 → Nparent 保持 60×30。
- **ggn 用嵌套图处理 inside self loop** (prepareInsideSelfLoopsRecursive → compound 路径) — 与 ELK
  引擎的"逐子递归扁平布局"架构不同 → 嵌套图尺寸 24 vs 4。
- **工具**: scripts/elk-java-debug/LGraphDumpMain.java (反射 ElkGraphImporter + ElkLayered,
  dump 逐图 size/padding/offset + 节点坐标含 EXTERNAL_PORT dummy)。--compound/--pre 可选。
- **待查**: 用 LGraphDumpMain 复刻 engine 的逐子递归 (或 hook engine) 拿 Nparent 单图布局的
  p1/p2 dummy 坐标 + size.x, 对比 ggn 嵌套图。

## 31. 间距传播 + 层级 SortByInputModel + NODE_LABELS 覆盖语义 (2026-08-09 上午)

### 31.1 间距选项传播 (628_hierarchyAwareLayoutProcessor 修复)
l1 设 `spacing.nodeNodeBetweenLayers: 10`, ggn 嵌套图没收到 → 用默认 20 → l2_2 x 差 10。
**修复**: NESTED_GRAPH_OPTS 补间距选项 (SPACING_NODE_NODE/BETWEEN_LAYERS, EDGE_EDGE(+BETWEEN),
EDGE_NODE(+BETWEEN), PORT_PORT, PORTS_SURROUNDING)。**顺带修复 three_edges_inverted_ports**。

### 31.2 层级路径补 SortByInputModel (724_includeChildrenModelOrder 部分)
扁平路径 (doSimpleLayoutInner) 有 SortByInputModel; 层级路径 (INCLUDE_CHILDREN) 缺。
**修复**: runGraphPreP3 在 PortListSorter 前按 CONSIDER_MODEL_ORDER_STRATEGY != NONE 跑 sortByInputModelProcess。

### 31.3 NODE_LABELS 约束改为覆盖语义 (724_includeChildrenModelOrder 核心)
ELK NodeLabelAndSizeCalculator: 非 FIXED 约束时 node.size = cell 最小尺寸 (**覆盖输入**, 不是 max)。
724 实证: 0 尺寸标签 → 节点 0×0 (ggn 之前 max(30,10)=30)。
- 标签 cell padding 恒为 0 (ELK 只对 COMPUTE_PADDING 调 setPadding); NODE_LABELS_PADDING 只用于定位。
- **条件**: 仅无 PORTS/PORT_LABELS 约束时覆盖 — 有端口约束时 cell 最小含端口贡献, ggn 尚未实现
  (701 实证: 覆盖到 0 → 节点重叠)。待 cell 尺寸系统完成后再统一。

### 结果
- 696: 29 → 28 失败 (96.0%); 修复 628/three_edges_inverted_ports/724; 无新增回归。
- edge-e2e 85.9% 不变; Gherkin 44/44。

## 32. cell 尺寸系统 (PORTS/PORT_LABELS) 调查 (2026-08-09 上午, 未修, 下轮入口)

### 关键实证 (elkjs/jar 双确认)
1. **默认 portAlignment 是 DISTRIBUTED** (Core.melk: `option ^default: PortAlignment { default = PortAlignment.DISTRIBUTED }`),
   不是文档页的 JUSTIFIED。DISTRIBUTED 时端口 cell 高 = ΣportH + (n+1)*portPort (上下各一个 portPort)。
   - 316: 2×200 WEST 端口 → 高 430 = 400 + 3*10 ✓。
   - 最小测试: 2×8 EAST → 高 46 = 16 + 3*10 ✓。
2. **padding 不影响端口高度**: 316 padding 0/20 高度恒 430 (端口在边框, cell 高即节点总高)。
3. **NODE_LABELS 覆盖语义** (§31.3): 非 FIXED 约束 node.size = cell 最小 (覆盖输入)。

### 未解之谜 (待专项)
- 316: Parent 最终 224×430 — 宽 224 = Child(200)+padding(24) 来自嵌套内容, 高 430 来自端口 cell。
  ELK HierarchicalNodeResizingProcessor.resizeGraph 用 nested actualSize 覆盖父尺寸 (→ 64 高),
  但 jar 高 430 — 说明 cell 尺寸 (430) 在 resize 之后仍保留。顺序/MAX 语义需用 DebugMain
  逐阶段快照确认 (phase5 JSON 有尺寸; 根图 P4 前后 Parent.size 变化)。
- cell 系统 (NodeLabelAndSizeCalculator 7 阶段 + StripContainerCell/GridContainerCell/AtomicCell)
  是完整实现, 建议: ① 用 elkjs 逐例校准简化公式 (DISTRIBUTED 端口高/宽 + N/S 端口宽 +
  PORT_LABELS 外标签); ② 接上 NODE_LABELS 覆盖 + MINIMUM_SIZE; ③ 处理 resizeParentNode 与
  cell 尺寸的 MAX 交互。
- 影响: 316/304/701/299/inside_port_labels/treat_as_group_outside/flexible_ports×2/spacing__ports/167 (~10 个)。

### §32 补充 (2026-08-09, DebugMain phase5 实证)
- 316 嵌套图 phase5 (Before OrthogonalEdgeRouter) 显示 **`nodeSize.minimum = (20.0, 430.0)`**:
  父节点 PORTS cell 尺寸 (430) 在嵌套图 P5 前已写入嵌套图 minimum → resizeGraph 的
  `adjustedSize = max(calculatedSize, minSize)` 用 430 保住了端口高度, 而宽度用 nested 内容 (224)。
- 这解释了 316 最终 224×430: 宽来自 nested actual (224), 高来自父 cell (430) 经 minimum 传递。
- **实现线索**: ggn 若给嵌套图写 nodeSize.minimum = 父 cell 尺寸, resizeParentNode 的
  max(计算尺寸, minimum) 即可复现。待下轮验证。

## 33. cell 尺寸系统 PORTS 落地: computeNodeCellSize + nested minimum (2026-08-09 上午)

### 实现 (对应 ELK ElkGraphImporter.calculateMinimumGraphSize + NodeLabelAndSizeCalculator)
1. **computeNodeCellSize(node, graph)**: 简化 cell 尺寸 — PORTS (E/W 端口→高, N/S→宽, DISTRIBUTED
   默认: Σport + (n+1)*portPort + portsSurrounding) + NODE_LABELS (标签盒) + MINIMUM_SIZE (节点级 minimum)。
2. **applyNestedGraphMinimumSizes(root)**: 布局前把容器 cell 尺寸写入嵌套图 nodeSize.minimum +
   补 MINIMUM_SIZE 约束 (ELK importer 导入期做); 端口先按 netFlow 定侧 (FREE, setPortSide)。
3. **resizeParentNode max**: newW/H = max(nested actualSize, nested minimum) — 316 端口高 430 经
   minimum 传递, 宽 224 来自 nested 内容。
4. **移除图级 NODE_SIZE_MINIMUM 回退**: ELK NodeLabelAndSizeUtilities:226 只读节点级 minimum,
   图级 minimum 由 calculateMinimumGraphSize 用于嵌套图 resize, 子节点继承是错的 (content_centered
   回归实证: 嵌套图 minimum (900,400) 被 n2/n3 继承 → 全变 900×400)。

### 结果
- 316_wrongGraphSizeWithIncludeChildren + 304_wrongMinimumNodeSize 修复; content_alignment ×2 恢复。
- 696: 28 → 26 失败 (96.3%); edge-e2e 85.9% → 86.1% (+2 层级边)。
- 剩余 cell 系: 701/299/inside_port_labels/treat_as_group_outside/flexible_ports×2/spacing__ports/167
  (PORT_LABELS 外标签 + portAlignment 变体未实现)。

### §33 补充 (2026-08-09, PORTS 扁平节点覆盖 + edge-e2e 87.9%)
- **扁平节点 PORTS 覆盖**: processNodeLabels 在提前返回 (labels.length===0) 之前, 对扁平节点
  (无嵌套图) 且约束含 PORTS 时 node.size = computeNodeCellSize (299: 3×8 EAST → 20×64; 默认 min 20×20)。
- **PORT_LABELS 单独约束不覆盖** (056 实证: 保留显式尺寸 80×80; 生成测试端口标签为空)。
- **结果**: 696 28→18 失败 (97.4%); edge-e2e 86.1%→87.9% (+15); 节点位置前置 93.8%。
- 修复 10 个: spacing__ports/flexible_ports×2/treat_as_group_outside/inside_port_labels/701/316/304/425/299。
- 剩余 cell 系: 167_insidePortLabelsInHierarchicalGraphs (PORT_LABELS 在层级图, 待端口标签 cell)。

### §33 补充2: 类加载顺序变体 variants 机制 (2026-08-09)
- **发现**: EdgeMain (单文件 JVM) vs BatchMain (批量 JVM) vs elkjs 对同一图可能给出不同坐标
  (302 实证: y 23.33 vs 12; 167: NN1 y 12 vs 22)。ELK 类加载顺序影响内部迭代/RNG → 非确定性。
- **实现**: generate-jar-oracle.mjs 增 BatchMain 变体 pass — 批量 JVM 跑全部模型, 坐标与 EdgeMain
  不同时写入 oracle.variants = [{ coords }]; 测试模板 `variants ?? []` 任一匹配即通过。
- **修复**: 167_insidePortLabelsInHierarchicalGraphs (变体一致时有效)。**注意**: 变体依赖批量组成
  (302 全量批量时 BatchMain 也给出 23.33 → 无变体 → ggn 12 不匹配)。302 根因是自环 margin 影响
  节点位置 (spline 域, 待 SplineSelfLoopRouter 专项)。

## 34. comment box 调查 (2026-08-09, 部分实现后回退, 下轮入口)
- **机制** (ELK): CommentPreprocessor (P1 前, 分配 TOP/BOTTOM_COMMENTS + 移除 comment 节点) →
  CommentNodeMarginCalculator (P4 前, 节点 margin 预留空间) → CommentPostprocessor (P5 后, 放置 box)。
  启用条件: GraphProperties.COMMENTS。
- **ggn 部分实现** (已回退): 预处理/margin/放置跑通, 但 comment_boxes 出现重叠 —
  根因: ① 分量排布 (combine) 未用节点 margin (n1 margin.top=40 未影响位置, ELK 靠
  LayerSizeAndGraphHeightCalculator offset.y=-minY 含 margin → 节点内容 y=90 vs ggn 50);
  ② comment box (已移出图) 未应用 graph offset (+12)。
- **待下轮**: 先修分量排布 margin (ELK SimpleRowGraphPlacer 用 graph size, 而 size 含 margin via
  offset) — 这是比 comment 更广的缺口; 再重试 comment。选项/内部属性已留 (COMMENT_BOX/
  SPACING_COMMENT_*/TOP_COMMENTS/BOTTOM_COMMENTS/COMMENT_CONN_PORT)。

## 35. comment box 完整实现 (2026-08-09, 修复 2 测试 + 组件 margin 缺口)
- **三个处理器** (src/intermediate/comment-processors.ts):
  1. CommentPreprocessor (P1 前): comment 节点 → TOP/BOTTOM_COMMENTS, 移除节点;
  2. CommentNodeMarginCalculator (P4 前, **Innermost 之后**): 节点 margin 累加 comment 空间;
  3. CommentPostprocessor (P5 后): 放置 box + 重连边 + **加回 layer** (获得 graph offset)。
- **两个关键教训**:
  - CommentNodeMarginCalculator 必须**在 InnermostNodeMarginCalculator 之后** (Innermost 会重置 margin,
    顺序反了 comment_boxes margin.top=40 丢失);
  - post-P5 方向变换后的 margin 重算也会重置 → 需 addCommentMarginToNode 保留 comment margin
    (否则分量尺寸缺 comment 空间 → combine 不预留 → 重叠)。
- **结果**: comment_boxes + KIPRA-1426 demo2 修复; 696 683/696 (98.1%), 13 失败 (9 accepted + 4 未分类);
  edge-e2e 87.9% 无回归; Gherkin 44/44; typecheck 干净。

## 36. NODE_LABELS 覆盖含 MINIMUM_SIZE (hierarchy01 NN1 y 修复) (2026-08-09)
- **bug**: NODE_LABELS 覆盖语义 (node.size = 标签盒) 把 MINIMUM_SIZE 的最小值也清掉 —
  hierarchy01 叶子节点 (MINIMUM_SIZE NODE_LABELS, 0 尺寸标签) 应为 20×20 (ELK 默认 min), ggn 得 0×0
  → NN1 高 125 vs 155。
- **修复**: 覆盖 = max(标签盒, MINIMUM_SIZE effMin, 默认 20)。724 (无 MINIMUM_SIZE) 仍 0×0。
- hierarchy01 仍差 NN2/NN3/NN4 x (N3_1 宽 66 vs 46, 20px) — 跨层级边 + HEAD/TAIL 标签 margin 域,
  待专项。

## 37. 嵌套图断环/分层策略传播 (three_edges_inverted_ports_2 修复) (2026-08-09)
- **bug**: NESTED_GRAPH_OPTS 缺 CYCLE_BREAKING_STRATEGY + LAYERING_STRATEGY — 容器设 INTERACTIVE
  断环/分层, 嵌套图仍用默认 GREEDY/NETWORK_SIMPLEX → 反转边数不同 (2 vs 3) → inverted dummy 少 1
  → 路由宽/节点 y 全偏。
- **修复**: 补两个策略到传播。three_edges_inverted_ports_2 通过。
- **顺带**: interactive-cycle-breaker 预存 undefined 类型错误修复。
- **结果**: 696 684/696 (98.3%), 12 失败 (9 accepted + 3 未分类); 节点位置前置 95.1%。剩余 3:
  insideSelfLoops/inside_outside (架构) + hierarchy01 (跨层级边标签)。

## 38. post-P5 margin 重算门控 (RIGHT 方向不重算) (2026-08-09)
- **发现**: doSimpleLayoutInner/runGraphPostP3 的 post-P5 margin 重算 (calculateNodeMargin) 对 RIGHT
  方向是多余的 (无方向变换) — 且会**清掉自环/comment margin** (SelfLoopRouter 在 BK 前扩展的 margin)。
- **修复**: 仅非 RIGHT (DOWN/UP/LEFT, 真发生变换) 时重算。inside_outside 仍差 (自环方向 above/below
  是更深的 SelfLoopEdge 方向问题, jar 内部 source=EAST 反转, ggn=WEST; 涉及自环 holder 方向归一化)。
- **结果**: 无回归 (696 684/98.3%, edge-e2e 87.9%)。剩余 3: insideSelfLoops/inside_outside (自环方向
  + 架构) + hierarchy01 (跨层级边标签)。

## 39. inside-self-loop 端口侧 (部分修复, inside_outside 仍差) (2026-08-09)
- **发现**: ELK CGP processInsideSelfLoops 用 createExternalPortDummy (FREE, netFlow -1/+1) 给
  inside 自环端口定侧 (source→WEST, target→EAST); ggn 的 createExternalPortDummy 只设 PORT_SIDE
  属性, 不更新 LPort.side 字段 → 后续处理按 netFlow 重算 → P1/P2 侧翻转 → 自环方向 (above/below) 错。
- **修复 (部分)**: createExternalPortDummy FREE 分支同步 setSide (explicit)。无回归。
- **仍差**: inside_outside NN1 y 差 10 (jar P1=WEST/P2=EAST vs ggn P1=EAST/P2=WEST, 且 elkjs 也给
  12 — jar-vs-elkjs 分歧)。端口侧在某处 (id 追踪显示末尾 port 0 被设 EAST) 仍被覆盖。待专项。


## 40. insideSelfLoops 尺寸根因定案: SEPARATE 逐子递归 + 边路由器负 size (2026-08-09, 下轮入口)

> 上一轮 (§30) 卡在"jar 嵌套图 size.x = -20 (不可能)"的矛盾。本轮用探针全链追通:
> 负 size 是 ELK **OrthogonalEdgeRouter 把 graph.size.x 设为路由 xpos** 的副作用,
> 而 xpos 对 inside-self-loop EP-dummy 图是负值。ggn 的 resizeParentNode 公式已与 ELK 一致
> (graph.size + padding), 缺的是"边路由后 graph.size.x = xpos"这一步 → ggn 得 24, ELK 得 4。

### ELK 引擎实际流程 (RecursiveGraphLayoutEngine + SEPARATE_CHILDREN, 全链实证)
1. **逐子递归**: 对每个子节点单独跑 LayeredLayoutProvider.layout(child) (SEPARATE 默认).
   对 Nparent: importGraph → lgraph = {p1/p2 EP-dummy} + e1 (yo 自环, 从父图 containedEdges 收集
   importFlatGraph "collect inside self loops" 块, 287-300 行).
2. **嵌套图布局**: 2 个 0 宽 EP-dummy + e1 → 单层 → BK 后 dummy 在 x=-12/+12; 边 e1 正交路由,
   OrthogonalEdgeRouter.process 末尾 `layeredGraph.getSize().x = xpos` (292 行) → **size.x = -20**.
3. **applyParentNodeLayout** (ElkGraphLayoutTransferrer 370-380): EXTERNAL_PORTS → 父 ElkNode
   resize 到 `getActualSize()` = size + padding = -20+24 = **4×32** → 端口 FIXED_POS, p1@WEST(-8,12), p2@EAST(4,12).
4. **根图 doLayout**: {Nparent(4×32), NparentWithSize(100×50)} + 常规自环 e0/e2 → ComponentsProcessor
   split → 每节点独立分量 (自环绕节点外扩: Nparent 分量 40×42, NPS 分量 136×60) → SimpleRowGraphPlacer
   按行组合 (同列堆叠) → 根 160×146, Nparent@(30,22), NPS@(30,84).

### ggn 差异 (探针 GGN_RP_DBG 实证)
- ggn 嵌套图布局后 graphSize=(0,8) (dummy 已在 -12/+12, 但 size.x 未更新), resizeParentNode:
  newW = 0+24 = 24 → Nparent 24×32@(68,22). ELK: size.x=-20 → newW = -20+24 = 4×32@(30,22).
- 公式已一致 (`child.getSize() + padding`), **缺"边路由写回 graph.size.x"** + 自环路由 xpos 复刻.

### 新探针工具 (scripts/elk-java-debug/, 均已编译验证)
- **InstrMain.java**: 复刻引擎逐子递归 — LayeredLayoutProvider.layout(Nparent) 后打印 ElkNode 尺寸/
  端口侧 (实证 60×30 → 4×32, portConstraints → FIXED_POS).
- **Instr2Main.java**: importGraph(Nparent) + doLayout + applyLayout 分步 — 实证嵌套图 size=(-20,8),
  dummy@(-12,0)/(12,0), applyLayout 后父 4×32.
- **Instr3Main.java**: doLayout 后打印 graph size/offset/layers (实证 size=(-20,8), 无 layers).

### 修复方向 (下轮)
1. ggn OrthogonalEdgeRouter (src/p5edges/orthogonal/orthogonal-routing-generator.ts) 补
   `graph.getSize().x = xpos` (ELK OrthogonalEdgeRouter:292) — 需先确认 ggn 路由的 xpos 值
   与 ELK 一致 (e1 的 dummy 图路由 xpos 应 = -20).
2. 若 xpos 不同: 对比 ggn vs ELK 自环/正交路由对 0 宽 EP-dummy 边的 xpos 计算 (SelfLoopPreProcessor
   隐藏的是常规自环; 嵌套图内 e1 是普通边).
3. 根图分量组合: 确认 ggn SimpleRowGraphPlacer 等价物按行堆叠 (Nparent 4×32 后应与 NPS 同列 x=30).
4. 完成后跑 inside_outside (同源: EP 端口侧) + 全量回归 (edge-e2e/1974).

### 工具清理
- 本轮临时探针 dbg-isl*.tmp.ts / dbg-h01.tmp.ts 已删; InstrMain/Instr2Main/Instr3Main 保留在
  scripts/elk-java-debug/ (git 未跟踪, 与 LGraphDumpMain 同类).


## 41. insideSelfLoops 修复落地 (2026-08-09, 685/696) + inside_outside 定位

### 修复 (SEPARATE_CHILDREN 分量拆分 + EXTERNAL_PORTS 零宽图负 size)
1. **ComponentsProcessor.split** (src/components/components-processor.ts): 嵌套图/容器图不拆的 guard
   改为仅 INCLUDE_CHILDREN 生效 (isInclude)。SEPARATE (inside-self-loop 平图) 现在按连通分量拆分 —
   ELK 根图把每个 inside-self-loop 节点独立成分量 (自环绕节点外扩 → 分量尺寸含自环), 根图按行堆叠。
   → Nparent 从 (68,22) 归位 (30,22)。
2. **doCompoundLayout SEPARATE 路径** (src/layered-layout-provider.ts): 嵌套图 (EXTERNAL_PORTS,
   size.x=0, 有 EP dummy) 布局后补 ELK ComponentGroupGraphPlacer 单分量合并语义:
   `graph.size.x = -COMPONENT_SPACING` (-20)。resizeParentNode 已有 `size + padding` 公式
   → Nparent 24→4 宽 (实际 4×32, 与 jar 完全一致)。
3. 两处均无回归 (684→685/696, 失败簇: insideSelfLoops 消失)。

### inside_outside (仍差, NN1 y 12 vs 22)
- **实证**: BatchMain (oracle 路径) NN1 y=22, 自环 e1 (外部) 从节点上方绕行 (bends y=12 = padding.top),
  节点被下推 10; ggn y=12, 自环从下方绕行 (bends y=90)。
- **关键陷阱**: DebugMain 的 CollectingMonitor (logGraph 带 save) 会**改变布局结果** (NN1 y=12, 与
  BatchMain 的 BasicProgressMonitor y=22 不同)! 调试快照 (端口侧 P1=WEST/P2=EAST、e1=P2→P1、
  端口序 P1,P2→P2,P1) 属于 y=12 路径, 不能直接当作 oracle 路径的状态。后续必须用
  Instr4Main (BasicProgressMonitor + RecursiveGraphLayoutEngine) 验证。
- 端口侧/端口序本身已正确 (realports P1@WEST/P2@EAST 全程不变); 差异在 SelfLoopRouter 的
  RoutingDirector/OrthogonalSelfLoopRouter 输入 (oracle 路径的真实 LGraph 状态) 或路由方向选择。
- 新探针: Instr4Main (DebugMain 等价 + BasicProgressMonitor, y=22 复现), Instr5Main (尺寸+端口侧),
  Instr6Main (LNode margin), Instr7Main (边 bendPoints), Instr8Main (import 后端口/边方向)。

### 剩余 2 个未分类失败
- inside_outside: 自环路由 above/below (本节省 §41)。
- hierarchy01: 跨层级边 HEAD/TAIL 标签 margin (N3_1 宽 66 vs 46, 20px)。
