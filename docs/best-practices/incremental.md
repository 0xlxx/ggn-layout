# 增量与交互布局

增量布局不是“算法记住上一帧”，而是调用方把上一轮坐标和新结构一起交给布局器。

## 四件套

```json
{
  "org.eclipse.elk.interactiveLayout": true,
  "org.eclipse.elk.layered.layering.strategy": "INTERACTIVE",
  "org.eclipse.elk.layered.cycleBreaking.strategy": "INTERACTIVE",
  "org.eclipse.elk.layered.crossingMinimization.semiInteractive": true
}
```

节点旧位置：

```json
{
  "org.eclipse.elk.position": "(120, 80)"
}
```

或直接在输入节点提供 `x` / `y`。

## 新节点没有旧坐标怎么办

不要全部塞到 `(0,0)`。实用策略：

- 新节点在前驱右侧；
- 新节点在后继左侧；
- 没有邻居时追加到当前图最右列；
- 给新节点一个临时 `position`，让 P3 至少有稳定顺序提示。

## 稳定性边界

- 只加元数据：布局应稳定；
- 只加无关节点：旧节点应尽量不动；
- 新增容器：父层尺寸变化，相关节点会移动；
- 新增跨层边：层级约束改变，可能需要重排；
- 改节点尺寸：下游通常需要让位。

增量布局保证“尽量少变”，不是“任何结构变化都零位移”。

## 推荐流程

1. 保存上一轮布局结果；
2. 把旧坐标写回节点；
3. 新节点按邻居推导种子；
4. 注入 interactive 四件套；
5. 对比新旧 `diffLayout`，观察实际位移。
