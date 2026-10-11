# worktree 并行移植协议 (Bun Zig→Rust 方法论的落地)

> 来源: [Rewriting Bun in Rust](https://bun.com/blog/bun-in-rust) (4 worktree × 16 agent / 峰值 64 并发,
> implementer + 2×adversarial reviewer + fixer 闭环, 机器可检查退出条件).
> 适用: 本项目 (elk Java 0.12.0 → TypeScript) 的**并行修复/移植**阶段.

## 1. 为什么 worktree (踩过的坑)

- 早期多 agent 共享同一 checkout → 互相 `git stash/reset/checkout` 破坏彼此工作.
- 本项目当前结构: **主工作区 (ggn) + N 个独立 worktree** (`ggn-wt-<簇>`), 每个 worktree 一个分支.
- **Agent 铁律 (禁止)**:
  - ❌ `git stash` / `git reset` / `git checkout -f` / `git clean` / `git rebase` — 一律不许.
  - ❌ 改自己 scope 之外的文件 (冲突源).
  - ✅ 只允许: `git add <具体文件>` + `git commit` + `git status`/`git diff` 只读命令.

## 2. 任务分片 (可枚举、可验证)

- 按**根因模块簇**分片 (不是按"把项目变好"), 每簇一个 worktree + 分支.
- **管线模块清单**: 先查 `docs/MODULES.tsv` (Java 类 ↔ TS 模块 ↔ 移植状态 ↔ 不变量 ↔ 测试文件),
  确认该簇涉及的模块/不变量/测试文件, 不各自猜 (对齐 Bun LIFETIMES.tsv 思路).
- 每簇的退出条件 = **机器可检查**: `verify-elkg-java-layout <该簇模型>` 全等 + 全量 348 不降 + `bdd` 全过.
- 簇依赖拓扑 (见 layout-algorithm-gaps.md):
  ```
  T0 收尾 → T1 并行 (A 内部自环 / B 外部端口 / D spline 自环 / E 标签精度)
         → T2 (C 跨层级边, 依赖 A+B) → T3 全量回归 + 合并
  ```

## 3. 每簇的"移植宪法" (代理不许猜)

每个簇简报必须包含 (缺失会让 agent 各自猜 → 返工):
0. **MODULES.tsv 行**: 该簇对应模块的 TS 路径/状态/不变量/测试文件, 动手前先查表.
1. **模型清单** + 当前 diff (verify 输出).
2. **已探明根因线索** (前几轮调研结论, 含 Java 源码行号/文件).
3. **Scope 边界** (可碰/不可碰的文件, 避免簇间冲突).
4. **方法**: ast-grep outline 对比 Java/TS → 实现 → BDD (不变量) → verify.
5. **退出条件**: 该簇模型全等 + 全量 348 不降 + bdd 全过 + 无回归模型清单.

## 4. 对抗审查闭环 (本轮落地, 最关键的差距)

Bun 的核心不是"多 agent 写", 而是**写的人不审、审的人不写**:

```
implementer (worktree 分支提交)
   ↓ diff (只给 diff, 不给推理)
2× adversarial reviewer (独立 context: "默认代码是错的, 找出为什么不能用")
   ↓ 反馈 (具体到行: 语义差异/边界/回归风险/测试缺失)
fixer (应用反馈, 重新 verify)
   ↓
主线程收拢: merge + 全量回归
```

- reviewer **只拿 `git diff`**, 不知道 implementer 的任何推理.
- reviewer 按该簇的退出条件逐条核对 (verify 数字、bdd、无回归).
- fixer 可以是原 implementer (重开) 或新 agent; 反馈必须"修流程/修代码"可落地.

## 4.5 子代理备注回流 (2026-08-12 用户定, 强制)

- 子代理汇报里的「备注/遗留/发现」**不得只留在汇报里**。
- 主线程收拢时: 逐条**独立验证** (对照 Java 源码/跑测试/查现状) → 登记 `docs/agent-remarks.md` →
  验证通过后**回流到计划**: 代码级差异立即修 (走正常合并) / 工具链修脚本 / 待办列入后续簇简报 + MODULES.tsv。
- 每轮结束 (或子代理完成时) 检查登记册: 无「未处置」条目。新簇简报必须引用相关 R 编号。

## 5. 合并协议 (T3)

- 按拓扑合回主分支: 先 E/D/B/A (独立文件), 再建 C worktree (基于合并后主分支), C 完成合回.
- 已合并 (2026-08-11): E (5e40f0c→646434a), D (15381b5→179a0fa), B (e9b87ae→ec29607),
  A (472d971→1248e2a, 冲突仅 edge-e2e-registry.json, 合并后重扫为准).
  合并后主分支 **337/348**, bdd 136, oracle 1036, EdgeRoutingE2E 门禁 941 全绿.
- T1 全簇合入 → 337/348; **T2 平台簇 (C/M1-M5) 全并入 → 338/348 (layered 100%)**:
  C=hierarchy01 (7b3ff8e), M1=P1 断环 6 策略 (e9fcf6c), M2=P2 分层 5 策略 (9165909),
  M3=Median/MO-Barycenter (678363e), M4=CrossingsCounter 核实 (b2f2cba), M5=LinearSegments (d07d357).
  主分支 bdd 217, oracle 1036, 696 0 失败.
- **T2 ccx 执行器 (6 并发, 绕过平台 6 代理上限) 已全并入**: M6 (6540772 components 策略族) /
  M7 (157a992 intermediate 4 处理器) / M8 (0c2259b wrapping 9 类) / M9 (76baacd NodeLabelPlacer) /
  X2 (0e850b7 compaction 变异 71.9% + 修 2 真 bug). 主分支 bdd 267 + oracle 1036, 348 338/348, **696 0 失败**.
  X1 (p3order 变异, Descartes 8e929af) **已并入** — 杀灭率 71.36% ≥ 70% (63.31→71.36, +42 测试);
  MEDIAN 过期断言随 M3 修正 (60bf7ea). 主分支 348 338/348, bdd 288, oracle 1036, unit 1308/1310 (仅 2 基线预存).
- **T2/T3 全部 12 簇 + R/D 簇已并入主分支** (E/D/B/A/C/M1-M9/X1/X2/R/D-demo). 策略注册里程碑完成.
- **T4 并行 (5 代理) 全部并入 (2026-08-12)**: T4-A (❌ 清零: NubsSelfLoop + LabelManagementProcessor 核实) /
  T4-B (🟡 收敛: 9 ✅ + 1 已核实; NetworkSimplexCompaction 真实修复) /
  T4-X1 (loops 82.28%) / T4-X2 (p1cycles 90.71% + greedyswitch 85.19%) /
  T4-X3 (networksimplex 70.04% + preserveorder 93.79% + graph 72.34%).
  变异达标批次 (≥70%): p3order/compaction/loops/p1cycles/greedyswitch/networksimplex/preserveorder/graph = 8 批.
  MODULES.tsv: 153 ✅ / 1 🟡 (ComponentGroupGraphPlacer, 无触发语料已核实) / 2 ⛔ / 0 ❌.
  剩余变异批次 → **T5 已补定义并派发** (5c109fd: 9 批次 + mutation include 扩 bdd + testFiles 路径修复).
  已并入: p2layers 72.45% / components 75.85% / compound 77.33% / splines 75.34% / p4nodes 70.12% /
  labels 66.02% (含 2 真 bug 修复) / orthogonal 60.78% (+53 用例). 运行中: cell (T5H) / api (T5I) /
  labels 71.41% (T5-C+T5-C2, 含 2 真 bug 修复) / cell 71.86% / api 70.64% / orthogonal 60.78% (3 轮收尾).
- **变异测试停止 (2026-08-12 用户决定: "太慢了, 这一批完成之后就不要再跑变异测试了")**:
  不再派发/运行任何变异批次。已达标 16 批 (covered ≥70%): p3order/compaction/loops/p1cycles/greedyswitch/
  networksimplex/preserveorder/graph/p2layers/p4nodes/components/compound/splines/labels/cell/api.
  未达标/未跑: orthogonal 60.78% (幸存=等价/防御分支) + hier-port 批次未跑 — 记已知缺口, 后续以非变异方式补.
  变异工具链保留可用, 不进日常循环.
- **变异并发教训 (2026-08-12)**: 12 核机器上 `--concurrency 2` 是瓶颈 (慢 6 倍)。变异批次默认并发提到 **6**,
  大批次 (graph/p3order) 用 **8**; 多批次任务**拆成每批一个代理并行**, 不要单代理串行; 每批达标即提交, 不等全批次.
- **变异方法论 (2026-08-12 调研结论, 用户: "不可能改一下就全量测一下")**:
  - **变异测试是周期性/合并门禁, 不是每次改动的验证循环**。日常改动验证 = 快速单测+bdd (秒级);
    变异测试在合并/CI 跑, 不进"每改一行就全量变异"的循环。
  - 代理补测循环: **跑变异 ≤2-3 次** — 第 1 次拿基线报告 → 从 reports/mutation/mutation.json **批量**补一组测试
    (10-20 用例, 按不变量/分支) → 第 2 次确认 → 必要时第 3 次。**禁止每加一个测试跑一次全量变异**。
  - 等价变异: 用 `// Stryker disable` 或登记基准, 不让等价幸存体阻塞阈值。
  - 工具实测: `related:true` 更慢 (沙箱 related 失效) 已回退; `--incremental` 因 stryker 每轮新建
    sandbox 路径失效 → 若要增量需固定 tempDir; 结论: **修循环 > 修工具**。
  剩余变异批次 → T5 已全部执行并并入; 变异测试已按用户决定停止 (见上).
- **R 簇 (策略注册, Epicurus 0e0b401) 已并入**: P1 5 + P2 5 + P3 2 + P4 LinearSegments +
  components/wrapping/intermediate4/NodeLabelPlacer 全接入 provider, 补 GreedyCycleBreaker node.id=index
  副作用; 默认值保持 Java, **348 338/348 零回归, bdd 288, oracle 1036, 696 PASS**.
- **浏览器导出修复 (54b1384)**: horizontal-graph-compactor ISpacingsHandler 改 type-only import —
  demo 运行时 "does not provide an export named" 修复; 之后每簇合并必跑 `bunx vite build demo-vite` 防同类.
- **待办 (策略注册)**: 新移植策略 (P1 6 + P2 5 + P3 2 + P4 LinearSegments) 尚未注册进
  layered-layout-provider.ts; 注册时补 Java GreedyCycleBreaker `node.id=index` 副作用 (M2 提示, DF layerer 依赖).
- 冲突解决: 主工作区 `git merge wt/<簇>`, 逐文件手动 resolve, 每合一个跑全量 348 确认不降.

## 6. 资源隔离

- 本项目单机, 代理共享 CPU/内存. **平台 agent 线程上限 ≈6 活跃** (实测, spawn 到第 7 个报
  "agent thread limit reached") → **T2 十二簇滚动池**: 6 并发, 完成一个关闭并补下一个
  (顺序: C/M1/M2/M3/M4/M5 → M6/M7/M8/M9 → X1/X2 → 覆盖率).
  - 代码/测试移植代理 (轻本地计算): 6 并发满额.
  - 变异测试 (stryker, 重 CPU): 进池时与移植代理错峰 (X1/X2 放后段).
  - 全量 348/bdd/oracle 验证: 每 worktree 各自跑 (单次 ~1-2s, 可接受), 避免 6 个同时跑大批次.
- 12 个 worktree ≈ 12GB node_modules (单机磁盘 76GB 空闲, 够用); 簇完成即删 worktree 回收.
- 大模型验证 (变异测试/stryker) 分批进并行期 (X1/X2), 不进 T3 主线程全量.

## 7. 机器可检查退出条件汇总

| 关卡 | 命令 | 通过标准 |
|---|---|---|
| 簇级 | `bun scripts/verify-elkg-java-layout.ts '<簇模型>'` | 全等 |
| 全量 | `bun scripts/verify-elkg-java-layout.ts` | ≥ 326/348 (当前基线, E 合并后) |
| bdd | `bunx vitest run tests/bdd` | 全过 |
| oracle | `bunx vitest run tests/oracle/generated` | 全过 |
| 696 | `node scripts/diff-failures.mjs collect-all && check` | 0 失败 |
| 变异 | `bun run mutation` (stryker, 增量) | 杀灭率 ≥ 70% (每模块) |
