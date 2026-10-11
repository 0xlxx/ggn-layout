/**
 * labels 簇变异补测: label-and-node-size-processor.ts.
 * computeNodeCellSize (PORTS/NODE_LABELS/MINIMUM_SIZE 贡献) + processLabelAndNodeSize
 * (FIXED_POS/FIXED_RATIO 边框放置 + borderOffset + 容器端口 + EXTERNAL_PORT dummy 标签 +
 *  NODE_LABELS 尺寸覆盖/放置 + MINIMUM_SIZE 方向转置).
 */
import { describe, expect, it, vi } from 'vitest'
import { LGraph, LNode, LPort, LEdge, PortSide, PortConstraints, NodeType, Direction } from '../../src/index.js'
import { computeNodeCellSize, processLabelAndNodeSize } from '../../src/intermediate/label-and-node-size-processor.js'
import { GraphTransformer, TransformMode } from '../../src/intermediate/graph-transformer.js'
import {
  NODE_SIZE_CONSTRAINTS, NODE_SIZE_MINIMUM, PORT_CONSTRAINTS, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING,
  PORT_BORDER_OFFSET, NODE_LABELS_PLACEMENT, DIRECTION, PORT_LABELS_PLACEMENT,
} from '../../src/options/layered-options.js'
import { EXT_PORT_SIDE } from '../../src/options/internal-properties.js'
import { Layer } from '../../src/graph/layer.js'

function makeNode(g: LGraph, layer: Layer | null, size = { x: 100, y: 100 }): LNode {
  const n = new LNode(g)
  n.size = { ...size }
  if (layer) n.setLayer(layer)
  return n
}
function addPort(n: LNode, side: PortSide, w = 8, h = 8, borderOffset?: number): LPort {
  const p = new LPort()
  p.setNode(n)
  p.size = { x: w, y: h }
  p.setSide(side)
  if (borderOffset !== undefined) p.setProperty(PORT_BORDER_OFFSET, borderOffset)
  return p
}
function graphWithLayer(): { g: LGraph; layer: Layer } {
  const g = new LGraph()
  const layer = new Layer(g)
  g.getLayers().push(layer)
  g.setProperty(SPACING_PORT_PORT, 10)
  g.setProperty(SPACING_PORTS_SURROUNDING, { top: 0, left: 0, bottom: 0, right: 0 })
  return { g, layer }
}

describe('computeNodeCellSize', () => {
  it('E/W 端口 → cellH; N/S 端口 → cellW (DISTRIBUTED 2*portPort)', () => {
    const { g } = graphWithLayer()
    const n = makeNode(g, null)
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['PORTS'])
    addPort(n, PortSide.WEST, 8, 20)
    addPort(n, PortSide.WEST, 8, 20)
    addPort(n, PortSide.EAST, 8, 10)
    // WEST: (20+20) + (2-1)*10 + 2*10 = 70; EAST: 10 + 0 + 20 = 30 → max 70
    expect(computeNodeCellSize(n, g)).toEqual({ x: 0, y: 70 })
    const n2 = makeNode(g, null)
    n2.setProperty(NODE_SIZE_CONSTRAINTS, ['PORTS'])
    addPort(n2, PortSide.NORTH, 10, 8)
    addPort(n2, PortSide.NORTH, 10, 8)
    // NORTH: (10+10) + 10 + 20 = 50
    expect(computeNodeCellSize(n2, g)).toEqual({ x: 50, y: 0 })
  })

  it('NODE_LABELS → 标签盒 max; MINIMUM_SIZE → 20 下限/显式 minimum', () => {
    const { g } = graphWithLayer()
    const n = makeNode(g, null)
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS'])
    n.setLabels([{ text: 'a', position: { x: 0, y: 0 }, size: { x: 60, y: 12 } },
      { text: 'b', position: { x: 0, y: 0 }, size: { x: 30, y: 20 } }])
    expect(computeNodeCellSize(n, g)).toEqual({ x: 60, y: 20 })

    const m = makeNode(g, null)
    m.setProperty(NODE_SIZE_CONSTRAINTS, ['MINIMUM_SIZE'])
    expect(computeNodeCellSize(m, g)).toEqual({ x: 20, y: 20 })
    m.setProperty(NODE_SIZE_MINIMUM, { x: 80, y: 40 })
    expect(computeNodeCellSize(m, g)).toEqual({ x: 80, y: 40 })
  })

  it('无约束 / 空约束 → 0x0', () => {
    const { g } = graphWithLayer()
    const n = makeNode(g, null)
    expect(computeNodeCellSize(n, g)).toEqual({ x: 0, y: 0 })
  })
})

describe('processLabelAndNodeSize FIXED 端口边框放置', () => {
  it.each([
    [PortConstraints.FIXED_POS, 'FIXED_POS'],
    [PortConstraints.FIXED_RATIO, 'FIXED_RATIO'],
  ])('%s: N/S/W/E 端口贴边框 + borderOffset', (pc, _label) => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer)
    n.setProperty(PORT_CONSTRAINTS, pc)
    addPort(n, PortSide.NORTH, 8, 8, -3)
    addPort(n, PortSide.SOUTH, 8, 8, 2)
    addPort(n, PortSide.WEST, 8, 8, -3)
    addPort(n, PortSide.EAST, 8, 8, 2)
    processLabelAndNodeSize(g)
    const north = n.getPorts(PortSide.NORTH)[0]!
    const south = n.getPorts(PortSide.SOUTH)[0]!
    const west = n.getPorts(PortSide.WEST)[0]!
    const east = n.getPorts(PortSide.EAST)[0]!
    expect(north.getPosition().y).toBe(-8 - (-3))
    expect(south.getPosition().y).toBe(100 + 2)
    expect(west.getPosition().x).toBe(-8 - (-3))
    expect(east.getPosition().x).toBe(100 + 2)
  })

  it('字符串 "FIXED_POSITION" 变体同样贴边框', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer)
    n.setProperty(PORT_CONSTRAINTS, 'FIXED_POSITION' as never)
    const w = addPort(n, PortSide.WEST)
    const e = addPort(n, PortSide.EAST)
    processLabelAndNodeSize(g)
    expect(w.getPosition().x).toBe(-8)
    expect(e.getPosition().x).toBe(100)
  })
})

describe('processLabelAndNodeSize 容器/FREE/标签', () => {
  it('FREE 扁平节点: SOUTH 端口 y += nodeH', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer)
    n.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
    const s = addPort(n, PortSide.SOUTH)
    processLabelAndNodeSize(g)
    expect(s.getPosition().y).toBeGreaterThanOrEqual(100)
  })

  it('容器节点 (nestedGraph): E/W 等距, N/S 居中, 端口贴边', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 100 })
    n.setNestedGraph(new LGraph())
    addPort(n, PortSide.WEST)
    addPort(n, PortSide.WEST)
    addPort(n, PortSide.EAST)
    addPort(n, PortSide.EAST)
    addPort(n, PortSide.NORTH)
    processLabelAndNodeSize(g)
    const west = n.getPorts(PortSide.WEST)
    const east = n.getPorts(PortSide.EAST)
    const north = n.getPorts(PortSide.NORTH)
    // spacing = 8 + (100-16)/3 = 36; WEST bottom-up y: 64, 28; EAST top-down: 28, 64
    expect(west[0]!.getPosition().x).toBe(-8)
    expect(west[0]!.getPosition().y).toBe(64)
    expect(west[1]!.getPosition().y).toBe(28)
    expect(east[0]!.getPosition().x).toBe(100)
    expect(east[0]!.getPosition().y).toBe(28)
    expect(east[1]!.getPosition().y).toBe(64)
    expect(north[0]!.getPosition().y).toBe(-8)
  })

  it('EXTERNAL_PORT dummy: INSIDE NORTH 标签置于节点内上方', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(PORT_LABELS_PLACEMENT, ['INSIDE'])
    const n = makeNode(g, layer, { x: 20, y: 20 })
    n.setType(NodeType.EXTERNAL_PORT)
    n.setProperty(EXT_PORT_SIDE, PortSide.NORTH)
    const p = addPort(n, PortSide.UNDEFINED, 8, 8)
    p.setLabels([{ text: 'L', position: { x: 0, y: 0 }, size: { x: 10, y: 4 } }])
    processLabelAndNodeSize(g)
    expect(p.getLabels()[0]!.position).toEqual({ x: 5, y: 1 }) // (20-10)/2 - 0; spacingV 1
  })

  it('EXTERNAL_PORT dummy: OUTSIDE N/S 标签 x = portPos.x + spacingH', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(PORT_LABELS_PLACEMENT, ['OUTSIDE'])
    const n = makeNode(g, layer, { x: 20, y: 20 })
    n.setType(NodeType.EXTERNAL_PORT)
    n.setProperty(EXT_PORT_SIDE, PortSide.SOUTH)
    const p = addPort(n, PortSide.UNDEFINED, 8, 8)
    p.setLabels([{ text: 'L', position: { x: 0, y: 0 }, size: { x: 10, y: 4 } }])
    processLabelAndNodeSize(g)
    expect(p.getLabels()[0]!.position.x).toBe(1) // 0 + spacingH 1
  })

  it('NODE_LABELS 约束: 节点尺寸 = 标签盒 + padding, 标签按 INSIDE V/H 放置', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 50 })
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS'])
    n.setLabels([
      { text: 'A', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'INSIDE V_TOP H_LEFT' },
      { text: 'B', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'INSIDE V_TOP H_RIGHT' },
      { text: 'C', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'INSIDE V_BOTTOM H_CENTER' },
    ])
    processLabelAndNodeSize(g)
    // 尺寸 = maxW(30)+5+5=40, maxH(10)+5+5=20
    expect(n.size).toEqual({ x: 40, y: 20 })
    const labels = n.getLabels()
    expect(labels[0]!.position).toEqual({ x: 5, y: 5 })
    expect(labels[1]!.position).toEqual({ x: 40 - 30 - 5, y: 5 })
    expect(labels[2]!.position).toEqual({ x: 5 + (40 - 5 - 5 - 30) / 2, y: 20 - 5 - 10 })
  })

  it('MINIMUM_SIZE + NODE_LABELS: 尺寸 = max(标签盒, minimum) 不含 padding; DOWN 转置 minimum', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(DIRECTION, Direction.DOWN)
    // 节点先 layerless (与真实管线 import 一致): LNode 构造入 layerless, P1 变换按 layerless 处理一次.
    const n = makeNode(g, null, { x: 100, y: 100 })
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS', 'MINIMUM_SIZE'])
    n.setProperty(NODE_SIZE_MINIMUM, { x: 200, y: 100 })
    n.setLabels([{ text: 'A', position: { x: 0, y: 0 }, size: { x: 30, y: 10 } }])
    // ELK 架构: 方向转置由 DIRECTION_PREPROCESSOR (GraphTransformer TO_INPUT, transposeProperties)
    // 在 P1 完成 — DOWN minimum (200,100)→(100,200), 标签 (30,10)→(10,30), 节点尺寸同步转置.
    // 处理器 (P4 LabelAndNodeSizeProcessor) 按 NodeSizeCalculator 语义**原样**应用 minimum (Java
    // NodeSizeCalculator.setNodeWidth/Height 无方向感知; 476 实证: 处理器再互换 → 200x200 回归).
    new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
    // P2 layering 移入层 (layerless 被清空), P4 端口/标签处理器运行 — 与真实管线同序.
    n.setLayer(layer)
    processLabelAndNodeSize(g)
    // 转置后 minimum (100,200); size = max(标签宽 10,100) × max(标签高 30,200) → 100×200
    expect(n.size).toEqual({ x: 100, y: 200 })
  })

  it('OUTSIDE 节点标签: placeOutsideNodeLabel 放置 (V_TOP H_CENTER)', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 50 })
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS'])
    n.setProperty(NODE_LABELS_PLACEMENT, ['OUTSIDE', 'V_TOP', 'H_CENTER'])
    n.setLabels([{ text: 'L', position: { x: 0, y: 0 }, size: { x: 30, y: 10 } }])
    processLabelAndNodeSize(g)
    const l = n.getLabels()[0]!
    // 节点尺寸先被 NODE_LABELS 覆盖为 40x20 (标签盒+padding) → 相对该尺寸居中
    expect(l.position.x).toBe((40 - 30) / 2)
    expect(l.position.y).toBe(-10 - 5)
  })
})

describe('processLabelAndNodeSize 容器端口放置补测 (T5-C2)', () => {
  it('2 NORTH 端口 JUSTIFIED: start=spacing, x 递增, y=-portH', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 100 })
    n.setNestedGraph(new LGraph())
    addPort(n, PortSide.NORTH)
    addPort(n, PortSide.NORTH)
    processLabelAndNodeSize(g)
    const ports = n.getPorts(PortSide.NORTH)
    // spacing = (100-16)/3 = 28; start=28; x: 28, 28+8+28=64
    expect(ports[0]!.getPosition().x).toBe(28)
    expect(ports[1]!.getPosition().x).toBe(64)
    expect(ports[0]!.getPosition().y).toBe(-8)
    expect(ports[1]!.getPosition().y).toBe(-8)
  })

  it('2 SOUTH 端口 JUSTIFIED: 逆序放置 + y=nodeH+borderOffset', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 100 })
    n.setNestedGraph(new LGraph())
    addPort(n, PortSide.SOUTH)
    addPort(n, PortSide.SOUTH, 8, 8, 2)
    processLabelAndNodeSize(g)
    const ports = n.getPorts(PortSide.SOUTH)
    // reversed iter → ports[1] 先放 x=28 (borderOffset 2), ports[0] x=64
    expect(ports[0]!.getPosition().x).toBe(64)
    expect(ports[1]!.getPosition().x).toBe(28)
    expect(ports[1]!.getPosition().y).toBe(102)
  })

  it('1 NORTH 端口 JUSTIFIED → CENTER 退化: x=(avail-totalW)/2', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 100 })
    n.setNestedGraph(new LGraph())
    addPort(n, PortSide.NORTH)
    processLabelAndNodeSize(g)
    const p = n.getPorts(PortSide.NORTH)[0]!
    expect(p.getPosition().x).toBe(46)
  })

  it('placeVerticalPortsEqually: 首端口 size-0 → portHeight 取正常端口高', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 100 })
    n.setNestedGraph(new LGraph())
    addPort(n, PortSide.WEST, 8, 0) // size-0 匿名端口
    addPort(n, PortSide.WEST, 8, 8)
    processLabelAndNodeSize(g)
    const ports = n.getPorts(PortSide.WEST)
    // portHeight=8, sumSizeY=8, spacing=8+(100-8)/3=38.6667; WEST bottom-up
    expect(ports[0]!.getPosition().y).toBeCloseTo(69.333, 3)
    expect(ports[1]!.getPosition().y).toBeCloseTo(30.667, 3)
  })

  it('placeVerticalPortsEqually: WEST borderOffset → x=-portW-offset', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 100 })
    n.setNestedGraph(new LGraph())
    addPort(n, PortSide.WEST, 8, 8, -3)
    processLabelAndNodeSize(g)
    expect(n.getPorts(PortSide.WEST)[0]!.getPosition().x).toBe(-5)
  })

  it('GGN_VP_DBG=1: placeVerticalPortsEqually 打印调试日志', () => {
    vi.stubEnv('GGN_VP_DBG', '1')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { g, layer } = graphWithLayer()
      const n = makeNode(g, layer, { x: 100, y: 100 })
      n.setNestedGraph(new LGraph())
      addPort(n, PortSide.WEST)
      processLabelAndNodeSize(g)
      expect(spy).toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})

describe('computeNodeCellSize 图级回退/surrounding (T5-C2)', () => {
  it('图级 NODE_SIZE_CONSTRAINTS + SPACING_PORTS_SURROUNDING 生效', () => {
    const { g } = graphWithLayer()
    g.setProperty(NODE_SIZE_CONSTRAINTS, ['PORTS'])
    g.setProperty(SPACING_PORTS_SURROUNDING, { top: 5, left: 3, bottom: 7, right: 4 })
    const n = makeNode(g, null)
    addPort(n, PortSide.EAST, 8, 8)
    addPort(n, PortSide.NORTH, 8, 8)
    // EAST: 8 + 0 + 2*10 + 5+7 = 40; NORTH: 8 + 0 + 2*10 + 3+4 = 35
    expect(computeNodeCellSize(n, g)).toEqual({ x: 35, y: 40 })
  })
})

describe('placeExternalPortDummyLabels 补测 (T5-C2)', () => {
  function extNode(g: LGraph, layer: Layer, side: PortSide, labels: { text: string; w: number; h: number }[]): { n: LNode; p: LPort } {
    const n = makeNode(g, layer, { x: 20, y: 20 })
    n.setType(NodeType.EXTERNAL_PORT)
    n.setProperty(EXT_PORT_SIDE, side)
    const p = addPort(n, PortSide.UNDEFINED, 8, 8)
    p.setLabels(labels.map(l => ({ text: l.text, position: { x: 0, y: 0 }, size: { x: l.w, y: l.h } })))
    return { n, p }
  }

  it('INSIDE EAST NEXT_TO_PORT (无连接边) → 标签垂直居中', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(PORT_LABELS_PLACEMENT, ['INSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'])
    const { p } = extNode(g, layer, PortSide.EAST, [{ text: 'L', w: 10, h: 4 }])
    processLabelAndNodeSize(g)
    expect(p.getLabels()[0]!.position).toEqual({ x: -11, y: 8 }) // -spacingH-boxW; (20-4)/2
  })

  it('INSIDE EAST NEXT_TO_PORT=false (有连接边) → box.y = dummySize.y + spacingV', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(PORT_LABELS_PLACEMENT, ['INSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'])
    const { p } = extNode(g, layer, PortSide.EAST, [{ text: 'L', w: 10, h: 4 }])
    const other = makeNode(g, layer)
    const otherPort = new LPort(); otherPort.setNode(other); otherPort.setSide(PortSide.WEST)
    const e = new LEdge(); e.setSource(p); e.setTarget(otherPort)
    void e
    processLabelAndNodeSize(g)
    expect(p.getLabels()[0]!.position.y).toBe(21) // dummySize.y 20 + spacingV 1
  })

  it('INSIDE EAST treatAsGroup: 2 标签组 → 组高居中 + 纵向堆叠', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(PORT_LABELS_PLACEMENT, ['INSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'])
    g.setProperty('org.eclipse.elk.portLabels.treatAsGroup', true)
    const { p } = extNode(g, layer, PortSide.EAST, [{ text: 'A', w: 10, h: 6 }, { text: 'B', w: 8, h: 6 }])
    processLabelAndNodeSize(g)
    const labels = p.getLabels()
    // 组高 12 → labelHeight=12 → box.y=(20-12)/2=4; 堆叠 y: 4, 10
    expect(labels[0]!.position.y).toBe(4)
    expect(labels[1]!.position.y).toBe(10)
  })

  it('OUTSIDE EAST NEXT_TO_PORT → box.y 垂直居中, box.x = portPos.x + spacingH', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(PORT_LABELS_PLACEMENT, ['OUTSIDE', 'NEXT_TO_PORT_IF_POSSIBLE'])
    const { p } = extNode(g, layer, PortSide.EAST, [{ text: 'L', w: 10, h: 4 }])
    processLabelAndNodeSize(g)
    expect(p.getLabels()[0]!.position).toEqual({ x: 0, y: 8 }) // E/W OUTSIDE 不设 box.x
  })
})

describe('processNodeLabels 放置补测 (T5-C2)', () => {
  it('V_CENTER + H_LEFT/H_RIGHT/H_CENTER: 各自 x 定位 + 垂直居中', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 50 })
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS'])
    n.setLabels([
      { text: 'A', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'INSIDE V_CENTER H_LEFT' },
      { text: 'B', position: { x: 0, y: 0 }, size: { x: 20, y: 10 }, placement: 'INSIDE V_CENTER H_RIGHT' },
      { text: 'C', position: { x: 0, y: 0 }, size: { x: 40, y: 10 }, placement: 'INSIDE V_CENTER H_CENTER' },
    ])
    processLabelAndNodeSize(g)
    expect(n.size).toEqual({ x: 50, y: 20 }) // maxW 40 + padding 10
    const [a, b, c] = n.getLabels()
    expect(a!.position.x).toBe(5)
    expect(b!.position.x).toBe(50 - 20 - 5)
    expect(c!.position.x).toBe(5 + (50 - 5 - 5 - 40) / 2)
    expect(a!.position.y).toBe(5)
    expect(b!.position.y).toBe(5)
    expect(c!.position.y).toBe(5)
  })

  it('INSIDE + OUTSIDE 混合: outside 走 placeOutsideNodeLabel, inside 走网格', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 50 })
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS'])
    n.setLabels([
      { text: 'O', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'OUTSIDE V_TOP H_CENTER' },
      { text: 'I', position: { x: 0, y: 0 }, size: { x: 30, y: 10 }, placement: 'INSIDE V_TOP H_CENTER' },
    ])
    processLabelAndNodeSize(g)
    const labels = n.getLabels()
    const o = labels.find(l => l.text === 'O')!
    const i = labels.find(l => l.text === 'I')!
    expect(o.position.y).toBeLessThan(0) // 节点上方
    expect(i.position.y).toBe(5) // INSIDE V_TOP 从 padding.top 起
  })

  it('MINIMUM_SIZE + NODE_LABELS 无节点级 minimum → 20 下限', () => {
    const { g, layer } = graphWithLayer()
    const n = makeNode(g, layer, { x: 100, y: 100 })
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS', 'MINIMUM_SIZE'])
    n.setLabels([{ text: 'A', position: { x: 0, y: 0 }, size: { x: 10, y: 4 } }])
    processLabelAndNodeSize(g)
    expect(n.size).toEqual({ x: 20, y: 20 })
  })
})

describe('processNodeLabels MINIMUM_SIZE 方向补测 (T5-C2)', () => {
  it('DIRECTION=UP: 转置 minimum (与 DOWN 对称)', () => {
    const { g, layer } = graphWithLayer()
    g.setProperty(DIRECTION, Direction.UP)
    // 节点先 layerless (与真实管线 import 一致), P1 变换按 layerless 处理一次.
    const n = makeNode(g, null, { x: 100, y: 100 })
    n.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS', 'MINIMUM_SIZE'])
    n.setProperty(NODE_SIZE_MINIMUM, { x: 200, y: 100 })
    n.setLabels([{ text: 'A', position: { x: 0, y: 0 }, size: { x: 30, y: 10 } }])
    // 与 DOWN 对称: UP 方向转置同样在 GraphTransformer TO_INPUT (READING_DIRECTION:
    // mirrorAllY + transposeAll) 完成, 处理器原样应用转置后 minimum → 100×200.
    new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(g)
    n.setLayer(layer)
    processLabelAndNodeSize(g)
    // 转置后 minimum (100,200); size = max(10,100) × max(30,200) → 100×200
    expect(n.size).toEqual({ x: 100, y: 200 })
  })
})
