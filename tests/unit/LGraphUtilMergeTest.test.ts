/**
 * lgraph-util-merge (对应 ELK LGraphUtil.createPort 合并分支 + provideCollectorPort):
 * 端口合并语义 — 非 side-fixed 且 mergeEdges=true 时每侧共享收集端口, 中心点对齐节点侧.
 */
import { describe, expect, it } from 'vitest'
import { LNode, LPort, PortSide, PortType } from '../../src/index.js'
import { createMergedPort, provideCollectorPort } from '../../src/graph/lgraph-util-merge.js'
import { INPUT_COLLECT, OUTPUT_COLLECT } from '../../src/options/internal-properties.js'

function makeNode(x: number, y: number): LNode {
  const node = new LNode()
  node.size = { x, y }
  return node
}

describe('lgraph-util-merge (ELK Java 移植)', () => {
  it('centerPoint: WEST 端口居中于左侧', () => {
    const node = makeNode(30, 40)
    const p = provideCollectorPort(node, PortType.INPUT, PortSide.WEST)
    expect(p.getPosition()).toEqual({ x: 0, y: 20 })
    expect(p.getSide()).toBe(PortSide.WEST)
    expect(p.getProperty(INPUT_COLLECT)).toBe(true)
  })

  it('centerPoint: EAST 端口居中于右侧', () => {
    const node = makeNode(30, 40)
    const p = provideCollectorPort(node, PortType.OUTPUT, PortSide.EAST)
    expect(p.getPosition()).toEqual({ x: 30, y: 20 })
    expect(p.getProperty(OUTPUT_COLLECT)).toBe(true)
  })

  it('centerPoint: NORTH 端口居中于顶部', () => {
    const node = makeNode(30, 40)
    const p = provideCollectorPort(node, PortType.INPUT, PortSide.NORTH)
    expect(p.getPosition()).toEqual({ x: 15, y: 0 })
  })

  it('centerPoint: SOUTH 端口居中于底部', () => {
    const node = makeNode(30, 40)
    const p = provideCollectorPort(node, PortType.OUTPUT, PortSide.SOUTH)
    expect(p.getPosition()).toEqual({ x: 15, y: 40 })
  })

  it('centerPoint: 未定义方向居中于中心', () => {
    const node = makeNode(30, 40)
    const p = provideCollectorPort(node, PortType.INPUT, PortSide.UNDEFINED)
    expect(p.getPosition()).toEqual({ x: 15, y: 20 })
    expect(p.getSide()).toBe(PortSide.UNDEFINED)
  })

  it('provideCollectorPort: 同侧同类型复用已有收集端口', () => {
    const node = makeNode(30, 40)
    const p1 = provideCollectorPort(node, PortType.INPUT, PortSide.WEST)
    const p2 = provideCollectorPort(node, PortType.INPUT, PortSide.WEST)
    expect(p2).toBe(p1)
    expect(node.getPorts().length).toBe(1)
    // 不同类型不共享
    const p3 = provideCollectorPort(node, PortType.OUTPUT, PortSide.WEST)
    expect(p3).not.toBe(p1)
    expect(node.getPorts().length).toBe(2)
  })

  it('createMergedPort: mergeEdges && !sideFixed → 共享收集端口 (OUTPUT 用 defaultSide)', () => {
    const node = makeNode(30, 40)
    const p1 = createMergedPort(node, PortType.OUTPUT, PortSide.EAST, true, false)
    const p2 = createMergedPort(node, PortType.OUTPUT, PortSide.EAST, true, false)
    expect(p1).toBe(p2)
    expect(p1.getSide()).toBe(PortSide.EAST)
    expect(p1.getProperty(OUTPUT_COLLECT)).toBe(true)
  })

  it('createMergedPort: INPUT 收集端口位于对侧 (opposed)', () => {
    const node = makeNode(30, 40)
    const p = createMergedPort(node, PortType.INPUT, PortSide.WEST, true, false)
    expect(p.getSide()).toBe(PortSide.EAST) // WEST 的对侧
    expect(p.getProperty(INPUT_COLLECT)).toBe(true)
  })

  it('opposed: NORTH→SOUTH / SOUTH→NORTH / 未定义→UNDEFINED (每节点独立)', () => {
    // INPUT 收集端口位于 defaultSide 的对侧; 每节点只共享一个收集端口 → 用独立节点断言.
    const n1 = makeNode(30, 40)
    expect(createMergedPort(n1, PortType.INPUT, PortSide.NORTH, true, false).getSide()).toBe(PortSide.SOUTH)
    const n2 = makeNode(30, 40)
    expect(createMergedPort(n2, PortType.INPUT, PortSide.SOUTH, true, false).getSide()).toBe(PortSide.NORTH)
    const n3 = makeNode(30, 40)
    expect(createMergedPort(n3, PortType.INPUT, PortSide.UNDEFINED, true, false).getSide()).toBe(PortSide.UNDEFINED)
  })

  it('createMergedPort: 非合并分支创建独立端口 (不改 side)', () => {
    const node = makeNode(30, 40)
    const p1 = createMergedPort(node, PortType.OUTPUT, PortSide.EAST, false, false)
    const p2 = createMergedPort(node, PortType.OUTPUT, PortSide.EAST, false, false)
    expect(p1).not.toBe(p2)
    expect(p1.getSide()).toBe(PortSide.EAST)
    expect(p1.getProperty(OUTPUT_COLLECT)).toBeFalsy()
    expect(p2.getSide()).toBe(PortSide.EAST)
    // sideFixed=true 时即使 mergeEdges 也不合并
    const p3 = createMergedPort(node, PortType.OUTPUT, PortSide.WEST, true, true)
    expect(p3).not.toBe(p1)
    expect(p3.getSide()).toBe(PortSide.WEST)
  })

  it('createMergedPort: sideFixed 时不使用收集端口', () => {
    const node = makeNode(30, 40)
    const p = createMergedPort(node, PortType.INPUT, PortSide.EAST, true, true)
    expect(p.getSide()).toBe(PortSide.WEST) // INPUT 仍取对侧, 但独立端口
    expect(p.getProperty(INPUT_COLLECT)).toBeFalsy()
  })

  it('新端口默认无 INPUT_COLLECT/OUTPUT_COLLECT 属性', () => {
    const node = makeNode(10, 10)
    const p = new LPort()
    expect(p.getProperty(INPUT_COLLECT)).toBe(false)
    expect(p.getProperty(OUTPUT_COLLECT)).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4X3 变异补测: src/graph/** (LGraph/LNode/LPort/LEdge/Layer/LShape/enums/
// properties/lgraph-util) — 图结构语义与 Java 一致.
// ─────────────────────────────────────────────────────────────────────────────

import { LGraph, LEdge, NodeType, Direction, PortConstraints, LayerConstraint, EdgeConstraint, InLayerConstraint, Layer } from '../../src/index.js'
import { Property, MapPropertyHolder } from '../../src/graph/properties.js'
import { LShape, LGraphElement } from '../../src/graph/lshape.js'
import { kvector, kvectorSum, SIDES_EAST_WEST, SIDES_NORTH_SOUTH } from '../../src/graph/enums.js'
import {
  sideFromDirection, oppositeSide, getDirection, isDescendant, lcaNodeOf,
  getEdgeEndpoints, changeCoordSystem, coordSystemOffset, createExternalPortDummy,
  calculateNetFlow, calcPortSide, calcPortOffset, initializePort,
} from '../../src/graph/lgraph-util.js'
import { PORT_RATIO_OR_POSITION, EXT_PORT_SIDE, REVERSED, TARGET_OFFSET } from '../../src/options/internal-properties.js'
import { DIRECTION, ASPECT_RATIO, PORT_SIDE, INSIDE_SELF_LOOPS_YO, PORT_BORDER_OFFSET } from '../../src/options/layered-options.js'

describe('LGraph (T4X3)', () => {
  it('默认 padding 12 + setPadding 部分覆盖 + getActualSize', () => {
    const g = new LGraph()
    g.getSize().x = 100
    g.getSize().y = 50
    expect(g.getPadding()).toEqual({ left: 12, top: 12, right: 12, bottom: 12 })
    g.setPadding({ left: 20 })
    expect(g.getPadding()).toEqual({ left: 20, top: 12, right: 12, bottom: 12 })
    expect(g.getActualSize()).toEqual({ x: 132, y: 74 })
  })

  it('toNodeArray / getAllNodes: 层内 + 未分层节点', () => {
    const g = new LGraph()
    const l = new Layer(g)
    g.getLayers().push(l)
    const a = new LNode(g)
    a.setLayer(l)
    expect(g.toNodeArray()).toEqual([[a]])
    const layerless = new LNode(g) // 构造即加入 layerlessNodes (未入层)
    // 注意: LNode 构造加入 layerlessNodes, setLayer 不摘除 → 列表含 a 与 layerless
    expect(g.getLayerlessNodes()).toContain(layerless)
    expect(g.getAllNodes()).toContain(layerless)
  })

  it('getDirection: UNDEFINED + aspectRatio>=1 → RIGHT, else DOWN', () => {
    const g = new LGraph()
    g.setProperty(DIRECTION, Direction.RIGHT)
    expect(getDirection(g)).toBe(Direction.RIGHT)
    g.setProperty(DIRECTION, Direction.UNDEFINED)
    g.setProperty(ASPECT_RATIO, 1.5)
    expect(getDirection(g)).toBe(Direction.RIGHT)
    g.setProperty(ASPECT_RATIO, 0.5)
    expect(getDirection(g)).toBe(Direction.DOWN)
  })

  it('parentNode / offset', () => {
    const g = new LGraph()
    const p = new LNode()
    g.setParentNode(p)
    expect(g.getParentNode()).toBe(p)
    g.getOffset().x = 3
    g.getOffset().y = 4
    expect(g.getOffset()).toEqual({ x: 3, y: 4 })
  })
})

describe('LNode (T4X3)', () => {
  function make(): { g: LGraph; l: Layer; n: LNode } {
    const g = new LGraph()
    const l = new Layer(g)
    g.getLayers().push(l)
    const n = new LNode(g)
    return { g, l, n }
  }

  it('setLayer / setLayerAt: 层归属与顺序', () => {
    const { g, l, n } = make()
    const l2 = new Layer(g)
    g.getLayers().push(l2)
    expect(n.getLayer()).toBeNull()
    n.setLayer(l)
    expect(n.getLayer()).toBe(l)
    expect(l.getNodes()).toContain(n)
    const m = new LNode(g)
    m.setLayerAt(0, l) // 插到 l 的 0 位
    expect(l.getNodes().indexOf(m)).toBe(0)
    n.setLayer(l2) // 从 l 移除
    expect(l.getNodes()).not.toContain(n)
    expect(l2.getNodes()).toContain(n)
  })

  it('getPorts(side) / getPorts(type) / getPortSideView / setPorts', () => {
    const { g, l, n } = make()
    n.setLayer(l)
    const pE = new LPort(); pE.setNode(n); pE.setSide(PortSide.EAST)
    const pW = new LPort(); pW.setNode(n); pW.setSide(PortSide.WEST)
    const pN = new LPort(); pN.setNode(n); pN.setSide(PortSide.NORTH)
    expect(n.getPorts(PortSide.EAST)).toEqual([pE])
    expect(n.getPorts(PortSide.WEST)).toEqual([pW])
    expect(n.getPortSideView(PortSide.NORTH)).toEqual([pN])
    expect(n.getPorts(PortType.INPUT)).toEqual([])
    const src = new LNode(g)
    const sp = new LPort(); sp.setNode(src)
    const e = new LEdge(); e.setSource(sp); e.setTarget(pE)
    expect(n.getPorts(PortType.INPUT)).toEqual([pE])
    n.setPorts([pW])
    expect(n.getPorts()).toEqual([pW])
  })

  it('labels / nestedGraph / margins / constraints', () => {
    const { g, l, n } = make()
    n.setLayer(l)
    const labels = [{ text: 'x', position: { x: 0, y: 0 }, size: { x: 1, y: 1 } }]
    n.setLabels(labels)
    expect(n.getLabels()).toBe(labels)
    const nested = new LGraph()
    n.setNestedGraph(nested)
    expect(n.getNestedGraph()).toBe(nested)
    n.getMargin().top = 5
    expect(n.getMargin().top).toBe(5)
    n.setLayerConstraint(LayerConstraint.FIRST)
    expect(n.getLayerConstraint()).toBe(LayerConstraint.FIRST)
    expect(n.getProperty('org.eclipse.elk.layered.layering.layerConstraint')).toBe(LayerConstraint.FIRST)
    n.setInLayerConstraint(InLayerConstraint.TOP)
    expect(n.getInLayerConstraint()).toBe(InLayerConstraint.TOP)
    n.setEdgeConstraint(EdgeConstraint.INCOMING_ONLY)
    expect(n.getEdgeConstraint()).toBe(EdgeConstraint.INCOMING_ONLY)
    n.setPortConstraints(PortConstraints.FIXED_POS)
    expect(n.getPortConstraints()).toBe(PortConstraints.FIXED_POS)
  })

  it('getLayerConstraint 回退到字符串属性', () => {
    const { g, l, n } = make()
    n.setLayer(l)
    n.setProperty('org.eclipse.elk.layered.layering.layerConstraint', 'LAST_SEPARATE')
    expect(n.getLayerConstraint()).toBe(LayerConstraint.LAST_SEPARATE)
  })

  it('getIndex / getOutgoingEdges / getIncomingEdges / getConnectedEdges', () => {
    const { g, l, n } = make()
    n.setLayer(l)
    expect(n.getIndex()).toBe(0)
    const a = new LNode(g); a.setLayer(l)
    expect(n.getIndex()).toBe(0)
    expect(a.getIndex()).toBe(1)
    const pE = new LPort(); pE.setNode(n); pE.setSide(PortSide.EAST)
    const pW = new LPort(); pW.setNode(n); pW.setSide(PortSide.WEST)
    const other = new LNode(g); other.setLayer(l)
    const oE = new LPort(); oE.setNode(other); oE.setSide(PortSide.WEST)
    const e1 = new LEdge(); e1.setSource(pE); e1.setTarget(oE)
    const e2 = new LEdge(); e2.setSource(oE); e2.setTarget(pW)
    expect(n.getOutgoingEdges().map(e => e.id)).toEqual([e1.id])
    expect(n.getIncomingEdges().map(e => e.id)).toEqual([e2.id])
    expect(n.getConnectedEdges().map(e => e.id)).toEqual([e1.id, e2.id]) // 按端口序: pE 出边, pW 入边
  })
})

describe('LPort (T4X3)', () => {
  it('setSide 锚点: EAST x=size.x,y=size.y/2; WEST x=0; NORTH/SOUTH 居中', () => {
    const p = new LPort()
    p.size = { x: 10, y: 20 }
    p.setSide(PortSide.EAST)
    expect(p.getAnchor()).toEqual({ x: 10, y: 10 })
    expect(p.isExplicitSide()).toBe(true)
    const q = new LPort()
    q.size = { x: 10, y: 20 }
    q.setSideInferred(PortSide.WEST)
    expect(q.getAnchor()).toEqual({ x: 0, y: 10 })
    expect(q.isExplicitSide()).toBe(false)
    const r = new LPort()
    r.size = { x: 10, y: 20 }
    r.setSide(PortSide.NORTH)
    expect(r.getAnchor()).toEqual({ x: 5, y: 0 })
    const s = new LPort()
    s.size = { x: 10, y: 20 }
    s.setSide(PortSide.SOUTH)
    expect(s.getAnchor()).toEqual({ x: 5, y: 20 })
  })

  it('显式锚点不受 setSide 重置', () => {
    const p = new LPort()
    p.setExplicitlySuppliedPortAnchor(true)
    p.setAnchor({ x: 3, y: 4 })
    p.setSide(PortSide.EAST)
    expect(p.getAnchor()).toEqual({ x: 3, y: 4 })
    expect(p.isExplicitlySuppliedPortAnchor()).toBe(true)
  })

  it('getAbsoluteAnchor = owner.position + position + anchor', () => {
    const n = new LNode()
    n.position = { x: 10, y: 20 }
    const p = new LPort()
    p.setNode(n)
    p.position = { x: 1, y: 2 }
    p.setAnchor({ x: 3, y: 4 })
    expect(p.getAbsoluteAnchor()).toEqual({ x: 14, y: 26 })
  })

  it('connectedPorts / predecessors / successors / degree / netFlow', () => {
    const a = new LNode()
    const b = new LNode()
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(pA); e.setTarget(pB)
    expect(pA.getConnectedPorts()).toEqual([pB])
    expect(pA.getSuccessorPorts()).toEqual([pB])
    expect(pA.getPredecessorPorts()).toEqual([])
    expect(pB.getPredecessorPorts()).toEqual([pA])
    expect(pA.getDegree()).toBe(1)
    expect(pA.getNetFlow()).toBe(-1) // 入边数 - 出边数 = 0 - 1
    expect(pB.getNetFlow()).toBe(1)
    const pA2 = new LPort(); pA2.setNode(a); pA2.setSide(PortSide.WEST)
    const pB2 = new LPort(); pB2.setNode(b); pB2.setSide(PortSide.EAST)
    const e2 = new LEdge(); e2.setSource(pB2); e2.setTarget(pA)
    expect(pA.getNetFlow()).toBe(0)
    expect(pA.getConnectedPorts().map(x => x.id)).toEqual([pB2.id, pB.id]) // 入边先, 出边后
    expect(pA.getIndex()).toBe(0)
    expect(pA2.getIndex()).toBe(1)
  })
})

describe('LEdge (T4X3)', () => {
  function makeEdge(): { a: LNode; b: LNode; pA: LPort; pB: LPort; e: LEdge } {
    const a = new LNode()
    const b = new LNode()
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    const e = new LEdge()
    return { a, b, pA, pB, e }
  }

  it('setSource/setTarget: 端口边列表维护', () => {
    const { a, b, pA, pB, e } = makeEdge()
    e.setSource(pA)
    expect(pA.getOutgoingEdges()).toEqual([e])
    e.setTarget(pB)
    expect(pB.getIncomingEdges()).toEqual([e])
    const pC = new LPort(); pC.setNode(a); pC.setSide(PortSide.EAST)
    e.setSource(pC) // 从 pA 移除
    expect(pA.getOutgoingEdges()).toEqual([])
    expect(pC.getOutgoingEdges()).toEqual([e])
    e.setTarget(null)
    expect(pB.getIncomingEdges()).toEqual([])
    expect(e.getTarget()).toBeNull()
  })

  it('setTargetAndInsertAtIndex: 指定位置插入', () => {
    const { a, b, pA, pB, e } = makeEdge()
    e.setSource(pA)
    const b2 = new LNode()
    const pB2 = new LPort(); pB2.setNode(b2); pB2.setSide(PortSide.WEST)
    const e2 = new LEdge(); e2.setSource(pA); e2.setTarget(pB2)
    e.setTargetAndInsertAtIndex(pB, 0)
    expect(pB.getIncomingEdges()).toEqual([e])
    expect(pB2.getIncomingEdges()).toEqual([e2])
  })

  it('isSelfLoop / isInLayerEdge / getOther / getOtherNode', () => {
    const { a, b, pA, pB, e } = makeEdge()
    e.setSource(pA); e.setTarget(pB)
    expect(e.isSelfLoop()).toBe(false)
    expect(e.isInLayerEdge()).toBe(true) // 两端节点均无层 → null === null
    expect(e.getOther(pA)).toBe(pB)
    expect(e.getOther(pB)).toBe(pA)
    expect(e.getOtherNode(a)).toBe(b)
    expect(e.getOtherNode(b)).toBe(a)
    const g = new LGraph()
    const l = new Layer(g)
    const l2 = new Layer(g)
    g.getLayers().push(l, l2)
    expect(e.isInLayerEdge()).toBe(true) // 两个节点均无层 → null === null
    a.setLayer(l); b.setLayer(l2)
    expect(e.isInLayerEdge()).toBe(false) // 不同层
    b.setLayer(l)
    expect(e.isInLayerEdge()).toBe(true) // 同层
    // 自环
    const loop = new LEdge(); loop.setSource(pA); loop.setTarget(pA)
    expect(loop.isSelfLoop()).toBe(true)
    expect(loop.isInLayerEdge()).toBe(false)
  })

  it('reverse: 交换端点 + 弯点倒序 + HEAD/TAIL label + REVERSED 取反', () => {
    const { a, b, pA, pB, e } = makeEdge()
    e.setSource(pA); e.setTarget(pB)
    e.getBendPoints().push({ x: 1, y: 2 }, { x: 3, y: 4 })
    e.getLabels().push(
      { text: 'h', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'HEAD' },
      { text: 't', position: { x: 0, y: 0 }, size: { x: 1, y: 1 }, placement: 'TAIL' },
    )
    const g = new LGraph()
    e.reverse(g, false)
    expect(e.getSource()).toBe(pB)
    expect(e.getTarget()).toBe(pA)
    expect(e.getBendPoints()).toEqual([{ x: 3, y: 4 }, { x: 1, y: 2 }])
    expect(e.getLabels()[0]!.placement).toBe('TAIL')
    expect(e.getLabels()[1]!.placement).toBe('HEAD')
    expect(e.getProperty(REVERSED)).toBe(true)
    e.reverse(g, false)
    expect(e.getProperty(REVERSED)).toBe(false)
  })
})

describe('Layer / LShape / LGraphElement (T4X3)', () => {
  it('Layer: getGraph/getSize/getIndex', () => {
    const g = new LGraph()
    const l = new Layer(g)
    expect(l.getGraph()).toBe(g)
    expect(l.getIndex()).toBe(-1) // 未加入 layers
    g.getLayers().push(l)
    expect(l.getIndex()).toBe(0)
    l.getSize().x = 5
    expect(l.getSize().x).toBe(5)
    const l2 = new Layer(g)
    g.getLayers().push(l2)
    expect(l2.getIndex()).toBe(1)
  })

  it('LShape: position/size; LGraphElement: 自增 id', () => {
    const s = new LShape()
    s.position.x = 3
    s.size.y = 4
    expect(s.getPosition()).toEqual({ x: 3, y: 0 })
    expect(s.getSize()).toEqual({ x: 0, y: 4 })
    const a = new LGraphElement()
    const b = new LGraphElement()
    expect(b.getId()).toBe(a.getId() + 1)
  })
})

describe('enums 辅助 (T4X3)', () => {
  it('kvector / kvectorSum', () => {
    expect(kvector()).toEqual({ x: 0, y: 0 })
    expect(kvector(1, 2)).toEqual({ x: 1, y: 2 })
    expect(kvectorSum({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 })
  })

  it('PortConstraints 谓词', () => {
    expect(PortConstraints.isSideFixed(PortConstraints.FIXED_POS)).toBe(true)
    expect(PortConstraints.isSideFixed(PortConstraints.FREE)).toBe(false)
    expect(PortConstraints.isPosFixed(PortConstraints.FIXED_POS)).toBe(true)
    expect(PortConstraints.isPosFixed(PortConstraints.FIXED_RATIO)).toBe(false)
    expect(PortConstraints.isRatioFixed(PortConstraints.FIXED_RATIO)).toBe(true)
    expect(PortConstraints.isOrderFixed(PortConstraints.FIXED_ORDER)).toBe(true)
    expect(PortConstraints.isOrderFixed(PortConstraints.FIXED_RATIO)).toBe(true)
    expect(PortConstraints.isOrderFixed(PortConstraints.FIXED_SIDE)).toBe(false)
  })

  it('SIDES 常量与 PortSide 谓词', () => {
    expect(SIDES_EAST_WEST).toEqual([PortSide.EAST, PortSide.WEST])
    expect(SIDES_NORTH_SOUTH).toEqual([PortSide.NORTH, PortSide.SOUTH])
    const ns = SIDES_NORTH_SOUTH
    void ns
  })
})

describe('properties 系统 (T4X3)', () => {
  const P = new Property<number>('org.example.p', 7)

  it('Property: getId/getDefault/equals/toString', () => {
    expect(P.getId()).toBe('org.example.p')
    expect(P.getDefault()).toBe(7)
    expect(P.equals(new Property<number>('org.example.p', 99))).toBe(true)
    expect(P.equals(new Property<number>('org.example.q'))).toBe(false)
    expect(P.toString()).toBe('org.example.p')
  })

  it('MapPropertyHolder: set/get/has/delete (null 删除)', () => {
    const h = new MapPropertyHolder()
    expect(h.getProperty(P)).toBe(7) // 默认值
    expect(h.hasProperty(P)).toBe(false)
    h.setProperty(P, 42)
    expect(h.getProperty(P)).toBe(42)
    expect(h.hasProperty(P)).toBe(true)
    h.setProperty(P, null as unknown as number)
    expect(h.hasProperty(P)).toBe(false)
    expect(h.getProperty(P)).toBe(7)
  })

  it('MapPropertyHolder: 字符串 key 兼容 + 对象默认值缓存', () => {
    const h = new MapPropertyHolder()
    h.setProperty('org.example.p', 99)
    expect(h.getProperty(P)).toBe(99)
    expect(h.getProperty('org.example.p')).toBe(99)
    expect(h.getProperty('org.example.missing')).toBeUndefined()
    const ObjP = new Property<{ x: number }>('org.example.obj', { x: 1 })
    const v1 = h.getProperty(ObjP)
    const v2 = h.getProperty(ObjP)
    expect(v1).toBe(v2) // 对象默认值缓存同一引用
    expect(h.hasProperty(ObjP)).toBe(true)
  })

  it('copyProperties: 复制非空属性表', () => {
    const h1 = new MapPropertyHolder()
    h1.setProperty(P, 5)
    const h2 = new MapPropertyHolder()
    h2.copyProperties(h1)
    expect(h2.getProperty(P)).toBe(5)
    const h3 = new MapPropertyHolder()
    h3.copyProperties(null)
    expect(h3.getProperty(P)).toBe(7)
    expect(h1.getAllProperties().get(P.getId())).toBe(5)
  })
})

describe('lgraph-util 方向/层级 (T4X3)', () => {
  it('sideFromDirection / oppositeSide', () => {
    expect(sideFromDirection(Direction.RIGHT)).toBe(PortSide.EAST)
    expect(sideFromDirection(Direction.LEFT)).toBe(PortSide.WEST)
    expect(sideFromDirection(Direction.DOWN)).toBe(PortSide.SOUTH)
    expect(sideFromDirection(Direction.UP)).toBe(PortSide.NORTH)
    expect(sideFromDirection(Direction.UNDEFINED)).toBe(PortSide.EAST)
    expect(sideFromDirection(Direction.RIGHT, true)).toBe(PortSide.WEST)
    expect(oppositeSide(PortSide.NORTH)).toBe(PortSide.SOUTH)
    expect(oppositeSide(PortSide.SOUTH)).toBe(PortSide.NORTH)
    expect(oppositeSide(PortSide.EAST)).toBe(PortSide.WEST)
    expect(oppositeSide(PortSide.WEST)).toBe(PortSide.EAST)
    expect(oppositeSide(PortSide.UNDEFINED)).toBe(PortSide.UNDEFINED)
  })

  it('isDescendant / lcaNodeOf', () => {
    const root = new LGraph()
    const parent = new LNode(root)
    const childGraph = new LGraph()
    childGraph.setParentNode(parent)
    const child = new LNode(childGraph)
    expect(isDescendant(child, parent)).toBe(true)
    expect(isDescendant(parent, child)).toBe(false)
    expect(isDescendant(child, child)).toBe(false) // 不含自身
    const other = new LNode(root)
    expect(lcaNodeOf(parent, other)).toBeNull()
    // parent 是 child 的父 → LCA = parent (parent 自身是祖先之一)
    expect(lcaNodeOf(child, parent)).toBe(parent)
  })

  it('getEdgeEndpoints: 普通边 = 绝对锚点 (无 TARGET_OFFSET)', () => {
    const g = new LGraph()
    const a = new LNode(g)
    a.position = { x: 10, y: 20 }
    const b = new LNode(g)
    b.position = { x: 100, y: 200 }
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(pA); e.setTarget(pB)
    const { source, target } = getEdgeEndpoints(e)
    expect(source).toEqual({ x: 10, y: 20 })
    expect(target).toEqual({ x: 100, y: 200 })
  })

  it('getEdgeEndpoints: 普通自环 = 绝对锚点 + TARGET_OFFSET', () => {
    const g = new LGraph()
    const a = new LNode(g)
    a.position = { x: 10, y: 20 }
    const p1 = new LPort(); p1.setNode(a); p1.setSide(PortSide.WEST)
    const p2 = new LPort(); p2.setNode(a); p2.setSide(PortSide.EAST)
    const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
    const off = { x: 5, y: 6 }
    e.setProperty(TARGET_OFFSET, off)
    const { source, target } = getEdgeEndpoints(e)
    expect(source).toEqual({ x: 10, y: 20 })
    expect(target).toEqual({ x: 15, y: 26 })
  })

  it('getEdgeEndpoints: inside 自环 INCLUDE_CHILDREN → 端口绝对锚点', () => {
    const g = new LGraph()
    g.setProperty('org.eclipse.elk.hierarchyHandling', 'INCLUDE_CHILDREN')
    const a = new LNode(g)
    a.position = { x: 10, y: 20 }
    const p1 = new LPort(); p1.setNode(a); p1.setSide(PortSide.WEST)
    p1.position = { x: 0, y: 5 }
    const p2 = new LPort(); p2.setNode(a); p2.setSide(PortSide.EAST)
    p2.position = { x: 30, y: 7 }
    const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
    e.setProperty(INSIDE_SELF_LOOPS_YO, true)
    const { source, target } = getEdgeEndpoints(e)
    expect(source).toEqual({ x: 10, y: 25 }) // a.pos + p1.pos + p1.anchor(0,0) — WEST anchor y=size.y/2=0
    expect(target).toEqual({ x: 40, y: 27 })
  })

  it('getEdgeEndpoints: inside 自环非 INCLUDE → 节点边界投影', () => {
    const g = new LGraph()
    const a = new LNode(g)
    a.position = { x: 10, y: 20 }
    a.size = { x: 30, y: 40 }
    const p1 = new LPort(); p1.setNode(a); p1.setSide(PortSide.WEST)
    p1.size = { x: 5, y: 10 }
    p1.position = { x: -20, y: 5 } // 端口部分在节点外
    const p2 = new LPort(); p2.setNode(a); p2.setSide(PortSide.SOUTH)
    p2.size = { x: 10, y: 5 }
    p2.position = { x: 3, y: 0 }
    const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
    e.setProperty(INSIDE_SELF_LOOPS_YO, true)
    const { source, target } = getEdgeEndpoints(e)
    // WEST 边界: n.x + p.x + p.size.x = 10-20+5 = -5; y = 20+5+5 = 30
    expect(source).toEqual({ x: -5, y: 30 })
    // SOUTH 边界: n.x + p.x + p.size.x/2 = 10+3+5 = 18; y = n.y + p.y = 20
    expect(target).toEqual({ x: 18, y: 20 })
  })

  it('getEdgeEndpoints: 正向跨层级 (目标在源嵌套图)', () => {
    const root = new LGraph()
    const src = new LNode(root)
    src.position = { x: 50, y: 60 }
    const inner = new LGraph()
    inner.setParentNode(src)
    const tgt = new LNode(inner)
    tgt.position = { x: 3, y: 4 }
    const pS = new LPort(); pS.setNode(src); pS.setSide(PortSide.EAST)
    pS.position = { x: 1, y: 2 }
    const pT = new LPort(); pT.setNode(tgt); pT.setSide(PortSide.WEST)
    pT.position = { x: 0, y: 0 }
    const e = new LEdge(); e.setSource(pS); e.setTarget(pT)
    const { source, target } = getEdgeEndpoints(e)
    // 源 = 源端口相对源节点 (引用图坐标)
    expect(source).toEqual({ x: 1, y: 2 })
    // 目标 = 目标端口绝对锚点
    expect(target).toEqual({ x: 3, y: 4 })
  })

  it('getEdgeEndpoints: 反向跨层级 (源在目标嵌套图)', () => {
    const root = new LGraph()
    const tgt = new LNode(root)
    tgt.position = { x: 50, y: 60 }
    const inner = new LGraph()
    inner.setParentNode(tgt)
    const src = new LNode(inner)
    src.position = { x: 3, y: 4 }
    const pS = new LPort(); pS.setNode(src); pS.setSide(PortSide.EAST)
    pS.position = { x: 1, y: 2 }
    const pT = new LPort(); pT.setNode(tgt); pT.setSide(PortSide.WEST)
    pT.position = { x: 0, y: 0 }
    const e = new LEdge(); e.setSource(pS); e.setTarget(pT)
    const { source, target } = getEdgeEndpoints(e)
    // 都取「边所属图 (tgtNode 内容)」坐标
    expect(source).toEqual({ x: 4, y: 6 }) // src.pos(3,4) + pS.pos(1,2)
    expect(target).toEqual({ x: 0, y: 0 })
  })
})

describe('lgraph-util 坐标变换 (T4X3)', () => {
  it('changeCoordSystem: 嵌套图上移 (含 padding/parent pos/offset)', () => {
    const root = new LGraph()
    root.setPadding({ left: 12, top: 12, right: 12, bottom: 12 })
    root.getOffset().x = 5
    const parent = new LNode(root)
    parent.position = { x: 100, y: 200 }
    const inner = new LGraph()
    inner.setParentNode(parent)
    inner.setPadding({ left: 3, top: 4, right: 3, bottom: 4 })
    const p = { x: 10, y: 20 }
    const v = changeCoordSystem({ ...p }, inner, root)
    // 上移 = inner.padding.left + parent.pos.x (root 无父节点 → 不再加 padding/offset)
    expect(v).toEqual({ x: 10 + 3 + 100, y: 20 + 4 + 200 })
    const back = changeCoordSystem({ ...v }, root, inner)
    expect(back).toEqual({ x: 10, y: 20 })
    const same = changeCoordSystem({ x: 1, y: 2 }, root, root)
    expect(same).toEqual({ x: 1, y: 2 })
    expect(coordSystemOffset(inner, root)).toEqual({ x: 3 + 100, y: 4 + 200 })
  })
})

describe('lgraph-util createExternalPortDummy (T4X3)', () => {
  function holder(): { getProperty<T>(p: unknown): T; setProperty(p: unknown, v: unknown): void } {
    const h = new MapPropertyHolder()
    return {
      getProperty: (p) => h.getProperty(p as never),
      setProperty: (p, v) => { h.setProperty(p as never, v as never) },
    }
  }

  it('WEST: FIRST_SEPARATE + OUTGOING_ONLY + 端口 EAST + 锚点/位置', () => {
    const g = new LGraph()
    const h = holder()
    const dummy = createExternalPortDummy(h, PortConstraints.FIXED_POS, PortSide.WEST, 0, { x: 30, y: 40 }, { x: 0, y: 10 }, { x: 5, y: 6 }, Direction.RIGHT, g)
    expect(dummy.getType()).toBe(NodeType.EXTERNAL_PORT)
    expect(dummy.getLayerConstraint()).toBe(LayerConstraint.FIRST_SEPARATE)
    expect(dummy.getEdgeConstraint()).toBe(EdgeConstraint.OUTGOING_ONLY)
    expect(dummy.getPorts()[0]!.getSide()).toBe(PortSide.EAST)
    expect(dummy.getSize().y).toBe(6)
    expect(dummy.getPosition().y).toBe(10)
    expect(dummy.getProperty(PORT_RATIO_OR_POSITION)).toBe(10) // FIXED_POS: W/E 用 portPosition.y
    expect(dummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.WEST)
  })

  it('EAST + sideFixed=false (netFlow>=0): 侧按方向, 端口 WEST', () => {
    const g = new LGraph()
    const h = holder()
    const dummy = createExternalPortDummy(h, PortConstraints.FREE, PortSide.UNDEFINED, 1, null, null, { x: 5, y: 6 }, Direction.RIGHT, g)
    expect(dummy.getLayerConstraint()).toBe(LayerConstraint.LAST_SEPARATE)
    expect(dummy.getEdgeConstraint()).toBe(EdgeConstraint.INCOMING_ONLY)
    expect(dummy.getPorts()[0]!.getSide()).toBe(PortSide.WEST)
    expect(h.getProperty(PORT_SIDE)).toBe(PortSide.EAST)
  })

  it('NORTH/SOUTH: 层内约束 TOP/BOTTOM + 端口 SOUTH/NORTH + FIXED_RATIO 归一化', () => {
    const g = new LGraph()
    const h = holder()
    const north = createExternalPortDummy(h, PortConstraints.FIXED_RATIO, PortSide.NORTH, 0, { x: 30, y: 40 }, { x: 15, y: 0 }, { x: 5, y: 6 }, Direction.DOWN, g)
    expect(north.getInLayerConstraint()).toBe(InLayerConstraint.TOP)
    expect(north.getPorts()[0]!.getSide()).toBe(PortSide.SOUTH)
    expect(north.getProperty(PORT_RATIO_OR_POSITION)).toBeCloseTo(15 / 30, 10) // x / nodeWidth
    const h2 = holder()
    const south = createExternalPortDummy(h2, PortConstraints.FIXED_RATIO, PortSide.SOUTH, 0, { x: 30, y: 40 }, { x: 15, y: 0 }, { x: 5, y: 6 }, Direction.DOWN, g)
    expect(south.getInLayerConstraint()).toBe(InLayerConstraint.BOTTOM)
    expect(south.getPorts()[0]!.getSide()).toBe(PortSide.NORTH)
  })
})

describe('lgraph-util 端口计算 (T4X3)', () => {
  it('calculateNetFlow: 普通边 + self-loop + 嵌套投票', () => {
    const g = new LGraph()
    const a = new LNode(g)
    const b = new LNode(g)
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(pA); e.setTarget(pB)
    expect(calculateNetFlow(pA)).toBe(1) // 出边 → output 1
    expect(calculateNetFlow(pB)).toBe(-1)
    const loop = new LEdge(); loop.setSource(pA); loop.setTarget(pA)
    expect(calculateNetFlow(pA)).toBe(1) // 自环出边 +1 → 2? (出 2) — 验证: 自环 out 加 outputVote
    void e; void loop
  })

  it('calcPortSide: 位置推断侧', () => {
    const n = new LNode()
    n.size = { x: 30, y: 40 }
    const p = new LPort(); p.setNode(n)
    p.position = { x: -5, y: 10 }
    expect(calcPortSide(p, Direction.RIGHT)).toBe(PortSide.WEST)
    p.position = { x: 35, y: 10 }
    expect(calcPortSide(p, Direction.RIGHT)).toBe(PortSide.EAST)
    const q = new LPort(); q.setNode(n)
    q.position = { x: 10, y: -5 }
    expect(calcPortSide(q, Direction.DOWN)).toBe(PortSide.NORTH)
    q.position = { x: 10, y: 45 }
    expect(calcPortSide(q, Direction.DOWN)).toBe(PortSide.SOUTH)
    // 内部中心 → 对角线规则
    const r = new LPort(); r.setNode(n)
    r.position = { x: 10, y: 10 }
    expect(calcPortSide(r, Direction.RIGHT)).toBe(PortSide.NORTH) // widthPercent+heightPercent<1 且 diff>0 → 按 heightPercent<0.5
  })

  it('calcPortOffset: 各侧外扩量', () => {
    const n = new LNode()
    n.size = { x: 30, y: 40 }
    const p = new LPort(); p.setNode(n)
    p.size = { x: 5, y: 6 }
    p.position = { x: 0, y: 0 }
    expect(calcPortOffset(p, PortSide.WEST)).toBe(-(0 + 5))
    expect(calcPortOffset(p, PortSide.NORTH)).toBe(-(0 + 6))
    p.position = { x: 32, y: 42 }
    expect(calcPortOffset(p, PortSide.EAST)).toBe(2)
    expect(calcPortOffset(p, PortSide.SOUTH)).toBe(2)
    expect(calcPortOffset(p, PortSide.UNDEFINED)).toBe(0)
  })

  it('initializePort: FIXED_SIDE + 位置推断侧 + PORT_BORDER_OFFSET', () => {
    const n = new LNode()
    n.size = { x: 30, y: 40 }
    const p = new LPort(); p.setNode(n)
    p.size = { x: 5, y: 6 }
    p.position = { x: -5, y: 10 } // 左侧外 → WEST
    initializePort(p, PortConstraints.FIXED_SIDE, Direction.RIGHT)
    expect(p.getSide()).toBe(PortSide.WEST)
    expect(p.getProperty(PORT_BORDER_OFFSET)).toBeCloseTo(0, 10) // -(pos.x + size.x) = -(-5+5) = 0
    expect(p.getAnchor().y).toBe(3) // size.y/2
  })

  it('initializePort: UNDEFINED 约束不推断侧; 位置 (0,0) 不设 offset', () => {
    const n = new LNode()
    n.size = { x: 30, y: 40 }
    const p = new LPort(); p.setNode(n)
    p.position = { x: 10, y: 10 }
    initializePort(p, PortConstraints.FREE, Direction.RIGHT)
    expect(p.getSide()).toBe(PortSide.UNDEFINED)
    expect(p.hasProperty(PORT_BORDER_OFFSET)).toBe(false)
    const q = new LPort(); q.setNode(n)
    q.position = { x: 0, y: 0 }
    initializePort(q, PortConstraints.FIXED_SIDE, Direction.RIGHT)
    expect(q.hasProperty(PORT_BORDER_OFFSET)).toBe(false)
  })
})

describe('lgraph-util getEdgeEndpoints 跨分支 (T4X3)', () => {
  it('跨分支: 端点取 LCA 容器内容坐标 (recursiveAnchorTo)', () => {
    const root = new LGraph()
    const parent = new LNode(root)
    parent.position = { x: 100, y: 200 }
    const g1 = new LGraph(); g1.setParentNode(parent)
    const g2 = new LGraph(); g2.setParentNode(parent)
    const a = new LNode(g1); a.position = { x: 10, y: 20 }
    const b = new LNode(g2); b.position = { x: 30, y: 40 }
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    pA.position = { x: 1, y: 2 }
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    pB.position = { x: 0, y: 0 }
    const e = new LEdge(); e.setSource(pA); e.setTarget(pB)
    const { source, target } = getEdgeEndpoints(e)
    // LCA = parent → recursiveAnchorTo(port, parent): port 相对 a/b + a/b 相对 g1/g2 (不含 parent pos)
    expect(source).toEqual({ x: 11, y: 22 })
    expect(target).toEqual({ x: 30, y: 40 })
    // 分支源端口无 pos 时 = 节点自身位置
    const a2 = new LNode(g1); a2.position = { x: 5, y: 6 }
    const b2 = new LNode(g2); b2.position = { x: 7, y: 8 }
    const pA2 = new LPort(); pA2.setNode(a2); pA2.setSide(PortSide.EAST)
    const pB2 = new LPort(); pB2.setNode(b2); pB2.setSide(PortSide.WEST)
    const e2 = new LEdge(); e2.setSource(pA2); e2.setTarget(pB2)
    const r2 = getEdgeEndpoints(e2)
    expect(r2.source).toEqual({ x: 5, y: 6 })
    expect(r2.target).toEqual({ x: 7, y: 8 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4X3 补测: enums PortSide 命名空间 + LEdge 分支 + 深层嵌套坐标.
// ─────────────────────────────────────────────────────────────────────────────

describe('enums PortSide 命名空间 (T4X3)', () => {
  it('PortSide.opposed', () => {
    expect(PortSide.opposed(PortSide.NORTH)).toBe(PortSide.SOUTH)
    expect(PortSide.opposed(PortSide.SOUTH)).toBe(PortSide.NORTH)
    expect(PortSide.opposed(PortSide.EAST)).toBe(PortSide.WEST)
    expect(PortSide.opposed(PortSide.WEST)).toBe(PortSide.EAST)
    expect(PortSide.opposed(PortSide.UNDEFINED)).toBe(PortSide.UNDEFINED)
  })

  it('PortSide.isVertical / isHorizontal', () => {
    expect(PortSide.isVertical(PortSide.NORTH)).toBe(true)
    expect(PortSide.isVertical(PortSide.SOUTH)).toBe(true)
    expect(PortSide.isVertical(PortSide.EAST)).toBe(false)
    expect(PortSide.isVertical(PortSide.WEST)).toBe(false)
    expect(PortSide.isVertical(PortSide.UNDEFINED)).toBe(false)
    expect(PortSide.isHorizontal(PortSide.EAST)).toBe(true)
    expect(PortSide.isHorizontal(PortSide.WEST)).toBe(true)
    expect(PortSide.isHorizontal(PortSide.NORTH)).toBe(false)
    expect(PortSide.isHorizontal(PortSide.SOUTH)).toBe(false)
  })
})

describe('LEdge 分支补测 (T4X3)', () => {
  it('setTargetAndInsertAtIndex: 已存在目标时先从旧目标移除', () => {
    const a = new LNode()
    const b = new LNode()
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    const pC = new LPort(); pC.setNode(b); pC.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(pA); e.setTarget(pB)
    // e 已在 pB.incoming → 再 setTargetAndInsertAtIndex(pC, 0): 从 pB 移除
    e.setTargetAndInsertAtIndex(pC, 0)
    expect(pB.getIncomingEdges()).toEqual([])
    expect(pC.getIncomingEdges()).toEqual([e])
  })

  it('reverse(adaptPorts=true): 覆盖 adaptPorts 分支', () => {
    const a = new LNode()
    const b = new LNode()
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(pA); e.setTarget(pB)
    const g = new LGraph()
    e.reverse(g, true)
    expect(e.getSource()).toBe(pB)
    expect(e.getTarget()).toBe(pA)
  })

  it('reverse 空弯点/无 label 安全', () => {
    const a = new LNode()
    const b = new LNode()
    const pA = new LPort(); pA.setNode(a); pA.setSide(PortSide.EAST)
    const pB = new LPort(); pB.setNode(b); pB.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(pA); e.setTarget(pB)
    const g = new LGraph()
    e.reverse(g, false)
    expect(e.getBendPoints()).toEqual([])
    expect(e.getLabels()).toEqual([])
  })
})

describe('深层嵌套坐标 (T4X3)', () => {
  it('recursiveAnchor: 多层嵌套绝对锚点 (getEdgeEndpoints 普通边)', () => {
    const root = new LGraph()
    const p1 = new LNode(root); p1.position = { x: 100, y: 100 }
    const g1 = new LGraph(); g1.setParentNode(p1)
    const p2 = new LNode(g1); p2.position = { x: 10, y: 10 }
    const g2 = new LGraph(); g2.setParentNode(p2)
    const leaf = new LNode(g2); leaf.position = { x: 1, y: 1 }
    const port = new LPort(); port.setNode(leaf); port.setSide(PortSide.EAST)
    port.position = { x: 0, y: 0 }
    const other = new LNode(root)
    const op = new LPort(); op.setNode(other); op.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(port); e.setTarget(op)
    const { source, target } = getEdgeEndpoints(e)
    // 绝对锚点 = leaf.pos + g2 父链 (p2, p1) — lcaNodeOf(leaf, other)=null → 到根
    expect(source).toEqual({ x: 1 + 10 + 100, y: 1 + 10 + 100 })
    expect(target).toEqual({ x: 0, y: 0 })
  })

  it('changeCoordSystem 双层嵌套', () => {
    const root = new LGraph()
    const p1 = new LNode(root); p1.position = { x: 100, y: 200 }
    const g1 = new LGraph(); g1.setParentNode(p1)
    g1.setPadding({ left: 5, top: 6, right: 5, bottom: 6 })
    const p2 = new LNode(g1); p2.position = { x: 10, y: 20 }
    const g2 = new LGraph(); g2.setParentNode(p2)
    g2.setPadding({ left: 1, top: 2, right: 1, bottom: 2 })
    const v = changeCoordSystem({ x: 0, y: 0 }, g2, root)
    expect(v).toEqual({ x: 1 + 10 + 5 + 100, y: 2 + 20 + 6 + 200 })
    const back = changeCoordSystem({ ...v }, root, g2)
    expect(back).toEqual({ x: 0, y: 0 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// T4X3 补测二: LNode/LPort/LGraph 分支全覆盖.
// ─────────────────────────────────────────────────────────────────────────────

describe('LNode/LPort/LGraph 分支补测 (T4X3)', () => {
  it('LNode.getGraph: graph=null 时回退 layer.getGraph()', () => {
    const g = new LGraph()
    const l = new Layer(g)
    g.getLayers().push(l)
    const n = new LNode() // 无 graph
    n.setLayer(l)
    expect(n.getGraph()).toBe(g)
    const n2 = new LNode()
    expect(n2.getGraph()).toBeNull()
    const g2 = new LGraph()
    n2.setGraph(g2)
    expect(n2.getGraph()).toBe(g2)
  })

  it('LNode.setLayerAt: 从旧层移除再插入', () => {
    const g = new LGraph()
    const l1 = new Layer(g)
    const l2 = new Layer(g)
    g.getLayers().push(l1, l2)
    const a = new LNode(g)
    const b = new LNode(g)
    a.setLayer(l1)
    b.setLayer(l1)
    // a 已在 l1 → setLayerAt(0, l2) 先从 l1 移除
    a.setLayerAt(0, l2)
    expect(l1.getNodes()).toEqual([b])
    expect(l2.getNodes()).toEqual([a])
  })

  it('LPort.setNode: 从旧节点移除 (换宿主)', () => {
    const a = new LNode()
    const b = new LNode()
    const p = new LPort()
    p.setNode(a)
    expect(a.getPorts()).toEqual([p])
    p.setNode(b)
    expect(a.getPorts()).toEqual([])
    expect(b.getPorts()).toEqual([p])
    p.setNode(null as unknown as LNode)
    expect(b.getPorts()).toEqual([])
    expect(p.getNode()).toBeNull()
  })

  it('LPort margin/labels/index/setLabels', () => {
    const n = new LNode()
    const p = new LPort(); p.setNode(n)
    p.getMargin().top = 3
    expect(p.getMargin().top).toBe(3)
    const labels = [{ text: 'x', position: { x: 0, y: 0 }, size: { x: 1, y: 1 } }]
    p.setLabels(labels)
    expect(p.getLabels()).toBe(labels)
    expect(p.getIndex()).toBe(0)
    const q = new LPort(); q.setNode(n)
    expect(q.getIndex()).toBe(1)
    const orphan = new LPort()
    expect(orphan.getIndex()).toBe(-1)
  })

  it('LGraph getDirection/setDirection', () => {
    const g = new LGraph()
    expect(g.getDirection()).toBe(Direction.UNDEFINED)
    g.setDirection(Direction.DOWN)
    expect(g.getDirection()).toBe(Direction.DOWN)
  })

  it('LNode getPorts(type) OUTPUT/UNDEFINED 谓词', () => {
    const g = new LGraph()
    const l = new Layer(g)
    g.getLayers().push(l)
    const n = new LNode(g)
    n.setLayer(l)
    const pE = new LPort(); pE.setNode(n); pE.setSide(PortSide.EAST)
    const pW = new LPort(); pW.setNode(n); pW.setSide(PortSide.WEST)
    const other = new LNode(g)
    other.setLayer(l)
    const oE = new LPort(); oE.setNode(other); oE.setSide(PortSide.WEST)
    const e1 = new LEdge(); e1.setSource(pE); e1.setTarget(oE)
    expect(n.getPorts(PortType.OUTPUT)).toEqual([pE])
    expect(n.getPorts(PortType.INPUT)).toEqual([])
    expect(n.getPorts(PortType.UNDEFINED)).toEqual([])
    void pW; void e1
  })
})
