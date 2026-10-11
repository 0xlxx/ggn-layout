/**
 * PartitionPostProcessorTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/PartitionPostProcessorTest.java
 * 资源: tests/layered/partitioning/** + tickets/layered/656_brokenLayoutPartitions.elkt
 * 断言 (@TestAfterProcessor(PartitionPostprocessor)):
 *   1) 无空层
 *   2) 同层所有 NORMAL 节点 partition 相同, 且各层 partition 单调不减
 *
 * ggn 缺口: ggn 未实现 PartitionPreprocessor/PartitionPostprocessor (src 中无任何
 * partition 处理器, PARTITIONING_* 属性也不存在) → PartitionPostprocessor 模块不会运行,
 * 断言无法触发 → it.skip, 不伪造通过.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'
import { NodeType } from '../../src/index.js'

const MODELS = limitModels([
  ...resolveModels('tests/layered/partitioning/**/'),
  ...resolveModels('tickets/layered/656_brokenLayoutPartitions.elkt'),
])

const AFTER_PARTITION = [
  {
    module: 'PartitionPostprocessor',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      // 1) noEmptyLayerTest
      for (const layer of g.getLayers()) {
        if (layer.getNodes().length === 0) problems.push(`层 ${layer.getIndex()} 为空`)
      }
      // 2) testPartitionOrder: 同层 partition 一致且单调不减
      let lastPartition = -1
      for (const layer of g.getLayers()) {
        let currentPartition = -1
        for (const node of layer.getNodes()) {
          if (node.getType() === NodeType.NORMAL && node.hasProperty('org.eclipse.elk.layered.partitioning.partition')) {
            const nodePartition = node.getProperty<number>('org.eclipse.elk.layered.partitioning.partition')
            if (currentPartition === -1) currentPartition = nodePartition
            else if (currentPartition !== nodePartition) {
              problems.push(`层 ${layer.getIndex()} 内 partition 不一致: ${currentPartition} vs ${nodePartition}`)
            }
          }
        }
        if (!(lastPartition <= currentPartition)) {
          problems.push(`层 ${layer.getIndex()} partition=${currentPartition} < 上一层 ${lastPartition}`)
        }
        lastPartition = currentPartition
      }
      return problems
    },
  },
]

describe('PartitionPostProcessorTest (ELK Java 移植, tests/layered/partitioning)', () => {
  // ggn 未实现 PartitionPostprocessor: 无 partition 处理器/属性, 模块不会运行 →
  // Java 的 noEmptyLayer / partitionOrder 断言无法触发. 保留移植断言, 待 ggn 实现后启用.
  it.skip(`PartitionPostprocessor 后置断言: 全部 ${MODELS.length} 图 (ggn 未实现 PartitionPostprocessor)`, () => {
    const results = runAll(MODELS, AFTER_PARTITION)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    expect(failed.length, summarizeFailures(results, 'PartitionPostprocessor 后置断言')).toBe(0)
  })
})
