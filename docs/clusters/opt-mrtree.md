# 簇简报: mrtree 超线性（mrtree 5000 节点 1.66s → 明显下降）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。本文件只含本簇特化信息。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/mrtree/**` | 非 layered 无覆盖 | 算法/常数优化 | 待判定 | 待判定 | `bunx vitest run tests/bdd/mrtree.scenarios.test.ts` + `bun scripts/perf-nonlayered.mjs --scale mrtree`

## 1. 热点证据（已量化，2026-09-12）
```
mrtree   N=500 → 22ms   N=2000 → 275ms (×12.5 / ×4 节点)   N=5000 → 1656ms (×6.0 / ×2.5 节点)
```
⇒ 约 n^1.8–2 超线性。入口: `src/mrtree/mrtree-layout.ts`。
注：ELK 原版 mrtree 也可能非最优，**先判定是不是移植引入的**再决定投入。

## 2. 优化假设
- 先 profile：`bun --cpu-prof --cpu-prof-interval 100 --cpu-prof-dir /tmp/pm scripts/perf-nonlayered.mjs --alg mrtree --nodes 5000 --iters 1`。
- 重点看：树遍历是否对每节点做 O(n) 扫描（父/子查找、子树尺寸重算）、层内排序是否 O(n² log n)、是否可用一次 DFS 后序聚合替换重复子树尺寸计算。
- 这是**树**算法：多数 O(n²) 来自「每节点重新计算子树尺寸/后代数」，改成一次后序聚合即可 O(n)。
- 预期：5000 节点中位 ≥40% 降。

## 3. 顺序相关性 / 等价红线
- 不适用 layered 的 368 bit-exact 门禁。
- 等价红线 = `tests/bdd/mrtree.scenarios.test.ts`（对照 jar 的精确坐标断言）。
- 树布局对**子节点顺序**敏感（层内排序）→ 改遍历/排序顺序会翻结果，每次改动后必跑。
- 若必须改变输出：停下汇报，不要自行改期望值。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/mrtree/**` | 主体优化（唯一可改目录） |

**不可碰**：`tests/bdd/mrtree.scenarios.test.ts`（除非新增用例）、其余所有文件。

## 5. 方法 + 退出条件（机器可检查）
```bash
bunx vitest run tests/bdd/mrtree.scenarios.test.ts    # 等价红线
bun scripts/perf-nonlayered.mjs --scale mrtree         # 500/2000/5000 规模曲线
bun scripts/perf-nonlayered.mjs --alg mrtree --nodes 2000 --iters 5
bunx tsc --noEmit                                       # 0 错误
```
退出条件: mrtree 5000 节点中位 ≥40% 降（2000 同向不劣化）+ mrtree BDD 全过 + typecheck 0。


## 铁律（违反即驳回）
- **只改本簇 scope 内文件**；其余一切文件不可碰（尤其 tests/、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md —— 这些由主线程统一回写，避免 4 簇合并冲突）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里有 node_modules 软链）。
- 不要跑全量 `bun run test`；只跑本簇门禁（见下）。
- 不做没量化的改动：每个改动都要有 before/after 数字。
- 汇报必须结构化：files / verifications / problems / notes，逐条对照退出条件；未满足**不得声称完成**。

