/**
 * Issue700Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue700Test.java
 * 资源: tickets/layered/665*.elkt, 700*.elkt, examples/hierarchy/**
 * 断言 (@Test, when='layout'): 每条边有路由且端点非原点.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allEdgeRoutes } from './framework/orthogonal.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/**/*.elkt').filter(f => /\/665.+\.elkt$/.test(f)),
  ...resolveModels('tickets/layered/**/*.elkt').filter(f => /\/700.+\.elkt$/.test(f)),
  ...resolveModels('examples/hierarchy/**/*.elkt'),
])

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const { id, pts } of allEdgeRoutes(g)) {
        if (pts.length === 0) {
          problems.push(`edge ${id}: 无路由点`)
          continue
        }
        const s = pts[0]!, t = pts[pts.length - 1]!
        if (s.x === 0 && s.y === 0 && t.x === 0 && t.y === 0) {
          problems.push(`edge ${id}: 端点均在原点 (未路由)`)
        }
      }
      return problems
    },
  },
]

describe('Issue700Test (ELK Java 移植)', () => {
  it(`边已路由: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue700 边路由')
    expect(failed.length, msg).toBe(0)
  })
})
