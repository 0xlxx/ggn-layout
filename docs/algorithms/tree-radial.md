# Mr. Tree / Radial

## Mr. Tree

Mr. Tree 先提取树结构，再按父子层级摆放。

```json
{
  "org.eclipse.elk.algorithm": "mrtree",
  "org.eclipse.elk.mrtree.searchOrder": "DFS"
}
```

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `org.eclipse.elk.mrtree.searchOrder` | `DFS` | DFS / BFS | `{"org.eclipse.elk.mrtree.searchOrder":"BFS"}` |
| `org.eclipse.elk.mrtree.weighting` | `MODEL_ORDER` | 子树权重策略 | `{"org.eclipse.elk.mrtree.weighting":"DESCENDANTS"}` |
| `org.eclipse.elk.mrtree.edgeRoutingMode` | `AVOID_OVERLAP` | 边路由方式 | `{"org.eclipse.elk.mrtree.edgeRoutingMode":"MIDDLE_TO_MIDDLE"}` |
| `org.eclipse.elk.mrtree.compaction` | `false` | 是否压缩 | `{"org.eclipse.elk.mrtree.compaction":true}` |
| `org.eclipse.elk.mrtree.treeLevel` | `0` | 当前树层级 | `{"org.eclipse.elk.mrtree.treeLevel":1}` |
| `org.eclipse.elk.mrtree.edgeEndTextureLength` | `7` | 边末端纹理长度 | `{"org.eclipse.elk.mrtree.edgeEndTextureLength":10}` |

适合目录树、组织树、分类树和嵌套资源。

```ts
const output = layoutElkJson({
  id: "tree",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "mrtree",
    "org.eclipse.elk.mrtree.searchOrder": "DFS",
    "org.eclipse.elk.mrtree.weighting": "DESCENDANTS",
    "org.eclipse.elk.mrtree.compaction": true,
  },
  children: [
    { id: "root", width: 120, height: 48 },
    { id: "a", width: 100, height: 40 },
    { id: "b", width: 100, height: 40 },
  ],
  edges: [
    { id: "root-a", sources: ["root"], targets: ["a"] },
    { id: "root-b", sources: ["root"], targets: ["b"] },
  ],
});
```

## Radial

Radial 把根放中心，同层节点放在同心圆上。

```json
{
  "org.eclipse.elk.algorithm": "radial",
  "org.eclipse.elk.radial.centerOnRoot": true
}
```

| 选项 | 默认 | 含义 | 示例 |
| --- | --- | --- | --- |
| `org.eclipse.elk.radial.centerOnRoot` | `false` | 根是否居中 | `{"org.eclipse.elk.radial.centerOnRoot":true}` |
| `org.eclipse.elk.radial.radius` | `0` | 固定半径，0 表示自动 | `{"org.eclipse.elk.radial.radius":240}` |
| `org.eclipse.elk.radial.compactor` | `NONE` | 径向/扇区压实 | `{"org.eclipse.elk.radial.compactor":"RADIAL_COMPACTION"}` |
| `org.eclipse.elk.radial.sorter` | `NONE` | 极角、ID 排序 | `{"org.eclipse.elk.radial.sorter":"POLAR_COORDINATE"}` |
| `org.eclipse.elk.radial.wedgeCriteria` | `NODE_SIZE` | 扇区分配依据 | `{"org.eclipse.elk.radial.wedgeCriteria":"LEAF_NUMBER"}` |
| `org.eclipse.elk.radial.optimizationCriteria` | `NONE` | 旋转优化目标 | `{"org.eclipse.elk.radial.optimizationCriteria":"EDGE_LENGTH"}` |

适合脑图、中心辐射关系和根优先的层级。

```ts
const output = layoutElkJson({
  id: "mindmap",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "radial",
    "org.eclipse.elk.radial.centerOnRoot": true,
    "org.eclipse.elk.radial.radius": 240,
    "org.eclipse.elk.radial.sorter": "POLAR_COORDINATE",
  },
  children: [
    { id: "center", width: 120, height: 48 },
    { id: "a", width: 90, height: 36 },
    { id: "b", width: 90, height: 36 },
  ],
  edges: [
    { id: "center-a", sources: ["center"], targets: ["a"] },
    { id: "center-b", sources: ["center"], targets: ["b"] },
  ],
});
```

## 官方参考

- [ELK Mr. Tree](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-mrtree.html)
- [ELK Radial](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-radial.html)
