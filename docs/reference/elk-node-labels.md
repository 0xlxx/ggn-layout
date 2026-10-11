# ELK 节点标签最佳实践与 GGN 映射（Node Labels）

> **Status**: 🟢 Active
> **Last Updated**: 2026-09-10
> **Parent**: [文档索引](../../README.md)
> **Objective**: 对照 ELK 官方博文《Node Labels》（2025-08-22），记录 GGN kernel 的标签预留策略、与官方建议的逐条符合度、以及有意偏离（reservation-only label）的理由与风险控制。

## 1. 官方建议（博文要点）

来源：<https://eclipse.dev/elk/blog/posts/2025/25-08-22-node-labels.html>

| # | 建议 | 说明 |
| :--- | :--- | :--- |
| R1 | `nodeSize.constraints: NODE_LABELS` **必须**配 `nodeLabels.placement` | 只设 constraints 不会让父节点按标签撑尺寸——这是博文的核心论点 |
| R2 | 子节点让 ELK 撑尺寸：`nodeLabels.placement: INSIDE H_CENTER V_CENTER` | 标签尺寸参与节点尺寸计算 |
| R3 | 非居中放置会**对称留白**，可用 `nodeSize.options: ASYMMETRICAL` 关闭 | 仅对子节点有效 |
| R4 | 父节点：**只有 layered** 支持全部 placement 且为标签预留空间（不与子节点相交） | 其他算法（black-box）不预留 |
| R5 | 父节点**不支持** `ASYMMETRICAL` | 左上标签会连左侧一起预留（副作用） |
| R6 | 典型解法：自己估算标签尺寸，用 `padding` 在 ELK 外预留空间 | 博文原话「has to be solved outside of ELK」 |

## 2. GGN 的映射

| 建议 | GGN 实现 | 符合度 |
| :--- | :--- | :--- |
| R1 | 组容器同时设 `nodeLabels.placement: [INSIDE, H_CENTER, V_TOP]` + `nodeSize.constraints: [NODE_LABELS]`（宿主应用的布局服务层） | ✅ |
| R2 | **不适用**：node/edge 的标签由 kernel 预测量（`measureNode` / `measureEdgeLabelSize`）后以显式 `width/height` 传入，ELK 不做字体度量（ADR 0001） | ⚪ 有意的另一条路 |
| R3 | 不适用：容器用 `H_CENTER`，本就不产生对称留白；若未来改 `H_LEFT`，子节点可开 `ASYMMETRICAL`（移植层已实现：`src/common/node-micro-layout.ts`） | ⚪ N/A |
| R4 | 白盒 layered 依赖 ELK 原生预留；6 种 black-box（box/force/radial/stress/rectpacking/topdownpacking）由 kernel 注入 `padding.top` 手动预留 | ✅ 与 R4 一致 |
| R5 | 未使用 `ASYMMETRICAL`（容器非左对齐），与 R5 不冲突 | ✅ |
| R6 | 容器标题行的**宽度与高度都由 kernel 外置预留**：`groupTitleRowWidth` / `groupBadgeRowWidth` / `groupHeaderHeight` 计算需求，black-box 走 `reserveBlackBoxTitleWidthInPlace`（对称 padding + 二次撑宽） | ✅ 比博文示例更完整 |

## 3. 有意偏离：reservation-only label（重要）

GGN 的容器标题**不是** ELK 渲染的，而是 kernel 自己画的：

```text
ELK label（我们传 text + 实测 width/height）  →  只作「顶部预留矩形」
group-renderer（kernel）                      →  实际绘制：标题（左）· 状态（右）· 徽标（第二行）
```

- 为什么这么做：一行里要放「标题 + 状态 + 事实计数」，第二行还要放徽标——ELK 的单标签模型无法表达，而且我们要求 SVG 输出完全自控（框架无关）。
- 代价：ELK 只保证「预留 ≥ 我们给的 box」，**真实文字宽度必须 ≤ 该 box**。因此需要两条保障：
  1. **P1-b 文本实测注入**（2026-09-10）：`LayoutSceneInput.labelMeasurer` —— surface 用 canvas `measureText` 实测（宿主应用注入的 `labelMeasurer`），布局按真实字宽预留，消除估算偏差；
  2. **P3 字符级截断**（2026-09-10）：`MAX_LABEL_CHARS = 24` / `MAX_BADGE_CHARS = 16`——纯函数、与测量器无关，保证布局与渲染拿到同一字符串；被截断时挂 `<title>` 提供全文悬停提示，`SelectionContext` 仍返回全文。
- 维护约束：**不要**把 `nodeLabels.placement` 当成"实际标签位置"去改渲染；改标题行几何时同步改 `group-metrics.ts`（单一来源）。

## 4. 显式钉死的选项（防上游默认变更）

| 选项 | 值 | 理由 |
| :--- | :--- | :--- |
| `org.eclipse.elk.nodeLabels.padding` | `[top=5,right=5,bottom=5,left=5]` | 显式 = ELK 默认值；上游默认变化不再静默移动容器标题预留 |
| `org.eclipse.elk.contentAlignment` | `[H_CENTER, V_TOP]` | NODE_LABELS 撑宽容器后内容居中（对齐 Java 行为） |
| `org.eclipse.elk.padding`（black-box 容器） | `[top=28(+徽标行), 对称 left/right, bottom=15]` | 博文 R6 的 outside-ELK 预留 |

## 5. 相关实现与测试

- 预留计算：`groupTitleRowWidth` / `groupBadgeRowWidth` / `groupHeaderHeight`（宿主应用的组几何模块）
- 布局接线：`groupLabelBox` / `groupTitleMetrics` / `reserveBlackBoxTitleWidthInPlace`（宿主应用的布局服务层）
- 渲染：组渲染器与节点渲染器由宿主应用实现
- 实测注入：`labelMeasurer` → `flush(...)` → `layoutScene`
- 测试：宿主应用的布局服务、度量与模块层级测试

> 第 2-5 节的实现均在宿主应用（GGN kernel）内，不随本包发布；本包只提供 layered 布局本身
> 以及标签预留所需的几何输入。

## 6. 遗留

- 边标签（edge label）同样走预测量，但**未截断**：超长边标签仍会撑宽布局预留（后续按同一 `clampTextChars` 策略处理）。
- 组容器若改用 `H_LEFT` 左对齐，需评估 R3/R5 的对称留白；当前用 `H_CENTER` 规避。
