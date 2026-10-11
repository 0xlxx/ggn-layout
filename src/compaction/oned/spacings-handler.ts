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
