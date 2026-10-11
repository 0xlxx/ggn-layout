## 这个 PR 做了什么

<!-- 一两句话说明动机与结果 -->

## 类型

- [ ] 修复（fix）
- [ ] 新能力（feat）
- [ ] 移植/算法调整（说明对照的 `elkjs` 版本与差分证据）
- [ ] 文档 / 工程 / CI

## 自检清单

- [ ] `bun run typecheck` 通过
- [ ] `bun run test:ci` 通过（涉及纯算法时另跑 `bun run test:cross-engine`）
- [ ] `bun run build && bun run smoke:pack` 通过（涉及 `exports`/产物/依赖时必跑）
- [ ] `bun run check:pkg` 通过（涉及 `package.json` 元数据时必跑）
- [ ] 公共契约变更已同步 `README.md` / `docs/API*.md` / `llms.txt`
- [ ] 行为变化已写入 `CHANGELOG.md` 的 `[Unreleased]`
- [ ] 移植代码的类名/方法名/变量名保持与上游一致（如有偏离已在 `docs/PORTING.md` 记录）

## 备注

<!-- 破坏性变更、迁移提示、已知取舍 -->
