/**
 * OneDimensionalCompactor (对应 ELK layered compaction.oned.OneDimensionalCompactor).
 * 一维压实: 约束图构建 + 最长路径压缩.
 */
import { Direction } from '../../graph/enums.js'
import { CGroup } from './cgroup.js'
import type { CNode } from './cnode.js'
import { CGraph } from './cgraph.js'
import { DEFAULT_SPACING_HANDLER, type ISpacingsHandler } from './spacings-handler.js'
import {
  LongestPathCompaction, QuadraticConstraintCalculation, ScanlineConstraintCalculator,
  type ICompactionAlgorithm, type IConstraintCalculationAlgorithm,
} from './algs.js'

export class OneDimensionalCompactor {
  static readonly LONGEST_PATH_COMPACTION: ICompactionAlgorithm = new LongestPathCompaction()
  static readonly SCANLINE_CONSTRAINTS: IConstraintCalculationAlgorithm = new ScanlineConstraintCalculator()
  static readonly QUADRATIC_CONSTRAINTS: IConstraintCalculationAlgorithm = new QuadraticConstraintCalculation()

  private compactionAlgorithm: ICompactionAlgorithm = OneDimensionalCompactor.LONGEST_PATH_COMPACTION
  private constraintAlgorithm: IConstraintCalculationAlgorithm = OneDimensionalCompactor.SCANLINE_CONSTRAINTS

  cGraph: CGraph
  direction: Direction = Direction.UNDEFINED
  private lockingStrategy: ((pair: { first: CNode, second: Direction }) => boolean) | null
  private finished = false
  spacingsHandler: ISpacingsHandler<CNode> = DEFAULT_SPACING_HANDLER

  constructor(cGraph: CGraph) {
    this.cGraph = cGraph
    this.lockingStrategy = (pair) => !(pair.first.cGroup!.outDegree === 0)
    this.calculateGroupOffsets()
    for (const n of cGraph.cNodes) {
      if (n.cGroup === null) {
        const group = new CGroup(n)
        cGraph.cGroups.push(group)
      }
    }
  }

  setSpacingsHandler(handler: ISpacingsHandler<CNode>): this {
    this.spacingsHandler = handler
    return this
  }

  setCompactionAlgorithm(compactor: ICompactionAlgorithm): this {
    this.compactionAlgorithm = compactor
    return this
  }

  setConstraintAlgorithm(theConstraintAlgorithm: IConstraintCalculationAlgorithm): this {
    this.constraintAlgorithm = theConstraintAlgorithm
    return this
  }

  compact(): this {
    if (this.finished) throw new Error('The OneDimensionalCompactor instance has been finished already.')
    if (this.direction === Direction.UNDEFINED) this.changeDirection(Direction.LEFT)
    // ELK OneDimensionalCompactor.compact:82 — 记录压缩前 hitbox (applyLayout 用 deltaX).
    for (const n of this.cGraph.cNodes) n.hitboxPreCompaction = { ...n.hitbox }

    for (const g of this.cGraph.cGroups) g.outDegree = 0
    for (const n of this.cGraph.cNodes) {
      n.startPos = Number.NEGATIVE_INFINITY
      for (const incN of n.constraints) incN.cGroup!.outDegree++
    }

    this.compactionAlgorithm.compact(this)

    for (const node of this.cGraph.cNodes) node.reposition = true
    return this
  }

  finish(): this {
    this.changeDirection(Direction.LEFT)
    this.finished = true
    return this
  }

  changeDirection(dir: Direction): this {
    if (this.finished) throw new Error('The OneDimensionalCompactor instance has been finished already.')
    if (!this.cGraph.supports(dir)) throw new Error(`The direction ${dir} is not supported by the CGraph instance.`)
    if (dir === this.direction) return this

    const oldDirection = this.direction
    this.direction = dir

    switch (oldDirection) {
      case Direction.UNDEFINED:
        if (dir === Direction.LEFT) this.calculateConstraints()
        else if (dir === Direction.RIGHT) { this.mirrorHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.UP) { this.transposeHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.DOWN) { this.transposeHitboxes(); this.mirrorHitboxes(); this.calculateConstraints() }
        break
      case Direction.LEFT:
        if (dir === Direction.RIGHT) { this.mirrorHitboxes(); this.reverseConstraints() }
        else if (dir === Direction.UP) { this.transposeHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.DOWN) { this.transposeHitboxes(); this.mirrorHitboxes(); this.calculateConstraints() }
        break
      case Direction.RIGHT:
        if (dir === Direction.LEFT) { this.mirrorHitboxes(); this.reverseConstraints() }
        else if (dir === Direction.UP) { this.mirrorHitboxes(); this.transposeHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.DOWN) { this.mirrorHitboxes(); this.transposeHitboxes(); this.mirrorHitboxes(); this.calculateConstraints() }
        break
      case Direction.UP:
        if (dir === Direction.LEFT) { this.transposeHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.RIGHT) { this.transposeHitboxes(); this.mirrorHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.DOWN) { this.mirrorHitboxes(); this.reverseConstraints() }
        break
      case Direction.DOWN:
        if (dir === Direction.LEFT) { this.mirrorHitboxes(); this.transposeHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.RIGHT) { this.mirrorHitboxes(); this.transposeHitboxes(); this.mirrorHitboxes(); this.calculateConstraints() }
        else if (dir === Direction.UP) { this.mirrorHitboxes(); this.reverseConstraints() }
        break
      default:
        break
    }
    return this
  }

  setLockingStrategy(strategy: ((pair: { first: CNode, second: Direction }) => boolean) | null): this {
    this.lockingStrategy = strategy
    return this
  }

  applyLockingStrategy(dir?: Direction): this {
    const d = dir ?? this.direction
    for (const cGroup of this.cGraph.cGroups) cGroup.reposition = true
    for (const cNode of this.cGraph.cNodes) {
      cNode.reposition = this.lockingStrategy!({ first: cNode, second: d })
      cNode.cGroup!.reposition = cNode.cGroup!.reposition && cNode.reposition
    }
    return this
  }

  forceConstraintsRecalculation(): this {
    this.calculateConstraints()
    return this
  }

  calculateGroupOffsets(): this {
    for (const group of this.cGraph.cGroups) {
      group.reference = null
      for (const n of group.cNodes) {
        n.cGroupOffset.x = 0
        n.cGroupOffset.y = 0
        if (group.reference === null || n.hitbox.x < group.reference.hitbox.x) group.reference = n
      }
      for (const n of group.cNodes) {
        n.cGroupOffset.x = n.hitbox.x - group.reference!.hitbox.x
        n.cGroupOffset.y = n.hitbox.y - group.reference!.hitbox.y
      }
    }
    return this
  }

  private mirrorHitboxes(): void {
    for (const cNode of this.cGraph.cNodes) {
      cNode.hitbox.x = -cNode.hitbox.x - cNode.hitbox.width
      if (cNode.parentNode !== null) {
        cNode.cGroupOffset.x = -cNode.cGroupOffset.x + cNode.parentNode.hitbox.width
      }
    }
    this.calculateGroupOffsets()
  }

  private transposeHitboxes(): void {
    for (const cNode of this.cGraph.cNodes) {
      let tmp = cNode.hitbox.x
      cNode.hitbox.x = cNode.hitbox.y
      cNode.hitbox.y = tmp
      tmp = cNode.hitbox.width
      cNode.hitbox.width = cNode.hitbox.height
      cNode.hitbox.height = tmp
      tmp = cNode.cGroupOffset.x
      cNode.cGroupOffset.x = cNode.cGroupOffset.y
      cNode.cGroupOffset.y = tmp
    }
    this.calculateGroupOffsets()
  }

  private calculateConstraints(): void {
    for (const cNode of this.cGraph.cNodes) cNode.constraints.length = 0
    // ELK OneDimensionalCompactor.calculateConstraints:442-453 — 先应用预计算约束 (方向相关:
    // LEFT/UP: first→second; RIGHT/DOWN: second→first).
    const pre = this.cGraph.predefinedHorizontalConstraints
    for (const [first, second] of pre) {
      if (this.direction === Direction.LEFT || this.direction === Direction.UP) {
        first.constraints.push(second)
      } else {
        second.constraints.push(first)
      }
    }
    this.constraintAlgorithm.calculateConstraints(this)
    this.calculateConstraintsForCGroups()
  }

  private calculateConstraintsForCGroups(): void {
    for (const group of this.cGraph.cGroups) {
      group.outDegree = 0
      group.incomingConstraints.clear()
    }
    for (const group of this.cGraph.cGroups) {
      for (const cNode of group.cNodes) {
        for (const inc of cNode.constraints) {
          if (inc.cGroup !== group) {
            group.incomingConstraints.add(inc)
            inc.cGroup!.outDegree++
          }
        }
      }
    }
  }

  private reverseConstraints(): void {
    const incMap = new Map<CNode, CNode[]>()
    for (const cNode of this.cGraph.cNodes) incMap.set(cNode, [])
    for (const cNode of this.cGraph.cNodes) {
      cNode.startPos = Number.NEGATIVE_INFINITY
      for (const inc of cNode.constraints) incMap.get(inc)!.push(cNode)
    }
    for (const cNode of this.cGraph.cNodes) {
      cNode.constraints = incMap.get(cNode)!
    }
    this.calculateConstraintsForCGroups()
  }
}
