/**
 * RoutingSlotAssigner (ELK intermediate.loops.routing.RoutingSlotAssigner) 语义单元测试.
 * SSOT: ELK Java 0.12.0 RoutingSlotAssigner.java.
 * 覆盖: 标签交叉矩阵、超边依赖、断环、槽号分配与标签冲突槽推进.
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { RoutingDirector } from '../../src/intermediate/loops/routing/routing-director.js'
import { RoutingSlotAssigner, breakNonCriticalCycles } from '../../src/intermediate/loops/routing/routing-slot-assigner.js'
import { placeSelfLoopLabels } from '../../src/intermediate/loops/routing/label-placer.js'
import { HyperEdgeSegment } from '../../src/p5edges/orthogonal/hyper-edge-segment.js'
import { HyperEdgeSegmentDependency } from '../../src/p5edges/orthogonal/hyper-edge-segment-dependency.js'
import { MockRandom } from './helpers/MockRandom.js'
import { makeGraph, makeLayer, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'

function prepare(holder: ReturnType<typeof installHolder>): void {
  for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
  new RoutingDirector().determineLoopRoutes(holder)
  placeSelfLoopLabels(holder)
}

/** 两个 NORTH 单侧环, 每环一条带标签边. */
function twoNorthLabeledLoops(labelSizeA = { x: 20, y: 5 }, labelSizeB = { x: 20, y: 5 }) {
  const graph = makeGraph()
  const layer = makeLayer(graph)
  const node = makeNode(graph, layer, { x: 50, y: 50 })
  const ports = makePorts(node, 4, 0, 0, 0)
  const eA = makeEdge(ports[0]!, ports[1]!)
  const eB = makeEdge(ports[2]!, ports[3]!)
  addLabel(eA, 'LA', labelSizeA)
  addLabel(eB, 'LB', labelSizeB)
  const holder = installHolder(node)
  prepare(holder)
  const [loopA, loopB] = holder.getSLHyperLoops()
  return { graph, node, ports, eA, eB, holder, loopA, loopB }
}

describe('RoutingSlotAssigner (ELK Java 移植)', () => {
  it('重叠标签环: 交叉矩阵为 true, 依赖 0 权重, 槽号推进避免标签重叠', () => {
    const { holder, loopA, loopB } = twoNorthLabeledLoops()
    new RoutingSlotAssigner().assignRoutingSlots(holder)

    // 标签: LabelPlacer 居中 → 两标签 x 范围重叠
    const labA = loopA.getSLLabels()!
    const labB = loopB.getSLLabels()!
    expect(labA.getSide()).toBe(PortSide.NORTH)
    expect(labB.getSide()).toBe(PortSide.NORTH)
    // 重叠标签 → B 被推进到槽 1 (line 213-221, 233)
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBe(1)
    // 不变式: 槽号非负且单调; holder 槽计数 = 最大槽+1
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBeGreaterThanOrEqual(0)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBeGreaterThan(loopA.getRoutingSlot(PortSide.NORTH))
    expect(holder.getRoutingSlotCount()[0]).toBe(2) // NORTH ordinal 0
  })

  it('不重叠标签 (手动改位置): 无交叉依赖, 槽号不推进', () => {
    const { holder, loopA, loopB } = twoNorthLabeledLoops({ x: 10, y: 5 }, { x: 10, y: 5 })
    // 手动把 B 的标签位置移到远处 → 不与 A 重叠
    loopB.getSLLabels()!.getPosition().x = 100
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBe(0)
  })

  it('不同侧标签 (NORTH + SOUTH): labelsOverlap 返回 false', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const portsN = makePorts(node, 2, 0, 0, 0)
    const portsS = makePorts(node, 0, 0, 2, 0)
    const eN = makeEdge(portsN[0]!, portsN[1]!)
    const eS = makeEdge(portsS[0]!, portsS[1]!)
    addLabel(eN, 'LN', { x: 10, y: 5 })
    addLabel(eS, 'LS', { x: 10, y: 5 })
    const holder = installHolder(node)
    prepare(holder)
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    // 两侧槽互不干扰
    const [loopN, loopS] = holder.getSLHyperLoops()
    expect(loopN.getSLLabels()!.getSide()).toBe(PortSide.NORTH)
    expect(loopS.getSLLabels()!.getSide()).toBe(PortSide.SOUTH)
    expect(loopN.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loopS.getRoutingSlot(PortSide.SOUTH)).toBe(0)
  })

  it('EAST 标签: labelsOverlap 对 E/W 侧返回 false', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 0, 4, 0, 0)
    const eA = makeEdge(ports[0]!, ports[1]!)
    const eB = makeEdge(ports[2]!, ports[3]!)
    addLabel(eA, 'LA', { x: 10, y: 5 })
    addLabel(eB, 'LB', { x: 10, y: 5 })
    const holder = installHolder(node)
    prepare(holder)
    const [loopA, loopB] = holder.getSLHyperLoops()
    expect(loopA.getSLLabels()!.getSide()).toBe(PortSide.EAST)
    expect(loopB.getSLLabels()!.getSide()).toBe(PortSide.EAST)
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    expect(loopA.getRoutingSlot(PortSide.EAST)).toBe(0)
    expect(loopB.getRoutingSlot(PortSide.EAST)).toBe(0)
  })

  it('无标签环对: labelsOverlapWithMatrix null 分支, 等交叉时不建依赖', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 4, 0, 0, 0)
    makeEdge(ports[0]!, ports[1]!)
    makeEdge(ports[2]!, ports[3]!)
    const holder = installHolder(node)
    prepare(holder)
    const [loopA, loopB] = holder.getSLHyperLoops()
    expect(loopA.getSLLabels()).toBeNull()
    expect(loopB.getSLLabels()).toBeNull()
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBe(0)
  })



  it('createDependencies: 外层环在前 (firstAboveSecond < secondAboveFirst) → dep(seg1, seg2)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 4, 0, 0, 0)
    // 外层环 p0→p3 先建, 内层环 p1→p2 后建 → holder 顺序 [outer, inner]
    makeEdge(ports[0]!, ports[3]!)
    makeEdge(ports[1]!, ports[2]!)
    const holder = installHolder(node)
    prepare(holder)
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    const [outer, inner] = holder.getSLHyperLoops()
    // countCrossings(outer,inner)=0 < countCrossings(inner,outer)=2 → dep(outer→inner,2): inner 槽 0, outer 槽 1
    expect(inner.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(outer.getRoutingSlot(PortSide.NORTH)).toBe(1)
  })

  it('createDependencies: 外层环在后 (secondAboveFirst < firstAboveSecond) → dep(seg2, seg1)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 6, 0, 0, 0)
    // 内层环 p2→p3 (range 2..3) 先建; 外层环 p4→p1 (range 1..4) 后建
    // getOutgoingEdges 按端口序收集 → slEdges = [inner, outer] → holder 顺序 [inner, outer]
    makeEdge(ports[2]!, ports[3]!)
    makeEdge(ports[4]!, ports[1]!)
    const holder = installHolder(node)
    expect(holder.getSLHyperLoops()).toHaveLength(2)
    prepare(holder)
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    const [inner, outer] = holder.getSLHyperLoops()
    // countCrossings(inner,outer)=2, countCrossings(outer,inner)=0 → dep(outer→inner,2): 内层 sink 槽 0, 外层槽 1
    expect(inner.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(outer.getRoutingSlot(PortSide.NORTH)).toBe(1)
  })

  it('对侧环 (E+W): 无端口侧 (NORTH) 走 fallback 槽分配', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const ports = makePorts(node, 0, 1, 0, 1)
    makeEdge(ports[0]!, ports[1]!)
    const holder = installHolder(node)
    prepare(holder)
    const loop = holder.getSLHyperLoops()[0]!
    // 环占用 {W,N,E}: NORTH 无端口 → fallback slot = 环索引 0
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    expect(loop.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loop.getRoutingSlot(PortSide.EAST)).toBe(0)
    expect(loop.getRoutingSlot(PortSide.WEST)).toBe(0)
  })

  it('breakNonCriticalCycles: 0 权重环移除, 正权重环反转', () => {
    // 0 权重环: A→B(0), B→A(0) → 移除一条
    const a = new HyperEdgeSegment()
    const b = new HyperEdgeSegment()
    const ab = HyperEdgeSegmentDependency.createAndAddRegular(a, b, 0)
    const ba = HyperEdgeSegmentDependency.createAndAddRegular(b, a, 0)
    breakNonCriticalCycles([a, b], new MockRandom())
    expect(a.getOutgoingSegmentDependencies().length + b.getOutgoingSegmentDependencies().length).toBe(1)
    // 断环检测: A.mark(1) > B.mark(0) → 移除 A→B; B→A 保留
    expect(ab.getSource()).toBeNull()
    expect(ab.getTarget()).toBeNull()
    expect(ba.getSource()).toBe(b)
    expect(ba.getTarget()).toBe(a)

    // 正权重环: C→D(1), D→C(1) → 一条被反转
    const c = new HyperEdgeSegment()
    const d = new HyperEdgeSegment()
    const cd = HyperEdgeSegmentDependency.createAndAddRegular(c, d, 1)
    const dc = HyperEdgeSegmentDependency.createAndAddRegular(d, c, 1)
    breakNonCriticalCycles([c, d], new MockRandom())
    // ELK unprocessed 是 TreeSet (按 mark 升序): c.mark=-1, d.mark=-2 → 序 [d, c].
    // MockRandom.nextInt → 0 → 选 d 先 mark (d=3, c=4) → 回边为 C→D, 反转成 D→C.
    expect(dc.getSource()).toBe(d)
    expect(dc.getTarget()).toBe(c)
    expect(cd.getSource()).toBe(d)
    expect(cd.getTarget()).toBe(c)
  })
})

describe('RoutingSlotAssigner 补充 (ELK Java 移植)', () => {
  it('fallback 分支多环: 占用但无端口侧槽号 = 排序后环索引 (而非恒 0)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    // 两个 E+W 对侧环: occupied {E,S,W}, 但节点无 SOUTH 端口 → SOUTH fallback
    const p1 = makePorts(node, 0, 1, 0, 1)
    makeEdge(p1[0]!, p1[1]!)
    const p2 = makePorts(node, 0, 1, 0, 1)
    makeEdge(p2[0]!, p2[1]!)
    const holder = installHolder(node)
    prepare(holder)
    const [loopA, loopB] = holder.getSLHyperLoops()
    expect(loopA.getOccupiedPortSides().has(PortSide.SOUTH)).toBe(true)
    expect(loopB.getOccupiedPortSides().has(PortSide.SOUTH)).toBe(true)
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    // fallback: SOUTH 槽 = 排序后 (按当前槽号) 环列表索引 (0, 1)
    expect(loopA.getRoutingSlot(PortSide.SOUTH)).toBe(0)
    expect(loopB.getRoutingSlot(PortSide.SOUTH)).toBe(1)
    // 有真实端口的 E/W 侧走正常分支
    expect(loopA.getRoutingSlot(PortSide.EAST)).toBeGreaterThanOrEqual(0)
    expect(loopB.getRoutingSlot(PortSide.EAST)).toBeGreaterThanOrEqual(0)
  })

  it('共享端口区间环: 交叉计数双向 >0 → 0 权重依赖, 槽号仍分开', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    // A: p0→p2 (活动 0..2); B: p1→p3 (活动 1..3) → countCrossings 双向 = 1
    const ports = makePorts(node, 4, 0, 0, 0)
    makeEdge(ports[0]!, ports[2]!)
    makeEdge(ports[1]!, ports[3]!)
    const holder = installHolder(node)
    prepare(holder)
    const [loopA, loopB] = holder.getSLHyperLoops()
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    // 共享端口 → shift 阶段强制错开 (A 槽 0, B 槽 1 或反之)
    const slotA = loopA.getRoutingSlot(PortSide.NORTH)
    const slotB = loopB.getRoutingSlot(PortSide.NORTH)
    expect(slotA).not.toBe(slotB)
    expect(slotA).toBeGreaterThanOrEqual(0)
    expect(slotB).toBeGreaterThanOrEqual(0)
  })

  it('三侧环 (N+E+S): 占用侧均分配到槽号', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const n = makePorts(node, 1, 0, 0, 0)
    const e = makePorts(node, 0, 1, 0, 0)
    const s = makePorts(node, 0, 0, 1, 0)
    makeEdge(n[0]!, e[0]!)
    makeEdge(e[0]!, s[0]!)
    const holder = installHolder(node)
    prepare(holder)
    const loop = holder.getSLHyperLoops()[0]!
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    expect(loop.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loop.getRoutingSlot(PortSide.EAST)).toBe(0)
    expect(loop.getRoutingSlot(PortSide.SOUTH)).toBe(0)
  })
})

describe('RoutingSlotAssigner 混合标签 (ELK Java 移植)', () => {
  it('带标签环 + 无标签环: 无标签环不进入交叉矩阵 (getSLLabels null 守卫)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    // 环 A (带标签): p0→p1; 环 B (无标签): p2→p3
    const ports = makePorts(node, 4, 0, 0, 0)
    const eA = makeEdge(ports[0]!, ports[1]!)
    addLabel(eA, 'LA', { x: 20, y: 5 })
    makeEdge(ports[2]!, ports[3]!)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    new RoutingDirector().determineLoopRoutes(holder)
    placeSelfLoopLabels(holder)
    const [loopA, loopB] = holder.getSLHyperLoops()
    expect(loopA.getSLLabels()).not.toBeNull()
    expect(loopB.getSLLabels()).toBeNull()
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    // 两个环区间不相交 → 无交叉依赖, 均槽 0 (带标签环不崩溃)
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBe(0)
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBeGreaterThanOrEqual(0)
  })

  it('嵌套区间环: 交叉计数单向 >0 (A=0, B=2) → 单边依赖, 槽号错开 (branch2)', () => {
    const graph = makeGraph()
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    // A: p0→p3 (activity {0,1,2,3}); B: p1→p2 (activity {1,2})
    // → countCrossings(A,B) = A 端口 {0,3} ∩ B activity {1,2} = 0; (B,A) = {1,2} ∩ {0..3} = 2
    const ports = makePorts(node, 4, 0, 0, 0)
    makeEdge(ports[0]!, ports[3]!)
    makeEdge(ports[1]!, ports[2]!)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    new RoutingDirector().determineLoopRoutes(holder)
    placeSelfLoopLabels(holder)
    const [loopA, loopB] = holder.getSLHyperLoops()
    new RoutingSlotAssigner().assignRoutingSlots(holder)
    // first(0) < second(2) → 依赖 A→B (weight 2): B sink 槽 0, A 槽 1
    expect(loopA.getRoutingSlot(PortSide.NORTH)).toBe(1)
    expect(loopB.getRoutingSlot(PortSide.NORTH)).toBe(0)
  })
})
