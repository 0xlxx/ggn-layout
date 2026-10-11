/**
 * P3 启发式策略行为规格 (直接 vitest BDD):
 *   - MedianHeuristic (crossingMinimization.strategy=MEDIAN): LayerSweepCrossingMinimizer 级端到端 —
 *     不崩溃、每层节点集合守恒、固定种子确定;
 *   - ModelOrderBarycenterHeuristic (crossingMinimization.forceNodeModelOrder=true): 完整管线 —
 *     每层带 MODEL_ORDER 的节点子序列严格递增, 布局不变量保持.
 *
 * 注: LayeredLayoutProvider 固定用 BARYCENTER 跑 LayerSweepCrossingMinimizer (MEDIAN 不可达),
 * 故 MEDIAN 场景在 LayerSweepCrossingMinimizer 级直接构造分层图验证 (不越权改 provider).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer, PortSide } from '../../src/index.js'
import { LayerSweepCrossingMinimizer } from '../../src/p3order/layer-sweep-crossing-minimizer.js'
import { CrossMinType } from '../../src/p3order/port-distributors.js'
import { RANDOM, MODEL_ORDER, CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER } from '../../src/options/internal-properties.js'
import { CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy } from '../../src/options/layered-options.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { Harness, expectLayered, expectFiniteCoords, expectNoOverlap } from './bdd-helpers.js'

/** 手工构造分层图: 层间随机 EAST→WEST 边 (每边新建端口), 返回 {graph, layers}. */
function layeredRandomGraph(seed: number, numLayers: number, nodesPerLayer: number): { graph: LGraph; layers: LNode[][] } {
  const graph = new LGraph()
  const r = new JavaRandom(seed)
  const layers: LNode[][] = []
  for (let li = 0; li < numLayers; li++) {
    const layer = new Layer(graph)
    layer.id = li
    graph.getLayers().push(layer)
    const ns: LNode[] = []
    for (let ni = 0; ni < nodesPerLayer; ni++) {
      const n = new LNode(graph)
      n.id = ni
      n.setLayer(layer)
      ns.push(n)
    }
    layers.push(ns)
  }
  for (let li = 0; li < numLayers - 1; li++) {
    for (const left of layers[li]!) {
      const k = 1 + r.nextInt(2)
      for (let e = 0; e < k; e++) {
        const right = layers[li + 1]![r.nextInt(nodesPerLayer)]!
        const pa = new LPort(); pa.setNode(left); pa.setSide(PortSide.EAST)
        const pb = new LPort(); pb.setNode(right); pb.setSide(PortSide.WEST)
        const ed = new LEdge(); ed.setSource(pa); ed.setTarget(pb)
        void ed
      }
    }
  }
  return { graph, layers }
}

const NOOP_MONITOR = { begin: () => {}, done: () => {} }

describe('MedianHeuristic (crossingMinimization.strategy=MEDIAN)', () => {
  it('LayerSweepCrossingMinimizer(MEDIAN) 端到端不崩溃且每层节点集合守恒', () => {
    const { graph, layers } = layeredRandomGraph(3, 3, 4)
    const before = layers.map(layer => layer.map(n => n.id).sort((a, b) => a - b))
    graph.setProperty(RANDOM, new JavaRandom(3))
    new LayerSweepCrossingMinimizer(CrossMinType.MEDIAN).process(graph, NOOP_MONITOR as any)
    for (let li = 0; li < graph.getLayers().length; li++) {
      const ids = graph.getLayers()[li]!.getNodes().map(n => n.id).sort((a, b) => a - b)
      expect(ids, `层 ${li} 节点集合变化`).toEqual(before[li])
    }
  })

  it('MEDIAN 固定种子确定 (两次独立运行结果一致)', () => {
    const run = (): string[] => {
      const { graph } = layeredRandomGraph(11, 3, 4)
      graph.setProperty(RANDOM, new JavaRandom(11))
      new LayerSweepCrossingMinimizer(CrossMinType.MEDIAN).process(graph, NOOP_MONITOR as any)
      return graph.getLayers().map(layer => layer.getNodes().map(n => n.id).join(','))
    }
    expect(run()).toEqual(run())
  })
})

describe('ModelOrderBarycenterHeuristic (crossingMinimization.forceNodeModelOrder=true)', () => {
  function forceModelOrder(h: Harness): Harness {
    h.root.setProperty(CONSIDER_MODEL_ORDER_STRATEGY, OrderingStrategy.NODES_AND_EDGES)
    h.root.setProperty(CROSSING_MINIMIZATION_FORCE_NODE_MODEL_ORDER, true)
    return h
  }

  it('完整管线: 每层带 MODEL_ORDER 的节点子序列严格递增', () => {
    const h = forceModelOrder(new Harness()
      .node('A', 'B', 'C', 'D', 'E', 'F')
      .edge('A→D, B→E, C→F, A→E, B→F, C→D')
      .layout())
    expectLayered(h)
    expectFiniteCoords(h)
    expectNoOverlap(h)
    for (const layer of h.root.getLayers()) {
      let modelOrder = -1
      for (const node of layer.getNodes()) {
        if (node.hasProperty(MODEL_ORDER)) {
          const mo = node.getProperty<number>(MODEL_ORDER)
          expect(mo, `层 ${layer.getIndex()} 内模型序 ${mo} 应大于前一个 ${modelOrder}`).toBeGreaterThan(modelOrder)
          modelOrder = mo
        }
      }
    }
  })

  it('完整管线: 无模型序图 (默认 NONE) 不受 force 影响, 布局仍成立', () => {
    const h = new Harness()
      .node('A', 'B', 'C', 'D')
      .edge('A→C, B→D, A→D, B→C')
      .layout()
    expectLayered(h)
    expectFiniteCoords(h)
    expectNoOverlap(h)
  })
})
