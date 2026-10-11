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
 * outline 节点 (ELK alg.vertiflex p2relative.OutlineNode).
 *
 * outline 的基本构建块: 定义 outline 经过的点, 每个 outline 节点有位置与
 * 指向下一个 outline 节点的引用. X 坐标相对祖先 (relativeX), Y 坐标绝对
 * (来自垂直约束, absoluteY).
 */
export class OutlineNode {
  /** X 坐标相对祖先维护. */
  private relativeX: number
  /** Y 坐标绝对 (来自给定垂直约束). */
  private absoluteY: number
  private next: OutlineNode | null

  constructor(relativeX: number, absoluteY: number, next: OutlineNode | null) {
    this.relativeX = relativeX
    this.absoluteY = absoluteY
    this.next = next
  }

  getAbsoluteY(): number {
    return this.absoluteY
  }

  setAbsoluteY(absoluteY: number): void {
    this.absoluteY = absoluteY
  }

  getRelativeX(): number {
    return this.relativeX
  }

  setRelativeX(relativeX: number): void {
    this.relativeX = relativeX
  }

  getNext(): OutlineNode | null {
    return this.next
  }

  setNext(next: OutlineNode | null): void {
    this.next = next
  }

  /** @return 该 OutlineNode 是否没有 "next". */
  isLast(): boolean {
    return this.next === null
  }

  /** 完整 outline 的字符串表示 (Java printFullOutline 的产物). */
  printFullOutline(): string {
    const sb: string[] = [this.toString()]
    if (!this.isLast()) sb.push(this.getNext()!.printFullOutline())
    return sb.join('\n')
  }

  toString(): string {
    return `X:${this.relativeX},  Y:${this.absoluteY}`
  }
}
