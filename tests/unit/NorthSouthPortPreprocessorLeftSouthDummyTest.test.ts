/**
 * R64 回归 (2026-08-12): LEFT 方向 SOUTH 端口 dummy 排序与 ELK Java 0.12.0 1:1.
 *
 * 来源: test-resources/elk-models/realworld/ptolemy/flattened/wireless_intersections_Intersections.elkt
 *   (direction: LEFT) 中 NN30=Expression3 / NN32=Expression4 曾报 y 差 10/29.
 *   根因链: NN31/NN33 的 SOUTH 端口 P97/P103 → portDummy 在 layer2 的层内 index →
 *   SOUTH 端口 rank → NN30/NN32 barycenter → P3 层内排序.
 *
 * 本回归取该模型的最小连通分量 (N23..N33, 4 个 BooleanSwitch 各带 1 个 SOUTH 端口),
 * 用 ELK Java 0.12.0 权威输出固化两类断言:
 *   1) NorthSouthPortPreprocessor 后: SOUTH dummy 紧跟其源节点插入 (LayerOrderProbe
 *      Before_LayerSweepCrossingMinimizer 快照, layer2 = [N24,N33,d(N33),N31,d(N31),N27,d(N27),N29,d(N29)]).
 *   2) 最终坐标与 LayoutJsonMain 逐点一致 (11 节点全等).
 *      (此前错误行为会把 SOUTH dummy 排到层中别处 → 端口 rank/坐标链式偏差.)
 */
import { describe, expect, it } from 'vitest'
import {
  LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, NodeType, Direction,
} from '../../src/index.js'
import { DIRECTION, PORT_CONSTRAINTS, PORT_INDEX } from '../../src/options/layered-options.js'
import { ORIGIN } from '../../src/options/internal-properties.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'

type PortSpec = { id: string; side: PortSide; x: number; y: number; index: number }

const NODE_SPEC: { id: string; size: [number, number]; ports: PortSpec[] }[] = [
  { id: 'N23', size: [61, 41], ports: [
    { id: 'P71', side: PortSide.WEST, x: -8, y: 0.16666667, index: 0 },
    { id: 'P72', side: PortSide.WEST, x: -8, y: 8.333333, index: -1 },
    { id: 'P73', side: PortSide.WEST, x: -8, y: 16.5, index: -2 },
    { id: 'P74', side: PortSide.WEST, x: -8, y: 24.666667, index: -3 },
    { id: 'P75', side: PortSide.WEST, x: -8, y: 32.833333, index: -4 },
    { id: 'P76', side: PortSide.EAST, x: 61, y: 16.5, index: 5 },
  ] },
  { id: 'N24', size: [41, 41], ports: [
    { id: 'P77', side: PortSide.EAST, x: 41, y: 16.5, index: 0 },
    { id: 'P78', side: PortSide.WEST, x: -8, y: 8.333333, index: -1 },
    { id: 'P79', side: PortSide.WEST, x: -8, y: 24.666667, index: -2 },
  ] },
  { id: 'N25', size: [61, 41], ports: [
    { id: 'P80', side: PortSide.WEST, x: -8, y: 16.5, index: 0 },
    { id: 'P81', side: PortSide.EAST, x: 61, y: 16.5, index: 1 },
  ] },
  { id: 'N26', size: [139, 25], ports: [
    { id: 'P82', side: PortSide.EAST, x: 139, y: 8.5, index: 0 },
    { id: 'P83', side: PortSide.WEST, x: -8, y: 8.5, index: -1 },
  ] },
  { id: 'N27', size: [39, 46], ports: [
    { id: 'P84', side: PortSide.WEST, x: -8, y: 19, index: 0 },
    { id: 'P85', side: PortSide.SOUTH, x: 15.5, y: 46, index: -1 },
    { id: 'P86', side: PortSide.EAST, x: 39, y: 10, index: 2 },
    { id: 'P87', side: PortSide.EAST, x: 39, y: 28, index: 3 },
  ] },
  { id: 'N28', size: [150, 25], ports: [
    { id: 'P88', side: PortSide.EAST, x: 150, y: 8.5, index: 0 },
    { id: 'P89', side: PortSide.WEST, x: -8, y: 8.5, index: -1 },
  ] },
  { id: 'N29', size: [39, 46], ports: [
    { id: 'P90', side: PortSide.WEST, x: -8, y: 19, index: 0 },
    { id: 'P91', side: PortSide.SOUTH, x: 15.5, y: 46, index: -1 },
    { id: 'P92', side: PortSide.EAST, x: 39, y: 10, index: 2 },
    { id: 'P93', side: PortSide.EAST, x: 39, y: 28, index: 3 },
  ] },
  { id: 'N30', size: [144, 25], ports: [
    { id: 'P94', side: PortSide.EAST, x: 144, y: 8.5, index: 0 },
    { id: 'P95', side: PortSide.WEST, x: -8, y: 8.5, index: -1 },
  ] },
  { id: 'N31', size: [39, 46], ports: [
    { id: 'P96', side: PortSide.WEST, x: -8, y: 19, index: 0 },
    { id: 'P97', side: PortSide.SOUTH, x: 15.5, y: 46, index: -1 },
    { id: 'P98', side: PortSide.EAST, x: 39, y: 10, index: 2 },
    { id: 'P99', side: PortSide.EAST, x: 39, y: 28, index: 3 },
  ] },
  { id: 'N32', size: [135, 25], ports: [
    { id: 'P100', side: PortSide.EAST, x: 135, y: 8.5, index: 0 },
    { id: 'P101', side: PortSide.WEST, x: -8, y: 8.5, index: -1 },
  ] },
  { id: 'N33', size: [39, 46], ports: [
    { id: 'P102', side: PortSide.WEST, x: -8, y: 19, index: 0 },
    { id: 'P103', side: PortSide.SOUTH, x: 15.5, y: 46, index: -1 },
    { id: 'P104', side: PortSide.EAST, x: 39, y: 10, index: 2 },
    { id: 'P105', side: PortSide.EAST, x: 39, y: 28, index: 3 },
  ] },
]

// 分量内边 (elkt edge E21..E30, 端口 id 一一对应).
const EDGES: [string, string, string, string][] = [
  ['N23', 'P76', 'N25', 'P80'],
  ['N24', 'P77', 'N23', 'P71'],
  ['N26', 'P82', 'N27', 'P85'],
  ['N27', 'P86', 'N23', 'P74'],
  ['N28', 'P88', 'N29', 'P91'],
  ['N29', 'P92', 'N23', 'P75'],
  ['N30', 'P94', 'N31', 'P97'],
  ['N31', 'P98', 'N23', 'P73'],
  ['N32', 'P100', 'N33', 'P103'],
  ['N33', 'P104', 'N23', 'P72'],
]

// ELK Java 0.12.0 LayoutJsonMain 最终坐标 (LEFT, randomSeed=1, 无标签) — 逐点一致基准.
const JAR_FINAL: Record<string, [number, number]> = {
  N23: [121.83, 148.67], N24: [20.00, 86.00], N25: [293.00, 148.67],
  N26: [107.00, 254.67], N27: [22.00, 254.67], N28: [107.00, 328.67],
  N29: [22.00, 328.67], N30: [107.00, 31.00], N31: [22.00, 12.00],
  N32: [107.00, 209.67], N33: [22.00, 147.00],
}

function buildGraph(): { graph: LGraph; nodeOf: Map<string, LNode> } {
  const graph = new LGraph()
  graph.setProperty(DIRECTION, Direction.LEFT)
  const nodeOf = new Map<string, LNode>()
  const portOf = new Map<string, LPort>()
  for (const spec of NODE_SPEC) {
    const n = new LNode(graph)
    n.size = { x: spec.size[0], y: spec.size[1] }
    n.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
    for (const p of spec.ports) {
      const port = new LPort()
      port.setNode(n)
      port.getPosition().x = p.x
      port.getPosition().y = p.y
      port.size = { x: 8, y: 8 }
      port.setSide(p.side)
      port.setProperty(PORT_INDEX, p.index)
      portOf.set(`${spec.id}.${p.id}`, port)
    }
    nodeOf.set(spec.id, n)
  }
  for (const [s, sp, t, tp] of EDGES) {
    const e = new LEdge()
    e.setSource(portOf.get(`${s}.${sp}`)!)
    e.setTarget(portOf.get(`${t}.${tp}`)!)
  }
  return { graph, nodeOf }
}

describe('R64: LEFT 方向 SOUTH 端口 dummy 排序 (ELK Java 0.12.0 1:1)', () => {
  it('NorthSouthPortPreprocessor 后 SOUTH dummy 紧跟源节点 (LayerOrderProbe 一致)', () => {
    const { graph, nodeOf } = buildGraph()
    let nsLayers: LNode[][] | null = null
    const provider = new LayeredLayoutProvider()
    provider.setHooks({
      afterModule: (name, g) => {
        if (name === 'NorthSouthPortPreprocessor') {
          nsLayers = g.getLayers().map(l => [...l.getNodes()])
        }
      },
    })
    provider.layout(graph)
    expect(nsLayers, 'NorthSouthPortPreprocessor 未执行').not.toBeNull()

    // jar LayerOrderProbe (Before_LayerSweepCrossingMinimizer): layer2 =
    //   [N24, N33, d(N33), N31, d(N31), N27, d(N27), N29, d(N29)]
    // 4 个 BooleanSwitch (N33/N31/N27/N29) 各带 1 个 SOUTH 端口 → 每个 SOUTH dummy 在源节点后一格;
    // N24 (Clock) 无 SOUTH 端口 → 其后无 dummy.
    const layer2 = nsLayers![2]!
    const idOf = new Map([...nodeOf.entries()].map(([id, n]) => [n, id]))
    const names = layer2.map(n => idOf.get(n) ?? '#d')
    expect(names.join(',')).toBe('N24,N33,#d,N31,#d,N27,#d,N29,#d')
    for (const id of ['N33', 'N31', 'N27', 'N29']) {
      const node = nodeOf.get(id)!
      const i = layer2.indexOf(node)
      const next = layer2[i + 1]
      expect(next, `${id} 后应为 SOUTH dummy`).toBeDefined()
      expect(next.getType(), `${id} 后节点类型`).toBe(NodeType.NORTH_SOUTH_PORT)
      expect(next.getProperty(ORIGIN), `${id} dummy 的 ORIGIN`).toBe(node)
      // dummy 紧跟源节点之后 (层内 index = 源节点 index + 1) — 排到层中别处即 R64 回归.
      expect(i + 1, `${id} dummy 层内 index`).toBe(i + 1)
    }
    // layer2 长度 = 5 源节点 + 4 SOUTH dummy = 9.
    expect(layer2.length).toBe(9)
  })

  it('最终坐标与 ELK Java LayoutJsonMain 逐点一致 (11 节点全等)', () => {
    const { graph, nodeOf } = buildGraph()
    new LayeredLayoutProvider().layout(graph)
    for (const [id, [jx, jy]] of Object.entries(JAR_FINAL)) {
      const n = nodeOf.get(id)!
      expect(Math.abs(n.position.x - jx), `${id} x`).toBeLessThanOrEqual(0.01)
      expect(Math.abs(n.position.y - jy), `${id} y`).toBeLessThanOrEqual(0.01)
    }
  })
})
