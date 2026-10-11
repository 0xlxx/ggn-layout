/**
 * Issue587Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue587Test.java
 * 资源: tickets/layered/587*.elkt
 * 配置: edgeRouting ∈ {ORTHOGONAL, POLYLINE, SPLINES}.
 * 断言: 布局不崩溃.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'

const MODELS = limitModels(resolveModels('tickets/layered/**/*.elkt').filter(f => /\/587.+\.elkt$/.test(f)))
const ROUTINGS = ['ORTHOGONAL', 'POLYLINE', 'SPLINES'] as const

describe('Issue587Test (ELK Java 移植)', () => {
  for (const r of ROUTINGS) {
    it(`edgeRouting=${r} 布局不崩溃: ${MODELS.length} 图`, () => {
      const results = runAll(MODELS, [], (g) => { g.setProperty('org.eclipse.elk.edgeRouting', r) })
      const failed = results.filter(x => x.problems.length > 0 || x.error)
      const msg = summarizeFailures(results, `Issue587 ${r}`)
      expect(failed.length, msg).toBe(0)
    })
  }
})
