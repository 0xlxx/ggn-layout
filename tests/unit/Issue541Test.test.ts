/**
 * Issue541Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue541Test.java
 * 资源: tickets/layered/541*.elkt
 * 断言: 布局不崩溃 (原测试只防 EndLabelSorter NPE).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'

const MODELS = limitModels(resolveModels('tickets/layered/**/*.elkt').filter(f => /\/541.+\.elkt$/.test(f)))

describe('Issue541Test (ELK Java 移植)', () => {
  it(`布局不崩溃: ${MODELS.length} 图 (EndLabelSorter NPE 防护)`, () => {
    const results = runAll(MODELS, [])
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue541 布局崩溃')
    expect(failed.length, msg).toBe(0)
  })
})
