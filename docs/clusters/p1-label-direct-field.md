# 簇简报: p1-label-direct-field（LabelAndNodeSizeProcessor 热属性直读字段化）

> 先读同目录 _COMMON.md（方法/铁律/退出条件/汇报格式），再读本文件。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/intermediate/label-and-node-size-processor.ts` | 9-16% | 热属性直读字段化（绕过 MapPropertyHolder） | UNORDERED | NONE

## 1. 热点证据（2026-08-12 重采样）
- --phase 占比: small 16.4%（3.32ms）/ medium 14.9%（5.23ms）/ large 8.8%（9.50ms）
- --cpu 函数热点: getProperty @src/graph/properties.ts:59（large 1.7%）；即 MapPropertyHolder.getProperty 的 hash 查找路径
- 复杂度线索: 线性，但每节点每属性一次 hash 查找 + 装箱

## 2. 优化假设
- 改什么: LabelAndNodeSizeProcessor 热路径的 property get/set 改为直读字段；在节点/图结构上加高频属性字段（如 labelSize / estimatedSize / 该处理器读取的属性集），保留 getProperty 兼容层
- 为什么快: Map.get/set = hash 查找 + 装箱/拆箱；直读字段 O(1) 无 hash，减少分配
- 预期收益: Label 模块 ≥20%（small 3.32ms → ~2.5ms 以下）
- 前置: **先做只读探测**（埋点统计该处理器实际读取的 property key 及频率），再定字段清单；字段化后 getProperty 语义必须完全一致（缺省默认值、继承、类型转换、set 后 get 可见）

## 3. 顺序相关性分类（bit-exact 红线判定）
- 是否改变遍历/求和/排序顺序: **否（UNORDERED）**——属性读写不改变计算顺序
- 顺序相关归约点: 无
- 共享可变状态: 属性值若为引用类型（数组/对象），字段化后调用方原地改会污染 → 引用类型值仍走 getProperty 或返回副本，只对值类型字段做直读

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/intermediate/label-and-node-size-processor.ts | 主体优化 |
| src/graph/properties.ts / src/options/** | 热属性字段定义 + 兼容层（如需） |
| verify 脚本 / triage-registry.json | 不改（主线程管门禁） |
| 其他 p*/graph/intermediate 文件 | 不可碰 |

## 5. 方法 + 退出条件（机器可检查）
```bash
bun scripts/verify-bit-exact.mjs                # 368 覆盖不降
bun scripts/perf-run.mjs --phase --scale small   # Label 模块占比下降
bun scripts/perf-run.mjs --bench 30 --scale small  # 端到端提升 ≥ max(20%, 3×CV)
bun scripts/perf-run.mjs --bench 30 --scale large   # 其余规模不降
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + small 端到端提升 ≥ max(20%, 3×CV) + large 不降 + 696 0 失败 + 对齐 362/368。
未满足不得声称完成。
