/**
 * BasicCrossingMinimizationTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../p3order/BasicCrossingMinimizationTest.java
 * 资源: tests/**
 * 配置: crossingMinimization.strategy = LAYER_SWEEP.
 * 断言 (@TestBefore/@TestAfterProcessor(LayerSweepCrossingMinimizer)):
 *   交叉最小化不改变层分配 (只改层内顺序).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import type { LNode } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tests/**/*.elkt'))

function runOne(rel: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  graph.setProperty('org.eclipse.elk.layered.crossingMinimization.strategy', 'LAYER_SWEEP')
  const problems: string[] = []
  let recorded: Map<LNode, unknown> | null = null
  const p = new LayeredLayoutProvider()
  p.setHooks({
    beforeModule(name) {
      if (name !== 'LayerSweepCrossingMinimizer') return
      if (recorded !== null) {
        problems.push(`${rel}: 重复触发 before LayerSweepCrossingMinimizer`)
        return
      }
      recorded = new Map()
      for (const layer of graph.getLayers()) {
        for (const n of layer.getNodes()) recorded.set(n, layer)
      }
    },
    afterModule(name) {
      if (name !== 'LayerSweepCrossingMinimizer') return
      if (recorded === null) {
        problems.push(`${rel}: 缺 before 记录`)
        return
      }
      for (const layer of graph.getLayers()) {
        for (const n of layer.getNodes()) {
          if (recorded.get(n) !== layer) {
            problems.push(`${rel}: 节点 ${n.id} 层分配被交叉最小化改变`)
          }
        }
      }
      recorded = null
    },
  })
  p.layout(graph)
  return problems
}

describe('BasicCrossingMinimizationTest (ELK Java 移植)', () => {
  it(`交叉最小化不改变层分配: ${MODELS.length} 图`, () => {
    const all: string[] = []
    for (const rel of MODELS) {
      try { all.push(...runOne(rel)) } catch (e) {
        const msg = String((e as Error).message).slice(0, 160)
        // ELK 0.12.0 jar 自身对 compound06 报 IllegalStateException
        // "Expected N hierarchical ports, but found only M" (tests_batch 复刻标记 expected crash) —
        // ggn 复刻该崩溃是正确行为, 不算失败.
        if (/Expected \d+ hierarchical ports/.test(msg)) continue
        all.push(`${rel}: 崩溃 ${msg}`)
      }
    }
    expect(all, `层分配改变 (${all.length}):\n${all.slice(0, 12).join('\n')}`).toEqual([])
  })
})
