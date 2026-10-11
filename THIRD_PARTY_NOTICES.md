# Third-Party Notices

This project is a TypeScript port of the layered graph layout implementation
from the Eclipse Layout Kernel (ELK).

## Eclipse Layout Kernel

- Project: Eclipse Layout Kernel (ELK)
- Website: https://www.eclipse.org/elk/
- Source: https://github.com/eclipse/elk
- License: Eclipse Public License 2.0 (EPL-2.0)；SPDX 标识 `EPL-2.0 OR GPL-3.0-or-later`
- Copyright: 版权归各上游作者/雇主所有（上游 [NOTICE.md](https://github.com/eclipse/elk/blob/master/NOTICE.md)：
  "All content is the property of the respective authors or their employers."）。
  上游各文件头部的版权年代/持有人并不相同（例如 `LGraph.java` 为 `2010, 2019`、
  `BoxLayoutProvider.java` 为 `2009, 2020`、`MedianHeuristic.java` 为 `2024`）。
  本仓库**不**把来源文件的年代改写成统一值，而是在每个衍生文件头声明持有人
  （`Copyright (c) Kiel University and others`）并在此登记来源；
  精确到文件的原始通知以上游 v0.12.0 对应源码头为准。

EPL-2.0 全文见 [`LICENSES/EPL-2.0.txt`](LICENSES/EPL-2.0.txt)。

**源码可得性声明（EPL-2.0 §3.1(a)）**：与本包每个发布版本对应的 Source Code Form
以 EPL-2.0 提供于 <https://github.com/0xlxx/ggn-layout>（对应发布 tag `v<version>`）。

**来源范围**（哪些内容源自 ELK）：

- `src/**` 的算法实现：`org.eclipse.elk.alg.layered`（`p1..p5` 各阶段处理器）与
  `org.eclipse.elk.alg.{force,rectpacking,topdownpacking,spore,radial,vertiflex,disco,mrtree}`、
  `org.eclipse.elk.core.util`（box/fixed/random）的 1:1 TypeScript 移植；
  移植保持类名、方法名、变量名与算法结构一致，以便逐行对照。
- `shared/**`：`shared/elkgraph-builder.ts`（ELK `ElkGraphImporter` / `LGraphUtil` 建图逻辑的
  1:1 移植）与 `shared/opt-map.ts`（ELK 选项 id / 类型映射的对照表）。
- `src/options/**`：ELK `CoreOptions` / `LayeredOptions` 等选项定义（选项 id、类型、默认值）的对照表。
- `tests/oracle/**`、`test-resources/**`：ELK 官方测试用例与公开模型集合派生/校验的图模型与期望输出。
- `docs/reference/**`：ELK 官方文档（算法结构、选项机制、JSON 格式、间距选项等）的移植/导读。

**本仓库自有内容**：构建/发布工程（`scripts/**`、`.github/**`、`tsdown.config.ts` 等）、
文档与示例、`package.json` 等包元数据，均为 GGN 项目新增，以 MIT 授权（见 [`LICENSE`](LICENSE)）。

`src/**` 与 `shared/**` 的实现代码一律按 ELK 衍生作品以 **EPL-2.0** 授权。这些文件里也含
GGN 新增的整合代码（例如对外 API 组装、worker 外壳），但它们与移植代码同在编译单元内，
按文件统一以 EPL-2.0 分发可以消除「同一文件混标两种许可」的错标风险。

### 声明落在哪里

- **源文件**：`src/**` 与 `shared/**` 的每个 `.ts` 文件首部都带
  `SPDX-License-Identifier: EPL-2.0` 与 ELK 归属行；无法承载注释头的
  `src/api/layout-input.schema.json` 在上文「来源范围」登记。
  `scripts/check-license-headers.mjs` 在 CI 中强制校验（漏标、错标、未登记的非 `.ts`
  文件都会让 CI 变红），并顺带校验 `dist/**` 产物 banner 与许可口径文件的一致性。
- **发布产物**：`dist/**` 每个 chunk 顶部带归属 banner（由 `tsdown.config.ts` 的 `banner`
  注入，`minify` 不会吃掉它）。
- **包元数据**：`package.json` 的 `license` 为 `(MIT AND EPL-2.0)` —— 由于本包把两种许可的
  代码打在一起分发，消费方需要**同时**满足 MIT 与 EPL-2.0 的义务。

> 注意：`src/**` 中的算法实现属 ELK 的**衍生作品**，因此对这些文件的重新分发需满足 EPL-2.0 的
> 义务（保留版权与许可声明、以 EPL-2.0 授权该等文件、提供获取源码的途径等）。EPL-2.0 允许
> 与其他许可（此处为 MIT）的独立模块组合分发（"Secondary License"/separate module 机制）。
> 下游使用者如要再分发，请自行复核 EPL-2.0 义务。

## Test Models

Some files under `test-resources/` are graph models and expected outputs that
originate from ELK test suites or public research/industry model collections.
Their original attribution and license terms remain with the upstream sources.

具体地，`tests/oracle/**` 的 `elkt` 测试图数据源自 ELK 官方测试集
（Copyright (c) 2018 Kiel University 及贡献者），该数据集未随 `elkjs` 或
ELK v0.12.0 发布包分发；期望坐标由 `elkjs` 0.12.0 运行时生成并校验。
