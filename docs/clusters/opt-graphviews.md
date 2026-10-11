# 簇简报: 图层分配型 getter（Java 集合视图 → TS 每次新建数组）（getAllNodes / getOutgoingEdges / getIncomingEdges / getPorts(side) 每次调用都新建数组）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读；含门禁政策与陷阱清单）。
> 历史：批次 11/12 见 `docs/clusters/agent-remarks.md` R50–R61。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/graph/**` | filter 8.1ms + push 9.7ms（合计 ~4.5%） | 缓存 + 版本失效 / 免分配视图 | 顺序敏感（视图顺序即遍历顺序） | MUTABLE_SHARED（**R29 前车之鉴**） | verify-bit-exact + --determinism + perf-run --phase

## 1. 热点证据（2026-09-13 实测，批次 12 之后）
```
native filter 的父帧: getPorts [lnode.ts] 8.1ms / getPortSideView [lnode.ts] 3.6ms
native push  的父帧: getAllNodes [lgraph.ts] 4.3ms / getOutgoingEdges [lnode.ts] 3.6ms / getIncomingEdges [lnode.ts] 1.8ms
getAllNodes [lgraph.ts] 自耗时 1.0%；getOutgoingEdges [lnode.ts] 1.1%
```
根因是**语言机制差**：ELK(Java) 的 `getPorts(side)`/`getAllNodes()` 返回**集合视图**（零拷贝）；移植到 TS 后每次调用都 `filter`/`push` 建一个新数组，热路径上被调用成千上万次。

## 2. 优化假设
- `getPorts(side)` / `getPortSideView` / `getAllNodes` / `getOutgoingEdges` / `getIncomingEdges` / `getIncomingEdges`：加**版本号 + 惰性缓存**，结构变更时失效。
- **必须先解决 R30 列出的 5 处 `this.ports` 原地改站点**（north-south-port-preprocessor sort / sweep-copy length=0+push+sort / port-distributors sort / sort-by-input-model-processor sort / greedy 下标交换）——这些地方绕过 setter 直接改数组，缓存会静默失效。**收敛到 setter（bump 版本）是本簇的前置工作**。
- 预期：filter+push 相关 ~4.5% 降到 <1%。

## 3. 顺序相关性 / 等价红线
- **R29 就是这块被驳回的原因**：曾做过 `getPorts(side)` 的 O(1) 视图缓存，返回的**可变对象被调用方原地改**，持引用跨另一次重建后被改写 → 快照语义破坏，双 reviewer 用 fuzz 复现（`held.length` 被改写）。
- **本次必须**：① 缓存**只读**（或每次失效重建，绝不返回会被调用方持有的同一数组引用并允许其被内部改写）；② 失效点**收敛到唯一入口**（setter / 版本号），不允许「大部分走 setter、少数直接改数组」；③ 用**随机操作序列 fuzz**（增删端口 + 交替查询）证明视图一致性 —— 这是 R29 要求但当时没做到的。
- 顺序敏感：视图的元素顺序 = 遍历顺序，不许重排。
- 若无法同时满足「只读 + 唯一失效入口」，**宁可只做 `getAllNodes` / `getOutgoingEdges` 这类明确不被外部改的 getter**，不要碰 `getPorts(side)`。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/graph/**`（lgraph.ts / lnode.ts / lport.ts + setter 收敛点） | 主体优化 |

**不可碰**：`src/p3order/**`（另两簇在改）、其余一切。**注意**：`src/intermediate/**` 里的 5 处原地改站点不在你的 scope 内 —— 若需要它们改成 setter，**停下来汇报**，由主线程协调。

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                     # 结构全等（节点/端口/边集合与顺序敏感项）
bun scripts/verify-bit-exact.mjs --determinism
bunx vitest run tests/unit tests/core 2>/dev/null     # 图/单元相关测试（若目录不存在则跳过）
bun scripts/perf-run.mjs --phase --scale large
bunx tsc --noEmit
```
退出条件: filter+push 相关模块 `--phase large` ≥20% 降 + 门禁 exit 0 + `--determinism` exit 0 + **随机操作序列 fuzz 证明视图一致性**（R29 的欠账）+ typecheck 0。若因 scope 限制无法收敛失效点，只做安全子集并如实说明。

## 铁律
- 只改本簇 scope 内文件；其余一律不碰（tests/ 既有期望值、scripts/**、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md 由主线程回写）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（node_modules 是软链）。
- 不要跑全量 `bunx vitest run`（主线程跑）；只跑本簇门禁。
- **没量化不算完成**：每个改动都要有 before/after 数字。
- 汇报结构化：files / verifications（实际数字）/ problems / notes。未达退出条件**不得声称完成**。

## 门禁政策（2026-09-13 起，用户授权）
`bun scripts/verify-bit-exact.mjs` = **结构全等 + 数值在界内**。含义：
- **改浮点运算顺序现在允许**（不必再申请豁免）；若实测偏离超预算，门禁会以 `overBudget` 报出来。
- **但结构变了必失败**：节点集合（含层级归属）/ 每节点端口 id 集合 / 边端点集合 / 每条边各段点数（多重集）任一不同 → `structural` 硬失败。
- 非有限值（NaN/±Inf）必失败。
- 建议同时跑 `--determinism`（同模型两次须逐位一致）—— 改顺序/复用 scratch 时最容易踩「状态没重置」。
- 全局预算 `maxUlp 1e6` / `maxAbsRelative 1e-9`（按包围盒对角线）。汇报里请给出实测 `maxUlp/maxAbs`。

