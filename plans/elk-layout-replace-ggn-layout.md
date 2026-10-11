# elk-layout 替换 ggn-layout 调研

> ⚠️ 2026-09 包更名：`packages/elk-layout` → `packages/layout`（包名 `@ggn/elk-layout` → `@ggn/layout`）。本文写于更名前，正文里的旧路径按此映射阅读；结论与判据不变。


> 日期: 2026-08-06
> 结论: **可行, 但需先补完 elk-layout 验收 + 新增高层适配 API + orchestrator 双引擎分派**。
> elk-layout 目前零消费者、只覆盖 layered、无高层 API; 直接"换依赖"不可行, 必须做适配层。

## 1. 现状盘点

| | `ggn-layout` (packages/ggn-layout) | `@ggn/elk-layout` (packages/elk-layout) |
|---|---|---|
| 定位 | 生产主力布局引擎, "ELK 提取 + 自研" | ELK Layered **1:1 TS 移植** (模型/算法/变量名对齐 ELK) |
| 消费者 | 唯一: `ggn-vanilla` `LayoutOrchestrator._runGgnLayout` | **无** (repo 内 grep 不到任何 import) |
| 入口 | 高层命令式: `node()/edge()/layout()/projectToGlobal()` | ELK 图模型: `LGraph/LNode/LPort/LEdge` + `LayeredLayoutProvider.layout()` |
| 算法覆盖 | layered/dagre, tree, radial, force, stress, box, rectpacking | 仅 layered (rectpacking 移植其实在 ggn-layout/src/elk/rectpacking) |
| CLI | `layout` (bin) | 无 |
| 坐标输出 | `projectToGlobal()` 直接给**世界坐标** + 边 bendPoints + blocks | 节点坐标**相对父节点**, 需累加祖先; 边 bendPoints 在 `LEdge.getBendPoints()` |

### elk-layout 验收状态 (2026-08-06 实测)

- 中间验收 (elkt 官方 examples/tests/tickets, 696 图): **667/696 (95.8%)**
  - examples 88/90, tests 367/386, tickets 211/220 (PROGRESS.md 最新 +1 = 667)
- realworld (1100) 未验收; 全量含调试/临时测试 1835 个: 1442 通过 (78.6%)
- 剩余 29 个中间失败集中在深层交互簇:
  自环方向 (288a/552/352/463, NORTH vs SOUTH), 路由槽+BP (726), N-S dummy 宽 (502),
  分量排列 (flat01), north_south_fixed_side×2, hierarchy01/02/05/09, compound02-06,
  环图 (three_edges_inverted_ports_2), external_ports, variants, labels, portConstraints, 194/401。

## 2. 核心差异 (替换难点)

### 2.1 模型 API 对照

| ggn-layout (当前 orchestrator 用法) | elk-layout |
|---|---|
| `node({ id, width, height })` → LNode (id 是字符串) | `new LNode(graph)` + `n.size = {x,y}`; id 是**数字自增** (`LGraphElement.id`), 需外部映射 |
| `edge(src, tgt).id = e.id` (自动建端口) | `new LEdge()` + `setSource/setTarget(LPort)`; 端口需显式 (或 `createSimpleEdge` 语义) |
| `bn.children = [...]` (compound) | `parent.setNestedGraph(childGraph)` + `childGraph.setParentNode(parent)` |
| `bn.layoutDirection` | `graph.setProperty(DIRECTION, Direction.RIGHT|LEFT|DOWN|UP)` |
| `bn.layoutAlgorithm` | 仅 layered 有对应; 其他算法 elk-layout **没有** |
| `layout(roots, { direction, nodeSpacing, layerGap })` | `graph.setProperty(DIRECTION/SPACING_NODE_NODE/SPACING_NODE_NODE_BETWEEN_LAYERS)` + `new LayeredLayoutProvider().layout(graph)` |
| `projectToGlobal(roots, worldRouted)` → `{nodes, edges, blocks}` | **无等价物**, 需自写: 累加祖先 position+padding 得世界坐标; 提取 `LEdge.getBendPoints()` |

### 2.2 关键语义差异

1. **坐标**: elk-layout `doSimpleLayout` 末尾把 `offset + padding` 加到节点坐标 (`applyOffsetPadding`), 子图节点坐标是**相对父节点**的本地坐标 (与 elkjs 一致)。ggn 的 `projectToGlobal` 输出的是根级世界坐标。适配层必须做祖先累加 (测试里 `walkGgn` 已示范)。
2. **端口**: ggn 的 `edge()` 自动建端口 + `adjustPortSides` 按方向设侧。elk-layout 需要 LPort; 无端口约束时 `createSimpleEdge` 自动建即可, 端口侧由 `PortSideProcessor` 决定。
3. **边 bendPoints**: ggn 复合图经 `routeCrossEdges` + `_worldRouted` 标记世界坐标段; elk-layout 由 `OrthogonalEdgeRouter` 直接写 `LEdge.bendPoints`, 提取时需把相对坐标投影到根 (可用 `changeCoordSystem` 或手动累加)。
4. **块 (compound)**: orchestrator 的 block = 有 `children` 的 LNode; elk-layout 中 = 有 `nestedGraph` 的 LNode。输出 `{x,y,width,height}` 取 `position + size`。

## 3. 替换方案

### 方案 A (推荐): elk-layout 新增高层适配 API + orchestrator 双引擎分派

在 `packages/elk-layout/src/api/` 新增镜像 ggn-layout 入口的适配层:

```ts
// elk-layout/src/api/index.ts (示意)
export function layout(roots: GgnLikeLNode[], opts: { algorithm; direction; nodeSpacing; layerGap }): ElkLayoutResult
export function projectToGlobal(roots, result): ProjectedLayout  // { nodes, edges, blocks }
```

- 内部: `buildLGraph()` (LNode 树 → LGraph + 字符串 id 映射) → `LayeredLayoutProvider.layout()` → `extractResult()` (世界坐标 + bendPoints + blocks)。
- orchestrator `_runGgnLayout` 改成: `mode === layered/dagre → elk-layout`; 其他 mode (tree/radial/force/stress/box) → **回退 ggn-layout** (双引擎并存, 逐步迁移)。
- 优点: 侵入最小、feature flag 可回退、elk-layout 保持纯算法库 (适配层在 api/ 内)。
- 缺点: 需要写 ~300-500 行适配代码 + 对齐测试。

### 方案 B: orchestrator 直接构建 elk-layout LGraph (不推荐)

- 在 `orchestrator.ts` 里手写 `LGraph/LNode/LPort/LEdge` 构建 (像 `elkt2test` 生成的测试那样)。
- 缺点: 样板代码侵入渲染层、id 映射/坐标投影散落、难复用、难测试。

### 方案 C: ggn-layout 内部实现整体替换为 elk-layout (最终形态)

- 把 `ggn-layout` 的 `layout()/projectToGlobal()` 实现换成对 `@ggn/elk-layout` 的调用, 对外 API 不变。
- 前提: elk-layout 先补完非 layered 算法 (tree/radial/force/stress/box) 或 ggn-layout 保留这些。
- 适合作为**最终迁移目标**, 但不应作为第一步。

## 4. 建议实施步骤

1. **补验收 (前置)**: 完成 elk-layout 剩余 29 个中间失败 + realworld 1100 验收 (以 elkjs 坐标级差分为准)。
2. **新增适配层**: `packages/elk-layout/src/api/`:
   - `buildLGraph(roots, opts)` — LNode 树 → LGraph; 维护 `Map<number, string>` id 映射
   - `runLayout(graph)` — 包装 `LayeredLayoutProvider`
   - `extractResult(graph, idMap)` — 世界坐标累加 + blocks + `LEdge.getBendPoints()` 投影
   - 选项映射: `direction → DIRECTION`, `nodeSpacing → SPACING_NODE_NODE`, `layerGap → SPACING_NODE_NODE_BETWEEN_LAYERS`
   - 单测: 用现有 696 elkt 测试作为坐标对齐基准, 断言与 elkjs 一致
3. **orchestrator 分派**: `_runGgnLayout` 增加 `engine: "elk-layout"` 开关 (默认 ggn-layout 保底), layered/dagre 走新引擎, 其余算法回退 ggn-layout。
4. **回归**: `packages/ggn-vanilla/tests/layout/ggn-layout-integration.test.ts` + Playwright e2e + 视觉对比 (debug_screenshot 流程)。
5. **收尾**: 逐步把非 layered 算法迁入 elk-layout; 双引擎 → 单引擎; 更新 `ggn-vanilla/package.json` 依赖 (`ggn-layout` → `@ggn/elk-layout`), 移除 elkjs 死代码 (`mapElkResultToLocal` 等 deprecated 路径)。

## 5. 风险清单

| 风险 | 影响 | 缓解 |
|---|---|---|
| elk-layout 验收未完成 (95.8% 中间, realworld 未跑) | 替换后部分图坐标偏移/错乱 | 先补完 29 个失败 + realworld; 双引擎 flag 灰度 |
| 非 layered 算法缺失 | tree/radial/force/stress/box 布局不可用 | 双引擎分派: 非 layered 走 ggn-layout |
| 坐标语义不同 (相对父 vs 世界) | 节点/边错位 | 适配层累加祖先 + 对齐测试 |
| id 类型不同 (数字 vs 字符串) | edgeHints/blocks 无法按 id 索引 | 适配层维护双向映射 |
| 端口模型差异 (隐式 vs 显式) | 多端口/端口约束图行为不同 | orchestrator 现状不建端口 → 用 createSimpleEdge 语义; 后续按需加 PORT_CONSTRAINTS |
| 性能 | 1:1 移植对象分配多, 可能慢于 ggn-layout | bench (ggn-layout 已有 bench-hier.mjs 等) + 优化热点 |
| CLI 缺失 | `layout` CLI 不可用 | elk-layout 补 bin 或保留 ggn-layout CLI |

## 6. 相关文件

- 布局引擎: `packages/ggn-layout/src/layout.ts` (主入口), `src/coord-projection.ts` (projectToGlobal)
- 消费方: `packages/ggn-vanilla/src/renderer/layout/orchestrator.ts` (`_runGgnLayout` 第 ~108 行起), `src/renderer/layout/orchestrator/engine.ts` (LayoutEngine.expand, 旧 elkjs 路径)
- elk-layout: `packages/elk-layout/src/layered-layout-provider.ts` (入口), `src/graph/{lgraph,lnode,lport,ledge,lshape}.ts` (模型), `src/options/layered-options.ts` (属性)
- 验收: `packages/elk-layout/PROGRESS.md`, `packages/elk-layout/tests/elk-official/generated/*_batch.test.ts`
- 参考: `plans/ELK_PORT_STATUS.md`, `plans/elk-ts-rewrite-feasibility.md`, `docs/guides/layout-algorithms.md`

---

## 7. 补充: 不加适配层直接替换的工作量 (2026-08-06 追问)

"不加适配层"= 方案 B 的变体: 不新建 elk-layout 的 api 模块, 直接在
`ggn-vanilla/src/renderer/layout/orchestrator.ts` 的 `_runGgnLayout` 里内联
LGraph 构建 + 结果提取。无独立单元、无复用。

### 改动面 (消费方盘点)

- 唯一 import ggn-layout 的 src 文件: `orchestrator.ts` (`_runGgnLayout`, 约 109-298 行)。
- 测试直接 import ggn-layout: `tests/layout/ggn-layout-integration.test.ts` (157 行, 无对等 elk-layout 高层 API, 需重写/删除)。
- 间接消费 orchestrator 的测试: empty-group-spacing / scope / hierarchy-pruning / cross-layout / brandes-kopf 等 (src/renderer/layout/*.test.ts), 走 `layoutGraph()` 契约不变, 但坐标/尺寸断言需回归。
- 脚本: `scripts/compare-elk.mjs` 引用 ggn-layout (对比工具)。
- CLI: 根 package.json `"layout": "layout"` 调 ggn-layout bin; 直接替换后 CLI 丢失。
- 非 layered mode 在测试中的使用面: dagre 39 / force 8 / row 5 / scope 3 / transparent 10 → **force 等算法必须保留第二引擎或迁移**。

### 分项估算 (人天, 以"功能等价"为前提)

| 工作项 | 内容 | 行数 (approx) | 估时 |
|---|---|---|---|
| A. orchestrator 重写 | `_runGgnLayout`: ggn LNode 树 → LGraph (LNode/LPort/LEdge/nestedGraph + id 映射 + DIRECTION/SPACING/HIERARCHY_HANDLING 属性) | 100-140 | 1-1.5 天 |
| A2. 结果提取 | 世界坐标累加 (祖先 position+padding) + `LEdge.getBendPoints()` 投影 + blocks + 字符串 id 还原 | 80-110 | 0.5-1 天 |
| A3. 运行 + 诊断 | `LayeredLayoutProvider.layout()`; 删 `_crossMap`/`_worldRouted` 诊断 | 3-5 / -30 | 0.5 天 |
| B. 非 layered 算法 | 保留 ggn-layout 第二引擎 (force/tree/radial/stress/box/rectpacking): 分派 ~30-50 行; 或彻底删 ggn-layout → 迁移 587 行算法 / 砍功能 (影响 8 个 force 测试 + DSL 文档 + engine.ts 映射) | 30-50 或 587 | 0.5-1 天 或 3-7 天 |
| C. 测试回归 | 重写/删 ggn-layout-integration.test.ts; 回归 orchestrator 系列数值断言; e2e + 视觉对比 | — | 1-2 天 |
| D. **前置验收缺口** | elk-layout 29 个中间失败 (自环方向/compound/hierarchy/环图/端口分布) + realworld 1100 首次验收 | — | 3-7 天 |
| E. 收尾 | package.json/bun.lock 依赖、CLI (补 elk-layout bin 或删 script)、typecheck/lint、文档 | — | 0.5-1 天 |

### 合计

- **保留 ggn-layout 做非 layered 第二引擎 (推荐的理解)**: 约 **6.5-12 天** (A-C 2.5-5 天 + D 3-7 天 + E 0.5-1 天)
- **彻底删除 ggn-layout**: 再加 **3-7 天** (非 layered 算法迁移或砍功能)

### 与"加适配层"对比 (方案 A)

| | 不加适配层 (内联) | 加适配层 (elk-layout/src/api) |
|---|---|---|
| 核心代码 | ~200-280 行 (orchestrator 内) | 适配层 ~300-500 行 + orchestrator 只换调用 (~50 行) |
| 估时 (不含验收) | 2.5-5 天 | 3-5 天 |
| 可复用性 | 无 (CLI/未来消费者还得重写) | 有 (CLI、其他入口可直接用) |
| 可测试性 | 弱 (只靠 orchestrator 集成测试) | 强 (适配层独立单测, 可对齐 696 elkt) |
| 验收缺口 (D) | 相同 3-7 天 | 相同 3-7 天 |

**结论: 不加适配层的"写码"成本略低 (~1 天), 但省下的钱花在别处 —— 代码与渲染层耦合、
不可复用、测试更弱、CLI 仍要另写。且无论哪种方式, elk-layout 的验收缺口 (D) 是共同的最大
前置成本, 建议先补完再谈替换。**
