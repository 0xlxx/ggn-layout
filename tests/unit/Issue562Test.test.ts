/**
 * 移植自 ELK Java: issues/Issue562Test.java
 * 自环 (inside self-loop activate) 布局不应抛异常.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Direction } from '../../src/index.js'
import { DIRECTION, EDGE_ROUTING, INSIDE_SELF_LOOPS_ACTIVATE } from '../../src/options/layered-options.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

describe('Issue562Test (ELK Java 移植)', () => {
  it('inside self-loop 布局不抛异常', () => {
    const g = new LGraph()
    g.setProperty(DIRECTION, Direction.RIGHT)
    g.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
    const n1 = new LNode(g)
    n1.size = { x: 30, y: 30 }
    n1.setProperty(INSIDE_SELF_LOOPS_ACTIVATE, true)
    const p1 = new LPort(); p1.setNode(n1)
    const p2 = new LPort(); p2.setNode(n1)
    const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
    void e
    expect(() => new LayeredLayoutProvider().layout(g, new NullProgressMonitor())).not.toThrow()
  })
})
