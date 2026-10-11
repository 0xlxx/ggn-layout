/**
 * SplineSegment (对应 ELK p5edges.splines.SplineSegment).
 *
 * 表示相邻两层之间的 spline 段 (可代表多条边组成的 hyperedge).
 * 本移植只保留层间距计算所需状态:
 *   - leftPorts/rightPorts: 段两侧端口
 *   - isStraight: 源/目标端口 y 差 < MAX_VERTICAL_DIFF_FOR_STRAIGHT (0.2)
 *   - rank: 段在层间垂直槽位 (依赖图拓扑编号, SplineEdgeRouter.topologicalNumbering)
 *   - hyperEdgeTopYPos/BottomYPos: 段 y 区间 (依赖图建边判断重叠用)
 */
import type { LPort } from '../../graph/lport.js'
import type { LEdge } from '../../graph/ledge.js'

/** 段边界框 (用于依赖重叠判断, 对应 ELK ElkRectangle). */
export interface SplineBoundingBox {
  x: number
  y: number
  width: number
  height: number
}

export class SplineDependency {
  source: SplineSegment
  target: SplineSegment
  readonly weight: number

  constructor(source: SplineSegment, target: SplineSegment, weight: number) {
    this.source = source
    this.target = target
    this.weight = weight
    source.outgoing.push(this)
    target.incoming.push(this)
  }
}

const HYPEREDGE_POS_OUTER_RATE = 0.9
const HYPEREDGE_POS_MID_RATE = 1 - HYPEREDGE_POS_OUTER_RATE
const ONE_HALF = 0.5

/** 段内单边信息 (FinalSplineBendpointsCalculator 用; 对应 ELK SplineSegment.EdgeInformation). */
export interface EdgeInformation {
  startY: number
  endY: number
  normalSourceNode: boolean
  normalTargetNode: boolean
  invertedLeft: boolean
  invertedRight: boolean
}

export class SplineSegment {
  // 循环断开/拓扑编号状态 (对应 ELK 同名成员).
  mark = 0
  inweight = 0
  outweight = 0
  rank = 0
  outgoing: SplineDependency[] = []
  incoming: SplineDependency[] = []

  leftPorts: LPort[] = []
  rightPorts: LPort[] = []
  edges: LEdge[] = []
  boundingBox: SplineBoundingBox = { x: 0, y: 0, width: 0, height: 0 }
  xDelta = 0
  isWestOfInitialLayer = false
  isStraight = false
  centerControlPointY = 0
  hyperEdgeTopYPos = 0
  hyperEdgeBottomYPos = 0
  // FinalSplineBendpointsCalculator 状态 (对应 ELK 同名成员).
  handled = false
  sourcePort: LPort | null = null
  targetPort: LPort | null = null
  initialSegment = false
  lastSegment = false
  sourceNode: import('../../graph/lnode.js').LNode | null = null
  targetNode: import('../../graph/lnode.js').LNode | null = null
  inverseOrder = false
  edgeInformation = new Map<LEdge, EdgeInformation>()

  private constructor() {}

  /** 记录边信息 (对应 ELK SplineSegment.addEdge, line 232-243). */
  private addEdge(edge: LEdge): void {
    this.edges.push(edge)
    const src = edge.getSource()!
    const tgt = edge.getTarget()!
    this.edgeInformation.set(edge, {
      startY: SplineSegment.anchorY(src),
      endY: SplineSegment.anchorY(tgt),
      normalSourceNode: isNormalNode(src.getNode()!),
      normalTargetNode: isNormalNode(tgt.getNode()!),
      invertedLeft: src.getSide() === 'WEST',
      invertedRight: tgt.getSide() === 'EAST',
    })
  }

  isHyperEdge(): boolean {
    return this.edges.length > 1
  }

  /** 端口绝对锚点 y (对应 SplineSegment.anchorY, line 245-251; NS 端口 ggn 暂无 SPLINE_NS_PORT_Y_COORD, 统一绝对锚点). */
  private static anchorY(port: LPort): number {
    return port.getAbsoluteAnchor().y
  }

  /** 单边段构造 (对应 ELK 单边构造器, SplineSegment.java line 208-230). */
  static fromSingleEdge(
    edge: LEdge,
    sourceSide: 'LEFT' | 'RIGHT',
    targetSide: 'LEFT' | 'RIGHT',
    isStraightFn: (a: number, b: number) => boolean,
  ): SplineSegment {
    const seg = new SplineSegment()
    const source = edge.getSource()!
    const target = edge.getTarget()!
    if (sourceSide === 'LEFT') seg.leftPorts.push(source)
    else seg.rightPorts.push(source)
    if (targetSide === 'LEFT') seg.leftPorts.push(target)
    else seg.rightPorts.push(target)
    seg.addEdge(edge)
    const sourceY = SplineSegment.anchorY(source)
    const targetY = SplineSegment.anchorY(target)
    seg.setRelevantPositions(sourceY, targetY, targetY)
    seg.isStraight = isStraightFn(sourceY, targetY)
    return seg
  }

  /** 1:n hyperedge 段构造 (对应 ELK hyperedge 构造器, SplineSegment.java line 155-196). */
  static fromHyperEdge(
    singlePort: LPort,
    edges: { side: 'LEFT' | 'RIGHT'; edge: LEdge }[],
    sourceSide: 'LEFT' | 'RIGHT',
  ): SplineSegment {
    const seg = new SplineSegment()
    if (sourceSide === 'LEFT') seg.leftPorts.push(singlePort)
    else seg.rightPorts.push(singlePort)

    let yMinPosOfTarget = Number.POSITIVE_INFINITY
    let yMaxPosOfTarget = Number.NEGATIVE_INFINITY

    for (const { side, edge } of edges) {
      const src = edge.getSource()!
      const tgt = edge.getTarget()!
      let tgtPort = src
      if (tgtPort === singlePort) tgtPort = tgt
      if (side === 'LEFT') seg.leftPorts.push(tgtPort)
      else seg.rightPorts.push(tgtPort)
      const yPosOfTarget = SplineSegment.anchorY(tgtPort)
      yMinPosOfTarget = Math.min(yMinPosOfTarget, yPosOfTarget)
      yMaxPosOfTarget = Math.max(yMaxPosOfTarget, yPosOfTarget)
    }

    const yPosOfSingleSide = SplineSegment.anchorY(singlePort)
    seg.setRelevantPositions(yPosOfSingleSide, yMinPosOfTarget, yMaxPosOfTarget)
    for (const { edge } of edges) seg.addEdge(edge)
    seg.isStraight = false
    return seg
  }

  /** 设置 centerControlPointY + 段 y 区间 (对应 SplineSegment.setRelevantPositions, line 284-303). */
  private setRelevantPositions(sourceY: number, targetYMin: number, targetYMax: number): void {
    this.boundingBox.y = Math.min(sourceY, targetYMin)
    this.boundingBox.height = Math.max(sourceY, targetYMax) - this.boundingBox.y

    if (sourceY < targetYMin) {
      // source lays below all target ports
      this.centerControlPointY = ONE_HALF * (sourceY + targetYMin)
      this.hyperEdgeTopYPos = HYPEREDGE_POS_MID_RATE * this.centerControlPointY + HYPEREDGE_POS_OUTER_RATE * sourceY
      this.hyperEdgeBottomYPos = HYPEREDGE_POS_MID_RATE * this.centerControlPointY + HYPEREDGE_POS_OUTER_RATE * targetYMin
    } else {
      // source lays above all target ports
      this.centerControlPointY = ONE_HALF * (sourceY + targetYMax)
      this.hyperEdgeTopYPos = HYPEREDGE_POS_MID_RATE * this.centerControlPointY + HYPEREDGE_POS_OUTER_RATE * targetYMax
      this.hyperEdgeBottomYPos = HYPEREDGE_POS_MID_RATE * this.centerControlPointY + HYPEREDGE_POS_OUTER_RATE * sourceY
    }
  }
}

/** ELK SplineEdgeRouter.isNormalNode: NORMAL/BIG_NODE/BREAKING_POINT 视为正常节点. */
export function isNormalNode(node: import('../../graph/lnode.js').LNode): boolean {
  const t: string = node.getType()
  return t === 'NORMAL' || t === 'BIG_NODE' || t === 'BREAKING_POINT'
}
