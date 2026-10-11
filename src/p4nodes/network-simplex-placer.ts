/**
 * NetworkSimplexPlacer (对应 ELK p4nodes.NetworkSimplexPlacer).
 *
 * nodePlacement.strategy = NETWORK_SIMPLEX: 构建辅助 NGraph (层内间距边 + 端口边 + 边 dummy),
 * 跑 NetworkSimplex (withBalancing=false), 按节点 head/tail layer 应用位置.
 *
 * 范围: 核心 (prepare / buildInitialAuxiliaryGraph / transform 系列 / insert*AuxiliaryEdges / applyPositions)
 * + Edge Straightening (preferStraightEdges / postProcessTwoPaths, ORTHOGONAL 默认 favorStraightEdges=true).
 * 待补: flexibleWhereSpace 第二遍 (默认 nodeFlexibility=NONE 不走).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import type { LEdge } from '../graph/ledge.js'
import { NodeType, PortSide, PortConstraints, SIDES_EAST_WEST } from '../graph/enums.js'
import { NGraph } from '../networksimplex/ngraph.js'
import { NNode, nn } from '../networksimplex/nnode.js'
import { NEdge, ne } from '../networksimplex/nedge.js'
import { NetworkSimplex } from '../networksimplex/network-simplex.js'
import { SPACINGS, PORT_DUMMY } from '../options/internal-properties.js'
import { getIndividualOrDefault } from './spacings.js'
import {
  SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING, THOROUGHNESS,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT,
  NodeFlexibility, NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES, PRIORITY_STRAIGHTNESS,
} from '../options/layered-options.js'

const EDGE_WEIGHT_BASE = 4
const LONG_EDGE_VS_PATH_FACTOR = 2
const SMALL_EDGE_WEIGHT = 0.1
const NODE_SIZE_WEIGHT_STATIC = 10000
const NODE_SIZE_WEIGHT_FLEXIBLE = 1
const EPSILON = 0.00001

/** 节点访问状态: 未访问 (对应 ELK VISITED). */
const VISITED = -1
/** 节点访问状态: 非 junction (对应 ELK OTHER). */
const OTHER = 0
/** junction: 入度/出度 > 1 或叶子节点 (对应 ELK JUNCTION). */
const JUNCTION = 2

/** 对应 ELK NodeFlexibility.getNodeFlexibility. */
export function getNodeFlexibility(lNode: LNode): NodeFlexibility {
  if (lNode.hasProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY)) {
    return lNode.getProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY)
  }
  return lNode.getGraph()!.getProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT)
}

/** 对应 ELK NetworkSimplexPlacer.isFlexibleNode. */
export function isFlexibleNode(lNode: LNode): boolean {
  if (lNode.getType() !== NodeType.NORMAL) return false
  if (lNode.getPorts().length <= 1) return false
  const pc = lNode.getProperty<PortConstraints>('org.eclipse.elk.portConstraints')
  if (PortConstraints.isPosFixed(pc)) return false
  const nf = getNodeFlexibility(lNode)
  if (nf === NodeFlexibility.NONE) return false
  if (!isFlexibleSizeWhereSpacePermits(nf)) {
    const portSpacing = getIndividualOrDefault(lNode, SPACING_PORT_PORT)
    const additional = lNode.getProperty(SPACING_PORTS_SURROUNDING)
    const top = additional.top, bottom = additional.bottom
    const west = lNode.getPortSideView(PortSide.WEST)
    const requiredWest = top + bottom + (west.length - 1) * portSpacing
    if (requiredWest > lNode.getSize().y) return false
    const east = lNode.getPortSideView(PortSide.EAST)
    const requiredEast = top + bottom + (east.length - 1) * portSpacing
    if (requiredEast > lNode.getSize().y) return false
  }
  return true
}

function isFlexibleSizeWhereSpacePermits(nf: NodeFlexibility): boolean {
  return nf === NodeFlexibility.NODE_SIZE_WHERE_SPACE_PERMITS || nf === NodeFlexibility.NODE_SIZE
}

class NodeRep {
  origin: LNode
  head: NNode
  tail: NNode
  isFlexible: boolean
  constructor(origin: LNode, isFlexible: boolean, head: NNode, tail: NNode) {
    this.origin = origin; this.isFlexible = isFlexible; this.head = head; this.tail = tail
  }
}

class EdgeRep {
  origin: LEdge
  left: NEdge
  right: NEdge
  constructor(origin: LEdge, left: NEdge, right: NEdge) { this.origin = origin; this.left = left; this.right = right }

  /** @return true if the edge's source and target have the same y coordinate. */
  isStraight(): boolean {
    return this.notStraightBy() === 0
  }

  /** y 坐标差: 正 = source 比 target 大; 负 = source 比 target 小; 0 = 直 (对应 ELK notStraightBy). */
  notStraightBy(): number {
    return (this.left.target.layer - this.left.delta) - (this.right.target.layer - this.right.delta)
  }
}

/** 边路径 (对应 ELK NetworkSimplexPlacer.Path, ArrayList<LEdge>). */
class Path extends Array<LEdge> {
  /** @return true if any node in this path is of type LONG_EDGE. */
  containsLongEdgeDummy(): boolean {
    if (this.length === 0) return false
    if (this[0].getSource()!.getNode()!.getType() === NodeType.LONG_EDGE) return true
    return this.some(e => e.getTarget()!.getNode()!.getType() === NodeType.LONG_EDGE)
  }

  /** @return true if any node of this path fulfills the passed predicate. */
  containsFlexibleNode(p: (nf: NodeFlexibility) => boolean): boolean {
    if (this.length === 0) return false
    if (p(getNodeFlexibility(this[0].getSource()!.getNode()!))) return true
    return this.some(e => p(getNodeFlexibility(e.getTarget()!.getNode()!)))
  }

  /** 排列两条边使共享节点为第一条的 target 和第二条的 source (对应 ELK orderTwoPath). */
  orderTwoPath(): void {
    if (this.length !== 2) throw new Error('Order only allowed for two paths.')
    const first = this[0]
    const second = this[1]
    if (first.getTarget()!.getNode() !== second.getSource()!.getNode()) {
      this.length = 0
      this.push(second, first)
    }
  }

  /** @return true if the center node (first edge's target) is flexible. */
  isTwoPathCenterNodeFlexible(): boolean {
    return isFlexibleNode(this[0].getTarget()!.getNode()!)
  }
}

export class NetworkSimplexPlacer {
  private lGraph!: LGraph
  private spacings!: import('./spacings.js').Spacings
  private nGraph!: NGraph
  private nodeReps: (NodeRep | undefined)[] = []
  private edgeReps: (EdgeRep | undefined)[] = []
  private portMap = new Map<LPort, NNode>()
  private nodeCount = 0
  private edgeCount = 0
  /** 节点状态 (JUNCTION/OTHER/VISITED, 对应 ELK nodeState). */
  private nodeState: number[] = []
  /** 边是否参与交叉 (对应 ELK crossing). */
  private crossing: boolean[] = []
  /** two-path 集合 (对应 ELK twoPaths). */
  private twoPaths: Path[] = []
  /** NODE_SIZE_WHERE_SPACE_PERMITS 节点的 size 边 (对应 ELK flexibleWhereSpacePermitsEdges). */
  private flexibleWhereSpacePermitsEdges: NEdge[] = []

  process(layeredGraph: LGraph): void {
    this.lGraph = layeredGraph
    this.spacings = layeredGraph.getProperty(SPACINGS)

    this.prepare()
    this.buildInitialAuxiliaryGraph()
    this.insertNorthSouthAuxiliaryEdges()
    this.insertInLayerEdgeAuxiliaryEdges()

    // ELK 管线: Straight Edges Pre-Processing (ORTHOGONAL 默认 favorStraightEdges=true)
    if (this.lGraph.getProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES)) {
      this.preferStraightEdges()
    }

    this.nGraph.makeConnected()

    const iterLimit = layeredGraph.getProperty(THOROUGHNESS) * this.nGraph.nodes.length
    NetworkSimplex.forGraph(this.nGraph).withIterationLimit(iterLimit).withBalancing(false).execute()

    // ELK 管线: Flexible Where Space Processing — NODE_SIZE_WHERE_SPACE_PERMITS 节点
    // 第一遍先用 STATIC 权重定全局位置, 第二遍改 FLEXIBLE 权重 + 全局 source/sink 约束
    // (只能增大, 不超出各层范围), 允许节点按空间余量弹性放大.
    if (this.flexibleWhereSpacePermitsEdges.length > 0) {
      this.insertFlexibleWhereSpaceAuxiliaryEdges()
      for (const edge of this.flexibleWhereSpacePermitsEdges) {
        edge.weight = NODE_SIZE_WEIGHT_FLEXIBLE
      }
      NetworkSimplex.forGraph(this.nGraph).withIterationLimit(iterLimit).withBalancing(false).execute()
    }

    // ELK 管线: Straight Edges Post-Processing (two-path 去弯)
    if (this.lGraph.getProperty(NODE_PLACEMENT_FAVOR_STRAIGHT_EDGES)) {
      this.postProcessTwoPaths()
    }

    this.applyPositions()
    this.cleanup()
  }

  private prepare(): void {
    this.nGraph = new NGraph()
    let nodeIdx = 0
    let edgeIdx = 0
    for (const l of this.lGraph.getLayers()) {
      for (const lNode of l.getNodes()) {
        lNode.id = nodeIdx++
        for (const e of lNode.getOutgoingEdges()) e.id = edgeIdx++
        const anchorMustBeInteger = isFlexibleNode(lNode)
        for (const p of lNode.getPorts()) {
          if (anchorMustBeInteger) {
            const y = p.getAnchor().y
            if (y !== Math.floor(y)) {
              const offset = y - Math.round(y)
              p.getAnchor().y -= offset
            }
          }
          const y2 = p.getPosition().y + p.getAnchor().y
          if (y2 !== Math.floor(y2)) {
            const offset = y2 - Math.round(y2)
            p.getPosition().y -= offset
          }
        }
      }
    }
    this.nodeReps = new Array(nodeIdx)
    this.edgeReps = new Array(edgeIdx)
    this.nodeCount = nodeIdx
    this.edgeCount = edgeIdx
    this.flexibleWhereSpacePermitsEdges = []
  }

  private cleanup(): void {
    this.nodeReps = []
    this.edgeReps = []
    this.portMap.clear()
    this.flexibleWhereSpacePermitsEdges = []
  }

  private buildInitialAuxiliaryGraph(): void {
    for (const l of this.lGraph.getLayers()) this.transformLayer(l)
    this.transformEdges()
  }

  private transformLayer(layer: import('../graph/layer.js').Layer): void {
    let lastRep: NodeRep | null = null
    for (const lNode of layer.getNodes()) {
      const nodeRep = isFlexibleNode(lNode) ? this.transformFixedOrderNode(lNode) : this.transformFixedPosNode(lNode)
      this.nodeReps[lNode.id] = nodeRep

      if (lastRep !== null) {
        let spacing = lastRep.origin.getMargin().bottom
          + this.spacings.getVerticalSpacing(lastRep.origin, lNode)
          + lNode.getMargin().top
        if (!lastRep.isFlexible) spacing += lastRep.origin.getSize().y
        ne().delta(Math.ceil(spacing)).weight(0).source(lastRep.tail).target(nodeRep.head).create()
      }
      lastRep = nodeRep
    }
  }

  private transformFixedPosNode(lNode: LNode): NodeRep {
    const singleNode = nn().origin(lNode).type('non-flexible').create(this.nGraph)
    for (const p of lNode.getPorts()) {
      if (SIDES_EAST_WEST.includes(p.getSide())) this.portMap.set(p, singleNode)
    }
    return new NodeRep(lNode, false, singleNode, singleNode)
  }

  private transformFixedOrderNode(lNode: LNode): NodeRep {
    const topLeft = nn().origin(lNode).type('flexible-head').create(this.nGraph)
    const bottomLeft = nn().origin(lNode).type('flexible-tail').create(this.nGraph)
    const corners = new NodeRep(lNode, true, topLeft, bottomLeft)

    const minHeight = lNode.getSize().y
    const nf = getNodeFlexibility(lNode)
    const sizeWeight = nf === NodeFlexibility.NODE_SIZE ? NODE_SIZE_WEIGHT_FLEXIBLE : NODE_SIZE_WEIGHT_STATIC
    const nodeSizeEdge = ne().weight(sizeWeight).delta(Math.ceil(minHeight)).source(topLeft).target(bottomLeft).create()
    if (nf === NodeFlexibility.NODE_SIZE_WHERE_SPACE_PERMITS) {
      this.flexibleWhereSpacePermitsEdges.push(nodeSizeEdge)
    }

    this.transformPorts([...lNode.getPortSideView(PortSide.WEST)].reverse(), corners)
    this.transformPorts(lNode.getPortSideView(PortSide.EAST), corners)
    return corners
  }

  private transformPorts(ports: LPort[], corners: NodeRep): void {
    if (ports.length === 0) return
    // ELK: Spacings.getIndividualOrDefault — 节点 individual 覆盖优先, 否则图级值.
    const portSpacing = getIndividualOrDefault(corners.origin, SPACING_PORT_PORT)
    const surrounding = getIndividualOrDefault(corners.origin, SPACING_PORTS_SURROUNDING)

    let lastNNode = corners.head
    let lastPort: LPort | null = null
    for (const port of ports) {
      let spacing = 0
      if (lastPort === null) spacing = surrounding.top
      else spacing = portSpacing + lastPort.getSize().y

      const nNode = nn().origin(port).type('port').create(this.nGraph)
      this.portMap.set(port, nNode)
      ne().weight(0).delta(Math.ceil(spacing)).source(lastNNode).target(nNode).create()

      lastPort = port
      lastNNode = nNode
    }
    ne().weight(0).delta(Math.ceil(surrounding.bottom + lastPort!.getSize().y)).source(lastNNode).target(corners.tail).create()
  }

  private transformEdges(): void {
    for (const l of this.lGraph.getLayers()) {
      for (const node of l.getNodes()) {
        for (const e of node.getOutgoingEdges()) {
          if (this.isHandledEdge(e)) this.transformEdge(e)
        }
      }
    }
  }

  private transformEdge(lEdge: LEdge): void {
    const dummy = nn().type('edge').create(this.nGraph)
    const srcRep = this.nodeReps[lEdge.getSource()!.getNode()!.id]!
    const tgtRep = this.nodeReps[lEdge.getTarget()!.getNode()!.id]!
    const srcPort = lEdge.getSource()!
    const tgtPort = lEdge.getTarget()!

    let srcOffset = srcPort.getAnchor().y
    let tgtOffset = tgtPort.getAnchor().y
    if (!srcRep.isFlexible) srcOffset += srcPort.getPosition().y
    if (!tgtRep.isFlexible) tgtOffset += tgtPort.getPosition().y

    const tgtDelta = Math.max(0, srcOffset - tgtOffset)
    const srcDelta = Math.max(0, tgtOffset - srcOffset)
    const weight = this.getEdgeWeight(lEdge)

    const left = ne().origin(lEdge).weight(weight).delta(srcDelta).source(dummy).target(this.portMap.get(srcPort)!).create()
    const right = ne().origin(lEdge).weight(weight).delta(tgtDelta).source(dummy).target(this.portMap.get(tgtPort)!).create()
    this.edgeReps[lEdge.id] = new EdgeRep(lEdge, left, right)
  }

  private insertInLayerEdgeAuxiliaryEdges(): void {
    for (const l of this.lGraph.getLayers()) {
      for (const n of l.getNodes()) {
        if (n.getType() !== NodeType.NORMAL) continue
        for (const e of n.getConnectedEdges()) {
          if (!e.isInLayerEdge()) continue
          const srcIsDummy = e.getSource()!.getNode()!.getType() !== NodeType.NORMAL
          const thePort = srcIsDummy ? e.getTarget()! : e.getSource()!
          const dummyNode = e.getOther(thePort)!.getNode()!
          const portRep = this.portMap.get(thePort)!
          const dummyRep = this.nodeReps[dummyNode.id]!.head
          const src = thePort.getNode()!.getIndex() < dummyNode.getIndex() ? portRep : dummyRep
          const tgt = thePort.getNode()!.getIndex() < dummyNode.getIndex() ? dummyRep : portRep
          ne().delta(0).weight(EDGE_WEIGHT_BASE).source(src).target(tgt).create()
        }
      }
    }
  }

  private insertNorthSouthAuxiliaryEdges(): void {
    for (const l of this.lGraph.getLayers()) {
      for (const n of l.getNodes()) {
        for (const sp of n.getPortSideView(PortSide.SOUTH)) {
          const other = sp.getProperty(PORT_DUMMY) as LNode | null
          const otherRep = other !== null && other !== undefined ? this.nodeReps[other.id] : undefined
          if (other !== null && other !== undefined && otherRep !== undefined && this.nodeReps[n.id] !== undefined) {
            ne().delta(0).weight(SMALL_EDGE_WEIGHT).source(this.nodeReps[n.id]!.tail).target(otherRep.head).create()
          }
        }
        for (const sp of n.getPortSideView(PortSide.NORTH)) {
          const other = sp.getProperty(PORT_DUMMY) as LNode | null
          const otherRep = other !== null && other !== undefined ? this.nodeReps[other.id] : undefined
          if (other !== null && other !== undefined && otherRep !== undefined && this.nodeReps[n.id] !== undefined) {
            ne().delta(0).weight(SMALL_EDGE_WEIGHT).source(otherRep.tail).target(this.nodeReps[n.id]!.head).create()
          }
        }
      }
    }
  }


  // ------------------------------------------------------------------------------------------------
  //                                      Edge Straightening
  // ------------------------------------------------------------------------------------------------

  /** @return 边的长度 (对应 ELK NetworkSimplexPlacer.length). */
  private static length(edge: NEdge): number {
    return Math.abs(edge.source.layer - edge.target.layer) - edge.delta
  }

  /** 类型重载的边权重 (对应 ELK getEdgeWeight(NodeType, NodeType)). */
  private getEdgeWeightByType(nodeType1: NodeType, nodeType2: NodeType): number {
    if (nodeType1 === NodeType.NORMAL && nodeType2 === NodeType.NORMAL) return 1 * EDGE_WEIGHT_BASE
    if (nodeType1 === NodeType.NORMAL || nodeType2 === NodeType.NORMAL) return 2 * EDGE_WEIGHT_BASE
    return 8 * EDGE_WEIGHT_BASE
  }

  /** 类似长边, 提升路径 (degree-2 链) 的权重使路径拉直; 并收集 two-path 供后处理 (对应 ELK preferStraightEdges). */
  private preferStraightEdges(): void {
    this.nodeState = new Array(this.nodeCount)
    this.twoPaths = []

    // record node states
    for (const l of this.lGraph.getLayers()) {
      for (const n of l.getNodes()) {
        this.nodeState[n.id] = NetworkSimplexPlacer.getNodeState(n)
      }
    }

    this.markEdgeCrossings()
    const identifiedPaths = this.identifyPaths()

    // essentially 'long paths' are treated like 'long edges':
    // the weights of the connecting edges are altered to straighten the path as much as possible
    for (const path of identifiedPaths) {
      if (path.length <= 1) continue

      // remember 'two paths' for processing after network simplex has been executed
      if (path.length === 2) {
        path.orderTwoPath()
        if (!path.isTwoPathCenterNodeFlexible()) {
          this.twoPaths.push(path)
        }
        continue
      }

      // ignore paths that contain long edge dummies, and paths that contain flexible nodes that allow resizing
      if (path.containsLongEdgeDummy() || path.containsFlexibleNode(nf => isFlexibleSizeWhereSpacePermits(nf))) {
        continue
      }

      let last: LEdge | null = null
      for (let pi = 0; pi < path.length; pi++) {
        const cur = path[pi]
        const curRep = this.edgeReps[cur.id]!
        const weight = last === null || pi === path.length - 1
          ? this.getEdgeWeightByType(NodeType.NORMAL, NodeType.LONG_EDGE)
          : this.getEdgeWeightByType(NodeType.LONG_EDGE, NodeType.LONG_EDGE)

        // at this point one can decide whether long edges are more important than "paths"
        const w = weight * LONG_EDGE_VS_PATH_FACTOR

        const oldLeftWeight = curRep.left.weight
        curRep.left.weight = Math.max(oldLeftWeight, oldLeftWeight + (w - oldLeftWeight))
        const oldRightWeight = curRep.right.weight
        curRep.right.weight = Math.max(oldRightWeight, oldRightWeight + (w - oldRightWeight))

        last = cur
      }
    }
  }

  /** Iteratively post processes 'two paths' until no further bends can be removed. */
  private postProcessTwoPaths(): void {
    const q: Path[] = [...this.twoPaths]
    const s: Path[] = []
    while (q.length > 0) {
      const path = q.shift()!
      if (this.improveTwoPath(path, true)) {
        s.push(path)
      }
    }
    while (s.length > 0) {
      this.improveTwoPath(s.pop()!, false)
    }
  }

  /**
   * 处理 two-path (u, center, v): 若 center 可上下移动则消除一条边的弯折 (对应 ELK improveTwoPath).
   * @returns true 表示两侧空间相等, 稍后再试.
   */
  private improveTwoPath(path: Path, probe: boolean): boolean {
    const leftEdge = this.edgeReps[path[0].id]!
    const rightEdge = this.edgeReps[path[1].id]!

    // is the edge already straight?
    if (leftEdge.isStraight() && rightEdge.isStraight()) {
      return false
    }

    // get center node
    const centerOrigin = leftEdge.right.target.origin
    if (centerOrigin === null || typeof (centerOrigin as LNode).getPorts !== 'function') {
      return false
    }
    const centerNode = centerOrigin as LNode
    const nNode = this.nodeReps[centerNode.id]!

    // identify on which side there is more space
    const nodeIndex = centerNode.getIndex()
    let aboveDist = Number.POSITIVE_INFINITY
    if (nodeIndex > 0) {
      const above = centerNode.getLayer()!.getNodes()[nodeIndex - 1]!
      const aboveRep = this.nodeReps[above.id]!
      const spacing = Math.ceil(this.spacings.getVerticalSpacing(above, centerNode))
      aboveDist = (nNode.head.layer - centerNode.getMargin().top)
        - (aboveRep.head.layer + above.getSize().y + above.getMargin().bottom)
        - spacing
    }
    let belowDist = Number.POSITIVE_INFINITY
    if (nodeIndex < centerNode.getLayer()!.getNodes().length - 1) {
      const below = centerNode.getLayer()!.getNodes()[nodeIndex + 1]!
      const belowRep = this.nodeReps[below.id]!
      const spacing = Math.ceil(this.spacings.getVerticalSpacing(below, centerNode))
      belowDist = (belowRep.head.layer - below.getMargin().top)
        - (nNode.head.layer + centerNode.getSize().y + centerNode.getMargin().bottom)
        - spacing
    }

    // same space on both sides, check again later
    if (probe && Math.abs(aboveDist - belowDist) <= EPSILON) {
      return true
    }

    // O--a--o--b--O--c--o--d--O
    const a = +NetworkSimplexPlacer.length(leftEdge.left)
    const b = -NetworkSimplexPlacer.length(leftEdge.right)
    const c = -NetworkSimplexPlacer.length(rightEdge.left)
    const d = +NetworkSimplexPlacer.length(rightEdge.right)

    const caseD = leftEdge.notStraightBy() > 0 && rightEdge.notStraightBy() < 0
    const caseC = leftEdge.notStraightBy() < 0 && rightEdge.notStraightBy() > 0
    const caseB = leftEdge.left.target.layer + leftEdge.right.delta < rightEdge.right.target.layer + rightEdge.left.delta
    const caseA = leftEdge.left.target.layer + leftEdge.right.delta > rightEdge.right.target.layer + rightEdge.left.delta

    let move = 0
    if (!caseD && !caseC) {
      if (caseA) {
        if (aboveDist + c > 0) {
          move = c
        } else if (belowDist - a > 0) {
          move = a
        }
      } else if (caseB) {
        if (aboveDist + b > 0) {
          move = b
        } else if (belowDist - d > 0) {
          move = d
        }
      }
    }

    // move the center node
    nNode.head.layer += move
    if (nNode.isFlexible) {
      nNode.tail.layer += move
    }

    return false
  }

  // ------------------------------------------------------------------------------------------------
  //                                      Path identification
  // ------------------------------------------------------------------------------------------------

  private identifyPaths(): Path[] {
    const paths: Path[] = []
    for (const l of this.lGraph.getLayers()) {
      for (const n of l.getNodes()) {
        if (this.nodeState[n.id] !== JUNCTION) continue
        for (const e of n.getConnectedEdges()) {
          if (!this.isHandledEdge(e)) continue
          const path = this.follow(e, n, new Path())
          if (path.length > 1) {
            paths.push(path)
          }
        }
      }
    }
    return paths
  }

  private follow(edge: LEdge, current: LNode, path: Path): Path {
    const other = edge.getOtherNode(current)!
    path.push(edge)

    // stop criteria
    if (this.nodeState[other.id] === VISITED
      || this.nodeState[other.id] === JUNCTION
      || this.crossing[edge.id]) {
      return path
    }

    // recurse
    this.nodeState[other.id] = VISITED
    for (const incident of other.getConnectedEdges()) {
      if (!this.isHandledEdge(incident) || incident === edge) {
        continue
      }
      return this.follow(incident, other, path)
    }

    return path
  }

  /** 节点状态: junction = 入/出度 > 1 或叶子 (对应 ELK getNodeState). */
  private static getNodeState(node: LNode): number {
    let inco = 0
    let ouco = 0
    for (const p of node.getPorts()) {
      for (const e of p.getIncomingEdges()) {
        if (!e.isSelfLoop()) inco++
      }
      for (const e of p.getOutgoingEdges()) {
        if (!e.isSelfLoop()) ouco++
      }
      if (inco > 1 || ouco > 1) {
        return JUNCTION
      }
    }
    if (inco + ouco === 1) {
      return JUNCTION
    }
    return OTHER
  }

  // ------------------------------------------------------------------------------------------------
  //                                      Mark Crossings
  // ------------------------------------------------------------------------------------------------

  /** 标记所有参与交叉的边 (对应 ELK markEdgeCrossings). */
  private markEdgeCrossings(): void {
    this.crossing = new Array(this.edgeCount).fill(false)
    const layers = this.lGraph.getLayers()
    for (let i = 0; i + 1 < layers.length; i++) {
      this.markCrossingEdges(layers[i]!, layers[i + 1]!)
    }
  }

  /** 标记两层之间的边交叉 (对应 ELK markCrossingEdges). */
  private markCrossingEdges(left: import('../graph/layer.js').Layer, right: import('../graph/layer.js').Layer): void {
    const openEdges: LEdge[] = []

    // add all edges in the order they occur in the left layer
    for (const node of left.getNodes()) {
      for (const port of node.getPortSideView(PortSide.EAST)) {
        for (const edge of port.getOutgoingEdges()) {
          if (edge.isInLayerEdge() || edge.isSelfLoop() || edge.getTarget()!.getNode()!.getLayer() !== right) {
            continue
          }
          openEdges.push(edge)
        }
      }
    }

    // close the edges one after another, recording edge crossings
    for (let ri = right.getNodes().length - 1; ri >= 0; ri--) {
      const node = right.getNodes()[ri]!
      for (const port of node.getPortSideView(PortSide.WEST)) { // don't reverse, bottom up is correct
        for (const edge of port.getIncomingEdges()) {
          if (edge.isInLayerEdge() || edge.isSelfLoop() || edge.getSource()!.getNode()!.getLayer() !== left) {
            continue
          }
          if (openEdges.length > 0) {
            let it = openEdges.length - 1
            let last = openEdges[it]!
            while (last !== edge && it > 0) {
              // mark both edges as being part of an edge crossing
              this.crossing[last.id] = true
              this.crossing[edge.id] = true
              it--
              last = openEdges[it]!
            }
            if (last === edge && it > 0) {
              openEdges.splice(it, 1)
            }
          }
        }
      }
    }
  }


  /** 对应 ELK insertFlexibleWhereSpaceAuxiliaryEdges: 全局 source/sink 固定非弹性节点位置,
   *  弹性节点只能增大 (delta 保证不超出层范围). */
  private insertFlexibleWhereSpaceAuxiliaryEdges(): void {
    let minLayer = Number.POSITIVE_INFINITY
    let maxLayer = Number.NEGATIVE_INFINITY
    for (const n of this.nGraph.nodes) {
      if (n.layer < minLayer) minLayer = n.layer
      if (n.layer > maxLayer) maxLayer = n.layer
    }
    const usedLayers = maxLayer - minLayer

    const globalSource = nn().create(this.nGraph)
    const globalSink = nn().create(this.nGraph)

    // 保证 source → sink 距离 = 总层数 (整体不收缩).
    ne().weight(NODE_SIZE_WEIGHT_STATIC * 2).delta(usedLayers).source(globalSource).target(globalSink).create()

    // 固定多数非弹性节点位置, 弹性节点只能增大 (叶子节点允许移动).
    for (const nr of this.nodeReps) {
      if (nr === undefined) continue
      if (nr.origin.getType() !== NodeType.NORMAL) continue
      if (nr.origin.getPorts().length <= 1) continue // allow leaves to move
      ne().weight(0).delta(nr.tail.layer - minLayer).source(globalSource).target(nr.tail).create()
      ne().weight(0).delta(usedLayers - nr.head.layer).source(nr.head).target(globalSink).create()
    }
  }

  private applyPositions(): void {
    for (const l of this.lGraph.getLayers()) {
      for (const lNode of l.getNodes()) {
        const nodeRep = this.nodeReps[lNode.id]!
        const minY = nodeRep.head.layer
        const maxY = nodeRep.tail.layer

        lNode.getPosition().y = minY
        const sizeDelta = (maxY - minY) - lNode.getSize().y

        const flexible = isFlexibleNode(lNode)
        const nf = getNodeFlexibility(lNode)
        if (flexible && isFlexibleSizeWhereSpacePermits(nf)) {
          lNode.getSize().y += sizeDelta
        }
        if (flexible && (nf === NodeFlexibility.PORT_POSITION || isFlexibleSizeWhereSpacePermits(nf))) {
          for (const p of lNode.getPorts()) {
            if (SIDES_EAST_WEST.includes(p.getSide())) {
              const nNode = this.portMap.get(p)!
              p.getPosition().y = nNode.layer - minY
            }
          }
        }
      }
    }
  }

  private getEdgeWeight(edge: LEdge): number {
    const priority = Math.max(1, edge.getProperty(PRIORITY_STRAIGHTNESS))
    const n1 = edge.getSource()!.getNode()!.getType()
    const n2 = edge.getTarget()!.getNode()!.getType()
    let edgeTypeWeight: number
    if (n1 === NodeType.NORMAL && n2 === NodeType.NORMAL) edgeTypeWeight = 1 * EDGE_WEIGHT_BASE
    else if (n1 === NodeType.NORMAL || n2 === NodeType.NORMAL) edgeTypeWeight = 2 * EDGE_WEIGHT_BASE
    else edgeTypeWeight = 8 * EDGE_WEIGHT_BASE
    return priority * edgeTypeWeight
  }

  private isHandledEdge(edge: LEdge): boolean {
    return !edge.isSelfLoop() && !edge.isInLayerEdge()
  }
}
