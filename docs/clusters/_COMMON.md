# _COMMON.md — 并行优化簇公共简报（elk-layout，parallel-optimizing）

> 每簇 agent 开工前必读：本文件（公共）+ 本簇简报（特化）。
> 主线程负责门禁/合并；agent 只在自己 worktree 内按 Scope 改动。

## 工作目录与命令
- 所有 shell 命令在 <worktree> 下执行（Codex 子代理用 exec_command workdir=<worktree>；ccx 用 --cwd <worktree>）。
- 共享依赖（node_modules / bench-results/cache）已软链，直接可用，不要 git add 软链。

## 方法循环（每簇内）
1. 定位热点：perf-run --phase / --cpu 复现本簇热点证据
2. 提出假设（含顺序相关性分类，见本簇简报 §3）
3. 修改（**改运算顺序现在允许**：默认门禁 = 结构全等 + 数值在界内；但仍要记录实测偏差量）
4. 三层验证：bit-exact（全量 368）/ 结构（typecheck）/ 性质（696 回归）
5. bench 对比：perf-run --bench 30 目标规模，提升 ≥ max(20%, 3×CV)
6. 备注回流：汇报 notes 里的发现交主线程独立验证后登记

## Agent 铁律
- ❌ git stash / git reset / git checkout -f / git clean / git rebase
- ❌ 改 scope 外文件
- ⚠️ 改顺序相关归约（求和/遍历/排序顺序）**已获授权**：默认门禁按「结构全等 + 数值在界内」判定，改顺序不再自动失败；但若**结构**变了（节点/端口/边/段数）仍必失败
- ❌ 共享缓存返回可变对象（调用方原地改字段 → 别名污染）
- ❌ 缓存失效点不完整（结构变更必须走 setter / 精确枚举失效点）
- ❌ 跑变异测试
- ✅ 只允许 git add <具体文件> + git commit + 只读查询
- ✅ 双运行时验证（bun/JSC + node/V8）
- ✅ 免分配 / typed array / 复用池 / 缓存优先；改顺序带来的舍入差异须**在汇报里给出实测 maxUlp/maxAbs**，并跑 `--determinism` 排除状态泄漏

## 退出条件（机器可检查，agent 不给自己打分）
| 关卡 | 命令 | 标准 |
|---|---|---|
| 簇级数值等价 | bun scripts/verify-bit-exact.mjs | 结构全等 + 数值在界内；368 覆盖（337 全等 + 预算内 + A15 + B6 + 复刻5 + 跳过5），exit 0；建议加 `--determinism` |
| 性能 | bun scripts/perf-run.mjs --bench 30 --scale <目标> | 目标提升 ≥ max(20%, 3×CV)，其余规模不降 |
| 对齐 | bun scripts/verify-elkg-java-layout.ts | 362/368，exit 0 |
| 回归 | node scripts/diff-failures.mjs collect-all && node scripts/diff-failures.mjs check /tmp/failures-696.json | 0 失败 |
| 类型 | bunx tsc --noEmit | 0 错误 |

## 汇报格式（必须结构化）
```
files:          改动的文件清单
verifications: 逐条退出条件（命令 + 输出摘要 + exit code）
problems:      未满足项 / 卡点 / 降级说明
notes:         备注 / 遗留 / 新发现（主线程独立验证后登记）
```
完成后：git add <具体文件> + git commit（只提交 scope 内改动，禁止 git add .）。
