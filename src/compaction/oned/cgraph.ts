/** CGraph (对应 ELK layered compaction.oned.CGraph). */
import { Direction } from '../../graph/enums.js'
import type { CGroup } from './cgroup.js'
import type { CNode } from './cnode.js'

export class CGraph {
  cNodes: CNode[] = []
  cGroups: CGroup[] = []
  /** 预计算约束 (ELK CGraph.predefinedHorizontalConstraints; 段链先后, calculateConstraints 时按方向应用). */
  predefinedHorizontalConstraints: [CNode, CNode][] = []
  private supportedDirections: Set<Direction>

  constructor(supportedDirections: Iterable<Direction>) {
    this.supportedDirections = new Set(supportedDirections)
  }

  supports(direction: Direction): boolean {
    return this.supportedDirections.has(direction)
  }
}
