/**
 * InLayerConstraintProcessorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/InLayerConstraintProcessorTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 配置 (@Configurator): 固定种子 0, 随机给每个节点赋 TOP(20%)/NONE(60%)/BOTTOM(20%) 层内约束.
 * 断言 (@TestAfterProcessor(InLayerConstraintProcessor)):
 *   每层内约束序列只能从 TOP 到 NONE 再到 BOTTOM (合法转移).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import type { LGraph, LNode } from '../../src/index.js'
import { InLayerConstraint } from '../../src/index.js'
import { JavaRandom } from '../../src/util/java-random.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

/** Java configureRandomInLayerConstraints: BFS 遍历所有节点, 固定种子随机赋层内约束. */
function configureRandomInLayerConstraints(g: LGraph): void {
  const rand = new JavaRandom(0)
  const queue: LNode[] = [...g.getLayerlessNodes()]
  while (queue.length > 0) {
    const node = queue.shift()!
    if (node.getNestedGraph() !== null) queue.push(...node.getNestedGraph()!.getLayerlessNodes())
    const r = rand.nextDouble()
    if (r < 0.2) node.setInLayerConstraint(InLayerConstraint.TOP)
    else if (r < 0.8) node.setInLayerConstraint(InLayerConstraint.NONE)
    else node.setInLayerConstraint(InLayerConstraint.BOTTOM)
  }
}

const AFTER_INLAYER = [
  {
    module: 'InLayerConstraintProcessor',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        let lastConstraint: InLayerConstraint | null = null
        for (const node of layer.getNodes()) {
          const currentConstraint = node.getInLayerConstraint()
          if (lastConstraint !== null && currentConstraint !== lastConstraint) {
            const error = `无效约束转移: ${lastConstraint} -> ${String(currentConstraint)} (node ${node.getId()})`
            if (currentConstraint === InLayerConstraint.NONE) {
              if (lastConstraint !== InLayerConstraint.TOP) problems.push(error)
            } else if (currentConstraint === InLayerConstraint.BOTTOM) {
              if (lastConstraint !== InLayerConstraint.TOP && lastConstraint !== InLayerConstraint.NONE) {
                problems.push(error)
              }
            }
          }
          lastConstraint = currentConstraint
        }
      }
      return problems
    },
  },
]

describe('InLayerConstraintProcessorTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`InLayerConstraintProcessor 执行后: 全部 ${MODELS.length} 图层内约束转移合法`, () => {
    const results = runAllPerGraph(MODELS, AFTER_INLAYER, configureRandomInLayerConstraints)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'InLayerConstraintProcessor 后置断言')
    expect(failed.length, msg).toBe(0)
  })
})
