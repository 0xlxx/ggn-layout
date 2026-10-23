# 与 ELK 官方交叉验证

验证日期：**2026-10-19**。

验证对象：

- [ELK Documentation](https://eclipse.dev/elk/documentation.html)
- [ELK Reference](https://eclipse.dev/elk/reference.html)
- [ELK Algorithms](https://eclipse.dev/elk/reference/algorithms.html)
- [ELK Layout Options](https://eclipse.dev/elk/reference/options.html)
- [Structuring Algorithms](https://eclipse.dev/elk/documentation/algorithmdevelopers/algorithmimplementation/algorithmstructure.html)

本仓库的移植基线是 **ELK Java 0.12.0**。官方站点可能展示更新版本的默认值，因此发现差异时先看
本仓库 `src/options/*` 与测试 oracle，不直接拿网页默认值覆盖实现。

## 架构语义对照

| ELK 概念 | ggn-layout 对应 |
| --- | --- |
| Layout algorithm | `org.eclipse.elk.algorithm` + provider 注册表 |
| Layout phase | Layered P1–P5 |
| Intermediate processor | `src/intermediate/*` |
| Graph data structure | `LGraph` / `LNode` / `LPort` / `LEdge` |
| JSON format | `layoutElkJson` 输入/输出 |
| Coordinate system | `shapeCoords` / `edgeCoords` |
| Black-box nested graph | 自底向上 provider + 父层黑盒节点 |

## 算法覆盖

官方参考列出的算法多于本仓库移植集合。当前明确支持：

```text
layered box fixed random force stress rectpacking topdownpacking
mrtree radial vertiflex disco sporeoverlap sporecompaction
```

未移植 Graphviz、Libavoid、Draw2D 等外部集成算法。

## 已记录的默认值差异

以下差异需要按“ELK 0.12.0 移植基线”理解：

| 选项 | 官方当前页面可能显示 | 本仓库 |
| --- | --- | --- |
| `portAlignment.default` | `JUSTIFIED` | `DISTRIBUTED` |
| `considerModelOrder.groupModelOrder.cmGroupOrderStrategy` | `ONLY_WITHIN_GROUP` | `MODEL_ORDER` |
| `considerModelOrder.longEdgeOrderingStrategy` | `DUMMY_NODE_OVER` | `EQUAL` |
| `nodeSize.options` | `DEFAULT_MINIMUM_SIZE` | `[]`，由具体处理器决定默认 |
| `edgeLabels.placement` | `CENTER` | `UNDEFINED`，Layered 运行时再选 |

这些差异不应该被文档隐藏。修改前要同时核对：

1. ELK 0.12.0 Java 行为；
2. 本仓库 oracle 测试；
3. 当前官方 Reference 是否已经迁移到更新版本。

## JSON 与坐标

- 输入边只接受单源、单目标扩展边；
- 节点和边可带 `layoutOptions`、`properties`、标签；
- 默认坐标相对父节点/LCA；
- `ROOT` 模式输出全局坐标；
- `full` 保留自定义字段，`concise` / `summary` 为传输裁剪。

## 算法行为对照

| 算法 | 官方描述 | 本仓库状态 |
| --- | --- | --- |
| Layered | 分层、最小交叉、支持 compound 与端口 | 完整白盒路径 |
| Box | 无边盒子的简单装箱 | `SIMPLE` 已移植 |
| Fixed | 保持现有布局 | 支持节点、端口、标签、弯点 |
| Rectpacking | 有序矩形打包 | 已移植 |
| Top-down Packing | 固定尺寸盒子的自顶向下摆放 | 已移植 |
| Force / Stress | 物理力 / 应力最小化 | 已移植 |
| Mr. Tree / Radial | 树与放射树 | 已移植 |
| SPOrE | 重叠消除 / 压紧 | 已移植 |

## 交叉验证后的使用结论

- 文档中的算法 ID 使用 ELK 规范全名，同时接受短名；
- 算法默认值以本仓库源码与 oracle 为准；
- 选项含义优先参考 ELK 官方页面，但实现状态看本仓库支持清单；
- 同一布局在不同 ELK 版本可能因默认值变化而不同，升级必须重新跑 oracle。
