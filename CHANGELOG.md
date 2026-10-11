# Changelog

本文件记录 `ggn-layout` 面向使用者的变更。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（0.x 期间仍可能出 breaking change，会在下方标注）。

## [Unreleased]

## [0.1.2]

### 变更（无破坏性改动）

- **LayoutInput JSON Schema 迁出 `src/`**：源码由 `src/api/layout-input.schema.json` 移到
  `schema/layout-input.schema.json`。公开子路径 `ggn-layout/layout-input.schema.json` 与内容
  都不变，只是把它从「实现代码目录」挪到「机器可读契约目录」——schema 不是 ELK 移植实现，
  放在 `src/**` 里会被许可头扫描当成 EPL-2.0 实现文件登记，语义错位。`files` 白名单、
  `check:license` 的扫描范围（新增 `schema/`）与文档中的路径同步更新。
- `ggn-layout/core` 子路径的源文件由 `src/internal.ts` 改名为 `src/core.ts`，`exports` 目标
  随之由 `dist/internal.*` 变为 `dist/core.*`。公开子路径名、导出符号集合、ESM/CJS/类型三者
  的对外形态都不变（由 `verify:public-api` 与契约测试覆盖）。此举只消除「对外叫 core、实现
  文件叫 internal」的命名错位。深度导入 `ggn-layout/dist/internal.js` 属未承诺路径。
- 构建配置显式声明 `sourcemap: false`，不再依赖工具默认值。取舍与理由写进 README 的「开发」
  一节：发布产物不含 `.map`，避免把整份 ELK 衍生源码与绝对路径打进 tarball。

### 修复

- 发布产物归属 banner 补两行版权声明：GGN 侧 `Copyright (c) 2026 GGN contributors.`，上游侧
  `Copyright (c) Kiel University and others`。0.1.1 的 banner 只有许可标识与来源说明，缺版权
  持有人行——EPL-2.0 §3.1 与 REUSE 惯例都要求版权声明随制品分发。

### 工程 / 发布链路（不影响制品内容）

- `release.yml` 拆成 `build` 与 `publish` 两个 job。此前单个 job 的 `id-token: write` 覆盖整条
  构建链（`bun install` 会执行 devDependency 的 `postinstall`），被污染的开发依赖可以换取
  OIDC 身份自行发布，且 provenance 还会为其背书。现在：`build` 无 OIDC，产出唯一交付物
  `ggn-layout-package.tgz`；`publish` 不再 checkout 源码、不装依赖，只对 tarball 调
  `npm publish --provenance`（npm 按 tarball 发布时不执行包内 lifecycle 脚本）。
- tag 路径新增「被打 tag 的提交必须是 `origin/main` 的祖先」校验。`ci.yml` 只监听 main 上的
  push/PR，此前从侧分支打 `v*` tag 即可绕过全部 CI 直接发布。
- 新增 `check:workflows` 门禁（`ci.yml` 与 `release.yml` 的 `NPM_VERSION` 必须一致且为精确
  版本），并入 CI、`prepublishOnly` 与 release 的 `build` job。
- `verify:public-api`（导出集合 ↔ `docs/api-manifest.json` 对账）此前只存在于 `package.json`
  scripts、CI 未执行，现接入 CI 与 release 门禁。

## [0.1.1]

### 变更

- **许可口径修正**：`package.json` 的 `license` 由 `MIT` 改为 `(MIT AND EPL-2.0)`。本包是
  ELK 的衍生作品，此前只标 MIT 与事实不符。落地方式：`src/**` 与 `shared/**` 的全部 315 个
  `.ts` 文件统一加 `SPDX-License-Identifier: EPL-2.0` 头 + ELK 归属行（**不再逐文件混标** ——
  首版整改把 `src/api/**` 一律当 GGN 自有标 MIT，其中 `src/api/core-providers.ts` 实为 ELK
  `org.eclipse.elk.core.util` 的 fixed/random/box provider 移植，属错标）；`dist` 每个产物加
  归属 banner；`LICENSE`、`README.md`、`THIRD_PARTY_NOTICES.md` 与 `package.json` 统一到同一口径；
  新增 `check:license` 门禁（源码 SPDX 头 + 非 `.ts` 文件登记 + dist banner + 四份口径文件一致性）
  并接入 CI 与 `prepublishOnly`。
- 补齐 EPL-2.0 的源码可得性与归属义务：`THIRD_PARTY_NOTICES.md` 增加 §3.1(a) 源码可得性声明
  （每个发布 tag 的对应源码以 EPL-2.0 提供于本仓），不再只指向上游 `eclipse/elk`；并停止把
  294 个文件的上游版权年代统一改写成 `2010, 2015`（上游逐文件不同），改为声明持有人 + 来源登记。
- 补 `shared/**` 的归属登记与门禁覆盖：`shared/elkgraph-builder.ts`（ELK `ElkGraphImporter` /
  `LGraphUtil` 建图逻辑移植）此前既无 SPDX 头也不在 CI 扫描范围内，而它确实进入发布产物。
- **发布链路加固（复审整改）**：
  - npm 工具链固定为 `NPM_VERSION`（CI 与 `release.yml` 同步），不再用浮动 `npm@latest` ——
    发布 job 持有 `id-token` / `contents` 写权限，工具链必须可复现。
  - 「版本已发布则跳过 publish」的分支新增一致性校验：registry 记录的 `gitHead` 必须等于当前
    提交，否则拒绝创建 GitHub Release，避免产出与 npm 内容不符的发布记录。
  - `concurrency.group` 由 `github.ref` 改为 `github.repository`：tag push 与 main 上的
    `workflow_dispatch` 属于不同 ref，原先可能并发发布同一版本。
  - 仓库侧配套：`v*` tag 加 ruleset（禁移动/删除）、开启 `sha_pinning_required`、
    `npm` environment 增加必审 reviewer 与分支策略（`main` + `v*`）。
- **随包文档清理与门禁**：`docs/reference/**` 中残留的宿主 monorepo 内部路径与开发者本机
  绝对路径改为中性表述（如「宿主应用」、`<input.json>`）；`check:doc-links` 增加这两类
  模式的门禁（具体匹配规则写在脚本里），防止再次混进 npm 包。
- 治理文件补齐：新增 feature request issue 模板与 `config.yml`；`CONTRIBUTING.md` 的发布说明
  改写为与 `release.yml` 实际行为一致，并写明 Trusted Publisher 的登记项与 dry-run 的能力边界
  （dry-run 不校验 OIDC 绑定、不产生 attestation）。
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
[0.1.2]: https://github.com/0xlxx/ggn-layout/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/0xlxx/ggn-layout/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/0xlxx/ggn-layout/releases/tag/v0.1.0
