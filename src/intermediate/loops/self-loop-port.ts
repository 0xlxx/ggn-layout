/**
 * SelfLoopPort (对应 ELK intermediate.loops.SelfLoopPort).
 */
import type { LPort } from '../../graph/lport.js'
import type { SelfLoopEdge } from './self-loop-edge.js'

/** 至少连接一条自环边的端口. */
export class SelfLoopPort {
  private readonly lPort: LPort
  private readonly onlySelfLoops: boolean
  private readonly incomingSLEdges: SelfLoopEdge[] = []
  private readonly outgoingSLEdges: SelfLoopEdge[] = []
  private hidden = false

  constructor(lPort: LPort) {
    this.lPort = lPort
    this.onlySelfLoops = lPort.getConnectedEdges().length > 0
      && lPort.getConnectedEdges().every(e => e.isSelfLoop())
  }

  getLPort(): LPort { return this.lPort }
  hadOnlySelfLoops(): boolean { return this.onlySelfLoops }
  isHidden(): boolean { return this.hidden }
  setHidden(hidden: boolean): void { this.hidden = hidden }
  getIncomingSLEdges(): SelfLoopEdge[] { return this.incomingSLEdges }
  getOutgoingSLEdges(): SelfLoopEdge[] { return this.outgoingSLEdges }

  /** 自环净流量 = 入自环 - 出自环. */
  getSLNetFlow(): number {
    return this.incomingSLEdges.length - this.outgoingSLEdges.length
  }
}
