/**
 * NetworkSimplexPlacer (对应 ELK p4nodes.NetworkSimplexPlacer) — 集成测试.
 * 覆盖: 弹性节点 (NODE_SIZE / PORT_POSITION) 变换、端口锚点取整、端口链、
 * 层内边辅助边、南北端口辅助边、dummy-dummy 边权重、applyPositions 弹性分支.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType } from '../../src/index.js'
import { NetworkSimplexPlacer, isFlexibleNode, getNodeFlexibility } from '../../src/p4nodes/network-simplex-placer.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { Spacings, getIndividualOrDefault } from '../../src/p4nodes/spacings.js'
import { SPACINGS, PORT_DUMMY } from '../../src/options/internal-properties.js'
import {
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT,
  NodeFlexibility, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING, SPACING_INDIVIDUAL,
  NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES,
} from '../../src/options/layered-options.js'
import { Layer } from '../../src/graph/layer.js'
import { MapPropertyHolder } from '../../src/graph/properties.js'

function makeGraph(): { g: LGraph, layer: Layer } {
  const g = new LGraph()
  g.setProperty(SPACINGS, new Spacings(g))
  const layer = new Layer(g)
  g.getLayers().push(layer)
  return { g, layer }
}

function addNodeToLayer(layer: Layer, type = NodeType.NORMAL): LNode {
  const n = new LNode(layer.getGraph()!)
  n.setType(type)
  n.setLayer(layer)
  return n
}

function addPort(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

function addEdge(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

describe('isFlexibleNode / getNodeFlexibility (ELK Java 移植)', () => {
  it('节点级属性优先于图默认值', () => {
    const g = new LGraph()
    g.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NONE)
    const n = new LNode(g)
    n.setType(NodeType.NORMAL)
    expect(getNodeFlexibility(n)).toBe(NodeFlexibility.NONE)
    n.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NodeFlexibility.NODE_SIZE)
    expect(getNodeFlexibility(n)).toBe(NodeFlexibility.NODE_SIZE)
  })

  it('非 NORMAL 类型 / 单端口 / 固定位置端口约束 均非弹性', () => {
    const g = new LGraph()
    g.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NODE_SIZE)
    const dummy = new LNode(g)
    dummy.setType(NodeType.LONG_EDGE)
    expect(isFlexibleNode(dummy)).toBe(false)

    const single = new LNode(g)
    single.setType(NodeType.NORMAL)
    addPort(single, PortSide.EAST)
    expect(isFlexibleNode(single)).toBe(false)

    const fixed = new LNode(g)
    fixed.setType(NodeType.NORMAL)
    addPort(fixed, PortSide.WEST)
    addPort(fixed, PortSide.EAST)
    fixed.setProperty('org.eclipse.elk.portConstraints', 'FIXED_POS')
    expect(isFlexibleNode(fixed)).toBe(false)
  })

  it('PORT_POSITION: 侧端口所需空间超过节点高度则非弹性', () => {
    const g = new LGraph()
    g.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.PORT_POSITION)
    // 5 个 west 端口: requiredWest = 0+0+4*10=40 > 30
    const westTooMany = new LNode(g)
    westTooMany.setType(NodeType.NORMAL)
    westTooMany.size = { x: 30, y: 30 }
    for (let i = 0; i < 5; i++) addPort(westTooMany, PortSide.WEST)
    expect(isFlexibleNode(westTooMany)).toBe(false)

    // 5 个 east 端口: requiredEast = 40 > 30
    const eastTooMany = new LNode(g)
    eastTooMany.setType(NodeType.NORMAL)
    eastTooMany.size = { x: 30, y: 30 }
    addPort(eastTooMany, PortSide.WEST)
    for (let i = 0; i < 5; i++) addPort(eastTooMany, PortSide.EAST)
    expect(isFlexibleNode(eastTooMany)).toBe(false)

    // 满足空间 → 弹性
    const ok = new LNode(g)
    ok.setType(NodeType.NORMAL)
    ok.size = { x: 30, y: 30 }
    addPort(ok, PortSide.WEST)
    addPort(ok, PortSide.EAST)
    expect(isFlexibleNode(ok)).toBe(true)
  })
})

describe('NetworkSimplexPlacer.process (ELK Java 移植)', () => {
  it('NODE_SIZE 弹性节点: 端口空间不足时节点增高, 端口位置应用', () => {
    const { g, layer } = makeGraph()
    const a = addNodeToLayer(layer)
    a.size = { x: 30, y: 30 }
    a.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NodeFlexibility.NODE_SIZE)
    const pW1 = addPort(a, PortSide.WEST)
    pW1.size = { x: 5, y: 40 } // 需要 40 高度
    pW1.setAnchor({ x: 0, y: 10.5 }) // 非整数锚点 → prepare 取整
    const pW2 = addPort(a, PortSide.WEST) // 同侧第二端口 → 触发端口间间距分支
    pW2.size = { x: 5, y: 0 }
    const pE = addPort(a, PortSide.EAST)
    pE.size = { x: 5, y: 0 }

    new NetworkSimplexPlacer().process(g)

    // 锚点取整: 10.5 → 11
    expect(pW1.getAnchor().y).toBe(11)
    // 节点位置有限且归一化到 >= 0
    expect(Number.isFinite(a.getPosition().y)).toBe(true)
    expect(a.getPosition().y).toBeGreaterThanOrEqual(0)
    // NODE_SIZE: 高度增长. west 端口链 (逆序): head→pW2(0)→pW1(10)→tail(50) → 50.
    expect(a.getSize().y).toBe(50)
    // 端口位置已应用 (>= 0, 有限)
    for (const p of [pW1, pW2, pE]) {
      expect(Number.isFinite(p.getPosition().y)).toBe(true)
      expect(p.getPosition().y).toBeGreaterThanOrEqual(0)
    }
  })

  it('PORT_POSITION 弹性节点: 不增高但设置端口位置', () => {
    const { g, layer } = makeGraph()
    const b = addNodeToLayer(layer)
    b.size = { x: 30, y: 30 }
    b.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NodeFlexibility.PORT_POSITION)
    addPort(b, PortSide.WEST)
    addPort(b, PortSide.EAST)

    new NetworkSimplexPlacer().process(g)

    expect(b.getPosition().y).toBeGreaterThanOrEqual(0)
    // PORT_POSITION 不改变节点尺寸
    expect(b.getSize().y).toBe(30)
    for (const p of b.getPorts()) {
      expect(Number.isFinite(p.getPosition().y)).toBe(true)
    }
  })

  it('混合图: 层内边辅助边 + 南北端口辅助边 + dummy-dummy 边', () => {
    const { g } = makeGraph()
    const layer0 = g.getLayers()[0]!
    const layer1 = new Layer(g)
    g.getLayers().push(layer1)

    // 层0: A (NORMAL), D1 (LONG_EDGE dummy)
    const a = addNodeToLayer(layer0)
    a.size = { x: 30, y: 30 }
    const d1 = addNodeToLayer(layer0, NodeType.LONG_EDGE)
    // 层内边 A ↔ D1 (src 为 dummy)
    const aWest = addPort(a, PortSide.WEST)
    const d1East = addPort(d1, PortSide.EAST)
    addEdge(d1East, aWest)

    // 层1: D2 (LONG_EDGE), NS 节点 + NS dummy, EW 节点
    const d2 = addNodeToLayer(layer1, NodeType.LONG_EDGE)
    const d2West = addPort(d2, PortSide.WEST)
    const d1West = addPort(d1, PortSide.WEST)
    addEdge(d1West, d2West) // dummy→dummy 跨层边

    const nsNode = addNodeToLayer(layer1)
    nsNode.size = { x: 30, y: 30 }
    const nsSouth = addPort(nsNode, PortSide.SOUTH)
    const nsNorth = addPort(nsNode, PortSide.NORTH)
    const nsDummyS = addNodeToLayer(layer1, NodeType.NORTH_SOUTH_PORT)
    const nsDummyN = addNodeToLayer(layer1, NodeType.NORTH_SOUTH_PORT)
    nsSouth.setProperty(PORT_DUMMY, nsDummyS)
    nsNorth.setProperty(PORT_DUMMY, nsDummyN)

    const ew = addNodeToLayer(layer0)
    ew.size = { x: 30, y: 30 }
    const ewEast = addPort(ew, PortSide.EAST)
    // NS dummy 与 ew 的跨层边 (SOUTH dummy 出边 / NORTH dummy 入边)
    const sDummyEast = addPort(nsDummyS, PortSide.EAST)
    const nDummyEast = addPort(nsDummyN, PortSide.EAST)
    addEdge(sDummyEast, ewEast)
    addEdge(ewEast, nDummyEast)

    new NetworkSimplexPlacer().process(g)

    // 精确位置 (Java 差分已全等): 层内边/南北端口辅助边约束下的确定性结果
    expect(a.getPosition().y).toBe(0)
    expect(d1.getPosition().y).toBe(40)
    expect(d2.getPosition().y).toBe(40)
    expect(nsNode.getPosition().y).toBe(10)
    expect(nsDummyS.getPosition().y).toBe(50)
    expect(nsDummyN.getPosition().y).toBe(10)
    expect(ew.getPosition().y).toBe(50)
  })

  it('空图层: process 不抛错', () => {
    const { g } = makeGraph()
    new NetworkSimplexPlacer().process(g)
    expect(g.getLayers()[0]!.getNodes()).toEqual([])
  })
})

describe('Spacings.getIndividualOrDefault (图级间距解析)', () => {
  it('节点未设属性时解析到图级值 (非属性默认)', () => {
    const g = new LGraph()
    g.setProperty(SPACING_PORT_PORT, 5)
    g.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, right: 0, bottom: 10 })
    const n = new LNode(g)
    n.setType(NodeType.NORMAL)
    // 节点本身未设置 → 走图级值
    expect(getIndividualOrDefault(n, SPACING_PORT_PORT)).toBe(5)
    expect(getIndividualOrDefault(n, SPACING_PORTS_SURROUNDING)).toEqual({ top: 10, left: 0, right: 0, bottom: 10 })
  })

  it('SPACING_INDIVIDUAL 覆盖优先于图级值', () => {
    const g = new LGraph()
    g.setProperty(SPACING_PORT_PORT, 5)
    const n = new LNode(g)
    n.setType(NodeType.NORMAL)
    const individual = new MapPropertyHolder()
    individual.setProperty(SPACING_PORT_PORT, 13)
    n.setProperty(SPACING_INDIVIDUAL, individual)
    expect(getIndividualOrDefault(n, SPACING_PORT_PORT)).toBe(13)
  })
})

describe('NetworkSimplexPlacer WHERE_SPACE_PERMITS 第二遍', () => {
  it('触发 flexibleWhereSpace 第二遍: 不崩溃, 弹性节点只增不减', () => {
    const { g, layer } = makeGraph()
    const a = addNodeToLayer(layer)
    a.size = { x: 30, y: 30 }
    a.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NodeFlexibility.NODE_SIZE_WHERE_SPACE_PERMITS)
    const pW1 = addPort(a, PortSide.WEST)
    pW1.size = { x: 5, y: 0 }
    const pW2 = addPort(a, PortSide.WEST)
    pW2.size = { x: 5, y: 0 }
    const pE = addPort(a, PortSide.EAST)
    pE.size = { x: 5, y: 0 }

    expect(() => new NetworkSimplexPlacer().process(g)).not.toThrow()
    // 弹性节点不缩小 (WHERE_SPACE_PERMITS 只允许增大).
    expect(a.getSize().y).toBeGreaterThanOrEqual(30)
    expect(Number.isFinite(a.getPosition().y)).toBe(true)
  })

  it('nodeSizeEdge 收集到 flexibleWhereSpacePermitsEdges (WHERE_SPACE_PERMITS)', () => {
    const { g, layer } = makeGraph()
    const a = addNodeToLayer(layer)
    a.size = { x: 30, y: 30 }
    a.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NodeFlexibility.NODE_SIZE_WHERE_SPACE_PERMITS)
    addPort(a, PortSide.WEST)
    addPort(a, PortSide.EAST)
    new NetworkSimplexPlacer().process(g)
    // 第二遍正常执行 (无异常) — 收集集合在 cleanup 清空.
    expect(a.getSize().y).toBeGreaterThanOrEqual(30)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4X3 变异补测: favorStraightEdges 管线 + 精确位置回归 (Java 差分已全等).
// 随机确定性图 (JavaRandom 种子) — 与手写场景互补, 覆盖 markEdgeCrossings/
// identifyPaths/improveTwoPath 等内部路径.
// ─────────────────────────────────────────────────────────────────────────────

function makeStraightGraph(): { g: LGraph } {
  const g = new LGraph()
  g.setProperty(SPACINGS, new Spacings(g))
  return { g }
}

function addLayerTo(g: LGraph): Layer {
  const l = new Layer(g)
  g.getLayers().push(l)
  return l
}

function addSizedNode(layer: Layer, h = 20, type = NodeType.NORMAL): LNode {
  const n = new LNode(layer.getGraph()!)
  n.setType(type)
  n.setLayer(layer)
  n.size = { x: 20, y: h }
  return n
}

function addAnchoredPort(node: LNode, side: PortSide, anchorY: number): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  p.setAnchor({ x: side === PortSide.EAST ? 20 : side === PortSide.WEST ? 0 : 10, y: anchorY })
  return p
}

function addEdgeBetween(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

/** 与搜索脚本一致的确定性随机图 (3 层 × 3 节点, 随机高度/锚点/边). */
function buildRandomPlacerGraph(fse: boolean, seed: number): LGraph {
  const r = new JavaRandom(seed)
  const { g } = makeStraightGraph()
  g.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, fse)
  const layers: Layer[] = []
  for (let l = 0; l < 3; l++) layers.push(addLayerTo(g))
  const nodes: LNode[][] = []
  for (let l = 0; l < 3; l++) {
    nodes.push([])
    for (let i = 0; i < 3; i++) nodes[l]!.push(addSizedNode(layers[l]!, 10 + r.nextInt(30)))
  }
  for (let l = 0; l < 2; l++) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (r.nextDouble() < 0.5) {
          addEdgeBetween(addAnchoredPort(nodes[l]![i]!, PortSide.EAST, r.nextInt(30)), addAnchoredPort(nodes[l + 1]![j]!, PortSide.WEST, r.nextInt(30)))
        }
      }
    }
  }
  return g
}

function roundPositions(g: LGraph): number[] {
  const out: number[] = []
  for (const l of g.getLayers()) for (const n of l.getNodes()) out.push(Math.round(n.getPosition().y * 100) / 100)
  return out
}

describe('NetworkSimplexPlacer favorStraightEdges 精确位置回归', () => {
  it.each([
    // [seed, FSE, 期望 y 序列 (3 层 × 3 节点, 插入序)]
    [71, true, [40, 91, 149, 53, 93, 157, 0, 55, 96]],
    [71, false, [40, 91, 149, 53, 93, 131, 0, 55, 96]],
    [243, true, [14, 62, 103, 0, 47, 97, 6, 58, 111]],
    [243, false, [14, 62, 103, 15, 47, 97, 6, 58, 111]],
    [374, true, [68, 122, 179, 73, 118, 171, 13, 59, 117]],
    [374, false, [68, 122, 179, 73, 118, 155, 13, 59, 117]],
  ] as const)('seed=%i FSE=%s: 精确 y 位置', (seed, fse, expected) => {
    const g = buildRandomPlacerGraph(fse, seed)
    new NetworkSimplexPlacer().process(g)
    expect(roundPositions(g)).toEqual(expected)
  })

  it('prepare 取整: 非弹性节点端口 position.y + anchor.y 非整数 → position 取整', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const n = addSizedNode(layer, 20)
    const p = addAnchoredPort(n, PortSide.EAST, 0.5)
    p.getPosition().y = 10.3 // y2 = 10.8 → offset -0.2 → position 10.5
    new NetworkSimplexPlacer().process(g)
    expect(p.getPosition().y).toBe(10.5)
  })

  it('getEdgeWeight: 类型权重 (NORMAL×4 / 单端×8 / 双 dummy×32) × priority', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const layer = new Layer(g)
    g.getLayers().push(layer)
    const a = addSizedNode(layer)
    const b = addSizedNode(layer)
    const pA = addAnchoredPort(a, PortSide.EAST, 5)
    const pB = addAnchoredPort(b, PortSide.WEST, 5)
    const e = addEdgeBetween(pA, pB)
    const placer = new NetworkSimplexPlacer()
    const any = placer as unknown as { getEdgeWeight(e: LEdge): number }
    expect(any.getEdgeWeight(e)).toBe(1 * 4) // NORMAL-NORMAL: priority(1) * 1*EDGE_WEIGHT_BASE(4)
    const dummy = addSizedNode(layer, 10, NodeType.LONG_EDGE)
    const pD = addAnchoredPort(dummy, PortSide.WEST, 5)
    const e2 = addEdgeBetween(pA, pD)
    expect(any.getEdgeWeight(e2)).toBe(2 * 4) // NORMAL-LONG_EDGE: priority(1) * 2*EDGE_WEIGHT_BASE
    const d2 = addSizedNode(layer, 10, NodeType.LONG_EDGE)
    const pD2 = addAnchoredPort(d2, PortSide.WEST, 5)
    const e3 = addEdgeBetween(pD, pD2)
    expect(any.getEdgeWeight(e3)).toBe(8 * 4) // LONG_EDGE-LONG_EDGE: priority(1) * 8*EDGE_WEIGHT_BASE
  })

  it('isHandledEdge: 自环/层内边 false, 正常跨层边 true', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const l0 = new Layer(g)
    const l1 = new Layer(g)
    g.getLayers().push(l0, l1)
    const a = addSizedNode(l0)
    const b = addSizedNode(l1)
    const pA = addAnchoredPort(a, PortSide.EAST, 5)
    const pB = addAnchoredPort(b, PortSide.WEST, 5)
    const cross = addEdgeBetween(pA, pB)
    const selfLoop = addEdgeBetween(pA, pA)
    const pA2 = addAnchoredPort(a, PortSide.EAST, 15)
    const inLayer = addEdgeBetween(pA, pA2)
    const placer = new NetworkSimplexPlacer()
    const any = placer as unknown as { isHandledEdge(e: LEdge): boolean }
    expect(any.isHandledEdge(cross)).toBe(true)
    expect(any.isHandledEdge(selfLoop)).toBe(false)
    expect(any.isHandledEdge(inLayer)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 白盒: favorStraightEdges 内部管线 (preferStraightEdges / identifyPaths /
// markEdgeCrossings / 权重提升 / two-paths) — 与 ELK Java 1:1 对齐.
// ─────────────────────────────────────────────────────────────────────────────

type PathLike = {
  length: number
  map<T>(fn: (e: LEdge) => T): T[]
  isTwoPathCenterNodeFlexible(): boolean
}

type PlacerInternals = {
  lGraph: LGraph
  spacings: Spacings
  nGraph: import('../../src/networksimplex/ngraph.js').NGraph
  edgeReps: ({ origin: LEdge, left: import('../../src/networksimplex/nedge.js').NEdge, right: import('../../src/networksimplex/nedge.js').NEdge, isStraight(): boolean, notStraightBy(): number } | undefined)[]
  twoPaths: PathLike[]
  crossing: boolean[]
  nodeState: number[]
  flexibleWhereSpacePermitsEdges: import('../../src/networksimplex/nedge.js').NEdge[]
  prepare(): void
  buildInitialAuxiliaryGraph(): void
  insertNorthSouthAuxiliaryEdges(): void
  insertInLayerEdgeAuxiliaryEdges(): void
  preferStraightEdges(): void
  markEdgeCrossings(): void
  identifyPaths(): PathLike[]
  insertFlexibleWhereSpaceAuxiliaryEdges(): void
}

function setupPlacer(g: LGraph): PlacerInternals {
  const placer = new NetworkSimplexPlacer()
  const any = placer as unknown as PlacerInternals
  any.lGraph = g
  any.spacings = g.getProperty(SPACINGS)!
  any.prepare()
  any.buildInitialAuxiliaryGraph()
  any.insertNorthSouthAuxiliaryEdges()
  any.insertInLayerEdgeAuxiliaryEdges()
  return any
}

/** 在图中按源/目标节点 id 找边. */
function findEdge(g: LGraph, srcId: number, tgtId: number): LEdge {
  for (const l of g.getLayers()) {
    for (const n of l.getNodes()) {
      for (const e of n.getOutgoingEdges()) {
        if (e.getSource()!.getNode()!.id === srcId && e.getTarget()!.getNode()!.id === tgtId) return e
      }
    }
  }
  throw new Error(`edge ${srcId}->${tgtId} not found`)
}

describe('NetworkSimplexPlacer 白盒: 长路径权重提升 + two-paths', () => {
  it('4 层长路径 A→B→C→D 提升权重 (首尾 16, 中间 64); 旁路 two-path A→E→D 不提升', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    g.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, true)
    const l0 = new Layer(g), l1 = new Layer(g), l2 = new Layer(g), l3 = new Layer(g)
    g.getLayers().push(l0, l1, l2, l3)
    const A = addSizedNode(l0), B = addSizedNode(l1), C = addSizedNode(l2), D = addSizedNode(l3), E = addSizedNode(l1)
    addEdgeBetween(addAnchoredPort(A, PortSide.EAST, 5), addAnchoredPort(B, PortSide.WEST, 5))
    addEdgeBetween(addAnchoredPort(B, PortSide.EAST, 5), addAnchoredPort(C, PortSide.WEST, 5))
    addEdgeBetween(addAnchoredPort(C, PortSide.EAST, 5), addAnchoredPort(D, PortSide.WEST, 5))
    addEdgeBetween(addAnchoredPort(A, PortSide.EAST, 15), addAnchoredPort(E, PortSide.WEST, 5))
    addEdgeBetween(addAnchoredPort(E, PortSide.EAST, 5), addAnchoredPort(D, PortSide.WEST, 15))

    const any = setupPlacer(g)
    any.preferStraightEdges()

    const erAB = any.edgeReps[findEdge(g, A.id, B.id).id]!
    const erBC = any.edgeReps[findEdge(g, B.id, C.id).id]!
    const erCD = any.edgeReps[findEdge(g, C.id, D.id).id]!
    const erAE = any.edgeReps[findEdge(g, A.id, E.id).id]!
    const erED = any.edgeReps[findEdge(g, E.id, D.id).id]!
    // 长路径提升: 首段 NORMAL×LONG_EDGE(8)×2=16, 中段 LONG_EDGE×LONG_EDGE(32)×2=64, 末段 16
    expect(erAB.left.weight).toBe(16)
    expect(erBC.left.weight).toBe(64)
    expect(erCD.left.weight).toBe(16)
    // 旁路 two-path 不提升 (保持默认 4)
    expect(erAE.left.weight).toBe(4)
    expect(erED.left.weight).toBe(4)
    // twoPaths 只收集两段旁路 [A→E, E→D]
    expect(any.twoPaths.length).toBe(1)
    const tp = any.twoPaths[0]!
    expect(tp.map(e => `${e.getSource()!.getNode()!.id}->${e.getTarget()!.getNode()!.id}`)).toEqual([`${A.id}->${E.id}`, `${E.id}->${D.id}`])
    expect(tp.isTwoPathCenterNodeFlexible()).toBe(false)
  })

  it('含 LONG_EDGE dummy 的 3 段长路径被跳过 (containsLongEdgeDummy → 不提升权重)', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    g.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, true)
    const l0 = new Layer(g), l1 = new Layer(g), l2 = new Layer(g), l3 = new Layer(g)
    g.getLayers().push(l0, l1, l2, l3)
    // A → dummy → C → D: 3 段路径含 LONG_EDGE dummy → containsLongEdgeDummy true → 跳过
    const A = addSizedNode(l0)
    const dummy = addSizedNode(l1, 10, NodeType.LONG_EDGE)
    const C = addSizedNode(l2)
    const D = addSizedNode(l3)
    const e1 = addEdgeBetween(addAnchoredPort(A, PortSide.EAST, 5), addAnchoredPort(dummy, PortSide.WEST, 5))
    const e2 = addEdgeBetween(addAnchoredPort(dummy, PortSide.EAST, 5), addAnchoredPort(C, PortSide.WEST, 5))
    const e3 = addEdgeBetween(addAnchoredPort(C, PortSide.EAST, 5), addAnchoredPort(D, PortSide.WEST, 5))
    const any = setupPlacer(g)
    any.preferStraightEdges()
    // 跳过 → 权重保持 transformEdge 默认: NORMAL×LONG_EDGE=8, NORMAL×NORMAL=4
    expect(any.edgeReps[e1.id]!.left.weight).toBe(8)
    expect(any.edgeReps[e2.id]!.left.weight).toBe(8)
    expect(any.edgeReps[e3.id]!.left.weight).toBe(4)
    expect(any.twoPaths.length).toBe(0)
  })

  it('菱形 + 交叉: crossing 标记 + two-paths 识别 (A→B→D, A→C→D)', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    g.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, true)
    const l0 = new Layer(g), l1 = new Layer(g), l2 = new Layer(g)
    g.getLayers().push(l0, l1, l2)
    const A = addSizedNode(l0), X = addSizedNode(l0), Y = addSizedNode(l0)
    const B = addSizedNode(l1), C = addSizedNode(l1), P = addSizedNode(l1), Q = addSizedNode(l1)
    const D = addSizedNode(l2)
    const eAB = addEdgeBetween(addAnchoredPort(A, PortSide.EAST, 5), addAnchoredPort(B, PortSide.WEST, 5))
    const eBD = addEdgeBetween(addAnchoredPort(B, PortSide.EAST, 5), addAnchoredPort(D, PortSide.WEST, 5))
    const eAC = addEdgeBetween(addAnchoredPort(A, PortSide.EAST, 15), addAnchoredPort(C, PortSide.WEST, 5))
    const eCD = addEdgeBetween(addAnchoredPort(C, PortSide.EAST, 5), addAnchoredPort(D, PortSide.WEST, 15))
    const eXQ = addEdgeBetween(addAnchoredPort(X, PortSide.EAST, 5), addAnchoredPort(Q, PortSide.WEST, 5))
    const eYP = addEdgeBetween(addAnchoredPort(Y, PortSide.EAST, 5), addAnchoredPort(P, PortSide.WEST, 5))

    const any = setupPlacer(g)
    any.preferStraightEdges()

    // crossing: 菱形两路 (B→D, C→D 同层对) 与 X→Q / Y→P 交叉均标记
    expect(any.crossing[eAB.id]).toBe(false)
    expect(any.crossing[eAC.id]).toBe(false)
    expect(any.crossing[eXQ.id]).toBe(true)
    expect(any.crossing[eYP.id]).toBe(true)
    expect(any.crossing[eBD.id]).toBe(true)
    expect(any.crossing[eCD.id]).toBe(true)

    // two-paths: [A→B, B→D] 与 [A→C, C→D]
    const tpSet = any.twoPaths.map(p => p.map(e => `${e.getSource()!.getNode()!.id}->${e.getTarget()!.getNode()!.id}`).join('|'))
    expect(tpSet).toContain(`${A.id}->${B.id}|${B.id}->${D.id}`)
    expect(tpSet).toContain(`${A.id}->${C.id}|${C.id}->${D.id}`)
  })

  it('markEdgeCrossings: 单层对交叉标记不误伤相邻边', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const l0 = new Layer(g), l1 = new Layer(g)
    g.getLayers().push(l0, l1)
    const X = addSizedNode(l0), Y = addSizedNode(l0)
    const P = addSizedNode(l1), Q = addSizedNode(l1)
    const eXQ = addEdgeBetween(addAnchoredPort(X, PortSide.EAST, 5), addAnchoredPort(Q, PortSide.WEST, 5))
    const eYP = addEdgeBetween(addAnchoredPort(Y, PortSide.EAST, 5), addAnchoredPort(P, PortSide.WEST, 5))
    const eXP = addEdgeBetween(addAnchoredPort(X, PortSide.EAST, 15), addAnchoredPort(P, PortSide.WEST, 5))
    const any = setupPlacer(g)
    any.crossing = new Array(any.edgeReps.length).fill(false)
    any.markEdgeCrossings()
    // ELK 扫描线: 关闭 X→Q 时把其上方的 X→P、Y→P 一并标记为交叉 (确定性 sweep 语义)
    expect(any.crossing[eXQ.id]).toBe(true)
    expect(any.crossing[eYP.id]).toBe(true)
    expect(any.crossing[eXP.id]).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 白盒: 辅助边守卫 + transformEdge 偏移 + WHERE_SPACE 第二遍精确值 + 边界.
// ─────────────────────────────────────────────────────────────────────────────

function countNGraphEdges(any: PlacerInternals): number {
  return any.nGraph.nodes.reduce((s, n) => s + n.getOutgoingEdges().length, 0)
}

describe('NetworkSimplexPlacer 白盒: 辅助边守卫与偏移', () => {
  it('insertNorthSouthAuxiliaryEdges: 有效 SOUTH/NORTH dummy 各 +1 边 (weight 0.1)', () => {
    // SOUTH
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const l0 = new Layer(g)
    g.getLayers().push(l0)
    const n = addSizedNode(l0)
    const southDummy = addSizedNode(l0, 10, NodeType.NORTH_SOUTH_PORT)
    const sp = addAnchoredPort(n, PortSide.SOUTH, 0)
    sp.setProperty(PORT_DUMMY, southDummy)
    const any = setupPlacer(g)
    const before = countNGraphEdges(any)
    any.insertNorthSouthAuxiliaryEdges()
    const after = countNGraphEdges(any)
    expect(after - before).toBe(1)
    // 新增边 weight = SMALL_EDGE_WEIGHT (0.1), delta 0
    const added = any.nGraph.nodes.find(x => x.getOutgoingEdges().some(e => e.weight === 0.1))!
    const e = added.getOutgoingEdges().find(x => x.weight === 0.1)!
    expect(e.delta).toBe(0)

    // NORTH
    const g2 = new LGraph()
    g2.setProperty(SPACINGS, new Spacings(g2))
    const l1 = new Layer(g2)
    g2.getLayers().push(l1)
    const n2 = addSizedNode(l1)
    const northDummy = addSizedNode(l1, 10, NodeType.NORTH_SOUTH_PORT)
    const np = addAnchoredPort(n2, PortSide.NORTH, 0)
    np.setProperty(PORT_DUMMY, northDummy)
    const any2 = setupPlacer(g2)
    const before2 = countNGraphEdges(any2)
    any2.insertNorthSouthAuxiliaryEdges()
    expect(countNGraphEdges(any2) - before2).toBe(1)
  })

  it('insertNorthSouthAuxiliaryEdges: 无 PORT_DUMMY / PORT_DUMMY 指向层外节点 → 不加边', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const l0 = new Layer(g)
    g.getLayers().push(l0)
    const n = addSizedNode(l0)
    addAnchoredPort(n, PortSide.SOUTH, 0) // 无 PORT_DUMMY
    const orphan = new LNode(g) // 不在任何层 → nodeReps 无对应
    const sp2 = addAnchoredPort(n, PortSide.SOUTH, 5)
    sp2.setProperty(PORT_DUMMY, orphan)
    const any = setupPlacer(g)
    const before = countNGraphEdges(any)
    any.insertNorthSouthAuxiliaryEdges()
    expect(countNGraphEdges(any)).toBe(before)
  })

  it('insertInLayerEdgeAuxiliaryEdges: 层内边 +1 辅助边 (weight EDGE_WEIGHT_BASE=4)', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const l0 = new Layer(g)
    g.getLayers().push(l0)
    const a = addSizedNode(l0)
    const d = addSizedNode(l0, 10, NodeType.LONG_EDGE)
    const pa = addAnchoredPort(a, PortSide.EAST, 5)
    const pd = addAnchoredPort(d, PortSide.WEST, 5)
    addEdgeBetween(pd, pa) // 层内边 dummy→a
    const any = setupPlacer(g)
    const before = countNGraphEdges(any)
    any.insertInLayerEdgeAuxiliaryEdges()
    const after = countNGraphEdges(any)
    expect(after - before).toBe(1)
    const added = any.nGraph.nodes.find(x => x.getOutgoingEdges().some(e => e.weight === 4))!
    expect(added.getOutgoingEdges().find(x => x.weight === 4)!.delta).toBe(0)
  })

  it('transformEdge: 非弹性节点端口 position.y 计入偏移 (srcOffset/tgtOffset)', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const l0 = new Layer(g)
    const l1 = new Layer(g)
    g.getLayers().push(l0, l1)
    const a = addSizedNode(l0)
    const b = addSizedNode(l1)
    const pa = addAnchoredPort(a, PortSide.EAST, 5)
    pa.getPosition().y = 10 // 非弹性: srcOffset = anchor.y + position.y = 15
    const pb = addAnchoredPort(b, PortSide.WEST, 5)
    pb.getPosition().y = 3 // tgtOffset = 8
    const e = addEdgeBetween(pa, pb)
    const any = setupPlacer(g)
    const er = any.edgeReps[e.id]!
    // srcOffset=15, tgtOffset=8 → srcDelta = max(0, 8-15)=0, tgtDelta = max(0, 15-8)=7
    expect(er.left.delta).toBe(0)
    expect(er.right.delta).toBe(7)
  })

  it('isFlexibleNode 边界: requiredWest == size.y 时不视为空间不足 (弹性)', () => {
    const g = new LGraph()
    g.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.PORT_POSITION)
    g.setProperty(SPACING_PORT_PORT, 10)
    g.setProperty(SPACING_PORTS_SURROUNDING, { top: 0, left: 0, right: 0, bottom: 0 })
    // 3 个 west 端口: requiredWest = 0+0+(3-1)*10 = 20 == size.y
    const n = new LNode(g)
    n.setType(NodeType.NORMAL)
    n.size = { x: 30, y: 20 }
    for (let i = 0; i < 3; i++) addAnchoredPort(n, PortSide.WEST, 0)
    expect(isFlexibleNode(n)).toBe(true)
    // 4 个 west 端口: requiredWest = 30 > 20 → 非弹性
    const n2 = new LNode(g)
    n2.setType(NodeType.NORMAL)
    n2.size = { x: 30, y: 20 }
    for (let i = 0; i < 4; i++) addAnchoredPort(n2, PortSide.WEST, 0)
    expect(isFlexibleNode(n2)).toBe(false)
  })

  it('WHERE_SPACE 第二遍精确位置: 节点增高到 50, 端口位置应用', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    g.setProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, true)
    const l0 = new Layer(g)
    const l1 = new Layer(g)
    g.getLayers().push(l0, l1)
    const a = addSizedNode(l0, 30)
    a.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NodeFlexibility.NODE_SIZE_WHERE_SPACE_PERMITS)
    const pW1 = addAnchoredPort(a, PortSide.WEST, 5)
    pW1.size = { x: 5, y: 40 }
    const pW2 = addAnchoredPort(a, PortSide.WEST, 5)
    pW2.size = { x: 5, y: 0 }
    const pE = addAnchoredPort(a, PortSide.EAST, 5)
    pE.size = { x: 5, y: 0 }
    const b = addSizedNode(l1, 20)
    const pB = addAnchoredPort(b, PortSide.WEST, 5)
    addEdgeBetween(pE, pB)

    new NetworkSimplexPlacer().process(g)

    expect(a.getPosition().y).toBe(0)
    expect(a.getSize().y).toBe(50)
    expect(b.getPosition().y).toBe(0)
    expect(pW1.getPosition().y).toBe(10)
    expect(pW2.getPosition().y).toBe(0)
    expect(pE.getPosition().y).toBe(0)
  })
})

describe('NetworkSimplexPlacer 白盒: EdgeRep 直/弯判定', () => {
  it('notStraightBy/isStraight: 端点在辅助图同层 → 直; 不同层 → 弯', () => {
    const g = new LGraph()
    g.setProperty(SPACINGS, new Spacings(g))
    const l0 = new Layer(g)
    const l1 = new Layer(g)
    g.getLayers().push(l0, l1)
    const a = addSizedNode(l0)
    const b = addSizedNode(l1)
    const pa = addAnchoredPort(a, PortSide.EAST, 5)
    const pb = addAnchoredPort(b, PortSide.WEST, 5)
    const e = addEdgeBetween(pa, pb)
    const any = setupPlacer(g)
    const er = any.edgeReps[e.id]!
    // left.target=src 端口节点, right.target=tgt 端口节点; 无偏移 → delta 均为 0
    expect(er.left.delta).toBe(0)
    expect(er.right.delta).toBe(0)
    expect(er.notStraightBy()).toBe(er.left.target.layer - er.right.target.layer)
    expect(typeof er.isStraight()).toBe('boolean')
    // 同偏移端口 → 辅助图中 src/tgt 同层 → 直
    expect(er.isStraight()).toBe(true)
  })
})

describe('isFlexibleNode 类型/空间边界 (T4X3 补测)', () => {
  it('LONG_EDGE dummy 多端口: 类型检查优先 → 非弹性', () => {
    const g = new LGraph()
    g.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NODE_SIZE)
    const dummy = new LNode(g)
    dummy.setType(NodeType.LONG_EDGE)
    addAnchoredPort(dummy, PortSide.WEST, 0)
    addAnchoredPort(dummy, PortSide.EAST, 0)
    // 类型非 NORMAL → 即使多端口也非弹性
    expect(isFlexibleNode(dummy)).toBe(false)
  })

  it('NODE_SIZE 多端口且空间充足: 弹性 (跳过 required 检查)', () => {
    const g = new LGraph()
    g.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NODE_SIZE)
    const n = new LNode(g)
    n.setType(NodeType.NORMAL)
    n.size = { x: 30, y: 30 }
    addAnchoredPort(n, PortSide.WEST, 0)
    addAnchoredPort(n, PortSide.EAST, 0)
    expect(isFlexibleNode(n)).toBe(true)
  })
})
