/**
 * 移植自 ELK Java: components/ComponentGroupTest.java
 * 连通分量分组九宫格扇区约束.
 * 追加: ModelOrderComponentGroup 模型序约束 + componentOrder / 分量压缩不变量 / 模型序行放置顺序.
 */
import { describe, expect, it } from 'vitest'
import { PortSide } from '../../src/index.js'
import { LGraph } from '../../src/index.js'
import { LNode } from '../../src/index.js'
import { ComponentGroup } from '../../src/components/component-group.js'
import { ModelOrderComponentGroup } from '../../src/components/model-order-component-group.js'
import { ModelOrderRowGraphPlacer } from '../../src/components/model-order-row-graph-placer.js'
import { ComponentsCompactor } from '../../src/components/components-compactor.js'
import { EXT_PORT_CONNECTIONS } from '../../src/options/internal-properties.js'

function sides(...s: PortSide[]): Set<PortSide> {
  return new Set(s)
}

function generateGraph(connections: Set<PortSide>): LGraph {
  const graph = new LGraph()
  graph.setProperty(EXT_PORT_CONNECTIONS, connections)
  return graph
}

const N = PortSide.NORTH, E = PortSide.EAST, S = PortSide.SOUTH, W = PortSide.WEST
const SIDES_NORTH = sides(N)
const SIDES_EAST = sides(E)
const SIDES_SOUTH = sides(S)
const SIDES_WEST = sides(W)
const SIDES_NONE = sides()
const SIDES_EAST_WEST = sides(E, W)
const SIDES_NORTH_SOUTH = sides(N, S)
const SIDES_NORTH_EAST = sides(N, E)
const SIDES_EAST_SOUTH = sides(E, S)
const SIDES_SOUTH_WEST = sides(S, W)
const SIDES_NORTH_WEST = sides(N, W)
const SIDES_NORTH_EAST_WEST = sides(N, E, W)
const SIDES_NORTH_SOUTH_WEST = sides(N, S, W)
const SIDES_EAST_SOUTH_WEST = sides(E, S, W)
const SIDES_NORTH_EAST_SOUTH = sides(N, E, S)
const SIDES_NORTH_EAST_SOUTH_WEST = sides(N, E, S, W)

describe('ComponentGroup (ELK Java 移植)', () => {
  it('testValidConstraints', () => {
    let group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)

    group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)

    group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)

    group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH_EAST_SOUTH_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH_EAST))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST_SOUTH))).toBe(true)
  })

  it('testInvalidConstraints', () => {
    let group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_EAST_SOUTH))).toBe(false)

    group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_EAST_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_EAST_SOUTH_WEST))).toBe(false)

    group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH_EAST))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_EAST_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH_EAST_SOUTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_EAST_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_EAST_SOUTH_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH_WEST))).toBe(false)

    group = new ComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH_EAST_SOUTH_WEST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_EAST_SOUTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_EAST_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_EAST_SOUTH_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH_WEST))).toBe(false)
  })
})

/** 构造带单个节点的分量图 (位置/尺寸可指定). */
function makeComponent(width: number, height: number, x: number, y: number): LGraph {
  const g = new LGraph()
  const n = new LNode(g)
  n.size = { x: width, y: height }
  n.position = { x, y }
  g.getSize().x = width
  g.getSize().y = height
  return g
}

describe('ModelOrderComponentGroup (模型序约束, ELK Java 移植)', () => {
  it('testModelOrderConstraints: 模型序冲突拒绝 (附加于父类扇区约束)', () => {
    // NONE 已存在: NORTH/WEST 等会放在 NONE 之上/之下, 违反模型序 → 拒绝
    let group = new ModelOrderComponentGroup()
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_EAST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_EAST_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(false)

    // EAST 已存在: EW 在 C/W/E 之前, 故 NONE/NORTH/WEST/EW 等不能再加入
    group = new ModelOrderComponentGroup()
    expect(group.add(generateGraph(SIDES_EAST))).toBe(true)
    expect(group.add(generateGraph(SIDES_NONE))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(false)

    // NORTH 已存在: NORTH_WEST 冲突 (NW 在 N 的槽位)
    group = new ModelOrderComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH_WEST))).toBe(false)

    // 同侧可重复加入; 组合扇区与已有单侧冲突 (Java 模型序约束表)
    group = new ModelOrderComponentGroup()
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH))).toBe(true)
    expect(group.add(generateGraph(SIDES_SOUTH))).toBe(true)
    // NORTH 冲突集含 SOUTH (Java 表: put(NORTH, SOUTH)) → 再加 N 与组合扇区均拒绝
    expect(group.add(generateGraph(SIDES_NORTH))).toBe(false)
    expect(group.add(generateGraph(SIDES_EAST_WEST))).toBe(false)
    expect(group.add(generateGraph(SIDES_NORTH_SOUTH))).toBe(false)
  })

  it('componentOrder 按加入顺序记录 (模型序)', () => {
    const g1 = generateGraph(SIDES_NORTH)
    const g2 = generateGraph(SIDES_NORTH)
    const g3 = generateGraph(SIDES_SOUTH)
    const group = new ModelOrderComponentGroup()
    expect(group.add(g1)).toBe(true)
    expect(group.add(g2)).toBe(true)
    expect(group.add(g3)).toBe(true)
    expect(group.getComponentOrder()).toEqual([g1, g2, g3])
  })
})

describe('分量压缩 (ComponentsCompactor, ELK Java 移植)', () => {
  it('压缩后分量无重叠且保持间距', () => {
    // 初始相互重叠 10 → 压缩应拉开到 20 间距
    const a = makeComponent(50, 40, 0, 0)
    const b = makeComponent(50, 40, 40, 0)
    const c = makeComponent(50, 40, 80, 0)
    const compactor = new ComponentsCompactor()
    compactor.compact([a, b, c], { x: 0, y: 0 }, 20)
    // compact 已按每分量 offset 平移节点
    const xs = [a, b, c].map(g => g.getLayerlessNodes()[0]!.position.x)
    xs.sort((p, q) => p - q)
    expect(xs[1]! - (xs[0]! + 50)).toBeGreaterThanOrEqual(20 - 1e-6)
    expect(xs[2]! - (xs[1]! + 50)).toBeGreaterThanOrEqual(20 - 1e-6)
    // 压缩后图尺寸等于节点包围盒 (无外部边时)
    const gs = compactor.getGraphSize()
    expect(gs.x).toBeCloseTo(xs[2]! + 50 - xs[0]!, 6)
    expect(gs.y).toBeCloseTo(40, 6)
  })
})

describe('模型序行放置 (ModelOrderRowGraphPlacer, ELK Java 移植)', () => {
  it('行内顺序与模型序一致, WEST 换行', () => {
    const g1 = makeComponent(60, 30, 0, 0)
    g1.setProperty(EXT_PORT_CONNECTIONS, new Set())
    const g2 = makeComponent(60, 30, 0, 0)
    g2.setProperty(EXT_PORT_CONNECTIONS, new Set([PortSide.NORTH]))
    const g3 = makeComponent(60, 30, 0, 0)
    g3.setProperty(EXT_PORT_CONNECTIONS, new Set([PortSide.WEST]))
    const target = new LGraph()
    const placer = new ModelOrderRowGraphPlacer()
    placer.combine([g1, g2, g3], target)

    const [n1, n2, n3] = [g1, g2, g3].map(g => g.getLayerlessNodes()[0]!)
    // 模型序保持: g1 → g2 行内 x 递增
    expect(n2.position.x).toBeGreaterThan(n1.position.x)
    // WEST 分量换行
    expect(n3.position.y).toBeGreaterThan(n2.position.y)
    // target 尺寸被设置
    expect(target.getSize().x).toBeGreaterThan(0)
    expect(target.getSize().y).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════════
// T5-D 变异批次补测 (components): 构造器/重复侧/父类约束路径/拆分装配/
// 行放置顺序/压缩不重叠/转换器/压缩器直测 — 与 ELK Java 语义逐条对齐.
// ═══════════════════════════════════════════════════════════════════
import { ComponentsProcessor, computeComponentSize } from '../../src/components/components-processor.js'
import { ComponentsToCGraphTransformer, isHorizontalDirection, oppositeDirection,
  type IComponent, type IConnectedComponents, type IExternalExtension } from '../../src/components/components-to-cgraph-transformer.js'
import { OneDimensionalComponentsCompaction } from '../../src/components/oned-components-compaction.js'
import { AbstractGraphPlacer } from '../../src/components/abstract-graph-placer.js'
import { Direction, PortConstraints } from '../../src/graph/enums.js'
import type { LEdge as LEdgeT } from '../../src/graph/ledge.js'
import { LEdge } from '../../src/graph/ledge.js'
import { LPort } from '../../src/graph/lport.js'
import {
  ASPECT_RATIO, CONSIDER_MODEL_ORDER_COMPONENTS,
  HIERARCHY_HANDLING, JUNCTION_POINTS, PORT_CONSTRAINTS, SEPARATE_CONNECTED_COMPONENTS,
  SPACING_COMPONENT_COMPONENT,
} from '../../src/options/layered-options.js'
import { COMPACTION_CONNECTED_COMPONENTS } from '../../src/components/components-compactor.js'
import { GRAPH_PROPERTIES, GraphProperties, MODEL_ORDER } from '../../src/options/internal-properties.js'
import { ComponentOrderingStrategy } from '../../src/components/component-ordering-strategy.js'
import type { ElkRectangle } from '../../src/compaction/recthull/rectilinear-convex-hull.js'

function rect(x: number, y: number, width: number, height: number): ElkRectangle {
  return { x, y, width, height }
}

// ── 直测桩: IComponent / IConnectedComponents / IExternalExtension ──
class FakeExternalExtension implements IExternalExtension {
  constructor(
    private readonly representor: ElkRectangle,
    private readonly direction: Direction,
    private readonly placeholder: ElkRectangle | null = null,
    private readonly representative: Set<LEdgeT> = new Set(),
  ) {}
  getRepresentative(): Set<LEdgeT> { return this.representative }
  getRepresentor(): ElkRectangle { return this.representor }
  getPlaceholder(): ElkRectangle | null { return this.placeholder }
  getDirection(): Direction { return this.direction }
}

class FakeComponent implements IComponent {
  constructor(
    private readonly hull: ElkRectangle[],
    private readonly exts: IExternalExtension[] = [],
    private readonly sides: Set<PortSide> = new Set(),
  ) {}
  getHull(): ElkRectangle[] { return this.hull }
  getExternalExtensions(): IExternalExtension[] { return this.exts }
  getExternalExtensionSides(): Set<PortSide> { return this.sides }
}

class FakeConnectedComponents implements IConnectedComponents {
  constructor(
    private readonly comps: IComponent[],
    private readonly hasExt = false,
  ) {}
  getComponents(): IComponent[] { return this.comps }
  isContainsExternalExtensions(): boolean { return this.hasExt }
}

describe('ComponentGroup 补测 (构造器/同侧保留)', () => {
  it('构造器带分量: 立即加入该分量', () => {
    const g = generateGraph(SIDES_NORTH)
    const group = new ComponentGroup(g)
    expect(group.getComponents()).toContain(g)
    expect(group.getComponentsFor(SIDES_NORTH)).toEqual([g])
  })

  it('同扇区多次 add 保留全部组件 (不覆盖, ELK add 语义)', () => {
    const group = new ComponentGroup()
    const g1 = generateGraph(SIDES_NORTH)
    const g2 = generateGraph(SIDES_NORTH)
    expect(group.add(g1)).toBe(true)
    expect(group.add(g2)).toBe(true)
    expect(group.getComponentsFor(SIDES_NORTH)).toEqual([g1, g2])
    expect(group.getComponents()).toHaveLength(2)
    // 不同扇区也各自累积
    const g3 = generateGraph(SIDES_SOUTH)
    expect(group.add(g3)).toBe(true)
    expect(group.getComponentsFor(SIDES_SOUTH)).toEqual([g3])
    expect(group.getComponents()).toHaveLength(3)
  })
})

describe('ModelOrderComponentGroup 补测 (构造器/失败序/父类约束路径)', () => {
  it('构造器带分量: 组件与模型序均记录 (Java 语义: 构造器 add + 显式 List.add 重复记录)', () => {
    const g = generateGraph(SIDES_NORTH)
    const group = new ModelOrderComponentGroup(g)
    expect(group.getComponents()).toContain(g)
    // javap ModelOrderComponentGroup(LGraph): 构造器先 add(component) (override add 记一次),
    // 再 getComponentOrder().add(component) 记第二次 → [g, g]
    expect(group.getComponentOrder()).toEqual([g, g])
  })

  it('add 失败的分量不入模型序 (ELK add 返回 false 不记录)', () => {
    const group = new ModelOrderComponentGroup()
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)
    const bad = generateGraph(SIDES_NORTH)
    expect(group.add(bad)).toBe(false)
    expect(group.getComponentOrder()).not.toContain(bad)
    expect(group.getComponentOrder()).toHaveLength(1)
  })

  it('父类扇区约束独立拒绝 (非模型序约束路径)', () => {
    const group = new ModelOrderComponentGroup()
    expect(group.add(generateGraph(SIDES_NONE))).toBe(true)
    // NONE 的父类约束含 NORTH_EAST_SOUTH_WEST; 模型序表里 NESW 只与 NW/NE 冲突
    // → 该拒绝只能来自父类 ComponentGroup.canAdd.
    expect(group.add(generateGraph(SIDES_NORTH_EAST_SOUTH_WEST))).toBe(false)
    expect(group.getComponents()).toHaveLength(1)
  })
})

// ── ComponentsProcessor: 拆分 (连通性/开关/端口约束/层级/模型序) ──
function nodeGraph(nodes: { w: number, h: number, x?: number, y?: number }[]): LGraph {
  const g = new LGraph()
  for (const n of nodes) {
    const node = new LNode(g)
    node.size = { x: n.w, y: n.h }
    node.position = { x: n.x ?? 0, y: n.y ?? 0 }
    g.getSize().x = Math.max(g.getSize().x, node.position.x + node.size.x)
    g.getSize().y = Math.max(g.getSize().y, node.position.y + node.size.y)
  }
  return g
}

function connect(a: LNode, b: LNode): void {
  const pa = new LPort(); pa.setNode(a)
  const pb = new LPort(); pb.setNode(b)
  const e = new LEdge(); e.setSource(pa); e.setTarget(pb)
}

describe('ComponentsProcessor.split (ELK Java 移植)', () => {
  const processor = new ComponentsProcessor()

  it('不连通节点 → 多分量, 节点移入新图且属性/内边距复制', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }, { w: 10, h: 10 }])
    g.setPadding({ left: 5, top: 6, right: 7, bottom: 8 })
    const comps = processor.split(g)
    expect(comps.length).toBe(3)
    for (const [i, c] of comps.entries()) {
      expect(c.getLayerlessNodes()).toHaveLength(1)
      expect(c.getLayerlessNodes()[0]!.getGraph()).toBe(c)
      expect(c.getPadding().left).toBe(5)
      expect(c.getPadding().top).toBe(6)
      expect(c.getPadding().right).toBe(7)
      expect(c.getPadding().bottom).toBe(8)
    }
  })

  it('连通节点 → 单分量', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    const [a, b] = g.getLayerlessNodes()
    connect(a!, b!)
    const comps = processor.split(g)
    expect(comps.length).toBe(1)
    expect(comps[0]!.getLayerlessNodes()).toHaveLength(2)
  })

  it('SEPARATE_CONNECTED_COMPONENTS=false → 不拆分 (原图)', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    g.setProperty(SEPARATE_CONNECTED_COMPONENTS, false)
    expect(processor.split(g)).toEqual([g])
    expect(g.getLayerlessNodes()).toHaveLength(2)
  })

  it('外部端口 + FIXED_ORDER 端口约束 → 不拆分', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    g.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FIXED_ORDER)
    expect(processor.split(g)).toEqual([g])
  })

  it('外部端口 + 非 FIXED_ORDER → 仍拆分', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    g.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)
    g.setProperty(PORT_CONSTRAINTS, PortConstraints.FREE)
    expect(processor.split(g).length).toBe(2)
  })

  it('INCLUDE_CHILDREN + 父节点 → 不拆分', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    const parent = new LNode(null)
    g.setParentNode(parent)
    g.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    expect(processor.split(g)).toEqual([g])
  })

  it('INCLUDE_CHILDREN + 嵌套图 → 不拆分', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    g.getLayerlessNodes()[0]!.setNestedGraph(new LGraph())
    g.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    expect(processor.split(g)).toEqual([g])
  })

  it('INCLUDE_CHILDREN + 无嵌套 (扁平图) → 不拆分', () => {
    // ELK Java 在 INCLUDE 时由 provider 分派 doCompoundLayout (hierarchicalLayout), 从不调 split
    // (ElkLayered.java "Connected components processing is currently not supported") — 与图是否
    // 扁平无关. jar 实证 (LayoutJsonMain, 扁平 INCLUDE 双分量): 整图布局 a1=(62,72)/b1=(12,112)
    // vs split+combine a1=(12,12) 差 50. ggn 分派按 parentNodes, 扁平 INCLUDE 根会走到本方法,
    // split 必须顶住 Java 语义返回整图.
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    g.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
    expect(processor.split(g)).toEqual([g])
  })

  it('HIERARCHY_HANDLING 未设置但节点含嵌套图: 仍按连通性拆分 (不触发 INCLUDE_CHILDREN)', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    g.getLayerlessNodes()[0]!.setNestedGraph(new LGraph())
    expect(processor.split(g).length).toBe(2)
  })

  it('模型序分量排序: 最小节点 model order 升序', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }, { w: 10, h: 10 }])
    const [n1, n2, n3] = g.getLayerlessNodes()
    n1!.setProperty(MODEL_ORDER, 3)
    n2!.setProperty(MODEL_ORDER, 1)
    n3!.setProperty(MODEL_ORDER, 2)
    g.setProperty(CONSIDER_MODEL_ORDER_COMPONENTS, ComponentOrderingStrategy.MODEL_ORDER)
    const comps = processor.split(g)
    expect(comps.length).toBe(3)
    expect(comps.map(c => c.getLayerlessNodes()[0]!.getProperty(MODEL_ORDER))).toEqual([1, 2, 3])
  })

  it('模型序 NONE 时按原序 (不排序)', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    const [n1, n2] = g.getLayerlessNodes()
    n1!.setProperty(MODEL_ORDER, 2)
    n2!.setProperty(MODEL_ORDER, 1)
    const comps = processor.split(g)
    expect(comps.map(c => c.getLayerlessNodes()[0]!.getProperty(MODEL_ORDER))).toEqual([2, 1])
  })

  it('空图 → 单分量 (原图)', () => {
    const g = new LGraph()
    expect(processor.split(g)).toEqual([g])
  })

  it('无 MODEL_ORDER 节点按 MAX_SAFE_INTEGER 排最后 (minimalModelOrder)', () => {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 40, h: 30 }])
    const [n1, n2] = g.getLayerlessNodes()
    n1!.setProperty(MODEL_ORDER, 5)
    // n2 无 MODEL_ORDER → minimalModelOrder = MAX_SAFE_INTEGER
    g.setProperty(CONSIDER_MODEL_ORDER_COMPONENTS, ComponentOrderingStrategy.MODEL_ORDER)
    const comps = processor.split(g)
    expect(comps.length).toBe(2)
    expect(comps[0]!.getLayerlessNodes()[0]!.getProperty(MODEL_ORDER)).toBe(5)
    expect(comps[1]!.getLayerlessNodes()[0]!.hasProperty(MODEL_ORDER)).toBe(false)
  })
})

describe('ComponentsProcessor.combine (ELK Java 移植)', () => {
  const processor = new ComponentsProcessor()

  it('单分量: 叠加自身 offset 平移并移入目标', () => {
    const g = nodeGraph([{ w: 60, h: 30, x: 10, y: 10 }])
    g.getOffset().x = 5
    g.getOffset().y = 7
    const target = new LGraph()
    processor.combine([g], target)
    const n = target.getLayerlessNodes()[0]!
    expect(target.getLayerlessNodes()).toHaveLength(1)
    expect(n.position.x).toBe(15)
    expect(n.position.y).toBe(17)
    expect(n.getGraph()).toBe(target)
    // 单分量特殊路径不重排行: 目标尺寸保持 (0,0)
    expect(target.getSize().x).toBe(0)
    expect(target.getSize().y).toBe(0)
  })

  it('多分量: 面积升序排行 + 行间距 + 目标尺寸', () => {
    // 面积: B=400 < C=900 < A=1800 → 排序 [B, C, A]
    const a = nodeGraph([{ w: 60, h: 30 }])
    const b = nodeGraph([{ w: 20, h: 20 }])
    const c = nodeGraph([{ w: 30, h: 30 }])
    const target = new LGraph()
    target.setProperty(ASPECT_RATIO, 20) // 行宽足够 → 不换行
    processor.combine([a, b, c], target)

    const pos = new Map<LGraph, { x: number, y: number }>()
    for (const g of [a, b, c]) pos.set(g, g.getLayerlessNodes()[0]!.position)
    // 排序后 B(0) → C(40) → A(90)
    expect(pos.get(b)!.x).toBe(0)
    expect(pos.get(c)!.x).toBe(40)
    expect(pos.get(a)!.x).toBe(90)
    expect(pos.get(b)!.y).toBe(0)
    expect(pos.get(c)!.y).toBe(0)
    expect(pos.get(a)!.y).toBe(0)
    // 行宽 = max(60, sqrt(3100)*20≈1113); 目标宽 = broadestRow = max(20, 0+20, 40+30, 90+60) = 150
    expect(target.getSize().x).toBeCloseTo(150, 6)
    expect(target.getSize().y).toBeCloseTo(30, 6)
    // 节点已全部移入 target
    expect(target.getLayerlessNodes()).toHaveLength(3)
  })

  it('多分量超宽换行: 行间间距 = 分量高 + componentSpacing', () => {
    const a = nodeGraph([{ w: 100, h: 30 }])
    const b = nodeGraph([{ w: 100, h: 30 }])
    const target = new LGraph()
    target.setProperty(ASPECT_RATIO, 0.1) // 行宽 = max(100, sqrt(6000)*0.1≈7.7) = 100
    processor.combine([a, b], target)
    const [n1, n2] = [a, b].map(g => g.getLayerlessNodes()[0]!)
    expect(n1.position.x).toBe(0)
    expect(n1.position.y).toBe(0)
    expect(n2.position.x).toBe(0)
    expect(n2.position.y).toBe(50) // 30 + 20 间距
    expect(target.getSize().y).toBeCloseTo(80, 6)
  })

  it('外部端口 + MODEL_ORDER → 委托 ModelOrderRowGraphPlacer (WEST 换行)', () => {
    const g1 = nodeGraph([{ w: 60, h: 30 }])
    const g2 = nodeGraph([{ w: 60, h: 30 }])
    g2.setProperty(EXT_PORT_CONNECTIONS, new Set([PortSide.WEST]))
    const target = new LGraph()
    target.getProperty(GRAPH_PROPERTIES).add(GraphProperties.EXTERNAL_PORTS)
    target.setProperty(CONSIDER_MODEL_ORDER_COMPONENTS, ComponentOrderingStrategy.MODEL_ORDER)
    target.setProperty(ASPECT_RATIO, 20) // 行宽足够大: 非委托路径不换行 → 委托路径 WEST 才换行
    processor.combine([g1, g2], target)
    const [n1, n2] = [g1, g2].map(g => g.getLayerlessNodes()[0]!)
    expect(n1.position.x).toBe(0)
    expect(n2.position.x).toBe(0) // WEST → 换行行首
    expect(n2.position.y).toBeGreaterThan(n1.position.y)
  })

  it('COMPACTION_CONNECTED_COMPONENTS=true: combine 压缩后分量 2D 无重叠', () => {
    // 窄行宽 → b 换行到第二行 (垂直重叠 10), 压缩应保持分量无重叠且尺寸有限
    const a = nodeGraph([{ w: 50, h: 40 }])
    const b = nodeGraph([{ w: 50, h: 40 }])
    const target = new LGraph()
    target.setProperty(SPACING_COMPONENT_COMPONENT, 20)
    target.setProperty(ASPECT_RATIO, 0.1) // maxRowWidth = max(50, sqrt(4000)*0.1≈6.3) = 50
    for (const g of [a, b]) g.setProperty(COMPACTION_CONNECTED_COMPONENTS, true)
    processor.combine([a, b], target)
    const [na, nb] = [a, b].map(g => g.getLayerlessNodes()[0]!)
    const ra = { x: na.position.x, y: na.position.y, w: 50, h: 40 }
    const rb = { x: nb.position.x, y: nb.position.y, w: 50, h: 40 }
    const overlap2d = ra.x < rb.x + rb.w && ra.x + ra.w > rb.x
      && ra.y < rb.y + rb.h && ra.y + ra.h > rb.y
    expect(overlap2d).toBe(false)
    expect(Number.isFinite(target.getSize().x)).toBe(true)
    expect(Number.isFinite(target.getSize().y)).toBe(true)
  })

  it('combine 空分量列表: 清空目标节点', () => {
    const target = new LGraph()
    const n = new LNode(target)
    n.size = { x: 30, y: 20 }
    target.getLayerlessNodes().push(n)
    target.getSize().x = 50
    processor.combine([], target)
    expect(target.getLayerlessNodes()).toHaveLength(0)
    expect(target.getSize().x).toBe(50)
  })

  it('combine 平移边弯点 (多分量内边)', () => {
    // g 面积 = 100*30 = 3000; other 面积 = 40*30 = 1200 → 面积升序: other 前, g 后
    const g = nodeGraph([{ w: 40, h: 30 }, { w: 40, h: 30, x: 60 }])
    const [n1, n2] = g.getLayerlessNodes()
    const p1 = new LPort(); p1.setNode(n1!)
    const p2 = new LPort(); p2.setNode(n2!)
    const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
    e.getBendPoints().push({ x: 50, y: 15 })
    const other = nodeGraph([{ w: 40, h: 30 }])
    const target = new LGraph()
    target.setProperty(ASPECT_RATIO, 20) // 行宽足够 → 不换行
    processor.combine([g, other], target)
    const otherNode = other.getLayerlessNodes()[0]!
    const gNode = g.getLayerlessNodes()[0]!
    // 面积升序: other 行首 (0,0), g 紧随 (60,0)
    expect(otherNode.position.x).toBe(0)
    expect(otherNode.position.y).toBe(0)
    expect(gNode.position.x).toBe(40 + 20)
    expect(gNode.position.y).toBe(0)
    // 弯点与节点同步平移 (分量整体 +60): 50 → 110
    expect(e.getBendPoints()[0]!.x).toBe(110)
    expect(e.getBendPoints()[0]!.y).toBe(15)
    // 目标宽 = broadestRow = max(20, 40, 60+100) = 160
    expect(target.getSize().x).toBeCloseTo(160, 6)
    expect(target.getSize().y).toBeCloseTo(30, 6)
  })
})

describe('computeComponentSize (ELK Java 移植)', () => {
  it('含端口外扩: 端口超出节点边界时计入分量尺寸', () => {
    const g = new LGraph()
    const n = new LNode(g)
    n.position = { x: 10, y: 10 }
    n.size = { x: 50, y: 30 }
    const p = new LPort(); p.setNode(n)
    p.position = { x: 60, y: 10 }
    p.size = { x: 4, y: 4 }
    computeComponentSize(g)
    // 节点右边界 60, 端口右边界 10+60+4=74 → 分量宽 = 74-10 = 64
    expect(g.getSize().x).toBeCloseTo(64, 6)
    expect(g.getSize().y).toBeCloseTo(30, 6)
  })

  it('只增不减: 已有尺寸大于内容包围盒时保持不变', () => {
    const g = new LGraph()
    const n = new LNode(g)
    n.position = { x: 10, y: 10 }
    n.size = { x: 50, y: 30 }
    g.getSize().x = 200
    g.getSize().y = 100
    computeComponentSize(g)
    expect(g.getSize().x).toBe(200)
    expect(g.getSize().y).toBe(100)
  })

  it('空图保持尺寸', () => {
    const g = new LGraph()
    computeComponentSize(g)
    expect(g.getSize().x).toBe(0)
    expect(g.getSize().y).toBe(0)
  })

  it('节点边距计入分量尺寸 (ELK addLGraphElementBounds 语义)', () => {
    const g = new LGraph()
    const n = new LNode(g)
    n.position = { x: 10, y: 10 }
    n.size = { x: 50, y: 30 }
    n.getMargin().left = 5
    n.getMargin().top = 3
    n.getMargin().right = 7
    n.getMargin().bottom = 4
    computeComponentSize(g)
    // bbox: x 从 10-5=5 到 10+50+7=67 → 宽 62; y 从 10-3=7 到 10+30+4=44 → 高 37
    expect(g.getSize().x).toBeCloseTo(62, 6)
    expect(g.getSize().y).toBeCloseTo(37, 6)
  })

  it('端口超出节点下边界计入分量尺寸 (y 方向)', () => {
    const g = new LGraph()
    const n = new LNode(g)
    n.position = { x: 10, y: 10 }
    n.size = { x: 50, y: 30 }
    const p = new LPort(); p.setNode(n)
    p.position = { x: 20, y: 40 }
    p.size = { x: 4, y: 4 }
    computeComponentSize(g)
    // 端口下边界 10+40+4=54 > 节点下边界 40 → 高 = 54-10 = 44
    expect(g.getSize().y).toBeCloseTo(44, 6)
    expect(g.getSize().x).toBeCloseTo(50, 6)
  })
})

// ── AbstractGraphPlacer: moveGraph / offsetGraph 平移语义 ──
class ExposedPlacer extends AbstractGraphPlacer {
  combine(): void { /* 直测用: 只暴露 protected 平移方法 */ }
  exposeMoveGraph(dest: LGraph, src: LGraph, x: number, y: number): void { this.moveGraph(dest, src, x, y) }
  exposeMoveGraphs(dest: LGraph, srcs: LGraph[], x: number, y: number): void { this.moveGraphs(dest, srcs, x, y) }
  exposeOffsetGraph(g: LGraph, x: number, y: number): void { this.offsetGraph(g, x, y) }
  exposeOffsetGraphs(gs: LGraph[], x: number, y: number): void { this.offsetGraphs(gs, x, y) }
}

describe('AbstractGraphPlacer 平移语义 (ELK Java 移植)', () => {
  const placer = new ExposedPlacer()

  function edgeGraph(): { g: LGraph, n1: LNode, n2: LNode, e: LEdge } {
    const g = nodeGraph([{ w: 30, h: 20 }, { w: 30, h: 20, x: 40 }])
    const [n1, n2] = g.getLayerlessNodes()
    const p1 = new LPort(); p1.setNode(n1!)
    const p2 = new LPort(); p2.setNode(n2!)
    const e = new LEdge(); e.setSource(p1); e.setTarget(p2)
    e.getBendPoints().push({ x: 50, y: 10 })
    e.setProperty(JUNCTION_POINTS, [{ x: 55, y: 10 }])
    e.getLabels().push({ text: 'L', position: { x: 50, y: 5 }, size: { x: 10, y: 8 } })
    return { g, n1: n1!, n2: n2!, e }
  }

  it('moveGraph: 节点/弯点/交汇点/边标签同步平移并叠加图 offset', () => {
    const { g, n1, n2, e } = edgeGraph()
    g.getOffset().x = 3
    g.getOffset().y = 4
    const dest = new LGraph()
    placer.exposeMoveGraph(dest, g, 10, 20)
    expect(n1.position.x).toBe(13)
    expect(n1.position.y).toBe(24)
    expect(n2.position.x).toBe(40 + 13)
    expect(n2.position.y).toBe(24)
    expect(e.getBendPoints()[0]!.x).toBe(63)
    expect(e.getBendPoints()[0]!.y).toBe(34)
    expect((e.getProperty(JUNCTION_POINTS) as { x: number, y: number }[])[0]!).toEqual({ x: 68, y: 34 })
    expect(e.getLabels()[0]!.position).toEqual({ x: 63, y: 29 })
    expect(dest.getLayerlessNodes()).toContain(n1)
    expect(n1.getGraph()).toBe(dest)
  })

  it('moveGraph: 边只平移一次 (两个端口访问同一边)', () => {
    const { g, n1, e } = edgeGraph()
    const dest = new LGraph()
    placer.exposeMoveGraph(dest, g, 1, 1)
    expect(e.getBendPoints()[0]!.x).toBe(51)
    expect(e.getBendPoints()[0]!.y).toBe(11)
  })

  it('offsetGraph: 只平移, 不叠加图 offset, 不移入目标图', () => {
    const { g, n1, n2, e } = edgeGraph()
    g.getOffset().x = 100
    g.getOffset().y = 100
    placer.exposeOffsetGraph(g, 10, 20)
    expect(n1.position.x).toBe(10)
    expect(n1.position.y).toBe(20)
    expect(n2.position.x).toBe(50)
    expect(n2.position.y).toBe(20)
    expect(e.getBendPoints()[0]!.x).toBe(60)
    expect(e.getBendPoints()[0]!.y).toBe(30)
    // 交汇点与边标签同样平移 (不叠加图 offset)
    expect((e.getProperty(JUNCTION_POINTS) as { x: number, y: number }[])[0]!).toEqual({ x: 65, y: 30 })
    expect(e.getLabels()[0]!.position).toEqual({ x: 60, y: 25 })
    expect(g.getLayerlessNodes()).toContain(n1)
  })

  it('offsetGraphs: 批量平移', () => {
    const a = nodeGraph([{ w: 10, h: 10 }])
    const b = nodeGraph([{ w: 10, h: 10 }])
    placer.exposeOffsetGraphs([a, b], 5, 6)
    expect(a.getLayerlessNodes()[0]!.position).toEqual({ x: 5, y: 6 })
    expect(b.getLayerlessNodes()[0]!.position).toEqual({ x: 5, y: 6 })
  })

  it('moveGraphs: 批量移入目标', () => {
    const a = nodeGraph([{ w: 10, h: 10 }])
    const b = nodeGraph([{ w: 10, h: 10 }])
    const dest = new LGraph()
    placer.exposeMoveGraphs(dest, [a, b], 2, 3)
    expect(dest.getLayerlessNodes()).toHaveLength(2)
    expect(dest.getLayerlessNodes()[0]!.position).toEqual({ x: 2, y: 3 })
    expect(dest.getLayerlessNodes()[1]!.position).toEqual({ x: 2, y: 3 })
  })
})

// ── ComponentsToCGraphTransformer 直测 ──
describe('ComponentsToCGraphTransformer (ELK Java 移植)', () => {
  it('transform: 分量凸包 → CGroup/CNode, NONE 全锁', () => {
    const comp = new FakeComponent([rect(10, 10, 50, 40)])
    const t = new ComponentsToCGraphTransformer(20)
    const cg = t.transform(new FakeConnectedComponents([comp]))
    expect(cg.cGroups).toHaveLength(1)
    expect(cg.cNodes).toHaveLength(1)
    const node = cg.cNodes[0]!
    expect(node.hitbox).toEqual({ x: 10, y: 10, width: 50, height: 40 })
    expect(cg.cGroups[0]!.cNodes.has(node)).toBe(true)
    expect([node.lock.left, node.lock.right, node.lock.up, node.lock.down]).toEqual([true, true, true, true])
  })

  it('transform: 外部扩展 + placeholder 注册, WEST 锁解左', () => {
    const ext = new FakeExternalExtension(rect(0, 12, 10, 36), Direction.LEFT, rect(0, 12, 5, 36))
    const comp = new FakeComponent([rect(10, 10, 50, 40)], [ext], new Set([PortSide.WEST]))
    const t = new ComponentsToCGraphTransformer(20)
    const cg = t.transform(new FakeConnectedComponents([comp], true))
    expect(t.getExternalExtensions().size).toBe(1)
    const ph = t.getExternalPlaceholder().get(Direction.LEFT)!
    expect(ph).toHaveLength(1)
    expect(ph[0]!.second.hitbox).toEqual({ x: 0, y: 12, width: 5, height: 36 })
    // WEST 端口: 左锁 true (不可左移), 右向 free (ELK setLock WEST → [true,false,true,true])
    expect(cg.cNodes[0]!.lock.left).toBe(true)
    expect(cg.cNodes[0]!.lock.right).toBe(false)
  })

  it('锁表: 各端口侧组合对应 4 向锁', () => {
    const cases: [Set<PortSide>, [boolean, boolean, boolean, boolean]][] = [
      [SIDES_NORTH, [true, true, true, false]],
      [SIDES_EAST, [false, true, true, true]],
      [SIDES_SOUTH, [true, true, false, true]],
      [SIDES_WEST, [true, false, true, true]],
      [SIDES_NORTH_EAST, [false, true, true, false]],
      [SIDES_EAST_SOUTH, [false, true, false, true]],
      [SIDES_SOUTH_WEST, [true, false, false, true]],
      [SIDES_NORTH_WEST, [true, false, true, false]],
      [SIDES_NORTH_SOUTH, [true, true, true, true]],
      [SIDES_EAST_WEST, [true, true, true, true]],
      [SIDES_EAST_SOUTH_WEST, [true, true, true, true]],
      [SIDES_NORTH_SOUTH_WEST, [true, true, true, true]],
      [SIDES_NORTH_EAST_WEST, [true, true, true, true]],
      [SIDES_NORTH_EAST_SOUTH_WEST, [true, true, true, true]],
    ]
    for (const [sides, expected] of cases) {
      const comp = new FakeComponent([rect(0, 0, 10, 10)], [], sides)
      const t = new ComponentsToCGraphTransformer(20)
      const cg = t.transform(new FakeConnectedComponents([comp]))
      const node = cg.cNodes[0]!
      expect([node.lock.left, node.lock.right, node.lock.up, node.lock.down]).toEqual(expected)
    }
  })

  it('applyLayout: 全局偏移使左上为 (0,0), 图尺寸 = 包围盒', () => {
    const comp = new FakeComponent([rect(10, 10, 50, 40)])
    const t = new ComponentsToCGraphTransformer(20)
    t.transform(new FakeConnectedComponents([comp]))
    t.applyLayout()
    expect(t.getGlobalOffset()).toEqual({ x: -10, y: -10 })
    expect(t.getGraphSize()).toEqual({ x: 50, y: 40 })
  })

  it('getOffset: 相对压缩前位置', () => {
    const r = rect(10, 10, 50, 40)
    const comp = new FakeComponent([r])
    const t = new ComponentsToCGraphTransformer(20)
    t.transform(new FakeConnectedComponents([comp]))
    expect(t.getOffset(comp)).toEqual({ x: 0, y: 0 })
    t.applyLayout()
    expect(t.getOffset(comp)).toEqual({ x: 0, y: 0 })
  })

  it('isHorizontalDirection / oppositeDirection', () => {
    expect(isHorizontalDirection(Direction.LEFT)).toBe(true)
    expect(isHorizontalDirection(Direction.RIGHT)).toBe(true)
    expect(isHorizontalDirection(Direction.UP)).toBe(false)
    expect(isHorizontalDirection(Direction.DOWN)).toBe(false)
    expect(oppositeDirection(Direction.LEFT)).toBe(Direction.RIGHT)
    expect(oppositeDirection(Direction.RIGHT)).toBe(Direction.LEFT)
    expect(oppositeDirection(Direction.UP)).toBe(Direction.DOWN)
    expect(oppositeDirection(Direction.DOWN)).toBe(Direction.UP)
    expect(oppositeDirection(Direction.UNDEFINED)).toBe(Direction.UNDEFINED)
  })
})

// ── OneDimensionalComponentsCompaction 直测 ──
describe('OneDimensionalComponentsCompaction (ELK Java 移植)', () => {
  it('水平重叠分量压缩后无重叠且间距保持', () => {
    const r1 = rect(0, 0, 40, 40)
    const r2 = rect(30, 0, 40, 40) // 与 r1 重叠 10
    const c1 = new FakeComponent([r1])
    const c2 = new FakeComponent([r2])
    const orig1 = { x: r1.x, y: r1.y }
    const orig2 = { x: r2.x, y: r2.y }
    const compaction = OneDimensionalComponentsCompaction.init(new FakeConnectedComponents([c1, c2]), 20)
    compaction.compact()
    const gs = compaction.getGraphSize()
    expect(Number.isFinite(gs.x)).toBe(true)
    expect(Number.isFinite(gs.y)).toBe(true)
    // getOffset 语义 = 压缩后位置 - 压缩前位置 (Java getOffset), 需施加到原始位置
    const o1 = compaction.getOffset(c1)
    const o2 = compaction.getOffset(c2)
    const p1 = orig1.x + o1.x
    const p2 = orig2.x + o2.x
    expect(Math.abs(p2 - (p1 + 40))).toBeGreaterThanOrEqual(20 - 1e-6)
    // 右分量被推向右: offset.x 为正 (Java getOffset = post - pre + global)
    expect(o1.x).toBeCloseTo(0, 6)
    expect(o2.x).toBeCloseTo(30, 6)
  })

  it('垂直重叠分量压缩后无重叠且间距保持', () => {
    const r1 = rect(0, 0, 40, 40)
    const r2 = rect(0, 30, 40, 40) // 与 r1 垂直重叠 10
    const c1 = new FakeComponent([r1])
    const c2 = new FakeComponent([r2])
    const orig1 = { x: r1.x, y: r1.y }
    const orig2 = { x: r2.x, y: r2.y }
    const compaction = OneDimensionalComponentsCompaction.init(new FakeConnectedComponents([c1, c2]), 20)
    compaction.compact()
    const gs = compaction.getGraphSize()
    expect(Number.isFinite(gs.x)).toBe(true)
    expect(Number.isFinite(gs.y)).toBe(true)
    const o1 = compaction.getOffset(c1)
    const o2 = compaction.getOffset(c2)
    const p1 = orig1.y + o1.y
    const p2 = orig2.y + o2.y
    expect(Math.abs(p2 - (p1 + 40))).toBeGreaterThanOrEqual(20 - 1e-6)
    // 下分量被推向下: offset.y 为正
    expect(o1.y).toBeCloseTo(0, 6)
    expect(o2.y).toBeCloseTo(30, 6)
  })

  it('间距已满足时压缩不劣化', () => {
    const r1 = rect(0, 0, 40, 40)
    const r2 = rect(100, 0, 40, 40) // 间距 60 ≥ 20 → 压缩拉到 20 不重叠
    const c1 = new FakeComponent([r1])
    const c2 = new FakeComponent([r2])
    const orig1 = { x: r1.x, y: r1.y }
    const orig2 = { x: r2.x, y: r2.y }
    const compaction = OneDimensionalComponentsCompaction.init(new FakeConnectedComponents([c1, c2]), 20)
    compaction.compact()
    const o1 = compaction.getOffset(c1)
    const o2 = compaction.getOffset(c2)
    const p1 = orig1.x + o1.x
    const p2 = orig2.x + o2.x
    expect(p2 - (p1 + 40)).toBeGreaterThanOrEqual(20 - 1e-6)
  })
})

describe('OneDimensionalComponentsCompaction 全局偏移 (getOffset)', () => {
  it('单分量远离原点: getOffset 叠加全局偏移 (post - pre + global)', () => {
    const r1 = rect(100, 100, 40, 40)
    const c1 = new FakeComponent([r1])
    const compaction = OneDimensionalComponentsCompaction.init(new FakeConnectedComponents([c1]), 20)
    compaction.compact()
    // 分量未移动 (无重叠): individual = 0, global = -topLeft = (-100,-100)
    const o = compaction.getOffset(c1)
    expect(o.x).toBeCloseTo(-100, 6)
    expect(o.y).toBeCloseTo(-100, 6)
  })

  it('无重叠多分量: 保持原位置不劣化 (offset 反映全局平移)', () => {
    const r1 = rect(50, 50, 40, 40)
    const r2 = rect(120, 50, 40, 40)  // 间距 30 ≥ 20, 不重叠
    const c1 = new FakeComponent([r1])
    const c2 = new FakeComponent([r2])
    const orig1 = { x: r1.x, y: r1.y }
    const orig2 = { x: r2.x, y: r2.y }
    const compaction = OneDimensionalComponentsCompaction.init(new FakeConnectedComponents([c1, c2]), 20)
    compaction.compact()
    const o1 = compaction.getOffset(c1)
    const o2 = compaction.getOffset(c2)
    // global = -topLeft = (-50,-50); r2 前移 10 (post 110 - pre 120) → o2.x = -10 + (-50) = -60
    expect(o1.x).toBeCloseTo(-50, 6)
    expect(o2.x).toBeCloseTo(-60, 6)
    const p1 = orig1.x + o1.x
    const p2 = orig2.x + o2.x
    expect(p2 - (p1 + 40)).toBeGreaterThanOrEqual(20 - 1e-6)
  })
})
