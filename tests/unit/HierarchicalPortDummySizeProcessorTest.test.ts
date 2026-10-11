/**
 * HierarchicalPortDummySizeProcessor (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/
 *     HierarchicalPortDummySizeProcessor.java
 *
 * 语义: 每层内 NORTH 外部端口 dummy 按 top→down 递增宽度, SOUTH 按 bottom→up 递增 (镜像);
 * 宽度步进 = SPACING_EDGE_EDGE_BETWEEN_LAYERS * 2 (HierarchicalPortDummySizeProcessor.java:71-72);
 * 东侧端口 x 跟随节点宽度右移; 每个 N/S dummy 被设置 ALIGNMENT=CENTER
 * (HierarchicalPortDummySizeProcessor.java:119).
 *
 * 不变量: 无悬挂边 / 坐标有限 / 端口侧守恒 / N-S dummy 数量守恒.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, PortSide, NodeType } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import { processHierarchicalPortDummySize } from '../../src/intermediate/hierarchical-port-dummy-size-processor.js'
import { EXT_PORT_SIDE } from '../../src/options/internal-properties.js'
import { SPACING_EDGE_EDGE, SPACING_EDGE_EDGE_BETWEEN_LAYERS, ALIGNMENT } from '../../src/options/layered-options.js'

function makeLayer(g: LGraph): Layer {
  const l = new Layer(g)
  g.getLayers().push(l)
  return l
}

function makeNSDummy(g: LGraph, layer: Layer, side: PortSide): LNode {
  const n = new LNode(g)
  n.setType(NodeType.EXTERNAL_PORT)
  n.setProperty(EXT_PORT_SIDE, side)
  n.setLayer(layer)
  const p = new LPort()
  p.setNode(n)
  p.setSide(PortSide.EAST) // 东侧端口: 宽度变化时应右移
  return n
}

/** 不变量: 无悬挂边 (所有可达边 source/target 均非 null). */
function expectNoDanglingEdges(g: LGraph): void {
  for (const node of g.getAllNodes()) {
    for (const port of node.getPorts()) {
      for (const e of port.getConnectedEdges()) {
        expect(e.getSource()).not.toBeNull()
        expect(e.getTarget()).not.toBeNull()
      }
    }
  }
}

/** 不变量: 坐标有限 (无 NaN/Infinity). */
function expectFinitePositions(nodes: LNode[]): void {
  for (const n of nodes) {
    expect(Number.isFinite(n.getPosition().x)).toBe(true)
    expect(Number.isFinite(n.getPosition().y)).toBe(true)
    expect(Number.isFinite(n.size.x)).toBe(true)
    expect(Number.isFinite(n.size.y)).toBe(true)
    for (const p of n.getPorts()) {
      expect(Number.isFinite(p.getPosition().x)).toBe(true)
      expect(Number.isFinite(p.getPosition().y)).toBe(true)
    }
  }
}

describe('HierarchicalPortDummySizeProcessor (ELK Java 0.12.0 移植)', () => {
  it('步长只跟 SPACING_EDGE_EDGE_BETWEEN_LAYERS 走 (ELK :71), 与 SPACING_EDGE_EDGE 无关', () => {
    const g = new LGraph()
    // 显式设为不同值: ggn 旧实现读 SPACING_EDGE_EDGE(100) 会得到 200, ELK 读 BETWEEN_LAYERS(5) 得到 10.
    g.setProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS, 5)
    g.setProperty(SPACING_EDGE_EDGE, 100)
    const l0 = makeLayer(g)
    const n1 = makeNSDummy(g, l0, PortSide.NORTH)
    const n2 = makeNSDummy(g, l0, PortSide.NORTH)
    const n3 = makeNSDummy(g, l0, PortSide.NORTH)

    processHierarchicalPortDummySize(g)

    const delta = 10 // SPACING_EDGE_EDGE_BETWEEN_LAYERS(5) * 2
    expect(n1.size.x).toBe(0)
    expect(n2.size.x).toBe(delta)
    expect(n3.size.x).toBe(2 * delta)
    // EAST 端口 x = 节点宽度
    expect(n1.getPorts()[0]!.getPosition().x).toBe(0)
    expect(n2.getPorts()[0]!.getPosition().x).toBe(delta)
    expect(n3.getPorts()[0]!.getPosition().x).toBe(2 * delta)
    // ALIGNMENT=CENTER (ELK :119)
    for (const n of [n1, n2, n3]) expect(n.getProperty(ALIGNMENT)).toBe('CENTER')
  })

  it('SOUTH bottom→up 递减 (镜像): widths (n-1)*delta, ..., 0', () => {
    const g = new LGraph()
    g.setProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS, 10)
    const l0 = makeLayer(g)
    const s1 = makeNSDummy(g, l0, PortSide.SOUTH)
    const s2 = makeNSDummy(g, l0, PortSide.SOUTH)
    const s3 = makeNSDummy(g, l0, PortSide.SOUTH)

    processHierarchicalPortDummySize(g)

    const delta = 20
    expect(s1.size.x).toBe(2 * delta) // 第一个 SOUTH 最宽
    expect(s2.size.x).toBe(delta)
    expect(s3.size.x).toBe(0)
    expect(s1.getPorts()[0]!.getPosition().x).toBe(2 * delta)
    expect(s3.getPorts()[0]!.getPosition().x).toBe(0)
    for (const n of [s1, s2, s3]) expect(n.getProperty(ALIGNMENT)).toBe('CENTER')
  })

  it('NORTH+SOUTH 同层互不影响; 普通节点/E-W dummy 跳过', () => {
    const g = new LGraph()
    g.setProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS, 2)
    const l0 = makeLayer(g)
    const n = makeNSDummy(g, l0, PortSide.NORTH)
    const s = makeNSDummy(g, l0, PortSide.SOUTH)
    const normal = new LNode(g)
    normal.setType(NodeType.NORMAL)
    normal.setLayer(l0)
    normal.size.x = 50
    const ew = new LNode(g)
    ew.setType(NodeType.EXTERNAL_PORT)
    ew.setProperty(EXT_PORT_SIDE, PortSide.WEST)
    ew.setLayer(l0)
    ew.size.x = 30

    processHierarchicalPortDummySize(g)

    const delta = 4
    expect(n.size.x).toBe(0)
    expect(s.size.x).toBe(0)
    expect(normal.size.x).toBe(50)
    expect(ew.size.x).toBe(30)
    // 仅 N/S dummy 被设 CENTER; 普通节点/E-W dummy 不受影响
    expect(n.getProperty(ALIGNMENT)).toBe('CENTER')
    expect(s.getProperty(ALIGNMENT)).toBe('CENTER')
    expect(normal.getProperty(ALIGNMENT)).not.toBe('CENTER')
    expect(ew.getProperty(ALIGNMENT)).not.toBe('CENTER')
  })

  it('空层/无 N/S dummy: 不抛错, 宽度不变', () => {
    const g = new LGraph()
    g.setProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS, 3)
    makeLayer(g)
    const l1 = makeLayer(g)
    const normal = new LNode(g)
    normal.setType(NodeType.NORMAL)
    normal.setLayer(l1)

    expect(() => processHierarchicalPortDummySize(g)).not.toThrow()
    expect(normal.size.x).toBe(0)
  })

  it('不变量: 所有 EAST 端口 x ≤ 节点宽度, 坐标有限, 端口侧守恒, N/S dummy 数量守恒', () => {
    const g = new LGraph()
    g.setProperty(SPACING_EDGE_EDGE_BETWEEN_LAYERS, 7)
    const l0 = makeLayer(g)
    const dummies = [makeNSDummy(g, l0, PortSide.NORTH), makeNSDummy(g, l0, PortSide.SOUTH),
      makeNSDummy(g, l0, PortSide.NORTH)]
    const sidesBefore = dummies.map(d => d.getPorts().map(p => p.getSide()))
    const nsCountBefore = dummies.length

    processHierarchicalPortDummySize(g)

    for (const d of dummies) {
      expect(Number.isFinite(d.size.x)).toBe(true)
      for (const p of d.getPorts()) {
        expect(Number.isFinite(p.getPosition().x)).toBe(true)
        // EAST 端口 x 不超出节点右边界
        if (p.getSide() === PortSide.EAST) expect(p.getPosition().x).toBeLessThanOrEqual(d.size.x)
      }
    }
    // 端口侧守恒 (处理器只改宽度/端口 x, 不改侧)
    dummies.forEach((d, i) => {
      expect(d.getPorts().map(p => p.getSide())).toEqual(sidesBefore[i])
    })
    // N/S dummy 数量守恒 (不增删节点)
    const nsAfter = g.getAllNodes().filter(n =>
      n.getType() === NodeType.EXTERNAL_PORT
      && (n.getProperty(EXT_PORT_SIDE) === PortSide.NORTH || n.getProperty(EXT_PORT_SIDE) === PortSide.SOUTH))
    expect([...new Set(nsAfter)]).toHaveLength(nsCountBefore)
    expectFinitePositions(dummies)
    expectNoDanglingEdges(g)
  })
})
