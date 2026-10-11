/**
 * Issue628Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue628Test.java
 * 资源: tickets/layered/628*.elkt
 * 配置: greedySwitch.hierarchicalType / greedySwitch.type ∈ {TWO_SIDED, null} (4 组合).
 * 断言 (@Test, when='layout'): 层级内 l2_1/l2_2 节点 y 相同, x 间距 = 10.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import type { LNode } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/**/*.elkt').filter(f => /\/628.+\.elkt$/.test(f)))

function checkSpacing(rel: string, hier: 'TWO_SIDED' | null, plain: 'TWO_SIDED' | null): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph, nodeOf } = buildLGraphFromParsed(parsed, rel)
  if (hier !== null) graph.setProperty('org.eclipse.elk.layered.crossingMinimization.greedySwitch.hierarchicalType', hier)
  if (plain !== null) graph.setProperty('org.eclipse.elk.layered.crossingMinimization.greedySwitch.type', plain)
  const problems: string[] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterPhase: (phase, g) => {
      if (phase !== 'done') return
      // 通过 elkt 名找 l2_1/l2_2 (nested 内)
      const names = parsed.nodes
      const find = (id: string): LNode | null => {
        const idx = names.indexOf(id)
        return idx >= 0 ? nodeOf.get(idx) ?? null : null
      }
      const l2_1 = find('l2_1')
      const l2_2 = find('l2_2')
      if (!l2_1 || !l2_2) return
      // 布局后子节点可能在嵌套图内; 用最终位置 (绝对)
      const pos = (n: LNode): { x: number; y: number } => {
        let x = n.position.x, y = n.position.y
        let gg = n.getGraph()
        while (gg && gg.getParentNode()) {
          const pa = gg.getParentNode()!
          x += pa.position.x; y += pa.position.y
          gg = pa.getGraph()
        }
        return { x, y }
      }
      const a = pos(l2_1), b = pos(l2_2)
      if (Math.abs(a.y - b.y) > 1e-5) problems.push(`${rel}: l2_1/l2_2 y 不同 (${a.y} vs ${b.y})`)
      if (Math.abs((b.x - (a.x + l2_1.size.x)) - 10) > 1e-5 && Math.abs((a.x - (b.x + l2_2.size.x)) - 10) > 1e-5) {
        problems.push(`${rel}: l2_1/l2_2 间距非 10 (${a.x},${b.x})`)
      }
    },
  })
  p.layout(graph)
  return problems
}

const CONFIGS: { name: string; hier: 'TWO_SIDED' | null; plain: 'TWO_SIDED' | null }[] = [
  { name: 'hierarchical=TWO_SIDED', hier: 'TWO_SIDED', plain: null },
  { name: 'hierarchical=null', hier: null, plain: null },
  { name: 'greedySwitch=TWO_SIDED', hier: null, plain: 'TWO_SIDED' },
  { name: 'greedySwitch=null', hier: null, plain: null },
]

describe('Issue628Test (ELK Java 移植)', () => {
  for (const cfg of CONFIGS) {
    it(`l2_1/l2_2 布局 (${cfg.name}): ${MODELS.length} 图`, () => {
      const all: string[] = []
      for (const rel of MODELS) {
        try { all.push(...checkSpacing(rel, cfg.hier, cfg.plain)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`) }
      }
      expect(all, `Issue628 ${cfg.name} (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
    })
  }
})
