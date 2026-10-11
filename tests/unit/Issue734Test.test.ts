/**
 * Issue734Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue734Test.java
 * 资源: tickets/layered/734_*.elkt
 * 断言 (@Test, when='layout'): 顶层节点 x-span 与边 x-span 中心对齐 (容差 0.5).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/**/*.elkt').filter(f => /\/734_.+\.elkt$/.test(f)))

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      const nodes = g.getAllNodes().filter(n => !n.getNestedGraph())
      if (nodes.length === 0) return problems
      let nMin = Infinity, nMax = -Infinity
      for (const n of nodes) {
        nMin = Math.min(nMin, n.position.x)
        nMax = Math.max(nMax, n.position.x + n.size.x)
      }
      // 顶层边 x 范围 (端点 + 弯点)
      let eMin = Infinity, eMax = -Infinity
      const stack: LGraph[] = [g]
      let anyEdge = false
      while (stack.length) {
        const graph = stack.pop()!
        for (const n of graph.getLayerlessNodes()) if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
        for (const layer of graph.getLayers()) {
          for (const n of layer.getNodes()) {
            if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
            for (const port of n.getPorts()) {
              for (const e of port.getOutgoingEdges()) {
                anyEdge = true
                const s = e.getSource()!.getAbsoluteAnchor()
                const t = e.getTarget()!.getAbsoluteAnchor()
                for (const p of [s, ...e.getBendPoints(), t]) {
                  eMin = Math.min(eMin, p.x)
                  eMax = Math.max(eMax, p.x)
                }
              }
            }
          }
        }
      }
      if (!anyEdge) return problems
      const nCenter = (nMin + nMax) / 2
      const eCenter = (eMin + eMax) / 2
      if (Math.abs(nCenter - eCenter) > 0.5) {
        problems.push(`节点 x-span 中心 ${nCenter} 与边 x-span 中心 ${eCenter} 未对齐`)
      }
      return problems
    },
  },
]

describe('Issue734Test (ELK Java 移植)', () => {
  it(`节点/边 span 中心对齐: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue734 span 对齐')
    expect(failed.length, msg).toBe(0)
  })
})
