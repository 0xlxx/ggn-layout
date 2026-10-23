# 快速开始

## 安装

```sh
npm install ggn-layout
```

普通消费方从包根或 `ggn-layout/api` 导入。只有维护布局器本身时才使用 `ggn-layout/core`。

## 最小布局

```ts
import { layoutElkJson } from "ggn-layout";

const output = layoutElkJson({
  id: "root",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
    "org.eclipse.elk.direction": "RIGHT",
    "org.eclipse.elk.edgeRouting": "ORTHOGONAL",
  },
  children: [
    { id: "A", width: 80, height: 40 },
    { id: "B", width: 80, height: 40 },
  ],
  edges: [{ id: "e", sources: ["A"], targets: ["B"] }],
});

console.log(output.children);
console.log(output.edges?.[0]?.sections);
```

入口是纯函数：不修改输入，返回一份新的 JSON。

## 选择算法

算法写在根图的 `layoutOptions["org.eclipse.elk.algorithm"]`。省略时使用 `layered`。

```ts
const output = layoutElkJson({
  id: "cards",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "rectpacking",
    "org.eclipse.elk.aspectRatio": 1.6,
    "org.eclipse.elk.spacing.nodeNode": 16,
  },
  children: [
    { id: "card-a", width: 180, height: 96 },
    { id: "card-b", width: 180, height: 96 },
    { id: "card-c", width: 180, height: 96 },
  ],
});
```

算法 ID 可以写成短名 `layered`，也可以写成 ELK 规范全名
`org.eclipse.elk.layered`。前缀和大小写由入口统一规范化。

## 嵌套图

父节点的 `children` 表示包含关系。跨层级边放在共同祖先下；也可以全部放在根图，由实现按 LCA 处理。

```ts
const output = layoutElkJson(
  {
    id: "root",
    children: [
      { id: "client", width: 100, height: 48 },
      {
        id: "service",
        children: [
          { id: "api", width: 100, height: 48 },
          { id: "worker", width: 100, height: 48 },
        ],
        layoutOptions: {
          "org.eclipse.elk.padding": { top: 40, left: 16, right: 16, bottom: 16 },
        },
      },
    ],
    edges: [{ id: "request", sources: ["client"], targets: ["api"] }],
  },
  { hierarchyHandling: "INCLUDE_CHILDREN" },
);
```

`INCLUDE_CHILDREN` 让父子图参与同一次布局；`SEPARATE` 让子容器保留独立布局。

## 输出怎么用

节点位置默认相对父节点：

```ts
node.x;
node.y;
node.width;
node.height;
```

边段 `sections[0]` 包含：

```ts
section.startPoint;
section.endPoint;
section.bendPoints;
```

如果你希望节点和边都直接输出全局坐标：

```ts
layoutElkJson(input, {
  layoutOptions: {
    "org.eclipse.elk.json.shapeCoords": "ROOT",
    "org.eclipse.elk.json.edgeCoords": "ROOT",
  },
});
```

## 常用入口选项

| 选项 | 用途 |
| --- | --- |
| `direction` | `RIGHT` / `LEFT` / `DOWN` / `UP` |
| `hierarchyHandling` | `INCLUDE_CHILDREN` / `SEPARATE` / `OFF` |
| `randomSeed` | 确定性随机种子，默认 `1` |
| `responseFormat` | `full` / `concise` / `summary` |
| `control` | 阶段进度与 `AbortSignal` |

更完整的输入和错误语义见 [输入输出契约](/guide/io-contract)。

## 推荐下一站

- 需要理解算法：看 [Layered](/algorithms/layered) 和 [算法选型](/algorithms/)。
- 需要调整结果：看 [核心参数地图](/reference/options)。
- 需要隐藏技巧：看 [Empty / Junction node](/best-practices/empty-junctions)。
