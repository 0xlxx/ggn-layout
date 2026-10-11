/**
 * Issue603Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue603Test.java
 * 资源: tickets/layered/603*.elkt
 * 配置: 节点 label placement = insideTopCenter.
 * 断言 (@Test, when='layout'): 层级节点标签与子节点矩形不重叠.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/**/*.elkt').filter(f => /\/603.+\.elkt$/.test(f)))

function runOne(rel: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph, nodeOf } = buildLGraphFromParsed(parsed, rel)
  for (const [, n] of nodeOf) {
    n.setProperty('org.eclipse.elk.layered.nodeLabels.placement', 'insideTopCenter')
  }
  const problems: string[] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterPhase: (phase, g) => {
      if (phase !== 'done') return
      const stack: { graph: LGraph; parents: { x: number; y: number }[] }[] = [{ graph: g, parents: [] }]
      while (stack.length) {
        const { graph: gg, parents } = stack.pop()!
        for (const n of gg.getAllNodes()) {
          const abs = { x: parents.reduce((a, p) => a + p.x, 0) + n.position.x, y: parents.reduce((a, p) => a + p.y, 0) + n.position.y }
          if (n.getNestedGraph() && n.getLabels().length > 0) {
            const rects: { x0: number; y0: number; x1: number; y1: number }[] = []
            for (const l of n.getLabels()) rects.push({ x0: abs.x + l.position.x, y0: abs.y + l.position.y, x1: abs.x + l.position.x + l.size.x, y1: abs.y + l.position.y + l.size.y })
            for (const c of n.getNestedGraph()!.getAllNodes()) {
              rects.push({ x0: abs.x + c.position.x, y0: abs.y + c.position.y, x1: abs.x + c.position.x + c.size.x, y1: abs.y + c.position.y + c.size.y })
            }
            for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
              const a = rects[i]!, b = rects[j]!
              if (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1) {
                problems.push(`${rel}: node ${n.id} 标签与子节点重叠`)
              }
            }
          }
          if (n.getNestedGraph()) stack.push({ graph: n.getNestedGraph()!, parents: [...parents, n.position] })
        }
      }
    },
  })
  p.layout(graph)
  return problems
}

describe('Issue603Test (ELK Java 移植)', () => {
  it(`标签与子节点不重叠: ${MODELS.length} 图`, () => {
    const all: string[] = []
    for (const rel of MODELS) {
      try { all.push(...runOne(rel)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 200)}`) }
    }
    expect(all, `Issue603 标签重叠 (${all.length}):\n${all.slice(0, 20).join('\n')}`).toEqual([])
  })
})
