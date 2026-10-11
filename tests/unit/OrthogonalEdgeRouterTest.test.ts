/**
 * OrthogonalEdgeRouter (ELK p5edges.OrthogonalEdgeRouter) 语义单元测试.
 * SSOT: ELK Java 0.12.0 OrthogonalEdgeRouter.java (process: 层间路由宽度 + 节点放置 + 图宽)
 * 与 LGraphUtil.placeNodesHorizontally.
 *
 * 覆盖: placeNodesHorizontally 节点 x 放置、slot 宽度 (slots-1)*edgeEdge + 2*edgeNode、
 * routingWidth < nodeNodeSpacing 时钳制、外部端口层跳过间距、图宽 = max 节点右边界.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType, Layer } from '../../src/index.js'
import { ALIGNMENT } from '../../src/options/layered-options.js'
import { OrthogonalEdgeRouter } from '../../src/p5edges/orthogonal-edge-router.js'
import { RANDOM, EXT_PORT_SIDE } from '../../src/options/internal-properties.js'
import { JavaRandom } from '../../src/util/java-random.js'

const randomStub = new JavaRandom(1)

function layerGraph(): { g: LGraph; l0: Layer; l1: Layer } {
  const g = new LGraph()
  const l0 = new Layer(g)
  const l1 = new Layer(g)
  g.getLayers().push(l0, l1)
  l0.getSize().x = 60
  l1.getSize().x = 60
  g.setProperty(RANDOM, randomStub)
  return { g, l0, l1 }
}

function nodeIn(layer: Layer, y: number): LNode {
  const n = new LNode(layer.getGraph()!)
  n.size = { x: 60, y: 30 }
  n.position = { x: 0, y }
  n.setLayer(layer)
  return n
}

function portAt(n: LNode, side: PortSide, absX: number, absY: number): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  p.setAnchor({ x: 0, y: 0 })
  p.position = { x: absX - n.position.x, y: absY - n.position.y }
  return p
}

function connect(a: LNode, pa: PortSide, ax: number, ay: number, b: LNode, pb: PortSide, bx: number, by: number): LEdge {
  const e = new LEdge()
  e.setSource(portAt(a, pa, ax, ay))
  e.setTarget(portAt(b, pb, bx, by))
  return e
}

describe('OrthogonalEdgeRouter.process (ELK Java 移植)', () => {
  it('无边两层: 节点按 nodeNodeSpacing 放置, 图宽 = 最大节点右边界', () => {
    const { g, l0, l1 } = layerGraph()
    const A = nodeIn(l0, 10), B = nodeIn(l1, 10)
    new OrthogonalEdgeRouter().process(g)
    // li=0: 无左层 → 不加间距; li=1: L0@0, +60; 无 slot → +20 → L1@80
    expect(A.position.x).toBe(0)
    expect(B.position.x).toBe(80)
    expect(g.getSize().x).toBe(140)
  })

  it('斜对角边: slots=1 → 路由宽 = edgeNode*2 (20), 弯点位于路由区', () => {
    const { g, l0, l1 } = layerGraph()
    const A = nodeIn(l0, 10), B = nodeIn(l1, 50)
    const e = connect(A, PortSide.EAST, 60, 10, B, PortSide.WEST, 0, 50)
    new OrthogonalEdgeRouter().process(g)
    // li=1: L0@0 +60 + 20 → L1@80
    expect(A.position.x).toBe(0)
    expect(B.position.x).toBe(80)
    const bps = e.getBendPoints()
    expect(bps.length).toBe(2)
    // startPos = 60 + 10 = 70; segment slot=0 → 弯点 x=70
    expect(bps[0]!.x).toBe(70)
    expect(bps[1]!.x).toBe(70)
  })

  it('routingWidth < nodeNodeSpacing 时钳制为 nodeNodeSpacing', () => {
    const { g, l0, l1 } = layerGraph()
    g.setProperty('org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers', 40)
    const A = nodeIn(l0, 10), B = nodeIn(l1, 50)
    connect(A, PortSide.EAST, 60, 10, B, PortSide.WEST, 0, 50)
    new OrthogonalEdgeRouter().process(g)
    // slots=1 → width=20 < 40 → 钳制 40 → L1@0+60+40=100
    expect(B.position.x).toBe(100)
    expect(g.getSize().x).toBe(160)
  })

  it('WEST/EAST 外部端口层跳过间距', () => {
    const { g, l0, l1 } = layerGraph()
    const ext = nodeIn(l0, 10)
    ext.setType(NodeType.EXTERNAL_PORT)
    ext.setProperty(EXT_PORT_SIDE, PortSide.WEST)
    const B = nodeIn(l1, 10)
    new OrthogonalEdgeRouter().process(g)
    // li=0: L0 为外部层 → 不加间距; li=1: L0@0, 外部 → 不加 → L1@60
    expect(ext.position.x).toBe(0)
    expect(B.position.x).toBe(60)
    expect(g.getSize().x).toBe(120)
  })

  it('2 slots: 路由宽 = (slots-1)*edgeEdge + 2*edgeNode = 30', () => {
    const { g, l0, l1 } = layerGraph()
    l0.getSize().x = 120
    l1.getSize().x = 120
    // ALIGNMENT LEFT → 层内节点 xpos=0, 便于断言层位移
    const A = nodeIn(l0, 10), B = nodeIn(l0, 20)
    const D = nodeIn(l1, 50), E = nodeIn(l1, 60)
    for (const n of [A, B, D, E]) n.setProperty(ALIGNMENT, 'LEFT')
    connect(A, PortSide.EAST, 60, 10, D, PortSide.WEST, 0, 50)
    connect(B, PortSide.EAST, 60, 20, E, PortSide.WEST, 0, 60)
    new OrthogonalEdgeRouter().process(g)
    // li=1: L0@0 +120 + 30 → L1@150
    expect(A.position.x).toBe(0)
    expect(D.position.x).toBe(150)
    expect(g.getSize().x).toBe(270)
  })
})
