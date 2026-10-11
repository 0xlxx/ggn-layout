/**
 * SimpleNodePlacer / InteractiveNodePlacer — 直接单测 (对应 ELK p4nodes).
 *
 * 语义基准 = ELK Java 0.12.0:
 *  - SIMPLE: 各层内节点垂直堆叠 (y 递增不重叠), 层高 = 层内节点总高 + 间距, 各层以最大层高居中.
 *  - INTERACTIVE: 普通节点保留输入 y; dummy 用 ORIGINAL_DUMMY_NODE_POSITION,
 *    否则以 minValidY=0 起按类型间距下推; 所有节点不早于前节点底 + 间距.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, Layer, NodeType } from '../../src/index.js'
import { processSimpleNodePlace } from '../../src/p4nodes/simple-node-placer.js'
import { processInteractiveNodePlace as processInteractive } from '../../src/p4nodes/interactive-node-placer.js'
import { Spacings } from '../../src/p4nodes/spacings.js'
import { SPACINGS, ORIGINAL_DUMMY_NODE_POSITION } from '../../src/options/internal-properties.js'

function makeGraph(): { g: LGraph; layers: Layer[] } {
  const g = new LGraph()
  g.setProperty(SPACINGS, new Spacings(g))
  const layers: Layer[] = []
  for (let i = 0; i < 3; i++) {
    const layer = new Layer(g)
    g.getLayers().push(layer)
    layers.push(layer)
  }
  return { g, layers }
}

function addNode(layer: Layer, type = NodeType.NORMAL, sizeY = 30): LNode {
  const n = new LNode(layer.getGraph()!)
  n.setType(type)
  n.setLayer(layer)
  n.size = { x: 60, y: sizeY }
  return n
}

describe('SimpleNodePlacer.processSimpleNodePlace (ELK Java 移植)', () => {
  it('多层层高以最大层高居中: 层内 y 递增且不重叠', () => {
    const { g, layers } = makeGraph()
    const [l0, l1] = layers
    const n1 = addNode(l0, NodeType.NORMAL, 30)
    const n2 = addNode(l0, NodeType.NORMAL, 50)
    const n3 = addNode(l1, NodeType.NORMAL, 20)

    processSimpleNodePlace(g)

    // 层0: 间距20 + 30 + 50 = 100; 层1: 20 → 居中偏移 (100-20)/2 = 40
    expect(l0.getSize().y).toBe(100)
    expect(l1.getSize().y).toBe(20)
    expect(n1.getPosition().y).toBe(0)
    expect(n2.getPosition().y).toBe(50) // 30 + spacing(20)
    expect(n3.getPosition().y).toBe(40)
  })

  it('margin 计入层高与 y 推进', () => {
    const { g, layers } = makeGraph()
    const [l0] = layers
    const n1 = addNode(l0, NodeType.NORMAL, 30)
    const n2 = addNode(l0, NodeType.NORMAL, 50)
    n1.getMargin().top = 5
    n1.getMargin().bottom = 7
    n2.getMargin().top = 3
    n2.getMargin().bottom = 4

    processSimpleNodePlace(g)

    // 层0: 间距20 + (5+30+7) + (3+50+4) = 119
    expect(l0.getSize().y).toBe(119)
    expect(n1.getPosition().y).toBe(5)
    expect(n2.getPosition().y).toBe(65) // 5+30+7+20+3
  })

  it('单层多节点层高等于自身 (maxHeight 取最大层)', () => {
    const { g, layers } = makeGraph()
    const [l0, l1, l2] = layers
    const a = addNode(l0, NodeType.NORMAL, 10)
    const b = addNode(l1, NodeType.NORMAL, 100)
    const c = addNode(l2, NodeType.NORMAL, 10)

    processSimpleNodePlace(g)

    // maxHeight=100: l0/l2 居中 (100-10)/2 = 45, l1 无偏移
    expect(a.getPosition().y).toBe(45)
    expect(b.getPosition().y).toBe(0)
    expect(c.getPosition().y).toBe(45)
  })
})

describe('InteractiveNodePlacer.processInteractiveNodePlace (ELK Java 移植)', () => {
  it('普通节点保留 y, dummy 用 ORIGINAL_DUMMY_NODE_POSITION, 无位置则按间距下推', () => {
    const { g, layers } = makeGraph()
    const [l0] = layers
    const n1 = addNode(l0, NodeType.NORMAL, 30)
    n1.getPosition().y = 10
    const d1 = addNode(l0, NodeType.LONG_EDGE, 1)
    d1.setProperty(ORIGINAL_DUMMY_NODE_POSITION, 42)
    const n2 = addNode(l0, NodeType.NORMAL, 30)
    n2.getPosition().y = -100
    const d2 = addNode(l0, NodeType.LONG_EDGE, 1)

    processInteractive(g)

    // n1 保留 10; d1=42 但被 minValidY(40)+edgeNode(10) 推至 50;
    // n2=-100 被推至 51+10=61; d2 无位置 → 91+10=101
    expect(n1.getPosition().y).toBe(10)
    expect(d1.getPosition().y).toBe(50)
    expect(n2.getPosition().y).toBe(61)
    expect(d2.getPosition().y).toBe(101)
    // 层内顺序不重叠
    const ys = [n1, d1, n2, d2].map(n => n.getPosition().y)
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThan(ys[i - 1]!)
  })

  it('NORTH_SOUTH_PORT dummy 无原始位置时从 0 起排 (minValidY=max(minValidY,0))', () => {
    const { g, layers } = makeGraph()
    const [l0] = layers
    const a = addNode(l0, NodeType.NORMAL, 30)
    a.getPosition().y = -50
    const ns = addNode(l0, NodeType.NORTH_SOUTH_PORT, 1)
    ns.getPosition().y = 0

    processInteractive(g)

    // a=-50 → 无前驱, 保持 -50? 不: a 是 NORMAL, spacing check: -50 < -inf+20+0 → false → 保持 -50.
    // 但 Java 语义: 普通节点保留输入位置. minValidY = -50+30 = -20.
    // ns: 无 ORIGINAL → minValidY = max(-20, 0) = 0; y = 0 + edgeEdge(10) = 10.
    expect(a.getPosition().y).toBe(-50)
    expect(ns.getPosition().y).toBe(10)
  })
})
