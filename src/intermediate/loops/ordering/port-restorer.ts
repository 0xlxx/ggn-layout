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
 * PortRestorer (对应 ELK intermediate.loops.ordering.PortRestorer).
 * 按 FIXED_SIDE 语义恢复隐藏的自环端口到节点端口列表 (按目标区域排序).
 */
import type { LNode } from '../../../graph/lnode.js'
import type { LPort } from '../../../graph/lport.js'
import { PortSide } from '../../../graph/enums.js'
import { PORT_DUMMY, ORIGIN } from '../../../options/internal-properties.js'
import type { SelfHyperLoop } from '../self-hyper-loop.js'
import type { SelfLoopHolder } from '../self-loop-holder.js'
import type { SelfLoopPort } from '../self-loop-port.js'
import { SelfLoopType } from '../self-loop-type.js'

enum PortSideArea { START, MIDDLE, END }
enum AddMode { PREPEND, APPEND }

export class PortRestorer {
  private slLoopsByType: Map<SelfLoopType, SelfHyperLoop[]> = new Map()
  private targetAreas: Map<string, SelfLoopPort[]> = new Map()

  restorePorts(slHolder: SelfLoopHolder): void {
    this.initTargetAreas()
    this.slLoopsByType = this.gatherSelfLoopsByType(slHolder)

    // ELK 节点级选项优先, 回退图级.
    const ordering = slHolder.getLNode().hasProperty(SELF_LOOP_ORDERING_PROP)
      ? slHolder.getLNode().getProperty(SELF_LOOP_ORDERING_PROP)
      : slHolder.getLNode().getGraph()!.getProperty(SELF_LOOP_ORDERING_PROP)
    this.processOneSideLoops(ordering)
    this.processTwoSideCornerLoops()
    this.processThreeSideLoops()
    this.processFourSideLoops()
    this.processTwoSideOpposingLoops()

    if (process.env.GGN_SL_DBG) {
      const ta = [...this.targetAreas.entries()].filter(([, v]) => v.length > 0).map(([k, v]) => `${k}:${v.map(p => p.getLPort().id).join(',')}`).join(' | ')
      console.error(`GGN PR targetAreas=[${ta}]`)
      console.error(`GGN PR before restore ports=[${slHolder.getLNode().getPorts().map(p => `${p.id}:${p.getSide()}:hidden=${p === null}`).join(',')}]`)
    }
    this.restorePortList(slHolder)

    if (process.env.GGN_SL_DBG) {
      console.error(`GGN PR after restore ports=[${slHolder.getLNode().getPorts().map(p => `${p.id}:${p.getSide()}`).join(',')}]`)
    }
    for (const slPortList of this.targetAreas.values()) {
      for (const slPort of slPortList) slPort.setHidden(false)
    }
    slHolder.setPortsHidden(false)
    this.slLoopsByType = new Map()
  }

  private initTargetAreas(): void {
    this.targetAreas = new Map()
    for (const side of SIDES) {
      for (const area of [PortSideArea.START, PortSideArea.MIDDLE, PortSideArea.END]) {
        this.targetAreas.set(areaKey(side, area), [])
      }
    }
  }

  private gatherSelfLoopsByType(slHolder: SelfLoopHolder): Map<SelfLoopType, SelfHyperLoop[]> {
    const loops = new Map<SelfLoopType, SelfHyperLoop[]>()
    for (const slLoop of slHolder.getSLHyperLoops()) {
      const list = loops.get(slLoop.getSelfLoopType()!) ?? []
      list.push(slLoop)
      loops.set(slLoop.getSelfLoopType()!, list)
    }
    return loops
  }

  // ── One Side ──

  private processOneSideLoops(ordering: string): void {
    const oneSideLoops = this.slLoopsByType.get(SelfLoopType.ONE_SIDE) ?? []
    if (ordering === 'REVERSE_STACKED') oneSideLoops.reverse()
    for (const slLoop of oneSideLoops) {
      const side = slLoop.getSLPorts()[0]!.getLPort().getSide()
      const sortedPorts = [...slLoop.getSLPorts()]
      sortedPorts.sort((a, b) => a.getSLNetFlow() - b.getSLNetFlow())

      switch (ordering) {
        case 'SEQUENCED':
          this.addToTargetAreaPorts(sortedPorts, side, PortSideArea.MIDDLE, AddMode.APPEND)
          break
        case 'REVERSE_STACKED':
        case 'STACKED': {
          const splitIndex = this.computePortListSplitIndex(sortedPorts)
          this.addToTargetAreaPorts(sortedPorts.slice(0, splitIndex), side, PortSideArea.MIDDLE, AddMode.PREPEND)
          this.addToTargetAreaPorts(sortedPorts.slice(splitIndex), side, PortSideArea.MIDDLE, AddMode.APPEND)
          break
        }
        default:
          throw new Error(`Unexpected ordering: ${ordering}`)
      }
    }
  }

  private computePortListSplitIndex(sortedPorts: SelfLoopPort[]): number {
    let positiveNetFlowIndex = 0
    for (; positiveNetFlowIndex < sortedPorts.length; positiveNetFlowIndex++) {
      if (sortedPorts[positiveNetFlowIndex]!.getSLNetFlow() > 0) break
    }
    if (positiveNetFlowIndex > 0 && positiveNetFlowIndex < sortedPorts.length - 1) {
      return positiveNetFlowIndex
    }

    let nonNegativeNetFlowIndex = 0
    for (; nonNegativeNetFlowIndex < sortedPorts.length; nonNegativeNetFlowIndex++) {
      if (sortedPorts[nonNegativeNetFlowIndex]!.getSLNetFlow() > 0) break
    }
    if (nonNegativeNetFlowIndex > 0 && positiveNetFlowIndex < sortedPorts.length - 1) {
      return nonNegativeNetFlowIndex
    }

    return Math.floor(sortedPorts.length / 2)
  }

  // ── Two Sides ──

  private processTwoSideCornerLoops(): void {
    for (const slLoop of this.slLoopsByType.get(SelfLoopType.TWO_SIDES_CORNER) ?? []) {
      const sides = PortRestorer.sortedTwoSideLoopPortSides(slLoop)
      this.addToTargetArea(slLoop, sides[0]!, PortSideArea.END, AddMode.PREPEND)
      this.addToTargetArea(slLoop, sides[1]!, PortSideArea.START, AddMode.APPEND)
    }
  }

  private processTwoSideOpposingLoops(): void {
    for (const slLoop of this.slLoopsByType.get(SelfLoopType.TWO_SIDES_OPPOSING) ?? []) {
      const sides = PortRestorer.sortedTwoSideLoopPortSides(slLoop)
      this.addToTargetArea(slLoop, sides[0]!, PortSideArea.END, AddMode.PREPEND)
      this.addToTargetArea(slLoop, sides[1]!, PortSideArea.START, AddMode.APPEND)
    }
  }

  static sortedTwoSideLoopPortSides(slLoop: SelfHyperLoop): PortSide[] {
    const sides = [...slLoop.getSLPortsBySideMap().keys()] as PortSide[]
    sides.sort((a, b) => sideOrder(a) - sideOrder(b))
    if (sides[0] === PortSide.NORTH && sides[1] === PortSide.WEST) {
      sides[0] = PortSide.WEST
      sides[1] = PortSide.NORTH
    }
    return sides
  }

  // ── Three Sides ──

  private static readonly NES: PortSide[] = [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH]
  private static readonly ESW: PortSide[] = [PortSide.EAST, PortSide.SOUTH, PortSide.WEST]
  private static readonly SWN: PortSide[] = [PortSide.SOUTH, PortSide.WEST, PortSide.NORTH]
  private static readonly WNE: PortSide[] = [PortSide.WEST, PortSide.NORTH, PortSide.EAST]

  private processThreeSideLoops(): void {
    for (const slLoop of this.slLoopsByType.get(SelfLoopType.THREE_SIDES) ?? []) {
      const sides = this.determineLoopConstellation(slLoop)
      this.addToTargetArea(slLoop, sides[0]!, PortSideArea.END, AddMode.PREPEND)
      this.addToTargetArea(slLoop, sides[1]!, PortSideArea.MIDDLE, AddMode.APPEND)
      this.addToTargetArea(slLoop, sides[2]!, PortSideArea.START, AddMode.APPEND)
    }
  }

  private determineLoopConstellation(slLoop: SelfHyperLoop): PortSide[] {
    const portSides = slLoop.getSLPortsBySideMap()
    if (!portSides.has(PortSide.NORTH)) return PortRestorer.ESW
    if (!portSides.has(PortSide.EAST)) return PortRestorer.SWN
    if (!portSides.has(PortSide.SOUTH)) return PortRestorer.WNE
    if (!portSides.has(PortSide.WEST)) return PortRestorer.NES
    throw new Error('Impossible')
  }

  // ── Four Sides ──

  private processFourSideLoops(): void {
    for (const slLoop of this.slLoopsByType.get(SelfLoopType.FOUR_SIDES) ?? []) {
      for (const side of slLoop.getSLPortsBySideMap().keys()) {
        this.addToTargetArea(slLoop, side, PortSideArea.MIDDLE, AddMode.APPEND)
      }
    }
  }

  // ── Utilities ──

  private addToTargetArea(slLoop: SelfHyperLoop, portSide: PortSide, area: PortSideArea, addMode: AddMode): void {
    this.addToTargetAreaPorts(slLoop.getSLPortsBySide(portSide), portSide, area, addMode)
  }

  private addToTargetAreaPorts(slPorts: SelfLoopPort[], _portSide: PortSide, area: PortSideArea, addMode: AddMode): void {
    const hiddenPorts = slPorts.filter(p => p.isHidden())
    hiddenPorts.reverse()
    const targetArea = this.targetAreas.get(areaKey(_portSide, area))!
    if (addMode === AddMode.PREPEND) {
      targetArea.unshift(...hiddenPorts)
    } else {
      targetArea.push(...hiddenPorts)
    }
  }

  // ── Restore ──

  private restorePortList(slHolder: SelfLoopHolder): void {
    const lNode = slHolder.getLNode()
    const oldPortList = [...lNode.getPorts()]
    let nextOldPortIndex = 0

    const newPortList = lNode.getPorts()
    newPortList.length = 0

    this.addAll(this.targetAreas.get(areaKey(PortSide.NORTH, PortSideArea.START))!, lNode)
    nextOldPortIndex = this.addAllThat(
      oldPortList, nextOldPortIndex,
      (lPort) => lPort.getSide() === PortSide.NORTH && this.isNorthSouthPortWithWestOrWestEastConnections(lPort),
      newPortList)
    this.addAll(this.targetAreas.get(areaKey(PortSide.NORTH, PortSideArea.MIDDLE))!, lNode)
    nextOldPortIndex = this.addAllThat(
      oldPortList, nextOldPortIndex,
      (lPort) => lPort.getSide() === PortSide.NORTH,
      newPortList)
    this.addAll(this.targetAreas.get(areaKey(PortSide.NORTH, PortSideArea.END))!, lNode)

    this.addAll(this.targetAreas.get(areaKey(PortSide.EAST, PortSideArea.START))!, lNode)
    this.addAll(this.targetAreas.get(areaKey(PortSide.EAST, PortSideArea.MIDDLE))!, lNode)
    nextOldPortIndex = this.addAllThat(
      oldPortList, nextOldPortIndex,
      (lPort) => lPort.getSide() === PortSide.EAST,
      newPortList)
    this.addAll(this.targetAreas.get(areaKey(PortSide.EAST, PortSideArea.END))!, lNode)

    this.addAll(this.targetAreas.get(areaKey(PortSide.SOUTH, PortSideArea.START))!, lNode)
    nextOldPortIndex = this.addAllThat(
      oldPortList, nextOldPortIndex,
      (lPort) => lPort.getSide() === PortSide.SOUTH && this.isNorthSouthPortWithEastConnections(lPort),
      newPortList)
    this.addAll(this.targetAreas.get(areaKey(PortSide.SOUTH, PortSideArea.MIDDLE))!, lNode)
    nextOldPortIndex = this.addAllThat(
      oldPortList, nextOldPortIndex,
      (lPort) => lPort.getSide() === PortSide.SOUTH,
      newPortList)
    this.addAll(this.targetAreas.get(areaKey(PortSide.SOUTH, PortSideArea.END))!, lNode)

    this.addAll(this.targetAreas.get(areaKey(PortSide.WEST, PortSideArea.START))!, lNode)
    nextOldPortIndex = this.addAllThat(
      oldPortList, nextOldPortIndex,
      (lPort) => lPort.getSide() === PortSide.WEST,
      newPortList)
    this.addAll(this.targetAreas.get(areaKey(PortSide.WEST, PortSideArea.MIDDLE))!, lNode)
    this.addAll(this.targetAreas.get(areaKey(PortSide.WEST, PortSideArea.END))!, lNode)
  }

  private addAll(slPorts: SelfLoopPort[], lNode: LNode): void {
    for (const slPort of slPorts) {
      slPort.getLPort().setNode(lNode)
    }
  }

  private addAllThat(
    lPorts: LPort[], fromIndex: number, condition: (p: LPort) => boolean, target: LPort[],
  ): number {
    for (let i = fromIndex; i < lPorts.length; i++) {
      const lPort = lPorts[i]!
      if (condition(lPort)) {
        target.push(lPort)
      } else {
        return i
      }
    }
    return lPorts.length
  }

  private isNorthSouthPortWithWestOrWestEastConnections(lPort: LPort): boolean {
    const connections = this.northSouthPortConnectionSides(lPort)
    const westConnections = connections.has(PortSide.WEST)
    return westConnections
  }

  private isNorthSouthPortWithEastConnections(lPort: LPort): boolean {
    const connections = this.northSouthPortConnectionSides(lPort)
    return connections.has(PortSide.EAST)
  }

  private northSouthPortConnectionSides(lPort: LPort): Set<PortSide> {
    const connectionSides = new Set<PortSide>()
    const portDummy = lPort.getProperty(PORT_DUMMY) as LNode | null
    if (portDummy !== null && portDummy !== undefined) {
      for (const dummyLPort of portDummy.getPorts()) {
        if (dummyLPort.getProperty(ORIGIN) as LPort === lPort) {
          if (dummyLPort.getConnectedEdges().length > 0) {
            connectionSides.add(dummyLPort.getSide())
          }
        }
      }
    }
    return connectionSides
  }
}

const SIDES = [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]

function areaKey(side: PortSide, area: PortSideArea): string {
  return `${side}-${area}`
}

function sideOrder(side: PortSide): number {
  switch (side) {
    case PortSide.NORTH: return 0
    case PortSide.EAST: return 1
    case PortSide.SOUTH: return 2
    case PortSide.WEST: return 3
    default: return 4
  }
}

import { SELF_LOOP_ORDERING as SELF_LOOP_ORDERING_PROP } from '../../../options/layered-options.js'
