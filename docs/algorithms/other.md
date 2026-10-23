# 其他算法

## VertiFlex

树布局，但允许节点显式指定垂直位置。边通常连接父与直接子。

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.vertiflex.verticalConstraint` | `0` | 固定垂直位置 | `{"org.eclipse.elk.vertiflex.verticalConstraint":120}` |
| `org.eclipse.elk.vertiflex.layoutStrategy` | `STRAIGHT` | `STRAIGHT` / `BEND` | `{"org.eclipse.elk.vertiflex.layoutStrategy":"BEND"}` |
| `org.eclipse.elk.vertiflex.layerDistance` | `50` | 层距 | `{"org.eclipse.elk.vertiflex.layerDistance":80}` |
| `org.eclipse.elk.vertiflex.considerNodeModelOrder` | `true` | 是否保留模型顺序 | `{"org.eclipse.elk.vertiflex.considerNodeModelOrder":false}` |

```ts
layoutElkJson({
  id: "tree",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "vertiflex",
    "org.eclipse.elk.vertiflex.layerDistance": 80,
  },
  children: [
    { id: "root", width: 100, height: 40 },
    {
      id: "leaf",
      width: 100,
      height: 40,
      layoutOptions: { "org.eclipse.elk.vertiflex.verticalConstraint": 120 },
    },
  ],
  edges: [{ id: "root-leaf", sources: ["root"], targets: ["leaf"] }],
});
```

## DisCo

DisCo 处理未连接分量，重点是把多个组件压实成一个整体。

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `org.eclipse.elk.disco.componentCompaction.strategy` | `POLYOMINO` | 组件压实策略 | `{"org.eclipse.elk.disco.componentCompaction.strategy":"POLYOMINO"}` |
| `org.eclipse.elk.disco.componentCompaction.componentLayoutAlgorithm` | 未定义 | 可先指定组件内部算法 | `{"org.eclipse.elk.disco.componentCompaction.componentLayoutAlgorithm":"layered"}` |
| `org.eclipse.elk.alg.common.compaction.polyomino.fill` | `true` | 是否填充多联骨牌 | `{"org.eclipse.elk.alg.common.compaction.polyomino.fill":false}` |
| `...polyomino.traversalStrategy` | `QUADRANTS_LINE_BY_LINE` | 遍历策略 | `{"org.eclipse.elk.alg.common.compaction.polyomino.traversalStrategy":"SPIRAL"}` |

```ts
layoutElkJson({
  id: "components",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "disco",
    "org.eclipse.elk.spacing.componentComponent": 28,
    "org.eclipse.elk.alg.common.compaction.polyomino.fill": true,
  },
  children: [
    { id: "a", width: 100, height: 50 },
    { id: "b", width: 120, height: 60 },
  ],
});
```

## SPOrE Overlap

用于消除已有重叠，不负责生成初始布局。

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.overlapRemoval.maxIterations` | `64` | 最大轮数 | `{"org.eclipse.elk.overlapRemoval.maxIterations":128}` |
| `org.eclipse.elk.overlapRemoval.runScanline` | `true` | 是否扫描线复查 | `{"org.eclipse.elk.overlapRemoval.runScanline":false}` |
| `org.eclipse.elk.structure.structureExtractionStrategy` | `DELAUNAY_TRIANGULATION` | 结构提取 | `{"org.eclipse.elk.structure.structureExtractionStrategy":"DELAUNAY_TRIANGULATION"}` |

```ts
layoutElkJson({
  id: "overlap",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "sporeoverlap",
    "org.eclipse.elk.overlapRemoval.maxIterations": 128,
  },
  children: [
    { id: "a", width: 100, height: 60, x: 20, y: 20 },
    { id: "b", width: 100, height: 60, x: 50, y: 40 },
  ],
});
```

## SPOrE Compaction

保持拓扑，把已有布局压紧。

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.processingOrder.treeConstruction` | `MINIMUM_SPANNING_TREE` | 生成树策略 | `{"org.eclipse.elk.processingOrder.treeConstruction":"MAXIMUM_SPANNING_TREE"}` |
| `org.eclipse.elk.processingOrder.spanningTreeCostFunction` | `CIRCLE_UNDERLAP` | 成本函数 | `{"org.eclipse.elk.processingOrder.spanningTreeCostFunction":"CENTER_DISTANCE"}` |
| `org.eclipse.elk.processingOrder.rootSelection` | `CENTER_NODE` | 根选择 | `{"org.eclipse.elk.processingOrder.rootSelection":"FIXED"}` |
| `org.eclipse.elk.compaction.compactionStrategy` | `DEPTH_FIRST` | 压实策略 | `{"org.eclipse.elk.compaction.compactionStrategy":"DEPTH_FIRST"}` |
| `org.eclipse.elk.compaction.orthogonal` | `false` | 是否正交压实 | `{"org.eclipse.elk.compaction.orthogonal":true}` |

```ts
layoutElkJson({
  id: "compact",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "sporecompaction",
    "org.eclipse.elk.processingOrder.rootSelection": "CENTER_NODE",
    "org.eclipse.elk.compaction.orthogonal": true,
  },
  children: [
    { id: "a", width: 100, height: 60 },
    { id: "b", width: 100, height: 60 },
  ],
});
```

## Random

在画布内随机撒点并生成随机边弯点。它主要用于对照、演示和测试，不应作为产品布局。

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.randomSeed` | `1` | 随机种子 | `{"org.eclipse.elk.randomSeed":42}` |
| `org.eclipse.elk.aspectRatio` | `1.6` | 画布比例 | `{"org.eclipse.elk.aspectRatio":2}` |
| `org.eclipse.elk.spacing.nodeNode` | `20` | 面积与间隔参考 | `{"org.eclipse.elk.spacing.nodeNode":32}` |

```ts
layoutElkJson({
  id: "random",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "random",
    "org.eclipse.elk.randomSeed": 42,
    "org.eclipse.elk.aspectRatio": 2,
  },
  children: [
    { id: "a", width: 80, height: 40 },
    { id: "b", width: 80, height: 40 },
  ],
});
```

## 官方参考

- [ELK VertiFlex](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-vertiflex.html)
- [ELK DisCo](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-disco.html)
- [ELK SPOrE Overlap Removal](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-sporeOverlap.html)
- [ELK SPOrE Compaction](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-sporeCompaction.html)
- [ELK Randomizer](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-random.html)
