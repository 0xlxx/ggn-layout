# Top-down Packing

Top-down Packing 针对固定尺寸盒子，从左到右、从上到下放置，并尽量扩展横向空白。

```json
{
  "org.eclipse.elk.algorithm": "topdownpacking",
  "org.eclipse.elk.spacing.nodeNode": 20,
  "org.eclipse.elk.padding": 12
}
```

## 参数

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.spacing.nodeNode` | `20` | 盒间距 | `{"org.eclipse.elk.spacing.nodeNode":24}` |
| `org.eclipse.elk.padding` | `12` | 留白 | `{"org.eclipse.elk.padding":16}` |
| `org.eclipse.elk.topdownpacking.nodeArrangement.strategy` | `LEFT_RIGHT_TOP_DOWN_NODE_PLACER` | 摆放顺序 | `{"org.eclipse.elk.topdownpacking.nodeArrangement.strategy":"LEFT_RIGHT_TOP_DOWN_NODE_PLACER"}` |
| `org.eclipse.elk.topdownpacking.whitespaceElimination.strategy` | `BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR` | 底行留白处理 | `{"org.eclipse.elk.topdownpacking.whitespaceElimination.strategy":"BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR"}` |
| `org.eclipse.elk.topdown.hierarchicalNodeWidth` | `150` | 层级节点建议宽度 | `{"org.eclipse.elk.topdown.hierarchicalNodeWidth":180}` |
| `org.eclipse.elk.topdown.hierarchicalNodeAspectRatio` | `1.414` | 层级节点建议比例 | `{"org.eclipse.elk.topdown.hierarchicalNodeAspectRatio":1.5}` |

## 适合什么

- 固定尺寸卡片按网格排列；
- 需要横向扩张填满容器；
- 作为 Top-down Layout 的并行节点放置器；
- 简单的架构矩阵。

不需要横向扩张时，Rectpacking 的压缩能力通常更合适。

## 参数组合示例

```ts
const output = layoutElkJson({
  id: "matrix",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "topdownpacking",
    "org.eclipse.elk.spacing.nodeNode": 24,
    "org.eclipse.elk.padding": 16,
    "org.eclipse.elk.topdown.hierarchicalNodeWidth": 180,
    "org.eclipse.elk.topdown.hierarchicalNodeAspectRatio": 1.5,
  },
  children: [
    { id: "a", width: 160, height: 100 },
    { id: "b", width: 160, height: 100 },
    { id: "c", width: 160, height: 100 },
  ],
});
```

## 官方参考

- [ELK Top-down Packing](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-topdownpacking.html)
