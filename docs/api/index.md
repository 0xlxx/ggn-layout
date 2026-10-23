# 公开 API

公共入口是 `ggn-layout`（或 `ggn-layout/api`）。内部 `LGraph`、`LNode`、provider 和属性对象不是
稳定契约，不应从业务代码直接依赖。

## 主要函数

| 导出 | 用途 |
| --- | --- |
| `layoutElkJson` | JSON 图布局 |
| `validateLayoutInput` | 无异常校验 |
| `assertValidLayoutInput` | 校验失败抛错 |
| `layoutJsonBatch` | 批量布局 |
| `diffLayout` | 比较两份布局结果 |
| `layoutJsonDiff` | 比较两份输入并布局 |
| `createLayoutWorker` | Worker 客户端 |

## 主要类型

- `LayoutInput`
- `LayoutOutput`
- `LayoutOutputEdge`
- `LayoutSummary`
- `ElkNode`
- `ElkEdge`
- `ElkPort`
- `ElkEdgeSection`
- `ElkLayoutOptions`
- `LayoutControl`
- `LayoutDiff`

## 子路径

| 子路径 | 内容 |
| --- | --- |
| `ggn-layout` | 兼容根入口，注册全部算法 |
| `ggn-layout/api` | 高层 API |
| `ggn-layout/layered` | 只注册 Layered |
| `ggn-layout/options` | 稳定选项门面 |
| `ggn-layout/core` | 引擎级内部模型 |
| `ggn-layout/layout-worker` | Worker 外壳 |
| `ggn-layout/layout-input.schema.json` | JSON Schema |

## 生成的 API 全文

下面的 TypeDoc 从 [`src/public.ts`](https://github.com/0xlxx/ggn-layout/blob/main/src/public.ts)
生成，包含函数签名、类型、枚举和注释：

[打开 TypeDoc API 参考](./typedoc/index.html)

> TypeDoc 页面在 `docs:build` / `docs:dev` 前生成；它不是手写副本。
