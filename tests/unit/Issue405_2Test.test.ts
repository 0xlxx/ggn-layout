/**
 * Issue405_2Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue405_2Test.java
 * 资源: tickets/layered/405_differentPortLabelPositions{NSWEOutside,TwoWestOutsideNextToPort}.elkt
 * 断言 (@Test, when='layout'): 4 个方向节点的端口/标签位置对称, EAST/WEST 只比 x, NORTH/SOUTH 只比 y.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import type { LGraph, LNode } from '../../src/index.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/405_differentPortLabelPositionsNSWEOutside.elkt'),
  ...resolveModels('tickets/layered/405_differentPortLabelPositionsTwoWestOutsideNextToPort.elkt'),
])
const EPS = 1e-3

function absolute(n: LNode): { x: number; y: number } {
  let x = n.position.x, y = n.position.y
  let g = n.getGraph()
  while (g && g.getParentNode()) {
    const pa = g.getParentNode()!
    x += pa.position.x; y += pa.position.y
    g = pa.getGraph()
  }
  return { x, y }
}

function collect(g: LGraph, nodeOf: Map<number, LNode>, names: string[], rootName: string):
  { ports: { x: number; y: number; side: string }[]; labels: { x: number; y: number; side: string }[] } {
  const rootIdx = names.indexOf(rootName)
  const root = rootIdx >= 0 ? nodeOf.get(rootIdx) : null
  const ports: { x: number; y: number; side: string }[] = []
  const labels: { x: number; y: number; side: string }[] = []
  if (!root || !root.getNestedGraph()) return { ports, labels }
  let n1: LNode | null = null
  for (const child of root.getNestedGraph()!.getAllNodes()) {
    const idx = [...nodeOf.entries()].find(([, v]) => v === child)?.[0]
    if (idx !== undefined && names[idx!] === 'N1') n1 = child
  }
  if (!n1) return { ports, labels }
  const origin = absolute(n1)
  for (const port of n1.getPorts()) {
    ports.push({ x: origin.x + port.getPosition().x, y: origin.y + port.getPosition().y, side: String(port.getSide()) })
    for (const label of port.getLabels()) {
      labels.push({ x: origin.x + port.getPosition().x + label.position.x, y: origin.y + port.getPosition().y + label.position.y, side: String(port.getSide()) })
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
      const match = (a: { x: number; y: number; side: string }, b: { x: number; y: number; side: string }) => {
        const ew = a.side === 'EAST' || a.side === 'WEST'
        return ew ? Math.abs(a.x - b.x) <= EPS : Math.abs(a.y - b.y) <= EPS
      }
      for (let i = 1; i < sets.length; i++) {
        const prev = sets[i - 1]!, cur = sets[i]!
        for (const port of prev.ports) {
          const n = cur.ports.filter(o => match(port, o)).length
          if (n !== 1) problems.push(`${rel}: ${topNodes[i - 1]} 端口 ${port.side} 在 ${topNodes[i]} 匹配数=${n}`)
        }
        for (const label of prev.labels) {
          const n = cur.labels.filter(o => match(label, o)).length
          if (n !== 1) problems.push(`${rel}: ${topNodes[i - 1]} 标签在 ${topNodes[i]} 匹配数=${n}`)
        }
      }
    },
  })
  p.layout(graph)
  return problems
}

describe('Issue405_2Test (ELK Java 移植)', () => {
  it(`端口/标签方向对称 (按侧单轴): ${MODELS.length} 图`, () => {
    const all: string[] = []
    for (const rel of MODELS) {
      try { all.push(...runOne(rel)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`) }
    }
    expect(all, `Issue405_2 对称性 (${all.length}):\n${all.slice(0, 12).join('\n')}`).toEqual([])
  })
})
