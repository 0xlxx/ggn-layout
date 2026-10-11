/**
 * CompoundGraphPreprocessor 直接单测 (对应 ELK compound.CompoundGraphPreprocessor).
 *
 * 不变量 (对照 MODULES.tsv COMPOUND 行 + Java 源码):
 *  - INCLUDE_CHILDREN: 跨层级边逐层拆段 (每层一个 EXTERNAL_PORT dummy + 段边), 原边断开,
 *    CROSS_HIERARCHY_MAP 记录 原边 → 段 (按层级由浅到深).
 *  - SEPARATE_CHILDREN: 子图内建 dummy (容器端口尺寸), 容器端口按 netFlow 定侧;
 *    不修改子图 PORT_CONSTRAINTS (与 INCLUDE 区分).
 *  - inside self loop (yo): 嵌套图内建 source/target 两个 dummy + dummy 边.
 *  - 容器端口标签: 按 PORT_LABELS_PLACEMENT 给 dummy 端口留空标签 (INSIDE 全尺寸 / 其余 insidePart).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortType, PortSide, NodeType, Direction, PortConstraints } from '../../src/index.js'
import { CompoundGraphPreprocessor } from '../../src/compound/compound-graph-preprocessor.js'
import { CROSS_HIERARCHY_MAP, ORIGIN, PORT_DUMMY, INSIDE_CONNECTIONS, EXT_PORT_SIDE, GRAPH_PROPERTIES, GraphProperties } from '../../src/options/internal-properties.js'
import {
  HIERARCHY_HANDLING, DIRECTION, PORT_CONSTRAINTS, PORT_LABELS_PLACEMENT, PORT_BORDER_OFFSET,
  INSIDE_SELF_LOOPS_ACTIVATE, INSIDE_SELF_LOOPS_YO, SPACING_EDGE_EDGE,
} from '../../src/options/layered-options.js'

function node(g: LGraph, name: string, size = { x: 60, y: 30 }): LNode {
  const n = new LNode(g)
  n.size = { ...size }
  n.getLabels().push({ text: name, position: { x: 0, y: 0 }, size: { x: 0, y: 0 } })
  return n
}
function port(n: LNode, side: PortSide, pos = { x: 0, y: 0 }): LPort {
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  p.size = { x: 8, y: 8 }
  p.position = { ...pos }
  return p
}
function compound(root: LGraph, name: string): { p: LNode; g: LGraph } {
  const p = node(root, name)
  const g = new LGraph()
  g.setParentNode(p)
  p.setNestedGraph(g)
  return { p, g }
}
function extDummies(g: LGraph): LNode[] {
  return g.getAllNodes().filter(n => n.getType() === NodeType.EXTERNAL_PORT)
}

describe('CompoundGraphPreprocessor INCLUDE_CHILDREN', () => {
  it('A→B 跨层级边: 嵌套图建 dummy + 根图段, 原边断开, map 含 2 段', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST, { x: 60, y: 15 })
    const bp = port(B, PortSide.WEST, { x: 0, y: 10 })
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const proc = new CompoundGraphPreprocessor()
    proc.process(R)
    // 原边断开
    expect(e.getSource()).toBeNull()
    expect(e.getTarget()).toBeNull()
    const map = R.getProperty(CROSS_HIERARCHY_MAP)
    expect(map).toBeInstanceOf(Map)
    const chs = map!.get(e)!
    expect(chs).toHaveLength(2)
    // 嵌套图内 dummy 段: dummy(EXTERNAL_PORT) → B
    const gSeg = chs.find(ch => ch.getGraph() === G)!
    const gEdge = gSeg.getNewEdge()
    expect(gEdge.getSource()!.getNode()!.getType()).toBe(NodeType.EXTERNAL_PORT)
    expect(gEdge.getTarget()!.getNode()).toBe(B)
    expect(gSeg.getType()).toBe(PortType.INPUT)
    // 根图段: A → P 端口
    const rSeg = chs.find(ch => ch.getGraph() === R)!
    expect(rSeg.getNewEdge().getSource()!.getNode()).toBe(A)
    expect(rSeg.getActualTarget()!.getNode()).toBe(P)
    // 容器端口定侧 + dummy 属性
    const pPort = P.getPorts()[0]!
    expect(pPort.getSide()).toBe(PortSide.WEST)
    expect(pPort.getProperty(PORT_DUMMY)).toBeTruthy()
    expect(pPort.getProperty(INSIDE_CONNECTIONS)).toBe(true)
    expect(P.getProperty(PORT_CONSTRAINTS)).toBe(PortConstraints.FIXED_SIDE)
    expect(R.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)).toBe(true)
    // 嵌套图 EXTERNAL_PORTS 标记
    expect(G.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)).toBe(true)
    // INCLUDE 路径会把子图 PORT_CONSTRAINTS 置为 FREE (与 SEPARATE 区分)
    expect(G.getProperty(PORT_CONSTRAINTS)).toBe(PortConstraints.FREE)
    // dummy 端口边方向: INPUT 段为 dummy → B
    expect(gEdge.getSource()!.getNode()!.getType()).toBe(NodeType.EXTERNAL_PORT)
    // EXT_PORT_SIDE = WEST (netFlow -1 → 反向)
    const dummy = gEdge.getSource()!.getNode()!
    expect(dummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.WEST)
  })

  it('A→B + B→A 双向: OUTPUT 段方向 B→dummy, 两段都入 map', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const ap2 = port(A, PortSide.WEST)
    const bpIn = port(B, PortSide.WEST)
    const bpOut = port(B, PortSide.EAST)
    const eIn = new LEdge()
    eIn.setSource(ap)
    eIn.setTarget(bpIn)
    const eOut = new LEdge()
    eOut.setSource(bpOut)
    eOut.setTarget(ap2)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const inChs = map.get(eIn)!
    const outChs = map.get(eOut)!
    expect(inChs).toHaveLength(2)
    expect(outChs).toHaveLength(2)
    // OUTPUT 段: 嵌套图内 B → dummy, 根图 P → A
    const outGSeg = outChs.find(ch => ch.getGraph() === G)!
    expect(outGSeg.getNewEdge().getSource()!.getNode()).toBe(B)
    expect(outGSeg.getNewEdge().getTarget()!.getNode()!.getType()).toBe(NodeType.EXTERNAL_PORT)
    const outRSeg = outChs.find(ch => ch.getGraph() === R)!
    expect(outRSeg.getNewEdge().getTarget()!.getNode()).toBe(A)
    // OUTPUT dummy 侧 = EAST (netFlow +1 → 顺向)
    const outDummy = outGSeg.getNewEdge().getTarget()!.getNode()!
    expect(outDummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
    // P 两个端口: INPUT→WEST, OUTPUT→EAST (createPortForDummy 按类型定侧)
    const sides = P.getPorts().map(p => p.getSide()).sort()
    expect(sides).toEqual([PortSide.EAST, PortSide.WEST])
    expect(P.getPorts().every(p => p.getProperty(PORT_DUMMY))).toBe(true)
  })

  it('P.p→B (容器端口到子节点): 单段 (非导出), dummy ORIGIN=容器端口, EXT_PORT_SIDE=WEST', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const pp = port(P, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(pp)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    // parentEndPort 非 null → 不导出到根 → 只有嵌套图一段
    expect(chs).toHaveLength(1)
    const seg = chs[0]!
    expect(seg.getGraph()).toBe(G)
    const dummy = seg.getNewEdge().getSource()!.getNode()!
    expect(dummy.getType()).toBe(NodeType.EXTERNAL_PORT)
    expect(dummy.getProperty(ORIGIN)).toBe(pp)
    // 容器端口被定侧 + 标记
    expect(pp.getSide()).toBe(PortSide.WEST)
    expect(pp.getProperty(PORT_DUMMY)).toBe(dummy)
  })

  it('FIXED_SIDE 容器端口到子节点: dummy 侧取容器端口侧 (parentEndPort 分支)', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    const B = node(G, 'B', { x: 40, y: 20 })
    const pp = port(P, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(pp)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const dummy = map.get(e)![0]!.getNewEdge().getSource()!.getNode()!
    // FIXED_SIDE → 保留外部端口侧 EAST
    expect(dummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
    expect(pp.getSide()).toBe(PortSide.EAST)
  })

  it('无边端口不建 dummy (无 EXTERNAL_PORTS 时不进容器端口块)', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const { p: P } = compound(R, 'P')
    const pp = port(P, PortSide.WEST)
    new CompoundGraphPreprocessor().process(R)
    // 子图无跨层级边/自环 → 无 EXTERNAL_PORTS → 容器端口不进 dummy
    expect(pp.getProperty(PORT_DUMMY)).toBeFalsy()
  })

  it('A→B 跨三层: 3 段 (G2→G1→根), 每层容器端口定侧', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P1, g: G1 } = compound(R, 'P1')
    const { p: P2, g: G2 } = compound(G1, 'P2')
    const B = node(G2, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    expect(chs).toHaveLength(3)
    expect(chs.map(c => c.getGraph())).toEqual([G2, G1, R])
    // G2 段: dummy→B; G1 段: dummy→P2 端口; 根段: A→P1 端口
    expect(chs[0]!.getNewEdge().getTarget()!.getNode()).toBe(B)
    expect(chs[1]!.getNewEdge().getTarget()!.getNode()).toBe(P2)
    expect(chs[2]!.getNewEdge().getSource()!.getNode()).toBe(A)
    expect(chs[2]!.getActualTarget()!.getNode()).toBe(P1)
    expect(P1.getPorts()[0]!.getSide()).toBe(PortSide.WEST)
    expect(P2.getPorts()[0]!.getSide()).toBe(PortSide.WEST)
  })

  it('C(G2)→B(G3) 同在 P1 子树内: 只在 G3+G2 建段, G1 不建 (continue)', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const { p: P1, g: G1 } = compound(R, 'P1')
    const { p: P2, g: G2 } = compound(G1, 'P2')
    const C = node(G2, 'C', { x: 40, y: 20 })
    const { p: P3, g: G3 } = compound(G2, 'P3')
    const B = node(G3, 'B', { x: 40, y: 20 })
    const cp = port(C, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(cp)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    expect(chs).toHaveLength(2)
    expect(chs.map(c => c.getGraph())).toEqual([G3, G2])
    expect(chs[0]!.getNewEdge().getTarget()!.getNode()).toBe(B)
    expect(chs[1]!.getNewEdge().getSource()!.getNode()).toBe(C)
  })
})

describe('CompoundGraphPreprocessor SEPARATE_CHILDREN', () => {
  it('P.p→B: 子图建 dummy (容器端口尺寸), 容器端口按 netFlow 定侧, 子图 PORT_CONSTRAINTS 不变', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const pp = port(P, PortSide.UNDEFINED)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(pp)
    e.setTarget(bp)
    const proc = new CompoundGraphPreprocessor()
    proc.process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    expect(chs).toHaveLength(1)
    const dummy = chs[0]!.getNewEdge().getSource()!.getNode()!
    expect(dummy.getType()).toBe(NodeType.EXTERNAL_PORT)
    // SEPARATE dummy 尺寸 = 容器端口尺寸
    expect(dummy.size).toEqual({ x: 0, y: 8 })
    // 容器端口 netFlow=-1 → 反向 WEST
    expect(pp.getSide()).toBe(PortSide.WEST)
    expect(pp.getProperty(PORT_DUMMY)).toBe(dummy)
    // SEPARATE 不改子图 PORT_CONSTRAINTS (与 INCLUDE 的 FREE 区分)
    expect(G.getProperty(PORT_CONSTRAINTS)).toBe(PortConstraints.UNDEFINED)
    // 根图标记 NON_FREE_PORTS
    expect(R.getProperty(GRAPH_PROPERTIES).has(GraphProperties.NON_FREE_PORTS)).toBe(true)
  })
})

describe('CompoundGraphPreprocessor inside self loops', () => {
  function buildSelfLoop(hierarchy: 'INCLUDE_CHILDREN' | 'SEPARATE_CHILDREN') {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, hierarchy)
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(INSIDE_SELF_LOOPS_ACTIVATE, true)
    const p1 = port(P, PortSide.WEST)
    const p2 = port(P, PortSide.EAST)
    const e = new LEdge()
    e.setSource(p1)
    e.setTarget(p2)
    e.setProperty(INSIDE_SELF_LOOPS_YO, true)
    new CompoundGraphPreprocessor().process(R)
    return { R, G, P, e, p1, p2 }
  }

  it('SEPARATE: yo 自环拆成嵌套图内两个 dummy + dummy 边', () => {
    const { R, G, e } = buildSelfLoop('SEPARATE_CHILDREN')
    const dummies = extDummies(G)
    expect(dummies).toHaveLength(2)
    expect(dummies.map(d => d.getProperty(EXT_PORT_SIDE)).sort()).toEqual([PortSide.EAST, PortSide.WEST])
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    expect(chs).toHaveLength(1)
    const de = chs[0]!.getNewEdge()
    expect(de.getSource()!.getNode()!.getType()).toBe(NodeType.EXTERNAL_PORT)
    expect(de.getTarget()!.getNode()!.getType()).toBe(NodeType.EXTERNAL_PORT)
    expect(G.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)).toBe(true)
  })

  it('INCLUDE: yo 自环同样拆段 (transformHierarchyEdges 内 processInsideSelfLoops)', () => {
    const { R, G, e } = buildSelfLoop('INCLUDE_CHILDREN')
    const dummies = extDummies(G)
    expect(dummies).toHaveLength(2)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    expect(map.get(e)).toHaveLength(1)
  })
})

describe('CompoundGraphPreprocessor 容器端口标签预留', () => {
  function buildWithPortLabel(placement: string[] | undefined, portSide: PortSide): { dummyPortLabels: { x: number; y: number }[] } {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    if (placement !== undefined) P.setProperty(PORT_LABELS_PLACEMENT, placement)
    // FIXED_SIDE 保证 dummy 侧保留端口侧 (未定侧时 util 按 netFlow 覆盖为 EAST)
    P.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const pp = port(P, portSide)
    pp.getLabels().push({ text: 'L', position: { x: 5, y: 0 }, size: { x: 30, y: 8 } })
    new CompoundGraphPreprocessor().process(R)
    // 容器端口块 (EXTERNAL_PORTS) 会给每个 P 端口建 dummy 并拷贝标签: 找到 ORIGIN=pp 的 dummy
    const dummy = G.getAllNodes().find(n => n.getType() === NodeType.EXTERNAL_PORT && n.getProperty(ORIGIN) === pp)!
    const labels = dummy.getPorts()[0]!.getLabels()
    return { dummyPortLabels: labels.map(l => ({ x: l.size.x, y: l.size.y })) }
  }

  it('PORT_LABELS_PLACEMENT=INSIDE: dummy 端口标签保留完整尺寸', () => {
    const { dummyPortLabels } = buildWithPortLabel(['INSIDE'], PortSide.WEST)
    expect(dummyPortLabels).toEqual([{ x: 30, y: 8 }])
  })

  it('PORT_LABELS_PLACEMENT=OUTSIDE (WEST): dummy 端口标签只留 insidePart (0)', () => {
    const { dummyPortLabels } = buildWithPortLabel(['OUTSIDE'], PortSide.WEST)
    expect(dummyPortLabels).toEqual([{ x: 0, y: 8 }])
  })

  it('placement=[] (FIXED, WEST): dummy 端口标签留 insidePart = size.x+pos.x-port.size.x', () => {
    // PORT_LABELS_PLACEMENT 默认 ['OUTSIDE']; 显式 [] 表示 FIXED
    const { dummyPortLabels } = buildWithPortLabel([], PortSide.WEST)
    // insidePart = max(0, 30 + 5 - 8) = 27
    expect(dummyPortLabels).toEqual([{ x: 27, y: 8 }])
  })

  it('未设置 placement (默认 OUTSIDE, WEST): dummy 端口标签只留 insidePart (0)', () => {
    const { dummyPortLabels } = buildWithPortLabel(undefined, PortSide.WEST)
    expect(dummyPortLabels).toEqual([{ x: 0, y: 8 }])
  })

  it('dummy PORT_BORDER_OFFSET = SPACING_EDGE_EDGE/2 (holder 分支)', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    G.setProperty(SPACING_EDGE_EDGE, 20)
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const dummy = map.get(e)![0]!.getNewEdge().getSource()!.getNode()!
    // holder.getProperty(PORT_BORDER_OFFSET) = SPACING_EDGE_EDGE / 2 = 10
    expect(dummy.getProperty(PORT_BORDER_OFFSET)).toBe(10)
  })
})

describe('CompoundGraphPreprocessor 原边标签移动', () => {
  it('CENTER 标签移到浅层段, 原边标签清空', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    e.getLabels().push({ text: 'L', position: { x: 0, y: 0 }, size: { x: 30, y: 8 }, placement: 'CENTER' })
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    // CENTER → shallowestEdgeSegment (INPUT 段 → 浅层根段 index 0)
    const moved = chs.flatMap(c => c.getNewEdge().getLabels())
    expect(moved).toHaveLength(1)
    expect(moved[0]!.text).toBe('L')
    expect(e.getLabels()).toHaveLength(0)
  })
})

describe('CompoundGraphPreprocessor SEPARATE 细节', () => {
  function sepGraph() {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    return { R, G, P }
  }

  it('B.p→P.p (子节点出边到容器端口): 建 dummy, 段方向 B→dummy, dummy 侧=EAST (netFlow+1)', () => {
    const { R, G, P } = sepGraph()
    const B = node(G, 'B', { x: 40, y: 20 })
    const bp = port(B, PortSide.EAST)
    const pp = port(P, PortSide.EAST)
    const e = new LEdge()
    e.setSource(bp)
    e.setTarget(pp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    expect(chs).toHaveLength(1)
    const de = chs[0]!.getNewEdge()
    expect(de.getSource()!.getNode()).toBe(B)
    expect(de.getTarget()!.getNode()!.getType()).toBe(NodeType.EXTERNAL_PORT)
    const dummy = de.getTarget()!.getNode()!
    // netFlow +1 → 顺向 EAST
    expect(dummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
    // 容器端口 netFlow>0 → EAST
    expect(pp.getSide()).toBe(PortSide.EAST)
  })

  it('P.p 同时连子节点 B 与外部 A: netFlow=0 → dummy 侧 EAST (含外部边 output 投票)', () => {
    const { R, G, P } = sepGraph()
    const A = node(R, 'A')
    const B = node(G, 'B', { x: 40, y: 20 })
    const pp = port(P, PortSide.UNDEFINED)
    const bp = port(B, PortSide.WEST)
    const ap = port(A, PortSide.WEST)
    const e1 = new LEdge()
    e1.setSource(pp)
    e1.setTarget(bp)
    const e2 = new LEdge()
    e2.setSource(pp)
    e2.setTarget(ap)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const dummy = map.get(e1)![0]!.getNewEdge().getSource()!.getNode()!
    // 入子节点 input 投票 (-1) + 出外部 output 投票 (+1) = 0 → 顺向 EAST
    expect(dummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
  })

  it('兄弟跨边 A→B (外部端口不在容器上): 不建 dummy', () => {
    const { R, G, P } = sepGraph()
    const A = node(R, 'A')
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    // 外部端口 A 不在容器 P 上 → 不建 dummy
    expect(extDummies(G)).toHaveLength(0)
  })

  it('同一容器端口两条子边: dummyNodeMap 保留首个 dummy (PORT_DUMMY 指向第一个)', () => {
    const { R, G, P } = sepGraph()
    const B1 = node(G, 'B1', { x: 40, y: 20 })
    const B2 = node(G, 'B2', { x: 40, y: 20 })
    const pp = port(P, PortSide.UNDEFINED)
    const b1p = port(B1, PortSide.WEST)
    const b2p = port(B2, PortSide.WEST)
    const e1 = new LEdge()
    e1.setSource(pp)
    e1.setTarget(b1p)
    const e2 = new LEdge()
    e2.setSource(pp)
    e2.setTarget(b2p)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const d1 = map.get(e1)![0]!.getNewEdge().getSource()!.getNode()!
    const d2 = map.get(e2)![0]!.getNewEdge().getSource()!.getNode()!
    expect(d1).not.toBe(d2)
    // dummyNodeMap 保留首个
    expect(pp.getProperty(PORT_DUMMY)).toBe(d1)
    expect(G.getAllNodes().filter(n => n.getType() === NodeType.EXTERNAL_PORT)).toHaveLength(2)
  })

  it('FIXED_SIDE 容器: 已定侧端口保持不变, UNDEFINED 端口按 netFlow 定侧', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    const B = node(G, 'B', { x: 40, y: 20 })
    const fixed = port(P, PortSide.EAST)
    const undef = port(P, PortSide.UNDEFINED)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(undef)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    // FIXED_SIDE → 已定侧端口不变
    expect(fixed.getSide()).toBe(PortSide.EAST)
    // UNDEFINED 端口 netFlow=-1 → WEST
    expect(undef.getSide()).toBe(PortSide.WEST)
  })

  it('P.p→B SEPARATE: dummy EXT_PORT_SIDE=WEST (UNDEFINED 侧推断)', () => {
    const { R, G, P } = sepGraph()
    const B = node(G, 'B', { x: 40, y: 20 })
    const pp = port(P, PortSide.UNDEFINED)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(pp)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const dummy = map.get(e)![0]!.getNewEdge().getSource()!.getNode()!
    // netFlow=-1 → 反向 WEST
    expect(dummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.WEST)
  })
})

describe('CompoundGraphPreprocessor inside self loop 细节', () => {
  it('SEPARATE yo 自环: source dummy 侧=WEST (netFlow-1), target dummy 侧=EAST (netFlow+1)', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(INSIDE_SELF_LOOPS_ACTIVATE, true)
    const p1 = port(P, PortSide.WEST)
    const p2 = port(P, PortSide.EAST)
    const e = new LEdge()
    e.setSource(p1)
    e.setTarget(p2)
    e.setProperty(INSIDE_SELF_LOOPS_YO, true)
    new CompoundGraphPreprocessor().process(R)
    const dummies = extDummies(G)
    const srcDummy = dummies.find(d => d.getProperty(ORIGIN) === p1)!
    const tgtDummy = dummies.find(d => d.getProperty(ORIGIN) === p2)!
    expect(srcDummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.WEST)
    expect(tgtDummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
  })

  it('SEPARATE 多 yo 自环: 同层 dummy 按端口模型顺序排序', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(INSIDE_SELF_LOOPS_ACTIVATE, true)
    const p1 = port(P, PortSide.WEST)
    const p2 = port(P, PortSide.EAST)
    const p3 = port(P, PortSide.EAST)
    const e21 = new LEdge()
    e21.setSource(p2)
    e21.setTarget(p1)
    e21.setProperty(INSIDE_SELF_LOOPS_YO, true)
    const e31 = new LEdge()
    e31.setSource(p3)
    e31.setTarget(p1)
    e31.setProperty(INSIDE_SELF_LOOPS_YO, true)
    new CompoundGraphPreprocessor().process(R)
    // 边处理顺序: p2→p1 先 → dummy 创建顺序 p2,p1,p3; sortByPortOrder 后按端口顺序 p1,p2,p3
    const dummies = extDummies(G)
    expect(dummies).toHaveLength(3)
    const order = dummies.map(d => P.getPorts().indexOf(d.getProperty(ORIGIN) as LPort))
    expect(order).toEqual([0, 1, 2])
  })
})

describe('CompoundGraphPreprocessor 标签移动细节', () => {
  function includeAB() {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    return { R, G, e }
  }

  it('CENTER 标签移到浅层段 (sorted[0])', () => {
    const { R, e } = includeAB()
    e.getLabels().push({ text: 'L', position: { x: 0, y: 0 }, size: { x: 30, y: 8 }, placement: 'CENTER' })
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = [...map.get(e)!].sort((a, b) => {
      // 浅层在前: R level 0 < G level 1
      const lv = (c: typeof a) => { let n = c.getGraph().getParentNode(); let l = 0; while (n !== null) { l++; n = n.getGraph()?.getParentNode() ?? null } return l }
      return lv(a) - lv(b)
    })
    expect(chs[0]!.getNewEdge().getLabels().map(l => l.text)).toEqual(['L'])
    expect(chs[1]!.getNewEdge().getLabels()).toHaveLength(0)
  })

  it('HEAD 标签移到最深段 (sorted 末尾)', () => {
    const { R, e } = includeAB()
    e.getLabels().push({ text: 'H', position: { x: 0, y: 0 }, size: { x: 30, y: 8 }, placement: 'HEAD' })
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = [...map.get(e)!].sort((a, b) => {
      const lv = (c: typeof a) => { let n = c.getGraph().getParentNode(); let l = 0; while (n !== null) { l++; n = n.getGraph()?.getParentNode() ?? null } return l }
      return lv(a) - lv(b)
    })
    expect(chs[chs.length - 1]!.getNewEdge().getLabels().map(l => l.text)).toEqual(['H'])
  })

  it('placement 未定义 → 等价 CENTER; 未知 placement → 不移动', () => {
    const { R, e } = includeAB()
    e.getLabels().push({ text: 'U', position: { x: 0, y: 0 }, size: { x: 30, y: 8 } })
    e.getLabels().push({ text: 'X', position: { x: 0, y: 0 }, size: { x: 30, y: 8 }, placement: 'FOO' })
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const moved = [...map.get(e)!].flatMap(c => c.getNewEdge().getLabels().map(l => l.text))
    // U (undefined→CENTER) 移动, X (FOO) 不移动
    expect(moved).toContain('U')
    expect(moved).not.toContain('X')
    expect(moved).toHaveLength(1)
  })

  it('B→A 双 OUTPUT 段 + CENTER 标签: 移到最浅 OUTPUT 段 (index 1)', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const bp = port(B, PortSide.EAST)
    const ap = port(A, PortSide.WEST)
    const e = new LEdge()
    e.setSource(bp)
    e.setTarget(ap)
    e.getLabels().push({ text: 'C', position: { x: 0, y: 0 }, size: { x: 30, y: 8 }, placement: 'CENTER' })
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = [...map.get(e)!].sort((a, b) => {
      const lv = (c: typeof a) => { let n = c.getGraph().getParentNode(); let l = 0; while (n !== null) { l++; n = n.getGraph()?.getParentNode() ?? null } return l }
      return lv(a) - lv(b)
    })
    // 排序后 [G(OUTPUT), R(OUTPUT)] → shallowestEdgeSegment = 1 → R 段 (我按层级升序的 chs[0])
    expect(chs[0]!.getNewEdge().getLabels().map(l => l.text)).toEqual(['C'])
    expect(chs[1]!.getNewEdge().getLabels()).toHaveLength(0)
  })

  it('yo 自环单 OUTPUT 段 + 标签: 移到唯一段 (shallowestEdgeSegment 不越界)', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(INSIDE_SELF_LOOPS_ACTIVATE, true)
    const p1 = port(P, PortSide.WEST)
    const p2 = port(P, PortSide.EAST)
    const e = new LEdge()
    e.setSource(p1)
    e.setTarget(p2)
    e.setProperty(INSIDE_SELF_LOOPS_YO, true)
    e.getLabels().push({ text: 'S', position: { x: 0, y: 0 }, size: { x: 30, y: 8 }, placement: 'CENTER' })
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chs = map.get(e)!
    expect(chs).toHaveLength(1)
    expect(chs[0]!.getNewEdge().getLabels().map(l => l.text)).toEqual(['S'])
  })
})

describe('CompoundGraphPreprocessor 容器端口 dummy 细节 (INCLUDE)', () => {
  it('有边容器端口 (netFlow≠0) 在 EXTERNAL_PORTS 块补建 dummy: netFlow 取反', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    const B = node(G, 'B', { x: 40, y: 20 })
    const A2 = node(R, 'A2')
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    // P 上另有一个连根节点 A2 的端口 (netFlow=-1) — 不在 dummyNodeMap, EXTERNAL_PORTS 块补建
    const pOut = port(P, PortSide.EAST)
    const a2p = port(A2, PortSide.WEST)
    const e2 = new LEdge()
    e2.setSource(pOut)
    e2.setTarget(a2p)
    new CompoundGraphPreprocessor().process(R)
    // -port.getNetFlow() = -(-1) = +1 → 顺向 EAST
    const dummy = G.getAllNodes().find(n => n.getType() === NodeType.EXTERNAL_PORT && n.getProperty(ORIGIN) === pOut)!
    expect(dummy.getProperty(EXT_PORT_SIDE)).toBe(PortSide.EAST)
  })

  it('FIXED_POS 容器端口: dummy PORT_RATIO_OR_POSITION 取端口位置', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const pp = port(P, PortSide.WEST, { x: 3, y: 7 })
    new CompoundGraphPreprocessor().process(R)
    const dummy = G.getAllNodes().find(n => n.getType() === NodeType.EXTERNAL_PORT && n.getProperty(ORIGIN) === pp)!
    // L395 块补建 dummy 用 {x:0,y:0} 位置 → W/E 端口 PORT_RATIO_OR_POSITION = 0
    expect(dummy.getProperty('org.eclipse.elk.layered.internal.portRatioOrPosition')).toBe(0)
  })

  it('容器端口标签: text 为空串 (占位), 尺寸按 placement', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    P.setProperty(PORT_LABELS_PLACEMENT, ['INSIDE'])
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const pp = port(P, PortSide.WEST)
    pp.getLabels().push({ text: 'L', position: { x: 5, y: 0 }, size: { x: 30, y: 8 } })
    new CompoundGraphPreprocessor().process(R)
    const dummy = G.getAllNodes().find(n => n.getType() === NodeType.EXTERNAL_PORT && n.getProperty(ORIGIN) === pp)!
    const labels = dummy.getPorts()[0]!.getLabels()
    expect(labels).toHaveLength(1)
    expect(labels[0]!.text).toBe('')
    expect(labels[0]!.size).toEqual({ x: 30, y: 8 })
  })

  it('NORTH 端口 (placement=[]): insidePart 写 size.y 而非 size.x', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    P.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    P.setProperty(PORT_LABELS_PLACEMENT, [])
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const pp = port(P, PortSide.NORTH)
    pp.getLabels().push({ text: 'L', position: { x: 0, y: 5 }, size: { x: 8, y: 30 } })
    new CompoundGraphPreprocessor().process(R)
    const dummy = G.getAllNodes().find(n => n.getType() === NodeType.EXTERNAL_PORT && n.getProperty(ORIGIN) === pp)!
    const label = dummy.getPorts()[0]!.getLabels()[0]!
    // NORTH insidePart = max(0, size.y + pos.y - port.size.y) = max(0, 30+5-8) = 27 → 写 size.y
    expect(label.size.x).toBe(8)
    expect(label.size.y).toBe(27)
  })
})
