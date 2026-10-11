/**
 * radial 布局算法 (ELK alg.radial 0.12.0 移植) — 直接 vitest BDD.
 *
 * 被测: src/radial/ (RadialLayoutProvider + EadesRadial P1 + 中间处理器 + 直线路由 P2).
 * 对照权威: ELK 0.12.0 (verify-elkg-java-layout 对 930/931/932 触发模型全等).
 * 语义不变量 (与 Java 一致):
 *   - 树以根为圆心, 同层节点在同一半径, 根中心位于圆心;
 *   - 重叠消除后节点两两不重叠 (spacing 20);
 *   - 容器尺寸 = 内容范围 + padding 12 (默认 CoreOptions.PADDING);
 *   - 边直线路由: sections[0] 端点在节点边界内;
 *   - 非树 (无根) 抛错 (Java IllegalArgumentException 同).
 */
import { describe, it, expect } from 'vitest'
import { radialLayout } from '../../src/radial/radial-layout.js'
import { layoutElkJson } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)
import type { ElkNode } from '../../src/api/elk-json.js'

function node(id: string, w = 30, h = 30): ElkNode {
  return { id, width: w, height: h }
}

/** 建树: root 无入边, children 为后续节点, edges 挂容器 (树边). */
function buildTree(container: ElkNode, edges: [string, string][]): ElkNode {
  container.edges = edges.map(([s, t], i) => ({ id: 'e' + i, sources: [s], targets: [t] }))
  return container
}

/** 断言所有子节点两两不重叠 (轴对齐矩形). */
function expectNoOverlap(children: ElkNode[]): void {
  for (let i = 0; i < children.length; i++) {
    for (let j = i + 1; j < children.length; j++) {
      const a = children[i]!
      const b = children[j]!
      const ax = a.x ?? 0, ay = a.y ?? 0, aw = a.width ?? 0, ah = a.height ?? 0
      const bx = b.x ?? 0, by = b.y ?? 0, bw = b.width ?? 0, bh = b.height ?? 0
      const overlapX = ax < bx + bw && bx < ax + aw
      const overlapY = ay < by + bh && by < ay + ah
      expect(overlapX && overlapY, `${a.id} 与 ${b.id} 重叠`).toBe(false)
    }
  }
}

function centerOf(n: ElkNode): { x: number; y: number } {
  return { x: (n.x ?? 0) + (n.width ?? 0) / 2, y: (n.y ?? 0) + (n.height ?? 0) / 2 }
}

/** 断言 p 与 q 距离 ≈ d (相对容差 1e-6). */
function expectDistance(p: { x: number; y: number }, q: { x: number; y: number }, d: number): void {
  const dist = Math.hypot(p.x - q.x, p.y - q.y)
  expect(Math.abs(dist - d)).toBeLessThanOrEqual(1e-6 * Math.max(1, d))
}

describe('radialLayout (ELK RadialLayoutProvider)', () => {
  it('单层树: 根在圆心, 叶子在同一半径, 无重叠, 容器尺寸 = 范围 + padding 12', () => {
    // 与 jar oracle 930 (radius = max 直径 = sqrt(50²+50²) = 70.7107) 同构
    const graph = node('g', 0, 0)
    graph.children = [
      node('r', 40, 40),
      node('c1', 30, 30),
      node('c2', 50, 50),
      node('c3', 30, 20),
    ]
    buildTree(graph, [['r', 'c1'], ['r', 'c2'], ['r', 'c3']])
    radialLayout(graph)

    const root = graph.children[0]!
    const leaves = graph.children.slice(1)
    // 根位于圆心 (0,0) + 平移, 无重叠
    expectNoOverlap(graph.children!)
    // 叶子在同一半径 (radius = 70.7107 + 重叠消除外扩量)
    const d1 = Math.hypot(centerOf(leaves[0]!).x - centerOf(root).x, centerOf(leaves[0]!).y - centerOf(root).y)
    const d2 = Math.hypot(centerOf(leaves[1]!).x - centerOf(root).x, centerOf(leaves[1]!).y - centerOf(root).y)
    const d3 = Math.hypot(centerOf(leaves[2]!).x - centerOf(root).x, centerOf(leaves[2]!).y - centerOf(root).y)
    expectDistance({ x: d1, y: 0 }, { x: d2, y: 0 }, 0)
    expectDistance({ x: d1, y: 0 }, { x: d3, y: 0 }, 0)
    // 半径 ≥ 初始 radius (重叠消除只外扩; 无重叠时恰好等于初始 radius)
    expect(d1).toBeGreaterThanOrEqual(70.7107 - 1e-3)
    // 容器包围所有子节点 + padding 12
    const minX = Math.min(...graph.children!.map((c) => c.x ?? 0))
    const minY = Math.min(...graph.children!.map((c) => c.y ?? 0))
    const maxX = Math.max(...graph.children!.map((c) => (c.x ?? 0) + (c.width ?? 0)))
    const maxY = Math.max(...graph.children!.map((c) => (c.y ?? 0) + (c.height ?? 0)))
    expect(minX).toBeCloseTo(12, 9)
    expect(minY).toBeCloseTo(12, 9)
    expect(graph.width).toBeCloseTo(maxX - minX + 24, 9)
    expect(graph.height).toBeCloseTo(maxY - minY + 24, 9)
  })

  it('两层树: 第二层半径 ≈ 第一层半径 + radius', () => {
    // 与 jar oracle 931 同构: r(40) → a(60)/b(40,80)/c(100,40) → a1..b2
    const graph = node('g', 0, 0)
    graph.children = [
      node('r', 40, 40),
      node('a', 60, 60),
      node('b', 40, 80),
      node('c', 100, 40),
      node('a1', 50, 50),
      node('a2', 30, 30),
      node('a3', 60, 30),
      node('b1', 40, 40),
      node('b2', 50, 30),
    ]
    buildTree(graph, [
      ['r', 'a'], ['r', 'b'], ['r', 'c'],
      ['a', 'a1'], ['a', 'a2'], ['a', 'a3'],
      ['b', 'b1'], ['b', 'b2'],
    ])
    radialLayout(graph)

    const root = graph.children[0]!
    const a = graph.children[1]!
    const b = graph.children[2]!
    const c = graph.children[3]!
    const a1 = graph.children[4]!
    // 无重叠 (含跨层)
    expectNoOverlap(graph.children!)
    // 第一层: a/b/c 同半径
    const ra = Math.hypot(centerOf(a).x - centerOf(root).x, centerOf(a).y - centerOf(root).y)
    const rb = Math.hypot(centerOf(b).x - centerOf(root).x, centerOf(b).y - centerOf(root).y)
    const rc = Math.hypot(centerOf(c).x - centerOf(root).x, centerOf(c).y - centerOf(root).y)
    expectDistance({ x: ra, y: 0 }, { x: rb, y: 0 }, 0)
    expectDistance({ x: ra, y: 0 }, { x: rc, y: 0 }, 0)
    // a 的子节点在同一第二层半径
    const ra1 = Math.hypot(centerOf(a1).x - centerOf(root).x, centerOf(a1).y - centerOf(root).y)
    const ra2 = Math.hypot(centerOf(graph.children[5]!).x - centerOf(root).x, centerOf(graph.children[5]!).y - centerOf(root).y)
    expectDistance({ x: ra1, y: 0 }, { x: ra2, y: 0 }, 0)
    // 第二层半径 > 第一层半径 (radius 递增)
    expect(ra1).toBeGreaterThan(ra)
  })

  it('边直线路由: sections[0] 端点在两端节点边界内且共线', () => {
    const graph = node('g', 0, 0)
    graph.children = [node('r', 40, 40), node('c1', 30, 30), node('c2', 50, 50)]
    buildTree(graph, [['r', 'c1'], ['r', 'c2']])
    radialLayout(graph)

    for (const e of graph.edges!) {
      const section = e.sections![0]!
      const s = section.startPoint
      const t = section.endPoint
      const src = graph.children!.find((c) => c.id === String(e.sources[0]))!
      const tgt = graph.children!.find((c) => c.id === String(e.targets[0]))!
      // 端点在源/目标矩形内 (裁剪)
      expect(s.x).toBeGreaterThanOrEqual(src.x!)
      expect(s.x).toBeLessThanOrEqual(src.x! + src.width!)
      expect(s.y).toBeGreaterThanOrEqual(src.y!)
      expect(s.y).toBeLessThanOrEqual(src.y! + src.height!)
      expect(t.x).toBeGreaterThanOrEqual(tgt.x!)
      expect(t.x).toBeLessThanOrEqual(tgt.x! + tgt.width!)
      expect(t.y).toBeGreaterThanOrEqual(tgt.y!)
      expect(t.y).toBeLessThanOrEqual(tgt.y! + tgt.height!)
      // 共线 (与中心连线同向)
      const mid = { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 }
      const srcC = centerOf(src)
      const tgtC = centerOf(tgt)
      const cross = (mid.x - srcC.x) * (tgtC.y - srcC.y) - (mid.y - srcC.y) * (tgtC.x - srcC.x)
      expect(Math.abs(cross)).toBeLessThan(1e-6 * Math.max(1, Math.hypot(tgtC.x - srcC.x, tgtC.y - srcC.y)))
    }
  })

  it('非树 (无入边根不存在): 抛错 (Java IllegalArgumentException 同)', () => {
    const graph = node('g', 0, 0)
    graph.children = [node('r', 40, 40), node('c1', 30, 30)]
    // 环: r -> c1 -> r → 无根
    buildTree(graph, [['r', 'c1'], ['c1', 'r']])
    expect(() => radialLayout(graph)).toThrow('The given graph is not a tree!')
  })

  it('黑盒路径: layoutElkJson 中 radial 子树布局 + 外层节点照常定位', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [
        {
          id: 'outer',
          width: 30,
          height: 30,
        },
        {
          id: 'g',
          layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.radial' },
          children: [
            { id: 'r', width: 40, height: 40 },
            { id: 'c1', width: 30, height: 30 },
            { id: 'c2', width: 50, height: 50 },
          ],
          edges: [
            { id: 'e1', sources: ['r'], targets: ['c1'] },
            { id: 'e2', sources: ['r'], targets: ['c2'] },
          ],
        },
      ],
    }
    const out = layoutElkJson(input)
    const g = out.children!.find((c) => c.id === 'g')!
    expect(g.width).toBeGreaterThan(0)
    expect(g.height).toBeGreaterThan(0)
    // radial 子树节点已定位且无重叠
    expectNoOverlap(g.children!)
    expect(g.children!.every((c) => c.x !== undefined && c.y !== undefined)).toBe(true)
    // 外层节点正常定位
    const outer = out.children!.find((c) => c.id === 'outer')!
    expect(outer.x).toBeDefined()
    expect(outer.y).toBeDefined()
    // 内部边已路由
    expect(g.edges!.every((e) => e.sections?.[0] !== undefined)).toBe(true)
  })
})
