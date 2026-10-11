/**
 * HyperEdgeSegment (ELK p5edges.orthogonal.HyperEdgeSegment) 语义单元测试.
 * SSOT: ELK Java 0.12.0 HyperEdgeSegment.java.
 *
 * 重点回归: simulateSplit 必须与 Java 一致 — 第一段保留 incoming (模拟「本段拆分后」),
 * 第二段保留 outgoing (模拟 split partner), extent 各自用保留的连接坐标重算.
 * 之前 TS 移植把 incoming/outgoing 写反并直接拷贝完整 extent, 导致 rateArea
 * (split 选区评级 → 中间 S 弯点位置) 在「多 free area」场景选错.
 */
import { describe, expect, it } from 'vitest'
import { HyperEdgeSegment, sourcePortSide, portPositionOnHyperNode } from '../../src/p5edges/orthogonal/hyper-edge-segment.js'

/** 构造最小 LPort mock: side + 绝对 y (node.y + pos.y + anchor.y). */
function mockPort(side: string, absY: number) {
  const node = { position: { y: 0 } }
  return {
    getSide: () => side,
    getNode: () => node,
    getPosition: () => ({ y: absY }),
    getAnchor: () => ({ y: 0 }),
    getConnectedPorts: () => [],
  } as never
}

/** 用两个端口 (EAST=incoming, WEST=outgoing) 初始化一个 W-E segment. */
function makeSegment(incomingYs: number[], outgoingYs: number[]): HyperEdgeSegment {
  const seg = new HyperEdgeSegment()
  const map = new Map()
  for (const y of incomingYs) seg.addPortPositions(mockPort(sourcePortSide, y), map)
  for (const y of outgoingYs) seg.addPortPositions(mockPort('WEST', y), map)
  return seg
}

describe('HyperEdgeSegment.simulateSplit (ELK Java 移植)', () => {
  it('第一段保留 incoming, 第二段保留 outgoing (回归: 之前写反)', () => {
    const seg = makeSegment([10, 20], [40, 60])
    const [splitSegment, splitPartner] = seg.simulateSplit()

    // ELK HyperEdgeSegment.simulateSplit:
    //   newSplit.incoming ← this.incoming; newSplitPartner.outgoing ← this.outgoing
    expect([...splitSegment.getIncomingConnectionCoordinates()]).toEqual([10, 20])
    expect(splitSegment.getOutgoingConnectionCoordinates()).toEqual([])
    expect([...splitPartner.getIncomingConnectionCoordinates()]).toEqual([])
    expect([...splitPartner.getOutgoingConnectionCoordinates()]).toEqual([40, 60])

    // 原段不受影响 (simulateSplit 不改原段)
    expect([...seg.getIncomingConnectionCoordinates()]).toEqual([10, 20])
    expect([...seg.getOutgoingConnectionCoordinates()]).toEqual([40, 60])
  })

  it('extent 各自用保留的连接坐标重算 (Java recomputeExtent), 非整段拷贝', () => {
    const seg = makeSegment([10, 20], [40, 60])
    const [splitSegment, splitPartner] = seg.simulateSplit()

    // 第一段 extent 只来自 incoming [10,20]; 第二段只来自 outgoing [40,60]
    expect(splitSegment.getStartCoordinate()).toBe(10)
    expect(splitSegment.getEndCoordinate()).toBe(20)
    expect(splitPartner.getStartCoordinate()).toBe(40)
    expect(splitPartner.getEndCoordinate()).toBe(60)
  })

  it('splitAt: 原段保留 incoming + 链接点, partner 接管 outgoing + 链接点 (与 simulateSplit 一致)', () => {
    const seg = makeSegment([10, 20], [40, 60])
    const partner = seg.splitAt(30)

    // 原段: incoming 保留, outgoing = [链接点]
    expect([...seg.getIncomingConnectionCoordinates()]).toEqual([10, 20])
    expect([...seg.getOutgoingConnectionCoordinates()]).toEqual([30])
    // partner: incoming = [链接点], outgoing 接管
    expect([...partner.getIncomingConnectionCoordinates()]).toEqual([30])
    expect([...partner.getOutgoingConnectionCoordinates()]).toEqual([40, 60])
    // 互为 split partner
    expect(seg.getSplitPartner()).toBe(partner)
    expect(partner.getSplitPartner()).toBe(seg)
  })

  it('isDummy: 有 partner 且非 split-by 触发者 (真实 splitter 流程: 先 setSplitBy 再 splitAt)', () => {
    // ELK decideWhichSegmentsToSplit: 先 setSplitBy(segmentCausingSplit), 再 splitAt.
    const seg = makeSegment([10], [40])
    const cause = makeSegment([15], [45])
    seg.setSplitBy(cause)
    const partner = seg.splitAt(25)
    // 触发段 (splitBy 已设) → 非 dummy, 弯点由其生成; partner → dummy, 弯点由 partner 生成
    expect(seg.isDummy()).toBe(false)
    expect(partner.isDummy()).toBe(true)
    // 裸 splitAt (未设 splitBy) → 按公式双方都是 dummy (与 Java isDummy 一致)
    const bare = makeSegment([10], [40])
    const barePartner = bare.splitAt(25)
    expect(bare.isDummy()).toBe(true)
    expect(barePartner.isDummy()).toBe(true)
  })

  it('representsHyperedge: >2 端口为超边', () => {
    const seg = makeSegment([10, 20, 30], [40])
    expect(seg.representsHyperedge()).toBe(true)
    const simple = makeSegment([10], [40])
    expect(simple.representsHyperedge()).toBe(false)
  })
})

describe('HyperEdgeSegment 基础语义 (ELK Java 移植)', () => {
  it('addPortPositions: 坐标排序插入 + 重复值去重', () => {
    const seg = new HyperEdgeSegment()
    const map = new Map()
    seg.addPortPositions(mockPort('EAST', 30), map)
    seg.addPortPositions(mockPort('EAST', 10), map)
    seg.addPortPositions(mockPort('EAST', 10), map) // 重复值不插入
    seg.addPortPositions(mockPort('EAST', 20), map)
    expect([...seg.getIncomingConnectionCoordinates()]).toEqual([10, 20, 30])
  })

  it('addPortPositions: 递归添加连接端口 (hyperedge 分组) + map 登记', () => {
    const seg = new HyperEdgeSegment()
    const map = new Map()
    // EAST 端口连接两个 WEST 端口
    const connected: ReturnType<typeof mockPort>[] = []
    const east = {
      getSide: () => 'EAST',
      getNode: () => ({ position: { y: 0 } }),
      getPosition: () => ({ y: 10 }),
      getAnchor: () => ({ y: 0 }),
      getConnectedPorts: () => connected,
    } as never
    const w1 = mockPort('WEST', 50), w2 = mockPort('WEST', 70)
    connected.push(w1 as never, w2 as never)
    seg.addPortPositions(east, map)
    expect(map.get(east)).toBe(seg)
    expect(map.get(w1)).toBe(seg)
    expect(map.get(w2)).toBe(seg)
    expect([...seg.getIncomingConnectionCoordinates()]).toEqual([10])
    expect([...seg.getOutgoingConnectionCoordinates()]).toEqual([50, 70])
    expect(seg.getPorts()).toHaveLength(3)
    // extent = [min, max]
    expect(seg.getStartCoordinate()).toBe(10)
    expect(seg.getEndCoordinate()).toBe(70)
    expect(seg.getLength()).toBe(60)
  })

  it('getLength/代表超边: 单点段 length 0', () => {
    const seg = makeSegment([10], [10])
    expect(seg.getLength()).toBe(0)
    expect(seg.representsHyperedge()).toBe(false)
  })

  it('portPositionOnHyperNode: node.y + port.y + anchor.y', () => {
    const node = { position: { y: 100 } }
    const port = {
      getNode: () => node,
      getPosition: () => ({ y: 20 }),
      getAnchor: () => ({ y: 5 }),
      getSide: () => 'EAST',
      getConnectedPorts: () => [],
    } as never
    expect(portPositionOnHyperNode(port)).toBe(125)
  })

  it('routingSlot 存取', () => {
    const seg = makeSegment([10], [40])
    expect(seg.getRoutingSlot()).toBe(0)
    seg.setRoutingSlot(3)
    expect(seg.getRoutingSlot()).toBe(3)
  })
})
