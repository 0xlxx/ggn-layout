/**
 * GreedyModelOrderCycleBreaker (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/p1cycles/
 *     GreedyModelOrderCycleBreaker.java
 *
 * 语义: 与 GreedyCycleBreaker 相同, 但「最大 outflow 候选」中按 model order 最小者优先
 * (非随机); 无 MODEL_ORDER 的节点被忽略, 全部忽略时退回随机选择.
 * 图属性 CYCLIC 在反转边时置 true; 处理后图无环.
 */
import { describe, expect, it, vi } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide } from '../../src/index.js'
import { GreedyModelOrderCycleBreaker } from '../../src/p1cycles/greedy-model-order-cycle-breaker.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import type { IElkProgressMonitor } from '../../src/layered-layout-provider.js'
import {
  MODEL_ORDER, MAX_MODEL_ORDER_NODES, CB_NUM_MODEL_ORDER_GROUPS, RANDOM, CYCLIC, REVERSED,
} from '../../src/options/internal-properties.js'
import {
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY,
  CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID,
  GroupOrderStrategy,
} from '../../src/options/layered-options.js'
import { JavaRandom } from '../../src/util/java-random.js'

/** 3-环 A→B→C→A (无层, 全部 layerless). */
function make3Cycle(): { g: LGraph; a: LNode; b: LNode; c: LNode; eAB: LEdge; eBC: LEdge; eCA: LEdge } {
  const g = new LGraph()
  g.setProperty(RANDOM, new JavaRandom(0))
  const a = new LNode(g)
  const b = new LNode(g)
  const c = new LNode(g)
  const eAB = makeEdge(a, b)
  const eBC = makeEdge(b, c)
  const eCA = makeEdge(c, a)
  return { g, a, b, c, eAB, eBC, eCA }
}

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

/** 不变量: 图无环 (topological sort 成功访问所有节点). */
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
  expect(visited).toBe(nodes.length)
}

/** 断环后无环 (忽略自环: 自环由 SelfLoopPreProcessor 在 P1 前置移除, breaker 不处理). */
function expectAcyclicExceptSelfLoops(g: LGraph): void {
  const nodes = g.getLayerlessNodes()
  const indeg = new Map<LNode, number>()
  for (const n of nodes) indeg.set(n, 0)
  for (const n of nodes) {
    for (const p of n.getPorts()) {
      for (const e of p.getOutgoingEdges()) {
        const t = e.getTarget()!.getNode()!
        if (t === n) continue  // 自环不计
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
        if (t === n) continue
        const d = (indeg.get(t) ?? 0) - 1
        indeg.set(t, d)
        if (d === 0) queue.push(t)
      }
    }
  }
  expect(visited).toBe(nodes.length)
}


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

describe('GreedyModelOrderCycleBreaker (ELK Java 0.12.0 移植)', () => {
  it('有 MODEL_ORDER: 最大 outflow 候选中选 model order 最小者 (A=0 被选, C→A 反转)', () => {
    const { g, a, b, c, eCA } = make3Cycle()
    a.setProperty(MODEL_ORDER, 0)
    b.setProperty(MODEL_ORDER, 1)
    c.setProperty(MODEL_ORDER, 2)

    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())

    // 手算 (ELK GreedyCycleBreaker): A 最先入列 (mark=1), B 为 source (2), C 为 sink (3);
    // 反转 mark[src]>mark[tgt] 的边: C→A (3>1) 反转 → 新边 A→C.
    expect(eCA.getProperty(REVERSED)).toBe(true)
    expect(eCA.getSource()!.getNode()).toBe(a)
    expect(eCA.getTarget()!.getNode()).toBe(c)
    expect(g.getProperty(CYCLIC)).toBe(true)
    // 不变量: 反转边数 = 1, 无环
    expect(reversedEdges(g)).toHaveLength(1)
    expectAcyclic(g)
  })

  it('ENFORCED 分组: computeConstraintGroupModelOrder 生效 → B (组序最小) 被选, A→B 反转', () => {
    const { g, a, b, c, eAB } = make3Cycle()
    g.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    g.setProperty(MAX_MODEL_ORDER_NODES, 3)
    g.setProperty(CB_NUM_MODEL_ORDER_GROUPS, 2)
    // offset = max(3, 3) = 3; smallOffset=3; bigOffset=6.
    // 组序: A=0+1*3+0=3, B=0+0*3+1=1, C=0+0*3+2=2 → B 最小.
    a.setProperty(MODEL_ORDER, 0)
    a.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID, 1)
    b.setProperty(MODEL_ORDER, 1)
    c.setProperty(MODEL_ORDER, 2)

    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())

    // 手算: B 先入列 (mark=1); A 变 sink (mark 3), C 变 source (mark 2); 反转 A→B (3>1).
    expect(eAB.getProperty(REVERSED)).toBe(true)
    expect(eAB.getSource()!.getNode()).toBe(b)
    expect(eAB.getTarget()!.getNode()).toBe(a)
    expect(g.getProperty(CYCLIC)).toBe(true)
    expectAcyclic(g)
  })

  it('无 MODEL_ORDER 的节点: 退回随机选择 (returnNode=null), 图仍无环', () => {
    const { g } = make3Cycle()
    // 不设置任何 MODEL_ORDER → chooseNodeWithMaxOutflow 走 random 分支

    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())

    expect(g.getProperty(CYCLIC)).toBe(true)
    expect(reversedEdges(g)).toHaveLength(1)
    expectAcyclic(g)
  })

  it('混合: 部分节点有 MODEL_ORDER, 候选里选有 MODEL_ORDER 且最小者 (无 MODEL_ORDER 被忽略)', () => {
    const { g, a, eAB } = make3Cycle()
    // 只给 A 和 C MODEL_ORDER; B 没有 → 候选按 model order 选 A (0 < 2)
    a.setProperty(MODEL_ORDER, 0)
    g.getLayerlessNodes()[2]!.setProperty(MODEL_ORDER, 2)

    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())

    // A 最先入列 → 与「A=0 被选」用例一致: C→A 反转
    expect(reversedEdges(g)).toHaveLength(1)
    expect(eAB.getProperty(REVERSED)).toBe(false)
    expectAcyclic(g)
  })
})

/**
 * 性质/随机属性测试 (writer C): 多种子随机环图 + 随机 MODEL_ORDER,
 * 断言处理后的图无环 (expectAcyclic) 且 CYCLIC 置 true.
 */
describe('GreedyModelOrderCycleBreaker 多种子随机属性测试', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])('seed=%i: 随机环图解析后无环', (seed) => {
    const r = new JavaRandom(seed)
    const g = new LGraph()
    g.setProperty(RANDOM, new JavaRandom(seed))
    const n = 8
    const nodes: LNode[] = []
    for (let i = 0; i < n; i++) {
      const nd = new LNode(g)
      nodes.push(nd)
      if (r.nextBoolean()) nd.setProperty(MODEL_ORDER, r.nextInt(100))
    }
    for (let i = 0; i < 3 * n; i++) {
      const a = nodes[r.nextInt(n)]!
      const b = nodes[r.nextInt(n)]!
      if (a !== b) makeEdge(a, b)
    }
    // 强制一个 3-环, 保证图是环图
    const x = nodes[0]!
    const y = nodes[1]!
    const z = nodes[2]!
    makeEdge(x, y)
    makeEdge(y, z)
    makeEdge(z, x)

    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())

    expect(g.getProperty(CYCLIC), `seed=${seed}`).toBe(true)
    expectAcyclic(g)
  })
})

/**
 * ─── T4X2 补测: GreedyCycleBreaker 基类 Java oracle 对齐 + 分支覆盖 (变异杀灭) ───
 * oracle 来自 ELK Java 0.12.0 jar (GreedyCycleBreaker 直跑, RANDOM=Java Random(0)),
 * 硬编码期望反转边集; 与 ggn TS 实现逐图核对一致.
 */
import { GreedyCycleBreaker } from '../../src/p1cycles/greedy-cycle-breaker.js'
import { PRIORITY_DIRECTION, LAYERING_LAYER_CONSTRAINT } from '../../src/options/layered-options.js'
import { LayerConstraint } from '../../src/graph/enums.js'

/** 建图: edges = [fromIx, toIx, priority?]; 节点索引按声明顺序; RANDOM=JavaRandom(seed). */
function makeGraph(seed: number, edges: [number, number, number?][]): { g: LGraph; nodes: LNode[]; edgeOf: (s: number, t: number) => LEdge | undefined } {
  const g = new LGraph()
  g.setProperty(RANDOM, new JavaRandom(seed))
  const maxIx = Math.max(0, ...edges.map(e => Math.max(e[0], e[1])))
  const nodes: LNode[] = []
  for (let i = 0; i <= maxIx; i++) nodes.push(new LNode(g))
  const es: LEdge[] = edges.map(([s, t, p]) => {
    const e = makeEdge(nodes[s]!, nodes[t]!)
    if (p !== undefined && p !== 0) e.setProperty(PRIORITY_DIRECTION, p)
    return e
  })
  const edgeOf = (s: number, t: number): LEdge | undefined => es.find(e =>
    e.getSource()!.getNode() === nodes[s] && e.getTarget()!.getNode() === nodes[t])
  return { g, nodes, edgeOf }
}

/** 边签名: "N0->N1 REVERSED" (REVERSED 属性置位), 顺序无关. */
function edgeSignatures(g: LGraph): string[] {
  const seen = new Set<LEdge>()
  const out: string[] = []
  const nodes = g.getLayerlessNodes()
  for (const n of nodes) {
    for (const p of n.getPorts()) {
      for (const e of p.getConnectedEdges()) {
        if (seen.has(e)) continue
        seen.add(e)
        const s = nodes.indexOf(e.getSource()!.getNode()!)
        const t = nodes.indexOf(e.getTarget()!.getNode()!)
        out.push(`N${s}->N${t}${e.getProperty(REVERSED) ? ' REVERSED' : ''}`)
      }
    }
  }
  return out.sort()
}

describe('GreedyCycleBreaker (基类) — Java 0.12.0 oracle 对齐 (seed=0)', () => {
  const CASES: { name: string; edges: [number, number, number?][]; expect: string[] }[] = [
    // 3-环: C→A 反转 (→ A→C)
    { name: 'cycle3', edges: [[0, 1], [1, 2], [2, 0]], expect: ['N0->N1', 'N0->N2 REVERSED', 'N1->N2'] },
    // C→A 带 priority 3 → C outdeg 最大, B→C 反转 (与无 priority 结果不同)
    { name: 'prio2 (C→A priority=3)', edges: [[0, 1], [1, 2], [2, 0, 3]], expect: ['N0->N1', 'N2->N0', 'N2->N1 REVERSED'] },
    // 双路径环: D→A 反转
    { name: 'asym 双路径', edges: [[0, 1], [0, 2], [1, 3], [2, 3], [3, 0]], expect: ['N0->N1', 'N0->N2', 'N0->N3 REVERSED', 'N1->N3', 'N2->N3'] },
    // 4-环平局 (seed0 nextInt(3)=0 → A): C→D 反转
    { name: 'tie4', edges: [[0, 1], [1, 2], [2, 3], [3, 0]], expect: ['N0->N1', 'N2->N1 REVERSED', 'N2->N3', 'N3->N0'] },
    // 两个独立 3-环: 各反转一条
    { name: 'twin 两环', edges: [[0, 1], [1, 2], [2, 0], [3, 4], [4, 5], [5, 3]], expect: ['N0->N1', 'N0->N2 REVERSED', 'N1->N2', 'N4->N3 REVERSED', 'N4->N5', 'N5->N3'] },
    // 带 sink/source 链: D→B 反转
    { name: 'srcsink', edges: [[0, 1], [1, 2], [2, 3], [3, 1]], expect: ['N0->N1', 'N1->N2', 'N1->N3 REVERSED', 'N2->N3'] },
    // 自环 A 被忽略 (自环不计入度): B→C 反转
    { name: 'sloop 自环忽略', edges: [[0, 1], [1, 2], [2, 1], [0, 0]], expect: ['N0->N0', 'N0->N1', 'N2->N1', 'N2->N1 REVERSED'] },
    // 自环 + A 为 source (indeg=0): B→C 反转
    { name: 'sloop2 自环 source', edges: [[1, 0], [1, 2], [2, 1], [0, 0]], expect: ['N0->N0', 'N1->N0', 'N2->N1', 'N2->N1 REVERSED'] },
    // priority 1 在 A→C: 不影响 (D→A 反转)
    { name: 'prio3 (A→C priority=1)', edges: [[0, 1], [0, 2, 1], [1, 3], [2, 3], [3, 0]], expect: ['N0->N1', 'N0->N2', 'N0->N3 REVERSED', 'N1->N3', 'N2->N3'] },
  ]

  it.each(CASES)('$name: 反转边集与 Java oracle 一致', ({ edges, expect: expected }) => {
    const { g } = makeGraph(0, edges)
    new GreedyCycleBreaker().process(g, new NullProgressMonitor())
    expect(edgeSignatures(g)).toEqual(expected)
    expect(g.getProperty(CYCLIC)).toBe(true)
    if (edges.some(e => e[0] === e[1])) expectAcyclicExceptSelfLoops(g)
    else expectAcyclic(g)
  })
})

describe('GreedyCycleBreaker (基类) — 平局 JavaRandom 确定性 (seed 扫描)', () => {
  it.each([0, 1, 2, 3, 4, 5, 6, 7])('3-环 seed=%i: 反转边集 = JavaRandom 选择的节点决定', (seed) => {
    // Java Random(seed).nextInt(3) = pick: 0→A, 1→B, 2→C.
    // pick A → C→A 反转; pick B → A→B 反转; pick C → B→C 反转.
    const { g, edgeOf } = makeGraph(seed, [[0, 1], [1, 2], [2, 0]])
    new GreedyCycleBreaker().process(g, new NullProgressMonitor())
    const pick = new JavaRandom(seed).nextInt(3)
    const reversed: string[] = edgeSignatures(g).filter(s => s.includes('REVERSED'))
    if (pick === 0) expect(reversed).toEqual(['N0->N2 REVERSED'])   // C→A 反转
    else if (pick === 1) expect(reversed).toEqual(['N1->N0 REVERSED'])  // A→B 反转
    else expect(reversed).toEqual(['N2->N1 REVERSED'])              // B→C 反转
    expectAcyclic(g)
  })
})

describe('GreedyCycleBreaker (基类) — GGN_GCB 调试钩子 / 生命周期', () => {
  const nodeProcess = () => (globalThis as { process?: { env: Record<string, string | undefined> } }).process!

  it('GGN_GCB=1: init/maxOutflow/chose/marks 四段调试输出齐全', () => {
    nodeProcess().env.GGN_GCB = '1'
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { g } = makeGraph(0, [[0, 1], [1, 2], [2, 0]])
      new GreedyCycleBreaker().process(g, new NullProgressMonitor())
      const all = spy.mock.calls.map(c => String(c[0])).join('\n')
      expect(all).toContain('GGN_GCB init:')
      expect(all).toContain('GGN_GCB maxOutflow=')
      expect(all).toContain('GGN_GCB chose')
      expect(all).toContain('GGN_GCB marks:')
    } finally {
      spy.mockRestore()
    }
  })

  it('GGN_GCB 未设: 无调试输出', () => {
    delete nodeProcess().env.GGN_GCB
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { g } = makeGraph(0, [[0, 1], [1, 2], [2, 0]])
      new GreedyCycleBreaker().process(g, new NullProgressMonitor())
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('monitor.begin 标签为 "Greedy cycle removal"', () => {
    const events: string[] = []
    const monitor: IElkProgressMonitor = {
      begin: (name: string) => { events.push(name) },
      done: () => {},
    }
    const { g } = makeGraph(0, [[0, 1], [1, 2], [2, 0]])
    new GreedyCycleBreaker().process(g, monitor)
    expect(events[0]).toBe('Greedy cycle removal')
  })

  it('初始 indeg/outdeg/mark 为空数组 (字段初值)', () => {
    const b = new GreedyCycleBreaker() as unknown as { indeg: unknown[]; outdeg: unknown[]; mark: unknown[] }
    expect(b.indeg).toEqual([])
    expect(b.outdeg).toEqual([])
    expect(b.mark).toEqual([])
  })
})

describe('GreedyModelOrderCycleBreaker — 分支补充 (变异杀灭)', () => {
  it('offset = max(nodes, MAX_MODEL_ORDER_NODES): FIRST+mo=5 在 MAX=10 下仍被选 (C→A 反转)', () => {
    // offset = max(3, 10) = 10 → A(FIRST, mo=5) = -10+5 = -5 < B(0) → A 被选
    const { g, edgeOf, nodes } = makeGraph(0, [[0, 1], [1, 2], [2, 0]])
    nodes[0]!.setProperty(LAYERING_LAYER_CONSTRAINT, LayerConstraint.FIRST)
    nodes[0]!.setProperty(MODEL_ORDER, 5)
    nodes[1]!.setProperty(MODEL_ORDER, 0)
    nodes[2]!.setProperty(MODEL_ORDER, 2)
    g.setProperty(MAX_MODEL_ORDER_NODES, 10)
    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())
    expect(edgeSignatures(g)).toEqual(['N0->N1', 'N0->N2 REVERSED', 'N1->N2'])
    expectAcyclic(g)
  })

  it('ENFORCED 组序: bigOffset = offset×组数, FIRST 组节点被选 (B→A 反转)', () => {
    // bigOffset = 3*2 = 6; A(FIRST, groupId=1, mo=0) = -6 + 1*3 + 0 = -3 < B(0) → A 被选
    const { g, nodes } = makeGraph(0, [[0, 1], [1, 2], [2, 0]])
    g.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CB_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    g.setProperty(MAX_MODEL_ORDER_NODES, 3)
    g.setProperty(CB_NUM_MODEL_ORDER_GROUPS, 2)
    nodes[0]!.setProperty(LAYERING_LAYER_CONSTRAINT, LayerConstraint.FIRST)
    nodes[0]!.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CYCLE_BREAKING_ID, 1)
    nodes[0]!.setProperty(MODEL_ORDER, 0)
    nodes[1]!.setProperty(MODEL_ORDER, 1)
    nodes[2]!.setProperty(MODEL_ORDER, 2)
    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())
    // A 被选 (mark=1) → B source(2), C sink(3) → C→A 反转
    expect(edgeSignatures(g)).toEqual(['N0->N1', 'N0->N2 REVERSED', 'N1->N2'])
    expectAcyclic(g)
  })

  it('无 MODEL_ORDER 节点 (seed=2): 退回随机 → B 被选 → A→B 反转', () => {
    const { g } = makeGraph(2, [[0, 1], [1, 2], [2, 0]])
    // 不给任何 MODEL_ORDER
    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())
    // JavaRandom(2).nextInt(3)=1 → B; 若错误地把缺失 MODEL_ORDER 当 0 则会选 A → C→A 反转.
    expect(edgeSignatures(g)).toEqual(['N1->N0 REVERSED', 'N1->N2', 'N2->N0'])
    expectAcyclic(g)
  })

  it('平局 MODEL_ORDER (A=B=0): 取首个候选 A → C→A 反转 (严格 > 保留首个)', () => {
    const { g } = makeGraph(0, [[0, 1], [1, 2], [2, 0]])
    const nodes = g.getLayerlessNodes()
    nodes[0]!.setProperty(MODEL_ORDER, 0)
    nodes[1]!.setProperty(MODEL_ORDER, 0)
    nodes[2]!.setProperty(MODEL_ORDER, 1)
    new GreedyModelOrderCycleBreaker().process(g, new NullProgressMonitor())
    // 严格 >: returnNode 保持 A (首个) → A 被选 → C→A 反转; 若 >= 则 B → A→B 反转.
    expect(edgeSignatures(g)).toEqual(['N0->N1', 'N0->N2 REVERSED', 'N1->N2'])
    expectAcyclic(g)
  })
})
