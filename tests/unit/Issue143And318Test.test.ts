/**
 * Issue143And318Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue143And318Test.java
 * 资源: tickets/layered/143_smallVerticalEdgeSegmentSpacing.elkt, 318_overlappingHorizontalEdgeSegments.elkt
 * 断言 (@Test, when='layout'): x 区间相交的水平边段, y 间距 >= 2.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allEdgeRoutes } from './framework/orthogonal.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/143_smallVerticalEdgeSegmentSpacing.elkt'),
  ...resolveModels('tickets/layered/318_overlappingHorizontalEdgeSegments.elkt'),
])
const PROXIMITY = 2.0
const TOL = 0.01

interface HSeg { x1: number; y1: number; x2: number; y2: number }

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      const hSegs: HSeg[] = []
      for (const { pts } of allEdgeRoutes(g)) {
        for (let i = 1; i < pts.length; i++) {
          const p = pts[i - 1]!, c = pts[i]!
          if (Math.abs(p.y - c.y) < TOL) {
            hSegs.push(p.x < c.x
              ? { x1: p.x, y1: p.y, x2: c.x, y2: c.y }
              : { x1: c.x, y1: c.y, x2: p.x, y2: p.y })
          }
        }
      }
      for (let i = 0; i < hSegs.length; i++) {
        for (let j = i + 1; j < hSegs.length; j++) {
          const a = hSegs[i]!, b = hSegs[j]!
          if (a.x1 < b.x2 && b.x1 < a.x2) {
            if (Math.abs(a.y1 - b.y1) < PROXIMITY) {
              problems.push(`水平段 y=${a.y1} 与 y=${b.y1} 间距不足 (${Math.abs(a.y1 - b.y1)} < ${PROXIMITY})`)
            }
          }
        }
      }
      return problems
    },
  },
]

describe('Issue143And318Test (ELK Java 移植)', () => {
  it(`水平边段间距: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue143And318 边段间距')
    expect(failed.length, msg).toBe(0)
  })
})
