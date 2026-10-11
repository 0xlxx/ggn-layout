# layout 移植工作流（目标级指令）

> 本项目唯一使命：把 **ELK Java 0.12.0** 的 layered 算法 1:1 移植到 TypeScript。
> 本文是移植工作流的目标级约束，所有在本包工作的 agent（实现/审查/修复/验证）必须遵循。
> 完整标准见 `docs/PORTING.md`，详细进度与工单见 `PROGRESS.md`，方法论见 `docs/workflow.md`。

## 1. 铁律（违反 = 返工）

1. **移植不是重写**：src/ 类名、方法名、结构尽量与 ELK Java 一一对应，便于上游 diff 增量搬运。
2. **SSOT = ELK Java 0.12.0 jar**：所有坐标/结构对比以 jar 输出为 oracle；elkjs 仅交叉参考，不参与验收。
3. **测试当裁判**：先有"语言无关断言"（性质/不变量/坐标）再动代码；不 stub、不跳过、不假装绿。
4. **写的人不审，审的人不写**；审查者默认代码是错的，只看 diff，专找"语法相同语义不同"。
5. **出问题修流程，不手修单个代码**：同类错误要沉淀进陷阱表（PORTING.md §6）让机器不再犯。
6. **反模式**：「需要一大段注释解释 workaround 没问题」= 代码是错的，回去重写。

## 2. 角色编组（每个任务簇）

| 角色 | 人数 | 职责 |
|---|---|---|
| Implementer | 1 | 只写代码，不审 |
| Adversarial Reviewer | 2 | 独立上下文，只看 diff，假设代码是错的 |
| Fixer | 1 | 应用审查结论 |
| Verifier | 1 | 阶段 diff + 相关测试 + 696 无回归 |
| Test-Quality Reviewer | 1（共享） | 审测试是否冗余/是否覆盖算法性质 |

并行原则：失败簇之间无因果依赖才并行；各簇独立文件集；**禁止并发全量测试**。

## 3. 五步流程（Bun-in-Rust）

1. **出考卷**：每个模块先有语言无关断言（性质/不变量/坐标），再动代码。
2. **定规范**：PORTING.md + 陷阱表；新陷阱即时追加。
3. **试运行**：新模块先 1 写 + 2 审 + 1 修跑通，再铺开。
4. **全量执行/错误当工单**：失败按模块分组 → 各簇 1 写 2 审 1 修 1 验证；隔离防踩踏。
5. **验证**：阶段 diff → 696 无回归 → 全量 elk-java-unit 无新增 → 人工确认 → 合并。

## 4. 失败收敛五步闭环（每个失败必须走完才算收敛）

1. **定位阶段**：用阶段 diff（P1 断环 → P2 分层 → P3 排序 → P4 节点放置 → P5 边路由 → 后处理）
   回答"差异发生在哪个阶段"。
2. **归因陷阱**：对照 PORTING.md §6 陷阱表；不属于已知类 → 新增陷阱条目。
3. **对抗审查**：深水区（多模块交互/回归风险）必须配 1 个审查 agent。
4. **修复 + 验证矩阵**：按修复类型跑对应验证；全量无新增失败才可合并。
5. **沉淀**：更新陷阱表 + PROGRESS.md 工单（标记 closed）。

工单模板：
```markdown
## [日期] 工单 <name>: <一句话根因>
- 失败: <测试/图, 数量>
- 阶段: <P1-P5>
- 根因: <机制 + 证据>
- 修复: <函数/改法>
- 验证: <跑的验证 + 结果>
- 陷阱表: <新增/更新条目>
```

## 5. 验证矩阵（修复类型 → 必跑验证）

| 修复类型 | 必跑 |
|---|---|
| 管线/分层 (P1-P3) | NodePromotionTest + 全量 elk-java-unit + 696 |
| 边路由/端点 (P5) | BasicEdgeRouterTest + EdgeRoutingE2E |
| 尺寸/标签 (cell) | Issue682/905 + 全量 elk-java-unit |
| 图构建 (CGP/import) | 相关单测 + 696 collect-all + E2E |
| 任何修复 | 全量 elk-java-unit 无新增失败（对比基线） |

## 6. 验证命令速查

```bash
cd <本仓库根>
./node_modules/.bin/vitest run tests/elk-java-unit --testTimeout=120000        # 全量（~45s）
./node_modules/.bin/vitest run tests/elk-java-unit/IssueXXXXTest.test.ts      # 单个工单
node scripts/diff-failures.mjs collect-all /tmp/f.json && node scripts/diff-failures.mjs check /tmp/f.json  # 696 门禁
./node_modules/.bin/vitest run tests/elk-official/EdgeRoutingE2ETest.test.ts  # 边路由 E2E
bun scripts/stage-diff.mjs diff                                               # 阶段 diff (ggn vs jar)
```

## 7. 陷阱速查（详见 PORTING.md §6）

- 管线顺序：NodePromotion(70) 必须在 LayerConstraintPostprocessor(72) 之前，反了死循环。
- 层内边：同侧 (WEST-WEST/EAST-EAST)；异侧同层 = 图构建/分层异常信号。
- EXTERNAL_PORT dummy：根图不应有；子图有是 INCLUDE_CHILDREN 正常。
- 排序比较器：任一方无 MODEL_ORDER 时 return 0（稳定序），别把无 MO 当 0 参与排序。
- 遗留值污染：Java int[] 默认 0，TS 必须 `?? 0` 对齐，不能用 guard 硬跳过合法计数。
- 迭代/极值：`Math.max(...keys)` 大集合会栈溢出，用循环；keys 快照 vs 实时 size 注意。
- JS 语义：`%` 负数、Array.sort 稳定性、Map/Set 迭代序、splice 修改引用数组。
- 标签拷贝：CompoundGraphPostprocessor 需 copyLabelsBack 把段边标签拷回原边。
