# 约束与稳定顺序

## 四种“固定”要分开

| 需求 | 工具 |
| --- | --- |
| 固定节点在某一层 | `layering.layerConstraint` |
| 固定节点在层内顺序 | `crossingMinimization.positionChoiceConstraint` |
| 固定节点在某一列/分区 | `partitioning.activate` + `partition` |
| 固定绝对坐标 | `fixed` 算法或 `org.eclipse.elk.position` |

前三种仍让布局器计算几何；第四种会放弃自动布局。

## Layer constraint

```json
{
  "org.eclipse.elk.layered.layering.layerConstraint": "FIRST"
}
```

| 值 | 含义 |
| --- | --- |
| `FIRST` | 最前层，可与其它 FIRST 同层 |
| `FIRST_SEPARATE` | 独占最前层 |
| `LAST` | 最后层，可与其它 LAST 同层 |
| `LAST_SEPARATE` | 独占最后层 |

## Partition

```json
{
  "org.eclipse.elk.partitioning.activate": true
}
```

节点：

```json
{
  "org.eclipse.elk.partitioning.partition": 1
}
```

同一 partition 会被约束在同一列/行，适合泳道和固定分组。不要给每个节点单独编号，否则图会退化成
一条长链。

## 模型顺序

```json
{
  "org.eclipse.elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES"
}
```

| 值 | 侧重点 |
| --- | --- |
| `NONE` | 完全由算法优化 |
| `NODES_AND_EDGES` | 节点和边共同保留输入顺序 |
| `PREFER_NODES` | 更偏节点顺序 |
| `PREFER_EDGES` | 更偏边顺序 |

## 半交互顺序

```json
{
  "org.eclipse.elk.layered.crossingMinimization.semiInteractive": true
}
```

节点 `org.eclipse.elk.position` 的顺序会成为 P3 的强提示。适合编辑器新增节点、拖动后局部稳定。

## 端口约束

固定侧边但允许滑动：

```json
{
  "org.eclipse.elk.portConstraints": "FIXED_SIDE"
}
```

完全固定位置：

```json
{
  "org.eclipse.elk.portConstraints": "FIXED_POS"
}
```

优先使用 `FIXED_SIDE`。`FIXED_POS` 会把路由自由度压到最小。
