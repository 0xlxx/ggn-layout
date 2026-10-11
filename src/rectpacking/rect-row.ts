/**
 * 行 (util/RectRow.java): 一个 bounding box 内的矩形行, 记录 blocks 与 stacks.
 * stacks 在 compaction 阶段用于块堆叠与 expansion 分配.
 */
import type { Block } from './block.js'
import { BlockStack } from './block-stack.js'

export class RectRow {
  /** 行高 = 最高 stack. */
  private height = 0
  /** 行内 stacks 宽度和. */
  private width = 0
  private y: number
  private nodeNodeSpacing: number
  private children: Block[] = []
  private stacks: BlockStack[] = []
  /** 缺多少宽可以把下一行第一块加入本行. */
  private potentialAdditionalWidthToGetLastBlock = 0

  constructor(y: number, nodeNodeSpacing: number) {
    this.y = y
    this.nodeNodeSpacing = nodeNodeSpacing
  }

  /** Block 尺寸变化时重算行宽高 (Java notifyAboutNodeChange). */
  notifyAboutNodeChange(): void {
    let totalStackWidth = 0
    let newMaxHeight = Number.NEGATIVE_INFINITY
    let index = 0
    for (const child of this.children) {
      totalStackWidth += child.getWidth() + (index > 0 ? this.nodeNodeSpacing : 0)
      newMaxHeight = Math.max(newMaxHeight, child.getHeight())
      index++
    }
    this.width = totalStackWidth
    this.height = newMaxHeight
  }

  /** 把额外宽度/高度均分给 stacks (Java expand). */
  expand(width: number, additionalHeight: number): void {
    const additionalWidth = width - this.width
    const additionalWidthPerStack = additionalWidth / this.stacks.length
    let index = 0
    for (const stack of this.stacks) {
      const additionalHeightForStack = this.getHeight() - stack.getHeight() + additionalHeight
      stack.setLocation(stack.getX() + index * additionalWidthPerStack, stack.getY())
      stack.expand(additionalWidthPerStack, additionalHeightForStack)
      index++
    }
  }

  /** 把相同 x 的 blocks 放入同一 stack (Java calculateBlockStacks). */
  calculateBlockStacks(): void {
    let currentX = -1
    for (const block of this.children) {
      if (block.getX() !== currentX) {
        this.stacks.push(new BlockStack(block.getX(), this.y, this.nodeNodeSpacing))
        this.stacks[this.stacks.length - 1]!.addBlock(block)
        currentX = block.getX()
      } else {
        this.stacks[this.stacks.length - 1]!.addBlock(block)
      }
    }
  }

  getFirstBlock(): Block { return this.children[0]! }
  getLastBlock(): Block { return this.children[this.children.length - 1]! }
  getNumberOfAssignedBlocks(): number { return this.children.length }

  addBlock(block: Block): void {
    this.height = Math.max(this.height, block.getHeight())
    this.width += block.getWidth() + (this.children.length === 0 ? 0 : this.nodeNodeSpacing)
    this.children.push(block)
  }

  removeBlock(block: Block): void {
    const idx = this.children.indexOf(block)
    if (idx !== -1) this.children.splice(idx, 1)
    this.width -= block.getWidth() + (this.children.length === 0 ? 0 : this.nodeNodeSpacing)

    // Java: newMaxHeight = Double.MIN_VALUE (最小正数, 非负无穷).
    let newMaxHeight = Number.MIN_VALUE
    for (const child of this.children) {
      newMaxHeight = Math.max(newMaxHeight, child.getHeight())
    }
    this.height = newMaxHeight
  }

  getHeight(): number { return this.height }
  setHeight(height: number): void { this.height = height }
  getWidth(): number { return this.width }
  setWidth(width: number): void { this.width = width }
  getY(): number { return this.y }
  setY(y: number): void {
    const yChange = y - this.y
    for (const stack of this.stacks) {
      stack.setLocation(stack.getX(), stack.getY() + yChange)
    }
    this.y = y
  }
  getChildren(): Block[] { return this.children }
  getStacks(): BlockStack[] { return this.stacks }
  getPotentialAdditionalWidthToGetLastBlock(): number { return this.potentialAdditionalWidthToGetLastBlock }
  setPotentialAdditionalWidthToGetLastBlock(v: number): void { this.potentialAdditionalWidthToGetLastBlock = v }
  resetStacks(): void { this.stacks = [] }
}
