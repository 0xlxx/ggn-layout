# layout 高层布局 API（`layoutElkJson`）

> **读者对象**：消费方与 AI agent 请先读 `README.md` 和 `docs/API-QUICKREF.md`；本文保留完整输入、输出、坐标模式与验证细节，供需要深入契约的读者和维护者查阅。
>
> 快速开始：从包根入口导入 `layoutElkJson`，传入带 `id` 的标准图 JSON；不要为普通任务直接组装内部 `LGraph` 模型。


> 等价 elkjs 的图布局服务：输入/输出标准 ELK JSON，消费方零组装（端口锚点、坐标系投影、
> sections 组装全部在库内完成）。解决 demo-vite 曾因"端口位置 vs 锚点"渲染斜线的 API 设计缺陷。

## 动机

对比三种引擎 API 形态：

| 引擎 | 输入 | 输出 | 消费方负担 |
|---|---|---|---|
| elkjs | 标准图 JSON | JSON（节点 x/y + 边 sections） | 无 |
| ggn-layout（旧） | `node()/edge()` | `projectToGlobal()` → 世界坐标 + bendPoints | 无 |
| layout（LGraph 引擎） | 内部 `LGraph` | 原地改 LGraph；端口/弯点分离，需自行组装 | 高（易出错） |

`layoutElkJson` 是 layout 的**结果层 API**：`JSON → LGraph → 布局 → sections 组装 → JSON`。

## 用法

```ts
import { layoutElkJson } from 'ggn-layout'

const input = {
  id: 'root',
  layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
  children: [
    { id: 'A', width: 40, height: 20 },
    { id: 'B', width: 40, height: 20 },
  ],
  edges: [{ id: 'e0', sources: ['A'], targets: ['B'] }],
}

const out = layoutElkJson(input)
// out.children[0] = { id: 'A', x: 12, y: 12, width: 40, height: 20 }
// out.edges[0].sections[0] = { startPoint: {x,y}, endPoint: {x,y}, bendPoints: [...] }
```

### 选项

```ts
layoutElkJson(input, {
  direction: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP',  // 默认 RIGHT
  randomSeed: 1,                                 // 默认 1
  hierarchyHandling: 'INCLUDE_CHILDREN' | 'SEPARATE' | 'OFF', // 默认 OFF
  layoutOptions: { 'org.eclipse.elk.xxx': value }, // 额外图级属性
})
```

- 图级 `layoutOptions`（`org.eclipse.elk.*` 完整 id）也可直接放 `input.layoutOptions`。
- 嵌套图：子节点 `children` + 子容器 `edges`（边挂在 LCA 容器，与 elkjs 一致）。

## 输出语义（对齐 elkjs）

- 节点：`x/y` 相对父容器（嵌套子节点相对父内容区），`width/height`。
- 边：`sources/targets` 引用 + `sections[0].{startPoint, endPoint, bendPoints}`，坐标相对边所在容器（LCA）。
- 端点 = 端口**绝对锚点**（含 anchor 偏移），与弯点同坐标系 —— 保证渲染正交。

### 坐标模式（`org.eclipse.elk.json.shapeCoords` / `edgeCoords`）

与 elkjs 0.12.0 / ELK Java 一致，支持 ELK JSON 的坐标模式选项（图级 `layoutOptions`，
完整 id 或短名 `elk.json.*` 均可，大小写不敏感）：

| 选项 | 值 | layout 行为 |
|---|---|---|
| `shapeCoords` | `PARENT` / `INHERIT`（默认） | 节点 `x/y` 相对父容器（现状） |
| `shapeCoords` | `ROOT` | 节点 `x/y` 输出**全局坐标** |
| `edgeCoords` | `CONTAINER` / `INHERIT`（默认） | 边 sections 坐标相对 LCA 容器，输出 `container` 字段 |
| `edgeCoords` | `PARENT` | 边 sections 坐标相对边在**输入 JSON 的声明父节点**（e.g. 声明在 root → 全局）；不输出 `container` |
| `edgeCoords` | `ROOT` | 边 sections 坐标输出**全局坐标**；不输出 `container` |

注意：
- 输出边带 `container: <LCA id>`（对齐 elkjs 默认 CONTAINER 模式），`PARENT`/`ROOT` 模式不输出。
- 合并优先级：API `options.layoutOptions` **覆盖** input 根 `layoutOptions`（对齐 elkjs 与 `buildGraph`）。
- 大小写敏感：`ROOT`/`PARENT`/`CONTAINER`/`INHERIT` 大写枚举值（小写忽略，对齐 elkjs/Java 枚举解析）。
- **已知限制**：per-node `layoutOptions` 里的坐标模式（elkjs 按元素继承）暂不支持，仅图级生效。

使用例（与 elkjs 等价）：

```ts
layoutElkJson(input, {
  layoutOptions: { 'org.eclipse.elk.json.edgeCoords': 'ROOT', 'org.eclipse.elk.json.shapeCoords': 'ROOT' },
})
```

SSOT 依据：ELK Java 0.12.0 `ShapeCoords.java`/`EdgeCoords.java` 枚举 + elkjs 0.12.0 实测
（`edgeCoords=ROOT` 时内部边 e2 由相对 LCA 的 (0,27) 直接输出全局 (74,101)）。
验证：`tests/api/coords-modes.test.ts`（elkjs 差分 + 内部不变量，6 用例）。

## 对齐验证（vs elkjs 0.12.0）

| 用例 | 节点差分 | 边差分 |
|---|---|---|
| carTracking（标准输入，带 labels） | 0/50 | 0/57 |
| intersections（标准输入） | 0/220 | 0/200 |
| 嵌套图 INCLUDE_CHILDREN（内联） | 0 | 0 |
| 最小图 / 端口约束图（内联） | 0 | 0 |
| blindCommunication（87 节点层级图, 66 边） | 0/51 | 0/66 |

### 回归测试（真实图）

`tests/api/regression.test.ts` + `tests/api/fixtures/`：
- **carTracking（80 节点 / 57 边）**、**intersections（300 节点 / 200 边）**、**blindCommunication（87 节点层级 / 66 边）**
  使用 ELK Java 0.12.0 权威标准 JSON 作为输入，断言 `layoutElkJson` 与 elkjs 逐项一致
  （节点坐标 + 边 sections，盲通信另有 `blindCommunication-jar-edges.json` oracle 断言**边挂载容器 LCA 与 jar 完全一致**）。
- carTracking 曾是 GreedySwitch 误激活来源（N11 差 297）；已实测恢复旧 bug 后回归立即捕获 max=297.33。
- blindCommunication 是层级图回归：实测改坏 LCA 挂载（边全挂 root）后 jar 挂载用例立即失败（证明测试覆盖挂载结构）。

测试：`tests/api/layout-elk-json.test.ts`（基础对齐）+ `tests/api/regression.test.ts`（真实图回归）+ `tests/api/coords-modes.test.ts`（坐标模式差分）。

## 实现要点（src/api/elk-json.ts）

1. **build（JSON→LGraph）**：
   - 端口侧用 `LPort.setSide()`（设置 side 字段 + 按侧算默认 anchor），**不能用** `setProperty(PORT_SIDE)`（布局引擎读字段，属性表不生效）。
   - 端口约束用 `LNode.setPortConstraints()`（字段）。
   - 嵌套子图继承根方向（DIRECTION）。
   - **递归收集所有容器的 edges**（边挂在 LCA 容器，如子容器 P 的 `edges` 含 X→Y；只读 root.edges 会漏）。
2. **extract（LGraph→JSON）**：
   - 只输出原始节点/边（跳过布局产生的 dummy）。
   - sections 端点用 `getEdgeEndpoints()`（端口绝对锚点），弯点用 `LEdge.getBendPoints()`，坐标相对边所属容器（LCA）。
   - 边按 LCA 容器挂载（嵌套边挂到对应子容器节点）。

## 已知限制 / 待查

- **无 labels 的同构节点平局**：对完全对称的输入（如两个相同尺寸、相同端口的节点都连向同一目标，且无 labels/非对称属性打破平局），ggn 引擎与 elkjs/jar 的平局打破可能不同（节点槽位交换，如 carTracking 无 labels 时 N38/N39）。带 labels 或非对称输入不受影响（标准真实输入验证全对齐）。待查：P3 断环/排序的平局差异（JavaRandom 本身与 java.util.Random 已逐项验证一致）。

## P0 API 契约（2026-08-12）

- **纯函数**：`layoutElkJson(input, options?)` 在任意路径（layered / black-box / root 非 layered）都**不修改传入的 input**，返回全新对象；同一输入+同一 options 连续调用结果一致（确定性，默认 randomSeed=1）。
- **显式校验**：入口先做 `validateLayoutInput(input)` 校验，非法输入抛 `LayoutError`（`code`/`path`/`retryable=false`/`phase`），不再静默丢节点/丢边。错误码见 `LayoutErrorCode`：`INVALID_INPUT`、`MISSING_ID`、`DUPLICATE_ID`、`NEGATIVE_SIZE`、`NON_FINITE_SIZE`、`EMPTY_ENDPOINTS`、`DANGLING_ENDPOINT`、`MULTI_ENDPOINTS`、`UNSUPPORTED_ALGORITHM`、`CYCLIC_REFERENCE`。端点解析与共享 builder `resolveRef` 一致（ref 为节点 id，或最后一个点号前缀为节点 id）。
- **输出保真**：输出保留输入节点的 `ports`/`labels`/`properties`/`layoutOptions`/自定义字段（几何由布局覆盖），边保留 `id`/`layoutOptions`/`properties`/自定义字段。**已知边界**：节点 `ports[*].x/y` 与 `labels[*].x/y` 若输入已声明，按"保留输入几何"处理，当前 API 不重算端口/标签几何；hyperedge（sources/targets 多于一个）显式拒绝（`MULTI_ENDPOINTS`），P0 只支持单源单目标。

## 发布边界与 JSON Schema

包提供六个 JS 入口：ggn-layout（兼容根入口）、ggn-layout/api（高层 API）、
ggn-layout/core（内部模型）、ggn-layout/options（稳定选项门面）、
ggn-layout/layered（仅分层算法）和 ggn-layout/layout-worker（Web Worker 外壳）。
普通消费方优先从根入口或 api 导入；不要依赖 core 的内部属性与模型作为稳定契约。
六个入口均同时提供 ESM（`import`）与 CJS（`require`）产物，类型分别由 `.d.ts`
与 `.d.cts` 承载。

机器可读的 LayoutInput JSON Schema 通过 `ggn-layout/layout-input.schema.json`
子路径导出（源码位于 schema/layout-input.schema.json），遵循 JSON Schema draft-07，
覆盖递归 children、单源单目标 edges、端口/标签和开放扩展字段。
运行时契约以 validateLayoutInput 为准，schema 供工具与 AI agent 消费。

## 参考文档（移植自 ELK Java 0.12.0，位于仓库根 docs/reference/）

| 文档 | 内容 |
| :--- | :--- |
| [ELK 布局选项接口参考](reference/elk-layout-options.md) | 全部选项键 / TS Property / 默认值清单 |
| [ELK 算法实现指南](reference/elk-algorithm-guide.md) | 阶段 / 中间处理器 / 装配 / Provider 接口 |
| [ELK 布局选项机制指南](reference/elk-layout-options-mechanism.md) | `Property` / `MapPropertyHolder` 读写查语义 |
| [ELK JSON 图格式指南](reference/elk-json-format.md) | 五种元素与导入导出 API |
| [ELK 间距选项指南](reference/elk-spacing-options.md) | 间距成对语义 / base value / 个体覆盖 |
