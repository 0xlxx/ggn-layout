/**
 * Issue905Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue905Test.java
 * 资源: tickets/layered/905_beginLabel{AboveEdge,BellowEdge}.elkt
 * 断言 (@Test, when='layout'): 边标签绝对坐标与 jar 期望一致.
 *
 * ★ 检查时机: Java @Test(ElkNode) 在 RecursiveGraphLayoutEngine **完整布局后**收到图
 *   (含 CompoundGraphPostprocessor 的 copyLabelsBack). TS afterPhase('done') 在
 *   doHierarchicalLayout 内触发、早于 postprocessor → 本测试改为 layout() 返回后直接遍历
 *   全部图 (递归嵌套) 收集边标签, 对齐 Java 语义.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels([
  ...resolveModels('tickets/layered/905_beginLabelAboveEdge.elkt'),
  ...resolveModels('tickets/layered/905_beginLableBellowEdge.elkt'),
])

/** 递归收集全部图中所有边标签 (跨层级边可能在嵌套图内或重连回引用图). */
function collectEdgeLabels(root: LGraph): { text: string; position: { x: number; y: number }; placement?: string }[] {
  const out: { text: string; position: { x: number; y: number }; placement?: string }[] = []
  const seen = new Set<LGraph>()
  const stack: LGraph[] = [root]
  while (stack.length > 0) {
    const g = stack.pop()!
    if (seen.has(g)) continue
    seen.add(g)
    for (const n of g.getAllNodes()) {
      if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
      for (const port of n.getPorts()) {
        for (const e of port.getOutgoingEdges()) {
          out.push(...e.getLabels())
        }
      }
    }
  }
  return out
}

function runOne(rel: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  const p = new LayeredLayoutProvider()
  p.layout(graph)
  const edgeLabels = collectEdgeLabels(graph)
  if (edgeLabels.length === 0) {
    return [`${rel}: 无边标签`]
  }
  // 期望坐标 (原测试 RIGHT 默认方向, jar 实测)
  const expected: Record<string, [number, number]> = {
    TAIL: [10, 92], CENTER: [61, 91], HEAD: [124, 92],
  }
  const problems: string[] = []
  for (const label of edgeLabels) {
    const placement = (label.placement ?? 'CENTER').toUpperCase()
    const exp = expected[placement]
    if (!exp) continue
    if (Math.abs(label.position.x - exp[0]) > 0.01 || Math.abs(label.position.y - exp[1]) > 0.01) {
      problems.push(`${rel}: ${placement} 标签坐标 (${label.position.x},${label.position.y}) 期望 (${exp[0]},${exp[1]})`)
    }
  }
  return problems
}

describe('Issue905Test (ELK Java 移植)', () => {
  it(`边标签坐标: ${MODELS.length} 图`, () => {
    const all: string[] = []
    for (const rel of MODELS) {
      try { all.push(...runOne(rel)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`) }
    }
    expect(all, `Issue905 标签坐标 (${all.length}):\n${all.slice(0, 12).join('\n')}`).toEqual([])
  })
})
