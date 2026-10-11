/**
 * MedianHeuristic 单测 (ELK Java p3order.MedianHeuristic 移植).
 * 不变量:
 *   - setFirstLayerOrder: 首层按 JavaRandom 权重稳定排序, 权重重写为 1..n;
 *   - minimizeCrossings: 自由层节点权重 = 参考层邻接节点权重的上中位数 (无邻接 → 层平均权重);
 *   - 排序稳定 (权重相同 → 保持相对顺序), 固定种子确定;
 *   - 排列守恒 (不丢/不重节点).
 */
import { describe, expect, it } from 'vitest'
import { LNode } from '../../src/index.js'
import { MedianHeuristic, WEIGHT, compareDoubles } from '../../src/p3order/MedianHeuristic.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { randomLayeredGraph } from './helpers/PropertyTestGraphs.js'

/** Java Double.MIN_VALUE / MAX_VALUE (与 MedianHeuristic 内一致). */
const MIN_DOUBLE = Number.MIN_VALUE
const MAX_DOUBLE = Number.MAX_VALUE

function weightOf(n: LNode): number {
  return n.getProperty(WEIGHT)
}

/** 复刻 Java calculateMedians 的「无邻接节点平均权重」. */
function expectedAvgWeight(): number {
  return (MAX_DOUBLE + MIN_DOUBLE) / 2.0
}

/** 手工计算参考层邻接节点权重的上中位数 (稳定排序, 允许重复). */
function expectedMedian(n: LNode, referenceLayerIndex: number): number {
  const weights: number[] = []
  for (const edge of n.getIncomingEdges()) {
    const target = edge.getTarget()!.getNode()!
    const source = edge.getSource()!.getNode()!
    if (target.getLayer()!.getIndex() === referenceLayerIndex) weights.push(weightOf(target))
    if (source.getLayer()!.getIndex() === referenceLayerIndex) weights.push(weightOf(source))
  }
  for (const edge of n.getOutgoingEdges()) {
    const target = edge.getTarget()!.getNode()!
    const source = edge.getSource()!.getNode()!
    if (target.getLayer()!.getIndex() === referenceLayerIndex) weights.push(weightOf(target))
    if (source.getLayer()!.getIndex() === referenceLayerIndex) weights.push(weightOf(source))
  }
  if (weights.length === 0) return expectedAvgWeight()
  weights.sort((a, b) => compareDoubles(a, b))
  return weights[Math.floor(weights.length / 2)]!
}

describe('MedianHeuristic (ELK Java 移植)', () => {
  it('setFirstLayerOrder: 首层按随机权重稳定排序, 权重重写为 1..n', () => {
    const seed = 42
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 5 })
    const order = graph.toNodeArray()
    const original = [...order[0]!]
    const draws = (() => {
      const r = new JavaRandom(seed)
      const out: number[] = []
      for (let i = 0; i < order[0]!.length; i++) out.push(r.nextDouble())
      return out
    })()
    const expected = original
      .map((n, i) => ({ n, d: draws[i]! }))
      .sort((a, b) => compareDoubles(a.d, b.d))
      .map(x => x.n)

    const cm = new MedianHeuristic(new JavaRandom(seed))
    cm.setFirstLayerOrder(order, true)

    // 排序结果与 Java 语义一致 (按随机权重稳定排序).
    expect(order[0]!.map(n => n.id)).toEqual(expected.map(n => n.id))
    // 权重重写为 1..n (按排序后位置).
    expect(order[0]!.map(n => weightOf(n))).toEqual([1, 2, 3, 4, 5])
  })

  it('setFirstLayerOrder 反向 sweep 从末层开始', () => {
    const { graph, layers } = randomLayeredGraph(7, { numLayers: 3, nodesPerLayer: 4 })
    const order = graph.toNodeArray()
    const cm = new MedianHeuristic(new JavaRandom(7))
    cm.setFirstLayerOrder(order, false)
    expect(order[2]!.map(n => weightOf(n))).toEqual([1, 2, 3, 4])
    expect(order[0]!.every(n => !n.hasProperty(WEIGHT))).toBe(true)
    void layers
  })

  it('minimizeCrossings: 自由层权重 = 参考层邻接节点上中位数 (无邻接 → 平均权重)', () => {
    const seed = 3
    const { graph, layers } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
    const order = graph.toNodeArray()
    const cm = new MedianHeuristic(new JavaRandom(seed))
    cm.setFirstLayerOrder(order, true)

    // 层 1 参考层 0.
    cm.minimizeCrossings(order, 1, true, false)
    for (const n of order[1]!) {
      expect(weightOf(n)).toBe(expectedMedian(n, 0))
    }

    // 层 2 参考层 1 (权重已传播为中位数).
    cm.minimizeCrossings(order, 2, true, false)
    for (const n of order[2]!) {
      expect(weightOf(n)).toBe(expectedMedian(n, 1))
    }
    void layers
  })

  it.each([1, 2, 3, 4, 5])('seed=%i: 固定种子确定性 + 排列守恒 + 反向 sweep', (seed) => {
    const { graph } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
    const order = graph.toNodeArray()

    const run = () => {
      const o = order.map(layer => [...layer])
      const cm = new MedianHeuristic(new JavaRandom(seed))
      const fwd = seed % 2 === 0
      cm.setFirstLayerOrder(o, fwd)
      const start = fwd ? 1 : o.length - 2
      const end = fwd ? o.length : -1
      const step = fwd ? 1 : -1
      for (let i = start; i !== end; i += step) cm.minimizeCrossings(o, i, fwd, false)
      return o.map(layer => layer.map(n => n.id))
    }

    const a = run()
    const b = run()
    // 确定性: 同种子两次结果一致.
    expect(a).toEqual(b)
    // 排列守恒: 每层节点集合不变.
    for (let l = 0; l < order.length; l++) {
      const ids = order[l]!.map(n => n.id).sort((x, y) => x - y)
      expect(a[l]!.slice().sort((x, y) => x - y)).toEqual(ids)
    }
  })

  it('平局走稳定排序: 权重相等的两节点比较器返回 0, 排序保持相对顺序', () => {
    const { graph, layers } = randomLayeredGraph(11, { numLayers: 2, nodesPerLayer: 3 })
    const order = graph.toNodeArray()
    const cm = new MedianHeuristic(new JavaRandom(11))
    cm.setFirstLayerOrder(order, true)
    // 手工把两个节点权重设为相同值.
    const [a, b] = order[1]!
    a.setProperty(WEIGHT, 5)
    b.setProperty(WEIGHT, 5)
    expect(compareDoubles(weightOf(a), weightOf(b))).toBe(0)
    const comparator = (cm as any).weightComparator
    expect(comparator(a, b)).toBe(0)
    expect(comparator(b, a)).toBe(0)
    // 稳定排序保持相对顺序 (不交换).
    const list = [b, a]
    list.sort(comparator)
    expect(list).toEqual([b, a])
    void layers
  })

  it('weightComparator: 未设置权重的节点按 Java 语义排在已设置之后', () => {
    const { graph, layers } = randomLayeredGraph(13, { numLayers: 2, nodesPerLayer: 2 })
    const order = graph.toNodeArray()
    const cm = new MedianHeuristic(new JavaRandom(13))
    cm.setFirstLayerOrder(order, true)
    const [a, b] = order[1]!
    const comparator = (cm as any).weightComparator
    // a 无权重, b 有权重 → a 排后 (Java: !n1.hasProperty → 1).
    a.setProperty(WEIGHT, undefined)
    b.setProperty(WEIGHT, 5)
    expect(a.hasProperty(WEIGHT)).toBe(false)
    expect(b.hasProperty(WEIGHT)).toBe(true)
    expect(comparator(a, b)).toBe(1)
    expect(comparator(b, a)).toBe(-1)
    void layers
  })
})
