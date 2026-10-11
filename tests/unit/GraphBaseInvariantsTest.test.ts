/**
 * graph 基础族 (LGraph/LNode/LPort/LEdge/Layer + 枚举代数) 性质/随机属性测试 (writer C).
 *
 * SSOT: ELK Java 0.12.0 graph/LGraph.java, LNode.java, LPort.java, LEdge.java, Layer.java
 * 断言不变量而非具体坐标:
 *   - 边-端口双向一致性 (setSource/setTarget/setNode/setLayer 后两边列表同步)
 *   - LEdge.reverse 后连接守恒 + REVERSED 标记
 *   - 端口 setSide 的锚点计算 (NORTH/EAST/SOUTH/WEST)
 *   - LNode.getPorts(PortSide/PortType) 过滤语义
 *   - PortSide.opposed / PortConstraints 代数恒等式
 *   - Layer.setLayerAt 插入位置
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortType, PortConstraints } from '../../src/index.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { REVERSED } from '../../src/options/internal-properties.js'
import {
  makeLayer, addNodeToLayer, addPortOnSide, addEdgeBetweenPorts, setUpLayerNodeIds, indexPortIds,
} from './helpers/PropertyTestGraphs.js'

describe('graph 基础族 不变量 (LGraph/LNode/LPort/LEdge/Layer)', () => {
  it('边-端口双向一致性: setSource/setTarget 后两边列表同步', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const a = addNodeToLayer(graph, layer)
    const b = addNodeToLayer(graph, layer)
    const pa = addPortOnSide(a, PortSide.EAST)
    const pb = addPortOnSide(b, PortSide.WEST)
    const e = new LEdge()
    e.setSource(pa)
    e.setTarget(pb)
    expect(pa.getOutgoingEdges()).toContain(e)
    expect(pb.getIncomingEdges()).toContain(e)
    expect(e.getSource()).toBe(pa)
    expect(e.getTarget()).toBe(pb)
    expect(e.getOther(pa)).toBe(pb)
    expect(e.getOther(pb)).toBe(pa)
    expect(e.isSelfLoop()).toBe(false)
    // 重连到新端口: 旧端口列表移除, 新端口列表加入
    const pc = addPortOnSide(a, PortSide.EAST)
    e.setSource(pc)
    expect(pa.getOutgoingEdges()).not.toContain(e)
    expect(pc.getOutgoingEdges()).toContain(e)
  })

  it('LEdge.reverse: 源/目标交换 + 两侧列表守恒 + REVERSED', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const a = addNodeToLayer(graph, layer)
    const b = addNodeToLayer(graph, layer)
    const pa = addPortOnSide(a, PortSide.EAST)
    const pb = addPortOnSide(b, PortSide.WEST)
    const e = addEdgeBetweenPorts(pa, pb)
    e.reverse(graph, false)
    expect(e.getSource()).toBe(pb)
    expect(e.getTarget()).toBe(pa)
    expect(pb.getOutgoingEdges()).toContain(e)
    expect(pa.getIncomingEdges()).toContain(e)
    expect(pa.getOutgoingEdges()).not.toContain(e)
    expect(pb.getIncomingEdges()).not.toContain(e)
    expect(e.getProperty(REVERSED)).toBe(true)
    // 再反转还原
    e.reverse(graph, false)
    expect(e.getSource()).toBe(pa)
    expect(e.getTarget()).toBe(pb)
    expect(pa.getOutgoingEdges()).toContain(e)
    expect(pb.getIncomingEdges()).toContain(e)
  })

  it('LPort.setNode: 从旧节点端口列表移除, 加入新节点', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const a = addNodeToLayer(graph, layer)
    const b = addNodeToLayer(graph, layer)
    const p = addPortOnSide(a, PortSide.NORTH)
    expect(a.getPorts()).toContain(p)
    p.setNode(b)
    expect(a.getPorts()).not.toContain(p)
    expect(b.getPorts()).toContain(p)
    expect(p.getNode()).toBe(b)
  })

  it('LNode.setLayer / setLayerAt: 层节点列表与索引一致', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const a = addNodeToLayer(graph, l0)
    const b = addNodeToLayer(graph, l0)
    expect(l0.getNodes()).toEqual([a, b])
    a.setLayer(l1)
    expect(l0.getNodes()).toEqual([b])
    expect(l1.getNodes()).toEqual([a])
    expect(a.getLayer()).toBe(l1)
    // setLayerAt 插入指定位置
    const c = addNodeToLayer(graph, l1)
    c.setLayerAt(0, l1)
    expect(l1.getNodes()).toEqual([c, a])
    expect(c.getIndex()).toBe(0)
  })

  it.each([PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST])('端口锚点: setSide(%s) 按尺寸计算', (side) => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const node = addNodeToLayer(graph, layer)
    const port = new LPort()
    port.setNode(node)
    port.size = { x: 10, y: 20 }
    port.setSide(side)
    const anchor = port.getAnchor()
    if (side === PortSide.NORTH) expect([anchor.x, anchor.y]).toEqual([5, 0])
    if (side === PortSide.EAST) expect([anchor.x, anchor.y]).toEqual([10, 10])
    if (side === PortSide.SOUTH) expect([anchor.x, anchor.y]).toEqual([5, 20])
    if (side === PortSide.WEST) expect([anchor.x, anchor.y]).toEqual([0, 10])
    expect(port.getSide()).toBe(side)
  })

  it('LNode.getPorts(PortSide) 过滤 + getPorts(PortType) 按边方向', () => {
    const graph = new LGraph()
    const layer = makeLayer(graph)
    const node = addNodeToLayer(graph, layer)
    const east = addPortOnSide(node, PortSide.EAST)
    const west = addPortOnSide(node, PortSide.WEST)
    const other = addNodeToLayer(graph, layer)
    const otherEast = addPortOnSide(other, PortSide.EAST)
    const otherWest = addPortOnSide(other, PortSide.WEST)
    addEdgeBetweenPorts(east, otherWest) // node 出边
    addEdgeBetweenPorts(otherEast, west) // node 入边
    expect(node.getPorts(PortSide.EAST)).toEqual([east])
    expect(node.getPorts(PortSide.WEST)).toEqual([west])
    expect(node.getPorts(PortType.OUTPUT)).toEqual([east])
    expect(node.getPorts(PortType.INPUT)).toEqual([west])
    expect(node.getPortSideView(PortSide.EAST)).toEqual([east])
    expect(node.getPortSideView(PortSide.WEST)).toEqual([west])
  })

  it('PortSide 代数恒等式', () => {
    for (const side of [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]) {
      expect(PortSide.opposed(PortSide.opposed(side))).toBe(side)
      expect(PortSide.opposed(side)).not.toBe(side)
      expect(PortSide.isVertical(PortSide.opposed(side))).toBe(PortSide.isVertical(side))
      expect(PortSide.isHorizontal(PortSide.opposed(side))).toBe(PortSide.isHorizontal(side))
    }
    expect(PortSide.opposed(PortSide.UNDEFINED)).toBe(PortSide.UNDEFINED)
    // 垂直/水平互斥
    for (const side of [PortSide.NORTH, PortSide.SOUTH]) expect(PortSide.isHorizontal(side)).toBe(false)
    for (const side of [PortSide.EAST, PortSide.WEST]) expect(PortSide.isVertical(side)).toBe(false)
  })

  it('PortConstraints 代数: isOrderFixed ⊆ isSideFixed', () => {
    for (const c of [PortConstraints.UNDEFINED, PortConstraints.FREE, PortConstraints.FIXED_SIDE,
      PortConstraints.FIXED_ORDER, PortConstraints.FIXED_RATIO, PortConstraints.FIXED_POS]) {
      if (PortConstraints.isOrderFixed(c)) expect(PortConstraints.isSideFixed(c)).toBe(true)
      if (PortConstraints.isPosFixed(c)) expect(PortConstraints.isOrderFixed(c)).toBe(true)
      if (PortConstraints.isRatioFixed(c)) expect(PortConstraints.isOrderFixed(c)).toBe(true)
    }
  })

  it('随机多端口图: 全图边-端口守恒 (无悬挂边/列表对称)', () => {
    for (const seed of [1, 2, 3]) {
      const r = new JavaRandom(seed)
      const graph = new LGraph()
      const layers: LNode[][] = []
      for (let i = 0; i < 3; i++) {
        const layer = makeLayer(graph)
        const arr: LNode[] = []
        for (let j = 0; j < 4; j++) {
          const node = addNodeToLayer(graph, layer)
          for (let k = 0, nPorts = r.nextInt(3); k < nPorts; k++) {
            addPortOnSide(node, [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST][r.nextInt(4)]!)
          }
          arr.push(node)
        }
        layers.push(arr)
      }
      for (let i = 0; i < 2; i++) {
        for (const left of layers[i]!) {
          for (const p of left.getPortSideView(PortSide.EAST)) {
            if (r.nextBoolean()) {
              const right = layers[i + 1]![r.nextInt(4)]!
              const rp = addPortOnSide(right, PortSide.WEST)
              addEdgeBetweenPorts(p, rp)
            }
          }
        }
      }
      setUpLayerNodeIds(graph)
      indexPortIds(graph)
      // 无悬挂边 + 双向一致性
      for (const layer of layers) {
        for (const node of layer) {
          for (const port of node.getPorts()) {
            for (const e of port.getConnectedEdges()) {
              expect(e.getSource()!.getNode()).toBeTruthy()
              expect(e.getTarget()!.getNode()).toBeTruthy()
              if (e.getSource() === port) expect(port.getOutgoingEdges()).toContain(e)
              if (e.getTarget() === port) expect(port.getIncomingEdges()).toContain(e)
            }
          }
        }
      }
      // 每条边两端口都在图中
      const allPorts = new Set(graph.getAllNodes().flatMap(n => n.getPorts()))
      for (const layer of layers) for (const node of layer) for (const port of node.getPorts()) {
        for (const e of port.getConnectedEdges()) {
          expect(allPorts.has(e.getSource()!)).toBe(true)
          expect(allPorts.has(e.getTarget()!)).toBe(true)
        }
      }
    }
  })

  it('Layer.getIndex 与 graph.getLayers 顺序一致', () => {
    const graph = new LGraph()
    const l0 = makeLayer(graph)
    const l1 = makeLayer(graph)
    const l2 = makeLayer(graph)
    expect([l0.getIndex(), l1.getIndex(), l2.getIndex()]).toEqual([0, 1, 2])
    expect(l0.getGraph()).toBe(graph)
  })
})
