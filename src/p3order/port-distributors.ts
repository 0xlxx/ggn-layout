/*
 * Copyright (c) 2010, 2015 Kiel University and others.
 * Copyright (c) 2026 GGN contributors.
 *
 * This file is part of ggn-layout, a TypeScript port of the Eclipse Layout
 * Kernel (ELK, https://github.com/eclipse/elk). It is derived from ELK and is
 * made available under the terms of the Eclipse Public License 2.0.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt — see also THIRD_PARTY_NOTICES.md.
 */
/**
 * 端口分配器 (对应 ELK p3order.AbstractBarycenterPortDistributor + LayerTotal + NodeRelative).
 */
import type { LNode } from '../graph/lnode.js'
import type { LPort } from '../graph/lport.js'
import { PortSide, PortType, PortConstraints } from '../graph/enums.js'
import { PORT_DUMMY, ORIGIN } from '../options/internal-properties.js'
import { PORT_CONSTRAINTS } from '../options/layered-options.js'
import type { IInitializable } from './all-crossings-counter.js'
import { GreedyPortDistributor } from './greedy-port-distributor.js'

/** P3 调试计数器 (process.env.GGN_P3_DBG 时使用). */
let __pdCounter = 0

/** 端口侧排序 (ELK PortListSorter CMP_PORT_SIDE). */
const SIDE_ORDER: Partial<Record<PortSide, number>> = {
  [PortSide.NORTH]: 0,
  [PortSide.EAST]: 1,
  [PortSide.SOUTH]: 2,
  [PortSide.WEST]: 3,
}

export interface ISweepPortDistributor extends IInitializable {
  distributePortsWhileSweeping(order: LNode[][], freeLayerIndex: number, isForwardSweep: boolean): boolean
}

export abstract class AbstractBarycenterPortDistributor implements ISweepPortDistributor {
  readonly skipInitAtEdgeLevel = true
  protected portRanks!: number[]
  protected minBarycenter = 0
  protected maxBarycenter = 0
  private nodePositions: number[][]
  private portBarycenter!: number[]
  private inLayerPorts: LPort[] = []
  private nPorts = 0
  /** P3 sweep: 节点身份→层索引 (P3 期间节点不换层, init 时一次注册), 免 getLayer().getIndex() 热路径. */
  private nodeLayerIndex = new WeakMap<LNode, number>()
  /** 复用: distributePorts 按侧收集端口 (免 node.getPorts(side) filter 分配). */
  private scratchPorts: LPort[] = []
  /** 初始化后稳定的端口方向/度数缓存 (避免 rank sweep 反复调用边数组 getter). */
  protected readonly portHasIncoming: number[] = []
  protected readonly portHasOutgoing: number[] = []
  protected readonly portDegrees: number[] = []
  /** 每次 sweep/分层入口快照, 避免热路径反复读 env. */
  private debugSortPorts = false
  protected debugPortRanks = false

  constructor(numLayers: number) {
    this.nodePositions = new Array<number[]>(numLayers)
  }

  getPortRanks(): number[] {
    return this.portRanks
  }

  distributePortsWhileSweeping(nodeOrder: LNode[][], currentIndex: number, isForwardSweep: boolean): boolean {
    this.debugSortPorts = process.env.GGN_P3_DBG !== undefined
    this.updateNodePositions(nodeOrder, currentIndex)
    const freeLayer = nodeOrder[currentIndex]!
    const side = isForwardSweep ? PortSide.WEST : PortSide.EAST
    if (this.isNotFirstLayer(nodeOrder.length, currentIndex, isForwardSweep)) {
      const fixedLayer = nodeOrder[isForwardSweep ? currentIndex - 1 : currentIndex + 1]!
      this.calculatePortRanksForLayer(fixedLayer, this.portTypeFor(isForwardSweep))
      for (const node of freeLayer) this.distributePorts(node, side)
      this.calculatePortRanksForLayer(freeLayer, this.portTypeFor(!isForwardSweep))
      for (const node of fixedLayer) {
        if (!this.hasNestedGraph(node)) this.distributePorts(node, PortSide.opposed(side))
      }
    } else {
      for (const node of freeLayer) this.distributePorts(node, side)
    }
    return false
  }

  calculatePortRanksForLayer(layer: LNode[], portType: PortType): void {
    this.debugPortRanks = process.env.GGN_P3_DBG !== undefined
    let consumedRank = 0
    const layerLength = layer.length
    for (let nodeIx = 0; nodeIx < layerLength; nodeIx++) {
      const node = layer[nodeIx]!
      consumedRank += this.calculatePortRanks(node, node.getPorts(), consumedRank, portType)
    }
    if (process.env.GGN_RANK_DBG) {
      const desc = layer.map((n, i) => {
        const t = n.getType().toString()
        const label = t === "NORMAL" ? (n.getLabels()[0]?.text ?? n.id) : n.id
        const ranks = n.getPorts().map(p => p.id + "=" + (this.getPortRanks()[p.id] ?? "?")).join(",")
        return label + "[" + i + "](rank:" + ranks + ")"
      }).join(" | ")
      console.error(`GGN_RANK ${portType} layer=[${desc}]`)
    }
  }

  protected abstract calculatePortRanks(node: LNode, nodePorts: LPort[], rankSum: number, type: PortType): number

  private distributePorts(node: LNode, sideOrPorts: PortSide | LPort[]): void {
    if (typeof sideOrPorts === 'string') {
      // side 版本
      const side = sideOrPorts as PortSide
      if (!PortConstraints.isOrderFixed(node.getProperty<PortConstraints>(PORT_CONSTRAINTS))) {
        this.distributePorts(node, this.collectPortsOnSide(node, side))
        this.distributePorts(node, this.collectPortsOnSide(node, PortSide.SOUTH))
        this.distributePorts(node, this.collectPortsOnSide(node, PortSide.NORTH))
        this.sortPorts(node)
      }
      return
    }
    // ports 版本
    const ports = sideOrPorts as LPort[]
    this.inLayerPorts.length = 0
    this.iteratePortsAndCollectInLayerPorts(node, ports)
    if (this.inLayerPorts.length > 0) this.calculateInLayerPortsBarycenterValues(node)
  }

  /** 收集节点指定侧端口到复用数组 (等价 node.getPorts(side), 免 filter 分配). */
  private collectPortsOnSide(node: LNode, side: PortSide): LPort[] {
    this.scratchPorts.length = 0
    const all = node.getPorts()
    for (let k = 0; k < all.length; k++) {
      if (all[k]!.getSide() === side) this.scratchPorts.push(all[k]!)
    }
    return this.scratchPorts
  }

  private iteratePortsAndCollectInLayerPorts(node: LNode, ports: LPort[]): void {
    this.minBarycenter = 0.0
    this.maxBarycenter = 0.0
    const nodeLayer = node.getLayer()!
    const absurdlyLargeFloat = 2 * nodeLayer.getNodes().length + 1
    for (let portIx = 0; portIx < ports.length; portIx++) {
      const port = ports[portIx]!
      const northSouthPort = port.getSide() === PortSide.NORTH || port.getSide() === PortSide.SOUTH
      let sum = 0

      if (northSouthPort) {
        const portDummy = port.getProperty(PORT_DUMMY) as LNode | null
        if (portDummy === null || portDummy === undefined) continue
        sum += this.dealWithNorthSouthPorts(absurdlyLargeFloat, port, portDummy)
      } else {
        for (const outgoingEdge of port.getOutgoingEdges()) {
          const connectedPort = outgoingEdge.getTarget()!
          if (connectedPort.getNode()!.getLayer() === nodeLayer) {
            this.inLayerPorts.push(port)
            continue
          } else {
            sum += this.portRanks[connectedPort.id]
          }
        }
        for (const incomingEdge of port.getIncomingEdges()) {
          const connectedPort = incomingEdge.getSource()!
          if (connectedPort.getNode()!.getLayer() === nodeLayer) {
            this.inLayerPorts.push(port)
            continue
          } else {
            sum -= this.portRanks[connectedPort.id]
          }
        }
      }

      const degree = this.portDegrees[port.id] ?? port.getDegree()
      if (degree > 0) {
        this.portBarycenter[port.id] = sum / degree
        this.minBarycenter = Math.min(this.minBarycenter, this.portBarycenter[port.id])
        this.maxBarycenter = Math.max(this.maxBarycenter, this.portBarycenter[port.id])
      } else if (northSouthPort) {
        this.portBarycenter[port.id] = sum
      }
    }
  }

  private calculateInLayerPortsBarycenterValues(node: LNode): void {
    const nodeIndexInLayer = this.positionOf(node) + 1
    const nodeLayer = node.getLayer()!
    const layerSize = nodeLayer.getNodes().length + 1
    for (const inLayerPort of this.inLayerPorts) {
      let sum = 0
      let inLayerConnections = 0
      // getConnectedPorts() 原序 = incoming 后接 outgoing; 直连免数组分配.
      for (const edge of inLayerPort.getIncomingEdges()) {
        const connectedPort = edge.getSource()!
        if (connectedPort.getNode()!.getLayer() === nodeLayer) {
          sum += this.positionOf(connectedPort.getNode()!) + 1
          inLayerConnections++
        }
      }
      for (const edge of inLayerPort.getOutgoingEdges()) {
        const connectedPort = edge.getTarget()!
        if (connectedPort.getNode()!.getLayer() === nodeLayer) {
          sum += this.positionOf(connectedPort.getNode()!) + 1
          inLayerConnections++
        }
      }
      const barycenter = sum / inLayerConnections
      const portSide = inLayerPort.getSide()
      if (portSide === PortSide.EAST) {
        this.portBarycenter[inLayerPort.id] = barycenter < nodeIndexInLayer
          ? this.minBarycenter - barycenter
          : this.maxBarycenter + (layerSize - barycenter)
      } else if (portSide === PortSide.WEST) {
        this.portBarycenter[inLayerPort.id] = barycenter < nodeIndexInLayer
          ? this.maxBarycenter + barycenter
          : this.minBarycenter - (layerSize - barycenter)
      }
    }
  }

  private dealWithNorthSouthPorts(absurdlyLargeFloat: number, port: LPort, portDummy: LNode): number {
    let input = false
    let output = false
    for (const portDummyPort of portDummy.getPorts()) {
      if (portDummyPort.getProperty(ORIGIN) as LPort === port) {
        if (portDummyPort.getOutgoingEdges().length > 0) output = true
        else if (portDummyPort.getIncomingEdges().length > 0) input = true
      }
    }
    let sum = 0
    if (input && !(input && output)) {
      sum = port.getSide() === PortSide.NORTH ? -this.positionOf(portDummy)
        : absurdlyLargeFloat - this.positionOf(portDummy)
    } else if (output && !(input && output)) {
      sum = this.positionOf(portDummy) + 1.0
    } else if (input && output) {
      sum = port.getSide() === PortSide.NORTH ? 0.0 : absurdlyLargeFloat / 2
    }
    return sum
  }

  protected positionOf(node: LNode): number {
    return this.nodePositions[this.nodeLayerIndex.get(node)!]![node.id]!
  }

  private updateNodePositions(nodeOrder: LNode[][], currentIndex: number): void {
    const layer = nodeOrder[currentIndex]!
    if (layer.length === 0) return
    const positions = this.nodePositions[this.nodeLayerIndex.get(layer[0]!)!]!
    for (let i = 0; i < layer.length; i++) {
      const node = layer[i]!
      positions[node.id] = i
    }
  }

  private hasNestedGraph(node: LNode): boolean {
    return node.getNestedGraph() !== null
  }

  private isNotFirstLayer(length: number, currentIndex: number, isForwardSweep: boolean): boolean {
    return isForwardSweep ? currentIndex !== 0 : currentIndex !== length - 1
  }

  private portTypeFor(isForwardSweep: boolean): PortType {
    return isForwardSweep ? PortType.OUTPUT : PortType.INPUT
  }

  private sortPorts(node: LNode): void {
    if (this.debugSortPorts) {
      const before = node.getPorts().map(p => `${p.id}:${p.getSide()}(${this.portBarycenter[p.id]})`).join(' ')
      console.error(`GGN sortPorts L${node.getLayer()!.getIndex()} node=${node.id} before=[${before}]`)
    }
    node.getPorts().sort(this.portComparator)
    if (this.debugSortPorts) {
      console.error(`GGN sortPorts node=${node.id} after=[${node.getPorts().map(p => p.id).join(' ')}]`)
    }
  }

  private readonly portComparator = (port1: LPort, port2: LPort): number => {
    const side1 = SIDE_ORDER[port1.getSide()] ?? 0
    const side2 = SIDE_ORDER[port2.getSide()] ?? 0
    if (side1 !== side2) return side1 - side2
    const port1Bary = this.portBarycenter[port1.id]
    const port2Bary = this.portBarycenter[port2.id]
    if (port1Bary === 0 && port2Bary === 0) return 0
    else if (port1Bary === 0) return -1
    else if (port2Bary === 0) return 1
    else return port1Bary - port2Bary
  }

  initAtLayerLevel(l: number, nodeOrder: LNode[][]): void {
    this.nodePositions[l] = new Array<number>(nodeOrder[l]!.length)
    const layer = nodeOrder[l]!
    for (let i = 0; i < layer.length; i++) this.nodeLayerIndex.set(layer[i]!, l)
  }

  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void {
    const node = nodeOrder[l]![n]!
    node.id = n
    this.nodePositions[l]![n] = n
  }

  initAtPortLevel(l: number, n: number, p: number, nodeOrder: LNode[][]): void {
    const node = nodeOrder[l]![n]!
    const port = node.getPorts()[p]!
    port.id = this.nPorts++
    const incoming = port.getIncomingEdges()
    const outgoing = port.getOutgoingEdges()
    this.portHasIncoming[port.id] = incoming.length > 0 ? 1 : 0
    this.portHasOutgoing[port.id] = outgoing.length > 0 ? 1 : 0
    this.portDegrees[port.id] = incoming.length + outgoing.length
  }

  initAtEdgeLevel(): void {}

  initAfterTraversal(): void {
    // ELK float 数组默认 0: undefined 会让 sortPorts 的 ===0 分支失效 (NaN 比较乱序),
    // 且 portRanks[port.id] 未填充时应为 0 (否则 barycenter NaN).
    this.portRanks = new Array<number>(this.nPorts).fill(0)
    this.portBarycenter = new Array<number>(this.nPorts).fill(0)
  }
}

export class LayerTotalPortDistributor extends AbstractBarycenterPortDistributor {
  constructor(numLayers: number) {
    super(numLayers)
  }

  protected calculatePortRanks(node: LNode, nodePorts: LPort[], rankSum: number, type: PortType): number {
    const portRanks = this.portRanks

    if (type === PortType.INPUT) {
      let inputCount = 0
      let northInputCount = 0
      for (let k = 0; k < nodePorts.length; k++) {
        const port = nodePorts[k]!
        const hasIncoming = this.portHasIncoming[port.id]
        if (hasIncoming === 1 || (hasIncoming === undefined && port.getIncomingEdges().length > 0)) {
          inputCount++
          if (port.getSide() === PortSide.NORTH) northInputCount++
        }
      }

      let northPos = rankSum + northInputCount
      let restPos = rankSum + inputCount
      for (let k = 0; k < nodePorts.length; k++) {
        const port = nodePorts[k]!
        const hasIncoming = this.portHasIncoming[port.id]
        if (hasIncoming === 0 || (hasIncoming === undefined && port.getIncomingEdges().length === 0)) continue
        if (port.getSide() === PortSide.NORTH) {
          portRanks[port.id] = northPos
          northPos--
        } else {
          portRanks[port.id] = restPos
          restPos--
        }
        if (this.debugPortRanks) {
          const incoming = port.getIncomingEdges()
          const conn = incoming.length > 0 ? `<-${incoming[0]!.getSource()!.getNode()!.id}` : ''
          console.error(`GGN rank INPUT node=${node.id} L${node.getLayer()!.getIndex()} port=${port.id} rank=${portRanks[port.id]} conn=${conn}`)
        }
      }
      return inputCount
    }

    if (type === PortType.OUTPUT) {
      let pos = 0
      for (let k = 0; k < nodePorts.length; k++) {
        const port = nodePorts[k]!
        const hasOutgoing = this.portHasOutgoing[port.id]
        if (hasOutgoing === 0 || (hasOutgoing === undefined && port.getOutgoingEdges().length === 0)) continue
        pos++
        portRanks[port.id] = rankSum + pos
      }
      return pos
    }

    throw new Error('IllegalArgumentException')
  }
}

export class NodeRelativePortDistributor extends AbstractBarycenterPortDistributor {
  constructor(numLayers: number) {
    super(numLayers)
  }

  protected calculatePortRanks(node: LNode, nodePorts: LPort[], rankSum: number, type: PortType): number {
    const portRanks = this.portRanks

    if (type === PortType.INPUT) {
      let inputCount = 0
      let northInputCount = 0
      for (let k = 0; k < nodePorts.length; k++) {
        const port = nodePorts[k]!
        const hasIncoming = this.portHasIncoming[port.id]
        if (hasIncoming === 1 || (hasIncoming === undefined && port.getIncomingEdges().length > 0)) {
          inputCount++
          if (port.getSide() === PortSide.NORTH) northInputCount++
        }
      }
      const incr = 1.0 / (inputCount + 1)
      let northPos = rankSum + northInputCount * incr
      let restPos = rankSum + 1 - incr
      for (let k = 0; k < nodePorts.length; k++) {
        const port = nodePorts[k]!
        const hasIncoming = this.portHasIncoming[port.id]
        if (hasIncoming === 0 || (hasIncoming === undefined && port.getIncomingEdges().length === 0)) continue
        if (port.getSide() === PortSide.NORTH) {
          portRanks[port.id] = northPos
          northPos -= incr
        } else {
          portRanks[port.id] = restPos
          restPos -= incr
        }
      }
    } else if (type === PortType.OUTPUT) {
      let outputCount = 0
      for (let k = 0; k < nodePorts.length; k++) {
        const port = nodePorts[k]!
        const hasOutgoing = this.portHasOutgoing[port.id]
        if (hasOutgoing === 1 || (hasOutgoing === undefined && port.getOutgoingEdges().length > 0)) outputCount++
      }
      const incr = 1.0 / (outputCount + 1)
      let pos = rankSum + incr
      for (let k = 0; k < nodePorts.length; k++) {
        const port = nodePorts[k]!
        const hasOutgoing = this.portHasOutgoing[port.id]
        if (hasOutgoing === 0 || (hasOutgoing === undefined && port.getOutgoingEdges().length === 0)) continue
        portRanks[port.id] = pos
        pos += incr
      }
    } else {
      throw new Error('Port type is undefined')
    }
    return 1
  }
}

/** 工厂 (对应 ELK ISweepPortDistributor.create). */
export function createPortDistributor(
  cmt: CrossMinType,
  r: { nextBoolean(): boolean },
  currentOrder: LNode[][],
): ISweepPortDistributor {
  if (cmt === CrossMinType.TWO_SIDED_GREEDY_SWITCH) {
    return new GreedyPortDistributor()
  }
  if (process.env.GGN_P3_DBG) { __pdCounter++; console.error(`GGN createPortDistributor #${__pdCounter}`) }
  if (process.env.GGN_NR) { if (process.env.GGN_PD) console.error(`GGN_PD NodeRelative(env)`); return new NodeRelativePortDistributor(currentOrder.length) }
  const useNodeRelative = r.nextBoolean()
  if (process.env.GGN_PD) console.error(`GGN_PD ${useNodeRelative ? "NodeRelative" : "LayerTotal"} (nextBoolean=${useNodeRelative})`)
  if (useNodeRelative) return new NodeRelativePortDistributor(currentOrder.length)
  return new LayerTotalPortDistributor(currentOrder.length)
}

export enum CrossMinType {
  BARYCENTER = 0,
  ONE_SIDED_GREEDY_SWITCH = 1,
  TWO_SIDED_GREEDY_SWITCH = 2,
  MEDIAN = 3,
}
