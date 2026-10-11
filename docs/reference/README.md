# 参考资料

> **Status**: 🟢 Active
> **Last Updated**: 2026-09-10
> **Parent**: [文档索引](../README.md)
> **Objective**: 参考资料 目录的入口索引（按文档职责与状态汇总）。


| 文档 | 职责 | 状态 |
| :--- | :--- | :--- |
| [ELK 布局算法目录（模块 × 用途 × 决策树 × 协作模型）](./elk-algorithm-catalog.md) | 枚举 `ggn-layout` 已移植的全部 14 个 ELK Java 0.12.0 布局算法模块，给出每个模块的官方用途、适用场景、协议暴露状态，并沉淀「场景 → 算法」决策树与「模块如何协作」模型，供使用者选型与维护者查表。 | 🟢 |
| [ELK 算法实现指南（结构 / 接口，ELK Java 0.12.0 → ggn-layout）](./elk-algorithm-guide.md) | 移植 ELK Java 官方「算法结构 / 直接使用算法」指南到本项目——布局阶段、中间处理器、算法装配、Provider 入口四大接口概念与 TS 移植一一对应，供维护者按同一套结构理解与扩展算法。 | 🟢 |
| [ELK 边路由拐角调研（Java 对照 · 参数矩阵 · 结构优化）](./elk-edge-routing-investigation.md) | 回答「图里拐角很多」的三个问题——ggn-layout 是否劣于原生 ELK Java、是否存在最优参数、算法层还有多少优化空间——并给出可执行建议与复现路径。 | 🟢 |
| [ELK JSON 图格式指南（ELK Java → ggn-layout）](./elk-json-format.md) | 移植 ELK Java「JSON Format」图格式指南——节点 / 端口 / 标签 / 边 / 边段五种基本元素与导入导出 API，并注明本移植的针对性差异（校验、超边、输出形态）。 | 🟢 |
| [ELK 布局选项机制指南（IProperty / PropertyHolder，ELK Java → ggn-layout）](./elk-layout-options-mechanism.md) | 移植 ELK Java「Layout Options」机制指南——`IProperty` / `IPropertyHolder` 的读 / 写 / 查语义、同 id 不同默认值、内部属性约定，与 TS 移植的 `Property` / `MapPropertyHolder` 一一对应。 | 🟢 |
| [ELK 布局选项接口参考（ELK Java 0.12.0 → ggn-layout）](./elk-layout-options.md) | 移植 ELK Java 0.12.0 布局选项接口（CoreOptions / LayeredOptions）到本项目的权威对照表——选项键、TS Property、类型、默认值一一对应；供 `kernel:layout` 接线与消费方查表。 | 🟢 |
| [ELK 节点标签最佳实践与 GGN 映射（Node Labels）](./elk-node-labels.md) | 对照 ELK 官方博文《Node Labels》（2025-08-22），记录 GGN kernel 的标签预留策略、与官方建议的逐条符合度、以及有意偏离（reservation-only label）的理由与风险控制。 | 🟢 |
| [ELK 间距选项指南（Spacing Options，ELK Java → ggn-layout）](./elk-spacing-options.md) | 移植 ELK Java「Spacing Options」指南——间距成对语义、base value、个体间距覆盖与 margin/padding 正交关系，对应到 TS 的 `Spacings` 表与 `LayeredSpacingsBuilder`。 | 🟢 |
| [elkjs 0.12.0 特性覆盖审计（ggn-layout 测试对照）](./elkjs-feature-coverage.md) | 枚举 elkjs 0.12.0 的对外特性（算法 / 能力旗标 / JSON 图格式 / 选项 / API 面），逐项对照 ggn-layout（`本仓库`）的测试覆盖，给出覆盖结论与差距清单。 | 🟢 |
| [参考资料](./README.md) | 参考资料 目录的入口索引（按文档职责与状态汇总）。 | 🟢 |
