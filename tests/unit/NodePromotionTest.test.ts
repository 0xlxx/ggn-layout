/**
 * NodePromotionTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/NodePromotionTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 配置 (@ConfiguratorProvider × 7): 各 NodePromotionStrategy (NIKOLOV / NIKOLOV_IMPROVED /
 *   NIKOLOV_PIXEL / NIKOLOV_IMPROVED_PIXEL / NO_BOUNDARY / MODEL_ORDER_LEFT_TO_RIGHT /
 *   MODEL_ORDER_RIGHT_TO_LEFT), 后两者另设 cycleBreaking=MODEL_ORDER + layering 策略 +
 *   considerModelOrder=PREFER_EDGES.
 * 断言 (@TestAfterProcessor(NodePromotion), 来自 BasicLayerAssignmentTest):
 *   1) 无未分层节点  2) 无空层  3) 所有边指向后续层.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import type { LGraph } from '../../src/index.js'
import {
  CYCLE_BREAKING_STRATEGY, LAYERING_STRATEGY, CONSIDER_MODEL_ORDER_STRATEGY,
  LAYERING_NODE_PROMOTION_STRATEGY, CycleBreakingStrategy, OrderingStrategy,
} from '../../src/options/layered-options.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

function setRecursive<K>(g: LGraph, key: import('../../src/graph/properties.js').IProperty<K> | string, value: K): void {
  const queue: LGraph[] = [g]
  while (queue.length > 0) {
    const graph = queue.shift()!
    graph.setProperty(key as never, value as never)
    for (const node of graph.getAllNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null) queue.push(nested)
    }
  }
}

/** BasicLayerAssignmentTest 的三个断言 (NodePromotion 后执行). */
const ASSERTIONS = [
  {
    module: 'NodePromotion',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      if (g.getLayerlessNodes().length > 0) {
        problems.push(`存在 ${g.getLayerlessNodes().length} 个未分层节点`)
      }
      return problems
    },
  },
  {
    module: 'NodePromotion',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        if (layer.getNodes().length === 0) {
          problems.push(`层 ${layer.getIndex()} 为空`)
        }
      }
      return problems
    },
  },
  {
    module: 'NodePromotion',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      const layerId = new Map<unknown, number>()
      g.getLayers().forEach((l, i) => layerId.set(l, i))
      for (const layer of g.getLayers()) {
        const li = layerId.get(layer)!
        for (const node of layer.getNodes()) {
          for (const edge of node.getOutgoingEdges()) {
            const tgt = edge.getTarget()?.getNode()
            const tl = tgt?.getLayer()
            if (!tgt || !tl) {
              problems.push(`边 ${edge.getId()} 目标节点无层`)
              continue
            }
            const tli = layerId.get(tl)
            if (tli === undefined) {
              problems.push(`边 ${edge.getId()} 目标层不在图内`)
              continue
            }
            if (!(li < tli)) problems.push(`边 ${edge.getId()}: 源层 ${li} >= 目标层 ${tli}`)
          }
        }
      }
      return problems
    },
  },
]

function baseConfigure(strategy: string): (g: LGraph) => void {
  return (g: LGraph) => setRecursive(g, LAYERING_NODE_PROMOTION_STRATEGY, strategy)
}

function configureFor(strategy: string, layering: string): (g: LGraph) => void {
  return (g: LGraph) => {
    setRecursive(g, LAYERING_NODE_PROMOTION_STRATEGY, strategy)
    setRecursive(g, CYCLE_BREAKING_STRATEGY, CycleBreakingStrategy.MODEL_ORDER)
    setRecursive(g, LAYERING_STRATEGY, layering)
    setRecursive(g, CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
  }
}

const CONFIGURATORS: { name: string; configure: (g: LGraph) => void }[] = [
  { name: 'NIKOLOV', configure: baseConfigure('NIKOLOV') },
  { name: 'NIKOLOV_IMPROVED', configure: baseConfigure('NIKOLOV_IMPROVED') },
  { name: 'NIKOLOV_PIXEL', configure: baseConfigure('NIKOLOV_PIXEL') },
  { name: 'NIKOLOV_IMPROVED_PIXEL', configure: baseConfigure('NIKOLOV_IMPROVED_PIXEL') },
  { name: 'NO_BOUNDARY', configure: baseConfigure('NO_BOUNDARY') },
  { name: 'MODEL_ORDER_LEFT_TO_RIGHT', configure: configureFor('MODEL_ORDER_LEFT_TO_RIGHT', 'LONGEST_PATH_SOURCE') },
  { name: 'MODEL_ORDER_RIGHT_TO_LEFT', configure: configureFor('MODEL_ORDER_RIGHT_TO_LEFT', 'LONGEST_PATH') },
]

describe('NodePromotionTest (ELK Java 移植, realworld/ptolemy)', () => {
  for (const c of CONFIGURATORS) {
    it(`NodePromotion 后置 (${c.name}): 全部 ${MODELS.length} 图无未分层/空层/反向边`, () => {
      const results = runAllPerGraph(MODELS, ASSERTIONS, c.configure)
      const failed = results.filter(r => r.problems.length > 0 || r.error)
      const msg = summarizeFailures(results, `NodePromotion 后置断言 (${c.name})`)
      expect(failed.length, msg).toBe(0)
    })
  }
})
