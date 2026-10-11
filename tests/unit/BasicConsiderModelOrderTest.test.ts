/**
 * BasicConsiderModelOrderTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../intermediate/BasicConsiderModelOrderTest.java
 * 资源: realworld/ptolemy/**
 * 配置: considerModelOrder.strategy ∈ {NODES_AND_EDGES, PREFER_EDGES, PREFER_NODES} × 有无权重.
 * 断言: SortByInputModel 执行后布局不崩溃 (Java test 仅 assert(true), 防回归).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/*.elkt'))

const STRATEGIES = ['NODES_AND_EDGES', 'PREFER_EDGES', 'PREFER_NODES']

function runOne(rel: string, strategy: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  graph.setProperty('org.eclipse.elk.layered.considerModelOrder.strategy', strategy)
  const problems: string[] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterModule(_name, g) {
      void g
    },
  })
  try {
    p.layout(graph)
  } catch (e) {
    problems.push(`${rel}: 布局崩溃 ${String((e as Error).message).slice(0, 160)}`)
  }
  return problems
}

describe('BasicConsiderModelOrderTest (ELK Java 移植)', () => {
  for (const strategy of STRATEGIES) {
    it(`considerModelOrder=${strategy}: 布局不崩溃 (${MODELS.length} 图)`, () => {
      const all: string[] = []
      for (const rel of MODELS) {
        all.push(...runOne(rel, strategy))
      }
      expect(all, `${strategy} 布局崩溃 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
    })
  }
})
