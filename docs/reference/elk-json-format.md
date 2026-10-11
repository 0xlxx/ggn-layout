# ELK JSON 图格式指南（ELK Java → ggn-layout）

> **Status**: 🟢 Active
> **Last Updated**: 2026-08-14
> **Parent**: [文档索引](../README.md)
> **Objective**: 移植 ELK Java「JSON Format」图格式指南——节点 / 端口 / 标签 / 边 / 边段五种基本元素与导入导出 API，并注明本移植的针对性差异（校验、超边、输出形态）。

## 1. 背景与来源（为什么有这份文档）

ELK 官方文档 `documentation/tooldevelopers/graphdatastructure/jsonformat.md` 定义了 ELK JSON 图格式：
`layoutElkJson` 的输入 / 输出即该格式。本文把该指南**移植并做针对性修改**：元素规则与 Java 一致，
导入导出 API 映射到本仓库 TS 实现（`buildGraph` / `extractGraph` / `layoutElkJson`），差异见 §8。

> 配套：使用契约见 `packages/layout/docs/API.md`（含坐标模式）；选项键见
> [ELK 布局选项接口参考](./elk-layout-options.md)。本文专注**格式本身**。

## 2. 五种基本元素

| 元素 | 必填字段 | 说明 |
| :--- | :--- | :--- |
| 节点（node） | `id*` | 可含端口、子节点、边；图 = 根节点 |
| 端口（port） | `id*` | 边可连到节点或端口 |
| 标签（label） | 无（`id` 可选） | 通常不被图内引用；可含 `text`；**算法不做文本尺寸估算，需给 `width/height`** |
| 边（edge） | 见 §4 | 扩展边（extended）或遗留原语边（primitive） |
| 边段（edge section） | `startPoint*` / `endPoint*` | 只随扩展边输出，承载路由结果 |

所有元素都可带 `layoutOptions`（键值对，键见选项参考）；除标签外都需唯一 `id`（可为字符串或整数）。

```json
{ "id": "n1", "layoutOptions": { "org.eclipse.elk.direction": "RIGHT" } }
```

## 3. 节点 / 端口 / 标签的几何与挂载

节点、端口、标签都有二维位置与尺寸；节点与端口可再带任意数量标签（标签可带标签，是否支持取决于算法）：

```json
{ "x": 0, "y": 0, "width": 40, "height": 20, "labels": [ { "text": "A", "width": 10, "height": 8 } ] }
```

**挂载规则**：节点可含 `ports`、`children`（子节点）、`edges`；图 = 根节点 + 其子节点。
边可以挂在任意节点下（不要求是端点的父节点）——这是跨层级边与「边全放根」方案的基础；
`layoutElkJson` 按 LCA（最低公共祖先）语义解释边坐标（见 API.md §输出语义）。

## 4. 边

### 原语边（primitive）— 不支持

Java 文档说明原语边仅为遗留模型保留。**本移植不接受原语边**：输入边必须使用扩展边形态。

### 扩展边（extended）— 唯一支持形态

```json
{
  "id": "e1",
  "sources*": ["n1"], "targets*": ["n2"],
  "sections": [ { "startPoint": { "x": 0, "y": 0 }, "endPoint": { "x": 40, "y": 0 }, "bendPoints": [ ] } ],
  "labels": [ ]
}
```

- `sources*` / `targets*` 为节点和 / 或端口 id 数组；ELK 格式允许**超边**（多源 / 多目标），
  但多数算法不支持——**本移植拒绝超边**（`MULTI_ENDPOINTS` / `EMPTY_ENDPOINTS` / `DANGLING_ENDPOINT`），
  请拆成单源单目标普通边（见 §8）。
- 布局后边带 `sections`；单源单目标边只有一个 section。输出还带 `container`（边所在 LCA 容器 id，
  `edgeCoords=PARENT|ROOT` 时不输出，见 API.md §坐标模式）。

## 5. 边段与 Junction Points

边段记录边在画布上的路由：`startPoint*` / `endPoint*` + 可选 `bendPoints`；段的端点可连到
节点 / 端口（`incomingShape` / `outgoingShape`）或其它边段（`incomingSections` / `outgoingSections`），
后者用于超边分支（junction points）。

**本移植的差异**：输入超边被拒（§4），因此输出边段为简单形态
`sections[0].{startPoint, endPoint, bendPoints}`；`junctionPoints` 字段不导出（`JUNCTION_POINTS`
仅在内部为超边相关路由保留，`src/options/layered-options.ts` / `p5edges/polyline-edge-router.ts`）。

## 6. 最小示例

```json
{
  "id": "root",
  "layoutOptions": { "elk.direction": "RIGHT" },
  "children": [
    { "id": "n1", "width": 10, "height": 10 },
    { "id": "n2", "width": 10, "height": 10 }
  ],
  "edges": [ { "id": "e1", "sources": ["n1"], "targets": ["n2"] } ]
}
```

TS 侧等价（`layoutElkJson` 输出即布局后 JSON，见 `packages/layout/examples/basic.ts`）。

## 7. 导入导出 API（Java `ElkGraphJson` → TS）

| ELK Java（`ElkGraphJson`） | TS 移植 | 说明 |
| :--- | :--- | :--- |
| `forGraph(json).toElk()` | `buildGraph(root, options?, blackBoxIds?)`（`src/api/elk-json.ts`） | JSON → 内部 `LGraph`（含 `elk.*` 短键映射） |
| `.rememberImporter(...)` + `transferLayout(root)` | `layoutElkJson(input, options?)` | 布局并把结果写回 JSON（`buildGraph → provider → extractGraph` 一体） |
| `forGraph(root).toJson()`（omitLayout / prettyPrint 等） | `extractGraph(graph, built)` | `LGraph` → JSON；形态裁剪见 `responseFormat: full / concise / summary` 与 `pick` |
| 校验（Java 侧解析报错） | `validateLayoutInput` / `assertValidLayoutInput` + `LayoutError{code, path, retryable}` | 显式校验，错误可诊断（见 API-QUICKREF 错误码表） |

## 8. 针对性修改记录（相对 ELK Java JSON 文档）

| 项 | ELK Java 文档 | TS 移植 |
| :--- | :--- | :--- |
| 必填 id | 节点/端口/边必填；标签可选 | 同；缺 id / 重复 id 抛 `MISSING_ID` / `DUPLICATE_ID` |
| 原语边 | 仅为遗留模型支持 | **不支持**；只接受扩展边 |
| 超边 | 格式允许（多源/多目标） | **拒绝**（`MULTI_ENDPOINTS` 等错误码），需拆成普通边 |
| 端点校验 | 解析期隐式 | 显式：`EMPTY_ENDPOINTS` / `DANGLING_ENDPOINT` / `NEGATIVE_SIZE` / `NON_FINITE_SIZE` 等 |
| 标签尺寸 | 算法不估算文本，需调用方给宽高 | 同；`kernel:measure` 在渲染层做估算，布局层仍按输入尺寸 |
| `junctionPoints` | 格式字段，超边布局可输出 | 不导出（输入超边被拒，内部仅保留属性） |
| 坐标模式 | `shapeCoords` / `edgeCoords`（PARENT/ROOT/CONTAINER/INHERIT） | 同；另有 `responseFormat` 三档输出裁剪（API.md） |

## 9. 相关文档

- `packages/layout/docs/API.md` / `API-QUICKREF.md` — `layoutElkJson` 使用契约、坐标模式、错误码
- [ELK 布局选项接口参考](./elk-layout-options.md) — `layoutOptions` 键与默认值
- [ELK 算法实现指南](./elk-algorithm-guide.md) — 阶段 / 处理器 / Provider 接口
