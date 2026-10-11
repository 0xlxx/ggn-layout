/**
 * BasicCycleBreakerTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../p1cycles/BasicCycleBreakerTest.java
 * 资源: realworld/ptolemy/** + tickets/layered/600_outgoingEdgeInLastSeparateNode.elkt
 * 配置: cycleBreaking.strategy ∈ {GREEDY, GREEDY_MODEL_ORDER, MODEL_ORDER, INTERACTIVE;
 *       DEPTH_FIRST, BFS_NODE_ORDER, DFS_NODE_ORDER, SCC_MODEL_ORDER, SCC_NODE_TYPE, SCC_CONNECTIVITY}.
 * 断言 (各 cycle breaker 后): DFS 无环.
 *
 * 新移植策略 (M1) 尚未在 layered-layout-provider.ts 注册 (策略注册主线程统一做),
 * 因此对它们直接调用 breaker.process() 断言「断环后无环」, 不经过 provider.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider } from '../../src/index.js'
import type { LGraph, LNode } from '../../src/index.js'
import { DepthFirstCycleBreaker } from '../../src/p1cycles/DepthFirstCycleBreaker.js'
import { BFSNodeOrderCycleBreaker } from '../../src/p1cycles/BFSNodeOrderCycleBreaker.js'
import { DFSNodeOrderCycleBreaker } from '../../src/p1cycles/DFSNodeOrderCycleBreaker.js'
import { SCCModelOrderCycleBreaker } from '../../src/p1cycles/SCCModelOrderCycleBreaker.js'
import { SCCNodeTypeCycleBreaker } from '../../src/p1cycles/SCCNodeTypeCycleBreaker.js'
import { SCConnectivity } from '../../src/p1cycles/SCConnectivity.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import { MODEL_ORDER, MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS } from '../../src/options/internal-properties.js'
import { collectAllGraphs } from '../../src/intermediate/elk-graph-importer.js'
import { processSelfLoops } from '../../src/intermediate/self-loop-preprocessor.js'
import type { IElkProgressMonitor } from '../../src/layered-layout-provider.js'

const MODELS = limitModels([
  ...resolveModels('realworld/ptolemy/**/*.elkt'),
  ...resolveModels('tickets/layered/600_outgoingEdgeInLastSeparateNode.elkt'),
])

/**
 * 直接调用型策略的合法输入: 仅扁平图 (无跨图边).
 * DepthFirst/BFS/DFS node-order breaker 用 node.id 作 visited/active 数组下标; 原生层级图
 * 的跨图边会让 DFS 进入其他图, 其节点 id 与当前图下标碰撞 → 误判 visited (ELK 管线在 P1 前
 * 经层级端口 dummy 路由消除跨图边, 故该输入在真实管线中不存在). SCC 策略虽用 Map 状态,
 * 但跨图边同样不属于合法 P1 输入. 层级图的断环语义由 provider 注册后 (主线程统一做) 覆盖.
 */
const DIRECT_MODELS = limitModels([
  ...resolveModels('realworld/ptolemy/flattened/**/*.elkt'),
  ...resolveModels('tickets/layered/600_outgoingEdgeInLastSeparateNode.elkt'),
])

const BREAKER_MODULE: Record<string, string> = {
  GREEDY: 'GreedyCycleBreaker',
  GREEDY_MODEL_ORDER: 'GreedyModelOrderCycleBreaker',
  MODEL_ORDER: 'ModelOrderCycleBreaker',
  INTERACTIVE: 'InteractiveCycleBreaker',
}

/** 直接调用型 breaker 工厂 (provider 未注册的新策略). */
interface DirectBreaker {
  process(g: LGraph, monitor: IElkProgressMonitor): void
}
const DIRECT_BREAKERS: { strategy: string; make: () => DirectBreaker }[] = [
  { strategy: 'DEPTH_FIRST', make: () => new DepthFirstCycleBreaker() },
  { strategy: 'BFS_NODE_ORDER', make: () => new BFSNodeOrderCycleBreaker() },
  { strategy: 'DFS_NODE_ORDER', make: () => new DFSNodeOrderCycleBreaker() },
  { strategy: 'SCC_MODEL_ORDER', make: () => new SCCModelOrderCycleBreaker() },
  { strategy: 'SCC_NODE_TYPE', make: () => new SCCNodeTypeCycleBreaker() },
  { strategy: 'SCC_CONNECTIVITY', make: () => new SCConnectivity() },
]

function isAcyclicDFS(gg: LGraph): boolean {
  const state = new Map<LNode, number>()
  const VISITING = 1, DONE = 2
  const nodes = [...gg.getLayerlessNodes(), ...gg.getLayers().flatMap(l => l.getNodes())]
  const stack: LNode[] = []
  const dfs = (n: LNode): boolean => {
    state.set(n, VISITING)
    stack.push(n)
    for (const e of n.getOutgoingEdges()) {
      const t = e.getTarget()?.getNode()
      if (!t) continue
      const st = state.get(t)
      if (st === VISITING && stack.includes(t)) return false
      if (st !== DONE && !dfs(t)) return false
    }
    stack.pop()
    state.set(n, DONE)
    return true
  }
  for (const n of nodes) {
    if (!state.has(n) && !dfs(n)) return false
  }
  return true
}

function runOne(rel: string, strategy: string): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', strategy)
  const problems: string[] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterModule(name, g) {
      if (name !== BREAKER_MODULE[strategy]) return
      if (!isAcyclicDFS(g as LGraph)) {
        problems.push(`${rel}: ${strategy} 断环后仍有环`)
      }
    },
  })
  p.layout(graph)
  return problems
}

/** 给图 (及嵌套子图) 赋 MODEL_ORDER + importer 属性, 供直接调用型策略使用. */
function prepareModelOrder(g: LGraph): void {
  let nodeIndex = 0
  for (const node of g.getLayerlessNodes()) {
    node.setProperty(MODEL_ORDER, nodeIndex++)
  }
  g.setProperty(MAX_MODEL_ORDER_NODES, nodeIndex)
  g.setProperty(CB_NUM_MODEL_ORDER_GROUPS, 0)
}

/** 直接调用 breaker: 对层级中每个图独立断环, 断言全部无环.
 * 先跑 SelfLoopPreprocessor (真实管线 P1 前置), 满足各 breaker「无自环」前置条件. */
function runOneDirect(rel: string, make: () => DirectBreaker): string[] {
  const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
  const { graph } = buildLGraphFromParsed(parsed, rel)
  const problems: string[] = []
  for (const g of collectAllGraphs(graph)) {
    prepareModelOrder(g)
    processSelfLoops(g)
    try {
      make().process(g, new NullProgressMonitor())
      if (!isAcyclicDFS(g)) {
        problems.push(`${rel}: 断环后仍有环`)
      }
    } catch (e) {
      problems.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`)
    }
  }
  return problems
}

describe('BasicCycleBreakerTest (ELK Java 移植)', () => {
  for (const strategy of Object.keys(BREAKER_MODULE)) {
    it(`cycleBreaking=${strategy}: 断环后无环 (${MODELS.length} 图)`, () => {
      const all: string[] = []
      for (const rel of MODELS) {
        try { all.push(...runOne(rel, strategy)) } catch (e) { all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`) }
      }
      expect(all, `${strategy} 断环断言 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
    })
  }

  // M1: 新移植策略 — provider 未注册, 直接调用断言无环 (扁平图, 见 DIRECT_MODELS 注释).
  for (const { strategy, make } of DIRECT_BREAKERS) {
    it(`cycleBreaking=${strategy} (直接调用): 断环后无环 (${DIRECT_MODELS.length} 图)`, () => {
      const all: string[] = []
      for (const rel of DIRECT_MODELS) {
        all.push(...runOneDirect(rel, make))
      }
      expect(all, `${strategy} 断环断言 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
    })
  }
})
