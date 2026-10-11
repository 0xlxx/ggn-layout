/**
 * 移植自 ELK Java: intermediate/ConcreteSortByInputModelTest.java
 * 完整管线 + CONSIDER_MODEL_ORDER_STRATEGY=PREFER_EDGES + crossing NONE,
 * 16 端口侧组合 × 单/多节点 × PORT_MODEL_ORDER 两遍.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, Direction } from '../../src/index.js'
import { DIRECTION, EDGE_ROUTING } from '../../src/options/layered-options.js'
import {
  CONSIDER_MODEL_ORDER_STRATEGY, CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER,
  CROSSING_MINIMIZATION_STRATEGY, CYCLE_BREAKING_STRATEGY,
  OrderingStrategy, CycleBreakingStrategy, PORT_CONSTRAINTS,
} from '../../src/options/layered-options.js'
import { MODEL_ORDER, RANDOM } from '../../src/options/internal-properties.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'

function createGraph(): LGraph {
  const g = new LGraph()
  g.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
  g.setProperty(DIRECTION, Direction.RIGHT)
  g.setProperty(RANDOM, new JavaRandom(1) as any)
  g.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.PREFER_EDGES)
  g.setProperty(CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER, false)
  g.setProperty(CROSSING_MINIMIZATION_STRATEGY, 'NONE')
  g.setProperty(CYCLE_BREAKING_STRATEGY, CycleBreakingStrategy.MODEL_ORDER)
  return g
}

let edgeMo = 0
function resetEdgeMo(): void { edgeMo = 0 }

function makeNode(g: LGraph, mo: number): LNode {
  const n = new LNode(g)
  n.size = { x: 20, y: 20 }
  n.setProperty(MODEL_ORDER, mo)
  return n
}

// 端口 MODEL_ORDER: 每节点从 0 递增 (ELK transformNode portModelOrder).
function makePort(n: LNode, side: PortSide, mo: number): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  p.setProperty(MODEL_ORDER, mo)
  return p
}

// 边 MODEL_ORDER: 图内从 0 递增 (ELK importFlatGraph 边序).
function makeEdge(from: LPort, to: LPort): LEdge {
  const e = new LEdge()
  e.setSource(from)
  e.setTarget(to)
  e.setProperty(MODEL_ORDER, edgeMo++)
  return e
}

function addToLayer(g: LGraph, n: LNode, _layerIndex: number): void {
  // ELK 输入: 节点是 layerless, 由管线 (NetworkSimplexLayerer) 分层.
  void _layerIndex
}

function assertAbove(a: { getPosition(): { y: number } }, b: { getPosition(): { y: number } }, msg: string): void {
  expect(a.getPosition().y, msg).toBeLessThan(b.getPosition().y)
}
function assertBefore(a: { getPosition(): { x: number } }, b: { getPosition(): { x: number } }, msg: string): void {
  expect(a.getPosition().x, msg).toBeLessThan(b.getPosition().x)
}

// 组合: [outgoingSide, incomingSide]
const COMBOS: [PortSide, PortSide][] = [
  [PortSide.EAST, PortSide.WEST], [PortSide.EAST, PortSide.NORTH], [PortSide.EAST, PortSide.SOUTH], [PortSide.EAST, PortSide.EAST],
  [PortSide.NORTH, PortSide.WEST], [PortSide.NORTH, PortSide.NORTH], [PortSide.NORTH, PortSide.SOUTH], [PortSide.NORTH, PortSide.EAST],
  [PortSide.SOUTH, PortSide.WEST], [PortSide.SOUTH, PortSide.NORTH], [PortSide.SOUTH, PortSide.SOUTH], [PortSide.SOUTH, PortSide.EAST],
  [PortSide.WEST, PortSide.WEST], [PortSide.WEST, PortSide.NORTH], [PortSide.WEST, PortSide.SOUTH], [PortSide.WEST, PortSide.EAST],
]

function runSingle(outgoing: PortSide, incoming: PortSide): void {
  for (const portModelOrder of [false, true]) {
    resetEdgeMo()
    const graph = createGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER, portModelOrder)
    const n1 = makeNode(graph, 0)
    const n2 = makeNode(graph, 1)
    addToLayer(graph, n1, 0)
    addToLayer(graph, n2, 1)
    n1.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    n2.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    const p1 = makePort(n1, outgoing, 0)
    const p2 = makePort(n1, outgoing, 1)
    const p3 = makePort(n2, incoming, 0)
    const p4 = makePort(n2, incoming, 1)
    makeEdge(p1, p4)
    makeEdge(p2, p3)
    new LayeredLayoutProvider().layout(graph, new NullProgressMonitor())

    // p1/p2: outgoing side E/W → above (y), N/S → before (x)
    if (outgoing === PortSide.EAST || outgoing === PortSide.WEST) assertAbove(p1, p2, 'p1 above p2')
    else assertBefore(p1, p2, 'p1 before p2')
    // p3/p4: ELK Java 官方 single 断言随 outgoing 侧变化 (SOUTH/WEST outgoing 与 EAST/NORTH 相反):
    //   EAST/NORTH: WEST→p4 above p3, NORTH→p3 before p4, SOUTH→p4 before p3, EAST→p3 above p4
    //   SOUTH/WEST: WEST→p3 above p4, NORTH→p4 before p3, SOUTH→p3 before p4, EAST→p4 above p3
    const swOut = outgoing === PortSide.SOUTH || outgoing === PortSide.WEST
    switch (incoming) {
      case PortSide.WEST: swOut ? assertAbove(p3, p4, 'p3 above p4') : assertAbove(p4, p3, 'p4 above p3'); break
      case PortSide.NORTH: swOut ? assertBefore(p4, p3, 'p4 before p3') : assertBefore(p3, p4, 'p3 before p4'); break
      case PortSide.SOUTH: swOut ? assertBefore(p3, p4, 'p3 before p4') : assertBefore(p4, p3, 'p4 before p3'); break
      case PortSide.EAST: swOut ? assertAbove(p4, p3, 'p4 above p3') : assertAbove(p3, p4, 'p3 above p4'); break
    }
  }
}

function runMultiple(outgoing: PortSide, incoming: PortSide): void {
  for (const portModelOrder of [false, true]) {
    resetEdgeMo()
    const graph = createGraph()
    graph.setProperty(CONSIDER_MODEL_ORDER_PORT_MODEL_ORDER, portModelOrder)
    const n1 = makeNode(graph, 0)
    const ni = makeNode(graph, 1)
    const n2 = makeNode(graph, 2)
    addToLayer(graph, n1, 0)
    addToLayer(graph, ni, 0)
    addToLayer(graph, n2, 1)
    n1.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    ni.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    n2.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    const p1 = makePort(n1, outgoing, 0)
    const p2 = makePort(ni, outgoing, 0)
    const p3 = makePort(n2, incoming, 0)
    const p4 = makePort(n2, incoming, 1)
    makeEdge(p1, p4)
    makeEdge(p2, p3)
    new LayeredLayoutProvider().layout(graph, new NullProgressMonitor())

    assertAbove(n1, ni, 'Node order of n1 and ni')
    switch (incoming) {
      case PortSide.WEST: assertAbove(p4, p3, 'p4 above p3'); break
      case PortSide.NORTH: assertBefore(p3, p4, 'p3 before p4'); break
      case PortSide.SOUTH: assertBefore(p4, p3, 'p4 before p3'); break
      case PortSide.EAST: assertAbove(p3, p4, 'p3 above p4'); break
    }
  }
}

// 已知差异 (elkjs vs ELK Java 端口方向): ggn 主验收 (elkjs 差分) 依赖 SOUTH 镜像 + EAST/WEST
// incoming 端口 y 方向; ELK Java 官方测试期望相反方向 (SOUTH 左→右, EAST/WEST incoming 反向).
// 这些组合标 skip, 记录差异 (后续若以 Java 为准切换方向, 主验收需重新对齐).
describe('ConcreteSortByInputModel (ELK Java 移植)', () => {
  for (const [outgoing, incoming] of COMBOS) {
    const label = outgoing + 'Incoming' + incoming
    // 12 个真失败 (SSOT 端口方向冲突, 2026-08-07 复核):
    //   incoming=SOUTH 全部 8 个 (Java 左→右 vs elkjs 镜像); NORTH/WEST, WEST/WEST, NORTH/EAST, WEST/EAST 的 single.
    const failSingle = false
    const failMultiple = false
    if (failSingle) it.skip(`testOutgoing${label}`, () => runSingle(outgoing, incoming))
    else it(`testOutgoing${label}`, () => runSingle(outgoing, incoming))
    if (failMultiple) it.skip(`testOutgoing${label}MultipleNodes`, () => runMultiple(outgoing, incoming))
    else it(`testOutgoing${label}MultipleNodes`, () => runMultiple(outgoing, incoming))
  }
})

function isKnownDiff(outgoing: PortSide, incoming: PortSide): boolean {
  const key = outgoing + ',' + incoming
  const diffs = new Set([
    'EAST,SOUTH', 'EAST,EAST', 'NORTH,WEST', 'NORTH,SOUTH', 'NORTH,EAST',
    'SOUTH,WEST', 'SOUTH,NORTH', 'SOUTH,SOUTH', 'SOUTH,EAST',
    'WEST,WEST', 'WEST,SOUTH', 'WEST,EAST',
  ])
  return diffs.has(key)
}
