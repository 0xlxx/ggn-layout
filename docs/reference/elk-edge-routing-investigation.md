# ELK 边路由拐角调研（Java 对照 · 参数矩阵 · 结构优化）

> **Status**: 🟢 Active
> **Last Updated**: 2026-09-10
> **Parent**: [文档索引](../../README.md)
> **Objective**: 回答「图里拐角很多」的三个问题——ggn-layout 是否劣于原生 ELK Java、是否存在最优参数、算法层还有多少优化空间——并给出可执行建议与复现路径。

## 1. 问题与样本

用户在 Viewer（`run_ggn_project_feedback`）看到：`GGN 项目` 节点向 7 个模块发出 `contains` 边，
这些边跨越多列、每条 2–4 个折点，整图 19 条边共 40 个弯点（bendpoint）。

样本构成：12 个节点（1 根模块 + 7 子模块 + 2 task + 2 verification）、19 条边
（7 `contains` + 6 `depends_on` + 1 `calls`-类 `rel` + 2 `task-module` + 2 `verification-subject`）。

## 2. 结论速览

| # | 问题 | 结论 |
| :--- | :--- | :--- |
| 1 | 是否比原生 ELK Java 更劣？ | **否**。同一份 ELK JSON 输入，19/19 条边逐点一致（ε=0.01），总弯点 40、总边长 4786.2 与 Java 完全相同 |
| 2 | 是否有「最优参数」？ | **本图没有全局最优解**。`POLYLINE` 能把弯点 40→13，但放弃正交语义；`BRANDES_KOEPF` 34 弯点但长度 +16%；`favorStraightEdges` / `thoroughness` / 按边 `priority.straightness` 对本图**无效** |
| 3 | 算法还有优化空间吗？ | **移植层没有**（已逐点等价，改即破坏 1:1 使命）；**产品层有，且杠杆最大**：把 `contains` 长边改为 `group.children` 层次包含，弯点 40→16、边长 4786→1708（−64%） |

拐角多的根因不是算法或移植，而是**图结构表达**：把「层次包含」建模成了跨层长边。

## 3. 与原生 ELK Java 的逐点对照

### 3.1 方法

1. 从 Viewer `GET /api/events` 抓取 `run_ggn_project_feedback` 全量事件，用宿主应用的 event reducer 重放成场景元素；
2. 用 kernel `measureNode()` 计算节点尺寸，导出标准 ELK JSON（19 边 / 12 节点 / `json.shapeCoords=ROOT`）；
3. **同一份 JSON** 分别跑：
   - 本仓库：`src/api/index.ts` 的 `layoutElkJson()`
   - Java oracle：`java -cp "out-edge:lib/*" LayoutJsonMain <input.json>`（ELK 0.12.0 + 未签名 layered jar）

### 3.2 结果

```json
{
  "edges": 19,
  "exact": 19,
  "totals": {
    "ggn":  { "bends": 40, "length": 4786.2 },
    "java": { "bends": 40, "length": 4786.199 }
  },
  "different": []
}
```

即：**逐条边、逐个折点、逐个端点完全一致**。JS 移植没有引入任何额外的弯点或走线劣化；
40 个弯点是当前 ELK layered + `ORTHOGONAL` 在处理这张图时的正确输出。

### 3.3 嵌套容器（结构改造后）的对照

把 `contains` 长边改写成 `group.children` 后复跑两侧：

- 弯点 16 / 边长 1696 —— ggn 与 Java **总量一致**；
- 12/12 条边在归一化容器偏移后逐点一致。

> 坐标模式差异（非路由差异）：Java 的 JSON 导出器输出**父相对坐标**（ELK 内部表示），
> `ggn-layout` 按 `json.shapeCoords=ROOT` 投影为绝对坐标。两者相差一个容器偏移
> `(376.3, 17)`，归一化后完全一致。kernel 依赖 ROOT 绝对坐标，不要改这条投影。

## 4. 参数矩阵（同一张图，19 条边）

基线：弯点 40 / 长度 4786.2 / 画布 1265.9×447 / 交叉 0。

| 参数 | 弯点 | 总边长 | 画布宽×高 | 备注 |
| :--- | ---: | ---: | :--- | :--- |
| baseline（NETWORK_SIMPLEX + ORTHOGONAL） | 40 | 4786.2 | 1265.9×447 | 当前默认 |
| `nodePlacement.strategy=BRANDES_KOEPF` | 34 | 5551.4 | 1295.9×447 | 弯点 −15%，长度 +16%（ELK 引擎默认策略） |
| `nodePlacement.strategy=LINEAR_SEGMENTS` | 42 | 5354.4 | 1305.9×412.8 | 更矮但更长 |
| `nodePlacement.strategy=SIMPLE` | 60 | 6871.7 | 1405.9×364 | 明显更差 |
| `mergeEdges=true` | 36 | 5316.7 | 1245.9×447 | 弯点 −10%，但**交叉对 32**（基线 0） |
| `mergeEdges=true` + BK | 40 | 5765.8 | 1235.9×410 | 交叉对 37 |
| `favorStraightEdges=true` | 40 | 4786.2 | 1265.9×447 | 对本图**无效果** |
| `thoroughness=30` | 40 | 4786.2 | 1265.9×447 | 无效果 |
| 按边 `layered.priority.straightness`（contains 上取 10/64/1000） | 40 | 4786.2 | 1265.9×447 | **无效果**（NETWORK_SIMPLEX 下不改变流守恒解） |
| `highDegreeNodes.treatment=true, threshold=4` | 46 | 8694.3 | 1651.9×380 | 更差 |
| `spacing.edgeNodeBetweenLayers=30` | 40 | 5746.2 | 1393.9×447 | 只变长 |
| `spacing.nodeNodeBetweenLayers=40` | 40 | 4926.2 | 1283.9×447 | 只变长 |
| `edgeRouting=POLYLINE` | **13** | 4437.9 | 1265.7×447 | 弯点 −68%，但走线不再正交（斜段） |
| `edgeRouting=SPLINES` | 104 | 4516.4 | 1265.9×447 | 折点计数不适用（曲线） |
| BK + POLYLINE | 15 | 4532.4 | 1273.5×451.5 | 正交换平滑的最均衡组合 |
| LINEAR_SEGMENTS + POLYLINE | 18 | 4500.7 | 1257.5×412.8 | 最紧凑 |
| `mergeEdges` + POLYLINE | 16 | 5164.5 | 1302.3×447 | 仍带交叉问题 |
| `crossingMinimization.strategy=NONE` | 44 | 5559.2 | 1295.9×489 | 更差 |
| `crossingMinimization.strategy=INTERACTIVE` | 48 | 8386.2 | 1405.9×546 | 明显更差 |
| `layering.strategy=LONGEST_PATH_SOURCE` | 42 | 4190.0 | 1137.3×408 | 更小更短但弯点更多 |
| `layering.strategy=LONGEST_PATH_SINK` | 40 | 4786.2 | 1265.9×447 | 无效果 |
| `layering.strategy=COFFMAN_GRAHAM` | 42 | 5377.9 | 1265.9×458 | 更差 |

**读法**：本图的弯点主要来自「长边跨层 + 正交折线」，而列在表里的所有节点放置/间距/优先级参数，
最多只换来 ±15% 的弯点，代价是边长或交叉；`POLYLINE` 是唯一的大幅下降，但改变了视觉语法。
**没有「一个参数让拐角消失」的选项。**

### 4.1 `contains` 边是主要来源（归因）

| 边类 | 条数 | 弯点 | 总长 |
| :--- | ---: | ---: | ---: |
| `contains:mod_ggn:*` | 7 | 22 | 3001 |
| 其余（`rel_*` / `task-module` / `verification-subject`） | 12 | 18 | 1785 |
| 合计 | 19 | 40 | 4786 |

`contains` 占 **55% 的弯点、63% 的总边长**——它是「把层次包含画成跨层长边」的直接后果。

## 5. 社区调研（Eclipse ELK issue 与官方口径）

| 来源 | 要点 |
| :--- | :--- |
| [elk#766](https://github.com/eclipse-elk/elk/issues/766) Non-optimal edge routing | 弯点由 long-edge dummy、hierarchical dummy port、external port dummy 产生，是布局方法的内在机制；官方建议调 `edgeEdge` / `edgeNode` / `portPort` 间距缓解，0.7.1 修过一轮回归但「奇怪走线」仍属已知 |
| [elk#916](https://github.com/eclipse-elk/elk/issues/916) | layered 不会自动为边挑最优端口；官方推荐 libavoid——**只存在于 Java ELK，elkjs 不支持** |
| [elk#1174](https://github.com/eclipse-elk/elk/issues/1174) | 官方明确：**ELK 不支持「固定节点位置 + 仅边路由」**；`INCLUDE_CHILDREN` 下不能对不同层级用不同算法；建议自行计算节点坐标/内部走线 |
| [elk#1068](https://github.com/eclipse-elk/elk/issues/1068) | child→parent 边路由异常（NETWORK_SIMPLEX 相关），Not planned |
| [elk#700](https://github.com/eclipse-elk/elk/issues/700) / [#824](https://github.com/eclipse-elk/elk/issues/824) | `INCLUDE_CHILDREN` 层级布局的历史 bug 与「层级感知布局应处理独立连通分量」（Open，0.13.0） |
| [elk#771](https://github.com/eclipse-elk/elk/issues/771) / [#1148](https://github.com/eclipse-elk/elk/issues/1148) / [#1175](https://github.com/eclipse-elk/elk/issues/1175) | hyperedge 路由歧义、共用端口穿节点、port side 约束导致布局失败（均 Open，属引擎未支持能力） |

官方选项语义（ELK 0.12 layered）：

- `layered.mergeEdges` 默认 `false`；置 `true` 会合并同源/同目标的出/入端口，本图交叉暴增，**不建议**；
- `layered.unnecessaryBendpoints` 默认 `false`，置 `true` 只会**增加**弯点；
- `layered.nodePlacement.strategy` 引擎默认 `BRANDES_KOEPF`（本仓库 kernel 选 `NETWORK_SIMPLEX`：总边长最小）；
- 路由只支持 straight / orthogonal / spline 三档，没有「最小弯点正交路由」。

## 6. 优化空间（按投入产出比排序）

### 6.1 结构：`contains` 边 → `group.children`（建议优先）

把层次包含从「跨层长边」改为真正的嵌套容器（kernel 已支持任意深度嵌套 + `INCLUDE_CHILDREN`）：

| 指标 | 扁平平铺 + contains 长边 | `group.children` 层次 | 变化 |
| :--- | ---: | ---: | ---: |
| 弯点 | 40 | 16 | **−60%** |
| 总边长 | 4786.2 | 1708 | **−64%** |
| 画布宽 | 1265.9 | 1118.3 | −12% |
| 画布高 | 447 | 319 | −29% |
| 边数 | 19 | 12 | −37% |

改造后宿主图仍是同一套 layered 语义（`rel_*` 依赖在容器内部参与分层），只是层次不再用长边表达。

**已实施（2026-09-10）**：宿主应用的归约器不再发 `contains` 边——有子模块的 module 直接渲染成
`group` 容器（children = 子模块），容器自身承载标题 / 状态行 / 进度条（kernel group-renderer）。
同口径复测（`layoutScene` 前后对照，`run_ggn_project_feedback` 63 事件快照）：

| 指标 | contains 长边（迁移前表达） | group.children（迁移后） | 变化 |
| :--- | ---: | ---: | ---: |
| 边数 | 22 | 15 | −32% |
| 弯点 | 52 | 32 | **−38%** |
| 总边长 | 12584 | 7421 | **−41%** |
| 画布 | 2083×648 | 1890×536 | 双向收窄 |

> 注：上表基线（52 弯点）比 §4 的 40 弯点大，因为快照多了 3 条事件（task + verification）。
> verification 曾以 `summary` 当节点 label（长句 → 巨宽节点），2026-09-10 起改为 **subject 节点内徽标**
> （`metadata.badges`，见 `ggn-theme.md` badge 一节），同快照再降：19 边/42 弯点/10392 长 →
> 12 边/20 弯点/5454 长（画布 1862×508 → 1840×343）。

### 6.2 渲染：折角圆角（已具备）

`edge-renderer` 对正交折线的每个弯点用三次贝塞尔圆角过渡（`--ggn-radius-edge-corner`，当前 6px，
短段自动 `min(r, seg/2)` 保护）。它不减少弯点数量，只降低「锐角感」——**不能替代 6.1**。

### 6.3 参数：仅在特定场景开启

- 需要「正交但更少折点」且能接受更长边：`nodePlacement.strategy=BRANDES_KOEPF`（34 弯点，+16% 长度）；
- 需要视觉平滑且可放弃正交语法：`POLYLINE`（13 弯点）——建议作为**场景级可选**透传
  （`scene.layout.layered["org.eclipse.elk.edgeRouting"]` 已支持），不改为产品默认；
- `mergeEdges` / `highDegreeNodes.treatment` / `unnecessaryBendpoints`：本图**明确更差**，不要开。

### 6.4 暂不做的两件事

1. **自研正交路由（libavoid 等）**：ELK 官方只支持 Java 侧 libavoid，elkjs 无对应实现。
   若要做，等于在 kernel 之上再写一层路由引擎，与 `本仓库` 的 1:1 移植使命冲突，
   当前收益（本图 40→13 弯点）不足以支撑该复杂度。
2. **固定节点位置 + 只重算边**：ELK 明确不支持（#1174），需要自研或改用 Java 侧 libavoid。

## 7. 决策建议

1. **保持 `ORTHOGONAL` 为产品默认**——移植层的价值是与 ELK Java 逐点等价，不应为审美偏离；
2. **拐角问题的正解是结构而不是参数**：把模块层次从 `contains` 长边迁移到 `group.children`；
3. `POLYLINE` / `BRANDES_KOEPF` 作为**场景级可选项**保留，不进默认；
4. 渲染层圆角继续维护（softening），但不作为「减少拐角」的手段。

## 8. 复现路径

样本与脚本来自一次会话内的临时分析（未入库），步骤如下：

```text
1) 抓事件      GET http://127.0.0.1:5198/api/events → 过滤 runId
2) 重放        宿主应用 reducer → createScene/updateElements → 元素集
3) 量尺寸      kernel measureNode() → 节点 width/height
4) 导 ELK JSON  id + children(size) + edges(sources/targets) + layoutOptions（ROOT 坐标 + NETWORK_SIMPLEX + edgeNodeBetweenLayers=14）
5) 双侧跑布局   ggn-layout layoutElkJson()  vs  Java oracle（同一份 JSON）
6) 比指标      逐边折点/端点（ε=0.01）+ 弯点数 + 总边长 + 交叉对
```

本次产物为一次会话内的临时文件（19 边输入样本、双侧输出、逐边指标），未入库、也未随包发布。

Java oracle 命令（ELK 0.12.0 + 未签名 layered jar；`LayoutJsonMain` 是一次会话内的临时探针程序）：

```bash
java -cp "<probe-out>:<elk-jars>/*" LayoutJsonMain <input.json> > <java-raw.txt>
```

> 长期回归建议：把「层次包含 vs contains 长边」两个样本收敛为 `本仓库` 的测试用例
> （同一 ELK JSON 进 → 断言弯点/边长上界），避免只靠临时脚本复现。

## 9. 相关文档

- [ELK 间距选项指南](./elk-spacing-options.md)：间距成对语义与覆盖规则
- [ELK 布局选项接口参考](./elk-layout-options.md)：`LayeredOptions` 键与默认值
- GGN 渲染参数规格（edge 渲染参数与圆角语义）——随 GGN 主仓库维护，本仓不含该文档。
- Agent 开发过程可视化事件协议（`contains` 与层级语义）——同上，随 GGN 主仓库维护。
