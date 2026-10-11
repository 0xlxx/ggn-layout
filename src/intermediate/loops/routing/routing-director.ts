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
 * RoutingDirector (对应 ELK intermediate.loops.routing.RoutingDirector).
 * 决定每个自环超边的 leftmost/rightmost 端口 (即环路绕节点的路径).
 */
import { PortSide } from '../../../graph/enums.js'
import type { SelfHyperLoop } from '../self-hyper-loop.js'
import type { SelfLoopHolder } from '../self-loop-holder.js'
import type { SelfLoopPort } from '../self-loop-port.js'
import { SelfLoopType } from '../self-loop-type.js'
import { portSideRight } from '../port-side-util.js'
import { PortRestorer } from '../ordering/port-restorer.js'

const UNCONNECTED_PORT_PENALTY = 1
const CONNECTED_PORT_PENALTY = 3

// ELK 0.12.0 SelfHyperLoop.computePortsPerSide 用 Guava ArrayListMultimap (HashMap 后备) —
// getSLPortsBySide().keySet() 迭代序是 **JVM 哈希序** (非插入序), 本机 (openjdk21 + guava 33.4.0)
// 实测为 [WEST, NORTH, SOUTH, EAST] (Instr16Main 验证). determineTwoSideOpposing 用 sides[0] 决定
// 自环走上/下侧: 序 [WEST,EAST] → leftmost=WEST → 上侧 (inside_outside oracle y=22);
// TS Map 插入序 [EAST,WEST] → 下侧 (y=12, 与 elkjs 同). 为对齐 jar SSOT, 按 Java 哈希序迭代.
const JAVA_HASHMAP_PORT_SIDE_ORDER: PortSide[] = [
  PortSide.WEST, PortSide.NORTH, PortSide.SOUTH, PortSide.EAST,
]

const COMPARE_BY_ID = (a: SelfLoopPort, b: SelfLoopPort): number => a.getLPort().id - b.getLPort().id

export class RoutingDirector {
  private portPenalties: number[] | null = null

  determineLoopRoutes(slHolder: SelfLoopHolder): void {
    if (process.env.GGN_SL_DBG) {
      for (const slLoop of slHolder.getSLHyperLoops()) {
        console.error(`GGN SL loop type=${slLoop.getSelfLoopType()} ports=${slLoop.getSLPorts().map(p => `${p.getLPort().id}:${p.getLPort().getSide()}`).join(',')}`)
      }
    }
    this.assignPortIds(slHolder.getLNode().getPorts())
    this.sortHyperLoopPortLists(slHolder)

    for (const slLoop of slHolder.getSLHyperLoops()) {
      switch (slLoop.getSelfLoopType()) {
        case SelfLoopType.ONE_SIDE:
          this.determineOneSideLoopRoutes(slLoop)
          break
        case SelfLoopType.TWO_SIDES_CORNER:
          this.determineTwoSideCornerLoopRoutes(slLoop)
          break
        case SelfLoopType.TWO_SIDES_OPPOSING:
          this.determineTwoSideOpposingLoopRoutes(slLoop)
          break
        case SelfLoopType.THREE_SIDES:
          this.determineThreeSideLoopRoutes(slLoop)
          break
        case SelfLoopType.FOUR_SIDES:
          this.determineFourSideLoopRoutes(slLoop)
          break
        default:
          throw new Error('Unexpected self loop type')
      }
      this.computeOccupiedPortSides(slLoop)
    }
    this.portPenalties = null
  }

  private assignPortIds(lPorts: { id: number }[]): void {
    for (let i = 0; i < lPorts.length; i++) {
      lPorts[i]!.id = i
    }
  }

  private sortHyperLoopPortLists(slHolder: SelfLoopHolder): void {
    for (const slLoop of slHolder.getSLHyperLoops()) {
      slLoop.getSLPorts().sort(COMPARE_BY_ID)
    }
  }

  private computeOccupiedPortSides(slLoop: SelfHyperLoop): void {
    let currPortSide = slLoop.getLeftmostPort().getLPort().getSide()
    const targetSide = slLoop.getRightmostPort().getLPort().getSide()
    while (currPortSide !== targetSide) {
      slLoop.getOccupiedPortSides().add(currPortSide)
      currPortSide = portSideRight(currPortSide)
    }
    slLoop.getOccupiedPortSides().add(currPortSide)
  }

  private determineOneSideLoopRoutes(slLoop: SelfHyperLoop): void {
    const side = slLoop.getSLPorts()[0]!.getLPort().getSide()
    this.assignLeftmostRightmostPorts(slLoop, side, side)
  }

  private determineTwoSideCornerLoopRoutes(slLoop: SelfHyperLoop): void {
    const sides = PortRestorer.sortedTwoSideLoopPortSides(slLoop)
    this.assignLeftmostRightmostPorts(slLoop, sides[0]!, sides[1]!)
  }

  private determineTwoSideOpposingLoopRoutes(slLoop: SelfHyperLoop): void {
    // ELK 0.12.0: `slLoop.getSLPortsBySide().keySet().toArray(...)` — Guava ArrayListMultimap (HashMap)
    // 的 key 迭代顺序, 非插入序 (RoutingDirector.java:150). 按本机 Java 哈希序对齐 (§42).
    const sides = ([...slLoop.getSLPortsBySideMap().keys()] as PortSide[])
      .sort((a, b) => JAVA_HASHMAP_PORT_SIDE_ORDER.indexOf(a) - JAVA_HASHMAP_PORT_SIDE_ORDER.indexOf(b))
    const slHolder = slLoop.getSLHolder()

    const option1LeftmostPort = this.lowestPortOnSide(slLoop, sides[0]!)
    const option1RightmostPort = this.highestPortOnSide(slLoop, sides[1]!)
    const option1Penalty = this.computeEdgePenalty(slHolder, option1LeftmostPort, option1RightmostPort)

    const option2LeftmostPort = this.lowestPortOnSide(slLoop, sides[1]!)
    const option2RightmostPort = this.highestPortOnSide(slLoop, sides[0]!)
    const option2Penalty = this.computeEdgePenalty(slHolder, option2LeftmostPort, option2RightmostPort)

    // ELK 0.12.0: `if (option1Penalty <= option2Penalty)` 平局必走 option1 (RoutingDirector.java:164).
    if (process.env.GGN_SL_DBG) {
      const portInfo = slHolder.getLNode().getPorts().map(p => `${p.id}:${p.getSide()}`).join(',')
      console.error(`GGN SL opposing sides=[${sides}] ports=[${portInfo}] opt1=(${option1LeftmostPort.getLPort().id},${option1RightmostPort.getLPort().id}) p=${option1Penalty} opt2=(${option2LeftmostPort.getLPort().id},${option2RightmostPort.getLPort().id}) p=${option2Penalty}`)
    }
    if (option1Penalty <= option2Penalty) {
      slLoop.setLeftmostPort(option1LeftmostPort)
      slLoop.setRightmostPort(option1RightmostPort)
    } else {
      slLoop.setLeftmostPort(option2LeftmostPort)
      slLoop.setRightmostPort(option2RightmostPort)
    }
  }

  private determineThreeSideLoopRoutes(slLoop: SelfHyperLoop): void {
    let leftmostSide: PortSide
    let rightmostSide: PortSide
    switch (this.computeMissingPortSide(slLoop)) {
      case PortSide.NORTH:
        leftmostSide = PortSide.EAST; rightmostSide = PortSide.WEST; break
      case PortSide.EAST:
        leftmostSide = PortSide.SOUTH; rightmostSide = PortSide.NORTH; break
      case PortSide.SOUTH:
        leftmostSide = PortSide.WEST; rightmostSide = PortSide.EAST; break
      default:
        leftmostSide = PortSide.NORTH; rightmostSide = PortSide.SOUTH; break
    }
    this.assignLeftmostRightmostPorts(slLoop, leftmostSide, rightmostSide)
  }

  private computeMissingPortSide(slLoop: SelfHyperLoop): PortSide {
    const sides = slLoop.getSLPortsBySideMap()
    for (const side of [PortSide.NORTH, PortSide.EAST, PortSide.SOUTH, PortSide.WEST]) {
      if (!sides.has(side)) return side
    }
    throw new Error('Cannot happen')
  }

  private determineFourSideLoopRoutes(slLoop: SelfHyperLoop): void {
    const sortedSLPorts = slLoop.getSLPorts()
    const slHolder = slLoop.getSLHolder()

    let worstLeftPort = sortedSLPorts[sortedSLPorts.length - 1]!
    let worstRightPort = sortedSLPorts[0]!
    let worstPenalty = this.computeEdgePenalty(slHolder, worstLeftPort, worstRightPort)

    for (let rightPortIndex = 1; rightPortIndex < sortedSLPorts.length; rightPortIndex++) {
      const currLeftPort = sortedSLPorts[rightPortIndex - 1]!
      const currRightPort = sortedSLPorts[rightPortIndex]!
      const currPenalty = this.computeEdgePenalty(slHolder, currLeftPort, currRightPort)
      if (currPenalty > worstPenalty) {
        worstLeftPort = currLeftPort
        worstRightPort = currRightPort
        worstPenalty = currPenalty
      }
    }

    slLoop.setLeftmostPort(worstRightPort)
    slLoop.setRightmostPort(worstLeftPort)
  }

  private assignLeftmostRightmostPorts(slLoop: SelfHyperLoop, leftmostSide: PortSide, rightmostSide: PortSide): void {
    slLoop.setLeftmostPort(this.lowestPortOnSide(slLoop, leftmostSide))
    slLoop.setRightmostPort(this.highestPortOnSide(slLoop, rightmostSide))
  }

  private lowestPortOnSide(slLoop: SelfHyperLoop, side: PortSide): SelfLoopPort {
    const ports = slLoop.getSLPortsBySide(side)
    let min = ports[0]!
    for (const p of ports) if (COMPARE_BY_ID(p, min) < 0) min = p
    return min
  }

  private highestPortOnSide(slLoop: SelfHyperLoop, side: PortSide): SelfLoopPort {
    const ports = slLoop.getSLPortsBySide(side)
    let max = ports[0]!
    for (const p of ports) if (COMPARE_BY_ID(p, max) > 0) max = p
    return max
  }

  private computeEdgePenalty(slHolder: SelfLoopHolder, leftmostPort: SelfLoopPort, rightmostPort: SelfLoopPort): number {
    if (this.portPenalties === null) {
      this.computePenalties(slHolder)
    }
    const portCount = slHolder.getLNode().getPorts().length
    const leftmostPortId = leftmostPort.getLPort().id
    const rightmostPortId = rightmostPort.getLPort().id
    let leftOfRightmostPortId = rightmostPortId - 1
    if (leftOfRightmostPortId < 0) {
      leftOfRightmostPortId = portCount - 1
    }
    const pp = this.portPenalties!
    if (leftmostPortId <= leftOfRightmostPortId) {
      return pp[leftOfRightmostPortId]! - pp[leftmostPortId]!
    } else {
      return pp[portCount - 1]! - pp[leftmostPortId]! + pp[leftOfRightmostPortId]!
    }
  }

  private computePenalties(slHolder: SelfLoopHolder): void {
    const ports = slHolder.getLNode().getPorts()
    this.portPenalties = new Array<number>(ports.length)
    let penaltySum = 0
    for (let i = 0; i < ports.length; i++) {
      const currPort = ports[i]!
      if (currPort.getIncomingEdges().length === 0 && currPort.getOutgoingEdges().length === 0) {
        penaltySum += UNCONNECTED_PORT_PENALTY
      } else {
        penaltySum += CONNECTED_PORT_PENALTY
      }
      this.portPenalties[i] = penaltySum
    }
  }
}
