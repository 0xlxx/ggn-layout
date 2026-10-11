/**
 * NorthSouthPortPreprocessorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/NorthSouthPortPreprocessorTest.java
 * 资源: tests/layered/north_south_ports/**
 * 断言 (@TestAfterProcessor(NorthSouthPortPreprocessor)):
 *   side-fixed 约束节点的 NORTH/SOUTH 端口不得连接任何边 (预处理已将其转为 dummy).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'
import { PortConstraints, PortSide } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tests/layered/north_south_ports/**'))

const AFTER_NS = [
  {
    module: 'NorthSouthPortPreprocessor',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        for (const node of layer.getNodes()) {
          const pc = node.getProperty<PortConstraints>('org.eclipse.elk.portConstraints')
          if (pc === null || pc === undefined || !PortConstraints.isSideFixed(pc)) continue
          for (const port of node.getPorts()) {
            if (port.getSide() === PortSide.NORTH || port.getSide() === PortSide.SOUTH) {
              if (port.getConnectedEdges().length > 0) {
                problems.push(`node ${node.getId()} ${port.getSide()} 端口 ${port.getId()} 仍有 ${port.getConnectedEdges().length} 条连接边`)
              }
            }
          }
        }
      }
      return problems
    },
  },
]

describe('NorthSouthPortPreprocessorTest (ELK Java 移植, tests/layered/north_south_ports)', () => {
  it(`NorthSouthPortPreprocessor 执行后: 全部 ${MODELS.length} 图 N/S 端口已隔离`, () => {
    const results = runAll(MODELS, AFTER_NS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'NorthSouthPortPreprocessor 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
