# Force / Stress

Force 和 Stress 都用连续空间关系表达图，不产生明显的“层”。

## Force

Force 采用物理模拟：

- 节点互相排斥；
- 边像弹簧把节点拉近；
- 迭代次数和温度控制收敛。

```json
{
  "org.eclipse.elk.algorithm": "force",
  "org.eclipse.elk.force.model": "FRUCHTERMAN_REINGOLD",
  "org.eclipse.elk.spacing.nodeNode": 80
}
```

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.force.model` | `FRUCHTERMAN_REINGOLD` | 也可选 `EADES` | `{"org.eclipse.elk.force.model":"EADES"}` |
| `org.eclipse.elk.force.iterations` | `300` | 迭代次数 | `{"org.eclipse.elk.force.iterations":500}` |
| `org.eclipse.elk.force.repulsion` | `5` | 排斥强度 | `{"org.eclipse.elk.force.repulsion":8}` |
| `org.eclipse.elk.force.repulsivePower` | `0` | 非零时使用幂律排斥 | `{"org.eclipse.elk.force.repulsivePower":2}` |
| `org.eclipse.elk.force.temperature` | `0.001` | 初始温度 | `{"org.eclipse.elk.force.temperature":0.005}` |
| `org.eclipse.elk.spacing.nodeNode` | `80` | 间距 | `{"org.eclipse.elk.spacing.nodeNode":100}` |
| `org.eclipse.elk.padding` | `50` | 图留白 | `{"org.eclipse.elk.padding":60}` |

## Stress

Stress 不模拟每一步物理运动，而是让屏幕距离尽量匹配图论距离。

```json
{
  "org.eclipse.elk.algorithm": "stress",
  "org.eclipse.elk.stress.desiredEdgeLength": 100
}
```

| 选项 | 默认 | 含义 | 示例 |
| --- | ---: | --- | --- |
| `org.eclipse.elk.stress.desiredEdgeLength` | `100` | 目标边长 | `{"org.eclipse.elk.stress.desiredEdgeLength":140}` |
| `org.eclipse.elk.stress.dimension` | `XY` | `X` / `Y` / `XY` | `{"org.eclipse.elk.stress.dimension":"XY"}` |
| `org.eclipse.elk.stress.epsilon` | `0.0001` | 收敛阈值 | `{"org.eclipse.elk.stress.epsilon":0.00001}` |
| `org.eclipse.elk.stress.iterationLimit` | `2147483647` | 最大迭代 | `{"org.eclipse.elk.stress.iterationLimit":1000}` |
| `org.eclipse.elk.stress.fixed` | `false` | 是否固定部分节点 | `{"org.eclipse.elk.stress.fixed":true}` |

## 选择

- 关系网络、风格化视图：Force；
- 需要更均匀的距离结构：Stress；
- 阅读顺序必须明确：Layered。

## Force 参数组合示例

```ts
const output = layoutElkJson({
  id: "network",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "force",
    "org.eclipse.elk.force.model": "FRUCHTERMAN_REINGOLD",
    "org.eclipse.elk.force.iterations": 500,
    "org.eclipse.elk.force.repulsion": 8,
    "org.eclipse.elk.force.temperature": 0.005,
    "org.eclipse.elk.spacing.nodeNode": 100,
    "org.eclipse.elk.padding": 60,
  },
  children: [
    { id: "a", width: 100, height: 50 },
    { id: "b", width: 100, height: 50 },
    { id: "c", width: 100, height: 50 },
  ],
  edges: [
    { id: "ab", sources: ["a"], targets: ["b"] },
    { id: "bc", sources: ["b"], targets: ["c"] },
  ],
});
```

## Stress 参数组合示例

```ts
const output = layoutElkJson({
  id: "distance-map",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "stress",
    "org.eclipse.elk.stress.desiredEdgeLength": 140,
    "org.eclipse.elk.stress.epsilon": 0.00001,
    "org.eclipse.elk.stress.iterationLimit": 1000,
  },
  children: [
    { id: "a", width: 100, height: 50 },
    { id: "b", width: 100, height: 50 },
  ],
  edges: [{ id: "ab", sources: ["a"], targets: ["b"] }],
});
```

## 官方参考

- [ELK Force](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-force.html)
- [ELK Stress](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-stress.html)
