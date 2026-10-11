/**
 * Issue445Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue445Test.java
 * 资源: tickets/layered/445_feedbackEdgeTailLabel.elkt
 * 配置: padding=0.
 * 断言 (@Test, when='layout'): 无边标签落在 (0,0).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/445_feedbackEdgeTailLabel.elkt'))

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      const stack: LGraph[] = [g]
      while (stack.length) {
        const graph = stack.pop()!
        for (const n of graph.getLayerlessNodes()) if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
        for (const layer of graph.getLayers()) {
          for (const n of layer.getNodes()) {
            if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
            for (const port of n.getPorts()) {
              for (const e of port.getOutgoingEdges()) {
                for (const label of e.getLabels()) {
                  if (label.position.x === 0 && label.position.y === 0) {
                    problems.push(`edge ${e.id} 标签落在 (0,0)`)
                  }
                }
              }
            }
          }
        }
      }
      return problems
    },
  },
]

describe('Issue445Test (ELK Java 移植)', () => {
  it(`padding=0 时无边标签落在 (0,0): ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS, (g) => {
      g.setPadding({ top: 0, right: 0, bottom: 0, left: 0 })
    })
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue445 标签位置')
    expect(failed.length, msg).toBe(0)
  })
})
