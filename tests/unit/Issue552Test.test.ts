/**
 * Issue552Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue552Test.java
 * 资源: tickets/layered/552_hierarchySelfLoopPorts.elkt
 * 断言 (@Test, when='layout'): 层级自环端口 y > 0.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allNodes } from './framework/graph-utils.js'

const MODELS = limitModels(resolveModels('tickets/layered/552_hierarchySelfLoopPorts.elkt'))

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: import('../../src/index.js').LGraph): string[] => {
      const problems: string[] = []
      for (const { node } of allNodes(g)) {
        for (const port of node.getPorts()) {
          if (port.getPosition().y <= 0) {
            problems.push(`node ${node.id} 端口 y=${port.getPosition().y} 未归位 (>0 期望)`)
          }
        }
      }
      return problems
    },
  },
]

describe('Issue552Test (ELK Java 移植)', () => {
  it(`层级自环端口 y>0: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue552 端口位置')
    expect(failed.length, msg).toBe(0)
  })
})
