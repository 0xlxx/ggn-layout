# 簇简报: bundle 与冷启动（选项表/数据表）（layered 内核 505KB raw / 125KB gzip；冷 import 25ms，其中选项表构造占大头）

> 项目优化 SSOT: `packages/layout/docs/optimization.md`（先读）。批次 11 历史见 `docs/clusters/agent-remarks.md` R50-R53。

## 0. OPTIMIZATION_CLASSES.tsv 行
`src/options/**` + `shared/opt-map.ts` | 数据表占 bundle 5.8%（opt-map 17KB + specs 16KB） | 数据表达式压缩 / 惰性化 | UNORDERED | NONE | bundle 字节 + 冷启动计时 + bit-exact

## 1. 热点证据（2026-09-13 实测，20 次摊销 profile）
```
bun build src/api/layered.ts --minify --target browser：579KB（192 模块）
按目录：src/intermediate 31.6% | p3order 10.0% | p5edges 7.5% | p4nodes 7.0% | layered-layout-provider 5.5% | options 4.9% | shared 4.7%
单文件：shared/opt-map.ts 17.1KB (3.0%) | src/options/specs.ts 16.2KB (2.8%) | src/options/layered-options.ts 8.6KB (1.5%)
冷启动：`import('./src/index.ts')` ≈ 25ms（dist 14.4ms）；profile 里 `spec()` 建表一次 ≈ 28ms
```
`specs.ts` 现在是逐项 `spec({ id, shortKey, type, default, algorithm })` 对象字面量（数百项）。

## 2. 优化假设
- 先测清基线：`bun build src/api/layered.ts --minify --target browser --outdir /tmp/b1 --metafile=/tmp/m1.json` 记录字节；`bun -e 'const t=performance.now(); await import("./src/index.ts"); console.log(performance.now()-t)'` 记录冷启动（跑 5 次取中位）。
- 候选（按安全性排序）：① 把 `spec()` 包装改成直接对象字面量（少一次调用/少闭包；收益小但零风险）；② `opt-map.ts` 的映射表改用更紧凑的编码（如按行字符串 split，或只保留被引用的键）；③ 选项表**惰性构建**（只为真正读到的 id 建对象）—— 注意别把成本推到首次 layout。
- 严守：**不许改任何选项的语义**（默认值、类型、值域、id/shortKey 映射、算法归属）。
- 预期：layered 内核 ≥5% 字节降 + 冷 import 明显下降；若实测收益 <20%（阈值）就如实汇报为「不值得改」。

## 3. 顺序相关性 / 等价红线
- 不改任何布局输出 → bit-exact 不受影响，但仍须跑门禁确认。
- 选项表是**全局单例数据**：若改惰性化，注意并发/多次 layout 的一致性，且不能引入跨图残留。
- 别把包体积转成运行时成本（惰性表若每次 layout 重建 = 用时间换字节，得不偿失）。

## 4. Scope 边界
| 文件 | 改动 |
|---|---|
| `src/options/**` | 选项表表达/惰性化 |
| `shared/opt-map.ts` | 映射表编码 |

**不可碰**：`tsdown.config.ts`（主线程管构建配置）、`src/options/specs.ts` 的**语义内容**（只许改表达方式）、其余一切。

## 5. 方法 + 退出条件
```bash
bun build src/api/layered.ts --minify --target browser --outdir /tmp/b-opt --metafile=/tmp/m-opt.json
bunx tsdown && ls -l dist/elk-json-*.js         # 发布产物 chunk 字节（对照 506,686 raw / 125,447 gzip）
for i in 1 2 3 4 5; do bun -e 'const t=performance.now(); await import("./src/index.ts"); console.log((performance.now()-t).toFixed(1))'; done
bun scripts/verify-bit-exact.mjs                # 368/368 不变
bunx tsc --noEmit
```
退出条件: layered 内核产物字节 ≥5% 降（506,686 raw 对照）+ 冷 import 中位下降 + bit-exact 368/368 不变 + typecheck 0；若收益不足则给出「不值得改」的量化结论。

## 铁律
- 只改本簇 scope 内文件；其余一律不碰（tests/ 既有期望值、scripts/verify-*、triage-registry.json、OPTIMIZATION_CLASSES.tsv、docs/clusters/agent-remarks.md 由主线程统一回写）。
- 禁止 git stash/reset/checkout -f/clean/rebase；只 `git add <具体文件>`，不要 `git add .`（worktree 里 node_modules 是软链）。
- 不要跑全量 `bunx vitest run`（52s，主线程会跑）；只跑本簇门禁（见下）。
- **没量化就不算完成**：每个改动都要有 before/after 数字。
- 汇报结构化：files / verifications（实际数字）/ problems / notes。未达退出条件**不得声称完成**。

