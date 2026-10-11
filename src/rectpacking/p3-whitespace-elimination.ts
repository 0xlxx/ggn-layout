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
 * Phase 3: 空白消除 (ELK alg.rectpacking.p3whitespaceelimination).
 *
 * EQUAL_BETWEEN_STRUCTURES: 把额外宽/高均分给行/栈/块/子行并扩张矩形.
 * TO_ASPECT_RATIO: 先按期望宽高比扩图, 再执行均分扩张.
 * NONE: 不做任何处理 (默认).
 */
import type { ElkNode } from '../api/elk-json.js'
import {
  ASPECT_RATIO, SPACING_NODE_NODE, WHITE_SPACE_ELIMINATION_STRATEGY, WhiteSpaceEliminationStrategy,
  optNum, optStr,
} from './options.js'
import { type InternalProperties } from './util.js'
import type { RectRow } from './rect-row.js'

/** 把 rows 扩展到 drawingWidth 并分配 additionalHeight (Java RectangleExpansion.expand). */
export function rectangleExpansion(rows: RectRow[], drawingWidth: number, additionalHeight: number, nodeNodeSpacing: number): void {
  const heightPerRow = additionalHeight / rows.length
  let index = 0
  for (const row of rows) {
    row.setY(row.getY() + heightPerRow * index)
    row.expand(drawingWidth, heightPerRow)
    index++
  }
  void nodeNodeSpacing
}

/** EQUAL_BETWEEN_STRUCTURES (Java EqualWhitespaceEliminator.process). */
function equalWhitespaceElimination(graph: ElkNode, ctx: InternalProperties): void {
  if (ctx.rows.length > 0) {
    rectangleExpansion(ctx.rows, ctx.drawingWidth, ctx.additionalHeight, optNum(graph, SPACING_NODE_NODE))
  } else {
    throw new Error('[rectpacking] whitespace elimination cannot be done with packing strategy NONE')
  }
}

/** TO_ASPECT_RATIO (Java ToAspectratioNodeExpander.process). */
function toAspectRatioNodeExpander(graph: ElkNode, ctx: InternalProperties): void {
  let width = ctx.drawingWidth
  let height = ctx.drawingHeight
  const desiredAspectRatio = optNum(graph, ASPECT_RATIO)
  let additionalHeight = ctx.additionalHeight
  const aspectRatio = width / height
  if (aspectRatio < desiredAspectRatio) {
    width = height * desiredAspectRatio
    ctx.drawingWidth = width
  } else {
    additionalHeight += (width / desiredAspectRatio) - height
    ctx.additionalHeight = additionalHeight
    ctx.drawingHeight = height + additionalHeight
  }
  equalWhitespaceElimination(graph, ctx)
}

/** WHITE_SPACE_ELIMINATION_STRATEGY 分派 (Java WhiteSpaceEliminationStrategy.create). */
export function runWhitespaceElimination(graph: ElkNode, ctx: InternalProperties): void {
  const strategy = optStr<WhiteSpaceEliminationStrategy>(graph, WHITE_SPACE_ELIMINATION_STRATEGY, WhiteSpaceEliminationStrategy.NONE)
  switch (strategy) {
    case WhiteSpaceEliminationStrategy.EQUAL_BETWEEN_STRUCTURES:
      equalWhitespaceElimination(graph, ctx)
      break
    case WhiteSpaceEliminationStrategy.TO_ASPECT_RATIO:
      toAspectRatioNodeExpander(graph, ctx)
      break
    case WhiteSpaceEliminationStrategy.NONE:
      break
    default:
      break
  }
}
