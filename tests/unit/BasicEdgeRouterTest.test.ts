/**
 * BasicEdgeRouterTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../p5edges/BasicEdgeRouterTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 配置: edgeRouting = ORTHOGONAL.
 * 断言 (@Test(ElkNode), when='layout'): 全层级每条边路由正交 (相邻段交替水平/垂直, 容差 0.05).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

import { checkGraphOrthogonal } from './framework/orthogonal.js'

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => checkGraphOrthogonal(g),
  },
]

describe('BasicEdgeRouterTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`正交路由: 全部 ${MODELS.length} 图所有边路由正交`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS, (g) => {
      g.setProperty('org.eclipse.elk.edgeRouting', 'ORTHOGONAL')
    })
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, '正交路由断言')
    expect(failed.length, msg).toBe(0)
  })
})
