/**
 * HypernodesProcessor 行为 — 直接 vitest BDD.
 * 算法不变量 (与 ELK Java 语义一致):
 *  - 超节点移到出边首个 join point (弯点) 处, 节点中心对准 bendx;
 *  - 被消除的弯点由新建 NORTH/SOUTH 端口替代重接边 (按第二点 y 相对弯点选侧);
 *  - 与弯点碰撞的 junction points 被移除;
 *  - 有 NORTH/SOUTH 边或仅入边 (向左候选) 的超节点不移动 (ELK 左移分支为死代码: bendx 初始
 *    Integer.MAX_VALUE, lastPoint.x > bendx 永不成立).
 */
import { describe, it, expect } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer } from '../../src/index.js'
import { PortSide } from '../../src/graph/enums.js'
import { HYPERNODE, JUNCTION_POINTS } from '../../src/options/layered-options.js'
import { processHypernodes } from '../../src/intermediate/hypernodes-processor.js'

/** 建图: 层 0 [A] → 层 1 [H (hypernode)] → 层 2 [B], H 尺寸 40x20. */
function setupHypergraph(): { graph: LGraph; a: LNode; h: LNode; b: LNode; e2: LEdge } {
  const graph = new LGraph()
  graph.getSize().x = 500
  const layer0 = new Layer(graph)
  const layer1 = new Layer(graph)
  const layer2 = new Layer(graph)
  graph.getLayers().push(layer0, layer1, layer2)

  const a = new LNode(graph)
  a.setLayer(layer0)
  a.position = { x: 0, y: 0 }
  a.size = { x: 60, y: 30 }

  const h = new LNode(graph)
  h.setLayer(layer1)
  h.position = { x: 0, y: 100 }
  h.size = { x: 40, y: 20 }
  h.setProperty(HYPERNODE, true)
  const hWest = new LPort()
  hWest.setNode(h)
  hWest.setSide(PortSide.WEST)
  const hEast = new LPort()
  hEast.setNode(h)
  hEast.setSide(PortSide.EAST)

  const b = new LNode(graph)
  b.setLayer(layer2)
  b.position = { x: 300, y: 200 }
  b.size = { x: 60, y: 30 }

  const aPort = new LPort()
  aPort.setNode(a)
  aPort.setSide(PortSide.EAST)
  const bPort = new LPort()
  bPort.setNode(b)
  bPort.setSide(PortSide.WEST)

  const e1 = new LEdge()
  e1.setSource(aPort)
  e1.setTarget(hWest)
  e1.getBendPoints().push({ x: 100, y: 100 })

  const e2 = new LEdge()
  e2.setSource(hEast)
  e2.setTarget(bPort)
  e2.getBendPoints().push({ x: 140, y: 120 })
  e2.setProperty(JUNCTION_POINTS, [{ x: 140, y: 120 }])
  return { graph, a, h, b, e2 }
}

describe('HypernodesProcessor 行为', () => {
  it('超节点移到出边首弯点处, 弯点由 N/S 端口替代, 边重接且 junction point 被移除', () => {
    const { graph, a, h, e2 } = setupHypergraph()
    const e1 = a.getOutgoingEdges()[0]!
    processHypernodes(graph)

    // 节点中心对准 bendx=140 → x = 140 - 20.
    expect(h.position.x).toBe(120)
    // 出边重接到新建的 SOUTH 端口 (第二点 B 锚点 y=200 >= 弯点 y=120).
    expect(e2.getSource()!.getNode()).toBe(h)
    expect(e2.getSource()!.getSide()).toBe(PortSide.SOUTH)
    expect(e2.getSource()).not.toBe(h.getPorts(PortSide.EAST)[0])
    // 弯点被移除.
    expect(e2.getBendPoints()).toEqual([])
    // junction point 与弯点碰撞 → 移除.
    expect(e2.getProperty(JUNCTION_POINTS) as { x: number; y: number }[] | null).toEqual([])
    // 入边不受影响.
    expect(e1.getSource()!.getNode()).toBe(a)
    expect(e1.getBendPoints()).toEqual([{ x: 100, y: 100 }])
    // 新端口水平居中 (N: y=0, S: y=size.y).
    const north = h.getPorts(PortSide.NORTH)[0]!
    const south = h.getPorts(PortSide.SOUTH)[0]!
    expect(north.position.x).toBe(20)
    expect(south.position.x).toBe(20)
    expect(south.position.y).toBe(20)
  })

  it('有 NORTH 边的超节点不移动, 端口与边保持原样', () => {
    const { graph, h, e2 } = setupHypergraph()
    // 给 H 加 NORTH 端口 (边指向外部上层节点).
    const above = new LNode(graph)
    above.setLayer(graph.getLayers()[0]!)
    above.size = { x: 30, y: 30 }
    const northPort = new LPort()
    northPort.setNode(h)
    northPort.setSide(PortSide.NORTH)
    const abovePort = new LPort()
    abovePort.setNode(above)
    abovePort.setSide(PortSide.SOUTH)
    const eTop = new LEdge()
    eTop.setSource(abovePort)
    eTop.setTarget(northPort)

    processHypernodes(graph)

    expect(h.position.x).toBe(0)
    expect(h.getPorts().length).toBe(3) // WEST/EAST/NORTH, 无新端口
    expect(e2.getSource()!.getSide()).toBe(PortSide.EAST)
    expect(e2.getBendPoints()).toEqual([{ x: 140, y: 120 }])
    expect(eTop.getTarget()!.getSide()).toBe(PortSide.NORTH)
  })

  it('仅入边 (向左候选) 不移动 — 与 ELK 左移死代码分支一致', () => {
    const { graph, h } = setupHypergraph()
    // 去掉 EAST 出边, 只保留 WEST 入边 → 候选方向为左.
    const hEast = h.getPorts(PortSide.EAST)[0]!
    for (const e of hEast.getOutgoingEdges()) e.setSource(null)

    processHypernodes(graph)

    expect(h.position.x).toBe(0)
    expect(h.getPorts().length).toBe(2)
  })

  it('非超节点不受影响', () => {
    const { graph, a, b } = setupHypergraph()
    // H 去掉超节点标记后应完全不动.
    const h = graph.getLayers()[1]!.getNodes()[0]!
    h.setProperty(HYPERNODE, false)
    processHypernodes(graph)

    expect(h.position.x).toBe(0)
    expect(a.position.x).toBe(0)
    expect(b.position.x).toBe(300)
    expect(h.getPorts().length).toBe(2)
  })
})
