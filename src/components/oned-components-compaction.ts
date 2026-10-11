/**
 * OneDimensionalComponentsCompaction (对应 ELK compaction.components.OneDimensionalComponentsCompaction).
 * 用 OneDimensionalCompactor 对连通分量做水平/垂直交替压缩, 直到无改进或达最大迭代.
 * 水平压缩时排除水平外部扩展, 垂直压缩时排除垂直外部扩展, 每轮结束后把被排除的
 * 扩展沿图边框对齐 (updateExternalExtensionDimensions), 防止分量与边重叠.
 */
import { Direction } from '../graph/enums.js'
import { CGroup } from '../compaction/oned/cgroup.js'
import type { CNode } from '../compaction/oned/cnode.js'
import { CGraph } from '../compaction/oned/cgraph.js'
import { OneDimensionalCompactor } from '../compaction/oned/oned-compactor.js'
import {
  ComponentsToCGraphTransformer, COMPONENTS_SPACING_HANDLER,
  isHorizontalDirection, oppositeDirection,
  type IComponent, type IConnectedComponents,
} from './components-to-cgraph-transformer.js'

const MAX_ITERATION = 10
const EPSILON = 0.0001

type Dir = 'HORZ' | 'VERT'

const LEFT_RIGHT = new Set([Direction.LEFT, Direction.RIGHT])
const UP_DOWN = new Set([Direction.UP, Direction.DOWN])

export class OneDimensionalComponentsCompaction {
  private compactionGraph: CGraph = new CGraph([])
  private transformer: ComponentsToCGraphTransformer = new ComponentsToCGraphTransformer(0)

  private verticalExternalExtensions: { first: CGroup, second: CNode }[] = []
  private horizontalExternalExtensions: { first: CGroup, second: CNode }[] = []

  private compactor: OneDimensionalCompactor | null = null

  private topLeft: { x: number, y: number } = { x: 0, y: 0 }
  private bottomRight: { x: number, y: number } = { x: 0, y: 0 }

  private constructor() { }

  /** 创建压缩对象: 转换 ccs 为 CGraph. */
  static init(ccs: IConnectedComponents, spacing: number): OneDimensionalComponentsCompaction {
    const compaction = new OneDimensionalComponentsCompaction()
    compaction.transformer = new ComponentsToCGraphTransformer(spacing)
    compaction.compactionGraph = compaction.transformer.transform(ccs)
    return compaction
  }

  /** 执行压缩: 水平/垂直交替, 最多 MAX_ITERATION 轮, 直到改进小于 EPSILON. */
  compact(): void {
    // 分离垂直与水平扩展
    const allNodes: CNode[] = []
    this.verticalExternalExtensions = []
    this.horizontalExternalExtensions = []
    for (const [ee, pair] of this.transformer.getExternalExtensions()) {
      allNodes.push(pair.second)
      if (isHorizontalDirection(ee.getDirection())) this.horizontalExternalExtensions.push(pair)
      else this.verticalExternalExtensions.push(pair)
    }

    // 一维压缩器创建前先加入外部边表示 (所有组偏移须正确计算)
    this.addExternalEdgeRepresentations(this.horizontalExternalExtensions)
    this.addExternalEdgeRepresentations(this.verticalExternalExtensions)
    this.compactor = new OneDimensionalCompactor(this.compactionGraph)
    this.compactor.setSpacingsHandler(COMPONENTS_SPACING_HANDLER)
    this.removeExternalEdgeRepresentations(this.horizontalExternalExtensions)
    this.removeExternalEdgeRepresentations(this.verticalExternalExtensions)

    allNodes.push(...this.compactor.cGraph.cNodes)

    // 计算当前图尺寸与偏移
    this.topLeft = { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }
    this.bottomRight = { x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY }
    for (const cNode of allNodes) {
      this.topLeft.x = Math.min(this.topLeft.x, cNode.hitbox.x)
      this.topLeft.y = Math.min(this.topLeft.y, cNode.hitbox.y)
      this.bottomRight.x = Math.max(this.bottomRight.x, cNode.hitbox.x + cNode.hitbox.width)
      this.bottomRight.y = Math.max(this.bottomRight.y, cNode.hitbox.y + cNode.hitbox.height)
    }

    // 基于出约束锁节点: 若对面阴影里有节点则不移动它.
    // 注意 #compactRun() 先执行一次无锁压缩.
    this.compactor.setLockingStrategy((pair) => pair.first.cGroup!.outDegree !== 0)

    let run = 0
    let delta: number
    do {
      delta = this.compactRun(run)
      run++
    } while ((run < 2 || delta > EPSILON) && run < MAX_ITERATION)

    // 对齐压缩左上角
    this.compactor.setLockingStrategy((pair) =>
      pair.first.lock.get(pair.second)
      || (pair.first.cGroup!.outDegree !== 0 && pair.first.lock.get(pair.second)))
    this.compactRun(0)

    // 收尾! 此时外部边表示已从压缩图移除, 图尺寸计算正确
    this.compactor.finish()

    // 最终应用确定的位置
    this.transformer.applyLayout()
  }

  /** 压缩后图的尺寸 (仅真实节点, 不含外部边贡献). */
  getGraphSize(): { x: number, y: number } {
    return this.transformer.getGraphSize()
  }

  /** 组件相对压缩前位置的偏移. */
  getOffset(c: IComponent): { x: number, y: number } {
    const individual = this.transformer.getOffset(c)
    const global = this.transformer.getGlobalOffset()
    return { x: -individual.x + global.x, y: -individual.y + global.y }
  }

  /**
   * 内部压缩: 先水平 3 次 (无锁/锁/锁), 再垂直 3 次, 返回两方向的位移量之和.
   */
  private compactRun(_run: number): number {
    let delta = 0

    // 重置所有组位移
    for (const g of this.compactionGraph.cGroups) {
      g.delta = 0
      g.deltaNormalized = 0
    }

    // ── #1 先水平压缩: 需把垂直外部边加入凸包防止边-节点重叠 ──
    this.addPlaceholders('HORZ')
    this.addExternalEdgeRepresentations(this.verticalExternalExtensions)
    this.compactor!.calculateGroupOffsets()
    // 压缩图有新节点, 必须更新约束
    this.compactor!.forceConstraintsRecalculation()

    let direction = Direction.LEFT
    this.compactor!
      .changeDirection(direction).compact()
      .changeDirection(oppositeDirection(direction)).applyLockingStrategy().compact()
      .changeDirection(direction).applyLockingStrategy().compact()

    // 必须转回 LEFT: 即将加入的表示外部边的 hitbox 尚未变换
    this.compactor!.changeDirection(Direction.LEFT)

    this.removeExternalEdgeRepresentations(this.verticalExternalExtensions)
    this.removePlaceholders('HORZ')

    // 平移水平外部边 (下次加入) 到刚完成的水平压缩结果
    this.updateExternalExtensionDimensions('HORZ')
    this.updatePlaceholders('VERT')

    // ── #2 垂直压缩 ──
    this.addPlaceholders('VERT')
    this.addExternalEdgeRepresentations(this.horizontalExternalExtensions)
    this.compactor!.calculateGroupOffsets()
    // 记录水平压缩位移
    for (const g of this.compactionGraph.cGroups) {
      delta += Math.abs(g.deltaNormalized)
    }
    // 重置所有组位移
    for (const g of this.compactionGraph.cGroups) {
      g.delta = 0
      g.deltaNormalized = 0
    }

    direction = Direction.UP
    this.compactor!
      .changeDirection(direction).forceConstraintsRecalculation().compact()
      .changeDirection(oppositeDirection(direction)).applyLockingStrategy().compact()
      .changeDirection(direction).applyLockingStrategy().compact()

    // 转回 LEFT
    this.compactor!.changeDirection(Direction.LEFT)

    this.removeExternalEdgeRepresentations(this.horizontalExternalExtensions)
    this.removePlaceholders('VERT')

    // 平移垂直外部边 (上次压缩期间被排除)
    this.updateExternalExtensionDimensions('VERT')
    this.updatePlaceholders('HORZ')

    this.compactor!.forceConstraintsRecalculation()

    // 垂直压缩位移
    for (const g of this.compactionGraph.cGroups) {
      delta += Math.abs(g.deltaNormalized)
    }

    return delta
  }

  /** 把外部边表示加入压缩图. */
  private addExternalEdgeRepresentations(ees: { first: CGroup, second: CNode }[]): void {
    for (const p of ees) {
      this.compactionGraph.cNodes.push(p.second)
      p.first.addCNode(p.second)
    }
  }

  /** 从压缩图移除外部边表示. */
  private removeExternalEdgeRepresentations(ees: { first: CGroup, second: CNode }[]): void {
    for (const p of ees) {
      const idx = this.compactionGraph.cNodes.indexOf(p.second)
      if (idx !== -1) this.compactionGraph.cNodes.splice(idx, 1)
      p.first.removeCNode(p.second)
    }
  }

  private addPlaceholders(dir: Dir): void {
    const dirs = dir === 'VERT' ? UP_DOWN : LEFT_RIGHT
    for (const d of dirs) {
      for (const pair of this.transformer.getExternalPlaceholder().get(d) ?? []) {
        this.compactionGraph.cNodes.push(pair.second)
        this.compactionGraph.cGroups.push(pair.second.cGroup!)
      }
    }
  }

  private removePlaceholders(dir: Dir): void {
    const dirs = dir === 'VERT' ? UP_DOWN : LEFT_RIGHT
    for (const d of dirs) {
      for (const pair of this.transformer.getExternalPlaceholder().get(d) ?? []) {
        const ni = this.compactionGraph.cNodes.indexOf(pair.second)
        if (ni !== -1) this.compactionGraph.cNodes.splice(ni, 1)
        const gi = this.compactionGraph.cGroups.indexOf(pair.second.cGroup!)
        if (gi !== -1) this.compactionGraph.cGroups.splice(gi, 1)
      }
    }
  }

  private updatePlaceholders(dir: Dir): void {
    const dirs = dir === 'VERT' ? UP_DOWN : LEFT_RIGHT
    for (const d of dirs) {
      for (const pair of this.transformer.getExternalPlaceholder().get(d) ?? []) {
        const cNode = pair.second
        const parentComponentGroup = pair.first

        // deltaNormalized: 组左移为负, 右移为正; 分量尺寸不变!
        const adelta = parentComponentGroup.deltaNormalized
        switch (d) {
          case Direction.LEFT:
          case Direction.RIGHT:
            cNode.hitbox.y += adelta
            break

          case Direction.UP:
          case Direction.DOWN:
            // y 贴图顶部
            cNode.hitbox.x += adelta
            break
          default:
            break
        }
      }
    }
  }

  /**
   * x 维压缩期间水平外部扩展不在压缩图里, 位置不被更新.
   * 在此补齐: 同时尊重图边框尺寸, 保证外部扩展始终延伸到图边框
   * (防止分量与边重叠).
   */
  private updateExternalExtensionDimensions(dir: Dir): void {
    for (const [ee, pair] of this.transformer.getExternalExtensions()) {
      if (dir === 'VERT') {
        if (ee.getDirection() !== Direction.UP && ee.getDirection() !== Direction.DOWN) continue
      } else {
        if (ee.getDirection() !== Direction.LEFT && ee.getDirection() !== Direction.RIGHT) continue
      }

      const cNode = pair.second
      // 节点此刻可能未关联组, cNode.cGroup 可为 null
      const group = pair.first

      // deltaNormalized: 组左移为负, 右移为正
      const adelta = group.deltaNormalized
      switch (ee.getDirection()) {
        case Direction.LEFT:
          // x 贴图左侧
          cNode.hitbox.x = this.topLeft.x
          cNode.hitbox.width = Math.max(1, cNode.hitbox.width + adelta)
          break
        case Direction.RIGHT:
          cNode.hitbox.x = cNode.hitbox.x + adelta
          cNode.hitbox.width = Math.max(1, cNode.hitbox.width - adelta)
          break

        case Direction.UP:
          // y 贴图顶部
          cNode.hitbox.y = this.topLeft.y
          cNode.hitbox.height = Math.max(1, cNode.hitbox.height + adelta)
          break
        case Direction.DOWN:
          cNode.hitbox.y = cNode.hitbox.y + adelta
          cNode.hitbox.height = Math.max(1, cNode.hitbox.height - adelta)
          break
        default:
          break
      }
    }
  }
}
