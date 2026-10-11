/**
 * Issue405Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue405Test.java
 * 资源: tickets/layered/405_differentPortLabelPositions{NSWEInside,NSWEOutsideNextToPort,TwoWestOutside}.elkt
 * 断言 (@Test, when='layout'): 4 个方向节点 (Right/Down/Left/Up) 的端口绝对位置集合与
 *   端口标签位置集合必须一一匹配 (方向对称性, x/y 均比较).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import type { LGraph, LNode } from '../../src/index.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/405_differentPortLabelPositionsNSWEInside.elkt'),
  ...resolveModels('tickets/layered/405_differentPortLabelPositionsNSWEOutsideNextToPort.elkt'),
  ...resolveModels('tickets/layered/405_differentPortLabelPositionsTwoWestOutside.elkt'),
])
const EPS = 1e-3

interface Pt { x: number; y: number }

function absolute(n: LNode): Pt {
  let x = n.position.x, y = n.position.y
  let g = n.getGraph()
  while (g && g.getParentNode()) {
    const pa = g.getParentNode()!
    x += pa.position.x; y += pa.position.y
    g = pa.getGraph()
  }
  return { x, y }
}

function collect(g: LGraph, nodeOf: Map<number, LNode>, names: string[], rootName: string): { ports: Pt[]; labels: Pt[] } {
  const rootIdx = names.indexOf(rootName)
  const root = rootIdx >= 0 ? nodeOf.get(rootIdx) : null
  const ports: Pt[] = []
  const labels: Pt[] = []
  if (!root || !root.getNestedGraph()) return { ports, labels }
  // N1 是 root 的子节点
  const n1Idx = [...(root.getNestedGraph()!.getAllNodes())].map(n => [...nodeOf.entries()].find(([, v]) => v === n)?.[0]).find(i => i !== undefined && names[i!] === 'N1')
  let n1: LNode | null = null
  if (n1Idx !== undefined && n1Idx !== null) n1 = nodeOf.get(n1Idx) ?? null
  if (!n1) return { ports, labels }
  const origin = absolute(n1)
  for (const port of n1.getPorts()) {
    ports.push({ x: origin.x + port.getPosition().x, y: origin.y + port.getPosition().y })
    for (const label of port.getLabels()) {
      labels.push({ x: origin.x + port.getPosition().x + label.position.x, y: origin.y + port.getPosition().y + label.position.y })
    }
  }
  return { ports, labels }
}

function runOne(rel: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph, nodeOf } = buildLGraphFromParsed(parsed, rel)
  const problems: string[] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterPhase: (phase) => {
      if (phase !== 'done') return
      const topNodes = ['Right', 'Down', 'Left', 'Up']
      const sets = topNodes.map(name => collect(graph, nodeOf, parsed.nodes, name))
      for (let i = 1; i < sets.length; i++) {
        const prev = sets[i - 1]!, cur = sets[i]!
        const fuzzy = (a: Pt, b: Pt) => Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS
        for (const port of prev.ports) {
          const n = cur.ports.filter(o => fuzzy(port, o)).length
          if (n !== 1) problems.push(`${rel}: ${topNodes[i - 1]} 端口 (${port.x},${port.y}) 在 ${topNodes[i]} 中匹配数=${n}`)
        }
        for (const label of prev.labels) {
          const n = cur.labels.filter(o => fuzzy(label, o)).length
          if (n !== 1) problems.push(`${rel}: ${topNodes[i - 1]} 标签 (${label.x},${label.y}) 在 ${topNodes[i]} 中匹配数=${n}`)
        }
      }
    },
  })
  p.layout(graph)
  return problems
}

describe('Issue405Test (ELK Java 移植)', () => {
  it(`端口/标签方向对称: ${MODELS.length} 图`, () => {
    const all: string[] = []
    for (const rel of MODELS) {
      try { all.push(...runOne(rel)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`) }
    }
    expect(all, `Issue405 对称性 (${all.length}):\n${all.slice(0, 12).join('\n')}`).toEqual([])
  })
})
