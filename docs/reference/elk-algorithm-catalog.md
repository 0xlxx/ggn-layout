# ELK 布局算法目录（模块 × 用途 × 决策树 × 协作模型）

> **Status**: 🟢 Active
> **Last Updated**: 2026-08-16
> **Parent**: [文档索引](../README.md)
> **Objective**: 枚举 `ggn-layout` 已移植的全部 14 个 ELK Java 0.12.0 布局算法模块，给出每个模块的官方用途、适用场景、协议暴露状态，并沉淀「场景 → 算法」决策树与「模块如何协作」模型，供使用者选型与维护者查表。

## 1. 为什么有这份文档

`本仓库` 是 ELK Java 0.12.0 的 1:1 TypeScript 移植，已注册 14 个算法（`src/register-all.ts`）。
用户与 LLM 通过 JSONL `layout.algorithm`（短名）选算法，但协议只暴露白名单子集，其余仅 layout 内部可用。
本文把「算法模块 → 官方用途 → 适用场景 → 协议是否暴露 → 如何与其他模块协作」一次性讲清，
避免每次选型都要翻源码。配套：[算法实现指南（结构/接口）](./elk-algorithm-guide.md) ·
[布局选项接口参考](./elk-layout-options.md) · 协议 §4.6（布局声明）。

## 2. 算法模块总表（14 个）

> 来源：ELK Java 0.12.0 官方 Reference（eclipse.dev/elk/reference/algorithms/*）+ 本仓库移植实现
> （`src/<alg>/`）。「协议暴露」列：✅ scene = 可作 scene 级根算法；✅ group = 可作 group 级黑盒；
> —  = 仅 layout 直接使用（JSONL 不接受，校验回 `VALIDATION_FAILED`）。

| # | 短名 | ELK id | 类别 | 官方描述（简） | 适用场景 | 协议暴露 | 移植实现 |
|---|---|---|---|---|---|---|---|
| 1 | `layered` | `org.eclipse.elk.layered` | 分层（Layered） | 把尽可能多的边导向同一方向，节点分层、层内最小化交叉；支持 straight/orthogonal/splines 路由、端口约束、跨层级边 | **默认/旗舰**：流程、层次结构图、状态图、subgraph 分区、跨组边；有向图通用 | ✅ scene（默认）+ ✅ group | `src/layered-layout-provider.ts` |
| 2 | `mrtree` | `org.eclipse.elk.mrtree` | 树（Tree） | 对输入图求生成树，按父-子层级排布所有节点 | 目录树 / 组织树 / 树形层级；父→直接子边的树 | ✅ scene + ✅ group | `src/mrtree/` |
| 3 | `radial` | `org.eclipse.elk.radial` | 放射（Radial） | 树根居中，同层节点放在同一半径的同心圆上 | 脑图 / 根居中的放射树 | ✅ scene + ✅ group | `src/radial/` |
| 4 | `force` | `org.eclipse.elk.force` | 力导向（Force） | 模拟物理力（Eades / Fruchterman-Reingold）让节点均衡分布 | 一般图 / 关系网络 / 无向混合图 | ✅ scene + ✅ group | `src/force/`（与 stress 同文件族） |
| 5 | `stress` | `org.eclipse.elk.stress` | 力导向（Force） | 应力最小化（stress majorization）：欧氏距离匹配图论距离 | 拓扑均衡 / 脑图 / 需要均匀散布的大图 | ✅ scene + ✅ group | `src/force/stress-layout.ts` |
| 6 | `box` | `org.eclipse.elk.box` | 打包（Packing） | 无连接盒子的简单装箱（SIMPLE 模式） | 无边的组件面板 / 简单装箱 | ✅ group（仅黑盒） | `src/api/core-providers.ts` |
| 7 | `rectpacking` | `org.eclipse.elk.rectpacking` | 打包（Packing） | 保持给定顺序的矩形打包：宽度近似 → 按行放置 → 同高成块 → 压缩 → 扩展填白 | 仪表盘卡片 / 保持顺序的紧凑矩形排布 | ✅ scene + ✅ group | `src/rectpacking/` |
| 8 | `topdownpacking` | `org.eclipse.elk.topdownpacking` | 打包（Packing） | 固定尺寸盒子自顶向下放置，水平扩展填白 | 层级行 + 节点列的架构图 / 自顶向下打包 | ✅ scene + ✅ group | `src/topdownpacking/` |
| 9 | `vertiflex` | `org.eclipse.elk.vertiflex` | 树（Tree） | 树布局 + 允许显式定义节点垂直位置（而非按拓扑自动分层） | 泳道 / 需固定垂直位置的树 | —（2026-08-16 从协议移除，仅 layout） | `src/vertiflex/` |
| 10 | `disco` | `org.eclipse.elk.disco` | 打包（Packing） | 排布未连接子图（默认不对子图自身布局）；Polyomino 组件压实 | 未连接分量打包 / 组件聚合 | — | `src/disco/` |
| 11 | `sporeoverlap` | `org.eclipse.elk.sporeOverlap` | 重叠消除（Overlap） | Nachmanson 等「Node overlap removal by growing a tree」：消除节点重叠 | 重叠消除（力导向/手动布局后处理） | — | `src/spore/` |
| 12 | `sporecompaction` | `org.eclipse.elk.sporeCompaction` | 压缩（Compaction） | ShrinkTree：保持拓扑的压缩（沿生成树收缩移动元素） | 紧凑化已有布局（保持拓扑） | — | `src/spore/` |
| 13 | `fixed` | `org.eclipse.elk.fixed` | 固定（Fixed） | 保持当前布局不动，可选给定节点/弯点坐标 | 编辑器手摆坐标 / 增量保持 | —（协议不暴露；编辑器场景由 layout 直接提供） | `src/api/core-providers.ts` |
| 14 | `random` | `org.eclipse.elk.random` | 随机（Random） | 平面随机分布（演示「真实算法」的价值） | 对照 / 演示 | — | `src/api/core-providers.ts` |

## 3. 决策树：我的图该用哪个算法？

```
你的图是什么结构？
│
├─ 有向流程 / 层次结构（DAG、含环状态机、subgraph 分区、跨组边）
│   └─ ▶ layered（默认；旗舰，协议 scene 级）
│
├─ 树（无环、有根，父→直接子）
│   ├─ 目录树 / 组织树 / 树形层级 → ▶ mrtree（树形专用）
│   ├─ 根居中、同层同半径 → ▶ radial（放射脑图）
│   └─ 拓扑均衡 / 均匀散布 → ▶ stress（应力最小化）
│
├─ 一般图 / 关系网络（无向混合、力导向观感）
│   └─ ▶ force（Eades / FR 物理模拟）
│
├─ 无连接盒子 / 打包
│   ├─ 保持顺序紧凑矩形（仪表盘）→ ▶ rectpacking
│   ├─ 层级行 + 节点列（架构图）→ ▶ topdownpacking
│   └─ 简单装箱（无边组件面板）→ ▶ box（仅 group 级黑盒）
│
├─ 嵌套分区（顶层 + 子图各自算法）
│   └─ ▶ layered 顶层 + group 级黑盒（box/force/radial/mrtree/stress/rectpacking/topdownpacking）
│
└─ 已有坐标 / 编辑器手摆
    └─ ▶ fixed（JSONL 不暴露；layout 直接使用）
```

选型要点：
- **不确定时用 `layered`**——它是旗舰、默认值、支持跨组边与任意嵌套白盒，v1 验收基准 S1–S5 全用它。
- **树优先 `mrtree`/`radial`**：mrtree 强调父子层级，radial 强调根居中放射（脑图）。
- **打包类（box/rectpacking/topdownpacking）不读边**：子树内声明边 → `LAYOUT_FAILED`（协议 §4.6.4 决策，错误暴露不兜底）。
- **sporeoverlap/sporecompaction/vertiflex/disco/random/fixed 协议不暴露**，需要时走 layout 直连（编辑器/工具场景）。
- **多轮编辑/增量**（编辑器拖拽、实时协作）：不换算法，用 **layered + interactive 三件套**（§3.5）——保持位置优先。

## 3.5 跨算法模式与处理器（非独立算法，叠加在算法上）

> 这些不是 `layout.algorithm` 可选的独立算法，而是叠加在算法（主要是 layered）上的**模式/处理器**，
> 通过透传通道或 layout 直连启用。协议 §4.6.2 的 `layout.layered` 透传通道（键 = ELK 参数全名，
> 值 string/number/boolean）可承载；demo 布局参数面板「半交互交叉」「交互布局」开关即经此通道注入。

| 模式 | ELK 键 | 作用 | 适用场景 | 协议/面板 |
|---|---|---|---|---|
| **增量布局（interactive）** | `layered.layering.strategy=INTERACTIVE` + `cycleBreaking.strategy=INTERACTIVE` + `crossingMinimization.semiInteractive=true` + `interactiveLayout=true` | 读上一轮坐标（节点 `x/y` → `LNode.position`），尽量保持节点原位，只重排受影响部分 | 编辑器拖拽 / 实时协作 / 流式增量——**多轮编辑后布局尽量不动**（demo-vite「增量布局 Playground」：加节点增量位移 0-120px vs 全量 905px） | ✅ `layout.layered` 透传 + 面板「交互布局」 |
| 半交互交叉最小化 | `layered.crossingMinimization.semiInteractive` | 层内按输入 `position` 升序，节点相对顺序稳定 | 增量布局的 P3 配套 | ✅ 面板「半交互交叉」 |
| 交互参考点 | `layered.interactiveReferencePoint` | 增量模式下位置参照点 `CENTER`/`TOP_LEFT` | 增量布局微调 | layout 直连 |
| 生成 layer/position id | `layered.generatePositionAndLayerIds` | 输出节点 layerId/positionId（增量布局内部用） | 增量布局配套 | layout 直连 |
| 连通分量拆分 | `separateConnectedComponents` | 拆分为连通分量各自布局再打包 | 多分量大图（默认 true） | ✅ `layout.layered` 透传 + 面板「分量」 |
| 长边拆分（long-edge split） | 内部处理器（LongEdgeSplitter） | 跨层长边拆成 dummy 节点链，保证 P1-P5 正确性 | layered 内部自动 | 算法内部 |
| 端口约束 | `portConstraints` | 端口侧/顺序固定（FIXED_*），块图/电路 schematic | 端口语义图（actor-oriented / 电路） | layout 直连 |

> **JSONL 边界（2026-09-11 起已打通）**：增量布局依赖「上一轮坐标回灌」，而协议元素**不携带坐标**
>（x/y 由布局引擎确定，§3.3）。该约束由 **kernel 自持**解决：runtime 保存上一轮 `SceneLayoutResult`，
> 下一轮结构变更时把坐标转成父相对坐标回灌 ELK（节点 `x/y` → `LNode.position`，另写
> `org.eclipse.elk.position` 供 semi-interactive 排层内序），并自动注入 interactive 组合；
> **新元素**没有上一轮坐标 → 按邻居推导种子（前驱右侧 / 后继左侧 / 无邻居则追加到最右列），
> 否则默认 (0,0) 会被 interactive 分层塞进最左 span、把整图推开。
> 用户经 `scene.layout.layered` 显式声明的同类参数优先（可关掉交互式放置）。
> 实测（`packages/kernel/tests/layout-stability.test.ts`，对照 = 全量重排）：
> 加节点 → 上游链路 0px（全量 6px 纵向偏移）；删节点 → 存活节点 0px 纵向、下游回填一列（全量 58px 纵向 + 跨两列）；
> 改尺寸 → 本节点左缘不动、下游按增宽平移（与全量重排同点 = 该例天花板）；
> 仅加边（拓扑约束变）→ 横轴零位移、只沿布局方向重排（全量对照还会把分量重新居中）；
> playground「Agent 开发过程：增量更新」实测：前 3 步纯新增节点 0 位移，容器内新增 + 兄弟改尺寸
> 位移 25px（全量对照 180px）。**已知边界**：新增「容器」或新增会跨层的边时，仍按拓扑需要重排
> （增量只保证无关节点与横轴不偏移）；更深度的稳定性（局部重布局 + 边局部路由）见 paradigm §4 待办。

## 4. 模块协作模型

### 4.1 入口：RecursiveGraphLayoutEngine（递归图布局引擎）

`layoutElkJson` 对齐 ELK `RecursiveGraphLayoutEngine`：**根图由声明的算法布局，非 layered 子树自底向上
先由各自 provider 布局定型（尺寸/位置），再作为「黑盒」交给根算法**——这是全部协作的基础。

```
layoutElkJson(input, { hierarchyHandling: "INCLUDE_CHILDREN", … })
  → 自底向上：黑盒子图（box/force/radial/mrtree/stress/rectpacking/topdownpacking）先布局定型
  → 根算法（layered / radial / force / mrtree / …）布局根层
  → mergeBlackBoxSubtrees 把子树合并回输出
```

### 4.2 黑盒语义（非 layered 子图）

| 算法 | 读边（内部边自行路由）？ | 跨出黑盒内部节点的边 | 说明 |
|---|---|---|---|
| force / radial / mrtree / stress | ✅ 读边 | → `LAYOUT_FAILED`（`assertNoCrossHierarchyEdge`） | 内部边由各自 provider 路由 |
| box / rectpacking / topdownpacking | ❌ 不读边（内部边 `sections=0`） | → `LAYOUT_FAILED` | 子树内声明边 → `LAYOUT_FAILED`（错误暴露） |
| vertiflex | ✅ 读边 | → `LAYOUT_FAILED`（跨层级边不支持） | 树算法边须连接父→直接子（ggn 无提平） |

- **容器端点跨算法边**（edge 端点 = group 容器本身）：由顶层算法正常路由（容器可作边端点）——这是
  f-mixed-layout 里「入口 → 子图 → 出口」两批并行编排的基础。
- **白盒 layered 子图**（group 声明 `algorithm: "layered"`）：INCLUDE_CHILDREN 与顶层同一次布局，
  跨组边可穿透任意层级——与黑盒形成「白盒 vs 黑盒」对比（f-mixed-layout 的 g-layered）。

### 4.3 分层算法内部的阶段协作（layered 5 阶段）

layered 内部按 P1 断环 → P2 分层 → P3 交叉最小化 → P4 节点放置 → P5 边路由装配
（详细见 [算法实现指南](./elk-algorithm-guide.md) §3）；各阶段可选策略经选项键替换，
中间处理器解决跨阶段协作（如 P1 反转的边由 `ReversedEdgeRestorer` 恢复）。

## 5. 与现有 demo 场景的对应

| 算法 | demo 场景 | 说明 |
|---|---|---|
| layered | s1–s5 + 大部分 f-* | v1 验收基准，默认算法 |
| mrtree | f-treeview | 目录/文件层级树 |
| radial | f-radial-mindmap | S2 Mindmap 放射版 |
| force | f-force-class | S4 Class/ER 力导向版 |
| stress | f-stress | 力导向应力（脑图） |
| rectpacking | f-rectpacking | 矩形打包 |
| topdownpacking | f-topdownpacking | 自顶向下打包 |
| box | f-mixed-layout（g-box 黑盒） | group 级黑盒 |
| vertiflex/fixed | （无；协议已移除） | 仅 layout |
| disco/sporeoverlap/sporecompaction/random | （无） | 仅 layout，未接入协议 |

> 决策树 + 协作的可视化演示见 vanilla-next demo「算法选型指南（决策树 + 打包协作）」（f-alg-guide）。
