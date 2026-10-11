/**
 * Issue502Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue502Test.java
 * 资源: tickets/layered/502_collapsingCompoundNode.elkt
 * 断言 (@Test, when='layout'): 层级节点足够容纳子节点与边弯点.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allNodes } from './framework/graph-utils.js'

const MODELS = limitModels(resolveModels('tickets/layered/502_collapsingCompoundNode.elkt'))

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: import('../../src/index.js').LGraph): string[] => {
      const problems: string[] = []
      for (const { node } of allNodes(g)) {
        const nested = node.getNestedGraph()
        if (!nested) continue
        let maxX = 0
        let maxY = 0
        // 子节点 (嵌套图内容, 局部坐标)
        for (const child of nested.getAllNodes()) {
          maxX = Math.max(maxX, child.position.x + child.size.x)
          maxY = Math.max(maxY, child.position.y + child.size.y)
        }
        // 嵌套图内边弯点
        for (const n of nested.getAllNodes()) {
          for (const port of n.getPorts()) {
            for (const e of port.getOutgoingEdges()) {
              for (const bp of e.getBendPoints()) {
                maxX = Math.max(maxX, bp.x)
                maxY = Math.max(maxY, bp.y)
              }
            }
          }
        }
        if (node.size.x < maxX || node.size.y < maxY) {
          problems.push(`node ${node.id}: 尺寸 ${node.size.x}x${node.size.y} 不足内容 ${maxX}x${maxY}`)
        }
      }
      return problems
    },
  },
]

describe('Issue502Test (ELK Java 移植)', () => {
  it(`层级节点足够大: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue502 节点尺寸')
    expect(failed.length, msg).toBe(0)
  })
})
