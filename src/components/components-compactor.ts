/**
 * ComponentsCompactor (对应 ELK layered components.ComponentsCompactor).
 * 连通分量一维压缩: 分量凸包 + 外部扩展 → CGraph → 水平/垂直交替压缩,
 * 压缩后分量按 offset 平移回图, 外部端口贴图边框, 外部边参与图尺寸计算.
 */
import { Direction, NodeType, PortSide } from '../graph/enums.js'
import { LEdge } from '../graph/ledge.js'
import type { LGraph } from '../graph/lgraph.js'
import { LNode } from '../graph/lnode.js'
import { LPort } from '../graph/lport.js'
import { Property } from '../graph/properties.js'
import { EXT_PORT_CONNECTIONS, EXT_PORT_SIDE } from '../options/internal-properties.js'
import { EDGE_THICKNESS } from '../options/layered-options.js'
import { Point } from '../compaction/recthull/point.js'
import type { ElkRectangle } from '../compaction/recthull/rectilinear-convex-hull.js'
import { RectilinearConvexHull } from '../compaction/recthull/rectilinear-convex-hull.js'
import { OneDimensionalComponentsCompaction } from './oned-components-compaction.js'
import type { IComponent, IConnectedComponents, IExternalExtension } from './components-to-cgraph-transformer.js'

/** 压缩连通分量开关 (ELK LayeredOptions.COMPACTION_CONNECTED_COMPONENTS, 默认 false). */
export const COMPACTION_CONNECTED_COMPONENTS = new Property<boolean>(
  'org.eclipse.elk.layered.compaction.connectedComponents', false)

/** 双精度比较 epsilon. */
const EPSILON = 0.0001

/** 端口侧 → 方向 (ELK PortSide → Direction). */
function portSideToDirection(side: PortSide): Direction {
  switch (side) {
    case PortSide.NORTH: return Direction.UP
    case PortSide.WEST: return Direction.LEFT
    case PortSide.EAST: return Direction.RIGHT
    case PortSide.SOUTH: return Direction.DOWN
    default: return Direction.UNDEFINED
  }
}

/** 浮点近似相等 (ELK DoubleMath.fuzzyEquals). */
function fuzzyEquals(a: number, b: number, epsilon: number): boolean {
  return Math.abs(a - b) <= epsilon
}

function rect(x: number, y: number, width: number, height: number): ElkRectangle {
  return { x, y, width, height }
}

/** 矩形角点 (ELK ElkRectangle.getTopLeft 等). */
function topRight(r: ElkRectangle): { x: number, y: number } { return { x: r.x + r.width, y: r.y } }
function bottomRight(r: ElkRectangle): { x: number, y: number } { return { x: r.x + r.width, y: r.y + r.height } }
function bottomLeft(r: ElkRectangle): { x: number, y: number } { return { x: r.x, y: r.y + r.height } }
function topLeft(r: ElkRectangle): { x: number, y: number } { return { x: r.x, y: r.y } }

export class ComponentsCompactor {
  /** 使用的压缩器. */
  private compactor: OneDimensionalComponentsCompaction | null = null

  /** 压缩后偏移. */
  private yetAnotherOffset: { x: number, y: number } = { x: 0, y: 0 }
  /** 压缩后图尺寸. */
  private compactedGraphSize: { x: number, y: number } = { x: 0, y: 0 }

  private graphTopLeft: { x: number, y: number } = { x: 0, y: 0 }
  private graphBottomRight: { x: number, y: number } = { x: 0, y: 0 }

  /**
   * 压缩给定分量.
   *
   * @param graphs 待压缩的分量
   * @param originalGraphsSize 当前整体图尺寸 (兼容 ELK 签名, 内部不使用)
   * @param spacing 任意分量对之间需要保持的间距
   */
  compact(graphs: LGraph[], originalGraphsSize: { x: number, y: number }, spacing: number): void {
    // 确定当前图的极值点: 复用此 frame 按合适长度裁剪外部扩展
    this.graphTopLeft = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }
    this.graphBottomRight = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }
    for (const graph of graphs) {
      for (const node of graph.getLayerlessNodes()) {
        this.graphTopLeft.x = Math.min(this.graphTopLeft.x, node.position.x - node.getMargin().left)
        this.graphTopLeft.y = Math.min(this.graphTopLeft.y, node.position.y - node.getMargin().top)
        this.graphBottomRight.x = Math.max(this.graphBottomRight.x,
          node.position.x + node.size.x + node.getMargin().right)
        this.graphBottomRight.y = Math.max(this.graphBottomRight.y,
          node.position.y + node.size.y + node.getMargin().bottom)
      }
    }

    // 由 lgraph 创建连通分量
    const ccs: IConnectedComponents = new InternalConnectedComponents()
    for (const graph of graphs) {
      const c = this.transformLGraph(graph)
      ccs.getComponents().push(c)
      c.containsRegularNodes = c.containsRegularNodes || c.getExternalExtensionSides().size > 0
    }

    // 为每个分量在压缩器中创建元素
    this.compactor = OneDimensionalComponentsCompaction.init(ccs, spacing)

    // 执行压缩
    this.compactor.compact()

    this.yetAnotherOffset = { x: 0, y: 0 }
    this.compactedGraphSize = this.compactor.getGraphSize()

    // 应用位置 (Java 对 InternalComponent 强转: 内部类方法不在 IComponent 接口上)
    for (const cc of ccs.getComponents() as InternalComponent[]) {
      // 取当前连通分量的公共偏移
      const offset = this.compactor.getOffset(cc)

      // 平移
      offsetGraphF(cc.graph, offset.x, offset.y)

      // 调整外部端口位置
      for (const n of cc.getNodes()) {
        if (n.getType() === NodeType.EXTERNAL_PORT) {
          const newPos = this.getExternalPortPosition(n.getPosition(), n.getProperty(EXT_PORT_SIDE))
          n.position.x = newPos.x
          n.position.y = newPos.y
        }
      }
    }

    // 外部边对图尺寸有贡献 … 但只有部分段
    for (const cc of ccs.getComponents() as InternalComponent[]) {
      for (const e of cc.getExternalEdges()) {
        const vc: { x: number, y: number }[] = []
        vc.push(e.getSource()!.getAbsoluteAnchor())
        vc.push(...e.getBendPoints())
        vc.push(e.getTarget()!.getAbsoluteAnchor())

        let last: { x: number, y: number } | null = null
        for (const v of vc) {
          if (last === null) { last = v; continue }
          if (fuzzyEquals(last.x, v.x, EPSILON)) {
            this.yetAnotherOffset.x = Math.min(this.yetAnotherOffset.x, last.x)
            this.compactedGraphSize.x = Math.max(this.compactedGraphSize.x, last.x)
          } else if (fuzzyEquals(last.y, v.y, EPSILON)) {
            this.yetAnotherOffset.y = Math.min(this.yetAnotherOffset.y, last.y)
            this.compactedGraphSize.y = Math.max(this.compactedGraphSize.y, last.y)
          }
          last = v
        }
      }
    }

    this.yetAnotherOffset.x = -this.yetAnotherOffset.x
    this.yetAnotherOffset.y = -this.yetAnotherOffset.y
    this.compactedGraphSize.x += this.yetAnotherOffset.x
    this.compactedGraphSize.y += this.yetAnotherOffset.y
  }

  /** 压缩后每个分量需平移的偏移 (使最左上点为 (0, 0)). */
  getOffset(): { x: number, y: number } {
    return this.yetAnotherOffset
  }

  /** 压缩后的新图尺寸. */
  getGraphSize(): { x: number, y: number } {
    return this.compactedGraphSize
  }

  // -----------------------------------------------------------
  //                        private API
  // -----------------------------------------------------------

  /**
   * 把 LGraph 转换成分量: 一组描述分量占用空间的矩形 + 一组外部扩展.
   */
  private transformLGraph(graph: LGraph): InternalComponent {
    const component = new InternalComponent(graph)

    if (!component.containsRegularNodes) {
      this.createDummyNode(graph)
    }

    // #1 节点 → 凸包点
    const hullPoints = this.componentHullPoints(graph)

    // #2 转换外部边, 同时把内段贡献的凸包点加入, 记录外部段极值
    const externalExtensions = new Map<Direction, LEdge[]>()
    const outerSegments = new OuterSegments()

    for (const node of graph.getLayerlessNodes()) {
      for (const edge of node.getOutgoingEdges()) {
        if (this.isExternalEdge(edge)) {
          const iee = this.transformLEdge(edge, hullPoints, outerSegments)
          const list = externalExtensions.get(iee.getDirection()) ?? []
          list.push(iee.edge)
          externalExtensions.set(iee.getDirection(), list)
        }
      }
    }

    // #3 为该分量创建公共外部扩展 (每方向至多一个, 共 4 个)
    const extensions: InternalUnionExternalExtension[] = []
    for (const ps of component.getExternalExtensionSides()) {
      const min = outerSegments.min[ps]
      const max = outerSegments.max[ps]
      const extent = outerSegments.extent[ps]

      let extension: ElkRectangle | null = null
      let placeholder: ElkRectangle | null = null
      switch (ps) {
        case PortSide.WEST:
          extension = rect(this.graphTopLeft.x, min, hullPoints.topLeft.x - this.graphTopLeft.x, max - min)
          placeholder = rect(this.graphTopLeft.x, min, extent, max - min)
          hullPoints.addVector(topRight(extension))
          hullPoints.addVector(bottomRight(extension))
          break

        case PortSide.EAST:
          extension = rect(hullPoints.bottomRight.x, min, this.graphBottomRight.x - hullPoints.bottomRight.x, max - min)
          placeholder = rect(this.graphBottomRight.x - extent, min, extent, max - min)
          hullPoints.addVector(topLeft(extension))
          hullPoints.addVector(bottomLeft(extension))
          break

        case PortSide.NORTH:
          extension = rect(min, this.graphTopLeft.y, max - min, hullPoints.topLeft.y - this.graphTopLeft.y)
          placeholder = rect(min, this.graphTopLeft.y, max - min, extent)
          hullPoints.addVector(bottomLeft(extension))
          hullPoints.addVector(bottomRight(extension))
          break

        case PortSide.SOUTH:
          extension = rect(min, hullPoints.bottomRight.y, max - min, this.graphBottomRight.y - hullPoints.bottomRight.y)
          placeholder = rect(min, this.graphBottomRight.y - extent, max - min, extent)
          hullPoints.addVector(topLeft(extension))
          hullPoints.addVector(topRight(extension))
          break
        default:
          break
      }

      // 实例化外部扩展对象
      if (extension !== null) {
        const iuee = new InternalUnionExternalExtension()
        iuee.side = ps
        iuee.extension = extension
        iuee.placeholder = placeholder!
        iuee.edges = new Set(externalExtensions.get(portSideToDirection(ps)) ?? [])
        extensions.push(iuee)
      }
    }

    // #4 计算分量凸包
    component.externalExtensions = extensions
    component.rectilinearConvexHull = RectilinearConvexHull.of(hullPoints.points).splitIntoRectangles()

    return component
  }

  private createDummyNode(graph: LGraph): void {
    // 只可能是一个外部端口: 给它一个微小 dummy 矩形 (否则可能产生零维凸包矩形, 扫描线失败)
    const extPortDummy = graph.getLayerlessNodes()[0]!

    // 为外部端口 dummy 创建小 dummy 节点, 保证任何维度都不为 0
    const dummy = new LNode(graph)
    dummy.size.x = Math.max(1, extPortDummy.size.x)
    dummy.size.y = Math.max(1, extPortDummy.size.y)

    // 置于 dummy 端口所在侧的合适位置
    dummy.position.x = extPortDummy.position.x
    dummy.position.y = extPortDummy.position.y
    switch (extPortDummy.getProperty(EXT_PORT_SIDE)) {
      case PortSide.WEST:
        dummy.position.x += 2
        break
      case PortSide.NORTH:
        dummy.position.y += 2
        break
      case PortSide.EAST:
        dummy.position.x -= 2
        break
      case PortSide.SOUTH:
        dummy.position.y -= 2
        break
      default:
        break
    }

    // 给 dummy 一个端口并为其建边
    const dummyPort = new LPort()
    dummyPort.setNode(dummy)
    const dummyEdge = new LEdge()
    const extPortDummyPort = extPortDummy.getPorts()[0]!
    dummyEdge.setSource(extPortDummyPort)
    dummyEdge.setTarget(dummyPort)
    // 定位 dummy 端口使边保持直线
    dummyPort.position.x = extPortDummyPort.position.x
    dummyPort.position.y = extPortDummyPort.position.y
    const extAnchor = extPortDummyPort.getAnchor()
    const dummyAnchor = dummyPort.getAnchor()
    dummyAnchor.x = extAnchor.x
    dummyAnchor.y = extAnchor.y
  }

  private componentHullPoints(graph: LGraph): Hullpoints {
    const pts = new Hullpoints()

    for (const n of graph.getLayerlessNodes()) {
      if (n.getType() === NodeType.EXTERNAL_PORT) continue

      // 节点标签已含在节点边距中, 端口与其标签同理
      addLGraphElementBounds(pts, n)

      // 加入边弯点
      for (const edge of n.getOutgoingEdges()) {
        if (this.isExternalEdge(edge)) continue

        for (const bp of edge.getBendPoints()) {
          pts.add(new Point(bp.x, bp.y))
        }
      }
    }

    return pts
  }

  private isExternalEdge(edge: LEdge): boolean {
    return edge.getSource()!.getNode()!.getType() === NodeType.EXTERNAL_PORT
      || edge.getTarget()!.getNode()!.getType() === NodeType.EXTERNAL_PORT
  }

  /**
   * 把外部边转换为外部扩展. 原边贡献三部分, 如代码注释所示.
   */
  private transformLEdge(externalEdge: LEdge, hullPoints: Hullpoints, outerSegments: OuterSegments): InternalExternalExtension {
    const externalExtension = new InternalExternalExtension(externalEdge)

    // #1 把边的路径转换为段集合
    const segments = this.edgeToSegments(externalEdge, externalExtension)

    // #2 所有 'inner' 段贡献凸包 (考虑边厚度)
    const thickness = Math.max(externalEdge.getProperty(EDGE_THICKNESS), 1)
    for (const segment of segments.innerSegments) {
      const r = this.segmentToRectangle(segment.first, segment.second, thickness)
      hullPoints.addRect(r)
    }

    // #3 'outer' 段 (实际连接外部端口的段) 贡献该方向公共外部段的极值
    const side = externalExtension.externalPortSide
    const outerSegmentRect = this.segmentToRectangle(segments.outerSegment!.first, segments.outerSegment!.second, thickness)
    if (side === PortSide.WEST || side === PortSide.EAST) {
      outerSegments.min[side] = Math.min(outerSegments.min[side], outerSegmentRect.y)
      outerSegments.max[side] = Math.max(outerSegments.max[side], outerSegmentRect.y + outerSegmentRect.height)
    } else {
      outerSegments.min[side] = Math.min(outerSegments.min[side], outerSegmentRect.x)
      outerSegments.max[side] = Math.max(outerSegments.max[side], outerSegmentRect.x + outerSegmentRect.width)
    }

    // extent
    let extent = Number.NEGATIVE_INFINITY
    const margins = externalExtension.externalPort.getNode()!.getMargin()
    switch (side) {
      case PortSide.WEST: extent = margins.right; break
      case PortSide.EAST: extent = margins.left; break
      case PortSide.NORTH: extent = margins.bottom; break
      case PortSide.SOUTH: extent = margins.top; break
      default: break
    }
    outerSegments.extent[side] = Math.max(outerSegments.extent[side], extent)

    return externalExtension
  }

  // -----------------------------------------------------------
  //                     Auxiliary stuff
  // -----------------------------------------------------------

  private segmentToRectangle(p1: { x: number, y: number }, p2: { x: number, y: number }, extent: number): ElkRectangle {
    return rect(
      Math.min(p1.x, p2.x) - extent / 2,
      Math.min(p1.y, p2.y) - extent / 2,
      Math.abs(p1.x - p2.x) + extent,
      Math.abs(p1.y - p2.y) + extent)
  }

  private edgeToSegments(edge: LEdge, externalExtension: InternalExternalExtension): Segments {
    const externalPort = externalExtension.externalPort
    const externalPortSide = externalExtension.externalPortSide

    // 提取用于外部扩展的正确段
    let p1 = edge.getSource()!.getAbsoluteAnchor()
    let p2 = edge.getTarget()!.getAbsoluteAnchor()

    // 分量外部端口可能尚未路由到图边框, 在此调整其位置
    if (externalPort === edge.getSource()) {
      p1 = this.getExternalPortPosition(p1, externalPortSide)
      p2 = getPortPositionOnMargin(edge.getTarget()!)
    } else {
      p1 = getPortPositionOnMargin(edge.getSource()!)
      p2 = this.getExternalPortPosition(p2, externalPortSide)
    }

    const points: { x: number, y: number }[] = []
    points.push(p1)
    points.push(...edge.getBendPoints())
    points.push(p2)

    const outerSegmentIsFirst = edge.getSource() === externalPort

    // 转为段列表
    const segments = new Segments()
    for (let i = 0; i < points.length - 1; ++i) {
      const segment = { first: points[i]!, second: points[i + 1]! }
      if ((outerSegmentIsFirst && i === 0) || (!outerSegmentIsFirst && i === points.length - 2)) {
        segments.outerSegment = segment
      } else {
        segments.innerSegments.push(segment)
      }
    }

    return segments
  }

  private getExternalPortPosition(pos: { x: number, y: number }, ps: PortSide): { x: number, y: number } {
    switch (ps) {
      case PortSide.NORTH: return { x: pos.x, y: Math.min(this.graphTopLeft.y, pos.y) }
      case PortSide.EAST: return { x: Math.max(this.graphBottomRight.x, pos.x), y: pos.y }
      case PortSide.SOUTH: return { x: pos.x, y: Math.max(this.graphBottomRight.y, pos.y) }
      case PortSide.WEST: return { x: Math.min(pos.x, this.graphTopLeft.x), y: pos.y }
      default: return { x: pos.x, y: pos.y }
    }
  }
}

// -----------------------------------------------------------
//              Interface Implementations
// -----------------------------------------------------------

/** IConnectedComponents 实现: 分量集合 + 是否含外部端口. */
class InternalConnectedComponents implements IConnectedComponents {
  private components: IComponent[] = []
  private containsExternalPorts = false

  getComponents(): IComponent[] {
    return this.components
  }

  isContainsExternalExtensions(): boolean {
    return this.containsExternalPorts
  }
}

/** IComponent 实现: LGraph 包装 (若用户设置 SEPARATE_CC, LGraph 即代表连通分量). */
class InternalComponent implements IComponent {
  graph: LGraph
  containsRegularNodes: boolean

  rectilinearConvexHull: ElkRectangle[] = []
  externalExtensions: IExternalExtension[] = []

  constructor(graph: LGraph) {
    this.graph = graph
    this.containsRegularNodes = graph.getLayerlessNodes().some(n => n.getType() === NodeType.NORMAL)
  }

  getExternalExtensionSides(): Set<PortSide> {
    return this.graph.getProperty(EXT_PORT_CONNECTIONS) ?? new Set()
  }

  getHull(): ElkRectangle[] {
    return this.rectilinearConvexHull
  }

  getExternalExtensions(): IExternalExtension[] {
    return this.externalExtensions
  }

  getNodes(): LNode[] {
    return this.graph.getLayerlessNodes()
  }

  getExternalEdges(): LEdge[] {
    const edges: LEdge[] = []
    for (const ee of this.externalExtensions) {
      edges.push(...ee.getRepresentative())
    }
    return edges
  }
}

/** 多个外部扩展的并集 (每方向一个). */
class InternalUnionExternalExtension implements IExternalExtension {
  edges = new Set<LEdge>()
  side: PortSide = PortSide.UNDEFINED
  extension: ElkRectangle = rect(0, 0, 0, 0)
  placeholder: ElkRectangle = rect(0, 0, 0, 0)

  getRepresentative(): Set<LEdge> {
    return this.edges
  }

  getRepresentor(): ElkRectangle {
    return this.extension
  }

  getParent(): ElkRectangle {
    throw new Error('UnsupportedOperationException')
  }

  getDirection(): Direction {
    return portSideToDirection(this.side)
  }

  getPlaceholder(): ElkRectangle | null {
    return this.placeholder
  }
}

/** IExternalExtension 实现: 单条外部边 (哪个端口是外部端口 + 位于父节点哪侧). */
class InternalExternalExtension {
  edge: LEdge
  externalPort: LPort
  externalPortSide: PortSide

  constructor(edge: LEdge) {
    this.edge = edge
    if (edge.getSource()!.getNode()!.getType() === NodeType.EXTERNAL_PORT) {
      this.externalPort = edge.getSource()!
      this.externalPortSide = edge.getSource()!.getNode()!.getProperty(EXT_PORT_SIDE)
    } else if (edge.getTarget()!.getNode()!.getType() === NodeType.EXTERNAL_PORT) {
      this.externalPort = edge.getTarget()!
      this.externalPortSide = edge.getTarget()!.getNode()!.getProperty(EXT_PORT_SIDE)
    } else {
      throw new Error(`Edge ${edge} is not an external edge.`)
    }
  }

  getDirection(): Direction {
    return portSideToDirection(this.externalPortSide)
  }

  getRepresentative(): LEdge {
    return this.edge
  }
}

// -----------------------------------------------------------
//                     Further classes
// -----------------------------------------------------------

/** 点列表, 维护最小/最大值 (对应 ELK Hullpoints). */
class Hullpoints {
  points: Point[] = []
  topLeft: { x: number, y: number } = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }
  bottomRight: { x: number, y: number } = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }

  add(p: Point): void {
    this.topLeft.x = Math.min(this.topLeft.x, p.x)
    this.topLeft.y = Math.min(this.topLeft.y, p.y)
    this.bottomRight.x = Math.max(this.bottomRight.x, p.x)
    this.bottomRight.y = Math.max(this.bottomRight.y, p.y)
    this.points.push(p)
  }

  addVector(v: { x: number, y: number }): void {
    this.add(new Point(v.x, v.y))
  }

  addRect(r: ElkRectangle): void {
    this.addVector({ x: r.x, y: r.y })
    this.addVector({ x: r.x + r.width, y: r.y })
    this.addVector({ x: r.x, y: r.y + r.height })
    this.addVector({ x: r.x + r.width, y: r.y + r.height })
  }
}

/** 内/外段收集器 (对应 ELK Segments). */
class Segments {
  innerSegments: { first: { x: number, y: number }, second: { x: number, y: number } }[] = []
  outerSegment: { first: { x: number, y: number }, second: { x: number, y: number } } | null = null
}

/** 外部段并集极值收集器 (对应 ELK OuterSegments). */
class OuterSegments {
  min: Record<PortSide, number>
  max: Record<PortSide, number>
  extent: Record<PortSide, number>

  constructor() {
    this.min = { [PortSide.NORTH]: Number.POSITIVE_INFINITY, [PortSide.EAST]: Number.POSITIVE_INFINITY, [PortSide.SOUTH]: Number.POSITIVE_INFINITY, [PortSide.WEST]: Number.POSITIVE_INFINITY, [PortSide.UNDEFINED]: Number.POSITIVE_INFINITY }
    this.max = { [PortSide.NORTH]: Number.NEGATIVE_INFINITY, [PortSide.EAST]: Number.NEGATIVE_INFINITY, [PortSide.SOUTH]: Number.NEGATIVE_INFINITY, [PortSide.WEST]: Number.NEGATIVE_INFINITY, [PortSide.UNDEFINED]: Number.NEGATIVE_INFINITY }
    this.extent = { [PortSide.NORTH]: Number.NEGATIVE_INFINITY, [PortSide.EAST]: Number.NEGATIVE_INFINITY, [PortSide.SOUTH]: Number.NEGATIVE_INFINITY, [PortSide.WEST]: Number.NEGATIVE_INFINITY, [PortSide.UNDEFINED]: Number.NEGATIVE_INFINITY }
  }
}

// -----------------------------------------------------------
//                  Module-level helpers
// -----------------------------------------------------------

/** 节点包围盒 4 角点 (标签已含在边距; ELK addLGraphElementBounds 的 LNode 分支). */
function addLGraphElementBounds(pts: Hullpoints, element: LNode): void {
  const m = element.getMargin()
  pts.addVector({ x: element.position.x - m.left, y: element.position.y - m.top })
  pts.addVector({ x: element.position.x - m.left, y: element.position.y + element.size.y + m.bottom })
  pts.addVector({ x: element.position.x + element.size.x + m.right, y: element.position.y - m.top })
  pts.addVector({ x: element.position.x + element.size.x + m.right, y: element.position.y + element.size.y + m.bottom })
}

/** 端口在节点边距上的位置 (ELK getPortPositionOnMargin). */
function getPortPositionOnMargin(port: LPort): { x: number, y: number } {
  const pos = port.getAbsoluteAnchor()
  const margins = port.getNode()!.getMargin()

  switch (port.getSide()) {
    case PortSide.NORTH: pos.y -= margins.top; break
    case PortSide.EAST: pos.x += margins.right; break
    case PortSide.SOUTH: pos.y += margins.bottom; break
    case PortSide.WEST: pos.x -= margins.left; break
    default: break
  }
  return pos
}

/** 平移 LGraph 全部节点/边 (ELK LGraphUtil.offsetGraph; 不并入其他图). */
export function offsetGraphF(graph: LGraph, offsetX: number, offsetY: number): void {
  const seenEdges = new Set<LEdge>()
  for (const node of graph.getLayerlessNodes()) {
    node.position.x += offsetX
    node.position.y += offsetY
    for (const port of node.getPorts()) {
      for (const edge of port.getOutgoingEdges()) {
        if (seenEdges.has(edge)) continue
        seenEdges.add(edge)
        for (const bp of edge.getBendPoints()) {
          bp.x += offsetX
          bp.y += offsetY
        }
      }
    }
  }
}
