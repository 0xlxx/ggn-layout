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
 * CNode (对应 ELK layered compaction.oned.CNode) — 约束图节点抽象基类.
 */
import { kvector, type KVector } from '../../graph/enums.js'
import type { ElkRectangle } from '../recthull/rectilinear-convex-hull.js'
import type { CGroup } from './cgroup.js'
import { Quadruplet } from './quadruplet.js'

export abstract class CNode {
  /** containing CGroup. */
  cGroup: CGroup | null = null
  /** 北/南段的父节点. */
  parentNode: CNode | null = null
  /** 约束 (指向比本节点更靠目标方向的节点). */
  constraints: CNode[] = []
  /** 占用区域 (含端口/标签边距). */
  hitbox: ElkRectangle = { x: 0, y: 0, width: 0, height: 0 }
  /** 压缩前 hitbox 快照 (ELK CNode.hitboxPreCompaction; compact() 时记录, applyLayout 用 deltaX). */
  hitboxPreCompaction: ElkRectangle | null = null
  /** 相对 group 根位置的偏移. */
  cGroupOffset: KVector = kvector(0, 0)
  /** 最左可能位置 (压缩过程中递增). */
  startPos = Number.NEGATIVE_INFINITY
  /** 左右平衡压缩时是否重定位. */
  reposition = true
  /** 4 元组锁: 是否在特定方向锁定. */
  lock = new Quadruplet()
  /** 是否对节点某侧不施加间距. */
  spacingIgnore = new Quadruplet()
  /** 公开使用的 id. */
  id = 0

  abstract getHorizontalSpacing(): number
  abstract getVerticalSpacing(): number

  getPosition(): number {
    return this.hitbox.x
  }

  /** 压缩后把起始位置写回 hitbox. */
  applyPosition(): void {
    this.hitbox.x = this.startPos
  }

  abstract applyElementPosition(): void
  abstract getElementPosition(): number
}
