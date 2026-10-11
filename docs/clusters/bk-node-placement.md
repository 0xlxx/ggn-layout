# 簇简报: bk-node-placement（BKNodePlacer 布局数组免分配/类型化）

> 先读同目录 _COMMON.md（方法/铁律/退出条件/汇报格式），再读本文件。**ORDERED 簇。**

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p4nodes/bk-node-placer.ts` | 9-12% | BKAlignedLayout 8 数组 → Float64/Int32Array + 方向复用 | ORDERED | NONE

## 1. 热点证据（批次 2 基线, 2026-08-12 合并后）
- --phase 占比: small 11.5%（2.38ms）/ medium 11.1%（4.09ms）/ large 8.7%（8.46ms）
- --cpu 函数热点 (medium 445 samples): verticalAlignment @src/p4nodes/bk-aligner.ts:19 — 1.1%; placeBlock @src/p4nodes/bk-compactor.ts:93 — 1.1%
- 复杂度线索: 线性（每块一次对齐/压实），但 BK 方向传播/对齐是顺序相关归约

## 2. 优化假设
- 改什么: bk-aligned-layout.ts 的 8 个数组（block 状态/位置/偏移）改 Float64Array/Int32Array + 方向切换复用; bk-aligner verticalAlignment / bk-compactor placeBlock 热路径免对象分配（对象池/扁平结构）
- 为什么快: 扁平 typed array 连续内存 + 免 GC 压力; 方向复用避免每次方向 new 数组
- 预期收益: BK 模块耗时降 ≥ max(20%, 3×CV)（模块级门禁; BK 仅占 ~10%, 端到端目标按模块算）
- 前置: 先加计数/分配探针确认免分配收益; 保持遍历/对齐/压实顺序逐位一致

## 3. 顺序相关性分类（红线）
- 是否改变遍历/求和/排序顺序: **是（ORDERED）**
- 顺序相关归约点: BK 方向传播（verticalAlignment 按块序）、压实（placeBlock 按块序）、偏移累加
- 规则: 免分配/typed array 不改顺序 → 安全; 重排/惰性求值/提前退出 → 禁止
- 共享可变状态: 扁平数组若被多个块共享修改 → 需逐位保持原语义（BK 数组是每方向每块实例私有）

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/p4nodes/bk-aligned-layout.ts / bk-aligner.ts / bk-compactor.ts / bk-node-placer.ts | 主体优化 |
| src/p4nodes/spacings.ts / threshold-strategy.ts | 仅按需 |
| src/intermediate/cell-system.ts（bk-node-placer 依赖） | **不可碰**（批次 2 label-cell-system 簇专属） |
| verify 脚本 / triage-registry.json / 其他 p* 模块 | 不可碰 |

## 5. 方法 + 退出条件（机器可检查）
```bash
bun scripts/verify-bit-exact.mjs                 # 368 覆盖不降（每次改动后必跑）
bun scripts/perf-run.mjs --phase --scale medium   # BK 模块耗时降 ≥ max(20%, 3×CV)
bun scripts/perf-run.mjs --bench 30 --scale medium|large  # 端到端不降
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + BK 模块耗时降 ≥ max(20%, 3×CV) + 端到端不降 + 696 0 失败 + 对齐 362/368。
未满足不得声称完成。
