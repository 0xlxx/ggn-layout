---
name: ggn-layout-api
description: 当需要在 TypeScript/JavaScript 中对标准图 JSON 做确定性节点与边布局、处理嵌套图或坐标模式时使用；优先调用 layoutElkJson，而不是直接操作内部图模型。
---

# 标准图 JSON 布局

## 何时用

使用 `layoutElkJson` 的场景：

- 已有标准图 JSON，需要一次调用得到节点 `x/y/width/height` 和边 `sections`。
- 需要处理 `children` 嵌套图、端口引用、层级边或 `shapeCoords`/`edgeCoords` 坐标投影。
- AI agent 需要一个输入、输出和错误都可检查的高层契约。

不要在普通业务代码中直接使用 `LGraph`、`LNode`、provider 或内部 properties；它们是移植维护模型，不是稳定的消费方契约。只有需要继续移植算法、写引擎内部测试或诊断内部状态时，才从内部入口使用这些符号。

## 最小示例

```ts
import { layoutElkJson } from 'ggn-layout'

const output = layoutElkJson({
  id: 'root',
  children: [{ id: 'A' }, { id: 'B' }],
  edges: [{ id: 'A-to-B', sources: ['A'], targets: ['B'] }],
})
```

## 选项速查

| 选项 | 作用 | 常用值 |
|---|---|---|
| `direction` | 主布局方向 | `RIGHT`、`LEFT`、`DOWN`、`UP` |
| `randomSeed` | 随机布局的稳定种子 | `1`（默认） |
| `hierarchyHandling` | 嵌套图的处理方式 | `INCLUDE_CHILDREN`、`SEPARATE`、`OFF` |
| `layoutOptions` | 额外图级属性；API 选项覆盖输入根节点同名属性 | `org.eclipse.elk.*` / 坐标模式属性 |
| `responseFormat` | 输出形态 | `full`（默认）/ `concise` / `summary` |
| `pick` | full 下追加保留的节点字段 | 任意节点字段名数组；id 与几何字段始终保留 |

`shapeCoords=ROOT` 输出全局节点坐标；`edgeCoords=ROOT` 输出全局边 sections。嵌套边应放在声明它们的容器 `edges` 中；跨容器边按最低公共祖先输出。

## 输出形态

- `full`（默认）：完整保真——节点带几何 + 保留输入字段；边带 `sections`（含 bendPoints）与 `container`。
- `concise`：省 token——节点只留 `id/x/y/width/height`；边只留 `id/sources/targets/sections[0].{startPoint,endPoint}`（无 bendPoints）；未路由边保留 `sources/targets` 结构不丢弃。
- `summary`：扁平摘要 `{ nodes: [{id,x,y,width,height}], edges: [{id?,sources,targets,startPoint,endPoint}] }`；**不含 root 节点自身**，只含已路由的单源单目标边。
- `pick`：仅 `full` 生效；追加保留指定节点字段（`children`/`edges`/几何字段始终由输出结构决定，忽略 pick）。

## 错误码速查

| 错误码 | 处理建议 |
|---|---|
| `INVALID_INPUT` | 检查根对象和字段类型 |
| `MISSING_ID` | 给节点或端口补非空 `id` |
| `DUPLICATE_ID` | 保证图内节点/端口引用唯一 |
| `NEGATIVE_SIZE` | 将宽高改为非负数 |
| `NON_FINITE_SIZE` | 使用有限数字宽高 |
| `EMPTY_ENDPOINTS` | 给边提供 `sources` 与 `targets` |
| `DANGLING_ENDPOINT` | 修正不存在的节点/端口引用 |
| `MULTI_ENDPOINTS` | 当前接口只接受单源单目标边 |
| `UNSUPPORTED_ALGORITHM` | 改用已支持的算法或移植后再调用 |
| `CYCLIC_REFERENCE` | 移除循环引用，传入 JSON 树 |
| `INTERNAL_ERROR` | 布局内部异常；查看 `details` 中的原始错误 |
| `ABORTED` | 布局/批次被 `AbortSignal` 取消，可安全重试 |

捕获错误时读取 `error.code`、`error.path` 和 `error.retryable`；输入错误通常不应盲目重试。

## 契约边界

- **纯函数**：入口先校验，再复制输入；布局过程不会修改调用方持有的对象。
- **确定性**：相同版本、输入和选项（尤其是 `randomSeed`）应得到相同结果；不要把跨版本坐标当作永久 bit-exact 保证。
- **输出保真**：节点、端口、标签和自定义 JSON 字段尽量保留；布局新增节点几何与边 sections。端口/标签几何会参与输出，但内部 dummy 节点不会泄漏。
- **hyperedge 边界**：当前接口拒绝空端点、多端点和悬空端点；需要拆成普通单源单目标边后再布局。
- **错误**：非法输入抛 `LayoutError`，`retryable` 为 `false`；算法不可用时通过 `UNSUPPORTED_ALGORITHM` 明确失败。
