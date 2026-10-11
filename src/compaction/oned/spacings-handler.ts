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
/** ISpacingsHandler (对应 ELK layered compaction.oned.ISpacingsHandler). */
import type { CNode } from './cnode.js'

export interface ISpacingsHandler<T extends CNode> {
  getHorizontalSpacing(cNode1: T, cNode2: T): number
  getVerticalSpacing(cNode1: T, cNode2: T): number
}

/** 默认: 取两节点各自 spacing 的较大值. */
export const DEFAULT_SPACING_HANDLER: ISpacingsHandler<CNode> = {
  getHorizontalSpacing(cNode1: CNode, cNode2: CNode): number {
    return Math.max(cNode1.getHorizontalSpacing(), cNode2.getHorizontalSpacing())
  },
  getVerticalSpacing(cNode1: CNode, cNode2: CNode): number {
    return Math.max(cNode1.getVerticalSpacing(), cNode2.getVerticalSpacing())
  },
}
