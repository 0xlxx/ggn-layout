# 簇简报: p3-sweep（LayerSweepCrossingMinimizer 内核免分配/缓存）

> 先读同目录 _COMMON.md（方法/铁律/退出条件/汇报格式），再读本文件。**本簇是 ORDERED 红线簇。**

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/p3order/layer-sweep-crossing-minimizer.ts` | 29-59% | side-port 缓存 / BIT 复用池 / Int32Array / 免分配 | ORDERED | MUTABLE_SHARED

## 1. 热点证据（2026-08-12 重采样）
- --phase: large 58.8%（63.67ms）/ medium 29.3%（10.27ms）/ small 32.5%（6.59ms）
- --cpu (large, 1028 samples):
  - countCrossings @src/p3order/counting/hyperedge-crossings-counter.ts:76 — 5.0%
  - getConnectedEdges @src/graph/lport.ts:114 — 5.2%
  - filter @:0 — 3.7%（定位调用点后改手写循环）
  - initPositions @src/p3order/counting.ts:324 — 2.4%
  - getIndex @src/graph/layer.ts:30 — 2.0%
  - next @src/util/java-random.ts:24 — 1.8%（sweep 随机扰动）
  - calculateBarycenter @src/p3order/barycenter-heuristic.ts:172 — 1.7%
  - getPorts @src/p3order/counting.ts:404 — 1.3% · countInLayerCrossingsOnPorts @counting.ts:254 — 1.0%
- 复杂度线索: large 占比随规模上升（超线性热点）

## 2. 优化假设（按收益排序）
- a) counting.ts 内核免分配: BinaryIndexedTree / 数组复用池（避免每 sweep iteration 重建）+ Float64/Int32Array（initPositions / countInLayerCrossingsOnPorts / getPorts）
- b) side-port 缓存: getPorts(side) 结果缓存（getPorts 1.3% + getConnectedEdges 5.2%）；失效点 = 端口增删/改 side 全部走 setter
- c) 消除 filter @:0 3.7%: 找到调用点（crossing counter / barycenter 内的数组过滤）改手写循环
- d) java-random next: 减少扰动调用或批处理——**必须保持随机序列与调用次数完全一致**（影响 sweep 顺序）
- e) getIndex @layer.ts:30 缓存: 若失效点可完整枚举则做，否则留给横切簇
- 预期收益: large layout 47ms → ≤35ms（≥20%）

## 3. 顺序相关性分类（红线，最高优先级判定）
- 是否改变遍历/求和/排序顺序: **是（ORDERED）**
- 顺序相关归约点（逐点列出）:
  - barycenter 按端口序累加（barycenter-heuristic.ts）
  - crossing 计数顺序（hyperedge-crossings-counter.ts / counting.ts）
  - sweep 迭代方向与轮次（forward/backward）
  - 随机扰动序列（java-random 调用序列必须逐位一致）
- 规则: **所有改动必须保持逐位相同的计算顺序**。免分配 / 缓存 / typed array 不改顺序 → 安全；swap-remove / 重排 / 惰性求值 / 提前退出 → **禁止**，除非主线程显式豁免授权并登记 triage-registry。
- 共享可变状态: MUTABLE_SHARED——side-port 缓存/复用池若返回可变对象，调用方原地改字段会污染；缓存必须返回副本或文档化只读，失效点完整（setLayer/setNode/加端口全走 setter）。加「随机操作序列 + 缓存一致性 fuzz」。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/p3order/**（layer-sweep-crossing-minimizer / counting / barycenter-heuristic / port-distributors） | 主体优化 |
| src/util/java-random.ts | 仅当保持随机序列一致 |
| src/graph/lport.ts / layer.ts（getConnectedEdges / getIndex 缓存） | 仅当失效点可完整枚举；否则留横切簇 |
| verify 脚本 / triage-registry.json / 其他 p* 模块 / graph 其余文件 | 不可碰 |

## 5. 方法 + 退出条件（机器可检查）
```bash
bun scripts/verify-bit-exact.mjs                # 368 覆盖不降（每次改动后必跑）
bun scripts/perf-run.mjs --bench 30 --scale large   # 提升 ≥ max(20%, 3×CV)，先测 CV 定阈值
bun scripts/perf-run.mjs --bench 30 --scale small|medium  # 其余规模不降
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + large layout ≥ max(20%, 3×CV) 提升 + small/medium 不降 + 696 0 失败 + 对齐 362/368。
未满足不得声称完成。
