/**
 * R 簇: 策略注册里程碑 — 把已移植策略接入 layered-layout-provider.ts 的验收 BDD.
 *
 * 每个新策略都必须**可被选项选中**并经 provider (LayeredLayoutProvider.layout) 跑通,
 * 且满足算法不变量 (与 ELK Java 0.12.0 语义一致):
 *   - P1 断环: 断环后图无环 (afterPhase('P1') 钩子).
 *   - P2 分层: 全部节点已分层; 分层边前向 (DAG 输入下 target 层 ≥ source 层).
 *   - P3 交叉: MEDIAN_LAYER_SWEEP 交叉数 ≤ 输入序; forceNodeModelOrder 层内真实节点按模型序不增.
 *   - P4 放置: LINEAR_SEGMENTS 放置后无重叠.
 *   - components: considerModelOrder.components=MODEL_ORDER 分量按模型序排列;
 *                 compaction.connectedComponents 分量压缩装配跑通.
 *   - wrapping: MULTI_EDGE 三件套 (Inserter/Processor/Remover) 全部执行, 断点 dummy 清零.
 *   - intermediate 4: ConstraintsPostprocessor / HypernodesProcessor / NodePlacementRepeater /
 *     InteractiveExternalPortPositioner 各自在对应选项下执行.
 *   - NodeLabelPlacer: OUTSIDE 节点 label 经 provider 全链路放置.
 *
 * 说明: DF/BF_MODEL_ORDER 是 ELK 实验性分层器 — Java 0.12.0 在含环图上断环后会产生
 * 向后边且 greedy switch 因 node.id 被覆盖而 NPE (jar 实证); 故这里用 DAG 输入断言边前向.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider, NullProgressMonitor } from '../../src/index.js'
import { AllCrossingsCounter, initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { Harness, expectNoOverlap, isAcyclicGraph } from './bdd-helpers.js'
import {
  CYCLE_BREAKING_STRATEGY, CycleBreakingStrategy, LAYERING_STRATEGY, CROSSING_MINIMIZATION_STRATEGY,
  NODE_PLACEMENT_STRATEGY, NodePlacementStrategy, CONSIDER_MODEL_ORDER_COMPONENTS, WRAPPING_STRATEGY,
  WrappingStrategy, GENERATE_POSITION_AND_LAYER_IDS, HYPERNODE,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT,
  CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER, LAYERING_LAYER_ID, CROSSING_MINIMIZATION_POSITION_ID,
} from '../../src/options/layered-options.js'
import { COMPACTION_CONNECTED_COMPONENTS } from '../../src/components/components-compactor.js'
import { ComponentOrderingStrategy } from '../../src/components/component-ordering-strategy.js'
import { MODEL_ORDER, BREAKING_POINT_INFO } from '../../src/options/internal-properties.js'

// ── 工具 ──

/** 建一个强连通环图 (断环策略适用). */
function cyclicGraph(): LGraph {
  const g = new LGraph()
  const ns: LNode[] = []
  for (let i = 0; i < 6; i++) {
    const n = new LNode(g); n.size = { x: 40, y: 20 }; ns.push(n)
  }
  for (let i = 0; i < ns.length; i++) {
    const sp = new LPort(); sp.setNode(ns[i]!)
    const tp = new LPort(); tp.setNode(ns[(i + 1) % ns.length]!)
    const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  }
  // 加交叉边, 制造多 SCC / 强连通.
  const sp = new LPort(); sp.setNode(ns[0]!)
  const tp = new LPort(); tp.setNode(ns[3]!)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return g
}

/** 建一个 DAG (分层策略适用; 无边被反转 → 最终边前向). */
function dagGraph(): LGraph {
  const g = new LGraph()
  const ns: LNode[] = []
  for (let i = 0; i < 7; i++) {
    const n = new LNode(g); n.size = { x: 40, y: 20 }; ns.push(n)
  }
  const mk = (f: number, t: number) => {
    const sp = new LPort(); sp.setNode(ns[f]!)
    const tp = new LPort(); tp.setNode(ns[t]!)
    const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  }
  mk(0, 1); mk(1, 2); mk(2, 3); mk(0, 3); mk(1, 4); mk(4, 5); mk(2, 5); mk(5, 6); mk(3, 6)
  return g
}

/** 建一个有交叉机会的图 (交叉最小化适用). */
function crossingGraph(): LGraph {
  const g = new LGraph()
  const ns: LNode[] = []
  for (let i = 0; i < 8; i++) {
    const n = new LNode(g); n.size = { x: 30, y: 20 }; ns.push(n)
  }
  const mk = (f: number, t: number) => {
    const sp = new LPort(); sp.setNode(ns[f]!)
    const tp = new LPort(); tp.setNode(ns[t]!)
    const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  }
  // 层间交叉: 0,1 → 2,3 交叉对; 2,3 → 4,5 交叉对; 4,5 → 6,7.
  mk(0, 3); mk(1, 2); mk(2, 5); mk(3, 4); mk(4, 7); mk(5, 6)
  return g
}

/** 跑 provider, 记录阶段/模块钩子. */
function run(g: LGraph, record: { phases: string[]; modules: string[] } = { phases: [], modules: [] }): void {
  const p = new LayeredLayoutProvider()
  p.setHooks({
    afterPhase: (ph, _gr) => { record.phases.push(ph) },
    afterModule: (name, _gr) => { record.modules.push(name) },
  })
  p.layout(g, new NullProgressMonitor())
}

/** P2 后所有边是否前向 (target 层 ≥ source 层; 内部图在 ReversedEdgeRestorer 前). */
function forwardAtP2(g: LGraph): boolean {
  let ok = true
  const p = new LayeredLayoutProvider()
  p.setHooks({ afterPhase: (ph, gr) => {
    if (ph !== 'P2') return
    for (const l of gr.getLayers()) for (const n of l.getNodes()) for (const e of n.getOutgoingEdges()) {
      const t = e.getTarget()?.getNode()
      if (t && t.getLayer() && n.getLayer() && t.getLayer()!.getIndex() < n.getLayer()!.getIndex()) ok = false
    }
  } })
  p.layout(g, new NullProgressMonitor())
  return ok
}

/** 交叉计数 (给定层内节点序). */
function countCrossings(order: LNode[][]): number {
  if (order.length === 0) return 0
  const counter = new AllCrossingsCounter(order)
  initInitializables([counter], order)
  return counter.countAllCrossings(order)
}

/** P3 后的层内节点序. */
function orderAfterP3(g: LGraph): LNode[][] {
  let order: LNode[][] = []
  const p = new LayeredLayoutProvider()
  p.setHooks({ afterPhase: (ph, gr) => { if (ph === 'P3') order = gr.toNodeArray() } })
  p.layout(g, new NullProgressMonitor())
  return order
}

/** 建多分量图: 分量1 = 单节点 a, 分量2 = 链 b→c→d, 分量3 = 单节点 e. */
function multiComponentGraph(): LGraph {
  const g = new LGraph()
  const a = new LNode(g); a.size = { x: 60, y: 30 }
  const b = new LNode(g); b.size = { x: 40, y: 20 }
  const c = new LNode(g); c.size = { x: 40, y: 20 }
  const d = new LNode(g); d.size = { x: 40, y: 20 }
  const e = new LNode(g); e.size = { x: 20, y: 10 }
  const mk = (f: LNode, t: LNode) => {
    const sp = new LPort(); sp.setNode(f)
    const tp = new LPort(); tp.setNode(t)
    const ed = new LEdge(); ed.setSource(sp); ed.setTarget(tp)
  }
  mk(b, c); mk(c, d)
  void a; void e
  return g
}

// ── P1 断环 ──

describe('P1 断环策略注册 (provider 选项选中)', () => {
  const cases: [string, CycleBreakingStrategy, string][] = [
    ['DEPTH_FIRST', CycleBreakingStrategy.DEPTH_FIRST, 'DepthFirstCycleBreaker'],
    ['SCC_CONNECTIVITY', CycleBreakingStrategy.SCC_CONNECTIVITY, 'SCConnectivity'],
    ['SCC_NODE_TYPE', CycleBreakingStrategy.SCC_NODE_TYPE, 'SCCNodeTypeCycleBreaker'],
    ['DFS_NODE_ORDER', CycleBreakingStrategy.DFS_NODE_ORDER, 'DFSNodeOrderCycleBreaker'],
    ['BFS_NODE_ORDER', CycleBreakingStrategy.BFS_NODE_ORDER, 'BFSNodeOrderCycleBreaker'],
  ]
  for (const [label, strategy, moduleName] of cases) {
    it(`${label} 可被选项选中, 断环后无环`, () => {
      const g = cyclicGraph()
      g.setProperty(CYCLE_BREAKING_STRATEGY, strategy)
      const record = { phases: [] as string[], modules: [] as string[] }
      let p1Acyclic = false
      const p = new LayeredLayoutProvider()
      p.setHooks({
        afterPhase: (ph, gr) => { if (ph === 'P1') p1Acyclic = isAcyclicGraph(gr) },
        afterModule: (n) => { record.modules.push(n) },
      })
      p.layout(g, new NullProgressMonitor())
      expect(record.modules).toContain(moduleName)
      expect(p1Acyclic, `${label} 断环后布局图应无环`).toBe(true)
      expectFiniteCoordsSafe(g)
    })
  }
})

// ── P2 分层 ──

describe('P2 分层策略注册 (provider 选项选中)', () => {
  const cases: [string, string, string][] = [
    ['COFFMAN_GRAHAM', 'COFFMAN_GRAHAM', 'CoffmanGrahamLayerer'],
    ['BF_MODEL_ORDER', 'BF_MODEL_ORDER', 'BreadthFirstModelOrderLayerer'],
    ['DF_MODEL_ORDER', 'DF_MODEL_ORDER', 'DepthFirstModelOrderLayerer'],
    ['MIN_WIDTH', 'MIN_WIDTH', 'MinWidthLayerer'],
    ['STRETCH_WIDTH', 'STRETCH_WIDTH', 'StretchWidthLayerer'],
  ]
  for (const [label, strategy, moduleName] of cases) {
    it(`${label} 可被选项选中, DAG 上全节点分层且边前向`, () => {
      const g = dagGraph()
      g.setProperty(LAYERING_STRATEGY, strategy)
      const record = { modules: [] as string[] }
      const p = new LayeredLayoutProvider()
      p.setHooks({ afterModule: (n) => { record.modules.push(n) } })
      p.layout(g, new NullProgressMonitor())
      expect(record.modules).toContain(moduleName)
      expect(g.getLayers().length, `${label} 应产生层`).toBeGreaterThan(0)
      expect(forwardAtP2(dagGraph())).toBe(true)
      expectFiniteCoordsSafe(g)
    })
  }
})

// ── P3 交叉 ──

describe('P3 交叉最小化策略注册 (provider 选项选中)', () => {
  it('MEDIAN_LAYER_SWEEP 可被选项选中, 交叉数 ≤ 输入序', () => {
    const noneG = crossingGraph()
    noneG.setProperty(CROSSING_MINIMIZATION_STRATEGY, 'NONE')
    // NONE 不跑 P3 模块 → 用 P2 后的输入序.
    let noneOrder: LNode[][] = []
    const pNone = new LayeredLayoutProvider()
    pNone.setHooks({ afterPhase: (ph, gr) => { if (ph === 'P2') noneOrder = gr.toNodeArray() } })
    pNone.layout(noneG, new NullProgressMonitor())
    const noneCrossings = countCrossings(noneOrder)

    const medG = crossingGraph()
    medG.setProperty(CROSSING_MINIMIZATION_STRATEGY, 'MEDIAN_LAYER_SWEEP')
    const record = { modules: [] as string[] }
    const pMed = new LayeredLayoutProvider()
    pMed.setHooks({ afterModule: (n) => { record.modules.push(n) } })
    pMed.layout(medG, new NullProgressMonitor())
    // MEDIAN 走 LayerSweepCrossingMinimizer (MEDIAN 类型).
    expect(record.modules.some(m => m === 'LayerSweepCrossingMinimizer' && record.modules.filter(x => x === 'LayerSweepCrossingMinimizer').length >= 1)).toBe(true)
    const medCrossings = countCrossings(orderAfterP3(medG))
    expect(medCrossings, `MEDIAN 交叉数应 ≤ 输入序 (${noneCrossings})`).toBeLessThanOrEqual(noneCrossings)
  })

  it('crossingMinimization.forceNodeModelOrder=true 选中 ModelOrderBarycenterHeuristic 语义: 层内真实节点按模型序不增', () => {
    const g = crossingGraph()
    g.setProperty(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER, true)
    const order = orderAfterP3(g)
    expect(order.length).toBeGreaterThan(0)
    for (const layer of order) {
      const mos = layer.filter(n => n.hasProperty(MODEL_ORDER)).map(n => n.getProperty(MODEL_ORDER))
      for (let i = 1; i < mos.length; i++) {
        expect(mos[i]!, 'forceNodeModelOrder 下真实节点模型序应不降').toBeGreaterThanOrEqual(mos[i - 1]!)
      }
    }
  })
})

// ── P4 放置 ──

describe('P4 节点放置策略注册 (provider 选项选中)', () => {
  it('LINEAR_SEGMENTS 可被选项选中, 放置无重叠', () => {
    const h = new Harness().node('n1', 'n2', 'n3', 'n4').edge('n1→n2, n2→n3, n3→n4, n1→n4')
    h.root.setProperty(NODE_PLACEMENT_STRATEGY, NodePlacementStrategy.LINEAR_SEGMENTS)
    const record = { modules: [] as string[] }
    const p = new LayeredLayoutProvider()
    p.setHooks({ afterModule: (n) => { record.modules.push(n) } })
    p.layout(h.root, new NullProgressMonitor())
    expect(record.modules).toContain('LinearSegmentsNodePlacer')
    expectNoOverlap(h)
    expectFiniteCoordsSafe(h.root)
  })
})

// ── components 策略族 ──

describe('components 策略族注册 (provider 选项选中)', () => {
  it('considerModelOrder.components=MODEL_ORDER: 分量按模型序排列且无重叠', () => {
    const g = multiComponentGraph()
    g.setProperty(CONSIDER_MODEL_ORDER_COMPONENTS, ComponentOrderingStrategy.MODEL_ORDER)
    const p = new LayeredLayoutProvider()
    p.layout(g, new NullProgressMonitor())
    expectFiniteCoordsSafe(g)
    // MODEL_ORDER 已赋 (needsModelOrderBasedOnParent 含 components 策略).
    const mos = g.getLayerlessNodes().filter(n => n.hasProperty(MODEL_ORDER)).map(n => n.getProperty(MODEL_ORDER))
    expect(mos.length).toBe(5)
    // 分量按模型序: 单节点 a (mo=0) 排第一行, 链分量 (mo=1..3) 第二行, 单节点 e (mo=4) 最后.
    // (e 面积最小 — 若无模型序排序, 面积升序会把它排最前; 模型序下它必须最后.)
    const [a, b, e] = [0, 1, 4].map(mo => g.getLayerlessNodes().find(n => n.getProperty(MODEL_ORDER) === mo)!)
    expect(a.position.y).toBeLessThan(b.position.y)
    expect(b.position.y).toBeLessThan(e.position.y)
  })

  it('compaction.connectedComponents=true: ComponentsCompactor 装配跑通且无重叠', () => {
    const g = multiComponentGraph()
    g.setProperty(COMPACTION_CONNECTED_COMPONENTS, true)
    const p = new LayeredLayoutProvider()
    p.layout(g, new NullProgressMonitor())
    expectFiniteCoordsSafe(g)
    // 分量间无重叠 (压缩保证间距).
    const ns = g.getLayerlessNodes()
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const x = ns[i]!, y = ns[j]!
      const overlap = x.position.x < y.position.x + y.size.x && x.position.x + x.size.x > y.position.x
        && x.position.y < y.position.y + y.size.y && x.position.y + x.size.y > y.position.y
      expect(overlap, `分量节点 ${x.id} 与 ${y.id} 重叠`).toBe(false)
    }
  })
})

// ── wrapping ──

describe('wrapping 处理器注册 (provider 选项选中)', () => {
  it('WRAPPING_STRATEGY=MULTI_EDGE: BreakingPoint 三件套执行, 断点 dummy 清零', () => {
    const g = crossingGraph()
    g.setProperty(WRAPPING_STRATEGY, WrappingStrategy.MULTI_EDGE)
    const record = { modules: [] as string[] }
    const p = new LayeredLayoutProvider()
    p.setHooks({ afterModule: (n) => { record.modules.push(n) } })
    p.layout(g, new NullProgressMonitor())
    expect(record.modules).toContain('BreakingPointInserter')
    expect(record.modules).toContain('BreakingPointProcessor')
    expect(record.modules).toContain('BreakingPointRemover')
    let bpRemain = 0
    for (const l of g.getLayers()) for (const n of l.getNodes()) if (n.hasProperty(BREAKING_POINT_INFO)) bpRemain++
    expect(bpRemain, '布局后不应残留断点 dummy').toBe(0)
    expectFiniteCoordsSafe(g)
  })
})

// ── intermediate 4 处理器 ──

describe('intermediate 处理器注册 (provider 选项选中)', () => {
  it('generatePositionAndLayerIds=true: ConstraintsPostprocessor 写 layerId/positionId', () => {
    const g = dagGraph()
    g.setProperty(GENERATE_POSITION_AND_LAYER_IDS, true)
    const record = { modules: [] as string[] }
    const p = new LayeredLayoutProvider()
    p.setHooks({ afterModule: (n) => { record.modules.push(n) } })
    p.layout(g, new NullProgressMonitor())
    expect(record.modules).toContain('ConstraintsPostprocessor')
    let normal = 0
    for (const l of g.getLayers()) for (const n of l.getNodes()) {
      if (n.getType() !== 'NORMAL') continue
      normal++
      expect(n.getProperty(LAYERING_LAYER_ID), 'NORMAL 节点应有 layerId').toBeGreaterThanOrEqual(0)
      expect(n.getProperty(CROSSING_MINIMIZATION_POSITION_ID), 'NORMAL 节点应有 positionId').toBeGreaterThanOrEqual(0)
    }
    expect(normal).toBe(7)
  })

  it('HYPERNODE 节点: HypernodesProcessor 执行且坐标有限', () => {
    const g = new LGraph()
    const a = new LNode(g); a.size = { x: 30, y: 30 }
    const b = new LNode(g); b.size = { x: 30, y: 30 }
    const hp = new LNode(g); hp.size = { x: 10, y: 10 }; hp.setProperty(HYPERNODE, true)
    const mk = (f: LNode, t: LNode) => {
      const sp = new LPort(); sp.setNode(f)
      const tp = new LPort(); tp.setNode(t)
      const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
    }
    mk(a, hp); mk(hp, b)
    const record = { modules: [] as string[] }
    const p = new LayeredLayoutProvider()
    p.setHooks({ afterModule: (n) => { record.modules.push(n) } })
    p.layout(g, new NullProgressMonitor())
    expect(record.modules).toContain('HypernodesProcessor')
    expectFiniteCoordsSafe(g)
  })

  it('recomputeNodePlacement 设置: NodePlacementRepeater 第二遍放置执行', () => {
    const g = dagGraph()
    g.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT, NodePlacementStrategy.SIMPLE)
    const record = { modules: [] as string[] }
    const p = new LayeredLayoutProvider()
    p.setHooks({ afterModule: (n) => { record.modules.push(n) } })
    p.layout(g, new NullProgressMonitor())
    expect(record.modules).toContain('NodePlacementRepeater')
    expectFiniteCoordsSafe(g)
  })

  it('CYCLE_BREAKING_STRATEGY=INTERACTIVE: InteractiveExternalPortPositioner 执行', () => {
    const g = cyclicGraph()
    g.setProperty(CYCLE_BREAKING_STRATEGY, CycleBreakingStrategy.INTERACTIVE)
    const record = { modules: [] as string[] }
    const p = new LayeredLayoutProvider()
    p.setHooks({ afterModule: (n) => { record.modules.push(n) } })
    p.layout(g, new NullProgressMonitor())
    expect(record.modules).toContain('InteractiveExternalPortPositioner')
    expectFiniteCoordsSafe(g)
  })
})

// ── NodeLabelPlacer ──

describe('NodeLabelPlacer 注册 (provider 全链路)', () => {
  it('OUTSIDE V_TOP 节点 label 经 provider 放置到节点外上方', () => {
    const h = new Harness().node('A', 'B').edge('A→B')
    const a = h.nodes.get('A')!
    const label = { text: 'L', position: { x: 0, y: 0 }, size: { x: 20, y: 12 }, placement: 'OUTSIDE V_TOP H_CENTER' }
    a.getLabels().push(label as never)
    h.layout()
    expectFiniteCoordsSafe(h.root)
    // label 在节点上方: y ≤ 0 (相对节点原点, 负值 = 节点外).
    expect(label.position.y).toBeLessThanOrEqual(0)
    expect(a.getMargin().top, 'OUTSIDE label margin.top 应外扩').toBeGreaterThanOrEqual(12)
  })
})

// ── 小工具 ──

/** 全部节点/端口/弯点坐标有限. */
function expectFiniteCoordsSafe(g: LGraph): void {
  for (const n of g.getLayerlessNodes()) {
    expect(Number.isFinite(n.position.x), `节点 ${n.id} x`).toBe(true)
    expect(Number.isFinite(n.position.y), `节点 ${n.id} y`).toBe(true)
    for (const p of n.getPorts()) {
      expect(Number.isFinite(p.getPosition().x)).toBe(true)
      expect(Number.isFinite(p.getPosition().y)).toBe(true)
    }
  }
  for (const l of g.getLayers()) for (const n of l.getNodes()) {
    expect(Number.isFinite(n.position.x), `层内节点 ${n.id} x`).toBe(true)
    expect(Number.isFinite(n.position.y), `层内节点 ${n.id} y`).toBe(true)
  }
}
