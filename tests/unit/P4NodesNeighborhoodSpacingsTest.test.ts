/**
 * NeighborhoodInformation / Spacings — 直接单测 (对应 ELK p4nodes.bk.NeighborhoodInformation
 * 与 core.util.Spacings, ELK Java 0.12.0 移植).
 *
 * 语义基准:
 *  - NeighborhoodInformation: nodeCount/layerIndex/nodeIndex; left/rightNeighbors 只保留
 *    PRIORITY_STRAIGHTNESS 最高的邻居, 且按层内 nodeIndex 排序; 排除自环与层内边.
 *  - Spacings: NodeType 对 → 垂直/水平间距属性表; individual 覆盖优先; 图默认兜底.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, PortSide, NodeType } from '../../src/index.js'
import { NeighborhoodInformation, pair } from '../../src/p4nodes/neighborhood-information.js'
import { Spacings, getIndividualOrDefault } from '../../src/p4nodes/spacings.js'
import { SPACINGS } from '../../src/options/internal-properties.js'
import {
  PRIORITY_STRAIGHTNESS, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE, SPACING_PORT_PORT, SPACING_INDIVIDUAL,
} from '../../src/options/layered-options.js'
import { MapPropertyHolder } from '../../src/graph/properties.js'

function makeGraph(): { g: LGraph; l0: Layer; l1: Layer } {
  const g = new LGraph()
  g.setProperty(SPACINGS, new Spacings(g))
  const l0 = new Layer(g)
  const l1 = new Layer(g)
  g.getLayers().push(l0, l1)
  return { g, l0, l1 }
}

function addNode(layer: Layer, name: string, type = NodeType.NORMAL): LNode {
  const n = new LNode(layer.getGraph()!)
  n.setType(type)
  n.setLayer(layer)
  n.size = { x: 60, y: 30 }
  ;(n as unknown as { _name?: string })._name = name
  return n
}

function addEdge(src: LNode, tgt: LNode, priority = 0): LEdge {
  const sp = new LPort(); sp.setNode(src); sp.setSide(PortSide.EAST)
  const tp = new LPort(); tp.setNode(tgt); tp.setSide(PortSide.WEST)
  const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  e.setProperty(PRIORITY_STRAIGHTNESS, priority)
  return e
}

describe('NeighborhoodInformation.buildFor (ELK Java 移植)', () => {
  it('nodeCount / layerIndex / nodeIndex 正确编号', () => {
    const { g, l0, l1 } = makeGraph()
    const a = addNode(l0, 'a')
    const b = addNode(l0, 'b')
    const c = addNode(l1, 'c')
    const d = addNode(l1, 'd')
    addEdge(a, c); addEdge(b, d)

    const ni = NeighborhoodInformation.buildFor(g)

    expect(ni.nodeCount).toBe(4)
    expect(ni.layerIndex[l0.id]).toBe(0)
    expect(ni.layerIndex[l1.id]).toBe(1)
    expect(ni.nodeIndex[a.id]).toBe(0)
    expect(ni.nodeIndex[b.id]).toBe(1)
    expect(ni.nodeIndex[c.id]).toBe(0)
    expect(ni.nodeIndex[d.id]).toBe(1)
    // buildFor 会重写层/节点 id (层内序号), 断言 id 已赋值
    expect(a.id).toBeGreaterThanOrEqual(0)
  })

  it('leftNeighbors 取最高优先级入边, 排除自环/层内边, 按源 nodeIndex 排序', () => {
    const { g, l0, l1 } = makeGraph()
    const a = addNode(l0, 'a')
    const b = addNode(l0, 'b')
    const c = addNode(l1, 'c')
    const eHigh = addEdge(a, c, 2)
    const eLow = addEdge(b, c, 1)

    const ni = NeighborhoodInformation.buildFor(g)

    expect(ni.leftNeighbors[c.id]!.map(p => p.first)).toEqual([a])
    expect(ni.leftNeighbors[c.id]![0]!.second).toBe(eHigh)

    // 等优先级: 两条都保留, 按源 nodeIndex 排序 (a=0, b=1)
    const eB2 = addEdge(b, c, 2)
    const ni2 = NeighborhoodInformation.buildFor(g)
    expect(ni2.leftNeighbors[c.id]!.map(p => p.first)).toEqual([a, b])
    void eLow; void eB2
  })

  it('rightNeighbors 取最高优先级出边并按目标 nodeIndex 排序', () => {
    const { g, l0, l1 } = makeGraph()
    const a = addNode(l0, 'a')
    const c = addNode(l1, 'c')
    const d = addNode(l1, 'd')
    const e1 = addEdge(a, c, 2)
    const e2 = addEdge(a, d, 2)

    const ni = NeighborhoodInformation.buildFor(g)

    expect(ni.rightNeighbors[a.id]!.map(p => p.first)).toEqual([c, d])
    expect(ni.rightNeighbors[a.id]!.map(p => p.second)).toEqual([e1, e2])
  })

  it('自环与层内边被排除', () => {
    const { g, l0, l1 } = makeGraph()
    const a = addNode(l0, 'a')
    const c = addNode(l1, 'c')
    // 自环: a → a
    const loop = new LPort(); loop.setNode(a); loop.setSide(PortSide.EAST)
    const loopT = new LPort(); loopT.setNode(a); loopT.setSide(PortSide.WEST)
    const selfLoop = new LEdge(); selfLoop.setSource(loop); selfLoop.setTarget(loopT)
    selfLoop.setProperty(PRIORITY_STRAIGHTNESS, 5)
    // 层内边: a → a (同层) — 用 c 的层内边? 层内边需同层不同节点, 这里用 c 自环已覆盖 selfLoop;
    // 再建 a → b 同层内边
    const b = addNode(l0, 'b')
    const sp = new LPort(); sp.setNode(a); sp.setSide(PortSide.EAST)
    const tp = new LPort(); tp.setNode(b); tp.setSide(PortSide.WEST)
    const inLayer = new LEdge(); inLayer.setSource(sp); inLayer.setTarget(tp)
    inLayer.setProperty(PRIORITY_STRAIGHTNESS, 5)

    const ni = NeighborhoodInformation.buildFor(g)

    expect(ni.leftNeighbors[a.id]!.length).toBe(0)
    expect(ni.rightNeighbors[a.id]!.length).toBe(0)
    expect(ni.leftNeighbors[b.id]!.length).toBe(0)
    void c; void selfLoop; void inLayer
  })

  it('cleanup 清空邻居数组', () => {
    const { g, l0, l1 } = makeGraph()
    const a = addNode(l0, 'a')
    const c = addNode(l1, 'c')
    addEdge(a, c)
    const ni = NeighborhoodInformation.buildFor(g)
    expect(ni.leftNeighbors[c.id]!.length).toBe(1)
    ni.cleanup()
    expect(ni.leftNeighbors).toEqual([])
    expect(ni.rightNeighbors).toEqual([])
  })

  it('pair 构造元组', () => {
    expect(pair(1, 'x')).toEqual({ first: 1, second: 'x' })
  })
})

describe('Spacings (ELK core.util.Spacings 移植)', () => {
  it('NORMAL-NORMAL: 垂直=nodeNode(20), 水平=nodeNodeBetweenLayers(20)', () => {
    const g = new LGraph()
    const s = new Spacings(g)
    const n1 = new LNode(g); n1.setType(NodeType.NORMAL)
    const n2 = new LNode(g); n2.setType(NodeType.NORMAL)
    expect(s.getVerticalSpacing(n1, n2)).toBe(20)
    expect(s.getHorizontalSpacing(n1, n2)).toBe(20)
  })

  it('类型对映射: NORMAL-LONG_EDGE=edgeNode(10), LONG_EDGE-LONG_EDGE=edgeEdge(10)', () => {
    const g = new LGraph()
    const s = new Spacings(g)
    const normal = new LNode(g); normal.setType(NodeType.NORMAL)
    const longEdge = new LNode(g); longEdge.setType(NodeType.LONG_EDGE)
    expect(s.getVerticalSpacing(normal, longEdge)).toBe(10)
    expect(s.getVerticalSpacing(longEdge, normal)).toBe(10)
    const longEdge2 = new LNode(g); longEdge2.setType(NodeType.LONG_EDGE)
    expect(s.getVerticalSpacing(longEdge, longEdge2)).toBe(10)
    expect(s.getHorizontalSpacing(longEdge, longEdge2)).toBe(10)
  })

  it('individual 覆盖优先, 否则图默认; 两节点取 max', () => {
    const g = new LGraph()
    g.setProperty(SPACING_NODE_NODE, 77)
    const s = new Spacings(g)
    const n1 = new LNode(g); n1.setType(NodeType.NORMAL)
    const n2 = new LNode(g); n2.setType(NodeType.NORMAL)
    expect(s.getVerticalSpacing(n1, n2)).toBe(77)

    const holder = new MapPropertyHolder()
    holder.setProperty(SPACING_NODE_NODE, 100)
    n1.setProperty(SPACING_INDIVIDUAL, holder)
    expect(s.getVerticalSpacing(n1, n2)).toBe(100)

    const holderLow = new MapPropertyHolder()
    holderLow.setProperty(SPACING_NODE_NODE, 60)
    n2.setProperty(SPACING_INDIVIDUAL, holderLow)
    expect(s.getVerticalSpacing(n1, n2)).toBe(100) // max(100, 60)
  })

  it('getVerticalSpacingByType: 表内取图默认, 表外 (PLACEHOLDER) 回退 nodeNode', () => {
    const g = new LGraph()
    g.setProperty(SPACING_PORT_PORT, 30)
    const s = new Spacings(g)
    expect(s.getVerticalSpacingByType(NodeType.EXTERNAL_PORT, NodeType.EXTERNAL_PORT)).toBe(30)
    expect(s.getHorizontalSpacingByType(NodeType.NORMAL, NodeType.NORMAL)).toBe(20)
    // PLACEHOLDER 无表项 → 回退 SPACING_NODE_NODE (默认 20)
    expect(s.getVerticalSpacingByType(NodeType.PLACEHOLDER, NodeType.PLACEHOLDER)).toBe(20)
  })

  it('getIndividualOrDefault: 节点 individual 优先, 否则图默认, 未设属性回退节点/属性默认', () => {
    const g = new LGraph()
    g.setProperty(SPACING_EDGE_NODE, 33)
    const n = new LNode(g)
    expect(getIndividualOrDefault(n, SPACING_EDGE_NODE)).toBe(33)

    const holder = new MapPropertyHolder()
    holder.setProperty(SPACING_EDGE_NODE, 44)
    n.setProperty(SPACING_INDIVIDUAL, holder)
    expect(getIndividualOrDefault(n, SPACING_EDGE_NODE)).toBe(44)
    expect(getIndividualOrDefault(n, SPACING_NODE_NODE_BETWEEN_LAYERS)).toBe(20) // 图未设 → 属性默认
  })
})
