/**
 * ModelOrderPortComparator 移植单测 (ELK preserveorder.ModelOrderPortComparator).
 * 覆盖: 不同侧序 / 记忆化 / 同源节点端口序 / prev 层序 / portModelOrder / 入出边 / MODEL_ORDER 回退 / 长边 dummy.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, Layer as GLayer, LPort, LEdge, PortSide, NodeType } from '../../src/index.js'
import { ModelOrderPortComparator } from '../../src/intermediate/preserveorder/model-order-port-comparator.js'
import { MODEL_ORDER } from '../../src/options/internal-properties.js'
import { OrderingStrategy } from '../../src/options/layered-options.js'

function makeGraph(): { graph: LGraph; prev: GLayer; cur: GLayer } {
  const graph = new LGraph()
  const prev = new GLayer(graph)
  const cur = new GLayer(graph)
  graph.getLayers().push(prev, cur)
  prev.id = 0
  cur.id = 1
  return { graph, prev, cur }
}

function addNode(layer: GLayer, graph: LGraph): LNode {
  const n = new LNode(graph)
  n.size = { x: 10, y: 10 }
  n.setLayer(layer)
  return n
}

function addPort(node: LNode, side: PortSide, modelOrder?: number): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  if (modelOrder !== undefined) p.setProperty(MODEL_ORDER, modelOrder)
  return p
}

function edge(src: LPort, tgt: LPort, modelOrder?: number): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  if (modelOrder !== undefined) e.setProperty(MODEL_ORDER, modelOrder)
  return e
}

function makeCmp(graph: LGraph, prev: GLayer, strategy = OrderingStrategy.NODES_AND_EDGES,
  portModelOrder = false): ModelOrderPortComparator {
  return new ModelOrderPortComparator(graph, prev.getNodes(), strategy, null, portModelOrder)
}

describe('ModelOrderPortComparator (ELK Java 移植)', () => {
  it('不同侧: 按 portSideOrdinal 排序 (NORTH < EAST < SOUTH < WEST)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const east = addPort(n, PortSide.EAST)
    const west = addPort(n, PortSide.WEST)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(east, west)).toBeLessThan(0)
    expect(cmp.compare(west, east)).toBeGreaterThan(0)
  })

  it('记忆化: 重复比较走 biggerThan/smallerThan 缓存', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const east = addPort(n, PortSide.EAST)
    const west = addPort(n, PortSide.WEST)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(east, west)).toBeLessThan(0)
    expect(cmp.compare(east, west)).toBeLessThan(0)  // 缓存路径
    expect(cmp.compare(west, east)).toBeGreaterThan(0)
  })

  it('同源节点: 按源节点端口序决定目标端口序', () => {
    const { graph, prev, cur } = makeGraph()
    const src = addNode(prev, graph)
    const n = addNode(cur, graph)
    // src 端口序: pA 在前, pB 在后 → 连到 n 的端口也按此序
    const pA = addPort(src, PortSide.EAST)
    const pB = addPort(src, PortSide.EAST)
    const tB = addPort(n, PortSide.WEST)
    const tA = addPort(n, PortSide.WEST)
    edge(pA, tA)
    edge(pB, tB)
    const cmp = makeCmp(graph, prev)
    // WEST 目标端口: reverseOrder=-1 → 源序反转 (pB 的 tB 在前)
    expect(cmp.compare(tA, tB)).toBeGreaterThan(0)
    expect(cmp.compare(tB, tA)).toBeLessThan(0)
  })

  it('不同源节点: 按源节点在 prev 层的位置', () => {
    const { graph, prev, cur } = makeGraph()
    const a = addNode(prev, graph)
    const b = addNode(prev, graph)
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.WEST)
    const t2 = addPort(n, PortSide.WEST)
    edge(addPort(a, PortSide.EAST), t1)
    edge(addPort(b, PortSide.EAST), t2)
    const cmp = makeCmp(graph, prev)
    // WEST 目标 → reverseOrder=-1: a 在 prev 前, 但 t1 反而在后
    expect(cmp.compare(t1, t2)).toBeGreaterThan(0)
    expect(cmp.compare(t2, t1)).toBeLessThan(0)
  })

  it('portModelOrder: 端口 MODEL_ORDER 决定顺序', () => {
    const { graph, prev, cur } = makeGraph()
    const src = addNode(prev, graph)
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.WEST, 1)
    const t2 = addPort(n, PortSide.WEST, 0)
    edge(addPort(src, PortSide.EAST), t1)
    edge(addPort(src, PortSide.EAST), t2)
    const cmp = makeCmp(graph, prev, OrderingStrategy.NODES_AND_EDGES, true)
    expect(cmp.compare(t1, t2)).toBeGreaterThan(0)  // modelOrder 1 在后
  })

  it('一端入边一端出边: 同侧时入边端口在后', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const inP = addPort(n, PortSide.EAST)
    const outP = addPort(n, PortSide.EAST)
    const src = addNode(prev, graph)
    edge(addPort(src, PortSide.EAST), inP)
    const tgt = addNode(cur, graph)
    edge(outP, addPort(tgt, PortSide.WEST))
    const cmp = makeCmp(graph, prev)
    // L136-139: (incoming>0, outgoing>0) → 1 → 入边端口在后
    expect(cmp.compare(inP, outP)).toBeGreaterThan(0)
    expect(cmp.compare(outP, inP)).toBeLessThan(0)
  })

  it('MODEL_ORDER 回退: WEST 侧 reverseOrder 反转', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const p1 = addPort(n, PortSide.WEST, 0)
    const p2 = addPort(n, PortSide.WEST, 1)
    const cmp = makeCmp(graph, prev)
    // 无任何边: 走 MODEL_ORDER 回退; WEST 侧 reverseOrder=-1 → modelOrder 小者反而在后
    expect(cmp.compare(p1, p2)).toBeGreaterThan(0)
    expect(cmp.compare(p2, p1)).toBeLessThan(0)
  })

  it('LONG_EDGE dummy 源节点: 参考同一层的 dummy 顺序', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.WEST)
    const t2 = addPort(n, PortSide.WEST)
    const d1 = addNode(prev, graph)
    const d2 = addNode(prev, graph)
    d1.setType(NodeType.LONG_EDGE)
    d2.setType(NodeType.LONG_EDGE)
    const s1 = addPort(d1, PortSide.EAST)
    const s2 = addPort(d2, PortSide.EAST)
    edge(s1, t1)
    edge(s2, t2)
    const cmp = makeCmp(graph, prev)
    // dummy 源在 prev 层 (与目标不同层) → 走通用 checkReferenceLayer; WEST 反转 → t1 在后
    expect(cmp.compare(t1, t2)).toBeGreaterThan(0)
    expect(cmp.compare(t2, t1)).toBeLessThan(0)
  })

  it('clearTransitiveOrdering 重置记忆化', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const east = addPort(n, PortSide.EAST)
    const west = addPort(n, PortSide.WEST)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(east, west)).toBeLessThan(0)
    cmp.clearTransitiveOrdering()
    expect(cmp.compare(east, west)).toBeLessThan(0)  // 重建后结果一致
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4X3 变异补测: 精确返回值 + 未覆盖分支 (LONG_EDGE 同层源 / PREFER_NODES 目标
// 序 / 边 MODEL_ORDER / targetNodeModelOrder / 一端入一端出 / checkPortModelOrder).
// ─────────────────────────────────────────────────────────────────────────────

import { LONG_EDGE_TARGET_NODE } from '../../src/options/internal-properties.js'
import { CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy } from '../../src/options/layered-options.js'

describe('ModelOrderPortComparator T4X3 补测 (精确返回值)', () => {
  it('记忆化精确返回: biggerThan→1, 反向→-1', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const east = addPort(n, PortSide.EAST)
    const west = addPort(n, PortSide.WEST)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(east, west)).toBe(-2) // EAST(2) - WEST(4) = -2
    expect(cmp.compare(east, west)).toBe(-1)
    expect(cmp.compare(west, east)).toBe(1)
  })

  it('入边同源节点端口序: WEST 侧 reverseOrder=-1 → 精确 ±1', () => {
    const { graph, prev, cur } = makeGraph()
    const src = addNode(prev, graph)
    const n = addNode(cur, graph)
    const pA = addPort(src, PortSide.EAST)
    const pB = addPort(src, PortSide.EAST)
    const tA = addPort(n, PortSide.WEST)
    const tB = addPort(n, PortSide.WEST)
    edge(pA, tA)
    edge(pB, tB)
    const cmp = makeCmp(graph, prev)
    // 源端口序 pA 在前 → tA 目标 WEST reverseOrder=-1 → tB 在前
    expect(cmp.compare(tA, tB)).toBe(1)
    expect(cmp.compare(tB, tA)).toBe(-1)
  })

  it('入边 LONG_EDGE 同层源: checkReferenceLayer 在层内节点序 (EAST 反转)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const d1 = addNode(prev, graph)
    const d2 = addNode(prev, graph)
    d1.setType(NodeType.LONG_EDGE)
    d2.setType(NodeType.LONG_EDGE)
    // 源 dummy 与目标端口同层? 需要 p1Node/p2Node 层 == 目标端口层
    // 构造: 源 d1/d2 在 cur 层 (与目标同层), 且都是 LONG_EDGE
    const d1b = addNode(cur, graph)
    const d2b = addNode(cur, graph)
    d1b.setType(NodeType.LONG_EDGE)
    d2b.setType(NodeType.LONG_EDGE)
    const s1 = addPort(d1b, PortSide.EAST)
    const s2 = addPort(d2b, PortSide.EAST)
    const t1 = addPort(n, PortSide.WEST)
    const t2 = addPort(n, PortSide.WEST)
    edge(s1, t1)
    edge(s2, t2)
    const cmp = makeCmp(graph, prev)
    // d1b 在层内先 → inPreviousLayer<0 → reverseOrder(-1, WEST) 反转后返回 -1
    expect(cmp.compare(t1, t2)).toBe(1)
    expect(cmp.compare(t2, t1)).toBe(-1)
  })

  it('入边不同源: prev 层序决定 (WEST reverseOrder)', () => {
    const { graph, prev, cur } = makeGraph()
    const a = addNode(prev, graph)
    const b = addNode(prev, graph)
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.WEST)
    const t2 = addPort(n, PortSide.WEST)
    edge(addPort(a, PortSide.EAST), t1)
    edge(addPort(b, PortSide.EAST), t2)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(t1, t2)).toBe(1) // a 在 b 前, WEST 反转 → t1 在后
    expect(cmp.compare(t2, t1)).toBe(-1)
  })

  it('入边 + portModelOrder: checkPortModelOrder 决定顺序', () => {
    const { graph, prev, cur } = makeGraph()
    const next = new GLayer(graph)
    graph.getLayers().push(next)
    next.id = 2
    const s1 = addNode(next, graph) // 源不在 prev → 跳过层序, 走 portModelOrder
    const s2 = addNode(next, graph)
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.EAST, 2)
    const t2 = addPort(n, PortSide.EAST, 1)
    edge(addPort(s1, PortSide.EAST), t1)
    edge(addPort(s2, PortSide.EAST), t2)
    const cmp = makeCmp(graph, prev, OrderingStrategy.NODES_AND_EDGES, true)
    expect(cmp.compare(t1, t2)).toBe(1) // modelOrder 2 > 1
    expect(cmp.compare(t2, t1)).toBe(-1)
  })

  it('出边 PREFER_NODES: 目标节点 MODEL_ORDER 决定顺序', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    tgt1.setProperty(MODEL_ORDER, 5)
    tgt2.setProperty(MODEL_ORDER, 3)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST))
    edge(o2, addPort(tgt2, PortSide.WEST))
    const cmp = makeCmp(graph, prev, OrderingStrategy.PREFER_NODES)
    expect(cmp.compare(o1, o2)).toBe(1) // tgt1(5) > tgt2(3)
    expect(cmp.compare(o2, o1)).toBe(-1)
  })

  it('出边同目标节点: 边 MODEL_ORDER 决定顺序', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt)
    edge(o1, addPort(tgt, PortSide.WEST), 7)
    edge(o2, addPort(tgt, PortSide.WEST), 2)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(o1, o2)).toBe(1) // 边 MODEL_ORDER 7 > 2
    expect(cmp.compare(o2, o1)).toBe(-1)
  })

  it('出边 targetNodeModelOrder 映射覆盖边序', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST), 1)
    edge(o2, addPort(tgt2, PortSide.WEST), 9)
    const map = new Map<LNode, number>([[tgt1, 100], [tgt2, 50]])
    const cmp = new ModelOrderPortComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, map, false)
    expect(cmp.compare(o1, o2)).toBe(1) // tgt1(100) > tgt2(50)
    expect(cmp.compare(o2, o1)).toBe(-1)
  })

  it('一端入一端出: 入边端口在后 (1 / -1 精确)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const inP = addPort(n, PortSide.EAST)
    const outP = addPort(n, PortSide.EAST)
    const src = addNode(prev, graph)
    edge(addPort(src, PortSide.EAST), inP)
    const tgt = addNode(cur, graph)
    edge(outP, addPort(tgt, PortSide.WEST))
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(inP, outP)).toBe(1)
    expect(cmp.compare(outP, inP)).toBe(-1)
  })

  it('checkPortModelOrder: 返回差值; 无 MODEL_ORDER 返回 0', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const p1 = addPort(n, PortSide.EAST, 5)
    const p2 = addPort(n, PortSide.EAST, 2)
    const cmp = makeCmp(graph, prev, OrderingStrategy.NODES_AND_EDGES, true)
    expect(cmp.checkPortModelOrder(p1, p2)).toBe(3)
    expect(cmp.checkPortModelOrder(p2, p1)).toBe(-3)
    const p3 = addPort(n, PortSide.EAST)
    const p4 = addPort(n, PortSide.EAST)
    expect(cmp.checkPortModelOrder(p3, p4)).toBe(0)
  })

  it('出边不同目标且无映射: 边 MODEL_ORDER 缺失时按 0 比较 (目标不在 prev → 不依赖层序)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST))
    edge(o2, addPort(tgt2, PortSide.WEST))
    const cmp = makeCmp(graph, prev)
    // 两目标无 MODEL_ORDER, 边无 MODEL_ORDER → p1Order=p2Order=0 → 返回 -1 (稳定序)
    expect(cmp.compare(o1, o2)).toBe(-1)
  })
})

// T4X3 补测二: 同源节点不在 prev (区分端口序 vs 层序) / NORTH·SOUTH·EAST 反转 /
// LONG_EDGE 同层 EAST / ENFORCED 偏移算术.
describe('ModelOrderPortComparator T4X3 补测二', () => {
  it('同源节点不在 prev 层 + WEST: 端口序决定 (EAST 源端口在后)', () => {
    const { graph, prev, cur } = makeGraph()
    const next = new GLayer(graph)
    graph.getLayers().push(next)
    next.id = 2
    const src = addNode(next, graph) // 不在 prev → 走端口序, 不落层序
    const n = addNode(cur, graph)
    const pA = addPort(src, PortSide.EAST)
    const pB = addPort(src, PortSide.EAST)
    const tA = addPort(n, PortSide.WEST)
    const tB = addPort(n, PortSide.WEST)
    edge(pA, tA)
    edge(pB, tB)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(tA, tB)).toBe(1) // pA 先 → WEST 反转 → tA 在后
    expect(cmp.compare(tB, tA)).toBe(-1)
  })

  it('同源节点 + NORTH/SOUTH 入边: reverseOrder=-1', () => {
    const { graph, prev, cur } = makeGraph()
    const src = addNode(prev, graph)
    const n = addNode(cur, graph)
    const pA = addPort(src, PortSide.SOUTH)
    const pB = addPort(src, PortSide.SOUTH)
    const tA = addPort(n, PortSide.NORTH)
    const tB = addPort(n, PortSide.NORTH)
    edge(pA, tA)
    edge(pB, tB)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(tA, tB)).toBe(1) // NORTH 反转
    expect(cmp.compare(tB, tA)).toBe(-1)
  })

  it('同源节点 + EAST 入边: reverseOrder=1 (不反转)', () => {
    const { graph, prev, cur } = makeGraph()
    const src = addNode(prev, graph)
    const n = addNode(cur, graph)
    const pA = addPort(src, PortSide.WEST)
    const pB = addPort(src, PortSide.WEST)
    const tA = addPort(n, PortSide.EAST)
    const tB = addPort(n, PortSide.EAST)
    edge(pA, tA)
    edge(pB, tB)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(tA, tB)).toBe(-1) // EAST 不反转 → pA 的 tA 在前
    expect(cmp.compare(tB, tA)).toBe(1)
  })

  it('不同源节点 + SOUTH 入边: 层序反转 (SOUTH 反转)', () => {
    const { graph, prev, cur } = makeGraph()
    const a = addNode(prev, graph)
    const b = addNode(prev, graph)
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.SOUTH)
    const t2 = addPort(n, PortSide.SOUTH)
    edge(addPort(a, PortSide.EAST), t1)
    edge(addPort(b, PortSide.EAST), t2)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(t1, t2)).toBe(1) // a 前, SOUTH 反转 → t1 在后
    expect(cmp.compare(t2, t1)).toBe(-1)
  })

  it('LONG_EDGE 同层源 + EAST: 层内序不反转 (EAST 例外)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const d1 = addNode(cur, graph)
    const d2 = addNode(cur, graph)
    d1.setType(NodeType.LONG_EDGE)
    d2.setType(NodeType.LONG_EDGE)
    const s1 = addPort(d1, PortSide.EAST)
    const s2 = addPort(d2, PortSide.EAST)
    const t1 = addPort(n, PortSide.EAST)
    const t2 = addPort(n, PortSide.EAST)
    edge(s1, t1)
    edge(s2, t2)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(t1, t2)).toBe(1) // EAST 反转后 inPreviousLayer<0 → t1 在后
    expect(cmp.compare(t2, t1)).toBe(-1)
  })

  it('出边 + SOUTH: reverseOrder=-1 精确', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.SOUTH)
    const o2 = addPort(n, PortSide.SOUTH)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    tgt1.setProperty(MODEL_ORDER, 5)
    tgt2.setProperty(MODEL_ORDER, 3)
    edge(o1, addPort(tgt1, PortSide.WEST))
    edge(o2, addPort(tgt2, PortSide.WEST))
    const cmp = makeCmp(graph, prev)
    // SOUTH 反转: 边 MODEL_ORDER 无, 目标 MODEL_ORDER 不参与该路径 → p1Order=p2Order=0
    // → 返回 -reverseOrder = 1
    expect(cmp.compare(o1, o2)).toBe(1)
  })

  it('出边 + ENFORCED 组策略: offset 算术参与 (offset = out+in)', () => {
    const { graph, prev, cur } = makeGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, GroupOrderStrategy.ENFORCED)
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    // o1 有 1 出 1 入 → offset=2; 出边 MODEL_ORDER=5 → p1Order = 2+5=7
    const inP = addPort(n, PortSide.WEST)
    edge(addPort(addNode(prev, graph), PortSide.EAST), inP)
    edge(o1, addPort(tgt1, PortSide.WEST), 5)
    edge(o2, addPort(tgt2, PortSide.WEST), 1)
    const cmp = makeCmp(graph, prev)
    // p1Order=7, p2Order = 0+1=1 → o1 在后
    expect(cmp.compare(o1, o2)).toBe(1)
    expect(cmp.compare(o2, o1)).toBe(-1)
  })

  it('出边不同目标且 PREFER_NODES 但目标无 MODEL_ORDER: 回退边序', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST), 9)
    edge(o2, addPort(tgt2, PortSide.WEST), 2)
    const cmp = makeCmp(graph, prev, OrderingStrategy.PREFER_NODES)
    // 目标无 MODEL_ORDER → 走边 MODEL_ORDER: 9 > 2 → 1
    expect(cmp.compare(o1, o2)).toBe(1)
    expect(cmp.compare(o2, o1)).toBe(-1)
  })

  it('targetNodeModelOrder 只覆盖单个目标: 未覆盖目标用边序', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST), 3)
    edge(o2, addPort(tgt2, PortSide.WEST), 8)
    const map = new Map<LNode, number>([[tgt1, 100]]) // 只覆盖 tgt1
    const cmp = new ModelOrderPortComparator(graph, prev.getNodes(), OrderingStrategy.NODES_AND_EDGES, map, false)
    expect(cmp.compare(o1, o2)).toBe(1) // tgt1=100 > 边序 8
    expect(cmp.compare(o2, o1)).toBe(-1)
  })
})

// T4X3 补测三: PREFER_NODES 单目标 null / 同目标单 null / 无属性回退精确值
describe('ModelOrderPortComparator T4X3 补测三', () => {
  it('PREFER_NODES + 一个目标 null: 跳过目标序, 回退边 MODEL_ORDER', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1) // o2 无 LONG_EDGE_TARGET_NODE → null
    edge(o1, addPort(tgt1, PortSide.WEST), 1)
    const tgt2 = addNode(cur, graph)
    edge(o2, addPort(tgt2, PortSide.WEST), 8)
    const cmp = makeCmp(graph, prev, OrderingStrategy.PREFER_NODES)
    expect(cmp.compare(o1, o2)).toBe(-1) // 8 > 1 → o2 在前
    expect(cmp.compare(o2, o1)).toBe(1)
  })

  it('同目标但其中一个 target null: 走 p1Order 比较 (边序)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt)
    edge(o1, addPort(tgt, PortSide.WEST), 7)
    const tgt2 = addNode(cur, graph)
    edge(o2, addPort(tgt2, PortSide.WEST), 2)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(o1, o2)).toBe(1) // 7 > 2
    expect(cmp.compare(o2, o1)).toBe(-1)
  })

  it('无任何边/无 MODEL_ORDER: 最终回退 -1 (WEST 也不反转)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const p1 = addPort(n, PortSide.WEST)
    const p2 = addPort(n, PortSide.WEST)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(p1, p2)).toBe(-1)
    expect(cmp.compare(p2, p1)).toBe(1) // 记忆化
  })

  it('出边不同目标: 边序相等时稳定回退 -1', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST))
    edge(o2, addPort(tgt2, PortSide.WEST))
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(o1, o2)).toBe(-1)
    expect(cmp.compare(o2, o1)).toBe(1) // 记忆化
  })
})

// T4X3 补测四: NoCoverage 分支 (不同侧 result>0 / portModelOrder 负值 / SOUTH 回退反转)
describe('ModelOrderPortComparator T4X3 补测四', () => {
  it('不同侧: WEST vs EAST 正差 (先比较 west,east 走 result>0 分支)', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const east = addPort(n, PortSide.EAST)
    const west = addPort(n, PortSide.WEST)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(west, east)).toBe(2) // WEST(4) - EAST(2) = 2
    expect(cmp.compare(east, west)).toBe(-1) // 记忆化
  })

  it('入边 portModelOrder 负值: 走 -reverseOrder 分支', () => {
    const { graph, prev, cur } = makeGraph()
    const next = new GLayer(graph)
    graph.getLayers().push(next)
    next.id = 2
    const s1 = addNode(next, graph)
    const s2 = addNode(next, graph)
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.EAST, 1)
    const t2 = addPort(n, PortSide.EAST, 2)
    edge(addPort(s1, PortSide.EAST), t1)
    edge(addPort(s2, PortSide.EAST), t2)
    const cmp = makeCmp(graph, prev, OrderingStrategy.NODES_AND_EDGES, true)
    expect(cmp.compare(t1, t2)).toBe(-1) // 1-2 = -1 → -reverseOrder = -1
  })

  it('出边 PREFER_NODES 负值: 走 -reverseOrder 分支', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    tgt1.setProperty(MODEL_ORDER, 3)
    tgt2.setProperty(MODEL_ORDER, 5)
    const o1 = addPort(n, PortSide.EAST)
    const o2 = addPort(n, PortSide.EAST)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST))
    edge(o2, addPort(tgt2, PortSide.WEST))
    const cmp = makeCmp(graph, prev, OrderingStrategy.PREFER_NODES)
    expect(cmp.compare(o1, o2)).toBe(-1) // 3-5 = -2 → -1
  })

  it('portModelOrder 相等 (无 MODEL_ORDER): 回退到出边/最终 -1', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const p1 = addPort(n, PortSide.EAST)
    const p2 = addPort(n, PortSide.EAST)
    const cmp = makeCmp(graph, prev, OrderingStrategy.NODES_AND_EDGES, true)
    expect(cmp.compare(p1, p2)).toBe(-1) // 无 MO → checkPortModelOrder 0 → 最终 -1
  })

  it('MODEL_ORDER 回退 + SOUTH: reverseOrder=-1 且 p1MO>p2MO', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const p1 = addPort(n, PortSide.SOUTH, 3)
    const p2 = addPort(n, PortSide.SOUTH, 1)
    const cmp = makeCmp(graph, prev)
    expect(cmp.compare(p1, p2)).toBe(-1) // SOUTH 反转 → 3>1 但返回 -1
    expect(cmp.compare(p2, p1)).toBe(1)
  })
})

// T4X3 补测五: 出边 portModelOrder / 端口序第二分支 / LONG_EDGE 层条件假分支
describe('ModelOrderPortComparator T4X3 补测五', () => {
  it('出边 + portModelOrder 正差: 走 reverseOrder 分支', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST, 5)
    const o2 = addPort(n, PortSide.EAST, 2)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST))
    edge(o2, addPort(tgt2, PortSide.WEST))
    const cmp = makeCmp(graph, prev, OrderingStrategy.NODES_AND_EDGES, true)
    expect(cmp.compare(o1, o2)).toBe(1) // 5-2=3 > 0, EAST reverseOrder=1
    expect(cmp.compare(o2, o1)).toBe(-1)
  })

  it('出边 + portModelOrder 负差: 走 -reverseOrder 分支', () => {
    const { graph, prev, cur } = makeGraph()
    const n = addNode(cur, graph)
    const tgt1 = addNode(cur, graph)
    const tgt2 = addNode(cur, graph)
    const o1 = addPort(n, PortSide.EAST, 1)
    const o2 = addPort(n, PortSide.EAST, 4)
    o1.setProperty(LONG_EDGE_TARGET_NODE, tgt1)
    o2.setProperty(LONG_EDGE_TARGET_NODE, tgt2)
    edge(o1, addPort(tgt1, PortSide.WEST))
    edge(o2, addPort(tgt2, PortSide.WEST))
    const cmp = makeCmp(graph, prev, OrderingStrategy.NODES_AND_EDGES, true)
    expect(cmp.compare(o1, o2)).toBe(-1)
  })

  it('同源节点端口序: p2SourcePort 先出现 → 返回 reverseOrder', () => {
    const { graph, prev, cur } = makeGraph()
    const src = addNode(prev, graph)
    const n = addNode(cur, graph)
    const pA = addPort(src, PortSide.EAST)
    const pB = addPort(src, PortSide.EAST)
    const tA = addPort(n, PortSide.EAST)
    const tB = addPort(n, PortSide.EAST)
    edge(pA, tA) // tA 源 = pA (前)
    edge(pB, tB) // tB 源 = pB (后)
    const cmp = makeCmp(graph, prev)
    // 比较 tB,tA: p1SourcePort=pB 后出现 → 循环先遇 p2SourcePort=pA → return reverseOrder=1
    expect(cmp.compare(tB, tA)).toBe(1)
    expect(cmp.compare(tA, tB)).toBe(-1)
  })

  it('LONG_EDGE 源不在目标层: 跳过层内引用 (LONG_EDGE 分支条件不满足)', () => {
    const { graph, prev, cur } = makeGraph()
    const next = new GLayer(graph)
    graph.getLayers().push(next)
    next.id = 2
    const d1 = addNode(next, graph) // 源在 next, 目标端口在 cur → 不同层
    const d2 = addNode(next, graph)
    d1.setType(NodeType.LONG_EDGE)
    d2.setType(NodeType.LONG_EDGE)
    const n = addNode(cur, graph)
    const t1 = addPort(n, PortSide.WEST)
    const t2 = addPort(n, PortSide.WEST)
    edge(addPort(d1, PortSide.EAST), t1)
    edge(addPort(d2, PortSide.EAST), t2)
    const cmp = makeCmp(graph, prev)
    // p1Node/d2 不在 prev → checkReferenceLayer(prev)=0 → WEST reverse → t1 在后 (1)
    expect(cmp.compare(t1, t2)).toBe(1)
    expect(cmp.compare(t2, t1)).toBe(-1)
  })
})
