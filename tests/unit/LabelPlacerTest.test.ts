/**
 * LabelPlacer (ELK intermediate.loops.routing.LabelPlacer) 语义单元测试.
 * SSOT: ELK Java 0.12.0 LabelPlacer.java
 *  - ONE_SIDE EAST/WEST → Alignment.TOP + 最上端口 reference (LabelPlacer.java:155-166,394-395)
 *  - ONE_SIDE NORTH/SOUTH → CENTER
 *  - TWO_SIDES_CORNER → leftmost/rightmost 侧 LEFT/RIGHT (LabelPlacer.java:238-249)
 *  - TWO_SIDES_OPPOSING/THREE_SIDES → 未占用侧 SOUTH/NORTH+CENTER 或 NORTH+LEFT/RIGHT (LabelPlacer.java:262-309)
 *  - FOUR_SIDES → leftmost 侧 NORTH → SOUTH+CENTER, 否则 NORTH+CENTER (LabelPlacer.java:311-343)
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { placeSelfLoopLabels } from '../../src/intermediate/loops/routing/label-placer.js'
import { LabelAlignment } from '../../src/intermediate/loops/self-hyper-loop-labels.js'
import { makeGraph, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'
import type { SelfHyperLoop } from '../../src/intermediate/loops/self-hyper-loop.js'
import { LPort } from '../../src/graph/lport.js'
import type { SelfLoopHolder } from '../../src/intermediate/loops/self-loop-holder.js'

/** 单超环 (全部端口在同一侧) + 可选标签. 模拟 RoutingDirector: 设置 leftmost/rightmost + occupied. */
function oneSideHolder(side: PortSide, n: number, withLabel: boolean, size: { x: number; y: number } = { x: 10, y: 5 }) {
  const graph = makeGraph()
  const node = makeNode(graph, null, { x: 50, y: 50 })
  const ports = makePorts(node, side === PortSide.NORTH ? n : 0, side === PortSide.EAST ? n : 0, side === PortSide.SOUTH ? n : 0, side === PortSide.WEST ? n : 0)
  const edge = makeEdge(ports[0]!, ports[1]!)
  if (withLabel) addLabel(edge, 'L', size)
  const holder = installHolder(node)
  const loop = holder.getSLHyperLoops()[0]!
  loop.computePortsPerSide()
  const slPorts = loop.getSLPorts()
  loop.setLeftmostPort(slPorts[0]!)
  loop.setRightmostPort(slPorts[slPorts.length - 1]!)
  loop.getOccupiedPortSides().add(side)
  return { graph, node, holder, ports, edge }
}

/** 构造一个带标签的自环超环 (edges 连成一个连通分量), 手工配置 leftmost/rightmost/occupied (RoutingDirector 语义). */
function labeledLoop(
  portSides: PortSide[], edges: [number, number][], leftmostIdx: number, rightmostIdx: number, occupied: PortSide[],
): { holder: SelfLoopHolder; ports: LPort[]; loop: SelfHyperLoop } {
  const graph = makeGraph()
  const node = makeNode(graph, null, { x: 50, y: 50 })
  const ports: LPort[] = []
  for (const side of portSides) {
    const p = new LPort()
    p.setNode(node)
    p.setSide(side)
    ports.push(p)
  }
  const firstEdge = makeEdge(ports[edges[0]![0]]!, ports[edges[0]![1]]!)
  addLabel(firstEdge, 'L', { x: 10, y: 5 })
  for (let i = 1; i < edges.length; i++) {
    makeEdge(ports[edges[i]![0]]!, ports[edges[i]![1]]!)
  }
  const holder = installHolder(node)
  const loop = holder.getSLHyperLoops()[0]!
  loop.computePortsPerSide()
  loop.setLeftmostPort(holder.getSLPortMap().get(ports[leftmostIdx]!)!)
  loop.setRightmostPort(holder.getSLPortMap().get(ports[rightmostIdx]!)!)
  for (const side of occupied) loop.getOccupiedPortSides().add(side)
  return { holder, ports, loop }
}

describe('LabelPlacer (ELK Java 移植)', () => {
  it('ONE_SIDE 环: 标签侧 = 端口侧, 对齐 CENTER, NORTH/SOUTH 水平居中', () => {
    for (const side of [PortSide.NORTH, PortSide.SOUTH]) {
      const { node, holder } = oneSideHolder(side, 2, true)
      placeSelfLoopLabels(holder)
      const labels = holder.getSLHyperLoops()[0]!.getSLLabels()!
      expect(labels.getSide()).toBe(side)
      expect(labels.getAlignment()).toBe(LabelAlignment.CENTER)
      expect(labels.getAlignmentReferenceSLPort()).toBeNull()
      // position.x = (node.size.x - labels.size.x) / 2 = (50 - 10) / 2
      expect(labels.getPosition().x).toBe(20)
      expect(labels.getPosition().y).toBe(0)
      expect(node.size).toEqual({ x: 50, y: 50 })
    }
  })

  it('ONE_SIDE 环 EAST/WEST: Alignment.TOP, 对齐最上端口 (position.y = ref.y + anchor.y = 0)', () => {
    for (const side of [PortSide.WEST, PortSide.EAST]) {
      const { holder } = oneSideHolder(side, 2, true)
      placeSelfLoopLabels(holder)
      const loop = holder.getSLHyperLoops()[0]!
      const labels = loop.getSLLabels()!
      expect(labels.getSide()).toBe(side)
      expect(labels.getAlignment()).toBe(LabelAlignment.TOP)
      // 端口 position={0,0}, anchor={0,0} (端口 size=0) → y = 0 (LabelPlacer.java:394-395)
      expect(labels.getPosition().y).toBe(0)
      expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getLeftmostPort())
    }
  })

  it('ONE_SIDE 环 EAST: 最上端口为 rightmost 时以 rightmost 为 reference', () => {
    const graph = makeGraph()
    const node = makeNode(graph, null, { x: 50, y: 50 })
    const [p0, p1] = makePorts(node, 0, 2, 0, 0)
    // 端口 size 0; 手动摆位置: p0 在 y=10, p1 (rightmost) 在 y=0 → 最上 = p1
    p0.getPosition().y = 10
    const edge = makeEdge(p0, p1)
    addLabel(edge, 'L', { x: 10, y: 5 })
    const holder = installHolder(node)
    const loop = holder.getSLHyperLoops()[0]!
    loop.computePortsPerSide()
    const slPorts = loop.getSLPorts()
    loop.setLeftmostPort(slPorts[0]!)
    loop.setRightmostPort(slPorts[1]!)
    loop.getOccupiedPortSides().add(PortSide.EAST)
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getAlignment()).toBe(LabelAlignment.TOP)
    expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getRightmostPort())
    expect(labels.getPosition().y).toBe(0) // p1.y=0 + anchor 0
  })

  it('TWO_SIDES_CORNER N+E: leftmost=NORTH → NORTH/LEFT/leftmost (x = ref.x + anchor.x = 0)', () => {
    const { holder, ports, loop } = labeledLoop([PortSide.NORTH, PortSide.EAST], [[0, 1]], 0, 1, [PortSide.NORTH, PortSide.EAST])
    expect(loop.getSelfLoopType()).toBe('TWO_SIDES_CORNER')
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.NORTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.LEFT)
    expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getLeftmostPort())
    // LEFT: x = ref.position.x + ref.anchor.x = 0 (LabelPlacer.java:386-387)
    expect(labels.getPosition().x).toBe(0)
    void ports
  })

  it('TWO_SIDES_CORNER S+W: leftmost=SOUTH → SOUTH/RIGHT/leftmost (x = ref.x + anchor.x - size.x)', () => {
    const { holder, loop } = labeledLoop([PortSide.SOUTH, PortSide.WEST], [[0, 1]], 0, 1, [PortSide.SOUTH, PortSide.WEST])
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.SOUTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.RIGHT)
    expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getLeftmostPort())
    // RIGHT: x = ref.x + anchor.x - size.x = 0 + 0 - 10 = -10 (LabelPlacer.java:390-391)
    expect(labels.getPosition().x).toBe(-10)
  })

  it('TWO_SIDES_OPPOSING E+W (occupied {E,S,W}): 未占用 NORTH → SOUTH/CENTER', () => {
    const { holder, loop } = labeledLoop([PortSide.EAST, PortSide.WEST], [[0, 1]], 0, 1, [PortSide.EAST, PortSide.SOUTH, PortSide.WEST])
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.SOUTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.CENTER)
    expect(labels.getAlignmentReferenceSLPort()).toBeNull()
    expect(labels.getPosition().x).toBe(20) // CENTER
  })

  it('TWO_SIDES_OPPOSING N+S (occupied {N,E,S}): 未占用 WEST → NORTH/LEFT/leftmost', () => {
    const { holder, loop } = labeledLoop([PortSide.NORTH, PortSide.SOUTH], [[0, 1]], 0, 1, [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH])
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.NORTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.LEFT)
    expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getLeftmostPort())
    expect(labels.getPosition().x).toBe(0)
  })

  it('THREE_SIDES 缺 EAST (occupied {N,S,W}): 未占用 EAST → NORTH/RIGHT/rightmost', () => {
    const { holder, loop } = labeledLoop([PortSide.NORTH, PortSide.SOUTH, PortSide.WEST], [[0, 1], [1, 2]], 0, 2, [PortSide.NORTH, PortSide.SOUTH, PortSide.WEST])
    expect(loop.getSelfLoopType()).toBe('THREE_SIDES')
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.NORTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.RIGHT)
    expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getRightmostPort())
    expect(labels.getPosition().x).toBe(-10)
  })

  it('FOUR_SIDES: leftmost=NORTH → SOUTH/CENTER; leftmost≠NORTH → NORTH/CENTER', () => {
    // leftmost = NORTH → SOUTH/CENTER (LabelPlacer.java:335-337)
    const nLoop = labeledLoop([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST], [[0, 1], [1, 2], [2, 3], [3, 0]], 0, 1, [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST])
    expect(nLoop.loop.getSelfLoopType()).toBe('FOUR_SIDES')
    placeSelfLoopLabels(nLoop.holder)
    const nLabels = nLoop.loop.getSLLabels()!
    expect(nLabels.getSide()).toBe(PortSide.SOUTH)
    expect(nLabels.getAlignment()).toBe(LabelAlignment.CENTER)

    // leftmost = EAST → NORTH/CENTER (Java 源码对 rightmost 也取 leftmost, 见 label-placer.ts 注释)
    const eLoop = labeledLoop([PortSide.EAST, PortSide.SOUTH, PortSide.WEST, PortSide.NORTH], [[0, 1], [1, 2], [2, 3], [3, 0]], 0, 1, [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST])
    placeSelfLoopLabels(eLoop.holder)
    const eLabels = eLoop.loop.getSLLabels()!
    expect(eLabels.getSide()).toBe(PortSide.NORTH)
    expect(eLabels.getAlignment()).toBe(LabelAlignment.CENTER)
  })

  it('无标签环跳过 (continue), 有标签环才计算坐标', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // 两个独立超环: 一个带标签, 一个不带
    const portsA = makePorts(node, 0, 2, 0, 0)
    const eA = makeEdge(portsA[0]!, portsA[1]!)
    addLabel(eA, 'LA', { x: 10, y: 5 })
    const portsB = makePorts(node, 0, 0, 2, 0)
    makeEdge(portsB[0]!, portsB[1]!)
    const holder = installHolder(node)
    expect(holder.getSLHyperLoops()).toHaveLength(2)
    for (const loop of holder.getSLHyperLoops()) {
      loop.computePortsPerSide()
      const slPorts = loop.getSLPorts()
      loop.setLeftmostPort(slPorts[0]!)
      loop.setRightmostPort(slPorts[slPorts.length - 1]!)
      loop.getOccupiedPortSides().add(slPorts[0]!.getLPort().getSide())
    }
    placeSelfLoopLabels(holder)
    const loops = holder.getSLHyperLoops()
    const labeled = loops.find(l => l.getSLLabels() !== null)!
    const unlabeled = loops.find(l => l.getSLLabels() === null)!
    expect(unlabeled.getSLLabels()).toBeNull()
    expect(labeled.getSLLabels()!.getSide()).toBe(PortSide.EAST)
    expect(labeled.getSLLabels()!.getAlignment()).toBe(LabelAlignment.TOP)
  })
})

describe('LabelPlacer 补充 (ELK Java 移植)', () => {
  it('SEQUENCED: NORTH/SOUTH 单侧环成对内外对齐, 奇数中间居中', () => {
    const graph = makeGraph({ ordering: 'SEQUENCED' })
    const node = makeNode(graph, null, { x: 50, y: 50 })
    const n1 = makePorts(node, 2, 0, 0, 0); addLabel(makeEdge(n1[0]!, n1[1]!), 'N1', { x: 10, y: 5 })
    const n2 = makePorts(node, 2, 0, 0, 0); addLabel(makeEdge(n2[0]!, n2[1]!), 'N2', { x: 10, y: 5 })
    const n3 = makePorts(node, 2, 0, 0, 0); addLabel(makeEdge(n3[0]!, n3[1]!), 'N3', { x: 10, y: 5 })
    const s1 = makePorts(node, 0, 0, 2, 0); addLabel(makeEdge(s1[0]!, s1[1]!), 'S1', { x: 10, y: 5 })
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) {
      loop.computePortsPerSide()
      const slPorts = loop.getSLPorts()
      loop.setLeftmostPort(slPorts[0]!)
      loop.setRightmostPort(slPorts[slPorts.length - 1]!)
      loop.getOccupiedPortSides().add(slPorts[0]!.getLPort().getSide())
    }
    placeSelfLoopLabels(holder)
    const loops = holder.getSLHyperLoops()
    const north = loops.filter(l => l.getSLLabels()!.getSide() === PortSide.NORTH)
    const south = loops.filter(l => l.getSLLabels()!.getSide() === PortSide.SOUTH)
    expect(north).toHaveLength(3)
    expect(south).toHaveLength(1)
    // 3 个 NORTH: 两端成对 (LEFT/RIGHT), 中间居中
    const alignments = north.map(l => l.getSLLabels()!.getAlignment()).sort()
    expect(alignments).toEqual([LabelAlignment.CENTER, LabelAlignment.LEFT, LabelAlignment.RIGHT])
    // SOUTH 单环居中
    expect(south[0]!.getSLLabels()!.getAlignment()).toBe(LabelAlignment.CENTER)
  })

  it('TWO_SIDES_CORNER N+W: rightmost=NORTH → NORTH/RIGHT/rightmost (计入非零 anchor)', () => {
    const { holder, loop, ports } = labeledLoop([PortSide.NORTH, PortSide.WEST], [[0, 1]], 1, 0, [PortSide.WEST, PortSide.NORTH])
    const rightmost = loop.getRightmostPort().getLPort()
    rightmost.position.x = 10
    rightmost.getAnchor().x = 4
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.NORTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.RIGHT)
    expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getRightmostPort())
    // RIGHT: x = pos.x + anchor.x - size.x = 10 + 4 - 10 = 4
    expect(labels.getPosition().x).toBe(4)
    void ports
  })

  it('TWO_SIDES_CORNER E+S: rightmost=SOUTH → SOUTH/LEFT/rightmost', () => {
    const { holder, loop } = labeledLoop([PortSide.EAST, PortSide.SOUTH], [[0, 1]], 0, 1, [PortSide.EAST, PortSide.SOUTH])
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.SOUTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.LEFT)
    expect(labels.getAlignmentReferenceSLPort()).toBe(loop.getRightmostPort())
  })

  it('THREE_SIDES 缺 SOUTH (occupied {N,E,W}): NORTH/CENTER', () => {
    const { holder, loop } = labeledLoop([PortSide.NORTH, PortSide.EAST, PortSide.WEST], [[0, 1], [1, 2]], 0, 2, [PortSide.NORTH, PortSide.EAST, PortSide.WEST])
    expect(loop.getSelfLoopType()).toBe('THREE_SIDES')
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.NORTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.CENTER)
    expect(labels.getAlignmentReferenceSLPort()).toBeNull()
  })

  it('LEFT 对齐坐标: 计入非零 position/anchor (x = ref.x + anchor.x)', () => {
    const { holder, loop, ports } = labeledLoop([PortSide.NORTH, PortSide.EAST], [[0, 1]], 0, 1, [PortSide.NORTH, PortSide.EAST])
    const leftmost = loop.getLeftmostPort().getLPort()
    leftmost.position.x = 10
    leftmost.getAnchor().x = 4
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getSide()).toBe(PortSide.NORTH)
    expect(labels.getAlignment()).toBe(LabelAlignment.LEFT)
    expect(labels.getPosition().x).toBe(14) // 10 + 4; 若误用减法 → 6
    void ports
  })

  it('TOP 对齐坐标 (ONE_SIDE EAST): y = ref.y + anchor.y 计入非零 anchor', () => {
    const { holder, ports } = oneSideHolder(PortSide.EAST, 2, true)
    const loop = holder.getSLHyperLoops()[0]!
    // 让 rightmost 成为 topmost (y 更小): leftmost.y=10 > rightmost.y=7
    const leftmost = loop.getLeftmostPort().getLPort()
    leftmost.position.y = 10
    const topmost = loop.getRightmostPort().getLPort()
    topmost.position.y = 7
    topmost.getAnchor().y = 3
    placeSelfLoopLabels(holder)
    const labels = loop.getSLLabels()!
    expect(labels.getAlignment()).toBe(LabelAlignment.TOP)
    expect(labels.getPosition().y).toBe(10) // 7 + 3; 若误用减法 → 4
    void ports
  })
})
