/**
 * 调试块 (GGN_*_DBG 环境变量门控 console.error) 覆盖测试.
 *
 * 目的: 变异测试中 src/p3order 大量 NOCOV/Survived 变异体位于 env 门控调试块.
 * 本文件为每个调试块构造确定性场景 + 断言 console.error 的**精确**输出串:
 * 变异体 (字符串置空/条件翻转/块删除等) 会导致输出串变化或不再输出 → 测试失败 → 变异体被杀.
 *
 * 精确输出串由本地探测脚本 (set env + 跑同一代码路径) 获取, 与实现 1:1 对齐.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LGraph, LNode, PortSide, PortType, NodeType, Layer as GLayer } from '../../src/index.js'
import { TestGraphCreator, NorthSouthEdgeTestGraphCreator, addPortOnSide, addEdgeBetweenPorts, eastWestEdgeFromTo } from './helpers/TestGraphCreator.js'
import { AllCrossingsCounter, initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { CrossingsCounter } from '../../src/p3order/counting.js'
import { BarycenterHeuristic } from '../../src/p3order/barycenter-heuristic.js'
import { ForsterConstraintResolver } from '../../src/p3order/forster-constraint-resolver.js'
import { NodeRelativePortDistributor, createPortDistributor, CrossMinType } from '../../src/p3order/port-distributors.js'
import { LayerSweepCrossingMinimizer } from '../../src/p3order/layer-sweep-crossing-minimizer.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import { THOROUGHNESS } from '../../src/options/layered-options.js'
import { IN_LAYER_SUCCESSOR_CONSTRAINTS } from '../../src/options/internal-properties.js'

declare const process: { env: Record<string, string | undefined> }
const DBG_ENVS = [
  'GGN_SWEEP_DBG', 'GGN_CC_DBG', 'GGN_NS_DBG', 'GGN_P3_DBG', 'GGN_BD_DBG', 'GGN_RANK_DBG',
  'GGN_FORSTER_DBG', 'GGN_SWEEP_WHO', 'GGN_SL_DBG', 'GGN_PD', 'GGN_NR', 'GGN_INIT_ORDER',
  'GGN_GPD_DBG', 'GGN_P3_DBG',
] as const

afterEach(() => {
  vi.restoreAllMocks()
  for (const k of DBG_ENVS) delete process.env[k]
})

function captureError(): { calls: string[] } {
  const calls: string[] = []
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    calls.push(args.map(String).join(' '))
  })
  return { calls }
}

/** 交叉图: left[A,B] → right[C,D], A→D, B→C (1 个交叉). */
function crossFormed(tg: TestGraphCreator): void {
  const left = tg.addNodesToLayer(2, tg.makeLayer())
  const right = tg.addNodesToLayer(2, tg.makeLayer())
  tg.eastWestEdgeFromTo(left[0]!, right[1]!)
  tg.eastWestEdgeFromTo(left[1]!, right[0]!)
}

describe('GGN_SWEEP_DBG (AllCrossingsCounter.countAllCrossings)', () => {
  it('输出精确计数与层标签', () => {
    const tg = new TestGraphCreator()
    const g = tg.getCrossFormedGraph()
    const order = g.toNodeArray()
    process.env.GGN_SWEEP_DBG = '1'
    const { calls } = captureError()
    const counter = new AllCrossingsCounter(order)
    initInitializables([counter], order)
    expect(counter.countAllCrossings(order)).toBe(1)
    expect(calls).toEqual(['GGN_CNT crossings=1 layers=[?,? | ?,?]'])
  })

  it('含层内边图: 输出 3 层标签', () => {
    const tg = new TestGraphCreator()
    const g = tg.getInLayerEdgesGraph()
    const order = g.toNodeArray()
    process.env.GGN_SWEEP_DBG = '1'
    const { calls } = captureError()
    const counter = new AllCrossingsCounter(order)
    initInitializables([counter], order)
    expect(counter.countAllCrossings(order)).toBe(1)
    expect(calls).toEqual(['GGN_CNT crossings=1 layers=[? | ?,?,? | ?]'])
  })
})

describe('GGN_NS_DBG (CrossingsCounter.countNorthSouthPortCrossingsInLayer)', () => {
  it('N-S 向下交叉图: 输出层端口详情', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const g = tg.getNorthSouthDownwardCrossingGraph()
    const order = g.toNodeArray()
    process.env.GGN_NS_DBG = '1'
    const { calls } = captureError()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countNorthSouthPortCrossingsInLayer(order[0]!)).toBe(1)
    expect(calls.length).toBe(1)
    expect(calls[0]).toMatch(/^GGN_NS_LAYER .+ => 1$/)
    expect(calls[0]).not.toContain('undefined')
  })
})

describe('GGN_CC_DBG (CrossingsCounter 层内计数)', () => {
  it('层内边计数输出端口详情', () => {
    const tg = new TestGraphCreator()
    const g = tg.getInLayerEdgesGraph()
    const order = g.toNodeArray()
    process.env.GGN_CC_DBG = '1'
    const { calls } = captureError()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    // inLayerEdgesGraph: 层内边在中间层 (WEST 侧)
    expect(cc.countInLayerCrossingsOnSide(order[1]!, PortSide.WEST)).toBe(1)
    expect(calls.length).toBeGreaterThanOrEqual(1)
    for (const c of calls) {
      expect(c).toMatch(/^CC port \S+ pos \d+ edges .+$/)
    }
  })
})

describe('GGN_P3_DBG (BarycenterHeuristic + LayerSweepCrossingMinimizer)', () => {
  function makeBarycentric(): { bh: BarycenterHeuristic; nodes: LNode[][]; tg: TestGraphCreator } {
    const tg = new TestGraphCreator()
    crossFormed(tg)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const random = tg.randomMock
    ;(random as any).setChangeBy(0)
    const portDist = new NodeRelativePortDistributor(nodes.length)
    const cr = new ForsterConstraintResolver(nodes)
    initInitializables([portDist, cr], nodes)
    const bh = new BarycenterHeuristic(cr, random as any, portDist, nodes)
    initInitializables([bh], nodes)
    return { bh, nodes, tg }
  }

  it('setFirstLayerOrder: 精确输出随机化层序', () => {
    const { bh, nodes } = makeBarycentric()
    process.env.GGN_P3_DBG = '1'
    const { calls } = captureError()
    bh.setFirstLayerOrder(nodes, true)
    expect(calls).toEqual([
      'GGN setFirstLayerOrder fwd=true layers=2 startIdx=0 nodes=2',
      'GGN BARY layer=0 fwd=true preOrdered=false randomize=true after=[0(0.0100) 1(0.0100)]',
    ])
  })

  it('minimizeCrossings: 精确输出 rank 与 barycenter', () => {
    const { bh, nodes } = makeBarycentric()
    process.env.GGN_P3_DBG = '1'
    process.env.GGN_BD_DBG = '1'
    process.env.GGN_RANK_DBG = '1'
    const { calls } = captureError()
    bh.minimizeCrossings(nodes, 1, true, true)
    expect(calls).toEqual([
      'GGN_RANK OUTPUT layer=[0[0](rank:0=0.5) | 1[1](rank:1=1.5)]',
      'GGN_BD 0 L1 degree=1 sw=1.4657 bc=1.4657 [1->2:1.5]',
      'GGN_BD 1 L1 degree=1 sw=0.4657 bc=0.4657 [0->3:0.5]',
      'GGN BARY layer=1 fwd=true preOrdered=false randomize=false after=[1(0.4657) 0(1.4657)]',
    ])
  })

  it('无标签节点: GGN_BD 用节点 id 兜底 (不输出 undefined)', () => {
    const { bh, nodes } = makeBarycentric()
    process.env.GGN_BD_DBG = '1'
    const { calls } = captureError()
    bh.minimizeCrossings(nodes, 1, true, true)
    for (const c of calls) {
      expect(c).toMatch(/^GGN_BD \d+ L1 degree=\d+ sw=[\d.-]+ bc=[\d.-]+ \[.+\]$/)
      expect(c).not.toContain('undefined')
    }
  })

  it('LayerSweepCrossingMinimizer.process: sweep 调试输出', () => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    tg.getGraph().setProperty(THOROUGHNESS, 1)
    process.env.GGN_P3_DBG = '1'
    process.env.GGN_SWEEP_WHO = '1'
    const { calls } = captureError()
    const cm = new LayerSweepCrossingMinimizer(CrossMinType.BARYCENTER)
    cm.process(tg.getGraph(), new NullProgressMonitor())
    expect(calls).toContain('GGN_SWEEP_WHO parent=root layers=2 type=0')
    expect(calls).toContain('GGN sweep init type=0 randomSeed=0')
    expect(calls).toContain('GGN sweep graph=root layers=2')
    expect(calls).toContain('GGN sweep withCounter type=0 firstForward=true')
    expect(calls.some(c => /^GGN createPortDistributor #\d+$/.test(c))).toBe(true)
    expect(calls.some(c => c.startsWith('GGN sortPorts L0 node=0 before=[0:EAST('))).toBe(true)
    expect(calls.some(c => c.startsWith('GGN sortPorts L1 node=1 before=[3:WEST('))).toBe(true)
    expect(calls.every(c => !c.includes('undefined'))).toBe(true)
  })
})

describe('GGN_INIT_ORDER (LayerSweepCrossingMinimizer 初始化序)', () => {
  it('输出初始层序', () => {
    const tg = new TestGraphCreator()
    tg.getCrossFormedGraph()
    tg.getGraph().setProperty(THOROUGHNESS, 1)
    process.env.GGN_INIT_ORDER = '1'
    const { calls } = captureError()
    const cm = new LayerSweepCrossingMinimizer(CrossMinType.BARYCENTER)
    cm.process(tg.getGraph(), new NullProgressMonitor())
    expect(calls.some(c => c.startsWith('GGN_INIT parent=root (#layers=2): L0:'))).toBe(true)
  })
})

describe('GGN_FORSTER_DBG (ForsterConstraintResolver)', () => {
  function makeForster(): { resolver: ForsterConstraintResolver; a: LNode; b: LNode } {
    const graph = new LGraph()
    const l0 = new GLayer(graph)
    graph.getLayers().push(l0)
    l0.id = 0
    const a = new LNode(graph)
    a.size = { x: 10, y: 10 }
    a.setLayer(l0)
    a.id = 0
    const b = new LNode(graph)
    b.size = { x: 10, y: 10 }
    b.setLayer(l0)
    b.id = 1
    a.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])
    const order = [[a, b]]
    const resolver = new ForsterConstraintResolver(order)
    initInitializables([resolver], order)
    resolver.getBarycenterStates()[0]![0]!.barycenter = 1
    resolver.getBarycenterStates()[0]![1]!.barycenter = 0
    return { resolver, a, b }
  }

  it('违反约束: 输出 violated 对并解析为 [a,b]', () => {
    const { resolver, a, b } = makeForster()
    process.env.GGN_FORSTER_DBG = '1'
    const { calls } = captureError()
    const input = [b, a]
    resolver.processConstraints(input)
    expect(input).toEqual([a, b])
    expect(calls).toEqual(['GGN_FORSTER onlyNormal=false iter=1 violated=0(1.0000) -> 1(0.0000) groups=[1(0.0000) 0(1.0000)]'])
  })

  it('两个违反约束对: 输出两次 violated', () => {
    const graph = new LGraph()
    const l0 = new GLayer(graph)
    graph.getLayers().push(l0)
    l0.id = 0
    const nodes: LNode[] = []
    for (let i = 0; i < 4; i++) {
      const n = new LNode(graph)
      n.size = { x: 10, y: 10 }
      n.setLayer(l0)
      n.id = i
      nodes.push(n)
    }
    nodes[0]!.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [nodes[1]!])
    nodes[2]!.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [nodes[3]!])
    const order = [nodes]
    const resolver = new ForsterConstraintResolver(order)
    initInitializables([resolver], order)
    const states = resolver.getBarycenterStates()[0]!
    states[0]!.barycenter = 1 // a
    states[1]!.barycenter = 0 // b (违反 a→b)
    states[2]!.barycenter = 3 // c
    states[3]!.barycenter = 2 // d (违反 c→d)
    process.env.GGN_FORSTER_DBG = '1'
    const { calls } = captureError()
    const input = [nodes[1]!, nodes[0]!, nodes[3]!, nodes[2]!]
    resolver.processConstraints(input)
    expect(input).toEqual([nodes[0]!, nodes[1]!, nodes[2]!, nodes[3]!])
    expect(calls.filter(c => c.startsWith('GGN_FORSTER onlyNormal=false'))).toHaveLength(2)
  })

  it('BUG 守卫: successor 完全不在图中时输出 GGN_FORSTER BUG 且不崩溃', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.eastWestEdgeFromTo(left[1]!, right[0]!)
    tg.setUpIds()
    // 约束指向不在任何层的悬空节点 (非法图): groups.get(successor) === undefined → 守卫分支
    const detached = new LNode(tg.getGraph())
    left[0]!.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [detached])
    const nodes = tg.getGraph().toNodeArray()
    process.env.GGN_FORSTER_DBG = '1'
    const { calls } = captureError()
    const cr = new ForsterConstraintResolver(nodes)
    initInitializables([cr], nodes)
    cr.processConstraints([...nodes[0]!])
    expect(calls.some(c => c.startsWith('GGN_FORSTER BUG:'))).toBe(true)
  })
})

describe('GGN_PD / GGN_NR (createPortDistributor)', () => {
  it('GGN_NR=1 且 GGN_PD=1: 输出 NodeRelative(env) 并创建 NodeRelativePortDistributor', () => {
    process.env.GGN_NR = '1'
    process.env.GGN_PD = '1'
    const tg = new TestGraphCreator()
    const { calls } = captureError()
    const pd = createPortDistributor(CrossMinType.BARYCENTER, tg.randomMock as any, [])
    expect(calls).toEqual(['GGN_PD NodeRelative(env)'])
    expect((pd as any).constructor.name).toBe('NodeRelativePortDistributor')
  })

  it('GGN_PD=1 无 GGN_NR: 输出 nextBoolean 决策', () => {
    process.env.GGN_PD = '1'
    const tg = new TestGraphCreator()
    const { calls } = captureError()
    const pd = createPortDistributor(CrossMinType.BARYCENTER, tg.randomMock as any, [])
    expect(calls).toEqual(['GGN_PD NodeRelative (nextBoolean=true)'])
    expect((pd as any).constructor.name).toBe('NodeRelativePortDistributor')
  })
})

describe('GGN_RANK_DBG (AbstractBarycenterPortDistributor.calculatePortRanksForLayer)', () => {
  it('OUTPUT rank 输出', () => {
    const tg = new TestGraphCreator()
    crossFormed(tg)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    process.env.GGN_RANK_DBG = '1'
    const { calls } = captureError()
    const pd = new NodeRelativePortDistributor(nodes.length)
    initInitializables([pd], nodes)
    pd.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    expect(calls).toEqual(['GGN_RANK OUTPUT layer=[0[0](rank:0=0.5) | 1[1](rank:1=1.5)]'])
  })
})

// ============================================================================
// X1 续接: 补未覆盖 debug 分支 (NS dummy 标签 / N?/S? 回退 / '?' 兜底 / 层内边精确串)
// ============================================================================

describe('X1 续接 GGN_SWEEP_DBG (NS dummy 标签 idOf)', () => {
  function labeledNSGraph(labels: string[]): { graph: ReturnType<TestGraphCreator['getGraph']>; order: LNode[][] } {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const l1 = tg.makeLayer()
    const d0 = tg.addNodeToLayer(l0)
    d0.setType(NodeType.NORTH_SOUTH_PORT)
    const n1 = tg.addNodeToLayer(l0)
    const others = labels.map((text) => {
      const n = tg.addNodeToLayer(l1)
      n.setLabels([{ text, position: { x: 0, y: 0 }, size: { x: 0, y: 0 } }])
      return n
    })
    for (const o of others) {
      const dp = addPortOnSide(d0, PortSide.WEST)
      const np = addPortOnSide(o, PortSide.WEST)
      addEdgeBetweenPorts(dp, np)
    }
    eastWestEdgeFromTo(n1, others[0]!)
    if (others[1]) eastWestEdgeFromTo(n1, others[1]!)
    tg.setUpIds()
    const graph = tg.getGraph()
    return { graph, order: graph.toNodeArray() }
  }

  it('NS dummy 连 1 个带标签节点: idOf 输出 dA', () => {
    const { order } = labeledNSGraph(['A'])
    process.env.GGN_SWEEP_DBG = '1'
    const { calls } = captureError()
    const counter = new AllCrossingsCounter(order)
    initInitializables([counter], order)
    expect(counter.countAllCrossings(order)).toBe(0)
    expect(calls).toEqual(['GGN_CNT crossings=0 layers=[dA,? | A]'])
  })

  it('NS dummy 连 2 个带标签节点: idOf 输出 dA+B', () => {
    const { order } = labeledNSGraph(['A', 'B'])
    process.env.GGN_SWEEP_DBG = '1'
    const { calls } = captureError()
    const counter = new AllCrossingsCounter(order)
    initInitializables([counter], order)
    expect(counter.countAllCrossings(order)).toBe(0)
    expect(calls).toEqual(['GGN_CNT crossings=0 layers=[dA+B,? | A,B]'])
  })
})

describe('X1 续接 GGN_NS_DBG (精确结构: N?/S 前缀 + d() 包络)', () => {
  it('向下交叉图: 输出含 N?{S..,S..} 与 d(..) 结构 (不含 undefined)', () => {
    const tg = new NorthSouthEdgeTestGraphCreator()
    const g = tg.getNorthSouthDownwardCrossingGraph()
    const order = g.toNodeArray()
    process.env.GGN_NS_DBG = '1'
    const { calls } = captureError()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countNorthSouthPortCrossingsInLayer(order[0]!)).toBe(1)
    expect(calls).toHaveLength(1)
    // 严格结构: N?{S..,S..},d(..),d(..) => 1
    expect(calls[0]).toMatch(/^GGN_NS_LAYER N\?\{S\d+(?:,S\d+)*\}(?:,d\(\d+\))+ => 1$/)
  })

  it('端口 id 为 undefined: N?/S? 兜底输出', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const n = tg.addNodeToLayer(l0)
    const pn = tg.addPortOnSide(n, PortSide.NORTH)
    const ps = tg.addPortOnSide(n, PortSide.SOUTH)
    ;(pn as unknown as { id: number | undefined }).id = undefined
    ;(ps as unknown as { id: number | undefined }).id = undefined
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    process.env.GGN_NS_DBG = '1'
    const { calls } = captureError()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countNorthSouthPortCrossingsInLayer(order[0]!)).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatch(/^GGN_NS_LAYER N\?\{N\?S\?\} => 0$/)
  })
})

describe('X1 续接 GGN_CC_DBG (层内边问号兜底精确串)', () => {
  it('边端点 id undefined: 输出 ?->? 兜底', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const n1 = tg.addNodeToLayer(l0)
    const n2 = tg.addNodeToLayer(l0)
    const p1 = addPortOnSide(n1, PortSide.WEST)
    const p2 = addPortOnSide(n2, PortSide.WEST)
    const e = addEdgeBetweenPorts(p1, p2)
    ;(p1 as unknown as { id: number | undefined }).id = undefined
    ;(p2 as unknown as { id: number | undefined }).id = undefined
    void e
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    process.env.GGN_CC_DBG = '1'
    const { calls } = captureError()
    const cc = new CrossingsCounter(new Array<number>(20).fill(0))
    expect(cc.countInLayerCrossingsOnSide(order[0]!, PortSide.WEST)).toBe(0)
    expect(calls.length).toBeGreaterThanOrEqual(1)
    for (const c of calls) {
      expect(c).toMatch(/^CC port \S+ pos \d+ edges \?->\?$/)
    }
  })
})

describe('X1 续接 GGN_BD_DBG (带标签端点精确结构)', () => {
  it('带标签 NORMAL 端点: 输出用标签而非 id', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const l1 = tg.makeLayer()
    const d0 = tg.addNodeToLayer(l0)
    d0.setType(NodeType.NORTH_SOUTH_PORT)
    const n1 = tg.addNodeToLayer(l0)
    const n2 = tg.addNodeToLayer(l1)
    n2.setLabels([{ text: 'A', position: { x: 0, y: 0 }, size: { x: 0, y: 0 } }])
    const dp = addPortOnSide(d0, PortSide.WEST)
    const np = addPortOnSide(n2, PortSide.WEST)
    addEdgeBetweenPorts(dp, np)
    eastWestEdgeFromTo(n1, n2)
    tg.setUpIds()
    const order = tg.getGraph().toNodeArray()
    const random = tg.randomMock as any
    random.setChangeBy(0)
    const portDist = new NodeRelativePortDistributor(order.length)
    const cr = new ForsterConstraintResolver(order)
    initInitializables([portDist, cr], order)
    const bh = new BarycenterHeuristic(cr, random, portDist, order)
    initInitializables([bh], order)
    process.env.GGN_BD_DBG = '1'
    const { calls } = captureError()
    portDist.calculatePortRanksForLayer(order[0]!, PortType.OUTPUT)
    bh.minimizeCrossings(order, 1, true, true)
    expect(calls.length).toBeGreaterThanOrEqual(1)
    // 要求端点标签 A 出现, 且 [.. -> ..] 结构存在
    for (const c of calls) {
      expect(c).toMatch(/^GGN_BD A L1 degree=\d+ sw=[\d.-]+ bc=[\d.-]+ \[[^\]]*->[^\]]*\]$/)
    }
  })
})

describe('X1 续接 GGN_RANK_DBG (NORMAL 标签端点)', () => {
  it('带标签 NORMAL 节点: rank 输出用标签', () => {
    const tg = new TestGraphCreator()
    const l0 = tg.makeLayer()
    const n = tg.addNodeToLayer(l0)
    n.setLabels([{ text: 'X', position: { x: 0, y: 0 }, size: { x: 0, y: 0 } }])
    const p = tg.addPortOnSide(n, PortSide.EAST)
    void p
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    process.env.GGN_RANK_DBG = '1'
    const { calls } = captureError()
    const pd = new NodeRelativePortDistributor(nodes.length)
    initInitializables([pd], nodes)
    pd.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    expect(calls.length).toBeGreaterThanOrEqual(1)
    for (const c of calls) {
      expect(c).toMatch(/^GGN_RANK OUTPUT layer=\[X\[0\]\(rank:.+\)\]$/)
    }
  })
})

describe('X1 续接 GGN_FORSTER_DBG (NS dummy 标签 idOf)', () => {
  it('violated 组含 NS dummy: gname 输出 dA (带标签 other)', () => {
    const graph = new LGraph()
    const l0 = new GLayer(graph)
    graph.getLayers().push(l0)
    l0.id = 0
    const dummy = new LNode(graph)
    dummy.size = { x: 10, y: 10 }
    dummy.setLayer(l0)
    dummy.setType(NodeType.NORTH_SOUTH_PORT)
    dummy.id = 0
    const b = new LNode(graph)
    b.size = { x: 10, y: 10 }
    b.setLayer(l0)
    b.id = 1
    const l1 = new GLayer(graph)
    graph.getLayers().push(l1)
    l1.id = 1
    const labeled = new LNode(graph)
    labeled.size = { x: 10, y: 10 }
    labeled.setLayer(l1)
    labeled.id = 0
    labeled.setLabels([{ text: 'A', position: { x: 0, y: 0 }, size: { x: 0, y: 0 } }])
    addEdgeBetweenPorts(addPortOnSide(dummy, PortSide.WEST), addPortOnSide(labeled, PortSide.WEST))
    dummy.setProperty(IN_LAYER_SUCCESSOR_CONSTRAINTS, [b])
    const order = [[dummy, b]]
    const resolver = new ForsterConstraintResolver(order)
    initInitializables([resolver], order)
    resolver.getBarycenterStates()[0]![0]!.barycenter = 1
    resolver.getBarycenterStates()[0]![1]!.barycenter = 0
    process.env.GGN_FORSTER_DBG = '1'
    const { calls } = captureError()
    const input = [b, dummy]
    resolver.processConstraints(input)
    expect(input).toEqual([dummy, b])
    expect(calls).toEqual([
      'GGN_FORSTER onlyNormal=false iter=1 violated=dA(1.0000) -> 1(0.0000) groups=[1(0.0000) dA(1.0000)]',
    ])
  })
})
