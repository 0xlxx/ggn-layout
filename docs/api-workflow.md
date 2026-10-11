# API 现代化工作流（P0→P2，写入目标）

> 本文件是 layout API 现代化（P0→P2）的**目标级流程**。每一期开发必须走同一流程；
> 完成判定以"机器可检查门禁"为准，不以代理自报为准。

## 流程（每期固定）

1. **命名约束**：新增公共符号/文件名/技能名一律不得包含 `ELK`/`Elk`（既有 `layoutElkJson`/`ElkNode` 等兼容名保留）。
2. **并行实现**：基于当前主分支开 **2 个 worktree**，两个实现代理**不相交写集**并行修改（禁止改 scope 外文件）。
3. **对抗评审**：实现代理提交后，**独立评审代理只拿两份 `git diff`**（不给推理），逐行对抗审查 + 产出最终修改决策（accept/reject/修改后 accept）。
4. **集成**：主线程按评审决策合并 + 修复 + 接线，补 API BDD/契约测试。
5. **备注回流**：子代理备注主线程独立验证后登记 `docs/agent-remarks.md`（R 编号），不留未处置项。
6. **门禁（忽略 realworld/耗时套件）**：
   ```sh
   bunx vitest run tests/api tests/bdd tests/unit tests/core tests/contract tests/types
   bun scripts/verify-public-api.mjs     # 真实导出集合 vs docs/api-manifest.json
   bunx tsdown                           # 构建产物 + 声明可生成
   # tsc: 改动文件 0 新增错误（全仓 ~2000 基线错误为既有，不在本期清理范围）
   ```
   tests/oracle/**（realworld 批量/耗时）不进门禁，但不得被本期改坏（旧导出零遗漏）。

## 各期范围

### P0（已完成，commit 352198b 等）
- 纯函数（任意路径不改输入）+ 输出保真（保留 ports/labels/properties/自定义字段）
- 显式校验 `validateLayoutInput`/`assertValidLayoutInput` + 结构化错误 `LayoutError{code,path,retryable,phase}`
- 共享算法注册表 `src/api/algorithms.ts`（dispatch 与 validate 单一事实来源）
- API BDD：`api-contract` / `api-validation` / `api-purity-fidelity`（38 场景）

### P1（已完成，commit f87bd35 等）
- 类型收紧：`LayoutInput/LayoutOutput/LayoutOutputEdge/LayoutSummary` + `direction` 字面量联合
- 输出裁剪：`responseFormat: full|concise|summary` + `pick`（仅 full）
- JSON↔LGraph 闭环：`extractGraph` 导出
- 入口拆分：`src/public.ts`（消费方白名单）/ `src/internal.ts`（引擎）/ `src/index.ts`（历史兼容，旧导出零遗漏）
- 文档栈：README / llms.txt / SKILL.md / API-QUICKREF / examples
- 门禁：`verify:public-api`（真实导出枚举）+ `tests/contract` + `tests/types`

### P2（本期目标）
- **P2-A 复合操作**：`layoutElkJsonBatch`（批量+逐项错误）、`diffElkLayout`/`layoutElkJsonDiff`（布局 diff）、`control: { signal, onProgress }`（进度事件 + AbortSignal 合作式取消，`ABORTED` 错误码）
- **P2-B 发布边界**：package `exports` 子路径 `./api` / `./core` / `./options`（tsdown 多入口，ESM/CJS/类型一致）、`src/options.ts` 门面、`layout-input.schema.json`（JSON Schema 与运行时校验同一契约）、`scripts/generate-api-manifest.mjs`（manifest 自动生成防不一致）
- 完成后 P0-P2 全部落地，门禁全绿 → 目标完成。

## 完成判定（P2 验收清单）
- [x] batch/diff/control 公共导出 + BDD 场景（批量逐项错误、diff 字段、取消抛 ABORTED）
- [x] package exports 四个入口（. / ./api / ./core / ./options）构建产物存在且 dev/import/require/types 一致
- [x] options 门面只暴露稳定选项；JSON Schema 文件存在且与 LayoutInput 一致
- [x] generate-api-manifest 幂等（跑完无 diff）且 verify:public-api 仍绿
- [x] 门禁 6 项全绿 + 旧 index 导出零遗漏（tests/contract/api-exports.test.ts）
