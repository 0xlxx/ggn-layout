---
layout: home

hero:
  name: ggn-layout
  text: TypeScript 图布局内核
  tagline: 标准 ELK JSON 进，节点坐标、端口和正交边路由出。一个纯函数，覆盖 14 个 ELK 0.12.0 算法。
  actions:
    - theme: brand
      text: 5 分钟上手
      link: /guide/getting-started
    - theme: alt
      text: 看整体架构
      link: /architecture/

features:
  - title: 一个高层入口
    details: layoutElkJson(input, options?) 负责校验、构图、算法分派、坐标投影和结果组装。
  - title: 原生 ELK 语义
    details: 保留 compound graph、端口约束、分区、模型顺序、断环、分层、交叉最小化与多种路由。
  - title: 14 个算法族
    details: Layered、Box、Fixed、Force、Stress、Rectpacking、Mr. Tree、Radial、DisCo、SPOrE 等。
  - title: 可交叉验证
    details: 算法、默认值和选项语义逐项对照 Eclipse ELK 官方 Reference。
---

## 先建立正确心智模型

`ggn-layout` 不画图，也不认识 UML、流程图或组织架构。它只接收图：

- **节点**：尺寸、位置、端口、标签、子节点；
- **边**：源、目标、标签，以及可选的路由约束；
- **布局选项**：告诉算法如何分层、如何摆放、如何路由。

```ts
import { layoutElkJson } from "ggn-layout";

const output = layoutElkJson({
  id: "root",
  layoutOptions: {
    "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
    "org.eclipse.elk.direction": "RIGHT",
    "org.eclipse.elk.edgeRouting": "ORTHOGONAL",
  },
  children: [
    { id: "api", width: 120, height: 56 },
    { id: "db", width: 120, height: 56 },
  ],
  edges: [{ id: "api-db", sources: ["api"], targets: ["db"] }],
});
```

输出仍是同一张图的 JSON，只是每个节点多了 `x`、`y`，每条边多了 `sections`。

## 推荐阅读顺序

1. [快速开始](/guide/getting-started)：跑通第一张图。
2. [图模型与坐标](/guide/concepts)：理解父子层级、端口和坐标系。
3. [自顶向下看架构](/architecture/)：知道输入从哪进、算法在哪分派。
4. [Layered 五阶段](/architecture/layered-pipeline)：理解为什么图会排成这样。
5. [最佳实践](/best-practices/)：使用 empty/junction node、分区、层约束和增量布局。

## 与 ELK 的关系

本项目的实现基线是 **ELK Java 0.12.0**，公共入口采用标准 ELK JSON 形态。算法 ID、选项键和默认值可与
[ELK Reference](https://eclipse.dev/elk/reference.html) 对照；具体差异记录在
[与 ELK 官方交叉验证](/reference/upstream)。
