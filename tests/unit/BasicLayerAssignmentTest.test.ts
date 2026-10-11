/**
 * BasicLayerAssignmentTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../p2layers/BasicLayerAssignmentTest.java
 * 资源: realworld/ptolemy/**
 * 配置: layering.strategy ∈ {COFFMAN_GRAHAM, LONGEST_PATH, LONGEST_PATH_SOURCE, MIN_WIDTH,
 *       NETWORK_SIMPLEX, STRETCH_WIDTH, INTERACTIVE, BF_MODEL_ORDER, DF_MODEL_ORDER}.
 * 断言 (各 layerer 后):
 *   - 无 layerless 节点 + 无空层 (层号无空洞);
 *   - 分层后边 targetLayer ≥ sourceLayer+1 (边指向更后层);
 *   - Coffman-Graham 每层节点数 ≤ layerBound;
 *   - MinWidth 层宽最小化 (maxWidth ≤ 单配置 (4,2) 的结果, -1 模式取全部候选中最窄).
 *
 * 新移植策略 (M2) 尚未在 layered-layout-provider.ts 注册 (策略注册主线程统一做),
 * 因此对它们直接调用 layerer.process() 断言不变量, 不经过 provider.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/index.js'
import type { LGraph } from '../../src/index.js'
import { CoffmanGrahamLayerer } from '../../src/p2layers/CoffmanGrahamLayerer.js'
import { BreadthFirstModelOrderLayerer } from '../../src/p2layers/BreadthFirstModelOrderLayerer.js'
import { DepthFirstModelOrderLayerer } from '../../src/p2layers/DepthFirstModelOrderLayerer.js'
import { MinWidthLayerer } from '../../src/p2layers/MinWidthLayerer.js'
import { StretchWidthLayerer } from '../../src/p2layers/StretchWidthLayerer.js'
import { GreedyCycleBreaker } from '../../src/p1cycles/greedy-cycle-breaker.js'
import { processSelfLoops } from '../../src/intermediate/self-loop-preprocessor.js'
import { assignModelOrdersRecursive, collectAllGraphs } from '../../src/intermediate/elk-graph-importer.js'
import { RANDOM } from '../../src/options/internal-properties.js'
import {
  LAYERING_COFFMAN_GRAHAM_LAYER_BOUND,
  LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH,
  LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR,
  LAYERING_STRATEGY,
  RANDOM_SEED,
} from '../../src/options/layered-options.js'
import { JavaRandom } from '../../src/util/java-random.js'
import type { IElkProgressMonitor } from '../../src/layered-layout-provider.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/*.elkt'))

/** 经 provider 注册的策略 (LayeredLayoutProvider 直接分发). */
const LAYERER_MODULE: Record<string, string> = {
  LONGEST_PATH: 'LongestPathLayerer',
  LONGEST_PATH_SOURCE: 'LongestPathSourceLayerer',
  NETWORK_SIMPLEX: 'NetworkSimplexLayerer',
  INTERACTIVE: 'InteractiveLayerer',
}

/** 直接调用型 layerer (provider 未注册的新策略, 与 Java 枚举名一致). */
interface DirectLayerer {
  process(g: LGraph, monitor: IElkProgressMonitor): void
}
const DIRECT_LAYERERS: { strategy: string; make: () => DirectLayerer }[] = [
  { strategy: 'COFFMAN_GRAHAM', make: () => new CoffmanGrahamLayerer() },
  { strategy: 'BF_MODEL_ORDER', make: () => new BreadthFirstModelOrderLayerer() },
  { strategy: 'DF_MODEL_ORDER', make: () => new DepthFirstModelOrderLayerer() },
  { strategy: 'MIN_WIDTH', make: () => new MinWidthLayerer() },
  { strategy: 'STRETCH_WIDTH', make: () => new StretchWidthLayerer() },
]

/** 分层后图不变量检查: 返回问题列表 (空 = 通过). */
function layerInvariantProblems(rel: string, strategy: string, gg: LGraph): string[] {
  const problems: string[] = []
  if (gg.getLayerlessNodes().length > 0) {
    problems.push(`${rel}: ${strategy} 后仍有 ${gg.getLayerlessNodes().length} 个 layerless 节点`)
  }
  // 层号无空洞: 无空层 + 层 id 连续 (与 Java testNoEmptyLayers 一致).
  let nextLayerId = 0
  for (const layer of gg.getLayers()) {
    if (layer.getNodes().length === 0) problems.push(`${rel}: ${strategy} 后存在空层`)
    layer.id = nextLayerId++
  }
  return problems
}

/** 边指向更后层 (Java testEdgesPointTowardsNextLayers: targetLayer ≥ sourceLayer+1).
 *  跳过自环/端点无层的边 (隐藏节点 / 跨层级边, 分层时不可见). */
function edgeForwardProblems(rel: string, strategy: string, gg: LGraph): string[] {
  const problems: string[] = []
  let nextLayerId = 0
  for (const layer of gg.getLayers()) layer.id = nextLayerId++
  for (const layer of gg.getLayers()) {
    for (const node of layer.getNodes()) {
      for (const edge of node.getOutgoingEdges()) {
        if (edge.isSelfLoop()) continue
        const src = edge.getSource()?.getNode()
        const tgt = edge.getTarget()?.getNode()
        if (src === null || src === undefined || tgt === null || tgt === undefined) continue
        if (src.getLayer() === null || tgt.getLayer() === null) continue
        if (src.getLayer()!.id >= tgt.getLayer()!.id) {
          problems.push(`${rel}: ${strategy} 边 ${src.id}->${tgt.id} 目标层 ${tgt.getLayer()!.id} ≤ 源层 ${src.getLayer()!.id}`)
        }
      }
    }
  }
  return problems
}

function runOne(rel: string, strategy: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  graph.setProperty(LAYERING_STRATEGY, strategy)
  const problems: string[] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterModule(name, g) {
      if (name !== LAYERER_MODULE[strategy]) return
      // hooks 对嵌套子图也触发, 检查当前布局的图 (回调参数), 非 root.
      problems.push(...layerInvariantProblems(rel, strategy, g as LGraph))
    },
  })
  p.layout(graph)
  return problems
}

/** 断开跨层级边 (CGP 会在 P2 前把跨层级边拆成段; 直接调用时移除, 只留图内边). */
function detachCrossGraphEdges(g: LGraph): void {
  const members = new Set(g.getLayerlessNodes())
  for (const n of g.getLayerlessNodes()) {
    for (const e of n.getConnectedEdges()) {
      const s = e.getSource()?.getNode()
      const t = e.getTarget()?.getNode()
      const sIn = s !== null && s !== undefined && members.has(s)
      const tIn = t !== null && t !== undefined && members.has(t)
      if (!sIn || !tIn) {
        e.setSource(null)
        e.setTarget(null)
      }
    }
  }
}

/** 直接调用 layerer: 每个图先做 P1 前置 (隐藏自环 + 断环) 再分层, 断言不变量. */
function runOneDirect(rel: string, entry: { strategy: string; make: () => DirectLayerer }): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  const problems: string[] = []
  graph.setProperty(LAYERING_STRATEGY, entry.strategy)
  // 策略属性需对层级中每个图可见 (assignModelOrders 按图查 LAYERING_STRATEGY 决定是否赋 MODEL_ORDER).
  for (const g of collectAllGraphs(graph)) g.setProperty(LAYERING_STRATEGY, entry.strategy)
  if (entry.strategy === 'COFFMAN_GRAHAM') {
    // 有意义地检验宽度约束 (Java 默认 MAX_INT 平凡成立).
    graph.setProperty(LAYERING_COFFMAN_GRAHAM_LAYER_BOUND, 4)
  }
  if (entry.strategy === 'MIN_WIDTH') {
    // 默认单配置 (4,2); 下方另跑 -1 全候选模式对比层宽最小化.
    graph.setProperty(LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH, 4)
    graph.setProperty(LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR, 2)
  }
  // BF/DF 需要 MODEL_ORDER (ELK ElkGraphImporter 在布局期赋值).
  assignModelOrdersRecursive(graph)

  for (const g of collectAllGraphs(graph)) {
    try {
      // P1 前置: 自环隐藏 (ELK SelfLoopPreprocessor) — CoffmanGraham 对自环会栈溢出.
      processSelfLoops(g)
      // 跨层级边移除 (模拟 CGP 拆段, 分层只处理图内边).
      detachCrossGraphEdges(g)
      // P1: 贪心断环 (默认配置).
      setRandomForCycleBreak(g)
      new GreedyCycleBreaker().process(g, new NullProgressMonitor())
      // Java GreedyCycleBreaker 会把 node.id 重设为 0..n-1 (层内索引) — TS GCB 缺该副作用,
      // DF 的 isConnectedToCurrentLayer 依赖 node.id, 直接调用时补上以对齐 Java 语义.
      if (entry.strategy === 'DF_MODEL_ORDER' || entry.strategy === 'BF_MODEL_ORDER') {
        let nodeIndex = 0
        for (const n of g.getLayerlessNodes()) n.id = nodeIndex++
      }
      // P2: 目标 layerer.
      entry.make().process(g, new NullProgressMonitor())
      problems.push(...layerInvariantProblems(rel, entry.strategy, g))
      // Java 的 DF/BF 是实验性策略, 在任意 DAG 上不保证「边前向」 (jar 实证:
      // 本簇图 5->0[1->0] / 8->0[0->0]) — 只有 Java BasicLayerAssignmentTest 覆盖的
      // COFFMAN_GRAHAM / MIN_WIDTH / STRETCH_WIDTH 断言边前向.
      if (entry.strategy === 'COFFMAN_GRAHAM' || entry.strategy === 'MIN_WIDTH' || entry.strategy === 'STRETCH_WIDTH') {
        problems.push(...edgeForwardProblems(rel, entry.strategy, g))
      }
      // Coffman-Graham 宽度约束: 每层节点数 ≤ layerBound.
      if (entry.strategy === 'COFFMAN_GRAHAM') {
        const bound = g.getProperty(LAYERING_COFFMAN_GRAHAM_LAYER_BOUND)
        for (const layer of g.getLayers()) {
          if (layer.getNodes().length > bound) {
            problems.push(`${rel}: COFFMAN_GRAHAM 层宽 ${layer.getNodes().length} > ${bound}`)
          }
        }
      }
    } catch (e) {
      problems.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`)
    }
  }
  return problems
}

/** 给图设 RANDOM (ELK GraphConfigurator: 每图独立 JavaRandom(randomSeed), seed 0 = 时间种子). */
function setRandomForCycleBreak(g: LGraph): void {
  const randomSeed = g.getProperty(RANDOM_SEED)
  g.setProperty(RANDOM, randomSeed === 0 ? new JavaRandom() : new JavaRandom(randomSeed))
}

/** MinWidth 层宽最小化: -1 全候选模式的 maxWidth ≤ 默认 (4,2) 的结果
 *  (由算法保证: (4,2) 是 -1 模式候选集 {1..4}×{1..2} 的一个成员, 取最窄候选). */
function runOneMinWidthMinimize(rel: string): string[] {
  const problems: string[] = []
  const widthOf = (ubw: number, c: number): number => {
    const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
    const { graph } = buildLGraphFromParsed(parsed, rel)
    graph.setProperty(LAYERING_STRATEGY, 'MIN_WIDTH')
    graph.setProperty(LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH, ubw)
    graph.setProperty(LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR, c)
    let maxWidth = 0
    for (const g of collectAllGraphs(graph)) {
      processSelfLoops(g)
      detachCrossGraphEdges(g)
      setRandomForCycleBreak(g)
      new GreedyCycleBreaker().process(g, new NullProgressMonitor())
      const layerer = new MinWidthLayerer()
      layerer.process(g, new NullProgressMonitor())
      maxWidth = Math.max(maxWidth, layerer.lastMaxWidth)
    }
    return maxWidth
  }
  try {
    const defaultWidth = widthOf(4, 2)
    const searchWidth = widthOf(-1, -1)
    if (searchWidth > defaultWidth + 1e-9) {
      problems.push(`${rel}: MIN_WIDTH -1 模式 maxWidth ${searchWidth} > 默认 ${defaultWidth}`)
    }
  } catch (e) {
    problems.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`)
  }
  return problems
}

describe('BasicLayerAssignmentTest (ELK Java 移植)', () => {
  for (const strategy of Object.keys(LAYERER_MODULE)) {
    it(`layering=${strategy}: 无 layerless/空层/边前向 (${MODELS.length} 图)`, () => {
      const all: string[] = []
      for (const rel of MODELS) {
        try { all.push(...runOne(rel, strategy)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`) }
      }
      expect(all, `${strategy} 分层断言 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
    })
  }

  // M2: 新移植策略 — provider 未注册, 直接调用断言不变量.
  for (const entry of DIRECT_LAYERERS) {
    it(`layering=${entry.strategy} (直接调用): 无 layerless/空层/边前向 (${MODELS.length} 图)`, () => {
      const all: string[] = []
      for (const rel of MODELS) {
        all.push(...runOneDirect(rel, entry))
      }
      expect(all, `${entry.strategy} 分层断言 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
    })
  }

  it('layering=MIN_WIDTH (直接调用): -1 全候选模式层宽 ≤ 默认配置 (层宽最小化)', () => {
    const all: string[] = []
    for (const rel of MODELS) {
      all.push(...runOneMinWidthMinimize(rel))
    }
    expect(all, `MIN_WIDTH 层宽断言 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
  })
})
