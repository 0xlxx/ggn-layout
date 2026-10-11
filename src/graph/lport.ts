/**
 * LPort (对应 ELK graph.LPort).
 */
import { LShape } from './lshape.js'
import { PortSide, type KVector } from './enums.js'
import type { LNode } from './lnode.js'
import type { LEdge } from './ledge.js'

export class LPort extends LShape {
  private owner: LNode | null = null
  private side: PortSide = PortSide.UNDEFINED
  /** 侧是否由输入/用户显式设置 (推断侧用 setSideInferred, 不置位). */
  private explicitSide = false
  private anchor: KVector = { x: 0, y: 0 }
  private explicitlySuppliedPortAnchor = false
  private incomingEdges: LEdge[] = []
  private outgoingEdges: LEdge[] = []
  private margin: { left: number; top: number; right: number; bottom: number } = { left: 0, top: 0, right: 0, bottom: 0 }
  private labels: { text: string; position: KVector; size: KVector }[] = []

  getNode(): LNode | null {
    return this.owner
  }

  setNode(node: LNode | null): void {
    if (this.owner !== null) {
      const ports = this.owner.getPorts()
      const idx = ports.indexOf(this)
      if (idx !== -1) ports.splice(idx, 1)
    }
    this.owner = node
    if (this.owner !== null) this.owner.getPorts().push(this)
  }

  getSide(): PortSide {
    return this.side
  }

  setSide(theside: PortSide): void {
    if (process.env.GGN_SIDE_DBG) console.error(`[SIDE] ${String(this.id)} setSide ${this.side} -> ${theside}`)
    this.applySideAndAnchor(theside)
    this.explicitSide = true
  }

  /** 推断/变换定侧: 更新 side + anchor, 但不改变 explicitSide 标记 (ELK 输入图显式侧才有边框语义). */
  setSideInferred(theside: PortSide): void {
    if (process.env.GGN_SIDE_DBG) console.error(`[SIDE] ${String(this.id)} setSideInferred ${this.side} -> ${theside}`)
    this.applySideAndAnchor(theside)
  }

  isExplicitSide(): boolean {
    return this.explicitSide
  }

  private applySideAndAnchor(theside: PortSide): void {
    this.side = theside
    if (!this.explicitlySuppliedPortAnchor) {
      switch (this.side) {
        case PortSide.NORTH:
          this.anchor.x = this.size.x / 2
          this.anchor.y = 0
          break
        case PortSide.EAST:
          this.anchor.x = this.size.x
          this.anchor.y = this.size.y / 2
          break
        case PortSide.SOUTH:
          this.anchor.x = this.size.x / 2
          this.anchor.y = this.size.y
          break
        case PortSide.WEST:
          this.anchor.x = 0
          this.anchor.y = this.size.y / 2
          break
        case PortSide.UNDEFINED:
          break
      }
    }
  }

  getAnchor(): KVector {
    return this.anchor
  }

  setAnchor(anchor: { x: number; y: number }): void {
    this.anchor.x = anchor.x
    this.anchor.y = anchor.y
  }

  isExplicitlySuppliedPortAnchor(): boolean {
    return this.explicitlySuppliedPortAnchor
  }

  setExplicitlySuppliedPortAnchor(fixed: boolean): void {
    this.explicitlySuppliedPortAnchor = fixed
  }

  /** 绝对锚点 = owner.position + position + anchor. */
  getAbsoluteAnchor(): KVector {
    const o = this.owner!
    return {
      x: o.position.x + this.position.x + this.anchor.x,
      y: o.position.y + this.position.y + this.anchor.y,
    }
  }

  getIncomingEdges(): LEdge[] {
    return this.incomingEdges
  }

  getOutgoingEdges(): LEdge[] {
    return this.outgoingEdges
  }

  getConnectedEdges(): LEdge[] {
    return [...this.incomingEdges, ...this.outgoingEdges]
  }

  getConnectedPorts(): LPort[] {
    const result: LPort[] = []
    for (const e of this.getConnectedEdges()) result.push(this.otherEnd(e))
    return result
  }

  getPredecessorPorts(): LPort[] {
    return this.incomingEdges.map(e => e.getSource()!).filter(Boolean)
  }

  getSuccessorPorts(): LPort[] {
    return this.outgoingEdges.map(e => e.getTarget()!).filter(Boolean)
  }

  private otherEnd(e: LEdge): LPort {
    return e.getSource() === this ? e.getTarget()! : e.getSource()!
  }

  getDegree(): number {
    return this.incomingEdges.length + this.outgoingEdges.length
  }

  /** net flow = 入边数 - 出边数. */
  getNetFlow(): number {
    return this.incomingEdges.length - this.outgoingEdges.length
  }

  getMargin(): { left: number; top: number; right: number; bottom: number } {
    return this.margin
  }

  getLabels(): { text: string; position: KVector; size: KVector }[] {
    return this.labels
  }

  setLabels(labels: { text: string; position: KVector; size: KVector }[]): void {
    this.labels = labels
  }

  getIndex(): number {
    if (this.owner === null) return -1
    return this.owner.getPorts().indexOf(this)
  }
}
