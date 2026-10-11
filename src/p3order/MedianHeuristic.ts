/**
 * MedianHeuristic (对应 ELK p3order.MedianHeuristic).
 *
 * 用传播的中位数权重最小化交叉: 首层节点获得随机权重, 后续层按邻接节点权重的中位数排序.
 * 排序使用稳定排序 (ELK Collections.sort / 现代 JS Array.prototype.sort 均稳定),
 * 权重相同的节点保持相对顺序 (平局不由随机决定).
 */
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { Property } from '../graph/properties.js'
import type { ICrossingMinimizationHeuristic } from './interfaces.js'

/** 节点权重 (对应 ELK InternalProperties.WEIGHT, "medianHeuristic.weight"). */
export const WEIGHT = new Property<number>('medianHeuristic.weight')

interface Random {
  nextDouble(): number
}

/** Java Double.MIN_VALUE / Double.MAX_VALUE (double 极小正数 / 最大值). */
const MIN_DOUBLE = Number.MIN_VALUE
const MAX_DOUBLE = Number.MAX_VALUE

/** R49: 是否为有子的 black-box 节点 (buildGraph 标记 SEPARATE_CHILDREN). 与 BarycenterHeuristic 同判定. */
function isSeparateBlackBox(node: LNode): boolean {
  return node.getAllProperties().get('org.eclipse.elk.hierarchyHandling') === 'SEPARATE_CHILDREN'
}

/** 节点是否无任何连接边 (孤立). */
function isIsolated(node: LNode): boolean {
  return node.getIncomingEdges().length === 0 && node.getOutgoingEdges().length === 0
}

export class MedianHeuristic implements ICrossingMinimizationHeuristic {
  readonly skipInitAtLayerLevel = true
  readonly skipInitAtNodeLevel = true
  readonly skipInitAtPortLevel = true
  readonly skipInitAtEdgeLevel = true
  readonly skipInitAfterTraversal = true
  protected readonly random: Random

  constructor(random: Random) {
    this.random = random
  }

  alwaysImproves(): boolean {
    return false
  }

  isDeterministic(): boolean {
    return true
  }

  setFirstLayerOrder(order: LNode[][], forwardSweep: boolean): boolean {
    // 确定首个要排序的层索引 (forward: 0; backward: 末层).
    const firstIndex = forwardSweep ? 0 : Math.max(0, order.length - 1)
    // 抽出首层副本 (ELK: 避免修改原数组顺序).
    const firstLayer = [...order[firstIndex]!]
    // 给首层节点赋随机权重; 孤立 black-box (R49: Java 两遍布局排层尾) 权重设最大 → 稳定排层尾.
    // 仅孤立 black-box (有连接的会经中位数传播覆盖权重, 正常参与排序).
    for (const node of firstLayer) {
      node.setProperty(WEIGHT, isSeparateBlackBox(node) && isIsolated(node) ? MAX_DOUBLE : this.random.nextDouble())
    }
    // 按随机权重稳定排序.
    firstLayer.sort(this.weightComparator)
    // 写回数组, 并把权重覆盖为 1..n 的整数 (后续层的中位数计算依赖该权重).
    let index = 0
    for (const node of firstLayer) {
      order[firstIndex]![index++] = node
      node.setProperty(WEIGHT, index)
    }
    return false
  }

  minimizeCrossings(order: LNode[][], freeLayerIndex: number, forwardSweep: boolean, _isFirstSweep: boolean): boolean {
    const freeLayer = [...order[freeLayerIndex]!]
    // 计算自由层每个节点的中位数权重 (不排序).
    this.calculateMedians(freeLayer, forwardSweep ? freeLayerIndex - 1 : freeLayerIndex + 1)
    // 按权重稳定排序并写回.
    freeLayer.sort(this.weightComparator)
    let index = 0
    for (const node of freeLayer) {
      order[freeLayerIndex]![index++] = node
    }
    return false
  }

  /**
   * 计算自由层节点的中位数权重并写入 WEIGHT 属性.
   *
   * @param nodes 需要计算中位数的节点, 全部在同一层
   * @param referenceLayer 计算中位数时参考的层索引
   */
  private calculateMedians(nodes: LNode[], referenceLayer: number): void {
    // 自由层中的最小/最大权重.
    let minWeight = MIN_DOUBLE
    let maxWeight = MAX_DOUBLE
    // 无法仅从 referenceLayer 确定权重的节点 (referenceLayer 内无连接).
    const toRevisit: LNode[] = []

    for (const node of nodes) {
      const connectedNodes: LNode[] = []
      // 遍历所有入边和出边, 收集 referenceLayer 内的邻接节点.
      for (const edge of node.getIncomingEdges()) {
        this.addAdjacentNodeInReferenceLayer(edge, referenceLayer, connectedNodes)
      }
      for (const edge of node.getOutgoingEdges()) {
        this.addAdjacentNodeInReferenceLayer(edge, referenceLayer, connectedNodes)
      }

      if (connectedNodes.length === 0) {
        // referenceLayer 内没有连接节点 → 稍后统一赋平均权重.
        toRevisit.push(node)
      } else {
        // 稳定排序, 取上中位数作为新权重.
        connectedNodes.sort(this.weightComparator)
        const newWeight = connectedNodes[Math.floor(connectedNodes.length / 2)]!.getProperty(WEIGHT)
        node.setProperty(WEIGHT, newWeight)
        minWeight = Math.min(minWeight, newWeight)
        maxWeight = Math.max(maxWeight, newWeight)
      }
    }

    // 无任何节点有权重时 avgWeight = 0 (ELK 注释; 实际浮点计算与 Java 一致).
    const avgWeight = (maxWeight + minWeight) / 2.0
    for (const n of toRevisit) {
      n.setProperty(WEIGHT, avgWeight)
    }
  }

  /** 若边的对端节点位于 referenceLayer, 加入 connectedNodes. */
  private addAdjacentNodeInReferenceLayer(edge: LEdge, referenceLayer: number, connectedNodes: LNode[]): void {
    const target = edge.getTarget()!.getNode()!
    const source = edge.getSource()!.getNode()!
    if (target.getLayer()!.getIndex() === referenceLayer) connectedNodes.push(target)
    if (source.getLayer()!.getIndex() === referenceLayer) connectedNodes.push(source)
  }

  /** 按节点权重比较 (假设两个节点都已设置权重). */
  protected weightComparator = (n1: LNode, n2: LNode): number => {
    // 即使权重未设置, 也返回一个合适的值.
    if (!n1.hasProperty(WEIGHT)) return 1
    if (!n2.hasProperty(WEIGHT)) return -1
    const w1 = n1.getProperty<number>(WEIGHT)
    const w2 = n2.getProperty<number>(WEIGHT)
    return compareDoubles(w1, w2)
  }

  initAtLayerLevel(_l: number, _nodeOrder: LNode[][]): void {}
  initAtNodeLevel(_l: number, _n: number, _nodeOrder: LNode[][]): void {}
  initAtPortLevel(_l: number, _n: number, _p: number, _nodeOrder: LNode[][]): void {}
  initAtEdgeLevel(_l: number, _n: number, _p: number, _e: number, _edge: LEdge, _nodeOrder: LNode[][]): void {}
  initAfterTraversal(): void {}
}

/** Java Double.compare 语义 (处理 NaN 与 ±0.0). */
export function compareDoubles(a: number, b: number): number {
  if (a < b) return -1
  if (a > b) return 1
  if (a === b) {
    // ±0.0: Java Double.compare(-0.0, 0.0) = -1; Double.compare(0.0, -0.0) = 1.
    if (a === 0) return Object.is(a, -0) === Object.is(b, -0) ? 0 : (Object.is(a, -0) ? -1 : 1)
    return 0
  }
  // NaN: Double.compare(NaN, x) = 1; Double.compare(x, NaN) = -1; 双 NaN = 0.
  if (Number.isNaN(a)) return Number.isNaN(b) ? 0 : 1
  return -1
}
