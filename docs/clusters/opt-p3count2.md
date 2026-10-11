# 簇简报: P3 计数核心（countCrossings + counting 族）（countCrossings 6.7% + counting.ts 家族 5.7%）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读；含门禁政策与陷阱清单）。
> 历史：批次 11/12 见 `docs/clusters/agent-remarks.md` R50–R61。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p3order/counting/**` + `src/p3order/counting.ts` | ~12% | 排序换桶排序 / 预分组 / 免分配 | 已授权改顺序（结构仍需全等） | MUTABLE_SHARED | verify-bit-exact + --determinism + perf-run --phase

## 1. 热点证据（2026-09-13 实测，批次 12 之后）
15 次摊销 profile（总 808ms）：
```
countCrossings [counting/hyperedge-crossings-counter.ts]   54.0ms   6.7%   ← 最大单项
countCrossingsOnPorts [counting.ts]                         16.5ms   2.0%
initPositions [counting.ts]                                 15.3ms   1.9%
countInLayerCrossingsOnPorts [counting.ts]                  14.4ms   1.8%
native sort 的父帧: countCrossings 占 14.4ms（corners 排序）—— 全仓第二大 sort 调用点
```
`--phase --scale large`：P3 排序仍占 **50.1%**（45.66ms / 91.11ms）。

## 2. 优化假设
- **R47 已评估过的算法级候选（现在获授权）**：① corners 排序改**基数/桶排序**（改比较器语义）；② collect 超边收集改 **port 预分组**（改遍历序）；③ rightIndex 改**预计算索引**。三者此前都要「接受舍入差异 + 豁免登记」，现在按预算判定即可。
- 先 profile 确认当前各项占比（批次 12 改过一轮，R47 的数字已过期）。
- 其次：免分配（复用 scratch / typed array）、把每轮重复的 `getPorts()`/`getProperty()` 提出循环。
- 预期：本簇两文件合计 `--phase large` ≥20% 降。

## 3. 顺序相关性 / 等价红线
- **改顺序已授权**：允许 corners 桶排序 / 预分组 / 预计算索引改变浮点累加与比较顺序。
- **但仍须 **结构全等**：不能改「选出了哪些超边 / 边归属哪条超边 / 段的条数」这类集合级结果。门禁会以 `structural` 拦。
- 改完必须报实测 `maxUlp/maxAbs`（门禁会打印）；若某模型超预算（`overBudget`）→ 要么收敛改动幅度，要么在主线程确认后再登记该模型上限（**不要自己改 registry**）。
- 若加缓存/scratch：必须每轮完整重置（否则 `--determinism` 会红）。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/p3order/counting/**`、`src/p3order/counting.ts` | 主体优化 |

**不可碰**：`src/p3order/barycenter-heuristic.ts`、`port-distributors.ts`（本批另一簇在改）、`src/graph/**`（第三簇在改）、其余一切。

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                    # 结构全等 + 数值在界内（每次改动后必跑）
bun scripts/verify-bit-exact.mjs --determinism      # 排除 scratch 未重置
bun scripts/perf-run.mjs --phase --scale large      # 两文件模块耗时对比（目标 ≥20% 降）
bun scripts/perf-run.mjs --bench 30 --scale large   # 端到端不降
bunx tsc --noEmit
```
退出条件: 两文件 `--phase large` 合计 ≥20% 降 + 门禁 exit 0（结构全等；若产生预算内差异须报实测值）+ `--determinism` exit 0 + 端到端 large 中位不降 + typecheck 0。

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

