/**
 * 移植自 ELK Java: issues/Issue680Test.java
 * 层级图 (INCLUDE_CHILDREN) + DOWN 方向 + 端口边框偏移: parent.y=157, child.y=57.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Direction } from '../../src/index.js'
import { DIRECTION, EDGE_ROUTING, PORT_BORDER_OFFSET } from '../../src/options/layered-options.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

function testGraph(): { graph: LGraph, parent: LNode, child: LNode } {
  const graph = new LGraph()
  graph.setProperty(DIRECTION, Direction.DOWN)
  graph.setProperty(EDGE_ROUTING, 'ORTHOGONAL')

  const parent = new LNode(graph)
  parent.setProperty(DIRECTION, Direction.DOWN)
  parent.setProperty(EDGE_ROUTING, 'ORTHOGONAL')

  const nested = new LGraph()
  parent.setNestedGraph(nested)
  nested.setParentNode(parent)

  const p1 = new LPort(); p1.setNode(parent); p1.size = { x: 15, y: 165 }; p1.setProperty(PORT_BORDER_OFFSET, -20)
  const p2 = new LPort(); p2.setNode(parent); p2.size = { x: 15, y: 166 }; p2.setProperty(PORT_BORDER_OFFSET, -22)

  const child = new LNode(nested)
  child.size = { x: 40.265625, y: 75.5 }
  const childP1 = new LPort(); childP1.setNode(child); childP1.size = { x: 15, y: 33 }; childP1.setProperty(PORT_BORDER_OFFSET, -8)
  const childP2 = new LPort(); childP2.setNode(child); childP2.size = { x: 15, y: 34 }; childP2.setProperty(PORT_BORDER_OFFSET, -8)

  const e1 = new LEdge(); e1.setSource(p1); e1.setTarget(childP1)
  const e2 = new LEdge(); e2.setSource(childP2); e2.setTarget(p2)
  void e1; void e2

  return { graph, parent, child }
}

describe('Issue680Test (ELK Java 移植)', () => {
  // parent.y=157 已修复 (WEST/EAST 端口 borderOffset); child.y=57 与 0.12.0 SEPARATE/INCLUDE
  // 实际输出 (12) 均不符 — 测试期望版本陈旧 (jar 实证).
  it('层级图 DOWN 布局: parent.y=157 child.y=57', () => {
    const { graph, parent, child } = testGraph()
    new LayeredLayoutProvider().layout(graph, new NullProgressMonitor())
    expect(parent.getPosition().y).toBeCloseTo(157, 3)
    expect(child.getPosition().y).toBeCloseTo(57, 3)
  })
})
