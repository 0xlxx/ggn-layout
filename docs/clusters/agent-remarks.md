# 子代理备注回流登记册 (Agent Remarks Registry) — elk-layout 优化批次 1

> 流程 (强制): 子代理发现问题 → **主线程独立验证** → 验证通过后回流到计划。
> 不允许备注只留在汇报里被遗忘。

## 批次 1 (2026-08-12, P1 Label 直读 + P3 sweep 并行)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R01 | P1 | small ≥20% 端到端门禁在「热属性直读」类别内不可达（CPU 证据 getProperty 仅 ~1.7%；Label 耗时主体是 cell-system.ts） | ✅ 主线程复核 --cpu 数据属实 | 已记录 | P1 换目标或并入后续簇 |
| R02 | P1 | Label 模块真正大头是 cell-system.ts 计算层（placeNodePorts/computeCellSystemSize/placePortLabels） | ⏳ 待开簇量化 | 待办 | 新簇候选 |
| R03 | P1 | node.getPorts(side) 每调用 filter 分配数组（lnode.ts 横切层） | ⏳ 待验证 | 待办 | 横切簇候选（免分配） |
| R04 | P3 | java-random next() 改 Number 24+24 位定点 LCG | ✅ 主线程数学验证位级等价（中间量 <2^53）+ 60M 步验证 | 已采纳 | 无 |
| R05 | P3 | WeakMap 缓存依赖「P3 期间节点不换层」不变式（stateOf / nodeLayerIndex） | ✅ 主线程 grep p3order 无 setLayer | 已采纳 | 不变式已注释文档化 |
| R06 | P3 | hyperedge 池化：hash 序列 nextHash++ 逐位一致；port.id 数组索引遵循原有不变式 | ✅ 主线程验证 portPos 原按 port.id 索引 | 已采纳 | merged 超边不回收（功能等价，小性能遗漏） |
| R07 | P3 | ForsterConstraintResolver 构造器占位 BarycenterState 冗余分配（initAtNodeLevel 覆盖） | ✅ 主线程确认数组/WeakMap 双轨同 state 对象，无读点暴露占位 | 已记录 | 后续可去占位（正确性无损） |
| R08 | P1 | 同 id 不同默认值的 Property 复用同一 fast 槽位 → 取第一个注册默认值 | ⏳ 待确认无此用法（bit-exact 368 通过暗示无触发） | 待确认 | 若存在同 id 异默认值用法需修 |
| R09 | 工具链 | vitest bench --outputJson 非 TTY 下 samples 为空 | ✅ 复现 | 已改用 perf-run --bench | CI bench 门禁挂 perf-run |
| R10 | 工具链 | cluster-prompt.sh UTF-8 locale 变量吞噬（$locator 后中文被吞） | ✅ 已修（${var} 花括号） | 已修 | 无 |

## 未处置清单（下轮必须处理或显式关闭）
- R02 cell-system.ts 新簇 · R03 getPorts(side) filter 横切簇 · R08 同 id 异默认值确认

## 批次 2 (2026-08-12, bk-node-placement + label-cell-system 并行)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R11 | cell | GridContainerCell 列宽**不做**对称（仅行高对称）——第一版误加对称被 cell-system BDD 捕获（x:70 vs 40）已修复 | ✅ 主线程复核 diff（minColumnWidthSum 无 symmetrical） | 已修 | BDD 对 cell 系统舍入差异有效拦截 |
| R12 | cell | 共享 ctx 前提：buildCellContext 只读图 + 三阶段消费顺序与 ELK 一致 → 每节点 2-3 次构建降为 1 次 | ✅ 主线程复核 withCtx 实现与原一致、早退安全、容器免数组等价 | 已采纳 | 残余风险：processNodeLabels 若改 label/port 状态会使 ctx 过期（368+4714+BDD 全绿未触发） |
| R13 | cell | placePortLabelsWithCtx 早退依赖 hasPortLabelCells 标志（无端口标签 cell 时扫描全 skip） | ✅ 早退等价（空操作循环） | 已采纳 | 无 |
| R14 | BK | 方向复用安全性：root/align/innerShift（aligner 全量）+ sink/shift（compactor 全量）+ su/od 重置 + y/innerShift 每方向独立 subarray → 无残留 | ✅ 主线程逐数组验证 | 已采纳 | 不变式：BK 数组每方向全量重写或独立视图 |
| R15 | BK | ClassNode/ClassEdge 复用池跨 4 方向回收；getOrCreateClassNode/addClassEdge 完整重置 | ✅ 主线程复核（classShift/indegree/outgoing/node + target/separation 全重置） | 已采纳 | 无 |
| R16 | BK | getEdge 单端点判定（source≠target 时数学等价）+ LNode.getConnectedEdges 顺序 = 端口序 × incoming+outgoing | ✅ 主线程验证一致；自环保留全量双端点 | 已采纳 | 平行边/反向边 BK 内部不触发 |
| R17 | BK | 剩余热点 getEdge 18% / horizontalCompaction 15% / verticalAlignment 10%——对齐边缓存可消 getEdge 但平行/反向边偏离 ELK | ⏳ 不建议采纳 | 记录 | 若做需豁免授权（偏离 ELK 语义） |
| R18 | BK | neighborhood-information.ts（buildFor/Pair 分配）不在 scope，若放行可进一步降 BK | ⏳ 待评估 | 待办 | 新簇候选 |
| R19 | BK | 模块级测量差异：单次 --phase 冷启动 -8.7% vs n=200 中位数 -22.5%（0.4-2.4ms 抖动, CV 26-60%） | ✅ 主线程复跑：端到端 large -9.2% | 已按 n=200 统计达标 | 模块级门禁需热循环测量 |
| R20 | BK | GGN_BK_DBG 方向复用下 sink 调试输出显示上一方向残留值（仅调试打印差异，不影响布局） | ✅ 仅 debug 路径 | 记录 | 无 |

## 批次 2 未处置清单
- R18 neighborhood-information 新簇 · R17 对齐边缓存（需 ELK 语义豁免） · R12 残余风险（processNodeLabels 改 label 状态使 ctx 过期——已全绿但需长期盯）

## 批次 3 (2026-08-12, p5-orthogonal-router + p2-network-simplex 并行)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R21 | P5 | cycle-detector: initialize 赋 mark 严格降序 → 逆序过滤 mark<0 ≡ 原 TreeSet mark 升序 | ✅ 主线程验证 segments[i].mark=-(i+1)，逆序遍历 = mark 升序 | 已采纳 | 无 |
| R22 | P5 | 空路由区早退 + 无依赖跳过断环：detectCycles/breakNonCriticalCycles 对无依赖图返回空且不消费 random | ✅ 主线程验证（maxSegments 空 → 不调 random.nextInt） | 已采纳 | 结构性早退，依赖「无依赖=零随机消耗」不变式 |
| R23 | P5 | FIFO 头指针队列等价 + portToEdgeSegmentMap.clear() 复用正确 | ✅ 主线程验证 | 已采纳 | 无 |
| R24 | P2 | cutvalue 容量够时复用不 fill(0)（非树边槽位残留）——读取点仅 edge.treeEdge 时 | ✅ 主线程验证 593 行条件，非树边残留无影响 | 已采纳 | 长期可加 fill(0) 防御 |
| R25 | P2 | unknownCutvalues swap-remove 不变式：列表仅读 length/[0]/indexOf，[0] 只在 length===1 时读（元素唯一） | ✅ 主线程验证 | 已采纳 | 顺序无关，swap-remove 安全 |
| R26 | P2 | prepare(graph) 跨连通分量复用 NetworkSimplex 实例；run 开头重置全部工作数组 | ✅ 主线程验证 206-296 行 | 已采纳 | 无 |
| R27 | P2 | nnode.ts getConnectedEdges 缓存数组违反 NEdgeTest fresh-array 契约（须返回新数组）已回退 | ✅ 主线程复核回退 | 已回退 | 契约：getConnectedEdges 必须返回新数组 |
| R28 | 测量 | 冷启动 --phase 模块值被 JIT 主导，模块级门禁用 warm n=200 中位数（R19 先例延续） | ✅ 端到端 --bench 30 确认不降 | 已按 warm 判定 | 模块级门禁统一用 warm 协议 |

## 批次 3 未处置清单
- R17 对齐边缓存（BK getEdge，需 ELK 语义豁免）· R18 neighborhood-information 新簇 · R03 getPorts(side)/getConnectedEdges 横切簇（R27 确认 getConnectedEdges 必须返回新数组，横切方案需保留此契约）


## 批次 4 (2026-08-12, xcut-ports-side 横切簇 — 对抗审阅驳回)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R29 | 对抗审阅 (Kepler/Archimedes) | xcut-ports-side 共享视图破坏快照语义：持有视图引用跨另一次同侧重查被原地重建改写（P1 契约脆弱性）；简报 O(1) 缓存降级为 O(n) 重扫 + 零分配，A/B 无可见提升（P2） | 双 reviewer 独立复跑：bit-exact 368 / fuzz 3000 序列 / 相关单测 248 / perf 不降全过；P1 用 fuzz 复现（held.length 被改写） | 驳回不合并（分支删除） | 无收益 + 引入潜伏契约风险；getPorts(side) 保持 filter 快照语义 |
| R30 | 审阅 (Archimedes) | 5 处 this.ports 原地改站点（north-south-port-preprocessor sort / sweep-copy length=0+push+sort / port-distributors sort / sort-by-input-model-processor sort / greedy 下标交换）——未来做 O(1) 分组缓存的失效点 | 已定位 | 记录 | 若重开横切簇须先收敛这些站点到 setter 通知 |
| R31 | 审阅 (Kepler) | counting.ts:496-501 私有 getPorts(node,side,topDown) 死代码返回共享视图（本提交引入外泄风险，已随驳回消失） | 已确认无调用方 | 记录 | 无 |
| R32 | 审阅 (Archimedes) | getPorts(UNDEFINED) 与 getPortSideView(UNDEFINED) 不一致（预存在，非本提交回归） | 父提交同条件复现 | 记录 | 生产无调用方传 UNDEFINED |
| R33 | 工具链 | CI bench 门禁 check-bench-regression.mjs 已补（对比 perf-run --bench 的 layout.mean/total.mean，默认 +10% 阈值，只拦变慢） | 正向（-33.8% 通过）+ 负向验证 | 已提交 | CI 回归门禁就绪 |
| R34 | 流程 | 批次 1-3 为主线程亲自审阅（非独立 reviewer）；批次 4 起按 skill 阶段 3 标准启用 2x adversarial reviewer | 双 reviewer 独立复跑 | 已采纳 | 后续批次统一对抗审阅 |

## 批次 4 未处置清单
- R30 若重开 getPorts(side) 横切须先收敛 5 处原地改站点 · R18 neighborhood-information 新簇 · R17 对齐边缓存（需 ELK 语义豁免）


## 批次 5 (2026-08-12, p3-sweep-r2 第二轮 — 对抗审阅通过)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R35 | Hume (implementer) + 对抗审阅 | included 判定 Uint8Array stamp 256 环绕误判（单布局 countCrossingsBetweenLayers 2940 次）→ 改 Uint32；对抗审阅指出 2^32 环绕同型坑 | 双 reviewer 独立 fuzz（15k 次调用 0 mismatch）；fix e7e2998 加 2^32 环绕防御（fill(0) 重置） | 已修 | 教训：Uint8/32 stamp 类优化必须核算调用次数上界 |
| R36 | 对抗审阅 (Boole/James) | latent 隐患（当前不可达）：hcc 谓词缓存仅按 port.id 键控永不失效（依赖边/层不变+单实例单布局）；scratchGroups 非重入；EMPTY_NODES 约定只读；includedSet 死代码哨兵语义失真 | 双 reviewer 核实当前不变式成立 | 登记 | 未来改计数器生命周期/改边换层需先加失效/reset |
| R37 | 对抗审阅 (James) | sweep-r2 模块级门禁未达（claim -12%，独立复测 -8%，< max(20%,3×CV)）；端到端 large -8.7% 有实收益 | 独立复跑：large layout 29.40 vs 32.20ms（-8.7%）；368/301 单测/40k fuzz 全过 | 合并（端到端收益 + 正确性全绿） | countCrossings 微优化近地板，再降需算法级改动（授权舍入差异评估） |


## 批次 6 (2026-08-12, bundle tree-shaking — 用户三大目标之一)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R38 | 主线程 | tree-shaking 落地：registry.ts + register-all.ts + elk-json 改 registry 分派 + layered 子入口。**根因**：shared/elkgraph-builder.ts 从 src/index.ts（完整入口）import 模型符号 → shared→index→public→api/index→register-all 循环链，导致全部非 layered 进包 | bun 完整 765KB vs layered 561KB（-26.6% raw / -27.8% gzip）；vite consumer 冒烟 mrtree/disco 实现代码 0 保留（仅算法 ID 字符串集合几字节）；bit-exact 368 / 对齐 362 / 696 0 失败全绿 | 已提交 61c7c3a | **新契约**：直接 import elk-json.ts 的调用方需显式 import register-all（否则非 layered 分派抛「未注册」） |
| R39 | 主线程 | 门禁/测试直连 elk-json 的 13 处（verify-* + 11 bdd/api 测试）已补 register-all import | 非 layered bdd 15/15 通过 | 已提交 | 后续新测试若用非 layered 需同样补 |
| R40 | 主线程 | bundle 仍 561KB raw minify，距 350KB 预算还有空间：133 处 process.env.GGN_* debug 分支可 define 掉（tsdown define）+ 子入口 exports 完善 | 待做 | 待办 | bundle 下一轮：define process.env + metafile 按模块定位剩余税 |


## 批次 7 (2026-08-12, bundle 瘦身 R40 — define debug 分支)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R41 | 主线程 | 61 个 GGN_* debug 分支 define 为 undefined + tsdown entry 加 layered | esbuild 量化：554KB → 530KB raw（-4.4%）/ 142KB → 135KB gzip；dist layered 可消费（layoutElkJson function）；GGN 残留 0 | 已提交 f53ebdf | 350KB 预算对 layered-only 内核过于激进（非 layered 已 drop，剩余 530KB raw / 135KB gzip 是 layered 本体）；建议预算调整为 ~550KB raw / 140KB gzip |
| R42 | 主线程 | bun build 的 --define 不支持 process.env.X 成员表达式（define 无效）——发布构建用 tsdown/rolldown define | 已验证（bun define 后 bundle 不变） | 记录 | 构建用 tsdown，bun 仅做开发/门禁 |


## 批次 8 (2026-08-12, R17 对齐边缓存 + dist 发布产物验证 + CI 门禁挂接)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R43 | 主线程 | R17 BK 对齐边缓存：getEdge 有向节点对 WeakMap 缓存。**前提验证**：bk-*.ts 无边增删/排序 → 边集合/顺序不变，缓存与 ELK getEdge 逐位一致，**无需 ELK 语义豁免**（子代理此前保守顾虑已排除） | bit-exact 368 / 对齐 362 / 端到端 large 29.85ms 不降；WeakMap 跨图安全 | 已提交 441abe1 | R17 从「需豁免」变为「可安全做」 |
| R44 | 主线程 | dist 发布产物验证（tree-shake + define 后）：完整入口 layered + mrtree（非 layered）均可用；layered 入口 layered 可用 + 非 layered 带子节点正确抛错；elk-json chunk 无 polyomino/mrtree 实现（tree-shake 在发布产物生效） | dist 冒烟全过 | 已验证 | 发布产物 tree-shake 确认生效 |
| R45 | 主线程 | CI bench 门禁挂接：package.json check:bench script | 已加 | 已提交 | CI 可跑 bench 回归门禁 |

## 批次 9 (2026-08-13, tsdown minify + R37 授权方案评估)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R46 | 主线程 | tsdown 发布产物未 minify（dist 3.2M 含注释）→ minify:true，dist 1.6M，layered 核心 chunk 508KB raw / 125KB gzip | dist 冒烟通过（layered 入口 disco 正确抛错 + layered OK） | 已提交 267ff91 | 发布产物达发布态 |
| R47 | 主线程 | R37 sweep 算法级改动授权方案评估（不改代码）：countCrossings 逐阶段 collect 28.8% / rightIndex 18.6% / corners 14.5% / southSeq 11.5%。算法级候选：①corners 排序改基数/桶排序（改比较器语义→舍入差异）；②collect 超边收集改 port 预分组（改遍历序→舍入差异）；③rightIndex 改预计算索引（改查询序→可能等价）。三者均需「接受舍入差异 + triage-registry 豁免登记」授权 | 评估结论：舍入差异量级待实施时量化；需用户授权后再做 | ✅ 用户已授权 R37 | 见 R48 |

## 批次 10 (2026-08-13, R37 授权实施 — 位级等价优先，无不一致)

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R48 | 主线程 | R37 授权后实施，先做「位级等价」子集（免豁免登记）：①`countCrossings` collect 合并的 `hyperedgeSet.splice(indexOf)` O(n²) → Map 索引 + swap-remove O(1)（论证：`nextHash` 在创建时分配且唯一 → `compareHyperedges` 无并列 → 排序结果与插入顺序无关，位级等价）；②右层北侧计数 `node.getPorts()` 提变量；③`findViolatedConstraint` 的 `groups.indexOf` O(n) → 身份 Map 预建索引 + `group.getBarycenter` 提循环外 | bit-exact 368/368 不降（全等 337 不变）、对齐 362/368、696 回归 0、3662 单测全过 | 已合（待 commit） | ①③（corners 桶排序 / collect 预分组）若继续需真实舍入差异 + 豁免；实测 ptolemy large 收益 <2%，建议先量化更重的图再决定 |

| R49 | 主线程 | 工具链门禁修复（三处）：①发布构建 `tsdown` 漏 define 5 个 `process.env.X`（GGN_P3_DBG/EP_DBG2/LDR2/SL_DBG2/IPP_DEBUG）→ dist 残留浏览器 ReferenceError 风险 + 死码，补齐后 dist 0 个 process.env 引用、core 508→505KB raw；②`check:bench` 之前缺 `--current` 直接 usage error、`perf-run --out` 写绝对路径必崩 → 新增 `bench-gate.mjs` 一站式三规模对比（实测 small -26.5%/medium -33%/large -33.2%）；③全量 typecheck 之前依赖 dist（`@ggn/elk-layout/options` 自引用）→ 加 `customConditions:["development"]` 自包含（dist 移走仍 0 错误） | 三条门禁各自复跑通过 | 已提交 008ccc6/0edc621/1d4e278/db74415 | 后续新增调试开关漏 define / 回归 / 未构建 typecheck 均会被拦截 |

## 批次 11 (2026-09-12/13, 非 layered 性能黑洞 — 4 簇并行 worktree)

> 起因：`perf-run`/`compare-elkjs-perf`/`check:bench` 此前**只覆盖 layered**，13 个非 layered 算法零性能数据。
> 首次量化即发现 sporeoverlap 500 节点 4.2s、disco 200 节点 2.3s、mrtree 5000 节点 1.66s（均 ~O(n²)）。
> 4 簇并行（wt/spore、wt/opt-disco、wt/opt-mrtree、wt/perfgate），主线程合入后**独立复跑**全部门禁。

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R50 | Euler (spore 簇) | sporeoverlap 500 节点 4.2s → 0.49s（**-86~88%**）。三处根因：① `naive-minst` 每轮重建 `TEdge.key()/vkey()` 字符串键 + 每轮全表扫边 O(E·V) → 去掉字符串键 + 按 `(weight, 稳定序)` 最小堆 Prim O(E log E)；② `java-hash-set` 的 `javaDoubleHash` 用 BigInt → `DataView.getUint32` 高低位异或（hash 逐值相等，含 NaN/-0/±Inf 共 100010 例验证）；③ `bowyer-watson` 生成器 → `JavaHashSet.forEach` 同序遍历快路径。附带 sporecompaction **-25.7%** | 74 组合成输入改动前后输出 SHA-256 **全等**；BDD 10/10；typecheck 0；主线程复测 500 节点中位 491ms（单次偶有 918ms 离群，CV 高但中位稳定） | 已合（46e6e330） | 剩余：BowyerWatson 逐顶点全量三角形扫描仍是概率 O(n²)；本轮不动（退出条件已满足，激进改法易破逐位等价） |
| R51 | Heisenberg (disco 簇) | disco 200 节点 2.39s → 0.30s（**-87%**）。根因：polyomino 网格逐格 BigInt 移位/转换（profile ~29% 样本）→ 每个 Java 64-bit word 拆两个 `Uint32Array` lane（bit 2x=blocked / 2x+1=weakly blocked 语义不变） | profile `retrieve` ~59% + BigInt ~29% = ~88%；BDD 6/6；typecheck 0；33360 次状态读写与参考模型全等；主线程复测 200 节点 304ms | 已合（8ed57ead） | **渐进复杂度仍 ~O(n²)**（N 翻倍仍 ×3.7），本轮只消常数；剩余热点 `intersectsWithCenterBased` / successor 迭代 / Set 分配 |
| R52 | Anscombe (mrtree 簇) | mrtree 5000 节点 1.66s → 0.035s（**-97%**）。三处全表扫描（profile 合计 71.7%）：① `transformEdges` 每条边线性扫容器 children O(E·V) → 预建 id/端口索引（保留"首个匹配"语义）；② `getAllIncoming/OutgoingEdges` 每节点扫 `graph.edges` O(V·E) → 邻接表 **+ `P_REMOVABLE_EDGES` 补集**（关键：treeify 摘下的破环边仍在 `graph.edges` 却已从邻接表移除，纯邻接表不等价 —— 第一版因此 BDD 失败）；③ 层处理器 `concat` → `push` | profile 改动后无超线性热点；BDD 4/4；typecheck 0；18 个 fixture（端口引用/点号 id 冲突/多分量/多级边/四方向/四种 weighting）逐字段全等；主线程复测 5000 节点 34.6ms（-98%） | 已合（fe7e0acd） | **不是移植引入**：实测 elkjs 0.12.0 同输入 5000 节点 907ms、同样 ~n^1.8-2 —— 这两处全表扫描是 ELK MrTree 原版固有成本。本次白盒等价改写**直接超过上游 ~26×** |
| R53 | Rawls (perfgate 簇) | 非 layered 纳入门禁：`bench-gate.mjs` 在 layered 三规模后追加 `perf-nonlayered --quick`，一条 `bun run check:bench` 覆盖两族；判定沿用"只拦变慢"（+10% 且绝对增量下限，layered 0.5ms / 非 layered 40ms，后者按共享主机跨进程噪声上界定）。`check-bench-regression.mjs` 支持非 layered 数组格式 + 校验算法覆盖集/参数不一致 | `check:bench` 连跑两次全绿（约 13.4s）；**负向验证**：人为调小 disco 基线 → 门禁 exit 1（+72.7%），恢复后基线 SHA-256 与原件一致；typecheck 0 | 已合（5af7da9e） | `bench-results/` 被 .gitignore，基线文件须 `git add -f`；layered 三基线仍需环境/CI 预置 |

**批次 11 合并后主线程独立复跑**（非采信子代理自报）：
bit-exact 368/368 不变（全等 337 不变）· 对齐 362/368 · 696 回归 PASS · 全量单测 **4803 passed / 18 skipped** · `bunx tsc --noEmit` 0 · `bun run check:bench` layered large -22.0% + 非 layered 13/13 通过。

**未处置**：① spore/disco 的渐进复杂度仍是 O(n²)（本轮只消常数）；② 非 layered 的 stress/force 尚未与 ELK 原版对照（可能同为固有成本）；③ perfgate 用的 CPU 时间下限 40ms 对亚毫秒算法只能拦灾难性回归。

## 批次 12 (2026-09-13, layered 深挖：图构建 + P3 sweep + 热读取 + bundle 否决)

> 起因：用户指出「Java 移植 vs JS 语言机制差」在数据结构层可能同时吃性能和 bundle。
> 4 簇并行（wt/opt-build、wt/opt-p3count、wt/opt-hotreads、wt/opt-bundle），主线程合入后独立复跑门禁。
> **过程教训**：① worktree 缺 gitignored 的 `scripts/elk-java-debug/{lib,out-edge}`（ELK jar）→ `verify-bit-exact` ENOENT，已补软链并写进 SSOT；② 我把 `src/p3order/**` 与 `forster-constraint-resolver.ts` 同时划给两个簇 → 合并冲突，最后取 p3count 版（见 R57）。

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R54 | Pauli (p3count 簇) | P3 排序热路径降 **-24.3%**（`--phase` P3 中位 51.07 → 38.67ms；端到端 large mean 30.95 → 25.72ms）。10 文件：`countCrossings` 复用 hyperedgeSet/typed scratch + 去身份 Map + generation 映射 + 合并左层索引与超边收集 + 树按原路径回减；`CrossingsCounter` 内联 BIT/端口查询去临时数组；Forster 组下标 + barycenter 快照替换 Map/indexOf/spread；port-distributors 单节点端口数组只取一次 + 复用 comparator；`initInitializables` 能力位跳过空实现；`SweepCopy` 预分配 + slice | 官方 `verify-bit-exact` **368/368 全等 337 不变**；P3 定向 Vitest 333 通过；typecheck 0 | 已合（cfad6413） | **未做算法级重写**（ORDERED 红线）；R47 列的 corners 桶排序 / collect 预分组仍需舍入差异授权 |
| R55 | Archimedes (build 簇) | 图构建三处全表反查 → 预建索引：`nodes.indexOf` → `nodeIndexById`；每节点 `Object.entries(HIERARCHY).find(...kids.includes(i))` → `Int32Array` 父索引；`buildHierarchy` 同。large build.mean 4.28 → 1.91ms（**-55.4%**），交错 A/B −56.2%。**建图插入顺序逐项保持**（节点按 nodes 序、父按 `Object.keys(HIERARCHY)` 序并保留 `.find()` 首次命中语义、边按原序） | 368 模型结构指纹（节点/端口/边端点/各容器插入序）HEAD 与优化版**完全一致**（`cef983af…`）；官方 bit-exact **368/368 全等 337 不变**；该簇一度因 worktree 缺 jar 只能用 Maven 重建 harness，补软链后已在主线程复跑官方门禁确认 | 已合（38b4ef49） | 这是典型「Java 带父图引用递归下行 vs 移植后拍平 + 反向查找」差价；超线性已消除 |
| R56 | Hilbert (hotreads 簇) | 热读取两文件自耗时 **-25.7%**（受控 CPU profile 5+5 轮中位 136ms → 101ms；占全采样 12.44% → 8.75%）。`properties.ts` 把热内部 `Property` 提前注册 slot、`getProperty` 内联 `fastGet`、`copyProperties` 直接复制同槽位；Forster 去掉每轮 Map/active 分配改批次戳 + 复用队列，barycenter 只缓存 stage 内数值快照 | 官方 `verify-bit-exact` **368/368 全等 337 不变**；`tests/unit`+`tests/core` 186 文件通过；typecheck 0 | **部分合并**（7a56330d 的 `properties.ts` 已合；其 `forster-constraint-resolver.ts` 因与 R54 冲突被 p3count 版覆盖） | 未引入共享可变视图（R29 前车之鉴）；模块级 `--phase` 端到端仅 -1.1%（两文件占比 12-14%，属噪声内） |
| R57 | Russell (bundle 簇) + 主线程 | **否决议题，零改动**（量化结论）：dist core chunk 506,686 raw 中本 scope 只有 `shared/opt-map.ts` 17,110 字节 —— **整块删掉也只有 3.38%，5% 阈值在本 scope 内数学上不可达**；`specs.ts`/`layered-options.ts` 在 tsdown 代码分割下进的是 algorithms chunk。唯一能达标的紧凑编码：core −2.09%，但**冷 import 从 27.1ms 退化到 38.5ms**（用运行时成本换字节，违反约束） | 官方 bit-exact 368/368（确认回退干净）；`git diff --exit-code` scope 无残留 | 不合并（实验已回退） | 要真降 bundle 需换靶子（`src/intermediate` 占 31.6%、p3order 10%），且要连带看冷启动 —— 单独立项 |
| R58 | 主线程 | **流程教训**：簇 scope 出现重叠（`src/p3order/**` 包含 `forster-constraint-resolver.ts`，同时又被 hotreads 簇认领）导致 7 处合并冲突。处置：不手工拼两版（会把两个各自验证过的改动混成未验证版本），取 p3count 整体版；hotreads 该文件的工作作废 | 合并后全量门禁复跑通过 | 记录 | 派发前必须先做 scope 交集检查（`src/<dir>/**` 与具体文件的归属只能给一个簇） |

**批次 12 合并后主线程独立复跑**：
bit-exact 368/368（全等 337 不变）· 对齐 362/368 · 696 回归 PASS · 全量单测 **4803 passed / 18 skipped** · typecheck 0 · `check:bench` layered **-30.9% / -35.0% / -43.7%** + 非 layered 13/13。
`perf-run --bench 20` 主线程复测：build **小 0.17 / 中 0.59(-39%) / 大 1.88(-58%)** ms，total **2.51 / 6.43(-12%) / 31.39(-21%)** ms。

**未处置**：① bundle 线未推进（R57 否决，需换靶子）；② `src/intermediate`（占 bundle 31.6%）与 `graph/lnode.ts` 的 `getPorts(side)` filter 分配（批次 4 驳回区）均未动；③ P3 算法级候选仍待舍入差异授权。

## 批次 13 (2026-09-13, 数值门禁政策放宽 — 用户授权)

> 用户授权：把「逐位全等 337」放宽成 **「结构全等 + 数值在界内」**，让「改浮点运算顺序」的优化不必每次走豁免登记。
> 实现落在 `scripts/verify-bit-exact.mjs`（文件名是历史名，严格模式用 `--strict`）+ `triage-registry.json.numericBudget`。
> 前提讨论见同对话：如何区分「真差异」与「浮点自身的差异」→ 确定性 / 结构 / 归因三层。

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R59 | 主线程（用户授权） | **门禁放宽为「结构全等 + 数值在界内」**（原则：可核对 / 不过度防御）：① **结构硬线**（不看预算）＝ 节点集合（含层级归属）+ 每节点端口 id 集合 + 边端点集合 + 每条边各段点数**多重集**；任一不同即失败。② **非有限值**（NaN/±Inf）必失败。③ **数值预算**：每模型 `limitMaxUlp/limitMaxAbs` 优先，否则回落全局 `numericBudget {maxUlp:1e6, maxAbsRelative:1e-9}`（相对量按图包围盒对角线缩放）。④ **不比输出顺序**——实测 children 顺序两边本就不同（`NA,NB,NC,NF,ND,NE` vs `…,ND,NE,NF`）而坐标全等；平行边段顺序亦不同（`[2,6]` vs `[6,2]`）。⑤ 新增 `--strict`（旧政策，二分用）、`--determinism`（同模型跑两次须逐位一致，排除 scratch 未重置这类状态泄漏）、`--selftest`（负向自检，不依赖 Java） | 默认 368/368（337 全等 + 21 豁免 + 5 复刻 + 5 跳过，0 预算内）；`--strict` 368/368；`--determinism` 368/368；`--selftest` 5/5；`verify-elkg-java-layout` 362/368 不降 | 已实现（待 commit） | 后续「改运算顺序」的簇（如 R47 的 corners 桶排序 / collect 预分组）可不必先申请豁免，直接按预算判定 |
| R60 | 主线程 | **实现期抓到两个自己写错的判据**（都是"新检查与已知全等集矛盾"暴露的）：① **平行边段序** 误判为结构差异（ggn `[2,6]` vs java `[6,2]`，集合相同）→ `sectionCounts` 改多重集比较；② **ULP 在 0 附近爆炸**——纯按 \|x\| 取 ULP 时 `ulpOf(0)=Number.MIN_VALUE`，一点扰动即 4.5e15 ULP，预算判定失去意义 → `ulpOf` 加尺度下限（包围盒对角线 × 1e-6）。下限只让近零处比值变小，因此不会误伤 exemptA 的 `limitMaxUlp=8` | 修正后默认/严格/确定性三档全绿；自检的「1 ULP 必须放行」从 ❌(4.5e15) 变 ✅(5.24e5) | 已修 | 教训：改判据后先拿「已知全等集」当 oracle 跑一遍，矛盾处多半是新判据的 bug |
| R61 | 主线程 | **真实数据负向验证**（自检是合成数据，不足以证明门禁在真实链路上活着）：① 把 `hierarchicalLayoutMixing` 的 `limitMaxAbs` 从 1e-5 收紧到 1e-7 → exit 1，`[overBudget] maxAbs=7.38e-06 limitAbs=1e-7 budget=model`；② 给 `structureOf` 注入「丢首个子节点」→ **103 个 `[structural]` 失败**、exit 1。两次均恢复即绿 | 见左 | 已验证 | 门禁的「仍拦得住真错」有实测证据，不是仅靠合成自检 |

## 批次 14 (2026-09-13, P3 深挖 — 首次在放宽后的门禁下改运算顺序)

> 用户已授权「结构全等 + 数值在界内」（批次 13）。本批三簇**首次真的改动了浮点运算顺序**并合入。
> 3 簇并行（wt/opt-p3count2、wt/opt-p3order2、wt/opt-graphviews），主线程合入后跑全量。

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R62 | Hubble (p3count2) + 返修 | P3 计数核心重写：① 按左层**缓存超边连通分量**（避免每轮重建超边，图中超边中位 5 / 最大 15）；② 用等价的 **O(k²) 逐对公式**替掉三次排序 + south-sequence compression + Fenwick 扫描 + 两次 corners sweep；③ `counting.ts` 按 port.id 缓存 `others`/层内对端/层间度数。**首版有真回归**（见 R65）：`Map<number>` 按 `Layer.id` 缓存超边组，而**`Layer.id` 恒为 0** → 不同层串味，RIGHT 方向碰巧不暴露、DOWN/UP 全错（EdgeRoutingE2E 0/20、carTracking 节点差 325、701_portLabels N0 y 差 1464，共 10 个单测挂）。返修：改 `WeakMap<Layer, …>` 按对象身份；并回退收益小风险大的 North/South target/degree 缓存 | 三个回归文件 **949/949**；数值门禁 368/368（结构 0 差异、预算外 0）+ `--determinism` 通过；typecheck 0；定向 115。**收益保留**：P3 `--phase large` -15.8%、端到端 layout -12.6%、warm 200 轮 -9.2% | 已合（4a861cdf + 40dac036） | 首次真正在放宽门禁下改运算顺序 |
| R63 | Maxwell (p3order2) | P3 启发式：barycenter 热路径改**层状态数组直读**（去 WeakMap 查询）；P3 初始化构建**方向邻接**（同层存 node.id / 跨层存 -(portId+1)），`calculateBarycenter` 只扫整数数组；visited 改 generation（免每 sweep 全量清零）；`BARYCENTER_ASSOCIATES`/SEPARATE_CHILDREN 构造期一次索引；`fillInUnknownBarycenters` 预计算下一个已定义重心（消除 preOrdered 分支潜在 O(n²)）；port rank 缓存端口方向/度数（缺失时回退原 getter，兼容绕过 `initAtPortLevel` 的单测）；调试 env 在入口缓存（免逐节点读 `process.env`） | 本簇函数定向微基准 **-47.6%**（barycenter -57.5% / port rank -27.9%）；CPU profile 目标文件样本 -20.5%；端到端 layout -5.1%；数值门禁 368/368 结构 0 差异 + `--determinism` 通过；定向 114 | 已合（f42dd976） | 邻接预计算固定了遍历顺序 → 改变了浮点求和顺序，门禁按新政策放行 |
| R64 | Euler (graphviews) | 图层 getter 去 `push(...spread)`：`getAllNodes`/`getOutgoingEdges`/`getIncomingEdges` 改**预分配 + 下标填充**。单 getter 独立 A/B：getOutgoingEdges **-64.9%**、getIncomingEdges **-65.7%**、getAllNodes **-76.3%**。**但端到端只 -4.04%，未达 20% 门槛**（这些 getter 总占比本就 ~4.5%）—— 如实报未达标 | 端到端 total -4.04%；数值门禁 368/368 + `--determinism` 通过；typecheck 0；**fuzz 4000 次随机操作**（16 万次侧查询 / 4 万次边查询 / 118 次原地端口重排）验证 fresh-array 契约与 held snapshot 不被改写 | 已合（32b22666，收益低于阈值但端到端正向且零契约风险） | **重要否定结论**：试过「版本号 + 常驻缓存」那套（Java 集合视图思路），实测**反而更慢**（getAllNodes +10.4%、O(1) 修订号缓存 +7.37%，去 `Object.freeze` 后仍 +3.41%）—— JSC 下常驻数组+冻结的成本高于短命数组分配。**这个方向别再试** |
| R65 | 主线程（全量单测暴露） | **368 数值门禁的盲区**：模型集显式排除 `realworld/`，且不覆盖 `EdgeRoutingE2ETest` 那套 jar 边路由 oracle（ε=2，含 DOWN/UP 弯点）。R62 首版因此「368/368 全绿但 10 个单测挂」。根因链：`Layer.id` 恒为 0 → 按层 id 缓存串味 → RIGHT 不暴露、DOWN/UP 全错 | 在 base 与各 merge 点上二分确认 10 个失败全部来自 p3count2 首版；修复后三个文件 949/949 | 已记录；**三个回归文件已列为必跑门禁**（写进 optimization.md 基线与陷阱清单） | 教训：**门禁的覆盖面 ≠ 门禁的严格度**。批次 13 放宽了严格度，但覆盖面这个洞一直在，靠主线程跑全量单测才暴露 |

**批次 14 合并后主线程独立复跑**：数值门禁 368/368（结构 0 差异、预算外 0）· `--determinism` 通过 · `--selftest` 通过 · 对齐 362/368 · 696 回归 PASS · **三个回归文件 949/949** · 全量单测 **4803 passed / 18 skipped** · typecheck 0 · `check:bench` 三档 **-40.4% / -38.1% / -52.0%**（对存储基线，累计）。
`--phase --scale large`：layout 79.40ms，**sweep 占比 50.1% → 43.4%**；`--bench 30` layout mean **23.86ms**（批次 12 前为 33.79ms，**-29.4%**）。

**未处置**：① `getPorts(side)`/`getPortSideView` 仍未优化（R30 的原地改站点在 `GreedyPortDistributor`，需跨 scope 协调）；② sweep 仍占 43.4%，下一轮要动 countCrossings 之外的层（`sort` 与 `getProperty` 的调用点）；③ bundle 线未推进。

## 批次 15 (2026-09-13, bundle 线收口 — 决定不修)

> 用户问「主要用 layered，能不能用现代工具找优化空间」。跑了 V8 coverage / rolldown metafile / knip / ts-prune，
> 结论是**有一块明确空间，但用户决定保持现状**。本条目记录数据与决定，避免以后重复论证。

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R66 | 主线程（用户决策：保持现状） | **入口/注册重构不做**（量化后的空间是 68,457 字节）。① **现状**：`@ggn/layout` 发布 6 个入口（`.` / `./api` / `./layered` / `./core` / `./options` / `./layout-worker`）；全仓唯一消费者是 `kernel/src/layout/elk-service.ts`，用的是**最大的根入口**；`./layered` 子入口**零调用方** —— R38 那次「765KB→561KB」的 tree-shaking 成果现实中没被用上。② **不能简单换入口**：kernel 支持节点级算法分派（group 可声明 box/force/radial/mrtree/stress/rectpacking/topdownpacking 走黑盒分支），换 layered-only 会抛「未注册」。③ **可做的空间**：让 kernel 显式注册它需要的 8 个算法，排除 **disco 33,365B + vertiflex 14,416B + spore 20,676B = 68,457B**（这是「我们的产品不需要」而非「破坏 ELK 1:1」）。④ **决定：不做** | 数据来自 V8 coverage + rolldown metafile（完整入口 780,444B 口径）；knip 87 条未使用导出、44 个未引用文件（全在 scripts/demo/examples，不进包） | 决定不修（留痕） | 若将来 kernel 产物尺寸成为瓶颈再启用；届时必须配「声明式算法清单 + 覆盖测试」门禁（R38 的 register-all 契约坑） |
| R67 | 主线程 | **本轮用到的三个工具及其口径**（供以后复用）：① **V8 coverage**（`NODE_V8_COVERAGE=… node --import tsx scripts/perf-run.mjs …`，注意源码用 `.js` 后缀 import `.ts`，node 原生跑不通、必须走 tsx）：默认路径只执行 `src/**` **39.3%** 的函数；layered 入口内 **<15% 覆盖率且 ≥3KB 的模块 = 70,065B（12.1%）**、**<35% = 245,614B（42.3%）**。② **rolldown/tsdown metafile**：字节归因；**不要用 `bun build` 口径**（不加 define 会留下全部 debug 分支，同入口 581KB vs 510KB 差 12%）。③ **knip**：找未引用文件/导出，但对 bundle 的直接帮助有限（未引用文件全在 scripts/demo/examples；未使用导出多在非 layered 算法目录，那些已 tree-shake 到独立 chunk） | 见 R66 | 记录 | 结论：**能减字节的是「可达性」，不是「文件大小」** —— 分布平坦时按字节排序看不出东西 |
| R68 | 主线程 | **bundle 字节门禁落地**（批次 15 唯一产出）：`bun run check:bundle` = tsdown + `scripts/check-bundle-budget.mjs`，度量 core/api/algorithms/total 的 raw+gzip，超「基线×(1+2%) 且 >2048B」即失败。基线 `bench-results/baseline-bundle.json`（目录被 gitignore，`git add -f`）。负向验证：注入 12,451B 死代码 → `core +2.44%` → exit 1；恢复即绿。**背景**：批次 14 的性能优化把 core 从 506,686 撑到 510,167（+3.5KB）没人拦 | 门禁正/负向均验证 | 已合（e6cd588b） | 性能改动「跑得更快、包更大」以后会被拦 |

## 批次 16 (2026-10-11, 拆仓发布 — 发布边界收口)

> 把本包从 ggn monorepo 拆成独立仓库 `ggn-layout` 并发布 npm 时暴露的**消费者侧**缺陷。
> monorepo 内自引用从没走过真实消费者解析路径，所以一直没暴露。

| id | 来源 | 备注摘要 | 验证结果 | 处置 | 计划影响 |
|---|---|---|---|---|---|
| R69 | 主线程（拆仓发布暴露） | **`exports` 的 `development` 条件向消费者泄漏不可解析的源码**。原设计（R49）用 `customConditions:["development"]` 让本包自引用 `ggn-layout/*` 指向 `src/**`，以免 typecheck 依赖 `dist` 先存在。但 `development` 是 **Vite/esbuild 等 bundler 默认注入的条件** —— 任何 Vite 消费者在 dev 模式都会命中该分支：① `files` 不含 `src` → 直接解析失败；② 即便打包 `src`，`src/**` 用 `.js` 说明符跨目录引用仓库根的 `shared/`（同样不在包内）→ 仍失败。**修复**：从 `exports` 六个入口移除 `development` 条件（消费者只应看到 `dist`），改用 **tsconfig `paths` + vitest `resolve.alias`** 在包内把自引用解析到 `src`（保持「未构建 dist 也能 typecheck/测试」的原性质）。`files` 恢复为不含裸 `src`（保留 `src/api/layout-input.schema.json` 这一机器可读契约文件） | 移走 `dist` 后 `bun run typecheck` 0 错误；`tests/contract/api-subpaths.test.ts` 4/4 通过；`bun run build` OK；`bun run test:ci` **245 passed / 4 skipped，3780 passed / 7 skipped**；消费者安装 tarball 后 ESM 根入口 / `./api` / `./core` / `./layered` / `./options` + CJS `require` 全部冒烟通过；`node --conditions=development` 复测解析落回 `dist/**` | 已合（拆分仓提交） | 教训：**自引用的解析路径 ≠ 消费者的解析路径**。凡进 `exports` 的条件/路径，必须按「真实消费者 + 默认条件集」验证，不能只在包内自引用自测 |

| R70 | 主线程（npm registry 发布前审计：publint + @arethetypeswrong/cli） | **双包（ESM+CJS）下 `require` 条件拿到 ESM 类型**。`exports` 六个入口原先是扁平 `{ types, import, require }`，`types` 落在条件之外 → 对 `require` 解析同样命中 `dist/*.d.ts`（在 `"type": "module"` 下即 ESM 声明），`moduleResolution: node16/nodenext` 的 CJS 消费方会得到「Masquerading as ESM / FalseESM」；而 dist 里已生成的 `.d.cts` 完全没被引用。**修复**：把 `types` 下沉进 `import`/`require` 两个条件（`import`→`.d.ts`，`require`→`.d.cts`），`default` 并入同层；顺带补 `"./package.json"` 与 `"./layout-input.schema.json"` 子路径导出（后者原先随 `files` 进包却因 `exports` 白名单不可达），把只被 `scripts/vis.mjs` 使用的 `cac` 从 `dependencies` 移到 `devDependencies`（dist 产物对裸包零 import，消费者不该被拖入运行时依赖），并显式声明 `sideEffects` 白名单（仅 `layout-worker` 有自注册副作用，其余入口纯导出） | `publint` **All good!**；`@arethetypeswrong/cli --pack .` 六个入口 `node16 (from CJS)` 由 👺 Masquerading as ESM 全部变为 🟢 (CJS)，`node16 (from ESM)` / `bundler` 🟢（子路径 `node10` 仍 💀 属已知取舍：exports-only 子路径 node10 本就不支持解析）；`bun run typecheck` 0 错误；`bun run build` OK；`bun run test:ci` **245 passed / 4 skipped，3780 passed / 7 skipped**；全新目录安装 tarball 后 ESM/CJS 六入口 + schema + package.json 冒烟全通过；消费者侧 `tsc --moduleResolution nodenext` 对 `.cts`(CJS) 与 `.mts`(ESM) 双份 typecheck 均 0 错误 | 已合（拆仓提交） | 教训：**「有 CJS 产物」≠「CJS 有正确类型」**。`exports` 中 `types` 必须与 `import`/`require` 同层成对声明；发布前用 `publint` + `@arethetypeswrong/cli` + 真实消费者 `tsc --moduleResolution nodenext` 三件套把关，包内测试与 ESM-only 冒烟测不出这类问题 |
