/**
 * BasicModelOrderTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../p2layers/BasicModelOrderTest.java
 * 资源: realworld/ptolemy/**
 * 配置: cycleBreaking=MODEL_ORDER + layering ∈ {BF_MODEL_ORDER, DF_MODEL_ORDER} (ggn 未实现 → skip).
 * 断言: 布局不崩溃.
 *
 * M1 补充: SCC 断环策略族 (SCCModelOrderCycleBreaker / SCCNodeTypeCycleBreaker / SCConnectivity)
 * 的「SCC 划分正确 / 模型序优先 / 节点类型优先」规则 + BFS/DFS node-order 模型序迭代.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolveModels, limitModels, MODEL_ROOT } from './framework/runner.js'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { buildLGraphFromParsed } from '../../shared/elkgraph-builder.ts'
import { LayeredLayoutProvider, LGraph, LNode, LPort, LEdge, PortSide } from '../../src/index.js'
import { Tarjan, SCCModelOrderCycleBreaker } from '../../src/p1cycles/SCCModelOrderCycleBreaker.js'
import { SCCNodeTypeCycleBreaker, CB_PREFERRED_SOURCE_ID, CB_PREFERRED_TARGET_ID } from '../../src/p1cycles/SCCNodeTypeCycleBreaker.js'
import { SCConnectivity } from '../../src/p1cycles/SCConnectivity.js'
import { DepthFirstCycleBreaker } from '../../src/p1cycles/DepthFirstCycleBreaker.js'
import { BFSNodeOrderCycleBreaker } from '../../src/p1cycles/BFSNodeOrderCycleBreaker.js'
import { DFSNodeOrderCycleBreaker } from '../../src/p1cycles/DFSNodeOrderCycleBreaker.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import {
  MODEL_ORDER, MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS, CYCLIC, REVERSED,
} from '../../src/options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
  GroupOrderStrategy,
} from '../../src/options/layered-options.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/*.elkt'))

describe('BasicModelOrderTest (ELK Java 移植)', () => {
  it(`cycleBreaking=MODEL_ORDER + 默认 layering: 布局不崩溃 (${MODELS.length} 图)`, () => {
    const all: string[] = []
    for (const rel of MODELS) {
      try {
        const parsed = parseElkt(readFileSync(`${MODEL_ROOT}/${rel}`, 'utf8'))
        const { graph } = buildLGraphFromParsed(parsed, rel)
        graph.setProperty('org.eclipse.elk.layered.cycleBreaking.strategy', 'MODEL_ORDER')
        new LayeredLayoutProvider().layout(graph)
      } catch (e) {
        all.push(`${rel}: 崩溃 ${String((e as Error).message).slice(0, 160)}`)
      }
    }
    expect(all, `MODEL_ORDER 布局崩溃 (${all.length}):\n${all.slice(0, 10).join('\n')}`).toEqual([])
  })

  it.skip('BF_MODEL_ORDER / DF_MODEL_ORDER layerer (ggn 未实现 model-order layering)', () => {
    // ELK 的 BF_MODEL_ORDER/DF_MODEL_ORDER layering 策略未移植到 ggn. 待实现后启用.
  })
})

// ── M1: SCC 断环策略族 — SCC 划分 / 模型序优先 / 节点类型优先 ──

/** 建一条 from→to 边 (每次新建端口, 保持端口/边创建顺序确定). */
function makeEdge(from: LNode, to: LNode): LEdge {
  const sp = new LPort()
  sp.setNode(from)
  sp.setSide(PortSide.EAST)
  const tp = new LPort()
  tp.setNode(to)
  tp.setSide(PortSide.WEST)
  const e = new LEdge()
  e.setSource(sp)
  e.setTarget(tp)
  return e
}

/** importer 等价属性: MODEL_ORDER 0..n + MAX_MODEL_ORDER_NODES + CB_NUM_MODEL_ORDER_GROUPS. */
function setupModelOrders(g: LGraph): void {
  let i = 0
  for (const n of g.getLayerlessNodes()) n.setProperty(MODEL_ORDER, i++)
  g.setProperty(MAX_MODEL_ORDER_NODES, i)
  g.setProperty(CB_NUM_MODEL_ORDER_GROUPS, 0)
}

/** 不变量: 图无环 (拓扑排序访问全部节点). */
function expectAcyclic(g: LGraph): void {
  const nodes = g.getLayerlessNodes()
  const indeg = new Map<LNode, number>()
  for (const n of nodes) indeg.set(n, 0)
  for (const n of nodes) {
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        const t = e.getTarget()!.getNode()!
        indeg.set(t, (indeg.get(t) ?? 0) + 1)
      }
    }
  }
  const queue = [...nodes].filter(n => (indeg.get(n) ?? 0) === 0)
  let visited = 0
  while (queue.length > 0) {
    const n = queue.shift()!
    visited++
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        const t = e.getTarget()!.getNode()!
        const d = (indeg.get(t) ?? 0) - 1
        indeg.set(t, d)
        if (d === 0) queue.push(t)
      }
    }
  }
  expect(visited, `拓扑排序只访问 ${visited}/${nodes.length} 节点 — 图仍有环`).toBe(nodes.length)
}

/** 被反转的边集合 (REVERSED 属性). */
function reversedEdges(g: LGraph): LEdge[] {
  const out: LEdge[] = []
  const seen = new Set<LEdge>()
  for (const n of g.getLayerlessNodes()) {
    for (const p of n.getPorts()) {
      for (const e of p.getConnectedEdges()) {
        if (seen.has(e)) continue
        seen.add(e)
        if (e.getProperty(REVERSED)) out.push(e)
      }
    }
  }
  return out
}

/** 边描述 (source→target 名字), 用于断言精确反转集. */
function edgeDesc(e: LEdge): string {
  return `${e.getSource()!.getNode()!.getLabels()[0]?.text ?? e.getSource()!.getNode()!.id}->${e.getTarget()!.getNode()!.getLabels()[0]?.text ?? e.getTarget()!.getNode()!.id}`
}

describe('M1 SCC 断环策略族 (ELK Java 0.12.0 移植)', () => {
  /** 带名节点 (edgeDesc 用标签文本描述边). */
  function namedNode(g: LGraph, name: string): LNode {
    const n = new LNode(g)
    n.setLabels([{ text: name, position: { x: 0, y: 0 }, size: { x: 30, y: 20 } }])
    return n
  }

  /** 建命名 3-环 A→B→C→A, 返回节点与边引用. */
  function named3Cycle(g: LGraph): { a: LNode; b: LNode; c: LNode; eAB: LEdge; eBC: LEdge; eCA: LEdge } {
    const a = namedNode(g, 'A'); const b = namedNode(g, 'B'); const c = namedNode(g, 'C')
    return { a, b, c, eAB: makeEdge(a, b), eBC: makeEdge(b, c), eCA: makeEdge(c, a) }
  }

  /** SCC 策略共用 importer 属性. */
  function sccProps(g: LGraph, groups = 0): void {
    g.setProperty(MAX_MODEL_ORDER_NODES, g.getLayerlessNodes().length)
    g.setProperty(CB_NUM_MODEL_ORDER_GROUPS, groups)
  }

  describe('Tarjan SCC 划分', () => {
    it('3-环 {A,B,C} 划为一个 SCC, 无环 D→E 不入 SCC', () => {
      const g = new LGraph()
      const a = new LNode(g); const b = new LNode(g); const c = new LNode(g)
      const d = new LNode(g); const e = new LNode(g)
      makeEdge(a, b); makeEdge(b, c); makeEdge(c, a)
      makeEdge(d, e)

      const sccs: Set<LNode>[] = []
      const map = new Map<LNode, number>()
      const t = new Tarjan([], sccs, map)
      t.resetTarjan(g)
      t.tarjan(g)

      expect(sccs).toHaveLength(1)
      const ids = [...sccs[0]!].map(n => n.id).sort((x, y) => x - y)
      expect(ids).toEqual([a.id, b.id, c.id].sort((x, y) => x - y))
      expect(map.get(a)).toBe(0)
      expect(map.get(b)).toBe(0)
      expect(map.get(c)).toBe(0)
      expect(map.has(d)).toBe(false)
      expect(map.has(e)).toBe(false)
    })

    it('两个不相交的环划为两个 SCC', () => {
      const g = new LGraph()
      const a = new LNode(g); const b = new LNode(g); const c = new LNode(g)
      const x = new LNode(g); const y = new LNode(g); const z = new LNode(g)
      makeEdge(a, b); makeEdge(b, c); makeEdge(c, a)
      makeEdge(x, y); makeEdge(y, z); makeEdge(z, x)

      const sccs: Set<LNode>[] = []
      const map = new Map<LNode, number>()
      const t = new Tarjan([], sccs, map)
      t.resetTarjan(g)
      t.tarjan(g)

      expect(sccs).toHaveLength(2)
      expect(map.get(a)).toBe(map.get(b))
      expect(map.get(a)).toBe(map.get(c))
      expect(map.get(x)).toBe(map.get(y))
      expect(map.get(x)).toBe(map.get(z))
      expect(map.get(a)).not.toBe(map.get(x))
    })
  })

  describe('SCCModelOrderCycleBreaker — 模型序优先', () => {
    it('3-环: 选 model order 最大节点 C 的出边 C→A 反转, 图无环', () => {
      const g = new LGraph()
      const { eCA } = named3Cycle(g)
      g.getLayerlessNodes()[0]!.setProperty(MODEL_ORDER, 0)
      g.getLayerlessNodes()[1]!.setProperty(MODEL_ORDER, 1)
      g.getLayerlessNodes()[2]!.setProperty(MODEL_ORDER, 2)
      sccProps(g)

      new SCCModelOrderCycleBreaker().process(g, new NullProgressMonitor())

      expect(eCA.getProperty(REVERSED)).toBe(true)
      expect(reversedEdges(g).map(edgeDesc).sort()).toEqual(['A->C'])
      expect(g.getProperty(CYCLIC)).toBe(true)
      expectAcyclic(g)
    })

    it('ENFORCED 组序: 组 1 的 C 组序最大 → C 出边反转', () => {
      const g = new LGraph()
      const { c, eCA } = named3Cycle(g)
      g.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
      g.getLayerlessNodes()[0]!.setProperty(MODEL_ORDER, 0)
      g.getLayerlessNodes()[1]!.setProperty(MODEL_ORDER, 1)
      c.setProperty(MODEL_ORDER, 2)
      c.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID, 1)
      sccProps(g, 2)
      // offset = max(3, 3) = 3; bigOffset = 3*2 = 6.
      // 组序: A = 0+0*3+0 = 0, B = 0+0*3+1 = 1, C = 0+1*3+2 = 5 → C 最大.

      new SCCModelOrderCycleBreaker().process(g, new NullProgressMonitor())

      expect(eCA.getProperty(REVERSED)).toBe(true)
      expect(reversedEdges(g).map(edgeDesc).sort()).toEqual(['A->C'])
      expectAcyclic(g)
    })
  })

  describe('SCCNodeTypeCycleBreaker — 节点类型 (首选 source/target) 优先', () => {
    it('首选 source: min 节点 A 的 CB_ID=1 匹配 cbPreferredSourceId=1 → 反转 A 的入边 (B→A, C→A)', () => {
      const g = new LGraph()
      const a = namedNode(g, 'A'); const b = namedNode(g, 'B'); const c = namedNode(g, 'C')
      makeEdge(a, b); makeEdge(b, c); makeEdge(c, a); makeEdge(b, a)
      a.setProperty(MODEL_ORDER, 0)
      b.setProperty(MODEL_ORDER, 1)
      c.setProperty(MODEL_ORDER, 2)
      sccProps(g)
      // min = A (model order 0) 且 CB_ID=1 == cbPreferredSourceId=1 → 反转 A 入边 (本 SCC 内).
      g.setProperty(CB_PREFERRED_SOURCE_ID, 1)
      g.setProperty(CB_PREFERRED_TARGET_ID, 99)
      a.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID, 1)

      new SCCNodeTypeCycleBreaker().process(g, new NullProgressMonitor())

      expect(reversedEdges(g).map(edgeDesc).sort()).toEqual(['A->B', 'A->C'])
      expectAcyclic(g)
    })

    it('首选 target: max 节点 C 的 CB_ID=2 匹配 cbPreferredTargetId=2 → 反转 C 的出边 C→A', () => {
      const g = new LGraph()
      const { c, eCA } = named3Cycle(g)
      g.getLayerlessNodes()[0]!.setProperty(MODEL_ORDER, 0)
      g.getLayerlessNodes()[1]!.setProperty(MODEL_ORDER, 1)
      c.setProperty(MODEL_ORDER, 2)
      sccProps(g)
      g.setProperty(CB_PREFERRED_SOURCE_ID, 99)
      g.setProperty(CB_PREFERRED_TARGET_ID, 2)
      c.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID, 2)

      new SCCNodeTypeCycleBreaker().process(g, new NullProgressMonitor())

      expect(eCA.getProperty(REVERSED)).toBe(true)
      expect(reversedEdges(g).map(edgeDesc).sort()).toEqual(['A->C'])
      expectAcyclic(g)
    })

    it('无匹配: 回退连通性 (min 入度 > max 出度 → 反转 min 入边)', () => {
      const g = new LGraph()
      const a = namedNode(g, 'A'); const b = namedNode(g, 'B'); const c = namedNode(g, 'C')
      makeEdge(a, b); makeEdge(b, c); makeEdge(c, a); makeEdge(b, a)
      a.setProperty(MODEL_ORDER, 0)
      b.setProperty(MODEL_ORDER, 1)
      c.setProperty(MODEL_ORDER, 2)
      sccProps(g)
      g.setProperty(CB_PREFERRED_SOURCE_ID, 99)
      g.setProperty(CB_PREFERRED_TARGET_ID, 99)
      // min = A: 入边 2 (B→A, C→A); max = C: 出边 1 (C→A) → 反转 A 入边.
      new SCCNodeTypeCycleBreaker().process(g, new NullProgressMonitor())

      expect(reversedEdges(g).map(edgeDesc).sort()).toEqual(['A->B', 'A->C'])
      expectAcyclic(g)
    })
  })

  describe('SCConnectivity — 连通性 (入度 vs 出度)', () => {
    it('min 入度 ≤ max 出度 → 反转 max 出边 (C→A)', () => {
      const g = new LGraph()
      const { eCA } = named3Cycle(g)
      g.getLayerlessNodes()[0]!.setProperty(MODEL_ORDER, 0)
      g.getLayerlessNodes()[1]!.setProperty(MODEL_ORDER, 1)
      g.getLayerlessNodes()[2]!.setProperty(MODEL_ORDER, 2)
      sccProps(g)
      // min=A (入 1), max=C (出 1): 1 > 1 不成立 → else 分支 → 反转 C 出边.
      new SCConnectivity().process(g, new NullProgressMonitor())

      expect(eCA.getProperty(REVERSED)).toBe(true)
      expect(reversedEdges(g).map(edgeDesc).sort()).toEqual(['A->C'])
      expectAcyclic(g)
    })

    it('min 入度 > max 出度 → 反转 min 入边 (B→A, C→A)', () => {
      const g = new LGraph()
      const a = namedNode(g, 'A'); const b = namedNode(g, 'B'); const c = namedNode(g, 'C')
      makeEdge(a, b); makeEdge(b, c); makeEdge(c, a); makeEdge(b, a)
      a.setProperty(MODEL_ORDER, 0)
      b.setProperty(MODEL_ORDER, 1)
      c.setProperty(MODEL_ORDER, 2)
      sccProps(g)
      // min=A (入 2), max=C (出 1): 2 > 1 → 反转 A 入边.
      new SCConnectivity().process(g, new NullProgressMonitor())

      expect(reversedEdges(g).map(edgeDesc).sort()).toEqual(['A->B', 'A->C'])
      expectAcyclic(g)
    })
  })

  describe('节点序断环 — 模型序迭代', () => {
    it('BFSNodeOrderCycleBreaker: 3-环按 model order 迭代 → C→A 反转', () => {
      const g = new LGraph()
      const { eCA } = named3Cycle(g)
      g.getLayerlessNodes()[0]!.setProperty(MODEL_ORDER, 0)
      g.getLayerlessNodes()[1]!.setProperty(MODEL_ORDER, 1)
      g.getLayerlessNodes()[2]!.setProperty(MODEL_ORDER, 2)

      new BFSNodeOrderCycleBreaker().process(g, new NullProgressMonitor())

      expect(eCA.getProperty(REVERSED)).toBe(true)
      expectAcyclic(g)
    })

    it('DFSNodeOrder 用 model order 排序出边 → 反转 {C→A, B→A, B→C}; 与 DepthFirst (边序) 的 {C→A, C→B, B→A} 不同', () => {
      // 强连通 {A,B,C}: e1=A→B, e2=B→C, e3=C→A, e4=A→C, e5=C→B, e6=B→A.
      const specs = (g: LGraph): void => {
        const a = namedNode(g, 'A'); const b = namedNode(g, 'B'); const c = namedNode(g, 'C')
        makeEdge(a, b); makeEdge(b, c); makeEdge(c, a); makeEdge(a, c); makeEdge(c, b); makeEdge(b, a)
      }

      // DepthFirst (边序): B 出边先 C 后 A → 反转 {e3=C→A, e5=C→B, e6=B→A} → 反转后 A→C, B→C, A→B.
      const g1 = new LGraph()
      specs(g1)
      new DepthFirstCycleBreaker().process(g1, new NullProgressMonitor())
      expect(reversedEdges(g1).map(edgeDesc).sort()).toEqual(['A->B', 'A->C', 'B->C'])
      expectAcyclic(g1)

      // DFSNodeOrder: model order A=0, C=1, B=2 → 反转 {e3=C→A, e6=B→A, e2=B→C} → 反转后 A→C, A→B, C→B.
      const g2 = new LGraph()
      specs(g2)
      const [a2, b2, c2] = g2.getLayerlessNodes()
      a2!.setProperty(MODEL_ORDER, 0)
      c2!.setProperty(MODEL_ORDER, 1)
      b2!.setProperty(MODEL_ORDER, 2)

      new DFSNodeOrderCycleBreaker().process(g2, new NullProgressMonitor())
      expect(reversedEdges(g2).map(edgeDesc).sort()).toEqual(['A->B', 'A->C', 'C->B'])
      expectAcyclic(g2)
    })
  })
})
