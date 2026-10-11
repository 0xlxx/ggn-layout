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
 * ComponentsToCGraphTransformer (对应 ELK compaction.components.ComponentsToCGraphTransformer).
 * 把 IConnectedComponents 转换成 OneDimensionalCompactor 的 CGraph:
 * 分量凸包矩形 → CGroup 内 CNode, 外部扩展 → 按需加入的 CNode + 沿图边框的 placeholder.
 */
import { Direction, PortSide } from '../graph/enums.js'
import type { LEdge } from '../graph/ledge.js'
import { CGraph } from '../compaction/oned/cgraph.js'
import { CGroup } from '../compaction/oned/cgroup.js'
import { CNode } from '../compaction/oned/cnode.js'
import type { ISpacingsHandler } from '../compaction/oned/spacings-handler.js'
import type { ElkRectangle } from '../compaction/recthull/rectilinear-convex-hull.js'

// ── 接口 (对应 ELK compaction.components.IComponent / IConnectedComponents / IExternalExtension) ──

export interface IComponent {
  /** 分量节点占用的凸包矩形列表. */
  getHull(): ElkRectangle[]
  /** 该分量的外部扩展列表. */
  getExternalExtensions(): IExternalExtension[]
  /** 分量外部端口所在侧集合 (无外部端口则为空集). */
  getExternalExtensionSides(): Set<PortSide>
}

export interface IConnectedComponents {
  getComponents(): IComponent[]
  isContainsExternalExtensions(): boolean
}

export interface IExternalExtension {
  /** 例如该扩展代表的底层边集合. */
  getRepresentative(): Set<LEdge>
  /** 表示该外部扩展的矩形. */
  getRepresentor(): ElkRectangle
  /** 沿原始图边框的可选 placeholder 矩形. */
  getPlaceholder(): ElkRectangle | null
  /** 该扩展指向的方向. */
  getDirection(): Direction
}

/** 方向是否水平 (ELK Direction.isHorizontal: LEFT/RIGHT). */
export function isHorizontalDirection(d: Direction): boolean {
  return d === Direction.LEFT || d === Direction.RIGHT
}

/** 方向取反 (ELK Direction.opposite). */
export function oppositeDirection(d: Direction): Direction {
  switch (d) {
    case Direction.LEFT: return Direction.RIGHT
    case Direction.RIGHT: return Direction.LEFT
    case Direction.UP: return Direction.DOWN
    case Direction.DOWN: return Direction.UP
    default: return Direction.UNDEFINED
  }
}

/** 分量压缩专用间距处理器: 能应对 placeholder, 压缩时相邻矩形之间无需保留间距. */
export const COMPONENTS_SPACING_HANDLER: ISpacingsHandler<CNode> = {
  getHorizontalSpacing(cNode1: CNode, cNode2: CNode): number {
    return Math.min(cNode1.getHorizontalSpacing(), cNode2.getHorizontalSpacing())
  },
  getVerticalSpacing(cNode1: CNode, cNode2: CNode): number {
    return Math.min(cNode1.getVerticalSpacing(), cNode2.getVerticalSpacing())
  },
}

/** 扇区集合相等比较 (Java Set.equals). */
function sidesEqual(a: Set<PortSide>, b: Set<PortSide>): boolean {
  if (a.size !== b.size) return false
  for (const s of a) if (!b.has(s)) return false
  return true
}

// 端口侧组合常量 (Java PortSide.SIDES_*).
const N = PortSide.NORTH, E = PortSide.EAST, S = PortSide.SOUTH, W = PortSide.WEST
const SIDES_NONE = new Set<PortSide>()
const SIDES_NORTH = new Set([N])
const SIDES_EAST = new Set([E])
const SIDES_SOUTH = new Set([S])
const SIDES_WEST = new Set([W])
const SIDES_NORTH_EAST = new Set([N, E])
const SIDES_EAST_SOUTH = new Set([E, S])
const SIDES_SOUTH_WEST = new Set([S, W])
const SIDES_NORTH_WEST = new Set([N, W])
const SIDES_NORTH_SOUTH = new Set([N, S])
const SIDES_EAST_WEST = new Set([E, W])
const SIDES_NORTH_EAST_WEST = new Set([N, E, W])
const SIDES_NORTH_SOUTH_WEST = new Set([N, S, W])
const SIDES_EAST_SOUTH_WEST = new Set([E, S, W])
const SIDES_NORTH_EAST_SOUTH = new Set([N, E, S])
const SIDES_NORTH_EAST_SOUTH_WEST = new Set([N, E, S, W])

/**
 * 转换器: 把连通分量集合转为可传给 OneDimensionalCompactor 的 CGraph.
 */
export class ComponentsToCGraphTransformer {
  private cGraph: CGraph
  private spacing: number

  // 内部映射
  private oldPosition = new Map<IComponent, { x: number, y: number }>()
  private offsets = new Map<IComponent, CRectNode>()

  // 压缩后全局偏移与新图尺寸
  private globalOffset: { x: number, y: number } = { x: 0, y: 0 }
  private graphSize: { x: number, y: number } = { x: 0, y: 0 }

  // 外部扩展 → 其代表 CNode (所属组, 节点)
  private externalExtensions = new Map<IExternalExtension, { first: CGroup, second: CNode }>()
  private externalPlaceholder = new Map<Direction, { first: CGroup, second: CNode }[]>()

  constructor(spacing: number) {
    this.spacing = spacing
    this.cGraph = new CGraph([])
  }

  /** 相对压缩前位置的偏移 (Java getOffset). */
  getOffset(c: IComponent): { x: number, y: number } {
    const cOffset = this.oldPosition.get(c)!
    const rectPos = this.offsets.get(c)!.rect
    return { x: cOffset.x - rectPos.x, y: cOffset.y - rectPos.y }
  }

  getGlobalOffset(): { x: number, y: number } {
    return this.globalOffset
  }

  getGraphSize(): { x: number, y: number } {
    return this.graphSize
  }

  getExternalExtensions(): Map<IExternalExtension, { first: CGroup, second: CNode }> {
    return this.externalExtensions
  }

  getExternalPlaceholder(): Map<Direction, { first: CGroup, second: CNode }[]> {
    return this.externalPlaceholder
  }

  // -----------------------------------------------------------
  //                    Graph Transformation
  // -----------------------------------------------------------

  transform(ccs: IConnectedComponents): CGraph {
    this.cGraph = new CGraph([Direction.LEFT, Direction.RIGHT, Direction.UP, Direction.DOWN])

    for (const comp of ccs.getComponents()) {
      const group = new CGroup()
      this.cGraph.cGroups.push(group)

      // 转换分量凸包 (不含外部边)
      for (const rect of comp.getHull()) {
        const rectNode = new CRectNode(rect, this.spacing)
        this.setLock(rectNode, comp.getExternalExtensionSides())

        if (!this.oldPosition.has(comp)) {
          this.oldPosition.set(comp, { x: rect.x, y: rect.y })
          this.offsets.set(comp, rectNode)
        }

        this.cGraph.cNodes.push(rectNode)
        group.addCNode(rectNode)
      }

      // 外部扩展矩形: 按需加入 CGraph
      for (const ee of comp.getExternalExtensions()) {
        const rectNode = new CRectNode(ee.getRepresentor(), this.spacing)
        this.externalExtensions.set(ee, { first: group, second: rectNode })
        this.setLock(rectNode, comp.getExternalExtensionSides())

        // placeholder
        const placeholder = ee.getPlaceholder()
        if (placeholder !== null) {
          const rectPlaceholder = new CRectNode(placeholder, this.spacing, 1)
          this.setLock(rectPlaceholder, comp.getExternalExtensionSides())
          const dummyGroup = new CGroup()
          dummyGroup.addCNode(rectPlaceholder)
          const list = this.externalPlaceholder.get(ee.getDirection()) ?? []
          list.push({ first: group, second: rectPlaceholder })
          this.externalPlaceholder.set(ee.getDirection(), list)
        }
      }
    }

    return this.cGraph
  }

  /**
   * 锁保证: 连接 WEST 与 SOUTH 外部端口的组件停留在左下角,
   * 否则边可能被拉得过长.
   */
  private setLock(cNode: CNode, portSides: Set<PortSide>): void {
    if (portSides.size === 0) {
      cNode.lock.set(true, true, true, true)
    }

    // 单侧
    if (sidesEqual(portSides, SIDES_NORTH)) cNode.lock.set(true, true, true, false)
    if (sidesEqual(portSides, SIDES_EAST)) cNode.lock.set(false, true, true, true)
    if (sidesEqual(portSides, SIDES_SOUTH)) cNode.lock.set(true, true, false, true)
    if (sidesEqual(portSides, SIDES_WEST)) cNode.lock.set(true, false, true, true)

    // 角
    if (sidesEqual(portSides, SIDES_NORTH_EAST)) cNode.lock.set(false, true, true, false)
    if (sidesEqual(portSides, SIDES_EAST_SOUTH)) cNode.lock.set(false, true, false, true)
    if (sidesEqual(portSides, SIDES_SOUTH_WEST)) cNode.lock.set(true, false, false, true)
    if (sidesEqual(portSides, SIDES_NORTH_WEST)) cNode.lock.set(true, false, true, false)

    // 对侧
    if (sidesEqual(portSides, SIDES_NORTH_SOUTH)) cNode.lock.set(true, true, true, true)
    if (sidesEqual(portSides, SIDES_EAST_WEST)) cNode.lock.set(true, true, true, true)

    // 三侧
    if (sidesEqual(portSides, SIDES_EAST_SOUTH_WEST)) cNode.lock.set(true, true, true, true)
    if (sidesEqual(portSides, SIDES_NORTH_SOUTH_WEST)) cNode.lock.set(true, true, true, true)
    if (sidesEqual(portSides, SIDES_NORTH_EAST_WEST)) cNode.lock.set(true, true, true, true)

    // 全部
    if (sidesEqual(portSides, SIDES_NORTH_EAST_SOUTH_WEST)) cNode.lock.set(true, true, true, true)
  }

  // -----------------------------------------------------------
  //                    Layout Application
  // -----------------------------------------------------------

  applyLayout(): void {
    for (const n of this.cGraph.cNodes) {
      n.applyElementPosition()
    }

    // 计算新图尺寸与偏移
    let topLeft = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }
    let bottomRight = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }
    for (const cNode of this.cGraph.cNodes) {
      topLeft.x = Math.min(topLeft.x, cNode.hitbox.x)
      topLeft.y = Math.min(topLeft.y, cNode.hitbox.y)
      bottomRight.x = Math.max(bottomRight.x, cNode.hitbox.x + cNode.hitbox.width)
      bottomRight.y = Math.max(bottomRight.y, cNode.hitbox.y + cNode.hitbox.height)
    }

    // placeholder 在压缩期间可移动, 不固定于边框 — 可用其确定最大位置
    for (const placeholders of this.externalPlaceholder.values()) {
      for (const placeholder of placeholders) {
        const cNode = placeholder.second
        topLeft.x = Math.min(topLeft.x, cNode.hitbox.x)
        topLeft.y = Math.min(topLeft.y, cNode.hitbox.y)
        bottomRight.x = Math.max(bottomRight.x, cNode.hitbox.x + cNode.hitbox.width)
        bottomRight.y = Math.max(bottomRight.y, cNode.hitbox.y + cNode.hitbox.height)
      }
    }

    this.globalOffset = { x: -topLeft.x, y: -topLeft.y }
    this.graphSize = { x: bottomRight.x - topLeft.x, y: bottomRight.y - topLeft.y }

    // 清空列表
    this.cGraph.cGroups.length = 0
    this.cGraph.cNodes.length = 0
  }
}

/** CNode 实现: 凸包/扩展矩形节点, 压缩结果写回 rect. */
class CRectNode extends CNode {
  rect: ElkRectangle
  private readonly spacing: number
  private individualSpacing: number | null

  constructor(rect: ElkRectangle, spacing: number, individualSpacing: number | null = null) {
    super()
    this.rect = rect
    this.spacing = spacing
    this.hitbox = { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    this.individualSpacing = individualSpacing
  }

  getHorizontalSpacing(): number {
    return this.individualSpacing ?? this.spacing
  }

  getVerticalSpacing(): number {
    return this.individualSpacing ?? this.spacing
  }

  applyElementPosition(): void {
    this.rect.x = this.hitbox.x
    this.rect.y = this.hitbox.y
  }

  getElementPosition(): number {
    return this.rect.x
  }

  override toString(): string {
    // 调试输出静默
    return ''
  }
}
