# 布局调优清单

## 先判断问题在哪一层

| 现象 | 优先检查 |
| --- | --- |
| 节点层顺序不对 | 分层策略、layer constraint、partition |
| 同一层左右/上下顺序不对 | P3、模型序、输入顺序 |
| 节点挤在一起 | `spacing.nodeNode`、节点 margin、端口间距 |
| 层之间太远/太近 | `nodeNodeBetweenLayers`、edge spacing |
| 边出现无意义拐角 | 端口 offset、边端点方向、正交路由 |
| 容器内部与外部节奏不一致 | 容器 padding、嵌套图选项传播 |
| 增量更新整图跳动 | interactive 四件套、旧坐标、模型序 |

## 调参顺序

1. 固定语义：方向、端口、层级、分区；
2. 固定顺序：模型序或 layer constraint；
3. 调间距；
4. 换 P4 / P5 策略；
5. 最后才考虑插入 junction / empty node。

## 不要做的三件事

- 不要用很多虚拟节点强制每一个坐标；
- 不要在端口本可自由滑动时使用 `FIXED_POS`；
- 不要把所有容器都设成黑盒后再期待跨容器边自动穿透。

## 推荐阅读

- [Empty / Junction node](/best-practices/empty-junctions)
- [约束与稳定顺序](/best-practices/constraints)
- [增量与交互布局](/best-practices/incremental)
