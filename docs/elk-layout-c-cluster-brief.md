# C 簇派发简报: 跨层级边 (hierarchy01)

> 状态: **已完成 (本簇)**。hierarchy01 全等, 布局侧差分 337→338/348 (剩余 8 为 Java 自身错误/非 layered)。
> 455 已随 A 簇 (472d971) 一并修复, 本簇修复 hierarchy01: resizeParentNode 将 canonical W-E 外部端口
> dummy 的 y 与 NORMAL 内容同步平移 (含 dummy 端口占位标签反向补偿), CompoundGraphPostprocessor 按
> 变换后侧判定"被平移过的 dummy"锚点改用 parentOffset (DOWN/UP 下 canonical W-E → 当前 N/S)。
> 本简报按协议 §3 编写: MODULES.tsv 行 / 模型清单+当前 diff / 根因线索 / Scope 边界 / 方法 / 退出条件。

## 0. MODULES.tsv 相关行 (动手前先查表)

| stage | java_class | ts_module | status |
|---|---|---|---|
| COMPOUND | CompoundGraphPreprocessor | src/compound/compound-graph-preprocessor.ts | 🟡 |
| COMPOUND | CompoundGraphPostprocessor | src/compound/compound-graph-postprocessor.ts | 🟡 |
| COMPOUND | CrossHierarchyEdge | src/compound/cross-hierarchy-edge.ts | 🟡 |
| COMPOUND | CrossHierarchyEdgeComparator | src/compound/cross-hierarchy-edge-comparator.ts | 🟡 |
| INT | HierarchicalPortOrthogonalEdgeRouter | src/intermediate/hierarchical-port-orthogonal-edge-router.ts | ✅ (B 簇已修 e9b87ae) |
| INT | HierarchicalPortConstraintProcessor | src/intermediate/hierarchical-port-constraint-processor.ts | 🟡 |
| INT | HierarchicalPortDummySizeProcessor | src/intermediate/hierarchical-port-dummy-size-processor.ts | 🟡 |
| INT | HierarchicalPortPositionProcessor | src/intermediate/hierarchical-port-position-processor.ts | 🟡 |
| INT | LongEdgeJoiner/Splitter | src/intermediate/long-edge-joiner.ts + long-edge-splitter.ts | ✅ |

## 1. 模型清单 + 当前 diff (verify-elkg-java-layout, 合并后主分支 337/348)

```
✗ tests/layered/edge_label_placement/hierarchy01.elkt  (唯一剩余, 边差异 1)
  edge ::NN1.N1_1.N1_1_1.Workflow->NN4.N4_1.Wiki
  ggn=[s32.000,56.000 b54.000,56.000 b54.000,23.000 b157.000,90.000 b174.000,90.000
       b300.000,90.000 b238.000,-50.333 b238.000,-94.333 b348.000,-94.333 b377.000,-82.333
       t454.000,46.000]
  jar=[s68.000,123.000 b90.000,123.000 b90.000,90.000 b310.000,90.000 b310.000,46.000
       t454.000,46.000]
  (ggn 起锚 s32,56 vs jar s68,123; ggn 负 y 绕行 -94.333, jar 干净正交)
e2e 注册表补充: hierarchy01 ×4 方向 (RIGHT/LEFT/UP/DOWN) 均 nodeDiffs=0、fails=4,
  reason="ggn 有 3 条边 jar 无同形匹配 (弯点数量/路径不同)" — 是纯边路由域, 不是节点位置.
```

## 2. 已探明根因线索 (前几轮调研)

1. **455 已修复 (A 簇 472d971)**: 根因 = 跨级边端点漏祖先偏移 + 段合并 reference 用错 (源图 vs
   挂载容器) → 修复 = getEdgeEndpoints 的 recursiveAnchorTo(LCA) + postprocessor reference=挂载
   容器图。**hierarchy01 与 455 同族但未随 A 修复** → 说明 hierarchy01 还差一层: 可能是
   NN1.N1_1.N1_1_1(源) 与 NN4.N4_1(目标) 的 LCA 更深/端口路径不同, 或层级外部端口 dummy
   尺寸/位置 (HierarchicalPortDummySizeProcessor/PositionProcessor)。
2. **696 harness 已通过 ≠ 布局差分通过**: 2026-08-07 补 `setPortOrderOnParentGraph` FIXED_ORDER
   后 hierarchy01 在 696 通过, 但 verify-elkg-java-layout 仍差 → 端点/端口 dummy 位置是根因。
3. **compound N-S 外部端口 dummy 位置族** (plans/elk-layout-verification.md):
   "ELK 北/南 dummy 在内容框外 y=-32/x 扩展, ggn 放在层内" — hierarchy01 的 N/S 端口 dummy
   沿边位置可能同源。
4. **ggn 负坐标绕行** b238,-94.333: 弯点穿越外部端口 dummy 区域/走错槽位 → 先对比
   A 修复后的 455 与 hierarchy01 的段合并路径差异 (455 已过, hierarchy01 未过 → diff 定位)。

## 3. Scope 边界

- **可碰**: packages/layout/src/compound/*, intermediate/hierarchical-port-*.ts,
  intermediate/long-edge-*.ts, intermediate/elk-graph-importer.ts, graph/lgraph-util.ts
  (仅跨级边相关函数), tests/bdd/compound-ports.scenarios.test.ts (可加场景)。
- **不可碰**: 自环簇文件 (intermediate/loops/*, cell-system.ts) 与压缩器 (compaction/oned/*)
  除非逐行证据; HPOER (B 刚修完 e9b87ae) 不动。
- **禁止**: git stash/reset/checkout -f/clean/rebase; 只允许 git add <具体文件> + git commit。

## 4. 方法

1. ast-grep outline 对比 Java 与 TS 的 compound 管线:
   Java: CompoundGraphPreprocessor/Postprocessor, CrossHierarchyEdge(+Comparator),
   p5edges/orthogonal (OrthogonalRoutingGenerator), hierarchical-port-*;
   TS 同路径文件逐符号 diff。
2. 用 Java 探针 (scripts/elk-java-debug/) 或 jar 输出比对中间状态 (若需要可加
   ContentImportProbe 式的日志, 只读)。
3. 修 → 补 BDD (不变量: 跨级边端点锚定正确、弯点落在正交轨道、无负坐标绕行、
   与 jar 弯点 1:1) → verify 两模型 → 全量 348 不降。

## 5. 退出条件 (机器可检查)

| 关卡 | 命令 | 标准 |
|---|---|---|
| 簇级 | `bun scripts/verify-elkg-java-layout.ts 'tests/layered/edge_label_placement/hierarchy01.elkt'` | 1/1 全等 |
| 全量 | `bun scripts/verify-elkg-java-layout.ts` | ≥ 337/348 且失败集不新增 |
| bdd | `bunx vitest run tests/bdd` | 全过 |
| oracle | `bunx vitest run tests/oracle/generated` | 全过 |
| 696 | `node scripts/diff-failures.mjs collect-all && check` | 0 失败 |

完成后回写 docs/MODULES.tsv 对应行状态 (COMPOUND 4 行 + hierarchical-port 行)。
