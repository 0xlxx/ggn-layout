# 核心参数地图

完整键表见 [ELK 布局选项接口参考](https://github.com/0xlxx/ggn-layout/blob/main/docs/reference/elk-layout-options.md)。本页按“它影响哪一步”组织，
便于定位问题。

## 键名与优先级

规范键：

```text
org.eclipse.elk.layered.layering.strategy
```

兼容短键：

```text
elk.layered.layering.strategy
```

读取优先级：

1. 节点 / 边自身 `layoutOptions`；
2. 元素 `properties`；
3. 父图或根图的继承值；
4. 算法默认值。

入口选项 `layoutElkJson(input, options)` 中的 `layoutOptions` 覆盖输入根图上的同名值。

## 示例写法

下面是参数片段，直接放进对应图、节点、端口或边的 `layoutOptions`：

```ts
const layoutOptions = {
  "org.eclipse.elk.direction": "RIGHT",
  "org.eclipse.elk.spacing.nodeNode": 32,
};
```

## Core：所有算法共享

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.direction` | `UNDEFINED` | 主阅读方向 | `{"org.eclipse.elk.direction":"RIGHT"}` |
| `org.eclipse.elk.edgeRouting` | `ORTHOGONAL` | 边路由形态 | `{"org.eclipse.elk.edgeRouting":"SPLINES"}` |
| `org.eclipse.elk.padding` | `12` 或算法覆盖 | 图/容器内边距 | `{"org.eclipse.elk.padding":{"top":24,"left":16,"right":16,"bottom":24}}` |
| `org.eclipse.elk.spacing.nodeNode` | `20` 或算法覆盖 | 同层节点间距 | `{"org.eclipse.elk.spacing.nodeNode":32}` |
| `org.eclipse.elk.spacing.edgeNode` | `10` | 边与节点最小距离 | `{"org.eclipse.elk.spacing.edgeNode":20}` |
| `org.eclipse.elk.spacing.edgeEdge` | `10` | 边与边最小距离 | `{"org.eclipse.elk.spacing.edgeEdge":12}` |
| `org.eclipse.elk.spacing.edgeLabel` | `2` | 边与标签距离 | `{"org.eclipse.elk.spacing.edgeLabel":6}` |
| `org.eclipse.elk.aspectRatio` | 算法相关 | 目标宽高比 | `{"org.eclipse.elk.aspectRatio":1.6}` |
| `org.eclipse.elk.randomSeed` | `1` | 随机种子 | `{"org.eclipse.elk.randomSeed":42}` |
| `org.eclipse.elk.separateConnectedComponents` | `true` | 是否拆分连通分量 | `{"org.eclipse.elk.separateConnectedComponents":false}` |
| `org.eclipse.elk.interactiveLayout` | `false` | 是否利用旧坐标 | `{"org.eclipse.elk.interactiveLayout":true}` |
| `org.eclipse.elk.hierarchyHandling` | 继承 | `INCLUDE_CHILDREN` / `SEPARATE` | `{"org.eclipse.elk.hierarchyHandling":"INCLUDE_CHILDREN"}` |
| `org.eclipse.elk.portConstraints` | `UNDEFINED` | 端口约束 | `{"org.eclipse.elk.portConstraints":"FIXED_SIDE"}` |
| `org.eclipse.elk.partitioning.activate` | `false` | 是否启用分区 | `{"org.eclipse.elk.partitioning.activate":true}` |
| `org.eclipse.elk.partitioning.partition` | 未定义 | 节点所属分区 | `{"org.eclipse.elk.partitioning.partition":1}` |
| `org.eclipse.elk.hypernode` | `false` | 节点是否作为 P5 汇流点移动 | `{"org.eclipse.elk.hypernode":true}` |

## 尺寸与标签

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `nodeSize.constraints` | `[]` | `MINIMUM_SIZE`、`NODE_LABELS`、`PORTS` 等 | `{"org.eclipse.elk.nodeSize.constraints":["NODE_LABELS"]}` |
| `nodeSize.minimum` | `{x:0,y:0}` | 最小尺寸，必须使用 `x/y` | `{"org.eclipse.elk.nodeSize.minimum":{"x":160,"y":64}}` |
| `nodeSize.options` | `[]` | 尺寸计算选项，如 `ASYMMETRICAL` | `{"org.eclipse.elk.nodeSize.options":["ASYMMETRICAL"]}` |
| `nodeSize.fixedGraphSize` | `false` | 是否禁止根图扩展 | `{"org.eclipse.elk.nodeSize.fixedGraphSize":true}` |
| `nodeLabels.placement` | `fixed` | `INSIDE/OUTSIDE`、水平与垂直位置组合 | `{"org.eclipse.elk.nodeLabels.placement":["INSIDE","H_CENTER","V_TOP"]}` |
| `nodeLabels.padding` | `5` | 标签到节点边界距离 | `{"org.eclipse.elk.nodeLabels.padding":{"top":8,"left":8,"right":8,"bottom":8}}` |
| `portLabels.placement` | `OUTSIDE` | 端口标签位置 | `{"org.eclipse.elk.portLabels.placement":["OUTSIDE"]}` |

只有同时配置 `nodeSize.constraints: ["NODE_LABELS"]` 和 `nodeLabels.placement`，
节点尺寸才会稳定地包含标签。

## P1：断环

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `layered.cycleBreaking.strategy` | `GREEDY` | 反转最少回边的策略 | `{"org.eclipse.elk.layered.cycleBreaking.strategy":"GREEDY_MODEL_ORDER"}` |
| `layered.feedbackEdges` | `false` | 是否把反向端口视为反馈边 | `{"org.eclipse.elk.layered.feedbackEdges":true}` |

## P2：分层

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `layered.layering.strategy` | `NETWORK_SIMPLEX` | 层分配策略 | `{"org.eclipse.elk.layered.layering.strategy":"LONGEST_PATH_SOURCE"}` |
| `layered.layering.layerConstraint` | `NONE` | `FIRST/LAST/...` 硬约束 | `{"org.eclipse.elk.layered.layering.layerConstraint":"FIRST_SEPARATE"}` |
| `layered.layering.layerChoiceConstraint` | 未定义 | 指定候选层 | `{"org.eclipse.elk.layered.layering.layerChoiceConstraint":2}` |
| `layered.layering.nodePromotion.strategy` | `NONE` | 提升节点减少长边；当前移植仅 `NONE` 有稳定行为 | `{"org.eclipse.elk.layered.layering.nodePromotion.strategy":"NONE"}` |
| `layered.layering.nodePromotion.maxIterations` | `0` | 提升迭代上限；启用具体策略后才可能生效 | `{"org.eclipse.elk.layered.layering.nodePromotion.maxIterations":10}` |
| `layered.layering.coffmanGraham.layerBound` | `MAX_INT` | 每层最大节点数 | `{"org.eclipse.elk.layered.layering.coffmanGraham.layerBound":4}` |
| `layered.layering.minWidth.upperBoundOnWidth` | `4` | MinWidth 层宽上限 | `{"org.eclipse.elk.layered.layering.minWidth.upperBoundOnWidth":6}` |

## P3：交叉最小化

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `layered.crossingMinimization.strategy` | `LAYER_SWEEP` | 主策略 | `{"org.eclipse.elk.layered.crossingMinimization.strategy":"MEDIAN_LAYER_SWEEP"}` |
| `layered.crossingMinimization.semiInteractive` | `false` | 保留输入层内顺序 | `{"org.eclipse.elk.layered.crossingMinimization.semiInteractive":true}` |
| `layered.crossingMinimization.forceNodeModelOrder` | `false` | 强制执行模型顺序 | `{"org.eclipse.elk.layered.crossingMinimization.forceNodeModelOrder":true}` |
| `layered.crossingMinimization.greedySwitch.type` | `TWO_SIDED` | P3 后处理 | `{"org.eclipse.elk.layered.crossingMinimization.greedySwitch.type":"ONE_SIDED"}` |
| `...greedySwitch.activationThreshold` | `40` | 超过该节点数后可能关闭 | `{"org.eclipse.elk.layered.crossingMinimization.greedySwitch.activationThreshold":20}` |
| `layered.considerModelOrder.strategy` | `NONE` | 输入节点/边的排序权重 | `{"org.eclipse.elk.layered.considerModelOrder.strategy":"NODES_AND_EDGES"}` |

## P4：节点放置

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `layered.nodePlacement.strategy` | `BRANDES_KOEPF` | 坐标分配 | `{"org.eclipse.elk.layered.nodePlacement.strategy":"NETWORK_SIMPLEX"}` |
| `layered.nodePlacement.favorStraightEdges` | 自动 | 更偏直边而非平衡 | `{"org.eclipse.elk.layered.nodePlacement.favorStraightEdges":true}` |
| `...bk.fixedAlignment` | `NONE` | BK 固定对齐方向 | `{"org.eclipse.elk.layered.nodePlacement.bk.fixedAlignment":"BALANCED"}` |
| `...bk.edgeStraightening` | `IMPROVE_STRAIGHTNESS` | 直边后处理 | `{"org.eclipse.elk.layered.nodePlacement.bk.edgeStraightening":"NONE"}` |
| `...networkSimplex.nodeFlexibility` | `NONE` | 节点尺寸弹性 | `{"org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility":"NODE_SIZE"}` |
| `...nodeFlexibility.recomputeNodePlacement` | 未定义 | 第二遍放置 | `{"org.eclipse.elk.layered.nodePlacement.networkSimplex.nodeFlexibility.recomputeNodePlacement":"BRANDES_KOEPF"}` |

## P5：边路由

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `edgeRouting` | `ORTHOGONAL` | `ORTHOGONAL/POLYLINE/SPLINES` | `{"org.eclipse.elk.edgeRouting":"POLYLINE"}` |
| `layered.edgeRouting.splines.mode` | `SLOPPY` | Spline 模式 | `{"org.eclipse.elk.layered.edgeRouting.splines.mode":"CONSERVATIVE"}` |
| `...splines.sloppy.layerSpacingFactor` | `0.2` | 宽松样条层距 | `{"org.eclipse.elk.layered.edgeRouting.splines.sloppy.layerSpacingFactor":0.35}` |
| `...selfLoopDistribution` | `NORTH` | 自环分布 | `{"org.eclipse.elk.layered.edgeRouting.selfLoopDistribution":"NORTH_SOUTH"}` |
| `...selfLoopOrdering` | `STACKED` | 自环排序 | `{"org.eclipse.elk.layered.edgeRouting.selfLoopOrdering":"SEQUENCED"}` |
| `layered.mergeEdges` | `false` | 合并共享端点收集端口 | `{"org.eclipse.elk.layered.mergeEdges":true}` |
| `layered.unnecessaryBendpoints` | `false` | 是否保留可省略弯点 | `{"org.eclipse.elk.layered.unnecessaryBendpoints":true}` |

## 间距

`spacing.nodeNode` 是层内基础间距。`layered.spacing.nodeNodeBetweenLayers` 是层间距离。

其余间距经常由 `LayeredSpacingsBuilder` 按基准比例派生：

```text
edgeEdge          = 10 / 20
edgeNode          = 10 / 20
edgeLabel         = 2 / 20
portPort          = 10 / 20
nodeNodeBetween...= 20 / 20
```

当前 JSON 公共配置应直接写具体间距键。`LayeredSpacingsBuilder` 是内部派生机制，不是自动对外的
`spacing.baseValue` 快捷入口；需要精调时明确设置 `spacing.edgeNode`、`spacing.edgeEdge` 等键。

## 层级与 compound

| 选项 | 含义 | 示例 |
| --- | --- | --- |
| `hierarchyHandling: INCLUDE_CHILDREN` | 父子图参与同一次布局 | `{"org.eclipse.elk.hierarchyHandling":"INCLUDE_CHILDREN"}` |
| `hierarchyHandling: SEPARATE` | 子图独立布局 | `{"org.eclipse.elk.hierarchyHandling":"SEPARATE"}` |
| `mergeHierarchyEdges` | 合并跨层边 | `{"org.eclipse.elk.layered.mergeHierarchyEdges":false}` |
| `insideSelfLoops.activate` | 允许边穿过节点内部形成自环 | `{"org.eclipse.elk.insideSelfLoops.activate":true}` |

## 交互与输出

| 选项 | 含义 | 示例 |
| --- | --- | --- |
| `org.eclipse.elk.position` | 旧位置，供交互布局恢复 | `{"org.eclipse.elk.position":"(120, 80)"}` |
| `layered.generatePositionAndLayerIds` | 输出 `layerId` / `positionId` | `{"org.eclipse.elk.layered.generatePositionAndLayerIds":true}` |
| `json.shapeCoords` | `PARENT` / `ROOT` | `{"org.eclipse.elk.json.shapeCoords":"ROOT"}` |
| `json.edgeCoords` | `CONTAINER` / `PARENT` / `ROOT` | `{"org.eclipse.elk.json.edgeCoords":"ROOT"}` |

## 完整参考

- [本项目完整键与默认值](https://github.com/0xlxx/ggn-layout/blob/main/docs/reference/elk-layout-options.md)
- [ELK Layout Options](https://eclipse.dev/elk/reference/options.html)
