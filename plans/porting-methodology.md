# 现代移植方法论调研：以 TypeScript→Go 移植为锚点

> 状态: 调研完成 (2026-08-07)。本文回答"现代大型项目如何做 1:1 移植并保证正确性"，
> 以 **microsoft/typescript-go (TypeScript 7)** 官方移植为锚点案例，映射到 elk-layout 移植验证体系，
> 并给出可落地的差距清单。本文件是方法论参考，不是验收蓝图（验收蓝图见 `elk-layout-verification.md`）。

---

## 1. 锚点案例：TypeScript→Go（typescript-go / TS7）

### 1.1 定位：是"移植"不是"重写"

TS 团队明确把这项工作定性为 **port（移植）** 而非 rewrite（重写）：

- **file-by-file 保守移植**：从 `microsoft/TypeScript` 按文件逐个翻译，目标是"改动最小、结构最像"。
  Hejlsberg 的原话是"更像是 copy/paste 然后修"，且刻意追求 **99.99% 语义兼容**。
- **双代码库长期并存**：预期 TS 原仓库与 Go 版本会同时维护相当长时间。因此**代码结构相似性是第一优先级**
  ——两边改一个 bug / 合一个上游 PR 时，可以几乎机械地在两个代码库之间搬运 diff。
  （这也是选 Go 而非 Rust/C# 的决定性理由之一：Go 惯用写法与 TS 现有递归数据结构、遍历风格高度接近。）
- **反面教材**：语言特性逼你"重新思考内存管理/可变性/多态/惰性"的语言更适合从零重写，不适合保守移植。

> 对本项目的启示：ggn 的 `src/` 目录结构、类名、方法名、注释应尽量与 ELK Java 源码一一对应，
> 后续 ELK 上游发版时才能用 diff 方式增量搬运。已有的 `*_DBG` 插桩也应按"结构对齐"原则保留。

### 1.2 测试体系：Baseline Testing System（快照/基线）

tsgo 的测试体系以 **快照基线** 为主，而不是手写断言：

```
Run     —— 用 tsgo 跑测试输入，产出实际输出
Compare —— 与实际输出和"参考输出"对比（.js / .d.ts / .errors.txt / .types / .symbols / .baseline）
Accept  —— 人工评审差异，确认正确后用 `npx hereby baseline-accept` 接受为新基线
```

- **三个文件集**：`local`（本次运行产物）/ `reference`（仓库内 golden）/ `submodule`（来自
  `_submodules/TypeScript` 官方子模块的原始参考输出）。
- **submodule diff**：对从 TS 子模块移植的测试，计算 tsgo 输出与官方参考输出的 unified diff，
  存放在 `testdata/baselines/reference/submodule/`。
- **核心思想**：编译器这类输出极其复杂的程序，逐字段断言不可维护；快照 + 人工评审 +
  机器可读分类，才能规模化。

### 1.3 差异三分类：Unclassified / Accepted / Triaged（最关键的一步）

tsgo 对 submodule diff 做**正式 triage**，而不是"全部必须为 0"：

| 分类 | 含义 | 存放 |
|---|---|---|
| **Unclassified** | 新出现的、尚未人工评审的差异 | 默认状态，CI 会红 |
| **Accepted** | 有意分歧（如 JSDoc/JS 支持范围不同、诊断措辞改进） | `testdata/submoduleAccepted.txt` |
| **Triaged** | 已知 bug / 待修差异，暂列清单跟踪，不阻断进度 | `testdata/submoduleTriaged.txt` |

- **CI 门禁**：任何**未分类**的 baseline 变更（新增 diff 或现有 accepted/triaged 之外的变化）都是
  硬失败；accepted/triaged 清单内的差异允许存在，但必须逐名列出。
- **工作流**：修 bug → 跑 `go test ./internal/testrunner -run '^TestSubmodule/<name>'` →
  看 `testdata/**/*.diff` → 正确则 `baseline-accept`，错误则继续修。
- **测试来源**：官方 conformance/compiler 全套测试通过 git submodule 挂进仓库，作为"参考实现"
  （既给测试用例，又给 golden 输出），还有 `convertfourslash` 脚本把子模块测试批量转成 Go 测试。
- **tracking 而非 hiding**：failing/manual 测试另有清单（`updateFailing.mts` / `makeManual.mts`），
  防止已知失败阻塞 CI，同时保证进度可见。

> 对本项目的启示：这正是 `elk-layout-triage.md` 三分法（①分歧冻结 / ②真 bug / ③工具待修）的
> **成熟工业版**。tsgo 把 accepted/triaged 落成**机器可读文本清单 + CI 门禁**；我们目前只有
> `divergence.json`（①冻结）和手写 triage 文档，②③没有进清单、失败集合也没有硬门禁。

### 1.4 为什么不"全部对拍通过"才叫完成

- tsgo 至今仍有 accepted（有意分歧）和 triaged（待修 bug）清单，但**任何新差异必须被显式分类**。
- 对拍（differential）是**发现机制**，不是**验收标准**；验收标准是"所有差异都有归因"。
- 归因驱动修复优先级：accepted 不用修，triaged 排队修，unclassified 必须立刻评审。

---

## 2. 一般方法论全景（现代移植/重写的安全网）

除 typescript-go 外，业界成熟做法可归为六类，本项目几乎每类都已对应落地：

### 2.1 表征测试（Characterization Testing）— "先钉住现状，再动手"
- 来源：Michael Feathers《Working Effectively with Legacy Code》。
- 做法：在**改代码之前**，先写测试把当前可观察行为（含"看起来像 bug"的行为）钉死；
  迁移/重构途中随时能发现"行为被意外改变"。golden master / approval testing 是其工具化形态。
- 对应本项目：696 坐标差分基线、elk-java-unit 470/470 就是"行为钉住"；`diff-failures.mjs` 保证失败集合逐名可比。

### 2.2 差分测试 / Back-to-Back 测试
- 同一输入喂给多个实现（新旧版本 / 不同语言实现），结构化对比输出，不一致即告警。
- 关键成功要素（教科书共识）：
  1. **等价准则先行**：比什么、怎么归一化、容差多少，先定义清楚（本项目 ε 与几何归一化）。
  2. **输入套件多样性**：官方单测 + 手工样例 + 随机生成，覆盖面互补。
  3. **自动化全链**：harness 一把梭跑完三方（本项目 `jar-triage.mjs`）。
  4. **版本化管理 harness 与 oracle**：jar 版本、elkjs 版本、输入模型 hash 都要可追溯（M0-B 参数指纹）。
- 注意陷阱：差分测试的盲区是"多个实现共享同一个错误"；所以差分必须与**不变量测试（L3）**、
  **变异测试（L4）** 互补——这正是本项目 L1~L5 金字塔的动机。

### 2.3 随机生成 + 差分（编译器界的 Csmith / EMI）
- **Csmith**（Yang et al., PLDI'11）：随机生成合法 C 程序，喂给 GCC/Clang 等多编译器做差分，
  三年找出数百个真实编译器 bug。核心贡献是"生成语义无歧义程序 + 生成期静态验证（GTAV）"。
- **EMI（Equivalence Modulo Inputs）**（Le/Afshari/Su, PLDI'14）：取真实程序，删除/修改
  对当前输入**不影响执行路径**的代码（等价变形），再对拍优化前后，专门抓"优化器错误优化"。
- 对本项目：`rndcmp*.tmp.ts` 已证明方向可行；升级为**受控随机图生成器**（种子确定、
  图规模/密度/端口/自环/分层参数化）喂三方对拍，可长期自动补覆盖。注意 ELK 的 RNG 消耗序列
  （项目已踩过坑：RNG 值一致 ≠ 布局一致，扰动**分配顺序**也是变量）——随机差分必须连同
  RNG 消耗轨迹一起对拍。

### 2.4 蜕变测试（Metamorphic Testing）与变异测试（Mutation Testing）
- 蜕变测试：没有 oracle 时，检验**多次执行输入输出之间的关系**（如平移不变、旋转不变、
  对称性），而非单个输出的绝对正确。布局算法天然适合：整图平移/缩放不应改变相对结构。
- 变异测试：注入小变异（改运算符/删分支/翻常量），看测试能否杀灭——衡量的是**测试套件的质量**，
  而非被测代码质量。本项目 L4（stryker）已落地，目标 covered kill ≥ 70%。
- 两者互补：蜕变测试给"没有 oracle 的量"提供不变量；变异测试给"已有 oracle 的量"提供覆盖保证。

### 2.5 分阶段 / 分模块对比（管线快照）
- typescript-go 的 submodule diff 是**整体输出**层面；对大算法（如编译器、布局引擎），
  更狠的版本是把内部**阶段**的输入/输出都做成快照逐段对拍，**首个不一致阶段即 bug 所在**。
- 这正是本项目 M2 / L2 的做法（P1 去环 → P2 分层 → P3 交叉最小化 → P4 节点定位 → P5 边路由
  + 中间处理器；ELK_INSTR 注入 + ggn 侧 GGN_*_DBG 轨迹 diff）。

### 2.6 前置条件 / 参数一致性（对拍的前提）
- 差分测试的隐含前提：**输入参数集合一致**。编译器是命令行 flag，布局引擎是 options + 默认值 +
  随机种子。参数不对齐时，差分结果无意义（本项目 M0-B：elkt 顶层属性被丢弃、
  core key 前缀 `org.eclipse.elk.layered.*` vs `org.eclipse.elk.*` 混用、参数指纹校验）。

---

## 3. 与本项目 elk-layout 的映射

| typescript-go | elk-layout 本项目 | 状态 |
|---|---|---|
| `_submodules/TypeScript`（官方参考实现 + 测试用例） | ELK Java 0.12.0 jar（SSOT）+ elk-java-unit（470 测试） | ✅ 已定案 |
| Baseline reference（golden 输出） | jar oracle 坐标 + M2 每阶段快照 | ✅ 已建雏形 |
| `submoduleAccepted.txt`（有意分歧） | `divergence.json`（①分歧冻结，ggn≈jar≠elkjs） | ✅ 有文件，❌ 无门禁 |
| `submoduleTriaged.txt`（已知 bug 待修） | ②真 bug 修复队列（jar-triage 输出） | ❌ 未落成机器可读清单 |
| Unclassified（新差异必须评审） | ③工具待修 / 任何新增失败 | ❌ 未做硬门禁 |
| `baseline-accept`（人工评审后接受） | 更新 `divergence.json` / oracle / 失败基线 | ❌ 流程未固化 |
| `TestSubmodule/<name>` 单测定向跑 | `diff-failures.mjs collect/diff` + `jar-triage.mjs <file>` | ✅ 已有 |
| conformance 全套测试经 submodule 挂载 | 696 elkt 模型 + elk-java-unit 470 | ✅ 已有 |
| 快照逐字段对比（字符串） | 几何坐标对比（**float + ε 容差**） | ⚠️ 本项目独有难点 |

### 本项目独有、typescript-go 没有的三个难点
1. **数值精度**：输出是浮点坐标，不是字符串。必须定义**归一化规则 + ε 容差**，
   且按几何量分档（节点坐标 / 尺寸 / 边路由点 / 端口偏移），`jar-triage.mjs` 已用 ε=1，需文档化依据。
2. **随机性**：ELK 大量使用 RNG（种子 + 消耗序列）。差分必须锁定 randomSeed 并对比 RNG 消耗轨迹
   （项目实证：RNG 值一致 ≠ 布局一致，分配顺序也是变量）。
3. **分阶段状态**：布局是多阶段管线，中间状态（层序/端口序/合并组 barycenter）也是比较对象，
   不能只比最终坐标——否则像 Forster 合并组 barycenter 这类"只影响中间状态"的 bug 会被掩盖。

---

## 4. 差距清单与落地建议（按优先级）

### A. 建立"分歧登记册"（divergence registry）—— 最高优先
把现在的三处分散信息合并为一个**机器可读清单**，作为 CI 门禁的数据源：
- 文件：`divergence.json` 升级为 `[{ file, verdict: 'accepted'|'bug'|'tooling'|'fixed', reason, tracker?, eps? }]`；
  或保留 `divergence.json`（accepted）+ 新增 `triaged.json`（bug）+ `tooling.json`，与 tsgo 的
  accepted/triaged 两份清单对齐。
- 每条必须带 **reason**（一句话归因）和 **tracker**（issue/commit 链接），防止"清单只是躺尸"。
- 修复一个 bug → 从 registry 移除 → 同时更新 `elk-layout-triage.md` 和 PROGRESS.md。

### B. 失败集合硬门禁（check 子命令）
`diff-failures.mjs` 已有 `collect` / `diff`，补一个 `check`：
- 输入：当前失败集合 + registry。
- 规则：任何失败不在 registry 中 → **阻断（新增未分类失败）**；registry 中 `bug` 的图若已通过 →
  提示"可移除"（不阻断）；registry 中 `tooling` 的图失败 → 允许但计告警。
- 这样 696 从"参考基线"变成"受控门禁"，与 tsgo CI 的"unclassified diff = 红"对齐。

### C. M2 阶段快照 diff 自动化
- 把 ELK_INSTR 的每阶段快照（层序 / 端口序 / barycenter / 合并轨迹）落盘为 JSON，
  ggn 侧 GGN_*_DBG 同样落盘 → 写 `phase-diff.mjs` 做**阶段级 submodule diff**，
  输出"首个不一致阶段 + 首个不一致行"。这套已是手工作业（north_south_fixed_side 案例验证有效），
  值得固化。

### D. 参数指纹纳入三分法（M0-B 收尾）
- 每图对拍前先比生效参数集合（key=value + 默认回退 + randomSeed），不一致直接归 ③工具待修，
  不进入 ②真 bug 队列，避免在"参数都没对齐"的图上浪费定位时间。

### E. 受控随机图生成 + 三方差分（长期回归）
- 参考 Csmith：实现参数化随机图生成器（节点数/层数/边密度/端口约束/自环/复合节点/边标签），
  固定 seed；对拍 jar（oracle）与 ggn，附带 RNG 消耗轨迹对比。
- 作为 nightly/CI 可选任务，与 696 静态套件互补（静态套件测不到的组合空间）。

### F. 变异测试门槛固化
- covered kill ≥ 70%（当前 ~65-66%），缺口集中在 loops（40.2%）/ slot-assigner /
  port-restorer / orthogonal-router；机器负载高时单并发跑（用户偏好），CI 单独 job。

### G. 双代码库维护策略（为上游更新做准备）
- 明确"结构对齐"纪律：ggn `src/` 文件/类/方法命名与 ELK Java 一一对应，
  后续 ELK 发版用 `diff` 方式增量搬运，而不是重读重译。
- 在 PROGRESS.md / AGENTS 里记一条：**新移植代码必须标注 ELK 源文件 + 版本**（行内注释），
  便于将来 diff 迁移。

### H. 文档化 ε 与归一化规则
- 新增 `plans/epsilon-and-normalization.md` 或在 verification 计划里补一节：
  每种几何量的比较方式（绝对差/相对差）、ε 取值与依据、归一化（如对齐后比较、
  忽略无意义自由度如整图平移）。`jar-triage.mjs` 的 ε=1 需要依据支撑，不能拍脑袋。

---

## 5. 参考资料

- microsoft/typescript-go README：https://github.com/microsoft/typescript-go/blob/main/README.md
- Why Go?（Hejlsberg 官方 FAQ）：https://github.com/microsoft/typescript-go/discussions/411
- Baseline Testing System（DeepWiki）：https://deepwiki.com/microsoft/typescript-go/7.3-baseline-testing-system
- Submodule Integration / Accepted vs Triaged（DeepWiki）：https://deepwiki.com/microsoft/typescript-go/11.1-submodule-integration
- Hejlsberg 访谈摘录（file-by-file 移植、99.99% 兼容）：https://dev.to/artalar/review-of-an-interview-with-the-author-of-typescript-about-porting-it-to-go-lag
- Yang et al., "Finding and Understanding Bugs in C Compilers" (Csmith), PLDI 2011
- Le / Afshari / Su, "Compiler Validation via Equivalence Modulo Inputs" (EMI), PLDI 2014
- Segura et al., "Metamorphic Testing 20 Years Later" (MT 综述)
- Feathers, *Working Effectively with Legacy Code*（表征测试 / characterization testing）
- Differential / back-to-back testing（Wikipedia）
