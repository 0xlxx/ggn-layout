/**
 * Issue726Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue726Test.java
 * 资源: tickets/layered/726_edgesMissingBendPoints.elkt
 * 断言 (@TestAfterProcessor(OrthogonalEdgeRouter)): 每条边路由正交.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { checkGraphOrthogonal } from './framework/orthogonal.js'

const MODELS = limitModels(resolveModels('tickets/layered/726_edgesMissingBendPoints.elkt'))

const AFTER_ROUTER = [
  {
    module: 'OrthogonalEdgeRouter',
    when: 'after' as const,
    check: (g: import('../../src/index.js').LGraph): string[] => checkGraphOrthogonal(g),
  },
]

describe('Issue726Test (ELK Java 移植, 726_edgesMissingBendPoints)', () => {
  it('OrthogonalEdgeRouter 执行后: 所有边路由正交', () => {
    const results = runAll(MODELS, AFTER_ROUTER)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue726 正交断言')
    expect(failed.length, msg).toBe(0)
  })
})
