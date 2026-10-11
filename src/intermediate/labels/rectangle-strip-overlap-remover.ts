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
 * RectangleStripOverlapRemover (对应 ELK alg.common.overlaps.RectangleStripOverlapRemover
 * + GreedyRectangleStripOverlapRemover).
 *
 * 移除沿一个维度位置固定的矩形间的重叠 (端标签 N/S 或 E/W 侧防重叠).
 * 默认贪心策略: 按重叠图贪心选择最小不重叠坐标.
 */
export enum OverlapRemovalDirection {
  UP = 'UP',
  DOWN = 'DOWN',
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

interface RectangleNode {
  originalRectangle: { x: number; y: number; width: number; height: number }
  rectangle: { x: number; y: number; width: number; height: number }
  overlappingNodes: RectangleNode[]
}

export class RectangleStripOverlapRemover {
  private static readonly DEFAULT_GAP = 5

  private readonly overlapRemovalDirection: OverlapRemovalDirection
  private gapVertical = RectangleStripOverlapRemover.DEFAULT_GAP
  private gapHorizontal = RectangleStripOverlapRemover.DEFAULT_GAP
  private startCoordinate = 0
  private rectangleNodes: RectangleNode[] = []

  private constructor(direction: OverlapRemovalDirection) {
    this.overlapRemovalDirection = direction
  }

  static createForDirection(direction: OverlapRemovalDirection): RectangleStripOverlapRemover {
    return new RectangleStripOverlapRemover(direction)
  }

  withGap(horizontalGap: number, verticalGap: number): this {
    this.gapHorizontal = horizontalGap
    this.gapVertical = verticalGap
    return this
  }

  withStartCoordinate(coordinate: number): this {
    this.startCoordinate = coordinate
    return this
  }

  getVerticalGap(): number {
    return this.gapVertical
  }

  getRectangleNodes(): RectangleNode[] {
    return this.rectangleNodes
  }

  addRectangle(rectangle: { x: number; y: number; width: number; height: number }): this {
    this.rectangleNodes.push({ originalRectangle: rectangle, rectangle: this.importRectangle(rectangle), overlappingNodes: [] })
    return this
  }

  /**
   * 变换到标准坐标空间 (水平移动方向 UP/DOWN 不变; 垂直移动方向 LEFT/RIGHT 交换 x/y).
   * UP/DOWN 必须返回原矩形引用 (Java importRectangle L175-183 `return rectangle`):
   * greedy 阶段写 rectangle.y = yPos 需同步到 originalRectangle (同引用),
   * 否则 exportRectangle DOWN (`original.y += startCoordinate`) 丢失重叠避让偏移
   * (Java GreedyRectangleStripOverlapRemover 写 getRectangle().y + export DOWN 依赖共享引用).
   */
  private importRectangle(rectangle: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    switch (this.overlapRemovalDirection) {
      case OverlapRemovalDirection.UP:
      case OverlapRemovalDirection.DOWN:
        return rectangle
      case OverlapRemovalDirection.LEFT:
      case OverlapRemovalDirection.RIGHT:
        return { x: rectangle.y, y: 0, width: rectangle.height, height: rectangle.width }
      default:
        throw new Error('unsupported direction')
    }
  }

  private exportRectangle(node: RectangleNode): void {
    const rectangle = node.rectangle
    const original = node.originalRectangle
    switch (this.overlapRemovalDirection) {
      case OverlapRemovalDirection.UP:
        original.y = this.startCoordinate - rectangle.height - rectangle.y
        break
      case OverlapRemovalDirection.DOWN:
        original.y += this.startCoordinate
        break
      case OverlapRemovalDirection.LEFT:
        original.x = this.startCoordinate - rectangle.height - rectangle.y
        break
      case OverlapRemovalDirection.RIGHT:
        original.x = this.startCoordinate + rectangle.y
        break
    }
  }

  /** 触发重叠移除 (返回所需条带尺寸). */
  removeOverlaps(): number {
    // 按 x 坐标 (标准空间) 排序
    this.rectangleNodes.sort((a, b) => a.rectangle.x - b.rectangle.x)
    this.computeOverlaps()
    const stripSize = this.greedyRemoveOverlaps()
    for (const node of this.rectangleNodes) this.exportRectangle(node)
    return stripSize
  }

  private computeOverlaps(): void {
    // 扫描线: 按右边界排序的活跃集 (TreeSet 语义用数组保持有序).
    const intersectingNodes: RectangleNode[] = []
    for (const currNode of this.rectangleNodes) {
      const scanlinePos = currNode.rectangle.x
      // 移除已不与该扫描线相交的节点
      while (intersectingNodes.length > 0) {
        const first = intersectingNodes[0]!
        if (first.rectangle.x + first.rectangle.width < scanlinePos) {
          intersectingNodes.shift()
        } else {
          break
        }
      }
      for (const intersectingNode of intersectingNodes) {
        intersectingNode.overlappingNodes.push(currNode)
        currNode.overlappingNodes.push(intersectingNode)
      }
      // 插入并按右边界保持有序 (TreeSet 升序)
      const right = currNode.rectangle.x + currNode.rectangle.width
      let insertAt = intersectingNodes.findIndex(n => n.rectangle.x + n.rectangle.width > right)
      if (insertAt === -1) insertAt = intersectingNodes.length
      intersectingNodes.splice(insertAt, 0, currNode)
    }
  }

  /** GreedyRectangleStripOverlapRemover.removeOverlaps. */
  private greedyRemoveOverlaps(): number {
    const verticalGap = this.gapVertical
    const alreadyPlaced = new Set<RectangleNode>()
    let stripSize = 0
    for (const currNode of this.rectangleNodes) {
      let yPos = 0
      // 按 y 坐标排序重叠节点
      currNode.overlappingNodes.sort((a, b) => a.rectangle.y - b.rectangle.y)
      for (const overlapNode of currNode.overlappingNodes) {
        if (alreadyPlaced.has(overlapNode)) {
          const currRect = currNode.rectangle
          const overlapRect = overlapNode.rectangle
          if (yPos < overlapRect.y + overlapRect.height + verticalGap
              && yPos + currRect.height + verticalGap > overlapRect.y) {
            yPos = overlapRect.y + overlapRect.height + verticalGap
          }
        }
      }
      currNode.rectangle.y = yPos
      alreadyPlaced.add(currNode)
      stripSize = Math.max(stripSize, currNode.rectangle.y + currNode.rectangle.height)
    }
    return stripSize
  }
}
