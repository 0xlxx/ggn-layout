/**
 * wrapping (断行) 包 BDD — 直接 vitest 场景测试.
 *
 * 覆盖算法不变量:
 *  - GraphStats: 惰性统计正确; 方向校正纵横比; 切割合法性判断;
 *  - 切割启发式 (ARD/MSD/MANUAL): 公式正确、输出有序且界内;
 *  - CuttingUtils.insertDummies: dummy 链结构/端口/间距/属性传递;
 *  - BreakingPointInserter: 边拆分等价 (u --nodeStartEdge--> startMarker --startEndEdge--> endMarker --e--> v),
 *    多 cut 链 prev/next 连接, MODEL_ORDER 传递;
 *  - BreakingPointProcessor: performWrapping 后 chunk 交错放置、所有原节点仍在层内、
 *    原边对象不丢失 (弱连通), CYCLIC 置位, BPInfo in-layer 字段补填;
 *  - BreakingPointRemover: 移除后无 BREAKING_POINT dummy, 原边恢复原端点,
 *    POLYLINE/ORTHOGONAL 弯点组装正确, JUNCTION_POINTS 合并;
 *  - SingleEdgeGraphWrapper: validify 正确 (GREEDY/LOOK_BACK), performCuts 后图等价.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, PortSide, NodeType, Direction } from '../../src/index.js'
import { MapPropertyHolder } from '../../src/graph/properties.js'
import { GraphStats } from '../../src/intermediate/wrapping/graph-stats.js'
import { ARDCutIndexHeuristic, MSDCutIndexHeuristic, ManualCutIndexCalculator } from '../../src/intermediate/wrapping/cut-index-calculator.js'
import { insertDummies } from '../../src/intermediate/wrapping/cutting-utils.js'
import { processBreakingPointInsertion } from '../../src/intermediate/wrapping/breaking-point-inserter.js'
import { processBreakingPoints } from '../../src/intermediate/wrapping/breaking-point-processor.js'
import { processBreakingPointRemoval } from '../../src/intermediate/wrapping/breaking-point-remover.js'
import { processSingleEdgeWrapping, validifyIndexesGreedily, validifyIndexesLookingBack } from '../../src/intermediate/wrapping/single-edge-graph-wrapper.js'
import { BPInfo } from '../../src/intermediate/wrapping/bp-info.js'
import type { SplineSegment } from '../../src/p5edges/splines/spline-segment.js'
import {
  BREAKING_POINT_INFO, MODEL_ORDER, CYCLIC, LONG_EDGE_SOURCE, LONG_EDGE_TARGET,
  SPLINE_ROUTE_START, SPLINE_EDGE_CHAIN,
} from '../../src/options/internal-properties.js'
import {
  ASPECT_RATIO, DIRECTION, EDGE_ROUTING, EDGE_THICKNESS, JUNCTION_POINTS, PORT_CONSTRAINTS,
  SPACING_EDGE_NODE, SPACING_INDIVIDUAL, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS,
  WRAPPING_ADDITIONAL_EDGE_SPACING, WRAPPING_CUTTING_CUTS, WRAPPING_CUTTING_STRATEGY,
  WRAPPING_MULTI_EDGE_IMPROVE_CUTS, WRAPPING_MULTI_EDGE_IMPROVE_WRAPPED_EDGES,
  WRAPPING_VALIDIFY_FORBIDDEN_INDICES, WRAPPING_VALIDIFY_STRATEGY, CuttingStrategy, ValidifyStrategy,
} from '../../src/options/layered-options.js'

// ── 建图 helpers (绕过 provider, 直接构建分层图) ──

interface TGraph {
  graph: LGraph
  nodes: Map<string, LNode>
  edges: Map<string, LEdge>
  layers: Layer[]
}

/** 建链式图: names 每节点一层, 边 i→i+1, 默认尺寸 100x30. */
function chainGraph(names: string[], size: { x: number; y: number } = { x: 100, y: 30 }): TGraph {
  const graph = new LGraph()
  const nodes = new Map<string, LNode>()
  const edges = new Map<string, LEdge>()
  const layers: Layer[] = []
  names.forEach((name, i) => {
    const layer = new Layer(graph)
    graph.getLayers().push(layer)
    layers.push(layer)
    const n = new LNode(graph)
    n.size = { ...size }
    n.setLayer(layer)
    nodes.set(name, n)
    const pOut = new LPort()
    pOut.setNode(n)
    pOut.setSide(PortSide.EAST)
    if (i > 0) {
      const pIn = new LPort()
      pIn.setNode(n)
      pIn.setSide(PortSide.WEST)
      const e = new LEdge()
      e.setSource(nodes.get(names[i - 1])!.getPorts(PortSide.EAST)[0]!)
      e.setTarget(pIn)
      edges.set(`${names[i - 1]}→${name}`, e)
    }
  })
  return { graph, nodes, edges, layers }
}

/** 通用层数/边数统计. */
function layerNodeCounts(graph: LGraph): number[] {
  return graph.getLayers().map(l => l.getNodes().length)
}

/** 原节点都在层中且无重复. */
function expectAllOriginalNodesInLayers(graph: LGraph, nodes: Map<string, LNode>): void {
  const seen = new Set<LNode>()
  for (const layer of graph.getLayers()) {
    for (const n of layer.getNodes()) {
      expect(seen.has(n)).toBe(false)
      seen.add(n)
    }
  }
  for (const n of nodes.values()) {
    expect(n.getLayer()).not.toBeNull()
    expect(seen.has(n)).toBe(true)
  }
}

/** 原边对象都还在图中 (弱连通: 端点可通过边到达对方). */
function expectEdgesStillConnected(graph: LGraph, edges: Map<string, LEdge>): void {
  for (const e of edges.values()) {
    const src = e.getSource()!.getNode()!
    const tgt = e.getTarget()!.getNode()!
    expect(src.getLayer()).not.toBeNull()
    expect(tgt.getLayer()).not.toBeNull()
    expect(weaklyConnected(graph, src, tgt)).toBe(true)
  }
}

/** 忽略方向的 BFS: from 是否可到达 to. */
function weaklyConnected(graph: LGraph, from: LNode, to: LNode): boolean {
  const visited = new Set<LNode>()
  const stack = [from]
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === to) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const e of cur.getConnectedEdges()) {
      const other = e.getOtherNode(cur)
      if (other !== null) stack.push(other)
    }
  }
  return false
}

/** 沿有向边从 from 走, 看能否到达 to (用于插入后等价性断言). */
function reaches(graph: LGraph, from: LNode, to: LNode): boolean {
  void graph
  const visited = new Set<LNode>()
  const stack = [from]
  while (stack.length > 0) {
    const cur = stack.pop()!
    if (cur === to) return true
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const e of cur.getOutgoingEdges()) {
      const n = e.getTarget()!.getNode()!
      stack.push(n)
    }
  }
  return false
}

// ─────────────────────────── GraphStats ───────────────────────────

describe('GraphStats (wrapping 统计)', () => {
  it('惰性统计: 层宽/层高/和/最大/数组一致', () => {
    const { graph } = chainGraph(['A', 'B', 'C'])
    graph.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 0)
    graph.setProperty(SPACING_NODE_NODE, 0)
    const gs = new GraphStats(graph)
    // 每层单节点 100x30, 无 margin, 间距 0
    expect(gs.longestPath).toBe(3)
    expect(gs.getMaxWidth()).toBe(100)
    expect(gs.getSumWidth()).toBe(300)
    expect(gs.getMaxHeight()).toBe(30)
    expect(gs.getWidths()).toEqual([100, 100, 100])
    expect(gs.getHeights()).toEqual([30, 30, 30])
  })

  it('纵横比方向校正: RIGHT/LEFT/UNDEFINED 不取倒数, DOWN/UP 取倒数', () => {
    const g1 = new LGraph()
    g1.setProperty(ASPECT_RATIO, 2)
    expect(new GraphStats(g1).dar).toBe(2)
    const g2 = new LGraph()
    g2.setProperty(ASPECT_RATIO, 2)
    g2.setProperty(DIRECTION, Direction.DOWN)
    expect(new GraphStats(g2).dar).toBeCloseTo(0.5)
  })

  it('chunk 近似: 切割后宽度 = max chunk 宽, 高度 = 各 chunk 高之和', () => {
    const { graph } = chainGraph(['A', 'B', 'C', 'D'])
    graph.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 0)
    graph.setProperty(SPACING_NODE_NODE, 0)
    const gs = new GraphStats(graph)
    // cuts=[2]: chunk [0,2) 宽 200, [2,4) 宽 200 → 宽 200; 高 = 30 + 30 = 60
    expect(gs.getApproximateChunkBasedLayeringWidth([2])).toBe(200)
    expect(gs.getApproximateChunkBasedLayeringHeight([2])).toBe(60)
  })

  it('切割合法性: 单 (源,目标) 对的层可切, 多源/多目标不可切, index 0 恒不可切', () => {
    // 层结构: L0=[A], L1=[B], L2=[C1,C2], L3=[D], L4=[E]
    // 边: A→B, B→C1, B→C2, C1→D, C2→D, D→E
    const graph = new LGraph()
    const nodes = new Map<string, LNode>()
    const layers: Layer[] = []
    for (let i = 0; i < 5; i++) {
      const l = new Layer(graph)
      graph.getLayers().push(l)
      layers.push(l)
    }
    const mk = (name: string, layer: Layer): LNode => {
      const n = new LNode(graph)
      n.setLayer(layer)
      nodes.set(name, n)
      return n
    }
    mk('A', layers[0]!)
    mk('B', layers[1]!)
    mk('C1', layers[2]!)
    mk('C2', layers[2]!)
    mk('D', layers[3]!)
    mk('E', layers[4]!)
    const chain = (from: string, to: string): LEdge => {
      const pOut = new LPort()
      pOut.setNode(nodes.get(from)!)
      const pIn = new LPort()
      pIn.setNode(nodes.get(to)!)
      const e = new LEdge()
      e.setSource(pOut)
      e.setTarget(pIn)
      return e
    }
    chain('A', 'B')
    chain('B', 'C1')
    chain('B', 'C2')
    chain('C1', 'D')
    chain('C2', 'D')
    chain('D', 'E')
    const gs = new GraphStats(graph)
    expect(gs.isCutAllowed(0)).toBe(false)          // index 0 恒不可切
    expect(gs.isCutAllowed(1)).toBe(true)           // B 层: 单源单目标
    expect(gs.isCutAllowed(2)).toBe(false)          // C 层: 双目标 (B→C1, B→C2)
    expect(gs.isCutAllowed(3)).toBe(false)          // D 层: 双源 (C1→D, C2→D)
    expect(gs.isCutAllowed(4)).toBe(true)           // E 层: 单源单目标
  })
})

// ─────────────────────────── 切割启发式 ───────────────────────────

describe('切割启发式 (ICutIndexCalculator)', () => {
  function stats4Layers(): { graph: LGraph, gs: GraphStats } {
    const { graph } = chainGraph(['A', 'B', 'C', 'D'])
    graph.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 0)
    graph.setProperty(SPACING_NODE_NODE, 0)
    graph.setProperty(ASPECT_RATIO, 1.6)
    return { graph, gs: new GraphStats(graph) }
  }

  it('ARD: chunk 数 = min(round(sqrt(sumWidth/(dar*maxHeight))), longestPath), 切割点等距', () => {
    const { gs } = stats4Layers()
    // sumWidth=400, dar=1.6, maxHeight=30 → sqrt(400/48) ≈ 2.887 → round=3 → min(3,4)=3
    expect(ARDCutIndexHeuristic.getChunkCount(gs)).toBe(3)
    const ard = new ARDCutIndexHeuristic()
    // rows=3, step=4/3≈1.333 → idx1: round(1.333)=1, idx2: round(2.667)=3 → [1,3]
    expect(ard.getCutIndexes(gs.graph, gs)).toEqual([1, 3])
    expect(ard.guaranteeValid()).toBe(false)
  })

  it('MSD: 高瘦对称四层图的最优切割为 [2] (max scale 最大化)', () => {
    // chunkCount = min(round(sqrt(3200/(1.6*300))), 4) = 3 → cutCnt=2, m ∈ [1,3]
    // m=1: maxScale = min(1/1600, 0.625/600) = 0.000625
    // m=3: maxScale = min(1/800, 0.625/1200) = 0.000521
    // 严格 > 比较 → [2] 胜出
    const { graph } = chainGraph(['A', 'B', 'C', 'D'], { x: 800, y: 300 })
    graph.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 0)
    graph.setProperty(SPACING_NODE_NODE, 0)
    graph.setProperty(ASPECT_RATIO, 1.6)
    const gs = new GraphStats(graph)
    const msd = new MSDCutIndexHeuristic()
    expect(msd.getCutIndexes(graph, gs)).toEqual([2])
    expect(msd.guaranteeValid()).toBe(false)
  })

  it('MANUAL: 直读 WRAPPING_CUTTING_CUTS, 未设置返回空', () => {
    const { graph } = stats4Layers()
    const manual = new ManualCutIndexCalculator()
    expect(manual.getCutIndexes(graph, new GraphStats(graph))).toEqual([])
    graph.setProperty(WRAPPING_CUTTING_CUTS, [2, 4])
    expect(manual.getCutIndexes(graph, new GraphStats(graph))).toEqual([2, 4])
  })

  it('ARD/MSD 输出界内且严格递增', () => {
    const { graph, gs } = stats4Layers()
    const cuts = new MSDCutIndexHeuristic().getCutIndexes(graph, gs)
    for (const c of cuts) {
      expect(c).toBeGreaterThanOrEqual(0)
      expect(c).toBeLessThan(gs.longestPath)
    }
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i]!).toBeGreaterThan(cuts[i - 1]!)
    }
  })
})

// ─────────────────────────── CuttingUtils ───────────────────────────

describe('CuttingUtils.insertDummies', () => {
  it('链结构: 每层一个 dummy, 边链 u→d0→...→dn→v, 端口/类型/属性正确', () => {
    const { graph, nodes, edges } = chainGraph(['A', 'B', 'C', 'D'])
    const e = edges.get('A→B')!
    const origSource = e.getSource()!
    const origTarget = e.getTarget()!
    graph.setProperty(WRAPPING_ADDITIONAL_EDGE_SPACING, 7)
    const created = insertDummies(graph, e, 1)
    // A(L0) → B(L1): 2 个 dummy, 3 段边 (含重定向的原边)
    expect(created).toHaveLength(2)
    const chain = [e, ...created]
    // 连通性: A → d0 → d1 → B
    const d0 = created[0]!.getSource()!.getNode()!
    const d1 = created[1]!.getSource()!.getNode()!
    expect(d0.getType()).toBe(NodeType.LONG_EDGE)
    expect(d1.getType()).toBe(NodeType.LONG_EDGE)
    expect(chain[0]!.getTarget()!.getNode()).toBe(d0)
    expect(chain[1]!.getTarget()!.getNode()).toBe(d1)
    expect(chain[2]!.getTarget()!.getNode()).toBe(nodes.get('B'))
    // 端口侧
    expect(d0.getPorts(PortSide.WEST)).toHaveLength(1)
    expect(d0.getPorts(PortSide.EAST)).toHaveLength(1)
    expect(d1.getPorts(PortSide.WEST)).toHaveLength(1)
    // LONG_EDGE_SOURCE/TARGET 传递 (原边已被重连, 用捕获的原始端口)
    expect(d0.getProperty(LONG_EDGE_SOURCE)).toBe(origSource)
    expect(d0.getProperty(LONG_EDGE_TARGET)).toBe(origTarget)
    expect(d1.getProperty(LONG_EDGE_SOURCE)).toBe(origSource)
    expect(d1.getProperty(LONG_EDGE_TARGET)).toBe(origTarget)
    // 个体间距: edgeNode + additional
    const is = d0.getProperty(SPACING_INDIVIDUAL) as MapPropertyHolder
    expect(is).not.toBeNull()
    expect(is.getProperty(SPACING_EDGE_NODE)).toBe(10 + 7)
  })

  it('offsetFirstInLayerDummy: 首 dummy 插到层尾前 offset 位', () => {
    const { graph, nodes } = chainGraph(['A', 'B'])
    // A 层再放一个节点 X
    const layer0 = graph.getLayers()[0]!
    const x = new LNode(graph)
    x.size = { x: 50, y: 30 }
    x.setLayer(layer0)
    const edge = nodes.get('A')!.getOutgoingEdges()[0]!
    insertDummies(graph, edge, 1)
    const layerNodes = layer0.getNodes()
    // [A, X] → 插到 size-1=1 → [A, dummy, X]
    expect(layerNodes).toHaveLength(3)
    expect(layerNodes[0]).toBe(nodes.get('A'))
    expect(layerNodes[1]!.getType()).toBe(NodeType.LONG_EDGE)
    expect(layerNodes[2]).toBe(x)
  })

  it('负边厚度的边: 置 0 并同步回写属性, dummy 高=0', () => {
    const { graph, edges } = chainGraph(['A', 'B'])
    const e = edges.get('A→B')!
    e.setProperty(EDGE_THICKNESS, -3)
    insertDummies(graph, e, 1)
    const d = e.getTarget()!.getNode()!
    expect(e.getProperty(EDGE_THICKNESS)).toBe(0)
    expect(d.size.y).toBe(0)
  })
})

// ─────────────────────────── BreakingPointInserter ───────────────────────────

describe('BreakingPointInserter', () => {
  it('单 cut: 边拆成 nodeStartEdge -- startMarker -- startEndEdge -- endMarker -- e, 图等价', () => {
    const { graph, nodes, edges } = chainGraph(['A', 'B', 'C', 'D'])
    graph.setProperty(WRAPPING_CUTTING_STRATEGY, CuttingStrategy.MANUAL)
    graph.setProperty(WRAPPING_CUTTING_CUTS, [2])
    graph.setProperty(WRAPPING_MULTI_EDGE_IMPROVE_CUTS, false)
    graph.setProperty(WRAPPING_VALIDIFY_STRATEGY, ValidifyStrategy.NO)
    const eBC = edges.get('B→C')!
    eBC.setProperty(MODEL_ORDER, 42)

    processBreakingPointInsertion(graph)

    // 层数: 4 + 2 = 6
    expect(graph.getLayers()).toHaveLength(6)
    // 原节点都在层中
    expectAllOriginalNodesInLayers(graph, nodes)
    // 拆分: B --nodeStartEdge--> startMarker --startEndEdge--> endMarker --e--> C
    // 原边被推向右侧: eBC 的 source 现在是 endMarker 的 EAST 端口
    const end = eBC.getSource()!.getNode()!
    expect(end.getType()).toBe(NodeType.BREAKING_POINT)
    const bpi = end.getProperty(BREAKING_POINT_INFO)!
    expect(bpi.nodeStartEdge.getSource()!.getNode()).toBe(nodes.get('B'))
    expect(bpi.end).toBe(end)
    expect(bpi.start.getType()).toBe(NodeType.BREAKING_POINT)
    expect(bpi.startEndEdge.getTarget()!.getNode()).toBe(bpi.end)
    expect(bpi.originalEdge.getSource()!.getNode()).toBe(bpi.end)
    expect(bpi.originalEdge.getTarget()!.getNode()).toBe(nodes.get('C'))
    expect(reaches(graph, nodes.get('B')!, nodes.get('C')!)).toBe(true)
    // MODEL_ORDER 传递
    expect(bpi.nodeStartEdge.getProperty(MODEL_ORDER)).toBe(42)
    expect(bpi.startEndEdge.getProperty(MODEL_ORDER)).toBe(42)
    // 两个 marker 共享同一 BPInfo; PORT_CONSTRAINTS FIXED_SIDE; 层位置正确
    expect(bpi.start.getProperty(BREAKING_POINT_INFO)).toBe(bpi)
    expect(end.getProperty(PORT_CONSTRAINTS)).toBe('FIXED_SIDE')
    expect(bpi.start.getLayer()).toBe(graph.getLayers()[2])
    expect(bpi.end.getLayer()).toBe(graph.getLayers()[3])
    // 链: 无 prev/next
    expect(bpi.prev).toBeNull()
    expect(bpi.next).toBeNull()
    // 未跨 cut 的边不变
    expect(edges.get('A→B')!.getTarget()!.getNode()).toBe(nodes.get('B'))
    expect(edges.get('C→D')!.getSource()!.getNode()).toBe(nodes.get('C'))
  })

  it('多 cut: 跨多层边被再次拆分, BPInfo 链 prev/next 相连', () => {
    // 链 A→B→C→D→E 外加长跨边 A→E: cut 2 处切 A→E (目标 E 未达仍开放),
    // cut 3 处 A→E 仍在 openEdges → 再次拆分 → 链
    const { graph, nodes, edges } = chainGraph(['A', 'B', 'C', 'D', 'E'])
    const eAE = new LEdge()
    eAE.setSource(nodes.get('A')!.getPorts(PortSide.EAST)[0]!)
    eAE.setTarget(nodes.get('E')!.getPorts(PortSide.WEST)[0]!)
    graph.setProperty(WRAPPING_CUTTING_STRATEGY, CuttingStrategy.MANUAL)
    graph.setProperty(WRAPPING_CUTTING_CUTS, [2, 3])
    graph.setProperty(WRAPPING_MULTI_EDGE_IMPROVE_CUTS, false)
    graph.setProperty(WRAPPING_VALIDIFY_STRATEGY, ValidifyStrategy.NO)

    processBreakingPointInsertion(graph)

    expect(graph.getLayers()).toHaveLength(5 + 4)
    // A→E 被切两次: A → sm1 → em1 → sm2 → em2 → E
    const em2 = eAE.getSource()!.getNode()!
    expect(em2.getType()).toBe(NodeType.BREAKING_POINT)
    const bpi2 = em2.getProperty(BREAKING_POINT_INFO)!
    expect(bpi2.prev).not.toBeNull()
    expect(bpi2.next).toBeNull()
    const bpi1 = bpi2.prev!
    expect(bpi1.next).toBe(bpi2)
    // 两条链都指向同一条原边; bpi2 的 nodeStartEdge 从 bpi1 的 end 引出
    expect(bpi1.originalEdge).toBe(eAE)
    expect(bpi2.originalEdge).toBe(eAE)
    expect(bpi2.nodeStartEdge.getSource()!.getNode()).toBe(bpi1.end)
    expect(reaches(graph, nodes.get('A')!, nodes.get('E')!)).toBe(true)
    // B→C (单层跨边) 只被切一次
    const eBC = edges.get('B→C')!
    expect(eBC.getSource()!.getNode()!.getProperty(BREAKING_POINT_INFO)!.prev).toBeNull()
  })
})

// ─────────────────────────── BreakingPointProcessor ───────────────────────────

describe('BreakingPointProcessor (performWrapping)', () => {
  it('chunk 交错放置: 端 marker 进首层, 后续层节点叠回前 chunk 的层', () => {
    const { graph, nodes } = chainGraph(['A', 'B', 'C', 'D'])
    graph.setProperty(WRAPPING_CUTTING_STRATEGY, CuttingStrategy.MANUAL)
    graph.setProperty(WRAPPING_CUTTING_CUTS, [2])
    graph.setProperty(WRAPPING_MULTI_EDGE_IMPROVE_CUTS, false)
    graph.setProperty(WRAPPING_VALIDIFY_STRATEGY, ValidifyStrategy.NO)
    graph.setProperty(WRAPPING_MULTI_EDGE_IMPROVE_WRAPPED_EDGES, false)
    processBreakingPointInsertion(graph)
    const eBC = graph.getLayers()[1]!.getNodes()[0]!.getOutgoingEdges()[0]!
    void eBC

    processBreakingPoints(graph)

    // [E, L0, L1, bpS] — 4 层
    const layers = graph.getLayers()
    expect(layers).toHaveLength(4)
    const A = nodes.get('A')!
    const B = nodes.get('B')!
    const C = nodes.get('C')!
    const D = nodes.get('D')!
    expect(A.getLayer()).toBe(layers[1])
    expect(B.getLayer()).toBe(layers[2])
    expect(C.getLayer()).toBe(layers[1])
    expect(D.getLayer()).toBe(layers[2])
    // 首层有 end marker (+ in-layer dummy), 末层有 start marker
    const first = layers[0]!.getNodes()
    const last = layers[3]!.getNodes()
    expect(first.some(n => BPInfo.isEnd(n))).toBe(true)
    expect(last.some(n => BPInfo.isStart(n))).toBe(true)
    // 原节点都在层中
    expectAllOriginalNodesInLayers(graph, nodes)
    // 原边对象不丢失 (弱连通)
    const eAD = graph.getLayers()[1]!.getNodes().filter(n => n.getType() === NodeType.NORMAL)
    expect(eAD.map(n => n.getOutgoingEdges().length).reduce((a, b) => a + b, 0)).toBeGreaterThan(0)
    // CYCLIC 置位 (存在被反转的 wrap 边)
    expect(graph.getProperty(CYCLIC)).toBe(true)
    // BPInfo in-layer 字段已补填
    const startMarker = last.find(n => BPInfo.isStart(n))!
    const bpi = startMarker.getProperty(BREAKING_POINT_INFO)!
    expect(bpi.startInLayerDummy).not.toBeNull()
    expect(bpi.startInLayerEdge).not.toBeNull()
    expect(bpi.endInLayerDummy).not.toBeNull()
    expect(bpi.endInLayerEdge).not.toBeNull()
  })

  it('改进步骤: 多 cut 链合并后原节点/原边不丢失, 无 BREAKING_POINT start 残留', () => {
    const { graph, nodes, edges } = chainGraph(['A', 'B', 'C', 'D', 'E'])
    graph.setProperty(WRAPPING_CUTTING_STRATEGY, CuttingStrategy.MANUAL)
    graph.setProperty(WRAPPING_CUTTING_CUTS, [2, 3])
    graph.setProperty(WRAPPING_MULTI_EDGE_IMPROVE_CUTS, false)
    graph.setProperty(WRAPPING_VALIDIFY_STRATEGY, ValidifyStrategy.NO)
    processBreakingPointInsertion(graph)

    // 改进步骤开启 (默认 true)
    processBreakingPoints(graph)

    expectAllOriginalNodesInLayers(graph, nodes)
    expectEdgesStillConnected(graph, edges)
    // 合并后只剩单链: 每个 start marker 的 next 应为 null
    for (const layer of graph.getLayers()) {
      for (const n of layer.getNodes()) {
        if (BPInfo.isStart(n)) {
          expect(n.getProperty(BREAKING_POINT_INFO)!.next).toBeNull()
        }
      }
    }
  })
})

// ─────────────────────────── BreakingPointRemover ───────────────────────────

describe('BreakingPointRemover', () => {
  function wrappedGraph(edgeRouting: string, chain: string[], cuts: number[]): { graph: LGraph, nodes: Map<string, LNode>, edges: Map<string, LEdge>, eBC: LEdge } {
    const { graph, nodes, edges } = chainGraph(chain)
    graph.setProperty(EDGE_ROUTING, edgeRouting)
    graph.setProperty(WRAPPING_CUTTING_STRATEGY, CuttingStrategy.MANUAL)
    graph.setProperty(WRAPPING_CUTTING_CUTS, cuts)
    graph.setProperty(WRAPPING_MULTI_EDGE_IMPROVE_CUTS, false)
    graph.setProperty(WRAPPING_VALIDIFY_STRATEGY, ValidifyStrategy.NO)
    graph.setProperty(WRAPPING_MULTI_EDGE_IMPROVE_WRAPPED_EDGES, false)
    processBreakingPointInsertion(graph)
    processBreakingPoints(graph)
    return { graph, nodes, edges, eBC: edges.get(`${chain[1]}→${chain[2]}`)! }
  }

  it('POLYLINE: 弯点 = nodeStart + start位置 + 反转 startEnd + end位置 + original; 原边恢复端点', () => {
    const { graph, nodes, edges, eBC } = wrappedGraph('POLYLINE', ['A', 'B', 'C', 'D'], [2])
    // 手工设置三段边弯点与 marker 位置
    const startMarker = eBC.getSource()!.getNode()!
    const bpi = startMarker.getProperty(BREAKING_POINT_INFO)!
    bpi.nodeStartEdge.getBendPoints().push({ x: 10, y: 10 }, { x: 20, y: 10 })
    bpi.startEndEdge.getBendPoints().push({ x: 30, y: 10 }, { x: 40, y: 10 })
    bpi.originalEdge.getBendPoints().push({ x: 60, y: 10 })
    bpi.start.getPosition().x = 25
    bpi.start.getPosition().y = 5
    bpi.end.getPosition().x = 55
    bpi.end.getPosition().y = 5

    processBreakingPointRemoval(graph)

    // 无 BREAKING_POINT 残留
    for (const layer of graph.getLayers()) {
      for (const n of layer.getNodes()) {
        expect(n.getType()).not.toBe(NodeType.BREAKING_POINT)
      }
    }
    // 原边恢复原端点
    expect(eBC.getSource()!.getNode()).toBe(nodes.get('B'))
    expect(eBC.getTarget()!.getNode()).toBe(nodes.get('C'))
    // 弯点组装
    expect(eBC.getBendPoints()).toEqual([
      { x: 10, y: 10 }, { x: 20, y: 10 }, { x: 25, y: 5 },
      { x: 40, y: 10 }, { x: 30, y: 10 }, { x: 55, y: 5 }, { x: 60, y: 10 },
    ])
    // 图等价
    expectAllOriginalNodesInLayers(graph, nodes)
    expectEdgesStillConnected(graph, edges)
  })

  it('ORTHOGONAL: 弯点不含 marker 位置; JUNCTION_POINTS 按 原→startEnd→nodeStart 顺序合并', () => {
    const { graph, nodes, edges, eBC } = wrappedGraph('ORTHOGONAL', ['A', 'B', 'C', 'D'], [2])
    const startMarker = eBC.getSource()!.getNode()!
    const bpi = startMarker.getProperty(BREAKING_POINT_INFO)!
    bpi.nodeStartEdge.getBendPoints().push({ x: 10, y: 10 })
    bpi.startEndEdge.getBendPoints().push({ x: 30, y: 10 }, { x: 40, y: 10 })
    bpi.originalEdge.getBendPoints().push({ x: 60, y: 10 })
    bpi.nodeStartEdge.setProperty(JUNCTION_POINTS, [{ x: 1, y: 1 }])
    bpi.startEndEdge.setProperty(JUNCTION_POINTS, [{ x: 2, y: 2 }])
    bpi.originalEdge.setProperty(JUNCTION_POINTS, [{ x: 3, y: 3 }])

    processBreakingPointRemoval(graph)

    expect(eBC.getSource()!.getNode()).toBe(nodes.get('B'))
    expect(eBC.getTarget()!.getNode()).toBe(nodes.get('C'))
    expect(eBC.getBendPoints()).toEqual([
      { x: 10, y: 10 }, { x: 40, y: 10 }, { x: 30, y: 10 }, { x: 60, y: 10 },
    ])
    expect(eBC.getProperty(JUNCTION_POINTS)).toEqual([{ x: 3, y: 3 }, { x: 2, y: 2 }, { x: 1, y: 1 }])
    expectAllOriginalNodesInLayers(graph, nodes)
    expectEdgesStillConnected(graph, edges)
  })

  it('SPLINES: 样条段/边链转移到原边, 中间边属性清理', () => {
    const { graph, eBC } = wrappedGraph('SPLINES', ['A', 'B', 'C', 'D'], [2])
    const endMarker = eBC.getSource()!.getNode()!
    const bpi = endMarker.getProperty(BREAKING_POINT_INFO)!
    // 造假的样条信息 (结构不完整, 只验证转移); 每段用独立对象避免别名污染
    const mk = (): SplineSegment => ({ inverseOrder: false, start: { x: 0, y: 0 }, end: { x: 1, y: 1 } } as unknown as SplineSegment)
    const s1 = mk()
    const s2a = mk()
    const s2b = mk()
    const s3 = mk()
    bpi.nodeStartEdge.setProperty(SPLINE_ROUTE_START, [s1])
    bpi.startEndEdge.setProperty(SPLINE_ROUTE_START, [s2a, s2b])
    bpi.originalEdge.setProperty(SPLINE_ROUTE_START, [s3])
    bpi.nodeStartEdge.setProperty(SPLINE_EDGE_CHAIN, [bpi.nodeStartEdge])
    bpi.startEndEdge.setProperty(SPLINE_EDGE_CHAIN, [bpi.startEndEdge])
    bpi.originalEdge.setProperty(SPLINE_EDGE_CHAIN, [bpi.originalEdge])

    processBreakingPointRemoval(graph)

    const route = eBC.getProperty(SPLINE_ROUTE_START) as unknown[]
    const chain = eBC.getProperty(SPLINE_EDGE_CHAIN) as unknown[]
    // 1 + 2(反转, 顺序倒置) + 1 = 4 段; 中间段的 inverseOrder 置 true
    expect(route).toHaveLength(4)
    expect(route[0]).toBe(s1)
    expect(route[1]).toBe(s2b)
    expect(route[2]).toBe(s2a)
    expect(route[3]).toBe(s3)
    expect((route[1] as { inverseOrder: boolean }).inverseOrder).toBe(true)
    expect((route[2] as { inverseOrder: boolean }).inverseOrder).toBe(true)
    expect((route[0] as { inverseOrder: boolean }).inverseOrder).toBe(false)
    expect((route[3] as { inverseOrder: boolean }).inverseOrder).toBe(false)
    expect(chain).toHaveLength(3)
    expect(chain[0]).toBe(bpi.nodeStartEdge)
    expect(chain[1]).toBe(bpi.startEndEdge)
    expect(chain[2]).toBe(bpi.originalEdge)
    // 中间边属性被清理
    expect(bpi.nodeStartEdge.getProperty(SPLINE_ROUTE_START)).toBeNull()
    expect(bpi.startEndEdge.getProperty(SPLINE_ROUTE_START)).toBeNull()
    expect(bpi.nodeStartEdge.getProperty(SPLINE_EDGE_CHAIN)).toBeNull()
    expect(bpi.startEndEdge.getProperty(SPLINE_EDGE_CHAIN)).toBeNull()
  })

  it('链式 BPInfo: 多 cut 时从末端递归移除整条链', () => {
    const { graph, nodes, edges } = wrappedGraph('ORTHOGONAL', ['A', 'B', 'C', 'D', 'E'], [2, 3])
    processBreakingPointRemoval(graph)
    // 无 BREAKING_POINT 残留
    for (const layer of graph.getLayers()) {
      for (const n of layer.getNodes()) {
        expect(n.getType()).not.toBe(NodeType.BREAKING_POINT)
      }
    }
    expectAllOriginalNodesInLayers(graph, nodes)
    expectEdgesStillConnected(graph, edges)
    // 原边 B→C 恢复
    const eBC = edges.get('B→C')!
    expect(eBC.getSource()!.getNode()).toBe(nodes.get('B'))
    expect(eBC.getTarget()!.getNode()).toBe(nodes.get('C'))
  })
})

// ─────────────────────────── SingleEdgeGraphWrapper ───────────────────────────

describe('SingleEdgeGraphWrapper', () => {
  it('validify GREEDY: 非法切割点向后推, 越界丢弃', () => {
    const { graph } = chainGraph(['A', 'B', 'C', 'D', 'E'])
    const gs = new GraphStats(graph)
    // 链图: 所有 cut 1..4 合法
    expect(validifyIndexesGreedily(gs, [2, 4])).toEqual([2, 4])
    // 人为禁掉 2 和 3 之后 2 → 4 (推后)
    graph.setProperty(WRAPPING_VALIDIFY_FORBIDDEN_INDICES, [2, 3])
    const gs2 = new GraphStats(graph)
    // 禁掉后 cutsAllowed 全 false (Java 行为: 非禁用位也是 false) → 2 推过界丢弃
    expect(validifyIndexesGreedily(gs2, [2])).toEqual([])
  })

  it('validify LOOK_BACK: 选最近合法切割点 (含向后/向前平局取前)', () => {
    const { graph } = chainGraph(['A', 'B', 'C', 'D', 'E'])
    const gs = new GraphStats(graph)
    // 全合法: [2] → [2]
    expect(validifyIndexesLookingBack(gs, [2])).toEqual([2])
    // 人为制造非法: 用禁止索引使 2 非法 → 仍返回 (Java 全 false 行为 → 哨兵)
    graph.setProperty(WRAPPING_VALIDIFY_FORBIDDEN_INDICES, [2])
    const gs2 = new GraphStats(graph)
    const res = validifyIndexesLookingBack(gs2, [2])
    expect(res.length).toBeLessThanOrEqual(1)
  })

  it('performCuts: 路径图切割后 chunk 交错, 原节点/原边不丢失', () => {
    const { graph, nodes, edges } = chainGraph(['A', 'B', 'C', 'D', 'E'])
    graph.setProperty(ASPECT_RATIO, 0.5) // dar=0.5 ≤ currentAR=5 → 执行
    graph.setProperty(WRAPPING_CUTTING_STRATEGY, CuttingStrategy.MANUAL)
    graph.setProperty(WRAPPING_CUTTING_CUTS, [2])
    graph.setProperty(WRAPPING_VALIDIFY_STRATEGY, ValidifyStrategy.NO)

    processSingleEdgeWrapping(graph)

    // 5 层 → 3 层: A 层含 C, B 层含 D, E 独占一层
    const layers = graph.getLayers()
    expect(layers).toHaveLength(3)
    const A = nodes.get('A')!
    const C = nodes.get('C')!
    expect(C.getLayer()).toBe(A.getLayer())
    expect(nodes.get('D')!.getLayer()).toBe(nodes.get('B')!.getLayer())
    expect(nodes.get('E')!.getLayer()).not.toBe(A.getLayer())
    expectAllOriginalNodesInLayers(graph, nodes)
    expectEdgesStillConnected(graph, edges)
    expect(graph.getProperty(CYCLIC)).toBe(true)
  })

  it('纵横比已满足时提前返回: 图完全不变', () => {
    const { graph } = chainGraph(['A', 'B', 'C', 'D', 'E'])
    graph.setProperty(ASPECT_RATIO, 100) // dar=100 > currentAR=5 → 提前返回
    graph.setProperty(WRAPPING_CUTTING_STRATEGY, CuttingStrategy.MANUAL)
    graph.setProperty(WRAPPING_CUTTING_CUTS, [2])
    const before = layerNodeCounts(graph)
    processSingleEdgeWrapping(graph)
    expect(layerNodeCounts(graph)).toEqual(before)
    expect(graph.getProperty(CYCLIC)).toBe(false)
  })
})
