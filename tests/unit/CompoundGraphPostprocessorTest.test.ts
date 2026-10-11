/**
 * CompoundGraphPostprocessor 直接单测 (对应 ELK compound.CompoundGraphPostprocessor).
 *
 * 不变量 (对照 MODULES.tsv COMPOUND 行):
 *  - 段合并 reference = 挂载容器图 (LCA 容器节点内容图); 无共同祖先 → 最顶层图.
 *  - 段弯点按段图 NORMAL 内容选偏移 (graphParentOffset 或 coordSystemOffset).
 *  - 跨级边端点 = recursiveAnchorTo(LCA) 语义: 合并后端点世界坐标落在 reference 坐标系.
 *  - 段弯点合并: 按需补 sourcePoint 弯点 (UNNECESSARY_BENDPOINTS + x/y 差阈值).
 *  - INCLUDE 下被平移的 W-E dummy 锚点用 parentOffset.
 *  - TARGET_OFFSET: 最后一段目标端口所在图 → referenceGraph 的偏移 (供输出层端点还原).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortType, PortSide, NodeType, Direction } from '../../src/index.js'
import { CompoundGraphPreprocessor } from '../../src/compound/compound-graph-preprocessor.js'
import { CrossHierarchyEdge } from '../../src/compound/cross-hierarchy-edge.js'
import { processCompoundGraphPost } from '../../src/compound/compound-graph-postprocessor.js'
import { CROSS_HIERARCHY_MAP, ORIGIN, TARGET_OFFSET, EXT_PORT_SIDE } from '../../src/options/internal-properties.js'
import { HIERARCHY_HANDLING, DIRECTION, JUNCTION_POINTS, UNNECESSARY_BENDPOINTS, INSIDE_SELF_LOOPS_ACTIVATE, INSIDE_SELF_LOOPS_YO } from '../../src/options/layered-options.js'

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
function pts(ps: { x: number; y: number }[]): { x: number; y: number }[] {
  return ps.map(p => ({ x: p.x, y: p.y }))
}

/** 标准 INCLUDE A→B 场景 (经 preprocessor 拆分, 供覆写布局坐标). */
function buildAB() {
  const R = new LGraph()
  R.setProperty(DIRECTION, Direction.RIGHT)
  R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
  const A = node(R, 'A')
  const { p: P, g: G } = compound(R, 'P')
  G.setPadding({ left: 7, top: 3, right: 7, bottom: 3 })
  const B = node(G, 'B', { x: 40, y: 20 })
  const ap = port(A, PortSide.EAST, { x: 60, y: 15 })
  const bp = port(B, PortSide.WEST, { x: 0, y: 10 })
  const e = new LEdge()
  e.setSource(ap)
  e.setTarget(bp)
  new CompoundGraphPreprocessor().process(R)
  const map = R.getProperty(CROSS_HIERARCHY_MAP)!
  const chs = map.get(e)!
  return { R, G, P, A, B, ap, bp, e, chs }
}

/**
 * 手动构造双段 INPUT 合并: ch0 (A→P 端口, 图 R), ch1 (dummy(G)→B, 图 G).
 * dummy 侧/图 padding/方向/HIERARCHY_HANDLING 可配 → 精确控制端点偏移分支.
 */
function manualAB(opts: {
  dummySide?: PortSide
  dir?: Direction
  hierarchy?: 'INCLUDE_CHILDREN' | 'SEPARATE_CHILDREN'
  gPadding?: { left: number; top: number; right: number; bottom: number }
  bend0?: { x: number; y: number }
  ch1Graph?: LGraph
  targetDummySide?: boolean
  apPos?: { x: number; y: number }
}) {
  const R = new LGraph()
  R.setProperty(DIRECTION, opts.dir ?? Direction.RIGHT)
  R.setProperty(HIERARCHY_HANDLING, opts.hierarchy ?? 'INCLUDE_CHILDREN')
  const A = node(R, 'A')
  const { p: P, g: G } = compound(R, 'P')
  P.position = { x: 100, y: 200 }
  G.setPadding(opts.gPadding ?? { left: 7, top: 3, right: 7, bottom: 3 })
  const B = node(G, 'B', { x: 40, y: 20 })
  const ap = port(A, PortSide.EAST, opts.apPos ?? { x: 60, y: 15 })
  const bp = port(B, PortSide.WEST, { x: 0, y: 10 })
  const e = new LEdge()
  e.setSource(ap)
  e.setTarget(bp)
  // 容器端口 (ch1 dummy 的 ORIGIN 目标)
  const pp = port(P, PortSide.WEST)
  // G 内 dummy 源
  const dummy = new LNode(G)
  dummy.setType(NodeType.EXTERNAL_PORT)
  dummy.setProperty(EXT_PORT_SIDE, opts.dummySide ?? PortSide.WEST)
  dummy.setProperty(ORIGIN, pp)
  dummy.position = { x: 10, y: 20 }
  const dummyPort = new LPort()
  dummyPort.setNode(dummy)
  // 段0: A → P 端口 (根图)
  const pPort = port(P, PortSide.WEST)
  const seg0 = new LEdge()
  seg0.setSource(ap)
  seg0.setTarget(pPort)
  const ch0 = new CrossHierarchyEdge(seg0, R, PortType.INPUT)
  // 段1: dummy → B
  const seg1 = new LEdge()
  seg1.setSource(dummyPort)
  seg1.setTarget(bp)
  if (opts.bend0) seg1.getBendPoints().push(opts.bend0)
  const ch1 = new CrossHierarchyEdge(seg1, opts.ch1Graph ?? G, PortType.INPUT)
  const map = new Map<LEdge, CrossHierarchyEdge[]>()
  map.set(e, [ch0, ch1])
  R.setProperty(CROSS_HIERARCHY_MAP, map)
  return { R, G, P, A, B, ap, bp, e, ch0, ch1, dummy, dummyPort, pPort }
}

describe('CompoundGraphPostprocessor 基础守卫', () => {
  it('无 CROSS_HIERARCHY_MAP 属性: 直接返回不改图', () => {
    const R = new LGraph()
    expect(() => processCompoundGraphPost(R)).not.toThrow()
    expect(R.getAllNodes()).toHaveLength(0)
  })

  it('空段列表: 跳过该原边 (不崩溃不改边)', () => {
    const R = new LGraph()
    const n = node(R, 'N')
    const p = port(n, PortSide.EAST)
    const e = new LEdge()
    e.setSource(p)
    e.setTarget(p)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    expect(e.getSource()).toBe(p)
    expect(e.getTarget()).toBe(p)
    expect(e.getBendPoints()).toHaveLength(0)
  })

  it('源或目标端口为 null: 跳过该原边 (不重连)', () => {
    const R = new LGraph()
    const A = node(R, 'A')
    const B = node(R, 'B')
    const ap = port(A, PortSide.EAST)
    const bp = port(B, PortSide.WEST)
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const nullEdge = new LEdge()
    const g = new LGraph()
    const ch0 = new CrossHierarchyEdge(nullEdge, g, PortType.INPUT)
    const ch1 = new CrossHierarchyEdge(new LEdge(), g, PortType.INPUT)
    ch1.getNewEdge().setSource(ap)
    ch1.getNewEdge().setTarget(bp)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch0, ch1])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    expect(e.getSource()).toBe(ap)
    expect(e.getTarget()).toBe(bp)
  })
})

describe('CompoundGraphPostprocessor 段合并', () => {
  it('A→B 双段合并: 弯点世界坐标 + TARGET_OFFSET + 端点重连 + dummy 断开 + 标签转换', () => {
    const { R, G, A, B, ap, bp, e, chs } = buildAB()
    const P = R.getLayerlessNodes().find(n => n.getNestedGraph() === G)!
    P.position = { x: 100, y: 200 }
    const chG = chs.find(ch => ch.getGraph() === G)!
    const chR = chs.find(ch => ch.getGraph() === R)!
    const gDummy = extDummies(G)[0]!
    gDummy.position = { x: 10, y: 20 }
    chG.getNewEdge().getBendPoints().push({ x: 20, y: 30 })
    chG.getNewEdge().getLabels().push({ text: 'E', position: { x: 1, y: 2 }, size: { x: 10, y: 5 } })

    processCompoundGraphPost(R)

    expect(e.getSource()).toBe(ap)
    expect(e.getTarget()).toBe(bp)
    // 段1 (G): sourcePoint = dummyAbs + parentOffset = (110,220); 段弯点 + graphParentOffset = (120,230)
    expect(pts(e.getBendPoints())).toEqual([{ x: 110, y: 220 }, { x: 120, y: 230 }])
    expect(e.getProperty(TARGET_OFFSET)).toEqual({ x: 100, y: 200 })
    expect(chG.getNewEdge().getSource()).toBeNull()
    expect(chG.getNewEdge().getTarget()).toBeNull()
    expect(chR.getNewEdge().getSource()).toBeNull()
    expect(chR.getNewEdge().getTarget()).toBeNull()
    expect(e.getLabels().map(l => ({ text: l.text, x: l.position.x, y: l.position.y })))
      .toEqual([{ text: 'E', x: 101, y: 202 }])
    expect(chG.getNewEdge().getLabels()).toHaveLength(0)
  })

  it('addUnnecessaryBendpoints=true + y 差不足: 第二条件 (x 差足够) 补弯点', () => {
    const { R, G, e, ch0 } = manualAB({})
    R.setProperty(UNNECESSARY_BENDPOINTS, true)
    // ch1 无弯点 → nextPoint = targetPoint (100,214); 源点 (110,220): x 差 10, y 差 6
    // addUnnecessaryBendpoints=true → x 差足够即补 sourcePoint
    processCompoundGraphPost(R)
    expect(pts(e.getBendPoints())).toEqual([{ x: 110, y: 220 }])
    void ch0
  })

  it('x 差为 0 (y 差足够): 不补 sourcePoint', () => {
    const { R, e } = manualAB({ bend0: { x: -40, y: 30 } })
    // ch1 bendPoints[0] 世界 = (60,230); lastPoint = ch0 sourcePoint (60,19) → xDiff=0 → 不补
    processCompoundGraphPost(R)
    expect(pts(e.getBendPoints())).toEqual([{ x: 60, y: 230 }])
  })

  it('x 差恰好 = TOLERANCE: 不补弯点', () => {
    // 手动构造: 两段都在根图 (offset 0); ch0 sourcePoint.x = 0, ch1 bendPoints[0].x = 1e-3 (恰好)
    const R = new LGraph()
    const A = node(R, 'A')
    const B = node(R, 'B')
    const ap = port(A, PortSide.EAST, { x: 0, y: 15 })
    const bp = port(B, PortSide.WEST, { x: 0, y: 10 })
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const seg0 = new LEdge()
    seg0.setSource(ap)
    seg0.setTarget(bp)
    const seg1 = new LEdge()
    seg1.setSource(ap)
    seg1.setTarget(bp)
    seg1.getBendPoints().push({ x: 1e-3, y: 30 })
    const ch0 = new CrossHierarchyEdge(seg0, R, PortType.INPUT)
    const ch1 = new CrossHierarchyEdge(seg1, R, PortType.INPUT)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch0, ch1])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    // lastPoint.x = 0, nextPoint.x = 1e-3 → xDiff 恰好 = TOLERANCE → > 不成立 → 不补
    expect(e.getBendPoints()).toHaveLength(1)
    expect(e.getBendPoints()[0]!.x).toBe(1e-3)
  })

  it('负坐标 (lastPoint.x=5, nextPoint.x=-5): 正常差 10 补弯点', () => {
    const { R, e } = manualAB({ bend0: { x: -105, y: 30 }, apPos: { x: 5, y: 15 } })
    // ch0 sourcePoint.x = 5; ch1 bendPoints[0] 世界 x = -5 → xDiff = |5-(-5)| = 10 → 补
    processCompoundGraphPost(R)
    expect(pts(e.getBendPoints())).toEqual([{ x: 110, y: 220 }, { x: -5, y: 230 }])
  })

  it('bendPoints[0] 与 lastPoint 相同但 targetPoint 不同: 用 bendPoints[0] 判定 (不补)', () => {
    const { R, e } = manualAB({ bend0: { x: -40, y: -181 } })
    // ch1 bendPoints[0] 世界 = (60,19) = lastPoint → 不补; 若误用 targetPoint (100,214) 则会补
    processCompoundGraphPost(R)
    expect(pts(e.getBendPoints())).toEqual([{ x: 60, y: 19 }])
  })

  it('三阶段合并: lastPoint 取段末弯点 (非段源点)', () => {
    const R = new LGraph()
    const A = node(R, 'A')
    const B = node(R, 'B')
    const C = node(R, 'C')
    const ap = port(A, PortSide.EAST, { x: 0, y: 0 })
    const bp = port(B, PortSide.WEST, { x: 0, y: 0 })
    const cp = port(C, PortSide.WEST, { x: 0, y: 0 })
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(cp)
    const e1 = new LEdge()
    e1.setSource(ap)
    e1.setTarget(bp)
    const e2 = new LEdge()
    e2.setSource(bp)
    e2.setTarget(cp)
    e2.getBendPoints().push({ x: 5, y: 5 })
    const ch1 = new CrossHierarchyEdge(e1, R, PortType.OUTPUT)
    const ch2 = new CrossHierarchyEdge(e2, R, PortType.OUTPUT)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch1, ch2])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    // 段1: sourcePoint (0,0) → lastPoint (0,0); 段2: sourcePoint (0,0), bend [5,5],
    // nextPoint (5,5) → x/y 差足够 → 补段2 sourcePoint (0,0); 弯点 [ (0,0), (5,5) ]
    expect(pts(e.getBendPoints())).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }])
  })
})

describe('CompoundGraphPostprocessor junction points', () => {
  it('段含 junctionPoints: 清空原边 JPs 并按段合并 (带 offset)', () => {
    const { R, G, e, chs } = buildAB()
    const P = R.getLayerlessNodes().find(n => n.getNestedGraph() === G)!
    P.position = { x: 100, y: 200 }
    e.setProperty(JUNCTION_POINTS, [{ x: 1, y: 1 }])
    const chG = chs.find(ch => ch.getGraph() === G)!
    chG.getNewEdge().setProperty(JUNCTION_POINTS, [{ x: 10, y: 20 }])
    const gDummy = extDummies(G)[0]!
    gDummy.position = { x: 10, y: 20 }
    processCompoundGraphPost(R)
    const jps = e.getProperty(JUNCTION_POINTS) as { x: number; y: number }[]
    expect(jps).toEqual([{ x: 110, y: 220 }])
  })

  it('段无 junctionPoints 但原边有: 清空为 null', () => {
    const { R, G, e } = buildAB()
    const P = R.getLayerlessNodes().find(n => n.getNestedGraph() === G)!
    P.position = { x: 100, y: 200 }
    e.setProperty(JUNCTION_POINTS, [{ x: 1, y: 1 }])
    const gDummy = extDummies(G)[0]!
    gDummy.position = { x: 10, y: 20 }
    processCompoundGraphPost(R)
    expect(e.getProperty(JUNCTION_POINTS)).toBeNull()
  })

  it('段无 junctionPoints 且原边无: 保持 null 不崩溃', () => {
    const { R, G, e } = buildAB()
    const P = R.getLayerlessNodes().find(n => n.getNestedGraph() === G)!
    P.position = { x: 100, y: 200 }
    const gDummy = extDummies(G)[0]!
    gDummy.position = { x: 10, y: 20 }
    processCompoundGraphPost(R)
    expect(e.getProperty(JUNCTION_POINTS)).toBeNull()
  })

  it('多段混合 (一段有 JPs 一段无): 按 some 判定为有 JPs', () => {
    const { R, G, e, chs } = buildAB()
    const P = R.getLayerlessNodes().find(n => n.getNestedGraph() === G)!
    P.position = { x: 100, y: 200 }
    e.setProperty(JUNCTION_POINTS, [{ x: 1, y: 1 }])
    const chG = chs.find(ch => ch.getGraph() === G)!
    const chR = chs.find(ch => ch.getGraph() === R)!
    chG.getNewEdge().setProperty(JUNCTION_POINTS, [{ x: 10, y: 20 }])
    chR.getNewEdge().setProperty(JUNCTION_POINTS, null)
    const gDummy = extDummies(G)[0]!
    gDummy.position = { x: 10, y: 20 }
    processCompoundGraphPost(R)
    const jps = e.getProperty(JUNCTION_POINTS) as { x: number; y: number }[]
    expect(jps).toEqual([{ x: 110, y: 220 }])
  })
})

describe('CompoundGraphPostprocessor reference 图与端点偏移', () => {
  it('自环 (源=目标同节点): container 取父容器, 无共同祖先时 reference=顶层图', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.position = { x: 100, y: 200 }
    G.setPadding({ left: 7, top: 3, right: 7, bottom: 3 })
    P.setProperty(INSIDE_SELF_LOOPS_ACTIVATE, true)
    const p1 = port(P, PortSide.WEST)
    const p2 = port(P, PortSide.EAST)
    const e = new LEdge()
    e.setSource(p1)
    e.setTarget(p2)
    e.setProperty(INSIDE_SELF_LOOPS_YO, true)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chG = map.get(e)!.find(ch => ch.getGraph() === G)!
    const dummies = extDummies(G)
    dummies.find(d => d.getProperty(ORIGIN) === p1)!.position = { x: 0, y: 0 }
    dummies.find(d => d.getProperty(ORIGIN) === p2)!.position = { x: 10, y: 0 }
    chG.getNewEdge().getBendPoints().push({ x: 5, y: 5 })
    processCompoundGraphPost(R)
    // 段图无 NORMAL → coordSystemOffset(G,R) = P.pos + G.padding = (107,203); 弯点 {112,208}
    expect(pts(e.getBendPoints())).toEqual([{ x: 112, y: 208 }])
    // 目标端口 p2 的节点 P 在根图 → graphParentOffset(R, R) = (0,0)
    expect(e.getProperty(TARGET_OFFSET)).toEqual({ x: 0, y: 0 })
  })

  it('P.p→B (容器端口到子节点): reference=容器节点内容图 G, 弯点无偏移, TARGET_OFFSET={0,0}', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.position = { x: 100, y: 200 }
    const B = node(G, 'B', { x: 40, y: 20 })
    const pp = port(P, PortSide.EAST)
    const bp = port(B, PortSide.WEST, { x: 0, y: 10 })
    const e = new LEdge()
    e.setSource(pp)
    e.setTarget(bp)
    new CompoundGraphPreprocessor().process(R)
    const map = R.getProperty(CROSS_HIERARCHY_MAP)!
    const chG = map.get(e)![0]!
    const dummy = chG.getNewEdge().getSource()!.getNode()!
    dummy.position = { x: 10, y: 20 }
    chG.getNewEdge().getBendPoints().push({ x: 20, y: 30 })
    processCompoundGraphPost(R)
    expect(pts(e.getBendPoints())).toEqual([{ x: 20, y: 30 }])
    expect(e.getProperty(TARGET_OFFSET)).toEqual({ x: 0, y: 0 })
  })

  it('深源无共同祖先: reference 走最顶层 (referenceNode 在嵌套图内)', () => {
    const R = new LGraph()
    const P1 = node(R, 'P1')
    const G1 = new LGraph()
    G1.setParentNode(P1)
    P1.setNestedGraph(G1)
    const P2 = node(R, 'P2')
    const G2 = new LGraph()
    G2.setParentNode(P2)
    P2.setNestedGraph(G2)
    P1.position = { x: 100, y: 200 }
    P2.position = { x: 10, y: 20 }
    const X = node(G1, 'X', { x: 40, y: 20 })
    const Y = node(G2, 'Y', { x: 40, y: 20 })
    const xp = port(X, PortSide.EAST)
    const yp = port(Y, PortSide.WEST)
    const e = new LEdge()
    e.setSource(xp)
    e.setTarget(yp)
    const d0 = new LNode(R)
    d0.setType(NodeType.EXTERNAL_PORT)
    const d0p = new LPort()
    d0p.setNode(d0)
    d0.setProperty(ORIGIN, xp)
    const d1 = new LNode(R)
    d1.setType(NodeType.EXTERNAL_PORT)
    const d1p = new LPort()
    d1p.setNode(d1)
    d1.setProperty(ORIGIN, yp)
    const seg0 = new LEdge()
    seg0.setSource(d0p)
    seg0.setTarget(xp)
    const seg1 = new LEdge()
    seg1.setSource(yp)
    seg1.setTarget(d1p)
    seg1.getBendPoints().push({ x: 30, y: 40 })
    const ch0 = new CrossHierarchyEdge(seg0, R, PortType.INPUT)
    const ch1 = new CrossHierarchyEdge(seg1, R, PortType.INPUT)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch0, ch1])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    // referenceNode = X (G1) → X/Y 无共同祖先节点 → reference = 顶层 R
    // TARGET_OFFSET = graphParentOffset(G2, R) = P2.pos = (10,20); 若 reference 停在 G1 则 offset 相同,
    // 故主要断言在弯点/段偏移 (reference=R → graphParentOffset(R,R)=0)
    expect(e.getProperty(TARGET_OFFSET)).toEqual({ x: 10, y: 20 })
    // ch0 sourcePoint (0,0) → lastPoint; ch1 sourcePoint (0,0) 因 x/y 差足够被补; 段弯点 (30,40)
    expect(pts(e.getBendPoints())).toEqual([{ x: 0, y: 0 }, { x: 30, y: 40 }])
  })

  it('SEPARATE + EXTERNAL_PORT 源 (纯 dummy 段图): 段弯点+源端点用 coordSystemOffset', () => {
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    P.position = { x: 100, y: 200 }
    G.setPadding({ left: 7, top: 3, right: 7, bottom: 3 })
    const B = node(G, 'B', { x: 40, y: 20 })
    const ap = port(A, PortSide.EAST, { x: 60, y: 15 })
    const bp = port(B, PortSide.WEST, { x: 0, y: 10 })
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(bp)
    const pp = port(P, PortSide.WEST)
    // 纯 dummy 段图 G2 (无 NORMAL 内容)
    const G2 = new LGraph()
    G2.setParentNode(P)
    G2.setPadding({ left: 7, top: 3, right: 7, bottom: 3 })
    const dummy = new LNode(G2)
    dummy.setType(NodeType.EXTERNAL_PORT)
    dummy.setProperty(EXT_PORT_SIDE, PortSide.WEST)
    dummy.setProperty(ORIGIN, pp)
    dummy.position = { x: 10, y: 20 }
    const dummyPort = new LPort()
    dummyPort.setNode(dummy)
    // 段0 (R): A → P 端口
    const pPort = port(P, PortSide.WEST)
    const seg0 = new LEdge()
    seg0.setSource(ap)
    seg0.setTarget(pPort)
    const ch0 = new CrossHierarchyEdge(seg0, R, PortType.INPUT)
    // 段1 (G2): dummy → B
    const seg1 = new LEdge()
    seg1.setSource(dummyPort)
    seg1.setTarget(bp)
    seg1.getBendPoints().push({ x: 20, y: 30 })
    const ch1 = new CrossHierarchyEdge(seg1, G2, PortType.INPUT)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch0, ch1])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    // 段1 图无 NORMAL → offset = coordSystemOffset(G2,R) = P.pos + G2.padding = (107,203)
    // 段弯点 {20,30}+(107,203) = {127,233}; 源端点 (SEPARATE includeChildren=false) = segOffset → {117,223}
    expect(pts(e.getBendPoints())).toEqual([{ x: 117, y: 223 }, { x: 127, y: 233 }])
  })

  it('DOWN 方向 + N-S dummy (INCLUDE): 视为被平移 → 源端点用 parentOffset', () => {
    const { R, e, dummy } = manualAB({ dummySide: PortSide.NORTH, dir: Direction.DOWN })
    // dummy 侧 NORTH, dir DOWN → isTranslatedWEDummy true → 源端点偏移 parentOffset (100,200)
    processCompoundGraphPost(R)
    // ch1 sourcePoint = dummyAbs(10,20) + parentOffset(100,200) = (110,220) (无段弯点)
    expect(pts(e.getBendPoints())).toEqual([{ x: 110, y: 220 }])
    void dummy
  })

  it('RIGHT 方向 + N-S dummy (NORTH): 未平移 → 源端点用 segOffset (含 padding)', () => {
    const { R, e } = manualAB({ dummySide: PortSide.NORTH, dir: Direction.RIGHT })
    // isTranslatedWEDummy(NORTH) with RIGHT → false → segOffset = coordSystemOffset = (107,203)
    processCompoundGraphPost(R)
    // ch1 sourcePoint = (10,20)+(107,203) = (117,223) (无段弯点)
    expect(pts(e.getBendPoints())).toEqual([{ x: 117, y: 223 }])
  })

  it('SEPARATE + NORMAL 源在嵌套图 (B→A): 源端点用 parentOffset; INCLUDE 用 segOffset', () => {
    // B→A 手动构造: ch0 源 = B.p (NORMAL in G), ch1 目标 = A.p
    const R = new LGraph()
    R.setProperty(DIRECTION, Direction.RIGHT)
    R.setProperty(HIERARCHY_HANDLING, 'SEPARATE_CHILDREN')
    const { p: P, g: G } = compound(R, 'P')
    P.position = { x: 100, y: 200 }
    G.setPadding({ left: 7, top: 3, right: 7, bottom: 3 })
    const A = node(R, 'A')
    const B = node(G, 'B', { x: 40, y: 20 })
    const bp = port(B, PortSide.EAST, { x: 0, y: 10 })
    const ap = port(A, PortSide.WEST, { x: 0, y: 15 })
    const e = new LEdge()
    e.setSource(bp)
    e.setTarget(ap)
    // 段0 (G): B → dummy(G)
    const dummy = new LNode(G)
    dummy.setType(NodeType.EXTERNAL_PORT)
    dummy.setProperty(EXT_PORT_SIDE, PortSide.EAST)
    dummy.setProperty(ORIGIN, port(P, PortSide.EAST))
    dummy.position = { x: 10, y: 20 }
    const dummyPort = new LPort()
    dummyPort.setNode(dummy)
    const seg0 = new LEdge()
    seg0.setSource(bp)
    seg0.setTarget(dummyPort)
    seg0.getBendPoints().push({ x: 20, y: 30 })
    const ch0 = new CrossHierarchyEdge(seg0, G, PortType.OUTPUT)
    // 段1 (R): P 端口 → A
    const pPort = port(P, PortSide.EAST)
    const seg1 = new LEdge()
    seg1.setSource(pPort)
    seg1.setTarget(ap)
    const ch1 = new CrossHierarchyEdge(seg1, R, PortType.OUTPUT)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch0, ch1])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    // sourcePort = bp → B (NORMAL in G); reference = 顶层 R
    // ch0 (G): sourcePoint = bp.abs(0,14) + parentOffset(100,200) = (100,214); 段弯点 (120,230)
    // ch1 (R): sourcePoint = P 端口 abs(100,200) + 0; nextPoint = targetPoint(0,19) → 差足够 → 补 (100,200)
    expect(pts(e.getBendPoints())).toEqual([{ x: 120, y: 230 }, { x: 100, y: 200 }])
  })

  it('X(嵌套)→Y(更深嵌套) 同在容器内: reference=容器内容图 G, TARGET_OFFSET 只含 P2 偏移', () => {
    // X in G (P 内容), Y in G2 (P2 内容, P2 in G): LCA = P → reference = G
    const R = new LGraph()
    const { p: P, g: G } = compound(R, 'P')
    P.position = { x: 100, y: 200 }
    const X = node(G, 'X', { x: 40, y: 20 })
    const { p: P2, g: G2 } = compound(G, 'P2')
    P2.position = { x: 10, y: 20 }
    const Y = node(G2, 'Y', { x: 40, y: 20 })
    const xp = port(X, PortSide.EAST)
    const yp = port(Y, PortSide.WEST)
    const e = new LEdge()
    e.setSource(xp)
    e.setTarget(yp)
    // INPUT 段 (浅者在前): 段0 (G): X → dummy(G); 段1 (G2): dummy(G2) → Y
    const d0 = new LNode(G)
    d0.setType(NodeType.EXTERNAL_PORT)
    d0.setProperty(ORIGIN, xp)
    d0.position = { x: 0, y: 0 }
    const d0p = new LPort()
    d0p.setNode(d0)
    const d1 = new LNode(G2)
    d1.setType(NodeType.EXTERNAL_PORT)
    d1.setProperty(ORIGIN, yp)
    d1.position = { x: 5, y: 5 }
    const d1p = new LPort()
    d1p.setNode(d1)
    const seg0 = new LEdge()
    seg0.setSource(xp)
    seg0.setTarget(d0p)
    const seg1 = new LEdge()
    seg1.setSource(d1p)
    seg1.setTarget(yp)
    seg1.getBendPoints().push({ x: 30, y: 40 })
    const ch0 = new CrossHierarchyEdge(seg0, G, PortType.INPUT)
    const ch1 = new CrossHierarchyEdge(seg1, G2, PortType.INPUT)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch0, ch1])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    // TARGET_OFFSET = graphParentOffset(G2, G) = P2.pos = (10,20); 若 while 越过 target 会加 P.pos
    expect(e.getProperty(TARGET_OFFSET)).toEqual({ x: 10, y: 20 })
    // 段1 弯点: graphParentOffset(G2, G) = (10,20) → {30,40}+(10,20) = {40,60}
    // 段1 源端点: EXTERNAL_PORT, includeChildren=false → segOffset = coordSystemOffset(G2,G) =
    //   P2.pos + G2.padding(12,12) = (22,32) → {5,5}+(22,32) = {27,37} (被补)
    expect(pts(e.getBendPoints())).toEqual([{ x: 27, y: 37 }, { x: 40, y: 60 }])
  })

  it('TARGET_OFFSET: 目标端口节点为 EXTERNAL_PORT 时用 coordSystemOffset (含 padding)', () => {
    const R = new LGraph()
    const A = node(R, 'A')
    const { p: P, g: G } = compound(R, 'P')
    P.position = { x: 100, y: 200 }
    G.setPadding({ left: 7, top: 3, right: 7, bottom: 3 })
    const ap = port(A, PortSide.EAST, { x: 60, y: 15 })
    const e = new LEdge()
    e.setSource(ap)
    e.setTarget(ap)
    // 段: 源 ap → 目标 dummy (EXTERNAL_PORT, ORIGIN = 嵌套图内另一 dummy 的端口)
    const innerDummy = new LNode(G)
    innerDummy.setType(NodeType.EXTERNAL_PORT)
    const innerPort = new LPort()
    innerPort.setNode(innerDummy)
    const dummy = new LNode(R)
    dummy.setType(NodeType.EXTERNAL_PORT)
    dummy.setProperty(ORIGIN, innerPort)
    const dummyPort = new LPort()
    dummyPort.setNode(dummy)
    const seg = new LEdge()
    seg.setSource(ap)
    seg.setTarget(dummyPort)
    const ch = new CrossHierarchyEdge(seg, R, PortType.INPUT)
    const map = new Map<LEdge, CrossHierarchyEdge[]>()
    map.set(e, [ch])
    R.setProperty(CROSS_HIERARCHY_MAP, map)
    processCompoundGraphPost(R)
    // tgtNode = innerDummy (EXTERNAL_PORT) → tOffset = coordSystemOffset(G,R) = P.pos + G.padding = (107,203)
    expect(e.getProperty(TARGET_OFFSET)).toEqual({ x: 107, y: 203 })
  })
})

function orphanNode(): LNode {
  return new LNode(null)
}
