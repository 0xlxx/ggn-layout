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
 * RoutingSlotAssigner (对应 ELK intermediate.loops.routing.RoutingSlotAssigner).
 * 为每个自环超边在其跨越的每侧分配路由槽, 最小化自环交叉.
 * 复用 OrthogonalRoutingGenerator 的 crossing graph 机制 (超边段依赖 + 断环).
 */
import type { LNode } from '../../../graph/lnode.js'
import { PortSide } from '../../../graph/enums.js'
import { RANDOM } from '../../../options/internal-properties.js'
import { HyperEdgeCycleDetector } from '../../../p5edges/orthogonal/hyper-edge-cycle-detector.js'
import { HyperEdgeSegment } from '../../../p5edges/orthogonal/hyper-edge-segment.js'
import { HyperEdgeSegmentDependency } from '../../../p5edges/orthogonal/hyper-edge-segment-dependency.js'
import type { SelfHyperLoop } from '../self-hyper-loop.js'
import type { SelfLoopHolder } from '../self-loop-holder.js'

export class RoutingSlotAssigner {
  private hyperEdgeSegments: HyperEdgeSegment[] = []
  private slLoopToSegmentMap: Map<SelfHyperLoop, HyperEdgeSegment> = new Map()
  private slLoopActivityOverPorts: Map<SelfHyperLoop, boolean[]> = new Map()

  assignRoutingSlots(slHolder: SelfLoopHolder): void {
    const labelCrossingMatrix = this.computeLabelCrossingMatrix(slHolder)
    this.createCrossingGraph(slHolder, labelCrossingMatrix)

    const random = slHolder.getLNode().getGraph()!.getProperty(RANDOM)
    breakNonCriticalCycles(this.hyperEdgeSegments, random)

    this.doAssignRoutingSlots(slHolder, labelCrossingMatrix)

    this.hyperEdgeSegments = []
    this.slLoopToSegmentMap = new Map()
    this.slLoopActivityOverPorts = new Map()
  }

  // ── Label Crossing Matrix ──

  private computeLabelCrossingMatrix(slHolder: SelfLoopHolder): boolean[][] {
    let labelID = 0
    for (const slLoop of slHolder.getSLHyperLoops()) {
      if (slLoop.getSLLabels() !== null) {
        slLoop.getSLLabels()!.id = labelID++
      }
    }
    const crossingMatrix: boolean[][] = Array.from({ length: labelID }, () => new Array<boolean>(labelID).fill(false))
    const slLoops = slHolder.getSLHyperLoops()
    for (let sl1Idx = 0; sl1Idx < slLoops.length; sl1Idx++) {
      const slLoop1 = slLoops[sl1Idx]!
      if (slLoop1.getSLLabels() !== null) {
        for (let sl2Idx = sl1Idx + 1; sl2Idx < slLoops.length; sl2Idx++) {
          const slLoop2 = slLoops[sl2Idx]!
          if (slLoop2.getSLLabels() !== null) {
            const overlap = labelsOverlap(slLoop1, slLoop2)
            crossingMatrix[slLoop1.getSLLabels()!.id]![slLoop2.getSLLabels()!.id] = overlap
            crossingMatrix[slLoop2.getSLLabels()!.id]![slLoop1.getSLLabels()!.id] = overlap
          }
        }
      }
    }
    return crossingMatrix
  }

  // ── Crossing Graph ──

  private createCrossingGraph(slHolder: SelfLoopHolder, labelCrossingMatrix: boolean[][]): void {
    const slLoops = slHolder.getSLHyperLoops()
    this.hyperEdgeSegments = new Array(slLoops.length)
    this.slLoopToSegmentMap = new Map()

    for (let i = 0; i < slLoops.length; i++) {
      const segment = new HyperEdgeSegment()
      this.hyperEdgeSegments[i] = segment
      this.slLoopToSegmentMap.set(slLoops[i]!, segment)
    }

    this.slLoopActivityOverPorts = new Map()
    this.computeLoopActivity(slHolder)

    for (let firstIdx = 0; firstIdx < slLoops.length - 1; firstIdx++) {
      const slLoop1 = slLoops[firstIdx]!
      for (let secondIdx = firstIdx + 1; secondIdx < slLoops.length; secondIdx++) {
        this.createDependencies(slLoop1, slLoops[secondIdx]!, labelCrossingMatrix)
      }
    }
  }

  private computeLoopActivity(slHolder: SelfLoopHolder): void {
    const slLoops = slHolder.getSLHyperLoops()
    const lPorts = slHolder.getLNode().getPorts()
    for (const slLoop of slLoops) {
      const loopActivity = new Array<boolean>(lPorts.length).fill(false)
      this.slLoopActivityOverPorts.set(slLoop, loopActivity)

      let lPortIdx = slLoop.getLeftmostPort().getLPort().id - 1
      const lPortTargetIdx = slLoop.getRightmostPort().getLPort().id
      while (lPortIdx !== lPortTargetIdx) {
        lPortIdx = (lPortIdx + 1) % lPorts.length
        loopActivity[lPortIdx] = true
      }
    }
  }

  private createDependencies(slLoop1: SelfHyperLoop, slLoop2: SelfHyperLoop, labelCrossingMatrix: boolean[][]): void {
    const firstAboveSecondCrossings = this.countCrossings(slLoop1, slLoop2)
    const secondAboveFirstCrossings = this.countCrossings(slLoop2, slLoop1)

    const segment1 = this.slLoopToSegmentMap.get(slLoop1)!
    const segment2 = this.slLoopToSegmentMap.get(slLoop2)!

    if (firstAboveSecondCrossings < secondAboveFirstCrossings) {
      HyperEdgeSegmentDependency.createAndAddRegular(segment1, segment2, secondAboveFirstCrossings - firstAboveSecondCrossings)
    } else if (secondAboveFirstCrossings < firstAboveSecondCrossings) {
      HyperEdgeSegmentDependency.createAndAddRegular(segment2, segment1, firstAboveSecondCrossings - secondAboveFirstCrossings)
    } else if (firstAboveSecondCrossings !== 0 || this.labelsOverlapWithMatrix(slLoop1, slLoop2, labelCrossingMatrix)) {
      HyperEdgeSegmentDependency.createAndAddRegular(segment1, segment2, 0)
      HyperEdgeSegmentDependency.createAndAddRegular(segment2, segment1, 0)
    }
  }

  private countCrossings(slUpperLoop: SelfHyperLoop, slLowerLoop: SelfHyperLoop): number {
    const lowerLoopActivity = this.slLoopActivityOverPorts.get(slLowerLoop)!
    let crossings = 0
    for (const slPort of slUpperLoop.getSLPorts()) {
      if (lowerLoopActivity[slPort.getLPort().id]) crossings++
    }
    return crossings
  }

  private labelsOverlapWithMatrix(slLoop1: SelfHyperLoop, slLoop2: SelfHyperLoop, labelCrossingMatrix: boolean[][]): boolean {
    if (slLoop1.getSLLabels() === null || slLoop2.getSLLabels() === null) return false
    return labelCrossingMatrix[slLoop1.getSLLabels()!.id]![slLoop2.getSLLabels()!.id]!
  }

  // ── Slot Assignment ──

  private doAssignRoutingSlots(slHolder: SelfLoopHolder, labelCrossingMatrix: boolean[][]): void {
    this.assignRawRoutingSlotsToSegments()
    this.assignRawRoutingSlotsToLoops(slHolder)
    this.shiftTowardsNode(slHolder, labelCrossingMatrix)
  }

  private assignRawRoutingSlotsToSegments(): void {
    const sinks: HyperEdgeSegment[] = []
    for (const segment of this.hyperEdgeSegments) {
      segment.setInWeight(segment.getIncomingSegmentDependencies().length)
      segment.setOutWeight(segment.getOutgoingSegmentDependencies().length)
      if (segment.getOutWeight() === 0) {
        segment.setRoutingSlot(0)
        sinks.push(segment)
      }
    }
    while (sinks.length > 0) {
      const segment = sinks.shift()!
      const nextRoutingSlot = segment.getRoutingSlot() + 1
      for (const inDependency of segment.getIncomingSegmentDependencies()) {
        const sourceSegment = inDependency.getSource()!
        sourceSegment.setRoutingSlot(Math.max(sourceSegment.getRoutingSlot(), nextRoutingSlot))
        sourceSegment.setOutWeight(sourceSegment.getOutWeight() - 1)
        if (sourceSegment.getOutWeight() === 0) sinks.push(sourceSegment)
      }
    }
  }

  private assignRawRoutingSlotsToLoops(slHolder: SelfLoopHolder): void {
    for (const slLoop of slHolder.getSLHyperLoops()) {
      const segment = this.slLoopToSegmentMap.get(slLoop)!
      for (const portSide of slLoop.getOccupiedPortSides()) {
        slLoop.setRoutingSlot(portSide, segment.getRoutingSlot())
      }
    }
  }

  private shiftTowardsNode(slHolder: SelfLoopHolder, labelCrossingMatrix: boolean[][]): void {
    const nextFreeRoutingSlotAtPort = new Array<number>(slHolder.getLNode().getPorts().length).fill(0)
    this.shiftTowardsNodeOnSide(slHolder, PortSide.NORTH, nextFreeRoutingSlotAtPort, labelCrossingMatrix)
    this.shiftTowardsNodeOnSide(slHolder, PortSide.EAST, nextFreeRoutingSlotAtPort, labelCrossingMatrix)
    this.shiftTowardsNodeOnSide(slHolder, PortSide.SOUTH, nextFreeRoutingSlotAtPort, labelCrossingMatrix)
    this.shiftTowardsNodeOnSide(slHolder, PortSide.WEST, nextFreeRoutingSlotAtPort, labelCrossingMatrix)
  }

  private shiftTowardsNodeOnSide(
    slHolder: SelfLoopHolder, side: PortSide, nextFreeRoutingSlotAtPort: number[], labelCrossingMatrix: boolean[][],
  ): void {
    const slLoops = slHolder.getSLHyperLoops()
      .filter(slLoop => slLoop.getOccupiedPortSides().has(side))
      .sort((a, b) => a.getRoutingSlot(side) - b.getRoutingSlot(side))

    const lNode: LNode = slHolder.getLNode()
    let minLPortIndex = Number.MAX_SAFE_INTEGER
    let maxLPortIndex = Number.MIN_SAFE_INTEGER
    for (const lPort of lNode.getPorts()) {
      if (lPort.getSide() === side) {
        minLPortIndex = Math.min(minLPortIndex, lPort.id)
        maxLPortIndex = Math.max(maxLPortIndex, lPort.id)
      }
    }

    if (minLPortIndex === Number.MAX_SAFE_INTEGER) {
      for (let i = 0; i < slLoops.length; i++) {
        slLoops[i]!.setRoutingSlot(side, i)
      }
    } else {
      const slotAssignedToLabel = new Array<number>(labelCrossingMatrix.length).fill(-1)
      for (const slLoop of slLoops) {
        const activeAtPort = this.slLoopActivityOverPorts.get(slLoop)!
        let lowestAvailableSlot = 0
        for (let portIndex = minLPortIndex; portIndex <= maxLPortIndex; portIndex++) {
          if (activeAtPort[portIndex]) {
            lowestAvailableSlot = Math.max(lowestAvailableSlot, nextFreeRoutingSlotAtPort[portIndex]!)
          }
        }

        if (slLoop.getSLLabels() !== null) {
          const ourLabelIdx = slLoop.getSLLabels()!.id
          const slotsWithLabelConflicts = new Set<number>()
          for (let otherLabelIdx = 0; otherLabelIdx < labelCrossingMatrix.length; otherLabelIdx++) {
            if (labelCrossingMatrix[ourLabelIdx]![otherLabelIdx]) {
              slotsWithLabelConflicts.add(slotAssignedToLabel[otherLabelIdx]!)
            }
          }
          while (slotsWithLabelConflicts.has(lowestAvailableSlot)) {
            lowestAvailableSlot++
          }
        }

        slLoop.setRoutingSlot(side, lowestAvailableSlot)
        for (let portIndex = minLPortIndex; portIndex <= maxLPortIndex; portIndex++) {
          if (activeAtPort[portIndex]) {
            nextFreeRoutingSlotAtPort[portIndex] = lowestAvailableSlot + 1
          }
        }

        if (slLoop.getSLLabels() !== null) {
          slotAssignedToLabel[slLoop.getSLLabels()!.id] = lowestAvailableSlot
        }
      }
    }
  }
}

function labelsOverlap(slLoop1: SelfHyperLoop, slLoop2: SelfHyperLoop): boolean {
  const slLabels1 = slLoop1.getSLLabels()
  const slLabels2 = slLoop2.getSLLabels()
  if (slLabels1 === null || slLabels2 === null) return false
  if (slLabels1.getSide() !== slLabels2.getSide()
    || slLabels1.getSide() === PortSide.EAST || slLabels1.getSide() === PortSide.WEST) {
    return false
  }
  const start1 = slLabels1.getPosition().x
  const end1 = start1 + slLabels1.getSize().x
  const start2 = slLabels2.getPosition().x
  const end2 = start2 + slLabels2.getSize().x
  return start1 <= end2 && end1 >= start2
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
