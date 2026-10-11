/**
 * p2layers 变异杀灭测试 — 直接调用各 layerer 的合成图行为测试.
 *
 * 目的: 为 T5-A p2layers 变异批次补测, 提高 covered 杀灭率.
 * 口径: 每个图断言精确层号 (层索引 = getIndex, 与 bdd-helpers 一致) + 分层不变量
 *       (无 layerless / 无空层 / 层 id 连续 / 边前向) + monitor begin 任务名.
 * 层号预期值来源: ELK Java 0.12.0 语义 + 既有 bdd/jar 实证 (与本实现 1:1, 基线 348 全等).
 *
 * 注意: 不修改 src/p2layers (仅当确属 bug 才动); 本文件只补测试.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, Layer } from '../../src/index.js'
import type { IElkProgressMonitor } from '../../src/layered-layout-provider.js'
import { NodeType } from '../../src/graph/enums.js'
import { MODEL_ORDER } from '../../src/options/internal-properties.js'
import {
  LAYERING_NODE_PROMOTION_STRATEGY,
  LAYERING_COFFMAN_GRAHAM_LAYER_BOUND,
  LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH,
  LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR,
  PRIORITY_SHORTNESS,
  THOROUGHNESS,
} from '../../src/options/layered-options.js'
import { LongestPathLayerer } from '../../src/p2layers/longest-path-layerer.js'
import { LongestPathSourceLayerer } from '../../src/p2layers/longest-path-source-layerer.js'
import { processInteractiveLayering } from '../../src/p2layers/interactive-layerer.js'
import { NetworkSimplexLayerer } from '../../src/p2layers/network-simplex-layerer.js'
import { BreadthFirstModelOrderLayerer } from '../../src/p2layers/BreadthFirstModelOrderLayerer.js'
import { DepthFirstModelOrderLayerer } from '../../src/p2layers/DepthFirstModelOrderLayerer.js'
import { MinWidthLayerer } from '../../src/p2layers/MinWidthLayerer.js'
import { StretchWidthLayerer } from '../../src/p2layers/StretchWidthLayerer.js'
import { CoffmanGrahamLayerer } from '../../src/p2layers/CoffmanGrahamLayerer.js'
import { NodePromotion } from '../../src/p2layers/node-promotion.js'

/** 记录 begin 任务名的 monitor (杀 StringLiteral 变异体). */
class RecordingMonitor implements IElkProgressMonitor {
  tasks: string[] = []
  begin(name: string): void { this.tasks.push(name) }
  done(): void {}
}

interface GraphResult {
  g: LGraph
  nodes: Map<string, LNode>
}

/** 建图: 普通节点 (可指定尺寸/坐标/MODEL_ORDER); edges = [src, tgt][] 或含自环. */
function mk(
  names: string[],
  edges: [string, string][],
  opts: {
    size?: Partial<{ x: number; y: number }>
    x?: Record<string, number>
    y?: Record<string, number>
    modelOrder?: Record<string, number>
    label?: string[]
    sizeY?: Record<string, number>
  } = {},
): GraphResult {
  const g = new LGraph()
  const nodes = new Map<string, LNode>()
  for (const name of names) {
    const n = new LNode(g)
    n.size = { x: opts.size?.x ?? 30, y: opts.size?.y ?? 30 }
    if (opts.sizeY?.[name] !== undefined) n.size.y = opts.sizeY[name]!
    if (opts.x?.[name] !== undefined) n.position.x = opts.x[name]!
    if (opts.y?.[name] !== undefined) n.position.y = opts.y[name]!
    if (opts.modelOrder?.[name] !== undefined) n.setProperty(MODEL_ORDER, opts.modelOrder[name]!)
    n.id = nodes.size
    nodes.set(name, n)
  }
  for (const name of opts.label ?? []) nodes.get(name)!.setType(NodeType.LABEL)
  for (const [s, t] of edges) {
    const sp = new LPort(); sp.setNode(nodes.get(s)!)
    const tp = new LPort(); tp.setNode(nodes.get(t)!)
    const e = new LEdge(); e.setSource(sp); e.setTarget(tp)
  }
  return { g, nodes }
}

function selfLoopOf(n: LNode): void {
  const p = new LPort(); p.setNode(n)
  const e = new LEdge(); e.setSource(p); e.setTarget(p)
  void e
}

/** 分层不变量检查: 无 layerless / 无空层 / 边前向 (自环除外; forward=false 时跳过 — DF/BF 实验策略不保证). */
function expectInvariants(r: GraphResult, opts: { forward?: boolean } = {}): void {
  const { g, nodes } = r
  const forward = opts.forward ?? true
  expect(g.getLayerlessNodes().length, 'layerless 应为空').toBe(0)
  for (const layer of g.getLayers()) {
    expect(layer.getNodes().length, `层 ${layer.getIndex()} 不应为空`).toBeGreaterThan(0)
  }
  if (forward) {
    for (const layer of g.getLayers()) {
      for (const node of layer.getNodes()) {
        for (const edge of node.getOutgoingEdges()) {
          if (edge.isSelfLoop()) continue
          const src = edge.getSource()?.getNode()
          const tgt = edge.getTarget()?.getNode()
          if (!src || !tgt) continue
          if (src.getLayer() === null || tgt.getLayer() === null) continue
          expect(tgt.getLayer()!.getIndex(), `边 ${src.id}->${tgt.id} 应指向更后层`).toBeGreaterThan(src.getLayer()!.getIndex())
        }
      }
    }
  }
  for (const [name, n] of nodes) {
    expect(n.getLayer(), `${name} 应有层`).not.toBeNull()
  }
}

function layerOf(n: LNode): number { return n.getLayer()!.getIndex() }

function expectLayers(r: GraphResult, expected: Record<string, number>, opts: { forward?: boolean } = {}): void {
  for (const [name, layer] of Object.entries(expected)) {
    expect(layerOf(r.nodes.get(name)!), `${name} 层号`).toBe(layer)
  }
  expectInvariants(r, opts)
}

/** 层 id 连续 (BF/DF/Interactive 会重赋 id; 其余 layerer 不赋, 不检查). */
function expectLayerIds(r: GraphResult): void {
  let nextId = 0
  for (const layer of r.g.getLayers()) {
    expect(layer.id, `层 ${layer.getIndex()} id 应连续`).toBe(nextId)
    nextId++
  }
}

const MONITOR = new RecordingMonitor()

// ── LongestPathLayerer ──
describe('P2 变异杀灭: LongestPathLayerer', () => {
  it('7 节点 DAG 精确层号 + 不变量', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'f'], ['a', 'g'], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'e']])
    new LongestPathLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 2, b: 1, c: 1, d: 0, e: 3, f: 3, g: 3 })
  })

  it('K3,3 精确层号 + 不变量', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n4'], ['n1', 'n5'], ['n1', 'n6'], ['n2', 'n4'], ['n2', 'n5'], ['n2', 'n6'], ['n3', 'n4'], ['n3', 'n5'], ['n3', 'n6']])
    new LongestPathLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 0, n3: 0, n4: 1, n5: 1, n6: 1 })
  })

  it('自环被忽略 (不递归) 且 monitor 任务名正确', () => {
    const r = mk(['a', 'b'], [['a', 'b']])
    selfLoopOf(r.nodes.get('a')!)
    const m = new RecordingMonitor()
    new LongestPathLayerer().process(r.g, m)
    expectLayers(r, { a: 0, b: 1 })
    expect(m.tasks[0]).toBe('Longest path layering')
  })
})

// ── LongestPathSourceLayerer ──
describe('P2 变异杀灭: LongestPathSourceLayerer', () => {
  it('7 节点 DAG 精确层号 + 不变量', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'f'], ['a', 'g'], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'e']])
    new LongestPathSourceLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 2, b: 1, c: 0, d: 0, e: 1, f: 3, g: 3 })
  })

  it('单节点图不产生空层 (杀 i<=height 追加空层)', () => {
    const r = mk(['solo'], [])
    new LongestPathSourceLayerer().process(r.g, MONITOR)
    expectLayers(r, { solo: 0 })
  })

  it('跨图父容器节点不被分层 (height===undefined 分支)', () => {
    const g = new LGraph()
    const a = new LNode(g); a.size = { x: 30, y: 30 }; a.id = 0
    const b = new LNode(g); b.size = { x: 30, y: 30 }; b.id = 1
    // x 属于另一个图 (不在 g 的 layerless 列表里) — 模拟层级外部端点.
    const g2 = new LGraph()
    const x = new LNode(g2); x.size = { x: 30, y: 30 }; x.id = 0
    const xp = new LPort(); xp.setNode(x)
    const ap = new LPort(); ap.setNode(a)
    const e = new LEdge(); e.setSource(xp); e.setTarget(ap)
    void e
    const nodes = new Map([['a', a], ['b', b]])
    new LongestPathSourceLayerer().process(g, MONITOR)
    expectLayers({ g, nodes }, { a: 0, b: 0 })
    expect(x.getLayer(), '跨图节点 x 不应被分层').toBeNull()
  })

  it('自环被忽略 + monitor 任务名正确', () => {
    const r = mk(['a', 'b'], [['a', 'b']])
    selfLoopOf(r.nodes.get('a')!)
    const m = new RecordingMonitor()
    new LongestPathSourceLayerer().process(r.g, m)
    expectLayers(r, { a: 0, b: 1 })
    expect(m.tasks[0]).toBe('Longest path to source layering')
  })
})

// ── InteractiveLayerer (processInteractiveLayering) ──
describe('P2 变异杀灭: InteractiveLayerer', () => {
  it('互不重叠节点按 x 排序成独立层', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 40, c: 100 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 2 })
  })

  it('重叠节点合并到同一层 (span 合并)', () => {
    const r = mk(['a', 'b'], [], { x: { a: 0, b: 40 }, size: { x: 60, y: 30 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0 })
  })

  it('三个 span 连锁合并 (merge 分支)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 60, c: 29 }, size: { x: 30, y: 30 } })
    // c 宽度 32 → [29,61) 同时压住 a:[0,30) 与 b:[60,90) → 全部并入同一层
    r.nodes.get('c')!.size.x = 32
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0 })
  })

  it('反向边修正: 目标移到下一层 (新建层分支)', () => {
    const r = mk(['a', 'b', 'c'], [['a', 'b']], { x: { a: 100, b: 0, c: 10 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 1, b: 2, c: 0 })
  })

  it('同层链式反向边级联修正 + 空层移除', () => {
    const r = mk(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']], { x: { a: 0, b: 0, c: 0 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 2 })
  })

  it('目标移到已存在的层 (复用层分支)', () => {
    const r = mk(['a', 'b', 'c', 'd'], [['a', 'b']], { x: { a: 0, b: 0, c: 40, d: 80 } })
    processInteractiveLayering(r.g, MONITOR)
    // spans: [a,b] layer0, c layer1, d layer2; 修正 a->b: b 移到 layer1 (已存在)
    expectLayers(r, { a: 0, b: 1, c: 1, d: 2 })
  })

  it('宽度 0 节点 (外部 dummy) 保证最小宽度 + 自环忽略', () => {
    const r = mk(['a', 'b'], [['a', 'b']], { x: { a: 0, b: 1 }, size: { x: 0, y: 30 } })
    selfLoopOf(r.nodes.get('a')!)
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1 })
  })

  it('空图: 无层无 layerless', () => {
    const r = mk([], [])
    processInteractiveLayering(r.g, MONITOR)
    expect(r.g.getLayers().length).toBe(0)
    expect(r.g.getLayerlessNodes().length).toBe(0)
  })
})

// ── NetworkSimplexLayerer ──
describe('P2 变异杀灭: NetworkSimplexLayerer', () => {
  it('7 节点 DAG 精确层号 + 不变量', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'f'], ['a', 'g'], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'e']])
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 2, b: 1, c: 1, d: 0, e: 1, f: 3, g: 3 })
  })

  it('K3,3 精确层号 + 不变量', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n4'], ['n1', 'n5'], ['n1', 'n6'], ['n2', 'n4'], ['n2', 'n5'], ['n2', 'n6'], ['n3', 'n4'], ['n3', 'n5'], ['n3', 'n6']])
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 0, n3: 0, n4: 1, n5: 1, n6: 1 })
  })

  it('孤立单节点分量放层 0', () => {
    const r = mk(['solo'], [])
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectLayers(r, { solo: 0 })
  })

  it('多连通分量 (大分量优先 + previousLayering 平衡)', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['c', 'd'], ['d', 'e']])
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 0, d: 1, e: 2 })
  })

  it('两个等长分量', () => {
    const r = mk(['a', 'b', 'c', 'd'], [['a', 'b'], ['c', 'd']])
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 0, d: 1 })
  })

  it('PRIORITY_SHORTNESS 影响边权 → 层号不同', () => {
    const r = mk(['a', 'b', 'c'], [['a', 'c'], ['b', 'c']])
    for (const e of r.nodes.get('a')!.getOutgoingEdges()) e.setProperty(PRIORITY_SHORTNESS, 10)
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 1 })
  })

  it('THOROUGHNESS 影响迭代上限', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e'], [['a', 'b'], ['b', 'c'], ['a', 'd'], ['d', 'e']])
    r.g.setProperty(THOROUGHNESS, 3)
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectInvariants(r)
  })

  it('自环被 initialize 跳过 + monitor 任务名正确', () => {
    const r = mk(['a', 'b'], [['a', 'b']])
    selfLoopOf(r.nodes.get('a')!)
    const m = new RecordingMonitor()
    new NetworkSimplexLayerer().process(r.g, m)
    expectLayers(r, { a: 0, b: 1 })
    expect(m.tasks[0]).toBe('Network simplex layering')
    expect(m.tasks).toContain('Network simplex')
  })

  it('空图直接返回', () => {
    const r = mk([], [])
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expect(r.g.getLayers().length).toBe(0)
    expect(r.g.getLayerlessNodes().length).toBe(0)
  })
})

// ── BreadthFirstModelOrderLayerer ──
describe('P2 变异杀灭: BreadthFirstModelOrderLayerer', () => {
  it('声明序 ≠ 模型序时按模型序排序', () => {
    const r = mk(['n2', 'n1', 'n3'], [['n1', 'n2'], ['n2', 'n3']], { modelOrder: { n1: 0, n2: 1, n3: 2 } })
    new BreadthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 2 })
  })

  it('跨层入边 (源不在当前层) 不新建层', () => {
    const r = mk(['n1', 'n2', 'n3'], [['n1', 'n2'], ['n1', 'n3']], { modelOrder: { n1: 0, n2: 1, n3: 2 } })
    new BreadthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 1 })
  })

  it('label dummy 夹在中间: dummy 层 + 正常层', () => {
    const r = mk(['n1', 'lab', 'n2'], [['n1', 'lab'], ['lab', 'n2']], { modelOrder: { n1: 0, n2: 1 }, label: ['lab'] })
    new BreadthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, lab: 1, n2: 2 })
  })

  it('缺 MODEL_ORDER 抛错 (消息含要求说明)', () => {
    const r = mk(['a', 'b'], [['a', 'b']], { modelOrder: { a: 0 } })
    expect(() => new BreadthFirstModelOrderLayerer().process(r.g, MONITOR)).toThrow(/requires all real nodes to have a model order/)
  })

  it('空层 dummy 被删除 + 层 id 连续 + monitor 任务名', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5'], [['n1', 'n2'], ['n2', 'n3'], ['n4', 'n5']], { modelOrder: { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4 } })
    const m = new RecordingMonitor()
    new BreadthFirstModelOrderLayerer().process(r.g, m)
    expectLayers(r, { n1: 0, n2: 1, n3: 2, n4: 2, n5: 3 })
    expect(m.tasks[0]).toBe('Breadth first model order layering')
  })
})

// ── DepthFirstModelOrderLayerer ──
describe('P2 变异杀灭: DepthFirstModelOrderLayerer', () => {
  it('条带图 1->2->3, 2->4->5->6 精确层号', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n2'], ['n2', 'n3'], ['n2', 'n4'], ['n4', 'n5'], ['n5', 'n6']], { modelOrder: { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4, n6: 5 } })
    new DepthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 2, n4: 2, n5: 3, n6: 4 })
  })

  it('分支图 (两叉) 精确层号', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5'], [['n1', 'n2'], ['n2', 'n3'], ['n1', 'n4'], ['n4', 'n5']], { modelOrder: { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4 } })
    new DepthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 2, n4: 1, n5: 2 })
  })

  it('声明序 ≠ 模型序时按模型序排序', () => {
    const r = mk(['n2', 'n1', 'n3'], [['n1', 'n2'], ['n2', 'n3']], { modelOrder: { n1: 0, n2: 1, n3: 2 } })
    new DepthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 2 })
  })

  it('缺 MODEL_ORDER 抛错 (消息含要求说明)', () => {
    const r = mk(['a', 'b'], [['a', 'b']], { modelOrder: { a: 0 } })
    expect(() => new DepthFirstModelOrderLayerer().process(r.g, MONITOR)).toThrow(/requires all real nodes to have a model order/)
  })

  it('7 节点图 + 层 id 连续 + monitor 任务名', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'f'], ['a', 'g'], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'e']], { modelOrder: { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6 } })
    const m = new RecordingMonitor()
    new DepthFirstModelOrderLayerer().process(r.g, m)
    expectLayers(r, { a: 0, b: 1, c: 0, d: 0, e: 1, f: 1, g: 1 }, { forward: false })
    expect(m.tasks[0]).toBe('Depth first model order layering')
  })
})

// ── MinWidthLayerer ──
describe('P2 变异杀灭: MinWidthLayerer', () => {
  it('7 节点图精确层号 + 不变量', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'f'], ['a', 'g'], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'e']])
    new MinWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 2, b: 1, c: 1, d: 0, e: 3, f: 3, g: 3 })
  })

  it('K5,1 层宽最小化精确层号', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n6'], ['n2', 'n6'], ['n3', 'n6'], ['n4', 'n6'], ['n5', 'n6']])
    new MinWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 1, n2: 1, n3: 1, n4: 1, n5: 0, n6: 2 })
  })

  it('节点尺寸差异影响归一化宽度', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e'], [['a', 'd'], ['b', 'd'], ['c', 'd'], ['d', 'e']], { sizeY: { d: 10, e: 90 }, size: { y: 60 } })
    new MinWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0, d: 1, e: 2 })
  })

  it('自环被过滤 + monitor 任务名正确', () => {
    const r = mk(['a', 'b'], [['a', 'b']])
    selfLoopOf(r.nodes.get('a')!)
    const m = new RecordingMonitor()
    new MinWidthLayerer().process(r.g, m)
    expectLayers(r, { a: 0, b: 1 })
    expect(m.tasks[0]).toBe('MinWidth layering')
  })
})

// ── StretchWidthLayerer ──
describe('P2 变异杀灭: StretchWidthLayerer', () => {
  it('7 节点图精确层号 + 不变量', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'f'], ['a', 'g'], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'e']])
    new StretchWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 2, b: 1, c: 1, d: 0, e: 4, f: 4, g: 3 })
  })

  it('K3,3 精确层号', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n4'], ['n1', 'n5'], ['n1', 'n6'], ['n2', 'n4'], ['n2', 'n5'], ['n2', 'n6'], ['n3', 'n4'], ['n3', 'n5'], ['n3', 'n6']])
    new StretchWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 0, n3: 0, n4: 3, n5: 2, n6: 1 })
  })

  it('节点尺寸差异影响归一化宽度', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e'], [['a', 'd'], ['b', 'd'], ['c', 'd'], ['d', 'e']], { sizeY: { d: 10, e: 90 }, size: { y: 60 } })
    new StretchWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 2, b: 1, c: 0, d: 3, e: 4 })
  })

  it('空图直接返回 + monitor 任务名正确', () => {
    const r = mk([], [])
    const m = new RecordingMonitor()
    new StretchWidthLayerer().process(r.g, m)
    expect(r.g.getLayers().length).toBe(0)
    expect(m.tasks[0]).toBe('StretchWidth layering')
  })
})

// ── CoffmanGrahamLayerer ──
describe('P2 变异杀灭: CoffmanGrahamLayerer', () => {
  it('K3,3 bound=2 每层 ≤2 且精确层号', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n4'], ['n1', 'n5'], ['n1', 'n6'], ['n2', 'n4'], ['n2', 'n5'], ['n2', 'n6'], ['n3', 'n4'], ['n3', 'n5'], ['n3', 'n6']])
    r.g.setProperty(LAYERING_COFFMAN_GRAHAM_LAYER_BOUND, 2)
    new CoffmanGrahamLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 1, n4: 2, n5: 3, n6: 3 })
    for (const layer of r.g.getLayers()) expect(layer.getNodes().length).toBeLessThanOrEqual(2)
  })

  it('K3,3 bound=3 精确层号', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n4'], ['n1', 'n5'], ['n1', 'n6'], ['n2', 'n4'], ['n2', 'n5'], ['n2', 'n6'], ['n3', 'n4'], ['n3', 'n5'], ['n3', 'n6']])
    r.g.setProperty(LAYERING_COFFMAN_GRAHAM_LAYER_BOUND, 3)
    new CoffmanGrahamLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 0, n3: 0, n4: 1, n5: 1, n6: 1 })
  })

  it('7 节点 DAG 精确层号', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f', 'g'], [['a', 'f'], ['a', 'g'], ['b', 'a'], ['c', 'a'], ['d', 'b'], ['d', 'e']])
    new CoffmanGrahamLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 2, b: 1, c: 0, d: 0, e: 2, f: 3, g: 3 })
  })

  it('共享前驱菱形 bound=2 (前驱列表比较分支)', () => {
    const r = mk(['a', 'b', 'c', 'd', 'e', 'f'], [['a', 'c'], ['a', 'd'], ['b', 'c'], ['b', 'd'], ['c', 'e'], ['d', 'e'], ['e', 'f']])
    r.g.setProperty(LAYERING_COFFMAN_GRAHAM_LAYER_BOUND, 2)
    new CoffmanGrahamLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 1, d: 1, e: 2, f: 3 })
    for (const layer of r.g.getLayers()) expect(layer.getNodes().length).toBeLessThanOrEqual(2)
  })

  it('空图直接返回 + monitor 任务名正确', () => {
    const r = mk([], [])
    const m = new RecordingMonitor()
    new CoffmanGrahamLayerer().process(r.g, m)
    expect(r.g.getLayers().length).toBe(0)
    expect(m.tasks[0]).toBe('Coffman-Graham Layering')
  })
})

// ── NodePromotion ──
describe('P2 变异杀灭: NodePromotion', () => {
  function layered(edges: [string, string][], mo: Record<string, number>): GraphResult {
    const r = mk([...new Set(edges.flat())], edges, { modelOrder: mo })
    new LongestPathLayerer().process(r.g, MONITOR)
    return r
  }

  it('L2R: 模型序沿边递增 → 不提升, 层保持', () => {
    const r = layered([['n1', 'n2'], ['n1', 'n4'], ['n1', 'n4'], ['n2', 'n3'], ['n3', 'n5'], ['n4', 'n5']], { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4 })
    const m = new RecordingMonitor()
    r.g.setProperty(LAYERING_NODE_PROMOTION_STRATEGY, 'MODEL_ORDER_LEFT_TO_RIGHT')
    new NodePromotion().process(r.g, m)
    expectLayers(r, { n1: 0, n2: 1, n3: 2, n4: 2, n5: 3 })
    expect(m.tasks[0]).toBe('Node promotion heuristic')
  })

  it('R2L: 右侧节点提升到更左层', () => {
    const r = layered([['n1', 'n2'], ['n1', 'n3'], ['n2', 'n5'], ['n2', 'n5'], ['n3', 'n4'], ['n4', 'n5']], { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4 })
    r.g.setProperty(LAYERING_NODE_PROMOTION_STRATEGY, 'MODEL_ORDER_RIGHT_TO_LEFT')
    new NodePromotion().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 1, n4: 2, n5: 3 })
  })

  it('NONE 策略保持分层不变', () => {
    const r = layered([['a', 'b']], { a: 0, b: 1 })
    r.g.setProperty(LAYERING_NODE_PROMOTION_STRATEGY, 'NONE')
    new NodePromotion().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1 })
  })
})

// ── 第二轮: label dummy / 非 NORMAL 节点 / 负边界 / 深层图 ──

describe('P2 变异杀灭 (R2): DepthFirstModelOrderLayerer label dummy', () => {
  it('label dummy 夹在中间: dummy 层 + 正常层', () => {
    const r = mk(['n1', 'lab', 'n2'], [['n1', 'lab'], ['lab', 'n2']], { modelOrder: { n1: 0, n2: 1 }, label: ['lab'] })
    const m = new RecordingMonitor()
    new DepthFirstModelOrderLayerer().process(r.g, m)
    expectLayers(r, { n1: 0, lab: 1, n2: 2 })
    expect(m.tasks[0]).toBe('Depth first model order layering')
  })

  it('label 链 + 跨层边 (nodesToPlace / 深层路径)', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'lab1', 'lab2'], [
      ['n1', 'n2'], ['n2', 'lab1'], ['lab1', 'n3'], ['n3', 'lab2'], ['lab2', 'n4'], ['n4', 'n5'], ['n2', 'n5'],
    ], { modelOrder: { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4 }, label: ['lab1', 'lab2'] })
    new DepthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 3, n4: 5, n5: 6, lab1: 2, lab2: 4 })
  })

  it('深层跳边图 (跨层依赖)', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5'], [['n1', 'n2'], ['n2', 'n3'], ['n1', 'n4'], ['n4', 'n5'], ['n3', 'n5']], { modelOrder: { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4 } })
    new DepthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 2, n4: 1, n5: 3 })
  })

  it('三级合并图', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n1', 'n5'], ['n5', 'n6'], ['n6', 'n4']], { modelOrder: { n1: 0, n2: 1, n3: 2, n4: 3, n5: 4, n6: 5 } })
    new DepthFirstModelOrderLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 0, n2: 1, n3: 2, n4: 3, n5: 1, n6: 2 })
  })
})

describe('P2 变异杀灭 (R2): MinWidthLayerer 非 NORMAL / 负边界', () => {
  it('含 label dummy 节点 (非 NORMAL 分支)', () => {
    const r = mk(['a', 'b', 'lab'], [['a', 'b'], ['lab', 'b']], { label: ['lab'], sizeY: { b: 10 } })
    new MinWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, lab: 0 })
  })

  it('负 upperBoundOnWidth / compensator 走默认', () => {
    const r = mk(['a', 'b', 'c'], [['a', 'c'], ['b', 'c']])
    r.g.setProperty(LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH, -1)
    r.g.setProperty(LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR, -1)
    new MinWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 1, b: 0, c: 2 })
  })
})

describe('P2 变异杀灭 (R2): StretchWidthLayerer 非 NORMAL 节点', () => {
  it('含 label dummy 节点 (非 NORMAL 分支 + avereageNodeSize)', () => {
    const r = mk(['a', 'b', 'lab'], [['a', 'b'], ['lab', 'b']], { label: ['lab'], sizeY: { b: 10 } })
    new StretchWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 1, b: 2, lab: 0 })
  })
})

describe('P2 变异杀灭 (R2): NetworkSimplexLayerer 大图 + THOROUGHNESS', () => {
  it('13 节点多支图 THOROUGHNESS=4 (迭代上限路径)', () => {
    const names = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm']
    const edges: [string, string][] = []
    for (let i = 0; i < 8; i++) edges.push([names[i]!, names[i + 1]!])
    for (let i = 0; i < 6; i++) edges.push([names[i]!, names[i + 4]!])
    const r = mk(names, edges)
    r.g.setProperty(THOROUGHNESS, 4)
    new NetworkSimplexLayerer().process(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 2, d: 3, e: 4, f: 5, g: 6, h: 7, i: 8, j: 6, k: 0, l: 0, m: 0 })
  })
})

describe('P2 变异杀灭 (R2): NodePromotion label dummy 穿透', () => {
  /** 手工分层图: 层0=[a], 层1=[L], 层2=[d], 层3=[b]; 边 a→L, L→b. */
  function layeredWithLabel(): GraphResult {
    const g = new LGraph()
    const a = new LNode(g); a.size = { x: 30, y: 30 }; a.id = 0
    const L = new LNode(g); L.size = { x: 30, y: 30 }; L.id = 1; L.setType(NodeType.LABEL)
    const d = new LNode(g); d.size = { x: 30, y: 30 }; d.id = 2
    const b = new LNode(g); b.size = { x: 30, y: 30 }; b.id = 3
    const nodes = new Map([['a', a], ['L', L], ['d', d], ['b', b]])
    a.setProperty(MODEL_ORDER, 0)
    b.setProperty(MODEL_ORDER, 1)
    let p = new LPort(); p.setNode(a)
    let p2 = new LPort(); p2.setNode(L)
    let e = new LEdge(); e.setSource(p); e.setTarget(p2)
    void e
    p = new LPort(); p.setNode(L)
    p2 = new LPort(); p2.setNode(b)
    e = new LEdge(); e.setSource(p); e.setTarget(p2)
    void e
    const layers = [new Layer(g), new Layer(g), new Layer(g), new Layer(g)]
    for (const [i, layer] of layers.entries()) { layer.id = i; g.getLayers().push(layer) }
    a.setLayer(layers[0]!); L.setLayer(layers[1]!); d.setLayer(layers[2]!); b.setLayer(layers[3]!)
    // 模拟分层已完成: layerless 列表已清空 (NodePromotion 是分层后置处理器).
    g.getLayerlessNodes().length = 0
    return { g, nodes }
  }

  it('L2R 跨 label dummy 层提升 (>2 层才允许)', () => {
    const r = layeredWithLabel()
    const m = new RecordingMonitor()
    r.g.setProperty(LAYERING_NODE_PROMOTION_STRATEGY, 'MODEL_ORDER_LEFT_TO_RIGHT')
    new NodePromotion().process(r.g, m)
    expectLayers(r, { a: 0, L: 1, d: 1, b: 2 })
    expect(m.tasks[0]).toBe('Node promotion heuristic')
  })
})

// ── 第三轮: Interactive span 几何边界 / MinWidth 负边界+自环 ──

describe('P2 变异杀灭 (R3): InteractiveLayerer span 几何', () => {
  it('宽度 0 节点同 x 合并 (end=start+1 保底)', () => {
    const r = mk(['a', 'b'], [], { x: { a: 0, b: 0 }, size: { x: 0, y: 30 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0 })
  })

  it('节点左扩: span.start 取 min (合并后左边界)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 5, c: 2 }, size: { x: 30, y: 30 } })
    r.nodes.get('b')!.size.x = 20
    r.nodes.get('c')!.size.x = 1
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0 })
  })

  it('节点右扩: span.end 取 max (合并后右边界)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 25, c: 35 }, size: { x: 30, y: 30 } })
    r.nodes.get('b')!.size.x = 35
    r.nodes.get('c')!.size.x = 5
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0 })
  })

  it('三 span 合并 + 第 4 个 span 压到扩展后的右边界', () => {
    const r = mk(['a', 'b', 'c', 'd'], [], { x: { a: 0, b: 60, c: 29, d: 85 }, size: { x: 30, y: 30 } })
    r.nodes.get('c')!.size.x = 32
    r.nodes.get('d')!.size.x = 10
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0, d: 0 })
  })

  it('触碰边界 (start === end) 不合并 → 独立层', () => {
    const r = mk(['a', 'c', 'b'], [], { x: { a: 0, c: 40, b: 30 }, size: { x: 30, y: 30 } })
    r.nodes.get('b')!.size.x = 10
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 2 })
  })

  it('简单触碰 (end === start) 独立层', () => {
    const r = mk(['a', 'b'], [], { x: { a: 0, b: 30 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1 })
  })

  it('反向边致空层 0 被移除 (层重编号)', () => {
    const r = mk(['a', 'b'], [['a', 'b']], { x: { a: 40, b: 0 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1 })
  })
})

describe('P2 变异杀灭 (R3): MinWidthLayerer 负边界 + 自环', () => {
  it('负 upperBoundOnWidth/compensator → 全候选最窄 (K5,1)', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n6'], ['n2', 'n6'], ['n3', 'n6'], ['n4', 'n6'], ['n5', 'n6']])
    r.g.setProperty(LAYERING_MIN_WIDTH_UPPER_BOUND_ON_WIDTH, -1)
    r.g.setProperty(LAYERING_MIN_WIDTH_UPPER_LAYER_ESTIMATION_SCALING_FACTOR, -1)
    new MinWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 2, n2: 1, n3: 1, n4: 0, n5: 0, n6: 3 })
  })

  it('星形图带自环 (isSelfLoop 过滤)', () => {
    const r = mk(['n1', 'n2', 'n3', 'n4', 'n5', 'n6'], [['n1', 'n6'], ['n2', 'n6'], ['n3', 'n6'], ['n4', 'n6'], ['n5', 'n6']])
    selfLoopOf(r.nodes.get('n6')!)
    new MinWidthLayerer().process(r.g, MONITOR)
    expectLayers(r, { n1: 1, n2: 1, n3: 1, n4: 1, n5: 0, n6: 2 })
  })
})
