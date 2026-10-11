# elk-layout 内核性能优化记录

> ⚠️ 2026-09 包更名：`packages/elk-layout` → `packages/layout`（包名 `@ggn/elk-layout` → `@ggn/layout`）。本文写于更名前，正文里的旧路径按此映射阅读；结论与判据不变。


> 状态: 阶段 0 (基准与 profiling 设施) 已完成; 阶段 1 待移植验收完成后启动。
> 范围: 仅 elk-layout 内核; 不碰 ggn-vanilla 渲染/适配层。

## 冲突规避规则 (与移植 agent 并行)

- 只新增文件; **不碰** `packages/elk-layout/src/**`、`PROGRESS.md`、`package.json`。
- 性能记录写本文件 (独立文档), 不动移植进度日志。
- 与移植 agent 错峰跑全量测试 (1807 差分), 避免资源争用。
- 移植验收完成、算法稳定后**必须重新采样 baseline** (当前 baseline 是移植中途值)。

## 工具

### vitest bench (CI 回归)
- `packages/elk-layout/tests/perf/layout.bench.ts`: realworld 图集按规模分组
  (small <50 / medium 50-199 / large >=200 节点, 每组 3 个代表图), 测「构建+布局」端到端。
- 运行: `cd packages/elk-layout && bunx vitest bench tests/perf/layout.bench.ts`
- 输出 JSON: `bunx vitest bench tests/perf/layout.bench.ts --run --outputJson bench-results/elk-layout-baseline.json`
- CI 挂接 (移植收口后): 复用根 `scripts/check-bench-regression.mjs` (默认 10% 阈值),
  elk-layout package.json 加 `bench` / `bench:baseline` / `bench:ci` scripts。

### perf-run.mjs (profiling 工具)
- `packages/elk-layout/scripts/perf-run.mjs`: 三种模式
  - `--bench <n>`: 三段计时 parse / build (LGraph 构建) / layout, 输出 mean/min/max/p95
  - `--phase`: 注入 LayoutPhaseHooks 逐模块计时, 输出模块耗时排序表 (定位热点模块)
  - `--cpu`: 单次 layout, 配合 `bun --cpu-prof --cpu-prof-md` 生成 CPU profile
- 图选择: `--graph <path.elkt>` 或 `--scale small|medium|large` (默认 realworld 最大图)
- 示例:
  ```
  bun scripts/perf-run.mjs --phase --scale medium
  bun scripts/perf-run.mjs --bench 30 --scale medium --out baseline-medium.json
  bun --cpu-prof --cpu-prof-md scripts/perf-run.mjs --cpu --scale medium
  ```
- 共享构建: `scripts/elkt-build.mjs` (elkt → LGraph, 三段成本分离 + parseElkt 缓存 +
  realworld 元数据缓存到 `bench-results/cache/`, 避免解析噪声污染 CPU profile)。

## Baseline (2026-08-06, 移植中途值, 验收后需重采)

### vitest bench (build+layout 端到端, mean)
| 规模 | 图 | 节点 | 耗时 (ms) |
|---|---|---|---|
| small | de_clockdrift_ClockDriftHierarchy | 11 | 0.23 |
| small | comm_scrambler_Scrambler | 11 | 0.16 |
| small | hoc_threadedcomposite_MulticoreExecution | 11 | 0.16 |
| medium | ptides_srinptides_SRinPtides | 50 | 1.12 |
| medium | aspect_cartrackingattackmodeling_CarTrackingAttackModeling | 50 | 2.76 |
| medium | pn_blindcommunication_BlindCommunication | 51 | 1.17 |
| large | wireless_intersections_Intersections | 220 | 3.70 |
| large | continuous_starmac_Starmac | 237 | 72.8 |
| large | wireless_intersections_Intersections (hier) | 247 | 4.74 |

### perf-run --bench 三段分离 (de_trilateration, 488 节点, 20 次均值)
| 段 | mean (ms) |
|---|---|
| parse (缓存 hit) | 0.91 |
| build (LGraph 构建) | 3.44 |
| layout | 50.78 |
| total | 55.13 |

### perf-run --phase 模块耗时 (de_trilateration, 488 节点)
| 模块 | 耗时 (ms) | 占比 |
|---|---|---|
| **LayerSweepCrossingMinimizer** (P3, ×2) | 64.0 | **68.1%** |
| BKNodePlacer (P4) | 7.9 | 8.4% |
| OrthogonalEdgeRouter (P5) | 3.4 | 3.6% |
| NetworkSimplexLayerer (P2) | 2.9 | 3.1% |
| CompoundGraphPreprocessor | 1.8 | 1.9% |
| 其余 ~20 模块合计 | ~13 | ~15% |

### CPU profile 热点 (bun --cpu-prof-md, de_trilateration)
- 顶层: `getIndex` (layer.ts) 3.6%, `getPorts` (lnode.ts) ~8.8% (3 处), `initPositions` (p3order/counting.ts) 2.8%,
  `getConnectedEdges` (lport.ts) 2.5%, `getProperty` (properties.ts) 1.9%, `calculateBarycenter` (barycenter-heuristic.ts) 1.8%,
  `sort`/`filter`/`map` 若干。
- 结论: P3 层内/端口相关 + 图模型访问 (getPorts/getIndex/getProperty) 是函数级热点, 与模块级 LayerSweep 68% 一致。

## 阶段 1 待办 (移植验收完成后)

执行循环: `bench 总耗时 → --phase 锁模块 → --cpu 锁函数 → 优化 → 全量 1807 差分 0 回归 → bench 对比 → 记录 → 下一项`。

候选热点 (按经验排序, 均保持 API 与输出不变):
1. LayoutPhaseHooks / NullProgressMonitor 零开销化 (无 hooks 不走闭包)
2. MapPropertyHolder.getProperty 高频路径 (默认值缓存, 常见属性直接读取)
3. 高频遍历去分配 (getAllNodes/toNodeArray/getPorts 减少重复数组)
4. JavaRandom 内联
5. P3 sweep / P4 BKAlignedLayout 临时数组复用

## 阶段 2 待办 (阶段 1 后)

- 新增 `layoutWithHints(graph, previousPositions)` 增量 API (默认关闭, 不影响 1:1 输出)
- 配合 INTERACTIVE 分层 + crossingMinimization.semiInteractive
- 增量验收: 交叉数不增 + 无重叠 + 位移最小化 (与全量对比, 不要求逐像素一致)
- profiling 复用: 全量 vs 增量耗时对比

## 阶段 3 待办 (阶段 0/1 后)

- `scripts/perf-e2e.mjs`: 真实 DSL 图「构建 LGraph → layout → 提取」三段耗时占比 (仅测量, 不优化渲染)
- 预算卡点: 按阶段 0/1 baseline 数据定 (如 1000 节点单次布局阈值), 移植收口后写入 elk-layout bench:ci

---

## 阶段 1 细化 (2026-08-12, 由代码审计 + 实测数据沉淀)

> 目标: 在保持「1:1 移植表面 + 输出全等」的前提下, 逐个算法做定向优化。
> 与阶段 0 工具链复用: perf-run.mjs (--bench/--phase/--cpu) + vitest bench。

### 0. 核心张力必须先定调

AGENTS.md 铁律 1「移植不是重写」(类/方法名与 Java 一一对应, 便于上游 diff 增量搬运)
与「数据结构/算法重写优化」天然冲突。三条路线:

| 路线 | 做法 | 收益 | 风险 | 推荐 |
|---|---|---|---|---|
| A. 表面不动、换内部 | 方法名/结构保持 Java 对应 (getPorts 还在), 但实现换成缓存/类型化数组/免分配 | 中, 可逐项落地 | 低 (API 与输出不变) | **主力** |
| B. 双层模型 | 1:1 参考模型(验收录入) + SOA 快模型, 中间转换层 | 最高 (V8/JSC 友好 + cache 局部性) | 高 (双维护 + 不一致 + 转换成本) | 仅 P3 热内核做实验性 fast path |
| C. 门控 fast mode | 内部 flag 切换快/慢实现 | 渐进安全 | 中 (两套逻辑都要验) | 可选, B 的落地形态 |

结论: 默认走 A; 若 P3 优化后仍不够, 再评估 B/C。

### 1. 实测基线 (2026-08-12, bun 跑 --phase)

| 规模 | 图 | 节点 | 总耗时 | 第一大热点 |
|---|---|---|---|---|
| small | wireless_personalareanetwork_PersonalAreaNetwork2 | 46 | 19.35 ms | LayerSweepCrossingMinimizer 33.4% |
| medium | dt_pickstates_pickstates | 195 | 34.35 ms | LayerSweepCrossingMinimizer 30.0% |
| large | de_trilateration_Trilateration | 488 | 109.28 ms | LayerSweepCrossingMinimizer 57.2% |

稳定规律: **P3 sweep 30-57%**、LabelAndNodeSizeProcessor 8-15%、BKNodePlacer 7-12%、
OrthogonalEdgeRouter 5-7%、NetworkSimplexLayerer 3-6%。large 下 P3 占比近 60% → 首选目标。

### 2. 代码审计: Java-ism 清单 (按影响排序)

| # | 模式 | 位置 | 影响 |
|---|---|---|---|
| 1 | getProperty(Prop|string) 双态 key + Map 查 | graph/properties.ts | 热路径每节点每端口多次 Map.get |
| 2 | getPorts(side) / getPortSideView .filter() 每次重建 | lnode.ts | P3 每 sweep 每节点重复过滤 |
| 3 | indexOf+splice 移除元素 O(n) | lnode.setLayer / lport.setNode / ledge.setSource/setTarget | 边/端口重挂频繁时平方级 |
| 4 | getIndex() = indexOf O(n) | layer.ts / lport.ts | CPU profile 顶层热点 (3.6%) |
| 5 | 免分配失败: getActualSize/getAbsoluteAnchor 新对象; getAllNodes/toNodeArray/getConnectedEdges 每次 spread/map | lgraph/lport | GC 压力 + 高频分配 |
| 6 | BinaryIndexedTree.clear() 重新 new 两数组 | p3order/counting.ts | sweep 循环内分配 |
| 7 | inNorthSouthEastWestOrder [...].reverse() 分配 | p3order/counting.ts | 每端口每 sweep |
| 8 | number[] 而非类型化数组 | networksimplex (poID/lowestPoID/cutvalue), counting, BK | V8/JSC 装箱开销 |
| 9 | process.env.GGN_* 运行时判断 | 全库 (dist 中 133 处) | 体积 + 分支 |

### 3. 量化体系补强 (bun + vitest 分工)

- **双运行时**: bun 跑 JSC (开发迭代, bunx vitest bench = JSC);
  node_modules/.bin/vitest bench 跑 V8 (web 目标代理)。两者都要, 只调 bun 会调错方向。
- **三级定位循环**: vitest bench (端到端/每算法) → perf-run --phase (模块) → bun --cpu-prof --cpu-prof-md --cpu (函数)。
- **每算法独立 bench 单元**: 合成图 + realworld 图集 (ptolemy); 补齐对抗图:
  稠密二分图 (crossing counter 最坏)、长链、高扇出 hub、深层 compound 嵌套 — 暴露超线性。
- **复杂度回归**: 同一生成器按 n / 2n / 4n 测缩放指数, 捕捉 O(n²)/O(n³) 热点。
- **内存指标**: --expose-gc 前后 heap delta / 每 layout 分配字节, 量化 GC 压力。
- **CI 门禁**: scripts/check-bench-regression.mjs 尚不存在 → 补上 (10% 阈值, 挂 elk-layout package.json
  bench / bench:baseline / bench:ci); 移植验收完成后重采 baseline (当前值是移植中途值)。

### 4. 优化优先级 (每项: 门禁 = 全量差分 0 回归 + bench 对比 + 记录)

1. **P3 LayerSweepCrossingMinimizer** (低-中风险, 收益最大): side-port 视图缓存 (dirty flag,
   每 sweep 只建一次); BinaryIndexedTree 复用池 / clear 改填 0; counting 的 portPositions/ends/
   nodeCardinalities 用 Int32Array; inNorthSouthEastWestOrder 免分配; sweep 迭代与 thoroughness
   对齐但去掉重复全量计数。
2. **LabelAndNodeSizeProcessor** (低风险): 热属性 (PORT_BORDER_OFFSET / PORT_CONSTRAINTS /
   SPACING_*) 直读字段化, 绕过 MapPropertyHolder; 避免每 label 重复 string key 查找。
3. **P4 BKNodePlacer** (中风险): BKAlignedLayout 8 数组 → Float64Array/Int32Array + 方向循环复用;
   markedEdges Set → 数组/位标记。
4. **P5 OrthogonalEdgeRouter** (中风险): 路由网格分配复用; 通道/障碍查询缓存。
5. **P2 NetworkSimplexLayerer** (中风险, 输出敏感): poID/lowestPoID/cutvalue →
   Int32Array; 子树优化栈复用; ChangeAwareArrayList dirty flag 语义保持。
6. **横切图模型层** (低风险, 全局受益): getIndex 缓存 (层/端口挂接时维护); swap-remove
   替代 splice (顺序无关场景); getPorts(side) 缓存; getActualSize/getAllNodes 等去分配;
   getProperty 高频路径短路。

### 5. Bundle size 专项 (实测: dist/index.mjs 1.5MB 未压缩)

- bun build src/index.ts --target=browser --minify → **751KB raw / 194KB gzip** (已实测)。
- 入口拆分: src/index.ts 同时 re-export public + internal; layoutElkJson 静态 import 全部算法
  (force/rectpacking/topdownpacking/spore/radial/vertiflex/disco/mrtree) → 非 layered 算法全进包。
  - 新增 @ggn/elk-layout/layered (仅 layered 管线, 同步) 供 GGN 消费; 其余算法保留在完整入口。
  - define: { process.env.GGN_*: undefined } + DCE 干掉 133 处 debug 分支 (仅生产构建)。
- 体积预算: 按模块 metafile 基线 (intermediate 308KB / src 129KB / p3order 121KB / p4nodes 104KB /
  rectpacking 88KB / components 83KB / api 81KB / p2layers 78KB / compaction.oned 68KB / radial 68KB /
  spore 64KB / p5edges.splines 54KB / vertiflex 50KB) 设定 layered-only 入口目标 (如 ≤ 350KB raw)。

### 6. 风险与边界

- **输出全等是硬门禁**: 全量 1807 差分 / 342-348 对齐 / 696 门禁必须 0 回归; 浮点运算顺序改动
  会破坐标全等 → 优化时保持同一运算顺序, 或对纯性能类改动先跑 oracle 再合。
- **与移植 agent 并行**: 只新增/只改性能相关文件; 不碰 PROGRESS.md / package.json; 全量测试错峰。
- **bun ≠ web**: 所有优化最终在 Node (V8) 复验; 类型化数组两运行时都受益, 优先。


---

## 决策更新 (2026-08-12, 用户三项指示 — 修订上面的「阶段 1 细化」)

### 修订 0: 解除「1:1 移植」约束 → 自由优化

- 移植已完成。后续与上游同步 = 参考 Java 源码重写相关部分 + 测试保证正确性（不再要求类/方法名一一对应）。
- 原「路线 A 表面不动换内部」作废：允许数据结构重构（属性直读字段 / typed array / SOA 试点）、
  算法内部重排、删除 Java 冗余抽象。
- 保留最低成本索引：文件头 `// 对应 ELK <class>` 注释，便于对照上游，不强制结构一致。
- 正确性完全交给测试层（见修订 3）。

### 新增: Tree-shaking 可行性评估（已实测，结论: 可行，需注册表改造）

**现状（实测）**: `src/api/elk-json.ts` 静态 import 全部 8 个非 layered 算法（force/rectpacking/
topdownpacking/spore/radial/vertiflex/disco/mrtree），`runCoreProviders` 是硬编码 `switch`。
dist/index.mjs（1.5MB 未压缩）grep 确认全部算法符号都在。
**算法税量级（meta.json 实测）**: 非 layered 算法家族源字节 606,472 / 2,199,478 = **27.6%**；
minify 后估算 ~200KB raw / ~50-60KB gzip。GGN 只用 layered，这就是纯浪费。

**原型验证（/tmp/ggn-ts-proto, bun build --minify）**:
- 注册表 `Map<id, fn>` + 算法模块 side-effect 自注册（`import { register } ... register("mrtree", fn)`）
- 核心入口只依赖 layered：**204B，mrtree/disco marker 0 处 → 未 import 的算法模块被完全 tree-shake**
- 完整入口显式 import 全部算法：319B，全部 marker 保留

**落地设计（保持同步 API，行为向后兼容）**:
1. 新增 `src/api/registry.ts`: `Map<algId, fn>` + `register()`；`runCoreProviders` 的 switch → `providers.get(alg)`
2. `elk-json.ts` 只默认注册 layered（开箱即用）；其余算法各自 `register/*.ts` 子入口
3. 包级子路径: `@ggn/elk-layout/layered`（GGN 主用）、`@ggn/elk-layout/rectpacking`、...；
   完整入口 `@ggn/elk-layout` 显式 import 全部注册 → 行为不变
4. 未注册算法的报错信息区分「未 import 子入口」vs「未移植」两种原因
5. `api/index.ts` 现在把 `layoutElkJson/buildGraph/extractGraph` 都从 elk-json.ts re-export → 连带全部算法；
   改造后 internal 入口与 public 入口分离，消费方不会因 import buildGraph 而付算法税

**待验证**: vite/rolldown（GGN 实际打包器）consumer 冒烟测试——模块图 tree-shaking 语义一致
（未被引用的模块不进包、side-effect import 保留），需在 e2e 挂一个「只 import layered 的构建」确认。

### 修订 3: 浮点全等测试方案（优先级最高）

**问题**: 优化改动浮点运算顺序 → 坐标末位差异 → 现有全等 oracle 大量失败，无法区分「回归」与「可接受的舍入差异」。

**核心洞察**: 绝大多数性能优化（免分配 / 缓存 / typed array / 属性直读 / 复用池）**不改变浮点运算顺序**，
输出应保持 bit-exact。只有真正改变计算顺序的优化（补偿求和、算法重排）才会产生舍入差异。
因此策略不是「优化就放松」，而是「能全等的必须全等；不能全等的显式授权 + 量化舍入差异」。

**三层测试策略**:
1. **离散结构断言（必须 bit-exact）**: 拓扑/层分配/节点顺序/端口顺序/边路径结构（bend 数、分段数、LCA 归属）。
   离散语义由算法逻辑决定、浮点不参与 → 优化中结构不能变。现有 stage-diff / oracle 结构断言继续跑。
2. **数值坐标断言（容差 + drift budget）**: 坐标比较 `|fast - ref| <= 1e-9 + 1e-6 * max(1, |ref|)`；
   另设 drift budget（如 `1e-4 * 图直径`）防「单点都在容差内但整体误差累积」。
3. **性质/不变量断言（语言无关）**: 无重叠、边端点连接、层约束、交叉数不增、边不穿节点、compound 包含。
   优化验收必跑（AGENTS.md 既有文化，扩展到性能改动）。

**参考实现来源（零维护成本）**:
- 优化前打 tag（`perf-baseline-2026-08-12`）构建参考 bundle 存 `bench-results/reference/`；
  或把参考输出固化为 JSON 快照进 `test-resources/reference-snapshots/`（与 jar-oracle 同模式，CI 友好）。
- 新增 `scripts/verify-float-regression.mjs`: 同图集跑 reference vs 当前 → 输出
  结构全等 pass/fail + 坐标容差 pass/fail + drift 报告（max / L∞ / L2 / 超标 top），挂 verify 链。

**浮点稳定性规则**:
- 禁止改动求和/归约顺序（`sum +=` 线性扫描保持原序）；确需改 → Kahan/Neumaier 补偿求和。
- 排序必须稳定且比较器结果不变（V8 Array.sort 稳定）。
- 新增数值稳定性测试: 输入坐标/随机种子微小扰动 → 输出连续（小扰动小变化），捕捉顺序改变导致的放大。
- 优化验收流程: bench 提升 + 三层测试全过 + drift 报告记录 → 合并；会引入舍入差异的改动需在 PR 里显式声明 trade-off。

### 优先级更新（自由优化后）

把「横切图模型层」和「属性系统直读」提为前置项——它们是其他优化的地基，且可保持 bit-exact：
0. 属性系统: MapPropertyHolder 热路径 → LGraph/LNode/LPort 直读字段（保留 getProperty 兼容层）
0. 图模型访问: getIndex 缓存 / getPorts(side) 缓存 / 免分配视图 / swap-remove
1. P3 LayerSweepCrossingMinimizer（30-57%，收益最大）
2. LabelAndNodeSizeProcessor（8-15%）
3. P4 BKNodePlacer（7-12%: 数组复用 + typed array）
4. P5 OrthogonalEdgeRouter（5-7%）
5. P2 NetworkSimplexLayerer（3-6%，输出敏感，先跑三层测试）
6. Bundle: 注册表改造 + layered-only 入口 + minify + define 掉 GGN_* debug（独立于性能项，可并行）

### 门禁（每个优化项）
- bench: 该算法单元提升 ≥ 阈值（首项建议 ≥20% 才值得做，避免微优化）
- 测试: 三层测试全过；bit-exact 型优化跑现有全等 oracle（1807 / 342-348 / 696）0 回归
- 记录: 每项在 PROGRESS 式工单记录（模块 / 改动 / bench 前后 / drift 报告 / 陷阱）
- 并行: 不碰 PROGRESS.md / package.json；全量测试错峰


---

## 审阅整合 (2026-08-12, 对抗审阅结论 — 修订「决策更新」章节)

> 由独立审阅 agent 对抗审查 + 关键事实人工复核。审阅结论: 方案方向对，但「bit-exact 默认」
  建立在一个未经验证且大概率不成立的假设上，且与现有 oracle（容差制）脱节。以下整合。

### 核验过的事实（审阅 + 人工复核）

1. **现有 oracle 全部是容差制，不是 bit-exact**:
   - `elkt2test.mjs:27` `TOLERANCE = ELK_TOLERANCE ?? 2`，generated 测试 `bestX/bestY <= 2`（ε=2px，variants 任一匹配即过）
   - `verify-elkg-java-layout.ts` EPS=1e-3 逐字段绝对容差（342/348 门禁）
   - `stage-diff.mjs` 快照 round 1e-3 + diff eps=2；`edge-e2e-lib.mjs` EPS=2
2. **ELK Java 自身跨 harness 输出不稳定**（generate-jar-oracle 注释实证 y=23.33 vs y=12 差 11.33）
   →「与 jar bit 全等」这个参考系本身不存在。
3. **「GGN 只用 layered」是未来假设，非当前事实**: ggn-vanilla 现在用 elkjs(npm)，elk-registry.ts
   注册 layered/tree/mrtree/box/force/radial 六种算法。
4. **package.json exports 只有 4 个入口**（`.`/`./api`/`./core`/`./options`）→ 加算法子路径必须改 exports，
   与旧「不碰 package.json」冲突规避规则冲突（该规则随移植完成应废弃/更新）。
5. **1807 差分不直接断言离散结构**（只查坐标 ε=2 + 无重叠 + 有限性）→ 层序/端口序/边分段结构
   目前零 CI 门禁，需要新建而非「继续跑」。

### 修订 A: 浮点测试方案重做（替换「修订 3」）

**第 0 步（最高优先级，先做）: bit-exact 可行性实验**
- 新增 `scripts/verify-bit-exact.mjs`: 当前 ggn vs jar，`===` 逐坐标比较，输出 bit-exact 率（按图类分组）。
- 分流: 某类图 bit-exact 率 > 99% → 对该类建 `===` 门禁（这才是真正防求和顺序引起的舍入差异的门禁）；
  普遍非 bit-exact（大概率）→ 放弃「bit-exact 默认」，以「相对容差 + 不变量」为主，bit-exact 只记录不设门禁。
- 在此之前，任何「能全等的必须全等」都是空话——地基实验优先于一切优化。

**职责分离（单一职责，避免两套坐标门槛打架）**:
- 1807 / 342-348 / 696: 功能门禁，保持现状容差（ε=2 / 1e-3）不动。
- **新建结构断言 CI 门禁**（这才是真正该 bit-exact 的层）: 层分配/层内节点序/端口序/边 bend 数与分段数/LCA 归属。
  实现成本低——复用 stage-diff 的快照规范化逻辑，断言改为「结构键 === 相等」。
- `verify-float-regression.mjs`: 定位 = 自回归误差**报告** + 不变量门禁；bit-exact 失败**不自动阻断**
  （基线不 bit-exact），由人工审 + 不变量门禁把关。

**容差公式（废弃拍脑袋常数）**:
- 坐标量级 < 1e3 → `===` 或 1e-9 绝对（等价性强）；量级大 → 相对 **ULP 倍数**（如 ≤ 64 ULP，直接算 ULP(x)），不用 1e-6。
- 删除「直径比例」drift budget（定义循环依赖 + 与 eps=2 冲突）；改「绝对预算（对齐 eps=2，如 ≤1px）
  + ULP 相对预算」双上限，输出不一致**分位数**（P99/P99.9），不用单 max。

**reference 语义与重建节奏**:
- 金标准 = 移植验收通过的版本；只有重大重写才重建并记录，普通优化不动 reference。
- 跨优化共享「累计误差账本」：每项合并把误差叠加，超预算（如 1px 或 P99 超限）→ 重建 reference + 人工审。
- bug 修复走「豁免 + 重建 reference」流程（否则修复 bug 会被舍入差异门禁误拦）。
- snapshot 用模型内容 hash 键控 + index.json + 过期检测（复用 jar-oracle 模式），选 JSON 快照路线，放弃 bundle 路线。

**浮点稳定性规则补充（防「看似无害优化」破坏）**:
- 优化先预分类: 「改变遍历/元素顺序」（swap-remove、排序、归约重排）→ 直接进非 bit-exact 通道；
  P3 barycenter 按端口序累加、P4 BK 方向传播都是顺序相关归约，swap-remove 在 P3/P4 里是隐藏破坏源。
- 共享缓存禁止返回可变对象（ELK 惯例 `getPosition().x = ...` 原地改 → 别名污染 = 正确性 bug）；
  结构变更必须唯一入口走 setter + 随机操作序列缓存一致性 fuzz。
- 禁用 `Math.round`（JS -0.5 → -0 vs Java floor(x+0.5)）；`-0` 符号/零比较用 `Object.is`；
  新增「-0 与 NaN 传播」专项测试（JSON.stringify 吞 -0 符号）。
- 连续性测试只扰动输入坐标/尺寸，**不扰动随机种子**（启发式种子跳变是正常，会假阳性）；
  断言「层序不变 + 坐标位移上界随扰动 → 0」。

### 修订 B: Tree-shaking 落地前置条件

- **先核 GGN 实际算法矩阵**（elk-registry.ts 已注册 6 种），双轨: 完整入口保留全部注册 + layered 子路径；
  不能假设「只 layered」。
- **vite/rolldown 冒烟 = 前置阻塞项**（不是待验证）: side-effect import 的 tree-shaking 语义 bundler 相关
  （vite 对 moduleSideEffects 默认保守）→ 先建「只 import layered 的 vite consumer 构建」，确认 mrtree marker 不在产物，再动注册表。
- Set 判定与 registry 查找**同源**（registry 持有 core-provider 标志，8 个 ALG_IDS Set 删除或派生），
  避免未注册算法被 filter 静默跳过（比报错更危险）。
- 报错语义: 「未 import 子入口」vs「未移植」区分；未注册时显式抛错，不静默 fallback；先查测试是否断言 LayoutError 消息。
- 冲突规避规则更新: 移植已完成，「不碰 package.json」规则作废/修订为「改 exports 需同步验证子入口构建」。

### 修订 C: 优先级与门禁调整

- 新增第 0 步: bit-exact 可行性实验（见修订 A，优先于一切）。
- bench 门禁阈值: 先测同图 10× 重复采样 CV，阈值 = `max(20%, 3×CV)`，防方差误杀。
- 属性直读字段化: 先做**只读探测**（统计各属性 get/set 次数确认热属性集），再加「属性读写一致性 fuzz」
  （随机 set/get/copy 序列，字段化实现 vs Map 实现结果全等），保留 getAllProperties/copyProperties/hasProperty 语义。
- P3 `getPorts(side)` 缓存: 先确认 sweep 期间端口是否重挂（读 p3order/counting.ts）——不重挂则一次性构建
  比 dirty flag 更简单安全。
- 每项优化 drift 报告归档 P99 分位 + reference 重建节奏写入规则。

### 修订后的执行顺序（整合版）

0. **bit-exact 可行性实验**（verify-bit-exact.mjs，当前 vs jar）→ 定「默认」
0. 结构断言 CI 门禁（层/序/端口/边结构，bit-exact，复用 stage-diff 规范化）
0. verify-float-regression 工具（误差报告 + 不变量门禁 + ULP/分位容差 + hash 键控 reference 快照）
0. vite consumer 冒烟（Tree-shaking 前置阻塞项）+ GGN 算法矩阵核验
1. 属性系统: 热属性探测 → 直读字段化（一致性 fuzz 护航）
2. 图模型访问: getIndex / getPorts(side) 缓存（先验端口稳定性）/ 免分配 / swap-remove（仅顺序无关场景）
3. P3 LayerSweepCrossingMinimizer
4. LabelAndNodeSizeProcessor
5. P4 BKNodePlacer
6. P5 OrthogonalEdgeRouter
7. P2 NetworkSimplexLayerer
8. Bundle: 注册表改造 + 子路径入口 + minify + define 掉 GGN_*（前置条件见修订 B）


---

## 第 0 步实验结果 (2026-08-12, verify-bit-exact.mjs)

> 工具: `packages/elk-layout/scripts/verify-bit-exact.mjs` (与 342/348 门禁同 harness: 同一份 ELK JSON
  -> jar LayoutJsonMain vs ggn layoutElkJson; 全精度坐标, 逐坐标 ===, 含无 rectpacking jar 单 JVM 豁免)。

### 结果: 全量 {examples,tests,tickets} 368 个 layered 模型, 9.2s

| 类别 | 数量 | 说明 |
|---|---|---|
| **完全 bit-exact** | **337 (91.6%)** | 全坐标 ===，0 零一致模型 |
| 报错复刻 | 5 | 与 jar 同异常类 |
| 部分一致 | 25 | 见下方分类 |
| 结构差异 | 1 | 900_topdownpacking_basic（非 layered 滑入） |

按图类全等率: examples 38/45 (84.4%) | tests 181/193 (93.8%) | tickets 118/130 (90.8%)
（各含非 layered 滑入模型, 纯 layered 实际更高）

### 部分一致 26 个的三类归因（全部可解释，无未知）

1. **非 layered 滑入 (5 个, abs 1e2-2.6e2, 与 layered 无关)**: interactiveLayout_mixedHierarchy /
   interactiveRectpacking_{hierarchy,oneBigNode} / 900_topdownpacking_basic / 910_spore_overlap_basic。
   根因: elkt 里算法写在非 layoutOptions["org.eclipse.elk.algorithm"] 的位置, isLayered 没识别
   （与 342/348 门禁同一 isLayered, 该门禁同样放行它们）。→ 从 layered 门禁排除。
2. **few-ULP 末位噪声 (15 个, maxUlp ≤ 8, abs ≤ 1.2e-13)**: self_loops{fixedSide,free,hyperLoops,south} /
   288_a / 288_b / 302 / labels1 / compound03 / hierarchy01 / external_ports / headLabels_multiPorts /
   tailLabels_multiPorts / sloppy_overlaps_3 / 930_radial_basic。典型 last-bit 舍入 / Math lib 差异。
3. **已知 ~1e-6 系统性偏差 (6 个, abs 2e-6-9.6e-6)**: hierarchicalLayoutMixing / 912_spore_overlap_multi /
   931_radial_child / 932_radial_multi / 453_interactiveProblems / 665_includeChildrenDoesntStop。
   正是 342/348 门禁的「预存差异」家族, eps=1e-3 下已放行。

### 结论（数据分流, 替代审阅的悲观先验）

- 审阅假设「当前与 jar bit 全等大概率不成立」**被实验反驳**: 纯 layered 模型 bit-exact 率 =
  **337/363 = 92.8%**, 加上 few-ULP 模型「实际全等」= 352/363 = **97%**, 且 0 个零一致、0 个结构差异。
- **「=== 默认」可行且应设为门禁**, 但按「默认全等 + 显式豁免」落地, 而不是一刀切容差:
  1. 默认: 全部 layered 模型坐标 ===  (337/363 已满足);
  2. 豁免 A (few-ULP 15 个): 断言 |diff| ≤ 8 ULP 且 ≤ 1e-12, 防 last-bit 噪声误报;
  3. 豁免 B (已知 ~1e-6 6 个): 断言 |diff| ≤ 1e-5 (实测上限 9.6e-6), 单独跟踪, 优化不得把它们改得更差;
  4. 非 layered 5 个: 排除, 由 342/348/1807 在 eps 下把关。
- 该门禁是「防求和顺序引起的舍入差异」的**真拦截器**: 任何优化改变浮点运算顺序, 都会把 337 个 bit-exact 模型
  翻成 non-exact → CI 失败; few-ULP/1e-6 豁免只吸收已知噪声, 不会放跑新的舍入差异。
- **待办**: ① 修复 isLayered 对非 layoutOptions 算法的识别 (与 342/348 门禁同步改, 消掉 5 个滑入);
  ② verify-bit-exact.mjs 纳入 verify 链 (可先挂 verify:bit-exact script, 全量 9.2s);
  ③ 豁免 B 的 6 个模型在 triage/预存清单里登记, 防止未来优化「顺手改好」后清单过期。

