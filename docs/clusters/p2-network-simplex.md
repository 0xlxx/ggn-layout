# 簇简报: p2-network-simplex（NetworkSimplexLayerer 数组类型化/栈复用）

> 先读同目录 _COMMON.md。**ORDERED 簇（输出敏感）。**

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p2layers/network-simplex-layerer.ts` | 3-5% | poID/cutvalue → Int32Array / 栈复用 | ORDERED | NONE

## 1. 热点证据（批次 3 基线）
- --phase 占比: medium 4.9%（1.60ms）/ large 3.4%（3.08ms）
- 复杂度线索: network simplex 迭代（树更新/势计算）可能超线性; 每迭代数组/对象分配

## 2. 优化假设
- 改什么: poID/cutvalue/low/high 等数组改 Int32Array; 树结构/栈复用（避免每迭代重建）; 热路径免 Map/对象分配
- 为什么快: typed array 连续内存 + 免装箱; 栈/树复用免 GC
- 预期收益: NetSimplex 模块耗时降 ≥ max(20%, 3×CV)（模块级）; 端到端 +1-3%
- 前置: 先确认 network simplex 迭代是否超线性（n/2n/4n 缩放）; 保持迭代/势计算顺序逐位一致（**输出敏感: 层分配结果依赖迭代顺序**）

## 3. 顺序相关性分类（红线）
- 是否改变遍历/求和/排序顺序: **是（ORDERED, 输出敏感）**——network simplex 的迭代顺序决定最终层分配; 改变归约顺序会翻结果
- 顺序相关归约点: 树遍历（DFS 顺序）、势计算、边选择顺序、层分配
- 规则: 免分配/typed array/复用不改顺序 → 安全; 迭代重排/提前退出 → 禁止
- 共享可变状态: 栈/树复用若跨迭代残留 → 错位; 每迭代完整重置

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/p2layers/network-simplex-layerer.ts + src/networksimplex/** | 主体优化 |
| verify 脚本 / triage-registry.json / 其他模块 | 不可碰 |

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                 # 368 覆盖不降（每次改动后必跑; 输出敏感簇重点盯）
bun scripts/perf-run.mjs --phase --scale medium   # NetSimplex 模块耗时降 ≥ max(20%, 3×CV)
bun scripts/perf-run.mjs --bench 30 --scale medium|large  # 端到端不降
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + NetSimplex 模块降 ≥ max(20%, 3×CV) + 端到端不降 + 696 0 失败 + 对齐 362/368。
