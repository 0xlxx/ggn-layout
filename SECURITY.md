# 安全政策

## 支持范围

只有 npm `ggn-layout` 的**最新已发布版本**接收安全修复；旧版本请先升级再反馈。

## 私密上报漏洞

**请不要用公开 issue 报告安全问题。** 请使用 GitHub 的私密漏洞报告通道：

<https://github.com/0xlxx/ggn-layout/security/advisories/new>

我们会在 7 天内确认收到，并在修复版本发布后于同一 Security Advisory 中披露。

## 威胁模型（本包的边界）

`ggn-layout` 是纯计算库：不发起网络请求、不读写文件系统、不 `eval` 用户输入。
由此，真正需要关注的问题集中在：

- **拒绝服务**：恶意/极端图输入导致内存爆炸、无限循环或长时间挂起（`layoutJsonBatch`、嵌套 compound 图尤其相关）。
- **输出正确性**：结果为 `NaN`/`Infinity`/越界坐标，可能让消费方渲染器崩溃。
- **`layout-worker` 入口**：import 即注册 `self.onmessage`，会接管该 Worker 的消息处理。
- **依赖链**：`dependencies` 为空（零运行时依赖），但构建/测试工具链的漏洞仍欢迎上报。

## 不在范围内

- 布局结果与 ELK Java 的**有意差异**（见 `THIRD_PARTY_NOTICES.md` 与 `docs/PORTING.md`）。
- 需要攻击者已能修改你本机源码/依赖树的问题。

## 供应链

正式发布由 `.github/workflows/release.yml` 在 GitHub Actions 中以 npm Trusted Publishing（OIDC）
发布并附带 provenance 证明；可用 `npm audit signatures` 校验。
