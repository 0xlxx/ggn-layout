/**
 * BasicNodePlacementTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../p4nodes/BasicNodePlacementTest.java
 * 资源: realworld/ptolemy/**
 * 配置: nodePlacement.strategy ∈ {默认(BK), NETWORK_SIMPLEX, SIMPLE, LINEAR_SEGMENTS}.
 * 断言 (各 placer 后): 层内节点 y 严格递增且不重叠.
 * LINEAR_SEGMENTS: provider 未注册该策略 (策略注册主线程统一做), 测试在 P4 前 (BKNodePlacer
 * before 钩子) 直接调用 LinearSegmentsNodePlacer, 额外断言线性段对齐 (长边 dummy 段同 y).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import { processLinearSegmentsNodePlace, collectLinearSegments } from '../../src/p4nodes/linear-segments-node-placer.js'
import type { LGraph } from '../../src/index.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/*.elkt'))

/** 各策略对应 provider 的 runModule 名 (LINEAR_SEGMENTS 未注册, 走 beforeModule('BKNodePlacer') 直调). */
const PLACER_MODULE: Record<string, string | null> = {
  BK: 'BKNodePlacer',
  NETWORK_SIMPLEX: 'NetworkSimplexPlacer',
  SIMPLE: 'SimpleNodePlacer',
  LINEAR_SEGMENTS: null,
}

/** 层内节点 y 严格递增 (按层内顺序), 即不重叠. */
function checkLayerOrder(rel: string, strategy: string, g: LGraph, problems: string[]): void {
  for (const layer of g.getLayers()) {
    let lastBottomY = -Infinity
    for (const node of layer.getNodes()) {
      if (!(lastBottomY < node.position.y)) {
        problems.push(`${rel}: ${strategy} 层内节点 ${node.id} y=${node.position.y} 未递增 (前节点底 ${lastBottomY})`)
      }
      lastBottomY = node.position.y + node.size.y
    }
  }
}

/** 线性段内所有节点 y 一致 (长边 dummy 链竖直对齐, 与 Java 语义一致). */
function checkSegmentAlignment(rel: string, g: LGraph, problems: string[]): void {
  for (const segment of collectLinearSegments(g)) {
    if (segment.length < 2) continue
    const y = segment[0]!.position.y
    for (const node of segment) {
      if (Math.abs(node.position.y - y) > 1e-6) {
        problems.push(`${rel}: LINEAR_SEGMENTS 线性段节点 y 未对齐 (${segment.map(n => n.id).join(',')})`)
        break
      }
    }
  }
}

function runOne(rel: string, strategy: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  if (strategy !== 'BK') graph.setProperty('org.eclipse.elk.layered.nodePlacement.strategy', strategy)
  const problems: string[] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterModule(name, g) {
      if (name !== PLACER_MODULE[strategy]) return
      checkLayerOrder(rel, strategy, g as LGraph, problems)
    },
    beforeModule(name, g) {
      if (name !== 'BKNodePlacer' || strategy !== 'LINEAR_SEGMENTS') return
      // provider 未注册 LINEAR_SEGMENTS → 在 P4 前直接跑 placer 验证语义 (随后 BK 覆盖, 不影响).
      const gg = g as LGraph
      processLinearSegmentsNodePlace(gg)
      checkLayerOrder(rel, strategy, gg, problems)
      checkSegmentAlignment(rel, gg, problems)
    },
  })
  p.layout(graph)
  return problems
}

describe('BasicNodePlacementTest (ELK Java 移植)', () => {
  for (const strategy of Object.keys(PLACER_MODULE)) {
    it(`nodePlacement=${strategy}: 层内 y 递增不重叠 (${MODELS.length} 图)`, () => {
      const all: string[] = []
      for (const rel of MODELS) {
        try { all.push(...runOne(rel, strategy)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`) }
      }
      expect(all, `${strategy} 放置断言 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
    })
  }
})
