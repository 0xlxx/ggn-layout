import { defineConfig } from "vitepress";

function normalizeBase(value: string): string {
  const withLeading = value.startsWith("/") ? value : `/${value}`;
  return withLeading.endsWith("/") ? withLeading : `${withLeading}/`;
}

const repository = process.env.GITHUB_REPOSITORY?.split("/")[1];
const repositoryBase =
  repository === undefined || repository.endsWith(".github.io") ? "/" : `/${repository}/`;
const docsBase = normalizeBase(
  process.env.GGN_LAYOUT_DOCS_BASE ?? process.env.DOCS_BASE ?? repositoryBase,
);

// oxlint-disable-next-line typescript/no-explicit-any
function peleMarkdown(md: any): void {
  const fallbackFence = md.renderer.rules.fence;

  // oxlint-disable-next-line typescript/no-explicit-any
  md.renderer.rules.fence = (...args: any[]) => {
    const [tokens, index] = args;
    const token = tokens[index];

    if (token.info.trim() === "mermaid") {
      return `<PeleDiagram id="pele-${index}" graph="${encodeURIComponent(token.content)}" />`;
    }

    if (fallbackFence) return fallbackFence(...args);
    return `<pre><code>${md.utils.escapeHtml(token.content)}</code></pre>`;
  };
}

export default defineConfig({
  title: "ggn-layout",
  description: "ELK 0.12.0 的 TypeScript 布局引擎：算法、参数、架构与 API",
  lang: "zh-CN",
  base: docsBase,
  cleanUrls: true,
  lastUpdated: true,
  srcExclude: [
    "README.md",
    "ALGORITHMS.md",
    "API.md",
    "API-QUICKREF.md",
    "ELK-ALGORITHM-OVERVIEW.md",
    "NON-LAYERED-PORTING.md",
    "PORTING.md",
    "incremental-layout.md",
    "reference/README.md",
    "reference/elk-algorithm-catalog.md",
    "reference/elk-algorithm-guide.md",
    "reference/elk-edge-routing-investigation.md",
    "reference/elk-json-format.md",
    "reference/elk-layout-options-mechanism.md",
    "reference/elk-layout-options.md",
    "reference/elk-node-labels.md",
    "reference/elk-spacing-options.md",
    "reference/elkjs-feature-coverage.md",
  ],
  head: [["meta", { name: "theme-color", content: "#2563eb" }]],
  themeConfig: {
    nav: [
      { text: "指南", link: "/guide/getting-started" },
      { text: "架构", link: "/architecture/" },
      { text: "算法", link: "/algorithms/" },
      { text: "参数", link: "/reference/options" },
      { text: "最佳实践", link: "/best-practices/" },
      { text: "API", link: "/api/" },
    ],
    sidebar: [
      {
        text: "开始",
        items: [
          { text: "ggn-layout 是什么", link: "/" },
          { text: "快速开始", link: "/guide/getting-started" },
          { text: "图模型与坐标", link: "/guide/concepts" },
          { text: "输入输出契约", link: "/guide/io-contract" },
        ],
      },
      {
        text: "整体架构",
        items: [
          { text: "自顶向下看架构", link: "/architecture/" },
          { text: "模块与调用链", link: "/architecture/execution" },
          { text: "Layered 五阶段", link: "/architecture/layered-pipeline" },
        ],
      },
      {
        text: "布局算法",
        items: [
          { text: "算法选型", link: "/algorithms/" },
          { text: "Layered", link: "/algorithms/layered" },
          { text: "Box", link: "/algorithms/box" },
          { text: "Fixed", link: "/algorithms/fixed" },
          { text: "Rectangle Packing", link: "/algorithms/rectpacking" },
          { text: "Top-down Packing", link: "/algorithms/topdownpacking" },
          { text: "Force / Stress", link: "/algorithms/force-stress" },
          { text: "Mr. Tree / Radial", link: "/algorithms/tree-radial" },
          { text: "其他算法", link: "/algorithms/other" },
        ],
      },
      {
        text: "参数参考",
        items: [
          { text: "核心参数地图", link: "/reference/options" },
          {
            text: "完整选项表（GitHub）",
            link: "https://github.com/0xlxx/ggn-layout/blob/main/docs/reference/elk-layout-options.md",
          },
          {
            text: "间距语义（GitHub）",
            link: "https://github.com/0xlxx/ggn-layout/blob/main/docs/reference/elk-spacing-options.md",
          },
          { text: "与 ELK 官方交叉验证", link: "/reference/upstream" },
        ],
      },
      {
        text: "最佳实践",
        items: [
          { text: "布局调优清单", link: "/best-practices/" },
          { text: "Empty / Junction node", link: "/best-practices/empty-junctions" },
          { text: "约束与稳定顺序", link: "/best-practices/constraints" },
          { text: "增量与交互布局", link: "/best-practices/incremental" },
        ],
      },
      {
        text: "API",
        items: [
          { text: "公开 API", link: "/api/" },
          { text: "TypeDoc 全文", link: "/api/typedoc/index.html" },
        ],
      },
      {
        text: "深入维护",
        items: [
          {
            text: "JSON 格式（GitHub）",
            link: "https://github.com/0xlxx/ggn-layout/blob/main/docs/reference/elk-json-format.md",
          },
          {
            text: "算法移植说明（GitHub）",
            link: "https://github.com/0xlxx/ggn-layout/blob/main/docs/ALGORITHMS.md",
          },
          {
            text: "增量布局设计（GitHub）",
            link: "https://github.com/0xlxx/ggn-layout/blob/main/docs/incremental-layout.md",
          },
          {
            text: "移植差异（GitHub）",
            link: "https://github.com/0xlxx/ggn-layout/blob/main/docs/PORTING.md",
          },
        ],
      },
    ],
    search: { provider: "local" },
    outline: { level: [2, 3], label: "本页" },
    docFooter: { prev: "上一篇", next: "下一篇" },
    returnToTopLabel: "回到顶部",
    sidebarMenuLabel: "目录",
    darkModeSwitchLabel: "主题",
    socialLinks: [{ icon: "github", link: "https://github.com/0xlxx/ggn-layout" }],
    footer: {
      message: "MIT AND EPL-2.0",
      copyright: "ggn-layout",
    },
  },
  markdown: {
    config: peleMarkdown,
    theme: { light: "github-light", dark: "github-dark" },
  },
});
