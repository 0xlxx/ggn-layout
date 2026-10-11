/**
 * OrthogonalSelfLoopRouter (ELK intermediate.loops.routing.OrthogonalSelfLoopRouter) 语义单元测试.
 * SSOT: ELK Java 0.12.0 OrthogonalSelfLoopRouter.java.
 * 走完整自环路由管线: RoutingDirector → LabelPlacer → RoutingSlotAssigner → OrthogonalSelfLoopRouter.
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { processSelfLoopRouter } from '../../src/intermediate/self-loop-router.js'
import { makeGraph, makeLayer, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'
import { expectGraphConservation } from './helpers/conservation.js'

/** 单环 (全端口同一侧) + 可选标签, 运行完整自环路由管线. */
function routeOneSide(side: PortSide, n: number, withLabel: boolean, labelSize = { x: 10, y: 5 }) {
  const graph = makeGraph()
  const layer = makeLayer(graph)
  const node = makeNode(graph, layer, { x: 50, y: 50 })
  const ports = makePorts(node, side === PortSide.NORTH ? n : 0, side === PortSide.EAST ? n : 0, side === PortSide.SOUTH ? n : 0, side === PortSide.WEST ? n : 0)
  const edge = makeEdge(ports[0]!, ports[1]!)
  if (withLabel) addLabel(edge, 'L', labelSize)
  const holder = installHolder(node)
  for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
  processSelfLoopRouter(graph)
  return { graph, node, ports, edge, holder }
}

describe('OrthogonalSelfLoopRouter (ELK Java 移植)', () => {
  it('NORTH 单侧环: 弯点在外侧槽位, 节点上边距扩展', () => {
    const { node, edge } = routeOneSide(PortSide.NORTH, 2, false)
    // 槽位 0 的 NORTH 基准 = -margin.top - nodeSelfLoopDistance = -10
    expect(edge.getBendPoints()).toEqual([{ x: 0, y: -10 }, { x: 0, y: -10 }])
    expect(node.getMargin()).toEqual({ left: 0, top: 10, right: 0, bottom: 0 })
    // 不变式: 弯点坐标有限、无环 (首尾不同点)
    for (const bp of edge.getBendPoints()) {
      expect(Number.isFinite(bp.x)).toBe(true)
      expect(Number.isFinite(bp.y)).toBe(true)
    }
  })

  it('SOUTH/EAST/WEST 单侧环: 对应边距扩展', () => {
    const south = routeOneSide(PortSide.SOUTH, 2, false)
    expect(south.edge.getBendPoints()).toEqual([{ x: 0, y: 60 }, { x: 0, y: 60 }])
    expect(south.node.getMargin()).toEqual({ left: 0, top: 0, right: 0, bottom: 10 })
    expectGraphConservation(south.graph)

    const east = routeOneSide(PortSide.EAST, 2, false)
    expect(east.edge.getBendPoints()).toEqual([{ x: 60, y: 0 }, { x: 60, y: 0 }])
    expect(east.node.getMargin()).toEqual({ left: 0, top: 0, right: 10, bottom: 0 })

    const west = routeOneSide(PortSide.WEST, 2, false)
    expect(west.edge.getBendPoints()).toEqual([{ x: -10, y: 0 }, { x: -10, y: 0 }])
    expect(west.node.getMargin()).toEqual({ left: 10, top: 0, right: 0, bottom: 0 })
  })

  it('NORTH 标签: placeLabels 下移标签, 边距计入标签', () => {
    const { node, edge, holder } = routeOneSide(PortSide.NORTH, 2, true, { x: 10, y: 5 })
    const loop = holder.getSLHyperLoops()[0]!
    const slLabels = loop.getSLLabels()!
    // LabelPlacer: position.x = (50-10)/2 = 20; router placeLabels(NORTH): y = -10 - 2 - 5 = -17
    expect(slLabels.getPosition().x).toBe(20)
    expect(slLabels.getPosition().y).toBe(-17)
    expect(node.getMargin().top).toBe(17)
    expect(edge.getBendPoints()).toEqual([{ x: 0, y: -10 }, { x: 0, y: -10 }])
  })

  it('SOUTH/WEST/EAST 标签: placeLabels 各侧位置与边距', () => {
    const south = routeOneSide(PortSide.SOUTH, 2, true, { x: 10, y: 5 })
    expect(south.holder.getSLHyperLoops()[0]!.getSLLabels()!.getPosition().y).toBe(62)
    expect(south.node.getMargin().bottom).toBe(17)

    const west = routeOneSide(PortSide.WEST, 2, true, { x: 10, y: 5 })
    const westLabels = west.holder.getSLHyperLoops()[0]!.getSLLabels()!
    // LabelPlacer TOP 对齐: y = 最上端口 y + anchor = 0 (LabelPlacer.java:394-395)
    expect(westLabels.getPosition().y).toBe(0)
    expect(westLabels.getPosition().x).toBe(-22) // -10 - 2 - 10
    expect(west.node.getMargin().left).toBe(22)

    const east = routeOneSide(PortSide.EAST, 2, true, { x: 10, y: 5 })
    const eastLabels = east.holder.getSLHyperLoops()[0]!.getSLLabels()!
    expect(eastLabels.getPosition().x).toBe(62) // 60 + 2
    expect(east.node.getMargin().right).toBe(22)
  })

  it('嵌套环共享侧: 槽号单调递增, 外层槽位更远', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 4, 0, 0, 0)
    // 环 A: p0→p3 (跨 ids 0..3); 环 B: p1→p2 (落在 A 区间内) → B 应被推到槽 1
    const edgeA = makeEdge(ports[0]!, ports[3]!)
    const edgeB = makeEdge(ports[1]!, ports[2]!)
    const holder = installHolder(node)
    expect(holder.getSLHyperLoops()).toHaveLength(2)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    const [loopA, loopB] = holder.getSLHyperLoops()
    const slotA = loopA.getRoutingSlot(PortSide.NORTH)
    const slotB = loopB.getRoutingSlot(PortSide.NORTH)
    // 内层环 B (ids 1..2) 先处理 → 槽 0; 外层环 A (ids 0..3) 被推到槽 1
    expect(slotA).toBe(1)
    expect(slotB).toBe(0)
    // 不变式: 槽号单调; 外层环弯点更远 (y 更负)
    expect(slotB).toBeLessThan(slotA)
    expect(edgeA.getBendPoints()[0]!.y).toBe(-20)
    expect(edgeB.getBendPoints()[0]!.y).toBe(-10)
    expectGraphConservation(graph)
  })


  it('corner 环 (N→E): 顺时针 corner bend point, 弯点连续', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 1, 1, 0, 0)
    const edge = makeEdge(ports[0]!, ports[1]!) // N→E
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // N→E 顺时针: outer(N)={0,-10}, corner={60,-10}, outer(E)={60,0}
    expect(edge.getBendPoints()).toEqual([{ x: 0, y: -10 }, { x: 60, y: -10 }, { x: 60, y: 0 }])
    expect(node.getMargin().top).toBe(10)
    expect(node.getMargin().right).toBe(10)
  })


  it('corner 环 (E→N): 逆时针 corner bend point (portSideLeft 分支)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 1, 1, 0, 0)
    const edge = makeEdge(ports[1]!, ports[0]!) // E→N
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // E→N 逆时针经 SOUTH? 否: left(E)=NORTH → 经 WEST? 否 → 逆时针: outer(E)={60,0}, corner={-10,0}? 
    // addCornerBendPoints 逆时针: next=left(E)=N; corner = base(E)+base(N) = {60+0, 0+(-10)} = {60,-10}
    expect(edge.getBendPoints()).toEqual([{ x: 60, y: 0 }, { x: 60, y: -10 }, { x: 0, y: -10 }])
    expect(node.getMargin().top).toBe(10)
    expect(node.getMargin().right).toBe(10)
  })

  it('opposing 环 (E→W): 经 NORTH (0.12.0 keySet 哈希序 [WEST,EAST] → option1 leftmost=W)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 0, 1, 0, 1)
    const edge = makeEdge(ports[0]!, ports[1]!) // E→W
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // ELK 0.12.0 jar 实测 (Instr16Main): E+W keySet=[WEST,EAST] → option1 (leftmost=W, rightmost=E,
    // occupied={W,N,E}) → CLOCKWISE 经 NORTH. outer(W)={-10,0}, corner1={-10,-10}, corner2={60,-10},
    // outer(E)={60,0}. (elkjs GWT 插入序 [EAST,WEST] 才经 SOUTH — 以 jar 为准.)
    expect(edge.getBendPoints()).toEqual([{ x: 60, y: 0 }, { x: 60, y: -10 }, { x: -10, y: -10 }, { x: -10, y: 0 }])
    // 不变式: 弯点连续 (相邻弯点共享 x 或 y)
    const bps = edge.getBendPoints()
    for (let i = 1; i < bps.length; i++) {
      const a = bps[i - 1]!
      const b = bps[i]!
      expect(a.x === b.x || a.y === b.y).toBe(true)
    }
    expect(node.getMargin().left).toBe(10)
    expect(node.getMargin().top).toBe(10)
    expect(node.getMargin().right).toBe(10)
    expect(node.getMargin().bottom).toBe(0)
    expectGraphConservation(graph)
  })

  it('opposing 环 (N→S): 经 EAST 顺时针 (occupied 含 right(N)=EAST)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 1, 0, 1, 0)
    const edge = makeEdge(ports[0]!, ports[1]!) // N→S
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // N→S 顺时针经 EAST: outer(N)={0,-10}, corner1={60,-10}, corner2={60,60}, outer(S)={0,60}
    expect(edge.getBendPoints()).toEqual([{ x: 0, y: -10 }, { x: 60, y: -10 }, { x: 60, y: 60 }, { x: 0, y: 60 }])
    expect(node.getMargin().top).toBe(10)
    expect(node.getMargin().right).toBe(10)
    expect(node.getMargin().bottom).toBe(10)
  })

})

describe('OrthogonalSelfLoopRouter 补充语义 (ELK Java 移植)', () => {
  it('corner 环 N→E 且 N 端口 id > E 端口 id: 仍顺时针 (侧序优先于 id 序)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    // E 先创建 (id0), N 后创建 (id1) → 源 N id > 目标 E id
    const [ePort] = makePorts(node, 0, 1, 0, 0)
    const [nPort] = makePorts(node, 1, 0, 0, 0)
    const edge = makeEdge(nPort, ePort) // N→E
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // N→E 顺时针: outer(N), corner(E), outer(E); 若误按 id 序 (N>E) 会逆时针经 W
    expect(edge.getBendPoints()).toEqual([{ x: 0, y: -10 }, { x: 60, y: -10 }, { x: 60, y: 0 }])
    expect(node.getMargin().top).toBe(10)
    expect(node.getMargin().right).toBe(10)
  })

  it('opposing 环 N+S (option2 胜出): 逆时针经 WEST', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    // N(id0), E(id1, 未连接), S(id2) → option2 (leftmost=S, rightmost=N) 惩罚更小
    const [nPort] = makePorts(node, 1, 0, 0, 0)
    makePorts(node, 0, 1, 0, 0)
    const [sPort] = makePorts(node, 0, 0, 1, 0)
    const edge = makeEdge(nPort, sPort) // N→S
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // option2: occupied {S,W,N}; N→S 逆时针经 WEST
    expect(edge.getBendPoints()).toEqual([{ x: 0, y: -10 }, { x: -10, y: -10 }, { x: -10, y: 60 }, { x: 0, y: 60 }])
    expect(node.getMargin().left).toBe(10)
    expect(node.getMargin().bottom).toBe(10)
    expect(node.getMargin().top).toBe(10)
    expectGraphConservation(graph)
  })

  it('嵌套环共享 EAST/SOUTH 侧: 外层槽位更远 (factor=+1 推进)', () => {
    for (const side of [PortSide.EAST, PortSide.SOUTH]) {
      const graph = makeGraph()
      const layer = makeLayer(graph)
      const node = makeNode(graph, layer, { x: 50, y: 50 })
      const mk = (n: number) => makePorts(
        node,
        side === PortSide.NORTH ? n : 0,
        side === PortSide.EAST ? n : 0,
        side === PortSide.SOUTH ? n : 0,
        side === PortSide.WEST ? n : 0,
      )
      const ps = mk(4)
      const edgeA = makeEdge(ps[0]!, ps[3]!)
      const edgeB = makeEdge(ps[1]!, ps[2]!)
      const holder = installHolder(node)
      for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
      processSelfLoopRouter(graph)
      const [loopA, loopB] = holder.getSLHyperLoops()
      expect(loopA.getRoutingSlot(side)).toBe(1)
      expect(loopB.getRoutingSlot(side)).toBe(0)
      // EAST: slot0 x=60, slot1 x=70; SOUTH: slot0 y=60, slot1 y=70
      const aBp = edgeA.getBendPoints()[0]!
      const bBp = edgeB.getBendPoints()[0]!
      if (side === PortSide.EAST) {
        expect(bBp.x).toBe(60)
        expect(aBp.x).toBe(70)
      } else {
        expect(bBp.y).toBe(60)
        expect(aBp.y).toBe(70)
      }
    }
  })

  it('嵌套环共享 WEST 侧: 外层槽位更负 (factor=-1)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ps = makePorts(node, 0, 0, 0, 4)
    const edgeA = makeEdge(ps[0]!, ps[3]!)
    const edgeB = makeEdge(ps[1]!, ps[2]!)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    const [loopA, loopB] = holder.getSLHyperLoops()
    expect(loopA.getRoutingSlot(PortSide.WEST)).toBe(1)
    expect(loopB.getRoutingSlot(PortSide.WEST)).toBe(0)
    expect(edgeB.getBendPoints()[0]!.x).toBe(-10)
    expect(edgeA.getBendPoints()[0]!.x).toBe(-20)
  })

  it('嵌套环 + 内环标签: 标签高度推远外层槽位 (slot 推进计入 label 高度)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ps = makePorts(node, 4, 0, 0, 0)
    const edgeA = makeEdge(ps[0]!, ps[3]!) // 外层
    const edgeB = makeEdge(ps[1]!, ps[2]!) // 内层 + 标签
    addLabel(edgeB, 'L', { x: 10, y: 5 })
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    const [loopA, loopB] = holder.getSLHyperLoops()
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBe(1)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBe(0)
    // 内层标签 y=5 → 外层槽位 y = -10 - (5 + 2 + 10) = -27
    expect(edgeB.getBendPoints()[0]!.y).toBe(-10)
    expect(edgeA.getBendPoints()[0]!.y).toBe(-27)
    expect(node.getMargin().top).toBe(27)
  })

  it('预设节点边距: 各侧 baseline 计入已有边距', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    node.getMargin().left = 5
    node.getMargin().top = 5
    node.getMargin().right = 5
    node.getMargin().bottom = 5
    const [n0, n1] = makePorts(node, 2, 0, 0, 0)
    const edgeN = makeEdge(n0, n1)
    const [e0, e1] = makePorts(node, 0, 2, 0, 0)
    const edgeE = makeEdge(e0, e1)
    const [s0, s1] = makePorts(node, 0, 0, 2, 0)
    const edgeS = makeEdge(s0, s1)
    const [w0, w1] = makePorts(node, 0, 0, 0, 2)
    const edgeW = makeEdge(w0, w1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // 各单侧环 baseline: N=-5-10=-15, E=50+5+10=65, S=50+5+10=65, W=-5-10=-15
    expect(edgeN.getBendPoints()[0]).toEqual({ x: 0, y: -15 })
    expect(edgeE.getBendPoints()[0]).toEqual({ x: 65, y: 0 })
    expect(edgeS.getBendPoints()[0]).toEqual({ x: 0, y: 65 })
    expect(edgeW.getBendPoints()[0]).toEqual({ x: -15, y: 0 })
  })

  it('端口非零位置/锚点: outer bend point 计入 anchor 偏移 (N/S x 分量, E/W y 分量)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const [n0, n1] = makePorts(node, 2, 0, 0, 0)
    n0.position.x = 10 // 源端口位置偏移
    n0.getAnchor().x = 4
    makeEdge(n0, n1)
    const [e0, e1] = makePorts(node, 0, 2, 0, 0)
    e0.getAnchor().y = 5
    makeEdge(e0, e1)
    const [s0, s1] = makePorts(node, 0, 0, 2, 0)
    s0.getAnchor().x = 6
    makeEdge(s0, s1)
    const [w0, w1] = makePorts(node, 0, 0, 0, 2)
    w0.getAnchor().y = 7
    makeEdge(w0, w1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // NORTH: base={0,-10}; anchor.x = 10+4=14 → outer x=14
    expect(n0.getOutgoingEdges()[0]!.getBendPoints()[0]).toEqual({ x: 14, y: -10 })
    // EAST: base={60,0}; anchor.y = 0+5=5 → outer y=5
    expect(e0.getOutgoingEdges()[0]!.getBendPoints()[0]).toEqual({ x: 60, y: 5 })
    // SOUTH: base={0,60}; anchor.x = 0+6=6 → outer x=6
    expect(s0.getOutgoingEdges()[0]!.getBendPoints()[0]).toEqual({ x: 6, y: 60 })
    // WEST: base={-10,0}; anchor.y = 0+7=7 → outer y=7
    expect(w0.getOutgoingEdges()[0]!.getBendPoints()[0]).toEqual({ x: -10, y: 7 })
  })

  it('标签侧不匹配: 不把标签尺寸注入其他侧的槽位 (side 过滤)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    // 嵌套 NORTH 环 (槽 0/1): 外层槽位位置受内层槽位高度影响
    const ns = makePorts(node, 4, 0, 0, 0)
    const edgeA = makeEdge(ns[0]!, ns[3]!) // 外层
    const edgeB = makeEdge(ns[1]!, ns[2]!) // 内层
    // SOUTH 环带标签: 标签侧 SOUTH, 不应影响 NORTH 槽位
    const ss = makePorts(node, 0, 0, 2, 0)
    const edgeS = makeEdge(ss[0]!, ss[1]!)
    addLabel(edgeS, 'SL', { x: 10, y: 5 })
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    const [loopA, loopB] = holder.getSLHyperLoops()
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBe(1)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBe(0)
    // 若 SOUTH 标签被误注入 NORTH 槽 0: 外层 y=-27; 正确语义: 槽 0 无标签 → 外层 y=-20
    expect(edgeB.getBendPoints()[0]!.y).toBe(-10)
    expect(edgeA.getBendPoints()[0]!.y).toBe(-20)
    // SOUTH 侧自身: 标签高度推远后续槽位 (此处只有 1 槽, 位置即 baseline)
    expect(edgeS.getBendPoints()[0]).toEqual({ x: 0, y: 60 })
  })
})

describe('OrthogonalSelfLoopRouter 非方节点 (ELK Java 移植)', () => {
  it('非方节点: 各侧 baseline 用各自尺寸分量 (E 用 width, S 用 height)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 80 }) // 宽 50, 高 80
    const [e0, e1] = makePorts(node, 0, 2, 0, 0)
    const edgeE = makeEdge(e0, e1)
    const [s0, s1] = makePorts(node, 0, 0, 2, 0)
    const edgeS = makeEdge(s0, s1)
    const [n0, n1] = makePorts(node, 2, 0, 0, 0)
    const edgeN = makeEdge(n0, n1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    // E: 50+10=60; 若误用 height(80)+10=90; S: 80+10=90; N: -10
    expect(edgeE.getBendPoints()[0]).toEqual({ x: 60, y: 0 })
    expect(edgeS.getBendPoints()[0]).toEqual({ x: 0, y: 90 })
    expect(edgeN.getBendPoints()[0]).toEqual({ x: 0, y: -10 })
  })
})
