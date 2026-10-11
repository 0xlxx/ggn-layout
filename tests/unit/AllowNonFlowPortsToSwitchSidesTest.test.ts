/**
 * 移植自 ELK Java: intermediate/AllowNonFlowPortsToSwitchSidesTest.java
 * 参数化: 端口约束 × 是否允许换侧 → 两交叉边是否仍相交.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, Direction } from '../../src/index.js'
import { DIRECTION, EDGE_ROUTING, PORT_CONSTRAINTS, PORT_SIDE, ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES } from '../../src/options/layered-options.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

type Pt = { x: number; y: number }

function createSimpleGraph(portConstraints: PortConstraints, node1MaySwitch: boolean, node2MaySwitch: boolean):
  { g: LGraph, e1: LEdge, e2: LEdge } {
  const g = new LGraph()
  g.setProperty(DIRECTION, Direction.RIGHT)
  g.setProperty(EDGE_ROUTING, 'ORTHOGONAL')

  const n1 = new LNode(g); n1.size = { x: 30, y: 30 }
  n1.setProperty(PORT_CONSTRAINTS, portConstraints)
  const pNorth1 = new LPort(); pNorth1.setNode(n1); pNorth1.size = { x: 1, y: 1 }
  pNorth1.getPosition().x = 15; pNorth1.getPosition().y = -1
  pNorth1.setSide(PortSide.NORTH); pNorth1.setProperty(PORT_SIDE, PortSide.NORTH)
  pNorth1.setProperty(ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES, node1MaySwitch)
  const pSouth1 = new LPort(); pSouth1.setNode(n1); pSouth1.size = { x: 1, y: 1 }
  pSouth1.getPosition().x = 15; pSouth1.getPosition().y = 30
  pSouth1.setSide(PortSide.SOUTH); pSouth1.setProperty(PORT_SIDE, PortSide.SOUTH)
  pSouth1.setProperty(ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES, node1MaySwitch)

  const n2 = new LNode(g); n2.size = { x: 30, y: 30 }
  n2.setProperty(PORT_CONSTRAINTS, portConstraints)
  const pNorth2 = new LPort(); pNorth2.setNode(n2); pNorth2.size = { x: 1, y: 1 }
  pNorth2.getPosition().x = 15; pNorth2.getPosition().y = -1
  pNorth2.setSide(PortSide.NORTH); pNorth2.setProperty(PORT_SIDE, PortSide.NORTH)
  pNorth2.setProperty(ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES, node2MaySwitch)
  const pSouth2 = new LPort(); pSouth2.setNode(n2); pSouth2.size = { x: 1, y: 1 }
  pSouth2.getPosition().x = 15; pSouth2.getPosition().y = 30
  pSouth2.setSide(PortSide.SOUTH); pSouth2.setProperty(PORT_SIDE, PortSide.SOUTH)
  pSouth2.setProperty(ALLOW_NON_FLOW_PORTS_TO_SWITCH_SIDES, node2MaySwitch)

  // 两条边: n1北→n2南, n1南→n2北 (固定侧时必然相交)
  const e1 = new LEdge(); e1.setSource(pNorth1); e1.setTarget(pSouth2)
  const e2 = new LEdge(); e2.setSource(pSouth1); e2.setTarget(pNorth2)
  return { g, e1, e2 }
}

function absolutePortPos(p: LPort): Pt {
  const n = p.getNode()!
  return { x: n.position.x + p.getPosition().x, y: n.position.y + p.getPosition().y }
}

function edgePath(e: LEdge): Pt[] {
  const pts: Pt[] = [absolutePortPos(e.getSource()!), ...e.getBendPoints(), absolutePortPos(e.getTarget()!)]
  return pts
}

function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  // 与 ELK 测试所用 java.awt.geom.Line2D.intersectsLine 语义一致:
  // relativeCCW 乘积 <= 0 (共享端点/共线也算相交).
  const ccw = (p: Pt, q: Pt, r: Pt): number => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const s1 = Math.sign(ccw(a1, a2, b1))
  const s2 = Math.sign(ccw(a1, a2, b2))
  const s3 = Math.sign(ccw(b1, b2, a1))
  const s4 = Math.sign(ccw(b1, b2, a2))
  return s1 * s2 <= 0 && s3 * s4 <= 0
}

function intersect(e1: LEdge, e2: LEdge): boolean {
  const p1 = edgePath(e1)
  const p2 = edgePath(e2)
  for (let i = 1; i < p1.length; i++) {
    for (let j = 1; j < p2.length; j++) {
      if (segmentsIntersect(p1[i - 1]!, p1[i]!, p2[j - 1]!, p2[j]!)) return true
    }
  }
  return false
}

const CASES: [PortConstraints, boolean, boolean, boolean][] = [
  [PortConstraints.FIXED_SIDE, false, false, true],
  [PortConstraints.FIXED_POS, true, true, true],
  [PortConstraints.FIXED_SIDE, true, false, false],
  [PortConstraints.FIXED_SIDE, false, true, false],
  [PortConstraints.FIXED_SIDE, true, true, false],
  [PortConstraints.FIXED_ORDER, true, true, false],
]

describe('AllowNonFlowPortsToSwitchSides (ELK Java 移植)', () => {
  it.each(CASES)('%s %s %s -> 相交=%s', (pc, n1s, n2s, expected) => {
    const { g, e1, e2 } = createSimpleGraph(pc, n1s, n2s)
    new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
    expect(intersect(e1, e2)).toBe(expected)
  })
})
