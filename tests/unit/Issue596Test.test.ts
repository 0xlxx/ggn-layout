/**
 * Issue596Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue596Test.java
 * 资源: tickets/layered/596_outsideHierarchicalPortLabels.elkt
 * 断言 (@Test, when='layout'): 层级节点单子节点水平居中 (inner.x ≈ (outer.w - inner.w)/2, 容差 0.5).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allNodes } from './framework/graph-utils.js'

const MODELS = limitModels(resolveModels('tickets/layered/596_outsideHierarchicalPortLabels.elkt'))
const TOL = 0.5

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: import('../../src/index.js').LGraph): string[] => {
      const problems: string[] = []
      for (const { node } of allNodes(g)) {
        const nested = node.getNestedGraph()
        if (!nested) continue
        const children = nested.getAllNodes()
        if (children.length !== 1) continue
        const inner = children[0]!
        const expected = (node.size.x - inner.size.x) / 2
        if (Math.abs(expected - inner.position.x) > TOL) {
          problems.push(`node ${node.id}: 子节点 x=${inner.position.x} 未居中 (期望 ${expected})`)
        }
      }
      return problems
    },
  },
]

describe('Issue596Test (ELK Java 移植)', () => {
  it(`层级子节点居中: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue596 子节点居中')
    expect(failed.length, msg).toBe(0)
  })
})
