# Box

Box 用于**没有边的盒子集合**。它不会根据连接关系排名，只负责把尺寸不同的矩形紧凑装箱。

```json
{
  "org.eclipse.elk.algorithm": "box",
  "org.eclipse.elk.aspectRatio": 1.3,
  "org.eclipse.elk.spacing.nodeNode": 15,
  "org.eclipse.elk.padding": 15
}
```

## 行为

- 忽略边；
- 默认按节点面积从小到大排列；
- 从左到右放行，超过目标宽度后换行；
- `interactive: true` 时优先保持输入的纵向/横向顺序；
- 当前移植实现支持 `packingMode: SIMPLE`。

## 参数

示例列是可直接放入 `layoutOptions` 的片段。

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.box.packingMode` | `SIMPLE` | 当前移植仅支持简单装箱模式 | `{"org.eclipse.elk.box.packingMode":"SIMPLE"}` |
| `org.eclipse.elk.aspectRatio` | `1.3` | 目标宽高比 | `{"org.eclipse.elk.aspectRatio":1.6}` |
| `org.eclipse.elk.spacing.nodeNode` | `15` | 盒间距 | `{"org.eclipse.elk.spacing.nodeNode":20}` |
| `org.eclipse.elk.padding` | `15` | 四周留白 | `{"org.eclipse.elk.padding":20}` |
| `org.eclipse.elk.expandNodes` | `false` | 是否把节点扩到行宽/行高 | `{"org.eclipse.elk.expandNodes":true}` |
| `org.eclipse.elk.interactive` | `false` | 是否按输入位置稳定排序 | `{"org.eclipse.elk.interactive":true}` |
| `org.eclipse.elk.priority` | `0` | 节点排序优先级，越大越靠前 | `{"org.eclipse.elk.priority":10}` |
| `org.eclipse.elk.nodeSize.constraints` | `[]` | 允许的最小尺寸约束 | `{"org.eclipse.elk.nodeSize.constraints":["MINIMUM_SIZE"]}` |
| `org.eclipse.elk.nodeSize.minimum` | `(0, 0)` | 有 `MINIMUM_SIZE` 约束时的最小尺寸 | `{"org.eclipse.elk.nodeSize.minimum":{"x":160,"y":96}}` |

## 参数组合示例

下面的节点既会优先参与排序，也保证不会被压缩到 `160 × 96` 以下：

```ts
const child = {
  id: "important-card",
  width: 180,
  height: 96,
  layoutOptions: {
    "org.eclipse.elk.priority": 10,
    "org.eclipse.elk.nodeSize.constraints": ["MINIMUM_SIZE"],
    "org.eclipse.elk.nodeSize.minimum": { x: 160, y: 96 },
  },
};
```

## 什么时候选 Box

- 仪表盘卡片，没有连接关系；
- 图例或资源面板；
- 多个独立面板的初始堆放；
- 作为父图中的黑盒子图。

有连接关系时选 Layered；需要严格保持输入顺序时选 Rectpacking。

## 官方参考

- [ELK Box](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-box.html)
- [Aspect Ratio](https://eclipse.dev/elk/reference/options/org-eclipse-elk-aspectRatio.html)
- [Box Layout Mode](https://eclipse.dev/elk/reference/options/org-eclipse-elk-box-packingMode.html)
