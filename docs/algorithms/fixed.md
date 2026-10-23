# Fixed

Fixed 不做自动布局。它把输入坐标和可选弯点复制到输出，适合回放设计稿、编辑器手摆结果或测试。

```json
{
  "id": "root",
  "layoutOptions": {
    "org.eclipse.elk.algorithm": "fixed"
  },
  "children": [
    {
      "id": "a",
      "width": 120,
      "height": 48,
      "layoutOptions": {
        "org.eclipse.elk.position": "(40, 60)"
      }
    }
  ]
}
```

## 参数

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.position` | 无 | 节点绝对位置，支持对象或字符串 | `{"org.eclipse.elk.position":"(40, 60)"}` |
| `org.eclipse.elk.bendPoints` | 无 | 边折点 | `{"org.eclipse.elk.bendPoints":[{"x":100,"y":60},{"x":160,"y":60}]}` |
| `org.eclipse.elk.edgeRouting` | 继承 | 为 `ORTHOGONAL` 且存在弯点时生成 junction points | `{"org.eclipse.elk.edgeRouting":"ORTHOGONAL"}` |
| `org.eclipse.elk.nodeSize.constraints` | `[]` | 允许最小尺寸约束 | `{"org.eclipse.elk.nodeSize.constraints":["MINIMUM_SIZE"]}` |
| `org.eclipse.elk.nodeSize.minimum` | `(0, 0)` | 配合 `MINIMUM_SIZE` 使用 | `{"org.eclipse.elk.nodeSize.minimum":{"x":120,"y":48}}` |
| `org.eclipse.elk.nodeSize.fixedGraphSize` | `false` | `true` 时不自动扩大根图尺寸 | `{"org.eclipse.elk.nodeSize.fixedGraphSize":true}` |
| `org.eclipse.elk.padding` | `15` | 根图留白 | `{"org.eclipse.elk.padding":20}` |

没有 `position` 的元素保持原值，不会被自动挪到 `(0,0)`。

## 适用场景

- 设计稿逐像素回放；
- 用户拖拽后只更新部分坐标；
- 需要验证上层图形库的渲染；
- 作为其他布局算法的“已有坐标输入”。

Fixed 不会修复重叠，也不会重新路由边。它只忠实保留。

## 参数组合示例

```ts
const output = layoutElkJson({
  id: "root",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "fixed",
    "org.eclipse.elk.edgeRouting": "ORTHOGONAL",
    "org.eclipse.elk.padding": 20,
  },
  children: [
    {
      id: "a",
      width: 120,
      height: 48,
      layoutOptions: { "org.eclipse.elk.position": "(40, 60)" },
    },
    {
      id: "b",
      width: 120,
      height: 48,
      layoutOptions: { "org.eclipse.elk.position": "(240, 60)" },
    },
  ],
  edges: [
    {
      id: "a-b",
      sources: ["a"],
      targets: ["b"],
      layoutOptions: {
        "org.eclipse.elk.bendPoints": [
          { x: 160, y: 84 },
          { x: 240, y: 84 },
        ],
      },
    },
  ],
});
```

## 官方参考

- [ELK Fixed](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-fixed.html)
