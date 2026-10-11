/**
 * InteractiveLayererTest — span 合并与新节点放置语义验收测试.
 *
 * SSOT: ELK Java 0.12.0 jar (scripts/elk-java-debug/InteractiveOracle.java 直接调用
 *   InteractiveLayerer.process 对合成图输出层号). Java 仓库无 InteractiveLayerer 专属
 *   JUnit (唯一相关 BasicLayerAssignmentTest.java 已移植为 BasicLayerAssignmentTest.test.ts,
 *   其只断不变量, 不覆盖 span 几何) — 本文件为自建触发语料的 oracle 验收测试.
 *
 * 每个用例: elk.json 合成图 → InteractiveOracle (jar) 输出 name:listIndex,
 *   TS 侧对等价图直接调用 processInteractiveLayering, 断言精确层号 + 分层不变量
 *   (无 layerless / 无空层 / 边前向).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import type { IElkProgressMonitor } from '../../src/layered-layout-provider.js'
import { processInteractiveLayering } from '../../src/p2layers/interactive-layerer.js'

class NullMonitor implements IElkProgressMonitor {
  begin(): void {}
  done(): void {}
}

const MONITOR = new NullMonitor()

interface GraphResult {
  g: LGraph
  nodes: Map<string, LNode>
}

/** 建图: 节点按 names 顺序加入 layerless (与 oracle 输入 children 顺序一致), edges = [src, tgt][]. */
function mk(
  names: string[],
  edges: [string, string][],
  opts: {
    x?: Record<string, number>
    sizeX?: Record<string, number>
  } = {},
): GraphResult {
  const g = new LGraph()
  const nodes = new Map<string, LNode>()
  for (const name of names) {
    const n = new LNode(g)
    n.size.x = opts.sizeX?.[name] ?? 30
    n.size.y = 30
    n.position.x = opts.x?.[name] ?? 0
    n.position.y = 0
    nodes.set(name, n)
  }
  for (const [s, t] of edges) {
    const sp = new LPort()
    sp.setNode(nodes.get(s)!)
    const tp = new LPort()
    tp.setNode(nodes.get(t)!)
    const e = new LEdge()
    e.setSource(sp)
    e.setTarget(tp)
    void e
  }
  return { g, nodes }
}

function layerOf(n: LNode): number {
  return n.getLayer()!.getIndex()
}

/** 断言精确层号 (oracle 层号) + 不变量. */
function expectLayers(r: GraphResult, expected: Record<string, number>): void {
  for (const [name, layer] of Object.entries(expected)) {
    expect(layerOf(r.nodes.get(name)!), `${name} 层号`).toBe(layer)
  }
  expect(r.g.getLayerlessNodes().length, 'layerless 应为空').toBe(0)
  for (const layer of r.g.getLayers()) {
    expect(layer.getNodes().length, `层 ${layer.getIndex()} 不应为空`).toBeGreaterThan(0)
  }
  for (const layer of r.g.getLayers()) {
    for (const node of layer.getNodes()) {
      for (const edge of node.getOutgoingEdges()) {
        const src = edge.getSource()?.getNode()
        const tgt = edge.getTarget()?.getNode()
        if (!src || !tgt || src === tgt) continue
        if (src.getLayer() === null || tgt.getLayer() === null) continue
        expect(
          tgt.getLayer()!.getIndex(),
          `边 ${src.id}->${tgt.id} 应指向更后层`,
        ).toBeGreaterThan(src.getLayer()!.getIndex())
      }
    }
  }
}

describe('InteractiveLayerer (ELK Java 0.12.0 oracle): span 合并与新节点放置', () => {
  it('互不重叠节点按 x 排序成独立层 (oracle 01)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 40, c:100 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 2 })
  })

  it('重叠节点合并到同一 span (oracle 02)', () => {
    const r = mk(['a', 'b'], [], { sizeX: { a: 60, b: 60 }, x: { a: 0, b: 40 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0 })
  })

  it('三 span 连锁合并 (中间节点压住两侧) (oracle 03)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 60, c: 29 }, sizeX: { a: 30, b: 30, c: 32 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0 })
  })

  it('反向边修正: 目标移到新建层, 原层保留 (oracle 04)', () => {
    const r = mk(['a', 'b', 'c'], [['a', 'b']], { x: { a: 100, b: 0, c: 10 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 1, b: 2, c: 0 })
  })

  it('同层链式反向边级联修正 (oracle 05)', () => {
    const r = mk(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']], { x: { a: 0, b: 0, c: 0 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 2 })
  })

  it('目标移到已存在的层 (复用层分支) (oracle 06)', () => {
    const r = mk(['a', 'b', 'c', 'd'], [['a', 'b']], { x: { a: 0, b: 0, c: 40, d: 80 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 1, d: 2 })
  })

  it('宽度 0 节点保底最小宽度, 触碰不合并 (oracle 07)', () => {
    const r = mk(['a', 'b'], [['a', 'b']], { x: { a: 0, b: 1 }, sizeX: { a: 0, b: 0 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1 })
  })

  it('宽度 0 节点同 x 合并 (oracle 08)', () => {
    const r = mk(['a', 'b'], [], { x: { a: 0, b: 0 }, sizeX: { a: 0, b: 0 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0 })
  })

  it('触碰边界 (end === start) 不合并, 新 span 插入中间 (oracle 09)', () => {
    const r = mk(['a', 'c', 'b'], [], { x: { a: 0, c: 40, b: 30 }, sizeX: { a: 30, c: 30, b: 10 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 2 })
  })

  it('反向边致空层移除, 层重编号 (oracle 10)', () => {
    const r = mk(['a', 'b'], [['a', 'b']], { x: { a: 40, b: 0 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1 })
  })

  it('乱序输入: 新 span 插入列表头部/中部/尾部 (oracle 11)', () => {
    const r = mk(['c', 'a', 'b'], [], { x: { c: 50, a: 0, b: 100 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, c: 1, b: 2 })
  })

  it('后插节点与左右两 span 均重叠 → 连锁合并 (oracle 12)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 40, c: 20 }, sizeX: { a: 30, b: 30, c: 25 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0 })
  })

  it('菱形: 两个目标先建层后复用 (新建层分支 + 复用层分支) (oracle 13)', () => {
    const r = mk(['a', 'b', 'c'], [['a', 'b'], ['a', 'c']], { x: { a: 100, b: 0, c: 10 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1, c: 1 })
  })

  it('自环忽略 (oracle 14)', () => {
    const r = mk(['a', 'b'], [['a', 'a'], ['a', 'b']], { x: { a: 0, b: 40 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 1 })
  })

  it('节点左扩: span.start 取 min (oracle 15)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 5, c: 2 }, sizeX: { a: 30, b: 20, c: 1 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0 })
  })

  it('节点右扩: span.end 取 max (oracle 16)', () => {
    const r = mk(['a', 'b', 'c'], [], { x: { a: 0, b: 25, c: 35 }, sizeX: { a: 30, b: 35, c: 5 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0 })
  })

  it('四 span 连锁合并 (oracle 17)', () => {
    const r = mk(['a', 'b', 'c', 'd'], [], { x: { a: 0, b: 60, c: 29, d: 85 }, sizeX: { a: 30, b: 30, c: 32, d: 10 } })
    processInteractiveLayering(r.g, MONITOR)
    expectLayers(r, { a: 0, b: 0, c: 0, d: 0 })
  })

  it('空图: 无层无 layerless', () => {
    const r = mk([], [])
    processInteractiveLayering(r.g, MONITOR)
    expect(r.g.getLayers().length).toBe(0)
    expect(r.g.getLayerlessNodes().length).toBe(0)
  })
})
