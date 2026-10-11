/**
 * Issue433Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue433Test.java
 * 资源: tickets/layered/433_graphSizeWithSelfLoopLabel.elkt
 * 断言 (@Test, when='layout'): 自环边标签完全在图矩形内.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/433_graphSizeWithSelfLoopLabel.elkt'))

function labelProblems(g: LGraph): string[] {
  const problems: string[] = []
  const w = g.getSize().x
  const h = g.getSize().y
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
              const x = label.position.x
              const y = label.position.y
              if (x < 0 || y < 0 || x + label.size.x > w || y + label.size.y > h) {
                problems.push(`edge ${e.id} 标签 (${x},${y}) ${label.size.x}x${label.size.y} 超出图 ${w}x${h}`)
              }
            }
          }
        }
      }
    }
  }
  return problems
}

const LAYOUT_ASSERTS = [
  { module: 'layout', when: 'layout' as const, check: (g: LGraph): string[] => labelProblems(g) },
]

describe('Issue433Test (ELK Java 移植)', () => {
  it(`自环标签在图内: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue433 标签断言')
    expect(failed.length, msg).toBe(0)
  })
})
