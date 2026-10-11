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
 * rectpacking 主入口 (ELK alg.rectpacking RectPackingLayoutProvider + intermediate 处理器).
 *
 * 管线 (AlgorithmAssembler):
 *   [可选 NODE_SIZE_REORDERER / INTERACTIVE_NODE_REORDERER] → MIN_SIZE_PRE_PROCESSOR
 *   → P1 宽度近似 (GREEDY/TARGET_WIDTH) → MIN_SIZE_POST_PROCESSOR
 *   → P2 装箱 (COMPACTION/SIMPLE/NONE) → P3 空白消除
 *   → 内容对齐 translate → applyPadding → resizeNode.
 *
 * TRYBOX: 子节点 ≥3 且存在可堆叠三连 (高差 ≥ 另外两高和 + spacing) → 降级 box 布局
 * (Java 先设 PRIORITY 递减再调 BoxLayoutProvider).
 *
 * NodeMicroLayout 为 no-op (输入 JSON 已带尺寸/标签; 触发模型无标签/端口, 与 force 移植同约定).
 */
import type { ElkNode } from '../api/elk-json.js'
import { boxLayout } from '../api/core-providers.js'
import {
  NODE_SIZE_FIXED_GRAPH_SIZE, SPACING_NODE_NODE, TRYBOX, ORDER_BY_SIZE, INTERACTIVE,
  NODE_SIZE_CONSTRAINTS, NODE_SIZE_MINIMUM, CONTENT_ALIGNMENT, PRIORITY, DESIRED_POSITION, CURRENT_POSITION,
  optBool, optNum, optPadding, jsonOpt,
} from './options.js'
import { InternalProperties } from './util.js'
import { runWidthApproximation } from './p1-width-approximation.js'
import { runPacking } from './p2-packing.js'
import { runWhitespaceElimination } from './p3-whitespace-elimination.js'

/** 解析 KVector 字符串 "(x,y)" 或对象 {x,y} (Java KVector option). */
function optVec(node: ElkNode, key: string): { x: number; y: number } | null {
  const v = jsonOpt<unknown>(node, key)
  if (v === undefined || v === null) return null
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.x === 'number' && typeof o.y === 'number') return { x: o.x, y: o.y }
    return null
  }
  const s = String(v).replace(/[()[\]]/g, '')
  const [x, y] = s.split(',').map((t) => Number(t.trim()))
  if (Number.isFinite(x) && Number.isFinite(y)) return { x, y }
  return null
}

/** 有效最小尺寸约束 (Java ElkUtil.effectiveMinSizeConstraintFor): 仅 MINIMUM_SIZE 时返回 minimum. */
function effectiveMinSizeConstraintFor(node: ElkNode): { x: number; y: number } {
  const constraints = String(jsonOpt<unknown>(node, NODE_SIZE_CONSTRAINTS) ?? '')
  if (constraints.includes('MINIMUM_SIZE')) {
    return optVec(node, NODE_SIZE_MINIMUM) ?? { x: 0, y: 0 }
  }
  return { x: 0, y: 0 }
}

// ── intermediate 处理器 ──

/** MIN_SIZE_PRE_PROCESSOR (Java): 设置 ctx.minWidth/minHeight. */
function minSizePreProcessor(graph: ElkNode, ctx: InternalProperties): void {
  const minSize = effectiveMinSizeConstraintFor(graph)
  // NodeLabelAndSizeCalculator.process(graph.parent 适配) 的标签/端口最小尺寸:
  // 触发模型无标签/端口 → (0,0), 与 force 移植的 nodeMicroLayout no-op 同一约定.
  ctx.minWidth = minSize.x
  ctx.minHeight = minSize.y
  void graph
}

/** MIN_SIZE_POST_PROCESSOR (Java): targetWidth ≥ minWidth. */
function minSizePostProcessor(ctx: InternalProperties): void {
  ctx.targetWidth = Math.max(ctx.targetWidth, ctx.minWidth)
}

/** NODE_SIZE_REORDERER (Java): 按高度降序稳定排序 (ECollections.sort 稳定). */
function nodeSizeReorderer(graph: ElkNode): void {
  const children = graph.children ?? []
  children.sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
}

/** INTERACTIVE_NODE_REORDERER (Java): 按 desiredPosition 重排 + 写 currentPosition. */
function interactiveNodeReorderer(graph: ElkNode): void {
  const rectangles = graph.children ?? []
  const fixedNodes: ElkNode[] = []
  for (const elkNode of rectangles) {
    if (jsonOpt<unknown>(elkNode, DESIRED_POSITION) !== undefined) fixedNodes.push(elkNode)
  }
  for (const elkNode of fixedNodes) {
    const idx = rectangles.indexOf(elkNode)
    if (idx !== -1) rectangles.splice(idx, 1)
  }
  fixedNodes.sort((a, b) => {
    const positionA = optNum(a, DESIRED_POSITION)
    const positionB = optNum(b, DESIRED_POSITION)
    // Java: 相等时返回 -1 (非传递比较器, 原样保留).
    if (positionA === positionB) return -1
    return positionA - positionB
  })
  for (const elkNode of fixedNodes) {
    let position = optNum(elkNode, DESIRED_POSITION)
    position = Math.min(position, rectangles.length)
    rectangles.splice(position, 0, elkNode)
  }
  let index = 0
  for (const elkNode of rectangles) {
    elkNode.layoutOptions ??= {}
    elkNode.layoutOptions[CURRENT_POSITION] = String(index)
    index++
  }
}

// ── 尾部处理 (Java RectPackingLayoutProvider 主流程) ──

/** ElkUtil.translate(parent, newSize, oldSize): 按 contentAlignment 平移子节点. */
function contentAlignTranslate(elkGraph: ElkNode, ctx: InternalProperties, realWidth: number, realHeight: number,
  rectangles: ElkNode[]): void {
  const contentAlignment = String(jsonOpt<unknown>(elkGraph, CONTENT_ALIGNMENT) ?? 'topLeft')
  let xTranslate = 0
  let yTranslate = 0
  if (ctx.drawingWidth > realWidth) {
    if (contentAlignment.includes('H_CENTER')) xTranslate = (ctx.drawingWidth - realWidth) / 2
    else if (contentAlignment.includes('H_RIGHT')) xTranslate = ctx.drawingWidth - realWidth
  }
  if (ctx.drawingHeight > realHeight) {
    if (contentAlignment.includes('V_CENTER')) yTranslate = (ctx.drawingHeight - realHeight) / 2
    else if (contentAlignment.includes('V_BOTTOM')) yTranslate = ctx.drawingHeight - realHeight
  }
  if (xTranslate !== 0 || yTranslate !== 0) {
    for (const rect of rectangles) {
      rect.x = (rect.x ?? 0) + xTranslate
      rect.y = (rect.y ?? 0) + yTranslate
    }
  }
}

/** ElkUtil.resizeNode(node, w, h, false, true): 设置父尺寸 (无端口/标签 → 仅尺寸 + 最小约束兜底). */
function resizeNode(elkGraph: ElkNode, newWidth: number, newHeight: number): void {
  const minSize = effectiveMinSizeConstraintFor(elkGraph)
  elkGraph.width = Math.max(minSize.x, newWidth)
  elkGraph.height = Math.max(minSize.y, newHeight)
}

// ── 主入口 ──

/**
 * rectpacking 布局 (org.eclipse.elk.rectpacking).
 * 直接操作 ElkNode JSON 子节点位置/尺寸, 并设置父节点尺寸 (对齐 box/fixed 风格).
 */
export function rectPackingLayout(elkGraph: ElkNode): ElkNode {
  const padding = optPadding(elkGraph)
  const fixedGraphSize = optBool(elkGraph, NODE_SIZE_FIXED_GRAPH_SIZE, false)
  const nodeNodeSpacing = optNum(elkGraph, SPACING_NODE_NODE)
  const tryBox = optBool(elkGraph, TRYBOX, false)
  const rectangles = elkGraph.children ?? []

  // NodeMicroLayout (no-op, 见文件头约定).

  // TRYBOX: 检查区域是否可堆叠 → 降级 box.
  let stackable = false
  if (tryBox && rectangles.length >= 3) {
    let region2 = rectangles[0]!
    let region3 = rectangles[1]!
    let counter = 0
    while (counter + 2 < rectangles.length) {
      const region1 = region2
      region2 = region3
      region3 = rectangles[counter + 2]!
      if ((region1.height ?? 0) >= (region2.height ?? 0) + (region3.height ?? 0) + nodeNodeSpacing
        || (region3.height ?? 0) >= (region1.height ?? 0) + (region2.height ?? 0) + nodeNodeSpacing) {
        stackable = true
        break
      } else {
        counter++
      }
    }
  } else {
    stackable = true
  }
  if (!stackable) {
    // Java: 设递减 PRIORITY 后调用 BoxLayoutProvider (ggn boxLayout 语义对齐).
    let priority = rectangles.length
    for (const elkNode of rectangles) {
      elkNode.layoutOptions ??= {}
      elkNode.layoutOptions[PRIORITY] = String(priority)
      priority--
    }
    boxLayout(elkGraph)
    return elkGraph
  }

  const ctx = new InternalProperties()

  // intermediate: before P1.
  if (optBool(elkGraph, ORDER_BY_SIZE, false)) nodeSizeReorderer(elkGraph)
  if (optBool(elkGraph, INTERACTIVE, false)) interactiveNodeReorderer(elkGraph)
  minSizePreProcessor(elkGraph, ctx)

  // P1: 宽度近似.
  runWidthApproximation(elkGraph, ctx, rectangles)

  // intermediate: before P2.
  minSizePostProcessor(ctx)

  // P2: 装箱.
  runPacking(elkGraph, ctx, padding)

  // P3: 空白消除.
  runWhitespaceElimination(elkGraph, ctx)

  // 内容对齐 (Java translate 使用 drawing vs real 尺寸).
  let realWidth = 0
  let realHeight = 0
  for (const rect of rectangles) {
    realWidth = Math.max(realWidth, (rect.x ?? 0) + (rect.width ?? 0))
    realHeight = Math.max(realHeight, (rect.y ?? 0) + (rect.height ?? 0))
  }
  contentAlignTranslate(elkGraph, ctx, realWidth, realHeight, rectangles)

  // applyPadding: 所有矩形右移/下移 padding.
  for (const rect of rectangles) {
    rect.x = (rect.x ?? 0) + padding.left
    rect.y = (rect.y ?? 0) + padding.top
  }

  if (!fixedGraphSize) {
    resizeNode(elkGraph, ctx.drawingWidth + padding.left + padding.right,
      ctx.drawingHeight + padding.top + padding.bottom)
  }

  return elkGraph
}
