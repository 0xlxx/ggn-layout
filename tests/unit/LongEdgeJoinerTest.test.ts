/**
 * LongEdgeJoiner (对应 ELK intermediate.LongEdgeJoiner) — LONG_EDGE dummy 入/出边合并.
 * 附加覆盖: JUNCTION_POINTS 合并两分支 (surviving 无/有 junction points).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, NodeType } from '../../src/index.js'
import { processLongEdgeJoin, joinAt } from '../../src/intermediate/long-edge-joiner.js'
import { JUNCTION_POINTS } from '../../src/options/layered-options.js'
import { Layer } from '../../src/graph/layer.js'

function makeNode(type: NodeType = NodeType.NORMAL): LNode {
  const n = new LNode()
  n.setType(type)
  return n
}

function addPort(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

function addEdge(src: LPort, tgt: LPort): LEdge {
  const e = new LEdge()
  e.setSource(src)
  e.setTarget(tgt)
  return e
}

function makeDummyChain(addUnnecessary: boolean): { graph: LGraph, a: LNode, b: LNode, d: LNode, e1: LEdge, e2: LEdge } {
  const graph = new LGraph()
  const a = makeNode()
  const b = makeNode()
  const d = makeNode(NodeType.LONG_EDGE)
  const aEast = addPort(a, PortSide.EAST)
  const dWest = addPort(d, PortSide.WEST)
  const dEast = addPort(d, PortSide.EAST)
  const bWest = addPort(b, PortSide.WEST)
  const e1 = addEdge(aEast, dWest)
  const e2 = addEdge(dEast, bWest)
  void addUnnecessary
  return { graph, a, b, d, e1, e2 }
}

describe('LongEdgeJoiner (ELK Java 移植)', () => {
  it('joinAt: 保留入边, 丢弃出边, 重连到原目标', () => {
    const { d, e1, e2 } = makeDummyChain(false)
    const bWest = e2.getTarget()!
    joinAt(d, false)
    expect(e1.getTarget()).toBe(bWest)
    expect(e1.getSource()!.getNode()!.getType()).toBe(NodeType.NORMAL)
    expect(e2.getSource()).toBeNull()
    expect(e2.getTarget()).toBeNull()
    // 入边按 dropped 原索引插入目标端口入边列表
    expect(bWest.getIncomingEdges()).toContain(e1)
  })

  it('joinAt: addUnnecessaryBendpoints=true 时添加 dummy 锚点弯点, 并迁移出边弯点', () => {
    const { a, b, d, e1, e2 } = makeDummyChain(true)
    // 给出边加弯点
    e2.getBendPoints().push({ x: 5, y: 6 })
    const dummyAnchor = { ...d.getPorts()[0]!.getAbsoluteAnchor() }
    joinAt(d, true)
    expect(e1.getBendPoints().length).toBe(2)
    expect(e1.getBendPoints()[0]).toEqual(dummyAnchor)
    expect(e1.getBendPoints()[1]).toEqual({ x: 5, y: 6 })
    void a; void b
  })

  it('joinAt: 迁移出边标签', () => {
    const { d, e1, e2 } = makeDummyChain(false)
    const label = { text: 'L', position: { x: 0, y: 0 }, size: { x: 10, y: 10 } }
    e2.getLabels().push(label)
    joinAt(d, false)
    expect(e1.getLabels()).toEqual([label])
  })

  it('joinAt: surviving 无 JUNCTION_POINTS, dropped 有 → 拷贝设置', () => {
    const { d, e1, e2 } = makeDummyChain(false)
    const jp = [{ x: 1, y: 2 }]
    e2.setProperty(JUNCTION_POINTS, jp)
    expect(e1.getProperty(JUNCTION_POINTS)).toBeNull()
    joinAt(d, false)
    expect(e1.getProperty(JUNCTION_POINTS)).toEqual(jp)
    // 拷贝而非共享引用
    expect(e1.getProperty(JUNCTION_POINTS)).not.toBe(jp)
  })

  it('joinAt: surviving 已有 JUNCTION_POINTS → 追加 dropped 的', () => {
    const { d, e1, e2 } = makeDummyChain(false)
    const jpSurviving = [{ x: 10, y: 20 }]
    const jpDropped = [{ x: 30, y: 40 }]
    e1.setProperty(JUNCTION_POINTS, jpSurviving)
    e2.setProperty(JUNCTION_POINTS, jpDropped)
    joinAt(d, false)
    expect(e1.getProperty(JUNCTION_POINTS)).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }])
  })

  it('processLongEdgeJoin: 从层中移除 LONG_EDGE dummy 并合并', () => {
    const graph = new LGraph()
    const layer = new Layer(graph)
    graph.getLayers().push(layer)
    const a = makeNode()
    const b = makeNode()
    const d = makeNode(NodeType.LONG_EDGE)
    a.setLayer(layer)
    d.setLayer(layer)
    b.setLayer(layer)
    const aEast = addPort(a, PortSide.EAST)
    const dWest = addPort(d, PortSide.WEST)
    const dEast = addPort(d, PortSide.EAST)
    const bWest = addPort(b, PortSide.WEST)
    const e1 = addEdge(aEast, dWest)
    const e2 = addEdge(dEast, bWest)
    processLongEdgeJoin(graph)
    expect(layer.getNodes()).toEqual([a, b])
    expect(e1.getTarget()).toBe(bWest)
    expect(e2.getSource()).toBeNull()
  })
})
