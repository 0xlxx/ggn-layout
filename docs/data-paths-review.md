# layout 图数据管道设计与转换代码审查报告

> 审查范围：ELK Java 0.12.0 layered → TypeScript 1:1 移植项目的「图数据管道设计」与「转换代码正确性」。
> 性质：只读审查（未修改任何代码/数据文件）。语义对照权威：`/Users/bjorn/ai-dev/tmp/elk`（ELK 0.12.0 源码）。
> 基线（本机复验）：oracle 坐标差分 **34 失败 / 654 通过（共 688）**；`verify-json-path` 900 模型 P3≡P2；
> `verify-elkg-elkt` 550 对 realworld 全部等价；`verify-demo-data` 6 个模型一致。

---

## 0. 执行摘要

- **问题 (a)**：`buildLGraphFromParsed` 的输入是 parseElkt 的中间结构 `{nodes, edges, hierarchy, graphProps, nodeProps}`（P2 直出）或 `elkJsonToParsed(json)` 还原的同构结构（P3）；二者走**同一个 builder**，仅在「键规范化（shortOptKeys）、默认注入（direction/randomSeed/hierarchyHandling）、端口 side 用 'UNDEFINED' 字符串显式写入」三处有差异。LGraph 级快照实证：P2/P3 只在 **randomSeed**（P3 多注入 1）与 **graph-level nodeSize.minimum 值类型**（P2=字符串 / P3=对象，见确认 bug B1）两处不一致，其余 897/900 的差异均为这两项。
- **问题 (b)**：**「elkg → ELK Java → JSON」链已覆盖但仅限 realworld/ptolemy**（550 对，本机复验 550/550 等价，归一化吞掉了容器尺寸 1264 / 端口尺寸 654 处缺失）；examples/tests/tickets 共 ~348 个 elkt **没有对应 elkg**，其输入正确性完全依赖 elktToElkJson。而 oracle 坐标差分里 **Java 吃 `elktToElkJson(parseElkt(src))`，ggn 吃 `parseElkt(src)`（P2）——两边都由同一个 parseElkt 派生，构成循环论证**：坐标差分只能证算法等价，不能证输入正确（共享的 parseElkt 错误会被两边同时复刻）。
- **最强验证（jar 坐标差分）只覆盖 P2 直建路径**；P3（`elkJsonToParsed` / `layoutElkJson` API，真实外部消费者路径）只有 4 个手写 API 用例 + 6 个 demo 模型（对照 elkjs，非 jar）。这是当前最大的覆盖缺口。
- **已确认问题 7 项**（其中 5 项为「潜伏性」——当前语料未触发或已被布局期补丁掩盖，但语义上与 Java 不一致）；**疑似 4 项**；**设计风险 9 项**。详见 §3。
- **最值得做的改进（按优先级）**：
  1. **P1-A**：用 ELK Java 的 Xtext elkt 解析器（`org.eclipse.elk.graph.text` 0.12.0，Maven Central 有 jar）直接解析 .elkt 作为 Java 侧输入，与 ggn 的 parseElkt 独立解析同一源 → 差分同时覆盖「解析 + 算法」，打破循环论证，且天然覆盖全部 900 模型（不只是 realworld）。
  2. **P1-B**：让 oracle 坐标差分同时跑 P3（JSON 路径），把「最强验证」接到真实消费路径上。
  3. **P2**：修 B1（applyGraphPropsToLGraph 的 `nodeSize.minimum` 键判断）；把 verify-json-path 升级为 LGraph 级快照对比（含 yo/边标签/thickness、randomSeed 等价处理）。
  4. **P3**：补端口标签输入保真（当前 parseElkt 丢弃端口标签，elktToElkJson 也不发射，两边「一致地错」；补齐需全量重生成 oracle）。

---

## 1. 五条数据路径核实结果

| # | 路径 | 核实结论 | 证据 |
|---|---|---|---|
| 1 | P2 直建：.elkt → parseElkt → buildLGraphFromParsed → layout | 属实。用于 oracle 测试、perf、elkt-build | scripts/elkt2test.mjs:53 parseElkt; shared/elkgraph-builder.ts:71 buildLGraphFromParsed; tests/oracle/generated/*_batch.test.ts 为内联 P2 建图代码 |
| 2 | P3 JSON 往返：.elkt → parseElkt → elktToElkJson → elkJsonToParsed → buildLGraphFromParsed → layout | 属实。demo-vite/main.ts:83-84 用 elkJsonToParsed + buildLGraphFromParsed；verify-json-path 900 模型 P3≡P2 | shared/elkgraph-builder.ts:215 elkJsonToParsed; 本机复验 verify-json-path ✅ |
| 3 | oracle（坐标差分）：.elkt → parseElkt → elktToElkJson → BatchMain/EdgeMain → jar-oracle/*.json → 逐节点 x/y 差分 | 属实。**Java 侧输入 = elktToElkJson 输出（ggn 侧转换），非独立解析** | scripts/generate-jar-oracle.mjs:48-65；BatchMain.java `ElkGraphJson.forGraph(json).toElk()` |
| 4 | elkg 权威等价：.elkg（550 realworld）→ ElkgJsonMain → 与 elkt→elktToElkJson 逐字段 diff | 属实，本机复验 **550/550 等价**（归一化：容器尺寸 1264 / 端口尺寸 654 处 elkg 缺失 → 默认） | scripts/verify-elkg-elkt.mjs；ElkgJsonMain.java（EMF 加载 + 递归收边） |
| 5 | demo 对比：demo-vite 数据 = elktToElkJson 输出，elkjs.layout(json) vs ggn buildLGraphFromElkJson(json) | 属实。verify-demo-data 防过期（hash 比对），本机 ✅ | scripts/build-demo-data.mjs:40-44；verify-demo-data.mjs:26-37 |

**额外发现（路径清单之外）**：真实对外 API `layoutElkJson` 用的是 **src/api/elk-json.ts 自己的 buildGraph**（src/api/elk-json.ts:145），并不是 shared/elkJsonToParsed；即 JSON→LGraph 实际存在**4 份实现**（生成测试内联 builder、shared buildLGraphFromParsed、shared elkJsonToParsed、api buildGraph），它们之间没有直接等价校验（layout-elk-json.test.ts 仅 4 例 vs elkjs）。

---

## 2. 路径设计评估

### 2.1 问题 (a)：buildLGraphFromParsed 的输入到底是什么

- 中间结构契约：`{ nodes: string[]（全限定 id）, edges: [s, sp, t, tp, yo, labels, thickness][], hierarchy: Map<父id, 子id[]>, graphProps: Record<短键, raw 字符串>, nodeProps: Map<id, {width, height, ports[], labels[], ...短键 raw 字符串}> }`（parseElkt 产出；portIds 仅供测试生成用，builder 不用）。
- P3 的 elkJsonToParsed 还原该结构时做三件事：**(i) 剥离 'N' 前缀**（shared/elkgraph-builder.ts:214（注释在 :215-217）「契约：输入是 elktToElkJson 输出；喂外部 JSON 会剥错」）；**(ii) 键规范化**（shortOptKeys 反查 OPT_MAP，:191-199）；**(iii) 补默认**（width/height 60×30、端口 8×8、side 'UNDEFINED'、graphProps 注入 direction/randomSeed/hierarchyHandling——后者是 elktToElkJson 注入的，见 elkt2test.mjs:617-619）。
- 与 P2 的关系：同一 builder，LGraph 级快照实证仅 randomSeed 与 graph-level nodeSize.minimum 两处不一致（见 B1、B2）；`verify-json-path` 的归一化恰好把这两处吞掉（`DEFAULT_GP` 放行 randomSeed；graphProps 值比的是「去引号字符串」而非 coerce 后的值），所以中间结构层「P3≡P2」成立、LGraph 层不成立。

### 2.2 问题 (b)：elkg → ELK Java → JSON 链的验证范围与循环论证

- **已覆盖**：realworld/ptolemy 550 对，本机复验 550/550 等价（JVM 批量导出 1.2s）。
- **未覆盖**：examples(45) + tests(193) + tickets(110) = **348 个 elkt 无 elkg**。这些模型的「输入正确性」目前**没有任何外部权威对照**，唯一护栏是 elktToElkJson 自身输出 + 坐标差分。
- **循环论证成立**：oracle 差分中 jar 与 ggn 吃的都是同一个 parseElkt 派生出的图（一个经 elktToElkJson，一个直出）。任何 parseElkt/elktToElkJson 的共享错误（如丢端口标签、默认值错误、正则漏解析）都会「两边一致地错」，坐标差分无法发现。**结论：坐标差分只证算法等价，不证输入正确**。这也解释了为什么「34 失败/654 通过」对输入保真的覆盖意义有限。
- 反例实证：parseElkt **丢弃端口标签**（elkt2test.mjs:350-359 只做括号平衡，不建端口标签；elktToElkJson:592-603 不发射端口标签）→ ggn 与 jar 输入**同时**缺端口标签 → 491/269/056/299/167 等含端口标签的模型差分通过，但布局与 ELK Java 自己解析 elkt 的意图不符（PROGRESS.md:143 已记录「jar oracle 缺端口标签」）。这是典型的「共享盲区」案例。

### 2.3 路径冗余与必要性

- **P2 与 P3 双建图**：必要，但要分清角色。P2 是内部快速路径（oracle 测试/基准），P3 是真实消费路径（demo/API/外部 JSON）。**当前角色倒挂**：最强验证（jar 差分）挂在 P2 上，而 P3 只有弱验证（4 API 用例 + 6 demo + 中间结构等价）。建议：oracle 差分增加 P3 变体（同一 jar oracle，ggn 侧改走 elkJsonToParsed），使 P2/P3 都受 jar 校验；P2 保留做性能/回归基准，靠 verify-json-path（升级为 LGraph 级）保证两者等价。
- **verify-elkg-elkt 与 verify-json-path 不冗余**：前者是唯一的外部权威对照（EMF），后者是 ggn 内部两条路径一致性；两者都要留，但前者覆盖面应扩大到全部 900（见候选 (i)/(iii)）。

### 2.4 盲区清单（哪些选项/结构没有任何路径覆盖）

1. **端口标签**：parseElkt 丢弃、elktToElkJson 不发射、verify-elkg-elkt 不比端口标签 → 三条路径全盲（仅 demo/API 的 elkjs 对照可能间接暴露）。
2. **边属性/边标签**：verify-json-path 只比 `e.slice(0,4)`（不含 yo/thickness/labels）；verify-elkg-elkt 用 Set 比边端点（丢多重性、不比边属性/标签/label 位置）；oracle 差分只比坐标（能间接触发，但 34 个失败多为算法阶段差异，难以归因到边输入）。
3. **label 的 placement/position**：verify-elkg-elkt 的 normNode 只取 label 的 text/w/h。
4. **UP/DOWN 方向 × compound FIXED 端口**：builder 的 calcPortSide 无 UP/DOWN 分支（见疑似 S1），当前语料无此组合（探针确认），属盲区。
5. **图级 `minimum:` 短键**（graphProps）：只有 tickets/273 使用，P2/P3 值类型不一致（B1），坐标差分未暴露。
6. **`graph { ... }` 带花括号语法**：parseElkt 的 inGraphBlock 逻辑在「graph 块内、node 块内」会把节点属性行误当 graphProps（elkt2test.mjs:82-93 先于节点分支执行）；当前语料 558 个 `graph G1` 均无花括号（探针确认），属未触发盲区。
7. **external JSON 输入**（layoutElkJson）：elkJsonToParsed 的 'N' 前缀剥离契约对任意 JSON 不成立（注释自述）；api buildGraph 是另一份实现，行为未与 elkJsonToParsed 对齐校验。

### 2.5 归一化是否吞真差异（自欺欺人风险）

- **verify-json-path**：① 节点数组排序后比较（:69）——**吞节点顺序差异**（节点顺序=MODEL_ORDER 默认，影响布局）；本机探针 900/900 顺序一致，当前无真差异，但该归一化无保护。② 边只比 `slice(0,4)`——吞 yo/边标签/thickness。③ graphProps 值比「去引号字符串」而非 coerce 后语义值——正是它让 B1（string vs object）「通过」。④ DEFAULT_GP 放行 randomSeed——让 B2 被吞。
- **verify-elkg-elkt**：① elkg 无尺寸→默认 60×30/8×8 归一化，若 elkt 侧恰好是默认值则无法区分「elkg 真没存」与「elkt 真写默认」，可接受但会漏「elkg 显式默认、elkt 缺省」类差异；② 边用 Set 比较——吞**多重性**（平行边数量）；③ 端口/节点标签只比 text/w/h。
- **结论**：归一化确实会吞掉若干类真差异，但目前 900/900、550/550 全绿不等于这些维度全对；建议把「归一化计数」也纳入 CI 门禁（变化即告警）。

---

## 3. 更优设计候选评估（按优先级，不照单全收）

### 推荐实施

- **P1-A【高价值/中成本】候选 (i)：Java Xtext elkt 解析器作为独立输入**
  - 评估：`org.eclipse.elk.graph.text-0.12.0.jar` 在 Maven Central 存在（已核验 HTTP 200）。ELK 源码自带 ElkgGraph.xtext 文法与 PropertyKey/PropertyValue 转换器（/Users/bjorn/ai-dev/tmp/elk/plugins/org.eclipse.elk.graph.text/...），语义权威。改造量：debug lib 增加 graph.text + xtext runtime 依赖；写一个 `ElktJsonMain`（Xtext 加载 .elkt → ElkNode → ElkGraphJson 导出），复用 verify-elkg-elkt 的 diff 框架，把 glob 从 elkg 扩到全部 .elkt（900 模型），`verify:elkg-elkt` 更名为 `verify:elkt-java` 双轨（保留 elkg 对照）。
  - **收益**：打破循环论证；解析与算法差分同时覆盖全部 900；不引入新数据文件。
  - **注意**：Xtext 的 PropertyKey 用 `getOptionDataBySuffix` 解析（非全键匹配），若语料某键在 Java 侧被忽略、ggn 侧却被 OPT_MAP 应用（如 `spacing.labelPort`，见设计风险 R8），该设计会把它变成「真差异」暴露出来——这正是期望效果。
- **P1-B【高价值/低成本】oracle 差分增加 P3 变体**：生成测试第二块用 `elkJsonToParsed(elktToElkJson(parsed))` 建图跑同一 jar oracle，P2/P3 双差分（或单独一个 `json_path_batch.test.ts`）。让最强验证覆盖真实消费路径。
- **P2【中价值/低成本】修 B1 + verify-json-path 升级**：applyGraphPropsToLGraph 改为按 `m.ggn === 'org.eclipse.elk.nodeSize.minimum'` 判断（与节点级 :101 一致）；verify-json-path 增加 LGraph 级快照比较（nodeProps 值经 coerceVal 后比较、比 yo/labels/thickness、比节点顺序、randomSeed 做语义等价处理）。
- **P2【中价值/中成本】端口标签输入保真**：parseElkt 收集端口标签 → elktToElkJson 发射 → 全量重生成 oracle（PROGRESS.md:143 已预告该成本）；否则 491/269/056/299/167/701 等模型的输入永远「一致地错」。需配套把 verify-elkg-elkt 的端口标签比对加上。

### 不建议/暂缓

- **候选 (iii) 为全部 900 补 elkg**：生成 elkg 仍需 Java 侧 elkt→EMF（依赖与 P1-A 相同的 Xtext），且多出 348 个数据文件与仓库膨胀；P1-A 已覆盖同等收益，**不做**。
- **候选 (ii) JSON 作为唯一 SSOT**：现状已基本如此（oracle/demo/elkjs 都吃 elktToElkJson 输出），缺的是「P2 只作内部快速路径」的等价门禁强度，而非架构改造；按 P1-B + P2 落实即可，**不做结构性改动**。
- **候选 (iv) 逐阶段 instrumentation 差分**：Instr*Main.java 已存在，对定位当前 34 个失败的算法阶段有用，但**不解决输入正确性**；保留作调试工具，不进 CI。

---

## 4. 转换代码审计清单

> 分级：【确认 bug】= 代码行为与 ELK Java 语义不一致（含已实测/已定位）；【疑似】= 有依据但未完全实证；【设计风险】= 契约/边界/未来语料风险。

### 4.1 确认 bug

- **B1【确认，低影响·被掩盖】graph-level `nodeSize.minimum` 值类型不一致**
  - 位置：shared/elkgraph-builder.ts:63（applyGraphPropsToLGraph 用 `k === 'nodeSize.minimum'` 判断）；对照节点级 :101 用 `m.ggn === 'org.eclipse.elk.nodeSize.minimum'`。
  - 现象：elkt 图级短键 `minimum:`（tickets/layered/273_insideSelfLoopsWithLabels.elkt:15）经 P2 → LGraph 属性为**字符串** `"(100.0,100.0)"`；经 P3 → 为对象 `{x:100,y:100}`。LGraph 级快照探针实证（900 模型中该键唯一触发，P2/P3 差这一项）。
  - 与 Java 不一致：Java 侧 NODE_SIZE_MINIMUM 是 OBJECT(KVector)，JSON 加载后 parseValue 得对象；ggn P2 得字符串 → 读 `{x}` 得 undefined → 最小尺寸被忽略。
  - 复现：`bun /tmp/probe-p2p3-detail.mjs`（构造 273 的 parseElkt / elkJsonToParsed 两个 LGraph 对比属性）。
  - 修复：applyGraphPropsToLGraph 的判断改为基于 `OPT_MAP[k].ggn === 'org.eclipse.elk.nodeSize.minimum'`（与节点级一致）。顺带统一 elkt2test.mjs:1198-1204 的 applyGraphPropsToLGraph（当前无该特判）。
  - 影响面：273 坐标差分仍通过（根图最小尺寸不被 layered 强制），故被掩盖；但 P2/P3 输入语义已分叉。

- **B2【确认，低影响·当前语义等价】P2 不注入 randomSeed，P3 注入 1**
  - 位置：scripts/elkt2test.mjs:618（elktToElkJson 注入 `randomSeed=1`）；P2 直建不注入。
  - 现象：LGraph 级快照 897/900 模型 P2/P3 仅差 `org.eclipse.elk.randomSeed`（P2 未设 / P3=1）；verify-json-path 用 DEFAULT_GP 放行。
  - 与 Java 不一致：Java 侧 elkg/elkt 解析默认 randomSeed=1（Core.melk:608），JSON 注入后 jar 与 P3 一致、与 P2 不一致。当前 ggn 默认也是 1 所以坐标等价，但「P2≡P3」是假象（P2 是「默认值」而 P3 是「显式值」，一旦 ggn 默认改变或代码用 hasProperty 区分就会分叉）。
  - 修复：buildLGraphFromParsed 在 P2 路径同样注入默认 `randomSeed=1`（或 verify-json-path 将其纳入等价比较而非无条件放行）。

- **B3【确认，低影响·未触发】coerceVal 的 enumset 括号形式对空格分隔解析错误**
  - 位置：shared/opt-map.ts:137-141（`^\[([^\]]*)\]$` 分支只 `split(',')`）。
  - 现象：`"[H_CENTER V_BOTTOM INSIDE]"`（空格分隔、无逗号）→ 返回 `["H_CENTER V_BOTTOM INSIDE"]`（单元素）；Java `enumSetForStringArray` 按 `[\[\]\s,]+` 切分 → `{H_CENTER, V_BOTTOM, INSIDE}`。
  - 与 Java 不一致：`LayoutOptionData.java:289-321` 先按空白/逗号/括号切分再逐项 `Enum.valueOf`；无效项导致**整个选项解析失败→默认值**，ggn 只返回字符串数组不校验。
  - 复现：语料唯一用例 tickets/layered/167_insidePortLabelsInHierarchicalGraphs.elkt 的 `portLabels.placement: "[H_CENTER V_BOTTOM INSIDE]"`；因 portLabels.placement 在 OPT_MAP 是 `type:'str'`（opt-map.ts:33）未走 enumset 分支，且端口标签被丢弃，故未触发。
  - 修复：enumset 括号分支也按 `[\s,]+` 切分；并考虑对无效枚举成员报错/跳过（对齐 Java 的「整体解析失败→默认」）。

- **B4【确认，低影响·未触发】coerceVal 数值/布尔与 Java parseValue 边界**
  - 位置：shared/opt-map.ts:135（`Number(v)`）、:136（`v === 'true' || v === 'TRUE'`）。
  - 与 Java 不一致：INT 选项 Java 用 `Integer.valueOf`，`"1.0"` → NumberFormatException → **选项不设置（默认）**，ggn `Number("1.0")=1`；BOOLEAN Java 用 `equalsIgnoreCase`（"True" 为 true），ggn 只认 `true/TRUE`。
  - 复现：语料扫描确认 INT 选项值全为整数（含小数的 `aspectRatio`/`crossingCounterNodeInfluence` 均为 double 类型）、布尔全为小写，故当前未触发；属潜伏差异。
  - 修复：coerceVal 对 num 分「整数选项（Integer 语义）与 double 选项」处理，或至少对非有限值返回 undefined 并跳过设置。

- **B5【确认，已缓解·方向缺失】builder 级 calcPortSide 方向无关（缺 UP/DOWN 分支）**
  - 位置：shared/elkgraph-builder.ts:28-37（与 scripts/elkt2test.mjs:554-563 同源）；对照 src/graph/lgraph-util.ts:339-361 是方向相关的（与 ELK LGraphUtil.calcPortSide 一致）。
  - 与 Java 不一致：ELK `LGraphUtil.calcPortSide`/`ElkUtil.calcPortSide` 对 UP/DOWN 先判 `y<0→NORTH`、`y+h>nodeH→SOUTH`；ggn builder 版只有 LEFT/RIGHT 判据。另外 builder 只在 `isCompound`（:112-114）时推断侧，而 Java `LGraphUtil.initializePort`（LGraphUtil.java:657-687）对**所有 side-fixed 端口**推断。
  - 缓解现状：布局期 `initializeAllPortSides`（src/layered-layout-provider.ts:977-990）会对所有 side-fixed 节点补定侧，叶子端口被纠正；但**compound 端口在 build 期已被方向无关公式定侧，布局期 `side≠UNDEFINED` 跳过**——即 compound×UP/DOWN 时 builder 公式胜出，与 Java 方向相关公式不一致。探针确认当前语料无 compound FIXED 端口 + UP/DOWN 组合，故未触发。
  - 修复：builder 的 calcPortSide 改为与 lgraph-util 同实现（带 direction 参数），或干脆把 compound 定侧也挪到布局期统一处理，删除 builder 内特判。

- **B6【确认，已记录·输入保真缺口】端口标签被 parseElkt 丢弃、elktToElkJson 不发射**
  - 位置：scripts/elkt2test.mjs:350-359（端口块内 label 只做括号平衡不建标签）、:592-603（端口发射不含 labels）。
  - 与 Java 不一致：ElkGraph.xtext 文法 `ElkPort: 'port' ID ('{' ... labels+=ElkLabel* '}')?` 明确支持端口标签；端口标签影响 PortLabelPlacement 与 NODE_SIZE_CONSTRAINTS 含 PORT_LABELS 时的尺寸计算。ggn 与 jar（经 elktToElkJson）**同时**丢弃 → 差分通过但输入与 ELK 语义不符（PROGRESS.md:143 已记录「若补上需全量重生成 oracle」）。
  - 复现：tickets/core/491_portSpacing.elkt（`port a { ... label "afoo" }`）parseElkt 后 nodeProps.ports[].labels 不存在；该模型差分通过（两边都丢）。
  - 修复：parseElkt 收集端口标签 → elktToElkJson 发射 → 重生成 oracle；同时给 verify-elkg-elkt 补端口标签比对。

- **B7【确认，工具层】verify-json-path 归一化吞掉 B1/B2/边元数据**
  - 位置：scripts/verify-json-path.mjs:69（节点排序）、:69（边 `slice(0,4)`）、:57+80（DEFAULT_GP 放行 randomSeed）、:58（graphProps 值去引号字符串比较）。
  - 现象：B1、B2 在「中间结构」层被归一化放行（实测 900/900 报 ✅），边 yo/labels/thickness 完全不在比较维度。
  - 修复：升级为 LGraph 级快照比较（coerce 后值、含边元数据、保留节点顺序；若保留顺序会暴露 587 边界，则对该类显式豁免并记录）。

### 4.2 疑似

- **S1【疑似】builder 的 `isCompound` 定侧门槛与 Java「所有 side-fixed 端口」不一致**：见 B5。当前被布局期补丁掩盖，但 build 期状态（端口 side）与 Java import 期状态不同，任何读取 build 期状态的代码（如 demo 渲染、API 输出、阶段 diff 工具）都可能看到错误侧。
- **S2【疑似】`resolveEndpoint` 后缀匹配的歧义解析**：scripts/elkt2test.mjs:443-502 手写端点解析（suffix match + 作用域偏好 + 最短偏好）与 Xtext 的 `ElkGraphScopeProvider` 作用域解析语义未必一致；`A.B` 是「节点 A 的端口 B」还是「子节点 A.B」的判定依赖 nodeSet 全量匹配（:453）与端口候选（:473-495），语料无歧义案例（探针确认无含点端口名、节点声明 id 无点），但若引入跨容器同名子节点 + 同端口名组合可能错配。契约已自述（:444-445）。
- **S3【疑似】`spacing.labelPort` 映射为 labelPortHorizontal 是 ggn 发明**：shared/opt-map.ts:45。ELK 自身 `getOptionDataBySuffix('spacing.labelPort')` 无法解析（无此后缀选项）→ Java 的 elkt 解析会**忽略**它；ggn 却映射到 labelPortHorizontal 并生效。当前语料（491/405）无端口标签所以无坐标影响（差分通过），但语义与 ELK 意图不符；P1-A 落地后此差异会暴露为真差异。建议核对 ELK 官方 elkt 是否真的用 `spacing.labelPort`（若官方测试语义就是 labelPortHorizontal，则保留并注释依据；否则移除映射）。
- **S4【疑似】`elktToElkJson` 节点尺寸默认 60×30 是 ggn 侧默认而非 ELK 默认**：scripts/elkt2test.mjs:571。ELK 模型节点默认 0×0（尺寸由 NODE_SIZE_CONSTRAINTS/NodeLabelAndSizeCalculator 决定）；ggn 在发射 JSON 时写死 60×30，把 jar 侧输入「矫正」成 ggn 默认，掩盖了 ELK 对无尺寸节点的真实行为。语料仅 2 个节点无显式尺寸（tickets/587 崩溃测试），当前无害；但任何新模型若无尺寸，两边会「一致地错」。

### 4.3 设计风险

- **R1**：elkJsonToParsed 的 'N' 前缀剥离契约（shared/elkgraph-builder.ts:226）对任意外部 JSON 不安全（id 恰以 N 开头会剥错）；注释已自述，但 `layoutElkJson` 是公开 API 却不走此函数（api/elk-json.ts 独立 buildGraph），两套 JSON 导入语义（端口 id 处理、默认、方向注入）未对齐验证——建议抽公共测试对同一批 JSON 断言两 builder 产出等价。
- **R2**：`graph { ... }` 花括号语法会触发 parseElkt 的 graphProps 误归属（elkt2test.mjs:82-93 先于节点分支执行且 inGraphBlock 计数不区分 node 栈深）；当前语料无花括号 graph（探针确认 0 个），属未触发。
- **R3**：stripComments 用 `//.*$` 剥注释（elkt2test.mjs:39-41），会误伤**字符串值内**的 `//`（如 label 文本含 URL）；当前语料无（探针确认），未来模型需注意。
- **R4**：graphProps 值正则 `[^\s/]+(?:\s+[^\s/]+)*`（elkt2test.mjs:84）不允许值含 `/`（URL/路径），同样为未来语料风险。
- **R5**：unescapeElkt 只处理 `\' \" \\`（shared/opt-map.ts:127-129），Xtext STRING 的 `\n \t \uXXXX` 等转义会保留为字面量；当前语料无（探针确认）。
- **R6**：verify-elkg-elkt 边比较用 Set（:165-168）吞平行边多重性；当前无差异，但工具维度上建议改 Map 计数。
- **R7**：oracle 差分容差 ε=2（elkt2test.mjs:27）+ variants（BatchMain 类加载顺序变体）兜底，理论上可吞 1~2px 级别的输入差异（如亚像素精度），建议维持并定期用 `ELK_TOLERANCE=1` 收紧复验（脚本已支持）。
- **R8**：OPT_MAP 键覆盖：语料仅 5 个键不在 OPT_MAP（desiredEdgeLength / edgeLabelSideSelection / preserveOrder / minimalNodeSize / layering.wideNodesOnMultipleLayers），均属 Java 侧也无法解析的键（或崩溃/非 layered 模型），ggn 与 Java 一致忽略——机制上「未知键静默丢弃」与 Java「创建 generic Property 后算法忽略」等效，但应写进契约防止误以为覆盖完整。
- **R9**：OPT_MAP 实际 104 键（任务描述「114 项」与实际不符），含 11 组别名（同 ggn 目标多短键）；reverse 查找取首个匹配（elkgraph-builder.ts:196），依赖对象遍历顺序，新增键时需注意别名顺序稳定性。

---

## 5. 验证记录（本机实跑）

| 命令/探针 | 结果 |
|---|---|
| `bun scripts/verify-json-path.mjs` | ✅ 900 elkt：JSON 路径忠实还原 parseElkt（默认补充 2119 选项） |
| `bun run verify:demo-data` | ✅ 6 个模型与 parser 一致 |
| `bun run verify:elkg-elkt` | ✅ 550/550 等价；归一化：容器尺寸 1264 / 端口尺寸 654；耗时 2.3s |
| `./node_modules/.bin/vitest run tests/oracle/generated` | 34 失败 / 654 通过（688）——与基线一致 |
| 探针 A：FIXED 端口无 side 有位置 | 叶子 162 处 / compound 12 处；UP/DOWN 16 处（全为 tickets/340 叶子） |
| 探针 B：P2 vs P3 LGraph 级快照 | 897/900 差 `randomSeed`（P2 未注入 / P3=1）；1/900 差 graph-level `nodeSize.minimum`（string vs object，tickets/273） |
| 探针 C：节点顺序 / 边数 | 900/900 P2/P3 顺序与边数一致 |
| 探针 D：OPT_MAP 覆盖 | 缺失键仅 5 个（均为 Java 也无法解析/非 layered 的键） |
| 探针 E：数值/布尔/枚举扫描 | INT 选项无小数；布尔全小写；enumset 唯一空格括号形式在 167（portLabels.placement，type=str 未走 enumset） |
| 探针 F：无显式尺寸节点 | 全语料仅 2 个（tickets/587） |
| 探针 G：`graph {` 花括号 / 含点端口名 / `//` 入字符串 | 均为 0 |
| Maven Central 核验 | `org.eclipse.elk.graph.text-0.12.0.jar` 存在（HTTP 200） |

（所有探针为 /tmp 临时脚本，未写入项目目录；项目内无任何代码/数据文件被修改。）

---

## 6. 结论一句话

当前数据管道「自洽但不独立」：ggn 与 jar 的输入同源于 parseElkt，oracle 差分只能证明算法等价；要证明输入正确，必须引入独立解析（P1-A：Xtext elkt 直接喂 Java）并把最强差分接到 JSON 消费路径（P1-B），同时修复 B1/B6 两处已确认的输入保真问题。

---

## 7. 落地状态 (2026-08-10)

审查结论已转化为实现 (本轮):

- **B1 已修**: `shared/elkgraph-builder.ts` applyGraphPropsToLGraph 图级 `minimum` 改按 `m.ggn === 'org.eclipse.elk.nodeSize.minimum'` 判断 (与节点级一致); `scripts/elkt2test.mjs` generateTest/applyGraphPropsToLGraph 同步。
- **B2 已修**: `buildLGraphFromParsed` 未显式设置时注入 `randomSeed=1`; 生成测试 ggnApply 同步注入 → P2/P3/jar 输入对称。
- **B3/B4 已修**: `shared/opt-map.ts` coerceVal — enumset 括号形式按 `[\s,]+` 切分; num 非有限值返回 undefined (调用方跳过); bool 大小写不敏感。
- **B7 已落地**: `scripts/verify-json-path.mjs` 重写为 **LGraph 级快照对比** (图属性 + 逐节点 尺寸/属性/端口/标签 + 边 端点/属性/标签 深比较), 900/900 通过。旧版白名单归一化已删除。
- **B8 已修 (verify 升级暴露)**: `elkJsonToParsed` 边标签 placement 从 `layoutOptions['org.eclipse.elk.edgeLabels.placement']` 读取 (旧只读 `l.placement` → P3 丢边标签 placement)。
- **B9/B10 已修 (verify 升级暴露)**: `elkJsonToParsed` 把端口 side `'UNDEFINED'` 映射回 `null`; 并**删除 build 期 compound 端口侧几何推断** (shared builder + 生成测试), 统一交给 `LayeredLayoutProvider.initializeAllPortSides` (layout 期, CGP 前, 方向感知 LGraphUtil.calcPortSide, 与 ELK 一致)。
- **P1-B 已落地**: 新增 `scripts/elkt2test-json.mjs` 生成 `tests/oracle/generated/json_path_batch.test.ts` — 全部 348 模型走 P3 (JSON 往返 → buildLGraphFromElkJson → layout) 跑同一 jar oracle 差分, 含 8 个 crash 复刻。结果 **32 失败 / 316 通过**, 与 P2 失败集合**完全一致** (P2≡P3 收敛), 32 个均为真实算法移植缺口。命令: `bun run test:oracle-p3`。

剩余 (未做):
- **P1-A**: ELK Java Xtext elkt 独立解析喂 jar (打破循环论证, 覆盖全部 900)。依赖 `org.eclipse.elk.graph.text-0.12.0.jar` + xtext runtime。
- **B6**: 端口标签输入保真 (parseElkt 丢端口标签 + elktToElkJson 不发射) → 需全量重生成 oracle。
- 34/32 个算法移植缺口 (compaction/BK/highDegree/partitioning/label placement 等) — 见 docs/elk-layout-algorithm-gaps.md。

验证记录 (本轮全绿):
| 命令 | 结果 |
|---|---|
| `bun scripts/verify-json-path.mjs` | ✅ 900/900 (LGraph 级) |
| `bun run test:bdd` | ✅ 74/74 |
| `bun run verify:demo-data` | ✅ 6 模型 |
| `bun run verify:elkg-elkt` | ✅ 550/550 |
| `bun x vitest run tests/oracle/generated` | 34 失败 / 654 通过 (与基线一致, 无回归) |
| `bun x vitest run tests/oracle/generated/json_path_batch.test.ts` | 32 失败 / 316 通过 (P3 新基线) |

---

## 8. P1-A 落地状态 (2026-08-10, 续)

### 已实现
- **ElktJsonMain** (`scripts/elk-java-debug/ElktJsonMain.java`): ELK Java 官方 Xtext elkt 解析器 (`org.eclipse.elk.graph.text-0.12.0` + xtext 2.37 运行时, 见 `scripts/elk-java-debug/xtext-lib/`) 独立解析 .elkt → ElkGraphJson. **900/900 全语料解析成功 (0 失败, 单 JVM ~25s)**.
  - 依赖坑位 (已踩平并记录): Maven Central antlr-runtime 3.5.2/3.5.3 均无 `Token.EOF_TOKEN` (Eclipse 补丁字段, Xtext 2.37 Lexer 需要) → 用 Eclipse 2024-03 p2 的 `org.antlr.runtime_3.2.0.v20230929-1400.jar`; Guice 7 需要 jakarta.inject 而非 javax.inject; guava 需要 failureaccess.
  - 边递归收集 (ElkGraphJson 导出只含根直接边) + 端点按对象解析全限定路径 (同名端口 e/w 跨节点时 id 碰撞, 纯 id 导出会丢失边身份).
- **`scripts/verify-elkt-java.mjs`**: 900 模型 elktToElkJson(ggn) ↔ Xtext(Java) 逐字段 diff. 归一化: 根 id n0/root、向量/枚举/数值值、Java omitZero ≡ ggn 默认 60x30/8x8、图元后缀条件剥 (同名兄弟消歧)、边 owner 作用域解析.
  - 当前: **853/900 完全等价**; 47 个差异模型按类别见下.
  - 命令: `bun run verify:elkt-java` (~28s).

### 该验证暴露并已修复的转换 bug
- **B11** parseElkt 单行端口内联 `index:` 丢失 (正则要求紧跟 `{`; verticalOrder 实证) — 已修 `\b` 边界.
- **B12** 单行节点内联选项 (`node c1_1 { commentBox: true }`) 全丢 — 已修 (B12a 通用 key:value 解析).
- **B14** 节点显式位置 `^position:` (interactive/pseudo-position) 丢失; `layout [ position ]` 是布局语法 (Java 丢弃, 不能误收) — 已修, elktToElkJson 发射 `org.eclipse.elk.position`.
- **B15** OPT_MAP `partitioning.partition` 键错带 `layered.` 前缀 (ELK 真实键 `org.eclipse.elk.partitioning.partition`) — 已修.
- **B16a** 单行节点内联 `label "x"` 丢失 — 已修.
- **B3 扩展** OPT_MAP `portLabels.placement` 应为 enumset (Java 导出 `[INSIDE]`) — 已修; `nodeSize.constraints` str→enumset.
- **S3 实证** `spacing.labelPort` 在 ELK 不存在 (真实键 labelPortHorizontal), Java 忽略, ggn 别名应用 → ggn-only 差异 (保留别名, 文档化).

### 剩余 47 个差异模型类别 (待办)
1. **边端点解析语义分歧** (~10 模型): Java Xtext 与 ggn parseElkt 对特定作用域的边端点解析不同 (freePorts 自环、south_port、next_to_port_if_possible、unequal_src_tgt、verticalOrder 跨子图、variants 等) — 需逐模型判定 ggn bug vs Java quirk vs elkt 歧义.
2. **Java 层级扁平化 quirk** (interactive*_pseudo_positions): `layout [position]` 嵌套节点 Java 导出扁平化 — Java 侧行为, 需确认.
3. **别名/ggn-only**: `spacing.labelPortHorizontal`、`desiredPosition`、`partition: n` (Java 解析为 partitioning.partition 引用).
4. **端口级选项** (B13): `layered.allowNonFlowPortsToSwitchSides` 等端口属性 parseElkt 丢弃.
5. 根选项 3 处、标签/children 少量.

### 验证变化 (oracle 重生成后)
- **oracle 坐标差分 P2: 44 失败 / 644 通过** (基线 34). 新增 10:
  - **8 个为预期新算法缺口** (输入已修正, jar 应用真实语义, ggn 算法未移植): commentBox 族 (comments、multiplier_comments)、partitioning 族 (nonConsecutivePartitions、partitions01/02、withEdgeLabels)、528_violatedNodeOrder、870_networkSimplexNodePlacer.
  - 528/870 为 oracle 重生成后暴露的真实分歧 (jar 确定性已验证), 待 triage.
- **P3 JSON 路径: 42 失败 / 306 通过** (基线 32), 与 P2 失败集合一致.
- **非 oracle 全绿**: verify-json-path 900 ✅ | bdd 74 ✅ | verify:elkg-elkt 550 ✅ | verify:demo-data ✅.

---

## 9. 续: semi-interactive 交叉最小化移植 (2026-08-10)

### 背景
oracle 重生成后 528_violatedNodeOrder / 870_networkSimplexNodePlacer 新增失败。调查结论:
- **非 builder 分歧**: 测试差值 50 = |ggn y=70 − jar y=20|, 不是坐标本身 (插桩实证)。
- 528 是 **semiInteractive + partitioning.activate + ^position** 组合: B15 修 partitioning.partition 键后 jar 应用真实语义, ggn 缺 partitioning 处理器 (已知缺口) 与 semi-interactive 处理器。

### 已实现
1. **B14 补全**: parseElkt 现在解析 `org.eclipse.elk.^position: "(x,y)"` (全限定 caret 形式; 旧正则只认 `elk.^position`) → 528 族节点位置输入保真。
2. **POSITION 属性** (`src/options/layered-options.ts`): `org.eclipse.elk.position` KVector; OPT_MAP 增加 `position` 条目; buildLGraphFromParsed + generateTest 把 `"(x,y)"` 字符串强转为 `{x,y}` 对象 (与 nodeSize.minimum 同模式)。
3. **SemiInteractiveCrossMinProcessor** (`src/intermediate/semi-interactive-cross-min-processor.ts`): 对每层 NORMAL 且设置了 POSITION 的节点按 POSITION.y 升序建立 IN_LAYER_SUCCESSOR_CONSTRAINTS 链 + 置 IN_LAYER_SUCCESSOR_CONSTRAINTS_BETWEEN_NON_DUMMIES, 由 P3 LayerSweep 的 ForsterConstraintResolver 消费 (该机制已存在, 与 interactive-crossing-minimizer 共用)。
4. **双链接线**: runGraphPreP3 (层级 INCLUDE_CHILDREN 路径) + doSimpleLayoutInner (单图路径) 均在 HierarchicalPortConstraintProcessor 之后、P3 之前, 条件 `CROSSING_MINIMIZATION_SEMI_INTERACTIVE` 时运行 (对齐 ELK GraphConfigurator: addBefore(P3_NODE_ORDERING))。

### 验证
- oracle 重生成 (输入新增 position) 后: **P2 42 失败 / 646 通过** (本轮开始 44), **P3 40 失败 / 308 通过** (开始 42)。净修 2 个用例, 无新增模型失败。
- 剩余 42 个 P2 失败均为算法缺口: commentBox 族 (comments/multiplier_comments)、partitioning 族 (528_violatedNodeOrder/870/nonConsecutivePartitions/partitions01/02/withEdgeLabels)、compaction (labels1/2/edgeLabelAndSplines/south_port/selfloop×2/moreThanOneStraightSegmentPath×2)、BK/labels (nodeLabelPlacement/outside_placement×2/insideNodeLabels_01/variants)、splines (north_south_ports_1/sloppy_overlaps_3)、flexible_ports (graph01/02)、spacing (components/nodesEdges)、highDegree (Fan/high-degree-example)、edge labels (edgeLabelSideSelection02/hierarchy01)、flat01、701、475 + 5 个 crash 复刻 (rectpacking/stress/NPE)。
- 非 oracle 全绿: verify-json-path 900 ✅ | bdd 74 ✅ | elkg-elkt 550 ✅ | demo-data ✅ | **verify-elkt-java 854/900** (B14 补全 +1).

---

## 10. 续: partitioning 处理器移植 (2026-08-10)

### 已实现 (`src/intermediate/partition-processors.ts` + 接线)
1. **选项**: `PARTITIONING_ACTIVATE` / `PARTITIONING_PARTITION` (layered-options) + `GraphProperties.PARTITIONS` + `PARTITION_DUMMY` (internal-properties) + `LNode.setPorts` (后处理器移除 dummy 端口用).
2. **PartitionPreprocessor** (P1 前): 反转「高分区→低分区」边 (目标无分区时 BFS 找可达更低分区), 反转边 PRIORITY_DIRECTION=1000 (对齐 ELK).
3. **PartitionMidprocessor** (P2 前): 相邻分区加 PARTITION_DUMMY 约束边 (小分区在左, layering 强制).
4. **PartitionPostprocessor** (P3 前): 移除 PARTITION_DUMMY 端口 (边随之移除).
5. **接线**: 两条 pre-P3 链 (runGraphPreP3 + doSimpleLayoutInner) 均按 `GRAPH_PROPERTIES.PARTITIONS` 条件运行三处理器; `collectPartitions` 在图属性收集处设置; `PARTITIONING_ACTIVATE` 加入 NESTED_GRAPH_OPTS 传播 (容器节点级 partitioning.activate → 嵌套图, partitioning.elkt 实证).

### 过程中修复的自身 bug
- 误加重复 `LNode.getPorts()` 覆盖了带 side/type 过滤的版本 → 323 失败 (NorthSouth 计数索引越界); 删除重复方法只留 setPorts 后恢复.

### 验证
- **oracle P2: 36 失败 / 652 通过** (本轮开始 42; 修复 nonConsecutivePartitions / partitions01 / partitions02 / withEdgeLabels / 528_violatedNodeOrder / 870_networkSimplexNodePlacer 共 6 个模型).
- **P3: 34 失败 / 308 通过** (开始 40, -6).
- 无新增回归 (与 42 态对比对称差为空).
- 非 oracle 全绿: verify-json-path 900 ✅ | bdd 74 ✅ | elkg-elkt 550 ✅ | elkt-java 854/900 ✅ | demo-data ✅.
- 剩余 36 个 P2 失败仍为算法缺口 (partitioning example 的容器级布局差异、commentBox 族 ~10px、compaction/BK/splines/highDegree/flexible_ports/spacing/edge labels/flat01/701/475 + 5 个 crash 复刻).

---

## 11. 续: commentBox spacing 键修复 + 算法不支持报错 (2026-08-10)

### commentBox 修复 (2 模型)
- **根因**: ggn `SPACING_COMMENT_COMMENT/NODE` 属性 id 错带 `layered.` 前缀 (`org.eclipse.elk.layered.spacing.commentComment`), ELK 真实键是 `org.eclipse.elk.spacing.commentComment` (无前缀). comment 处理器读到默认 10 而非模型 30/5 → comment 框放置偏移 (comments Nn1 x 差 10 / c1_3 x 差 20 实证).
- **修复**: 属性 id 去 `layered.` 前缀. comments / multiple_comments / multipler_comments / single_comment_01 全部通过.

### 算法不支持报错 (4 crash 复刻)
- **根因**: ggn 不校验 `org.eclipse.elk.algorithm` — rectpacking/stress 模型照跑 layered, 无法复刻 jar 的 UnsupportedConfigurationException.
- **修复**:
  1. `checkAlgorithmSupported` (LayeredLayoutProvider.layout 起始): 对**嵌套节点**上的未支持算法 (ELK 0.12.0 未打包: rectpacking/stress/elk.stress) 抛 `Layout algorithm 'X' not found`; 根图算法不校验 (BatchMain 强制根 layered — oneBigNode 根 rectpacking 照常布局实证); box/fixed 等 jar 支持的算法不抛 (ggn 用 layered 巧合一致).
  2. 测试生成器 (elkt2test.mjs + elkt2test-json.mjs): 算法错误用稳定前缀正则 (`Layout algorithm 'X' not found`), 不再匹配含节点路径的尾段 (ggn 不追踪模型 id, LNode.id 是 P3 数组索引不能改).
- **修复**: hierarchicalLayoutMixing / interactiveRectpacking_hierarchy / 588 / 665.

### 验证
- **oracle P2: 30 失败 / 658 通过** (本轮开始 36; 本轮 -6: commentBox 2 + algorithm crash 4).
- **P3: 28 失败 / 320 通过** (开始 34; -6).
- 无新增回归 (box/fixed/475 等保持原行为).
- 非 oracle 全绿: verify-json-path 900 ✅ | bdd 74 ✅ | elkg-elkt 550 ✅ | elkt-java 854/900 ✅ | demo-data ✅.
- 剩余 30 个 P2 失败: compaction 8 (labels/selfloop/splines/south_port)、BK/labels 5、splines 2、flexible_ports 2、spacing 2、highDegree 2、edge labels 3、flat01/475/701、partitioning example (容器级)、modelOrderCycleBreaking (ELK NPE).

---

## 12. 续: label-side-selector bug + 收尾 (2026-08-10)

### 修复 (本轮 P2 36→28, P3 34→27)
1. **commentBox spacing 键**: `SPACING_COMMENT_COMMENT/NODE` 属性 id 去 `layered.` 前缀 (ELK 真实键无前缀) — comments/multiple/multipler/single_comment 全过.
2. **算法不支持报错**: `checkAlgorithmSupported` (嵌套节点上 rectpacking/stress/elk.stress → 抛 `Layout algorithm 'X' not found`; 根图不校验 — BatchMain 强制根 layered; box/fixed 不抛) + 生成器稳定前缀正则 — hierarchicalLayoutMixing/interactiveRectpacking_hierarchy/588/665 过.
3. **label-side-selector 源码 bug (真实)**:
   - `import type { LNode }` 但 `instanceof LNode` 需要值导入 → ReferenceError (edgeLabelSideSelection02).
   - `basedOnDirection` 对 edge 调了 `applyLabelSide` (LNode 专用, 应调 `applyLabelSideToEdge`) → TypeError.
   - 修复后 edgeLabelSideSelection02 两个块全过.

### 验证
- **oracle P2: 28 失败 / 660 通过** | **P3: 27 失败 / 321 通过**.
- 非 oracle 全绿: verify-json-path 900 ✅ | bdd 74 ✅ | elkg-elkt 550 ✅ | elkt-java 854/900 ✅ | demo-data ✅.
- 剩余 28 个 P2 失败: compaction 8 (labels1/2/edgeLabelAndSplines/south_port/selfloop×2/moreThanOneStraightSegmentPath×2)、BK/labels 5 (nodeLabelPlacement/outside_placement×2/insideNodeLabels_01/variants)、splines 2、highDegree 2、flexible_ports 2、spacing 2 (components/nodesEdges)、edge label hierarchy01、flat01、475、701、partitioning example (容器级)、modelOrderCycleBreaking (ELK NPE).

---

## 13. 续: HighDegreeNodeLayeringProcessor 移植 (2026-08-10)

### 已实现 (`src/intermediate/high-degree-node-layering-processor.ts`, 对应 ELK 385 行)
- 选项: HIGH_DEGREE_NODES_TREATMENT/THRESHOLD/TREE_HEIGHT (layered-options; jar 经后缀匹配 `alg.` 前缀键).
- 处理器: 逐层找高连通节点 (degree≥threshold) → 计算入/出树 (hasSingleConnection + isTreeRoot, 树高≤treeHeight) → 当前层前插 incMax 层移入树 (根在最靠 hub 侧) / 后插 outMax 层 → 移除空层.
- 接线: 两条 pre-P3 链均在 NodePromotion 之前 (ELK slot 68 < NODE_PROMOTION 70), 条件 HIGH_DEGREE_NODES_TREATMENT.

### 过程中修复的关键 bug
1. **li 推进**: `incMax/outMax` 初始 -1 (无高连通节点时), 旧 `li += incMax+1+outMax` 把 li 推到 -1 → 崩溃. 用 `Math.max(0, ...)`.
2. **preLayers 顺序**: unshift 构造后需 reverse — 根要移到**最靠近 hub** 的层 (ELK prependLayer 语义), 否则树方向反转 (Fan y 树落在最远层实证, reverse 后 x 全对齐).

### 验证
- Fan / high-degree-example: **布局完成且无重叠块通过**, x 坐标与 jar **完全一致** (Nx* 全部 0 差; 层序 [x|big1|a3|a2/b2|a1/b1/y|big2] 与 ELK 一致).
- 剩余坐标差: 仅沿高 hub (big2, 100x800, 23 端口) 的 y 分布 6~14px (Ny1 -14 ... Ny20 +4 线性偏移) — 独立 P4 端口放置子系统 (ELK PortPlacementCalculator cell-system vs ggn 简化公式), 已记录为后续.
- oracle P2 28 失败/660 通过 (26 模型 + partitioning example 2 块), 无新增回归; 非 oracle 全绿.

---

## 14. 续: flat01 (connected components) 根因定位 (2026-08-10)

- **现象**: N5 组件整行 y 差 -120 (ggn 152 vs jar 272); N1-N4 组件内部全部 0 差.
- **根因定位**: ggn 与 ELK 的 SimpleRowGraphPlacer 行放置逻辑**逐行一致** (maxRowWidth=sqrt(总面积)*aspectRatio, 超宽换行, ypos+=highestBox+spacing). 差异在**分量尺寸**:
  - ggn N4 分量 size=(210,120) → row1 highestBox=120 → row2 ypos=140.
  - ELK row2 ypos=260 → row1 highestBox≈240 (N4 高度差 120).
  - 但 N4 分量内部节点坐标 ggn 与 jar **完全一致** (NN4_* 全 0 差) — 即分量内部布局对, 分量 `graph.getSize()` 计算与 ELK 不一致 (疑似不含 offset/padding 或分量高度算法不同).
- **待办**: 已排除分量尺寸 (Java 探针: ELK 分量尺寸与 ggn 一致: N1-3=(130,50), N4=(210,120), N5=(690,160); SimpleRowGraphPlacer 逻辑也逐行一致). 差异在 **oracle (RecursiveGraphLayoutEngine) 的实际放置**: N5 行 ypos=260 (=row1 highestBox≈240), 而 SimpleRowGraphPlacer 按尺寸应得 140 — 需查 engine 级 ComponentGroupGraphPlacer/图 packer 与 SimpleRowGraphPlacer 的分量尺寸/行高差异 (可能 engine 用不同 aspectRatio/总宽或分量含额外高度).

---

## 15. 续: Spacings V/H swap + componentComponent (2026-08-10) — 重大潜伏 bug

### componentComponent (components 模型, 1 个)
- `src/components/components-processor.ts`: `COMPONENT_SPACING` 硬编码 20, 忽略 `spacing.componentComponent` 图属性. 改为 combine 时读 `SPACING_COMPONENT_COMPONENT` (对齐 ELK SimpleRowGraphPlacer).

### Spacings V/H swap (nodesEdges + Fan + high-degree-example, 3 个) — 重大
- `src/p4nodes/spacings.ts` precalculateNodeTypeSpacings: 所有 diagVH/pairVH 调用把 **vertical 与 horizontal 参数写反** (如 `diagVH(NORMAL, BETWEEN, NODE_NODE)` → V=BETWEEN ✗, 应 V=NODE_NODE).
- ELK Spacings.java 实证: `nodeTypeSpacing(NORMAL, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS)` (V, H).
- **为何潜伏**: NODE_NODE 与 NODE_NODE_BETWEEN_LAYERS 默认都是 20 → swap 无影响; 只有模型显式设非对称 spacing 才暴露 (nodesEdges: nodeNode=70/between=25; 顺带修了 **Fan/high-degree-example 的 hub 端口 y 分布** — 之前归因于 P4 长边/dummy, 实为 spacing swap).
- 修复: 9 处 diagVH/pairVH 参数对调 (EXTERNAL/LABEL 与 LABEL/LABEL 对称项保持).

### 验证
- oracle P2 **24 失败 / 664 通过** (28→24; components+nodesEdges+Fan+high-degree-example), **P3 23 失败 / 325 通过** (27→23). 零新增回归.
- 非 oracle 全绿.

---

## 16. 子代理审阅 + B19 修复 (2026-08-10)

### 审阅 (子代理 Pasteur, docs/fix-review-2026-08-10.md)
对 componentComponent / Spacings V/H swap / per-node alignment 三处修复的只读审阅:
- **全部 ✅ 正确** (与 ELK SimpleRowGraphPlacer.java / Spacings.java / LGraphUtil.placeNodesHorizontally 逐行一致).
- **all_four_port_sides 回归根因**: 该图 compound 内部层有 6 个 N/S 外部端口 dummy 被显式设 ALIGNMENT=CENTER (hierarchical-port-dummy-size-processor.ts:45 / hierarchical-port-constraint-processor.ts:148, 对应 ELK) — "全 AUTOMATIC→no-op" 前提错误.
- **传导链** (代理用 DebugMain 快照逐环验证): 居中 dummy x → HOR Step3 countRoutingSlots 按 X 区间算槽 → northSlots 1 vs 2 → offset.y 20 vs 30 → N/S dummy y = -offset.y → 子节点 y 整体 -10.
- **真正 bug 在 ggn**: `hierarchical-port-orthogonal-edge-router.ts:223` 用 `new OrthogonalRoutingGenerator(0)` (edgeSpacing=0), ELK 用 `SPACING_EDGE_EDGE` (HierarchicalPortOrthogonalEdgeRouter.java:522,547), conflictThreshold=0.5*edgeSpacing=5; ggn 阈值 0 → 近距端口段 (128 vs 130, 差 2<5) 漏判 → 槽数错.

### B19 修复 (已落地)
- `hierarchical-port-orthogonal-edge-router.ts:223`: `new OrthogonalRoutingGenerator(layeredGraph.getProperty(SPACING_EDGE_EDGE))`.
- 顺带一致性修复: `polyline-edge-router.ts` 重复版 placeNodesHorizontally 补 ALIGNMENT (POLYLINE 此前不 honor); `layered-layout-provider.ts:1054` 的 `-COMPONENT_SPACING` 改读 `SPACING_COMPONENT_COMPONENT`.

### 验证
- oracle P2 **23 失败 / 665 通过** (修复 3 + B19: sloppy_overlaps_3 与 all_four_port_sides 都过, 净 -1), P3 **22 失败 / 326 通过**.
- 零新增回归 (失败集合 diff 唯一差异为 all_four_port_sides 转通过).
- 非 oracle 全绿.

---

## 17. 剩余族探索结论 + 路线图 (2026-08-10)

### 本轮落地
- 子代理 Pasteur 审阅三处修复（全 ✅），定位并修复 **B19**（HOR `OrthogonalRoutingGenerator(0)` → 读 `SPACING_EDGE_EDGE`，冲突阈值 0→5），附 polyline ALIGNMENT + provider COMPONENT_SPACING 一致性修复。
- P2 **23 失败 / 665 通过**，P3 **22 失败 / 326 通过**，全回归绿。

### 剩余族探索结论（各自根因/前置）
1. **compaction 8**：ELK 后置压缩 = LGraphToCGraphTransformer + OneDimensionalCompactor + HorizontalGraphCompactor。**前置障碍**：ggn spline router 不存 `SPLINE_ROUTE_START`（SPLINES 竖段收集无法进行）→ 需先给 SplineEdgeRouter 加路由段存储，再移植 transformer（ggn oned 模块为旧版 API，需适配具体 CNode 子类）。
2. **labels 5**（nodeLabelPlacement/outside_placement×2/insideNodeLabels_01/variants）：差异均小（2.5-15px），根因 = ggn 只做 H_CENTER 居中（recenterNodeLabelsRecursive 与 label-and-node-size-processor.ts:282-283），ELK 用 NodeLabelAndSizeUtilities（288 行 cell-system 全量放置，INSIDE/OUTSIDE + V/H）。需移植该放置逻辑。
3. **north_south_ports_1**：NS dummy 排序（P3 前置）与 ELK 不一致（源节点垂直序 = NS 端口 x 序，ggn 序错）。
4. **flexible_ports 2**：网络单纯形求解差异（n1_1 高 68 vs 50；transformNode/Ports/Edge 均逐行一致，差异在 simplex 平衡/初始解）。
5. **flat01**：oracle engine 分量放置（row1 highestBox 240 vs SimpleRowGraphPlacer 120）。
6. **475**：algorithm:fixed 需位置输入保真 + fixed 布局语义。
7. **701**：B6 端口标签输入保真（parseElkt 丢端口标签）。
8. **partitioning example**：容器级 -250（DOWN+分区+容器组合）。
9. **modelOrderCycleBreaking**：ELK 自身 NPE（复刻意义存疑）。
10. **hierarchy01**：层级边标签（compound 尺寸传导）。

### 推荐优先级
compaction（8，最大，但需先做 spline route 存储）→ labels（5，NodeLabelAndSizeUtilities 放置）→ north_south_ports_1 / flexible_ports（各 2）→ 其余单点。

---

## 18. compaction/labels 前置确认 (2026-08-10 续)

### compaction post-compaction 前置 (更精确)
- ggn 已有 `src/compaction/oned/` (858 行, OneDimensionalCompactor/CGraph/CNode/algs) 但为**旧版 API 死代码** (CNode 抽象 + 抽象 spacing 方法, 与 ELK 0.12.0 final CNode+origin 不同).
- ggn SplineEdgeRouter (`src/p5edges/splines/spline-edge-router.ts`) 只存层间距状态 (SplineSegment 的 leftPorts/rightPorts/rank/hyperEdgeTopYPos), **不存 boundingBox/edges**, 无法直接收集 SPLINES 竖段 (ELK 用 `SPLINE_ROUTE_START` = List<SplineSegment> 含 boundingBox).
- 前置工作量: ① SplineSegment 补 boundingBox + 路由段存到边属性; ② 移植 LGraphToCGraphTransformer (nodes + vertical segments + merge + lockMap); ③ HorizontalGraphCompactor (strategy 分发 + specialSpacingsHandler + applyLayout); ④ oned 模块按 0.12.0 API 适配 (CNode 具体子类). ~800-1000 行.

### labels 族前置
- ELK 的 node label 放置 = cell-system (NodeLabelCellCreator/NodeLabelLocation/GridContainerCell/StripContainerCell), ggn 只有简化版 (label-and-node-size-processor.ts:282-283 仅 H_CENTER+padding.top, NODE_LABELS_PLACEMENT 被 void).
- 5 个模型差异 2.5-15px (OUTSIDE label 的 margin 未计入), 需移植 label 放置 + 外置 label margin (~300 行).

### north_south_ports_1
- NS dummy 顺序对但源节点垂直序 = P3 交叉最小化与 NS dummy 的交互, 深.

### 本轮结论
- 剩余 23 个失败均需子系统级移植 (compaction/labels/NS/network-simplex/engine-component/fixed/port-labels), 已按优先级与前置记录. P2 23 / P3 22 为当前基线.

---

## 19. fixed 算法支持 (475) (2026-08-10)

- **实现**: `isFixedNestedGraph` (容器节点 algorithm='fixed' → 子图跳过 layered 布局, 保持输入位置, 对齐 ELK FixedLayoutProvider)。接入 doHierarchicalLayout Phase A/C + doCompoundLayout SEPARATE 循环。
- **效果**: 475 两个块通过, n1 保持 (0,0) (之前被 compound padding 推到 12,12)。P2 23→22, P3 22→21, 零回归。
- 语料仅 1 个 fixed 模型 (475)。

---

## 20. 本轮探索补充 (2026-08-10)

- **labels 族 (5)**: 确认需 cell-system 语义 (节点尺寸 vs cell 尺寸分离: insideNodeLabels_01 的 0 尺寸标签 → ELK 节点 0×0 但 cell/图 10×10、节点居中 (5,5); ggn 简化为节点=标签盒+padding 与 ELK 冲突 — 去掉 padding 修 insideNodeLabels_01 但破坏 724, 已回退). 完整移植 = NodeLabelAndSizeUtilities + cell-system 放置.
- **flat01 (根因已修正)**: 用 Java 探针 (split + 分量 doLayout + combine 复刻 engine) 实证 — 分量尺寸与 combine 逻辑都一致 (N4=210x120, SimpleRowGraphPlacer 行放置), **差异在 N5 分量内部 P4 节点放置**: ELK N5_1 在内部 y=110 (分量 160 高, 源节点垂直居中于两条分支), ggn N5_1 在内部 y=0. 非 engine 分量尺寸问题, 是 P4 (BK 节点放置) 对 N5 DAG 的垂直放置差异.
- **modelOrderCycleBreaking**: ELK 自身 NPE, 复刻意义存疑 (保留跳过).
- 本轮落地: fixed 算法 (475, isFixedNestedGraph 跳过 fixed 容器子图布局), P2 23→22, P3 22→21, 零回归.

---

## 21. 本轮探索补充 2 (2026-08-10)

- **compaction 前置再确认**: ggn SplineEdgeRouter (`src/p5edges/splines/spline-edge-router.ts`) **只做层间距计算** (createSplineSegments → 层尺寸), **不产出 spline 曲线/弯点** (无 bendPoints 写入). ELK 的 SPLINE_ROUTE_START = 每边路由段 (SplineSegment 含 boundingBox+edges, SplineEdgeRouter.java:305-308). 移植后置压缩需先实现完整 spline 路由 (曲线+bounding box) — 远超"加路由段存储", 属多轮工程. 当前 SPLINES 模型通过仅因 oracle 只比节点坐标不比边弯点.
- **P4 垂直放置 recurring theme**: 剩余失败中 4 个共享"层内节点垂直分布差异" (flat01 N5 源节点 y=110 vs 0; partitioning example n11 LTR y=102 vs 12; flexible_ports n1_1 高 68 vs 50; north_south_ports_1 NS 序). 但分属不同 placer (BK/NS), 非单一 bug.
- **partitioning example**: 分区约束边已正确创建 (11 dummy 节点/25 边), 内层差异是 P4 垂直放置 (LTR y 分布), 非分区逻辑问题.
- 本轮落地: fixed 算法 (475), P2 23→22. 剩余 22 个全部需子系统/深度移植.

---

## 22. labels 族收敛 + parse 保真 B16b-B16e (2026-08-10, 续)

### 本轮基线 (修复前)
- P2 oracle: 22 失败 / 666 通过 (688); P3: 21 失败 / 327 通过 (348).
- labels 族 5 个 (nodeLabelPlacement / outside_placement×2 / variants / insideNodeLabels_01) + padding/ports/horizontalOrder/416 等.

### 本轮落地 (P2 22→17, P3 21→16)
1. **B16b: 单行 label 声明内联 layout/placement** (`scripts/elkt2test.mjs`):
   `label "N2" { layout [ size: 17, 15 ] }` 行含 '}' 不进块模式 → 内联 size/position/placement 丢失.
   修复后 N2/N3/N4/N5/N6 label 尺寸正确. **影响 9 个模型** (partitioning 24 标签等) → 全量重生成 jar oracle.
2. **OUTSIDE label 完整移植** (三处):
   - `placeNodeLabels` (label-and-node-size-processor.ts): OUTSIDE 放置 (H_PRIORITY → WEST/EAST; V_CENTER+H_LEFT/H_RIGHT → WEST/EAST; 否则 NORTH/SOUTH), 间距 = spacing.labelNode (默认 5).
   - `calculateNodeMargin` (node-margin-calculator.ts): OUTSIDE margin 按 NodeLabelLocation 方向.
   - `recenterNodeLabelsRecursive` (layered-layout-provider.ts): OUTSIDE 标签按最终尺寸重放 + placement 回退节点属性.
   - 关键语义: **H_PRIORITY + H_CENTER → OUT_T_C/OUT_B_C (垂直侧)**; V_CENTER + H_LEFT/H_RIGHT (无 H_PRIORITY) → OUT_L_C/OUT_R_C (水平侧).
3. **N7 x=5 根因澄清**: 不是内容平移, 是 `LGraphUtil.placeNodesHorizontally` (OrthogonalEdgeRouter 调) 的
   `xpos = max(xpos, margin.left)` — 用 Java 探针 (LGraphProbe) 逐步 runLayoutTestUntil 二分定位. ggn orthogonal/polyline 已有等价实现, 无需 computeComponentSize 平移 (曾误加又撤销).
4. **B16c: 容器 labelPad 条件** (`shared/elkgraph-builder.ts` + elkt2test 同步):
   ELK `computeInsideNodeLabelPadding` 只对**显式 INSIDE placement** 的 label 生效 (无 placement → UNDEFINED → 不进 cell).
   padding.elkt n1/n2/n4/n5 (无 placement) subNode y=12/20/20/0 无 labelPad; n3/n6 (有 placement) +22. 按 V/H 方向加对应侧.
   - 方括号 enumset 格式 `"[H_CENTER, V_TOP, INSIDE]"` 需剥壳.
5. **B16e: NODE_LABELS 约束叶子节点 cell/尺寸分离** (`collapseZeroLabelCells`):
   全 0 尺寸标签时 ELK 节点 = 0×0 (标签盒) 但布局占位 cell = 标签盒 + NODE_LABELS_PADDING (insideNodeLabels_01:
   NN 0×0 于 (17,17), 图 34×34 = cell 10×10 + padding 24). 收尾: 节点收缩到标签盒 + 居中于原 cell.
   **排除 PORTS/PORT_LABELS 约束** (端口占位时不收缩, inside_port_labels 实证).
6. **elkt2test 测试生成器补 label placement** (`NODE_LABELS` 含 placement + setLabels 传入):
   测试内联建图此前丢 label 级 placement → variants 测试与 buildLGraphFromParsed 路径不一致.

### 实证记录
- nodeLabelPlacement / outside_placement / outside_placement_hpriority / padding / ports / horizontalOrder /
  variants / insideNodeLabels_01 / inside_port_labels / 416 全部 0 差异对齐.
- Java 探针: `LGraphProbe` (doLayout 后 node pos = margin, graph offset 0, size 含 margin);
  `LGraphStep2` (runLayoutTestUntil 二分: LSAGHC 后 pos=(0,0), OrthogonalEdgeRouter 后 pos=(5,0) → placeNodesHorizontally).
- `PlacerMain3` (SimpleRowGraphPlacer placeComponents 反射: 8 分量 target 350x280 匹配 jar root 374x304-24).

### 剩余 17 个 P2 失败 (全部需子系统/深度移植, 见 §17-21)
partitioning×2 (P4 LTR 垂直放置) / modelOrderCycleBreaking (ELK 自身 NPE) / compaction_oned×7 (spline 路由前置) /
flat01 (P4 BK) / hierarchy01 (层级边标签) / flexible_ports×2 (network simplex) / north_south_ports_1 (NS 序) / 701 (端口标签输入).

---

## 23. 分区 + 容器尺寸 + 剩余 15 失败精确根因 (2026-08-10, 续)

### 本轮落地 (P2 17→15, P3 16→15)
1. **分区激活条件**: ELK ElkGraphImporter.java:119 仅 `topLevelGraph.getProperty(PARTITIONING_ACTIVATE)` 激活分区,
   嵌套图 activate 被忽略 (partitioning.elkt 容器级 activate → 布局与 default 相同 — jar 实证 Npartioning=Ndefault).
   ggn 曾把 PARTITIONING_ACTIVATE 传播到嵌套图 (NESTED_GRAPH_OPTS) → 错误激活 → 同分区节点强排同层.
   修复: 从 NESTED_GRAPH_OPTS 移除 (不传播). horizontalOrder 无回归.
2. **容器 NODE_LABELS 约束**: processNodeLabels 的 NODE_LABELS 覆盖跳过容器 (getNestedGraph() !== null) —
   partitioning.elkt default 容器尺寸 354×280 (nested) vs 标签盒 53×25 实证; 容器标签通过
   computeInsideNodeLabelPadding 计入 padding, 不直接设节点尺寸.
3. 修复后 labels 族 10 个 + padding/ports/horizontalOrder/416/partitioning/inside_port_labels 全 0 差异.

### 剩余 15 失败精确根因 (Java 探针实证)
| 模型 | 根因 | 证据 |
|---|---|---|
| flat01 | **ggn BK 是 ELK 简化版** (778 vs 1644 行: bk-aligner 160/236, bk-compactor 214/421, bk-node-placer 257/628). N5 分量 ELK 内部 y 0..160 (N5_1 y=110 底部), ggn y -140..-19 (负!) — N5CompProbe 实证. 层内间距 ELK 110 vs ggn 70. 需逐行补齐 BKAligner/BKCompactor. | N5CompProbe.java |
| north_south_ports_1 | P3 交叉最小化 × NS dummy 交互: 源节点垂直序 jar NN5,NN3,NN2 vs ggn NN3,NN2,NN5 (dy -95/+190). | probe-flex |
| flexible_ports×2 | NETWORK_SIMPLEX flexible size 求解: n1_1 高 68 vs 50 (transformNode/Ports/Edge 逐行一致, 差异在 simplex 平衡/初始解). | probe-size |
| hierarchy01 | 层级边标签 compound 尺寸传导: N1_1 dy=-16, Workflow dx=15 dy=11.7. | probe-flex |
| 701 | 端口标签输入保真 (B6): parseElkt 丢端口标签 → 两边一致地错; 补齐需 parseElkt+elktToElkJson+buildLGraph 全链 + oracle 重生成. | data-paths-review §2.2 |
| compaction×7 | spline 路由前置: ggn SplineEdgeRouter 只算层间距不产弯点 → LGraphToCGraphTransformer/oned 无法移植. 多轮工程. | §17-18 |
| modelOrderCycleBreaking | ELK 自身 NPE (复刻意义存疑, 保留跳过). | — |

### 下一优先级建议
1. **flat01 BK 补全** (对齐 BKAligner/Compactor → 可能带动其他 P4 垂直放置): 逐行对比 ggn/ELK BK 差异.
2. flexible_ports simplex (差异小 2-11px, 可能有局部修复点).
3. hierarchy01 / north_south_ports_1 (P3 交互).
4. 701 端口标签 (输入保真, oracle 重生成).
5. compaction (最大, 需先完整 spline 路由).

---

## 24. hierarchy01 MINIMUM_SIZE + flat01 BK alignment 选择定位 (2026-08-10, 续)

### 本轮落地
1. **collapseZeroLabelCells 排除 MINIMUM_SIZE**: hierarchy01 Workflow (constraints "MINIMUM_SIZE NODE_LABELS",
   0 尺寸 label) 被 B16e collapse 误收缩为 0×0, ELK 为 20×20 (MINIMUM_SIZE 默认 DEFAULT_MINIMUM_SIZE).
   修复后 Workflow 20×20, 剩余层级边标签容器位置差异 (N1_2 宽 104 vs 84 等, 深层级边标签传导).
2. **flat01 BK alignment 选择定位**: ggn N5 分量 4 个 layout size **巧合全 171** (ELK 不同 → 选 UP),
   ggn 选第一个 (DOWN/RIGHT) → N5_1 内部 y=0 vs ELK 110. Java 探针 (BKProbe2/9) 逐步 runLayoutTestUntil
   定位: ELK LSAGHC 设 `offset.y -= minY` (N5 minY=-110 → offset.y=110, 内容平移), ggn LSAGHC 已有等价代码
   (layer-size-calculator.ts), 但 ggn minY=0 (BK 结果不同). BKAligner/BKCompactor/placeBlock/Threshold/markConflicts
   逐行一致, 差异在 blockSize/y 的细微累积 (N5 特定 DAG). 属 BK 子系统深挖, 暂缓.
3. **modelOrderCycleBreaking**: ELK 自身 NPE (Integer.intValue), 复刻意义存疑, 保留.
4. **flexible_ports**: ggn network-simplex-placer 688 vs ELK 1356 行 (约半), n1_1 高 50 vs 68 是 simplex
   flexible size 求解差异. 需补全 simplex.

### 剩余 15 失败分布 (P2 = P3)
compaction×7 (spline 路由前置) / flexible_ports×2 (simplex) / flat01 (BK) / hierarchy01 (层级边标签) /
north_south_ports_1 (P3×NS) / 701 (端口标签输入) / modelOrderCycleBreaking (ELK NPE).

---

## 25. flat01/north_south_ports_1 进一步定位 (2026-08-10 续)

### flat01 BK 深挖
- ggn 4 个 alignment size 巧合全 171 (ELK 不同 → 选 UP). 强制 UP 后 NN5_1 仍差 -39 → 非 alignment 选择.
- Java 探针 (BKProbe10): ELK N5 BK 后 y = {-110, -70, 0} 整齐 vs ggn UP {-105, -116, -46, -35} 分散 →
  **BK 中间计算 (block/placeBlock/ni) 有实质差异**, 非 alignment.
- BKAligner/BKCompactor/placeBlock/placeClasses/Threshold/markConflicts/ni/anchor/spacing 逐行一致
  (ggn 778 vs ELK 1644 行总, 但核心逻辑对齐). 需逐节点 dump ni.leftNeighbors/blockSize 对比 (待续).

### north_south_ports_1 P3×NS
- ggn P3 第二遍 barycenter: node2(N3)=0.49 < node1(N2)=1.53 < node3(N5)=2.52 < node0(N1)=3.48
  (GGN_P3_DBG 实证). jar 序 N5,N3,N2,N1 → N5(N5→g) 应最小.
- 差异在 **N4 端口 (d/e/f/g) 位置参与 barycenter**: ggn f 端口最上 vs jar g 端口最上 →
  端口排序/位置 (FIXED_POS 100,20 经 P3 sortPorts) 与 ELK 不同. P3 端口排序深交互.

### 701 cell 系统 (CellProbe2 实证)
- ELK NodeLabelAndSizeCalculator cell: label only=60×44, port only=40×0, label+port=60×44,
  label+port+bo=60×52 (borderOffset -8 使 cellH +8).
- ggn computeNodeCellSize 用 max 合并 (50×17), 无 padding/borderOffset/网格叠加 → 需完整 cell 移植.

---

## 26. hierarchy01 LABEL dummy / 701 cell / flexible_ports simplex 最新定位 (2026-08-10 续)

### hierarchy01 根层 10px (LABEL dummy 端口)
- ggn 根层 segments (GGN_SEG_DBG): E3 Center 标签 LABEL dummy 参与 layer0→layer1 路由,
  segment s0@34→t1@78 len=44 非直线 → slots=2 → 层间距 30 vs jar 20.
- jar LABEL dummy 端口 absY=46 (dummy y=43), ggn absY=34 (dummy y=31) → **LABEL dummy 的 BK y 差 12**
  (与 flat01 同源: BK 中间计算差异). 需先修 BK.

### 701 cell 系统 (CellProbe2/3)
- ELK NodeLabelAndSizeCalculator: label 50×17 → cell 60×44, label 50×27 → 60×64,
  label 10×17 → 20×44 → **cellW = labelW + 10, cellH = 2*labelH + 10** (对称 gap).
  borderOffset -8 → cellH +8 (60×52). port 单独 → 40×0 (N 端口只贡献宽).
- ggn computeNodeCellSize max 合并 (50×17) 无 padding/borderOffset → 需完整 cell 移植.

### flexible_ports simplex
- ggn NetworkSimplex 570 vs ELK 891 行; enterEdge/leaveEdge/exchange 逐行一致 (slack < repSlack).
- n1_1 高 50 vs 68 差异在**图构建 (transformLayer spacing / flexible 约束)** 或 initial layering,
  需对比 nGraph 中间状态.

---

## 27. flat01 根因升级: P3 层内顺序差异 (非 BK) (2026-08-10 续)

### 关键突破
- GREEDY_OFF 实验: flat01 NN5_1 dy 从 -120 → -10 → **P3 (BARYCENTER/GREEDY) 是主因, 非 BK**.
- Java 探针 (P3Probe2): ELK N5 层1 = [N5_2, N5_3], 层2 = [LONG_EDGE, NS_PORT, N5_4, N5_5].
  ggn 层1 = [N5_3, N5_2], 层2 = [N5_5, d, d, N5_4] → **层序不同 → barycenter 连锁 → BK 不同**.
- GGN_BD 实证: ggn N5_4 bc=2.0326 (degree=1, 来自 BARYCENTER_ASSOCIATES = NS dummy,
  forward 时 NS dummy 的 predecessor N5_2 端口 rank 贡献), N5_5 bc=1.028 → N5_5 前.
  ELK N5_4 也有 baryAssoc (P3Probe3), 但层2 保持 N5_4 前 → **ELK 的 NS dummy associate 贡献或层1 rank 不同**.
- 层1↔层2 barycenter 互锁: 层2 顺序 → 层1 rank → 层1 顺序 → 层2 rank. 需完整 P3 sweep 对比.
- north_south_ports_1 同源: N4 端口位置参与 barycenter (ggn N3→f vs jar N5→g).

### 下一步 (flat01 + north_south_ports_1 共享)
对比 ggn/ELK 的 P3 sweep 次数/顺序 + NS dummy 的 BARYCENTER_ASSOCIATES 参与度
(ELK 的 associate 是否同样贡献 degree) + LayerTotalPortDistributor 端口 rank.

---

## 28. flat01 P3 firstForward / random 序列偏移 (2026-08-10 续)

### 关键实验
- **GGN_FORCE_FWD=true（强制 BARYCENTER 第一遍 fwd=true）**: N5 层1 [N5_2,N5_3], 层2 [d,d,N5_4,N5_5] **完全对齐 ELK**.
  但全局强制 firstForward=true 导致 130 失败（大量模型依赖 random 的 false）→ 不能全局强制, 需对齐 random 序列.
- **ggn N5 BARYCENTER firstForward=false**（GGN_RND_DBG #46 nextBoolean v=0）.
  Java Random(1) 纯 nextBoolean 序列 #46 = **true**（RndProbe2 实证）→ **ggn 的 random 序列在中间分叉**.
- ggn JavaRandom 前 16 次与 Java Random(1) 完全一致; nextLong 截断到 48 位（注释: setSeed 只取低 48 位,
  数学上 (A^B)&MASK == (A&MASK)^B, 截断不应影响 setSeed 后的序列）→ 分叉在**消耗点次数**:
  ggn 每个分量的 P3 消耗 nextLong(initialize) + nextBoolean(firstForward) + nextDouble(randomize) + nextFloat(pert),
  与 ELK 的调用次数/顺序需逐图对齐.

### 结论
flat01 需对齐 ggn/ELK 的 P3 random 消耗（含 nextLong initialize、randomizeBarycenters 的 nextDouble、
calculateBarycenter 的 nextFloat pert、GREEDY 的 nextBoolean），使 N5 的 firstForward 与 ELK 一致.

---

## 29. flat01 根因最终收敛: JavaRandom.nextLong 有符号借位 (2026-08-10 续, ★推翻交叉数误判)

> ★ 2026-08-10 晚: §27-29 曾推断"P3 交叉数计算是根因", **错误**. 真正根因是
> `JavaRandom.nextLong()` 的有符号借位 bug → setSeed 种子错位 → P3 random 序列分叉
> → 层序/barycenter 连锁差异 → 坐标差异. "交叉数计算不同"只是症状 (喂给它的层序已不同).
> 修复 commit 639916c, flat01 + north_south_ports_1 归零 (P2/P3 14→12 失败).

### 定位过程 (LoggingRandom 逐位 diff)
- ggn 加 GGN_RND_DBG (每次 next(bits) 打点); ELK 用 instr/LoggingRandom (GraphConfigurator
  替换 new Random → LoggingRandom) → 全量 flat01 布局逐位对比.
- 前 23 个 draw 完全一致, 第 24 个分叉: N3B firstForward ggn=false / ELK=true.
- 反推: N3B nextLong r1=0x4F3880AA r2=0x8603F87C (r2 为负). Java 低 48 位种子 =
  0x80A9... (r1-1 的高 16 位), ggn 算成 0x80AA... → setSeed 后第一个 nextBoolean 分叉.

### 根因: nextLong 有符号借位
```java
// java.util.Random.nextLong() = ((long)next(32) << 32) + next(32)
// 第二个 next(32) 是【有符号 int】: r2 >= 2^31 (负) 时从高位借 1 →
// 低 48 位种子 = ((r1 - 1) & 0xFFFF) << 32 | r2.
```
- ggn 旧实现 `(BigInt(r1) << 32n) + BigInt(r2)` 按无符号加 → ~50% 分量种子错位.
- 修复: `borrow = r2 >= 0x80000000 ? 1n : 0n; seed = ((r1 - borrow) << 32 | r2) & 48bit`.
- 为什么 SimRnd7 没抓到: 它验证的是**单个 draw 的值** (next32/26/27/24), bug 在
  **nextLong 拼种子时的符号处理**, 只影响 setSeed 入参, 后续 draw 自洽.

### 防回归 (黄金向量)
- tests/unit/JavaRandomTest.test.ts 新增 JVM 21 黄金向量 (nextLong 低 48 位 /
  nextBoolean / nextFloat / nextDouble / nextInt(100), 种子 1/42/123456789).
- 生成器 scripts/elk-java-debug/RandGolden.java 入库.

### 结论
修复 JavaRandom.nextLong → P3 random 序列与 ELK 1:1 → 层序 → BK → 坐标.
north_south_ports_1 同源 (P3 random), 一并归零.

## 30. hierarchy01 归零: 节点级 mergeEdges 传播 + LCA 源侧合并 (2026-08-10 续)

### 现象 (修复前)
- 根层 NN2/NN3 x=335 vs jar 325 (+10), NN4 x=455 vs 425 (+30), Webinterface x=34 vs 14 (+20).
- y 全对 → 纯水平: 根层 L0→L1 slots=2 (ggn) vs 1 (ELK) → 层距 40 vs 30.

### 定位 (OER 插桩对比)
- ggn/ELK 根层 L1 节点对比: ggn N3 两个 WEST 外部端口 (@173.7/@183.7), ELK 一个 (@177).
- CGP 插桩: N3_1 处 E2/E4 (Workflow→Webinterface / Neo4J→Webinterface) 都 default=null 不合并.
- 根因链: Webinterface 无显式端口 → 每条入边建隐式端口 → E2/E4 两个端口 → N3_1 两个外部端口
  → N3 两个外部端口 → 两个非直线 segment 冲突 → slots=2.
- ELK 为何合并: LGraphUtil.createPort 读 layeredGraph.getProperty(MERGE_EDGES) —
  Webinterface 在 N3_1 嵌套图 (节点级 mergeEdges:true 经 createLGraph copyProperties 传播到嵌套图)
  → provideCollectorPort 共享收集端口.

### 修复 (三处一致)
1. layered-options.ts: 新增 MERGE_EDGES 属性键.
2. shared/elkgraph-builder.ts (P3 路径): 嵌套图继承节点 mergeEdges; 建边按 ELK 语义逐侧判合并
   — 源侧 = 端点 LCA 图 (ElkGraphImporter 传 lgraph), 目标侧 = 目标节点所在图.
3. scripts/elkt2test.mjs (P2 生成测试): 同传播 + __lcaMerge, 重新生成 tests/tickets/examples_batch.

### 关键陷阱
- 源侧不能简单用"源节点所在图": E1/E2/E3 源都是 Workflow (在 N1_1_1, mergeEdges=true),
  但 ELK 在根层导入时读根图 MERGE_EDGES=false → 不合并 (根 N1 4 个 EAST 端口实证).
  必须按边所在图 (LCA) 判定.

### 效果
hierarchy01 P2/P3 全部坐标 0 差异. P2/P3 12→11 失败 (剩余 compaction×7 / flexible_ports×2 / 701).

---

## 31. ast-grep outline 交叉验证: 701 cell 系统 vs ELK Java (2026-08-11)

> 方法: 对 ELK Java 0.12.0 `org.eclipse.elk.alg.common.nodespacing` 与 ggn
> `src/intermediate/label-and-node-size-processor.ts` 分别跑 `ast-grep outline --view expanded`,
> 按方法签名/行号逐阶段映射。目的: 把 701 的"cell 尺寸简化"差距量化, 为 cell 系统移植提供结构清单。

### 31.1 管线级对照 (已基本对齐, 仅确认)

- Java: `ElkLayered.layout` 顺序执行 `lgraph.getProperty(PROCESSORS)` (GraphConfigurator 装配,
  BASELINE + HIERARCHICAL_ADDITIONS + LABEL_MANAGEMENT_ADDITIONS + 条件处理器);
  阶段 = P1_CYCLE_BREAKING / P2_LAYERING / P3_NODE_ORDERING / P4_NODE_PLACEMENT / P5_EDGE_ROUTING。
- ggn: `doSimpleLayoutInner` (layered-layout-provider.ts:1184) 的 runGraphPreP3 (:457, P1/P2/P3 前) +
  runGraphPostP3 (:670, P4/P5) + 条件处理器 (partition/highDegree/semiInteractive/comment/greedyswitch/
  unzipping/singleEdge 等) 与 Java 条件一一对应。
- 结论: 管线骨架对齐无缺口; 剩余差异全部在**具体模块内部语义** (当前 P2/P3 仅剩 701)。

### 31.2 cell 系统 7 阶段对照表 (NodeLabelAndSizeCalculator.process :86-224)

| 阶段 | ELK Java (nodespacing) | ggn (label-and-node-size-processor.ts) | 状态 |
|---|---|---|---|
| 准备 | `NodeContext` + `PortContextCreator.createPortContexts` (:43) | 无 NodeContext/PortContext 数据模型 | ❌ 缺失 |
| 1 | `NodeLabelCellCreator.createNodeLabelCells` (:56) + `InsidePortLabelCellCreator.createInsidePortLabelCells` (:47) | `processNodeLabels`/`placeNodeLabels` (简化行/列网格, 无 LabelCell 容器) | ⚠️ 简化 |
| 2 | `NodeLabelAndSizeUtilities.setupMinimumClientAreaSize` (:52) + `setupNodePaddingForPortsWithOffset` (:62, 负 borderOffset→padding, FIXED 标签 insidePart+对称) | `computeNodeCellSize` MINIMUM_SIZE 分支 (max 合并) | ⚠️ 简化 |
| 3 | `HorizontalPortPlacementSizeCalculator.calculateHorizontalPortPlacementSize` (:51) + `VerticalPortPlacementSizeCalculator.calculateVerticalPortPlacementSize` (:49), 内含 `setupPortMargins`/`computeVerticalPortMargins`/`unifyPortMargins` (端口标签边距) | `computeNodeCellSize` PORTS 分支: 无条件 `2*portPort + surrounding`, max 合并 | ⚠️ 简化 |
| 4 | `CellSystemConfigurator.configureCellSystemSizeContributions` (:46) — **网格叠加贡献标志** (PORTS→N/S 贡献宽、E/W 仅 free 贡献高; PORT_LABELS→四侧+中行; NODE_LABELS→容器+中行; MINIMUM_SIZE_ACCOUNTS_FOR_PADDING→中行+中心 cell) | 无 (纯 max 合并, 无贡献标志) | ❌ 缺失 |
| 5 | `NodeSizeCalculator.setNodeWidth` (:46) + `PortPlacementCalculator.placeHorizontalPorts` (:63) + `PortLabelPlacementCalculator.placeHorizontalPortLabels` (:53) | `placeHorizontalFreePorts` (:61) (无 FIXED_RATIO 尺寸、无端口标签) | ⚠️ 简化 |
| 6 | `CellSystemConfigurator.updateVerticalInsidePortLabelCellPadding` (:142) + `setNodeHeight` (:100) + `offsetSouthernPortsByNodeSize` + `placeVerticalPorts` (:236) + `placeVerticalPortLabels` (:61) | `placeVerticalPortsEqually` (:29) (无 FIXED_RATIO、无标签) | ⚠️ 简化 |
| 7 | `LabelPlacer.placeLabels` (:40) + `setNodePadding` + `applyStuff` | `placeNodeLabels` (:308) | ⚠️ 简化 |

### 31.3 701 定向差距清单 (按实现顺序)

1. **G1 网格 vs max-合并** (`CellSystemConfigurator`): 节点最小尺寸是"贡献 cell 的网格叠加"
   (N/S 标签 cell 宽 + E/W cell 高 + 中行), 不是各约束 max。701 子节点 100×50 是网格叠加结果,
   ggn `computeNodeCellSize` max 合并算 0 → 收缩到标签盒。
2. **G2 端口标签边距** (`setupPortMargins`/`computeVerticalPortMargins`/`unifyPortMargins`,
   Vertical/HorizontalPortPlacementSizeCalculator :238-352): 端口侧所需空间含端口尺寸+标签尺寸+
   spacing+surrounding, 且 `portHeightPlusPortPortSpacing` (:373) 是 `size+portPort` 而非 `2*portPort`;
   E/W 侧 N/S 标签 cell 高度还要 later 更新。ggn 无条件 `2*portPort` 与 Java 语义不同。
3. **G3 负 borderOffset padding** (`setupNodePaddingForPortsWithOffset` :62-148): 端口 borderOffset<0
   时按侧 max 进 nodeCellPadding; FIXED 端口标签时 `computeInsidePart` + 对称 (NODE_SIZE_OPTIONS 无
   ASYMMETRICAL) 补 padding。ggn 只在 FIXED_POS 分支用 borderOffset 定坐标, 不参与尺寸/padding。
4. **G4 端口标签放置** (`PortLabelPlacementCalculator` :53-457 + `PortContextCreator` :43): 701
   Issue701Test 端口标签重叠 (80 处) 的根因 — 标签需按 FIXED 显式 position 直接放置 (elkt 已给
   position), ggn 无放置逻辑。**必须与端口标签解析一并提交** (afa0e45 还原实证)。
5. **G5 容器内部标签入容器尺寸** (`NodeLabelCellCreator` + 容器 resizeParentNode): 容器 padding
   需计入内部标签 (computeInsideNodeLabelPadding), ggn 容器尺寸路径未含端口标签/内部标签贡献。

### 31.4 结论

701 的 47px 容器差与端口标签**无直接因果** (oracle 无标签也差, 快照均 100×50):
真正根因是 G1+G2+G3 — ggn cell 尺寸把子节点缩到 50×17/126×17, ELK 网格叠加得 100×50。
修复顺序: G3 (负 borderOffset padding, 改动最小) → G2 (端口边距替代 2*portPort) → G1 (贡献标志网格)
→ G4+G5 (端口标签放置 + 容器标签, 与解析一并提交)。禁止 max(explicit,cell) 权宜 (8 回归实证)。

---

## 32. OPT_MAP 重复键清理 (2026-08-11)

- 现象: `bun demo` (vite) 报 10 组 "Duplicate key" 警告 (shared/opt-map.ts OPT_MAP 对象字面量)。
- 根因: "节点级选项" 段 (L48+) 与文件前段重复定义了 10 个键 (nodeLabels.placement /
  layering.strategy / edgeRouting / spacing.portPort|nodeNode|edgeEdge|edgeNode|edgeLabel|labelLabel|labelNode),
  值完全相同 → 后者覆盖前者, 运行时无行为差异, 纯代码卫生问题。
- 修复: 删除 10 个第二处定义 (git diff 仅 10 deletions, 唯一键 nodeLabels.padding /
  layering.layerConstraint / crossingMinimization.positionChoiceConstraint / algorithm /
  spacing.portNode 保留)。105 唯一键 / 0 重复。
- 验证: verify-json-path 900 ✅ | P2 差分 687/688 (唯一失败 701, 与本次无关) | BDD 83 ✅。

---

## 33. 701 归零: cell 系统最小尺寸完整移植 (2026-08-11)

### 根因修正 (推翻"ELK 保持 100×50"旧结论)
- 旧结论基于过期输入 (旧 export.mjs 丢 nodeSize.constraints) — Java 未应用约束才保持 100×50。
- 用当前 elktToElkJson 重新生成输入 + DebugMain/CellProbe 实测: **ELK 真实把 MyNode1 缩到 60×52**
  (非 100×50)。提交的 oracle (hash 2bff53...) 与重新生成完全一致 → 现 oracle 就是缩小后的坐标。
- ggn 之前算 50×17 → 差 4px; 现在 cell 系统算出 60×52 → 全对。

### 新模块: src/intermediate/cell-system.ts (NodeLabelAndSizeCalculator 7 阶段尺寸部分移植)
- Cell 原语: AtomicCell/LabelCell/StripContainerCell/GridContainerCell (cellsystem/*.java 1:1)。
- 语义要点 (均按 Java):
  1. **网格叠加 contribution flags** (CellSystemConfigurator), 非 max 合并;
  2. **AtomicCell content 维度 0 → minWidthOf/minHeightOf 返回 0** (ContainerCell 特判) — E/W 端口
     cell content.x=0 → 不贡献宽;
  3. **对称网格**: 无 ASYMMETRICAL 时 outer 行/列取 max (V_TOP 标签 → 底部行同高, inner 44 = 17×2+10);
  4. **端口对齐默认 DISTRIBUTED** (ggn 旧硬编码 JUSTIFIED 错) → 端口侧 cell +2*portPort;
  5. 负 borderOffset + FIXED 端口标签 insidePart → nodeContainer padding (含对称);
  6. FIXED 端口标签 bounds → 端口 margin (computeHorizontal/VerticalPortMargins);
  7. 端口标签仅在非 FIXED placement 建 LabelCell (PortContextCreator)。

### 接线修复
- `processNodeLabels` PORTS 分支: 用 computeCellSystemSize; MINIMUM_SIZE 按旧语义 (min>0?min:20,
  DEFAULT_MINIMUM_SIZE 默认生效) — 299 N1 0×64 → 20×64。
- `applyNestedGraphMinimumSizes`: 用 computeCellSystemSize(node, graph, true) (ELK importer
  calculateMinimumGraphSize 语义, ignoreInsidePortLabels=true); merged = max(curMin, nodeMin, cell)
  (content_centered 900×400 显式 minimum 经 nodeMin 传递)。
- 关键坑:
  - **ggn getProperty 未设置时返回默认值** → 间距继承必须 hasProperty 判断 (portPort 13 之前读成 10);
  - elkt placement 字符串 "[H_CENTER, V_TOP, INSIDE]" 需先去括号再 split (否则标签被当 OUTSIDE);
  - computeCellSystemSize 的 sizeOptions **不能**回退 DEFAULT_MINIMUM_SIZE (701/316/491/partitioning
    容器 content 处理异常); 叶子路径在 processNodeLabels 处理。

### 验证 (全绿)
- P2 oracle 差分 **688/688** (701 归零, 无回归) | P3 348/348 | verify-json-path 900 | BDD **93** (新增
  cell-system.scenarios 10 条: DISTRIBUTED 2*portPort / 负 borderOffset padding / 对称网格 /
  MINIMUM_SIZE 20 / AtomicCell 特判 / FIXED 标签 margin / 701 回归 60×52) | EdgeRoutingE2E 949 |
  单测 1023 | verify-elkt-java 854/900 (基线不变) | verify-elkg-elkt 550。
- 变异测试: cell-system.ts 纳入 stryker mutate + vitest.mutation.config include。

### BDD + 变异测试
- tests/bdd/cell-system.scenarios.test.ts: 23 个场景 (701 回归 60×52 / DISTRIBUTED 2*portPort /
  负 borderOffset padding / 对称网格 / MINIMUM_SIZE 20 / AtomicCell content-0 特判 / 多端口堆叠 /
  FIXED 标签 margin / UNIFORM_PORT_SPACING / OUTSIDE 节点标签 / OVERHANG / FIXED_POS/RATIO 贡献)。
- scoped stryker (stryker-cell.config.mjs + vitest.mutation-cell.config.ts): cell-system.ts 杀灭率
  **44.5%** (covered 53.6%) — 核心阶段全钉住; 剩余存活多为环境调试分支移除后仍存在的
  组合路径 (FIXED_POS/RATIO 细分、MINIMUM_SIZE_ACCOUNTS_FOR_PADDING 等) 与 cell 原语算术组合。

### 仍缺 (非本次范围)
- 端口标签输入保真 (parseElkt/elktToElkJson 发射端口标签) 仍还原 — 需与 PortLabelPlacementCalculator
  (FIXED/INSIDE/OUTSIDE 放置) 一并提交 (afa0e45 实证 80 处重叠)。cell-system 的 fixedLabelBounds /
  标签 margin 分支已就绪, 等标签解析恢复即生效。

---

## 34. 自环嵌套图 "60x30 内部体" + 701 端口标签收敛 (2026-08-11)

### 34.1 "60x30 内部体" 的 ELK 创建点 (用户问题答复)

现象: 自环嵌套图 (tickets/layered/167_insidePortLabelsInHierarchicalGraphs,
tickets/core/562_insideSelfLoopAlgorithmResolving) 里 ELK 输出有一个 60×30 的"内部体"节点
(自环绕它路由), ggn 曾缺。

**结论 (jar EdgeMain/LayoutJsonMain/DebugMain 实证)**:
- **60×30 不是 ELK 创建的中间节点, 而是 ggn 的 elktToElkJson 默认发射尺寸**
  (elkt2test.mjs:571, 无显式 size 时写 60×30; 即 §S4 的"疑似"确认)。ELK 模型节点默认 0×0。
- **ELK 创建"内部体"的代码点**:
  1. `ElkGraphImporter.importGraph` (:342-374): `hasInsideSelfLoops(elknode)` → `createLGraph(elknode)`
     为节点建嵌套 LGraph (节点因此成 compound, 即使无子节点)。
  2. `ElkGraphImporter.hasInsideSelfLoops` (:516-527): activate + `insideSelfLoops.yo` 自环检测。
  3. `CompoundGraphPreprocessor.processInsideSelfLoops` (:616-685): 把 yo 自环转成嵌套图内
     ExternalPort dummy 对 (WEST 输入 / EAST 输出) + dummy 边, 记入 crossHierarchyMap。
- **最终尺寸**: 由 `HierarchicalNodeResizingProcessor` 按嵌套图内容 resize — 167 N1 60×30 → **24×32**
  (两个 E/W dummy 各高 8 = 端口高, + padding 12×2), 562 N1 → **4×32**。不是保持 60×30。
- **ggn 端口已齐**: `prepareInsideSelfLoopsRecursive` (elk-graph-importer.ts:93) + 
  `CompoundGraphPreprocessor.processInsideSelfLoops` (compound-graph-preprocessor.ts:248)。
  曾加的"嵌套图初始尺寸 = 节点尺寸"是错误实证 (探针端口 0×0 误判; ELK createLGraph 不设 size),
  **已还原** — 去掉后 167/562/insideSelfLoops 仍全过。

### 34.2 167 根因 = stale 生成物 (非算法)

- elkt2test yo 正则 `^\s*(?:insideSelfLoops\.)?yo:` 不匹配 167 的 `org.eclipse.elk.insideSelfLoops.yo`
  → 生成的 tickets_batch EDGE_YO[0]=false, 且 jar oracle 也基于旧输入生成 (hash e927) → 测试输入与
  oracle 双双 stale, 表现为"NN1 y 差 10"假失败。
- 修复: 正则兼容 `org.eclipse.elk.` 前缀 + 重生成 tickets_batch/json_path_batch + 167 oracle
  (hash 8d05, NN1 50,12)。当前 elktToElkJson 已发射 `yo:true`。

### 34.3 701 端口标签收敛 (KNOWN_OVERLAPS 4→1)

移植 (与 ELK 逐段对照):
1. `LabelAndNodeSizeProcessor.process` (:84): NodeDimensionCalculation filter `NORMAL` (dummy 排除) +
   EXTERNAL_PORTS 时 `placeExternalPortDummyLabels`。
2. `placeExternalPortDummyLabels` (:96-176): INSIDE/OUTSIDE 四侧 box 定位 (computePortLabelBox,
   labelNextToPort 语义, treatAsGroup)。
3. `CompoundGraphPreprocessor` (:191-222): 给外部端口 dummy 的 port 加空 LLabel (尺寸=原标签;
   非 INSIDE → FIXED 只留 insidePart, OUTSIDE → 0), 使 NodeMarginCalculator 为容器预留标签空间。
4. `InsidePortLabelCellCreator.setupNorthOrSouthPortLabelCell` (:81-99): N top / S bottom =
   portLabelSpacingVertical (负值跳过, 避免增大节点)。
5. compound/FIXED_POS 分支补 `placePortLabels` (ELK 对 compound 节点也跑 PortLabelPlacementCalculator)。

效果: 701 已知重叠 4→1 (剩 MyCont2: jar 自身也重叠的病态模型), 701 oracle 坐标对齐 (tickets_batch 过)。

### 34.4 其他

- elkt2test/opt-map: coerceVal enumset 非法分量 (portLabels.placement FIXED) → undefined 跳过
  (ELK parseValue null → 选项不设置) → fixed_positions_01 归零。
- **陷阱**: `generate-jar-oracle.mjs --glob` 会覆盖 index.json 为 glob 子集 — 局部重生成后需手动合并
  (本轮回滚 index 后仅改 167 hash + timestamp)。建议工具改为 merge 语义。
- 验证: 696/696 | tickets 218 | tests 385 | examples+E2E+BDD 1140 | json_path 348 | Issue701 |
  verify-json-path 900 | verify-elkg-elkt 550 | verify-elkt-java 854/900 基线不变。

---

## 35. 边路由 E2E 假绿修复 + N/S 外部端口边路由移植 (2026-08-11)

### 35.1 EdgeRoutingE2E 假绿 (两个根因, 均已修)

1. **edge-e2e-lib 导入断裂**: d74fcdc 移除 elkt-build.mjs 的 buildLGraphFromParsed 再导出后,
   edge-e2e-lib 仍从 `./elkt-build.mjs` 导入 → vitest 下缺失导出 = undefined (vite ESM 宽松) →
   每个用例在 compareSafe 内崩溃 → known-ok 断言 `fails=[]` 恒真 → **949 全假绿**;
   bun (scan-edge-e2e) 直接 import 报错. 修复: 改从 `shared/elkgraph-builder.ts` 权威源导入.
2. **edge-dirs-oracle stale**: 旧 oracle 用早期 elktToElkJson 生成 — comments.elkt 的
   `commentBox: true` 未发射 → 注释盒被当普通节点 → 全部方向节点位置错 (n1 92,17 vs 正确 57,47)
   → 65 个平坦用例假失败. 用当前 elktToElkJson 重生成 (940 用例, oracleHash 4462→84fc).
   顺带清理 tmp-bends/tmp-ns-port 调试模型 (仅 vis.mjs 注释引用).

### 35.2 N/S 外部端口边路由移植 (HierarchicalPortOrthogonalEdgeRouter Step3)

- **缺口**: TS 只移植了 routeEdges 的槽数统计 (countRoutingSlots), 未生成 N/S 边弯点 —
  边保留 P5 通用 WestToEast 路由的不完整路径 (all_four_port_sides: 2 弯点 + 斜线段),
  jar 在 Step3 (After P5) 用 SOUTH_TO_NORTH/NORTH_TO_SOUTH 策略重路由 (5 弯点).
- **移植**: `OrthogonalRoutingGenerator.calculateBendPointsForDirection`
  (Java SouthToNorth/NorthToSouthRoutingStrategy.calculateBendPoints 1:1) +
  `routeEdgesForDirection` 增加 startPos 弯点生成 (NaN=仅槽数, 兼容旧调用);
  `routeNorthSouthEdges` (Java routeEdges :511-595 顺序: 北向 startPos=-nodeSpacing-offset.y →
  调整 offset/size → 南向 startPos=size.y+nodeSpacing-offset.y).
- **效果**: all_four_port_sides 12/12 全方向 (was 8/6), hier 边路由 237→282 通过
  (91→46 失败), 总通过率 82.0%→94.1%. EdgeRoutingE2E 941 ✅, 无回归.
- **BDD/变异**: north-south-ports.scenarios 新增 Step3 弯点场景; stryker mutate +
  vitest.mutation include 纳入两个模块.

### 35.3 剩余 56 边路由失败 (下一轮)

- hier ×46: 深多层跨级边 offset 坐标 (hierarchy01 的 E1 等跨 N1.N1_1.N1_1_1 → N2.N2_1,
  ggn 弯点含负 y / 斜线段; 455/288/352/371 同类) — 需对比 compound-graph-postprocessor
  多级 offset 与 OrthogonalEdgeRouter 跨级段路由.
- selfloop ×6: insideSelfLoops/368 自环槽位偏移 (RIGHT/LEFT 节点位置对但自环 y 差 12 =
  嵌套图 padding/offset; DOWN/UP 节点 y 差) — SelfLoopRouter 槽位/边距.
- flat ×3: 528_violatedNodeOrder (DOWN/UP 节点位置), 726 (LEFT).

---

## 36. 渲染管线 ast-grep outline 全量缺口盘点 (2026-08-11)

按目标方法论对 ELK Java 0.12.0 `alg.layered` 全部源码文件 (138 个) 与 layout `src/`
做 ast-grep outline / 文件名 + 符号引用双重对比。

### 36.1 已确认覆盖 (无缺口)

- P1 断环: GreedyCycleBreaker / InteractiveCycleBreaker / ModelOrderCycleBreaker /
  GreedyModelOrderCycleBreaker (+ group-model-order-calculator)。
- P2 分层: NetworkSimplexLayerer / LongestPathLayerer / LongestPathSourceLayerer / InteractiveLayerer。
- P3 排序: LayerSweepCrossingMinimizer (Barycenter+Greedy) / InteractiveCrossingMinimizer /
  NoCrossingMinimizer / GreedySwitchHeuristic + SwitchDecider / LayerTotalPortDistributor /
  NodeRelativePortDistributor / counting (CrossingsCounter/BinaryIndexedTree 内联)。
- P4 放置: BKNodePlacer (bk-aligned-layout/aligner/compactor) / NetworkSimplexPlacer /
  SimpleNodePlacer / InteractiveNodePlacer。
- P5 边路由: OrthogonalEdgeRouter + OrthogonalRoutingGenerator (WestToEast/SouthToNorth/
  NorthToSouth 方向策略) / PolylineEdgeRouter / SplineEdgeRouter (部分) /
  HierarchicalPortOrthogonalEdgeRouter (Step1-6 完整)。
- intermediate: cell-system / label-and-node-size-processor / long-edge-* / self-loop-* /
  north-south-port-* / hierarchical-port-* / partition-* / comment-processors /
  high-degree / semi-interactive / sort-by-input-model / layer-constraint-* / port-* /
  invert-port / dummy-self-loop / label-dummy-* / node-margin-calculator / unzipping / preserveorder。
- compound: CompoundGraphPreprocessor / CompoundGraphPostprocessor / cross-hierarchy-edge。
- compaction: oned (HorizontalGraphCompactor/OneDimensionalCompactor/LongestPath/Quadratic/
  Scanline 内联 algs) / components (ComponentsProcessor/SimpleRowGraphPlacer 内联) / recthull。

### 36.2 未移植的备选策略模块 (语料未覆盖, 全部走默认/降级, 不影响当前测试)

- **P1 断环备选**: BFSNodeOrderCycleBreaker / DFSNodeOrderCycleBreaker / DepthFirstCycleBreaker /
  SCCNodeTypeCycleBreaker / SCCModelOrderCycleBreaker / SCConnectivity
  (DEPTH_FIRST 等策略当前降级 Greedy; 600 等模型实证坐标仍一致)。
- **P2 分层备选**: CoffmanGrahamLayerer / MinWidthLayerer / StretchWidthLayerer /
  BreadthFirstModelOrderLayerer / DepthFirstModelOrderLayerer。
- **P3 排序备选**: MedianHeuristic / ModelOrderBarycenterHeuristic。
- **P4 放置备选**: LinearSegmentsNodePlacer (SIMPLE 用 SimpleNodePlacer 覆盖, 语义等价)。
- **wrapping**: SingleEdgeGraphWrapper / BreakingPointInserter/Processor/Remover
  (WRAPPING_STRATEGY ≠ OFF 时缺失, 语料未用)。
- **intermediate 备选**: HypernodesProcessor / NodePlacementRepeater (network simplex
  node flexibility 第二遍) / ConstraintsPostprocessor (INTERACTIVE_LAYOUT /
  GENERATE_POSITION_AND_LAYER_IDS) / LabelManagementProcessor (LABEL_MANAGER) /
  FinalSplineBendpointsCalculator / InteractiveExternalPortPositioner。
- **components 备选**: ModelOrderRowGraphPlacer / ComponentGroupModelOrderGraphPlacer /
  ComponentsCompactor (CONSIDER_MODEL_ORDER + 多分量时)。

### 36.3 结论

管线骨架无缺口 (当前语料全部模型可布局且 696/696 坐标一致); 剩余未移植模块均为
备选策略/高级特性, 语料未触发 (对应选项值在 elk-models 中 0 命中)。完整移植这些模块
需要构造对应选项的 jar oracle 测试 (目前无模型触发), 属后续增量工作。
