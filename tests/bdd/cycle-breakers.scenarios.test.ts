/**
 * 断环策略族 (p1cycles, M1) — 直接 vitest BDD.
 *
 * 语义基准 = ELK Java 0.12.0 p1cycles:
 *   - DepthFirstCycleBreaker / BFSNodeOrderCycleBreaker / DFSNodeOrderCycleBreaker:
 *     DFS/BFS 遍历, 回边反转 → 断环后无环.
 *   - SCCModelOrderCycleBreaker / SCCNodeTypeCycleBreaker / SCConnectivity:
 *     Tarjan 强连通分量 + 每分量按 model order / 节点类型 / 连通性选边反转 → 断环后无环,
 *     SCC 划分正确.
 *
 * 不变量 (仅算法真实保证): 断环后无环; SCC 划分 = 手工强连通闭包; 反转边数 ≤ 原边数;
 * 模型序/节点类型优先规则 (精确反转集).
 *
 * 前置条件: 无自环 (自环由独立处理器处理, 各 breaker 直接跳过).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide } from '../../src/index.js'
import { DepthFirstCycleBreaker } from '../../src/p1cycles/DepthFirstCycleBreaker.js'
import { BFSNodeOrderCycleBreaker } from '../../src/p1cycles/BFSNodeOrderCycleBreaker.js'
import { DFSNodeOrderCycleBreaker } from '../../src/p1cycles/DFSNodeOrderCycleBreaker.js'
import { Tarjan, SCCModelOrderCycleBreaker } from '../../src/p1cycles/SCCModelOrderCycleBreaker.js'
import { SCCNodeTypeCycleBreaker, CB_PREFERRED_SOURCE_ID, CB_PREFERRED_TARGET_ID } from '../../src/p1cycles/SCCNodeTypeCycleBreaker.js'
import { SCConnectivity } from '../../src/p1cycles/SCConnectivity.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import {
  MODEL_ORDER, MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS, CYCLIC, REVERSED,
} from '../../src/options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
  GroupOrderStrategy,
} from '../../src/options/layered-options.js'
import type { IElkProgressMonitor } from '../../src/layered-layout-provider.js'

// ── 建图 helper ──

interface Built {
  g: LGraph
  nodes: Map<string, LNode>
  edges: Map<string, LEdge>
  edgeList: LEdge[]
}

/** 按名字建图: nodes 列表 + edges [from,to] 列表; 可给 MODEL_ORDER / CB_ID. */
function build(
  nodeNames: string[],
  edgeSpecs: [string, string][],
  opts?: { modelOrder?: Record<string, number>; groupId?: Record<string, number> },
): Built {
  const g = new LGraph()
  const nodes = new Map<string, LNode>()
  const edges = new Map<string, LEdge>()
  const edgeList: LEdge[] = []
  for (const name of nodeNames) {
    const n = new LNode(g)
    n.setLabels([{ text: name, position: { x: 0, y: 0 }, size: { x: 30, y: 20 } }])
    nodes.set(name, n)
  }
  for (const [from, to] of edgeSpecs) {
    const sp = new LPort(); sp.setNode(nodes.get(from)!); sp.setSide(PortSide.EAST)
    const tp = new LPort(); tp.setNode(nodes.get(to)!); tp.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
    edgeList.push(e)
    edges.set(`${from}->${to}`, e)
  }
  if (opts?.modelOrder) {
    for (const [name, mo] of Object.entries(opts.modelOrder)) nodes.get(name)!.setProperty(MODEL_ORDER, mo)
  }
  if (opts?.groupId) {
    for (const [name, id] of Object.entries(opts.groupId)) nodes.get(name)!.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID, id)
  }
  return { g, nodes, edges, edgeList }
}

/** importer 等价: MAX_MODEL_ORDER_NODES / CB_NUM_MODEL_ORDER_GROUPS. */
function importerProps(g: LGraph, numGroups = 0): void {
  g.setProperty(MAX_MODEL_ORDER_NODES, g.getLayerlessNodes().length)
  g.setProperty(CB_NUM_MODEL_ORDER_GROUPS, numGroups)
}

const nameOf = (e: LEdge): string => `${e.getSource()!.getNode()!.getLabels()[0]!.text}->${e.getTarget()!.getNode()!.getLabels()[0]!.text}`
const reversedNames = (g: LGraph): string[] => {
  const out: string[] = []
  const seen = new Set<LEdge>()
  for (const n of g.getLayerlessNodes()) {
    for (const p of n.getPorts()) {
      for (const e of p.getConnectedEdges()) {
        if (seen.has(e)) continue
        seen.add(e)
        if (e.getProperty(REVERSED)) out.push(nameOf(e))
      }
    }
  }
  return out.sort()
}

/** 不变量: 拓扑排序访问全部节点 (无环). */
function expectAcyclic(g: LGraph): void {
  const nodes = g.getLayerlessNodes()
  const indeg = new Map<LNode, number>()
  for (const n of nodes) indeg.set(n, 0)
  for (const n of nodes) {
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        indeg.set(e.getTarget()!.getNode()!, (indeg.get(e.getTarget()!.getNode()!) ?? 0) + 1)
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

// ── 场景 1: 各策略断环后无环 ──

interface BreakerFactory { strategy: string; make: () => { process(g: LGraph, m: IElkProgressMonitor): void } }

const STRATEGIES: BreakerFactory[] = [
  { strategy: 'DEPTH_FIRST', make: () => new DepthFirstCycleBreaker() },
  { strategy: 'BFS_NODE_ORDER', make: () => new BFSNodeOrderCycleBreaker() },
  { strategy: 'DFS_NODE_ORDER', make: () => new DFSNodeOrderCycleBreaker() },
  { strategy: 'SCC_MODEL_ORDER', make: () => new SCCModelOrderCycleBreaker() },
  { strategy: 'SCC_NODE_TYPE', make: () => new SCCNodeTypeCycleBreaker() },
  { strategy: 'SCC_CONNECTIVITY', make: () => new SCConnectivity() },
]

const CYCLIC_GRAPHS: { name: string; nodes: string[]; edges: [string, string][] }[] = [
  { name: '3-环 A→B→C→A', nodes: ['A', 'B', 'C'], edges: [['A', 'B'], ['B', 'C'], ['C', 'A']] },
  { name: '2-环 + 出尾', nodes: ['A', 'B', 'C'], edges: [['A', 'B'], ['B', 'A'], ['B', 'C']] },
  { name: '菱形回边', nodes: ['A', 'B', 'C', 'D'], edges: [['A', 'B'], ['A', 'C'], ['B', 'D'], ['C', 'D'], ['D', 'A']] },
  { name: '双环 + 桥', nodes: ['A', 'B', 'C', 'X', 'Y', 'Z'], edges: [['A', 'B'], ['B', 'C'], ['C', 'A'], ['X', 'Y'], ['Y', 'Z'], ['Z', 'X'], ['C', 'X']] },
  { name: '嵌套强连通 (全连)', nodes: ['A', 'B', 'C'], edges: [['A', 'B'], ['B', 'C'], ['C', 'A'], ['A', 'C'], ['C', 'B'], ['B', 'A']] },
]

describe('cycle-breakers: 断环后无环 (各策略 × 各环图)', () => {
  it.each(
    STRATEGIES.flatMap(s => CYCLIC_GRAPHS.map(g => ({ strategy: s.strategy, graphName: g.name, ...g, make: s.make }))),
  )('$strategy 在「$graphName」断环后无环', ({ nodes, edges, make }) => {
    const b = build(nodes, edges)
    importerProps(b.g)
    make().process(b.g, new NullProgressMonitor())
    expectAcyclic(b.g)
    expect(b.g.getProperty(CYCLIC)).toBe(true)
    // 不变量: 反转边数 ≤ 原边数, 且全部边仍完整.
    const rev = reversedNames(b.g)
    expect(rev.length).toBeLessThanOrEqual(edges.length)
    for (const e of b.edgeList) {
      expect(e.getSource()).not.toBeNull()
      expect(e.getTarget()).not.toBeNull()
    }
  })
})

// ── 场景 2: SCC 划分正确 ──

describe('cycle-breakers: Tarjan SCC 划分', () => {
  it('3-环 + 无环尾: 恰好 1 个 SCC = {A,B,C}, 尾部节点不入 SCC', () => {
    const { g, nodes } = build(['A', 'B', 'C', 'D', 'E'], [['A', 'B'], ['B', 'C'], ['C', 'A'], ['C', 'D'], ['D', 'E']])
    const sccs: Set<LNode>[] = []
    const map = new Map<LNode, number>()
    const t = new Tarjan([], sccs, map)
    t.resetTarjan(g)
    t.tarjan(g)

    expect(sccs).toHaveLength(1)
    const names = [...sccs[0]!].map(n => n.getLabels()[0]!.text).sort()
    expect(names).toEqual(['A', 'B', 'C'])
    for (const n of ['A', 'B', 'C']) expect(map.get(nodes.get(n)!)).toBe(0)
    for (const n of ['D', 'E']) expect(map.has(nodes.get(n)!)).toBe(false)
  })

  it('两个不相交环 + 桥: 2 个 SCC 各自闭合, 桥不合并分量', () => {
    const { g, nodes } = build(
      ['A', 'B', 'C', 'X', 'Y', 'Z'],
      [['A', 'B'], ['B', 'C'], ['C', 'A'], ['X', 'Y'], ['Y', 'Z'], ['Z', 'X'], ['C', 'X']],
    )
    const sccs: Set<LNode>[] = []
    const map = new Map<LNode, number>()
    const t = new Tarjan([], sccs, map)
    t.resetTarjan(g)
    t.tarjan(g)

    expect(sccs).toHaveLength(2)
    const compA = map.get(nodes.get('A')!)
    const compX = map.get(nodes.get('X')!)
    expect(compA).not.toBeUndefined()
    expect(compX).not.toBeUndefined()
    expect(compA).not.toBe(compX)
    for (const n of ['A', 'B', 'C']) expect(map.get(nodes.get(n)!)).toBe(compA)
    for (const n of ['X', 'Y', 'Z']) expect(map.get(nodes.get(n)!)).toBe(compX)
  })
})

// ── 场景 3: 模型序优先 (SCCModelOrder) ──

describe('cycle-breakers: SCC 模型序优先', () => {
  it('3-环: 选 model order 最大节点 C → 仅反转 C→A', () => {
    const { g, edges } = build(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']], { modelOrder: { A: 0, B: 1, C: 2 } })
    importerProps(g)
    new SCCModelOrderCycleBreaker().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->C'])
    expect(edges.get('C->A')!.getProperty(REVERSED)).toBe(true)
    expectAcyclic(g)
  })

  it('ENFORCED 组序: 组 1 的 C 最大 → 反转 C→A (组序优先于 model order)', () => {
    const { g } = build(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']], { modelOrder: { A: 0, B: 1, C: 2 }, groupId: { C: 1 } })
    g.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    importerProps(g, 2)
    new SCCModelOrderCycleBreaker().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->C'])
    expectAcyclic(g)
  })
})

// ── 场景 4: 节点类型优先 (SCCNodeType) ──

describe('cycle-breakers: SCC 节点类型优先', () => {
  it('首选 source: min 节点匹配组 id → 反转其入边', () => {
    const { g } = build(
      ['A', 'B', 'C'],
      [['A', 'B'], ['B', 'C'], ['C', 'A'], ['B', 'A']],
      { modelOrder: { A: 0, B: 1, C: 2 }, groupId: { A: 1 } },
    )
    importerProps(g)
    g.setProperty(CB_PREFERRED_SOURCE_ID, 1)
    g.setProperty(CB_PREFERRED_TARGET_ID, 99)
    new SCCNodeTypeCycleBreaker().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->B', 'A->C'])
    expectAcyclic(g)
  })

  it('首选 target: max 节点匹配组 id → 反转其出边', () => {
    const { g } = build(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']], { modelOrder: { A: 0, B: 1, C: 2 }, groupId: { C: 2 } })
    importerProps(g)
    g.setProperty(CB_PREFERRED_SOURCE_ID, 99)
    g.setProperty(CB_PREFERRED_TARGET_ID, 2)
    new SCCNodeTypeCycleBreaker().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->C'])
    expectAcyclic(g)
  })

  it('无匹配 → 回退连通性: min 入度 > max 出度时反转 min 入边', () => {
    const { g } = build(
      ['A', 'B', 'C'],
      [['A', 'B'], ['B', 'C'], ['C', 'A'], ['B', 'A']],
      { modelOrder: { A: 0, B: 1, C: 2 } },
    )
    importerProps(g)
    g.setProperty(CB_PREFERRED_SOURCE_ID, 99)
    g.setProperty(CB_PREFERRED_TARGET_ID, 99)
    new SCCNodeTypeCycleBreaker().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->B', 'A->C'])
    expectAcyclic(g)
  })
})

// ── 场景 5: 连通性 (SCConnectivity) ──

describe('cycle-breakers: SCC 连通性', () => {
  it('min 入度 ≤ max 出度 → 反转 max 出边', () => {
    const { g } = build(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']], { modelOrder: { A: 0, B: 1, C: 2 } })
    importerProps(g)
    new SCConnectivity().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->C'])
    expectAcyclic(g)
  })

  it('min 入度 > max 出度 → 反转 min 入边', () => {
    const { g } = build(
      ['A', 'B', 'C'],
      [['A', 'B'], ['B', 'C'], ['C', 'A'], ['B', 'A']],
      { modelOrder: { A: 0, B: 1, C: 2 } },
    )
    importerProps(g)
    new SCConnectivity().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->B', 'A->C'])
    expectAcyclic(g)
  })
})

// ── 场景 6: 节点序断环的模型序迭代 ──

describe('cycle-breakers: 节点序 (BFS/DFS) 模型序迭代', () => {
  it('DFSNodeOrder 按 model order 排序出边, 与 DepthFirst 边序反转集不同', () => {
    const specs: [string, string][] = [['A', 'B'], ['B', 'C'], ['C', 'A'], ['A', 'C'], ['C', 'B'], ['B', 'A']]
    // DepthFirst (边序): 反转 {C→A, C→B, B→A}.
    const b1 = build(['A', 'B', 'C'], specs)
    new DepthFirstCycleBreaker().process(b1.g, new NullProgressMonitor())
    expect(reversedNames(b1.g)).toEqual(['A->B', 'A->C', 'B->C'])

    // DFSNodeOrder (model order A=0, C=1, B=2): 反转 {C→A, B→A, B→C}.
    const b2 = build(['A', 'B', 'C'], specs, { modelOrder: { A: 0, C: 1, B: 2 } })
    new DFSNodeOrderCycleBreaker().process(b2.g, new NullProgressMonitor())
    expect(reversedNames(b2.g)).toEqual(['A->B', 'A->C', 'C->B'])
    expectAcyclic(b2.g)
  })

  it('BFSNodeOrder: 3-环按 model order 迭代 → 反转 C→A', () => {
    const { g, edges } = build(['A', 'B', 'C'], [['A', 'B'], ['B', 'C'], ['C', 'A']], { modelOrder: { A: 0, B: 1, C: 2 } })
    new BFSNodeOrderCycleBreaker().process(g, new NullProgressMonitor())
    expect(reversedNames(g)).toEqual(['A->C'])
    expect(edges.get('C->A')!.getProperty(REVERSED)).toBe(true)
    expectAcyclic(g)
  })
})
