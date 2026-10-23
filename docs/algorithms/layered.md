# Layered

```json
{
  "org.eclipse.elk.algorithm": "layered",
  "org.eclipse.elk.direction": "RIGHT",
  "org.eclipse.elk.edgeRouting": "ORTHOGONAL"
}
```

Layered 是默认算法。它把节点分层，让尽可能多的边指向同一方向，然后在层内减少交叉并计算坐标。

完整阶段说明见 [Layered 五阶段](/architecture/layered-pipeline)。

## 默认策略

| 阶段 | 默认 |
| --- | --- |
| 断环 | `GREEDY` |
| 分层 | `NETWORK_SIMPLEX` |
| 交叉最小化 | `LAYER_SWEEP` |
| 节点放置 | `BRANDES_KOEPF` |
| 边路由 | `ORTHOGONAL` |

## 方向与路由

| 选项 | 常见值 | 影响 | 示例 |
| --- | --- | --- | --- |
| `org.eclipse.elk.direction` | `RIGHT` / `LEFT` / `DOWN` / `UP` | 层的前进方向 | `{"org.eclipse.elk.direction":"DOWN"}` |
| `org.eclipse.elk.edgeRouting` | `ORTHOGONAL` / `POLYLINE` / `SPLINES` | 弯点形态 | `{"org.eclipse.elk.edgeRouting":"SPLINES"}` |
| `org.eclipse.elk.alignment` | `AUTOMATIC` / `TOP` / `BOTTOM` / `CENTER` | 层内整体对齐 | `{"org.eclipse.elk.alignment":"CENTER"}` |
| `org.eclipse.elk.aspectRatio` | 数字 | 启发式目标比例 | `{"org.eclipse.elk.aspectRatio":1.8}` |

方向不是“旋转画布”。算法会在规范化方向中执行 P1–P5，最后通过坐标变换输出请求方向。

## 分层策略

| 值 | 用途 | 示例 |
| --- | --- | --- |
| `NETWORK_SIMPLEX` | 默认，边长与间距平衡 | `{"org.eclipse.elk.layered.layering.strategy":"NETWORK_SIMPLEX"}` |
| `LONGEST_PATH_SOURCE` | 从源点决定最少层数 | `{"org.eclipse.elk.layered.layering.strategy":"LONGEST_PATH_SOURCE"}` |
| `LONGEST_PATH_SINK` | 从汇点决定最少层数 | `{"org.eclipse.elk.layered.layering.strategy":"LONGEST_PATH_SINK"}` |
| `COFFMAN_GRAHAM` | 需要限制每层节点数 | `{"org.eclipse.elk.layered.layering.strategy":"COFFMAN_GRAHAM"}` |
| `MIN_WIDTH` | 需要控制最大层宽 | `{"org.eclipse.elk.layered.layering.strategy":"MIN_WIDTH"}` |
| `INTERACTIVE` | 增量布局，根据旧坐标恢复层 | `{"org.eclipse.elk.layered.layering.strategy":"INTERACTIVE"}` |

关键约束：

```json
{
  "org.eclipse.elk.layered.layering.layerConstraint": "FIRST"
}
```

可选 `FIRST`、`FIRST_SEPARATE`、`LAST`、`LAST_SEPARATE`。

## 交叉最小化

默认 `LAYER_SWEEP`。可选：

- `MEDIAN_LAYER_SWEEP`
- `INTERACTIVE`
- `NONE`

如果输入顺序必须稳定，优先配置：

```json
{
  "org.eclipse.elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
  "org.eclipse.elk.layered.crossingMinimization.semiInteractive": true
}
```

`greedySwitch` 是 P3 后处理，不是主策略。阈值过高或拓扑太复杂时，收益可能不明显。

Greedy switch 的保守配置：

```json
{
  "org.eclipse.elk.layered.crossingMinimization.greedySwitch.type": "ONE_SIDED",
  "org.eclipse.elk.layered.crossingMinimization.greedySwitch.activationThreshold": 20
}
```

## 节点放置

| 值 | 特点 | 示例 |
| --- | --- | --- |
| `BRANDES_KOEPF` | 默认，四向对齐并平衡 | `{"org.eclipse.elk.layered.nodePlacement.strategy":"BRANDES_KOEPF"}` |
| `NETWORK_SIMPLEX` | 适合间距/边长目标明确的图 | `{"org.eclipse.elk.layered.nodePlacement.strategy":"NETWORK_SIMPLEX"}` |
| `LINEAR_SEGMENTS` | 基于线性段移动 | `{"org.eclipse.elk.layered.nodePlacement.strategy":"LINEAR_SEGMENTS"}` |
| `SIMPLE` | 快速堆叠，主要用于调试 | `{"org.eclipse.elk.layered.nodePlacement.strategy":"SIMPLE"}` |
| `INTERACTIVE` | 尽量保持已有位置 | `{"org.eclipse.elk.layered.nodePlacement.strategy":"INTERACTIVE"}` |

## 端口与跨层级

```json
{
  "org.eclipse.elk.portConstraints": "FIXED_SIDE"
}
```

端口越自由，P3/P4/P5 可选空间越大。端口完全固定时，交叉和折线可能增加。

跨层级：

```ts
layoutElkJson(input, {
  hierarchyHandling: "INCLUDE_CHILDREN",
});
```

或让子容器 `SEPARATE_CHILDREN`，保留独立方向与局部布局。

## 分区与模型顺序

分区适合“固定列”，不适合逐节点锁死：

```json
{
  "org.eclipse.elk.partitioning.activate": true
}
```

节点写：

```json
{
  "org.eclipse.elk.partitioning.partition": 0
}
```

同一 partition 会被放进同一分区。分区号不是绝对坐标，仍然需要 P3/P4 决定层内位置。

## 增量布局四件套

```json
{
  "org.eclipse.elk.interactiveLayout": true,
  "org.eclipse.elk.layered.layering.strategy": "INTERACTIVE",
  "org.eclipse.elk.layered.cycleBreaking.strategy": "INTERACTIVE",
  "org.eclipse.elk.layered.crossingMinimization.semiInteractive": true
}
```

节点旧位置通过 `org.eclipse.elk.position` 或输入 `x/y` 提供。

## 相关官方页面

- [ELK Layered](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)
- [Cycle Breaking Strategy](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-cycleBreaking-strategy.html)
- [Node Layering Strategy](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-layering-strategy.html)
- [Crossing Minimization Strategy](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-crossingMinimization-strategy.html)
- [Node Placement Strategy](https://eclipse.dev/elk/reference/options/org-eclipse-elk-layered-nodePlacement-strategy.html)
- [Edge Routing](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html)
