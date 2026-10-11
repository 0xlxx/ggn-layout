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
import { layoutElkJson } from './elk-json.js'
import type { ElkEdgeSection, ElkLayoutOptions, ElkPoint, LayoutInput, LayoutOutput, LayoutOutputEdge } from './elk-json.js'

/** Coordinate change for one node present in the after-layout. */
export interface LayoutNodeDelta {
  id: string
  before?: ElkPoint
  after: ElkPoint
  distance: number
}

/** Route change for one edge matched within its container. */
export interface LayoutEdgeDelta {
  id?: string
  routeChanged: boolean
}

/** Compact layout change summary. */
export interface LayoutDiff {
  changedNodes: LayoutNodeDelta[]
  changedEdges: LayoutEdgeDelta[]
  unchangedNodes: number
  unchangedEdges: number
  /** 边是否被比较（includeEdges:false 时为 false，区分"未检查"与"无变化"）。 */
  edgesChecked: boolean
  maxNodeDistance: number
}

function collectNodes(node: LayoutOutput, result: Map<string, LayoutOutput>): void {
  result.set(node.id, node)
  for (const child of node.children ?? []) collectNodes(child, result)
}

/**
 * 边按 (容器 id, 边 id, sources[0], targets[0]) 分组收集（保留声明顺序）。
 * 平行边/嵌套作用域不会互相覆盖；无 id 的边按容器内声明顺序匹配。
 */
function collectEdges(node: LayoutOutput, containerId: string, result: Map<string, LayoutOutputEdge[]>): void {
  for (const edge of node.edges ?? []) {
    const key = `${containerId}\u0000${edge.id ?? ''}\u0000${edge.sources[0] ?? ''}\u0000${edge.targets[0] ?? ''}`
    const arr = result.get(key) ?? []
    arr.push(edge)
    result.set(key, arr)
  }
  for (const child of node.children ?? []) collectEdges(child, child.id, result)
}

function pointChanged(before: ElkPoint | undefined, after: ElkPoint | undefined, tolerance: number): boolean {
  if (before === undefined || after === undefined) return before !== after
  return Math.hypot(before.x - after.x, before.y - after.y) > tolerance
}

function sectionChanged(before: ElkEdgeSection | undefined, after: ElkEdgeSection | undefined, tolerance: number): boolean {
  if (before === undefined || after === undefined) return before !== after
  if (pointChanged(before.startPoint, after.startPoint, tolerance)) return true
  if (pointChanged(before.endPoint, after.endPoint, tolerance)) return true
  const beforeBends = before.bendPoints ?? []
  const afterBends = after.bendPoints ?? []
  if (beforeBends.length !== afterBends.length) return true
  for (let index = 0; index < beforeBends.length; index += 1) {
    if (pointChanged(beforeBends[index], afterBends[index], tolerance)) return true
  }
  return false
}

function routeChanged(before: LayoutOutputEdge | undefined, after: LayoutOutputEdge, tolerance: number): boolean {
  if (before === undefined) return true
  return sectionChanged(before.sections?.[0], after.sections?.[0], tolerance)
}

function normalizedTolerance(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0.5
}

/**
 * 比较两份布局输出（只读，不改输入）。节点按 id 匹配；边按
 * (容器, 边 id 或声明顺序, sources[0], targets[0]) 匹配。
 * 坐标差超过 `tolerance`（默认 0.5）记为变更。
 */
export function diffLayout(
  before: LayoutOutput,
  after: LayoutOutput,
  options?: { tolerance?: number; includeEdges?: boolean },
): LayoutDiff {
  const tolerance = normalizedTolerance(options?.tolerance)
  const beforeNodes = new Map<string, LayoutOutput>()
  const afterNodes = new Map<string, LayoutOutput>()
  collectNodes(before, beforeNodes)
  collectNodes(after, afterNodes)

  const changedNodes: LayoutNodeDelta[] = []
  let unchangedNodes = 0
  let maxNodeDistance = 0
  for (const [id, afterNode] of afterNodes) {
    const beforeNode = beforeNodes.get(id)
    const beforePoint = beforeNode === undefined ? undefined : { x: beforeNode.x, y: beforeNode.y }
    const afterPoint = { x: afterNode.x, y: afterNode.y }
    const distance = beforePoint === undefined ? 0 : Math.hypot(afterPoint.x - beforePoint.x, afterPoint.y - beforePoint.y)
    if (beforeNode === undefined || distance > tolerance) {
      changedNodes.push({ id, before: beforePoint, after: afterPoint, distance })
      maxNodeDistance = Math.max(maxNodeDistance, distance)
    } else {
      unchangedNodes += 1
    }
  }

  const edgesChecked = options?.includeEdges !== false
  if (!edgesChecked) {
    return { changedNodes, changedEdges: [], unchangedNodes, unchangedEdges: 0, edgesChecked, maxNodeDistance }
  }

  const beforeEdges = new Map<string, LayoutOutputEdge[]>()
  const afterEdges = new Map<string, LayoutOutputEdge[]>()
  collectEdges(before, before.id, beforeEdges)
  collectEdges(after, after.id, afterEdges)
  const changedEdges: LayoutEdgeDelta[] = []
  let unchangedEdges = 0
  const compared = new Set<string>()
  for (const [key, afterQueue] of afterEdges) {
    const beforeQueue = beforeEdges.get(key) ?? []
    for (let index = 0; index < afterQueue.length; index += 1) {
      const afterEdge = afterQueue[index]!
      const beforeEdge = beforeQueue[index]
      compared.add(key)
      if (routeChanged(beforeEdge, afterEdge, tolerance)) {
        changedEdges.push({ id: afterEdge.id, routeChanged: true })
      } else {
        unchangedEdges += 1
      }
    }
  }

  return { changedNodes, changedEdges, unchangedNodes, unchangedEdges, edgesChecked, maxNodeDistance }
}

/** 重新布局 input，并返回与 previous 输出的差异（不修改输入）。 */
export function layoutJsonDiff(
  input: LayoutInput,
  previous: LayoutOutput,
  options?: ElkLayoutOptions & { tolerance?: number; includeEdges?: boolean },
): LayoutDiff {
  const { tolerance, includeEdges, ...layoutOptions } = options ?? {}
  const current = layoutElkJson(input, { ...layoutOptions, responseFormat: 'full' }) as LayoutOutput
  return diffLayout(previous, current, { tolerance, includeEdges })
}
