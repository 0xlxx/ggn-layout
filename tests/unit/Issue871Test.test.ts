/**
 * 移植自 ELK Java: issues/Issue871Test.java
 * feedback edges (MODEL_ORDER 断环 + PREFER_EDGES + crossing NONE) 的布局对齐验证.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Direction } from '../../src/index.js'
import {
  CONSIDER_MODEL_ORDER_STRATEGY, CROSSING_MINIMIZATION_STRATEGY,
  CYCLE_BREAKING_STRATEGY, DIRECTION, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS,
  OrderingStrategy, CycleBreakingStrategy, FEEDBACK_EDGES as FEEDBACK_EDGES_PROP,
} from '../../src/options/layered-options.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

function createGraph(): LGraph {
  const g = new LGraph()
  g.setProperty(DIRECTION, Direction.RIGHT)
  g.setProperty(CYCLE_BREAKING_STRATEGY, CycleBreakingStrategy.MODEL_ORDER)
  g.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
  g.setProperty(CROSSING_MINIMIZATION_STRATEGY, 'NONE')
  g.setPadding({ left: 0, top: 0, right: 0, bottom: 0 })
  g.setProperty(SPACING_NODE_NODE, 10)
  g.setProperty(SPACING_NODE_NODE_BETWEEN_LAYERS, 20)
  return g
}

function makeNode(g: LGraph, mo: number): LNode {
  const n = new LNode(g)
  n.size = { x: 30, y: 30 }
  n.setProperty(MODEL_ORDER_PROP, mo)
  return n
}
import { MODEL_ORDER as MODEL_ORDER_PROP } from '../../src/options/internal-properties.js'

function edgeBetween(from: LNode, to: LNode): LEdge {
  const fp = new LPort(); fp.setNode(from)
  const tp = new LPort(); tp.setNode(to)
  const e = new LEdge(); e.setSource(fp); e.setTarget(tp)
  return e
}

function edgeWithLabel(from: LNode, to: LNode, text: string): LEdge {
  const e = edgeBetween(from, to)
  e.getLabels().push({ text, position: { x: 0, y: 0 }, size: { x: 0, y: 0 }, placement: 'CENTER' })
  return e
}

describe('Issue871Test (ELK Java 移植)', () => {
  // FEEDBACK_EDGES=true (jar 官方配置) 是必须的, 但 ggn 还需"断环前定侧"(jar 的 PortSideProcessor
  // 在 ModelOrderCycleBreaker 之前跑) 才能形成 inverted-port → dummy; 直接对 REVERSED 边插 dummy
  // 会 +23 回归 (696), 先保持 skip, 待按 jar 管线顺序整体实现 (见 PROGRESS 下午17).
  it('testFeedbackEdgeBelow: n4 与 n2 对齐 (inverted-port dummy 差异)', () => {
    const g = createGraph()
    g.setProperty(FEEDBACK_EDGES_PROP, true)
    const n1 = makeNode(g, 0), n2 = makeNode(g, 1), n3 = makeNode(g, 2), n4 = makeNode(g, 3)
    edgeBetween(n1, n2); edgeBetween(n1, n3); edgeBetween(n2, n4); edgeBetween(n4, n3)
    new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
    expect(n4.getPosition().y).toBeCloseTo(n2.getPosition().y, 1)
  })

  it('testFeedbackEdgeBasic: n3 与 n2 对齐', () => {
    const g = createGraph()
    const n1 = makeNode(g, 0), n2 = makeNode(g, 1), n3 = makeNode(g, 2)
    edgeBetween(n1, n2); edgeBetween(n2, n3); edgeBetween(n3, n2)
    new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
    expect(n3.getPosition().y).toBeCloseTo(n2.getPosition().y, 1)
  })

  it('testNoFeedbackEdgesStillWorking: 精确坐标', () => {
    const g = createGraph()
    const n1 = makeNode(g, 0), n2 = makeNode(g, 1), n3 = makeNode(g, 2), n4 = makeNode(g, 3)
    edgeWithLabel(n1, n2, '1'); edgeWithLabel(n1, n4, '2'); edgeBetween(n2, n4); edgeBetween(n3, n2); edgeBetween(n3, n4)
    new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
    expect(n1.getPosition().x).toBeCloseTo(0, 1)
    expect(n1.getPosition().y).toBeCloseTo(31, 1)
    expect(n2.getPosition().x).toBeCloseTo(70, 1)
    expect(n2.getPosition().y).toBeCloseTo(6, 1)
    expect(n3.getPosition().x).toBeCloseTo(120, 1)
    expect(n3.getPosition().y).toBeCloseTo(11, 1)
    expect(n4.getPosition().x).toBeCloseTo(170, 1)
    expect(n4.getPosition().y).toBeCloseTo(11, 1)
  })
})
