/**
 * 分层策略族 (p2layers) 行为 — 直接 vitest BDD.
 *
 * M2 簇移植的 5 个 layerer: CoffmanGraham / BreadthFirstModelOrder /
 * DepthFirstModelOrder / MinWidth / StretchWidth. 每个场景的**精确层号**
 * 由 ELK Java 0.12.0 jar 实证 (scripts/elk-java-debug/LayerProbe: 同一图 +
 * P1 前置 + 目标 layerer, dump 每节点层号) — 本文件断言与 jar 1:1 一致.
 *
 * 算法不变量:
 *  - Coffman-Graham: 每层节点数 ≤ layerBound; 边前向.
 *  - MinWidth: 层宽最小化 (K5,1 上 max 层宽 4 < LongestPath 的 5).
 *  - BF/DF: 模型序单调 (BF); 边前向仅对 CG/MW/SW 断言 (Java DF/BF 在任意 DAG
 *    上不保证边前向, jar 实证 5->0[1->0] / 8->0[0->0]).
 */
import { describe, it, expect } from 'vitest'
import { Harness, layerOfNode, nameOf } from './bdd-helpers.js'
import { CoffmanGrahamLayerer } from '../../src/p2layers/CoffmanGrahamLayerer.js'
import { BreadthFirstModelOrderLayerer } from '../../src/p2layers/BreadthFirstModelOrderLayerer.js'
import { DepthFirstModelOrderLayerer } from '../../src/p2layers/DepthFirstModelOrderLayerer.js'
import { MinWidthLayerer } from '../../src/p2layers/MinWidthLayerer.js'
import { StretchWidthLayerer } from '../../src/p2layers/StretchWidthLayerer.js'
import { LongestPathLayerer } from '../../src/p2layers/longest-path-layerer.js'
import { GreedyCycleBreaker } from '../../src/p1cycles/greedy-cycle-breaker.js'
import { assignModelOrdersRecursive } from '../../src/intermediate/elk-graph-importer.js'
import { MODEL_ORDER, RANDOM } from '../../src/options/internal-properties.js'
import { LAYERING_COFFMAN_GRAHAM_LAYER_BOUND, LAYERING_STRATEGY } from '../../src/options/layered-options.js'
import { JavaRandom } from '../../src/util/java-random.js'
import { NullProgressMonitor } from '../../src/layered-layout-provider.js'
import type { IElkProgressMonitor } from '../../src/layered-layout-provider.js'

interface DirectLayerer {
  process(g: Harness['root'], monitor: IElkProgressMonitor): void
}

/** 与单元测试/Java probe 对齐的 P1 前置 + layerer 直接调用. */
function runLayerer(h: Harness, make: () => DirectLayerer, strategy: string): Harness {
  h.root.setProperty(LAYERING_STRATEGY, strategy)
  assignModelOrdersRecursive(h.root)
  // P1 前置 (场景均为 DAG, 断环 no-op; 与 jar probe 同构).
  h.root.setProperty(RANDOM, new JavaRandom(1))
  new GreedyCycleBreaker().process(h.root, new NullProgressMonitor())
  // Java GreedyCycleBreaker 副作用: node.id = 层内索引 (DF 依赖).
  let idx = 0
  for (const n of h.root.getLayerlessNodes()) n.id = idx++
  make().process(h.root, new NullProgressMonitor())
  return h
}

function expectLayers(h: Harness, layers: Record<string, number>): void {
  for (const [name, layer] of Object.entries(layers)) {
    expect(layerOfNode(h.nodes.get(name)!), `${name} 层号`).toBe(layer)
  }
}

/** BF 后处理: 模型序更大的节点不能在更小的层 (层号按模型序非降). */
function expectModelOrderMonotonic(h: Harness): void {
  const ordered = [...h.nodes.values()].sort((a, b) => a.getProperty(MODEL_ORDER) - b.getProperty(MODEL_ORDER))
  let lastLayer = -1
  for (const n of ordered) {
    const l = layerOfNode(n)
    expect(l, `${nameOf(h, n)} 模型序层号`).toBeGreaterThanOrEqual(lastLayer)
    lastLayer = l
  }
}

/** 每层节点数 ≤ bound (Coffman-Graham 宽度约束). */
function expectLayerWidthAtMost(h: Harness, bound: number): void {
  for (const layer of h.root.getLayers()) {
    expect(layer.getNodes().length, `层 ${layer.getIndex()} 节点数`).toBeLessThanOrEqual(bound)
  }
}

/** 最大层节点数. */
function maxLayerWidth(h: Harness): number {
  return h.root.getLayers().reduce((m, l) => Math.max(m, l.getNodes().length), 0)
}

describe('分层策略族 (p2layers) 行为', () => {
  describe('CoffmanGrahamLayerer', () => {
    it('bound=2 时 K3,3 每层 ≤ 2 节点 (宽度约束) 且层号与 jar 一致', () => {
      const h = new Harness().node('n1', 'n2', 'n3', 'n4', 'n5', 'n6')
        .edge('n1→n4, n1→n5, n1→n6, n2→n4, n2→n5, n2→n6, n3→n4, n3→n5, n3→n6')
      h.root.setProperty(LAYERING_COFFMAN_GRAHAM_LAYER_BOUND, 2)
      runLayerer(h, () => new CoffmanGrahamLayerer(), 'COFFMAN_GRAHAM')
      expectLayers(h, { n1: 0, n2: 1, n3: 1, n4: 2, n5: 3, n6: 3 })
      expectLayerWidthAtMost(h, 2)
    })

    it('DAG 上精确层号与 jar 一致 (默认 bound)', () => {
      const h = runLayerer(
        new Harness().node('a', 'b', 'c', 'd', 'e', 'f', 'g')
          .edge('a→f, a→g, b→a, c→a, d→b, d→e'),
        () => new CoffmanGrahamLayerer(), 'COFFMAN_GRAHAM',
      )
      expectLayers(h, { a: 2, b: 1, c: 0, d: 0, e: 2, f: 3, g: 3 })
    })
  })

  describe('BreadthFirstModelOrderLayerer', () => {
    it('链 + 支路按模型序分层, 层号与 jar 一致', () => {
      const h = runLayerer(
        new Harness().node('n1', 'n2', 'n3', 'n4', 'n5').edge('n1→n2, n2→n3, n4→n5'),
        () => new BreadthFirstModelOrderLayerer(), 'BF_MODEL_ORDER',
      )
      expectLayers(h, { n1: 0, n2: 1, n3: 2, n4: 2, n5: 3 })
      expectModelOrderMonotonic(h)
    })

    it('7 节点图精确层号与 jar 一致', () => {
      const h = runLayerer(
        new Harness().node('a', 'b', 'c', 'd', 'e', 'f', 'g')
          .edge('a→f, a→g, b→a, c→a, d→b, d→e'),
        () => new BreadthFirstModelOrderLayerer(), 'BF_MODEL_ORDER',
      )
      expectLayers(h, { a: 0, b: 0, c: 0, d: 0, e: 1, f: 1, g: 1 })
      expectModelOrderMonotonic(h)
    })
  })

  describe('DepthFirstModelOrderLayerer', () => {
    it('条带图 1->2->3, 2->4->5->6 层号与 jar 一致', () => {
      const h = runLayerer(
        new Harness().node('n1', 'n2', 'n3', 'n4', 'n5', 'n6')
          .edge('n1→n2, n2→n3, n2→n4, n4→n5, n5→n6'),
        () => new DepthFirstModelOrderLayerer(), 'DF_MODEL_ORDER',
      )
      expectLayers(h, { n1: 0, n2: 1, n3: 2, n4: 2, n5: 3, n6: 4 })
    })

    it('7 节点图精确层号与 jar 一致', () => {
      const h = runLayerer(
        new Harness().node('a', 'b', 'c', 'd', 'e', 'f', 'g')
          .edge('a→f, a→g, b→a, c→a, d→b, d→e'),
        () => new DepthFirstModelOrderLayerer(), 'DF_MODEL_ORDER',
      )
      expectLayers(h, { a: 0, b: 1, c: 0, d: 0, e: 1, f: 1, g: 1 })
    })
  })

  describe('MinWidthLayerer', () => {
    it('7 节点图精确层号与 jar 一致', () => {
      const h = runLayerer(
        new Harness().node('a', 'b', 'c', 'd', 'e', 'f', 'g')
          .edge('a→f, a→g, b→a, c→a, d→b, d→e'),
        () => new MinWidthLayerer(), 'MIN_WIDTH',
      )
      expectLayers(h, { a: 2, b: 1, c: 1, d: 0, e: 3, f: 3, g: 3 })
    })

    it('K5,1 层宽最小化: max 层宽 4 < LongestPath 的 5 (jar 一致)', () => {
      const lp = runLayerer(
        new Harness().node('n1', 'n2', 'n3', 'n4', 'n5', 'n6').edge('n1→n6, n2→n6, n3→n6, n4→n6, n5→n6'),
        () => new LongestPathLayerer(), 'LONGEST_PATH',
      )
      const mw = runLayerer(
        new Harness().node('n1', 'n2', 'n3', 'n4', 'n5', 'n6').edge('n1→n6, n2→n6, n3→n6, n4→n6, n5→n6'),
        () => new MinWidthLayerer(), 'MIN_WIDTH',
      )
      expectLayers(lp, { n1: 0, n2: 0, n3: 0, n4: 0, n5: 0, n6: 1 })
      expectLayers(mw, { n1: 1, n2: 1, n3: 1, n4: 1, n5: 0, n6: 2 })
      expect(maxLayerWidth(mw)).toBeLessThan(maxLayerWidth(lp))
    })
  })

  describe('StretchWidthLayerer', () => {
    it('7 节点图精确层号与 jar 一致', () => {
      const h = runLayerer(
        new Harness().node('a', 'b', 'c', 'd', 'e', 'f', 'g')
          .edge('a→f, a→g, b→a, c→a, d→b, d→e'),
        () => new StretchWidthLayerer(), 'STRETCH_WIDTH',
      )
      expectLayers(h, { a: 2, b: 1, c: 1, d: 0, e: 4, f: 4, g: 3 })
    })

    it('K3,3 层号与 jar 一致 (拉伸分层)', () => {
      const h = runLayerer(
        new Harness().node('n1', 'n2', 'n3', 'n4', 'n5', 'n6')
          .edge('n1→n4, n1→n5, n1→n6, n2→n4, n2→n5, n2→n6, n3→n4, n3→n5, n3→n6'),
        () => new StretchWidthLayerer(), 'STRETCH_WIDTH',
      )
      expectLayers(h, { n1: 0, n2: 0, n3: 0, n4: 3, n5: 2, n6: 1 })
    })
  })
})
