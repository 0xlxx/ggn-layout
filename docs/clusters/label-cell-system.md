# 簇简报: label-cell-system（Label/cell-system 计算层免分配）

> 先读同目录 _COMMON.md（方法/铁律/退出条件/汇报格式），再读本文件。**ORDERED 簇。**

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/intermediate/label-and-node-size-processor.ts` + `src/intermediate/cell-system.ts` | 9-18% | cell-system 计算层免分配 / 热路径直算 | ORDERED | NONE

## 1. 热点证据（批次 2 基线）
- --phase 占比: Label 模块 small 18.5%（3.82ms）/ medium 16.0%（5.90ms）/ large 9.4%（9.09ms）
- 批次 1 结论 (R02): Label 模块耗时主体是 cell-system.ts 计算层（placeNodePorts / computeCellSystemSize / placePortLabels / createPortContexts / buildCellContext），而非 getProperty（P1 已优化, 仅 ~1.7%）
- --cpu: processNode @label-and-node-size-processor.ts:263 — 0.9%; createPortContexts @cell-system.ts / buildCellContext @cell-system.ts:613（medium 早期 profile）
- 复杂度线索: 线性, 但每节点每端口多次上下文构建 + 数组/对象分配

## 2. 优化假设
- 改什么: cell-system.ts 上下文构建（cell/port context）免重复分配 → 复用池/扁平结构; placeNodePorts/computeCellSystemSize 热路径直算免中间数组; label-and-node-size-processor processNode 内联热分支
- 为什么快: 减少每端口上下文对象/数组分配（GC 压力）; 扁平结构连续内存
- 预期收益: Label 模块耗时降 ≥ max(20%, 3×CV)（模块级门禁）; 端到端 small/medium 提升 3-8%
- 前置: 先埋点量化 cell-system 各函数分配/耗时占比; 保持计算顺序逐位一致

## 3. 顺序相关性分类（红线）
- 是否改变遍历/求和/排序顺序: **是（ORDERED）**（端口尺寸/位置累加顺序敏感）
- 顺序相关归约点: cell size 求和、端口位置累加、标签 placement 计算顺序
- 规则: 免分配/复用池/扁平结构不改顺序 → 安全; 重排/惰性求值 → 禁止
- 共享可变状态: 复用池返回可变对象 → 调用方原地改会污染; 复用对象必须「用完归还」或按实例私有

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/intermediate/cell-system.ts | 主体优化（计算层免分配） |
| src/intermediate/label-and-node-size-processor.ts | processNode 热分支（P1 基础上继续, 不碰 P1 的 fast slots 语义） |
| src/p4nodes/bk-*.ts（依赖 cell-system） | **不可碰**（批次 2 bk-node-placement 簇专属） |
| verify 脚本 / triage-registry.json / 其他模块 | 不可碰 |

## 5. 方法 + 退出条件（机器可检查）
```bash
bun scripts/verify-bit-exact.mjs                 # 368 覆盖不降（每次改动后必跑）
bun scripts/perf-run.mjs --phase --scale small    # Label 模块耗时降 ≥ max(20%, 3×CV)
bun scripts/perf-run.mjs --bench 30 --scale small|medium  # 端到端不降
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + Label 模块耗时降 ≥ max(20%, 3×CV) + 端到端不降 + 696 0 失败 + 对齐 362/368。
未满足不得声称完成。
