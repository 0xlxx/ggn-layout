# API 单页速查

## 入口

```ts
import { layoutElkJson, LayoutError, LayoutErrorCode } from '@ggn/layout'
const output = layoutElkJson(input, options?)
```

`input` 的必填字段只有根节点及每个节点的 `id`。`children`、`edges`、`ports` 都是可选的；边若存在，必须提供单个 `sources` 和单个 `targets` 引用。

```ts
const input = {
  id: 'root',
  children: [{ id: 'A', width: 40, height: 20 }, { id: 'B', width: 40, height: 20 }],
  edges: [{ id: 'A-to-B', sources: ['A'], targets: ['B'] }],
}
const output = layoutElkJson(input)
```

## 选项

| 选项 | 默认/可选值 | 说明 |
|---|---|---|
| `direction` | `RIGHT`；`LEFT`/`DOWN`/`UP` | 主布局方向 |
| `randomSeed` | `1` | 让随机相关布局可复现 |
| `hierarchyHandling` | `OFF`；`INCLUDE_CHILDREN`/`SEPARATE` | 嵌套图处理策略 |
| `layoutOptions` | `Record<string, unknown>` | 额外图级属性；API 选项覆盖输入根节点属性 |
| `responseFormat` | `full`（默认）/ `concise` / `summary` | `full` 完整保真；`concise` 只留几何与端点；`summary` 扁平摘要 |
| `pick` | 仅 `full` 生效 | 追加保留的节点字段；`id` 与几何字段始终保留 |

坐标模式可放入 `layoutOptions`：`org.eclipse.elk.json.shapeCoords` / `edgeCoords` 支持 `ROOT`、`PARENT`、`CONTAINER`、`INHERIT`（具体含义见完整 API 文档）。

> `direction` 类型为字面量联合 `'RIGHT'|'LEFT'|'DOWN'|'UP'`；持普通 `string` 的旧调用需要收窄。

## 输出形态

- `full`：节点几何 + 输入字段保真；边 `sections`（含 bendPoints）。
- `concise`：节点 `{id,x,y,width,height}`；边 `{id?,sources,targets,sections[0].{startPoint,endPoint}}`（无 bendPoints；未路由边保留结构）。
- `summary`：`{ nodes, edges, width?, height? }`；不含 root 自身，只含已路由单源单目标边。
- `pick`：仅 `full` 下追加保留节点字段。

## 错误码表

| 错误码 | 含义 |
|---|---|
| `INVALID_INPUT` | 输入不是可布局的图对象 |
| `MISSING_ID` | 节点或端口缺少有效 id |
| `DUPLICATE_ID` | 节点或端口 id 重复 |
| `NEGATIVE_SIZE` | 宽度或高度为负数 |
| `NON_FINITE_SIZE` | 宽度或高度不是有限数字 |
| `EMPTY_ENDPOINTS` | 边缺少源或目标端点 |
| `DANGLING_ENDPOINT` | 端点引用不存在 |
| `MULTI_ENDPOINTS` | 当前接口不接受多源/多目标边 |
| `UNSUPPORTED_ALGORITHM` | 请求的算法尚未支持 |
| `CYCLIC_REFERENCE` | 输入包含循环引用 |
| `INTERNAL_ERROR` | 布局内部异常（`details` 含原始错误） |
| `ABORTED` | 布局/批次被取消（`AbortSignal`），可重试 |

## 不变量与边界

- **纯函数**：`layoutElkJson` 不改输入，返回新对象；校验失败抛 `LayoutError`。
- **错误可诊断**：读取 `code`、`path`、`retryable`（输入错误为 `false`），必要时查看 `phase/details`。
- **输出保真**：输入节点、端口、标签和自定义字段尽量保留，并补充节点几何与边 `sections`；内部 dummy 节点不会输出。
- **hyperedge**：空端点、多端点和悬空端点被拒绝；请拆成单源单目标普通边。
- **坐标系**：默认节点坐标相对父容器、边坐标相对最低公共祖先；`ROOT` 模式可投影为全局坐标。
