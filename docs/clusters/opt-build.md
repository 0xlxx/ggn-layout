# 簇简报: 图构建（shared/elkgraph-builder）（三处逐节点/逐边全表反查 → 预建索引（build 超线性 ~n^1.7））

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。批次 11 历史见 `docs/clusters/agent-remarks.md` R50-R53。

## 0. OPTIMIZATION_CLASSES.tsv 行
`shared/elkgraph-builder.ts` | build 占 e2e 7-13%（small 0.21 / medium 0.97 / large 4.47ms） | 索引替换反查 | UNORDERED（需论证） | NONE | bit-exact 368 + perf-run --bench

## 1. 热点证据（2026-09-13 实测，20 次摊销 profile）
```
--bench 20：小(46 节点) build 0.21ms | 中(195) 0.97ms | 大(488) 4.47ms   → ~n^1.7 超线性
profile：buildLGraphFromParsed 下 native `entries` 21.5ms + native `indexOf` 22.7ms（合计 4.4% 总样本）
```
三处根因（都在 `buildLGraphFromParsed` / `buildHierarchy`）：
1. 每节点反查父：`Object.entries(HIERARCHY).find(([, kids]) => kids.includes(i))?.[0]` —— 每节点分配全部父项数组 + 全表扫描；
2. 逐边找端点：`nodes.indexOf(s)` / `nodes.indexOf(t)` —— O(E·V)；
3. `buildHierarchy` 里 `nodes.indexOf(parent)` / `kids.map(k => nodes.indexOf(k))` —— O(V²)。

> 机制背景：ELK 的 Java `ElkGraphImporter` 是**带父图引用递归下行**；移植后拍平为 `nodes[]` + `HIERARCHY` 映射，于是变成反向查找。这是典型的「Java 数据结构 ≠ JS 数据结构」差价。

## 2. 优化假设
- 一次性预建 `Map<nodeIndex, parentIndex>`（单趟遍历 HIERARCHY，O(V + Σkids)）替代每节点反查。
- 预建 `Map<nodeId, index>` 替代 `nodes.indexOf`。
- 预期：large build 4.47ms → ~1.5ms（-60%），e2e -6%；更重要的是**消掉超线性**。
- 注意别改**节点/边的插入顺序**：建图顺序会影响后续层分配/端口序 → 必须保持与现在逐位相同（这是本簇最大风险，先读代码确认插入序来源）。

## 3. 顺序相关性 / 等价红线
- 本簇产出喂给**所有**算法，等价红线最严：`bun scripts/verify-bit-exact.mjs` 全等 337 必须不变。
- 索引替换本身不改遍历顺序时是安全的；**但若把「按 nodes 顺序」改成「按 HIERARCHY 顺序」建子图，插入序会变 → 舍入差异**。改前必须确认建图插入序与当前一致。
- 不要改 `HIERARCHY` 的语义（含容器判定、空容器处理）。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `shared/elkgraph-builder.ts` | 主体优化（唯一可改文件） |

**不可碰**：其余一切。`tests/**` 既有期望值不许改。

## 5. 方法 + 退出条件
```bash
bun scripts/verify-bit-exact.mjs                          # 368/368 全等 337 不变（每次必跑）
bun scripts/verify-elkg-java-layout.ts                    # 362/368 对齐不降
bun scripts/perf-run.mjs --bench 20 --scale small         # build.mean
bun scripts/perf-run.mjs --bench 20 --scale medium        # build.mean
bun scripts/perf-run.mjs --bench 20 --scale large         # build.mean（目标 -60%）
bunx tsc --noEmit
```
退出条件: large build.mean ≥40% 降（4.47 → ≤2.7ms）且 small/medium 同向不劣化 + bit-exact 368/368 全等 337 不变 + 对齐 362/368 + typecheck 0。

## 铁律
- 只改本簇 scope 内文件；其余一律不碰（tests/ 既有期望值、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md 由主线程统一回写）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里 node_modules 是软链）。
- 不要跑全量 `bunx vitest run`（52s，主线程会跑）；只跑本簇门禁（见下）。
- **没量化就不算完成**：每个改动都要有 before/after 数字。
- 汇报结构化：files / verifications（实际数字）/ problems / notes。未达退出条件**不得声称完成**。

