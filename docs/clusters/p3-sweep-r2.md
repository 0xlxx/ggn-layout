# 簇简报: p3-sweep-r2（LayerSweepCrossingMinimizer 第二轮 — 剩余热函数深挖）

> 先读同目录 _COMMON.md。**ORDERED 红线簇（批次 1 已优化同批文件，本簇在合并后基线上继续）。**

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p3order/**` | sweep 模块 large 52-57% | 第二轮：hyperedge 计数排序 / 层内交叉免分配 / port-ranks 热循环 / barycenter 直迭代 | ORDERED | MUTABLE_SHARED

## 1. 热点证据（批次 5 基线, large 774 samples, 批次 1+2+3 合并后）
- sweep 模块仍占 large 52-57%（50.72ms/96.73ms）
- --cpu 剩余热函数:
  - countCrossings @src/p3order/counting/hyperedge-crossings-counter.ts:160 — 5.9%（超边计数主体）
  - countInLayerCrossingsOnPorts @src/p3order/counting.ts:301 — 3.5%
  - calculatePortRanks @src/p3order/port-distributors.ts:327 — 2.3%（+ :272 0.9% / :54 0.9% / distributePorts :72 0.9%）
  - initPositions @src/p3order/counting.ts:384 — 1.9%
  - calculateBarycenter @src/p3order/barycenter-heuristic.ts:172 — 1.9%
  - processConstraintsStage/buildConstraintsGraph @src/p3order/forster-constraint-resolver.ts — 1.4% / 1.3%

## 2. 优化假设（在批次 1 基础上继续，每项先验证再改）
- a) hyperedge countCrossings（5.9%）: leftCorners/rightCorners 的 sort（O(k log k)）是否可避免/降复杂度；超边区域计数循环免重复索引
- b) countInLayerCrossingsOnPorts（3.5%）: targetsAndDegrees 数组复用 + 直迭代
- c) calculatePortRanks（2.3%）: 热循环免 Map/分配（批次 1 已手写循环，剩余在 rank 累加/查找）
- d) initPositions（1.9%）: 侧过滤内联（批次 1 已做部分，剩余 portPositions 写入模式）
- e) calculateBarycenter（1.9%）: 直迭代边（批次 1 已做），剩余在 sum/weight 计算
- 预期收益: sweep 模块降 ≥ max(20%, 3×CV)（模块级）→ 端到端 large +5-10%

## 3. 顺序相关性分类（红线，同批次 1）
- **是（ORDERED）**——sweep 全部计算顺序敏感（barycenter 按端口序累加、crossing 计数、sweep 方向、随机扰动）
- 规则: 免分配/复用/typed array 不改顺序 → 安全；重排/惰性求值/提前退出 → 禁止
- 共享可变状态: 复用池/缓存返回可变对象 → 别名污染（同批次 1 规则）

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/p3order/counting.ts + counting/hyperedge-crossings-counter.ts | 主体（a/b/d） |
| src/p3order/port-distributors.ts | calculatePortRanks（c） |
| src/p3order/barycenter-heuristic.ts + forster-constraint-resolver.ts | e + 约束（按需） |
| src/p3order/layer-sweep-crossing-minimizer.ts | 仅按需（调度/方向） |
| verify 脚本 / triage-registry / graph 层 / 其他模块 | **不可碰** |

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                 # 368 覆盖不降（每次改动后必跑）
bun scripts/perf-run.mjs --phase --scale large    # sweep 模块耗时降 ≥ max(20%, 3×CV)
bun scripts/perf-run.mjs --bench 30 --scale large # 端到端提升/不降
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + sweep 模块降 ≥ max(20%, 3×CV)（warm n=200 协议）+ 端到端不降 + 696 0 失败 + 对齐 362/368。
