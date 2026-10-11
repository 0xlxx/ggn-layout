# ELK 布局选项机制指南（IProperty / PropertyHolder，ELK Java → ggn-layout）

> **Status**: 🟢 Active
> **Last Updated**: 2026-08-14
> **Parent**: [文档索引](../README.md)
> **Objective**: 移植 ELK Java「Layout Options」机制指南——`IProperty` / `IPropertyHolder` 的读 / 写 / 查语义、同 id 不同默认值、内部属性约定，与 TS 移植的 `Property` / `MapPropertyHolder` 一一对应。

## 1. 背景与来源（为什么有这份文档）

ELK 官方文档 `documentation/tooldevelopers/graphdatastructure/layoutoptions.md` 解释了布局选项的
**底层机制**：属性（properties）如何定义、如何挂到图元素上、缺省值从哪来、同 id 不同默认值的语义、
内部属性与用户选项的区别。本文把该指南**移植并做针对性修改**，对应到本仓库的属性系统实现
（`src/graph/properties.ts`）。

> 配套：[ELK 布局选项接口参考](./elk-layout-options.md)（选项键 / 默认值清单）是「有哪些选项」，
> 本文是「选项这套机制怎么工作」。两者一起看：机制见本文，目录见参考表。

## 2. 涉及的类

| ELK Java | TS 移植 | 说明 |
| :--- | :--- | :--- |
| `IProperty<T>` 接口 | `IProperty<T>`（`graph/properties.ts`） | `getId()` + `getDefault()`，描述一类属性 |
| `Property<T>` 类 | `Property<T>` | 最主要实现；第二个构造参数 = 默认值 |
| `IPropertyHolder` 接口 | `IPropertyHolder` / `MapPropertyHolder` | 属性持有者 = 从属性到值的映射；所有图元素都实现 |
| `LayoutMetaDataService` | 无 | TS 不用元数据服务注册选项，见 §5 |

**关键语义：属性的身份 = id**。多个 `IProperty` 实例共享同一 id 时，它们描述同一个属性，
property holder 按 id 存取——这正是「算法可以覆盖全局默认值」的实现基础（见 §3）。

## 3. 读写与查询属性

### 设置（setProperty）

```ts
import { Property, MapPropertyHolder } from 'ggn-layout/core'

// 机制示例：选项 = Property 常量（id + 默认值）
const FEEDBACK_EDGES = new Property<boolean>('org.eclipse.elk.layered.feedbackEdges', false)
const holder = new MapPropertyHolder()
holder.setProperty(FEEDBACK_EDGES, true)
```

### 读取（getProperty）——默认值从哪来

```ts
// 未显式设置时返回该 Property 实例的默认值
const v = holder.getProperty(FEEDBACK_EDGES) // false（FEEDBACK_EDGES 的构造默认）
```

`getProperty` 在属性未设置时**向传入的 `IProperty` 实例要默认值**（`properties.ts` 中
`getProperty` 未命中 map 后走 `property.getDefault()`）。因此同 id 不同默认值的两个实例行为如下
（与 Java 文档示例完全一致）：

```ts
const FALSE_DEFAULT = new Property<boolean>('an.excellent.example.property', false)
const TRUE_DEFAULT = new Property<boolean>('an.excellent.example.property', true)

holder.setProperty(FALSE_DEFAULT, null)   // null/undefined = 删除该属性（Java: 置 null 视为未定义）
console.log(holder.getProperty(FALSE_DEFAULT)) // false —— 回落到 FALSE_DEFAULT 的默认
holder.setProperty(FALSE_DEFAULT, null)
console.log(holder.getProperty(TRUE_DEFAULT))  // true  —— 同 id 属性，回落到 TRUE_DEFAULT 的默认
```

这正是 ELK「算法覆盖全局默认值」的机制：**用哪个 `IProperty` 实例去取，就用哪个实例的默认值**；
用哪个实例去设置则无所谓（map 按 id 存）。

### 检查是否显式设置（hasProperty）

```ts
if (holder.hasProperty(OPTIONAL_GIZMO)) {
  const g = holder.getProperty(OPTIONAL_GIZMO)
}
```

`hasProperty` 区分「显式设置」与「回落到默认值」两种状态。

## 4. 定义属性（用户选项 vs 内部属性）

ELK 文档的约定在本仓库同样成立：

- **用户选项**（算法接口的一部分）：集中在 `src/options/layered-options.ts`，每个选项一个
  `Property` 常量（id + 默认值），如 `SPACING_NODE_NODE = new Property('org.eclipse.elk.spacing.nodeNode', 20)`。
  目录见 [选项接口参考](./elk-layout-options.md)。
- **内部属性**（算法执行期在阶段/处理器间传值，不面向用户）：集中在
  `src/options/internal-properties.ts`（如 `MODEL_ORDER`、`SPACINGS`、`GRAPH_PROPERTIES`）以及
  各算法文件内局部声明的 `Property`。与 Java 一致：内部属性不必对外声明，消费方不应依赖
  （选项参考 §8「边界与内部属性」）。

## 5. 针对性修改记录（相对 ELK Java 文档）

| 项 | ELK Java | TS 移植 |
| :--- | :--- | :--- |
| 取值范围 | `IProperty` 可选上下界（lower/upper bounds） | 无 bounds；输入校验走 `validateLayoutInput` / `layout-input.schema.json` |
| 元数据注册 | `LayoutMetaDataService` + 元数据文件（`.melk`）自动生成 `IProperty` | 手工声明 `Property` 常量；无运行时服务注册 |
| 热属性优化 | 无 | `registerFastProperty` 把热属性登记到数组槽位，`getProperty`/`setProperty` O(1) 直读（`properties.ts` 头部注释） |
| 删除语义 | `setProperty(prop, null)` 视为未定义 | `setProperty(prop, null | undefined)` 删除；`getProperty` 回落默认 |
| 对象默认值 | 首次读取缓存副本 | 同：对象型默认值首次读取时写入 holder 缓存（用户改后再次 get 返回同一对象） |

## 6. 相关文档

- [ELK 布局选项接口参考](./elk-layout-options.md) — 选项键 / TS Property / 默认值清单
- [ELK 算法实现指南](./elk-algorithm-guide.md) — 阶段 / 处理器 / 装配 / Provider 接口
- `docs/API.md` — `layoutElkJson` 使用契约与校验
