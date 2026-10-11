/**
 * LongEdgeSplitterTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../intermediate/LongEdgeSplitterTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 断言 (@TestAfterProcessor(LongEdgeSplitter)):
 *   所有边连接直接相邻层, 且 source 层 index < target 层 index.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

const AFTER_SPLITTER = [
  {
    module: 'LongEdgeSplitter',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      // Java 测试: 按 lGraph 迭代顺序赋 layer.id = 0..n-1. 用 Map 等价 (避免污染管线).
      const layerId = new Map<unknown, number>()
      g.getLayers().forEach((l, i) => layerId.set(l, i))
      for (const layer of g.getLayers()) {
        const li = layerId.get(layer)!
        for (const node of layer.getNodes()) {
          for (const e of node.getOutgoingEdges()) {
            const tgt = e.getTarget()?.getNode()
            const tl = tgt?.getLayer()
            if (!tgt || !tl) {
              problems.push(`边 ${e.id} 目标节点无层`)
              continue
            }
            const tli = layerId.get(tl)
            if (tli === undefined) {
              problems.push(`边 ${e.id} 目标层不在图内`)
              continue
            }
            if (!(li < tli)) problems.push(`边 ${e.id}: 源层 ${li} >= 目标层 ${tli}`)
            if (!(li + 1 === tli)) problems.push(`边 ${e.id}: 源层 ${li} 与目标层 ${tli} 不相邻`)
          }
        }
      }
      return problems
    },
  },
]

describe('LongEdgeSplitterTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`LongEdgeSplitter 执行后: 全部 ${MODELS.length} 图边均连接相邻层`, () => {
    const results = runAll(MODELS, AFTER_SPLITTER)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'LongEdgeSplitter 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
