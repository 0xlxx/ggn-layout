# 簇简报: P3 排序启发式（barycenter + port-distributors）（minimizeLayer 的 sort 10.9ms + calculateBarycenter 2.6% + calculatePortRanks 3.6%）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读；含门禁政策与陷阱清单）。
> 历史：批次 11/12 见 `docs/clusters/agent-remarks.md` R50–R61。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p3order/barycenter-heuristic.ts` + `src/p3order/port-distributors.ts` + `greedy-port-distributor.ts` | ~8% | 排序键预计算 / 免分配 / 属性读取提升 | 已授权改顺序 | MUTABLE_SHARED | verify-bit-exact + --determinism + perf-run --phase

## 1. 热点证据（2026-09-13 实测，批次 12 之后）
```
native sort 的父帧: minimizeLayer [barycenter-heuristic.ts]  10.9ms   ← 全仓最大 sort 调用点
calculateBarycenter [barycenter-heuristic.ts]                20.9ms   2.6%
calculatePortRanks  [port-distributors.ts]                   18.4ms   2.3%
calculatePortRanksForLayer [port-distributors.ts]            10.9ms   1.3%
sortPorts [port-distributors.ts]                              1.0ms
getProperty 的父帧: calculateBarycenter 4.9ms（热属性读取没走快路径）
```

## 2. 优化假设
- `minimizeLayer` 的排序：确认比较器是否每对都比较时重算键（**Schwartzian transform**：先算一次键数组再排序）；若是稳定排序需求，注意 JS `sort` 已是稳定的（ES2019+）。
- `calculateBarycenter` 里的 `getProperty(BARYCENTER_ASSOCIATES)` 每节点都取一次 → 提出循环/缓存引用。
- `calculatePortRanks`：端口排序键预计算、避免每轮重建数组。
- 预期：本簇合计 `--phase large` ≥20% 降。

## 3. 顺序相关性 / 等价红线
- **改顺序已授权**（排序比较器语义变化带来的差异按预算判定）。
- **仍须结构全等**：排序结果的**元素集合**不能变（只是顺序可变）；若某个节点被排丢/多出来 → `structural` 会拦。
- 若引入排序键缓存：注意节点/端口在排序期间是否会被改动（脏读）；`--determinism` 会抓非确定性。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/p3order/barycenter-heuristic.ts`、`src/p3order/port-distributors.ts`、`src/p3order/greedy-port-distributor.ts` | 主体优化 |

**不可碰**：`src/p3order/counting/**`、`counting.ts`（另一簇在改）、`src/graph/**`（第三簇在改）、其余一切。

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs
bun scripts/verify-bit-exact.mjs --determinism
bun scripts/perf-run.mjs --phase --scale large
bun scripts/perf-run.mjs --bench 30 --scale large
bunx tsc --noEmit
```
退出条件: 本簇文件 `--phase large` 合计 ≥20% 降 + 门禁 exit 0（结构全等）+ `--determinism` exit 0 + 端到端不降 + typecheck 0。

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

