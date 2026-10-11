# Third-Party Notices

This project is a TypeScript port of the layered graph layout implementation
from the Eclipse Layout Kernel (ELK).

## Eclipse Layout Kernel

- Project: Eclipse Layout Kernel (ELK)
- Website: https://www.eclipse.org/elk/
- Source: https://github.com/eclipse/elk
- License: Eclipse Public License 2.0 (EPL-2.0)

EPL-2.0 全文见 [`LICENSES/EPL-2.0.txt`](LICENSES/EPL-2.0.txt)。

**来源范围**（哪些内容源自 ELK）：

- `src/**` 的算法实现：`org.eclipse.elk.alg.layered`（`p1..p5` 各阶段处理器）与
  `org.eclipse.elk.alg.{force,rectpacking,topdownpacking,spore,radial,vertiflex,disco,mrtree}`、
  `org.eclipse.elk.core.util`（box/fixed/random）的 1:1 TypeScript 移植；
  移植保持类名、方法名、变量名与算法结构一致，以便逐行对照。
- `src/options/**`：ELK `CoreOptions` / `LayeredOptions` 等选项定义（选项 id、类型、默认值）的对照表。
- `tests/oracle/**`、`test-resources/**`：ELK 官方测试用例与公开模型集合派生/校验的图模型与期望输出。
- `docs/reference/**`：ELK 官方文档（算法结构、选项机制、JSON 格式、间距选项等）的移植/导读。

**本仓库自有内容**：对外 API 设计（`layoutElkJson` 等）、校验与错误契约、worker 外壳、
构建/发布工程与本文档，均为 GGN 项目新增，以 MIT 授权（见 [`LICENSE`](LICENSE)）。

> 注意：`src/**` 中的算法实现属 ELK 的**衍生作品**，因此对这些文件的重新分发需满足 EPL-2.0 的
> 义务（保留版权与许可声明、以 EPL-2.0 授权该等文件、提供获取源码的途径等）。EPL-2.0 允许
> 与其他许可（此处为 MIT）的独立模块组合分发（"Secondary License"/separate module 机制）。
> 下游使用者如要再分发，请自行复核 EPL-2.0 义务。

## Test Models

Some files under `test-resources/` are graph models and expected outputs that
originate from ELK test suites or public research/industry model collections.
Their original attribution and license terms remain with the upstream sources.
