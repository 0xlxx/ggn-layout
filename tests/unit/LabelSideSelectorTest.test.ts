/**
 * LabelSideSelectorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/LabelSideSelectorTest.java
 * 资源: realworld/ptolemy/** + tickets/layered/599_unimportantPortIndex.elkt
 * 配置 (@Configurator): 固定种子 0, 给每条边补标签并随机赋 HEAD(30%)/CENTER(40%)/TAIL(30%).
 * 断言 (@TestAfterProcessor(LabelSideSelector)):
 *   所有仍挂在边上的标签 (HEAD/TAIL 端标签; CENTER 已被 LabelDummyInserter 移入 dummy)
 *   都应有已赋值的 LABEL_SIDE (对应 Java LABEL_SIDE != UNKNOWN; ggn 表示: label.side 字段).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import type { LGraph, LEdge } from '../../src/index.js'
import { JavaRandom } from '../../src/util/java-random.js'

const MODELS = limitModels([
  ...resolveModels('realworld/ptolemy/**/'),
  ...resolveModels('tickets/layered/599_unimportantPortIndex.elkt'),
])

/** Java configurator: BFS 遍历所有节点, 收集每条边; 无标签则创建, 并随机赋 placement (seed 0). */
function configureEdgeLabels(g: LGraph): void {
  const rand = new JavaRandom(0)
  const graphQueue: LGraph[] = [g]
  while (graphQueue.length > 0) {
    const graph = graphQueue.shift()!
    const seen = new Set<LEdge>()
    for (const node of graph.getLayerlessNodes()) {
      if (node.getNestedGraph() !== null) graphQueue.push(node.getNestedGraph()!)
      for (const edge of node.getOutgoingEdges()) {
        if (seen.has(edge)) continue
        seen.add(edge)
        if (edge.getLabels().length === 0) {
          edge.getLabels().push({ text: `label${edge.getId()}`, position: { x: 0, y: 0 }, size: { x: 30, y: 10 } })
        }
        const label = edge.getLabels()[0]!
        const r = rand.nextDouble()
        if (r < 0.3) label.placement = 'HEAD'
        else if (r < 0.7) label.placement = 'CENTER'
        else label.placement = 'TAIL'
      }
    }
  }
}

const AFTER_SELECTOR = [
  {
    module: 'LabelSideSelector',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      // Java: 只检查仍挂在边上的标签 (HEAD/TAIL; CENTER 标签已在 LabelDummyInserter 时移入 dummy).
      for (const layer of g.getLayers()) {
        for (const node of layer.getNodes()) {
          for (const edge of node.getOutgoingEdges()) {
            for (const label of edge.getLabels()) {
              const side = (label as { side?: string }).side
              if (side === undefined || side === null || side === '') {
                problems.push(`边 ${edge.getId()} 标签 (placement=${label.placement}) 无 side`)
              }
            }
          }
        }
      }
      return problems
    },
  },
]

describe('LabelSideSelectorTest (ELK Java 移植, realworld/ptolemy + 599)', () => {
  it(`LabelSideSelector 执行后: 全部 ${MODELS.length} 图边标签侧已赋值`, () => {
    const results = runAllPerGraph(MODELS, AFTER_SELECTOR, configureEdgeLabels)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'LabelSideSelector 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
