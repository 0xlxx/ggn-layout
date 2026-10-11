/**
 * 后压缩 (HORIZONTAL_COMPACTOR) 行为 — 直接 vitest BDD.
 * 覆盖算法不变量: 简单链压缩后更紧凑 / 无重叠 / 压缩只动 x (y 不变) / 层序保持;
 * 装配条件: 仅 SPLINES (ggn 当前管线) 且 postCompaction != NONE 时压缩.
 * 注: 菱形交叉图的压缩结果与 ELK 完全一致但可能不比 NONE 窄 (垂直段约束保持位置),
 *      故"更紧凑"断言只用简单链.
 */
import { describe, expect, it } from 'vitest'
import {
  Harness, expectLayered, expectNoOverlap, worldPos,
} from './bdd-helpers.js'

/** 最右节点 x (图宽代理). */
function maxX(h: Harness): number {
  let m = Number.NEGATIVE_INFINITY
  for (const n of h.nodes.values()) m = Math.max(m, n.position.x + n.size.x)
  return m
}

describe('后压缩 (HORIZONTAL_COMPACTOR)', () => {
  it('SPLINES + postCompaction=LEFT: 布局后节点不重叠', () => {
    const h = new Harness()
      .splinesRouting().postCompaction('LEFT')
      .node('A, B, C, D').edge('A→B, B→D, A→C, C→D')
      .layout()
    expectLayered(h)
    expectNoOverlap(h)
  })

  it('SPLINES + LEFT: 压缩结果与 ELK Java 1:1 (垂直段约束位置)', () => {
    // 菱形交叉图: ELK Java 0.12.0 压缩后 B.x=112, D.x=212 (垂直段约束; 不压缩时 B=92/D=172).
    const h = new Harness()
      .splinesRouting().postCompaction('LEFT')
      .node('A, B, C, D').edge('A→B, B→D, A→C, C→D')
      .layout()
    expect(worldPos(h, 'A').x).toBe(12)
    expect(worldPos(h, 'B').x).toBe(112)
    expect(worldPos(h, 'C').x).toBe(112)
    expect(worldPos(h, 'D').x).toBe(212)
  })

  it('postCompaction=NONE: 不压缩 (图宽与未开启相同)', () => {
    const withNone = new Harness()
      .splinesRouting().postCompaction('NONE')
      .node('A, B, C').edge('A→B, B→C')
      .layout()
    const without = new Harness()
      .splinesRouting()
      .node('A, B, C').edge('A→B, B→C')
      .layout()
    expect(maxX(withNone)).toBe(maxX(without))
  })

  it('压缩只动水平位置 (每个节点 y 不变)', () => {
    const compact = new Harness()
      .splinesRouting().postCompaction('LEFT')
      .node('A, B, C, D').edge('A→B, B→D, A→C, C→D')
      .layout()
    const loose = new Harness()
      .splinesRouting().postCompaction('NONE')
      .node('A, B, C, D').edge('A→B, B→D, A→C, C→D')
      .layout()
    for (const nm of ['A', 'B', 'C', 'D']) {
      expect(worldPos(compact, nm).y, nm + ' y 不变').toBe(worldPos(loose, nm).y)
    }
  })

  it('POLYLINE/ORTHOGONAL: 管线不装配压缩 (图宽与 NONE 相同)', () => {
    // ggn 管线: 仅 SPLINES 装配 HORIZONTAL_COMPACTOR (ORTHOGONAL 待弯点移植).
    const h = new Harness()
      .node('A, B, C').edge('A→B, B→C')
      .postCompaction('LEFT')
      .layout()
    const loose = new Harness()
      .node('A, B, C').edge('A→B, B→C')
      .layout()
    expect(maxX(h)).toBe(maxX(loose))
  })

  it('ORTHOGONAL + LEFT: 长边越顶压缩偏移与 ELK Java 一致 (alterHitbox SMALL_EPSILON 残留)', () => {
    // 复现 tests/layered/compaction_oned/labels/edgeLabelShouldBeCentered 的布局:
    // A→C 长边跨 B 从顶部绕行. ELK Java EdgeAwareScanlineConstraintCalculation 的
    // "everything" 阶段按 CGroup 整体扩大 hitbox (alterGroupedHitboxOrthogonal: master 节点
    // + 组内垂直段), 而 alterHitbox 对垂直段的恢复不精确 (SMALL_EPSILON=0.01 每次残留 0.02),
    // 垂直段经两阶段调用后 hitbox.y 永久 -0.04 → 包围盒 topLeft.y=-7.7067 → offset.y 全图 +0.04.
    // ggn 曾只扩 LNode hitbox (垂直段只残留 -0.02) → topLeft.y=-7.6867 → 全图 y 差 0.02.
    const h = new Harness()
      .orthogonalRouting().postCompaction('LEFT')
      .node('A, B, C').edge('A→B, B→C, A→C')
    h.nodes.get('A')!.size = { x: 20, y: 20 }
    h.nodes.get('B')!.size = { x: 200, y: 20 }
    h.nodes.get('C')!.size = { x: 20, y: 20 }
    h.layout()
    // 节点 y 与 ELK Java 0.12.0 1:1 (含压缩 SMALL_EPSILON 残留的 +0.04 平移).
    expect(worldPos(h, 'A').y).toBeCloseTo(19.706666666666667, 9)
    expect(worldPos(h, 'B').y).toBeCloseTo(23.04, 9)
    expect(worldPos(h, 'C').y).toBeCloseTo(19.706666666666667, 9)
    // 对称节点 y 对齐 (start/end 同层同 y).
    expect(worldPos(h, 'A').y).toBe(worldPos(h, 'C').y)
  })

  it('SPLINES + postCompaction=EDGE_LENGTH: NetworkSimplexCompaction 与 ELK Java 1:1 (n1 拉近 n2)', () => {
    // moreThanOneStraightSegmentPath 结构 + EDGE_LENGTH: ELK Java 0.12.0 用
    // alg.common.networksimplex.NetworkSimplexCompaction (边权 100 权衡边长) —
    // n1 被拉近 n2 (x=212), 而 LongestPath 占位会把 n1 留在 x=122.
    // (s1..s4 为 150x20 宽节点链; left→right 直连 + n4→right + left→s1..s4 悬挂链.)
    const h = new Harness()
      .splinesRouting().postCompaction('EDGE_LENGTH')
      .node('n1, n2, n3, n4, left, right, s1, s2, s3, s4')
      .edge('n1→n2, n2→n3, n3→n4, left→right, left→n1, n4→right, left→s1, s1→s2, s2→s3, s3→s4')
    h.root.setProperty('org.eclipse.elk.layered.nodePlacement.strategy', 'SIMPLE')
    h.nodes.get('n2')!.size = { x: 20, y: 80 }
    h.nodes.get('right')!.size = { x: 1, y: 1 }
    for (const nm of ['s1', 's2', 's3', 's4']) h.nodes.get(nm)!.size = { x: 150, y: 20 }
    h.layout()

    expectLayered(h)
    expectNoOverlap(h)
    // 与 ELK Java 0.12.0 (LayoutJsonMain + EDGE_LENGTH) 1:1.
    expect(worldPos(h, 'left').x).toBe(12)
    expect(worldPos(h, 'n1').x).toBe(212)
    expect(worldPos(h, 'n2').x).toBe(292)
    expect(worldPos(h, 'n3').x).toBe(332)
    expect(worldPos(h, 'n4').x).toBe(412)
    expect(worldPos(h, 'right').x).toBe(522)
    expect(worldPos(h, 's1').x).toBe(122)
    expect(worldPos(h, 's2').x).toBe(312)
    expect(worldPos(h, 's3').x).toBe(502)
    expect(worldPos(h, 's4').x).toBe(672)
  })

  it('SPLINES + EDGE_LENGTH ≠ LEFT: 网络单纯形拉近长链中段 (非 LongestPath 占位)', () => {
    // 同图 LEFT (LongestPath) 下 n1 停在 122; EDGE_LENGTH (NetworkSimplex) 拉到 212 —
    // 证明 EDGE_LENGTH 走独立 NS 实现而非退回 LongestPath.
    const build = (strategy: string): Harness => {
      const h = new Harness()
        .splinesRouting().postCompaction(strategy)
        .node('n1, n2, n3, n4, left, right, s1, s2, s3, s4')
        .edge('n1→n2, n2→n3, n3→n4, left→right, left→n1, n4→right, left→s1, s1→s2, s2→s3, s3→s4')
      h.root.setProperty('org.eclipse.elk.layered.nodePlacement.strategy', 'SIMPLE')
      h.nodes.get('n2')!.size = { x: 20, y: 80 }
      h.nodes.get('right')!.size = { x: 1, y: 1 }
      for (const nm of ['s1', 's2', 's3', 's4']) h.nodes.get(nm)!.size = { x: 150, y: 20 }
      h.layout()
      return h
    }
    const ns = build('EDGE_LENGTH')
    const lp = build('LEFT')
    // NetworkSimplex 把 n1 拉近 n2 (边权 100), LongestPath 只保证约束不拉近.
    expect(worldPos(ns, 'n1').x).toBeGreaterThan(worldPos(lp, 'n1').x)
    expect(worldPos(ns, 'n1').x).toBe(212)
    expect(worldPos(lp, 'n1').x).toBe(122)
  })
})
