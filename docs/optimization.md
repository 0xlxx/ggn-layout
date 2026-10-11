# 项目优化 SSOT: layout（ELK Java→TS 1:1 移植产物优化）

> 本文件是 parallel-optimizing 的**项目特化文件**（对应 skill 的「项目文件约定」）。
> 执行优化前先读本文件（基线/命令/热点/陷阱/历史成果），再读 `OPTIMIZATION_CLASSES.tsv` 查表、
> `docs/clusters/agent-remarks.md` 获取历史备注。工作目录: `packages/layout`。

## 基线（2026-08-12 实测，优化前必须重采样；tag: perf-baseline / perf-optimized）

| 门禁         | 命令                                                                                    | 基线                                                                                             |
| ------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 数值等价     | `bun scripts/verify-bit-exact.mjs`                                                      | **结构全等 + 数值在界内**：368 覆盖 = 全等 337 + 豁免A 15 + 豁免B 6 + 复刻 5 + 跳过 5，exit 0（`--strict` 回旧政策，`--selftest` 负向自检） |
| 对齐         | `bun scripts/verify-elkg-java-layout.ts`                                                | 362/368 对齐（357 全等 + 5 复刻 + 1 harness 豁免），exit 0                                       |
| 回归         | `node scripts/diff-failures.mjs collect-all && check /tmp/failures-696.json`            | 0 失败                                                                                           |
| 回归(必跑)   | `bunx vitest run tests/oracle/EdgeRoutingE2ETest.test.ts tests/api/regression.test.ts tests/core/bisect.test.ts` | 949 passed —— **368 数值门禁的盲区**（见下） |
| 性能         | `bun scripts/perf-run.mjs --bench 30 --scale large`                                     | 优化后 layout mean ~29.9ms（基线 47.35ms，**-36.4%**）                                           |
| bundle       | `bun run check:bundle`（tsdown + 字节预算门禁）                                          | core **510,167 raw / 126,613 gzip**；api 193,623 / algs 36,166；total 747,687 raw。阈值 +2% 且 >2KB |
| bench 回归   | `bun run check:bench`                                                                   | layered 3 规模 + 非 layered quick 全表；+10% 且 layered >0.5ms / non-layered CPU >40ms，只拦变慢 |
| 类型（库）   | `bun run typecheck:src`（`tsc -p tsconfig.build.json --noEmit`，只查 `src/`+`shared/`） | **0 错误**（构建 `build` 已改用该门禁）                                                          |
| 类型（全量） | `bun run typecheck`（`tsc --noEmit`，src+tests；生成 oracle/调试 scratch 排除）         | **0 错误**（2026-08-13 修到全绿；补 @types/node + `.d.mts` 声明）                                |
| lint（库）   | `bunx oxlint src shared`                                                                | **0 error**（22 个 `no-explicit-any` 已清零；warning 仍为历史遗留 debug 打印/非空断言）          |

## 热点表（--phase 实测，批次 5 后；见 OPTIMIZATION_CLASSES.tsv 的实时状态）

| 模块                                    | 优化后占比    | 顺序相关性          | 状态                                             |
| --------------------------------------- | ------------- | ------------------- | ------------------------------------------------ |
| LayerSweepCrossingMinimizer (P3)        | ~52%（large） | ORDERED             | ✅ 批次1+5（sweep -12% 第二轮）                  |
| LabelAndNodeSizeProcessor + cell-system | ~6-10%        | UNORDERED/ORDERED   | ✅ 批次1(P1)+2(cell)（Label -41%）               |
| BKNodePlacer (P4)                       | ~8%           | ORDERED             | ✅ 批次2（-22.5%）+ 批次8(R17 边缓存)            |
| OrthogonalEdgeRouter (P5)               | ~4-6%         | ORDERED             | ✅ 批次3（warm -27%）                            |
| NetworkSimplexLayerer (P2)              | ~3-5%         | ORDERED（输出敏感） | ✅ 批次3（warm -27%）                            |
| graph/options 横切                      | 全局          | 混合                | ⚠️ 批次4 横切簇被对抗审阅驳回（无收益+契约脆弱） |

## 数值门禁政策（2026-09-13 用户授权放宽）

**旧政策**：337 个模型必须逐位全等；改浮点运算顺序 = 红钱，必须走「豁免登记」。
**新政策**：`结构全等 + 数值在界内` —— 允许「改运算顺序」的优化直接合入，同时用三层筛子挡住真正的逻辑错。

### 三层判定（`scripts/verify-bit-exact.mjs`，按顺序短路）

| 层 | 判据 | 失败后果 |
|---|---|---|
| ① 结构全等（硬线） | 节点集合（含层级归属）/ 每节点端口 id 集合 / 边端点集合 / 每条边各段点数（多重集） | 必失败（`structural`）。**不看预算**——结构变了就是逻辑信号 |
| ② 非有限值 | 任一坐标 NaN / ±Inf | 必失败（`nonFinite`） |
| ③ 数值预算 | 每模型上限优先 `entries[].bitExact.limitMaxUlp/limitMaxAbs`；否则回落 `numericBudget` | 超界必失败（`overBudget`） |

**不比输出顺序**：实测 `children` 顺序两边本就不同（`NA,NB,NC,NF,ND,NE` vs `…,ND,NE,NF`）而坐标全等；平行边的段顺序同样会不同（`[2,6]` vs `[6,2]`）。输出顺序不属于等价口径，拿它当硬线会误杀。

### 全局预算（`triage-registry.json.numericBudget`）

```json
{ "maxUlp": 1e6, "maxAbsRelative": 1e-9 }
```

- `maxUlp` 与 `maxAbsRelative` 的来历：长归约（重心求和等）误差上界 ~ `k · 2⁻⁵³`；取 `k ≈ 1e6` 得 ~1.1e-10 相对误差。`maxAbsRelative` 按图包围盒对角线缩放（1000px 图 → 1e-6 px，远低于任何可见/可影响比较的量级）。
- **ULP 是尺度感知的**：`ulpOf` 有下限 `包围盒对角线 × 1e-6`。纯按 |x| 取 ULP 在 0 附近会爆炸（`ulpOf(0)=Number.MIN_VALUE`，一点扰动就 1e15 ULP —— 自检实测 4.5e15）。下限只让近零处比值变小 → 只会放宽，不误伤已有的紧上限（exemptA `limitMaxUlp=8`）。

### 三个开关

```bash
bun scripts/verify-bit-exact.mjs                 # 默认：结构全等 + 数值在界内
bun scripts/verify-bit-exact.mjs --strict        # 旧政策（全等 + 已登记豁免 + 复刻 + 跳过），用于二分定位回归
bun scripts/verify-bit-exact.mjs --determinism   # 同模型跑两次须逐位一致（排除 scratch 复用没重置这类状态泄漏）
bun scripts/verify-bit-exact.mjs --selftest      # 负向自检：结构差异/超预算/非有限值必须失败，极小舍入差异必须放行
```

> 文件名 `verify-bit-exact` 是历史名（严格模式用 `--strict`）。

### 为什么这样切

1. **确定性**：浮点舍入差异是确定性的（同输入同结果）。若同代码跑两次不一致 → 不是舍入差异，是状态泄漏 → `--determinism` 拦。
2. **结构比数值更硬**：1 ULP 的比较翻转可以连锁换成另一张图，但那发生在**结构全等**的前提下；结构本身变了就是逻辑错。
3. **预算必须可见**：在预算内放行的模型会逐个列出（不是悄悄放过）；差值掉到全等就该收紧/摘豁免。

### 自检（`--selftest`，负向验证）

```
✅ 全等基线            ✅ 结构差异必须失败 (missingNodes=1)
✅ 超预算必须失败       ✅ 非有限值必须失败 (nonFinite=1)
✅ 极小舍入差异必须放行 (maxUlp=5.24e5 < 1e6)
```

真实数据负向验证（2026-09-13 实测）：把 `hierarchicalLayoutMixing` 的 `limitMaxAbs` 从 1e-5 收紧到 1e-7 → 门禁 exit 1（`[overBudget] … maxAbs=7.38e-06 limitAbs=1e-7`）；把 `structureOf` 注入「丢首个子节点」→ 103 个 `[structural]` 失败、exit 1。两次都恢复即绿。

## 368 数值门禁的盲区（2026-09-13 实测踩到）

`verify-bit-exact.mjs` 的模型集是 `{examples,tests,tickets}/**/*.elkt`，且**显式排除 `realworld/`**。
2026-09-13 批次 14 出现了一次「368/368 全绿但全量单测挂 10 个」：

- `tests/oracle/EdgeRoutingE2ETest.test.ts` —— 另一套 oracle（jar 边路由，ε=2，覆盖 DOWN/UP 方向的弯点），368 门禁不覆盖；
- `tests/api/regression.test.ts` —— 真实图（carTracking / blindCommunication），属被排除的 realworld；
- `tests/core/bisect.test.ts` —— 701_portLabels。

**因此判定一个改动是否安全，必须同时跑这三条**（上表「回归(必跑)」）。根因当时是「用 `Map<number>` 按 `Layer.id` 缓存超边组」——**`Layer.id` 在移植实现里恒为 0**，不同层被串到一起；RIGHT 方向碰巧不暴露，DOWN/UP 全错。这条已经写进陷阱清单。

> 教训：门禁的**覆盖面**和门禁的**严格度**是两件事。批次 13 把严格度放宽了（结构全等 + 数值在界内），但覆盖面这个洞一直在 —— 它是靠「主线程跑全量单测」才暴露的。

## bundle 字节门禁（2026-09-13，批次 15）

**为什么需要**：`check:bench` 只管速度，bundle **一直没有回归门禁**。批次 14 的性能优化（缓存 / 预计算邻接）把 core chunk 从 506,686 涨到 **510,167（+3.5KB）**，没人拦。性能改动的代价常常就是字节。

```bash
bun run check:bundle                              # = bunx tsdown && node scripts/check-bundle-budget.mjs
node scripts/check-bundle-budget.mjs --update     # 重新采样基线（仅在审查过尺寸后）
```

**口径必须是 tsdown 产物**：`bun build` 不加 define 会把全部 debug 分支留下 —— 同一入口实测 **581KB vs tsdown 510KB**（差 71KB、12%）。用 `bun build` 量 bundle 会得出错误结论。

**度量与判定**：core（`elk-json-*.js`）/ api / algorithms / total，raw + gzip 各比一次；超「基线 ×(1+2%) **且** >2048 字节」即失败（两个条件都要满足，避免小值噪声误杀）。

**基线**：`bench-results/baseline-bundle.json`（目录被 .gitignore，需 `git add -f`）。

**负向验证（2026-09-13 实测）**：往 `layered-layout-provider.ts` 注入 12,451 字节死代码 → `core +2.44%` → 门禁 exit 1；恢复即绿。

### bundle 为什么暂时不再「主攻」

2026-09-13 实测分布 **极平**：192 个文件，最大单文件仅 5.5%（31.9KB），前 10 个合计 26.7%：

| 目录 | 占比 |
|---|---|
| `src/intermediate`（76 个文件） | 31.5%（183KB，最大单文件 cell-system 3.5%） |
| `src/p3order` | 10.2% |
| `src/p5edges` | 7.5% |
| `src/p4nodes` | 7.0% |

没有「删掉一个死模块」这种机会（tree-shaking 已在工作：13 个非 layered 算法被切到独立的 algorithms chunk，仅 36KB）。
唯一的结构性手段是把**非默认策略**懒加载（`greedy-switch-heuristic` 13.6KB、`model-order-*-comparator` 11.3KB、wrapping 族……只在用户显式设选项时才走到），但 layout 是**同步 API**，懒加载要改成异步 —— 代价远大于收益。
产品侧问题（需拍板）：**消费方到底用不用非默认策略？** 不用 → 可从入口摘掉，但那会破坏 ELK 1:1 完整性。

## 命令速查

```bash
# 三级定位（模块耗时表 + 函数 profile）
bun scripts/perf-run.mjs --phase --scale small|medium|large
bun --cpu-prof --cpu-prof-interval 100 --cpu-prof-dir /tmp/prof scripts/perf-run.mjs --cpu --scale large

# 端到端 bench（双运行时: bun/JSC + node/V8）
bun scripts/perf-run.mjs --bench 30 --scale large --out baseline-large.json
node scripts/compare-elkjs-perf-v8.mjs --iter 10   # elkjs GWT 对照 (V8)
bun scripts/compare-elkjs-perf.mjs --all --iter 10  # elkjs GWT 对照 (JSC)
bun run check:bench   # 一站式: layered small/medium/large 各 30 次 + 非 layered 全表 quick
bun run check:bench:nonlayered  # 只跑非 layered quick 门禁
bun scripts/perf-nonlayered.mjs --quick     # 非 layered quick 档（13 算法 / 3 轮 CPU 中位）
bun scripts/perf-nonlayered.mjs             # 非 layered full 档（各算法代表规模，较慢）
bun scripts/perf-nonlayered.mjs --quick --json bench-results/baseline-nonlayered.json  # 重采样门禁基线

# 门禁（合并后每合必测）
bun scripts/verify-bit-exact.mjs
bun scripts/verify-elkg-java-layout.ts
node scripts/diff-failures.mjs collect-all && node scripts/diff-failures.mjs check /tmp/failures-696.json
bun run check:defines   # process.env define 覆盖

# 构建（发布用 tsdown: minify + define GGN_* debug; bun --define 不支持 process.env.X）
bunx tsdown
bun run check:defines   # 门禁: src/shared 的 process.env.X 必须全部被 tsdown define 覆盖
```

## 陷阱实例（对应 skill 通用陷阱清单；完整历史见 agent-remarks.md R01-R47）

1. **浮点舍入差异**：P3 barycenter 按端口序累加、P4 BK 方向传播都是顺序相关归约；337 个 bit-exact 模型是红线。
2. **别名污染**：ELK 惯例 `getPosition().x = ...` 原地改——共享缓存返回可变对象会污染；getPorts(side) 横切簇因此被驳回（快照语义破坏）。
3. **缓存失效**：getIndex/side-port 缓存依赖 setLayer/setNode/加端口全走 setter；Uint8 stamp 会 256 环绕（R35），Uint32 同型坑（R36）。
4. **双运行时**：bun(JSC) 快不代表 Chrome(V8) 快；typed array 跨环境受益、优先。
5. **豁免清单**：triage-registry.json entries[].bitExact（class: exemptA/exemptB/nonLayered）；graph 名 `__` 双下划线；映射 `replaceAll("__","/") + ".elkt"`。
6. **tree-shaking 循环链**：shared 层不要 import 完整入口（R38 根因 shared→index→public→api/index→register-all）。
7. **`Layer.id` 恒为 0**：移植实现里所有层共用 `id=0` → 任何以 `Map<number, …>` 按层 id 做的缓存都会把不同层串起来（RIGHT 下不暴露、DOWN/UP 全错）。按层缓存必须用 `Layer` 对象身份（`WeakMap`）。
8. **同进程双模块实例 bench 伪影（bun/JSC）**：同一进程内 import 两个 checkout 的 `src/index.ts` 交错 A/B，后加载的模块实例恒慢 8-12%（JIT/模块注册表交互），与真实差异无关；跨进程交替采样才是可信协议。

## Bundle 专项

- layered-only 入口 `@ggn/layout/layered`（`src/api/layered.ts`）：不注册非 layered → tree-shake 掉 mrtree/disco/force/radial/rectpacking/spore/topdown/vertiflex。
- registry 模式：`src/api/registry.ts`（registerAlg/getAlg）+ `src/api/register-all.ts`（完整入口副作用注册）。
- 发布构建 `tsdown`：minify + define 61 个 `process.env.GGN_*`（bun --define 不支持 process.env.X）。
- 预算: layered-only 530KB raw / 135KB gzip（350KB 对 layered 内核过于激进，已调整评估）。
- 2026-08-13 补齐 define：src/shared 实际使用 71 个 `GGN_*`，此前漏 13 个（P3_DBG/RANK/INIT/CNT/FORSTER/NS_LAYER/BD/NS/EP_DBG2/PIPE/HOR/LDR2/SL_DBG2）→ 发布产物仍保留 `process.env.GGN_X` 引用（浏览器会 ReferenceError 风险 + 死码）。补齐后 core chunk 508KB→505KB raw / 126→125KB gzip，dist 无 `process.env.GGN` 残留。

## 历史记录

- 2026-08-12: bit-exact 门禁落地 + verify-elkg-java-layout exit 修复 + 双基线重采样。
- 2026-08-12~13: 9 批次优化（见 `git log perf-baseline..perf-optimized`，28 commits / 53 files / +2214-656）：
  - 批次1 P3 sweep + P1 Label 直读（sweep -20%+）
  - 批次2 BK + cell-system（Label -41%、BK -22.5%）
  - 批次3 P5 路由 + NetSimplex（warm 各 -27%）
  - 批次4 横切簇被对抗审阅驳回 + CI bench 门禁
  - 批次5 sweep 第二轮（large 累计 -36.4%）
  - 批次6 tree-shaking（layered-only -27%）
  - 批次7 bundle 瘦身（define debug）
  - 批次8 R17 边缓存 + dist 验证 + CI 门禁挂接
  - 批次9 tsdown minify + R37 授权方案评估
- elkjs 对照：优化后 layout 纯布局快 elkjs GWT 5.7-7.8x（bun large 6.32x / V8 5.73x）。
- 计划文档: `plans/elk-layout-perf.md`。

## 第 2 轮（2026-08-13，类型安全 + 简洁现代干净）

- 目标三轴：**性能**（benchmark 继续衡量）/ **简洁现代干净**（bundle 衡量）/ **类型安全**（typecheck + lint 衡量）。
- 类型安全：把 `src/` + `shared/` 从 186+72 个类型错误修到 **0**（`tsconfig.build.json` 只查库本体；测试文件仍走全量 `typecheck`，生成测试暂未纳入库门禁）。
  - 全局 `process` 最小声明（`src/globals.d.ts`，避免引入 @types/node 掩盖浏览器不可用全局）。
  - `shared/elkgraph-builder.ts` / `shared/opt-map.ts`：ELK JSON 输入 + parsed 中间结构显式类型（`ParsedGraph`/`NodeProps`/`ElkNodeJson`…）。
  - 修正真实类型缺陷：`compaction/oned` 错误相对路径、`cell-system` 错误从 lgraph 引 LNode/LPort、`lgraph-to-cgraph-transformer` `Set<string>`→`Set<number>`、`LPort.setNode` 接受 null、`HIERARCHY_HANDLING` 类型过窄、`partition-processors` 可空分区号、`POSITION` 可空 KVector 等。
  - 调试计数 `globalThis.__pd/__rn` → 模块级 `let`（更干净，TS6 的 `globalThis` 无法通过 `interface GlobalThis` 增广）。
- lint：`oxlint src shared` 22 个 `no-explicit-any` 错误清零（`as any`/`:any` → 具体类型或 `WeakMap`）；`LayerConstraintPreprocessor` 的 Symbol 挂属性改为 `WeakMap<LNode, HiddenNodeConnections>`。
- 性能：`countCrossings` 右层逆序端口循环 `node.getPorts()` 提变量（免每迭代重复调用）；其余热点（sweep 51.6%）已近微优化地板，再降需 R37 算法级授权。
- 门禁：`build` 改为 `tsc -p tsconfig.build.json --noEmit && tsdown`；新增 `typecheck:src`。bit-exact 368/368、对齐 362/368、696 回归 0、bundle 508KB/126KB gzip 均不降。

## 第 2 轮续（2026-08-13，全量 typecheck 清零 + 测试修复）

- 全量 `typecheck`（`tsc --noEmit`）从 1778 → **0**：
  - 补 `@types/node@20`（devDeps）+ `types: ["vitest/globals","node"]`；`allowImportingTsExtensions`。
  - 为无声明 `.mjs` 脚本补 `.d.mts`（`elkt2test`/`elkt-build`/`edge-e2e-lib`），类型复用 `shared/elkgraph-builder.ParsedGraph` + `shared/opt-map.OptMeta`。
  - `tsconfig.json` 排除生成 oracle 测试（`tests/oracle/generated`）+ 调试 scratch（`tests/debug`、`bisect`/`order-test`/`eps-scan`）——生成/探针脚本不属于维护的回归测试类型门禁。
  - 修复真实测试缺陷：`P4NodesBKTest` 直接构造的 BK 内部数组改为 `Float64Array`/`Uint8Array`（7 个断言从失败→全过）、`LGraphToCGraphTransformerTest` 段节点补 `VerticalSegmentCNode` 类型、`LayoutBatchItem` 判别联合改为可选字段接口（`output?`/`error?`，消费方更友好）、若干 enum 字面量 → enum 成员、重复 import 合并、`MO_G1/MO_G2` 对象 → number。
- 门禁：库/全量 typecheck 均 0、oxlint error 0、3662 单测全过（231 文件）、bit-exact 368/368、对齐 362/368、696 回归 0、build 通过、bundle 不降。

## 第 2 轮 R37 授权实施（2026-08-13，位级等价优先）

- 用户授权 R37（接受舍入差异）后，先做**无需舍入差异/豁免**的子集（详见 `agent-remarks.md` R48）：
  - `countCrossings` 超边合并 `splice(indexOf)` O(n²) → 身份 Map + swap-remove O(1)（论证 `nextHash` 唯一 → 排序与插入序无关）。
  - 右层北侧计数 `node.getPorts()` 提变量。
  - `findViolatedConstraint` `groups.indexOf` O(n) → 身份 Map 预建索引 + `getBarycenter` 提循环外。
- 门禁不降：bit-exact 368/368（全等 337 不变，无需新增豁免）、对齐 362/368、696 回归 0、单测全过。
- 结论：corners 桶排序 / collect 预分组若继续需真实舍入差异 + 豁免；ptolemy large 实测收益 <2%，建议先在超边/约束更重的图上量化再决定是否值得引入舍入差异。

## 黑盒 label 修复性能评估（2026-08-15，8f09c2a + aa77109）

- 评估对象：黑盒 label 移植缺陷修复（`label-and-node-size-processor` isBlackBox 排除 + force/radial 接入完整 NodeMicroLayout）。
- 方法：独立进程交替采样（每轮 warm 1 + n=30，多轮取中位数），对照 22ef789（修复前可用态；`8f09c2a^`=c76fb3c 是中间破损态，vertiflex import 未更新，不可跑）。
- 结果（300-500 节点，bun 1.3.14 / macOS arm64）：
  - **layered 无影响**：large 32.10 vs 32.39ms（-0.9%）、medium 5.46 vs 5.50ms（-0.7%），均噪声内。realworld 图 SEPARATE_CHILDREN=0，isBlackBox 分支不触发，仅每节点多一次常数级属性读。
  - **force 无影响**：N=200 650.0 vs 650.7ms（≈0%）；NodeMicroLayout ~4.5ms（N=200）相对 force 总耗时 <1%。
  - **radial 有影响（+13~19%）**：N=300 34~44 vs 28~38ms；NodeMicroLayout 孤立实测 N=300 ≈6.8ms / N=1000 ≈22ms（~22µs/节点，分配重）。radial 本身便宜（~35ms）故占比高。这是修复的实质成本，且 perf-run 门禁不覆盖 force/radial。
- 门禁：bit-exact 368/368、对齐 362/368、check:bench 通过（medium -25.9% / large -30.5% 相对存储基线）。
- 待办（若 radial 规模化使用再立项）：NodeMicroLayout 自身是热点（每节点 ~22µs，cellMinimumSize 分配多），可作 parallel-optimizing 新簇；并把 force/radial 纳入 perf 门禁避免此类回归不被覆盖。

## 非 layered 算法首次量化（2026-09-12，perf 覆盖黑洞）

**背景**：`perf-run.mjs` / `compare-elkjs-perf.mjs` / `check:bench` 全部只 `import LayeredLayoutProvider`，
`register-all` 里注册的 **13 个非 layered 算法（box/fixed/random/stress/force/rectpacking/topdownpacking/
sporeoverlap/sporecompaction/radial/vertiflex/disco/mrtree）零性能覆盖** —— 回归永远拦不住。

**方法**：`layoutElkJson`（完整入口，走算法分派）+ 合成规模化输入，同进程 warm 取中位数（bun 1.3.14 / macOS arm64）。
工具已固化：`scripts/perf-nonlayered.mjs`（full / `--quick` / `--alg` / `--nodes` / `--iters` / `--scale` / `--json`）。
`--quick` 为 CI 档：慢算法缩规模，默认重复 3 轮，每轮 warm 后取中位数，再跨轮取中位数；门禁比较 CPU 时间（`process.cpuUsage`），避免共享主机抢占造成 wall-clock 数倍抖动。

| 算法                                     | 规模              | 中位耗时    | 判定                                                         |
| ---------------------------------------- | ----------------- | ----------- | ------------------------------------------------------------ |
| sporeoverlap                             | 500 节点          | **4245 ms** | 🔴 严重                                                      |
| disco                                    | 200 节点          | **2337 ms** | 🔴 严重                                                      |
| sporecompaction                          | 500 节点          | 823 ms      | 🟠                                                           |
| stress                                   | 200 节点 / 400 边 | 706 ms      | 🟠（待与 ELK 原版对照，可能本就如此）                        |
| force                                    | 200 节点 / 400 边 | 652 ms      | 🟠（同上）                                                   |
| mrtree                                   | 5000 节点树       | 1656 ms     | 🟠 超线性                                                    |
| radial                                   | 500 节点          | 12.9 ms     | 🟢（随机图只覆盖首根可达子树；门禁改用合法 star tree，见下） |
| box / fixed / random                     | 1000 节点         | 1.3–1.7 ms  | 🟢                                                           |
| rectpacking / topdownpacking / vertiflex | 200 节点          | <1.2 ms     | 🟢                                                           |

**规模曲线（同密度，节点翻倍）**

```
sporeoverlap  N=125 → 357ms   N=250 → 971ms (×2.72)   N=500 → 3628ms (×3.74)
disco         N= 50 → 194ms   N=100 → 636ms (×3.28)   N=200 → 2389ms (×3.76)
mrtree        N=500 → 22ms    N=2000 → 275ms (×12.5/×4)  N=5000 → 1656ms (×6.0/×2.5)
```

节点翻倍耗时 ×3.3–3.8 ⇒ **~O(n²)**。mrtree 亦为超线性。
这些算法在几百节点以上实际不可用，而此前无人量化（无门禁 = 无数据）。

## 非 layered perf 门禁 quick 基线（2026-09-13）

**接入**：`bench-gate.mjs` 在 layered 三规模之后追加 `perf-nonlayered.mjs --quick`，一条 `bun run check:bench` 同时覆盖两族。
判定沿用只拦变慢：`+10%` 且绝对增量超下限；layered 下限 0.5ms，非 layered quick 下限 40ms（共享主机实测跨进程噪声最高约 29ms）。基线文件：`bench-results/baseline-nonlayered.json`（目录被 `.gitignore` 忽略，基线文件以 `git add -f` 入库）。

| 算法            | quick 规模         | wall 中位 | CPU 中位  |
| --------------- | ------------------ | --------- | --------- |
| sporeoverlap    | 100 节点           | 242.49 ms | 274.41 ms |
| disco           | 50 节点            | 263.85 ms | 217.60 ms |
| stress          | 60 节点 / 120 边   | 146.22 ms | 90.07 ms  |
| radial          | 500 节点 star tree | 78.08 ms  | 80.55 ms  |
| force           | 60 节点 / 120 边   | 71.83 ms  | 73.96 ms  |
| sporecompaction | 100 节点           | 33.60 ms  | 34.98 ms  |
| mrtree          | 500 节点树         | 46.27 ms  | 34.91 ms  |
| rectpacking     | 300 节点           | 0.72 ms   | 1.75 ms   |
| fixed           | 1000 节点          | 0.88 ms   | 1.04 ms   |
| box             | 1000 节点          | 0.91 ms   | 0.93 ms   |
| random          | 1000 节点          | 0.89 ms   | 0.92 ms   |
| vertiflex       | 300 节点           | 0.33 ms   | 0.35 ms   |
| topdownpacking  | 300 节点           | 0.24 ms   | 0.25 ms   |

> radial 首次量化使用随机有向图，其中多数节点不属于首根可达子树，12.9ms 不是有效整树负载；门禁改为确定性 star tree。`--nodes` 也不再对现成图做切片（旧行为会保留悬空边/错误密度）。

**待办**（进入优化簇前先补的覆盖）：

1. ✅ 非 layered 已纳入 `bench-gate.mjs`，`bun run check:bench` 一条命令覆盖 layered 三规模 + 13 个非 layered 算法。
2. ✅ 批次 11 已完成 sporeoverlap（-86~88%）/ disco（-87%）/ mrtree（-97%）三簇，详见 `docs/clusters/agent-remarks.md` R50–R52。
3. stress / force 需先和 ELK 原版（jar/elkjs）对照 —— 若原版同量级则不是回归，只是已知成本。

## 并行 worktree 前置（2026-09-13 踩坑）

`setup-worktree.sh` 只软链 `node_modules`。以下目录被 `.gitignore` 忽略，**必须额外软链进每个 worktree，否则 `verify-bit-exact.mjs` / 对齐命令直接 ENOENT**：

```bash
# 在 worktree 内补软链（scripts/elk-java-debug 的 ELK jar 与 out-edge 目录）
d=<worktree>/packages/layout/scripts/elk-java-debug
mkdir -p "$d"
ln -s /Users/bjorn/ai-dev/ggn/packages/layout/scripts/elk-java-debug/lib      "$d/lib"
ln -s /Users/bjorn/ai-dev/ggn/packages/layout/scripts/elk-java-debug/out-edge "$d/out-edge"
```

派发前先在一个 worktree 里冒烟：`bun scripts/verify-bit-exact.mjs` 应输出 `368/368`（全等 337）。

