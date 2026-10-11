/**
 * ModelOrderBarycenterHeuristicTest — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: test/org.eclipse.elk.alg.layered.test/.../p3order/ModelOrderBarycenterHeuristicTest.java
 * 资源: realworld/ptolemy/** (原 elkg; ggn 用等价 elkt).
 * 配置 (@ConfiguratorProvider preferEdgesWeightedConfigurator):
 *   crossingMinimization.strategy=LAYER_SWEEP, considerModelOrder.strategy=NODES_AND_EDGES,
 *   crossingMinimization.forceNodeModelOrder=true, greedySwitch.type=OFF.
 * 断言 (@TestAfterProcessor(LayerSweepCrossingMinimizer)):
 *   每层内带 MODEL_ORDER 的节点, model order 严格递增 (模型顺序被尊重).
 *
 * 单元/性质测试 (writer C): 固定种子 JavaRandom, 断言不变量而非具体坐标:
 *   - 比较器: 双节点带 MODEL_ORDER → 模型序决定; 模型序相同/缺失 → barycenter;
 *   - minimizeLayer(forceNodeModelOrder=true): 层内带 MODEL_ORDER 的节点子序列严格递增;
 *   - 固定种子确定性 + 排列守恒 (传递依赖在每次排序后被清空, 不泄漏);
 *   - force=false 且无 MODEL_ORDER 时与 BarycenterHeuristic 输出一致.
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, summarizeFailures } from './framework/runner.js'
import { runAllPerGraph } from './framework/runner-per-graph.js'
import { MODEL_ORDER, CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER } from '../../src/options/internal-properties.js'
import {
  CROSSING_MINIMIZATION_STRATEGY, CONSIDER_MODEL_ORDER_STRATEGY,
  CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE, OrderingStrategy,
} from '../../src/options/layered-options.js'
import type { LGraph, LNode } from '../../src/index.js'
import { PortType } from '../../src/index.js'
import { NodeRelativePortDistributor } from '../../src/p3order/port-distributors.js'
import { ForsterConstraintResolver } from '../../src/p3order/forster-constraint-resolver.js'
import { BarycenterHeuristic } from '../../src/p3order/barycenter-heuristic.js'
import { ModelOrderBarycenterHeuristic } from '../../src/p3order/ModelOrderBarycenterHeuristic.js'
import { initInitializables } from '../../src/p3order/all-crossings-counter.js'
import { TestGraphCreator } from './helpers/TestGraphCreator.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { randomLayeredGraph } from './helpers/PropertyTestGraphs.js'

const MODELS = limitModels(resolveModels('realworld/ptolemy/**/'))

/** Java preferEdgesWeightedConfigurator: LayoutConfigurator 对 ElkNode.class 设 4 个选项 (含嵌套图). */
function configurePreferEdgesWeighted(g: LGraph): void {
  const queue: LGraph[] = [g]
  while (queue.length > 0) {
    const graph = queue.shift()!
    graph.setProperty(CROSSING_MINIMIZATION_STRATEGY, 'LAYER_SWEEP')
    graph.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.NODES_AND_EDGES)
    graph.setProperty(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER, true)
    graph.setProperty(CROSSING_MINIMIZATION_GREEDY_SWITCH_TYPE, 'OFF')
    for (const node of graph.getLayerlessNodes()) {
      const nested = node.getNestedGraph()
      if (nested !== null) queue.push(nested)
    }
  }
}

const AFTER_CM = [
  {
    module: 'LayerSweepCrossingMinimizer',
    when: 'after' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const layer of g.getLayers()) {
        let modelOrder = -1
        for (const node of layer.getNodes()) {
          if (node.hasProperty(MODEL_ORDER)) {
            const newModelOrder = node.getProperty<number>(MODEL_ORDER)
            if (!(newModelOrder > modelOrder)) {
              problems.push(`node ${node.getId()} model order ${newModelOrder} 小于等于前一个 ${modelOrder}`)
            }
            modelOrder = newModelOrder
          }
        }
      }
      return problems
    },
  },
]

// ── 单元/性质测试 (writer C) ──

function setup(nodes: LNode[][]) {
  const portDist = new NodeRelativePortDistributor(nodes.length)
  const cr = new ForsterConstraintResolver(nodes)
  initInitializables([portDist, cr], nodes)
  return { portDist, cr }
}

function makeCrossMin(
  cr: ForsterConstraintResolver, random: JavaRandom, portDist: NodeRelativePortDistributor,
  nodes: LNode[][], force: boolean,
): ModelOrderBarycenterHeuristic {
  nodes[0]![0]!.getGraph()!.setProperty(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER, force)
  const cm = new ModelOrderBarycenterHeuristic(cr, random as any, portDist, nodes)
  initInitializables([cm], nodes)
  return cm
}

function minimize(cm: ModelOrderBarycenterHeuristic, layer: LNode[], preOrdered: boolean, randomized: boolean, forward: boolean): void {
  const list = [...layer]
  cm.minimizeLayer(list, preOrdered, randomized, forward)
  for (let i = 0; i < list.length; i++) layer[i] = list[i]!
}

/** 层内带 MODEL_ORDER 的节点子序列 (Java 断言: 必须严格递增). */
function modelOrderSubsequence(layer: LNode[]): number[] {
  const out: number[] = []
  for (const n of layer) if (n.hasProperty(MODEL_ORDER)) out.push(n.getProperty<number>(MODEL_ORDER))
  return out
}

describe('ModelOrderBarycenterHeuristic 单元/性质', () => {
  /** 2 层小图: 层 0 单节点, 层 1 两节点 (每个都连到层 0 单节点). */
  function twoNodeGraph(): { nodes: LNode[][]; portDist: NodeRelativePortDistributor; cr: ForsterConstraintResolver } {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(1, tg.makeLayer())
    const right = tg.addNodesToLayer(2, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    tg.eastWestEdgeFromTo(left[0]!, right[1]!)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const { portDist, cr } = setup(nodes)
    return { nodes, portDist, cr }
  }

  it('比较器: 双节点带 MODEL_ORDER 时按模型序比较', () => {
    const { nodes, portDist, cr } = twoNodeGraph()
    const cm = makeCrossMin(cr, new JavaRandom(1), portDist, nodes, true)
    const [n1, n2] = nodes[1]!
    n1.setProperty(MODEL_ORDER, 1)
    n2.setProperty(MODEL_ORDER, 2)
    const cmp = (cm as any).barycenterStateComparator
    expect(cmp(n1, n2)).toBe(-1)
    // 清空传递关联后反向比较 (Java: 每次排序后 clearTransitiveOrdering).
    cm.clearTransitiveOrdering()
    expect(cmp(n2, n1)).toBe(1)
  })

  it('传递依赖: 比较器自洽, 反向比较取反 (biggerThan/smallerThan 关联; 有意偏离 ELK Java)', () => {
    const { nodes, portDist, cr } = twoNodeGraph()
    const cm = makeCrossMin(cr, new JavaRandom(1), portDist, nodes, true)
    const [n1, n2] = nodes[1]!
    n1.setProperty(MODEL_ORDER, 1)
    n2.setProperty(MODEL_ORDER, 2)
    const cmp = (cm as any).barycenterStateComparator
    expect(cmp(n1, n2)).toBe(-1)
    // ELK Java 在返回 -1 时记录 biggerThan[n1]∋n2 (方向与返回符号相反), 反向比较经
    // compareBasedOnTansitiveDependencies 命中该关联会再次返回 -1 — 即同一对节点前后符号相反,
    // 违反 Comparator 契约, 使 Array#sort 结果随 JS 引擎/版本漂移 (V8 vs JSC).
    // ggn 有意按返回符号记录关联 (见 ModelOrderBarycenterHeuristic 注释 / PORTING.md §6.17):
    // 反向比较必须取反, 比较器自洽 → 跨引擎确定性.
    expect(cmp(n2, n1)).toBe(1)
  })

  it('比较器自洽: 随机图上 cmp(a,b) === -cmp(b,a) (跨引擎确定性回归防线)', () => {
    const seed = 5
    const { graph } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
    const nodes = graph.toNodeArray()
    for (const n of nodes[1]!) n.setProperty(MODEL_ORDER, n.id)
    const { portDist, cr } = setup(nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    const cm = new ModelOrderBarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, nodes)
    initInitializables([cm], nodes)
    // 先真排一次, 让比较过程把传递关联表填满; 缺陷只在关联表被复用后暴露
    // (Java 记录方向与返回符号相反 → 同一对节点第二次比较返回相反符号).
    cm.minimizeLayer([...nodes[1]!], false, false, true)
    const cmp = (cm as any).barycenterStateComparator as (a: LNode, b: LNode) => number
    const layer = nodes[1]!
    for (const a of layer) {
      for (const b of layer) {
        if (a === b) continue
        const ab = Math.sign(cmp(a, b))
        const ba = Math.sign(cmp(b, a))
        expect(ab, `cmp 不自洽: ${a.id} vs ${b.id} → ${ab}/${ba}`).toBe(-ba)
      }
    }
  })

  it('比较器: 模型序相同 → 回退 barycenter', () => {
    const { nodes, portDist, cr } = twoNodeGraph()
    const cm = makeCrossMin(cr, new JavaRandom(1), portDist, nodes, true)
    const [n1, n2] = nodes[1]!
    n1.setProperty(MODEL_ORDER, 5)
    n2.setProperty(MODEL_ORDER, 5)
    const cmp = (cm as any).barycenterStateComparator
    const s1 = (cm as any).stateOf(n1)
    const s2 = (cm as any).stateOf(n2)
    s1.barycenter = 1
    s2.barycenter = 2
    expect(cmp(n1, n2)).toBe(-1)
    cm.clearTransitiveOrdering()
    expect(cmp(n2, n1)).toBe(1)
    // 相等 barycenter → 0 (稳定排序保持相对顺序).
    s2.barycenter = 1
    cm.clearTransitiveOrdering()
    expect(cmp(n1, n2)).toBe(0)
    expect(cmp(n2, n1)).toBe(0)
  })

  it('比较器: 无模型序节点按 barycenter 比较 (非 null 在前)', () => {
    const { nodes, portDist, cr } = twoNodeGraph()
    const cm = makeCrossMin(cr, new JavaRandom(1), portDist, nodes, false)
    const [n1, n2] = nodes[1]!
    const cmp = (cm as any).barycenterStateComparator
    const s1 = (cm as any).stateOf(n1)
    const s2 = (cm as any).stateOf(n2)
    s1.barycenter = 1
    s2.barycenter = null
    expect(cmp(n1, n2)).toBe(-1)
    cm.clearTransitiveOrdering()
    expect(cmp(n2, n1)).toBe(1)
    s2.barycenter = 2
    cm.clearTransitiveOrdering()
    expect(cmp(n1, n2)).toBe(-1)
    s1.barycenter = 2
    cm.clearTransitiveOrdering()
    expect(cmp(n1, n2)).toBe(0)
  })

  it('minimizeLayer(forceNodeModelOrder=true): 真实节点模型序子序列严格递增 (dummy 插入不破坏)', () => {
    const tg = new TestGraphCreator()
    const left = tg.addNodesToLayer(2, tg.makeLayer())
    const right = tg.addNodesToLayer(4, tg.makeLayer())
    tg.eastWestEdgeFromTo(left[0]!, right[0]!)
    tg.eastWestEdgeFromTo(left[1]!, right[1]!)
    tg.eastWestEdgeFromTo(left[0]!, right[2]!)
    tg.eastWestEdgeFromTo(left[1]!, right[3]!)
    tg.setUpIds()
    const nodes = tg.getGraph().toNodeArray()
    const [r0, r1, r2, r3] = nodes[1]!
    r0.setProperty(MODEL_ORDER, 1)
    r1.setProperty(MODEL_ORDER, 2)
    r2.setProperty(MODEL_ORDER, 3)
    // 初始层序故意打乱模型序: r2(MO3), r0(MO1), r1(MO2), r3(无 MO = dummy).
    const shuffled = [r2, r0, r1, r3]
    for (let i = 0; i < shuffled.length; i++) nodes[1]![i] = shuffled[i]!
    const { portDist, cr } = setup(nodes)
    portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
    const cm = makeCrossMin(cr, new JavaRandom(2), portDist, nodes, true)
    minimize(cm, nodes[1]!, false, false, true)
    // 带 MODEL_ORDER 的节点子序列严格递增 (模型顺序被尊重).
    expect(modelOrderSubsequence(nodes[1]!)).toEqual([1, 2, 3])
    // 排列守恒.
    expect([...nodes[1]!].sort((a, b) => a.id - b.id).map(n => n.id))
      .toEqual([...shuffled].sort((a, b) => a.id - b.id).map(n => n.id))
  })

  it.each([1, 2, 3, 4, 5])('seed=%i: 固定种子确定性 + 排列守恒 (force=true, 打乱初始序)', (seed) => {
    // 每次运行重建图: initInitializables 会按层内位置重排 node.id, 复用同一图会让
    // 第二次运行的 id 分配与第一次不同 (ELK 语义: id 是层内索引, 非对象标识).
    const build = () => {
      const { graph } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
      const nodes = graph.toNodeArray()
      // 给每层节点赋模型序 (1..n), 并打乱层内顺序.
      for (let l = 0; l < nodes.length; l++) {
        nodes[l]!.forEach((n, i) => n.setProperty(MODEL_ORDER, i + 1))
        nodes[l] = [...nodes[l]!].sort(() => (seed + l) % 2 === 0 ? -1 : 1)
      }
      graph.setProperty(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER, true)
      return nodes
    }

    const run = (): { ids: number[]; moSub: number[] } => {
      const nodes = build()
      const { portDist, cr } = setup(nodes)
      portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
      const cm = new ModelOrderBarycenterHeuristic(cr, new JavaRandom(seed) as any, portDist, nodes)
      initInitializables([cm], nodes)
      const before = nodes[1]!.map(n => n.id).sort((x, y) => x - y)
      const list = [...nodes[1]!]
      cm.minimizeLayer(list, false, false, true)
      const ids = list.map(n => n.id)
      // 排列守恒.
      expect(ids.slice().sort((x, y) => x - y)).toEqual(before)
      return { ids, moSub: modelOrderSubsequence(list) }
    }

    const a = run()
    const b = run()
    // 确定性 + 传递依赖在每次排序后被清空 (否则第二次结果会不同).
    expect(a.ids).toEqual(b.ids)
    // 模型序子序列严格递增.
    expect(a.moSub).toEqual([1, 2, 3, 4])
  })

  it('force=false 且无 MODEL_ORDER 时与 BarycenterHeuristic 输出一致', () => {
    const seed = 5
    const { graph } = randomLayeredGraph(seed, { numLayers: 3, nodesPerLayer: 4 })
    const nodes = graph.toNodeArray()

    const runWith = (ctor: typeof BarycenterHeuristic): number[] => {
      const { portDist, cr } = setup(nodes)
      portDist.calculatePortRanksForLayer(nodes[0]!, PortType.OUTPUT)
      const cm = new ctor(cr, new JavaRandom(seed) as any, portDist, nodes)
      initInitializables([cm], nodes)
      const list = [...nodes[1]!]
      cm.minimizeLayer(list, false, false, true)
      return list.map(n => n.id)
    }

    const bary = runWith(BarycenterHeuristic)
    const moBary = runWith(ModelOrderBarycenterHeuristic)
    expect(moBary).toEqual(bary)
  })
})

describe('ModelOrderBarycenterHeuristicTest (ELK Java 移植, realworld/ptolemy)', () => {
  it(`LayerSweepCrossingMinimizer 后置: 全部 ${MODELS.length} 图模型顺序被尊重`, () => {
    const results = runAllPerGraph(MODELS, AFTER_CM, configurePreferEdgesWeighted)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    expect(failed.length, summarizeFailures(results, 'ModelOrderBarycenterHeuristic 后置断言')).toBe(0)
  })
})
