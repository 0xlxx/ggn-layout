/**
 * Spacings (对应 ELK core.util.Spacings) — 垂直/水平间距属性表 + individual 覆盖.
 *
 * 对齐 org.eclipse.elk.alg.layered.options.Spacings (ELK 0.12.0):
 *  - 构造时根据 NodeType 对预计算"属性引用"表 (vertical 用 BETWEEN_LAYERS 变体).
 *  - getVerticalSpacing(n1, n2) / getHorizontalSpacing(n1, n2):
 *      查表得到 layoutOption → 对两节点分别 getIndividualOrDefault → Math.max.
 *  - getVerticalSpacingByType(t1, t2) / getHorizontalSpacingByType(t1, t2):
 *      直接用 graph 的默认属性值 (无 individual, 对应 Java getLocalSpacing(NodeType, NodeType)).
 */
import type { LNode } from '../graph/lnode.js'
import { NodeType } from '../graph/enums.js'
import type { LGraph } from '../graph/lgraph.js'
import type { Property, IPropertyHolder } from '../graph/properties.js'
import {
  SPACING_NODE_NODE,
  SPACING_NODE_NODE_BETWEEN_LAYERS,
  SPACING_EDGE_EDGE,
  SPACING_EDGE_EDGE_BETWEEN_LAYERS,
  SPACING_EDGE_NODE,
  SPACING_EDGE_NODE_BETWEEN_LAYERS,
  SPACING_PORT_PORT,
  SPACING_LABEL_NODE,
  SPACING_LABEL_PORT_VERTICAL,
  SPACING_LABEL_PORT_HORIZONTAL,
  SPACING_INDIVIDUAL,
} from '../options/layered-options.js'

type SpacingTable = Record<NodeType, Record<NodeType, Property<number> | undefined>>

/** 所有 NodeType 值 (TS 枚举含 Java 没有的 PLACEHOLDER / NONSHIFTING_PLACEHOLDER). */
const ALL_NODE_TYPES = Object.values(NodeType) as NodeType[]

export class Spacings {
  private graph: LGraph
  private nodeTypeSpacingOptionsHorizontal: SpacingTable
  private nodeTypeSpacingOptionsVertical: SpacingTable
  /** 图默认间距缓存 (布局期间图级属性不变; 节点无 individual 覆盖时直读, 免每次 Map 查找). */
  private cachedDefaults = new Map<Property<number>, number>()

  constructor(graph: LGraph) {
    this.graph = graph
    this.nodeTypeSpacingOptionsHorizontal = this.emptyTable()
    this.nodeTypeSpacingOptionsVertical = this.emptyTable()
    this.precalculateNodeTypeSpacings()
  }

  private emptyTable(): SpacingTable {
    const table = {} as SpacingTable
    for (const t of ALL_NODE_TYPES) table[t] = {} as Record<NodeType, Property<number> | undefined>
    return table
  }

  // ---- 表构建辅助 (对应 Java 的 4 个 nodeTypeSpacing 重载) ----

  /** 对角 vertical 项 (Java: nodeTypeSpacing(nt, spacing)). */
  private diagV(nt: NodeType, v: Property<number>): void {
    this.nodeTypeSpacingOptionsVertical[nt][nt] = v
  }

  /** 对角 vertical + horizontal 项 (Java: nodeTypeSpacing(nt, spacingVert, spacingHorz)). */
  private diagVH(nt: NodeType, v: Property<number>, h: Property<number>): void {
    this.nodeTypeSpacingOptionsVertical[nt][nt] = v
    this.nodeTypeSpacingOptionsHorizontal[nt][nt] = h
  }

  /** 双向 vertical 项 (Java: nodeTypeSpacing(n1, n2, spacing)). */
  private pairV(n1: NodeType, n2: NodeType, v: Property<number>): void {
    this.nodeTypeSpacingOptionsVertical[n1][n2] = v
    this.nodeTypeSpacingOptionsVertical[n2][n1] = v
  }

  /** 双向 vertical + horizontal 项 (Java: nodeTypeSpacing(n1, n2, spacingVert, spacingHorz)). */
  private pairVH(n1: NodeType, n2: NodeType, v: Property<number>, h: Property<number>): void {
    this.nodeTypeSpacingOptionsVertical[n1][n2] = v
    this.nodeTypeSpacingOptionsVertical[n2][n1] = v
    this.nodeTypeSpacingOptionsHorizontal[n1][n2] = h
    this.nodeTypeSpacingOptionsHorizontal[n2][n1] = h
  }

  private precalculateNodeTypeSpacings(): void {
    const { NORMAL, LONG_EDGE, NORTH_SOUTH_PORT, EXTERNAL_PORT, LABEL, BREAKING_POINT } = NodeType

    // normal
    this.diagVH(NORMAL, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS)
    this.pairVH(NORMAL, LONG_EDGE, SPACING_EDGE_NODE, SPACING_EDGE_NODE_BETWEEN_LAYERS)
    this.pairV(NORMAL, NORTH_SOUTH_PORT, SPACING_EDGE_NODE)
    this.pairV(NORMAL, EXTERNAL_PORT, SPACING_EDGE_NODE)
    this.pairVH(NORMAL, LABEL, SPACING_NODE_NODE, SPACING_NODE_NODE_BETWEEN_LAYERS)

    // longedge
    this.diagVH(LONG_EDGE, SPACING_EDGE_EDGE, SPACING_EDGE_EDGE_BETWEEN_LAYERS)
    this.pairV(LONG_EDGE, NORTH_SOUTH_PORT, SPACING_EDGE_EDGE)
    this.pairV(LONG_EDGE, EXTERNAL_PORT, SPACING_EDGE_EDGE)
    this.pairVH(LONG_EDGE, LABEL, SPACING_EDGE_NODE, SPACING_EDGE_NODE_BETWEEN_LAYERS)

    // northsouth
    this.diagV(NORTH_SOUTH_PORT, SPACING_EDGE_EDGE)
    this.pairV(NORTH_SOUTH_PORT, EXTERNAL_PORT, SPACING_EDGE_EDGE)
    this.pairV(NORTH_SOUTH_PORT, LABEL, SPACING_LABEL_NODE)

    // external
    this.diagV(EXTERNAL_PORT, SPACING_PORT_PORT)
    this.pairVH(EXTERNAL_PORT, LABEL, SPACING_LABEL_PORT_VERTICAL, SPACING_LABEL_PORT_HORIZONTAL)

    // label
    this.diagVH(LABEL, SPACING_EDGE_EDGE, SPACING_EDGE_EDGE)

    // breaking points
    this.diagVH(BREAKING_POINT, SPACING_EDGE_EDGE, SPACING_EDGE_EDGE_BETWEEN_LAYERS)
    this.pairVH(BREAKING_POINT, NORMAL, SPACING_EDGE_NODE, SPACING_EDGE_NODE_BETWEEN_LAYERS)
    this.pairVH(BREAKING_POINT, LABEL, SPACING_EDGE_NODE, SPACING_EDGE_NODE_BETWEEN_LAYERS)
    this.pairVH(BREAKING_POINT, LONG_EDGE, SPACING_EDGE_NODE, SPACING_EDGE_NODE_BETWEEN_LAYERS)
  }

  // ---- 查询 ----

  /** 垂直间距 (LNode 对; 对应 Java getVerticalSpacing(LNode, LNode)). */
  getVerticalSpacing(n1: LNode, n2: LNode): number {
    return this.getLocalSpacing(n1, n2, this.nodeTypeSpacingOptionsVertical)
  }

  /** 水平间距 (LNode 对; 对应 Java getHorizontalSpacing(LNode, LNode)). */
  getHorizontalSpacing(n1: LNode, n2: LNode): number {
    return this.getLocalSpacing(n1, n2, this.nodeTypeSpacingOptionsHorizontal)
  }

  /** 垂直间距 (NodeType 重载; InteractiveNodePlacer 用 — 图默认值, 无 individual). */
  getVerticalSpacingByType(t1: NodeType, t2: NodeType): number {
    return this.getTypeSpacing(t1, t2, this.nodeTypeSpacingOptionsVertical)
  }

  /** 水平间距 (NodeType 重载). */
  getHorizontalSpacingByType(t1: NodeType, t2: NodeType): number {
    return this.getTypeSpacing(t1, t2, this.nodeTypeSpacingOptionsHorizontal)
  }

  private getLocalSpacing(n1: LNode, n2: LNode, mapping: SpacingTable): number {
    const t1 = n1.getType()
    const t2 = n2.getType()
    const layoutOption = mapping[t1]?.[t2]
    // get the spacing value for each node (individual override 优先, 否则图默认)
    const s1 = this.getIndividualOrDefault(n1, layoutOption)
    const s2 = this.getIndividualOrDefault(n2, layoutOption)
    return Math.max(s1, s2)
  }

  private getTypeSpacing(t1: NodeType, t2: NodeType, mapping: SpacingTable): number {
    const layoutOption = mapping[t1]?.[t2]
    if (layoutOption === undefined) {
      // TS 独有类型 (PLACEHOLDER 等) 未在表中定义: 回退到 NORMAL 间距.
      return this.graph.getProperty(SPACING_NODE_NODE)
    }
    return this.graph.getProperty(layoutOption)
  }

  /** 对应 Java Spacings.getIndividualOrDefault (私有, 供间距表内部用). */
  private getIndividualOrDefault(node: LNode, property: Property<number> | undefined): number {
    if (property === undefined) {
      return this.graph.getProperty(SPACING_NODE_NODE)
    }
    // 快路径: 节点无 individual 覆盖 → 图默认值 (缓存; 与静态版语义一致: getGraph 非空时即 graph.getProperty)
    if (!node.hasProperty(SPACING_INDIVIDUAL)) {
      let v = this.cachedDefaults.get(property)
      if (v === undefined) {
        v = this.graph.getProperty(property)
        this.cachedDefaults.set(property, v)
      }
      return v
    }
    return getIndividualOrDefault(node, property)
  }
}

/** 对应 Java Spacings.getIndividualOrDefault (static): individual 覆盖优先, 否则图默认.
 *  注意不能直接 lNode.getProperty(prop) — 节点未设置时返回属性默认而非图级值 (graph01 实证:
 *  portPort=5 图级, 节点读默认 10 → 辅助图间距错). */
export function getIndividualOrDefault<T>(node: LNode, property: Property<T>): T {
  let result: T | null = null
  // 检查 individual 覆盖
  if (node.hasProperty(SPACING_INDIVIDUAL)) {
    const individualSpacings = node.getProperty<IPropertyHolder | null>(SPACING_INDIVIDUAL)
    if (individualSpacings && individualSpacings.hasProperty(property)) {
      result = individualSpacings.getProperty(property)
    }
  }
  // 使用图默认值
  if (result === null) {
    result = node.getGraph()?.getProperty(property) ?? property.getDefault()
  }
  return result
}
