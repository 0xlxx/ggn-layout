# 非 layered 算法移植清单 (待移植)

目标 (用户指示): **优先 layered, 但其他算法也要移植过来**。
本文件跟踪 layered 之外 ELK Java 0.12.0 算法的移植进度, 每轮按既定方法论:
读算法资料 → ast-grep outline 对比 → 实现 → BDD + 变异测试 → bdd/elkt 差分回归。

## 分派基础设施 (已完成)
- `src/api/elk-json.ts layoutElkJson`: 读 `org.eclipse.elk.algorithm` 分派 (对齐 Java
  `RecursiveGraphLayoutEngine`)。当前仅 layered (默认); 其他算法抛出明确错误, 避免静默
  输出错误的 layered 布局。`scripts/verify-elkg-java-layout.ts` 对非 layered 模型跳过
  (对比无效, 已实测: 348 中 6 个非 layered)。

## harness 依赖 (lib jar, gitignored)
- `org.eclipse.elk.alg.force-0.12.0.jar` (stress/force Java 侧): 
  `curl -L -o scripts/elk-java-debug/lib/org.eclipse.elk.alg.force-0.12.0.jar https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.force/0.12.0/org.eclipse.elk.alg.force-0.12.0.jar`
- `org.eclipse.elk.alg.rectpacking-0.12.0.jar` (rectpacking Java 侧):
  `curl -L -o scripts/elk-java-debug/lib/org.eclipse.elk.alg.rectpacking-0.12.0.jar https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.rectpacking/0.12.0/org.eclipse.elk.alg.rectpacking-0.12.0.jar`
- `org.eclipse.elk.alg.topdownpacking-0.12.0.jar` (topdownpacking Java 侧):
  `curl -L -o scripts/elk-java-debug/lib/org.eclipse.elk.alg.topdownpacking-0.12.0.jar https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.topdownpacking/0.12.0/org.eclipse.elk.alg.topdownpacking-0.12.0.jar`
- `org.eclipse.elk.alg.spore-0.12.0.jar` (spore Java 侧):
  `curl -L -o scripts/elk-java-debug/lib/org.eclipse.elk.alg.spore-0.12.0.jar https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.spore/0.12.0/org.eclipse.elk.alg.spore-0.12.0.jar`
- `org.eclipse.elk.alg.vertiflex-0.12.0.jar` (vertiflex Java 侧):
  `curl -L -o scripts/elk-java-debug/lib/org.eclipse.elk.alg.vertiflex-0.12.0.jar https://repo1.maven.org/maven2/org/eclipse/elk/org.eclipse.elk.alg.vertiflex/0.12.0/org.eclipse.elk.alg.vertiflex-0.12.0.jar`

## 已移植
- **layered** (`org.eclipse.elk.layered`, 本项目主体): 管线无缺口, 见 data-paths-review §36。
- **stress / force** (`org.eclipse.elk.stress` / `org.eclipse.elk.force`, alg.force): `src/force/`
  (graph/kvector/options/force-models/stress-majorization/components-processor/elk-graph-importer/stress-layout).
  语义: force 初始坐标 (FR/Eades) + StressMajorization 全对最短路径 + 迭代收敛.
  验证: tickets/665 1/1 全等; hierarchicalLayoutMixing stress 子图全等 (SEPARATE_CHILDREN 子图为待办 R17).
- **rectpacking** (`org.eclipse.elk.rectpacking`, alg.rectpacking, R09 剩余): `src/rectpacking/`
  (options/drawing-data/block/block-row/block-stack/rect-row/p1-width-approximation/p2-packing/
  p3-whitespace-elimination/rect-packing-layout). 语义: NodeMicroLayout (no-op, 触发模型无标签/端口)
  → TRYBOX 可堆叠检测 (可堆叠 → p1/p2/p3 管线; 等高不可堆叠 → 设递减 PRIORITY 降级 box) →
  内容对齐 translate → applyPadding(15) → resizeNode(内容+padding). p1 = GreedyWidthApproximator
  (AreaApproximation 4 候选 LPR/LPB/WDR/WDB + 按 OptimizationGoal 过滤), p2 = Compactor
  (InitialPlacement + RowFillingAndCompaction + Compaction 块吸收/堆叠/并排), p3 = 空白消除 (默认 NONE).
  验证: interactiveRectpacking_hierarchy/oneBigNode + interactiveLayout_mixedHierarchy 3/3 全等.
- **topdownpacking** (`org.eclipse.elk.topdownpacking`, alg.topdownpacking): `src/topdownpacking/`
  (options/grid/p1-node-arrangement/p2-whitespace-elimination/topdown-packing-layout). 语义: P1
  LeftRightTopDownNodePlacer 按正方形网格 (cols=ceil√n, 移除底部空行) 从左到右、从上到下放置,
  子节点统一尺寸 = topdown.hierarchicalNodeWidth × (width / hierarchicalNodeAspectRatio) (父预知,
  默认 150/1.414), 父尺寸 = max(输入, 预测); P2 BottomRowEqualWhitespaceEliminator 底部行水平
  扩张填空白 + 首列纵向扩张填空白. 验证: tickets/core/900/901/902 触发模型 3/3 全等 (900 根算法
  被 harness 强制 layered, 与 jar 同; 901/902 为子节点黑盒, 含内部边/自定义尺寸).
- **box** (`org.eclipse.elk.box`, core/util/BoxLayoutProvider): `src/api/core-providers.ts boxLayout`
  (SIMPLE 模式; GROUP_* 待移植). 语义: 子节点按 padding(15)/spacing(15) 装箱, MINIMUM_SIZE 约束
  父尺寸, expandNodes 填行宽高. 对齐 489_Large/Small + 457 (verify 4/4).
- **fixed** (`org.eclipse.elk.fixed`, core/util/FixedLayoutProvider): `fixedLayout`. 语义: 只动有
  POSITION/BEND_POINTS 选项的元素, fixedGraphSize 阻止父节点撑大. 对齐 475.
- **random** (`org.eclipse.elk.random`, core/util/RandomLayoutProvider): `randomLayout`. 用
  JavaRandom (RANDOM_SEED, 默认 0) 画布内随机分布 + 边随机弯点; aspectRatio 默认 1.6.

### 集成方式 (2026-08-11)
`layoutElkJson` 分派对齐 ELK RecursiveGraphLayoutEngine: 非 layered 子树自底向上先跑 core
provider (节点位置/尺寸定型), 再作为**黑盒**交给 layered — `elkJsonToParsed(opts.blackBoxIds)`
跳过其嵌套图 (子节点不进 layered 图), 导出后 `mergeBlackBoxSubtrees` 把子树合并回输出.
```
box/fixed/random → layoutElkJson → blackBoxIds → buildGraph → LayeredLayoutProvider → 输出合并
```
验证: `verify-elkg-java-layout` 对 489/457/475 全等 (348 全等 319 → 323, 非 layered 跳过 6 → 2)。
rectpacking (R09 剩余): `layoutElkJson` RECTPACKING_ALG_IDS 分派 + runCoreProviders case `rectpacking`;
根节点不读自身 layoutOptions 算法 (对齐 harness LayoutJsonMain 强制 root=layered, JSON 根算法无效);
`ComponentsProcessor.split` INCLUDE_CHILDREN 一律不拆 (ELK doCompoundLayout 组件处理不适用 —
黑盒叶子 INCLUDE 图误拆会分量左对齐 vs Java 整图分层居中, interactiveRectpacking_hierarchy 实证).
验证: 3 触发模型 3/3 全等; 全量 348 对齐 339 → 342 (4 个自环模型预存差异, 与 rectpacking 无关).
topdownpacking: `layoutElkJson` TOPDOWN_ALG_IDS 分派 + runCoreProviders case `topdownpacking`;
black-box 内部边 (两端同处子树) 由 `attachSubtreeEdges` 挂回节点 (Java LCA 语义, 不进 layered 图,
输出原样保留在节点 edges 无 sections — 902 实证). 验证: 900/901/902 3/3 全等; 全量 345 坐标全等.
- **spore** (`org.eclipse.elk.sporeOverlap` / `org.eclipse.elk.sporeCompaction`, alg.spore): `src/spore/`
  (geometry/graph/options/elk-graph-importer/scanline-overlap-check/bowyer-watson/naive-minst/
  delaunay-triangulation-phase/minst-phase/maxst-phase/grow-tree-phase/depth-first-compaction/
  shrink-tree-compaction-phase/spore-layout). 语义: sporeOverlap 迭代 (scanline 检测重叠 →
  Delaunay 三角剖分 → MinST(INVERTED_OVERLAP) → GrowTree 沿生成树边拉伸消除重叠, provider 强制
  CENTER_NODE + INVERTED_OVERLAP + MINIMUM_SPANNING_TREE); sporeCompaction = ShrinkTree
  (Delaunay → 生成树 (选项策略) → DepthFirstCompaction 深度优先压缩). 坐标全等依赖 JavaHashSet
  (TEdge/TTriangle 哈希桶迭代序模拟) 保证 MinST 稳定排序同权 tie-break 与 jar 一致. 验证:
  910-914 触发模型 5/5 全等; 全量 356/356 对齐 (坐标全等 351 + 报错复刻 5).
- **radial** (`org.eclipse.elk.radial`, alg.radial): `src/radial/`
  (options/radial-util/sorting/optimization/compaction/overlaps/rotation/p1-eades-radial/
  p2-straight-line-edge-router/intermediate-graph-size/intermediate-edge-angle/radial-layout).
  语义: 树 → EadesRadial P1 (根为圆心, 同层同半径, 楔形按 NODE_SIZE 准则, 可选 0-359 度
  平移优化, 默认 NONE) → 中间处理器 (OVERLAP_REMOVAL 总是: 逐半径外扩消除重叠并把移动量
  传递给下一层; COMPACTION 可选 (compactor != NONE): 逐半径/逐楔形压缩; ROTATION 可选:
  绕原点旋转到目标角度) → GRAPH_SIZE_CALCULATION (容器尺寸 = 范围 + padding 12, 平移到
  正坐标, 可选 CENTER_ON_ROOT) → P2 直线路由 (中心到中心裁剪). 非树 (无根) 抛错
  (Java IllegalArgumentException 同). 验证: tickets/core/930/931/932 触发模型 3/3 全等.
- **vertiflex** (`org.eclipse.elk.vertiflex`, alg.vertiflex): `src/vertiflex/`
  (options/internal-properties/vertiflex-util/outline-node/node-comparator/p1yplacement/node-y-placer/
  p2relative/relative-x-placer/p3absolute/absolute-x-placer/p4edgerouting/straight-edge-router/
  bend-edge-router/vertiflex-layout). 语义: 树布局 — P1 垂直放置 (VERTICAL_CONSTRAINT 优先,
  否则 layerDistance + 高 + max(margin.bottom, nodeNodeSpacing) 递推), P2 相对水平放置
  (outline 压实; STRAIGHT 半圆排列可直线边 / BEND 保持模型序 + EDGE_BEND_HEIGHT 弯点高度),
  P3 绝对坐标 (根左移至最左子树 x=0), P4 边路由 (直线或弯点). 输入校验: 图必须是无环树
  (根唯一/每子节点入边 ≤1/垂直约束沿祖先链单调), 否则抛错 (Java UnsupportedConfigurationException).
  NodeMicroLayout no-op (触发模型无标签/端口). splitGroup 保留 Java 0.12.0 无 i++ 的 while
  (bug 级 1:1, jar 差分实证全等). 验证: 950-952 触发模型 3/3 全等 (含 BEND 弯点 section
  逐点差分); 全量 358/359 对齐 (坐标全等 353 + 报错复刻 5 + harness 豁免 1).
- **disco** (`org.eclipse.elk.disco`, alg.disco): `src/disco/`
  (geometry/options/graph/*/structures/dc-polyomino/polyomino/*/transform/*/
  disco-polyomino-compactor/disco-layout). 语义: DisCoLayoutProvider 把 ElkNode 拆成连通分量
  (ElkGraphComponentsProcessor DFS) → ElkGraphTransformer 把节点/标签/端口/边统一多边形化为
  DCElement (short hierarchical 边为 DCExtension) → DisCoPolyominoCompactor 按
  Freivalds et al. (2002) 栅格化打包 (Polyominoes/PlanarGrid/TwoBitGrid 为 alg.common polyomino
  公共部分, BigInt 复刻 Java long 位压缩) → 分量偏移写回原图 (节点/端口/标签/边 section,
  空 section 由 firstEdgeSection createEdgeSection 语义创建). 关键对齐点: melk 默认值
  (polyomino.traversalStrategy = QUADRANTS_LINE_BY_LINE, fill = true — 与代码 switch default
  不同!); 边引用解析 (节点 id 路径式 "Ngroup.g1", 先查全引用再剥端口段); 稳定排序
  (TS Array.sort 与 Java TimSort 均稳定, 多次 sort 最后一次为主键). 验证: 940-942 触发模型
  3/3 全等; 全量 359/359 对齐 (坐标全等 353 + 报错复刻 5 + harness 豁免 1).

## 待移植 (按优先级; 行数 = Java 源码估算)

| 算法 id | Java 主类 (ELK 0.12.0) | 规模 | 优先级 | 触发模型 (elk-models) |
|---|---|---|---|---|
| `org.eclipse.elk.box` | core/util/BoxLayoutProvider.java | 810 行 | ★★★ 简单 | tickets/core/489_*, 457_boxLayouterIgnoresMinimumSize |
| `org.eclipse.elk.fixed` | core/util/FixedLayoutProvider.java | 224 行 | ★★★ 简单 | tickets/core/475_fixedLayoutWithLongLabels |
| `org.eclipse.elk.random` | core/util/RandomLayoutProvider.java | 276 行 | ★★☆ | (无固定模型) |
| `org.eclipse.elk.stress` (force) | alg.force/ForceLayoutProvider.java (17 文件, 2236 行) | 中 | ★★☆ | examples/hierarchy/hierarchicalLayoutMixing, tickets/665/588 |
| ~~`org.eclipse.elk.mrtree`~~ ✅ | alg.mrtree/TreeLayoutProvider.java (38 文件, 5790 行) | 最大 | ★☆☆ | tickets/core/920-922 |
| ~~`org.eclipse.elk.radial`~~ ✅ | alg.radial/RadialLayoutProvider.java (35 文件, 2752 行) | 大 | ★☆☆ | tickets/core/930-932 |
| ~~`org.eclipse.elk.disco`~~ ✅ | alg.disco/DisCoLayoutProvider.java (13 文件, 2409 行) | 中 | ★☆☆ | tickets/core/940-942 |
| ~~`org.eclipse.elk.spore`~~ ✅ | alg.spore/OverlapRemovalLayoutProvider.java (18 文件, 1326 行) | 中 | ★☆☆ | tickets/core/910-914 |
| ~~`org.eclipse.elk.vertiflex`~~ ✅ | alg.vertiflex/VertiFlexLayoutProvider.java (16 文件, 1693 行) | 中 | ★☆☆ | tickets/core/950-952 |
| `org.eclipse.elk.graphviz.dot` | alg.graphviz.dot (外部 dot 引擎) | 外部依赖 | ★☆☆ | (语料未触发) |

优先级依据: 语料中有模型触发 (489/457/475 已在 verify 里暴露差异) + 实现规模小 → 先移植。
box/fixed/random 属 core, 直接操作 ElkNode (非 layered LGraph), 与 layered 架构不同层:
建议在 `src/api` 侧建 `ElkNode` 直操 provider 接口 (对齐 Java ITopdownLayoutProvider 思路)。

## 验收口径 (每个算法)
1. ast-grep outline 与 Java 源码逐符号对比, 无缺模块。
2. BDD 测试算法不变量 + 变异测试杀灭率 ≥ 70%。
3. `verify-elkg-java-layout.ts` 对触发模型全等 (节点 + 边, ε=1e-3)。
4. 全量 bdd + elkt 差分回归无退化。
