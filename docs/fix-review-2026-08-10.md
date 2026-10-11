# 审阅报告：ELK layered 移植三轮修复 + all_four_port_sides 回归诊断

日期：2026-08-10
范围：只读审阅（未改动任何项目文件；所有临时补丁均已还原验证）
对照源：ELK Java 0.12.0（/Users/bjorn/ai-dev/tmp/elk，v0.12.0 tag 与 HEAD 对该三处文件无差异，已用真实 0.12.0 jar 跑 DebugMain 快照交叉验证）
验证命令：`bun x vitest run tests/oracle/generated --exclude '**/json_path_batch.test.ts' --reporter=dot`（P2 oracle）

## 结论速览

| 修复 | 文件 | Verdict | 依据 |
|---|---|---|---|
| 1 componentComponent | src/components/components-processor.ts:96 | ✅ 正确 | 与 SimpleRowGraphPlacer.java:79 一致 |
| 2 Spacings V/H swap | src/p4nodes/spacings.ts:83-111 | ✅ 正确 | 与 Spacings.java:62-124 逐项一致 |
| 3 per-node alignment | src/p5edges/layer-size-calculator.ts:62-81 | ✅ 正确，保留 | 与 LGraphUtil.java:233-253 一致；回归根因在别处 |

**all_four_port_sides 回归根因**：不是修复 3，而是 `src/intermediate/hierarchical-port-orthogonal-edge-router.ts:223` 的
`new OrthogonalRoutingGenerator(0)` —— edgeSpacing=0 使冲突阈值被禁用，N/S 外部端口槽数被低估（1 vs ELK 的 2），
修复 3 只是把该既有偏差"暴露"出来（修复前靠 span 交叉碰巧得到与 ELK 相同的槽数 2）。

**建议修复（一行）**：
```
// src/intermediate/hierarchical-port-orthogonal-edge-router.ts:223
const gen = new OrthogonalRoutingGenerator(layeredGraph.getProperty(SPACING_EDGE_EDGE))
// 对照 ELK HierarchicalPortOrthogonalEdgeRouter.java:522,547,570
```
实测：保留修复 3 + 上述一行后，all_four_port_sides 恢复通过（y=50/100/150，差 +0.5，eps=1）；
P2 oracle 全量 24 失败/664 通过 → 23 失败/665 通过，失败集合唯一差异即 all_four_port_sides（无新增回归）。

---

## 一、all_four_port_sides 回归：完整根因链（每步均有实测/快照证据）

### 1. 修复 3 对"全 AUTOMATIC"图不是 no-op —— 探针前提是错的
"该模型所有节点 alignment 都是 AUTOMATIC（已探针确认）" 不成立。compound 内部图中间层有 6 个
NORTH/SOUTH 外部端口 dummy，其 ALIGNMENT 被显式设为 `CENTER`：
- `src/intermediate/hierarchical-port-dummy-size-processor.ts:45`（对应 ELK HierarchicalPortDummySizeProcessor.java:119）
- `src/intermediate/hierarchical-port-constraint-processor.ts:148`（对应 ELK HPC）

ELK 0.12.0 jar 实测（DebugMain 快照 `28-Before_HierarchicalPortOrthogonalEdgeRouter`）：这些 dummy
确实 `align=CENTER`、被居中放置（x=142/132/122，size 0/20/40）。所以修复 3 行为与 ELK 一致。

### 2. 传导路径（修复后 vs 修复前）
1. P5 `placeNodesHorizontally` 居中 N/S 替换 dummy：x 110/110/110 → **130/120/110**（仅 x 变，y 不变）。
2. HOR Step2 `setNorthSouthDummyCoordinates` → `calculateNorthSouthDummyPositions` + `ensureUniquePositions`
   按替换 dummy 位置算原始 N/S dummy x（含 PORT_ANCHOR.x=4 与 spacing=10 的推挤）→ 变化。
3. HOR Step3 `countRoutingSlots`（`routeEdgesForDirection`，SOUTH_TO_NORTH/NORTH_TO_SOUTH，positionFn=绝对 x）
   按 X 区间算槽数：修复后 segments=[130-146],[120-128],[110-110] → **northSlots=1, southSlots=1**；
   修复前 segments=[110-110],[110-128],[110-146] → **2, 2**。
4. Step3：`northSlots>0 → offset.y += nodeSpacing+(slots-1)*edgeSpacing` → 修复后 +20、修复前 +30；
   Step5 `fixExternalPortCoordinates`：NORTH dummy y=-offset.y，SOUTH y=size.y+pad-offset.y
   → N/S dummy y -30/215（修复前）→ -20/205（修复后）。
5. 图 minY/offset 变 → 子节点最终 y 整体 -10：40/90/140 vs 50/100/150（ELK jar = 49.5/99.5/149.5）。
   x 全部不变（dx=0）——与"placeNodesHorizontally 只设 x"一致，y 是经 offset/size 的间接传导。

### 3. 为什么 ggn 与 ELK 槽数不同（真正 bug）
ELK：`new OrthogonalRoutingGenerator(RoutingDirection.SOUTH_TO_NORTH, edgeSpacing, ...)`
（HierarchicalPortOrthogonalEdgeRouter.java:547，edgeSpacing=SPACING_EDGE_EDGE，:522），
`conflictThreshold = 0.5 * edgeSpacing`（OrthogonalRoutingGenerator.java:72,134）= 5。
修复后居中区间 [120-128] 与 [130-146]：S2.out=128 与 S1.in=130 距离 2 < 5 → `countConflicts` 计 1 个
regular conflict → S2→S1 依赖 → S1.slot=1 → **2 槽**。

ggn：`countRoutingSlots` 里 `new OrthogonalRoutingGenerator(0)` → `conflictThreshold = 0` →
`countConflicts` 的 `pos1 > pos2 - 0 && pos1 < pos2 + 0` 恒 false（严格不等号）→ conflict 检测整体失效。
修复后区间不重叠且无 crossings → 无依赖 → **1 槽**。
修复前（未居中）区间 [110-110],[110-128],[110-146] 有 span 交叉 → `countCrossings` 不依赖阈值仍产生依赖 → 2 槽，
与 ELK 碰巧一致——这就是"修复 3 暴露既有偏差"的机制。

### 4. 验证
- 临时改 `:223` 为读 SPACING_EDGE_EDGE 后（保留修复 3）：探针 y=50/100/150（差 +0.5，通过）。
- P2 oracle：23 失败/665 通过；与基线失败集合 diff，唯一差异 = all_four_port_sides（已修复），无新增。

---

## 二、修复 1 复核（componentComponent）—— 正确
- `components-processor.ts:96` `componentSpacing = target.getProperty(SPACING_COMPONENT_COMPONENT)`
  = ELK SimpleRowGraphPlacer.java:79。
- 行排列（:143-160）`xpos/ypos/highestBox/broadestRow=componentSpacing`、换行 `ypos += highestBox + spacing`、
  `maxRowWidth = max(maxWidth, sqrt(totalArea)*aspectRatio)` 与 SimpleRowGraphPlacer.java:140-159 一致。
- 小观察（非本轮引入，可顺手改）：`layered-layout-provider.ts:1054` 的 `-COMPONENT_SPACING`（硬编码 20）
  对应 ELK ComponentGroupGraphPlacer.java:108 `target.getSize().x = offset.x - componentSpacing`（读属性）。
  仅在"SPACING_COMPONENT_COMPONENT 非默认 + inside-self-loop 纯外部端口嵌套图"角 case 有影响。

## 三、修复 2 复核（Spacings V/H swap）—— 正确
- `spacings.ts:83-111` 全部 diagVH/pairVH 与 ELK Spacings.java:62-124 逐项一致：
  NORMAL/LONG_EDGE/LABEL/BREAKING_POINT 的 vertical=非 BETWEEN_LAYERS 变体、horizontal=BETWEEN_LAYERS 变体；
  EXTERNAL_PORT-LABEL = V:LABEL_PORT_VERTICAL / H:LABEL_PORT_HORIZONTAL；LABEL diag = EDGE_EDGE/EDGE_EDGE。
- 单参数 pairV 项（NORMAL-NS_PORT/EXTERNAL_PORT、LONG_EDGE-NS_PORT/EXTERNAL_PORT、NS_PORT-LABEL 等）全部一致，
  无遗漏；NS_PORT diag = SPACING_EDGE_EDGE（ELK :96）一致。
- 受影响方核对：getVerticalSpacing/getHorizontalSpacing 调用方（bk-aligned-layout.ts:103,120、bk-compactor.ts:120、
  network-simplex-placer.ts:229,468,477、simple-node-placer.ts:22,37、compaction/oned/algs.ts:59,93）与
  getVerticalSpacingByType 调用方 InteractiveNodePlacer.ts:31,37 现在读到的属性均与 ELK 一致
  （如 NORMAL-NORMAL vertical 由错误的 NODE_NODE_BETWEEN_LAYERS 变为正确的 NODE_NODE），属预期变更，无意外副作用。
- ByType 变体 `graph.getProperty(layoutOption)` = ELK Spacings.getLocalSpacing(NodeType,NodeType)（:222-226）。

## 四、附加建议（一致性）
- `src/p5edges/polyline-edge-router.ts:233` 有一份**重复**的 placeNodesHorizontally 副本，未随修复 3 更新
  （注释仍写 "ggn 无 ALIGNMENT option"）。POLYLINE 路由下不 honor ALIGNMENT，与 ORTHOGONAL/SPLINES 不一致。
  建议与 layer-size-calculator.ts 版本合并/同步（POLYLINE 无现有失败，属一致性收尾）。
