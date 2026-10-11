/**
 * OrthogonalRoutingGenerator (对应 ELK p5edges.orthogonal.OrthogonalRoutingGenerator, 槽数计算子集).
 * 计算两层层间路由所需的路由槽数 (topological numbering 的最大 rank + 1).
 * 完整 bendPoints 生成暂不移植 (坐标差分不检查边).
 */
import type { LNode } from '../../graph/lnode.js'
import type { LPort } from '../../graph/lport.js'
import { PortSide } from '../../graph/enums.js'
import type { JavaRandom } from '../../util/java-random.js'
import { HyperEdgeCycleDetector } from './hyper-edge-cycle-detector.js'
import { HyperEdgeSegment, TOLERANCE, portPositionOnHyperNode, sourcePortSide } from './hyper-edge-segment.js'
import type { PortPositionFn } from './hyper-edge-segment.js'
import { HyperEdgeSegmentDependency } from './hyper-edge-segment-dependency.js'
import { splitSegments } from './hyper-edge-segment-splitter.js'

const CONFLICT_THRESHOLD_FACTOR = 0.5

/**
 * 路由方向策略 (对应 ELK p5edges.orthogonal.direction.BaseRoutingDirectionStrategy 子类).
 * - WEST_TO_EAST: 常规层间路由 (sourcePortSide=EAST, targetPortSide=WEST, 位置=绝对 y).
 * - SOUTH_TO_NORTH: N 外部端口边路由 (HierarchicalPortOrthogonalEdgeRouter 北向, 位置=绝对 x).
 * - NORTH_TO_SOUTH: S 外部端口边路由 (HierarchicalPortOrthogonalEdgeRouter 南向, 位置=绝对 x).
 */
export interface RoutingDirectionStrategy {
  /** 源层端口侧 (createHyperEdgeSegments 过滤输出端口). */
  sourceSide: PortSide
  /** 目标层端口侧. */
  targetSide: PortSide
  /** 端口在超边轴上的位置 (getPortPositionOnHyperNode). */
  positionFn: (port: LPort) => number
}

/** ELK WestToEastRoutingStrategy. */
export const WEST_TO_EAST: RoutingDirectionStrategy = {
  sourceSide: PortSide.EAST,
  targetSide: PortSide.WEST,
  positionFn: portPositionOnHyperNode,
}

/** ELK SouthToNorthRoutingStrategy (北向外部端口): getPortPositionOnHyperNode = node.x + port.x + anchor.x. */
export const SOUTH_TO_NORTH: RoutingDirectionStrategy = {
  sourceSide: PortSide.NORTH,
  targetSide: PortSide.SOUTH,
  positionFn: nsPortPositionOnHyperNode,
}

/** ELK NorthToSouthRoutingStrategy (南向外部端口): getPortPositionOnHyperNode = node.x + port.x + anchor.x. */
export const NORTH_TO_SOUTH: RoutingDirectionStrategy = {
  sourceSide: PortSide.SOUTH,
  targetSide: PortSide.NORTH,
  positionFn: nsPortPositionOnHyperNode,
}

/** ELK N-S 策略的 getPortPositionOnHyperNode: 端口绝对 x. */
function nsPortPositionOnHyperNode(port: LPort): number {
  const n = port.getNode()!
  return n.position.x + port.getPosition().x + port.getAnchor().x
}
const CRITICAL_CONFLICT_THRESHOLD_FACTOR = 0.2
const CONFLICT_PENALTY = 1
const CROSSING_PENALTY = 16
const CRITICAL_CONFLICTS_DETECTED = -1

export class OrthogonalRoutingGenerator {
  private criticalConflictThreshold = 0
  private readonly edgeSpacing: number
  private readonly conflictThreshold: number

  constructor(edgeSpacing: number) {
    this.edgeSpacing = edgeSpacing
    this.conflictThreshold = CONFLICT_THRESHOLD_FACTOR * edgeSpacing
  }
  /** 跨 routeEdges* 调用复用的 scratch 缓冲 (调用间不嵌套; 每调用开头清空). */
  private readonly edgeSegmentsScratch: HyperEdgeSegment[] = []
  private readonly portToEdgeSegmentMapScratch = new Map<LPort, HyperEdgeSegment>()
  private readonly incomingCoordsScratch: number[] = []
  private readonly outgoingCoordsScratch: number[] = []

  /** 计算 source 层与 target 层之间的路由槽数 (不生成弯点). */
  routeEdgesSlotCount(sourceLayerNodes: LNode[] | null, targetLayerNodes: LNode[] | null, random: JavaRandom): number {
    return this.routeEdgesInternal(sourceLayerNodes, targetLayerNodes, random, Number.NaN)
  }

  /**
   * ELK OrthogonalRoutingGenerator.routeEdges: 计算槽数 + 生成边弯点 (WestToEast).
   * @param startPos 本路由区起始 x (ELK: leftLayer==null ? xpos : xpos + edgeNodeSpacing).
   * @returns 槽数 (rankCount + 1 + criticalSplitCount 近似).
   */
  routeEdges(sourceLayerNodes: LNode[] | null, targetLayerNodes: LNode[] | null, startPos: number, random: JavaRandom): number {
    return this.routeEdgesInternal(sourceLayerNodes, targetLayerNodes, random, startPos)
  }

  private routeEdgesInternal(
    sourceLayerNodes: LNode[] | null, targetLayerNodes: LNode[] | null, random: JavaRandom, startPos: number,
  ): number {
    const edgeSegments = this.edgeSegmentsScratch
    edgeSegments.length = 0
    const portToEdgeSegmentMap = this.portToEdgeSegmentMapScratch
    portToEdgeSegmentMap.clear()

    this.createHyperEdgeSegments(sourceLayerNodes, PortSide.EAST, edgeSegments, portToEdgeSegmentMap)
    this.createHyperEdgeSegments(targetLayerNodes, PortSide.WEST, edgeSegments, portToEdgeSegmentMap)
    if (process.env.GGN_OER_DBG) console.error('GGN segs src=' + (sourceLayerNodes?.length ?? 'null') + ' tgt=' + (targetLayerNodes?.length ?? 'null') + ' count=' + edgeSegments.length)

    // 空路由区 (两侧都无边): 直接返回 0 — 无段 → 无依赖/无断环/无拓扑编号/无随机消耗,
    // 与完整流程 (rankCount=-1 → 0) 逐位等价.
    if (edgeSegments.length === 0) return 0

    this.criticalConflictThreshold = CRITICAL_CONFLICT_THRESHOLD_FACTOR
      * this.minimumHorizontalSegmentDistance(edgeSegments)

    let criticalDependencyCount = 0
    let anyDependencies = false
    for (let firstIdx = 0; firstIdx < edgeSegments.length - 1; firstIdx++) {
      const firstSegment = edgeSegments[firstIdx]!
      for (let secondIdx = firstIdx + 1; secondIdx < edgeSegments.length; secondIdx++) {
        criticalDependencyCount += this.createDependencyIfNecessary(firstSegment, edgeSegments[secondIdx]!)
        if (!anyDependencies && (firstSegment.getOutgoingSegmentDependencies().length > 0
          || edgeSegments[secondIdx]!.getOutgoingSegmentDependencies().length > 0)) {
          anyDependencies = true
        }
      }
    }

    // ELK breakCriticalCycles: critical 依赖 ≥2 时可能存在 critical 环 → HyperEdgeSegmentSplitter 拆分段
    // (产生 S 形弯点消除重叠; split 的 partner 加入 edgeSegments, 参与拓扑编号 → 槽数自动含新段).
    // 无任何依赖时跳过断环 (detectCycles 对无依赖图返回空且不消耗随机, 跳过逐位等价).
    if (anyDependencies) {
      if (criticalDependencyCount >= 2) {
        const cycleDependencies = HyperEdgeCycleDetector.detectCycles(edgeSegments, true, random)
        if (process.env.GGN_OER_DBG) console.error(`GGN cycleDeps=${cycleDependencies.length} ${cycleDependencies.map(d => `${d.getSource()?.getStartCoordinate().toFixed(1)}->${d.getTarget()?.getStartCoordinate().toFixed(1)}`).join(',')}`)
        splitSegments(cycleDependencies, edgeSegments, this.criticalConflictThreshold)
      }
      if (process.env.GGN_OER_DBG) console.error(`GGN criticals=${criticalDependencyCount} segments=${edgeSegments.length}`)
      breakNonCriticalCycles(edgeSegments, random)
    }
    topologicalNumbering(edgeSegments)
    if (process.env.GGN_SEG_DBG) {
      for (const seg of edgeSegments) {
        const srcs = seg.getPorts().filter(p => p.getSide() === 'EAST').map(p => `s${p.getNode()?.id}@${Math.round(seg.getStartCoordinate())}`)
        const tgts = seg.getPorts().filter(p => p.getSide() === 'WEST').map(p => `t${p.getNode()?.id}@${Math.round(seg.getEndCoordinate())}`)
        console.error(`GGN SEG slot=${seg.getRoutingSlot()} len=${seg.getLength().toFixed(1)} ports=[${srcs.join(',')} ${tgts.join(',')}]`)
      }
    }

    // ELK routeEdges: 直线 segment (start==end) 不占路由槽, 排除后取 max routingSlot + 1.
    // (外部端口 dummy → 节点 的平直边不消耗槽位 → 子图层间距为 0, 否则多 1 槽 ×20px)
    let rankCount = -1
    for (const node of edgeSegments) {
      if (Math.abs(node.getStartCoordinate() - node.getEndCoordinate()) < TOLERANCE) continue
      rankCount = Math.max(rankCount, node.getRoutingSlot())
      // 生成正交弯点 (ELK WestToEastRoutingStrategy.calculateBendPoints).
      if (!Number.isNaN(startPos)) this.calculateBendPoints(node, startPos, this.edgeSpacing)
    }
    return rankCount + 1
  }

  /** WestToEast 弯点 (ELK calculateBendPoints): 普通 2 弯点; split 段 → S 形 4 弯点. */
  private calculateBendPoints(segment: HyperEdgeSegment, startPos: number, edgeSpacing: number): void {
    // dummy 段 (split 产生的另一半) 由 partner 生成弯点, 跳过.
    if (segment.isDummy()) return
    const segmentX = startPos + segment.getRoutingSlot() * edgeSpacing
    for (const port of segment.getPorts()) {
      const sourceNode = port.getNode()!
      const sourceY = sourceNode.position.y + port.getPosition().y + port.getAnchor().y
      for (const edge of port.getOutgoingEdges()) {
        if (edge.isSelfLoop()) continue
        const target = edge.getTarget()!
        const targetNode = target.getNode()!
        const targetY = targetNode.position.y + target.getPosition().y + target.getAnchor().y
        if (Math.abs(sourceY - targetY) > TOLERANCE) {
          let currentX = segmentX
          let currentSegment: HyperEdgeSegment = segment
          edge.getBendPoints().push({ x: currentX, y: sourceY })
          const splitPartner = segment.getSplitPartner()
          if (splitPartner !== null) {
            const splitY = splitPartner.getIncomingConnectionCoordinates()[0]!
            edge.getBendPoints().push({ x: currentX, y: splitY })
            currentX = startPos + splitPartner.getRoutingSlot() * edgeSpacing
            currentSegment = splitPartner
            edge.getBendPoints().push({ x: currentX, y: splitY })
          }
          edge.getBendPoints().push({ x: currentX, y: targetY })
          void currentSegment
        }
      }
    }
  }

  private createHyperEdgeSegments(
    nodes: LNode[] | null, portSide: PortSide, hyperEdges: HyperEdgeSegment[],
    portToHyperEdgeSegmentMap: Map<LPort, HyperEdgeSegment>,
    positionFn: PortPositionFn = portPositionOnHyperNode, srcSide: string = sourcePortSide,
  ): void {
    if (nodes === null || nodes === undefined) return
    for (const node of nodes) {
      for (const port of node.getPorts()) {
        if (port.getSide() !== portSide || port.getOutgoingEdges().length === 0) continue
        let hyperEdge = portToHyperEdgeSegmentMap.get(port)
        if (hyperEdge === undefined) {
          hyperEdge = new HyperEdgeSegment(positionFn, srcSide)
          hyperEdges.push(hyperEdge)
          hyperEdge.addPortPositions(port, portToHyperEdgeSegmentMap)
        }
      }
    }
  }

  /**
   * 方向参数化槽数 (N-S 转置): 与 routeEdgesInternal 同逻辑, 但源/目标端口侧与位置函数可指定.
   * 用于 HierarchicalPortOrthogonalEdgeRouter 的 SOUTH_TO_NORTH / NORTH_TO_SOUTH.
   */
  routeEdgesForDirection(
    sourceLayerNodes: LNode[] | null, targetLayerNodes: LNode[] | null, random: JavaRandom,
    sourceSide: PortSide, targetSide: PortSide, positionFn: PortPositionFn,
    startPos = Number.NaN,
  ): number {
    const edgeSegments = this.edgeSegmentsScratch
    edgeSegments.length = 0
    const portToEdgeSegmentMap = this.portToEdgeSegmentMapScratch
    portToEdgeSegmentMap.clear()
    this.createHyperEdgeSegments(sourceLayerNodes ?? [], sourceSide, edgeSegments, portToEdgeSegmentMap, positionFn, sourceSide)
    this.createHyperEdgeSegments(targetLayerNodes ?? [], targetSide, edgeSegments, portToEdgeSegmentMap, positionFn, sourceSide)
    if (edgeSegments.length === 0) return 0
    this.criticalConflictThreshold = CRITICAL_CONFLICT_THRESHOLD_FACTOR
      * this.minimumHorizontalSegmentDistance(edgeSegments)
    let criticalDependencyCount = 0
    let anyDependencies = false
    for (let firstIdx = 0; firstIdx < edgeSegments.length - 1; firstIdx++) {
      const firstSegment = edgeSegments[firstIdx]!
      for (let secondIdx = firstIdx + 1; secondIdx < edgeSegments.length; secondIdx++) {
        criticalDependencyCount += this.createDependencyIfNecessary(firstSegment, edgeSegments[secondIdx]!)
        if (!anyDependencies && (firstSegment.getOutgoingSegmentDependencies().length > 0
          || edgeSegments[secondIdx]!.getOutgoingSegmentDependencies().length > 0)) {
          anyDependencies = true
        }
      }
    }
    if (anyDependencies) {
      if (criticalDependencyCount >= 2) {
        const cycleDependencies = HyperEdgeCycleDetector.detectCycles(edgeSegments, true, random)
        if (process.env.GGN_OER_DBG) console.error(`GGN cycleDeps=${cycleDependencies.length} ${cycleDependencies.map(d => `${d.getSource()?.getStartCoordinate().toFixed(1)}->${d.getTarget()?.getStartCoordinate().toFixed(1)}`).join(',')}`)
        splitSegments(cycleDependencies, edgeSegments, this.criticalConflictThreshold)
      }
      breakNonCriticalCycles(edgeSegments, random)
    }
    topologicalNumbering(edgeSegments)
    if (process.env.GGN_SEG_DBG) {
      for (const seg of edgeSegments) {
        const srcs = seg.getPorts().filter(p => p.getSide() === 'EAST').map(p => `s${p.getNode()?.id}@${Math.round(seg.getStartCoordinate())}`)
        const tgts = seg.getPorts().filter(p => p.getSide() === 'WEST').map(p => `t${p.getNode()?.id}@${Math.round(seg.getEndCoordinate())}`)
        console.error(`GGN SEG slot=${seg.getRoutingSlot()} len=${seg.getLength().toFixed(1)} ports=[${srcs.join(',')} ${tgts.join(',')}]`)
      }
    }
    let rankCount = -1
    for (const node of edgeSegments) {
      if (Math.abs(node.getStartCoordinate() - node.getEndCoordinate()) < TOLERANCE) continue
      rankCount = Math.max(rankCount, node.getRoutingSlot())
      // ELK routeEdges: routingStrategy.calculateBendPoints (SOUTH_TO_NORTH / NORTH_TO_SOUTH).
      // startPos 非 NaN 时才生成弯点 (NaN = 仅统计槽数, 兼容 countRoutingSlots).
      if (!Number.isNaN(startPos)) this.calculateBendPointsForDirection(node, startPos, this.edgeSpacing, sourceSide)
    }
    return rankCount + 1
  }

  /**
   * ELK SouthToNorthRoutingStrategy.calculateBendPoints / NorthToSouthRoutingStrategy.calculateBendPoints
   * (HierarchicalPortOrthogonalEdgeRouter Step3 北/南向路由): 为 N/S 外部端口边生成正交弯点.
   *   SOUTH_TO_NORTH (北向): sourceSide=NORTH, segmentY = startPos - slot*edgeSpacing (向上);
   *   NORTH_TO_SOUTH (南向): sourceSide=SOUTH, segmentY = startPos + slot*edgeSpacing (向下).
   * 每端口出边: (sourceX, segmentY) → [split: (splitX, segmentY), (splitX, partnerY)] → (targetX, segmentY).
   */
  private calculateBendPointsForDirection(
    segment: HyperEdgeSegment, startPos: number, edgeSpacing: number, sourceSide: PortSide,
  ): void {
    if (segment.isDummy()) return
    const goingUp = sourceSide === PortSide.NORTH
    const segmentY = startPos + (goingUp ? -1 : 1) * segment.getRoutingSlot() * edgeSpacing
    for (const port of segment.getPorts()) {
      const sourceX = nsPortPositionOnHyperNode(port)
      for (const edge of port.getOutgoingEdges()) {
        if (edge.isSelfLoop()) continue
        const target = edge.getTarget()
        if (target === null || target === undefined) continue
        const targetX = nsPortPositionOnHyperNode(target)
        if (Math.abs(sourceX - targetX) <= TOLERANCE) continue
        let currentY = segmentY
        edge.getBendPoints().push({ x: sourceX, y: currentY })
        const splitPartner = segment.getSplitPartner()
        if (splitPartner !== null) {
          const splitX = splitPartner.getIncomingConnectionCoordinates()[0]
          if (splitX !== undefined) {
            edge.getBendPoints().push({ x: splitX, y: currentY })
            currentY = startPos + (goingUp ? -1 : 1) * splitPartner.getRoutingSlot() * edgeSpacing
            edge.getBendPoints().push({ x: splitX, y: currentY })
          }
        }
        edge.getBendPoints().push({ x: targetX, y: currentY })
      }
    }
  }

  /** 返回本次创建的 critical 依赖数 (ELK createDependencyIfNecessary int 语义). */
  private createDependencyIfNecessary(he1: HyperEdgeSegment, he2: HyperEdgeSegment): number {
    if (Math.abs(he1.getStartCoordinate() - he1.getEndCoordinate()) < TOLERANCE
      || Math.abs(he2.getStartCoordinate() - he2.getEndCoordinate()) < TOLERANCE) {
      return 0
    }
    const conflicts1 = this.countConflicts(he1.getOutgoingConnectionCoordinates(), he2.getIncomingConnectionCoordinates())
    const conflicts2 = this.countConflicts(he2.getOutgoingConnectionCoordinates(), he1.getIncomingConnectionCoordinates())
    const criticalConflictsDetected = conflicts1 === CRITICAL_CONFLICTS_DETECTED
      || conflicts2 === CRITICAL_CONFLICTS_DETECTED

    if (criticalConflictsDetected) {
      let criticalCount = 0
      if (conflicts1 === CRITICAL_CONFLICTS_DETECTED) {
        HyperEdgeSegmentDependency.createAndAddCritical(he2, he1)
        criticalCount++
      }
      if (conflicts2 === CRITICAL_CONFLICTS_DETECTED) {
        HyperEdgeSegmentDependency.createAndAddCritical(he1, he2)
        criticalCount++
      }
      return criticalCount
    } else {
      const crossings1 = countCrossings(he1.getOutgoingConnectionCoordinates(), he2.getStartCoordinate(), he2.getEndCoordinate())
        + countCrossings(he2.getIncomingConnectionCoordinates(), he1.getStartCoordinate(), he1.getEndCoordinate())
      const crossings2 = countCrossings(he2.getOutgoingConnectionCoordinates(), he1.getStartCoordinate(), he1.getEndCoordinate())
        + countCrossings(he1.getIncomingConnectionCoordinates(), he2.getStartCoordinate(), he2.getEndCoordinate())
      const depValue1 = CONFLICT_PENALTY * conflicts1 + CROSSING_PENALTY * crossings1
      const depValue2 = CONFLICT_PENALTY * conflicts2 + CROSSING_PENALTY * crossings2
      if (depValue1 < depValue2) {
        HyperEdgeSegmentDependency.createAndAddRegular(he1, he2, depValue2 - depValue1)
      } else if (depValue1 > depValue2) {
        HyperEdgeSegmentDependency.createAndAddRegular(he2, he1, depValue1 - depValue2)
      } else if (depValue1 > 0 && depValue2 > 0) {
        HyperEdgeSegmentDependency.createAndAddRegular(he1, he2, 0)
        HyperEdgeSegmentDependency.createAndAddRegular(he2, he1, 0)
      }
      return 0
    }
  }

  private countConflicts(posis1: number[], posis2: number[]): number {
    let conflicts = 0
    if (posis1.length > 0 && posis2.length > 0) {
      let iter1 = 0
      let iter2 = 0
      let pos1 = posis1[0]!
      let pos2 = posis2[0]!
      let hasMore = true
      do {
        if (pos1 > pos2 - this.criticalConflictThreshold && pos1 < pos2 + this.criticalConflictThreshold) {
          return -1
        } else if (pos1 > pos2 - this.conflictThreshold && pos1 < pos2 + this.conflictThreshold) {
          conflicts++
        }
        if (pos1 <= pos2 && iter1 + 1 < posis1.length) {
          pos1 = posis1[++iter1]!
        } else if (pos2 <= pos1 && iter2 + 1 < posis2.length) {
          pos2 = posis2[++iter2]!
        } else {
          hasMore = false
        }
      } while (hasMore)
    }
    return conflicts
  }

  private minimumHorizontalSegmentDistance(edgeSegments: HyperEdgeSegment[]): number {
    const incoming = this.incomingCoordsScratch
    const outgoing = this.outgoingCoordsScratch
    incoming.length = 0
    outgoing.length = 0
    for (const segment of edgeSegments) {
      incoming.push(...segment.getIncomingConnectionCoordinates())
      outgoing.push(...segment.getOutgoingConnectionCoordinates())
    }
    return Math.min(minimumDifference(incoming), minimumDifference(outgoing))
  }
}

function minimumDifference(numbers: number[]): number {
  numbers.sort((a, b) => a - b)
  let minDifference = Number.MAX_VALUE
  if (numbers.length >= 2) {
    for (let i = 1; i < numbers.length; i++) {
      if (numbers[i]! !== numbers[i - 1]) {
        minDifference = Math.min(minDifference, numbers[i]! - numbers[i - 1]!)
      }
    }
  }
  return minDifference
}

export function countCrossings(posis: number[], start: number, end: number): number {
  let crossings = 0
  for (let i = 0; i < posis.length; i++) {
    const pos = posis[i]!
    if (pos > end) break
    else if (pos >= start) crossings++
  }
  return crossings
}

/** ELK OrthogonalRoutingGenerator.topologicalNumbering → rankCount + 1. */
export function topologicalNumbering(segments: HyperEdgeSegment[]): number {
  const sources: HyperEdgeSegment[] = []
  const rightwardTargets: HyperEdgeSegment[] = []
  for (const node of segments) {
    node.setInWeight(node.getIncomingSegmentDependencies().length)
    node.setOutWeight(node.getOutgoingSegmentDependencies().length)
    if (node.getInWeight() === 0) sources.push(node)
    if (node.getOutWeight() === 0 && node.getIncomingConnectionCoordinates().length === 0) {
      rightwardTargets.push(node)
    }
  }

  let maxRank = -1
  // 队列用头指针 (FIFO 语义与 shift 一致, 免 O(n) 平移).
  let sourceIdx = 0
  while (sourceIdx < sources.length) {
    const node = sources[sourceIdx++]!
    // ELK: 每个 segment 自身的 routingSlot 也计入 rank (单 segment 无依赖 → rank 0 → 槽数 1).
    maxRank = Math.max(maxRank, node.getRoutingSlot())
    for (const dep of node.getOutgoingSegmentDependencies()) {
      const target = dep.getTarget()!
      target.setRoutingSlot(Math.max(target.getRoutingSlot(), node.getRoutingSlot() + 1))
      maxRank = Math.max(maxRank, target.getRoutingSlot())
      target.setInWeight(target.getInWeight() - 1)
      if (target.getInWeight() === 0) sources.push(target)
    }
  }

  if (maxRank > -1) {
    for (const node of rightwardTargets) {
      node.setRoutingSlot(maxRank)
    }
    let rightwardIdx = 0
    while (rightwardIdx < rightwardTargets.length) {
      const node = rightwardTargets[rightwardIdx++]!
      for (const dep of node.getIncomingSegmentDependencies()) {
        const source = dep.getSource()!
        if (source.getIncomingConnectionCoordinates().length > 0) continue
        source.setRoutingSlot(Math.min(source.getRoutingSlot(), node.getRoutingSlot() - 1))
        source.setOutWeight(source.getOutWeight() - 1)
        if (source.getOutWeight() === 0) rightwardTargets.push(source)
      }
    }
  }

  return maxRank + 1
}

export function breakNonCriticalCycles(edgeSegments: HyperEdgeSegment[], random: { nextInt(bound: number): number }): void {
  const cycleDependencies = HyperEdgeCycleDetector.detectCycles(edgeSegments, false, random as never)
  for (const cycleDependency of cycleDependencies) {
    if (cycleDependency.getWeight() === 0) {
      cycleDependency.remove()
    } else {
      cycleDependency.reverse()
    }
  }
}
