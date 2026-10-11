/**
 * ReversedEdgeRestorerTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/ReversedEdgeRestorerTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 断言 (@TestAfterProcessor(ReversedEdgeRestorer)):
 *   恢复后不存在仍标记 REVERSED 的边.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import type { LGraph } from '../../src/index.js'
import { REVERSED } from '../../src/options/internal-properties.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

const AFTER_RESTORER = [
  {
    module: 'ReversedEdgeRestorer',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        for (const node of layer.getNodes()) {
          for (const edge of node.getOutgoingEdges()) {
            if (edge.getProperty(REVERSED)) {
              problems.push(`边 ${edge.getId()} 仍标记 REVERSED`)
            }
          }
        }
      }
      return problems
    },
  },
]

describe('ReversedEdgeRestorerTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`ReversedEdgeRestorer 执行后: 全部 ${MODELS.length} 图无 REVERSED 边`, () => {
    const results = runAllPerGraph(MODELS, AFTER_RESTORER)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'ReversedEdgeRestorer 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
