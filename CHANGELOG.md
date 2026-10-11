# Changelog

本文件记录 `ggn-layout` 面向使用者的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（0.x 期间仍可能出 breaking change，会在下方标注）。

## [Unreleased]

### 变更

- 发布工程加固：`prepublishOnly` 末尾追加打包产物冒烟（`smoke:pack`）；显式声明
  `publishConfig`（`registry=https://registry.npmjs.org/`、`access=public`）；CI 中的
  `publint` 与 `@arethetypeswrong/cli` 锁定到具体版本。
- 第三方许可声明补全：`THIRD_PARTY_NOTICES.md` 增加 ELK 版权归属、SPDX 标识
  （`EPL-2.0 OR GPL-3.0-or-later`）与 `elkt` 测试数据的来源与版权。
- CI/发布链路加固：GitHub Actions 由可变 tag 改为 **pin commit SHA**；`prepublishOnly`
  追加 `check:pkg`（`publint` + 严格版类型解析门禁），手工发布不再绕过包元数据检查。
- 类型解析门禁改为 `scripts/check-attw.mjs`：只豁免 `node10`（EOL）列的 `NoResolution`，
  此前用 `--ignore-rules no-resolution` 属于整体抑制，会让真实子路径错误一并变绿。
- 补齐仓库治理文件：`SECURITY.md`（私密漏洞上报 + 威胁模型）、`CONTRIBUTING.md`、
  `.github/CODEOWNERS`、PR 模板与 Bug issue 模板。

## [0.1.0]

首个公开发布（从 GGN monorepo 拆出的独立包）。

### 新增

- `layoutElkJson(input, options?)`：标准图 JSON → 带节点几何与边 `sections` 的新 JSON；纯函数、默认 `randomSeed` 为 1。
- 复合能力：`layoutJsonBatch`（批量 + 逐项隔离）、`diffLayout` / `layoutJsonDiff`（布局差异）、
  `control: { signal, onProgress }`（进度 + 合作式取消）。
- `responseFormat` 三档输出：`full` / `concise` / `summary`；`pick` 追加保留节点字段。
- 子路径入口：`ggn-layout/api`、`ggn-layout/core`、`ggn-layout/options`、`ggn-layout/layered`、`ggn-layout/layout-worker`；
  每个入口提供 ESM + CJS 产物与各自的 `.d.ts`/`.d.cts`。
- `ggn-layout/layout-input.schema.json`：`LayoutInput` 的 JSON Schema (draft-07)。
- 结构化错误：`LayoutError` / `LayoutErrorCode` / `validateLayoutInput` / `assertValidLayoutInput`。
- 已移植 14 个 ELK Java 0.12.0 布局算法：layered（默认）+ box/fixed/random/stress/force/rectpacking/
  topdownpacking/sporeoverlap/sporecompaction/radial/vertiflex/disco/mrtree（完整入口注册）。

### 说明

- 本包是 Eclipse Layout Kernel (ELK) Layered 的 TypeScript 1:1 移植；第三方许可与来源范围见
  [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)，EPL-2.0 全文见 [`LICENSES/EPL-2.0.txt`](LICENSES/EPL-2.0.txt)。
- 已知有意差异：为消除比较器不自洽导致的层内顺序跨 JS 引擎漂移，
  `ModelOrderBarycenterHeuristic` 的传递关联记录方向与 ELK Java 相反（见 `docs/PORTING.md` §6.17）。

[Unreleased]: https://github.com/0xlxx/ggn-layout/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/0xlxx/ggn-layout/releases/tag/v0.1.0
