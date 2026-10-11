/**
 * SweepCopy 移植单测 + 性质/随机属性测试 (writer C).
 *
 * SSOT: ELK Java 0.12.0 p3order/SweepCopy.java
 *   - 节点顺序/端口顺序快照: 深拷贝节点数组 (元素引用不变, 数组独立), 端口列表按节点逐层拷贝
 *   - SweepCopy(SweepCopy) 再拷贝与原件独立
 *   - transferNodeAndPortOrdersToGraph: 层节点顺序 = 快照顺序, node.id = 层内位置,
 *     端口顺序 = 快照端口顺序 (端口 id 集合守恒), 非 FIXED_ORDER 节点升级为 FIXED_ORDER
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, PortSide, PortConstraints, NodeType } from '../../src/index.js'
import { SweepCopy } from '../../src/p3order/sweep-copy.js'
import { PORT_CONSTRAINTS } from '../../src/options/layered-options.js'
import { IN_LAYER_LAYOUT_UNIT, ORIGIN } from '../../src/options/internal-properties.js'
import { JavaRandom } from '../../src/util/java-random.js'
import {
  makeLayer, addNodeToLayer, addNodesToLayer, addPortOnSide, setUpLayerNodeIds,
} from './helpers/PropertyTestGraphs.js'

describe('SweepCopy (ELK Java 移植)', () => {
  function makeRandomGraph(seed: number): LGraph {
    const r = new JavaRandom(seed)
    const graph = new LGraph()
    const layers = []
    for (let i = 0; i < 3; i++) {
      const layer = makeLayer(graph)
      const nodes = addNodesToLayer(graph, 4, layer)
      for (const node of nodes) {
        const k = r.nextInt(3)
        for (let e = 0; e < k; e++) {
          addPortOnSide(node, [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST][r.nextInt(4)]!)
        }
      }
      layers.push(nodes)
    }
    setUpLayerNodeIds(graph)
    graph.getAllNodes().flatMap(n => n.getPorts()).forEach((p, i) => { p.id = i })
    return graph
  }

  it.each([1, 2, 3])('seed=%i: 深拷贝独立性 (改原序不影响快照)', (seed) => {
    const graph = makeRandomGraph(seed)
    const order = graph.toNodeArray()
    const copy = new SweepCopy(order)
    // 打乱原节点顺序 + 端口顺序
    ;[order[0]![0]!, order[0]![1]!] = [order[0]![1]!, order[0]![0]!]
    order[1]![2]!.getPorts().reverse()
    // 快照仍是原始顺序
    expect(copy.nodes()![0]!.map(n => n.id)).toEqual([0, 1, 2, 3])
    expect(copy.nodes()![1]!.map(n => n.id)).toEqual([0, 1, 2, 3])
  })

  it.each([1, 2, 3])('seed=%i: SweepCopy(SweepCopy) 与原件独立', (seed) => {
    const graph = makeRandomGraph(seed)
    const copy = new SweepCopy(graph.toNodeArray())
    const copy2 = new SweepCopy(copy)
    const copyNodes = copy.nodes()!
    ;[copyNodes[2]![0]!, copyNodes[2]![1]!] = [copyNodes[2]![1]!, copyNodes[2]![0]!]
    expect(copy2.nodes()![2]!.map(n => n.id)).toEqual([0, 1, 2, 3])
  })

  it.each([1, 2, 3])('seed=%i: transferNodeAndPortOrdersToGraph 恢复层/端口顺序 + 端口集合守恒 + FIXED_ORDER', (seed) => {
    const graph = makeRandomGraph(seed)
    const order = graph.toNodeArray()
    const beforePortIds = order.map(layer => layer.map(n => n.getPorts().map(p => p.id)))
    const copy = new SweepCopy(order)
    copy.transferNodeAndPortOrdersToGraph(graph, true)
    const after = graph.toNodeArray()
    for (let l = 0; l < after.length; l++) {
      expect(after[l]!.map(n => n.id)).toEqual([0, 1, 2, 3])
      for (let n = 0; n < after[l]!.length; n++) {
        const ids = after[l]![n]!.getPorts().map(p => p.id).sort((a, b) => a - b)
        expect(ids).toEqual([...beforePortIds[l]![n]!].sort((a, b) => a - b))
        // 非 FIXED_ORDER → 升级
        const pc = after[l]![n]!.getProperty<PortConstraints>(PORT_CONSTRAINTS)
        expect(PortConstraints.isOrderFixed(pc)).toBe(true)
      }
    }
  })

  it('setPortContstraints=false 时不改动 PORT_CONSTRAINTS', () => {
    const graph = makeRandomGraph(1)
    const copy = new SweepCopy(graph.toNodeArray())
    copy.transferNodeAndPortOrdersToGraph(graph, false)
    for (const layer of graph.getLayers()) {
      for (const node of layer.getNodes()) {
        expect(node.getProperty<PortConstraints>(PORT_CONSTRAINTS)).toBe(PortConstraints.UNDEFINED)
      }
    }
  })
})

describe('SweepCopy.cmpCombined 回归 (ELK PortListSorter.CMP_COMBINED)', () => {
  /**
   * 回归: sweep-copy 的 cmpCombined 之前是错误简化 (所有侧 y 升序), 会把 PortListSorter
   * 已排好的 WEST 端口 (FIXED_POS 按 y 降序) 再翻回 → OER 段序/断环方向错
   * (north_multiple::DOWN 车道交换实证). ELK CMP_FIXED_ORDER_AND_FIXED_POS:
   *   NORTH: x 升序; EAST: y 升序; SOUTH: x 降序; WEST: y 降序.
   */
  function makeFixedPosNodeWithWestPorts(graph: LGraph, layer: ReturnType<typeof makeLayer>): LNode {
    const node = addNodeToLayer(graph, layer)
    node.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    // WEST 端口位置 (变换后 y): 15/35/55 — 应保持 y 降序 [55,35,15]
    for (const y of [15, 35, 55]) {
      const port = addPortOnSide(node, PortSide.WEST)
      port.getPosition().y = y
    }
    return node
  }

  it('FIXED_POS + N-S dummy: transfer 后 WEST 端口按 y 降序 (不被翻回)', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const node = makeFixedPosNodeWithWestPorts(graph, layer)

    // 制造 updatePortOrder 触发: N-S dummy 的 IN_LAYER_LAYOUT_UNIT = node, dummy 端口 ORIGIN = node 的 WEST 端口
    const dummy = new LNode(graph)
    dummy.setType(NodeType.NORTH_SOUTH_PORT)
    dummy.setLayer(layer)
    dummy.setProperty(IN_LAYER_LAYOUT_UNIT, node)
    const dummyPort = addPortOnSide(dummy, PortSide.WEST)
    dummyPort.setProperty(ORIGIN, node.getPorts()[0]!)

    const copy = new SweepCopy(graph.toNodeArray())
    copy.transferNodeAndPortOrdersToGraph(graph, false)

    const westYs = node.getPorts().filter(p => p.getSide() === PortSide.WEST).map(p => p.getPosition().y)
    // ELK: WEST 降序 (CMP_FIXED_ORDER_AND_FIXED_POS case WEST: p2.y - p1.y)
    expect(westYs).toEqual([55, 35, 15])
  })

  it('非 order-fixed (FIXED_SIDE): 同侧端口保持相对顺序 (位置不参与)', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const node = addNodeToLayer(graph, layer)
    node.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_SIDE)
    // 故意乱序: y 5, 55, 15 — FIXED_SIDE 时 cmpCombined 只按侧, 同侧稳定
    for (const y of [5, 55, 15]) {
      const port = addPortOnSide(node, PortSide.WEST)
      port.getPosition().y = y
    }
    const dummy = new LNode(graph)
    dummy.setType(NodeType.NORTH_SOUTH_PORT)
    dummy.setLayer(layer)
    dummy.setProperty(IN_LAYER_LAYOUT_UNIT, node)
    const dummyPort = addPortOnSide(dummy, PortSide.WEST)
    dummyPort.setProperty(ORIGIN, node.getPorts()[0]!)

    const copy = new SweepCopy(graph.toNodeArray())
    copy.transferNodeAndPortOrdersToGraph(graph, false)

    const westYs = node.getPorts().filter(p => p.getSide() === PortSide.WEST).map(p => p.getPosition().y)
    // 稳定排序: 相对顺序保持 [5,55,15]
    expect(westYs).toEqual([5, 55, 15])
  })

  it('SOUTH 端口 (FIXED_POS): x 降序', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const node = addNodeToLayer(graph, layer)
    node.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    for (const x of [10, 30, 20]) {
      const port = addPortOnSide(node, PortSide.SOUTH)
      port.getPosition().x = x
    }
    const dummy = new LNode(graph)
    dummy.setType(NodeType.NORTH_SOUTH_PORT)
    dummy.setLayer(layer)
    dummy.setProperty(IN_LAYER_LAYOUT_UNIT, node)
    const dummyPort = addPortOnSide(dummy, PortSide.WEST)
    dummyPort.setProperty(ORIGIN, node.getPorts()[0]!)

    const copy = new SweepCopy(graph.toNodeArray())
    copy.transferNodeAndPortOrdersToGraph(graph, false)

    const southXs = node.getPorts().filter(p => p.getSide() === PortSide.SOUTH).map(p => p.getPosition().x)
    expect(southXs).toEqual([30, 20, 10])
  })
})
