/**
 * Issue463Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue463Test.java
 * 资源: tickets/layered/463_aioobe_with_self_loops.elkt
 * 断言: 布局不崩溃 (自环 AIOOBE 防护).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'

const MODELS = limitModels(resolveModels('tickets/layered/463_aioobe_with_self_loops.elkt'))

describe('Issue463Test (ELK Java 移植)', () => {
  it(`布局不崩溃: ${MODELS.length} 图 (自环 AIOOBE 防护)`, () => {
    const results = runAll(MODELS, [])
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue463 布局崩溃')
    expect(failed.length, msg).toBe(0)
  })
})
