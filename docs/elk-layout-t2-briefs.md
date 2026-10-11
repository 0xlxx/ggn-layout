# T2 并行簇简报 (12 代理, 2026-08-11)

> 基线: 主分支 337/348 (仅 hierarchy01), bdd 136, oracle 1036, e2e 门禁 941.
> 所有簇: 写集不相交; 禁止改 layered-layout-provider.ts (策略注册主线程合并后统一做; C 簇除外);
> 铁律: 禁 git stash/reset/checkout -f/clean/rebase, 只允许 git add <具体文件> + git commit + 只读查询.
> 通用方法: ast-grep outline 对比 Java 源码 (/Users/bjorn/ai-dev/tmp/elk/.../layered/) 与 TS,
> 逐符号移植 → 补 BDD (算法不变量, 语义与 Java 一致) → 跑验证.
> 通用退出: 本簇测试全过 + `bun scripts/verify-elkg-java-layout.ts` 全量 ≥337 失败集不新增 +
> `bunx vitest run tests/bdd` 全过 + `bunx vitest run tests/oracle/generated` 全过 + `bun run typecheck` 零新增错误.
> 完成后回写 docs/MODULES.tsv 对应行.

## C — hierarchy01 (跨层级边, 唯一剩余 348 失败)
- worktree: /Users/bjorn/ai-dev/ggn-wt-C, 分支 wt/C-cross-hierarchy
- 简报: docs/elk-layout-c-cluster-brief.md (完整)
- Scope: src/compound/*, src/intermediate/hierarchical-port-*.ts, src/intermediate/long-edge-*.ts,
  src/intermediate/elk-graph-importer.ts, src/graph/lgraph-util.ts (跨级边函数), tests/bdd/compound-ports.scenarios.test.ts
- 退出: verify hierarchy01 1/1 全等

## M1 — P1 断环策略族 (6 类, 全缺)
- Java: p1cycles/{DepthFirstCycleBreaker,BFSNodeOrderCycleBreaker,DFSNodeOrderCycleBreaker,
  SCCModelOrderCycleBreaker,SCCNodeTypeCycleBreaker,SCConnectivity}.java
- TS: 新增 src/p1cycles/*.ts (同名)
- 测试: tests/unit/{BasicCycleBreakerTest,BasicModelOrderTest}.test.ts 补对应断言 + 新 bdd
- 注意: SCConnectivity 是 SCC 公共辅助, 先移植它

## M2 — P2 分层策略族 (5 类, 全缺)
- Java: p2layers/{CoffmanGrahamLayerer,BreadthFirstModelOrderLayerer,DepthFirstModelOrderLayerer,
  MinWidthLayerer,StretchWidthLayerer}.java
- TS: 新增 src/p2layers/*.ts
- 测试: tests/unit/BasicLayerAssignmentTest.test.ts 补断言 + 新 bdd (分层不变量: 层差/宽度)

## M3 — P3 启发式策略 (2 类, 全缺)
- Java: p3order/{MedianHeuristic,ModelOrderBarycenterHeuristic}.java
- TS: 新增 src/p3order/*.ts
- 测试: tests/unit/{BarycenterHeuristicTest,ModelOrderBarycenterHeuristicTest}.test.ts + bdd
- 注意: 与现有 BarycenterHeuristic/port-distributors 的接口对齐 (见 MODULES.tsv P3 行)

## M4 — CrossingsCounter 行级对齐 (flat01 根因)
- Java: p3order/counting/CrossingsCounter.java (632 行)
- TS: src/p3order/counting.ts (现有 444 行) — 逐符号 diff, 补缺失分支
- 测试: tests/unit/CrossingsCounterTest.test.ts 补用例 + bdd 不变量 (交叉数单调/对称)
- 风险: 默认路径核心 → 全量 348 必须不降

## M5 — P4 LinearSegmentsNodePlacer (1 类, 缺)
- Java: p4nodes/LinearSegmentsNodePlacer.java
- TS: 新增 src/p4nodes/linear-segments-node-placer.ts
- 测试: tests/unit/BasicNodePlacementTest.test.ts 补断言 + bdd (线性段约束不变量)

## M6 — components 策略族 (4 类, 缺)
- Java: components/{ComponentsCompactor,ComponentOrderingStrategy,ModelOrderComponentGroup,
  ModelOrderRowGraphPlacer}.java (+ AbstractGraphPlacer 基类)
- TS: 新增 src/components/*.ts (与现有 component-group.ts / components-processor.ts 接口对齐)
- 测试: tests/unit/ComponentGroupTest.test.ts 补断言 + bdd

## M7 — intermediate 缺模块 (4 类, 缺)
- Java: intermediate/{ConstraintsPostprocessor,HypernodesProcessor,InteractiveExternalPortPositioner,
  NodePlacementRepeater}.java
- TS: 新增 src/intermediate/*.ts
- 测试: 各模块语义 bdd + 复用 Java 测试意图 (见 MODULES.tsv INT 行)

## M8 — wrapping 包 (8 类, 全缺)
- Java: intermediate/wrapping/*.java (ARDCutIndexHeuristic, BreakingPointInserter/Processor/Remover,
  CuttingUtils, GraphStats, ICutIndexCalculator, MSDCutIndexHeuristic, SingleEdgeGraphWrapper)
- TS: 新增 src/intermediate/wrapping/*.ts
- 测试: 各模块 bdd (不变量: breaking point 插入/移除后图等价)
- 注意: 这是「断行/换行」处理器 (BREAKING_POINT_*), 与 P5 正交, 独立

## M9 — NodeLabelPlacer + LabelManagementProcessor (OUTSIDE label 放置, 大)
- Java: 不在 layered 插件 (org.eclipse.elk.alg.common NodeLabelPlacer) + intermediate/LabelManagementProcessor.java
- TS: 新增 src/intermediate/labels/node-label-placer.ts (先按 layered 内 LabelManagementProcessor 需求做最小可用)
- 目标: OUTSIDE V_TOP label 放节点外 (y 负 + nodeLabelSpacing) → margin.top 生效
- 测试: tests/bdd/labels.scenarios.test.ts 补场景 (outside label 不变量: label 在节点外、无重叠)
- 风险: 影响面大 → 全量 348 必须不降, 允许只做最小可用 (不影响默认路径)

## X1 — 变异 p3order (重 CPU)
- 命令: bun run scripts/mutate-batch.mjs p3order --concurrency 2
- 目标: 幸存变异体 → 补测试杀死 → 循环到杀灭率 ≥70%
- 只改 tests/unit/p3order 相关测试文件 + src/p3order 仅当确属 bug
- 铁律: 不跑全量变异, 只跑本 batch

## X2 — 变异 compaction (重 CPU)
- 命令: bun run scripts/mutate-batch.mjs compaction --concurrency 2
- 同上
