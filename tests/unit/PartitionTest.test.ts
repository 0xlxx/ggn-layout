/**
 * PartitionTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../intermediate/PartitionTest.java
 * 资源: tests/layered/partitioning/** + tickets/layered/656_brokenLayoutPartitions.elkt
 * 断言 (@Test(ElkNode), when='layout'): 当 PARTITIONING_ACTIVATE 且节点带 partition 属性时,
 *   低 partition 节点的最右坐标必须小于高 partition 节点的最左坐标 (按 partition 顺序从左到右).
 *
 * ggn 缺口: ggn 未实现 partition 机制 (PARTITIONING_ACTIVATE / PARTITIONING_PARTITION 属性
 * 及 PartitionPreprocessor/PartitionMidprocessor/PartitionPostprocessor 均不存在) →
 * 分区布局不会发生, 断言无法触发 → it.skip, 不伪造通过.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph, LNode } from '../../src/index.js'

const MODELS = limitModels([
  ...resolveModels('tests/layered/partitioning/**/'),
  ...resolveModels('tickets/layered/656_brokenLayoutPartitions.elkt'),
])

/** 对应 Java testPartitionOrderInGraph: 同一图内按 partition 从小到大检查坐标不重叠. */
function checkPartitionOrderInGraph(g: LGraph): string[] {
  const problems: string[] = []
  if (!g.getProperty<boolean>('org.eclipse.elk.layered.partitioning.activate')) return problems

  const partitionToNodes = new Map<number, LNode[]>()
  for (const node of g.getLayerlessNodes()) {
    if (node.hasProperty('org.eclipse.elk.layered.partitioning.partition')) {
      const p = node.getProperty<number>('org.eclipse.elk.layered.partitioning.partition')
      const arr = partitionToNodes.get(p) ?? []
      arr.push(node)
      partitionToNodes.set(p, arr)
    }
  }
  if (partitionToNodes.size === 0) return problems

  const sortedIds = [...partitionToNodes.keys()].sort((a, b) => a - b)
  for (let i = 0; i < sortedIds.length - 1; i++) {
    const first = partitionToNodes.get(sortedIds[i])!
    const second = partitionToNodes.get(sortedIds[i + 1])!
    const rightmost = Math.max(...first.map(n => n.getPosition().x + n.getSize().x))
    const leftmost = Math.min(...second.map(n => n.getPosition().x))
    if (!(rightmost < leftmost)) {
      problems.push(`partition ${sortedIds[i]} 最右 x=${rightmost} >= partition ${sortedIds[i + 1]} 最左 x=${leftmost}`)
    }
  }
  return problems
}

/** 对应 Java testPartitionOrder: 递归检查所有层级的图 (父图 + 含子图的节点). */
function checkPartitionOrder(g: LGraph): string[] {
  const problems: string[] = []
  const queue: LGraph[] = [g]
  while (queue.length > 0) {
    const graph = queue.shift()!
    problems.push(...checkPartitionOrderInGraph(graph))
    for (const node of graph.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null) queue.push(nested)
    }
  }
  return problems
}

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => checkPartitionOrder(g),
  },
]

describe('PartitionTest (ELK Java 移植, tests/layered/partitioning)', () => {
  // ggn 未实现 partition 机制: PARTITIONING_ACTIVATE/PARTITIONING_PARTITION 属性不存在,
  // 分区布局不会发生, Java 的 partition 坐标断言无法触发. 保留移植断言, 待 ggn 实现后启用.
  it.skip(`Partition 布局后坐标断言: 全部 ${MODELS.length} 图 (ggn 未实现 partition 机制)`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    expect(failed.length, summarizeFailures(results, 'Partition 布局后坐标断言')).toBe(0)
  })
})
