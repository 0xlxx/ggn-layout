# 簇简报: 热读取路径（属性读取 + Forster 约束求解）（getProperty 3.1% / setProperty 0.8% / findViolatedConstraint 3.9%）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。批次 11 历史见 `docs/clusters/agent-remarks.md` R50-R53。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/graph/properties.ts` + `src/p3order/forster-constraint-resolver.ts` | 合计 ~8% | 快路径覆盖 / 容器替换 / 免分配 | ORDERED（forster 部分） | NONE | bit-exact 368 + perf-run --phase

## 1. 热点证据（2026-09-13 实测，20 次摊销 profile）
```
getProperty      [graph/properties.ts:118]          29.7ms   3.1%
findViolatedConstraint [forster-constraint-resolver.ts:233] 37.4ms  3.9%（2 个实例）
setProperty      [graph/properties.ts]               8.0ms   0.8%
buildConstraintsGraph [forster:188] 11.5ms 1.2% / initNode [forster:114] 6.8ms 0.7% / processConstraintsStage 11.1ms 1.2%
```
`properties.ts` 现状：`getProperty(Property)` 走 `slot >= 0` 的 `fastGet(slot)` 快路径，否则回落 `Map<id, value>`；字符串 id 走 `FAST_BY_ID.get(property)`。profile 显示仍有可观时间在分支 + Map 查找。

## 2. 优化假设
- properties：查清 hot 调用点用的是 `Property` 对象还是**字符串 id**——字符串路径多一层 `FAST_BY_ID.get` + Map。若热路径可以改走 slot 快路径（给内部 Property 分配 slot），收益直接。
- forster：`findViolatedConstraint` 已做过一轮（R48 的 `groups.indexOf` → 身份 Map）；继续看每轮重建/分配、`ConstraintGroup` 构造、`initNode` 重复计算。
- 预期：两文件合计 ≥20% 降（模块级）。

## 3. 顺序相关性 / 等价红线
- `properties.ts` 是**横切共享**文件：语义（默认值缓存副本、`hasProperty`、字符串 id 回落）不许变，只能优化实现路径。
- **前车之鉴 R29-R32（批次 4 被驳回）**：不要做「返回共享可变视图」的缓存——ELK 惯例 `getPosition().x = ...` 会原地改，快照语义一破就是静默错位。本簇不要碰 `getPorts(side)`。
- forster 在 ORDERED 链路上：不要改约束求解顺序/遍历顺序（bit-exact 会拦）。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/graph/properties.ts` | 属性读取快路径 |
| `src/p3order/forster-constraint-resolver.ts` | 约束求解热路径 |

**不可碰**：`src/graph/lnode.ts` / `lport.ts`（getPorts(side) 属批次 4 驳回区，另立项）、其余一切。

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                        # 368/368 全等 337 不变（每次必跑）
bun scripts/perf-run.mjs --phase --scale large          # getProperty / Forster 模块耗时对比
bunx vitest run tests/unit tests/core 2>/dev/null || true   # 属性/图相关单测（若目录不存在则跳过）
bunx tsc --noEmit
```
退出条件: 两文件合计 `--phase large` 耗时 ≥20% 降 + bit-exact 368/368 全等 337 不变 + typecheck 0。

## 铁律
- 只改本簇 scope 内文件；其余一律不碰（tests/ 既有期望值、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md 由主线程统一回写）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里 node_modules 是软链）。
- 不要跑全量 `bunx vitest run`（52s，主线程会跑）；只跑本簇门禁（见下）。
- **没量化就不算完成**：每个改动都要有 before/after 数字。
- 汇报结构化：files / verifications（实际数字）/ problems / notes。未达退出条件**不得声称完成**。

