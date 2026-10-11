/*
 * Copyright (c) 2026 GGN contributors.
 * Portions derived from the Eclipse Layout Kernel (ELK), Copyright (c) Kiel University and others.
 *
 * This file is part of ggn-layout, a TypeScript port of ELK v0.12.0.
 * Upstream attribution and source range: see THIRD_PARTY_NOTICES.md.
 *
 * SPDX-License-Identifier: EPL-2.0
 * License text: LICENSES/EPL-2.0.txt.
 */
/**
 * AllCrossingsCounter (对应 ELK p3order.counting.AllCrossingsCounter).
 */
import { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { PortSide, NodeType } from '../graph/enums.js'
import { CrossingsCounter } from './counting.js'
import { HyperedgeCrossingsCounter } from './counting/hyperedge-crossings-counter.js'

export interface IInitializable {
  /** 可选能力位: true 表示对应钩子为空实现, 可安全跳过. 未声明时按原语义调用. */
  readonly skipInitAtLayerLevel?: boolean
  readonly skipInitAtNodeLevel?: boolean
  readonly skipInitAtPortLevel?: boolean
  readonly skipInitAtEdgeLevel?: boolean
  readonly skipInitAfterTraversal?: boolean
  initAtLayerLevel(l: number, nodeOrder: LNode[][]): void
  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void
  initAtPortLevel(l: number, n: number, p: number, nodeOrder: LNode[][]): void
  initAtEdgeLevel(l: number, n: number, p: number, e: number, edge: LEdge, nodeOrder: LNode[][]): void
  initAfterTraversal(): void
}

/** 按 层→节点→端口→边 顺序遍历初始化. */
export function initInitializables(initializables: IInitializable[], order: LNode[][]): void {
  const layerInit: IInitializable[] = []
  const nodeInit: IInitializable[] = []
  const portInit: IInitializable[] = []
  const edgeInit: IInitializable[] = []
  const afterInit: IInitializable[] = []
  for (let i = 0; i < initializables.length; i++) {
    const initializable = initializables[i]!
    if (initializable.skipInitAtLayerLevel !== true) layerInit.push(initializable)
    if (initializable.skipInitAtNodeLevel !== true) nodeInit.push(initializable)
    if (initializable.skipInitAtPortLevel !== true) portInit.push(initializable)
    if (initializable.skipInitAtEdgeLevel !== true) edgeInit.push(initializable)
    if (initializable.skipInitAfterTraversal !== true) afterInit.push(initializable)
  }
  for (let l = 0; l < order.length; l++) {
    for (let i = 0; i < layerInit.length; i++) layerInit[i]!.initAtLayerLevel(l, order)
    for (let n = 0; n < order[l]!.length; n++) {
      for (let i = 0; i < nodeInit.length; i++) nodeInit[i]!.initAtNodeLevel(l, n, order)
      const ports = order[l]![n]!.getPorts()
      for (let p = 0; p < ports.length; p++) {
        for (let i = 0; i < portInit.length; i++) portInit[i]!.initAtPortLevel(l, n, p, order)
        const port = ports[p]!
        let e = 0
        // getConnectedEdges() 原序 = incomingEdges 后接 outgoingEdges; 直连免临时数组.
        const incoming = port.getIncomingEdges()
        for (let j = 0; j < incoming.length; j++) {
          const edge = incoming[j]!
          for (let i = 0; i < edgeInit.length; i++) edgeInit[i]!.initAtEdgeLevel(l, n, p, e++, edge, order)
        }
        const outgoing = port.getOutgoingEdges()
        for (let j = 0; j < outgoing.length; j++) {
          const edge = outgoing[j]!
          for (let i = 0; i < edgeInit.length; i++) edgeInit[i]!.initAtEdgeLevel(l, n, p, e++, edge, order)
        }
      }
    }
  }
  for (let i = 0; i < afterInit.length; i++) afterInit[i]!.initAfterTraversal()
}

export class AllCrossingsCounter implements IInitializable {
  readonly skipInitAtLayerLevel = true
  private crossingCounter!: CrossingsCounter
  private hyperedgeCrossingsCounter!: HyperedgeCrossingsCounter
  private hasHyperEdgesEastOfIndex: boolean[]
  private inLayerEdgeCounts: number[]
  private hasNorthSouthPorts: boolean[]
  private nPorts = 0

  constructor(graph: LNode[][]) {
    this.inLayerEdgeCounts = new Array<number>(graph.length).fill(0)
    this.hasNorthSouthPorts = new Array<boolean>(graph.length).fill(false)
    this.hasHyperEdgesEastOfIndex = new Array<boolean>(graph.length).fill(false)
  }

  countAllCrossings(currentOrder: LNode[][]): number {
    if (currentOrder.length === 0) return 0
    let crossings = this.crossingCounter.countInLayerCrossingsOnSide(currentOrder[0]!, PortSide.WEST)
    crossings += this.crossingCounter.countInLayerCrossingsOnSide(currentOrder[currentOrder.length - 1]!, PortSide.EAST)
    for (let layerIndex = 0; layerIndex < currentOrder.length; layerIndex++) {
      crossings += this.countCrossingsAt(layerIndex, currentOrder)
    }
    if (process.env.GGN_SWEEP_DBG) {
      const idOf = (n: LNode): string => {
        if (n.getType() === NodeType.NORTH_SOUTH_PORT) {
          const parts: string[] = []
          for (const pp of n.getPorts()) {
            for (const e of pp.getConnectedEdges()) {
              const other = e.getSource()!.getNode() === n ? e.getTarget()!.getNode() : e.getSource()!.getNode()
              if (other) {
                const t = other.getLabels()[0]?.text
                if (t) parts.push(t)
              }
            }
          }
          return 'd' + (parts.length > 0 ? parts.join('+') : '?')
        }
        return n.getLabels()[0]?.text ?? '?'
      }
      const sb = currentOrder.map(layer => layer.map(idOf).join(',')).join(' | ')
      console.error(`GGN_CNT crossings=${crossings} layers=[${sb}]`)
    }
    return crossings
  }

  private countCrossingsAt(layerIndex: number, currentOrder: LNode[][]): number {
    let totalCrossings = 0
    const leftLayer = currentOrder[layerIndex]!
    if (layerIndex < currentOrder.length - 1) {
      const rightLayer = currentOrder[layerIndex + 1]!
      if (this.hasHyperEdgesEastOfIndex[layerIndex]) {
        // ELK: 超边估算 + 两侧层内交叉 (端口度 > 1 时, 普通计数不精确).
        totalCrossings = this.hyperedgeCrossingsCounter.countCrossings(leftLayer, rightLayer)
        totalCrossings += this.crossingCounter.countInLayerCrossingsOnSide(leftLayer, PortSide.EAST)
        totalCrossings += this.crossingCounter.countInLayerCrossingsOnSide(rightLayer, PortSide.WEST)
      } else {
        totalCrossings = this.crossingCounter.countCrossingsBetweenLayers(leftLayer, rightLayer)
      }
    }
    if (this.hasNorthSouthPorts[layerIndex]) {
      totalCrossings += this.crossingCounter.countNorthSouthPortCrossingsInLayer(leftLayer)
    }
    return totalCrossings
  }

  initAtNodeLevel(l: number, n: number, nodeOrder: LNode[][]): void {
    const node = nodeOrder[l]![n]!
    this.hasNorthSouthPorts[l] = this.hasNorthSouthPorts[l] || node.getType() === NodeType.NORTH_SOUTH_PORT
  }

  initAtPortLevel(l: number, n: number, p: number, nodeOrder: LNode[][]): void {
    const port = nodeOrder[l]![n]!.getPorts()[p]!
    port.id = this.nPorts++
    if (port.getOutgoingEdges().length + port.getIncomingEdges().length > 1) {
      if (port.getSide() === PortSide.EAST) {
        this.hasHyperEdgesEastOfIndex[l] = true
      } else if (port.getSide() === PortSide.WEST && l > 0) {
        this.hasHyperEdgesEastOfIndex[l - 1] = true
      }
    }
  }

  initAtEdgeLevel(l: number, n: number, p: number, e: number, edge: LEdge, nodeOrder: LNode[][]): void {
    const port = nodeOrder[l]![n]!.getPorts()[p]!
    if (edge.getSource() === port
      && edge.getSource()!.getNode()!.getLayer() === edge.getTarget()!.getNode()!.getLayer()) {
      this.inLayerEdgeCounts[l]++
    }
  }

  initAtLayerLevel(): void {}

  initAfterTraversal(): void {
    const portPos = new Array<number>(this.nPorts)
    this.hyperedgeCrossingsCounter = new HyperedgeCrossingsCounter(this.inLayerEdgeCounts, this.hasNorthSouthPorts, portPos)
    this.crossingCounter = new CrossingsCounter(portPos)
  }
}
