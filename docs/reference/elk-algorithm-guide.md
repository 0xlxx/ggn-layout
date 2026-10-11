# ELK 算法实现指南（结构 / 接口，ELK Java 0.12.0 → ggn-layout）

> **Status**: 🟢 Active
> **Last Updated**: 2026-08-14
> **Parent**: [文档索引](../../README.md)
> **Objective**: 移植 ELK Java 官方「算法结构 / 直接使用算法」指南到本项目——布局阶段、中间处理器、算法装配、Provider 入口四大接口概念与 TS 移植一一对应，供维护者按同一套结构理解与扩展算法。

## 1. 背景与来源（为什么有这份文档）

`本仓库` 是 ELK Java 0.12.0（`org.eclipse.elk`）的 1:1 TypeScript 移植。ELK 官方文档中，
**算法开发者指南**（algorithm developers）与**工具开发者指南**（tool developers）是理解其接口设计的权威来源：

- `documentation/algorithmdevelopers/algorithmimplementation/algorithmstructure.md`（「Structuring Algorithms」）
- `documentation/tooldevelopers/usingalgorithmsdirectly.md`（「Using Algorithms Directly」）

本指南把这两份文档**移植并做针对性修改**：原文档面向 Java（`ILayoutPhase` / `ILayoutProcessor` /
`AlgorithmAssembler` / `AbstractLayoutProvider`），本文映射到本仓库的 TS 实现，并注明差异（见 §8）。

> 配套：[ELK 布局选项接口参考](./elk-layout-options.md)（选项键 / 默认值）、[API 文档](../API.md)、
> 模块清单 `docs/MODULES.tsv`。

## 2. 核心概念：布局阶段 vs 中间处理器

ELK 把算法划分为**布局阶段（layout phases）**组成的管线，并在阶段之间的**处理槽（processing slots）**插入
**中间处理器（intermediate processors / layout processors）**：

```
P1 断环 → P2 分层 → P3 交叉最小化 → P4 节点放置 → P5 边路由
   ↑          ↑          ↑            ↑            ↑
  slots      slots      slots        slots        slots（pre/post 处理器）
```

这样划分有两个收益：① 把大问题拆成小问题（每个阶段职责单一）；② 阶段可插拔——不同实现可互相替换
（例如 ELK Layered 把 polyline / orthogonal / spline 三种边路由实现为 P5 阶段的不同实现）。
中间处理器解决「阶段之间需要跨阶段协作」的问题：例如 P1 断环反转了边，P5 之后需要恢复边方向——
由 P1 在最后一个槽请求一个 `ReversedEdgeRestorer` 处理器即可，避免每个 P5 实现重复这段逻辑。

**判断指南**（哪些是阶段、哪些是处理器）：某事是否**总是**算法的一部分 → 可能是阶段；
某事是否有**多种实现**可选 → 大概率应该是阶段（策略分派）；否则 → 中间处理器。

## 3. 布局阶段（Layout Phases）

Java 侧：阶段类实现 `ILayoutPhase<P, G>`（`P` = 阶段枚举，`G` = 图类型），核心是 `process(...)` 入口，
外加 `getLayoutProcessorConfiguration(...)` 声明本阶段需要哪些中间处理器。

TS 侧：**没有独立的 `ILayoutPhase` 接口**，阶段 = `layered-layout-provider.ts` 中按策略分派执行的函数簇，
每个阶段用选项键选择策略（等价于 Java 用 `ILayoutPhaseFactory` 枚举做工厂）：

| 阶段 | 策略选项（键） | 默认 | TS 实现（策略 → 类/函数） |
| :--- | :--- | :--- | :--- |
| P1 断环 | `org.eclipse.elk.layered.cycleBreaking.strategy` | `GREEDY` | `GreedyCycleBreaker`；`GREEDY_MODEL_ORDER` / `MODEL_ORDER` / `DEPTH_FIRST` / `SCC_CONNECTIVITY` / `SCC_NODE_TYPE` / `DFS_NODE_ORDER` / `BFS_NODE_ORDER` / `INTERACTIVE`（`src/p1cycles/*`） |
| P2 分层 | `org.eclipse.elk.layered.layering.strategy` | `NETWORK_SIMPLEX` | `NetworkSimplexLayerer`；`LONGEST_PATH` / `LONGEST_PATH_SINK` / `LONGEST_PATH_SOURCE` / `COFFMAN_GRAHAM` / `MIN_WIDTH` / `STRETCH_WIDTH` / `BF_MODEL_ORDER` / `DF_MODEL_ORDER` / `INTERACTIVE`（`src/p2layers/*`） |
| P3 交叉最小化 | `org.eclipse.elk.layered.crossingMinimization.strategy` | `LAYER_SWEEP` | `LayerSweepCrossingMinimizer`（barycenter + greedy switch）；`INTERACTIVE`（`src/p3order/*`） |
| P4 节点放置 | `org.eclipse.elk.layered.nodePlacement.strategy` | `BRANDES_KOEPF` | `BKNodePlacer`；`SIMPLE` / `INTERACTIVE` / `NETWORK_SIMPLEX` / `LINEAR_SEGMENTS`（`src/p4nodes/*`） |
| P5 边路由 | `org.eclipse.elk.edgeRouting` | `ORTHOGONAL` | `OrthogonalEdgeRouter`；`POLYLINE` / `SPLINES`（`src/p5edges/*`） |

各阶段在 `doSimpleLayoutInner`（`layered-layout-provider.ts:1418`）中按上述键分派，顺序固定为 P1→P5。

## 4. 中间处理器（Layout Processors）

Java 侧：处理器类实现 `ILayoutProcessor<G>`，只有一个 `process(graph, monitor)` 入口。

TS 侧：处理器 = `src/intermediate/*` 等目录中的纯模块函数（如 `processPortSides`、`processLongEdgeSplit`、
`processInLayerConstraints`），统一由 **`runModule` 包装执行**：

```ts
// layered-layout-provider.ts:1333
function runModule(name: string, hooks: LayoutPhaseHooks | undefined, graph: LGraph, fn: () => void): void {
  if (process.env.GGN_PIPE_DBG) { /* 管线调试日志 */ }
  hooks?.beforeModule?.(name, graph)
  fn()
  hooks?.afterModule?.(name, graph)
}
```

`LayoutPhaseHooks`（`beforeModule` / `afterModule` / `afterPhase`）等价于 Java 进度监控器的子任务划分，
用于探针调试与可观测性（对应 `docs/MODULES.tsv` 的「观测点」列）。

## 5. 阶段 → 处理器依赖（LayoutProcessorConfiguration）

Java 侧：阶段通过 `getLayoutProcessorConfiguration(graph)` 返回 `LayoutProcessorConfiguration<P, G>`，
声明「在哪个阶段前/后添加哪些处理器」；同一槽内按 `IntermediateProcessorStrategy` 枚举 ordinal 排序。

TS 侧：`doSimpleLayoutInner` / `runGraphPreP3` / `runGraphPostP3`（`layered-layout-provider.ts:499/747`）
按 ELK 枚举顺序**手工调用** `runModule`——调用顺序即配置，注释保留 Java 槽位语义。典型依赖示例：

```
// layered-layout-provider.ts:669 — 顺序对齐 Java IntermediateProcessorStrategy:
// NODE_PROMOTION(70) 在 LayerConstraintPostprocessor(72) 之前，反了会死循环（PORTING.md §6 陷阱表）。
runModule('NodePromotion', hooks, graph, () => new NodePromotion().process(graph))
// …（P2 分层后）…
runModule('LayerConstraintPostprocessor', hooks, graph, () => processLayerConstraintPost(graph))
```

## 6. 算法装配（AlgorithmAssembler）

Java 侧：`AlgorithmAssembler` 把「阶段工厂枚举 + 各阶段的处理器配置」装配成可执行的
`List<ILayoutProcessor<G>>` 管线，按配置排序后逐个执行。

TS 侧：装配是**显式函数调用**，不经过反射式构建器：

- **layered**：`doSimpleLayoutInner`（单图）+ `doCompoundLayout`（层级图）直接顺序执行全部模块；
  连通分量拆分/合并对应 ELK `ComponentsProcessor`（`doSimpleLayout` 内 `split → 每分量布局 → pack`）。
- **其他算法**：`mrtree` / `vertiflex` / `topdownpacking` / `rectpacking` / `radial` 各自在
  `src/<alg>/<alg>-layout.ts` 的管线函数中**按 AlgorithmAssembler 装配结果固定顺序**调用，
  文件头注释即装配清单。以 `mrtree-layout.ts` 为最典型例子：

```
MrTree.doLayout 管线（AlgorithmAssembler 按 IntermediateProcessorStrategy 枚举 ordinal 排序）:
  P1  DFSTreeifyer
  →   RootProcessor, FanProcessor, LevelProcessor        （P2 前）
  P2  NodeOrderer
  →   NeighborsProcessor, LevelHeightProcessor           （P3 前）
  P3  NodePlacer (Walker)
  →   DirectionProcessor, NodePositionProcessor, …       （P4 前）
  P4  EdgeRouter
  →   Untreeifyer                                        （P4 后）
```

策略分派入口：`layoutElkJson`（`src/api/elk-json.ts`）读 `org.eclipse.elk.algorithm` 分派；
非 layered 算法经 `src/api/registry.ts` 的 `registerAlg` 注册表调用（未注册抛明确错误）。
`src/api/layered.ts` 为 layered-only 子入口，便于 tree-shaking（不打包非 layered provider）。

## 7. 直接使用算法（Using Algorithms Directly）

Java 侧：算法入口是 `AbstractLayoutProvider` 子类，三步：`initialize(parameter)` → `layout(graph, monitor)`
→ `dispose()`；图结构用 `ElkGraph`，配置用图元素上的 layout options。

TS 侧对应：

| ELK Java 概念 | TS 移植对应 | 说明 |
| :--- | :--- | :--- |
| `AbstractLayoutProvider.initialize` / `dispose` | 无（无状态） | provider 不持有跨次状态；确定性由 `RANDOM_SEED` 属性（默认 `1`）保证，见选项参考 |
| `AbstractLayoutProvider.layout(graph, monitor)` | `LayeredLayoutProvider.layout(graph, monitor?)`（`layered-layout-provider.ts:1970`） | 入口等价；`monitor` 缺省用 `NullProgressMonitor`（对应 Java `BasicProgressMonitor`） |
| `ElkGraph` 数据结构的构建 | `buildGraph` / `extractGraph`（`src/api/elk-json.ts`） | JSON ↔ 内部 `LGraph` 双向转换 |
| layout options 配置 | `layoutOptions`（`org.eclipse.elk.*` / `elk.*`） | 见 [选项接口参考](./elk-layout-options.md) |
| 高层纯 Java 用法（RecursiveGraphLayoutEngine） | `layoutElkJson(input, options?)` | 消费方推荐入口：`JSON → buildGraph → provider → extractGraph → JSON` |

对普通消费方：**首选 `layoutElkJson`**，不要直接组装 `LGraph`（`llms.txt` 同此约定）。
`layoutElkJson` 支持 `layoutJsonBatch`（批量 + 逐项隔离）、`diffLayout` / `layoutJsonDiff`（布局差异）、
`control: { signal, onProgress }`（进度事件 + 取消）——分别对应 Java 侧的批量/进度/取消能力。

## 8. 针对性修改记录（相对 ELK Java 指南）

| 项 | Java 指南原文 | TS 移植修改 |
| :--- | :--- | :--- |
| 阶段接口 | `ILayoutPhase<P, G>` + `process(...)` | 无接口类型；阶段 = 策略分派函数簇（§3 表） |
| 处理器接口 | `ILayoutProcessor<G>` | 纯函数 + `runModule(name, hooks, graph, fn)` 包装（§4） |
| 装配器 | `AlgorithmAssembler`（反射式构建 `List<ILayoutProcessor>`） | 显式顺序调用（§6）；注释保留 ELK 槽位/枚举语义 |
| 策略工厂 | `ILayoutPhaseFactory` 枚举 | 选项键字符串/枚举 → `switch` 分派（§3） |
| Provider 生命周期 | `initialize` / `layout` / `dispose` | 无状态 `layout(graph, monitor?)`；取消/进度走 `control` 选项 |
| 进度监控 | `IElkProgressMonitor.subTask` | `LayoutPhaseHooks` 回调 + `GGN_PIPE_DBG` 环境变量 |
| 注册分派 | SPI / 服务注册 | `registerAlg` 注册表 + layered-only 子入口（tree-shaking） |

## 9. 相关文档

- [ELK 布局选项接口参考](./elk-layout-options.md) — 选项键 / TS Property / 默认值
- `docs/API.md` / `API-QUICKREF.md` — `layoutElkJson` 使用契约
- `PORTING.md` — 移植陷阱表（含管线顺序类陷阱）；`MODULES.tsv` — 模块 ↔ Java 类 ↔ 观测点清单。
  两者只存在于源码仓库，不随 npm 包发布。
