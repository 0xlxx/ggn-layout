# 簇简报: spore O(n²)（sporeoverlap 500 节点 4.2s → 亚秒级）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。本文件只含本簇特化信息。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/spore/**` | 非 layered 无覆盖 | 算法/常数优化（免分配、复杂度） | 待判定 | 待判定 | `bunx vitest run tests/bdd/spore.scenarios.test.ts` + `bun scripts/perf-nonlayered.mjs --scale sporeoverlap`

## 1. 热点证据（已量化，2026-09-12）
```
sporeoverlap   N=125 → 357ms   N=250 → 971ms (×2.72)   N=500 → 3628ms (×3.74)
sporecompaction N=500 → 823ms
```
节点翻倍耗时 ×3.3–3.8 ⇒ **~O(n²)**。入口: `src/spore/spore-layout.ts`
（OverlapRemovalLayoutProvider + ShrinkTreeLayoutProvider + ScanlineOverlapCheck +
BowyerWatsonTriangulation + NaiveMinST + GrowTree + DepthFirstCompaction）。

## 2. 优化假设
- 先 profile 定位：`bun --cpu-prof --cpu-prof-interval 100 --cpu-prof-dir /tmp/p scripts/perf-nonlayered.mjs --alg sporeoverlap --nodes 500 --iters 1`，按自耗时排序找真正的 O(n²) 来源。
- 已知可疑点（名字即线索）：`NaiveMinST`（最小生成树，naive 常为 O(n²) 或 O(n²log n)）、`BowyerWatsonTriangulation`（Delaunay，需检查是否每轮全量重建）、`GrowTree`（是否每节点全图重扫）、scanline 重叠检测是否每迭代重建索引。
- 优先改**复杂度**（n² → n log n / n·局部），其次才是常数（免分配、typed array、复用 scratch buffer）。
- 预期：500 节点中位 ≥50% 降（目标 < 2s，理想亚秒级）。

## 3. 顺序相关性 / 等价红线
- 本簇**不适用** layered 的 368 模型 bit-exact 门禁（非 layered）。
- 等价红线 = `tests/bdd/spore.scenarios.test.ts`（对照 ELK 0.12.0 jar **逐位全等**的 910–914 模型 + 不重叠不变量 + 相对拓扑）。
- 该测试是**逐位**断言：任何改变节点遍历/拉伸顺序的改动都可能翻转坐标 → 每次改动后必跑。
- 若某优化必然改变输出，**不要自行放宽测试**：停下来在汇报里说明「需要主线程裁定是否接受输出差异 + 更新 BDD 期望」。
- 共享可变状态：若加复用池/scratch，必须在每次 layout 入口完整重置（跨图残留 = 静默错位）。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/spore/**` | 主体优化（唯一可改目录） |

**不可碰**：`tests/bdd/spore.scenarios.test.ts`（除非**新增**用例，不许改既有期望值）、其余所有文件。

## 5. 方法 + 退出条件（机器可检查）
```bash
bunx vitest run tests/bdd/spore.scenarios.test.ts     # 20 例中 spore 部分全过（等价红线）
bun scripts/perf-nonlayered.mjs --scale sporeoverlap   # 规模曲线：确认复杂度下降
bun scripts/perf-nonlayered.mjs --alg sporeoverlap --nodes 500 --iters 5
bun scripts/perf-nonlayered.mjs --alg sporecompaction --nodes 500 --iters 5   # 不许拖慢 compaction
bunx tsc --noEmit                                       # 0 错误
```
退出条件: sporeoverlap 500 节点中位 ≥50% 降（且 125/250 同向不劣化）+ sporecompaction 不降 + spore BDD 全过 + typecheck 0。


## 铁律（违反即驳回）
- **只改本簇 scope 内文件**；其余一切文件不可碰（尤其 tests/、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md —— 这些由主线程统一回写，避免 4 簇合并冲突）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里有 node_modules 软链）。
- 不要跑全量 `bun run test`；只跑本簇门禁（见下）。
- 不做没量化的改动：每个改动都要有 before/after 数字。
- 汇报必须结构化：files / verifications / problems / notes，逐条对照退出条件；未满足**不得声称完成**。

