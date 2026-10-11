# ggn-layout

把标准图 JSON 布局成带节点几何、端口位置和边 `sections` 的新 JSON；普通消费方只需要一个纯函数入口。

## 安装

```sh
npm install ggn-layout
# 或
pnpm add ggn-layout
```

## 最小示例

```ts
import { layoutElkJson } from 'ggn-layout'
const input = { id: 'root', children: [{ id: 'A' }, { id: 'B' }], edges: [{ id: 'A-to-B', sources: ['A'], targets: ['B'] }] }
const output = layoutElkJson(input)
console.log(output.children, output.edges?.[0]?.sections)
```

## 文档导航

- [`docs/API-QUICKREF.md`](docs/API-QUICKREF.md)：单页速查，适合首次调用和 AI agent。
- [`docs/API.md`](docs/API.md)：完整输入、输出、坐标模式和验证说明。
- [`llms.txt`](llms.txt)：机器优先的入口、路径和错误契约索引。
- [`examples/`](examples/)：可用 `bun examples/basic.ts` 直接运行的 basic、nested、coords-modes 示例。

## API 契约要点

- **主入口**：`layoutElkJson(input, options?)` 是面向消费方的高层 API；输入是标准图 JSON，返回全新对象。复合能力：`layoutJsonBatch`（批量+逐项隔离）、`diffLayout`/`layoutJsonDiff`（布局差异）、`control: { signal, onProgress }`（进度+合作式取消）。
- **纯函数**：不会修改传入的 `input`；同一输入与同一选项在同一版本下结果确定，默认 `randomSeed` 为 `1`。
  CI 在 V8（Node 20/22）与 JavaScriptCore（Bun）双引擎上复跑纯算法单测，用于拦截「结果依赖引擎排序实现」的顺序漂移；跨引擎断言的范围是那批纯算法用例，不等同于对全部输出做逐位比对。
- **失败方式**：非法输入或不支持的算法抛出结构化 `LayoutError`，可读取 `code`、`path`、`retryable` 和可选 `phase/details`。
- **输出形态**：`responseFormat` 三档——`full`（默认，完整保真 JSON）、`concise`（只留节点几何 + 边端点，省 token）、`summary`（扁平摘要 `{nodes, edges}`，不含 root 自身、只含已路由边）。`pick` 仅在 `full` 下追加保留的节点字段。
- **类型收紧**：`direction` 为 `'RIGHT'|'LEFT'|'DOWN'|'UP'` 字面量联合（持 `string` 变量的旧调用需收窄类型）；新增 `LayoutInput`/`LayoutOutput`/`LayoutSummary` 类型（命名不含 ELK）。
- **命名说明**：公共入口沿用标准 JSON 生态中的 `layoutElkJson` 与相关类型；新增公共符号、文件名和技能名不使用 `ELK`/`Elk`，以避免把实现来源误当成调用层级。
- **边界**：内部 `LGraph`、`LNode`、provider 和属性模型不属于消费方公共契约；历史 `src/index.ts` 仅作为仓库兼容入口保留。

## 子路径导入

按使用层级选择发布入口：

- ggn-layout：兼容根入口，包含高层 API 与历史内部导出。
- ggn-layout/api：高层布局 API、校验、错误和布局输入/输出类型。
- ggn-layout/core：引擎内部模型与低层组装原语。
- ggn-layout/options：稳定选项类型、HIERARCHY_HANDLING 以及算法识别工具。
- ggn-layout/layered：仅分层算法（ELK Layered）入口，不打包其余算法。
- ggn-layout/layout-worker：Web Worker 外壳，`import` 即自动接管 `self.onmessage`。
- ggn-layout/layout-input.schema.json：机器可读的 LayoutInput JSON Schema（draft-07）。

普通消费方优先使用 ggn-layout 或 ggn-layout/api；只有需要引擎级能力时才使用 core。
六个 JS 入口都提供 ESM + CJS 双份产物与各自的 `.d.ts`/`.d.cts` 类型。

## 开发

```sh
bun install
bun run typecheck
bun run test:ci
bun run build
bun run smoke:pack   # 打包产物门禁: 装进临时消费方跑完整/layered 双入口 (ESM+CJS)
```

`test:ci` 会跳过体量很大的 `tests/oracle/generated/**` 批次，但覆盖其余单元、BDD
和契约测试。完整测试可用 `bun run test:run`。第二套引擎（JavaScriptCore/Bun）用
`bun run test:cross-engine`；包元数据用 `npx publint` 与 `npx @arethetypeswrong/cli --pack .` 检查。

## 发布

```sh
bun run build
npm publish
```

`prepublishOnly` 会再次构建发布产物。正式发布会走
[`.github/workflows/release.yml`](.github/workflows/release.yml)：打 `v*` tag 后由
GitHub Actions 以 npm Trusted Publishing（OIDC）发布并附带 provenance 证明。
手工发布仅在 Actions 不可用时使用。

## 许可证

MIT。项目是 Eclipse Layout Kernel (ELK) Layered 的 TypeScript 移植，
移植来源、测试数据和第三方许可说明见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
