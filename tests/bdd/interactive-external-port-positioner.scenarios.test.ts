/**
 * InteractiveExternalPortPositioner 行为 — 直接 vitest BDD.
 * 算法不变量 (与 ELK Java 语义一致):
 *  - 无 EXTERNAL_PORTS 图属性 → 处理器 no-op;
 *  - WEST (FIRST_SEPARATE) dummy 在 NORMAL 节点包围盒 minX 左侧 10, y 对齐连接边对端中心;
 *  - EAST (LAST_SEPARATE) dummy 在 maxX 右侧 10;
 *  - TOP dummy 在 minY 上方 10, x = 目标侧最小左缘 + 10; BOTTOM 在 maxY 下方 10.
 */
import { describe, it, expect } from 'vitest'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { NodeType, PortSide, LayerConstraint, InLayerConstraint } from '../../src/graph/enums.js'
import { GraphProperties, GRAPH_PROPERTIES } from '../../src/options/internal-properties.js'
import { processInteractiveExternalPortPosition } from '../../src/intermediate/interactive-external-port-positioner.js'

interface Dummy {
  node: LNode
  port: LPort
}

/** 建图: 4 个 NORMAL 层外节点 + 4 个外部端口 dummy (WEST/EAST/TOP/BOTTOM). */
function setupGraph(): { graph: LGraph; west: Dummy; east: Dummy; top: Dummy; bottom: Dummy } {
  const graph = new LGraph()
  graph.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)

  // NORMAL 节点: A(100,50) 含 margin 5; B(300,200); C(200,400) 左缘 margin 10; D(400,100).
  const mkNode = (x: number, y: number): LNode => {
    const n = new LNode(graph)
    n.position = { x, y }
    n.size = { x: 60, y: 30 }
    return n
  }
  const a = mkNode(100, 50)
  a.getMargin().left = 5
  a.getMargin().top = 5
  a.getMargin().right = 5
  a.getMargin().bottom = 5
  const b = mkNode(300, 200)
  const c = mkNode(200, 400)
  c.getMargin().left = 10
  const d = mkNode(400, 100)

  // WEST dummy: FIRST_SEPARATE, 边 D1→A (dummy 为源).
  const mkDummy = (lc: LayerConstraint, ilc: InLayerConstraint): Dummy => {
    const node = new LNode(graph)
    node.setType(NodeType.EXTERNAL_PORT)
    node.setLayerConstraint(lc)
    node.setInLayerConstraint(ilc)
    const port = new LPort()
    port.setNode(node)
    port.setSide(PortSide.WEST)
    return { node, port }
  }
  const west = mkDummy(LayerConstraint.FIRST_SEPARATE, InLayerConstraint.NONE)
  const east = mkDummy(LayerConstraint.LAST_SEPARATE, InLayerConstraint.NONE)
  const top = mkDummy(LayerConstraint.NONE, InLayerConstraint.TOP)
  const bottom = mkDummy(LayerConstraint.NONE, InLayerConstraint.BOTTOM)

  const mkPort = (n: LNode, side: PortSide): LPort => {
    const p = new LPort()
    p.setNode(n)
    p.setSide(side)
    return p
  }

  // WEST: D1 → A; EAST: B → D2; TOP: D3 → C; BOTTOM: D → D4.
  const e1 = new LEdge()
  e1.setSource(west.port)
  e1.setTarget(mkPort(a, PortSide.WEST))
  const e2 = new LEdge()
  e2.setSource(mkPort(b, PortSide.EAST))
  e2.setTarget(east.port)
  const e3 = new LEdge()
  e3.setSource(top.port)
  e3.setTarget(mkPort(c, PortSide.WEST))
  const e4 = new LEdge()
  e4.setSource(mkPort(d, PortSide.EAST))
  e4.setTarget(bottom.port)

  return { graph, west, east, top, bottom }
}

describe('InteractiveExternalPortPositioner 行为', () => {
  it('WEST/EAST dummy 分别位于包围盒左右两侧, y 对齐连接边对端中心', () => {
    const { graph, west, east } = setupGraph()
    processInteractiveExternalPortPosition(graph)

    // 包围盒: minX = 100-5 = 95, maxX = 400+60 = 460.
    expect(west.node.position.x).toBe(95 - 10)
    expect(west.node.position.y).toBe(50 + 15) // A 中心
    expect(east.node.position.x).toBe(460 + 10)
    expect(east.node.position.y).toBe(200 + 15) // B 中心
  })

  it('TOP dummy 在 minY 上方 10 且 x 对齐目标侧最小左缘; BOTTOM 在 maxY 下方 10', () => {
    const { graph, top, bottom } = setupGraph()
    processInteractiveExternalPortPosition(graph)

    // minY = 50-5 = 45 (A), maxY = 400+30 = 430 (C).
    expect(top.node.position.y).toBe(45 - 10)
    expect(top.node.position.x).toBe(200 - 10 + 10) // C 左缘 190 + 10
    expect(bottom.node.position.y).toBe(430 + 10)
    expect(bottom.node.position.x).toBe(400 + 60 + 10) // D 右缘 460 + 10
  })

  it('无 EXTERNAL_PORTS 图属性时 no-op, dummy 保持原位', () => {
    const graph = new LGraph()
    const n = new LNode(graph)
    n.position = { x: 100, y: 100 }
    n.size = { x: 60, y: 30 }
    const dummy = new LNode(graph)
    dummy.setType(NodeType.EXTERNAL_PORT)
    dummy.setLayerConstraint(LayerConstraint.FIRST_SEPARATE)
    const dp = new LPort()
    dp.setNode(dummy)
    dp.setSide(PortSide.WEST)
    const ep = new LPort()
    ep.setNode(n)
    ep.setSide(PortSide.WEST)
    const e = new LEdge()
    e.setSource(dp)
    e.setTarget(ep)

    processInteractiveExternalPortPosition(graph)

    expect(dummy.position.x).toBe(0)
    expect(dummy.position.y).toBe(0)
  })
})
