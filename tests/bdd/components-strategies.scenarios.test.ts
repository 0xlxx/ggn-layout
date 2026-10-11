/**
 * components 策略族 BDD 场景 (ELK layered components 移植):
 * ModelOrderRowGraphPlacer — 模型序行放置 (顺序保持 / NORTH 突破行宽 / EAST/WEST 换行 / SOUTH 阻断);
 * ComponentsCompactor — 分量压缩 (重叠拉开 / 间距保持 / 外部端口贴边框 / 压缩装配 combine).
 */
import { describe, expect, it } from 'vitest'
import { NodeType, PortSide } from '../../src/graph/enums.js'
import { LGraph } from '../../src/graph/lgraph.js'
import { LNode } from '../../src/graph/lnode.js'
import { LPort } from '../../src/graph/lport.js'
import { LEdge } from '../../src/graph/ledge.js'
import { ModelOrderRowGraphPlacer } from '../../src/components/model-order-row-graph-placer.js'
import { COMPACTION_CONNECTED_COMPONENTS, ComponentsCompactor } from '../../src/components/components-compactor.js'
import { EXT_PORT_CONNECTIONS, EXT_PORT_SIDE } from '../../src/options/internal-properties.js'
import { ASPECT_RATIO, SPACING_COMPONENT_COMPONENT } from '../../src/options/layered-options.js'

const SPACING = 20
const EPS = 1e-6

/** 构造单节点分量图 (位置/尺寸/外部端口连接侧). */
function component(width: number, height: number, x: number, y: number,
  conns: Set<PortSide> = new Set()): LGraph {
  const g = new LGraph()
  g.setProperty(EXT_PORT_CONNECTIONS, conns)
  const n = new LNode(g)
  n.size = { x: width, y: height }
  n.position = { x, y }
  g.getSize().x = width
  g.getSize().y = height
  return g
}

/** 构造带 WEST 外部端口的分量: 普通节点 + 外部端口 dummy + 外部边. */
function componentWithWestExtPort(width: number, height: number, x: number, y: number): LGraph {
  const g = new LGraph()
  g.setProperty(EXT_PORT_CONNECTIONS, new Set([PortSide.WEST]))
  const n = new LNode(g)
  n.size = { x: width, y: height }
  n.position = { x, y }
  const ext = new LNode(g)
  ext.setType(NodeType.EXTERNAL_PORT)
  ext.size = { x: 8, y: 8 }
  ext.position = { x: x - 10, y: y + height / 2 }
  ext.setProperty(EXT_PORT_SIDE, PortSide.WEST)
  const inner = new LPort(); inner.setNode(n)
  const out = new LPort(); out.setNode(ext)
  const e = new LEdge(); e.setSource(out); e.setTarget(inner)
  g.getSize().x = width
  g.getSize().y = height
  return g
}

describe('模型序行放置 (ModelOrderRowGraphPlacer)', () => {
  it('行内顺序与模型序一致; WEST 触发换行', () => {
    const g1 = component(60, 30, 0, 0)                                  // NONE
    const g2 = component(60, 30, 0, 0, new Set([PortSide.NORTH]))       // NORTH: 行首
    const g3 = component(60, 30, 0, 0, new Set([PortSide.WEST]))        // WEST: 换行
    const target = new LGraph()
    new ModelOrderRowGraphPlacer().combine([g1, g2, g3], target)

    const [n1, n2, n3] = [g1, g2, g3].map(g => g.getLayerlessNodes()[0]!)
    // 模型序: g1 (x=0) → g2 (x=80, NORTH 放到已占行宽之后)
    expect(n1.position.x).toBe(0)
    expect(n1.position.y).toBe(0)
    expect(n2.position.x).toBe(80)
    expect(n2.position.y).toBe(0)
    // WEST 分量换到下一行
    expect(n3.position.x).toBe(0)
    expect(n3.position.y).toBe(50)
    // target 尺寸按行计算
    expect(target.getSize().x).toBe(140)
    expect(target.getSize().y).toBe(80)
  })

  it('NORTH 分量允许突破行宽约束', () => {
    const g1 = component(60, 30, 0, 0)
    const g2 = component(60, 30, 0, 0, new Set([PortSide.NORTH]))
    const target = new LGraph()
    target.setProperty(ASPECT_RATIO, 0.1) // 行宽 = max(60, sqrt(2*1800)*0.1≈19) = 60
    new ModelOrderRowGraphPlacer().combine([g1, g2], target)

    const [n1, n2] = [g1, g2].map(g => g.getLayerlessNodes()[0]!)
    // 60+60=120 > 60 超宽, 但 NORTH 分量不换行 (仍第一行)
    expect(n2.position.y).toBe(0)
    expect(n2.position.x).toBe(80)
  })

  it('EAST 触发换行, SOUTH 阻断下方行起始位', () => {
    const g1 = component(60, 30, 0, 0, new Set([PortSide.EAST]))
    const g2 = component(60, 30, 0, 0, new Set([PortSide.SOUTH]))
    const g3 = component(60, 30, 0, 0)
    const g4 = component(60, 30, 0, 0)
    const target = new LGraph()
    target.setProperty(ASPECT_RATIO, 0.1)
    new ModelOrderRowGraphPlacer().combine([g1, g2, g3, g4], target)

    const [n1, n2, n3, n4] = [g1, g2, g3, g4].map(g => g.getLayerlessNodes()[0]!)
    // g1 行首
    expect(n1.position.x).toBe(0)
    expect(n1.position.y).toBe(0)
    // g2 (SOUTH) 超宽换行到第二行, 并让 startXOfRow 前移到 80
    expect(n2.position.x).toBe(0)
    expect(n2.position.y).toBe(50)
    // g3 从阻断位 80 起行
    expect(n3.position.x).toBe(80)
    expect(n3.position.y).toBe(100)
    // g4 继续换行
    expect(n4.position.x).toBe(80)
    expect(n4.position.y).toBe(150)
    expect(target.getSize().x).toBe(140)
    expect(target.getSize().y).toBe(180)
  })
})

describe('分量压缩 (ComponentsCompactor)', () => {
  it('重叠分量压缩后无重叠且间距保持', () => {
    const a = component(50, 40, 0, 0)
    const b = component(50, 40, 40, 0)   // 与 a 重叠 10
    const c = component(50, 40, 80, 0)   // 与 b 重叠 10
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b, c], { x: 0, y: 0 }, SPACING)

    const xs = [a, b, c].map(g => g.getLayerlessNodes()[0]!.position.x).sort((p, q) => p - q)
    expect(xs[1]! - (xs[0]! + 50)).toBeGreaterThanOrEqual(SPACING - EPS)
    expect(xs[2]! - (xs[1]! + 50)).toBeGreaterThanOrEqual(SPACING - EPS)
    const gs = compactor.getGraphSize()
    expect(gs.x).toBeCloseTo(xs[2]! + 50 - xs[0]!, 6)
    expect(gs.y).toBeCloseTo(40, 6)
  })

  it('间距已满足时压缩不劣化 (布局稳定)', () => {
    const a = component(50, 40, 0, 0)
    const b = component(50, 40, 200, 0)  // 间距 150 ≥ 20
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b], { x: 0, y: 0 }, SPACING)
    const xs = [a, b].map(g => g.getLayerlessNodes()[0]!.position.x).sort((p, q) => p - q)
    // 间距不会低于需求, 也不被撑大
    expect(xs[1]! - (xs[0]! + 50)).toBeGreaterThanOrEqual(SPACING - EPS)
  })

  it('外部端口分量: 压缩后外部端口留在分量外侧, 坐标有限', () => {
    // ELK Java 语义: WEST 外部扩展在水平压缩时被排除出图, 分量可在无约束方向自由移动
    // (压缩不保证带外部端口分量的绝对间距; 保证的是扩展始终贴分量外侧).
    const a = component(50, 40, 0, 0)
    const b = componentWithWestExtPort(50, 40, 60, 0) // WEST 外部端口 + 外部边
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b], { x: 0, y: 0 }, SPACING)

    const [nb, ext] = b.getLayerlessNodes()
    // 外部端口在普通节点左侧 (外部边框一侧)
    expect(ext.position.x + ext.size.x).toBeLessThanOrEqual(nb.position.x + EPS)
    // 图尺寸: 外部边尺寸贡献 + 扩展维度更新 (ELK Java 对齐实测值)
    const gs = compactor.getGraphSize()
    expect(Number.isFinite(gs.x)).toBe(true)
    expect(Number.isFinite(gs.y)).toBe(true)
    expect(gs.x).toBeCloseTo(51, 6)
    expect(gs.y).toBeCloseTo(40.5, 6)
  })
})

describe('模型序行放置 + 压缩装配 (combine)', () => {
  it('COMPACTION_CONNECTED_COMPONENTS=true 时 combine 压缩后间距保持 (单行分量)', () => {
    // 窄分量 + 大 aspectRatio → placeComponents 不换行 (全一行, y 重叠 → 压缩约束完整).
    const g1 = component(40, 30, 0, 0)
    const g2 = component(40, 30, 20, 0)   // 与 g1 重叠 20
    const g3 = component(40, 30, 40, 0)   // 与 g2 重叠 20
    const target = new LGraph()
    target.setProperty(SPACING_COMPONENT_COMPONENT, SPACING)
    target.setProperty(ASPECT_RATIO, 3) // maxRowWidth=180 ≥ 三分量总宽, 不换行
    for (const g of [g1, g2, g3]) g.setProperty(COMPACTION_CONNECTED_COMPONENTS, true)

    const placer = new ModelOrderRowGraphPlacer()
    placer.combine([g1, g2, g3], target)

    const xs = [g1, g2, g3].map(g => g.getLayerlessNodes()[0]!.position.x).sort((p, q) => p - q)
    // 行放置已拉开 (0/60/120), 压缩保持间距不折叠
    expect(xs[1]! - (xs[0]! + 40)).toBeGreaterThanOrEqual(SPACING - 1)
    expect(xs[2]! - (xs[1]! + 40)).toBeGreaterThanOrEqual(SPACING - 1)
    // 压缩后的图尺寸 = 压缩 bbox
    expect(target.getSize().x).toBeCloseTo(xs[2]! + 40 - xs[0]!, 6)
  })

  it('无压缩开关时 combine 仅行放置 (不压缩, 超宽换行)', () => {
    // maxRowWidth = max(60, sqrt(2*1800)*1.6≈96) → g2 换行到第二行 (Java 行放置语义)
    const g1 = component(60, 30, 0, 0)
    const g2 = component(60, 30, 0, 0)
    const target = new LGraph()
    new ModelOrderRowGraphPlacer().combine([g1, g2], target)
    const [n1, n2] = [g1, g2].map(g => g.getLayerlessNodes()[0]!)
    expect(n1.position.x).toBe(0)
    expect(n1.position.y).toBe(0)
    expect(n2.position.x).toBe(0)  // 换行: 行首
    expect(n2.position.y).toBe(50) // 30 + 20 间距
    expect(target.getSize().x).toBe(60)
    expect(target.getSize().y).toBe(80)
  })

  it('单分量 combine 直接移动', () => {
    const g1 = component(60, 30, 10, 10)
    const target = new LGraph()
    new ModelOrderRowGraphPlacer().combine([g1], target)
    const n = g1.getLayerlessNodes()[0]!
    expect(n.position.x).toBe(10)
    expect(target.getLayerlessNodes()).toContain(n)
  })
})

// ═══════════════════════════════════════════════════════════════════
// T5-D 变异批次补测 (components): 外部端口各侧 (EAST/NORTH/SOUTH)、
// 外部边弯点 (内段凸包)、外部端口作 target、dummy-only 分量 (createDummyNode)、
// 内部边弯点凸包 — 覆盖压缩外部扩展路径.
// ═══════════════════════════════════════════════════════════════════

/** 构造带指定侧外部端口的分量: 普通节点 + 外部端口 dummy + 外部边 (ext 作 source). */
function componentWithExtPort(width: number, height: number, x: number, y: number, side: PortSide,
  edgeFromExt = true): LGraph {
  const g = new LGraph()
  g.setProperty(EXT_PORT_CONNECTIONS, new Set([side]))
  const n = new LNode(g)
  n.size = { x: width, y: height }
  n.position = { x, y }
  const ext = new LNode(g)
  ext.setType(NodeType.EXTERNAL_PORT)
  ext.size = { x: 8, y: 8 }
  ext.setProperty(EXT_PORT_SIDE, side)
  switch (side) {
    case PortSide.WEST: ext.position = { x: x - 10, y: y + height / 2 }; break
    case PortSide.EAST: ext.position = { x: x + width + 10, y: y + height / 2 }; break
    case PortSide.NORTH: ext.position = { x: x + width / 2, y: y - 10 }; break
    case PortSide.SOUTH: ext.position = { x: x + width / 2, y: y + height + 10 }; break
    default: break
  }
  const inner = new LPort(); inner.setNode(n)
  inner.setSide(side === PortSide.EAST ? PortSide.EAST
    : side === PortSide.NORTH ? PortSide.NORTH
      : side === PortSide.SOUTH ? PortSide.SOUTH : PortSide.WEST)
  inner.position = { x: side === PortSide.WEST || side === PortSide.EAST ? 0 : width / 2,
    y: side === PortSide.NORTH || side === PortSide.SOUTH ? 0 : height / 2 }
  const out = new LPort(); out.setNode(ext)
  const e = new LEdge()
  if (edgeFromExt) { e.setSource(out); e.setTarget(inner) }
  else { e.setSource(inner); e.setTarget(out) }
  g.getSize().x = width
  g.getSize().y = height
  return g
}

describe('分量压缩 (ComponentsCompactor) 外部端口各侧', () => {
  it.each([
    [PortSide.EAST, '右侧'],
    [PortSide.NORTH, '上侧'],
    [PortSide.SOUTH, '下侧'],
  ] as const)('外部端口 %s 压缩后留在分量外侧, 坐标有限', (side, _label) => {
    const a = component(50, 40, 0, 0)
    const b = componentWithExtPort(50, 40, 60, 0, side)
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b], { x: 0, y: 0 }, SPACING)

    const [nb, ext] = b.getLayerlessNodes()
    const EPS = 1e-6
    if (side === PortSide.EAST) {
      expect(ext.position.x).toBeGreaterThanOrEqual(nb.position.x + nb.size.x - EPS)
    } else if (side === PortSide.NORTH) {
      expect(ext.position.y + ext.size.y).toBeLessThanOrEqual(nb.position.y + EPS)
    } else if (side === PortSide.SOUTH) {
      expect(ext.position.y).toBeGreaterThanOrEqual(nb.position.y + nb.size.y - EPS)
    }
    // 精确图尺寸 (占位符/扩展维度更新语义; ELK Java 对齐实测值)
    const gs = compactor.getGraphSize()
    expect(Number.isFinite(gs.x)).toBe(true)
    expect(Number.isFinite(gs.y)).toBe(true)
    if (side === PortSide.EAST) {
      expect(gs.x).toBeCloseTo(121, 6)
      expect(gs.y).toBeCloseTo(40, 6)
    } else if (side === PortSide.NORTH) {
      expect(gs.x).toBeCloseTo(120, 6)
      expect(gs.y).toBeCloseTo(41, 6)
    } else if (side === PortSide.SOUTH) {
      expect(gs.x).toBeCloseTo(120, 6)
      expect(gs.y).toBeCloseTo(41, 6)
    }
  })

  it('外部边带弯点: 内段进凸包, 压缩后外部端口仍在分量外侧且坐标有限', () => {
    // WEST 外部边经弯点折入节点边距 (外部端口在 x-10, 节点端口在 (0,20))
    const a = component(50, 40, 0, 0)
    const b = componentWithExtPort(50, 40, 0, 0, PortSide.WEST)
    // 给外部边加一个弯点, 形成 outer + inner 两段
    const extEdge = b.getLayerlessNodes()[1]!.getPorts()[0]!.getOutgoingEdges()[0]!
    extEdge.getBendPoints().push({ x: 5, y: 20 })
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b], { x: 0, y: 0 }, SPACING)

    const [nb, ext] = b.getLayerlessNodes()
    expect(ext.position.x + ext.size.x).toBeLessThanOrEqual(nb.position.x + 1e-6)
    expect(Number.isFinite(compactor.getGraphSize().x)).toBe(true)
    expect(Number.isFinite(compactor.getGraphSize().y)).toBe(true)
    expect(Number.isFinite(nb.position.x)).toBe(true)
    expect(Number.isFinite(nb.position.y)).toBe(true)
  })

  it('外部端口作 target (边从节点到外部端口): 压缩后端口仍在外侧', () => {
    const a = component(50, 40, 0, 0)
    const b = componentWithExtPort(50, 40, 60, 0, PortSide.WEST, false)
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b], { x: 0, y: 0 }, SPACING)
    const [nb, ext] = b.getLayerlessNodes()
    expect(ext.position.x + ext.size.x).toBeLessThanOrEqual(nb.position.x + 1e-6)
    expect(Number.isFinite(compactor.getGraphSize().x)).toBe(true)
    expect(Number.isFinite(compactor.getGraphSize().y)).toBe(true)
  })

  it('分量内边弯点计入凸包: 压缩后坐标有限且端口在外侧', () => {
    // 双节点分量 (内部边带弯点) + WEST 外部端口
    const g = new LGraph()
    g.setProperty(EXT_PORT_CONNECTIONS, new Set([PortSide.WEST]))
    const n1 = new LNode(g); n1.size = { x: 40, y: 30 }; n1.position = { x: 0, y: 0 }
    const n2 = new LNode(g); n2.size = { x: 40, y: 30 }; n2.position = { x: 60, y: 0 }
    const p1 = new LPort(); p1.setNode(n1); p1.setSide(PortSide.EAST); p1.position = { x: 40, y: 15 }
    const p2 = new LPort(); p2.setNode(n2); p2.setSide(PortSide.WEST); p2.position = { x: 0, y: 15 }
    const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
    e.getBendPoints().push({ x: 50, y: 25 })  // 内边弯点
    const ext = new LNode(g); ext.setType(NodeType.EXTERNAL_PORT)
    ext.size = { x: 8, y: 8 }; ext.position = { x: -10, y: 15 }
    ext.setProperty(EXT_PORT_SIDE, PortSide.WEST)
    const inner = new LPort(); inner.setNode(n1); inner.setSide(PortSide.WEST); inner.position = { x: 0, y: 15 }
    const out = new LPort(); out.setNode(ext)
    const ee = new LEdge(); ee.setSource(out); ee.setTarget(inner)
    g.getSize().x = 100; g.getSize().y = 30

    const other = component(50, 40, 0, 0)
    const compactor = new ComponentsCompactor()
    compactor.compact([other, g], { x: 0, y: 0 }, SPACING)
    const nodes = g.getLayerlessNodes()
    const extNode = nodes.find(n => n.getType() === NodeType.EXTERNAL_PORT)!
    const normalNodes = nodes.filter(n => n.getType() !== NodeType.EXTERNAL_PORT)
    const minX = Math.min(...normalNodes.map(n => n.position.x))
    expect(extNode.position.x + extNode.size.x).toBeLessThanOrEqual(minX + 1e-6)
    expect(Number.isFinite(compactor.getGraphSize().x)).toBe(true)
    expect(Number.isFinite(compactor.getGraphSize().y)).toBe(true)
  })

  it('dummy-only 分量 (仅外部端口): createDummyNode 补 dummy, 尺寸下限 1, 压缩坐标有限', () => {
    // 只有外部端口 dummy, 无普通节点 → createDummyNode 补 dummy 节点 (尺寸下限 1)
    const g = new LGraph()
    g.setProperty(EXT_PORT_CONNECTIONS, new Set([PortSide.WEST]))
    const ext = new LNode(g)
    ext.setType(NodeType.EXTERNAL_PORT)
    ext.size = { x: 0.5, y: 0.5 }  // 小于 1 → dummy 尺寸应被 Math.max(1, …) 抬到 1
    ext.position = { x: 10, y: 10 }
    ext.setProperty(EXT_PORT_SIDE, PortSide.WEST)
    const out = new LPort(); out.setNode(ext)
    g.getSize().x = 0.5; g.getSize().y = 0.5

    const a = component(50, 40, 0, 0)
    const compactor = new ComponentsCompactor()
    compactor.compact([a, g], { x: 0, y: 0 }, SPACING)
    const extNode = g.getLayerlessNodes().find(n => n.getType() === NodeType.EXTERNAL_PORT)!
    const dummyNode = g.getLayerlessNodes().find(n => n.getType() !== NodeType.EXTERNAL_PORT)!
    // dummy 节点被创建, 且尺寸下限为 1
    expect(dummyNode).toBeDefined()
    expect(dummyNode.size.x).toBe(1)
    expect(dummyNode.size.y).toBe(1)
    // dummy 边已建立: 外部端口有出边
    expect(extNode.getPorts()[0]!.getOutgoingEdges().length).toBe(1)
    // 压缩后外部端口在 dummy 节点左侧 (WEST)
    expect(extNode.position.x).toBeLessThan(dummyNode.position.x)
    expect(Number.isFinite(compactor.getGraphSize().x)).toBe(true)
    expect(Number.isFinite(compactor.getGraphSize().y)).toBe(true)
  })
})

describe('分量压缩 (ComponentsCompactor) 组合外部端口 + 边距', () => {
  it('水平 + 垂直外部扩展并存: 两方向占位符都参与, 图尺寸精确', () => {
    // WEST (水平) + NORTH (垂直) 外部端口同批压缩 → 两方向 placeholder 都注册
    const west = componentWithExtPort(50, 40, 0, 0, PortSide.WEST)
    const north = componentWithExtPort(50, 40, 70, 0, PortSide.NORTH)
    const compactor = new ComponentsCompactor()
    compactor.compact([west, north], { x: 0, y: 0 }, SPACING)
    const gs = compactor.getGraphSize()
    expect(gs.x).toBeCloseTo(121, 6)
    expect(gs.y).toBeCloseTo(41, 6)
    // WEST 端口在节点左侧, NORTH 端口在节点上侧
    const westNodes = west.getLayerlessNodes()
    const westNb = westNodes.find(n => n.getType() !== NodeType.EXTERNAL_PORT)!
    const westExt = westNodes.find(n => n.getType() === NodeType.EXTERNAL_PORT)!
    expect(westExt.position.x + westExt.size.x).toBeLessThanOrEqual(westNb.position.x + 1e-6)
    const northNodes = north.getLayerlessNodes()
    const northNb = northNodes.find(n => n.getType() !== NodeType.EXTERNAL_PORT)!
    const northExt = northNodes.find(n => n.getType() === NodeType.EXTERNAL_PORT)!
    expect(northExt.position.y + northExt.size.y).toBeLessThanOrEqual(northNb.position.y + 1e-6)
  })

  it('节点边距计入图极值: 图尺寸含边距 (ELK addLGraphElementBounds 语义)', () => {
    const a = component(50, 40, 0, 0)
    const b = componentWithExtPort(50, 40, 60, 0, PortSide.WEST)
    const nb = b.getLayerlessNodes()[0]!
    nb.getMargin().left = 5
    nb.getMargin().top = 3
    nb.getMargin().right = 7
    nb.getMargin().bottom = 4
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b], { x: 0, y: 0 }, SPACING)
    const gs = compactor.getGraphSize()
    expect(gs.x).toBeCloseTo(132, 6)
    expect(gs.y).toBeCloseTo(84.5, 6)
    const [ext] = b.getLayerlessNodes().filter(n => n.getType() === NodeType.EXTERNAL_PORT)
    const [nbNode] = b.getLayerlessNodes().filter(n => n.getType() !== NodeType.EXTERNAL_PORT)
    expect(ext.position.x + ext.size.x).toBeLessThanOrEqual(nbNode.position.x + 1e-6)
  })
})

describe('模型序行放置 (ModelOrderRowGraphPlacer) 边界 (0/单/自引用)', () => {
  it('空分量列表: 目标清空且尺寸置 0 (Java combine else-if 分支)', () => {
    const target = new LGraph()
    target.getLayerlessNodes().push(new LNode(target))
    target.getSize().x = 123
    target.getSize().y = 456
    new ModelOrderRowGraphPlacer().combine([], target)
    expect(target.getLayerlessNodes()).toHaveLength(0)
    expect(target.getSize().x).toBe(0)
    expect(target.getSize().y).toBe(0)
  })

  it('单分量 source===target: 不移动不覆盖 (guard source !== target)', () => {
    const target = new LGraph()
    const n = new LNode(target)
    n.size = { x: 30, y: 20 }
    n.position = { x: 5, y: 6 }
    target.getSize().x = 999
    target.getSize().y = 888
    new ModelOrderRowGraphPlacer().combine([target], target)
    // 原图保持不动 (节点仍在, 尺寸不变)
    expect(target.getLayerlessNodes()).toHaveLength(1)
    expect(target.getLayerlessNodes()[0]!.position).toEqual({ x: 5, y: 6 })
    expect(target.getSize().x).toBe(999)
    expect(target.getSize().y).toBe(888)
  })
})

// ─── ComponentGroupGraphPlacer (9 扇区放置, R05) ───
import { ComponentGroupGraphPlacer } from '../../src/components/component-group-graph-placer.js'

describe('9 扇区放置 (ComponentGroupGraphPlacer, R05)', () => {
  it('WEST + EAST: 左列/右列分离 (扇区偏移生效)', () => {
    const west = component(60, 30, 0, 0, new Set([PortSide.WEST]))
    const east = component(60, 30, 0, 0, new Set([PortSide.EAST]))
    const target = new LGraph()
    new ComponentGroupGraphPlacer().combine([west, east], target)
    const nodes = target.getLayerlessNodes()
    const [w, e] = nodes
    expect(w.position.x).toBeCloseTo(0, 6)
    expect(e.position.x).toBeCloseTo(80, 6)   // colLeftWidth=80 (WEST 竖直放置宽 60+spacing20)
    expect(w.position.x).toBeLessThan(e.position.x)
  })

  it('NORTH + SOUTH: 顶行/底行分离', () => {
    const north = component(60, 30, 0, 0, new Set([PortSide.NORTH]))
    const south = component(60, 30, 0, 0, new Set([PortSide.SOUTH]))
    const target = new LGraph()
    new ComponentGroupGraphPlacer().combine([north, south], target)
    const [n, s] = target.getLayerlessNodes()
    expect(n.position.y).toBeCloseTo(0, 6)
    expect(s.position.y).toBeCloseTo(50, 6)   // rowTopHeight=50 (NORTH 水平放置高 30+spacing20)
    expect(n.position.y).toBeLessThan(s.position.y)
  })

  it('NONE + WEST + EAST: 中列夹左右列 (组尺寸含 spacing)', () => {
    const none = component(60, 30, 0, 0)
    const west = component(60, 30, 0, 0, new Set([PortSide.WEST]))
    const east = component(60, 30, 0, 0, new Set([PortSide.EAST]))
    const target = new LGraph()
    new ComponentGroupGraphPlacer().combine([none, west, east], target)
    // 组内: colLeft=60 (WEST) + colMid=80 (NONE 行放置) → NONE 在 x=60, WEST 在 x=0, EAST 在 x=140.
    const nodes = target.getLayerlessNodes()
    const xs = nodes.map(n => n.position.x).sort((a, b) => a - b)
    expect(xs[0]).toBeCloseTo(0, 6)      // WEST (左列)
    expect(xs[1]).toBeCloseTo(80, 6)     // NONE (中列: colLeft=80)
    expect(xs[2]).toBeCloseTo(160, 6)    // EAST (右列: 80+80)
    // 目标尺寸 = 组尺寸 - spacing (colLeft80+colMid80+colRight80 = 240, -20)
    expect(target.getSize().x).toBeCloseTo(220, 6)
  })

  it('单分量 NONE: 直接移入 (尺寸=分量-间距)', () => {
    const one = component(60, 30, 0, 0)
    const target = new LGraph()
    new ComponentGroupGraphPlacer().combine([one], target)
    expect(target.getSize().x).toBeCloseTo(60, 6)  // 单分量: 行放置 80 - spacing20
    expect(target.getSize().y).toBeCloseTo(30, 6)
    expect(target.getLayerlessNodes().length).toBe(1)
  })
})
