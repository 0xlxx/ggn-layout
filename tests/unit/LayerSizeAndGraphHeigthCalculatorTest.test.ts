/**
 * LayerSizeAndGraphHeigthCalculatorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/LayerSizeAndGraphHeigthCalculatorTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 断言 (@TestAfterProcessor(LayerSizeAndGraphHeightCalculator)):
 *   所有节点 (含 margin) 都在图的高度范围 [top, bottom] 内 (容差 0.1),
 *   其中 top = -offset.y, bottom = size.y - offset.y.
 *
 * 注: 用 runAllPerGraph 逐图断言 (Java whitebox 对每个执行该处理器的分量/子图触发);
 * runner.ts 的根图钩子会在层级图中间态误报.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

const TOLERANCE = 0.1

const AFTER_HEIGHT = [
  {
    module: 'LayerSizeAndGraphHeightCalculator',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      const top = 0.0 - g.getOffset().y
      const bottom = g.getSize().y - g.getOffset().y
      for (const layer of g.getLayers()) {
        for (const node of layer.getNodes()) {
          const nodeTop = node.getPosition().y - node.getMargin().top
          if (!(nodeTop > top || Math.abs(nodeTop - top) < TOLERANCE)) {
            problems.push(`node ${node.getId()} top=${nodeTop} 超出图顶 ${top}`)
          }
          const nodeBottom = node.getPosition().y + node.getSize().y + node.getMargin().bottom
          if (!(nodeBottom < bottom || Math.abs(nodeBottom - bottom) < TOLERANCE)) {
            problems.push(`node ${node.getId()} bottom=${nodeBottom} 超出图底 ${bottom}`)
          }
        }
      }
      return problems
    },
  },
]

describe('LayerSizeAndGraphHeigthCalculatorTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`LayerSizeAndGraphHeightCalculator 后置: 全部 ${MODELS.length} 图节点在图高范围内`, () => {
    const results = runAllPerGraph(MODELS, AFTER_HEIGHT)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'LayerSizeAndGraphHeightCalculator 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
