/**
 * HierarchicalPortPositionProcessor (ggn 移植) 单元测试.
 *
 * SSOT: ELK Java 0.12.0
 *   plugins/org.eclipse.elk.alg.layered/src/org/eclipse/elk/alg/layered/intermediate/
 *     HierarchicalPortPositionProcessor.java
 *
 * 语义: 对首/末层的 E/W 外部端口 dummy, 按 PORT_RATIO_OR_POSITION 固定 y 坐标, 并转内容坐标 —
 *   y = (ratio * 图实际高 | position) - anchor.y - pad.top - offset.y (ELK L123 borderToContentAreaCoordinates)
 * 仅当 PORT_CONSTRAINTS 为 FIXED_RATIO/FIXED_POS 时生效; N/S dummy 与普通节点不受影响.
 * ★ 548 回归: 缺 borderToContentArea 步骤 → dummy y 少减 pad.top → 父端口 y/margin 错。
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, NodeType } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'
import { processHierarchicalPortPosition } from '../../src/intermediate/hierarchical-port-position-processor.js'
import { EXT_PORT_SIDE, PORT_RATIO_OR_POSITION } from '../../src/options/internal-properties.js'
import { PORT_CONSTRAINTS, PORT_ANCHOR } from '../../src/options/layered-options.js'

function makeLayer(g: LGraph): Layer {
  const l = new Layer(g)
  g.getLayers().push(l)
  return l
}

function makeExtPort(g: LGraph, layer: Layer, side: PortSide, ratioOrPos: number): LNode {
  const n = new LNode(g)
  n.setType(NodeType.EXTERNAL_PORT)
  n.setProperty(EXT_PORT_SIDE, side)
  n.setProperty(PORT_RATIO_OR_POSITION, ratioOrPos)
  n.setProperty(PORT_ANCHOR, { x: 0, y: 4 })
  n.setLayer(layer)
  const p = new LPort()
  p.setNode(n)
  p.setSide(side)
  return n
}

function makeNormalNode(g: LGraph, layer: Layer): LNode {
  const n = new LNode(g)
  n.setType(NodeType.NORMAL)
  n.setLayer(layer)
  return n
}

function addPortOnSide(node: LNode, side: PortSide): LPort {
  const p = new LPort()
  p.setNode(node)
  p.setSide(side)
  return p
}

describe('HierarchicalPortPositionProcessor (ELK Java 0.12.0 移植)', () => {
  it('无 layer: process 直接返回', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
    expect(() => processHierarchicalPortPosition(g)).not.toThrow()
  })

  it('单层: 只修首层 (layers.length>0, layers.length>1 为 false)', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    g.getSize().y = 100
    const l0 = makeLayer(g)
    const west = makeExtPort(g, l0, PortSide.WEST, 30)
    west.getPosition().y = 5

    processHierarchicalPortPosition(g)

    // FIXED_POS: y = 30 - anchor.y(4) - pad.top(12) - offset(0) = 14 (ELK borderToContentArea)
    expect(west.getPosition().y).toBeCloseTo(14, 6)
  })

  it('FIXED_RATIO: y = ratio * 图实际高 - anchor.y (首层 + 末层)', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
    g.getSize().y = 100
    g.setPadding({ left: 12, top: 12, right: 12, bottom: 12 }) // 默认已是 12
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const west = makeExtPort(g, l0, PortSide.WEST, 0.25)
    const east = makeExtPort(g, l1, PortSide.EAST, 0.75)
    const north = makeExtPort(g, l0, PortSide.NORTH, 0.5)
    const normal = makeNormalNode(g, l0)
    const northY0 = north.getPosition().y
    void normal

    processHierarchicalPortPosition(g)

    // 图实际高 = size.y + pad.top + pad.bottom = 100 + 12 + 12 = 124
    const graphHeight = 124
    // 再减 pad.top(12) + offset(0) (borderToContentArea)
    expect(west.getPosition().y).toBeCloseTo(0.25 * graphHeight - 4 - 12, 6)
    expect(east.getPosition().y).toBeCloseTo(0.75 * graphHeight - 4 - 12, 6)
    // N/S dummy 不受影响 (skip)
    expect(north.getPosition().y).toBe(northY0)
  })

  it('FIXED_POS: y = position - anchor.y; 普通节点与 N/S dummy 跳过', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    g.getSize().y = 80
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const west = makeExtPort(g, l0, PortSide.WEST, 42)
    const east = makeExtPort(g, l1, PortSide.EAST, 13)
    const normal = makeNormalNode(g, l0)
    normal.getPosition().y = 999
    const south = makeExtPort(g, l1, PortSide.SOUTH, 0.9)
    const southY0 = south.getPosition().y

    processHierarchicalPortPosition(g)

    expect(west.getPosition().y).toBeCloseTo(42 - 4 - 12, 6)
    expect(east.getPosition().y).toBeCloseTo(13 - 4 - 12, 6)
    expect(normal.getPosition().y).toBe(999)
    expect(south.getPosition().y).toBe(southY0)
  })

  it('pc 非 ratio/pos (FREE): fixCoordinates 提前返回, y 不变', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
    const l0 = makeLayer(g)
    const west = makeExtPort(g, l0, PortSide.WEST, 30)
    west.getPosition().y = 7

    processHierarchicalPortPosition(g)

    expect(west.getPosition().y).toBe(7)
  })

  it('不变量: 处理后坐标有限; 非 E/W 外部端口 dummy (UNDEFINED side) 跳过', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
    g.getSize().y = 50
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const undef = makeExtPort(g, l0, PortSide.UNDEFINED, 0.3)
    undef.getPosition().y = 11
    const west = makeExtPort(g, l1, PortSide.WEST, 0.5)

    processHierarchicalPortPosition(g)

    expect(undef.getPosition().y).toBe(11)
    expect(Number.isFinite(west.getPosition().y)).toBe(true)
    expect(Number.isFinite(undef.getPosition().y)).toBe(true)
  })

  it('PORT_ANCHOR 未设置时 y = pos - 0 (ELK PORT_ANCHOR 默认 KVector.ZERO; ggn 曾 NaN)', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    const l0 = makeLayer(g)
    const west = new LNode(g)
    west.setType(NodeType.EXTERNAL_PORT)
    west.setProperty(EXT_PORT_SIDE, PortSide.WEST)
    west.setProperty(PORT_RATIO_OR_POSITION, 10)
    west.setLayer(l0)
    const p = new LPort()
    p.setNode(west)
    p.setSide(PortSide.WEST)

    processHierarchicalPortPosition(g)

    // ELK: PORT_ANCHOR 缺省 = KVector.ZERO → y = 10 - 0 - 12 = -2 (不再 NaN)
    expect(west.getPosition().y).toBe(-2)
  })

  it('3 层图: 只修首层与末层, 中间层 E/W dummy 不处理 (ELK process :75-82)', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_POS)
    g.getSize().y = 100
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const l2 = makeLayer(g)
    const west = makeExtPort(g, l0, PortSide.WEST, 10)
    const midWest = makeExtPort(g, l1, PortSide.WEST, 999)
    midWest.getPosition().y = 7
    const midEast = makeExtPort(g, l1, PortSide.EAST, 888)
    midEast.getPosition().y = 9
    const east = makeExtPort(g, l2, PortSide.EAST, 20)

    processHierarchicalPortPosition(g)

    expect(west.getPosition().y).toBeCloseTo(10 - 4 - 12, 6)
    expect(east.getPosition().y).toBeCloseTo(20 - 4 - 12, 6)
    // 中间层 E/W dummy 不动
    expect(midWest.getPosition().y).toBe(7)
    expect(midEast.getPosition().y).toBe(9)
  })

  it('FIXED_RATIO ratio 越界 (<0 或 >1): 仍按 ratio*图高计算 (ELK 不钳制)', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
    g.getSize().y = 100
    g.setPadding({ left: 12, top: 12, right: 12, bottom: 12 })
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const west = makeExtPort(g, l0, PortSide.WEST, -0.5)
    const east = makeExtPort(g, l1, PortSide.EAST, 1.5)

    processHierarchicalPortPosition(g)

    const graphHeight = 124
    expect(west.getPosition().y).toBeCloseTo(-0.5 * graphHeight - 4 - 12, 6)
    expect(east.getPosition().y).toBeCloseTo(1.5 * graphHeight - 4 - 12, 6)
  })

  it('不变量: 坐标有限、端口侧守恒、N/S 与普通节点数量守恒、无悬挂边', () => {
    const g = new LGraph()
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_RATIO)
    g.getSize().y = 80
    const l0 = makeLayer(g)
    const l1 = makeLayer(g)
    const west = makeExtPort(g, l0, PortSide.WEST, 0.4)
    const north = makeExtPort(g, l0, PortSide.NORTH, 0.5)
    const normal = makeNormalNode(g, l0)
    const east = makeExtPort(g, l1, PortSide.EAST, 0.6)
    const south = makeExtPort(g, l1, PortSide.SOUTH, 0.7)
    const edge = new LEdge()
    edge.setSource(addPortOnSide(normal, PortSide.EAST))
    edge.setTarget(addPortOnSide(normal, PortSide.WEST))
    // 快照须在端口创建之后
    const portsBefore = [...g.getAllNodes()].map(n => n.getPorts().map(p => p.getSide()))
    const nodesBefore = new Set(g.getAllNodes()).size

    processHierarchicalPortPosition(g)

    for (const n of g.getAllNodes()) {
      expect(Number.isFinite(n.getPosition().x)).toBe(true)
      expect(Number.isFinite(n.getPosition().y)).toBe(true)
    }
    // 节点/端口侧守恒
    expect(new Set(g.getAllNodes()).size).toBe(nodesBefore)
    const portsAfter = [...g.getAllNodes()].map(n => n.getPorts().map(p => p.getSide()))
    expect(portsAfter).toEqual(portsBefore)
    // 边守恒 + 无悬挂边
    expect(edge.getSource()).not.toBeNull()
    expect(edge.getTarget()).not.toBeNull()
    expect([...new Set(g.getAllNodes())].filter(n => n.getType() === NodeType.EXTERNAL_PORT).length).toBe(4)
    void west; void north; void east; void south
  })
})
