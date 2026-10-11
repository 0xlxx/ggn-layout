/**
 * 移植自 ELK Java: p3order/AbstractBarycenterPortDistributorTest.java
 * 验证 ggn 端口分配 (distributePortsWhileSweeping) 的端口顺序与 ELK Java 一致.
 */
import { describe, expect, it, vi } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType, PortType, PortConstraints } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import { GraphInfoHolder } from '../../src/p3order/graph-info-holder.js'
import { CrossMinType, LayerTotalPortDistributor, createPortDistributor } from '../../src/p3order/port-distributors.js'
import { IN_LAYER_LAYOUT_UNIT, RANDOM, ORIGIN, PORT_DUMMY, BARYCENTER_ASSOCIATES } from '../../src/options/internal-properties.js'

// ── ggn 版 TestGraphCreator helper (对应 ELK TestGraphCreator) ──
function makeLayer(graph: LGraph): Layer {
  const layer = new Layer(graph)
  graph.getLayers().push(layer)
  return layer
}

function addNodeToLayer(graph: LGraph, layer: Layer): LNode {
  const node = new LNode(graph)
  node.setLayer(layer)
  node.setProperty(IN_LAYER_LAYOUT_UNIT, node)
  return node
}

function addNodesToLayer(graph: LGraph, n: number, layer: Layer): LNode[] {
  const out: LNode[] = []
  for (let i = 0; i < n; i++) out.push(addNodeToLayer(graph, layer))
  return out
}

function addPortOnSide(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

function addEdgeBetweenPorts(from: LPort, to: LPort): LEdge {
  const e = new LEdge()
  e.setSource(from)
  e.setTarget(to)
  return e
}

function eastWestEdgeFromTo(left: LNode, right: LNode): void {
  const lp = addPortOnSide(left, PortSide.EAST)
  const rp = addPortOnSide(right, PortSide.WEST)
  addEdgeBetweenPorts(lp, rp)
}

function addInLayerEdge(n1: LNode, n2: LNode, side: PortSide): void {
  const p1 = addPortOnSide(n1, side)
  const p2 = addPortOnSide(n2, side)
  addEdgeBetweenPorts(p1, p2)
}

function addNorthSouthEdge(side: PortSide, nodeWithNSPorts: LNode, northSouthDummy: LNode, nodeWithEWPorts: LNode, origin: boolean): void {
  const normalNodeEast = nodeWithEWPorts.getLayer()!.getIndex() < nodeWithNSPorts.getLayer()!.getIndex()
  const direction = normalNodeEast ? PortSide.WEST : PortSide.EAST
  const targetSide = direction === PortSide.WEST ? PortSide.EAST : PortSide.WEST
  const normalPort = addPortOnSide(nodeWithEWPorts, targetSide)
  const dummyPort = addPortOnSide(northSouthDummy, direction)
  if (origin) addEdgeBetweenPorts(normalPort, dummyPort)
  else addEdgeBetweenPorts(dummyPort, normalPort)
  northSouthDummy.setProperty(IN_LAYER_LAYOUT_UNIT, nodeWithNSPorts)
  northSouthDummy.setProperty(ORIGIN, nodeWithNSPorts)
  // setAsNorthSouthNode
  northSouthDummy.setType(NodeType.NORTH_SOUTH_PORT)
  const originPort = addPortOnSide(nodeWithNSPorts, side)
  dummyPort.setProperty(ORIGIN, originPort)
  originPort.setProperty(PORT_DUMMY, northSouthDummy)
  const baryAssoc = [northSouthDummy]
  const other = nodeWithNSPorts.getProperty<LNode[] | null>(BARYCENTER_ASSOCIATES)
  if (other === null || other === undefined) nodeWithNSPorts.setProperty(BARYCENTER_ASSOCIATES, baryAssoc)
  else other.push(...baryAssoc)
}

function setUpIds(graph: LGraph): void {
  let l = 0
  for (const layer of graph.getLayers()) {
    layer.id = l++
    let i = 0
    for (const node of layer.getNodes()) node.id = i++
  }
}

function copyPortsInIndexOrder(node: LNode, ...indices: number[]): LPort[] {
  return indices.map(i => node.getPorts()[i]!)
}

function distributePortsInCompleteGraph(graph: LGraph, gd: GraphInfoHolder, nodeArray: LNode[][]): void {
  for (let i = 0; i < nodeArray.length; i++) gd.portDistributor.distributePortsWhileSweeping(nodeArray, i, true)
  for (let i = nodeArray.length - 1; i >= 0; i--) gd.portDistributor.distributePortsWhileSweeping(nodeArray, i, false)
}

function makeGd(graph: LGraph): GraphInfoHolder {
  // ELK TestGraphCreator 设置 RANDOM (MockRandom). 这里用可控 mock: nextBoolean=false → LayerTotal.
  graph.setProperty(RANDOM, {
    nextBoolean: () => false,
    nextDouble: () => 0.5,
    nextFloat: () => 0.5,
    nextInt: () => 0,
    nextLong: () => 0,
    setSeed: () => {},
  } as any)
  const gd = new GraphInfoHolder(graph, CrossMinType.BARYCENTER, [])
  return gd
}

describe('AbstractBarycenterPortDistributor (ELK Java 移植)', () => {
  it('distributePortsOnSide: 西侧交叉应消除', () => {
    const graph = new LGraph()
    const left = addNodesToLayer(graph, 2, makeLayer(graph))
    const right = addNodeToLayer(graph, makeLayer(graph))
    eastWestEdgeFromTo(left[0]!, right)
    eastWestEdgeFromTo(left[1]!, right)
    const expected = [right.getPorts()[1]!, right.getPorts()[0]!]
    const gd = makeGd(graph)
    distributePortsInCompleteGraph(graph, gd, graph.toNodeArray())
    expect(right.getPorts()).toEqual(expected)
  })

  it('distributePortsOfGraph: 两侧交叉应消除', () => {
    const graph = new LGraph()
    const left = addNodesToLayer(graph, 2, makeLayer(graph))
    const middle = addNodeToLayer(graph, makeLayer(graph))
    const right = addNodesToLayer(graph, 2, makeLayer(graph))
    eastWestEdgeFromTo(middle, right[1]!)
    eastWestEdgeFromTo(middle, right[0]!)
    eastWestEdgeFromTo(left[0]!, middle)
    eastWestEdgeFromTo(left[1]!, middle)
    setUpIds(graph)
    const expected = copyPortsInIndexOrder(middle, 1, 0, 3, 2)
    const gd = makeGd(graph)
    distributePortsInCompleteGraph(graph, gd, graph.toNodeArray())
    expect(middle.getPorts()).toEqual(expected)
  })

  it('distributePortsOfGraph: 东侧交叉应消除', () => {
    const graph = new LGraph()
    const left = addNodeToLayer(graph, makeLayer(graph))
    const right = addNodesToLayer(graph, 2, makeLayer(graph))
    eastWestEdgeFromTo(left, right[1]!)
    eastWestEdgeFromTo(left, right[0]!)
    const expected = copyPortsInIndexOrder(left, 1, 0)
    const gd = makeGd(graph)
    distributePortsInCompleteGraph(graph, gd, graph.toNodeArray())
    expect(left.getPorts()).toEqual(expected)
  })

  it('distributePortsOfGraph: 层内边端口顺序交叉应消除', () => {
    const graph = new LGraph()
    addNodeToLayer(graph, makeLayer(graph))
    const nodes = addNodesToLayer(graph, 3, makeLayer(graph))
    addInLayerEdge(nodes[0]!, nodes[2]!, PortSide.EAST)
    addInLayerEdge(nodes[1]!, nodes[2]!, PortSide.EAST)
    const expected = copyPortsInIndexOrder(nodes[2]!, 1, 0)
    const gd = makeGd(graph)
    distributePortsInCompleteGraph(graph, gd, graph.toNodeArray())
    expect(nodes[2]!.getPorts()).toEqual(expected)
  })

  it('distributePortsOfGraph: NS 端口顺序交叉应交换', () => {
    const graph = new LGraph()
    const left = addNodesToLayer(graph, 3, makeLayer(graph))
    const right = addNodesToLayer(graph, 2, makeLayer(graph))
    addNorthSouthEdge(PortSide.NORTH, left[2]!, left[1]!, right[1]!, false)
    addNorthSouthEdge(PortSide.NORTH, left[2]!, left[0]!, right[0]!, false)
    const expected = [left[2]!.getPorts()[1]!, left[2]!.getPorts()[0]!]
    const gd = makeGd(graph)
    distributePortsInCompleteGraph(graph, gd, graph.toNodeArray())
    expect(left[2]!.getPorts()).toEqual(expected)
  })

  it('distributePortsWhileSweeping: 简单交叉应消除 (LayerTotal)', async () => {
    const { LayerTotalPortDistributor } = await import('../../src/p3order/port-distributors.js')
    const graph = new LGraph()
    const left = addNodeToLayer(graph, makeLayer(graph))
    const right = addNodeToLayer(graph, makeLayer(graph))
    eastWestEdgeFromTo(left, right)
    eastWestEdgeFromTo(left, right)
    const expected = copyPortsInIndexOrder(right, 1, 0)
    setUpIds(graph)
    const nodeArray = graph.toNodeArray()
    const dist = new LayerTotalPortDistributor(nodeArray.length)
    // IInitializable.init 等价: initAtLayerLevel/initAtNodeLevel/initAtPortLevel/initAfterTraversal
    for (let l = 0; l < nodeArray.length; l++) {
      dist.initAtLayerLevel(l, nodeArray)
      for (let n = 0; n < nodeArray[l]!.length; n++) dist.initAtNodeLevel(l, n, nodeArray)
    }
    dist.initAfterTraversal()
    dist.distributePortsWhileSweeping(nodeArray, 1, true)
    expect(right.getPorts()).toEqual(expected)
  })
})

/**
 * 性质/随机属性测试 (writer C): 端口分配器的秩与守恒不变量.
 *   - LayerTotal INPUT: 每节点分配到 rankSum+1..rankSum+inputCount 的连续互异整数, NORTH 输入端口秩更低
 *   - LayerTotal OUTPUT: 跨节点秩严格递增且互异
 *   - NodeRelative INPUT: 每节点秩在 (rankSum, rankSum+1) 开区间且互异, NORTH 秩 ≤ rankSum+northCount/(count+1)
 *   - distributePortsWhileSweeping 后: 端口 id 集合守恒 + 端口侧守恒 + 非 FIXED_ORDER 节点侧序单调 (NORTH<EAST<SOUTH<WEST)
 */
import { LayerTotalPortDistributor as PtLayerTotal, NodeRelativePortDistributor as PtNodeRelative } from '../../src/p3order/port-distributors.js'
import { initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { JavaRandom } from '../../src/util/java-random.js'
import {
  makeLayer as ptMakeLayer, addNodesToLayer as ptAddNodesToLayer,
  addPortOnSide as ptAddPortOnSide, addEdgeBetweenPorts as ptAddEdgeBetweenPorts,
  setUpLayerNodeIds, indexPortIds, randomLayeredGraph,
} from './helpers/PropertyTestGraphs.js'

describe('端口分配器 性质/随机属性测试', () => {
  const SEEDS = [1, 2, 3, 4, 5]

  /** 随机「输入层」: 每节点 1..3 个输入端口 (NORTH/EAST/WEST 混合), 从虚拟前层连入. */
  function makeInputLayer(seed: number, n: number): { nodes: LNode[]; totalInput: number } {
    const r = new JavaRandom(seed)
    const graph = new LGraph()
    const layer = ptMakeLayer(graph)
    const prevLayer = ptMakeLayer(graph)
    const nodes = ptAddNodesToLayer(graph, n, layer)
    const prev = ptAddNodesToLayer(graph, 3 * n, prevLayer)
    let totalInput = 0
    for (const node of nodes) {
      const k = 1 + r.nextInt(3)
      for (let e = 0; e < k; e++) {
        const side = r.nextInt(3) === 0 ? PortSide.NORTH : (r.nextInt(2) === 0 ? PortSide.EAST : PortSide.WEST)
        const p = ptAddPortOnSide(node, side)
        const pp = ptAddPortOnSide(prev[r.nextInt(prev.length)]!, PortSide.EAST)
        ptAddEdgeBetweenPorts(pp, p)
        totalInput++
      }
    }
    setUpLayerNodeIds(graph)
    indexPortIds(graph)
    return { nodes, totalInput }
  }

  it.each(SEEDS)('LayerTotal INPUT: seed=%i 秩为连续互异整数, NORTH 输入端口秩更低', (seed) => {
    const { nodes, totalInput } = makeInputLayer(seed, 6)
    const pd = new PtLayerTotal(1)
    ;(pd as any).nPorts = 1000
    pd.initAfterTraversal()
    pd.calculatePortRanksForLayer(nodes, PortType.INPUT)
    const ranks = pd.getPortRanks()
    let rankSum = 0
    let covered = 0
    for (const node of nodes) {
      const inputPorts = node.getPorts(PortType.INPUT)
      const inputCount = inputPorts.length
      const assigned = inputPorts.map(p => ranks[p.id])
      // 连续整数 rankSum+1..rankSum+inputCount (互异)
      expect([...assigned].sort((a, b) => a - b)).toEqual(
        Array.from({ length: inputCount }, (_, i) => rankSum + 1 + i),
      )
      const northRanks = inputPorts.filter(p => p.getSide() === PortSide.NORTH).map(p => ranks[p.id])
      const otherRanks = inputPorts.filter(p => p.getSide() !== PortSide.NORTH).map(p => ranks[p.id])
      if (northRanks.length > 0 && otherRanks.length > 0) {
        expect(Math.max(...northRanks)).toBeLessThan(Math.min(...otherRanks))
      }
      rankSum += inputCount
      covered += inputCount
    }
    expect(covered).toBe(totalInput)
  })

  it.each(SEEDS)('NodeRelative INPUT: seed=%i 秩在 (rankSum, rankSum+1) 且互异, NORTH 靠近顶部', (seed) => {
    const { nodes } = makeInputLayer(seed, 6)
    const pd = new PtNodeRelative(1)
    ;(pd as any).nPorts = 1000
    pd.initAfterTraversal()
    pd.calculatePortRanksForLayer(nodes, PortType.INPUT)
    const ranks = pd.getPortRanks()
    let rankSum = 0
    for (const node of nodes) {
      const inputPorts = node.getPorts(PortType.INPUT)
      const assigned = inputPorts.map(p => ranks[p.id])
      expect(new Set(assigned).size).toBe(inputPorts.length)
      for (const rnk of assigned) {
        expect(rnk).toBeGreaterThan(rankSum)
        expect(rnk).toBeLessThan(rankSum + 1)
      }
      const northCount = inputPorts.filter(p => p.getSide() === PortSide.NORTH).length
      if (northCount > 0) {
        const incr = 1 / (inputPorts.length + 1)
        for (const p of inputPorts.filter(pp => pp.getSide() === PortSide.NORTH)) {
          expect(ranks[p.id]).toBeLessThanOrEqual(rankSum + northCount * incr + 1e-9)
        }
      }
      rankSum += 1
    }
  })

  it.each(SEEDS)('LayerTotal OUTPUT: seed=%i 秩跨节点严格递增且互异', (seed) => {
    const r = new JavaRandom(seed)
    const graph = new LGraph()
    const layer = ptMakeLayer(graph)
    const nodes = addNodesToLayer(graph, 6, layer)
    for (const node of nodes) {
      const k = 1 + r.nextInt(3)
      for (let e = 0; e < k; e++) ptAddPortOnSide(node, PortSide.EAST)
    }
    setUpLayerNodeIds(graph)
    indexPortIds(graph)
    const pd = new PtLayerTotal(1)
    ;(pd as any).nPorts = 1000
    pd.initAfterTraversal()
    pd.calculatePortRanksForLayer(nodes, PortType.OUTPUT)
    const ranks = pd.getPortRanks()
    const allRanks = nodes.flatMap(n => n.getPorts(PortType.OUTPUT).map(p => ranks[p.id]))
    expect(allRanks).toEqual([...allRanks].sort((a, b) => a - b))
    expect(new Set(allRanks).size).toBe(allRanks.length)
  })

  it.each(SEEDS)('distributePortsWhileSweeping: seed=%i 端口集合/侧守恒 + 非固定序节点侧排序', (seed) => {
    const r = new JavaRandom(seed)
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
    // 部分节点加 NORTH/SOUTH 端口
    for (const layer of layers) {
      for (const node of layer) {
        if (r.nextBoolean()) ptAddPortOnSide(node, PortSide.NORTH)
        if (r.nextBoolean()) ptAddPortOnSide(node, PortSide.SOUTH)
      }
    }
    setUpLayerNodeIds(graph)
    const order = graph.toNodeArray()
    const pd = new PtLayerTotal(order.length)
    initInitializables([pd], order) // 归一化 port.id
    const before = order.map(layer =>
      layer.map(n => ({
        ids: n.getPorts().map(p => p.id).sort((a, b) => a - b),
        sides: n.getPorts().map(p => p.getSide()),
      })),
    )
    for (let i = 0; i < order.length; i++) pd.distributePortsWhileSweeping(order, i, true)
    for (let i = order.length - 1; i >= 0; i--) pd.distributePortsWhileSweeping(order, i, false)
    const sideRank: Record<string, number> = { [PortSide.NORTH]: 0, [PortSide.EAST]: 1, [PortSide.SOUTH]: 2, [PortSide.WEST]: 3 }
    for (let l = 0; l < order.length; l++) {
      for (let n = 0; n < order[l]!.length; n++) {
        const node = order[l]![n]!
        // 端口 id 集合守恒
        expect(node.getPorts().map(p => p.id).sort((a, b) => a - b), `l=${l} n=${n}`).toEqual(before[l]![n]!.ids)
        // 端口侧守恒
        const sideCounts = new Map<string, number>()
        for (const s of before[l]![n]!.sides) sideCounts.set(s, (sideCounts.get(s) ?? 0) + 1)
        for (const p of node.getPorts()) sideCounts.set(p.getSide(), (sideCounts.get(p.getSide()) ?? 0) - 1)
        for (const v of sideCounts.values()) expect(v, `l=${l} n=${n} side count`).toBe(0)
        // 非固定序节点: 侧序单调 (NORTH<EAST<SOUTH<WEST)
        const pc = node.getProperty<PortConstraints>('org.eclipse.elk.portConstraints')
        if (!PortConstraints.isOrderFixed(pc)) {
          const sides = node.getPorts().map(p => sideRank[p.getSide()]!)
          for (let i = 1; i < sides.length; i++) expect(sides[i]!).toBeGreaterThanOrEqual(sides[i - 1]!)
        }
      }
    }
  })
})

// ============================================================================
// M7 变异补测: createPortDistributor 环境矩阵 / NS 端口方向 / 嵌套图跳过
// ============================================================================

describe('createPortDistributor 环境矩阵 (M7 变异补测)', () => {
  it('无环境变量 + nextBoolean=false → LayerTotal', () => {
    const pd = createPortDistributor(CrossMinType.BARYCENTER, { nextBoolean: () => false } as any, [])
    expect((pd as any).constructor.name).toBe('LayerTotalPortDistributor')
  })

  it('无环境变量 + nextBoolean=true → NodeRelative', () => {
    const pd = createPortDistributor(CrossMinType.BARYCENTER, { nextBoolean: () => true } as any, [])
    expect((pd as any).constructor.name).toBe('NodeRelativePortDistributor')
  })

  it('GGN_NR=1: 强制 NodeRelative 且早退 (nextBoolean 不消耗)', () => {
    process.env.GGN_NR = '1'
    try {
      let booleans = 0
      const pd = createPortDistributor(CrossMinType.BARYCENTER, { nextBoolean: () => { booleans++; return false } } as any, [])
      expect((pd as any).constructor.name).toBe('NodeRelativePortDistributor')
      expect(booleans).toBe(0)
    } finally {
      delete process.env.GGN_NR
    }
  })

  it('GGN_PD=1 (无 GGN_NR) + nextBoolean=false: 输出 LayerTotal 决策', () => {
    const calls: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { calls.push(String(a[0])) })
    process.env.GGN_PD = '1'
    try {
      const pd = createPortDistributor(CrossMinType.BARYCENTER, { nextBoolean: () => false } as any, [])
      expect((pd as any).constructor.name).toBe('LayerTotalPortDistributor')
      expect(calls).toEqual(['GGN_PD LayerTotal (nextBoolean=false)'])
    } finally {
      delete process.env.GGN_PD
      vi.restoreAllMocks()
    }
  })
})

describe('NS 端口方向与嵌套图 (M7 变异补测)', () => {
  function makeDist(graph: LGraph): LayerTotalPortDistributor {
    const nodeArray = graph.toNodeArray()
    const dist = new LayerTotalPortDistributor(nodeArray.length)
    for (let l = 0; l < nodeArray.length; l++) {
      dist.initAtLayerLevel(l, nodeArray)
      for (let n = 0; n < nodeArray[l]!.length; n++) dist.initAtNodeLevel(l, n, nodeArray)
    }
    dist.initAfterTraversal()
    return dist
  }

  /** origin 上有两个 SOUTH NS 端口: 一个 input (边进入 dummy), 一个 output (边从 dummy 出). */
  function makeNsDummy(origin: LNode, graph: LGraph, ew: LNode, side: PortSide, direction: 'in' | 'out'): void {
    const port = addPortOnSide(origin, side)
    const d = addNodeToLayer(graph, origin.getLayer()!)
    d.setType(NodeType.NORTH_SOUTH_PORT)
    d.setProperty(IN_LAYER_LAYOUT_UNIT, origin)
    d.setProperty(ORIGIN, origin)
    const dp = addPortOnSide(d, PortSide.WEST)
    dp.setProperty(ORIGIN, port)
    port.setProperty(PORT_DUMMY, d)
    const ewPort = addPortOnSide(ew, PortSide.EAST)
    if (direction === 'in') addEdgeBetweenPorts(ewPort, dp)
    else addEdgeBetweenPorts(dp, ewPort)
  }

  it('SOUTH input 端口 barycenter 大, output 端口小 → sortPorts 后 output 在前', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const ew = addNodeToLayer(graph, l1)
    makeNsDummy(origin, graph, ew, PortSide.SOUTH, 'in')
    const portIn = origin.getPorts()[0]!
    makeNsDummy(origin, graph, ew, PortSide.SOUTH, 'out')
    const portOut = origin.getPorts()[1]!
    setUpIds(graph)
    const dist = makeDist(graph)
    const nodeArray = graph.toNodeArray()
    dist.distributePortsWhileSweeping(nodeArray, 0, true)
    const bary = (dist as any).portBarycenter as number[]
    expect(bary[portIn.id]).toBeGreaterThan(bary[portOut.id])
    expect(origin.getPorts().indexOf(portOut)).toBeLessThan(origin.getPorts().indexOf(portIn))
  })

  it('NORTH input 端口 barycenter 为负 (output 前)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const ew = addNodeToLayer(graph, l1)
    makeNsDummy(origin, graph, ew, PortSide.NORTH, 'in')
    const portIn = origin.getPorts()[0]!
    setUpIds(graph)
    const dist = makeDist(graph)
    const nodeArray = graph.toNodeArray()
    dist.distributePortsWhileSweeping(nodeArray, 0, true)
    const bary = (dist as any).portBarycenter as number[]
    // NORTH input: -positionOf(dummy) < 0
    expect(bary[portIn.id]).toBeLessThan(0)
  })

  it('同一 dummy 的端口既有输入又有输出: 中间值分支 (input&&output)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const ew1 = addNodeToLayer(graph, l1)
    const port = addPortOnSide(origin, PortSide.SOUTH)
    const d = addNodeToLayer(graph, l0)
    d.setType(NodeType.NORTH_SOUTH_PORT)
    d.setProperty(IN_LAYER_LAYOUT_UNIT, origin)
    d.setProperty(ORIGIN, origin)
    const dpIn = addPortOnSide(d, PortSide.WEST)
    dpIn.setProperty(ORIGIN, port)
    const dpOut = addPortOnSide(d, PortSide.EAST)
    dpOut.setProperty(ORIGIN, port)
    port.setProperty(PORT_DUMMY, d)
    const ewPort1 = addPortOnSide(ew1, PortSide.EAST)
    addEdgeBetweenPorts(ewPort1, dpIn)  // input
    const ew2 = addNodeToLayer(graph, l1)
    const ewPort2 = addPortOnSide(ew2, PortSide.EAST)
    addEdgeBetweenPorts(dpOut, ewPort2)  // output
    setUpIds(graph)
    const dist = makeDist(graph)
    const nodeArray = graph.toNodeArray()
    dist.distributePortsWhileSweeping(nodeArray, 0, true)
    const bary = (dist as any).portBarycenter as number[]
    // input&&output: SOUTH → absurdlyLargeFloat / 2 (在 0 与 absurdlyLargeFloat 之间)
    const absurdlyLargeFloat = 2 * l0.getNodes().length + 1
    expect(bary[port.id]).toBe(absurdlyLargeFloat / 2)
  })

  it('NORTH 端口无 PORT_DUMMY: 跳过 (continue) 不参与 barycenter', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    const np = addPortOnSide(origin, PortSide.NORTH)
    const ep = addPortOnSide(origin, PortSide.EAST)
    setUpIds(graph)
    const dist = makeDist(graph)
    const nodeArray = graph.toNodeArray()
    expect(() => dist.distributePortsWhileSweeping(nodeArray, 0, true)).not.toThrow()
    const bary = (dist as any).portBarycenter as number[]
    // 无 PORT_DUMMY 的 NORTH 端口: 不写入 barycenter (undefined)
    expect(bary[np.id]).toBeUndefined()
    expect(bary[ep.id]).toBeUndefined()
  })

  it('固定层含嵌套图节点: distributePortsWhileSweeping 跳过 (hasNestedGraph)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const left = addNodeToLayer(graph, l0)
    const right = addNodeToLayer(graph, l1)
    eastWestEdgeFromTo(left, right)
    // right 有嵌套图
    const inner = new LGraph()
    inner.setParentNode(right)
    setUpIds(graph)
    const dist = makeDist(graph)
    const nodeArray = graph.toNodeArray()
    // backward sweep: freeLayer=0, fixedLayer=1 (含嵌套图 → 跳过 distributePorts)
    expect(() => dist.distributePortsWhileSweeping(nodeArray, 0, false)).not.toThrow()
  })

  it('sortPorts: barycenter=0 的端口排在最前 (0 判定分支)', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const origin = addNodeToLayer(graph, l0)
    // EAST 端口 x3: 一个 0, 一个正, 一个负
    const pZero = addPortOnSide(origin, PortSide.EAST)
    const pNeg = addPortOnSide(origin, PortSide.EAST)
    const pPos = addPortOnSide(origin, PortSide.EAST)
    setUpIds(graph)
    const dist = makeDist(graph)
    const bary = (dist as any).portBarycenter as number[]
    bary[pZero.id] = 0
    bary[pNeg.id] = -5
    bary[pPos.id] = 5
    dist.distributePortsWhileSweeping(graph.toNodeArray(), 0, true)
    const order = origin.getPorts()
    // 0 分支: port1Bary===0 → 最前; 之后按 bary 升序
    expect(order[0]).toBe(pZero)
    expect(order[1]).toBe(pNeg)
    expect(order[2]).toBe(pPos)
  })
})
