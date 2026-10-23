# Empty / Junction node

这是 Layered 最有价值、也最少被文档提及的技巧之一：

> 用一个普通但不可见的零尺寸节点，把长边拆成两段，从而控制分层、交叉和路由。

它不是 ELK 的专用图元。布局器只把它看成普通节点；上层渲染器可以选择不画它。

## 已验证的最小例子

```ts
import { layoutElkJson } from "ggn-layout";

const output = layoutElkJson({
  id: "root",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "layered",
    "org.eclipse.elk.direction": "RIGHT",
    "org.eclipse.elk.edgeRouting": "ORTHOGONAL",
  },
  children: [
    { id: "A", width: 80, height: 40 },
    { id: "junction", width: 0, height: 0 },
    { id: "B", width: 80, height: 40 },
  ],
  edges: [
    { id: "a-j", sources: ["A"], targets: ["junction"] },
    { id: "j-b", sources: ["junction"], targets: ["B"] },
  ],
});
```

实测结果中：

- `junction` 得到一个真实坐标；
- `A → junction` 和 `junction → B` 各自输出边段；
- 零尺寸节点不会被验证器拒绝；
- 上层只需过滤掉这个节点即可。

## 四个常见用途

### 1. 长边穿过中间层

把 `A → D` 改成：

```text
A → j1 → j2 → D
```

`j1/j2` 可以分别约束到中间层，避免一条边跨越很多层后产生难看的绕行。

### 2. 多对一汇流

多个源先连到同一个 junction，再从 junction 连到目标：

```text
A ─┐
B ─┼→ junction → C
D ─┘
```

这会把“多个箭头挤在目标端口”变成先汇流、再单线进入。

### 3. 人工走廊

在两条本应分开的路径之间放一个零尺寸节点，可以改变局部层宽和端口对齐，让线走统一通道。

### 4. 保持某个方向的最小占位

节点可以是：

```json
{ "id": "spacer", "width": 1, "height": 1 }
```

它几乎不可见，但仍占据一个层内槽位，适合微调节奏。

## 约束 junction 的位置

固定层：

```json
{
  "org.eclipse.elk.layered.layering.layerChoiceConstraint": 2
}
```

固定层内顺序：

```json
{
  "org.eclipse.elk.layered.crossingMinimization.positionChoiceConstraint": 0
}
```

固定绝对位置通常不建议，只有 Fixed 或强交互场景使用。

## Hypernode 是另一种汇流工具

ELK 还提供节点级选项：

```json
{
  "org.eclipse.elk.hypernode": true
}
```

`HypernodesProcessor` 会在 P5 后把 hypernode 移到其入射边的汇合处，并把几何写入 junction 信息。
它适合表达真正的多路汇流点，不是用来微调普通层位的。

选择标准：

- 只需要控制层级或折线路径：使用普通零尺寸节点；
- 多个分支共享一个几何汇流中心：使用 `hypernode: true`；
- 需要完全固定折点：交给 Fixed 或渲染后的 waypoint 处理。

## 渲染侧约定

建议给 junction 统一 props：

```json
{
  "kind": "junction",
  "visible": false
}
```

渲染器必须：

- 不画节点边框；
- 不画标签；
- 保留边段或按业务需要合并两段；
- 不把 junction 暴露到选择、命中或数据结构。

## 注意事项

- junction 参与节点数、层宽和间距，可能改变相邻节点位置；
- 多个 junction 会增加 dummy 与路由工作量；
- 不要把 junction 当作“绝对 waypoint”，它受层级算法控制；
- 如果需要完全固定的折点，应在渲染/后处理阶段处理，而不是继续堆节点。
