/**
 * ElkGraphImporter 的 MODEL_ORDER 赋值等价步骤 (对应 ELK graph.transform.ElkGraphImporter).
 *
 * ELK Java 在 import 时给节点/边按读取顺序赋 MODEL_ORDER (节点按图 0..n, 边按图 0..m),
 * 并记录 MAX_MODEL_ORDER_NODES。ggn 的 layout() 直接接收已 import 的 LGraph,
 * 这里在布局开始前补齐该赋值, 使 SortByInputModel / MODEL_ORDER 断环等依赖可用。
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import { MODEL_ORDER, MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS, CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER } from '../options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_NO_MODEL_ORDER, CONSIDER_MODEL_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
  CONSIDER_MODEL_ORDER_COMPONENTS, CYCLE_BREAKING_STRATEGY, LAYERING_STRATEGY,
  LAYERING_NODE_PROMOTION_STRATEGY, DIRECTION,
  CycleBreakingStrategy, OrderingStrategy,
  INSIDE_SELF_LOOPS_ACTIVATE, INSIDE_SELF_LOOPS_YO,
} from '../options/layered-options.js'
import { ComponentOrderingStrategy } from '../components/component-ordering-strategy.js'
import { Direction } from '../graph/enums.js'
import { LGraph as LGraphClass } from '../graph/lgraph.js'

/** 判断图是否需要 MODEL_ORDER (对应 Java needsModelOrderBasedOnParent 的 ggn 支持子集). */
export function needsModelOrderBasedOnParent(graph: LGraph): boolean {
  const cb = graph.getProperty(CYCLE_BREAKING_STRATEGY)
  const modelOrderCycleBreaking = cb === CycleBreakingStrategy.MODEL_ORDER
    || cb === CycleBreakingStrategy.GREEDY_MODEL_ORDER
    || cb === CycleBreakingStrategy.BFS_NODE_ORDER
    || cb === CycleBreakingStrategy.DFS_NODE_ORDER
    || cb === CycleBreakingStrategy.SCC_CONNECTIVITY
    || cb === CycleBreakingStrategy.SCC_NODE_TYPE
  const layering = graph.getProperty(LAYERING_STRATEGY)
  const modelOrderLayering = layering === 'BF_MODEL_ORDER' || layering === 'DF_MODEL_ORDER'
    || graph.getProperty(LAYERING_NODE_PROMOTION_STRATEGY) === 'MODEL_ORDER_LEFT_TO_RIGHT'
    || graph.getProperty(LAYERING_NODE_PROMOTION_STRATEGY) === 'MODEL_ORDER_RIGHT_TO_LEFT'
  const modelOrderCrossingMinimization = graph.getProperty(CONSIDER_MODEL_ORDER_STRATEGY) !== OrderingStrategy.NONE
    || graph.getProperty(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER)
    || graph.getProperty(CONSIDER_MODEL_ORDER_COMPONENTS) !== ComponentOrderingStrategy.NONE
  return modelOrderCycleBreaking || modelOrderLayering || modelOrderCrossingMinimization
}

/** 收集图 + 所有嵌套子图 (深度优先). */
export function collectAllGraphs(root: LGraph): LGraph[] {
  const result: LGraph[] = []
  const stack: LGraph[] = [root]
  while (stack.length > 0) {
    const g = stack.pop()!
    result.push(g)
    for (const node of g.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null) stack.push(nested)
    }
  }
  return result
}

/** 给单个图赋 MODEL_ORDER (节点 0..n, 边 0..m, 按读取顺序). */
export function assignModelOrders(graph: LGraph): void {
  if (!needsModelOrderBasedOnParent(graph)) return

  let nodeIndex = 0
  const cbGroupModelOrders = new Set<number>()
  for (const node of graph.getLayerlessNodes()) {
    if (!node.getProperty(CONSIDER_MODEL_ORDER_NO_MODEL_ORDER)) {
      node.setProperty(MODEL_ORDER, nodeIndex++)
      if (node.hasProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID)) {
        cbGroupModelOrders.add(node.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID))
      }
    }
  }
  graph.setProperty(MAX_MODEL_ORDER_NODES, nodeIndex)
  graph.setProperty(CB_NUM_MODEL_ORDER_GROUPS, cbGroupModelOrders.size)

  let edgeIndex = 0
  for (const node of graph.getLayerlessNodes()) {
    for (const port of node.getPorts()) {
      for (const edge of port.getOutgoingEdges()) {
        edge.setProperty(MODEL_ORDER, edgeIndex++)
      }
    }
  }
}

/** 对图层级整体赋 MODEL_ORDER (对应 ElkGraphImporter.importHierarchicalGraph). */
export function assignModelOrdersRecursive(root: LGraph): void {
  for (const graph of collectAllGraphs(root)) assignModelOrders(graph)
}

/** 导出辅助类型 (供测试/其他模块使用). */
export type { LNode }

/**
 * insideSelfLoops 导入等价步骤 (对应 ELK ElkGraphImporter.importHierarchicalGraph /
 * hasInsideSelfLoops): 为「激活 inside self-loops 且确有 yo 自环」的节点创建嵌套 LGraph
 * (即使没有子节点), 使自环能在节点内部路由. 嵌套图方向继承父图 (ELK createLGraph:
 * parentGraphDirection); padding 用 LGraph 默认 (12), 与 ELK 相同.
 *
 * 自环边本身在 ggn 无「边属于哪个图」的显式归属 (边从端口可达),
 * CompoundGraphPreprocessor.processInsideSelfLoops 会从节点端口找到它们.
 */

/** 为 activate 节点补嵌套图 (调用点见 layered-layout-provider.layout). */
export function prepareInsideSelfLoopsRecursive(root: LGraph): void {
  // 先收集现有全部图 (含刚创建的嵌套图: collectAllGraphs 会经 getNestedGraph 发现).
  const stack: LGraph[] = [root]
  while (stack.length > 0) {
    const graph = stack.pop()!
    for (const node of graph.getLayerlessNodes()) {
      const hasInsideSelfLoop = node.getOutgoingEdges().some(
        (e) => e.isSelfLoop() && e.getProperty(INSIDE_SELF_LOOPS_YO),
      )
      if (node.getProperty(INSIDE_SELF_LOOPS_ACTIVATE) && hasInsideSelfLoop && node.getNestedGraph() === null) {
        const nested = new LGraphClass()
        node.setNestedGraph(nested)
        nested.setParentNode(node)
        // jar SEPARATE inside selfloop 节点无嵌套图, 独立布局用默认 RIGHT
        // (edge-e2e 实测 297/273 四方向输出完全相同); ggn 嵌套图模拟该行为:
        // 无 children 的 inside selfloop 嵌套图方向固定 RIGHT, 否则 propagateNestedDirections
        // 传父图 DOWN → GraphTransformer 转置 → DOWN/UP 自环弯点错 (273/297/368 差).
        nested.setProperty(DIRECTION, Direction.RIGHT)
      }
      const nestedGraph = node.getNestedGraph()
      if (nestedGraph !== null) stack.push(nestedGraph)
    }
  }
}
