/**
 * Issue665Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue665Test.java
 * 资源: tickets/layered/665*.elkt
 * 断言: 布局不崩溃 (UnsupportedGraphException 防护).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'

const MODELS = limitModels(resolveModels('tickets/layered/**/*.elkt').filter(f => /\/665.+\.elkt$/.test(f)))

describe('Issue665Test (ELK Java 移植)', () => {
  it(`布局不崩溃: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, [])
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue665 布局崩溃')
    expect(failed.length, msg).toBe(0)
  })
})
