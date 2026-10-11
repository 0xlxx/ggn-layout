# ELK 间距选项指南（Spacing Options，ELK Java → ggn-layout）

> **Status**: 🟢 Active
> **Last Updated**: 2026-08-14
> **Parent**: [文档索引](../README.md)
> **Objective**: 移植 ELK Java「Spacing Options」指南——间距成对语义、base value、个体间距覆盖与 margin/padding 正交关系，对应到 TS 的 `Spacings` 表与 `LayeredSpacingsBuilder`。

## 1. 背景与来源（为什么有这份文档）

ELK 官方文档 `documentation/tooldevelopers/graphdatastructure/spacingdocumentation.md` 解释了间距的
**语义**：哪些元素可设间距、间距如何成对定义、base value 如何影响全部间距、个体覆盖如何生效。
[选项接口参考](./elk-layout-options.md) 只列键与默认值，本文补上**机制**，并映射到本仓库实现
（`src/options/layered-spacings.ts` 的 `LayeredSpacingsBuilder`、`src/p4nodes/spacings.ts` 的 `Spacings` 表）。

## 2. 可设置间距的元素

按 ELK core 定义，以下元素可有间距：**节点、端口、标签、边、注释、连通分量**。
前三种可视为「周围留空的盒子」；边不是盒子；连通分量可比简单盒子更复杂。
ELK Layered 额外引入**层（layers）**概念，带来层间间距（见 §3）。

## 3. 间距组合（成对定义）

间距总是定义在**两两之间**，且受 **base value** 影响。core 的成对间距（按字典序）：

| 间距 | 选项键 | TS Property |
| :--- | :--- | :--- |
| 注释-注释 | `org.eclipse.elk.spacing.commentComment` | `SPACING_COMMENT_COMMENT` |
| 注释-节点 | `org.eclipse.elk.spacing.commentNode` | `SPACING_COMMENT_NODE` |
| 分量-分量 | `org.eclipse.elk.spacing.componentComponent` | `SPACING_COMPONENT_COMPONENT` |
| 边-边 | `org.eclipse.elk.spacing.edgeEdge` | `SPACING_EDGE_EDGE` |
| 边-标签 | `org.eclipse.elk.spacing.edgeLabel` | `SPACING_EDGE_LABEL` |
| 边-节点 | `org.eclipse.elk.spacing.edgeNode` | `SPACING_EDGE_NODE` |
| 标签-标签 | `org.eclipse.elk.spacing.labelLabel` | `SPACING_LABEL_LABEL` |
| 标签-节点 | `org.eclipse.elk.spacing.labelNode` | `SPACING_LABEL_NODE` |
| 标签-端口（垂直） | `org.eclipse.elk.spacing.labelPortVertical` | `SPACING_LABEL_PORT_VERTICAL`（正值 = 离节点更远） |
| 标签-端口（水平） | `org.eclipse.elk.spacing.labelPortHorizontal` | `SPACING_LABEL_PORT_HORIZONTAL`（正值 = 离节点更远） |
| 节点-节点 | `org.eclipse.elk.spacing.nodeNode` | `SPACING_NODE_NODE` |
| 端口-端口 | `org.eclipse.elk.spacing.portPort` | `SPACING_PORT_PORT` |

**层间间距**（LAYERED 新增，RIGHT 方向下为水平间距）：

| 间距 | 选项键 | TS Property |
| :--- | :--- | :--- |
| 边-边（层间） | `org.eclipse.elk.layered.spacing.edgeEdgeBetweenLayers` | `SPACING_EDGE_EDGE_BETWEEN_LAYERS` |
| 边-节点（层间） | `org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers` | `SPACING_EDGE_NODE_BETWEEN_LAYERS` |
| 节点-节点（层间） | `org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers` | `SPACING_NODE_NODE_BETWEEN_LAYERS` |

**特殊间距**：

| 间距 | 选项键 | TS Property |
| :--- | :--- | :--- |
| 附加端口空间 | `org.eclipse.elk.spacing.portsSurrounding` | `SPACING_PORTS_SURROUNDING` |
| 附加包装边间距 | `org.eclipse.elk.layered.wrapping.additionalEdgeSpacing` | `WRAPPING_ADDITIONAL_EDGE_SPACING` |
| 个体间距 | `org.eclipse.elk.spacing.individual` | `SPACING_INDIVIDUAL`（见 §4） |
| 节点自环间距 | `org.eclipse.elk.spacing.nodeSelfLoop` | `SPACING_NODE_SELF_LOOP` |
| 松样条层距系数（不用 base value） | `org.eclipse.elk.layered.edgeRouting.splines.sloppy.layerSpacingFactor` | `EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR` |

**base value**：ELK 参考文档为 `org.eclipse.elk.layered.spacing.baseValue`。本移植**无该独立选项**——
基准隐式为 `spacing.nodeNode`（默认 20），`LayeredSpacingsBuilder` 按「选项默认值 / 基准默认值」派生各间距
factor，再统一乘 base 应用（见 §6）。

## 4. 个体间距（spacing.individual）

间距通常设在复合节点上、作用于其直接子元素。若某个元素要**覆盖**间距设置，直接在该元素上设置间距属性即可；
但当该元素本身是复合节点时会产生歧义（作用于子元素还是自身？）。ELK 的解法 = `spacing.individual`：

> `spacing.individual` 的值是一个 **property holder**，可在其上设置需要覆盖的间距选项。

本移植语义一致：`SPACING_INDIVIDUAL`（`IPropertyHolder | null`），读取优先级见
`src/p4nodes/spacings.ts` 的 `getIndividualOrDefault`——**个体覆盖优先，否则回落图级默认值**。

## 5. 备注（边界语义）

- **内边距 / padding / 边框间距是正交概念**，不属于本文的间距（节点标签内边距 = `NODE_LABELS_PADDING`）。
- **节点间距不从节点边框起算，而从其 margin 起算**：margin = 包围节点本体 + 端口 + 各类标签的包围盒
  （本移植：`src/intermediate/node-margin-calculator.ts` 的 `calculateNodeMargins`）。
- **涉及边的间距不考虑边厚度**：节点到边的间距 = 节点包围盒到**边中心线**的距离。

## 6. 针对性修改记录（相对 ELK Java 文档）

| 项 | ELK Java 文档 | TS 移植 |
| :--- | :--- | :--- |
| base value 选项 | `org.eclipse.elk.layered.spacing.baseValue` 独立选项 | 无独立选项；基准隐式 = `spacing.nodeNode`（默认 20），见 `LayeredSpacingsBuilder` 构造 |
| 间距应用 | `ElkSpacings.AbstractSpacingsBuilder` 访问器 | `LayeredSpacingsBuilder`（`src/options/layered-spacings.ts`）：`withFactor` / `withValue` / `build` / `toVisitor` |
| 读取表 | `Spacings` 静态/实例表 + `getIndividualOrDefault` | `src/p4nodes/spacings.ts` `Spacings` 类：`getVerticalSpacing` / `getHorizontalSpacing` / `getVerticalSpacingByType` 等 |
| 个体覆盖 | `spacing.individual` 指向 IPropertyHolder | 同；`getIndividualOrDefault` 覆盖优先、否则图级默认 |
| 层间间距 | layered 专属选项 | 同（`SPACING_*_BETWEEN_LAYERS`） |

## 7. 相关文档

- [ELK 布局选项接口参考](./elk-layout-options.md) — 全部间距键与默认值（§间距选项）
- `packages/layout/src/options/layered-spacings.ts` — 基准 / factor / 应用实现
- `packages/layout/src/p4nodes/spacings.ts` — 节点类型间距表与个体覆盖实现
