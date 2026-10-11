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
