# 贡献指南

感谢参与 `ggn-layout`。本包是 Eclipse Layout Kernel (ELK) Layered 的 1:1 TypeScript 移植，
移植约定与许可义务见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。

## 环境

- **运行时**：Node ≥ 22.18（构建工具 `tsdown` 的要求）；包本身在 Node ≥ 20 上运行。
- **包管理器**：Bun `1.3.14`（见 `packageManager` 字段）。

```sh
bun install
bun run demo          # 本地 demo
```

## 提交前必须通过的门禁

```sh
bun run typecheck            # 类型
bun run test:ci              # 单测 + BDD + 契约（跳过生成的 oracle 批）
bun run test:cross-engine    # JavaScriptCore 复跑纯算法用例（拦跨引擎顺序漂移）
bun run build                # 产物
bun run smoke:pack           # 产物可被干净消费方全入口消费 + 体积分层
bun run check:pkg            # publint + 子路径类型解析
```

CI 在 Node 20/22 矩阵与 Bun 上复跑这些门禁；提 PR 前本地跑一遍可以省一轮往返。

## 修改规则

1. **移植代码保持 1:1**：`src/**` 下与 ELK 对应的类名、方法名、变量名、阶段划分不要"顺手优化"或重命名，
   以便逐行对照上游。要偏离上游，必须在 `docs/PORTING.md` 记录原因与差异点。
2. **公共契约变更要同步文档**：`README.md`、`docs/API.md`、`docs/API-QUICKREF.md`、`CHANGELOG.md`
   与 `llms.txt` 都是发布物的一部分。
3. **新增公共符号不要用 `ELK`/`Elk` 命名**：实现来源不作为调用层级暴露给消费方。
4. **算法行为改动必须带 oracle 证据**：说明对照的是 `elkjs` 哪个版本、差分结果如何。
5. **提交信息**用 Conventional Commits（`feat:` / `fix:` / `docs:` / `ci:` / `chore:`），描述用中文即可。

## 发布流程（维护者）

`release.yml` 走 npm **Trusted Publishing（OIDC）**，不需要、也不应配置长期 npm token。
npm 包侧（Settings → Trusted Publisher）需要登记：

- Publisher: GitHub Actions
- Repository: `0xlxx/ggn-layout`
- Workflow: `.github/workflows/release.yml`
- Environment: `npm`（与 `release.yml` 的 `environment: npm` 一致）

```sh
# 1. 更新 CHANGELOG.md，提交并在 main 上通过 CI
# 2. 打 tag 触发 release.yml（Trusted Publishing + provenance）
git tag -a v0.1.2 -m "ggn-layout 0.1.2"
git push origin v0.1.2
```

`release.yml` 分成两个 job，职责按「谁会执行仓库代码」切开：

- **`build`**（`contents: read`，**没有** `id-token`）：装依赖（`bun install` 会执行 devDependency
  的 `postinstall`）、跑全部门禁、`npm pack` 出唯一交付物 `ggn-layout-package.tgz` 并上传 artifact。
  即使某个依赖的安装脚本被污染，它在这里也换不到 npm 身份。
- **`publish`**（`contents: write` + `id-token: write`，`environment: npm`）：**不** checkout 源码、
  **不**装依赖、**不**跑构建脚本，只对上面那个 tarball 调 `npm publish <tgz> --provenance`。
  npm 按 tarball 发布时不会执行包内的 lifecycle 脚本，故 OIDC 身份不会经手仓库代码。

发布前的门禁在 `build` 里跑：`check:workflows`（两份工作流的 `NPM_VERSION` 必须一致且为精确版本；
并断言 `publish` job 不 checkout、只有它持有 `id-token`）、`typecheck`、`verify:public-api`
（导出集合与 `docs/api-manifest.json` 对账）、`test:ci`、`build`、`smoke:pack`。

tag 路径另有两道校验：

- 「tag 名 == `package.json` 版本」；
- 「被打 tag 的提交是 `origin/main` 的祖先」—— `ci.yml` 只监听 main 上的 push/PR，从侧分支打一个
  `v*` tag 本来可以绕过全部门禁，这道校验把该路径封掉。

若该版本**已在 registry**：工作流先取「来源提交」，与当前提交比对 —— 一致则跳过 `npm publish`、
只补建 GitHub Release（用于给历史版本补 tag）；不一致则直接失败，避免产出一张「Release 指向的
提交与 npm 内容不符」的记录。来源提交按可信度取两个源：

- 优先读 **SLSA provenance**（由 GitHub OIDC 签发、签名不可伪造）。发布 job 不 checkout 源码，
  npm 无从推断 `gitHead`，`npm publish <tarball>` 产出的版本 `gitHead` 为空（`0.1.2` 实测）——
  此时 provenance 的 `resolvedDependencies[].digest.gitCommit` 是唯一还能证明来源的字段。
- 没有 provenance 时，回退到未签名的 `gitHead`（`0.1.0` 属此类）。

该校验逻辑**内联**在工作流里、不调用仓库脚本 —— 发布 job 持有 `id-token`，执行仓库存放的脚本
等于把 npm 身份交给该提交的代码。`v*` tag 另有 tag ruleset 保护，禁止移动与删除。

`workflow_dispatch` 的 dry-run 只演练构建、打包与 `npm publish --dry-run --provenance`：
它**不**与 npm 交互、不校验 Trusted Publisher 绑定、不产生 attestation。dry-run 绿不等于
发布链可用 —— 首次真实 tag 发布才是 OIDC 的第一次实测。

手工发布（仅 Actions 不可用时）：

```sh
bun run build && npm publish
```

注意：本地手工发布**不会**产生 provenance 证明，且 `prepublishOnly` 会重跑全部门禁。
