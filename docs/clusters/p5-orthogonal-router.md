# 簇简报: p5-orthogonal-router（OrthogonalEdgeRouter 路由网格复用/免分配）

> 先读同目录 _COMMON.md。**ORDERED 簇。**

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p5edges/orthogonal-edge-router.ts` | 4-6% | 路由网格复用 / 障碍查询缓存 | ORDERED | MUTABLE_SHARED

## 1. 热点证据（批次 3 基线, 2026-08-12 合并 1+2 后）
- --phase 占比: medium 5.9%（1.91ms）/ large 4.3%（3.83ms）/ small ~4-6%
- --cpu: 函数级热点分散（includes @:0 medium 1.9% 等），无单一热点函数 → 模块耗时是多次小分配/重复查询累积
- 复杂度线索: 路由网格构建 + 障碍查询是主要成本

## 2. 优化假设
- 改什么: 路由网格（OrthogonalRoutingGrid）复用/障碍查询缓存; 路径搜索热路径免重复分配（bend 点数组/单元列表池化）; 避免 includes/indexOf 线性扫描（改 Set/索引）
- 为什么快: 网格复用免每边重建; 障碍查询 O(1) 索引替代线性扫描; 免 GC 压力
- 预期收益: Ortho 模块耗时降 ≥ max(20%, 3×CV)（模块级）; 端到端 +2-4%
- 前置: 先埋点量化网格构建 vs 路径搜索 vs 障碍查询占比; 保持路由顺序逐位一致

## 3. 顺序相关性分类（红线）
- 是否改变遍历/求和/排序顺序: **是（ORDERED）**（边路由顺序、bend 点序列、障碍扫描顺序敏感）
- 顺序相关归约点: 边处理顺序、路由网格单元访问顺序、bend 点追加序列
- 规则: 免分配/复用/索引缓存不改顺序 → 安全; 重排/惰性求值 → 禁止
- 共享可变状态: 网格/缓存若跨边共享返回可变对象 → 别名污染; 每边用完清理或按边私有

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/p5edges/orthogonal-edge-router.ts + src/p5edges/orthogonal/** | 主体优化 |
| src/p5edges/（其他 router） | 仅按需 |
| verify 脚本 / triage-registry.json / 其他模块 | 不可碰 |

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                 # 368 覆盖不降（每次改动后必跑）
bun scripts/perf-run.mjs --phase --scale medium   # Ortho 模块耗时降 ≥ max(20%, 3×CV)
bun scripts/perf-run.mjs --bench 30 --scale medium|large  # 端到端不降
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + Ortho 模块降 ≥ max(20%, 3×CV) + 端到端不降 + 696 0 失败 + 对齐 362/368。
