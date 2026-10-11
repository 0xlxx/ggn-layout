# Changelog

本文件记录 `ggn-layout` 面向使用者的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（0.x 期间仍可能出 breaking change，会在下方标注）。

## [Unreleased]

## [0.1.1]

### 变更

- **许可口径修正**：`package.json` 的 `license` 由 `MIT` 改为 `(MIT AND EPL-2.0)`。本包是
  ELK 的衍生作品（`src/**` 中 294 个文件为 1:1 移植，属 EPL-2.0），此前只标 MIT 与事实不符。
  同时给全部 `src/**` 文件补 SPDX 头（ELK 衍生 → `EPL-2.0`、GGN 自有 → `MIT`）、给每个
  `dist` 产物加归属 banner，并新增 `check:license` 门禁（CI + `prepublishOnly`）防止新增文件漏标。
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
- 修复随包文档的 14 处包内断链：`docs/reference/**` 的 `../README.md` 实际指向不存在的
  `docs/README.md`（改为 `../../README.md`）、`../docs/API.md` 改为 `../API.md`、两个指向本仓不存在的
  `docs/design/*` 的链接改为纯文本、README 里的 `release.yml` 改为绝对 GitHub URL。
  新增 `check:docs` 门禁：以 `npm pack` 的真实清单校验随包文档的相对链接，防止回归。
- **修复发布链路阻断缺陷**：`npm pack --json` 在 npm 12 由**数组**改为**按包名索引的对象**，
  而 `smoke:pack` 仍按数组解构，导致 `release.yml`（Node 24 + `npm@latest`）在冒烟步骤直接失败。
  新增 `scripts/npm-utils.mjs` 的 `parsePackJson()` 归一化两种结构，并在 CI 增加 `pack-npm-latest` 作业用
  「发布同款环境」复跑产物门禁，避免 CI 绿而 release 红。
- `release.yml` 的「该版本尚未发布」守卫改为只在真正发布时生效：`workflow_dispatch` 的
  `dry-run` 现在能完整演练到 `npm publish --dry-run --provenance` 这一步。
- **修复 `npm publish` 下嵌套 npm 调用的环境泄漏**：npm 会把自身配置以 `npm_config_*` 注入子进程，
  于是 `prepublishOnly` 里嵌套的 `npm pack` 在 `--dry-run` 下**静默不产出 tarball**，
  连带 `smoke:pack` / `check:pkg` 失败。新增 `scripts/npm-utils.mjs` 的 `npmEnv()`
  隔离 `npm_config_dry_run` / `npm_config_provenance` 后再嵌套调用 npm。
- **修复 `check:pkg` 的同类环境泄漏**：`check:pkg` 里裸写的 `npx --yes publint` 同样继承
  `npm_config_dry_run=true`，导致 `npm publish --dry-run` 的 `prepublishOnly` 卡在
  `ENOENT .../_npx/<hash>/package.json`（npx 只建目录不装包）。改为 `scripts/check-publint.mjs`，
  与其余三处统一走 `npmEnv()`。
- **修复 `check:attw` 的 64 KiB 截断偶发**：Node 同步 spawn 在输出超过管道容量时可能截断 stdout，
  attw 的 `--format json` 约 130 KB，实测 20 次挂 5 次且总是恰好截到 65536 字节。新增
  `captureStdout()` 把子进程 stdout 直接重定向到文件、绕开管道，`check-attw` / `check-doc-links` /
  `smoke:pack` 三处统一改用。
- **发布工作流不再因重复版本变红**：`release.yml` 探测到该版本已在 registry 时跳过 `npm publish`、
  但仍创建 GitHub Release；`workflow_dispatch` 的 dry-run 改用一次性版本号
  `0.0.0-dryrun.<run_id>` 演练，使演练可以真正跑完。
- 仓库清理：内部开发过程文档（`PROGRESS.md`、`AGENTS.md`、`plans/`、`docs/clusters/` 等）移出公开仓，
  并清除文档里泄漏的本机绝对路径。`docs/PORTING.md`、`docs/reference/**`、`SKILL.md` 等
  面向使用者/贡献者的文档保留。

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
[0.1.1]: https://github.com/0xlxx/ggn-layout/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/0xlxx/ggn-layout/releases/tag/v0.1.0
