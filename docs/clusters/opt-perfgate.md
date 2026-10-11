# 簇简报: 非 layered perf 门禁（把 13 个非 layered 算法纳入可拦回归的门禁）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。本文件只含本簇特化信息。

## 0. OPTIMIZATION_CLASSES.tsv 行
`scripts/**`（工具链） | — | 门禁补齐 | — | — | `bun scripts/bench-gate.mjs` + `bun scripts/perf-nonlayered.mjs`

## 1. 热点证据（已量化，2026-09-12）
- `perf-run.mjs` / `compare-elkjs-perf.mjs` / `scripts/bench-gate.mjs` / `check:bench` 全部只 import `LayeredLayoutProvider`
  → `register-all` 注册的 13 个非 layered 算法**零性能覆盖**，回归永远拦不住（本次就是靠临时脚本才发现 sporeoverlap 4.2s）。
- 已有资产：`scripts/perf-nonlayered.mjs`（本簇上一提交加入，支持全表 / --alg / --scale）。
- 已有基线数字见 `packages/layout/docs/optimization.md` 末节「非 layered 算法首次量化」。

## 2. 优化假设
- 把非 layered 纳入 `bench-gate.mjs`：像 layered 三规模那样，对非 layered 全表跑一次并对比存储基线，**只拦变慢**（沿用 `check-bench-regression.mjs` 的默认 +10% 阈值与「只拦变慢」语义）。
- 需要一个基线文件（如 `bench-results/baseline-nonlayered.json`）——用 `perf-nonlayered.mjs --json` 生成并入库。
- 注意坑：sporeoverlap/disco/mrtree/stress/force 单次几百 ms~秒级，全表跑一遍要几十秒；门禁不能让 CI 超时 → 给慢算法小规模 + 少 iter，或加 `--quick` 档。
- 暴露成 `package.json` 的 script（如 `check:bench:nonlayered`），并在 `docs/optimization.md` 命令速查里登记。

## 3. 顺序相关性 / 等价红线
- 本簇不改算法，**不改任何布局输出**，无顺序相关性。
- 门禁自身的正确性要求：阈值判定不能把噪声当回归（慢算法 CV 低；快的算法 CV 高达 80%+，如 box/rectpacking → 对小值设绝对下限，别用纯百分比）。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `scripts/perf-nonlayered.mjs` | 可扩展（如 --quick / --json 完善） |
| `scripts/bench-gate.mjs` | 主体：加入非 layered 对比 |
| `scripts/check-bench-regression.mjs` | 仅在必要时（阈值/绝对下限） |
| `packages/layout/package.json` | 加 script |
| `packages/layout/docs/optimization.md` | 命令速查 + 基线登记 |
| `bench-results/baseline-nonlayered.json` | 新增基线文件 |

**不可碰**：`src/**`（任何算法实现）、`tests/**`、`triage-registry.json`。

## 5. 方法 + 退出条件（机器可检查）
```bash
bun scripts/perf-nonlayered.mjs                                   # 全表跑通
bun scripts/perf-nonlayered.mjs --json bench-results/baseline-nonlayered.json
bun scripts/bench-gate.mjs                                         # 一站式：layered 三规模 + 非 layered，全绿
# 负向验证（必做）：人为让某算法变慢/或临时把基线改小，确认门禁真的会拦下来
bunx tsc --noEmit
```
退出条件: `bun run check:bench` 一条命令同时覆盖 layered 三规模 + 非 layered 全表；**负向验证通过**（人为劣化能被拦下）+ 不误报（连跑两次全绿）+ typecheck 0。


## 铁律（违反即驳回）
- **只改本簇 scope 内文件**；其余一切文件不可碰（尤其 tests/、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md —— 这些由主线程统一回写，避免 4 簇合并冲突）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里有 node_modules 软链）。
- 不要跑全量 `bun run test`；只跑本簇门禁（见下）。
- 不做没量化的改动：每个改动都要有 before/after 数字。
- 汇报必须结构化：files / verifications / problems / notes，逐条对照退出条件；未满足**不得声称完成**。

