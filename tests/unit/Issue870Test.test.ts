/**
 * Issue870Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue870Test.java
 * 资源: tickets/layered/870_networkSimplexNodePlacer.elkt
 * 断言: 布局不失败.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'

const MODELS = limitModels(resolveModels('tickets/layered/870_networkSimplexNodePlacer.elkt'))

describe('Issue870Test (ELK Java 移植)', () => {
  it(`布局不失败: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, [])
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue870 布局失败')
    expect(failed.length, msg).toBe(0)
  })
})
