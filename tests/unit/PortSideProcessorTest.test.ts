/**
 * PortSideProcessorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/PortSideProcessorTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 断言 (@TestAfterProcessor(PortSideProcessor)):
 *   1) 无节点 PORT_CONSTRAINTS 为 FREE/UNDEFINED (必须 side-fixed)
 *   2) 每个端口都有指定 side (非 UNDEFINED)
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'
import { PortConstraints, PortSide } from '../../src/index.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

const AFTER_PORTSIDE = [
  {
    module: 'PortSideProcessor',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        for (const node of layer.getNodes()) {
          const pc = node.getProperty('org.eclipse.elk.portConstraints')
          if (!PortConstraints.isSideFixed(pc as PortConstraints)) {
            problems.push(`node ${node.id} portConstraints=${pc} 非 side-fixed`)
          }
          for (const port of node.getPorts()) {
            if (port.getSide() === PortSide.UNDEFINED) {
              problems.push(`node ${node.id} port ${port.id} side=UNDEFINED`)
            }
          }
        }
      }
      return problems
    },
  },
]

describe('PortSideProcessorTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`PortSideProcessor 执行后: 全部 ${MODELS.length} 图端口侧已固定`, () => {
    const results = runAll(MODELS, AFTER_PORTSIDE)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'PortSideProcessor 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
