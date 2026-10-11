/**
 * SplineEdgeRouter (src/p5edges/splines/spline-edge-router.ts) 单元测试.
 * SSOT: ELK Java 0.12.0 p5edges.splines.SplineEdgeRouter (层间距计算 + 依赖断环 + 拓扑编号).
 * 覆盖: process 层间距 (slotCount/increment/sloppy/外部端口层) / hyperedge 合并 / 依赖建边 +
 * 断环 (正权 3-环) + 拓扑编号 rank / 边链 + spline 段链 (非 normal 后继) / routeSelfLoops
 * (同侧 side + 相邻侧 corner + 相对侧跳过) / 导出判定函数.
 */
import { describe, expect, it } from 'vitest'
import { LGraph } from '../../src/graph/lgraph.js'
import { Layer } from '../../src/graph/layer.js'
import { LNode } from '../../src/graph/lnode.js'
import { LPort } from '../../src/graph/lport.js'
import { LEdge } from '../../src/graph/ledge.js'
import { NodeType, PortSide } from '../../src/graph/enums.js'
import {
  EDGE_ROUTING_SPLINES_MODE,
  EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR,
} from '../../src/options/layered-options.js'
import { EXT_PORT_SIDE, SPLINE_ROUTE_START, SPLINE_EDGE_CHAIN } from '../../src/options/internal-properties.js'
import {
  SplineEdgeRouter, isStraight, isNormalNode, isQualifiedAsStartingNode,
} from '../../src/p5edges/splines/spline-edge-router.js'
import { NubsSelfLoop } from '../../src/p5edges/splines/nubs-self-loop.js'

// ── 建图辅助 ──

function makeGraph(layerCount: number): { graph: LGraph; layers: Layer[] } {
  const graph = new LGraph()
  const layers: Layer[] = []
  for (let i = 0; i < layerCount; i++) {
    const l = new Layer(graph)
    graph.getLayers().push(l)
    layers.push(l)
  }
  return { graph, layers }
}

function addNode(layer: Layer, type: NodeType = NodeType.NORMAL, y = 0, w = 60, h = 30): LNode {
  const n = new LNode(layer.getGraph()!)
  n.setType(type)
  n.size = { x: w, y: h }
  n.position = { x: 0, y }
  n.setLayer(layer)
  return n
}

function addPort(node: LNode, side: PortSide, py: number, w = 8, h = 0): LPort {
  const p = new LPort()
  p.setNode(node)
  p.size = { x: w, y: h }
  p.setSide(side)
  p.position = { x: 0, y: py }
  return p
}

function addEdge(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

describe('SplineEdgeRouter.process 层间距', () => {
  it('空图: size.x = 0', () => {
    const { graph } = makeGraph(0)
    new SplineEdgeRouter().process(graph)
    expect(graph.getSize().x).toBe(0)
  })

  it('单层无边: size.x = 0 (无增量)', () => {
    const { graph, layers } = makeGraph(1)
    addNode(layers[0]!)
    new SplineEdgeRouter().process(graph)
    expect(graph.getSize().x).toBe(0)
  })

  it('两层直线边: 增量 = nodeNodeSpacing (20), 无 slotCount', () => {
    const { graph, layers } = makeGraph(2)
    const a = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    const ae = addPort(a, PortSide.EAST, 10)
    const bw = addPort(b, PortSide.WEST, 10)
    const edge = addEdge(ae, bw)

    new SplineEdgeRouter().process(graph)

    expect(graph.getSize().x).toBe(20)
    // startEdge 链: 单边链 + 单段 spline 链
    const chain = edge.getProperty(SPLINE_EDGE_CHAIN)!
    expect(chain).toHaveLength(1)
    expect(chain[0]).toBe(edge)
    const path = edge.getProperty(SPLINE_ROUTE_START)!
    expect(path).toHaveLength(1)
    expect(path[0]!.initialSegment).toBe(true)
    expect(path[0]!.lastSegment).toBe(true)
    expect(path[0]!.sourcePort).toBe(ae)
    expect(path[0]!.targetPort).toBe(bw)
    expect(path[0]!.sourceNode).toBe(a)
    expect(path[0]!.targetNode).toBe(b)
  })

  it('两条非直线边依赖 (rank 0/1): slotCount=2 → increment=30', () => {
    const { graph, layers } = makeGraph(2)
    // s0: 40→60 [41,59]; s1: 30→50 [31,49] → s1 依赖 s0 (rank 0/1)
    const a = addNode(layers[0]!)
    const c = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    const d = addNode(layers[1]!)
    const ae = addPort(a, PortSide.EAST, 40)
    const ce = addPort(c, PortSide.EAST, 30)
    const bw = addPort(b, PortSide.WEST, 60)
    const dw = addPort(d, PortSide.WEST, 50)
    addEdge(ae, bw)
    addEdge(ce, dw)

    new SplineEdgeRouter().process(graph)

    expect(graph.getSize().x).toBe(30)
    // rank: s0=0, s1=1 → slotCount = max(rank+1) = 2
    const segA = (() => { const e = ae.getOutgoingEdges()[0]!; return e.getProperty(SPLINE_ROUTE_START)![0]! })()
    const segC = (() => { const e = ce.getOutgoingEdges()[0]!; return e.getProperty(SPLINE_ROUTE_START)![0]! })()
    expect(segA.rank).toBe(0)
    expect(segC.rank).toBe(1)
  })

  it('sloppy 间距超过基础 increment 时取大 (factor 放大)', () => {
    const { graph, layers } = makeGraph(2)
    graph.setProperty(EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR, 2)
    // 单条非直线边: 10→50, 垂直差 40 → sloppy = 2*min(1,10/20)*40 = 40 > 基础 20
    const a = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    addEdge(addPort(a, PortSide.EAST, 10), addPort(b, PortSide.WEST, 50))

    new SplineEdgeRouter().process(graph)

    expect(graph.getSize().x).toBe(40)
  })

  it('sloppy 间距小于基础 increment 时取基础值', () => {
    const { graph, layers } = makeGraph(2)
    // 垂直差 10 → sloppy = 0.2*0.5*10 = 1 < 20
    const a = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    addEdge(addPort(a, PortSide.EAST, 10), addPort(b, PortSide.WEST, 20))

    new SplineEdgeRouter().process(graph)

    expect(graph.getSize().x).toBe(20)
  })

  it('CONSERVATIVE 模式: 不走 sloppy 取大', () => {
    const { graph, layers } = makeGraph(2)
    graph.setProperty(EDGE_ROUTING_SPLINES_MODE, 'CONSERVATIVE')
    graph.setProperty(EDGE_ROUTING_SPLINES_SLOPPY_LAYER_SPACING_FACTOR, 2)
    const a = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    addEdge(addPort(a, PortSide.EAST, 10), addPort(b, PortSide.WEST, 50))

    new SplineEdgeRouter().process(graph)

    // 基础 increment = 20, 不取 sloppy
    expect(graph.getSize().x).toBe(20)
  })

  it('首层全外部 W/E 端口: isSpecialLeftLayer 去掉左侧 edgeNodeSpacing', () => {
    const { graph, layers } = makeGraph(2)
    const ext = addNode(layers[0]!, NodeType.EXTERNAL_PORT)
    ext.setProperty(EXT_PORT_SIDE, PortSide.WEST)
    const b = addNode(layers[1]!)
    const ee = addPort(ext, PortSide.EAST, 10)
    const bw = addPort(b, PortSide.WEST, 50)
    addEdge(ee, bw)

    new SplineEdgeRouter().process(graph)

    // slotCount=1, 两层层均在 → increment = edgeNode + 0 + edgeNode = 20 (special 层只影响
    // increment<nodeNodeSpacing 的钳制, 此处 20 不触发钳制)
    expect(graph.getSize().x).toBe(20)
  })
})

describe('SplineEdgeRouter hyperedge 合并', () => {
  it('1:n 同向边合并为单段 (leftPorts 单口, rightPorts 多口)', () => {
    const { graph, layers } = makeGraph(2)
    const a = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    const c = addNode(layers[1]!)
    const ae = addPort(a, PortSide.EAST, 50)
    const e1 = addEdge(ae, addPort(b, PortSide.WEST, 10))
    const e2 = addEdge(ae, addPort(c, PortSide.WEST, 30))

    new SplineEdgeRouter().process(graph)

    const seg1 = e1.getProperty(SPLINE_ROUTE_START)![0]!
    const seg2 = e2.getProperty(SPLINE_ROUTE_START)![0]!
    expect(seg1).toBe(seg2) // 两条边共享同一 hyperedge 段
    expect(seg1.isHyperEdge()).toBe(true)
    expect(seg1.edges).toEqual([e1, e2])
    expect(seg1.leftPorts).toHaveLength(1)
    expect(seg1.rightPorts).toHaveLength(2)
    // sourceY=50 > targetYMax=30 → 第二分支
    expect(seg1.boundingBox.y).toBe(10)
    expect(seg1.boundingBox.height).toBe(40)
    expect(seg1.centerControlPointY).toBeCloseTo(40, 9)
    // 层间距: 单段非直线 → slotCount=1 → 20
    expect(graph.getSize().x).toBe(20)
  })
})

describe('SplineEdgeRouter 依赖断环 + 拓扑编号', () => {
  it('正权 3-环 (1→0→2→1): 断环后 rank 0/1/2, 不卡死', () => {
    const { graph, layers } = makeGraph(2)
    // s0: 0→10; s1: 5→15; s2: 10→5 → 依赖环 1→0, 0→2, 2→1 (全正权)
    const a = addNode(layers[0]!)
    const c = addNode(layers[0]!)
    const e = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    const d = addNode(layers[1]!)
    const f = addNode(layers[1]!)
    const ae = addPort(a, PortSide.EAST, 0)
    const ce = addPort(c, PortSide.EAST, 5)
    const ee = addPort(e, PortSide.EAST, 10)
    const bw = addPort(b, PortSide.WEST, 10)
    const dw = addPort(d, PortSide.WEST, 15)
    const fw = addPort(f, PortSide.WEST, 5)
    addEdge(ae, bw)
    addEdge(ce, dw)
    addEdge(ee, fw)

    new SplineEdgeRouter().process(graph)

    const segOf = (srcPort: LPort): import('../../src/p5edges/splines/spline-segment.js').SplineSegment =>
      srcPort.getOutgoingEdges()[0]!.getProperty(SPLINE_ROUTE_START)![0]!
    const s0 = segOf(ae)
    const s1 = segOf(ce)
    const s2 = segOf(ee)
    // 断环后: s1 rank 0, s0 rank 1, s2 rank 2 (推导见测试注释)
    expect(s1.rank).toBe(0)
    expect(s0.rank).toBe(1)
    expect(s2.rank).toBe(2)
    // slotCount = max(rank+1) = 3 → increment = 10 + 2*10 + 10 = 40
    expect(graph.getSize().x).toBe(40)
  })
})

describe('SplineEdgeRouter 边链 + spline 段链', () => {
  it('LONG_EDGE 后继: getEdgeChain 收集连续边 + getSplinePath 标记首/末段', () => {
    const { graph, layers } = makeGraph(3)
    const a = addNode(layers[0]!)
    const bp = addNode(layers[1]!, NodeType.LONG_EDGE)
    const c = addNode(layers[2]!)
    const ae = addPort(a, PortSide.EAST, 10)
    const bpw = addPort(bp, PortSide.WEST, 10)
    const bpe = addPort(bp, PortSide.EAST, 10)
    const cw = addPort(c, PortSide.WEST, 10)
    const e1 = addEdge(ae, bpw)
    const e2 = addEdge(bpe, cw)

    new SplineEdgeRouter().process(graph)

    // e1 的边链包含 e2 (LONG_EDGE 非 normal 后继)
    const chain = e1.getProperty(SPLINE_EDGE_CHAIN)!
    expect(chain).toEqual([e1, e2])
    const path = e1.getProperty(SPLINE_ROUTE_START)!
    expect(path).toHaveLength(2)
    expect(path[0]!.initialSegment).toBe(true)
    expect(path[0]!.sourceNode).toBe(a)
    expect(path[1]!.lastSegment).toBe(true)
    expect(path[1]!.targetNode).toBe(c)
    expect(path[0]!.sourcePort).toBe(ae)
    expect(path[0]!.targetPort).toBe(bpw)
    expect(path[1]!.sourcePort).toBe(bpe)
    expect(path[1]!.targetPort).toBe(cw)
    // e2 不是起始节点 (LONG_EDGE 不合格) → 无自己的链/路径属性
    expect(e2.getProperty(SPLINE_EDGE_CHAIN)).toBeNull()
    expect(e2.getProperty(SPLINE_ROUTE_START)).toBeNull()
    // 两段直线 → 每层间距 20 → 总宽 40
    expect(graph.getSize().x).toBe(40)
  })
})

describe('SplineEdgeRouter routeSelfLoops', () => {
  it('同侧自环 (EAST→EAST): 与 createSideSelfLoop + 节点偏移一致', () => {
    const { graph, layers } = makeGraph(1)
    const node = addNode(layers[0]!)
    const src = addPort(node, PortSide.EAST, 5, 8, 8)
    const tgt = addPort(node, PortSide.EAST, 20, 8, 8)
    const edge = addEdge(src, tgt)

    new SplineEdgeRouter().process(graph)

    const bends = edge.getBendPoints()
    expect(bends.length).toBe(5)
    const nubs = NubsSelfLoop.createSideSelfLoop(src, tgt, 10)
    const expected = nubs.getBezierCP().map(bp => ({ x: bp.x + node.position.x, y: bp.y + node.position.y }))
    expect(bends).toEqual(expected)
  })

  it('相邻侧自环 (WEST→NORTH): 走 createCornerSelfLoop', () => {
    const { graph, layers } = makeGraph(1)
    const node = addNode(layers[0]!, NodeType.NORMAL, 0, 60, 30)
    const src = addPort(node, PortSide.WEST, 10, 8, 8)
    const tgt = addPort(node, PortSide.NORTH, 5, 8, 8)
    const edge = addEdge(src, tgt)

    new SplineEdgeRouter().process(graph)

    const bends = edge.getBendPoints()
    expect(bends.length).toBe(5)
    const nubs = NubsSelfLoop.createCornerSelfLoop(src, tgt, 10, 10)
    const expected = nubs.getBezierCP().map(bp => ({ x: bp.x + node.position.x, y: bp.y + node.position.y }))
    expect(bends).toEqual(expected)
    // 方向不变量: 首弯点沿 WEST 外扩 (x 小于节点左侧), 末弯点沿 NORTH 外扩 (y 小于节点顶部)
    expect(bends[0]!.x).toBeLessThan(node.position.x)
    expect(bends[4]!.y).toBeLessThan(node.position.y)
  })

  it('相对侧自环 (EAST→WEST): 非相邻 → 跳过, 无弯点', () => {
    const { graph, layers } = makeGraph(1)
    const node = addNode(layers[0]!)
    const src = addPort(node, PortSide.EAST, 5)
    const tgt = addPort(node, PortSide.WEST, 20)
    const edge = addEdge(src, tgt)

    new SplineEdgeRouter().process(graph)

    expect(edge.getBendPoints()).toEqual([])
  })

  it('已预路由自环 (有弯点): 跳过收尾', () => {
    const { graph, layers } = makeGraph(1)
    const node = addNode(layers[0]!)
    const src = addPort(node, PortSide.EAST, 5)
    const tgt = addPort(node, PortSide.EAST, 20)
    const edge = addEdge(src, tgt)
    edge.getBendPoints().push({ x: 1, y: 2 })

    new SplineEdgeRouter().process(graph)

    expect(edge.getBendPoints()).toEqual([{ x: 1, y: 2 }])
  })
})

describe('SplineEdgeRouter 导出判定函数', () => {
  it('isStraight: y 差 < 0.2', () => {
    expect(isStraight(10, 10.1)).toBe(true)
    expect(isStraight(10, 10.3)).toBe(false)
    expect(isStraight(10, 10)).toBe(true)
  })
  it('isNormalNode: NORMAL/BREAKING_POINT true, 其余 false', () => {
    const n = (t: NodeType): LNode => { const x = new LNode(null); x.setType(t); return x }
    expect(isNormalNode(n(NodeType.NORMAL))).toBe(true)
    expect(isNormalNode(n(NodeType.BREAKING_POINT))).toBe(true)
    expect(isNormalNode(n(NodeType.LONG_EDGE))).toBe(false)
    expect(isNormalNode(n(NodeType.EXTERNAL_PORT))).toBe(false)
    expect(isNormalNode(n(NodeType.NORTH_SOUTH_PORT))).toBe(false)
  })
  it('isQualifiedAsStartingNode: NORMAL/NS/EXTERNAL/BREAKING true', () => {
    const n = (t: NodeType): LNode => { const x = new LNode(null); x.setType(t); return x }
    expect(isQualifiedAsStartingNode(n(NodeType.NORMAL))).toBe(true)
    expect(isQualifiedAsStartingNode(n(NodeType.NORTH_SOUTH_PORT))).toBe(true)
    expect(isQualifiedAsStartingNode(n(NodeType.EXTERNAL_PORT))).toBe(true)
    expect(isQualifiedAsStartingNode(n(NodeType.BREAKING_POINT))).toBe(true)
    expect(isQualifiedAsStartingNode(n(NodeType.LONG_EDGE))).toBe(false)
  })
})

describe('SplineEdgeRouter 补充分支', () => {
  it('目标层既非 left 也非 right: 边被丢弃 (同端口出入未支持路径), 无 spline 段', () => {
    const { graph, layers } = makeGraph(3)
    const a = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    const d = addNode(layers[2]!)
    const ae = addPort(a, PortSide.EAST, 10)
    const bw = addPort(b, PortSide.WEST, 10)
    const dw = addPort(d, PortSide.WEST, 10)
    // A→B 正常层间边; A→D 跳过中间层 (pair (L0,L1) 时 target 层 = L2 ∉ {L0,L1})
    const e1 = addEdge(ae, bw)
    const e2 = addEdge(ae, dw)

    new SplineEdgeRouter().process(graph)

    // A→D 被丢弃: 无 spline 路径, 但边链保留
    expect(e2.getProperty(SPLINE_ROUTE_START)).toBeNull()
    expect(e2.getProperty(SPLINE_EDGE_CHAIN)).toEqual([e2])
    // 两对空段层 → 2 × nodeNodeSpacing = 40
    expect(graph.getSize().x).toBe(40)
    expect(e1.getProperty(SPLINE_ROUTE_START)).toHaveLength(1)
  })

  it('isBetween 边界相等 (端口 y == hyperEdge 边界) 计入依赖计数', () => {
    const { graph, layers } = makeGraph(2)
    // s0: 30→50 → [31,49]; s1: 31→60, 源端口 y=31 恰为 s0 上边界 → isBetween 边界分支
    const a = addNode(layers[0]!)
    const c = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    const d = addNode(layers[1]!)
    const ae = addPort(a, PortSide.EAST, 30)
    const ce = addPort(c, PortSide.EAST, 31)
    const bw = addPort(b, PortSide.WEST, 50)
    const dw = addPort(d, PortSide.WEST, 60)
    addEdge(ae, bw)
    addEdge(ce, dw)

    new SplineEdgeRouter().process(graph)

    const segOf = (srcPort: LPort): import('../../src/p5edges/splines/spline-segment.js').SplineSegment =>
      srcPort.getOutgoingEdges()[0]!.getProperty(SPLINE_ROUTE_START)![0]!
    // 计数: s1 左端口 y=31 恰在 s0 上边界 → edge1Counter=-1 < edge0Counter=1 → dep(s1→s0)
    // → s0 rank 1, s1 rank 0 → slotCount 2 → 30
    expect(segOf(ae).rank).toBe(1)
    expect(segOf(ce).rank).toBe(0)
    expect(graph.getSize().x).toBe(30)
  })

  it('右侧同层边 (源/目标均在 rightLayer, sourceSide RIGHT): 无 leftPorts → rightwardTarget 拓扑', () => {
    const { graph, layers } = makeGraph(2)
    const a = addNode(layers[0]!)
    const b = addNode(layers[1]!)
    const c = addNode(layers[1]!)
    const ae = addPort(a, PortSide.EAST, 30)
    const bp = addPort(b, PortSide.WEST, 50)   // A→B 目标
    const bp2 = addPort(b, PortSide.WEST, 35)  // B→C 源 (同层右源)
    const cw = addPort(c, PortSide.WEST, 45)
    const e1 = addEdge(ae, bp)
    const e2 = addEdge(bp2, cw)

    new SplineEdgeRouter().process(graph)

    const segOf = (e: LEdge): import('../../src/p5edges/splines/spline-segment.js').SplineSegment =>
      e.getProperty(SPLINE_ROUTE_START)![0]!
    const s0 = segOf(e1)
    const s1 = segOf(e2)
    // s1 无 leftPorts + 依赖 s0 → rightwardTarget, rank 置为 maxRank
    expect(s1.leftPorts).toHaveLength(0)
    expect(s1.rank).toBe(1)
    expect(s0.rank).toBe(0)
    expect(graph.getSize().x).toBe(30)
  })

  it('自环端口侧 UNDEFINED: routeSelfLoops 跳过, 无弯点', () => {
    const { graph, layers } = makeGraph(1)
    const node = addNode(layers[0]!)
    const src = addPort(node, PortSide.UNDEFINED, 5)
    const tgt = addPort(node, PortSide.UNDEFINED, 20)
    const edge = addEdge(src, tgt)

    new SplineEdgeRouter().process(graph)

    expect(edge.isSelfLoop()).toBe(true)
    expect(edge.getBendPoints()).toEqual([])
  })
})
