# 簇简报: P3 排序热路径（sweep 内部）（countCrossings 10.5% + counting/barycenter/port-distributors/sweep-copy 合计约 20%）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。批次 11 历史见 `docs/clusters/agent-remarks.md` R50-R53。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p3order/**`（counting 族 + 排序启发式） | ~20% | 免分配 / typed array / 容器替换 | ORDERED | MUTABLE_SHARED | bit-exact 368 + perf-run --phase --scale large

## 1. 热点证据（2026-09-13 实测，20 次摊销 profile）
函数级自耗时（`--bench 15 --scale large`，总 957ms）：
```
countCrossings [counting/hyperedge-crossings-counter.ts:230]  100.3ms  10.5%（3 个内联实例）
calculateBarycenter [barycenter-heuristic.ts:172]              26.9ms   2.8%
initPositions [counting.ts]                                    18.8ms   2.0%
calculatePortRanks [port-distributors.ts]                      19.9ms   2.1%
countInLayerCrossingsOnPorts [counting.ts]                     14.7ms   1.5%
initInitializables [all-crossings-counter.ts:20]               12.5ms   1.3%
SweepCopy [sweep-copy.ts:40]                                   12.1ms   1.3%
countCrossingsOnPorts [counting.ts]                            12.1ms   1.3%
```
已有基础（前期已做）：`portPos` 稠密索引 + `Uint8Array` cache + `Int32Array` stamp（R35/R36 的 stamp 环绕坑已修）。
已知候选（需现场重新量化，不要照搬）：`clearPortHyperedges` 的 touched 列表、`node.getPorts()` 每轮调用、`calculateBarycenter` 按端口序累加、`SweepCopy` 的数组拷贝、`port-distributors` 的排序键分配。

## 2. 优化假设
- 先 `bun scripts/perf-run.mjs --phase --scale large` 确认 P3 占比，再 `bun --cpu-prof` 抓函数级。
- 优先「不改顺序」的手段：免分配（复用 scratch）、typed array、把每轮重复的属性/端口查询提出循环、避免 `filter`/`entries`/闭包排序键。
- 每改一处单独量化，便于判断哪一步有效。
- **不要**重写 sweep 算法本身（R47/R48 已评估：corners 桶排序 / collect 预分组 / rightIndex 预计算均需舍入差异 + 豁免授权，本簇**未获授权**）。

## 3. 顺序相关性 / 等价红线
- **ORDERED 红线**：sweep 的遍历/累加/排序顺序决定输出。改顺序 = 舍入差异 = 门禁必拦。
- 必须保持：`bun scripts/verify-bit-exact.mjs` 的**全等 337 不变**（豁免 A/B 也不许增加）。
- 免分配 / 复用 scratch / typed array 不改顺序 → 安全；但 scratch 必须每层/每轮完整重置（跨层残留 = 静默错位）。
- 共享可变状态：若加缓存，调用方可能原地改返回对象（ELK 惯例 `getPosition().x = ...`）→ 只缓存只读或不缓存。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/p3order/**` | 主体优化（唯一可改目录） |

**不可碰**：`src/graph/**`（本批次另有簇在改）、`tests/**` 既有期望值、`scripts/**`、`triage-registry.json`。

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                              # 368/368 且全等 337 不变（每次改动后必跑）
bun scripts/perf-run.mjs --phase --scale large                # P3 模块耗时对比（目标 ≥20% 降）
bun scripts/perf-run.mjs --bench 30 --scale large             # 端到端不降（方差大，看中位）
bunx tsc --noEmit
```
退出条件: P3 相关模块 `--phase large` 耗时 ≥20% 降 + bit-exact 368/368（全等 337 不变）+ 端到端 large 中位不降 + typecheck 0。

## 铁律
- 只改本簇 scope 内文件；其余一律不碰（tests/ 既有期望值、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md 由主线程统一回写）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里 node_modules 是软链）。
- 不要跑全量 `bunx vitest run`（52s，主线程会跑）；只跑本簇门禁（见下）。
- **没量化就不算完成**：每个改动都要有 before/after 数字。
- 汇报结构化：files / verifications（实际数字）/ problems / notes。未达退出条件**不得声称完成**。

