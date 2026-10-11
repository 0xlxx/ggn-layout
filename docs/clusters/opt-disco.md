# 簇简报: disco O(n²)（disco 200 节点 2.3s → 亚秒级）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。本文件只含本簇特化信息。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/disco/**` | 非 layered 无覆盖 | 算法/常数优化 | 待判定 | 待判定 | `bunx vitest run tests/bdd/disco.scenarios.test.ts` + `bun scripts/perf-nonlayered.mjs --scale disco`

## 1. 热点证据（已量化，2026-09-12）
```
disco   N=50 → 194ms   N=100 → 636ms (×3.28)   N=200 → 2389ms (×3.76)
```
节点翻倍耗时 ×3.3–3.8 ⇒ **~O(n²)**。入口: `src/disco/disco-layout.ts`。

## 2. 优化假设
- 先 profile：`bun --cpu-prof --cpu-prof-interval 100 --cpu-prof-dir /tmp/pd scripts/perf-nonlayered.mjs --alg disco --nodes 200 --iters 1`。
- 重点看：节点间两两距离/重叠矩阵是否每轮重算、聚类迭代是否可增量、是否每轮重建大数组/Map。
- 优先复杂度，其次常数（typed array / scratch 复用 / 免分配）。
- 预期：200 节点中位 ≥50% 降（目标 < 1s）。

## 3. 顺序相关性 / 等价红线
- 不适用 layered 的 368 bit-exact 门禁。
- 等价红线 = `tests/bdd/disco.scenarios.test.ts`（对照 jar 的精确坐标断言）。
- 该测试逐位断言 → 改遍历顺序可能翻转结果，每次改动后必跑。
- 若必须改变输出：停下汇报，不要自行改期望值。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/disco/**` | 主体优化（唯一可改目录） |

**不可碰**：`tests/bdd/disco.scenarios.test.ts`（除非新增用例）、其余所有文件。

## 5. 方法 + 退出条件（机器可检查）
```bash
bunx vitest run tests/bdd/disco.scenarios.test.ts     # 等价红线
bun scripts/perf-nonlayered.mjs --scale disco          # 50/100/200 规模曲线
bun scripts/perf-nonlayered.mjs --alg disco --nodes 200 --iters 5
bunx tsc --noEmit                                       # 0 错误
```
退出条件: disco 200 节点中位 ≥50% 降（50/100 同向不劣化）+ disco BDD 全过 + typecheck 0。


## 铁律（违反即驳回）
- **只改本簇 scope 内文件**；其余一切文件不可碰（尤其 tests/、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md —— 这些由主线程统一回写，避免 4 簇合并冲突）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里有 node_modules 软链）。
- 不要跑全量 `bun run test`；只跑本簇门禁（见下）。
- 不做没量化的改动：每个改动都要有 before/after 数字。
- 汇报必须结构化：files / verifications / problems / notes，逐条对照退出条件；未满足**不得声称完成**。

