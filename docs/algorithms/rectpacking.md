# Rectangle Packing

Rectpacking 用于**无连接矩形**，特点是保持输入顺序，并把矩形排成紧凑的阅读行。

```json
{
  "org.eclipse.elk.algorithm": "rectpacking",
  "org.eclipse.elk.aspectRatio": 1.3,
  "org.eclipse.elk.spacing.nodeNode": 15,
  "org.eclipse.elk.padding": 15
}
```

## 四个阶段

1. 近似目标宽度；
2. 按顺序把矩形放进行；
3. 压缩行内与行间空白；
4. 可横向扩展矩形，填满边界或目标比例。

## 参数

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.aspectRatio` | `1.3` | 目标比例 | `{"org.eclipse.elk.aspectRatio":1.6}` |
| `org.eclipse.elk.spacing.nodeNode` | `15` | 间距 | `{"org.eclipse.elk.spacing.nodeNode":20}` |
| `org.eclipse.elk.padding` | `15` | 留白 | `{"org.eclipse.elk.padding":20}` |
| `org.eclipse.elk.rectpacking.widthApproximation.strategy` | `GREEDY` | 宽度近似策略 | `{"org.eclipse.elk.rectpacking.widthApproximation.strategy":"TARGET_WIDTH"}` |
| `...widthApproximation.targetWidth` | `-1` | 指定目标宽度 | `{"org.eclipse.elk.rectpacking.widthApproximation.targetWidth":960}` |
| `...widthApproximation.optimizationGoal` | `MAX_SCALE_DRIVEN` | 扩展节点时的优化目标 | `{"org.eclipse.elk.rectpacking.widthApproximation.optimizationGoal":"AREA_DRIVEN"}` |
| `...packing.strategy` | `COMPACTION` | 摆放后是否压缩 | `{"org.eclipse.elk.rectpacking.packing.strategy":"SIMPLE"}` |
| `...packing.compaction.iterations` | `1` | 压缩迭代次数 | `{"org.eclipse.elk.rectpacking.packing.compaction.iterations":3}` |
| `...whiteSpaceElimination.strategy` | `NONE` | 空白消除方式 | `{"org.eclipse.elk.rectpacking.whiteSpaceElimination.strategy":"TO_ASPECT_RATIO"}` |
| `...orderBySize` | `false` | 是否按尺寸重排 | `{"org.eclipse.elk.rectpacking.orderBySize":true}` |
| `...inNewRow` | `false` | 该节点是否另起一行 | `{"org.eclipse.elk.rectpacking.inNewRow":true}` |
| `...desiredPosition` | `-1` | 期望顺序 | `{"org.eclipse.elk.rectpacking.desiredPosition":3}` |

## 与 Box 的区别

| Box | Rectpacking |
| --- | --- |
| 更偏简单装箱 | 明确保持输入顺序 |
| 排序按面积/优先级 | 顺序是一等约束 |
| 行压缩简单 | 有宽度近似、压缩、扩展阶段 |

最适合仪表盘、卡片墙和有序资源列表。

## 参数组合示例

```ts
const output = layoutElkJson({
  id: "cards",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "rectpacking",
    "org.eclipse.elk.aspectRatio": 1.6,
    "org.eclipse.elk.spacing.nodeNode": 20,
    "org.eclipse.elk.padding": 20,
    "org.eclipse.elk.rectpacking.widthApproximation.strategy": "TARGET_WIDTH",
    "org.eclipse.elk.rectpacking.widthApproximation.targetWidth": 960,
    "org.eclipse.elk.rectpacking.packing.strategy": "COMPACTION",
  },
  children: [
    { id: "a", width: 280, height: 140 },
    { id: "b", width: 280, height: 180 },
    {
      id: "c",
      width: 280,
      height: 140,
      layoutOptions: { "org.eclipse.elk.rectpacking.inNewRow": true },
    },
  ],
});
```

## 官方参考

- [ELK Rectangle Packing](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-rectpacking.html)
