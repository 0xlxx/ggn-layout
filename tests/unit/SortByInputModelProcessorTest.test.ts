/**
 * SortByInputModelProcessor 基础验证 (ggn 内部单元测试).
 * 对应 ELK ConcreteSortByInputModelTest 的底层排序行为.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortConstraints, NodeType } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import { sortByInputModelProcess, longEdgeTargetNodePreprocessing, getTargetNode } from '../../src/intermediate/sort-by-input-model-processor.js'
import { MODEL_ORDER, REVERSED, LONG_EDGE_TARGET, LONG_EDGE_TARGET_NODE, TARGET_NODE_MODEL_ORDER } from '../../src/options/internal-properties.js'
import { PORT_CONSTRAINTS, CONSIDER_MODEL_ORDER_STRATEGY, CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER, OrderingStrategy } from '../../src/options/layered-options.js'

function makeNode(graph: LGraph, modelOrder: number): LNode {
  const n = new LNode(graph)
  n.setProperty(MODEL_ORDER, modelOrder)
  return n
}

describe('SortByInputModelProcessor (基础验证)', () => {
  it('sorts nodes by MODEL_ORDER when strategy is PREFER_EDGES', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
    const la = new Layer(graph)
    const lb = new Layer(graph)
    const n1 = makeNode(graph, 0)
    const n2 = makeNode(graph, 1)
    const m1 = makeNode(graph, 1)
    const m0 = makeNode(graph, 0)
    la.getNodes().push(n1, n2)
    lb.getNodes().push(m1, m0)
    graph.getLayers().push(la, lb)
    sortByInputModelProcess(graph)
    expect(la.getNodes().map(n => n.getProperty(MODEL_ORDER))).toEqual([0, 1])
    expect(lb.getNodes().map(n => n.getProperty(MODEL_ORDER))).toEqual([0, 1])
  })
})

// ============================================================================
// M5 变异补测: longEdgeTargetNodePreprocessing / getTargetNode / 端口 FIXED_ORDER 跳过
// ============================================================================

function makeLayerNode(graph: LGraph, layer: Layer, modelOrder: number): LNode {
  const n = new LNode(graph)
  n.setProperty(MODEL_ORDER, modelOrder)
  n.setLayer(layer)
  return n
}

function connect(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

describe('SortByInputModelProcessor getTargetNode (M5 变异补测)', () => {
  it('目标是 NORMAL 节点: 返回该节点 (L90 break)', () => {
    const graph = new LGraph()
    const normal = new LNode(graph)
    const p = new LPort(); p.setNode(normal)
    const sp = new LPort()
    connect(sp, p)
    expect(getTargetNode(sp)).toBe(normal)
  })

  it('目标是 LONG_EDGE dummy 且带 LONG_EDGE_TARGET: 返回真实目标节点', () => {
    const graph = new LGraph()
    const realTarget = new LNode(graph)
    const targetPort = new LPort(); targetPort.setNode(realTarget)
    const dummy = new LNode(graph)
    dummy.setType(NodeType.LONG_EDGE)
    dummy.setProperty(LONG_EDGE_TARGET, targetPort)
    const dp = new LPort(); dp.setNode(dummy)
    const sp = new LPort()
    connect(sp, dp)
    expect(getTargetNode(sp)).toBe(realTarget)
  })

  it('目标是 non-NORMAL 且无出边: 返回 null', () => {
    const graph = new LGraph()
    const dummy = new LNode(graph)
    dummy.setType(NodeType.NORTH_SOUTH_PORT)
    const dp = new LPort(); dp.setNode(dummy)
    const sp = new LPort()
    connect(sp, dp)
    expect(getTargetNode(sp)).toBeNull()
  })

  it('目标是 non-NORMAL 且带出边: 沿链继续追踪', () => {
    const graph = new LGraph()
    const finalNormal = new LNode(graph)
    const fp = new LPort(); fp.setNode(finalNormal)
    const mid = new LNode(graph)
    mid.setType(NodeType.LONG_EDGE)
    const mp1 = new LPort(); mp1.setNode(mid)
    const mp2 = new LPort(); mp2.setNode(mid)
    connect(mp1, fp)
    const sp = new LPort()
    connect(sp, mp2)
    expect(getTargetNode(sp)).toBe(finalNormal)
  })
})

describe('SortByInputModelProcessor longEdgeTargetNodePreprocessing (M5 变异补测)', () => {
  it('REVERSED 边不更新 model order (L67 分支)', () => {
    const graph = new LGraph()
    const src = new LNode(graph)
    const tgt = new LNode(graph)
    const sp = new LPort(); sp.setNode(src)
    const tp = new LPort(); tp.setNode(tgt)
    const e = connect(sp, tp)
    e.setProperty(REVERSED, true)
    e.setProperty(MODEL_ORDER, 42)
    const map = longEdgeTargetNodePreprocessing(src)
    expect(map.size).toBe(0)
    expect(sp.getProperty(LONG_EDGE_TARGET_NODE)).toBe(tgt)
  })

  it('非 REVERSED 边取最小 model order', () => {
    const graph = new LGraph()
    const src = new LNode(graph)
    const tgt = new LNode(graph)
    const sp1 = new LPort(); sp1.setNode(src)
    const sp2 = new LPort(); sp2.setNode(src)
    const tp = new LPort(); tp.setNode(tgt)
    const e1 = connect(sp1, tp)
    const e2 = connect(sp2, tp)
    e1.setProperty(MODEL_ORDER, 10)
    e2.setProperty(MODEL_ORDER, 5)
    const map = longEdgeTargetNodePreprocessing(src)
    expect(map.get(tgt)).toBe(5)
  })

  it('无出边端口跳过; 二次调用走缓存 (L56/L60)', () => {
    const graph = new LGraph()
    const src = new LNode(graph)
    const tgt = new LNode(graph)
    const sp = new LPort(); sp.setNode(src)
    const tp = new LPort(); tp.setNode(tgt)
    const e = connect(sp, tp)
    e.setProperty(MODEL_ORDER, 3)
    const map1 = longEdgeTargetNodePreprocessing(src)
    expect(map1.get(tgt)).toBe(3)
    expect(src.hasProperty(TARGET_NODE_MODEL_ORDER)).toBe(true)
    const map2 = longEdgeTargetNodePreprocessing(src)
    expect(map2).toBe(map1)  // 缓存命中 (L56)
  })
})

describe('SortByInputModelProcessor 端口 FIXED_ORDER 跳过 (M5 变异补测)', () => {
  it('FIXED_ORDER/FIXED_POS 节点端口不被重排 (L34)', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
    graph.setProperty(CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER, true)
    const la = new Layer(graph)
    const lb = new Layer(graph)
    graph.getLayers().push(la, lb)
    const n1 = makeLayerNode(graph, la, 0)
    const n2 = makeLayerNode(graph, lb, 0)
    // n1 的端口: 输入序 [pA(modelOrder 1), pB(modelOrder 0)] — PREFER_EDGES 会按 model order 重排
    const pA = new LPort(); pA.setNode(n1); pA.setProperty(MODEL_ORDER, 1)
    const pB = new LPort(); pB.setNode(n1); pB.setProperty(MODEL_ORDER, 0)
    // pB 连到 n2 → n1 端口有边, 参与比较
    const pB2 = new LPort(); pB2.setNode(n2)
    connect(pB, pB2)
    n1.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
    const before = n1.getPorts().slice()
    sortByInputModelProcess(graph)
    expect(n1.getPorts()).toEqual(before)  // FIXED_ORDER → 不改
  })

  it('FREE 端口按 model order 重排', () => {
    const graph = new LGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
    graph.setProperty(CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER, true)
    const la = new Layer(graph)
    const lb = new Layer(graph)
    graph.getLayers().push(la, lb)
    const n1 = makeLayerNode(graph, la, 0)
    const n2 = makeLayerNode(graph, lb, 0)
    const pA = new LPort(); pA.setNode(n1); pA.setProperty(MODEL_ORDER, 1)
    const pB = new LPort(); pB.setNode(n1); pB.setProperty(MODEL_ORDER, 0)
    const pB2 = new LPort(); pB2.setNode(n2)
    connect(pB, pB2)
    sortByInputModelProcess(graph)
    expect(n1.getPorts()[0]).toBe(pB)  // modelOrder 0 在前
    expect(n1.getPorts()[1]).toBe(pA)
  })
})
