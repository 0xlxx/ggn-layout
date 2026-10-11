/**
 * ModelOrderBarycenterHeuristic (对应 ELK p3order.ModelOrderBarycenterHeuristic).
 *
 * 用 barycenter 方法最小化交叉, 但输入模型给定的节点顺序 (model order) 不会改变:
 * 只有 dummy 节点在已排好序的真实节点之间插入排序.
 */
import type { LNode } from '../graph/lnode.js'
import { LayerConstraint } from '../graph/enums.js'
import { MODEL_ORDER, MAX_MODEL_ORDER_NODES, CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER } from '../options/internal-properties.js'
import { CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY, CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID, GroupOrderStrategy } from '../options/layered-options.js'
import { calculateModelOrderOrGroupModelOrder } from '../intermediate/preserveorder/cm-group-model-order.js'
import { ForsterConstraintResolver } from './forster-constraint-resolver.js'
import { BarycenterHeuristic } from './barycenter-heuristic.js'
import { compareDoubles } from './MedianHeuristic.js'
import type { AbstractBarycenterPortDistributor } from './port-distributors.js'

export class ModelOrderBarycenterHeuristic extends BarycenterHeuristic {
  /** 每个节点记录"它大于哪些节点"的集合. */
  private biggerThan = new Map<LNode, Set<LNode>>()
  /** 每个节点记录"它小于哪些节点"的集合. */
  private smallerThan = new Map<LNode, Set<LNode>>()

  /**
   * 构造模型序 barycenter 交叉最小化器.
   * 排序完成后应调用 {@link #clearTransitiveOrdering()}.
   *
   * @param constraintResolver 约束解析器
   * @param random 随机数生成器
   * @param portDistributor 为 barycenter heuristic 计算端口 rank
   * @param graph 当前节点顺序
   */
  constructor(
    constraintResolver: ForsterConstraintResolver,
    random: { nextBoolean(): boolean; nextDouble(): number; nextFloat(): number },
    portDistributor: AbstractBarycenterPortDistributor,
    graph: LNode[][],
  ) {
    super(constraintResolver, random, portDistributor, graph)
    // 真实节点需先被比较, 使得 dummy 节点不会用 barycenter 方法压过模型序.
    this.barycenterStateComparator = (n1, n2) => {
      if ((n1.getLayerConstraint() === LayerConstraint.FIRST_SEPARATE || n1.getLayerConstraint() === LayerConstraint.LAST_SEPARATE)
        || (n2.getLayerConstraint() === LayerConstraint.FIRST_SEPARATE || n2.getLayerConstraint() === LayerConstraint.LAST_SEPARATE)) {
        return 0
      }
      const lgraph = n1.getGraph()!
      // 先检查已收集的传递依赖是否已确定排序.
      const transitiveComparison = this.compareBasedOnTansitiveDependencies(n1, n2)
      if (transitiveComparison !== 0) {
        return transitiveComparison
      }
      // 若未确定, 考虑模型序 / 组模型序的排序模式.
      if (n1.hasProperty(MODEL_ORDER) && n2.hasProperty(MODEL_ORDER)) {
        // 该值是比较两个模型序, 或两个组模型序 (模型序作为次准则).
        let value = Math.sign(
          calculateModelOrderOrGroupModelOrder(n1, n2, lgraph, lgraph.getProperty(MAX_MODEL_ORDER_NODES))
          - calculateModelOrderOrGroupModelOrder(n2, n1, lgraph, lgraph.getProperty(MAX_MODEL_ORDER_NODES)))
        if (lgraph.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CM_GROUP_ORDER_STRATEGY) === GroupOrderStrategy.ONLY_WITHIN_GROUP) {
          // 若两个节点位于不同的模型序组, 不强制它们的顺序, 直接用 barycenter.
          if (n1.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID)
            !== n2.getProperty(CONSIDER_MODEL_ORDER_GROUP_MODEL_ORDER_CROSSING_MINIMIZATION_ID)) {
            value = 0
          }
        }
        // ★ 有意偏离 ELK Java: 关联记录方向必须与返回符号一致 (见下方 compareBasedOnBarycenter 注释).
        if (value < 0) {
          this.updateBiggerAndSmallerAssociations(n2, n1)
          return value
        } else if (value > 0) {
          this.updateBiggerAndSmallerAssociations(n1, n2)
          return value
        }
      }
      // 若某个节点没有模型序, 回退到 barycenter 方法.
      return this.compareBasedOnBarycenter(n1, n2)
    }
  }

  /** 公开仅因测试需要 (单层内排序, 非接口方法). */
  override minimizeLayer(layer: LNode[], preOrdered: boolean, randomize: boolean, forward: boolean): void {
    if (randomize) {
      this.randomizeBarycenters(layer)
    } else {
      this.calculateBarycenters(layer, forward)
      this.fillInUnknownBarycenters(layer, preOrdered)
    }

    if (layer.length > 1) {
      const forceNodeModelOrder = layer[0]!.getGraph()!.getProperty(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER)
      if (forceNodeModelOrder) {
        // 用插入排序确保传递排序约束被尊重 (见 insertionSort 注释).
        ModelOrderBarycenterHeuristic.insertionSort(layer, this.barycenterStateComparator, this)
      } else {
        layer.sort(this.barycenterStateComparator)
      }
      // 强制模型序时, 不再用 Forster 约束解析器处理约束 (避免破坏模型序).
      if (!forceNodeModelOrder) {
        this.constraintResolver.processConstraints(layer)
      }
    }
  }

  /**
   * 基于已收集的传递依赖比较两个节点.
   *
   * @param n1 第一个节点
   * @param n2 第二个节点
   * @returns n1 < n2 返回 -1, 无法确定排序返回 0, n1 > n2 返回 1
   */
  private compareBasedOnTansitiveDependencies(n1: LNode, n2: LNode): number {
    if (!this.biggerThan.has(n1)) {
      this.biggerThan.set(n1, new Set())
    } else if (this.biggerThan.get(n1)!.has(n2)) {
      return 1
    }
    if (!this.biggerThan.has(n2)) {
      this.biggerThan.set(n2, new Set())
    } else if (this.biggerThan.get(n2)!.has(n1)) {
      return -1
    }
    if (!this.smallerThan.has(n1)) {
      this.smallerThan.set(n1, new Set())
    } else if (this.smallerThan.get(n1)!.has(n2)) {
      return -1
    }
    if (!this.smallerThan.has(n2)) {
      this.smallerThan.set(n2, new Set())
    } else if (this.smallerThan.get(n2)!.has(n1)) {
      return 1
    }
    return 0
  }

  /**
   * 按 barycenter 排序节点并更新它们的传递依赖.
   *
   * ★ 与 ELK Java 的有意差异: Java 在返回 -1 时把 n1 记为 "更大"
   * (`updateBiggerAndSmallerAssociations(n1, n2)`), 与其自身返回值符号相反; 由于关联表在比较
   * 过程中被累积改写, 同一对节点第二次比较会返回相反符号 → 比较器不自洽 (违反 Comparator 契约).
   * Java `Collections.sort` (TimSort) 恰好容忍该缺陷, 但 JS 引擎的 `Array#sort` 实现不同,
   * 同一输入会得到不同层内排列 (Node/V8 `[0,3,1,2]` vs Bun/JSC `[0,2,3,1]`)。
   * 此处按返回符号记录 (返回 -1 记 `(n2, n1)`), 保证比较器自洽 → 跨引擎确定。
   * 全量 jar oracle (tests/oracle/generated) 修正前后逐位一致, 即仅消除 ELK 本身的 UB 行为。
   * 详见 docs/PORTING.md §6.17。
   *
   * @param n1 第一个节点
   * @param n2 第二个节点
   * @returns -1, 0, 1 (见 Comparator 约定)
   */
  private compareBasedOnBarycenter(n1: LNode, n2: LNode): number {
    const s1 = this.stateOf(n1)
    const s2 = this.stateOf(n2)
    if (s1.barycenter !== null && s2.barycenter !== null) {
      const value = compareDoubles(s1.barycenter, s2.barycenter)
      if (value < 0) {
        this.updateBiggerAndSmallerAssociations(n2, n1)
      } else if (value > 0) {
        this.updateBiggerAndSmallerAssociations(n1, n2)
      }
      return value
    } else if (s1.barycenter !== null) {
      this.updateBiggerAndSmallerAssociations(n2, n1)
      return -1
    } else if (s2.barycenter !== null) {
      this.updateBiggerAndSmallerAssociations(n1, n2)
      return 1
    }
    return 0
  }

  /**
   * 取自 {@code ModelOrderNodeComparator}: 保存节点的传递排序依赖供后续使用.
   *
   * @param bigger 更大的节点
   * @param smaller 更小的节点
   */
  private updateBiggerAndSmallerAssociations(bigger: LNode, smaller: LNode): void {
    const biggerNodeBiggerThan = this.biggerThan.get(bigger)!
    const smallerNodeBiggerThan = this.biggerThan.get(smaller)!
    const biggerNodeSmallerThan = this.smallerThan.get(bigger)!
    const smallerNodeSmallerThan = this.smallerThan.get(smaller)!
    biggerNodeBiggerThan.add(smaller)
    smallerNodeSmallerThan.add(bigger)

    for (const verySmall of smallerNodeBiggerThan) {
      biggerNodeBiggerThan.add(verySmall)
      const verySmallSmallerThan = this.smallerThan.get(verySmall)!
      verySmallSmallerThan.add(bigger)
      for (const x of biggerNodeSmallerThan) verySmallSmallerThan.add(x)
    }

    for (const veryBig of biggerNodeSmallerThan) {
      smallerNodeSmallerThan.add(veryBig)
      const veryBigBiggerThan = this.biggerThan.get(veryBig)!
      veryBigBiggerThan.add(smaller)
      for (const x of smallerNodeBiggerThan) veryBigBiggerThan.add(x)
    }
  }

  /**
   * 用插入排序按给定比较器排序该层, 确保传递排序约束被尊重.
   * Java 常用的快速排序在此场景表现不佳: 模型序定义的偏序与 barycenter 值定义的全序
   * 容易产生冲突的排序. 插入排序可处理该冲突 — 只要模型序禁止, 真实节点不会被移过另一个
   * 真实节点. 不过 dummy 节点 (以及长边) 的放置可能会受一点影响.
   *
   * @param layer 要排序的层. 假定所有带模型序的 "真实" 节点已按预期排好序
   * @param comparator 同时使用全序 (barycenter 值) 与更高优先级的偏序 (真实节点模型序) 的比较器
   * @param barycenterHeuristic 本类的实例, 用于重置传递排序关联
   */
  static insertionSort(layer: LNode[], comparator: (n1: LNode, n2: LNode) => number,
    barycenterHeuristic: ModelOrderBarycenterHeuristic): void {
    for (let i = 1; i < layer.length; i++) {
      const temp = layer[i]!
      let j = i
      while (j > 0 && comparator(layer[j - 1]!, temp) > 0) {
        layer[j] = layer[j - 1]!
        j--
      }
      layer[j] = temp
    }
    barycenterHeuristic.clearTransitiveOrdering()
  }

  /** 清空传递排序关联. */
  clearTransitiveOrdering(): void {
    this.biggerThan = new Map()
    this.smallerThan = new Map()
  }
}
