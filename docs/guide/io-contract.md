# 输入输出契约

## 主入口

```ts
layoutElkJson(input, options?): LayoutOutput | LayoutSummary
```

入口会：

1. 校验 ID、尺寸、端点和算法；
2. 把 JSON 构建成内部图；
3. 递归调度算法；
4. 投影坐标并提取可序列化结果。

## 纯度与确定性

- 不修改传入的 `input`；
- 默认 `randomSeed = 1`；
- 同一版本、同一输入、同一选项得到相同结果；
- 失败抛出结构化 `LayoutError`，不返回半成品。

## 三种输出形态

| `responseFormat` | 内容 | 用途 |
| --- | --- | --- |
| `full` | 完整节点、边、标签、属性和几何 | 通用输出、继续编辑 |
| `concise` | 节点几何 + 边端点 | 减少传输体积 |
| `summary` | 扁平节点和已路由边摘要 | 服务端预览、Agent |

`pick` 只对 `full` 生效，用于额外保留节点字段。

## 错误码

常见错误包括：

- `MISSING_ID`
- `DUPLICATE_ID`
- `NEGATIVE_SIZE`
- `NON_FINITE_SIZE`
- `EMPTY_ENDPOINTS`
- `DANGLING_ENDPOINT`
- `MULTI_ENDPOINTS`
- `UNSUPPORTED_ALGORITHM`
- `CYCLIC_REFERENCE`
- `ABORTED`

```ts
import { LayoutError } from "ggn-layout";

try {
  layoutElkJson(input);
} catch (error) {
  if (error instanceof LayoutError) {
    console.error(error.code, error.path, error.retryable);
  }
}
```

## 批量与差异

```ts
import { layoutJsonBatch, diffLayout, layoutJsonDiff } from "ggn-layout";
```

- `layoutJsonBatch`：逐项隔离的批量布局；
- `diffLayout`：比较两份布局结果；
- `layoutJsonDiff`：直接从两份输入计算布局差异。

## Worker

浏览器或 Node Worker 可导入 `ggn-layout/layout-worker`，也可以使用
`createLayoutWorker()` 建立轻量请求/响应客户端。

## 取消与进度

```ts
const controller = new AbortController();

layoutElkJson(input, {
  control: {
    signal: controller.signal,
    onProgress(event) {
      console.log(event.phase, event.completed, event.total);
    },
  },
});
```

取消发生在阶段边界，不会把已经完成的中间图写回输入。
