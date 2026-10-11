/**
 * InvertedPortProcessorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/InvertedPortProcessorTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 配置 (@ConfiguratorProvider): edgeRouting = ORTHOGONAL.
 * 断言 (@TestAfterProcessor(InvertedPortProcessor)):
 *   1) 从 WEST 输出口出发的边 → 目标必须是同层的 LONG_EDGE dummy
 *   2) 到达 EAST 输入口的边 → 源必须是同层的 LONG_EDGE dummy
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import type { LGraph } from '../../src/index.js'
import { NodeType, PortSide } from '../../src/index.js'
import { EDGE_ROUTING } from '../../src/options/layered-options.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

/** Java configurator: LayoutConfigurator 对 ElkNode.class 设 EDGE_ROUTING=ORTHOGONAL (含嵌套图). */
function configureOrthogonal(g: LGraph): void {
  const queue: LGraph[] = [g]
  while (queue.length > 0) {
    const graph = queue.shift()!
    graph.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
    for (const node of graph.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null) queue.push(nested)
    }
  }
}

const AFTER_INVERTED = [
  {
    module: 'InvertedPortProcessor',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        for (const node of layer.getNodes()) {
          for (const edge of node.getOutgoingEdges()) {
            if (edge.getSource()?.getSide() === PortSide.WEST) {
              const target = edge.getTarget()?.getNode()
              if (!target) {
                problems.push(`边 ${edge.getId()} 目标节点为空`)
                continue
              }
              if (target.getType() !== NodeType.LONG_EDGE) {
                problems.push(`边 ${edge.getId()} 从 WEST 输出口出发, 目标 ${target.getId()} 不是 LONG_EDGE`)
              }
              if (target.getLayer()?.getIndex() !== layer.getIndex()) {
                problems.push(`边 ${edge.getId()} 目标 ${target.getId()} 不在同层 ${layer.getIndex()}`)
              }
            }
          }
          for (const edge of node.getIncomingEdges()) {
            if (edge.getTarget()?.getSide() === PortSide.EAST) {
              const source = edge.getSource()?.getNode()
              if (!source) {
                problems.push(`边 ${edge.getId()} 源节点为空`)
                continue
              }
              if (source.getType() !== NodeType.LONG_EDGE) {
                problems.push(`边 ${edge.getId()} 到达 EAST 输入口, 源 ${source.getId()} 不是 LONG_EDGE`)
              }
              if (source.getLayer()?.getIndex() !== layer.getIndex()) {
                problems.push(`边 ${edge.getId()} 源 ${source.getId()} 不在同层 ${layer.getIndex()}`)
              }
            }
          }
        }
      }
      return problems
    },
  },
]

describe('InvertedPortProcessorTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`InvertedPortProcessor 执行后: 全部 ${MODELS.length} 图反向端口已转 LONG_EDGE dummy`, () => {
    const results = runAllPerGraph(MODELS, AFTER_INVERTED, configureOrthogonal)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'InvertedPortProcessor 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
