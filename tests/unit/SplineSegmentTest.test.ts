/**
 * SplineSegment (src/p5edges/splines/spline-segment.ts) 单元测试.
 * SSOT: ELK Java 0.12.0 p5edges.splines.SplineSegment.
 * 覆盖: 单边段构造 (端口侧归类/isStraight/锚点 y) / hyperedge 段构造 (yMin/yMax 区间与
 * centerControlPointY/hyperEdgeTopYPos/hyperEdgeBottomYPos 公式) / addEdge 边信息
 * (invertedLeft/invertedRight/normal 节点) / SplineDependency 接线 / isNormalNode.
 */
import { describe, expect, it } from 'vitest'
import { LNode } from '../../src/graph/lnode.js'
import { LPort } from '../../src/graph/lport.js'
import { LEdge } from '../../src/graph/ledge.js'
import { NodeType, PortSide } from '../../src/graph/enums.js'
import { SplineSegment, SplineDependency, isNormalNode } from '../../src/p5edges/splines/spline-segment.js'

function mkNode(type: NodeType = NodeType.NORMAL, x = 0, y = 0): LNode {
  const n = new LNode(null)
  n.setType(type)
  n.position = { x, y }
  return n
}

function mkPort(node: LNode, side: PortSide, px: number, py: number, w = 8, h = 0): LPort {
  const p = new LPort()
  p.setNode(node)
  p.size = { x: w, y: h }
  p.setSide(side)
  p.position = { x: px, y: py }
  return p
}

function mkEdge(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

const notStraight = (a: number, b: number): boolean => Math.abs(a - b) < 0.2

describe('SplineDependency', () => {
  it('构造时接线 source.outgoing + target.incoming', () => {
    const na = mkNode(NodeType.NORMAL, 0, 0)
    const nb = mkNode(NodeType.NORMAL, 0, 0)
    const s1 = SplineSegment.fromSingleEdge(mkEdge(mkPort(na, PortSide.EAST, 0, 10), mkPort(nb, PortSide.WEST, 0, 50)), 'LEFT', 'RIGHT', notStraight)
    const s2 = SplineSegment.fromSingleEdge(mkEdge(mkPort(na, PortSide.EAST, 0, 30), mkPort(nb, PortSide.WEST, 0, 70)), 'LEFT', 'RIGHT', notStraight)
    const dep = new SplineDependency(s1, s2, 3)
    expect(dep.source).toBe(s1)
    expect(dep.target).toBe(s2)
    expect(dep.weight).toBe(3)
    expect(s1.outgoing).toContain(dep)
    expect(s2.incoming).toContain(dep)
  })
})

describe('SplineSegment.fromSingleEdge', () => {
  it('端口侧归类 + 非直线 + 位置公式 (source 在 target 上方)', () => {
    const na = mkNode(NodeType.NORMAL, 0, 0)
    const nb = mkNode(NodeType.NORMAL, 0, 0)
    const src = mkPort(na, PortSide.EAST, 0, 10)   // abs y = 10
    const tgt = mkPort(nb, PortSide.WEST, 0, 50)   // abs y = 50
    const seg = SplineSegment.fromSingleEdge(mkEdge(src, tgt), 'LEFT', 'RIGHT', notStraight)

    expect(seg.leftPorts).toEqual([src])
    expect(seg.rightPorts).toEqual([tgt])
    expect(seg.isHyperEdge()).toBe(false)
    expect(seg.isStraight).toBe(false)
    // sourceY=10 < targetYMin=50 → 第一分支
    expect(seg.boundingBox.y).toBe(10)
    expect(seg.boundingBox.height).toBe(40)
    expect(seg.centerControlPointY).toBeCloseTo(30, 9)
    expect(seg.hyperEdgeTopYPos).toBeCloseTo(12, 9)      // 0.1*30 + 0.9*10
    expect(seg.hyperEdgeBottomYPos).toBeCloseTo(48, 9)   // 0.1*30 + 0.9*50
    // edgeInformation
    const info = seg.edgeInformation.get(seg.edges[0]!)!
    expect(info.startY).toBe(10)
    expect(info.endY).toBe(50)
    expect(info.normalSourceNode).toBe(true)
    expect(info.normalTargetNode).toBe(true)
    expect(info.invertedLeft).toBe(false)
    expect(info.invertedRight).toBe(false)
  })

  it('source 在 target 下方 → 第二分支公式', () => {
    const na = mkNode(NodeType.NORMAL, 0, 0)
    const nb = mkNode(NodeType.NORMAL, 0, 0)
    const src = mkPort(na, PortSide.EAST, 0, 90)   // abs y = 90
    const tgt = mkPort(nb, PortSide.WEST, 0, 30)   // abs y = 30
    const seg = SplineSegment.fromSingleEdge(mkEdge(src, tgt), 'LEFT', 'RIGHT', notStraight)
    expect(seg.boundingBox.y).toBe(30)
    expect(seg.boundingBox.height).toBe(60)
    expect(seg.centerControlPointY).toBeCloseTo(60, 9)   // 0.5*(90+30)
    expect(seg.hyperEdgeTopYPos).toBeCloseTo(33, 9)      // 0.1*60 + 0.9*30
    expect(seg.hyperEdgeBottomYPos).toBeCloseTo(87, 9)   // 0.1*60 + 0.9*90
  })

  it('isStraight: y 差 < 0.2 → true; 否则 false', () => {
    const na = mkNode(NodeType.NORMAL, 0, 0)
    const nb = mkNode(NodeType.NORMAL, 0, 0)
    const straight = SplineSegment.fromSingleEdge(
      mkEdge(mkPort(na, PortSide.EAST, 0, 10), mkPort(nb, PortSide.WEST, 0, 10.1)), 'LEFT', 'RIGHT', notStraight)
    expect(straight.isStraight).toBe(true)
    const not = SplineSegment.fromSingleEdge(
      mkEdge(mkPort(na, PortSide.EAST, 0, 10), mkPort(nb, PortSide.WEST, 0, 10.5)), 'LEFT', 'RIGHT', notStraight)
    expect(not.isStraight).toBe(false)
  })

  it('invertedLeft/invertedRight: WEST 源 / EAST 目标', () => {
    const na = mkNode(NodeType.NORMAL, 0, 0)
    const nb = mkNode(NodeType.NORMAL, 0, 0)
    const src = mkPort(na, PortSide.WEST, 0, 10)
    const tgt = mkPort(nb, PortSide.EAST, 0, 20)
    // sourceSide RIGHT, targetSide LEFT → 端口侧互换
    const seg = SplineSegment.fromSingleEdge(mkEdge(src, tgt), 'RIGHT', 'LEFT', notStraight)
    expect(seg.rightPorts).toEqual([src])
    expect(seg.leftPorts).toEqual([tgt])
    const info = seg.edgeInformation.get(seg.edges[0]!)!
    expect(info.invertedLeft).toBe(true)
    expect(info.invertedRight).toBe(true)
  })

  it('normal 节点标记: BREAKING_POINT 算 normal, EXTERNAL_PORT 不算', () => {
    const na = mkNode(NodeType.BREAKING_POINT, 0, 0)
    const nb = mkNode(NodeType.EXTERNAL_PORT, 0, 0)
    const seg = SplineSegment.fromSingleEdge(
      mkEdge(mkPort(na, PortSide.EAST, 0, 10), mkPort(nb, PortSide.WEST, 0, 20)), 'LEFT', 'RIGHT', notStraight)
    const info = seg.edgeInformation.get(seg.edges[0]!)!
    expect(info.normalSourceNode).toBe(true)
    expect(info.normalTargetNode).toBe(false)
  })
})

describe('SplineSegment.fromHyperEdge', () => {
  it('1:n 段: yMin/yMax 区间 + 第二分支公式 (source 在区间内)', () => {
    const single = mkNode(NodeType.NORMAL, 0, 0)
    const t1 = mkNode(NodeType.NORMAL, 0, 0)
    const t2 = mkNode(NodeType.NORMAL, 0, 0)
    const singlePort = mkPort(single, PortSide.EAST, 0, 50)   // abs y=50
    const e1 = mkEdge(singlePort, mkPort(t1, PortSide.WEST, 0, 10))  // abs y=10
    const e2 = mkEdge(singlePort, mkPort(t2, PortSide.WEST, 0, 90))  // abs y=90
    const seg = SplineSegment.fromHyperEdge(singlePort, [
      { side: 'RIGHT', edge: e1 },
      { side: 'RIGHT', edge: e2 },
    ], 'LEFT')

    expect(seg.leftPorts).toEqual([singlePort])
    expect(seg.rightPorts).toHaveLength(2)
    expect(seg.isHyperEdge()).toBe(true)
    expect(seg.edges).toEqual([e1, e2])
    // sourceY=50 > targetYMin=10 → 第二分支 (source 在区间内)
    expect(seg.boundingBox.y).toBe(10)
    expect(seg.boundingBox.height).toBe(80)
    expect(seg.centerControlPointY).toBeCloseTo(70, 9)   // 0.5*(50+90)
    expect(seg.hyperEdgeTopYPos).toBeCloseTo(88, 9)      // 0.1*70 + 0.9*90
    expect(seg.hyperEdgeBottomYPos).toBeCloseTo(52, 9)   // 0.1*70 + 0.9*50
    // 两条边都有 edgeInformation
    expect(seg.edgeInformation.size).toBe(2)
    for (const e of [e1, e2]) expect(seg.edgeInformation.has(e)).toBe(true)
  })

  it('1:n 段: source 低于所有 target → 第一分支公式', () => {
    const single = mkNode(NodeType.NORMAL, 0, 0)
    const t1 = mkNode(NodeType.NORMAL, 0, 0)
    const t2 = mkNode(NodeType.NORMAL, 0, 0)
    const singlePort = mkPort(single, PortSide.EAST, 0, 5)    // abs y=5
    const e1 = mkEdge(singlePort, mkPort(t1, PortSide.WEST, 0, 50))
    const e2 = mkEdge(singlePort, mkPort(t2, PortSide.WEST, 0, 90))
    const seg = SplineSegment.fromHyperEdge(singlePort, [
      { side: 'RIGHT', edge: e1 },
      { side: 'RIGHT', edge: e2 },
    ], 'LEFT')
    expect(seg.boundingBox.y).toBe(5)
    expect(seg.boundingBox.height).toBe(85)
    expect(seg.centerControlPointY).toBeCloseTo(27.5, 9)
    expect(seg.hyperEdgeTopYPos).toBeCloseTo(7.25, 9)    // 0.1*27.5 + 0.9*5
    expect(seg.hyperEdgeBottomYPos).toBeCloseTo(47.75, 9) // 0.1*27.5 + 0.9*50
  })

  it('1:n 段: target 端口按 side 进 left/rightPorts (mixed)', () => {
    const single = mkNode(NodeType.NORMAL, 0, 0)
    const t1 = mkNode(NodeType.NORMAL, 0, 0)
    const t2 = mkNode(NodeType.NORMAL, 0, 0)
    const singlePort = mkPort(single, PortSide.EAST, 0, 50)
    const tp1 = mkPort(t1, PortSide.WEST, 0, 10)
    const tp2 = mkPort(t2, PortSide.EAST, 0, 90)
    const e1 = mkEdge(singlePort, tp1)
    const e2 = mkEdge(singlePort, tp2)
    const seg = SplineSegment.fromHyperEdge(singlePort, [
      { side: 'LEFT', edge: e1 },
      { side: 'RIGHT', edge: e2 },
    ], 'RIGHT')
    expect(seg.rightPorts).toContain(singlePort)
    expect(seg.leftPorts).toEqual([tp1])
    expect(seg.rightPorts).toContain(tp2)
  })
})

describe('isNormalNode (SplineSegment 导出)', () => {
  it('NORMAL / BIG_NODE / BREAKING_POINT 为 true', () => {
    expect(isNormalNode(mkNode(NodeType.NORMAL))).toBe(true)
    expect(isNormalNode(mkNode('BIG_NODE' as NodeType))).toBe(true)
    expect(isNormalNode(mkNode(NodeType.BREAKING_POINT))).toBe(true)
  })
  it('EXTERNAL_PORT / NORTH_SOUTH_PORT / LONG_EDGE 为 false', () => {
    expect(isNormalNode(mkNode(NodeType.EXTERNAL_PORT))).toBe(false)
    expect(isNormalNode(mkNode(NodeType.NORTH_SOUTH_PORT))).toBe(false)
    expect(isNormalNode(mkNode(NodeType.LONG_EDGE))).toBe(false)
  })
})
