/**
 * PortSideAssigner (对应 ELK intermediate.loops.ordering.PortSideAssigner).
 * 为隐藏的自环端口分配北/南侧 (按 selfLoopDistribution 策略). 不恢复端口.
 */
import { PortSide } from '../../../graph/enums.js'
import { SELF_LOOP_DISTRIBUTION } from '../../../options/layered-options.js'
import type { SelfHyperLoop } from '../self-hyper-loop.js'
import type { SelfLoopHolder } from '../self-loop-holder.js'
import type { SelfLoopPort } from '../self-loop-port.js'

/** 端口分配目标: 单侧或跨角. */
interface Target {
  readonly name: string
  readonly firstSide: PortSide
  readonly secondSide: PortSide
}

const TARGET_NORTH: Target = { name: 'NORTH', firstSide: PortSide.NORTH, secondSide: PortSide.NORTH }
const TARGET_SOUTH: Target = { name: 'SOUTH', firstSide: PortSide.SOUTH, secondSide: PortSide.SOUTH }
const TARGET_EAST: Target = { name: 'EAST', firstSide: PortSide.EAST, secondSide: PortSide.EAST }
const TARGET_WEST: Target = { name: 'WEST', firstSide: PortSide.WEST, secondSide: PortSide.WEST }
const TARGET_NW: Target = { name: 'NORTH_WEST_CORNER', firstSide: PortSide.WEST, secondSide: PortSide.NORTH }
const TARGET_NE: Target = { name: 'NORTH_EAST_CORNER', firstSide: PortSide.NORTH, secondSide: PortSide.EAST }
const TARGET_SW: Target = { name: 'SOUTH_WEST_CORNER', firstSide: PortSide.SOUTH, secondSide: PortSide.WEST }
const TARGET_SE: Target = { name: 'SOUTH_EAST_CORNER', firstSide: PortSide.EAST, secondSide: PortSide.SOUTH }

const ASSIGNMENT_TARGETS: Target[] = [
  TARGET_NORTH, TARGET_SOUTH, TARGET_EAST, TARGET_WEST,
  TARGET_NW, TARGET_NE, TARGET_SW, TARGET_SE,
]

const isCornerTarget = (t: Target): boolean => t.firstSide !== t.secondSide

export class PortSideAssigner {
  assignPortSides(slHolder: SelfLoopHolder): void {
    // ELK 节点级选项优先, 回退图级 (node 选项在 NODE_OPTS 注入).
    const distribution = slHolder.getLNode().hasProperty(SELF_LOOP_DISTRIBUTION)
      ? slHolder.getLNode().getProperty(SELF_LOOP_DISTRIBUTION)
      : slHolder.getLNode().getGraph()!.getProperty(SELF_LOOP_DISTRIBUTION)
    switch (distribution) {
      case 'NORTH':
        this.assignToNorthSide(slHolder)
        break
      case 'NORTH_SOUTH':
        this.assignToNorthOrSouthSide(slHolder)
        break
      case 'EQUALLY':
        this.assignToAllSides(slHolder)
        break
      default:
        throw new Error(`Unexpected distribution: ${String(distribution)}`)
    }
  }

  private assignToNorthSide(slHolder: SelfLoopHolder): void {
    for (const slLoop of slHolder.getSLHyperLoops()) {
      for (const slPort of this.hiddenSelfLoopPortStream(slLoop)) {
        slPort.getLPort().setSide(PortSide.NORTH)
      }
    }
  }

  private assignToNorthOrSouthSide(slHolder: SelfLoopHolder): void {
    let northPorts = 0
    let southPorts = 0
    for (const slLoop of slHolder.getSLHyperLoops()) {
      const slHiddenPorts = this.hiddenSelfLoopPortStream(slLoop)
      let newPortSide: PortSide
      if (northPorts <= southPorts) {
        newPortSide = PortSide.NORTH
        northPorts += slHiddenPorts.length
      } else {
        newPortSide = PortSide.SOUTH
        southPorts += slHiddenPorts.length
      }
      for (const slPort of slHiddenPorts) {
        slPort.getLPort().setSide(newPortSide)
      }
    }
  }

  private assignToAllSides(slHolder: SelfLoopHolder): void {
    const slSortedLoops = [...slHolder.getSLHyperLoops()]
    slSortedLoops.sort((a, b) => b.getSLPorts().length - a.getSLPorts().length)

    let currLoop = 0
    for (const slLoop of slSortedLoops) {
      const currTarget = ASSIGNMENT_TARGETS[currLoop % ASSIGNMENT_TARGETS.length]!
      this.assignToTarget(slLoop, currTarget)
      currLoop++
    }
  }

  private assignToTarget(slLoop: SelfHyperLoop, target: Target): void {
    const slPorts = slLoop.getSLPorts()
    if (isCornerTarget(target)) {
      slPorts.sort((a, b) => a.getLPort().getNetFlow() - b.getLPort().getNetFlow())
    }
    const secondHalfStartIndex = Math.floor(slPorts.length / 2)
    for (let i = 0; i < secondHalfStartIndex; i++) {
      const slPort = slPorts[i]!
      if (slPort.isHidden()) slPort.getLPort().setSide(target.firstSide)
    }
    for (let i = secondHalfStartIndex; i < slPorts.length; i++) {
      const slPort = slPorts[i]!
      if (slPort.isHidden()) slPort.getLPort().setSide(target.secondSide)
    }
  }

  private hiddenSelfLoopPortStream(slLoop: SelfHyperLoop): SelfLoopPort[] {
    return slLoop.getSLPorts().filter(p => p.isHidden())
  }
}
