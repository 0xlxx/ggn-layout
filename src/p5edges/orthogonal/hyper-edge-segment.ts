/**
 * HyperEdgeSegment (对应 ELK p5edges.orthogonal.HyperEdgeSegment).
 */
import type { LPort } from '../../graph/lport.js'
import type { HyperEdgeSegmentDependency } from './hyper-edge-segment-dependency.js'

export const TOLERANCE = 1e-3

/** WEST_TO_EAST 路由方向策略 (ELK WestToEastRoutingStrategy). */
export const sourcePortSide = 'EAST'
export const targetPortSide = 'WEST'

/** ELK getPortPositionOnHyperNode: 端口绝对 y. */
export function portPositionOnHyperNode(port: LPort): number {
  const n = port.getNode()!
  return n.position.y + port.getPosition().y + port.getAnchor().y
}

export type PortPositionFn = (port: LPort) => number

export class HyperEdgeSegment {
  /** 线性序 mark (HyperEdgeCycleDetector). */
  mark = 0
  private readonly positionFn: PortPositionFn
  private readonly srcSide: string
  private splitPartner: HyperEdgeSegment | null = null
  private splitBy: HyperEdgeSegment | null = null

  /** 方向参数化 (默认 W-E): positionFn 取端口绝对坐标, srcSide 决定 incoming/outgoing 分类. */
  constructor(positionFn: PortPositionFn = portPositionOnHyperNode, srcSide: string = sourcePortSide) {
    this.positionFn = positionFn
    this.srcSide = srcSide
  }
  private routingSlot = 0
  private readonly ports: LPort[] = []
  private startPosition = Number.NaN
  private endPosition = Number.NaN
  private readonly incomingConnectionCoordinates: number[] = []
  private readonly outgoingConnectionCoordinates: number[] = []
  private readonly incomingSegmentDependencies: HyperEdgeSegmentDependency[] = []
  private readonly outgoingSegmentDependencies: HyperEdgeSegmentDependency[] = []
  private inWeight = 0
  private outWeight = 0
  private criticalInWeight = 0
  private criticalOutWeight = 0

  /**
   * 添加端口位置 + 递归添加连接端口 (hyperedge 分组).
   * extent 只在整棵递归完成后重算一次 (结果只依赖最终坐标列表, 与逐次重算一致).
   */
  addPortPositions(port: LPort, hyperEdgeSegmentMap: Map<LPort, HyperEdgeSegment>, topLevel = true): void {
    hyperEdgeSegmentMap.set(port, this)
    this.ports.push(port)
    const portPos = this.positionFn(port)
    if (port.getSide() === this.srcSide) {
      insertSorted(this.incomingConnectionCoordinates, portPos)
    } else {
      insertSorted(this.outgoingConnectionCoordinates, portPos)
    }
    // 免分配: 真 LPort 走 getIncomingEdges/getOutgoingEdges (incoming 先, outgoing 后, 与
    // getConnectedPorts 顺序一致); 测试 mock 无这两个方法时回退 getConnectedPorts.
    const inEdges = port.getIncomingEdges?.()
    if (inEdges !== undefined) {
      for (const e of inEdges) {
        const other = e.getSource() === port ? e.getTarget()! : e.getSource()!
        if (!hyperEdgeSegmentMap.has(other)) {
          this.addPortPositions(other, hyperEdgeSegmentMap, false)
        }
      }
      for (const e of port.getOutgoingEdges()) {
        const other = e.getSource() === port ? e.getTarget()! : e.getSource()!
        if (!hyperEdgeSegmentMap.has(other)) {
          this.addPortPositions(other, hyperEdgeSegmentMap, false)
        }
      }
    } else {
      for (const otherPort of port.getConnectedPorts()) {
        if (!hyperEdgeSegmentMap.has(otherPort)) {
          this.addPortPositions(otherPort, hyperEdgeSegmentMap, false)
        }
      }
    }
    if (topLevel) this.recomputeExtent()
  }

  getPorts(): LPort[] { return this.ports }
  getSplitPartner(): HyperEdgeSegment | null { return this.splitPartner }
  setSplitPartner(partner: HyperEdgeSegment | null): void { this.splitPartner = partner }
  getSplitBy(): HyperEdgeSegment | null { return this.splitBy }
  setSplitBy(cause: HyperEdgeSegment | null): void { this.splitBy = cause }
  /** ELK isDummy: 有 partner 但非 split-by 触发者 (split 产生的另一半, 弯点由其 partner 生成). */
  isDummy(): boolean { return this.splitPartner !== null && this.splitBy === null }
  /** ELK getLength: 起止坐标跨度. */
  getLength(): number { return this.endPosition - this.startPosition }
  /** ELK representsHyperedge: 连接 >2 个端口 (超边). */
  representsHyperedge(): boolean { return this.ports.length > 2 }
  getRoutingSlot(): number { return this.routingSlot }
  setRoutingSlot(slot: number): void { this.routingSlot = slot }
  getStartCoordinate(): number { return this.startPosition }
  getEndCoordinate(): number { return this.endPosition }
  getIncomingConnectionCoordinates(): number[] { return this.incomingConnectionCoordinates }
  getOutgoingConnectionCoordinates(): number[] { return this.outgoingConnectionCoordinates }
  getIncomingSegmentDependencies(): HyperEdgeSegmentDependency[] { return this.incomingSegmentDependencies }
  getOutgoingSegmentDependencies(): HyperEdgeSegmentDependency[] { return this.outgoingSegmentDependencies }
  getInWeight(): number { return this.inWeight }
  setInWeight(w: number): void { this.inWeight = w }
  getOutWeight(): number { return this.outWeight }
  setOutWeight(w: number): void { this.outWeight = w }
  getCriticalInWeight(): number { return this.criticalInWeight }
  setCriticalInWeight(w: number): void { this.criticalInWeight = w }
  getCriticalOutWeight(): number { return this.criticalOutWeight }
  setCriticalOutWeight(w: number): void { this.criticalOutWeight = w }

  /** ELK splitAt: 在 splitPosition 处拆分 — outgoing 连接移到 partner, 原段经 splitPosition 连接. */
  splitAt(splitPosition: number): HyperEdgeSegment {
    this.splitPartner = new HyperEdgeSegment(this.positionFn, this.srcSide)
    this.splitPartner.setSplitPartner(this)
    this.splitPartner.outgoingConnectionCoordinates.push(...this.outgoingConnectionCoordinates)
    this.outgoingConnectionCoordinates.length = 0
    this.outgoingConnectionCoordinates.push(splitPosition)
    this.splitPartner.incomingConnectionCoordinates.push(splitPosition)
    this.recomputeExtent()
    this.splitPartner.recomputeExtent()
    // 清空依赖 (split 后重新生成)
    while (this.incomingSegmentDependencies.length > 0) this.incomingSegmentDependencies[0]!.remove()
    while (this.outgoingSegmentDependencies.length > 0) this.outgoingSegmentDependencies[0]!.remove()
    return this.splitPartner
  }

  /** ELK simulateSplit: 返回 (split 段, partner 段) 的副本 (仅用于选区评级, 不改原段). */
  // 与 Java 一致: 第一段保留 incoming (模拟「本段拆分后」), 第二段保留 outgoing (模拟 partner);
  // extent 各自用保留的连接坐标重算 (Java recomputeExtent). 之前 incoming/outgoing 写反,
  // 导致 rateArea 对 partner 段丢失原 outgoing 坐标 → 多 free area 时选错 split 位置 → 中间 S 弯点错.
  simulateSplit(): [HyperEdgeSegment, HyperEdgeSegment] {
    const newSplit = new HyperEdgeSegment(this.positionFn, this.srcSide)
    const newSplitPartner = new HyperEdgeSegment(this.positionFn, this.srcSide)
    newSplit.splitBy = this.splitBy
    newSplit.splitPartner = newSplitPartner
    newSplitPartner.splitPartner = newSplit
    newSplit.incomingConnectionCoordinates.push(...this.incomingConnectionCoordinates)
    newSplit.recomputeExtent()
    newSplitPartner.outgoingConnectionCoordinates.push(...this.outgoingConnectionCoordinates)
    newSplitPartner.recomputeExtent()
    return [newSplit, newSplitPartner]
  }

  private recomputeExtent(): void {
    this.startPosition = Number.NaN
    this.endPosition = Number.NaN
    this.recomputeExtentList(this.incomingConnectionCoordinates)
    this.recomputeExtentList(this.outgoingConnectionCoordinates)
  }

  private recomputeExtentList(positions: number[]): void {
    if (positions.length === 0) return
    if (Number.isNaN(this.startPosition)) {
      this.startPosition = positions[0]!
    } else {
      this.startPosition = Math.min(this.startPosition, positions[0]!)
    }
    if (Number.isNaN(this.endPosition)) {
      this.endPosition = positions[positions.length - 1]!
    } else {
      this.endPosition = Math.max(this.endPosition, positions[positions.length - 1]!)
    }
  }
}

/** 二分插入 (保持严格升序 + 去重, 与线性版语义一致). */
function insertSorted(list: number[], value: number): void {
  let lo = 0
  let hi = list.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    const next = list[mid]!
    if (next === value) return
    if (next > value) hi = mid
    else lo = mid + 1
  }
  list.splice(lo, 0, value)
}
