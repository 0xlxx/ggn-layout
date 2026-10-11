/**
 * Issue476Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue476Test.java
 * 资源: tickets/layered/476_multiLabelIn{Vertical,Horizontal}Layout.elkt
 * 断言 (@Test, when='layout'): 节点标签水平居中 (x + w/2 = nodeWidth/2, 容差 0.5).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allNodes } from './framework/graph-utils.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/476_multiLabelInVerticalLayout.elkt'),
  ...resolveModels('tickets/layered/476_multiLabelInHorizontalLayout.elkt'),
])
const FUZZY = 0.5

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: import('../../src/index.js').LGraph): string[] => {
      const problems: string[] = []
      for (const { node } of allNodes(g)) {
        for (const label of node.getLabels()) {
          const center = label.position.x + label.size.x / 2
          if (Math.abs(node.size.x / 2 - center) > FUZZY) {
            problems.push(`node ${node.id} 标签 x 中心 ${center} != 节点宽一半 ${node.size.x / 2}`)
          }
        }
      }
      return problems
    },
  },
]

describe('Issue476Test (ELK Java 移植)', () => {
  it(`节点标签水平居中: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue476 标签居中')
    expect(failed.length, msg).toBe(0)
  })
})
