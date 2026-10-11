/**
 * 移植自 ELK Java: OverallLayoutTest.java
 * 全管线 sanity 检查: 坐标/边路径/图尺寸/正交路由.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, Direction } from '../../src/index.js'
import { DIRECTION, EDGE_ROUTING, PORT_CONSTRAINTS } from '../../src/options/layered-options.js'
import { PORT_SIDE } from '../../src/options/layered-options.js'
import { PortConstraints } from '../../src/graph/enums.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

function createSimpleGraph(): LGraph {
  const g = new LGraph()
  g.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
  g.setProperty(DIRECTION, Direction.RIGHT)
  const n1 = new LNode(g); n1.size = { x: 30, y: 30 }; n1.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
  const n2 = new LNode(g); n2.size = { x: 30, y: 30 }; n2.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
  const p1 = new LPort(); p1.setNode(n1); p1.setSide(PortSide.EAST); p1.setProperty(PORT_SIDE, PortSide.EAST)
  const p2 = new LPort(); p2.setNode(n2); p2.setSide(PortSide.WEST); p2.setProperty(PORT_SIDE, PortSide.WEST)
  const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
  void e
  return g
}

describe('OverallLayoutTest (ELK Java 移植)', () => {
  let g: LGraph
  let nodes: LNode[]
  let edges: LEdge[]
  beforeAll(() => {
    g = createSimpleGraph()
    nodes = g.getLayerlessNodes().filter(n => n.getLayer() !== null || true)
    edges = nodes.flatMap(n => n.getPorts().flatMap(p => p.getOutgoingEdges()))
    new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
  })

  it('testNodeCoordinates: 节点坐标 > 0', () => {
    for (const n of g.getLayerlessNodes()) {
      expect(n.position.x, `node ${n.id} x`).toBeGreaterThan(0)
      expect(n.position.y, `node ${n.id} y`).toBeGreaterThan(0)
    }
  })

  it('testEdgeCoordinates: 边路径坐标 > 0', () => {
    for (const e of edges) {
      const s = e.getSource()!, t = e.getTarget()!
      // ggn LPort 位置相对节点 (ELK LGraph 语义); 绝对坐标 = 节点 + 端口.
      const sp = s.getNode()!, tp = t.getNode()!
      expect(sp.position.x + s.getPosition().x).toBeGreaterThan(0)
      expect(sp.position.y + s.getPosition().y).toBeGreaterThan(0)
      expect(tp.position.x + t.getPosition().x).toBeGreaterThan(0)
      expect(tp.position.y + t.getPosition().y).toBeGreaterThan(0)
      for (const bp of e.getBendPoints()) {
        expect(bp.x).toBeGreaterThan(0)
        expect(bp.y).toBeGreaterThan(0)
      }
    }
  })

  it('testGraphSize: 图尺寸 > 0', () => {
    expect(g.getSize().x).toBeGreaterThan(0)
    expect(g.getSize().y).toBeGreaterThan(0)
  })

  it('testEdgeOrthogonality: 路由正交', () => {
    for (const e of edges) {
      const pts = [e.getSource()!.getPosition(), ...e.getBendPoints(), e.getTarget()!.getPosition()]
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1]!, cur = pts[i]!
        expect(prev.x === cur.x || prev.y === cur.y, `edge ${e.id} seg ${i}`).toBe(true)
      }
    }
  })
})
