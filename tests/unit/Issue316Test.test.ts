/**
 * Issue316Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue316Test.java
 * 资源: tickets/layered/316_wrongGraphSizeWithIncludeChildren{,2}.elkt
 * 断言 (@Test, when='layout'):
 *   1) 所有节点端口不重叠
 *   2) 层级节点标签完全包含在节点内
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allNodes, checkPortOverlaps, checkLabelsInsideNode } from './framework/graph-utils.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/316_wrongGraphSizeWithIncludeChildren.elkt'),
  ...resolveModels('tickets/layered/316_wrongGraphSizeWithIncludeChildren2.elkt'),
])

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: import('../../src/index.js').LGraph): string[] => {
      const problems: string[] = []
      for (const { node, parents } of allNodes(g)) {
        problems.push(...checkPortOverlaps(node, parents))
        problems.push(...checkLabelsInsideNode(node))
      }
      return problems
    },
  },
]

describe('Issue316Test (ELK Java 移植)', () => {
  it(`布局后: ${MODELS.length} 图端口无重叠 + 层级节点标签在节点内`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue316 断言')
    expect(failed.length, msg).toBe(0)
  })
})
