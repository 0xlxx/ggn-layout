/**
 * Issue455Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue455Test.java
 * 资源: tickets/layered/455_{long,short}HierarchicalEdges.elkt
 * 断言 (@Test, when='layout'): 层级节点子节点 x 坐标一致 (同一层, 容差 0.5).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allNodes } from './framework/graph-utils.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/455_longHierarchicalEdges.elkt'),
  ...resolveModels('tickets/layered/455_shortHierarchicalEdges.elkt'),
])
const FUZZY = 0.5

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: import('../../src/index.js').LGraph): string[] => {
      const problems: string[] = []
      for (const { node } of allNodes(g)) {
        const nested = node.getNestedGraph()
        if (!nested) continue
        // Java @Test(ElkNode) 检查输出图 children (外部端口/long-edge 等 dummy 已被
        // NorthSouthPortPostprocessor / CompoundGraphPostprocessor 移除); TS 内部 LGraph
        // 保留 dummy → 只统计 NORMAL 节点, 对齐 Java 输出语义.
        const xs = nested.getAllNodes().filter(c => c.getType() === 'NORMAL').map(c => c.position.x)
        if (xs.length === 0) continue
        const max = Math.max(...xs)
        const min = Math.min(...xs)
        if (max - min > FUZZY) {
          problems.push(`node ${node.id}: 子节点 x 范围 ${min}..${max} 非同一层`)
        }
      }
      return problems
    },
  },
]

describe('Issue455Test (ELK Java 移植)', () => {
  it(`层级子节点同一层: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue455 同层断言')
    expect(failed.length, msg).toBe(0)
  })
})
