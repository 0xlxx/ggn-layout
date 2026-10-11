# elkjs 0.12.0 特性覆盖审计（ggn-layout 测试对照）

> **Status**: 🟢 Active
> **Last Updated**: 2026-09-06
> **Parent**: [文档索引](../README.md)
> **Objective**: 枚举 elkjs 0.12.0 的对外特性（算法 / 能力旗标 / JSON 图格式 / 选项 / API 面），逐项对照 ggn-layout（`本仓库`）的测试覆盖，给出覆盖结论与差距清单。

## 1. 范围与方法

- 参照对象：npm `elkjs@0.12.0`（仓库根 `node_modules/elkjs`，GWT 编译 ELK Java 0.12.0）。
  运行时枚举：`knownLayoutAlgorithms()` 11 个算法、`knownLayoutOptions()` 235 项、`knownLayoutCategories()` 8 类。
- 被测对象：`ggn-layout`（ELK Java 0.12.0 1:1 TS 移植；声明契约 = 结果层 API `layoutElkJson`，
  见 [README](../README.md) 与 GOAL-COMPLETE「等价 elkjs：输入/输出标准 ELK JSON」）。
- 方法：elkjs 运行时枚举特性面 → grep 实现与测试文件 → 抽样实跑套件确认全绿。
- 抽样实跑（2026-09-06，vitest）：core-providers + layout-elk-json 23/23；self-loops + short-opt-keys +
  worker + coords-modes + api-validation 62/62；mrtree/radial/rectpacking/spore/topdownpacking/vertiflex/disco 63/63。

## 2. 结论摘要

- **布局特性面（算法 / 图特性 / JSON / 选项）：覆盖率高**。elkjs 全部 11 个算法均有端到端布局测试，
  并有超大 oracle 差分套件（`tests/oracle/generated/` 约 10 万行）与 ELK Java 0.12.0 jar 对拍；
  能力旗标（自环 / 复合 / 端口 / 边标签等）与 JSON 坐标模式均有专门场景。
- **API 包装面：与 elkjs `ELK` class 非 1:1（有意）**。`ggn-layout` 用纯函数 + batch/diff/control/worker
  替代 elkjs 的实例 API；`known*` 自省、`logging`、`measureExecutionTime` 无对应物（见 §6 差距）。
- **有意行为差异**：elkjs `layout()` 会原地改输入且始终异步；我们纯函数 + 同步主线程 / 可选 worker
  （`api-purity-fidelity` 专门断言不修改输入）。

## 3. 算法覆盖（11/11 + 超集）

| elkjs 算法 | 实现 | 端到端测试证据 | 结论 |
| :--- | :--- | :--- | :--- |
| layered | `src/layered*` + 各阶段 | `bdd/core-layout`、`parser-scenarios` 等绝大多数 bdd + oracle | ✅ |
| box / fixed / random | `src/api/core-providers.ts` | `api/core-providers.test.ts` + `bdd/core-providers.scenarios.test.ts` | ✅ |
| force | `src/force` | `api/layout-elk-json.test.ts`（嵌套 force+box 分派）| ✅ |
| stress | `src/force`（stress-majorization） | `api/json-import.test.ts`（leaf 不分派 / 有子节点分派） | ✅ |
| mrtree | `src/mrtree` | `bdd/mrtree.scenarios.test.ts`（`org.eclipse.elk.mrtree`） | ✅ |
| radial | `src/radial` | `bdd/radial.scenarios.test.ts` | ✅ |
| rectpacking | `src/rectpacking` | `bdd/rectpacking.scenarios.test.ts` | ✅ |
| sporeOverlap / sporeCompaction | `src/spore` | `bdd/spore.scenarios.test.ts` | ✅ |
| （超集）topdownpacking / vertiflex / disco | `src/topdownpacking` / `vertiflex` / `disco` | 各自 `bdd/*.scenarios.test.ts` | ✅（elkjs 0.12.0 未打包） |

分派入口：`src/api/algorithms.ts`（`SUPPORTED_ALGORITHMS` / `isSupportedAlgorithm` / `normalizeAlgorithm`，
含 `org.eclipse.elk.*` / `elk.*` 前缀归一）。

## 4. 能力旗标覆盖（supportedFeatures）

| 算法 | elkjs 旗标 | 测试证据 | 结论 |
| :--- | :--- | :--- | :--- |
| layered | SELF_LOOPS | `bdd/self-loops.scenarios` + `spline-selfloop.scenarios` + `tests/unit/SelfLoop*` | ✅ |
| layered | INSIDE_SELF_LOOPS | `tests/unit/Issue562Test` + oracle generated（json_path/tickets/examples 含 insideSelfLoops 模型） | ✅（oracle/unit，非独立 bdd） |
| layered | MULTI_EDGES | `tests/unit/LGraphUtilMergeTest`（mergeEdges）+ oracle 差分 | ✅ |
| layered | EDGE_LABELS | `bdd/labels`、`blackbox-nodelabels`、`port-labels` | ✅ |
| layered | PORTS | `bdd/compound-ports`、`north-south-ports`、`port-labels`、`constraints-postprocessor` | ✅ |
| layered | COMPOUND / CLUSTERS | `bdd/parser-scenarios`、`core-layout`、嵌套组（INCLUDE_CHILDREN）多文件 | ✅ |
| mrtree | DISCONNECTED | `bdd/mrtree.scenarios` + `bdd/components-strategies`（连通分量） | ✅ |
| force | MULTI_EDGES / EDGE_LABELS | 实现于 `src/force`；经 oracle 差分覆盖 | ✅（差分，无专门旗标断言） |

## 5. JSON 图格式与选项

| 特性 | 测试证据 | 结论 |
| :--- | :--- | :--- |
| 扩展边 sources/targets/sections、container | `api/coords-modes` + `bdd/coords-modes-per-node` + `parser-scenarios` | ✅ |
| 坐标模式 shapeCoords / edgeCoords（PARENT/ROOT/CONTAINER/INHERIT） | `api/coords-modes.test.ts` + `bdd/coords-modes-per-node` | ✅ |
| `elk.*` 短键（org.* → elk.*） | `bdd/short-opt-keys.scenarios` + `parser-scenarios` | ✅ |
| 输入校验（缺/重 id、空/悬空/多端点、负/非有限尺寸） | `bdd/api-validation` + `api-contract`（错误码表） | ✅ |
| 原语边（deprecated source/target 形态） | 非支持形态；按「必须 extended 单源单目标」校验拒绝 | ✅（文档注明） |
| junctionPoints 输出 | 我们不在输出导出（内部属性保留）——差异见 [JSON 图格式指南](./elk-json-format.md) §5 | ⚠️ 有意差异 |
| 选项键/默认值 | elkjs 235 项；核心对齐见 [选项接口参考](./elk-layout-options.md)；oracle 差分兜底 | ✅ |
| elkjs 专有 UI/动画键（animate/zoomToFit/progressBar/childArea* 等） | 实证容忍（键开放、值回落），但**无回归测试** | ⚠️ 缺测试（G3） |

## 6. API 包装面对照（elkjs `ELK` class → ggn-layout）

| elkjs | ggn-layout | 测试 | 结论 |
| :--- | :--- | :--- | :--- |
| `layout(graph, {layoutOptions})` | `layoutElkJson(input, options)`（同步纯函数） | api/layout-elk-json + bdd 全量 | ✅ |
| 批量 | `layoutJsonBatch` | `bdd/api-composite` | ✅ |
| 进度/取消 | `control: { onProgress, signal }`；worker progress | `bdd/api-composite`、`api/worker.test` | ✅（形态不同） |
| `terminateWorker()` | `createLayoutWorker` 取消 = terminate | `api/worker.test.ts`（正常/并发/progress/取消/错误还原） | ✅（形态不同） |
| 构造 `defaultLayoutOptions` | options 参数逐次传入 | api 层 | ✅（等价物不同形态） |
| 构造 `algorithms` 子集 | `ggn-layout/layered` 子入口 + register-all（tree-shaking） | `tests/contract/api-exports`；产物门禁 `bun run smoke:pack` | ✅（等价物） |
| `knownLayoutAlgorithms()/Options/Categories()` | 无（`algorithms.ts` 仅校验用白名单） | — | ⚠️ 差距 G1 |
| `layout(_, {logging})` | 无 logging 参数；近似 = onProgress / trace | — | ⚠️ 差距 G2 |
| `layout(_, {measureExecutionTime})` | 无 | — | ⚠️ 差距 G2 |
| 原地修改输入 | 纯函数（有意差异） | `bdd/api-purity-fidelity` | ✅（有意） |

## 7. 差距清单（未覆盖 / 待补）

- **G1 自省 API**：无 `knownLayoutAlgorithms / knownLayoutOptions / knownLayoutCategories` 等价物。
  若目标是 elkjs drop-in，则为缺口；当前声明契约（结果层 API）不承诺。
- **G2 度量参数**：`measureExecutionTime` 无对应；`logging` 仅能近似映射到 `onProgress`/trace，无专门测试。
- **G3 elkjs UI 键回归测试**：无测试喂入 elkjs 专有/未知键（animate、zoomToFit、progressBar、childArea*、
  font.* 等）断言「键开放、布局不受影响」——已实证可容忍（2026-09-06 bun 直跑），但缺固化测试。
- **G4 旗标专项断言**：force 的 MULTI_EDGES / EDGE_LABELS、layered 的 INSIDE_SELF_LOOPS 主要靠
  oracle 差分 / unit 覆盖，无独立 bdd 断言。

## 8. 相关文档

- [ELK 布局选项接口参考](./elk-layout-options.md) / [JSON 图格式指南](./elk-json-format.md)
- `docs/GOAL-COMPLETE.md`（结果层 API 对齐 elkjs 记录）、`docs/agent-remarks.md`（R16/R40/R55/R72 等 elkjs 交叉验证）
- `docs/MODULES.tsv`（模块 ↔ Java 类 ↔ 观测点）
