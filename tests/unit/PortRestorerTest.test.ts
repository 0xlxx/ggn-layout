/**
 * PortRestorer (ELK intermediate.loops.ordering.PortRestorer) 语义单元测试.
 * SSOT: ELK Java 0.12.0 PortRestorer.java (FIXED_SIDE 语义恢复隐藏自环端口).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, PortSide, NodeType } from '../../src/index.js'
import { PortRestorer } from '../../src/intermediate/loops/ordering/port-restorer.js'
import { PORT_DUMMY, ORIGIN } from '../../src/options/internal-properties.js'
import {
  makeGraph, makeNode, makePorts, makeEdge, installHolder, hideSelfLoopPorts,
} from './helpers/SelfLoopGraphBuilder.js'

function sideOrderIndex(side: PortSide): number {
  switch (side) {
    case PortSide.NORTH: return 0
    case PortSide.EAST: return 1
    case PortSide.SOUTH: return 2
    case PortSide.WEST: return 3
    default: return 4
  }
}

describe('PortRestorer (ELK Java 移植)', () => {
  it('STACKED ONE_SIDE: 恢复端口并按 netFlow 排序入 MIDDLE, 精确顺序', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const [p0, p1] = makePorts(node, 2, 0, 0, 0) // p0→p1 → netFlows [-1, +1]
    makeEdge(p0, p1)
    const northPlain = makePorts(node, 1, 0, 0, 0)[0]!
    const eastPlain = makePorts(node, 0, 1, 0, 0)[0]!
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [p0, p1])
    new PortRestorer().restorePorts(holder)
    expect(node.getPorts().map(p => p)).toEqual([p0, p1, northPlain, eastPlain])
    expect(holder.arePortsHiddenFlag()).toBe(false)
    for (const slPort of holder.getSLPortMap().values()) expect(slPort.isHidden()).toBe(false)
  })

  it('STACKED split index: 正 netFlow 在中间 → 按 split 切分', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // p2→p4, p3→p4, p4→p5 → netFlows [-1,-1,+1,+1] → split=2
    const ports = makePorts(node, 4, 0, 0, 0)
    makeEdge(ports[0]!, ports[2]!)
    makeEdge(ports[1]!, ports[2]!)
    makeEdge(ports[2]!, ports[3]!)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, ports)
    new PortRestorer().restorePorts(holder)
    // 排序 [-1,-1,+1,+1] → split 2 → 前半 [p0,p1] 反转后 PREPEND, 后半 [p2,p3] 反转后 APPEND
    // 注意: installHolder 会把环内端口 id 重置为 1, 必须按对象同一性断言顺序
    expect(node.getPorts().map(p => ports.indexOf(p))).toEqual([1, 0, 3, 2])
  })

  it('STACKED split index: 无正 netFlow → 默认中心切分', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // 2 端口环 p0→p1→p0: netFlows [0,0] → split = floor(2/2) = 1
    const [p0, p1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(p0, p1)
    makeEdge(p1, p0)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [p0, p1])
    new PortRestorer().restorePorts(holder)
    expect(node.getPorts().map(p => p)).toEqual([p0, p1])
  })

  it('SEQUENCED: 单侧环按 netFlow 顺序整体 APPEND', () => {
    const graph = makeGraph({ ordering: 'SEQUENCED' })
    const node = makeNode(graph)
    const [p0, p1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(p0, p1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [p0, p1])
    new PortRestorer().restorePorts(holder)
    expect(node.getPorts().map(p => [p0, p1].indexOf(p))).toEqual([1, 0])
  })

  it('REVERSE_STACKED: 单侧环反转处理顺序', () => {
    const graph = makeGraph({ ordering: 'REVERSE_STACKED' })
    const node = makeNode(graph)
    const [p0, p1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(p0, p1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [p0, p1])
    new PortRestorer().restorePorts(holder)
    expect(node.getPorts().map(p => p)).toEqual([p0, p1])
  })

  it('非法 ordering → throw', () => {
    const graph = makeGraph({ ordering: 'BOGUS' as never })
    const node = makeNode(graph)
    const [p0, p1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(p0, p1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [p0, p1])
    expect(() => new PortRestorer().restorePorts(holder)).toThrow('Unexpected ordering')
  })

  it('全类型环恢复: 端口按侧分组 N,E,S,W, 无悬挂/无丢失', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // L1: TWO_SIDES_CORNER N+E
    const cN = makePorts(node, 1, 0, 0, 0)[0]!
    const cE = makePorts(node, 0, 1, 0, 0)[0]!
    makeEdge(cN, cE)
    // L2: TWO_SIDES_OPPOSING N+S
    const oN = makePorts(node, 1, 0, 0, 0)[0]!
    const oS = makePorts(node, 0, 0, 1, 0)[0]!
    makeEdge(oN, oS)
    // L3: THREE_SIDES N,E,S (缺 W)
    const tN = makePorts(node, 1, 0, 0, 0)[0]!
    const tE = makePorts(node, 0, 1, 0, 0)[0]!
    const tS = makePorts(node, 0, 0, 1, 0)[0]!
    makeEdge(tN, tE)
    makeEdge(tE, tS)
    // L4: FOUR_SIDES
    const fN = makePorts(node, 1, 0, 0, 0)[0]!
    const fE = makePorts(node, 0, 1, 0, 0)[0]!
    const fS = makePorts(node, 0, 0, 1, 0)[0]!
    const fW = makePorts(node, 0, 0, 0, 1)[0]!
    makeEdge(fN, fE)
    makeEdge(fE, fS)
    makeEdge(fS, fW)
    makeEdge(fW, fN)
    // L5: THREE_SIDES E,S,W (缺 N)
    const wE = makePorts(node, 0, 1, 0, 0)[0]!
    const wS = makePorts(node, 0, 0, 1, 0)[0]!
    const wW = makePorts(node, 0, 0, 0, 1)[0]!
    makeEdge(wE, wS)
    makeEdge(wS, wW)
    // L6: THREE_SIDES S,W,N (缺 E)
    const sS = makePorts(node, 0, 0, 1, 0)[0]!
    const sW = makePorts(node, 0, 0, 0, 1)[0]!
    const sN = makePorts(node, 1, 0, 0, 0)[0]!
    makeEdge(sS, sW)
    makeEdge(sW, sN)
    // L7: THREE_SIDES W,N,E (缺 S)
    const nW = makePorts(node, 0, 0, 0, 1)[0]!
    const nN = makePorts(node, 1, 0, 0, 0)[0]!
    const nE = makePorts(node, 0, 1, 0, 0)[0]!
    makeEdge(nW, nN)
    makeEdge(nN, nE)
    // L8: TWO_SIDES_CORNER N+W
    const cwN = makePorts(node, 1, 0, 0, 0)[0]!
    const cwW = makePorts(node, 0, 0, 0, 1)[0]!
    makeEdge(cwN, cwW)

    const allSL = [cN, cE, oN, oS, tN, tE, tS, fN, fE, fS, fW, wE, wS, wW, sS, sW, sN, nW, nN, nE, cwN, cwW]
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, allSL)

    new PortRestorer().restorePorts(holder)

    const finalPorts = node.getPorts()
    expect(finalPorts.length).toBe(allSL.length)
    // 无悬挂: 全部端口已恢复且 hidden 清除
    for (const p of allSL) expect(finalPorts).toContain(p)
    for (const slPort of holder.getSLPortMap().values()) expect(slPort.isHidden()).toBe(false)
    // 分组不变式: 侧序非降 (N < E < S < W)
    const sideSeq = finalPorts.map(p => sideOrderIndex(p.getSide()))
    for (let i = 1; i < sideSeq.length; i++) {
      expect(sideSeq[i]!).toBeGreaterThanOrEqual(sideSeq[i - 1]!)
    }
    // N+W corner: W 侧端口在 W 组, N 侧端口在 N 组 (跨角拆分)
    expect(cwW.getIndex()).toBeGreaterThanOrEqual(0)
    expect(cwN.getIndex()).toBeLessThan(cwW.getIndex())
  })

  it('NS 端口: 带 WEST/EAST 连接的 N/S 端口被提到组首 (加 bendPoint 语义)', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const other = makeNode(graph)
    // SL 单侧环 (使 holder 有效); 端口顺序 = ELK 前置语义: NS 端口在各自侧组首
    const [s0, s1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(s0, s1)
    const northNS = makePorts(node, 1, 0, 0, 0)[0]!
    addNSDummyConnection(graph, node, northNS, PortSide.WEST, other)
    const northPlain = makePorts(node, 1, 0, 0, 0)[0]!
    const northNoConn = makePorts(node, 1, 0, 0, 0)[0]!
    const dummyNoConn = new LNode(graph)
    const dpNoConn = new LPort(); dpNoConn.setSide(PortSide.WEST); dpNoConn.setNode(dummyNoConn)
    dpNoConn.setProperty(ORIGIN, northNoConn)
    northNoConn.setProperty(PORT_DUMMY, dummyNoConn)
    const eastPlain = makePorts(node, 0, 1, 0, 0)[0]!
    const southNS = makePorts(node, 0, 0, 1, 0)[0]!
    addNSDummyConnection(graph, node, southNS, PortSide.EAST, other)
    const southPlain = makePorts(node, 0, 0, 1, 0)[0]!
    const westPlain = makePorts(node, 0, 0, 0, 1)[0]!

    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [s0, s1])
    new PortRestorer().restorePorts(holder)

    const finalPorts = node.getPorts()
    // northNS 提到 N 组首 (位于 s0/s1 MIDDLE 之前), southNS 提到 S 组首
    expect(finalPorts.indexOf(northNS)).toBe(0)
    expect(finalPorts.indexOf(northNS)).toBeLessThan(finalPorts.indexOf(s0))
    expect(finalPorts.indexOf(southNS)).toBeLessThan(finalPorts.indexOf(southPlain))
    // northNoConn 无连接 → 留在普通 N 组 (紧随 northPlain)
    expect(finalPorts.indexOf(northNoConn)).toBeGreaterThan(finalPorts.indexOf(northPlain))
    // 精确顺序: [northNS, s0, s1, northPlain, northNoConn, eastPlain, southNS, southPlain, westPlain]
    // (s0/s1 为环内端口, id 被 installHolder 重置, 用对象同一性断言)
    const identity = (p: LPort) => finalPorts.indexOf(p)
    expect([identity(northNS), identity(s0), identity(s1), identity(northPlain), identity(northNoConn),
      identity(eastPlain), identity(southNS), identity(southPlain), identity(westPlain)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    // 侧序不变式
    const sideSeq = finalPorts.map(p => sideOrderIndex(p.getSide()))
    for (let i = 1; i < sideSeq.length; i++) expect(sideSeq[i]!).toBeGreaterThanOrEqual(sideSeq[i - 1]!)
  })


  it('sortedTwoSideLoopPortSides: N+W 交换为 W,N; UNDEFINED 侧走 default', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const [n, w] = makePorts(node, 1, 0, 0, 1)
    makeEdge(n, w)
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    loop.computePortsPerSide()
    expect(PortRestorer.sortedTwoSideLoopPortSides(loop)).toEqual([PortSide.WEST, PortSide.NORTH])

    // 手工塞入 UNDEFINED + NORTH 键 → sort 比较器触发 sideOrder default = 4
    const port = loop.getSLPorts()[0]!
    ;(loop as any).slPortsBySide = new Map([[PortSide.UNDEFINED, [port]], [PortSide.NORTH, [port]]])
    expect(PortRestorer.sortedTwoSideLoopPortSides(loop)).toEqual([PortSide.NORTH, PortSide.UNDEFINED])
  })

})

/** 给 NS 端口挂一个 PORT_DUMMY: dummy 的端口 (指定连接侧) ORIGIN=nsPort 且有连接边. */
function addNSDummyConnection(graph: LGraph, _node: LNode, nsPort: LPort, connectionSide: PortSide, other: LNode): void {
  const dummy = new LNode(graph)
  dummy.setType(NodeType.NORTH_SOUTH_PORT)
  const dummyPort = new LPort()
  dummyPort.setSide(connectionSide)
  dummyPort.setNode(dummy)
  dummyPort.setProperty(ORIGIN, nsPort)
  const peer = new LPort()
  peer.setNode(other)
  peer.setSide(connectionSide === PortSide.WEST ? PortSide.EAST : PortSide.WEST)
  makeEdge(peer, dummyPort)
  nsPort.setProperty(PORT_DUMMY, dummy)
}

describe('PortRestorer 多环顺序与 split 边界 (ELK Java 移植)', () => {
  /** 两个独立 ONE_SIDE 环 (北侧), 返回端口数组 [环1, 环2]. */
  function buildTwoOneSideLoops(ordering: string) {
    const graph = makeGraph({ ordering })
    const node = makeNode(graph)
    const [a0, a1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(a0, a1)
    const [b0, b1] = makePorts(node, 2, 0, 0, 0)
    makeEdge(b0, b1)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [a0, a1, b0, b1])
    new PortRestorer().restorePorts(holder)
    return { node, a0, a1, b0, b1 }
  }

  it('REVERSE_STACKED: 多个单侧环按逆序处理 (后建环先恢复)', () => {
    const { node, a0, a1, b0, b1 } = buildTwoOneSideLoops('REVERSE_STACKED')
    // 处理顺序 [b,a]: b 环 [b0,b1] 先入; a 环 前半 PREPEND → [a0,b0,b1], 后半 APPEND → [a0,b0,b1,a1]
    expect(node.getPorts().map(p => [a0, a1, b0, b1].indexOf(p))).toEqual([0, 2, 3, 1])
  })

  it('STACKED: 多个单侧环保持创建顺序', () => {
    const { node, a0, a1, b0, b1 } = buildTwoOneSideLoops('STACKED')
    // 处理顺序 [a,b]: a 先入 → [a0,a1]; b 后入 → 前半 PREPEND → [b0,a0,a1], 后半 APPEND → [b0,a0,a1,b1]
    expect(node.getPorts().map(p => [a0, a1, b0, b1].indexOf(p))).toEqual([2, 0, 1, 3])
  })

  it('SEQUENCED: 多个单侧环按创建顺序整体 APPEND', () => {
    const { node, a0, a1, b0, b1 } = buildTwoOneSideLoops('SEQUENCED')
    // a 环 [a1,a0] 先 APPEND; b 环 [b1,b0] 后 APPEND → [a1,a0,b1,b0]
    expect(node.getPorts().map(p => [a0, a1, b0, b1].indexOf(p))).toEqual([1, 0, 3, 2])
  })

  it('STACKED split 边界: 正 netFlow 位于倒数第二 (split=len-2 ≠ floor(len/2))', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // p0..p3 → p4, p4 → p5: netFlows [-1,-1,-1,-1,+1,+3] → 排序后首个正数在 index 4 → split=4
    const ports = makePorts(node, 6, 0, 0, 0)
    makeEdge(ports[0]!, ports[4]!)
    makeEdge(ports[1]!, ports[4]!)
    makeEdge(ports[2]!, ports[4]!)
    makeEdge(ports[3]!, ports[4]!)
    makeEdge(ports[4]!, ports[5]!)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, ports)
    new PortRestorer().restorePorts(holder)
    // sorted [p0,p1,p2,p3,p5,p4] split=4: 前半 [p0..p3] 反转 PREPEND, 后半 [p5,p4] 反转 APPEND
    // → [p3,p2,p1,p0,p4,p5]; 若误用 floor(6/2)=3 → [p2,p1,p0,p4,p5,p3]
    expect(node.getPorts().map(p => ports.indexOf(p))).toEqual([3, 2, 1, 0, 4, 5])
  })
})

describe('PortRestorer 三侧环与混合可见端口 (ELK Java 移植)', () => {
  it('三侧环 E+S+W (缺 NORTH): E→END, S→MIDDLE, W→START, 无悬挂', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // 单侧 E 环 + 三侧 E+S+W 环
    const e0 = makePorts(node, 0, 2, 0, 0)
    makeEdge(e0[0]!, e0[1]!)
    const [e2] = makePorts(node, 0, 1, 0, 0)
    const [s0] = makePorts(node, 0, 0, 1, 0)
    const [w0] = makePorts(node, 0, 0, 0, 1)
    makeEdge(e2, s0)
    makeEdge(s0, w0)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [e0[0]!, e0[1]!, e2, s0, w0])
    new PortRestorer().restorePorts(holder)
    // 顺序: E-MIDDLE [e0,e1] → E-END [e2] → S-MIDDLE [s0] → W-START [w0]
    expect(node.getPorts().map(p => [e0[0]!, e0[1]!, e2, s0, w0].indexOf(p))).toEqual([0, 1, 2, 3, 4])
    expect(holder.arePortsHiddenFlag()).toBe(false)
  })

  it('混合可见/隐藏的单侧环: 可见端口留在原位, 不被拉入恢复区', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    const other = makeNode(graph)
    // p0 可见 (带外部边), p1/p2 隐藏
    const [p0, p1, p2] = makePorts(node, 3, 0, 0, 0)
    makeEdge(p0, p1)
    makeEdge(p1, p2)
    const o1 = makePorts(other, 0, 0, 0, 1)[0]!
    makeEdge(p0, o1) // 外部边 → p0 不隐藏
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    hideSelfLoopPorts(holder, [p1, p2])
    new PortRestorer().restorePorts(holder)
    // 隐藏端口恢复到 MIDDLE (反转后 p2,p1 在 p0 之前), p0 恰好出现一次
    expect(node.getPorts().filter(p => p === p0)).toHaveLength(1)
    expect(node.getPorts().indexOf(p0)).toBe(2)
    expect(node.getPorts().map(p => [p0, p1, p2].indexOf(p))).toEqual([2, 1, 0])
  })
})
