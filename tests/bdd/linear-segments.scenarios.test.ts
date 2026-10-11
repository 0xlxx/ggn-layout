/**
 * LinearSegmentsNodePlacer 行为 — 直接 vitest BDD.
 *
 * 语义基准 = ELK Java 0.12.0 (对 LINEAR_SEGMENTS 策略的 P4 阶段 LGraph 快照实证,
 * ε=1e-3; 与 ggn placer 逐节点 y 全等, 见 M5 验证):
 *  - 线性段 = 单个普通节点 / 一条长边的全部 dummy; 段内所有节点同 y (长边拉直);
 *  - 无重叠: 层内节点按 y 递增堆叠, 间距经 Spacings 解析;
 *  - 层高 = 段占位最大 y + 高 + margin。
 *
 * R 簇已注册 LINEAR_SEGMENTS 策略 (provider P4 分发 → LinearSegmentsNodePlacer),
 * 场景在 P4 模块执行后 (afterModule('LinearSegmentsNodePlacer')) 捕获快照断言。
 */
import { describe, it, expect } from 'vitest'
import { Harness } from './bdd-helpers.js'
import { LayeredLayoutProvider } from '../../src/index.js'
import { collectLinearSegments } from '../../src/p4nodes/linear-segments-node-placer.js'
import { NodeType } from '../../src/graph/enums.js'
import { NODE_PLACEMENT_STRATEGY, NodePlacementStrategy } from '../../src/options/layered-options.js'
import type { LNode } from '../../src/index.js'

interface P4Snapshot {
  rows: { node: LNode; layer: number; y: number }[]
  layerHeights: number[]
  segments: LNode[][]
}

/** 跑完整布局 (provider P4 分发 LinearSegmentsNodePlacer), 捕获放置后快照 (P4 y 值). */
function layoutLinearSegments(h: Harness): P4Snapshot {
  h.root.setProperty(NODE_PLACEMENT_STRATEGY, NodePlacementStrategy.LINEAR_SEGMENTS)
  const provider = new LayeredLayoutProvider()
  const snap: P4Snapshot = { rows: [], layerHeights: [], segments: [] }
  provider.setHooks({
    afterModule(name, g) {
      if (name !== 'LinearSegmentsNodePlacer' || g !== h.root) return
      snap.rows = []
      snap.layerHeights = []
      for (const [li, layer] of g.getLayers().entries()) {
        snap.layerHeights[li] = layer.getSize().y
        for (const node of layer.getNodes()) snap.rows.push({ node, layer: li, y: node.position.y })
      }
      snap.segments = collectLinearSegments(g)
    },
  })
  provider.layout(h.root)
  return snap
}

/** 按层分组快照 (y 取自 P4 快照, 布局后续 BK 会覆盖真实位置). */
function rowsByLayer(snap: P4Snapshot): Map<number, { node: LNode; y: number }[]> {
  const byLayer = new Map<number, { node: LNode; y: number }[]>()
  for (const r of snap.rows) {
    const list = byLayer.get(r.layer) ?? []
    list.push({ node: r.node, y: r.y })
    byLayer.set(r.layer, list)
  }
  return byLayer
}

function yOf(snap: P4Snapshot, name: string, h: Harness): number {
  const n = h.nodes.get(name)!
  return snap.rows.find(r => r.node === n)!.y
}

/** 链式图: n1→n2→n3→n4 + 跨层长边 n1→n4 (L1/L2 各一个 LONG_EDGE dummy, 同属一段). */
function chainGraph(): Harness {
  return new Harness().node('n1', 'n2', 'n3', 'n4').edge('n1→n2, n2→n3, n3→n4, n1→n4')
}

describe('linear segments 节点放置行为', () => {
  it('长边 dummy 段内节点竖直对齐 (同 y), 长边拉直', () => {
    const h = chainGraph()
    const snap = layoutLinearSegments(h)
    const longEdgeSegments = snap.segments.filter(s => s.some(n => n.getType() === NodeType.LONG_EDGE) && s.length > 1)
    expect(longEdgeSegments.length).toBeGreaterThanOrEqual(1)
    for (const seg of longEdgeSegments) {
      const y = seg[0]!.position.y
      for (const n of seg) expect(n.position.y, '段内节点应同 y').toBeCloseTo(y, 6)
    }
  })

  it('链式图: 跨层长边 dummy 同 y, 与 Java jar P4 一致 (dummy=12.846)', () => {
    const h = chainGraph()
    const snap = layoutLinearSegments(h)
    const dummies = snap.rows.filter(r => r.node.getType() === NodeType.LONG_EDGE)
    expect(dummies.length).toBe(2)
    // ELK Java 0.12.0 LSP4Probe (LINEAR_SEGMENTS): L1/L2 dummy y=12.8461524165625.
    for (const d of dummies) expect(d.y).toBeCloseTo(12.8462, 3)
  })

  it('链式图: 普通节点 y 与 Java jar P4 一致 (n1/n4=2.846, n2/n3=23.846)', () => {
    const h = chainGraph()
    const snap = layoutLinearSegments(h)
    // ELK Java 0.12.0 LSP4Probe: L0 n1 y=2.846, L1 n2 y=23.846, L2 n3 y=23.846, L3 n4 y=2.846.
    expect(yOf(snap, 'n1', h)).toBeCloseTo(2.8462, 3)
    expect(yOf(snap, 'n4', h)).toBeCloseTo(2.8462, 3)
    expect(yOf(snap, 'n2', h)).toBeCloseTo(23.8462, 3)
    expect(yOf(snap, 'n3', h)).toBeCloseTo(23.8462, 3)
  })

  it('层内节点无重叠: 层内 y 严格递增', () => {
    const h = chainGraph()
    const snap = layoutLinearSegments(h)
    for (const [li, rows] of rowsByLayer(snap)) {
      let lastBottomY = -Infinity
      for (const { node, y } of rows) {
        expect(y, `L${li} y 应严格递增`).toBeGreaterThan(lastBottomY)
        lastBottomY = y + node.size.y
      }
    }
    // 注: 平衡/后处理会整体平移段, P4 层高 (createUnbalancedPlacement 值) 可能小于平衡后
    // 节点底 — Java 语义如此, 层高由 P5 LayerSizeAndGraphHeightCalculator 重算 (见 jar P4 快照).
  })

  it('层高与 Java jar P4 一致 (链式图 40/51/51/40)', () => {
    const h = chainGraph()
    const snap = layoutLinearSegments(h)
    // ELK Java 0.12.0 LSP4Probe: layer sizeY = 40 / 51 / 51 / 40.
    expect(snap.layerHeights).toEqual([40, 51, 51, 40])
  })

  it('多条长边 (单连通图): 各自 dummy 段独立, 层内无重叠', () => {
    const h = new Harness()
      .node('a1', 'a2', 'a3', 'b1', 'b2', 'b3')
      .edge('a1→a2, a2→a3, a1→a3, a3→b1, b1→b2, b2→b3, b1→b3')
    const snap = layoutLinearSegments(h)
    // 两条跨层长边 (a1→a3, b1→b3) 各产生一个 LONG_EDGE dummy 段.
    const longEdgeSegments = snap.segments.filter(s => s.some(n => n.getType() === NodeType.LONG_EDGE))
    expect(longEdgeSegments.length).toBeGreaterThanOrEqual(2)
    for (const seg of longEdgeSegments) {
      const y = seg[0]!.position.y
      for (const n of seg) expect(n.position.y, '段内节点应同 y').toBeCloseTo(y, 6)
    }
    // 层内无重叠 (P4 快照).
    for (const [li, rows] of rowsByLayer(snap)) {
      let lastBottomY = -Infinity
      for (const { node, y } of rows) {
        expect(y, `L${li} y 递增`).toBeGreaterThan(lastBottomY)
        lastBottomY = y + node.size.y
      }
    }
  })
})
