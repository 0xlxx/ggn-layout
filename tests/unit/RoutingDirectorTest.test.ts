/**
 * RoutingDirector opposing two-side 自环路由的侧序语义单元测试.
 * SSOT: ELK Java 0.12.0 RoutingDirector.determineTwoSideOpposingLoopRoutes
 *  (RoutingDirector.java): `slLoop.getSLPortsBySide().keySet().toArray(new PortSide[2])`.
 *
 * ★ 0.12.0 侧序 = ArrayListMultimap (HashMap 后备) 的 keySet 迭代序 = **JVM 哈希序**, 与边的
 *   建连顺序/插入顺序无关. 本机 (openjdk21 + guava 33.4.0, Instr16Main 实测) 对 {EAST, WEST}
 *   恒为 [WEST, EAST] (全侧序 [WEST, NORTH, SOUTH, EAST]) → sides[0]=WEST → option1
 *   (leftmost=WEST, 经 NORTH). 平局 (option1Penalty == option2Penalty) 时 `<=` 必选 option1.
 *
 * 注意: 这与 elkjs (GWT HashMap 插入序 → [EAST, WEST] → 经 SOUTH) 及 master
 *   (sortedTwoSideLoopPortSides 确定性顺时针 → [EAST, WEST]) 都不同 — 0.12.0 jar 实测为准.
 *   (master 新增 RoutingDirectorTest 断言"与 keySet 序无关", 不属于 0.12.0 SSOT.)
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide } from '../../src/index.js'
import { SelfLoopHolder } from '../../src/intermediate/loops/self-loop-holder.js'
import { RoutingDirector } from '../../src/intermediate/loops/routing/routing-director.js'

function makeNode(graph: LGraph): LNode {
  const lNode = new LNode(graph)
  graph.getLayerlessNodes().push(lNode)
  return lNode
}

function makeEdge(source: LPort, target: LPort): LEdge {
  const lEdge = new LEdge()
  lEdge.setSource(source)
  lEdge.setTarget(target)
  return lEdge
}

function makePorts(lNode: LNode, north: number, east: number, south: number, west: number): void {
  for (let i = 0; i < north; i++) { const p = new LPort(); p.setNode(lNode); p.setSide(PortSide.NORTH) }
  for (let i = 0; i < east; i++) { const p = new LPort(); p.setNode(lNode); p.setSide(PortSide.EAST) }
  for (let i = 0; i < south; i++) { const p = new LPort(); p.setNode(lNode); p.setSide(PortSide.SOUTH) }
  for (let i = 0; i < west; i++) { const p = new LPort(); p.setNode(lNode); p.setSide(PortSide.WEST) }
}

/** E+W 环: edges[0]=(srcIdx,tgtIdx) 决定 slPorts 建连顺序. keySet 哈希序与建连顺序无关. */
function buildEastWest(edge: [number, number]) {
  const graph = new LGraph()
  const node = makeNode(graph)
  makePorts(node, 1, 1, 1, 1)
  const eastPort = node.getPorts()[1]!
  const westPort = node.getPorts()[3]!
  makeEdge(edge[0] === 1 ? eastPort : westPort, edge[1] === 3 ? westPort : eastPort)
  const slHolder = SelfLoopHolder.install(node)
  const slLoop = slHolder.getSLHyperLoops()[0]!
  slLoop.computePortsPerSide()
  new RoutingDirector().determineLoopRoutes(slHolder)
  return { slLoop, eastPort, westPort }
}

describe('RoutingDirector (ELK Java 0.12.0 移植)', () => {
  it('E→W 边: keySet 哈希序 [WEST,EAST] → option1 (leftmost=W, 经 NORTH) — 与建连顺序无关', () => {
    const { slLoop, eastPort, westPort } = buildEastWest([1, 3])
    // 0.12.0 jar 实测 (Instr16Main): {WEST,EAST} keySet=[WEST,EAST] → option1 leftmost=WEST
    expect(slLoop.getLeftmostPort().getLPort()).toBe(westPort)
    expect(slLoop.getRightmostPort().getLPort()).toBe(eastPort)
    expect(slLoop.getOccupiedPortSides()).toEqual(new Set([PortSide.WEST, PortSide.NORTH, PortSide.EAST]))
  })

  it('W→E 边: 同样 keySet 哈希序 [WEST,EAST] → option1 (leftmost=W, 经 NORTH) — 不依赖建连顺序', () => {
    const { slLoop, eastPort, westPort } = buildEastWest([3, 1])
    expect(slLoop.getLeftmostPort().getLPort()).toBe(westPort)
    expect(slLoop.getRightmostPort().getLPort()).toBe(eastPort)
    expect(slLoop.getOccupiedPortSides()).toEqual(new Set([PortSide.WEST, PortSide.NORTH, PortSide.EAST]))
  })
})
