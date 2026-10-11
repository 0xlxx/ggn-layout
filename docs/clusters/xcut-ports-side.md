# 簇简报: xcut-ports-side（横切：getPorts(side)/getPortSideView 预分组缓存）

> 先读同目录 _COMMON.md。**共享文件簇（graph 层），风险最高，逐字审。**

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/graph/lnode.ts` | 横切全局 | getPorts(side) 预分组缓存（免每调用 filter 分配） | UNORDERED | MUTABLE_SHARED

## 1. 热点证据（批次 3 后）
- getPorts(side)/getPortSideView 调用点 34+ 处（src/ 全局）；getPorts @lnode.ts:92 在多个 profile 出现
- getConnectedEdges 44 处调用（R27 契约：必须返回新数组，**不可**共享缓存——本簇不改它，只改 getPorts(side)）
- 每次 getPorts(side) = this.ports.filter(...) 新数组分配

## 2. 优化假设
- 改什么: LNode 维护 side 预分组缓存（4 个 side 数组），getPorts(side)/getPortSideView 返回对应分组数组（**共享引用，文档化只读**）; 失效点 = setPorts/addPort/removePort/setSide/端口构造全走 setter 更新分组
- 为什么快: filter 分配（O(n) 遍历 + 新数组）→ O(1) 返回分组数组; 全库 34+ 调用点受益
- 预期收益: 横切全局（各模块 profile 的 getPorts 消失）; 端到端 +1-3%
- 前置: **审计全部 getPorts(side)/getPortSideView 调用点确认只读**（无 push/sort/原地改）; 有原地改的调用点必须改走 getPorts() 副本或返回副本

## 3. 顺序相关性分类
- 是否改变遍历/求和/排序顺序: **否（UNORDERED）**——分组数组元素顺序 = getPorts() 过滤序（原 filter 保持顺序），返回同序
- 顺序相关归约点: 无（只影响读取性能，不改变值）
- 共享可变状态: **MUTABLE_SHARED——返回共享分组数组，调用方原地改会污染 node 端口顺序/内容**。必须：
  1. 审计全部调用点（getPorts(side)/getPortSideView），无原地改;
  2. 文档化「只读视图」;
  3. 缓存一致性 fuzz（随机 addPort/removePort/setSide + 断言分组与 filter 一致）;
  4. 失效点完整（端口增删/改 side 全走 setter）

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| src/graph/lnode.ts | 预分组缓存 + setter 失效 + getPorts(side)/getPortSideView 改读缓存 |
| src/graph/lport.ts | setSide 失效通知（如需要） |
| 调用点（src/ 内 getPorts(side) 使用处） | 仅当发现原地改时改为只读用法 |
| getConnectedEdges / verify 脚本 / triage-registry | **不可碰**（getConnectedEdges 契约 R27） |

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                 # 368 覆盖不降（每次改动后必跑）
bun scripts/perf-run.mjs --bench 30 --scale medium|large  # 端到端不降（期望 +1-3%）
# 缓存一致性 fuzz: 随机 addPort/removePort/setSide 序列后断言 getPorts(side) === filter 结果
bunx tsc --noEmit
```
退出条件: bit-exact 368 不降 + 缓存 fuzz 通过 + 端到端不降 + 696 0 失败 + 对齐 362/368。
