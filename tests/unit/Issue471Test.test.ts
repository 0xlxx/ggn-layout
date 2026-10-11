/**
 * Issue471Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue471Test.java
 * 资源: tickets/layered/471_verticalInlineLabelAlignment.elkt
 * 断言 (@Test, when='layout'): 每条边所有标签水平居中 (x = minX + (maxWidth - w)/2, 容差 0.5).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/471_verticalInlineLabelAlignment.elkt'))
const FUZZY = 0.5

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const e of allEdgesWithLabels(g)) {
        const labels = e.labels
        if (labels.length < 2) continue
        let minX = Number.MAX_VALUE
        let maxWidth = 0
        for (const l of labels) {
          minX = Math.min(minX, l.position.x)
          maxWidth = Math.max(maxWidth, l.size.x)
        }
        for (const l of labels) {
          const expected = minX + (maxWidth - l.size.x) / 2
          if (Math.abs(expected - l.position.x) > FUZZY) {
            problems.push(`edge ${e.id}: 标签 x=${l.position.x} 未居中 (期望 ${expected})`)
          }
        }
      }
      return problems
    },
  },
]

function* allEdgesWithLabels(g: LGraph): Generator<{ id: unknown; labels: { position: { x: number; y: number }; size: { x: number; y: number } }[] }> {
  const stack: LGraph[] = [g]
  while (stack.length) {
    const graph = stack.pop()!
    for (const n of graph.getLayerlessNodes()) if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
    for (const layer of graph.getLayers()) {
      for (const n of layer.getNodes()) {
        if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
        for (const port of n.getPorts()) {
          for (const e of port.getOutgoingEdges()) {
            yield { id: e.id, labels: e.getLabels() }
          }
        }
      }
    }
  }
}

describe('Issue471Test (ELK Java 移植)', () => {
  it(`边标签水平居中: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue471 标签居中')
    expect(failed.length, msg).toBe(0)
  })
})
