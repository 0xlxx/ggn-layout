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
 * LabelPlacer (对应 ELK intermediate.loops.routing.LabelPlacer).
 * 为自环标签分配侧/对齐并计算坐标. 与 ELK Java 0.12.0 逐分支同构:
 *  - ONE_SIDE EAST/WEST → Alignment.TOP + 最上端口 reference (LabelPlacer.java:155-166,394-395)
 *  - ONE_SIDE NORTH/SOUTH → CENTER
 *  - SEQUENCED 策略: 北/南单侧环成对内外对齐 (LabelPlacer.java:172-236)
 *  - TWO_SIDES_CORNER: 按 leftmost/rightmost 侧 LEFT/RIGHT (LabelPlacer.java:238-249)
 *  - TWO_SIDES_OPPOSING / THREE_SIDES: 按未占用侧 SOUTH/NORTH+CENTER 或 NORTH+LEFT/RIGHT
 *    (LabelPlacer.java:262-309)
 *  - FOUR_SIDES: 按 leftmost 端口侧 SOUTH/NORTH+CENTER (LabelPlacer.java:311-343)
 */
import { PortSide } from '../../../graph/enums.js'
import { SELF_LOOP_ORDERING } from '../../../options/layered-options.js'
import type { SelfHyperLoop } from '../self-hyper-loop.js'
import { LabelAlignment } from '../self-hyper-loop-labels.js'
import type { SelfLoopHolder } from '../self-loop-holder.js'
import type { SelfLoopPort } from '../self-loop-port.js'
import { SelfLoopType } from '../self-loop-type.js'

export function placeSelfLoopLabels(slHolder: SelfLoopHolder): void {
  assignSideAndAlignment(slHolder)
  for (const slLoop of slHolder.getSLHyperLoops()) {
    if (slLoop.getSLLabels() !== null) {
      computeCoordinates(slLoop)
    }
  }
}

function assignSideAndAlignment(slHolder: SelfLoopHolder): void {
  // 多数环可直接处理; 但 NORTH/SOUTH 单侧环在 SEQUENCED 策略下需要成对处理,
  // 先收集再统一分配 (LabelPlacer.java:99-147).
  let northernOneSidedSLLoops: SelfHyperLoop[] | null = null
  let southernOneSidedSLLoops: SelfHyperLoop[] | null = null

  // ELK 节点级选项优先, 回退图级.
  const orderingStrategy = slHolder.getLNode().hasProperty(SELF_LOOP_ORDERING)
    ? slHolder.getLNode().getProperty(SELF_LOOP_ORDERING)
    : slHolder.getLNode().getGraph()!.getProperty(SELF_LOOP_ORDERING)
  if (orderingStrategy === 'SEQUENCED') {
    northernOneSidedSLLoops = []
    southernOneSidedSLLoops = []
  }

  for (const slLoop of slHolder.getSLHyperLoops()) {
    const slLabels = slLoop.getSLLabels()
    if (slLabels === null) continue

    switch (slLoop.getSelfLoopType()) {
      case SelfLoopType.ONE_SIDE: {
        const loopSide = slLoop.getOccupiedPortSides().values().next().value as PortSide
        if (orderingStrategy === 'SEQUENCED' && loopSide === PortSide.NORTH) {
          northernOneSidedSLLoops!.push(slLoop)
        } else if (orderingStrategy === 'SEQUENCED' && loopSide === PortSide.SOUTH) {
          southernOneSidedSLLoops!.push(slLoop)
        } else {
          assignOneSidedSimpleSideAndAlignment(slLoop, loopSide)
        }
        break
      }
      case SelfLoopType.TWO_SIDES_CORNER:
        assignTwoSidesCornerSideAndAlignment(slLoop)
        break
      case SelfLoopType.TWO_SIDES_OPPOSING:
      case SelfLoopType.THREE_SIDES:
        assignTwoSidesOpposingAndThreeSidesSideAndAlignment(slLoop)
        break
      case SelfLoopType.FOUR_SIDES:
        assignFourSidesSideAndAlignment(slLoop)
        break
      default:
        throw new Error('Unexpected self loop type')
    }
  }

  if (northernOneSidedSLLoops !== null) {
    if (northernOneSidedSLLoops.length > 0) {
      assignOneSidedSequencedSideAndAlignment(northernOneSidedSLLoops, PortSide.NORTH)
    }
    if (southernOneSidedSLLoops!.length > 0) {
      assignOneSidedSequencedSideAndAlignment(southernOneSidedSLLoops!, PortSide.SOUTH)
    }
  }
}

/**
 * 单侧环的直接分配 (LabelPlacer.java:150-170):
 * EAST/WEST 对齐到最上端口 (Alignment.TOP); NORTH/SOUTH 居中.
 */
function assignOneSidedSimpleSideAndAlignment(slLoop: SelfHyperLoop, loopSide: PortSide): void {
  switch (loopSide) {
    case PortSide.EAST:
    case PortSide.WEST: {
      // The alignment will be relative to the topmost port (which must be either the leftmost or the rightmost port)
      let topmostPort = slLoop.getLeftmostPort()
      if (slLoop.getRightmostPort().getLPort().getPosition().y < topmostPort.getLPort().getPosition().y) {
        topmostPort = slLoop.getRightmostPort()
      }
      setSideAndAlignment(slLoop, loopSide, LabelAlignment.TOP, topmostPort)
      break
    }
    case PortSide.NORTH:
    case PortSide.SOUTH:
      setSideAndAlignment(slLoop, loopSide, LabelAlignment.CENTER, null)
      break
    default:
      throw new Error('Impossible')
  }
}

/** SEQUENCED 策略: 北/南单侧环按 leftmost 端口 id 排序后成对内/外对齐, 中间单环居中 (LabelPlacer.java:172-236). */
function assignOneSidedSequencedSideAndAlignment(slLoops: SelfHyperLoop[], portSide: PortSide): void {
  // Ensure sensible port IDs
  let id = 0
  for (const lPort of slLoops[0]!.getSLHolder().getLNode().getPorts()) {
    lPort.id = id++
  }

  if (portSide === PortSide.NORTH) {
    slLoops.sort((a, b) => a.getLeftmostPort().getLPort().id - b.getLeftmostPort().getLPort().id)
  } else {
    slLoops.sort((a, b) => b.getLeftmostPort().getLPort().id - a.getLeftmostPort().getLPort().id)
  }

  let leftSlLoopIdx = 0
  let rightSlLoopIdx = slLoops.length - 1
  while (leftSlLoopIdx < rightSlLoopIdx) {
    const leftSlLoop = slLoops[leftSlLoopIdx]!
    const rightSlLoop = slLoops[rightSlLoopIdx]!

    const leftLoopAlignmentReference = portSide === PortSide.NORTH
      ? leftSlLoop.getRightmostPort()
      : leftSlLoop.getLeftmostPort()
    const rightLoopAlignmentReference = portSide === PortSide.NORTH
      ? rightSlLoop.getLeftmostPort()
      : rightSlLoop.getRightmostPort()

    setSideAndAlignment(leftSlLoop, portSide, LabelAlignment.RIGHT, leftLoopAlignmentReference)
    setSideAndAlignment(rightSlLoop, portSide, LabelAlignment.LEFT, rightLoopAlignmentReference)

    leftSlLoopIdx++
    rightSlLoopIdx--
  }

  // There might be a single loop in the middle
  if (leftSlLoopIdx === rightSlLoopIdx) {
    setSideAndAlignment(slLoops[leftSlLoopIdx]!, portSide, LabelAlignment.CENTER, null)
  }
}

/** Corner 环: 标签放在 leftmost/rightmost 端口所在侧, 向该侧对齐 (LabelPlacer.java:238-249). */
function assignTwoSidesCornerSideAndAlignment(slLoop: SelfHyperLoop): void {
  const leftmostPortSide = slLoop.getLeftmostPort().getLPort().getSide()
  const rightmostPortSide = slLoop.getRightmostPort().getLPort().getSide()

  if (leftmostPortSide === PortSide.NORTH) {
    setSideAndAlignment(slLoop, PortSide.NORTH, LabelAlignment.LEFT, slLoop.getLeftmostPort())
  } else if (rightmostPortSide === PortSide.NORTH) {
    setSideAndAlignment(slLoop, PortSide.NORTH, LabelAlignment.RIGHT, slLoop.getRightmostPort())
  } else if (leftmostPortSide === PortSide.SOUTH) {
    setSideAndAlignment(slLoop, PortSide.SOUTH, LabelAlignment.RIGHT, slLoop.getLeftmostPort())
  } else if (rightmostPortSide === PortSide.SOUTH) {
    setSideAndAlignment(slLoop, PortSide.SOUTH, LabelAlignment.LEFT, slLoop.getRightmostPort())
  } else {
    throw new Error('Impossible')
  }
}

/** Opposing / 三侧环: 按未占用侧选择标签侧与对齐 (LabelPlacer.java:262-309). */
function assignTwoSidesOpposingAndThreeSidesSideAndAlignment(slLoop: SelfHyperLoop): void {
  const occupiedSides = slLoop.getOccupiedPortSides()
  // ggn 尚未支持 EDGE_LABELS_INLINE 属性, 恒为 false (LabelPlacer.java:265-276 的 inline 分支不可达)
  const hasInlineLabels = false

  if (!occupiedSides.has(PortSide.NORTH)) {
    setSideAndAlignment(slLoop, PortSide.SOUTH, LabelAlignment.CENTER, null)
  } else if (!occupiedSides.has(PortSide.SOUTH)) {
    setSideAndAlignment(slLoop, PortSide.NORTH, LabelAlignment.CENTER, null)
  } else if (!occupiedSides.has(PortSide.WEST)) {
    setSideAndAlignment(slLoop, hasInlineLabels ? PortSide.EAST : PortSide.NORTH,
      hasInlineLabels ? LabelAlignment.CENTER : LabelAlignment.LEFT,
      hasInlineLabels ? null : slLoop.getLeftmostPort())
  } else if (!occupiedSides.has(PortSide.EAST)) {
    setSideAndAlignment(slLoop, hasInlineLabels ? PortSide.WEST : PortSide.NORTH,
      hasInlineLabels ? LabelAlignment.CENTER : LabelAlignment.RIGHT,
      hasInlineLabels ? null : slLoop.getRightmostPort())
  } else {
    throw new Error('Impossible')
  }
}

/**
 * 四侧环: 标签居中放在"完全覆盖"的侧 (LabelPlacer.java:311-343).
 * 注意: ELK Java 0.12.0 源码此处 rightmostPortSide 误写为 getLeftmostPort() 两次
 * (LabelPlacer.java:327-328), 为保持同构, 此处同样只以 leftmost 端口侧判断.
 */
function assignFourSidesSideAndAlignment(slLoop: SelfHyperLoop): void {
  const leftmostPortSide = slLoop.getLeftmostPort().getLPort().getSide()
  const rightmostPortSide = slLoop.getLeftmostPort().getLPort().getSide()

  if (leftmostPortSide === PortSide.NORTH || rightmostPortSide === PortSide.NORTH) {
    setSideAndAlignment(slLoop, PortSide.SOUTH, LabelAlignment.CENTER, null)
  } else {
    setSideAndAlignment(slLoop, PortSide.NORTH, LabelAlignment.CENTER, null)
  }
}

function setSideAndAlignment(
  slLoop: SelfHyperLoop, side: PortSide, alignment: LabelAlignment, alignmentReference: SelfLoopPort | null,
): void {
  const slLabels = slLoop.getSLLabels()!
  slLabels.setSide(side)
  slLabels.setAlignment(alignment)
  slLabels.setAlignmentReferenceSLPort(alignmentReference)
}

/** 坐标计算只取决于对齐 (LabelPlacer.java:376-400). */
function computeCoordinates(slLoop: SelfHyperLoop): void {
  const slLabels = slLoop.getSLLabels()!
  const alignRef = slLabels.getAlignmentReferenceSLPort()
  const size = slLabels.getSize()
  const pos = slLabels.getPosition()

  switch (slLabels.getAlignment()) {
    case LabelAlignment.CENTER:
      pos.x = (slLoop.getSLHolder().getLNode().size.x - size.x) / 2
      break
    case LabelAlignment.LEFT:
      pos.x = alignRef!.getLPort().getPosition().x + alignRef!.getLPort().getAnchor().x
      break
    case LabelAlignment.RIGHT:
      pos.x = alignRef!.getLPort().getPosition().x + alignRef!.getLPort().getAnchor().x - size.x
      break
    case LabelAlignment.TOP:
      pos.y = alignRef!.getLPort().getPosition().y + alignRef!.getLPort().getAnchor().y
      break
    default:
      throw new Error('Impossible')
  }
}

export type { SelfLoopPort }
