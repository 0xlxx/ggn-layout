/**
 * NodeMarginCalculatorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/NodeMarginCalculatorTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 断言 (@TestAfterProcessor × 4): 在 InnermostNodeMarginCalculator / SelfLoopRouter /
 *   EndLabelPreprocessor (Java 的 CommentNodeMarginCalculator ggn 未实现) 之后,
 *   每个节点的 margin 非 null 且 top/right/bottom/left 均 >= 0.
 * 注: ggn 模块名映射 — Java InnermostNodeMarginCalculator → ggn 'NodeMarginCalculator';
 *   CommentNodeMarginCalculator → ggn 未实现 (it.skip 说明, 不伪造通过).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

function makeMarginCheck(label: string): (g: LGraph) => string[] {
  return (g: LGraph): string[] => {
    const problems: string[] = []
    for (const layer of g.getLayers()) {
      for (const node of layer.getNodes()) {
        const m = node.getMargin()
        if (m === null || m === undefined) {
          problems.push(`${label}: node ${node.getId()} margin 为 null`)
          continue
        }
        if (m.top < 0) problems.push(`${label}: node ${node.getId()} margin.top=${m.top} < 0`)
        if (m.right < 0) problems.push(`${label}: node ${node.getId()} margin.right=${m.right} < 0`)
        if (m.bottom < 0) problems.push(`${label}: node ${node.getId()} margin.bottom=${m.bottom} < 0`)
        if (m.left < 0) problems.push(`${label}: node ${node.getId()} margin.left=${m.left} < 0`)
      }
    }
    return problems
  }
}

const ASSERTIONS = [
  {
    module: 'NodeMarginCalculator',
    when: 'after' as const,
    check: makeMarginCheck('InnermostNodeMarginCalculator'),
  },
  {
    module: 'SelfLoopRouter',
    when: 'after' as const,
    check: makeMarginCheck('SelfLoopRouter'),
  },
  {
    module: 'EndLabelPreprocessor',
    when: 'after' as const,
    check: makeMarginCheck('EndLabelPreprocessor'),
  },
]

describe('NodeMarginCalculatorTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`margin 计算后: 全部 ${MODELS.length} 图节点 margin 非负`, () => {
    const results = runAllPerGraph(MODELS, ASSERTIONS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'NodeMarginCalculator 后置断言')
    expect(failed.length, msg).toBe(0)
  })
  // ggn 未实现 CommentNodeMarginCalculator (无 comment 机制) → Java 的
  // testNodeMarginsAfterCommentNodeMarginCalculator 断言无法触发, 不伪造通过.
  it.skip(`CommentNodeMarginCalculator 后置 margin 断言 (ggn 未实现 CommentNodeMarginCalculator)`, () => {
    expect(0).toBe(0)
  })
})
