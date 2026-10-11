# ELK Layered 算法过程概览 (来自 elk 仓库官方文档)

> 来源: 上游 ELK 仓库的 `docs/` (blog 2025-08-21 layered overview, 2025-08-22 node-labels,
> algorithmdevelopers/algorithmimplementation/algorithmstructure, release-0.12.0)

## 1. 总体结构: 5 阶段 + intermediate processors

Layered (Sugiyama) 算法分 5 个主阶段, 阶段间可插入任意数量 intermediate processors
(由各阶段通过 `getLayoutProcessorConfiguration` 请求, 按依赖排序):

```
P1 断环 → P2 分层 → P3 交叉最小化 → P4 节点放置 → P5 边路由
  ↑          ↑          ↑            ↑            ↑
  slots     slots      slots        slots        slots (pre/post processors)
```

- 一个 processor 有明确定义的目的 (如 ReversedEdgeRestorer 恢复断环边)。
- 处理器依赖排序: 如"计算标签所需空间"的 processor 依赖"放置标签"的 processor 先完成。

## 2. 各阶段策略 (docs/blog/25-08-21-layered.md)

| 阶段 | 默认策略 | 说明 |
|---|---|---|
| P1 断环 | GREEDY | 最小化 backward 边, 平局随机; 也处理 partition/layer constraint/direction priority |
| P2 分层 | NETWORK_SIMPLEX | Gansner et al. 网络单纯形; 加 node promotion / layer splitting |
| P3 交叉最小化 | LAYER_SWEEP (barycenter) | Sugiyama barycenter 启发式; 可加 greedy switch 后处理 |
| P4 节点放置 | BRANDES_KOEPF | Brandes & Köpf 方法, 默认 top-left 对齐; post compaction 压缩; network simplex flexibility 动态增高 |
| P5 边路由 | (polyline/orthogonal/spline) | 决定 x 坐标 + 边弯点 |

## 3. Node Labels (cell 系统, docs/blog/25-08-22-node-labels.md)

- 让节点按标签调尺寸: 需同时设置 `nodeSize.constraints: NODE_LABELS` **和** `nodeLabels.placement`。
- **非居中标签会对称预留空间** (标签对侧也留空, 可被 `nodeSize.options: ASYMMETRICAL` 禁用)。
  → 这解释了 701 cell 高 = 2*labelH + padding 的"对称"来源 (CellProbe: 50×17→60×44)。
- parent 节点 (有子图) 的 label 由算法在 padding 中预留 (无对称); child 节点由 cell 计算。

## 4. 0.12.0 关键特性 (release-0.12.0.md)

- **#1194: Add option to run a second node placer after using the Network node flexibility option.**
  → flexible_ports (nodeFlexibility=NODE_SIZE) 可能触发第二遍 placer — ggn 待验证。
- #1170: layer splitting 条件更灵活。

## 5. 约束 (docs/blog/23-01-09-constraining-the-model.md)

- layerConstraint (FIRST/LAST), partition (partitioning.activate + partition), model order
  (GREEDY_MODEL_ORDER / MODEL_ORDER 断环), interactive (pseudo positions)。
- 这些约束主要影响 P1 (断环方向) 和 P2 (分层)。

## 6. 对本项目剩余失败的意义

| 子系统 | 相关文档要点 | 待办 |
|---|---|---|
| 701 cell | node-labels: 对称预留 + ASYMMETRICAL | 移植 NodeLabelAndSizeCalculator 网格 (含对称) |
| flexible_ports | #1194: node flexibility 后第二遍 placer | 验证 ggn 是否缺第二遍 |
| flat01 BK | Brandes & Köpf (论文 3-540-45848-4_3) | BK align 依赖链深挖 |
| compaction | post compaction option | spline 路由前置 |
| north_south_ports | P3 port ordering (barycenter 用端口位置) | 端口排序对比 |

## 7. 论文库 (paper/) — ELK layered 算法理论源头

> paper/ 保留 ELK layered 各阶段基础论文的 JSON 元数据和引用信息。
> 论文 PDF 因版权原因不随本仓库分发；自行获取 PDF 后可用
> `paperreader --file <论文>.pdf --toc --json` / `--extract-range` 提取。

| 论文 | 阶段/算法 | 当前失败映射 |
|---|---|---|
| 1981 Sugiyama | Sugiyama 方法基础, barycenter 交叉最小化 | north_south_ports_1, flat01 P3 |
| 1993 Gansner | 网络单纯形分层 + 交叉最小化 + 坐标分配 (4 遍) | flexible_ports (simplex), P2 分层 |
| 2002 Brandes | BK 节点放置: vertical alignment(4) + horizontal compaction + balancing | flat01/hierarchy01 P4 |
| 1972 Tarjan | DFS + 强连通分量 (断环 SCC 策略) | P1 断环 |
| 1972 Coffman | 两处理器调度 (P2 Coffman-Graham 分层) | P2 分层 |
| 1996 Sander | 复合有向图布局 | hierarchy01 |
| 2002 Forster | 复合图交叉减少 | P3 层级 |
| 2005 Nikolov×2 | 节点提升分层 (node promotion) | P2 |

### 论文要点 (已提取)

**Gansner 1993 (网络单纯形坐标分配)** — flexible_ports:
- X 坐标最小化 Σ w(e)|x_v−x_u|, 约束 x_b−x_a ≥ (xsize(a)+xsize(b)+nodesep)/2 (相邻节点最小间距).
- 边权重按端点类型: 都实节点=1, 一实一虚=2, 都虚=8 (ggn getEdgeWeightByType 1/2/8 已对齐).
- 辅助变量转线性规划, 约束 totally unimodular → 单纯形最优.

**Brandes 2002 (BK)** — flat01/hierarchy01 P4:
- vertical alignment (4 次: 上/下 × 左/右): 顶点对齐到中位数邻居, 冲突左/右解决.
- horizontal compaction: 对齐块同坐标, 靠近偏好方向 (thresh/类压缩).
- balancing: 4 assignment 组合平衡偏差 (createBalancedLayout).
- ggn BKAligner/BKCompactor/balancing 已实现, 理论一致.

### 对当前修复的意义
- flat01 根因 = P3 交叉数计算 (CrossingsCounter), 论文无直接对应 (实现细节) → 需逐行对齐
  ELK CrossingsCounter (632 行 vs ggn 444 行).
- flexible_ports = simplex 坐标分配 (Gansner), ggn 核心已实现, 差异在约束/初始解细节.
