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
 * mrtree MultiLevelEdgeNodeNodeGap — ELK alg.mrtree.p4route.MultiLevelEdgeNodeNodeGap 0.12.0.
 * 跨层边在层内两个节点之间的间隙路由: 维护 (bend1, bend2, edge) 三元组列表,
 * 按 target 位置排序后重算 bend 点 (邻居节点边界 + 间距).
 */
import { KVector } from '../../force/kvector.js'
import { TGraph, TNode, TEdge, P_LEVELMIN, P_LEVELMAX, getNum } from '../graph.js'
import { DIRECTION, SPACING_EDGE_NODE, Direction } from '../options.js'

/** (bend1, bend2, edge) 三元组. */
export interface BendTriple {
  first: KVector
  second: KVector
  third: TEdge
}

export class MultiLevelEdgeNodeNodeGap {
  private neighborOne: TNode | null
  private neighborTwo: TNode | null
  private bendPoints: BendTriple[]
  private graph: TGraph
  private d: Direction
  private nodeBendpointPadding: number
  private onFirstNodeSide = false
  private onLastNodeSide = false

  getNeighborOne(): TNode | null {
    return this.neighborOne
  }

  getNeighborTwo(): TNode | null {
    return this.neighborTwo
  }

  isOnFirstNodeSide(): boolean {
    return this.onFirstNodeSide
  }

  isOnLastNodeSide(): boolean {
    return this.onLastNodeSide
  }

  constructor(
    neighborOne: TNode | null,
    neighborTwo: TNode | null,
    bendTriple: BendTriple,
    graph: TGraph,
  ) {
    this.neighborOne = neighborOne
    this.neighborTwo = neighborTwo
    this.graph = graph
    this.bendPoints = [bendTriple]
    const d = graph.props[DIRECTION] as string | undefined
    this.d = (d === 'UP' ? Direction.UP : d === 'LEFT' ? Direction.LEFT : d === 'RIGHT' ? Direction.RIGHT : Direction.DOWN) as Direction
    this.nodeBendpointPadding = getNum(graph, SPACING_EDGE_NODE, 3)
    this.updateBendPoints()
  }

  addBendPoints(newBends: BendTriple): void {
    this.bendPoints.push(newBends)
    if (this.d === Direction.LEFT || this.d === Direction.RIGHT) {
      this.bendPoints.sort((x, y) => x.third.getTarget().getPosition().y - y.third.getTarget().getPosition().y)
    } else {
      this.bendPoints.sort((x, y) => x.third.getTarget().getPosition().x - y.third.getTarget().getPosition().x)
    }
    this.updateBendPoints()
  }

  private updateBendPoints(): void {
    let i = 0
    const count = this.bendPoints.length
    for (const p of this.bendPoints) {
      let bend1: KVector
      let bend2: KVector
      let bendTmp: number
      const interpolation = (i + 1) / (count + 1)
      if (this.neighborOne === null && this.neighborTwo === null) {
        return
      } else if (this.neighborOne !== null && this.neighborTwo === null) {
        // Bendpoint should be placed next to last node
        this.onLastNodeSide = true
        if (this.d === Direction.LEFT) {
          bendTmp = this.neighborOne.getPosition().y + this.neighborOne.getSize().y + this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding, bendTmp)
          bend2 = new KVector(getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding, bendTmp)
        } else if (this.d === Direction.RIGHT) {
          bendTmp = this.neighborOne.getPosition().y + this.neighborOne.getSize().y + this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding, bendTmp)
          bend2 = new KVector(getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding, bendTmp)
        } else if (this.d === Direction.UP) {
          bendTmp = this.neighborOne.getPosition().x + this.neighborOne.getSize().x + this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding)
          bend2 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding)
        } else {
          bendTmp = this.neighborOne.getPosition().x + this.neighborOne.getSize().x + this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding)
          bend2 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding)
        }
      } else if (this.neighborOne !== null && this.neighborTwo !== null) {
        // Bendpoint should be placed in between two nodes
        if (this.d === Direction.LEFT) {
          bendTmp = this.neighborTwo.getPosition().y * interpolation
            + (this.neighborOne.getPosition().y + this.neighborOne.getSize().y) * (1 - interpolation)
          bend1 = new KVector(getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding, bendTmp)
          bend2 = new KVector(getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding, bendTmp)
        } else if (this.d === Direction.RIGHT) {
          bendTmp = this.neighborTwo.getPosition().y * interpolation
            + (this.neighborOne.getPosition().y + this.neighborOne.getSize().y) * (1 - interpolation)
          bend1 = new KVector(getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding, bendTmp)
          bend2 = new KVector(getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding, bendTmp)
        } else if (this.d === Direction.UP) {
          bendTmp = this.neighborTwo.getPosition().x * interpolation
            + (this.neighborOne.getPosition().x + this.neighborOne.getSize().x) * (1 - interpolation)
          bend1 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding)
          bend2 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding)
        } else {
          bendTmp = this.neighborTwo.getPosition().x * interpolation
            + (this.neighborOne.getPosition().x + this.neighborOne.getSize().x) * (1 - interpolation)
          bend1 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMIN, 0) - this.nodeBendpointPadding)
          bend2 = new KVector(bendTmp, getNum(this.neighborOne, P_LEVELMAX, 0) + this.nodeBendpointPadding)
        }
      } else {
        // Bendpoint should be placed next to the first node
        this.onFirstNodeSide = true
        if (this.d === Direction.LEFT) {
          bendTmp = this.neighborTwo!.getPosition().y - this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(getNum(this.neighborTwo!, P_LEVELMAX, 0) + this.nodeBendpointPadding, bendTmp)
          bend2 = new KVector(getNum(this.neighborTwo!, P_LEVELMIN, 0) - this.nodeBendpointPadding, bendTmp)
        } else if (this.d === Direction.RIGHT) {
          bendTmp = this.neighborTwo!.getPosition().y - this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(getNum(this.neighborTwo!, P_LEVELMIN, 0) - this.nodeBendpointPadding, bendTmp)
          bend2 = new KVector(getNum(this.neighborTwo!, P_LEVELMAX, 0) + this.nodeBendpointPadding, bendTmp)
        } else if (this.d === Direction.UP) {
          bendTmp = this.neighborTwo!.getPosition().x - this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(bendTmp, getNum(this.neighborTwo!, P_LEVELMAX, 0) + this.nodeBendpointPadding)
          bend2 = new KVector(bendTmp, getNum(this.neighborTwo!, P_LEVELMIN, 0) - this.nodeBendpointPadding)
        } else {
          bendTmp = this.neighborTwo!.getPosition().x - this.nodeBendpointPadding * (i + 1)
          bend1 = new KVector(bendTmp, getNum(this.neighborTwo!, P_LEVELMIN, 0) - this.nodeBendpointPadding)
          bend2 = new KVector(bendTmp, getNum(this.neighborTwo!, P_LEVELMAX, 0) + this.nodeBendpointPadding)
        }
      }
      // Commit new values
      p.first.x = bend1.x
      p.first.y = bend1.y
      p.second.x = bend2.x
      p.second.y = bend2.y
      i++
    }
  }
}
