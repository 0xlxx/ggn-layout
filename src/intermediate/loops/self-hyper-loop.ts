/**
 * SelfHyperLoop (对应 ELK intermediate.loops.SelfHyperLoop).
 * 自环超边: 至少一条自环边; 路由时以一条 "trunk" 绕节点, 分支连接各端口.
 */
import { PortSide } from '../../graph/enums.js'
import { portSideOrdinal, PORT_SIDE_COUNT } from './port-side-util.js'
import type { SelfLoopHolder } from './self-loop-holder.js'
import { SelfHyperLoopLabels } from './self-hyper-loop-labels.js'
import type { SelfLoopEdge } from './self-loop-edge.js'
import type { SelfLoopPort } from './self-loop-port.js'
import { SelfLoopType, selfLoopTypeFromPortSides } from './self-loop-type.js'

export class SelfHyperLoop {
  private readonly slHolder: SelfLoopHolder
  private slPorts: SelfLoopPort[] = []
  private slEdges: Set<SelfLoopEdge> = new Set()
  private slLabels: SelfHyperLoopLabels | null = null
  private selfLoopType: SelfLoopType | null = null
  private slPortsBySide: Map<PortSide, SelfLoopPort[]> | null = null
  private leftmostPort: SelfLoopPort | null = null
  private rightmostPort: SelfLoopPort | null = null
  private occupiedPortSides: Set<PortSide> = new Set()
  private routingSlot: number[] = new Array<number>(PORT_SIDE_COUNT).fill(0)  // ELK int[4] 默认 0

  constructor(slHolder: SelfLoopHolder) {
    this.slHolder = slHolder
  }

  getSLHolder(): SelfLoopHolder { return this.slHolder }

  addSelfLoopEdge(slEdge: SelfLoopEdge): void {
    if (this.slEdges.has(slEdge)) return
    this.slEdges.add(slEdge)
    slEdge.setSLHyperLoop(this)

    const slSource = slEdge.getSLSource()
    if (!this.slPorts.includes(slSource)) this.slPorts.push(slSource)
    const slTarget = slEdge.getSLTarget()
    if (!this.slPorts.includes(slTarget)) this.slPorts.push(slTarget)

    const lLabels = slEdge.getLEdge().getLabels()
    if (lLabels.length > 0) {
      if (this.slLabels === null) this.slLabels = new SelfHyperLoopLabels(this)
      this.slLabels.addLLabels(lLabels)
    }
  }

  /** PortRestorer 前调用: 按侧分组端口 + 计算自环类型. */
  computePortsPerSide(): void {
    this.slPortsBySide = new Map()
    for (const slPort of this.slPorts) {
      const portSide = slPort.getLPort().getSide()
      const list = this.slPortsBySide.get(portSide) ?? []
      list.push(slPort)
      this.slPortsBySide.set(portSide, list)
    }
    this.selfLoopType = selfLoopTypeFromPortSides(new Set(this.slPortsBySide.keys()))
  }

  getSLPorts(): SelfLoopPort[] { return this.slPorts }
  getSLEdges(): Set<SelfLoopEdge> { return this.slEdges }
  getSLLabels(): SelfHyperLoopLabels | null { return this.slLabels }
  /** Java: 直接返回字段 (未计算时为 null, 消费方 NPE/switch-default). */
  getSelfLoopType(): SelfLoopType | null { return this.selfLoopType }
  getSLPortsBySideMap(): Map<PortSide, SelfLoopPort[]> { return this.slPortsBySide! }
  getSLPortsBySide(portSide: PortSide): SelfLoopPort[] { return this.slPortsBySide!.get(portSide) ?? [] }
  hasSLPortsOnSide(portSide: PortSide): boolean { return this.slPortsBySide!.has(portSide) }
  getLeftmostPort(): SelfLoopPort { return this.leftmostPort! }
  setLeftmostPort(port: SelfLoopPort): void { this.leftmostPort = port }
  getRightmostPort(): SelfLoopPort { return this.rightmostPort! }
  setRightmostPort(port: SelfLoopPort): void { this.rightmostPort = port }
  getOccupiedPortSides(): Set<PortSide> { return this.occupiedPortSides }

  getRoutingSlot(portSide: PortSide): number { return this.routingSlot[portSideOrdinal(portSide)] }
  setRoutingSlot(portSide: PortSide, slot: number): void {
    this.routingSlot[portSideOrdinal(portSide)] = slot
    const slotCount = this.slHolder.getRoutingSlotCount()
    const idx = portSideOrdinal(portSide)
    slotCount[idx] = Math.max(slotCount[idx], slot + 1)
  }
}
