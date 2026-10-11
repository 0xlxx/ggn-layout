# elk-layout 移植目标完成总结（元过程记录）

> 日期: 2026-08-09
> 目标: 移植 elk java 到 typescript（项目 elk-layout，范围 = ELK Java 0.12.0 alg.layered）
> 通过标准: 通过 elk Java 的所有类型测试（= alg.layered JUnit 移植）
> 工作流: bun.com/blog/bun-in-rust（1 写 + 2 对抗审查 + 1 修 + 1 验证；测试当裁判；错误当工单）
> 技术细节见 PROGRESS.md（4152 行工单记录）+ docs/PORTING.md（陷阱表）

## 资源消耗（goal 结算）

| 项 | 值 |
|---|---|
| tokensUsed | **27,129,548**（无 budget） |
| timeUsedSeconds | **149,225**（≈41.4 小时活跃运行） |
| 起止 | 2026-08-07 12:55 → 2026-08-09 19:47（Asia/Shanghai，日历 ≈2.3 天） |

## 过程统计

| 指标 | 值 |
|---|---|
| 测试收敛 | elk-java-unit **11 failed → 0 failed**（1039/1039 全过） |
| 覆盖审计 | alg.layered 测试类 vs elk-java-unit = **0 缺失**（comm -23） |
| 对抗审查轮数 | **6 轮**（Nash / Herschel / Sartre / Ampere / Avicenna / Meitner） |
| 关键修复 | 10 个失败簇收敛（含 4 处真实代码修复 + 6 处 harness/测试修正） |
| oracle 重生成 | 349 图（jar） |
| batch 测试重生成 | 348 图 |
| 新增工具/探针 | cmp-edge / cmp-nodes / render-edge-cmp + InstrCmpMain 等 jar 探针 |

## 完成度

- **达成**：elk-java-unit（alg.layered JUnit 移植）完整覆盖 + 1039/1039 全过；EdgeRoutingE2E 949；696 门禁 PASS
- **剩余（已登记 triage）**：696 坐标差分 7 bug（NODE_LABELS 尺寸/放置系统，无 Java 单测，坐标级验证）
- **后续发现**：demo-vite 边路由视觉偏差（carTracking 16/57 边差异 + 节点位置差，根因 NODE_LABELS 系统；intersections 300 节点差异边 0）

## 时间线（关键里程碑）

- 08-07 12:55 — goal 启动（11 failed 基线）
- 08-09 深夜 — 收敛 RoutingDirector×3 / Issue546 / ReversedEdgeRestorer / BasicCrossingMinimization / BasicConsiderModelOrder / Issue455 / Issue515 / PortListSorter
- 08-09 深夜 — Issue905 收敛（HPOER 时序 + label 输入保真 + Meitner 实测 label 占位相加公式）
- 08-09 19:47 — goal complete（1039/1039 全过）

## 对抗审查产出（各轮要点）

| 轮次 | 模块 | 结论 |
|---|---|---|
| Nash | NodePromotion 管线 | 顺序 70 在 72 前（死循环根因） |
| Herschel | MODEL_ORDER | 根因 = NodePromotion 分层（非 N-S 外部端口） |
| Sartre | Issue905 | copyLabelsBack 缺失（段边标签丢失） |
| Ampere | PortListSorter | elkg SEPARATE vs elkt INCLUDE_CHILDREN 输入口径 |
| Avicenna | Issue905 x | HPOER 提前 return（After phase 5 时序） |
| Meitner | label 占位 | 相加公式 12+21+5=38（jar/elkjs 实测） |

## Visual-Verify 结论（luna 子代理，2026-08-09）

**证据**: /tmp/cartracking-cmp.png（80 节点 ggn红/jar蓝）、/tmp/intersections-cmp.png（300 节点）
**审阅**: gpt-5.6-luna（Linnaeus）独立视觉复核

| 图 | 结论 | 细节 |
|---|---|---|
| cartracking（80 节点） | **FAIL** | 右下区域红蓝明显分离：红线横穿 N16/N8 节点矩形；长边 y 偏移 25-30px；底部回路不同路径；N12/N13/N17 附近不同通道 |
| intersections（300 节点） | **PASS** | 红蓝基本重合，无路径分叉/穿节点 |

**数值佐证**（cmp-nodes/cmp-edge）：carTracking 10/50 节点差>2（N11=297, N14=167, N16=137, N4/N6/N8=28），16/57 边差异；intersections 差异边 0。

**根因链（已定位）**:
1. **分层一致**: N11（DiscreteClock）在 TS 与 jar 都第 0 层（afterPhase P2 + DebugMain 快照实证）
2. **分量合并差异**: carTracking 被拆成多分量（SeparateConnectedComponents，每分量独立 LGraph）；N11 所在分量合并位置 y 差 297（TS 568 vs jar/elkjs 270）→ ComponentGroupGraphPlacer 合并位置与 jar 不同
3. **节点位置差传导**: N4/N6/N8 等节点 y 差 28（端口差 28）→ 边端点差
4. **边弯点差**: TS OrthogonalRoutingGenerator 只生成部分弯点（Y 拆分，`calculateBendPoints` 对 y 相同边跳过），缺 X 方向槽路由弯点；加节点位置差 → 边路径与 jar 不同/横穿节点
5. **intersections PASS**（300 节点）: 分量合并/边路由一致 → 差异集中在 carTracking 的多分量合并路径

**修复方向（深水区）**:
①**BK layout 选择差异（carTracking 主因）**: TS BKCompactor 214 行 vs jar 421 行（缺 spacing/class 逻辑）。
  GGN_BK_DBG: TS 选 vdir=1(UP) layout（size 402.5 最小），其中 N11/N4 同 y(-104)；jar 可能选 vdir=0(DOWN)
  → N11/N4 相对位置差 298 → 节点/端口差 → 边路由差。修复需完整移植 BKCompactor 的 layout size/选择。
②NODE_LABELS 尺寸/放置系统（696 同源）；
③OrthogonalRoutingGenerator 完整弯点（X 方向槽路由）。

## 后续修复：carTracking/intersections 边路由完全对齐 jar（2026-08-09 晚）

**目标**: 修复 demo-vite 80/300 节点边路由偏差（上一轮 Visual-Verify FAIL）
**结果**: carTracking 节点 0/50 差>2（max=0.0）、边 57/57 匹配；intersections 节点 0/220、边 200/200 匹配
**视觉复核**: gpt-5.6-luna（Mill）对修复后 PNG 双图 **PASS**（边路由重合/节点重合/无穿节点）

### 根因（最终确认）

**P3 GreedySwitch 误激活**（不是 BK layout 选择，也不是 NODE_LABELS）：

1. ELK Java `GraphConfigurator.activateGreedySwitchFor` 在**根图 split 前**判断：
   `!interactiveCrossMin && greedySwitchType != OFF && (activationThreshold == 0 || activationThreshold > graphSize)`
   - graphSize = 根图 layerlessNodes 数（**不含 dummy**）；默认阈值 40
   - carTracking 根图 50 节点 > 40 → **不激活** GreedySwitch → P3 只跑 BARYCENTER
2. TS `runGraphPostP3` 的 `runGreedy` 只判断 `greedyType !== 'OFF'`，**漏了激活阈值**；
   且 TS 在**分量图**上运行（C0=17 节点 < 40 → 误判激活）→ GreedySwitch 交换了 C0 L3 层
   `PeriodicSampler2/Integrator2` 顺序 → P4 前输入不同 → BK 方向选择不同（TS 选 UP/RIGHT，
   jar 选 LEFTDOWN）→ N11 差 297 → 边路由错位
3. 逐层对比证据：P3(BARYCENTER) 后 TS/jar 层序一致（InLayerConstraintProcessor Before 快照）；
   GreedySwitch 后 TS 层 3 变 `[Integrator2, PeriodicSampler2]`（SD decide matrix=[1,0] 判定交换），
   jar 保持 `[PeriodicSampler2, Integrator2]`

### 修复（3 处代码 + 1 处测试）

| 文件 | 修改 |
|---|---|
| `src/layered-layout-provider.ts` | `doSimpleLayout` split 前按 ELK 语义计算 GreedySwitch 激活（根图节点数 + 阈值），存 `GREEDY_SWITCH_ACTIVE` 属性；`runGraphPostP3.runGreedy` 改读该属性（`GGN_GREEDY_OFF` 仍可调试关） |
| `src/options/internal-properties.ts` | 新增 `GREEDY_SWITCH_ACTIVE` 内部属性 |
| `src/options/layered-options.ts` | 新增 `CROSSING_MINIMIZATION_GREEDY_SWITCH_ACTIVATION_THRESHOLD`（默认 40） |
| `src/p4nodes/spacings.ts` | 重写对齐 jar `Spacings`：构造收 graph，预计算 vertical/horizontal **属性表**（vertical 用 BETWEEN_LAYERS 变体），`getVerticalSpacing(n1,n2)` 支持 `SPACING_INDIVIDUAL` 个体覆盖 + `Math.max`（jar 语义）；修正 labelNode/labelPortVertical/portPort 属性映射（原用 SPACING_NODE_NODE/EDGE_EDGE 替代） |
| `src/util/java-random.ts` | `nextLong()` 从 elkjs(GWT) 语义改为 ELK Java 语义（`((long)next(32)<<32)+next(32)` 低 48 位，`setSeed` 只用低 48 位）；避免 BARYCENTER `compareDifferentRandomizedLayouts` setSeed 后 random 序列与 jar 分歧 |
| `tests/elk-java-unit/NetworkSimplexPlacerTest.test.ts` | Spacings 构造改为 `new Spacings(g)` |

> 注：carTracking 的 nextLong 调用点 r1 为正时新旧实现结果相同（低 48 位一致），故非该图主因；
> 但对 r1 为负的图（BARYCENTER setSeed 重置），GWT/Java 语义分歧会改变 GreedySwitch 方向，一并修正。

### 经验教训

1. **激活条件要在"正确的图"上判断**：ELK 的 per-graph 配置（GraphConfigurator）在 ComponentsProcessor.split **之前**对根图执行；TS 若在分量图上判断会得到错误 graphSize
2. **GreedySwitch 对输入顺序敏感**：TWO_SIDED 每遍交换相邻对并重复到无改进，第一遍 sweep 方向（random.nextBoolean）与层序输入共同决定结果；`CrossingMatrixFiller` 用 `node.id` 作矩阵索引，要求每层 id=0..size-1（由 BARYCENTER 的 AbstractBarycenterPortDistributor/SweepCopy 设置，GreedyPortDistributor 不设置）
3. **调试工具链有效**：DebugMain 每模块 Before 快照（LoggedGraph DOT 格式）+ monitor.log 输出 layoutSize/Blocks/Chosen → 精确定位 jar 的 BK 选择（LEFTOWN 430.5）；TS 侧 GGN_BK_IN/GGN_SD_DBG 逐层对比
4. **视觉复核闭环**：数值差分 0（节点/边逐点）→ 生成 SVG/PNG 对比图 → luna 独立复核 PASS；修复前 luna 的 FAIL 坐标区域（红线穿 N16/N8）与数值差分（N11=297/N16=137）互相印证

## demo-vite 边路由"斜线"排查与渲染修复（2026-08-09 夜）

**现象**: 用户在 demo-vite 看到边路由"不在水平和垂直轨道上"（斜线）
**排查**: 数据层（ggn getEdgeEndpoints + bendPoints 与 jar section）经程序检查**全正交**
  （carTracking 57 边 / intersections 200 边，0 斜线段）→ 问题在 demo-vite **渲染层**
**根因**: demo-vite `main.ts` 渲染 polyline 用 `start = srcW + port.position`（**端口位置，缺 anchor 偏移**），
  而弯点用端口锚点坐标系 → 首尾段斜连到弯点（偏移 8,4 产生小角度斜线）
**修复**: `demo-vite/main.ts` 改用 `getEdgeEndpoints(e)` 的 source/target（端口**绝对锚点**，含 anchor，
  与路由弯点同坐标系）
**验证**:
- 程序: 主边 polyline（按对取偶数索引，排除 V 形箭头）carTracking 0/57 斜边、intersections 0/200 斜边
- 视觉: gpt-5.6-luna（Laplace）对 demo-vite 截图双图 **PASS**（所有边水平/垂直正交，90° 折弯；
  边末端 V 形箭头是正常设计，不计缺陷）
**遗留（非本目标）**: 嵌套图 blindCommunication（87 节点层级, demo 标记 wip）跨层级边有斜线——
  getEdgeEndpoints 对跨层级边返回边所属图坐标（recursiveAnchorTo/TARGET_OFFSET），与 demo-vite
  bends 的 ox/oy 根图偏移不一致；carTracking/intersections 为扁平图不受影响

## 高层适配层 `layoutElkJson`（2026-08-09 夜）

**目标**: 补齐 elk-layout 缺失的结果层 API（等价 elkjs：输入/输出标准 ELK JSON，消费方零组装）
**背景**: plan `elk-layout-replace-ggn-layout.md` 方案 A 早已指出"elk-layout 无高层 API"；demo-vite 渲染斜线（端口位置 vs 锚点）正是该设计缺陷的第一受害者

**交付**:
- `src/api/elk-json.ts` + `src/api/index.ts`：`layoutElkJson(input, options)` → 节点 x/y/w/h + 边 sections
- `tests/api/layout-elk-json.test.ts`：4 用例与 elkjs 0.12.0 逐项对比（最小图/端口约束/嵌套图/demo 内联）
- `docs/API.md`：用法、输出语义、实现要点、已知限制
- `src/index.ts` 导出 API + 类型

**实现要点（3 个 build 缺陷已修）**:
1. 端口侧/端口约束须用 `LPort.setSide()`/`LNode.setPortConstraints()`（布局引擎读字段；`setProperty(PORT_SIDE)` 只写属性表不生效 → 端口侧 UNDEFINED）
2. 嵌套子图须继承根 DIRECTION（否则子图方向错误 → 容器尺寸/边错）
3. 递归收集所有容器的 edges（边挂在 LCA 容器；只读 root.edges 会漏子容器边，如 P.edges 的 X→Y）

**对齐验证**（标准输入 vs elkjs）: carTracking 节点 0/50、边 0/57；intersections 0/220、0/200；嵌套图 0/0
**回归固化**: `tests/api/regression.test.ts` + `tests/api/fixtures/{carTracking,intersections}.json`（权威标准输入）；
  实测恢复旧 GreedySwitch bug 后 carTracking 立即失败（max=297.33），证明回归测试有效

**已知限制**: 无 labels 的完全同构节点平局（ggn 与 elkjs/jar 槽位选择可能不同，如 carTracking 无 labels 时 N38/N39）。带 labels 或非对称输入不受影响。JavaRandom 与 java.util.Random 已逐项验证一致；待查 P3 断环/排序平局。

## Blind Communication 层级图修复 + 回归（2026-08-09 夜）

**目标**: 修复 87 节点层级图（跨层级边斜线/挂载），对齐 jar，视觉+程序验证，固化为回归
**结果**: 节点三方 0/51 差、边 66/66 坐标 0 差（vs jar 与 elkjs）；luna（Newton）视觉复核 **PASS**（正交+重合）

**根因（2 处）**:
1. **layoutElkJson extract 边挂载**：`edgeContainer` 返回"图"（root/N27），应返回 **LCA 容器节点**
   （N4.P8→N4.N6.P13 挂 N4.edges，N4.P7→N15.P32 挂 root.edges——elkjs 对照 + jar dump 双重确认）。
   改为 `lcaNode()`（沿节点父链找公共祖先），边挂 LCA 节点对应的输出 ElkNode.edges。
2. **标准输入生成**：跨层级边曾挂到 src 和 tgt 两个容器（重复），应只挂 LCA 容器。
   （此前的 elkt 转换脚本缺陷；fixture 已用正确输入）

**关键洞察**: ggn 边坐标（getEdgeEndpoints + bendPoints）一直与 elkjs/jar 一致（0 差）；
   demo-vite 渲染斜线是渲染层坐标系问题（端口位置 vs 锚点），与 layoutElkJson 无关；
   layoutElkJson 的修复点在**挂载结构**（LCA）。

**回归固化**: `tests/api/fixtures/blindCommunication.json`（标准输入）+ `blindCommunication-jar-edges.json`
  （jar 边挂载 oracle）+ `tests/api/regression.test.ts` 2 个用例（elkjs 坐标对比 + jar 挂载对比）。
  实测改坏 LCA 挂载后 jar 挂载用例立即失败。

## demo-vite 六图渲染修复（2026-08-10）

**用户反馈**: demo-vite 六个例子渲染偏差（层级图斜线、标签溢出、N10→N11 弯折）
**诊断**: 扁平图（carTracking/intersections）数据层与 jar 0 差（luna PASS）；问题在 demo-vite 渲染 + 层级图引擎

**修复（demo-vite 渲染）**:
1. **跨层级边坐标系**: demo-vite 边渲染 getEdgeEndpoints（相对 edgeGraph/子图）与弯点（+ox/oy 到 root）坐标系不一致 → 斜线。
   修复: source/target 也加 edgeGraph 父链偏移（统一投影 root）。**盲通 66 边 0 斜线、hierarchicalEdges 斜线消除**
2. **标签溢出**: 节点标签（leftToRight/AudioReader 等长名）超出节点遮挡边。修复: 按节点宽度裁剪（截断 + …）。Direction/MixingDirection PASS
3. **ELK 无 section 边**: hierarchicalEdges 的 source→嵌套节点（无端口跨层级边）ELK 不路由（jar 无 section），demo-vite 硬画斜线。
   修复: 无弯点且端点非正交的边画**到最外层祖先容器左边界**的正交水平线（source→outside 容器连线，
   不穿容器、不斜线；luna PASS）。ELK 本身不渲染此边，这是 demo-vite 的视觉补充

**修复（引擎, 对齐 ELK Java）**:
1. `LNode.setLayer/setLayerAt`: 分层后从 layerlessNodes 移除（否则 NS dummy 等分层后仍留 layerless → Forster groups 缺节点崩溃）
2. `LayerSweepCrossingMinimizer`: graphsToSweepOn 漏 else push（全可 sweep 时列表空崩溃）
3. `layoutElkJson`: 嵌套图自动 INCLUDE_CHILDREN（hh 默认 OFF 导致子容器边丢失/布局错）
4. `layoutElkJson resolve`: 节点 id 含点（层级路径）先按完整 id 匹配（否则把段名当端口）

**luna 复核**: 六图全 PASS（direction/mixingDirection/hierarchicalEdges/blindCommunication 修复后；carTracking/intersections 本就 PASS）

**遗留（引擎深层）**: 层级图（direction/hierarchicalEdges/blindCommunication）布局与 ELK 有差异——
  ggn 跨层级边用 dummy edge（不建 root external port dummy 节点），ELK 用 external port dummy 参与 root BK →
  root 层内排列不同（如盲通 N1 y≈160 vs ELK 15）。回归测试盲通 2 用例因此失败（布局数据未对齐）。需专项移植 external port dummy 机制。
