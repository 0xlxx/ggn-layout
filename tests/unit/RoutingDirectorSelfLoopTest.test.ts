/**
 * RoutingDirector (ELK intermediate.loops.routing.RoutingDirector) 语义单元测试.
 * SSOT: ELK Java 0.12.0 RoutingDirector.java. opposing 侧序 = ArrayListMultimap keySet 迭代序
 *   (JVM 哈希序, 本机实测 {EAST,WEST}→[WEST,EAST], Instr16Main) — 与建连顺序/elkjs 插入序不同.
 */
import { describe, expect, it } from 'vitest'
import { LNode, LPort, PortSide } from '../../src/index.js'
import { SelfLoopHolder } from '../../src/intermediate/loops/self-loop-holder.js'
import { RoutingDirector } from '../../src/intermediate/loops/routing/routing-director.js'
import { makeGraph, makeNode, makePorts, makeEdge, installHolder } from './helpers/SelfLoopGraphBuilder.js'

/** 构造节点 + 端口 (N/E/S/W 顺序) + 链式自环边, 返回 holder 与端口. */
function build(portCounts: [number, number, number, number], edges: [number, number][]): {
  holder: SelfLoopHolder; node: LNode; ports: LPort[]
} {
  const graph = makeGraph()
  const node = makeNode(graph)
  const ports = makePorts(node, portCounts[0], portCounts[1], portCounts[2], portCounts[3])
  for (const [s, t] of edges) makeEdge(ports[s]!, ports[t]!)
  const holder = installHolder(node)
  for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
  return { holder, node, ports }
}

function run(holder: SelfLoopHolder): void {
  new RoutingDirector().determineLoopRoutes(holder)
}

describe('RoutingDirector (ELK Java 移植, 全类型)', () => {
  it('ONE_SIDE: leftmost=最低端口, rightmost=最高端口, 占 NORTH', () => {
    const { holder, ports } = build([2, 0, 0, 0], [[0, 1]])
    run(holder)
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getLeftmostPort().getLPort()).toBe(ports[0])
    expect(loop.getRightmostPort().getLPort()).toBe(ports[1])
    expect(loop.getOccupiedPortSides()).toEqual(new Set([PortSide.NORTH]))
  })

  it('TWO_SIDES_CORNER N+E: leftmost=N, rightmost=E', () => {
    const { holder, ports } = build([2, 1, 0, 0], [[0, 1], [1, 2]])
    run(holder)
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getLeftmostPort().getLPort()).toBe(ports[0])
    expect(loop.getRightmostPort().getLPort()).toBe(ports[2])
    expect(loop.getOccupiedPortSides()).toEqual(new Set([PortSide.NORTH, PortSide.EAST]))
  })

  it('TWO_SIDES_CORNER N+W: 侧序 W,N (跨 NW 角)', () => {
    const { holder, ports } = build([1, 0, 0, 1], [[0, 1]])
    run(holder)
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getLeftmostPort().getLPort()).toBe(ports[1]) // W
    expect(loop.getRightmostPort().getLPort()).toBe(ports[0]) // N
    expect(loop.getOccupiedPortSides()).toEqual(new Set([PortSide.WEST, PortSide.NORTH]))
  })

  it('TWO_SIDES_OPPOSING E+W: keySet 哈希序 [WEST,EAST] → option1 (leftmost=W, 经 NORTH, RoutingDirector.java <=)', () => {
    const { holder, ports } = build([0, 1, 0, 1], [[0, 1]])
    run(holder)
    const loop = holder.getSLHyperLoops()[0]!
    // ELK 0.12.0: sides = keySet().toArray() = [WEST,EAST] (本机 JVM 哈希序, Instr16Main 实测,
    // 与建连顺序无关); option1Penalty <= option2Penalty → option1 (leftmost=W, rightmost=E)
    expect(loop.getLeftmostPort().getLPort()).toBe(ports[1]) // W
    expect(loop.getRightmostPort().getLPort()).toBe(ports[0]) // E
    expect(loop.getOccupiedPortSides()).toEqual(new Set([PortSide.WEST, PortSide.NORTH, PortSide.EAST]))
  })

  it('TWO_SIDES_OPPOSING N+S: 平局走 option1 (经 WEST)', () => {
    const { holder, ports } = build([1, 0, 1, 0], [[0, 1]])
    run(holder)
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getLeftmostPort().getLPort()).toBe(ports[0]) // N
    expect(loop.getRightmostPort().getLPort()).toBe(ports[1]) // S
    expect(loop.getOccupiedPortSides()).toEqual(new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH]))
  })

  it('THREE_SIDES 缺 N/E/S/W: 各星座 leftmost/rightmost/占用侧', () => {
    // 缺 N (E,S,W): leftmost=E, rightmost=W
    const mN = build([0, 1, 1, 1], [[0, 1], [1, 2]])
    run(mN.holder)
    expect(mN.holder.getSLHyperLoops()[0]!.getLeftmostPort().getLPort()).toBe(mN.ports[0])
    expect(mN.holder.getSLHyperLoops()[0]!.getRightmostPort().getLPort()).toBe(mN.ports[2])
    expect(mN.holder.getSLHyperLoops()[0]!.getOccupiedPortSides()).toEqual(new Set([PortSide.EAST, PortSide.SOUTH, PortSide.WEST]))

    // 缺 E (N,S,W): leftmost=S, rightmost=N
    const mE = build([1, 0, 1, 1], [[0, 1], [1, 2]])
    run(mE.holder)
    expect(mE.holder.getSLHyperLoops()[0]!.getLeftmostPort().getLPort()).toBe(mE.ports[1])
    expect(mE.holder.getSLHyperLoops()[0]!.getRightmostPort().getLPort()).toBe(mE.ports[0])
    expect(mE.holder.getSLHyperLoops()[0]!.getOccupiedPortSides()).toEqual(new Set([PortSide.SOUTH, PortSide.WEST, PortSide.NORTH]))

    // 缺 S (N,E,W): leftmost=W, rightmost=E
    const mS = build([1, 1, 0, 1], [[0, 1], [1, 2]])
    run(mS.holder)
    expect(mS.holder.getSLHyperLoops()[0]!.getLeftmostPort().getLPort()).toBe(mS.ports[2])
    expect(mS.holder.getSLHyperLoops()[0]!.getRightmostPort().getLPort()).toBe(mS.ports[1])
    expect(mS.holder.getSLHyperLoops()[0]!.getOccupiedPortSides()).toEqual(new Set([PortSide.WEST, PortSide.NORTH, PortSide.EAST]))

    // 缺 W (N,E,S): leftmost=N, rightmost=S
    const mW = build([1, 1, 1, 0], [[0, 1], [1, 2]])
    run(mW.holder)
    expect(mW.holder.getSLHyperLoops()[0]!.getLeftmostPort().getLPort()).toBe(mW.ports[0])
    expect(mW.holder.getSLHyperLoops()[0]!.getRightmostPort().getLPort()).toBe(mW.ports[2])
    expect(mW.holder.getSLHyperLoops()[0]!.getOccupiedPortSides()).toEqual(new Set([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH]))
  })

  it('FOUR_SIDES: 选择惩罚最大的断点对 (跳过常规端口)', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // 端口顺序: p0 N(SL), p1 E(常规), p2 E(常规), p3 E(SL), p4 S(SL), p5 W(SL)
    const ports = makePorts(node, 1, 3, 1, 1)
    // 自环: p0→p3→p4→p5→p0 (一个超环, 4 侧)
    makeEdge(ports[0]!, ports[3]!)
    makeEdge(ports[3]!, ports[4]!)
    makeEdge(ports[4]!, ports[5]!)
    makeEdge(ports[5]!, ports[0]!)
    // 常规边: p1, p2 → 另一节点 (提高其端口惩罚)
    const other = makeNode(graph)
    const o = makePorts(other, 0, 0, 0, 2)
    makeEdge(ports[1]!, o[0]!)
    makeEdge(ports[2]!, o[1]!)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getSelfLoopType()).toBe('FOUR_SIDES')
    run(holder)
    // 惩罚: pp = [1,4,7,10,11,12]; (p0,p3) gap=6 最大 → leftmost=p3(E), rightmost=p0(N)
    expect(loop.getLeftmostPort().getLPort()).toBe(ports[3])
    expect(loop.getRightmostPort().getLPort()).toBe(ports[0])
    expect(loop.getOccupiedPortSides()).toEqual(new Set([PortSide.EAST, PortSide.SOUTH, PortSide.WEST, PortSide.NORTH]))
  })

  it('computeEdgePenalty: wrap 分支 (rightmost id=1) + 未连接端口惩罚', () => {
    const graph = makeGraph()
    const node = makeNode(graph)
    // 端口顺序: U(N, 未连接), E, W → ids 0,1,2
    const [u, e, w] = makePorts(node, 1, 1, 0, 1)
    makeEdge(e, w)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    const loop = holder.getSLHyperLoops()[0]!
    run(holder)
    // option1 (E→W 直接) penalty=0 < option2 (W→E wrap) penalty=1 → 选 option1
    expect(loop.getLeftmostPort().getLPort()).toBe(e)
    expect(loop.getRightmostPort().getLPort()).toBe(w)
    void u
  })


})

describe('RoutingDirector FOUR_SIDES 平局 (ELK Java 移植)', () => {
  it('全部惩罚相等: 保留首个断点对 (严格 >, 非 >=)', () => {
    // 4 端口全连接 FOUR_SIDES 环 → 所有断点对惩罚 0 (平局)
    const { holder, ports } = build([1, 1, 1, 1], [[0, 1], [1, 2], [2, 3], [3, 0]])
    const loop = holder.getSLHyperLoops()[0]!
    expect(loop.getSelfLoopType()).toBe('FOUR_SIDES')
    run(holder)
    // 平局时保留首个最坏对 (sortedSLPorts 末/首): setLeftmost(worstRight=p0), setRightmost(worstLeft=p3)
    expect(loop.getLeftmostPort().getLPort()).toBe(ports[0])
    expect(loop.getRightmostPort().getLPort()).toBe(ports[3])
  })
})
