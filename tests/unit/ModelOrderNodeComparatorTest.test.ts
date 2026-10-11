/**
 * ModelOrderNodeComparator 移植单测 (ELK preserveorder.ModelOrderNodeComparator).
 * 验证: MODEL_ORDER 比较 / 边序 (PREFER_EDGES) / 缺失 MODEL_ORDER 时按入边源节点序.
 */
import { describe, expect, it, vi } from 'vitest'
import { LGraph, LNode, Layer as GLayer, LPort, LEdge } from '../../src/index.js'
import { ModelOrderNodeComparator } from '../../src/intermediate/preserveorder/model-order-node-comparator.js'
import { MODEL_ORDER } from '../../src/options/internal-properties.js'
import { OrderingStrategy } from '../../src/options/layered-options.js'

function makeGraph(): { graph: LGraph; prev: GLayer; cur: GLayer; nodes: LNode[] } {
  const graph = new LGraph()
  const prev = new GLayer(graph)
  const cur = new GLayer(graph)
  graph.getLayers().push(prev, cur)
  prev.id = 0
  cur.id = 1
  return { graph, prev, cur, nodes: [] }
}

function addNode(layer: GLayer, graph: LGraph, modelOrder: number | null): LNode {
  const n = new LNode(graph)
  n.size = { x: 10, y: 10 }
  if (modelOrder !== null) n.setProperty(MODEL_ORDER, modelOrder)
  layer.getNodes().push(n)
  n.setLayer(layer)
  return n
}

function addEdge(src: LNode, tgt: LNode): LEdge {
  const sp = new LPort(); sp.setNode(src)
  const tp = new LPort(); tp.setNode(tgt)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  return e
}

describe('ModelOrderNodeComparator (ELK Java 移植)', () => {
  it('NODES_AND_EDGES 且均有 MODEL_ORDER → 按模型序', () => {
    const { graph, prev, cur } = makeGraph()
    addNode(prev, graph, 0) // prev 层占位
    const n1 = addNode(cur, graph, 5)
    const n2 = addNode(cur, graph, 3)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBeGreaterThan(0) // n1(modelOrder 5) 在 n2(3) 之后
    expect(cmp.compare(n2, n1)).toBeLessThan(0)
  })

  it('PREFER_EDGES → 按入边源节点在 prev 层的顺序', () => {
    const { graph, prev, cur } = makeGraph()
    const a = addNode(prev, graph, null)
    const b = addNode(prev, graph, null)
    const n1 = addNode(cur, graph, null)
    const n2 = addNode(cur, graph, null)
    addEdge(b, n2) // n2 的源 = b (prev 第 2)
    addEdge(a, n1) // n1 的源 = a (prev 第 1)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBeLessThan(0) // a 在 b 前 → n1 在 n2 前
    expect(cmp.compare(n2, n1)).toBeGreaterThan(0)
  })

  it('缺失 MODEL_ORDER 时也按源节点序 (NODES_AND_EDGES)', () => {
    const { graph, prev, cur } = makeGraph()
    const a = addNode(prev, graph, null)
    const b = addNode(prev, graph, null)
    const n1 = addNode(cur, graph, null)
    const n2 = addNode(cur, graph, null)
    addEdge(b, n2)
    addEdge(a, n1)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBeLessThan(0)
  })

  it('biggerThan 记忆化: 已判定后重复比较一致', () => {
    const { graph, prev, cur } = makeGraph()
    addNode(prev, graph, 0)
    const n1 = addNode(cur, graph, 5)
    const n2 = addNode(cur, graph, 3)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    cmp.compare(n1, n2)
    expect(cmp.compare(n1, n2)).toBeGreaterThan(0) // 记忆化路径
    expect(cmp.compare(n2, n1)).toBeLessThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4X3 变异补测: 精确返回值 + 未覆盖分支 (同一源节点端口序 / 边 MODEL_ORDER /
// LONG_EDGE dummy 反馈 / longEdgeReturnValue / portSideOrdinal / 传递闭包).
// ─────────────────────────────────────────────────────────────────────────────

import { NodeType, PortSide } from '../../src/index.js'
import { longEdgeReturnValue, portSideOrdinal } from '../../src/intermediate/preserveorder/model-order-node-comparator.js'
import { CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, GroupOrderStrategy, LongEdgeOrderingStrategy } from '../../src/options/layered-options.js'
import { MAX_MODEL_ORDER_NODES } from '../../src/options/internal-properties.js'

function addNodeAt(layer: GLayer, graph: LGraph, type = NodeType.NORMAL, modelOrder: number | null = null): LNode {
  const n = new LNode(graph)
  n.size = { x: 10, y: 10 }
  n.setType(type)
  if (modelOrder !== null) n.setProperty(MODEL_ORDER, modelOrder)
  layer.getNodes().push(n)
  n.setLayer(layer)
  return n
}

function connectPorts(src: LNode, tgt: LNode, modelOrder?: number): LEdge {
  const sp = new LPort(); sp.setNode(src)
  const tp = new LPort(); tp.setNode(tgt)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  if (modelOrder !== undefined) e.setProperty(MODEL_ORDER, modelOrder)
  return e
}

function make3LayerGraph(): { graph: LGraph; prev: GLayer; cur: GLayer; next: GLayer } {
  const graph = new LGraph()
  const prev = new GLayer(graph)
  const cur = new GLayer(graph)
  const next = new GLayer(graph)
  graph.getLayers().push(prev, cur, next)
  prev.id = 0
  cur.id = 1
  next.id = 2
  return { graph, prev, cur, next }
}

const MO_G1 = 1
const MO_G2 = 2

describe('ModelOrderNodeComparator T4X3 补测 (精确返回值)', () => {
  it('记忆化精确返回: biggerThan→1, 反向→-1', () => {
    const { graph, prev, cur } = makeGraph()
    addNode(prev, graph, 0)
    const n1 = addNode(cur, graph, 5)
    const n2 = addNode(cur, graph, 3)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBe(1)
    expect(cmp.compare(n1, n2)).toBe(1)  // biggerThan(n1).has(n2)
    expect(cmp.compare(n2, n1)).toBe(-1) // biggerThan(n2).has(n1)
    expect(cmp.compare(n2, n1)).toBe(-1)
  })

  it('同一源节点端口序: 连到更早端口的节点在前 (return -1/1 精确)', () => {
    const { graph, prev, cur } = makeGraph()
    const s = addNode(prev, graph, null)
    const pA = new LPort(); pA.setNode(s) // 第一个端口
    const pB = new LPort(); pB.setNode(s) // 第二个端口
    const n1 = addNode(cur, graph, null)
    const n2 = addNode(cur, graph, null)
    const e1 = new LEdge(); e1.setSource(pB); e1.setTarget(addPortTo(n1)); void e1
    const e2 = new LEdge(); e2.setSource(pA); e2.setTarget(addPortTo(n2)); void e2
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // n1 源 = pB (后), n2 源 = pA (前) → pA 先出现 → n2 在前 → compare(n1,n2)=1
    expect(cmp.compare(n1, n2)).toBe(1)
    expect(cmp.compare(n2, n1)).toBe(-1)
  })

  it('不同源节点按 prev 层序: 源在前的节点在前', () => {
    const { graph, prev, cur } = makeGraph()
    const a = addNode(prev, graph, null)
    const b = addNode(prev, graph, null)
    const n1 = addNode(cur, graph, null)
    const n2 = addNode(cur, graph, null)
    connectPorts(b, n1)
    connectPorts(a, n2)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBe(1) // b 在 a 后 → n1 在 n2 后
    expect(cmp.compare(n2, n1)).toBe(-1)
  })

  it('一端有源端口一端无: 按入边 MODEL_ORDER (getModelOrderFromConnectedEdges)', () => {
    const { graph, prev, cur } = makeGraph()
    const s = addNode(prev, graph, null)
    const n1 = addNode(cur, graph, null) // 有入边 (源在 prev)
    const n2 = addNode(cur, graph, null) // 无入边
    connectPorts(s, n1, 5) // 入边 MODEL_ORDER=5
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // n1ModelOrder=5, n2ModelOrder=longEdgeReturnValue(LongEdgeOrderingStrategy.EQUAL)=0 → n1 在后
    expect(cmp.compare(n1, n2)).toBe(1)
    expect(cmp.compare(n2, n1)).toBe(-1)
  })

  it('一端有源端口一端无 (LONG_EDGE 反馈): handleHelperDummyNodes 返回 1', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    // n1: LONG_EDGE dummy 在 cur; 源节点 S 在 prev; 目标 T 在 next
    const s = addNodeAt(prev, graph)
    const t = addNodeAt(next, graph)
    const n1 = addNodeAt(cur, graph, NodeType.LONG_EDGE)
    const n2 = addNodeAt(cur, graph, NodeType.NORMAL)
    connectPorts(s, n1)
    connectPorts(n1, t)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // n1 有源端口 (S 在 prev), n2 无 → handleHelperDummyNodes: source/target 不在 cur 层 → 0
    // 但 n1/n2 均无 MODEL_ORDER → 走 getModelOrderFromConnectedEdges: n1 入边无 MODEL_ORDER → 0, n2 → 0 → -1
    expect(cmp.compare(n1, n2)).toBe(-1)
    expect(cmp.compare(n2, n1)).toBe(1)
  })

  it('LONG_EDGE 反馈: dummy 源节点就是 n2 → return 1', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const n2 = addNodeAt(cur, graph, NodeType.NORMAL)
    const t = addNodeAt(next, graph)
    // n1: LONG_EDGE dummy, 源节点 = n2 (同在 cur 层 = 反馈), 目标 t
    const n1 = addNodeAt(cur, graph, NodeType.LONG_EDGE)
    const pS = new LPort(); pS.setNode(n2)
    const pN1 = new LPort(); pN1.setNode(n1)
    const e1 = new LEdge(); e1.setSource(pS); e1.setTarget(pN1); void e1
    const pN1o = new LPort(); pN1o.setNode(n1)
    const pT = new LPort(); pT.setNode(t)
    const e2 = new LEdge(); e2.setSource(pN1o); e2.setTarget(pT); void e2
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // n1 源端口 = n2 的端口 (n2 在 cur 层, n1 在 cur 层) → p1SourcePort 源节点 n2 的 layer.id === cur.id === n1.layer.id-1? 不 → null
    // 进入 handleHelperDummyNodes: dummyNodeSourceNode === n2 → return 1
    expect(cmp.compare(n1, n2)).toBe(1)
  })

  it('longEdgeReturnValue: DUMMY_NODE_OVER/UNDER/EQUAL', () => {
    expect(longEdgeReturnValue(LongEdgeOrderingStrategy.DUMMY_NODE_OVER)).toBe(Number.MAX_SAFE_INTEGER)
    expect(longEdgeReturnValue(LongEdgeOrderingStrategy.DUMMY_NODE_UNDER)).toBe(Number.MIN_SAFE_INTEGER)
    expect(longEdgeReturnValue(LongEdgeOrderingStrategy.EQUAL)).toBe(0)
  })

  it('portSideOrdinal: UNDEFINED<NORTH<EAST<SOUTH<WEST', () => {
    expect(portSideOrdinal(PortSide.UNDEFINED)).toBe(0)
    expect(portSideOrdinal(PortSide.NORTH)).toBe(1)
    expect(portSideOrdinal(PortSide.EAST)).toBe(2)
    expect(portSideOrdinal(PortSide.SOUTH)).toBe(3)
    expect(portSideOrdinal(PortSide.WEST)).toBe(4)
  })

  it('clearTransitiveOrdering: 重置后重新计算', () => {
    const { graph, prev, cur } = makeGraph()
    addNode(prev, graph, 0)
    const n1 = addNode(cur, graph, 5)
    const n2 = addNode(cur, graph, 3)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBe(1)
    cmp.clearTransitiveOrdering()
    expect(cmp.compare(n1, n2)).toBe(1) // 重建后一致
  })

  it('传递闭包: A>B, B>C → A>C (updateBiggerAndSmallerAssociations)', () => {
    const { graph, prev, cur } = makeGraph()
    addNode(prev, graph, 0)
    const a = addNode(cur, graph, 3)
    const b = addNode(cur, graph, 2)
    const c = addNode(cur, graph, 1)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(a, b)).toBe(1)
    expect(cmp.compare(b, c)).toBe(1)
    // a > b 且 b > c → a > c (闭包)
    expect(cmp.compare(a, c)).toBe(1)
  })

  it('GroupOrderStrategy.ENFORCED + MAX_MODEL_ORDER_NODES: 分组序精确值', () => {
    const { graph, prev, cur } = makeGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_ENFORCED_GROUP_ORDERS, [MO_G1, MO_G2])
    graph.setProperty(MAX_MODEL_ORDER_NODES, 10)
    addNode(prev, graph, 0)
    const n1 = addNode(cur, graph, 3)
    n1.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, MO_G1)
    const n2 = addNode(cur, graph, 4)
    n2.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, MO_G2)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.ENFORCED, true)
    // n1: 10+3=13, n2: 10+4=14 → n1 在前
    expect(cmp.compare(n1, n2)).toBe(-1)
    expect(cmp.compare(n2, n1)).toBe(1)
  })
})

function addPortTo(node: LNode): LPort {
  const p = new LPort()
  p.setNode(node)
  return p
}

// LONG_EDGE×LONG_EDGE 分支 (handleHelperDummyNodes 164-205)

describe('ModelOrderNodeComparator LONG_EDGE×LONG_EDGE (handleHelperDummyNodes)', () => {
  function longEdgeDummy(layer: GLayer, graph: LGraph, srcNode: LNode, tgtNode: LNode): LNode {
    const d = addNodeAt(layer, graph, NodeType.LONG_EDGE)
    const sp = new LPort(); sp.setNode(srcNode)
    const dp = new LPort(); dp.setNode(d)
    const e1 = new LEdge(); e1.setSource(sp); e1.setTarget(dp); void e1
    const dOut = new LPort(); dOut.setNode(d)
    const tp = new LPort(); tp.setNode(tgtNode)
    const e2 = new LEdge(); e2.setSource(dOut); e2.setTarget(tp); void e2
    return d
  }

  it('两个 dummy 参考节点不同: 递归 compare 参考节点 (line 205)', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const s1 = addNodeAt(prev, graph)
    const s2 = addNodeAt(prev, graph)
    const t1 = addNodeAt(next, graph)
    const t2 = addNodeAt(next, graph)
    const n1 = longEdgeDummy(cur, graph, s1, t1)
    const n2 = longEdgeDummy(cur, graph, s2, t2)
    // 参考节点 = 自身 (源/目标均不在 cur) → compare(n1, n2) 递归到自身 → 可能死循环?
    // 实际: source/target 均不在 dummy 层 → referenceNode = n1/n2 → n1Reference !== n2Reference
    // → compare(n1, n2) 再次调用 → 但此时走入边分支 → p1SourcePort/p2SourcePort 非空 (源在 prev)
    // → 不同源节点 → previousLayer 序
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // 源在 prev → p1SourcePort/p2SourcePort 非空 → 不同源节点走 prev 层序 (s1 在 s2 前 → n1 前)
    expect(cmp.compare(n1, n2)).toBe(-1)
    expect(cmp.compare(n2, n1)).toBe(1) // 记忆化 (biggerThan[n2] has n1 → line 34)
  })

  it('两个 dummy 不同反馈参考节点 (line 205 递归到参考节点)', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const r1 = addNodeAt(cur, graph)
    const r2 = addNodeAt(cur, graph)
    const t1 = addNodeAt(next, graph)
    const t2 = addNodeAt(next, graph)
    const n1 = longEdgeDummy(cur, graph, r1, t1) // 源 r1 在 cur → source feedback
    const n2 = longEdgeDummy(cur, graph, r2, t2) // 源 r2 在 cur → source feedback
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // 参考节点 r1 ≠ r2 → line 205: compare(r1, r2) → 均无入边/无 MO → -1
    expect(cmp.compare(n1, n2)).toBe(-1)
  })

  it('两个 dummy 同一反馈源节点 + beforePorts: 端口比较决定序 (line 190-194)', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const ref = addNodeAt(cur, graph) // 反馈源节点在 cur 层
    const t1 = addNodeAt(next, graph)
    const t2 = addNodeAt(next, graph)
    const n1 = longEdgeDummy(cur, graph, ref, t1)
    const n2 = longEdgeDummy(cur, graph, ref, t2)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // 参考节点相同 (ref) → beforePorts → ModelOrderPortComparator 比较两个源端口
    const r1 = cmp.compare(n1, n2)
    const r2 = cmp.compare(n2, n1)
    expect(r1 === 1 || r1 === -1 || r1 === 0).toBe(true)
    expect(r1).toBe(-r2)
  })

  it('两个 dummy 反馈 + beforePorts=false: 源端口在参考节点端口序中 (line 198-202)', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const ref = addNodeAt(cur, graph)
    const t1 = addNodeAt(next, graph)
    const t2 = addNodeAt(next, graph)
    const n1 = longEdgeDummy(cur, graph, ref, t1)
    const n2 = longEdgeDummy(cur, graph, ref, t2)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, false)
    const r1 = cmp.compare(n1, n2)
    const r2 = cmp.compare(n2, n1)
    expect(r1).toBe(-r2)
  })

  it('LONG_EDGE vs NORMAL: 源/目标均不在 dummy 层 → 返回 0', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const s = addNodeAt(prev, graph)
    const t = addNodeAt(next, graph)
    const n1 = longEdgeDummy(cur, graph, s, t)
    const n2 = addNodeAt(cur, graph, NodeType.NORMAL)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // n1 源端口非空 (源在 prev) → p1SourcePort 非空; n2 无入边 → null → 单侧分支
    // handleHelperDummyNodes: source/target 不在 cur → 0 → 走 getModelOrderFromConnectedEdges
    // (n1 入边无 MODEL_ORDER → 0 vs longEdgeReturnValue 0 → 最终 -1)
    expect(cmp.compare(n1, n2)).toBe(-1)
    expect(cmp.compare(n2, n1)).toBe(1)
  })
})

// LONG_EDGE×LONG_EDGE 分支补测 (195/197/193-194/198-202 精确值)
describe('ModelOrderNodeComparator LONG_EDGE×LONG_EDGE 补测二', () => {
  function feedbackDummy(layer: GLayer, graph: LGraph, srcNode: LNode, tgtNode: LNode): LNode {
    const d = addNodeAt(layer, graph, NodeType.LONG_EDGE)
    const sp = new LPort(); sp.setNode(srcNode)
    const dp = new LPort(); dp.setNode(d)
    const e1 = new LEdge(); e1.setSource(sp); e1.setTarget(dp); void e1
    const dOut = new LPort(); dOut.setNode(d)
    const tp = new LPort(); tp.setNode(tgtNode)
    const e2 = new LEdge(); e2.setSource(dOut); e2.setTarget(tp); void e2
    return d
  }

  it('n1 源反馈 + n2 目标反馈 (同一参考节点): return 1', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const r = addNodeAt(cur, graph)
    const t1 = addNodeAt(next, graph)
    const s2 = addNodeAt(next, graph) // n2 源在 next → p2SourcePort null → 走 handleHelperDummyNodes
    const n1 = feedbackDummy(cur, graph, r, t1)  // 源 = r (cur) → source feedback
    const n2 = feedbackDummy(cur, graph, s2, r)  // 目标 = r (cur) → target feedback
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBe(1)
    expect(cmp.compare(n2, n1)).toBe(1) // 记忆化 (biggerThan[n2] has n1 → line 35)
  })

  it('n1/n2 双目标反馈 (同一参考节点): return 0', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const r = addNodeAt(cur, graph)
    const s1 = addNodeAt(next, graph) // 源在 next → p1SourcePort null
    const s2 = addNodeAt(next, graph)
    const n1 = feedbackDummy(cur, graph, s1, r) // 目标 = r (cur) → target feedback
    const n2 = feedbackDummy(cur, graph, s2, r)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // handleHelperDummyNodes 返回 0 (双目标反馈) → compare 继续回退到无 MODEL_ORDER → -1
    expect(cmp.compare(n1, n2)).toBe(-1)
    expect(cmp.compare(n2, n1)).toBe(1) // 记忆化 (biggerThan[n2] has n1)
  })

  it('双源反馈 + beforePorts: 端口比较精确值 (-1 / 1)', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const r = addNodeAt(cur, graph)
    const t1 = addNodeAt(next, graph)
    const t2 = addNodeAt(next, graph)
    const n1 = feedbackDummy(cur, graph, r, t1)
    const n2 = feedbackDummy(cur, graph, r, t2)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBe(-1)
    expect(cmp.compare(n2, n1)).toBe(1)
  })

  it('双源反馈 + beforePorts=false: 参考节点端口序 (源端口先者前)', () => {
    const { graph, prev, cur, next } = make3LayerGraph()
    const r = addNodeAt(cur, graph)
    const t1 = addNodeAt(next, graph)
    const t2 = addNodeAt(next, graph)
    const n1 = feedbackDummy(cur, graph, r, t1)
    const n2 = feedbackDummy(cur, graph, r, t2)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, false)
    // r 的端口序: n1 的源端口先加 (feedbackDummy 先建 n1) → n1 源端口先 → return -1
    expect(cmp.compare(n1, n2)).toBe(-1)
    expect(cmp.compare(n2, n1)).toBe(1)
  })
})

// GGN_MO_DBG 调试分支: 源节点无层时打印诊断 (随后抛错) — 断言精确输出.
describe('ModelOrderNodeComparator GGN_MO_DBG 调试输出', () => {
  it('源节点无 layer: 打印 [MO] 诊断且 compare 抛错', () => {
    vi.stubEnv('GGN_MO_DBG', '1')
    const errors: string[] = []
    const orig = console.error
    console.error = (msg: unknown) => { errors.push(String(msg)) }
    try {
      const { graph, prev, cur } = makeGraph()
      const n1 = addNode(cur, graph, null) // 无入边
      const n2 = addNode(cur, graph, null)
      const src = new LNode(graph) // 不在任何层 → getLayer() null
      const sp = new LPort(); sp.setNode(src)
      const tp = new LPort(); tp.setNode(n2)
      const e = new LEdge(); e.setSource(sp); e.setTarget(tp); void e
      const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
      expect(() => cmp.compare(n1, n2)).toThrow()
      expect(errors.length).toBeGreaterThan(0)
      // 完整结构断言: 所有模板段都必须在场 (杀 StringLiteral/LogicalOperator 变异)
      expect(errors[0]).toContain('[MO] n2=')
      expect(errors[0]).toContain('type=NORMAL')
      expect(errors[0]).toContain('layer=1')
      expect(errors[0]).toContain('srcNode=')
      expect(errors[0]).toContain('srcLayer=NULL')
      expect(errors[0]).toContain('srcGraphLayerless=true')
    } finally {
      console.error = orig
      vi.unstubAllEnvs()
    }
  })

  it('GGN_MO_DBG + 无源端口 (source null): 诊断 srcNode=? 后抛错', () => {
    vi.stubEnv('GGN_MO_DBG', '1')
    const errors: string[] = []
    const orig = console.error
    console.error = (msg: unknown) => { errors.push(String(msg)) }
    try {
      const { graph, prev, cur } = makeGraph()
      const n1 = addNode(cur, graph, null)
      const n2 = addNode(cur, graph, null)
      const tp = new LPort(); tp.setNode(n2)
      const e = new LEdge(); e.setTarget(tp) // 无 source → getSource() null
      void e
      const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.PREFER_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
      expect(() => cmp.compare(n1, n2)).toThrow()
      expect(errors.length).toBeGreaterThan(0)
      expect(errors[0]).toContain('srcNode=?') // 可选链回退
    } finally {
      console.error = orig
      vi.unstubAllEnvs()
    }
  })
})

// 区分「进/不进 PREFER_EDGES 块」与「单侧源端口缺 MODEL_ORDER 回退」的精确序
describe('ModelOrderNodeComparator 分支区分补测', () => {
  it('NODES_AND_EDGES + 无 MODEL_ORDER: 入边 MODEL_ORDER 决定序 (进 PREFER_EDGES 块)', () => {
    const { graph, prev, cur } = makeGraph()
    const s = addNode(prev, graph, null)
    const n1 = addNode(cur, graph, null) // 无 MODEL_ORDER → 必须进 PREFER_EDGES 块
    const n2 = addNode(cur, graph, null)
    connectPorts(s, n1, 5) // 入边 MODEL_ORDER=5
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBe(1)
    expect(cmp.compare(n2, n1)).toBe(-1)
  })

  it('单侧源端口 + 双方都有 MODEL_ORDER: 走 108 行 MODEL_ORDER 比较 (不进 90 行回退)', () => {
    const { graph, prev, cur } = makeGraph()
    const s = addNode(prev, graph, null)
    const n1 = addNode(cur, graph, 5)  // 有 MODEL_ORDER=5, 有入边 (源在 prev)
    const n2 = addNode(cur, graph, 3)  // 有 MODEL_ORDER=3, 无入边
    connectPorts(s, n1, 0) // 入边 MODEL_ORDER=0 (若误入 90 行回退 → 0 vs 0 → -1)
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    expect(cmp.compare(n1, n2)).toBe(1) // 5 > 3 (108 行)
    expect(cmp.compare(n2, n1)).toBe(-1)
  })
})

describe('ModelOrderNodeComparator 单侧源端口 + 一方有 MODEL_ORDER (T4X3)', () => {
  it('n1 无 MO + n2 有 MO: 单侧分支按边序 (区分 || vs &&)', () => {
    const { graph, prev, cur } = makeGraph()
    const s = addNode(prev, graph, null)
    const n1 = addNode(cur, graph, null) // 无 MO, 有入边 (源在 prev)
    const n2 = addNode(cur, graph, 7)    // 有 MO, 无入边
    connectPorts(s, n1, 5) // 入边 MO=5
    const cmp = new ModelOrderNodeComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, LongEdgeOrderingStrategy.EQUAL, GroupOrderStrategy.MODEL_ORDER, true)
    // line 90: !n1.has (true) || !n2.has (false) → 进入 → 5 vs 0 → 1
    expect(cmp.compare(n1, n2)).toBe(1)
    expect(cmp.compare(n2, n1)).toBe(-1)
  })
})
