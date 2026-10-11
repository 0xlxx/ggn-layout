# BDD 行为测试 (直接 vitest)

为 layout (ELK Layered 的 TypeScript 移植) 编写的行为规格，**直接使用 vitest**
（无 `.feature`、无正则 step 注册表）。用类型化场景表 + `it.each` 保持"表格即规格"的
直观性，同时获得类型安全、重构友好、可直接调试（vitest UI 渲染可读用例名）。

## 运行

```sh
bun run test:bdd      # 或: vitest run tests/bdd
```

## 目录结构

- `bdd-helpers.ts` — 共享 helper（建图/布局/断言，无测试用例）：
  - `Harness` 类：链式建图 + 执行（`node/edge/edgeWithLabel/compound/fixedSidePorts/`
    `direction/orthogonalRouting/layout/layoutIncludeChildren`）；
  - 断言函数：`expectLayered` / `expectLayerOrderNonDecreasing` / `expectP1Acyclic` /
    `expectNoOverlap` / `expectFiniteCoords` / `expectPositiveSizes` / `expectSourceRelative` /
    `expectParentContains` / `expectPortOnBoundary` / 边标签 / N-S 路由（Step2-5 公式）/
    结构不变量（无悬挂边、临时 dummy 移除、dummy 位于内容区外、坐标有限、无环）/
    正交路由（弯点逐点、正交交替、不穿过节点盒）。
- `*.scenarios.test.ts` — 各领域行为规格（场景 = `it`，表格 = `it.each`）：
  - `core-layout` — 分层核心（每节点有层、层序非降、P1 断环无环、不重叠、坐标有限、
    尺寸为正、方向推进、连通分量独立定位）。
  - `compound-ports` — 复合包含/尺寸覆盖、FIXED_SIDE 端口侧保持、端口锚点贴边界。
  - `labels` — 边标签（CENTER/HEAD/TAIL）坐标有限、尺寸为正、带标签不重叠。
  - `port-labels` — 端口不越界、不同端口侧布局稳定。
  - `orthogonal-routing` — 阶梯长边弯点与 ELK Java 逐点一致
    （A→C = (82,28),(82,12),(162,12),(162,28)）、叉形图/直边正交不变量、
    跨层级边端点统一引用图坐标系（无斜线，`getEdgeEndpoints`）、边段不穿过节点盒。
  - `north-south-ports` — N-S 外部端口正交边路由（`HierarchicalPortOrthogonalEdgeRouter`）：
    路由调整嵌套图 offset/size（NORTH 加 offset+size、SOUTH 仅 size、直线边 slots=0 不加）、
    N/S dummy 定位（ggn 语义）、E/W dummy x 修正（Step5）、临时 dummy 移除后边重连（Step4）、
    端到端复合图结构不变量。
  - `parser-scenarios` — elkt 解析器（`scripts/elkt2test.mjs` 的 `parseElkt`）：
    结构计数与引用完整性、顶层算法属性（direction/spacing/策略）、节点属性
    （portConstraints / nodeSize.constraints）、容器方向/`nodeLabels.placement`、
    容器标签简写（`label "text"`，id 可选，ELK `ElkGraph.xtext` 语法）、
    端口侧与显式 index（`index: -1` = 未定义，不注入显式约束）、端口 position/size/
    borderOffset、`portIds` 集合、边端点解析（具名端口/自环/层级作用域/
    作用域内未限定名解析 `n1→n2` → `leftToRight.n1→leftToRight.n2`）、
    边标签与元数据（text/width/height/placement/insideSelfLoops.yo/edge.thickness）、
    节点标签布局（size/position/placement）、普通节点简写标签、多层层级结构。

## 编写新用例

1. 场景 = 普通 `it('可读标题', ...)`；多用例表格 = 类型化数组 + `it.each`（`$name` 渲染成
   vitest UI 里的用例名）。
2. 建图/布局用 `Harness`（链式），断言用共享函数；新断言直接写在测试里或用
   `bdd-helpers.ts` 的导出函数。
3. 无正则、无全局 step 注册表；报错直接指向断言行。

## 断言依据

断言只覆盖算法**真实保证**的性质（来自 L3 不变量 + elk-java-unit 验证过的行为）：
无环 / 每节点有层 / 层序非降 / 不重叠 / 坐标有限 / 尺寸为正 / 方向推进 / 复合包含 /
端口侧保持 / 端口贴节点边界 / N-S 路由 offset/size 公式 / N-S、E/W dummy 坐标 /
临时 dummy 移除与边重连 / 结构不变量（无悬挂边、图无环、坐标有限、dummy 位于内容区外）。

> 注：`north-south-ports` 的 NORTH dummy 定位按 **ggn 语义**断言 `northY = -offset.y`
> （ELK 为 `-padding.top - offset.y`；padding 由 `resizeParentNode` 单独计入，
> 二者经 resize 后 dummy 均落在父节点顶边，语义等价）。
> "有环图被去环"断言的是 **P1 阶段**断环标志（输出边被 `ReversedEdgeRestorer` 恢复原方向后
> 最终图可能仍有环）；N-S 场景的"图无环"断言的是最终图实际无环。
