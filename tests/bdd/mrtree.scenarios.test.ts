/**
 * mrtree 布局算法 (ELK alg.mrtree 0.12.0 移植) — 直接 vitest BDD.
 *
 * 被测: src/mrtree/ (TreeLayoutProvider + MrTree: DFS treeify → root/fan/level →
 * Walker NodePlacer → direction/nodePosition → EdgeRouter(AVOID_OVERLAP)).
 * 对照权威: ELK 0.12.0 jar (verify-elkg-java-layout 对 920-922 触发模型全等).
 * 语义不变量 (与 Java 一致):
 *   - 树化: 环边被移除存 REMOVABLE_EDGES, P4 后插回 (边不丢失);
 *   - Walker 布局: 父节点在子节点上方 (DOWN), 同层节点 y 相同, 兄弟不重叠,
 *     层间距 = 层高 + spacing.nodeNode (默认 20);
 *   - 方向变换: RIGHT 时树横排 (x 为层级轴);
 *   - 容器尺寸 = 内容包围盒 + padding (mrtree 默认 20, Tree.melk).
 */
import { describe, it, expect } from 'vitest'
import { mrtreeLayout } from '../../src/mrtree/mrtree-layout.js'
import type { ElkNode } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)

function node(partial: Partial<ElkNode> & { id: string }): ElkNode {
  // 默认尺寸 60x30 (elkt2test 发射语义: p.width ?? 60, p.height ?? 30)
  return { width: 60, height: 30, ...partial, children: partial.children ?? [], edges: partial.edges ?? [], layoutOptions: partial.layoutOptions }
}

/** 构造 921 树: a→b→d→g, a→c→e/f (尺寸各异). */
function tree921(): ElkNode {
  return node({
    id: 'tree',
    layoutOptions: {
      'org.eclipse.elk.algorithm': 'org.eclipse.elk.mrtree',
      'org.eclipse.elk.direction': 'DOWN',
    },
    children: [
      node({ id: 'a', width: 80, height: 40 }),
      node({ id: 'b' }),
      node({ id: 'c' }),
      node({ id: 'd', width: 50, height: 60 }),
      node({ id: 'e' }),
      node({ id: 'f' }),
      node({ id: 'g' }),
    ],
    edges: [
      { sources: ['a'], targets: ['b'] },
      { sources: ['a'], targets: ['c'] },
      { sources: ['b'], targets: ['d'] },
      { sources: ['c'], targets: ['e'] },
      { sources: ['c'], targets: ['f'] },
      { sources: ['d'], targets: ['g'] },
    ],
  })
}

describe('mrtreeLayout (ELK MrTree 0.12.0)', () => {
  it('920 基本树: 根在上子在下, 同层 y 相等, 兄弟 x 不重叠, 边路由有弯点', () => {
    const tree = node({
      id: 'tree',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.mrtree' },
      children: [
        node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' }), node({ id: 'd' }), node({ id: 'e' }),
      ],
      edges: [
        { sources: ['a'], targets: ['b'] },
        { sources: ['a'], targets: ['c'] },
        { sources: ['b'], targets: ['d'] },
        { sources: ['b'], targets: ['e'] },
      ],
    })
    mrtreeLayout(tree)

    const by = (id: string): ElkNode => tree.children!.find((c) => c.id === id)!
    const a = by('a'), b = by('b'), c = by('c'), d = by('d'), e = by('e')
    // 层间: 父节点底边在子节点顶边之上
    expect(a.y! + a.height!).toBeLessThanOrEqual(b.y!)
    expect(b.y! + b.height!).toBeLessThanOrEqual(d.y!)
    // 同层: b/c 与 d/e 同 y
    expect(b.y).toBe(c.y)
    expect(d.y).toBe(e.y)
    // 兄弟 x 不重叠
    expect(b.x! + b.width!).toBeLessThanOrEqual(c.x!)
    expect(d.x! + d.width!).toBeLessThanOrEqual(e.x!)
    // 树根居中于子树上方 (jar 同: a.x 位于 b.x..c.x 之间)
    expect(b.x!).toBeLessThanOrEqual(a.x!)
    expect(a.x! + a.width!).toBeLessThanOrEqual(c.x! + c.width!)
    // 边有路由弯点 (AVOID_OVERLAP)
    for (const edge of tree.edges!) {
      expect(edge.sections?.[0]?.bendPoints?.length ?? 0).toBeGreaterThanOrEqual(1)
    }
    // 容器尺寸包含 padding (mrtree 默认 20)
    expect(tree.width).toBeGreaterThan(0)
    expect(tree.height).toBeGreaterThan(0)
  })

  it('921 混合尺寸树: 与 jar 直出逐位全等 (a(68,20) b(20,80) c(135,80) d(25,130) e(95,145) f(175,145) g(20,210), 容器 255x265)', () => {
    const tree = tree921()
    mrtreeLayout(tree)

    const by = (id: string): ElkNode => tree.children!.find((c) => c.id === id)!
    const expectAt = (id: string, x: number, y: number): void => {
      const n = by(id)
      expect(n.x, `${id}.x`).toBe(x)
      expect(n.y, `${id}.y`).toBe(y)
    }
    expectAt('a', 68, 20)
    expectAt('b', 20, 80)
    expectAt('c', 135, 80)
    expectAt('d', 25, 130)
    expectAt('e', 95, 145)
    expectAt('f', 175, 145)
    expectAt('g', 20, 210)
    expect(tree.width).toBe(255)
    expect(tree.height).toBe(265)
    // 最大层高节点 d(60) 决定层 2 高 → e/f 在层 2 与 d 同层但 y 由层高 60 对齐
    expect(by('e').y).toBe(145)
    expect(by('f').y).toBe(by('e').y)
  })

  it('RIGHT 方向: 树横排, 父在左子在右', () => {
    const tree = node({
      id: 'tree',
      layoutOptions: {
        'org.eclipse.elk.algorithm': 'org.eclipse.elk.mrtree',
        'org.eclipse.elk.direction': 'RIGHT',
      },
      children: [
        node({ id: 'a', width: 80, height: 40 }),
        node({ id: 'b' }),
        node({ id: 'c' }),
        node({ id: 'd', width: 50, height: 60 }),
        node({ id: 'e' }),
        node({ id: 'f' }),
        node({ id: 'g' }),
      ],
      edges: [
        { sources: ['a'], targets: ['b'] },
        { sources: ['a'], targets: ['c'] },
        { sources: ['b'], targets: ['d'] },
        { sources: ['c'], targets: ['e'] },
        { sources: ['c'], targets: ['f'] },
        { sources: ['d'], targets: ['g'] },
      ],
    })
    mrtreeLayout(tree)

    const by = (id: string): ElkNode => tree.children!.find((c) => c.id === id)!
    // RIGHT: 层级沿 x, 父在子左 (层 x 单调递增)
    expect(by('a').x! + by('a').width!).toBeLessThanOrEqual(by('b').x!)
    expect(by('b').x! + by('b').width!).toBeLessThanOrEqual(by('d').x!)
    expect(by('d').x! + by('d').width!).toBeLessThanOrEqual(by('g').x!)
    // 同一层节点 y 不同 (RIGHT 下兄弟沿 y 分布), 但同层 x 相近 (apportion 允许微移)
    expect(by('b').y).not.toBe(by('c').y)
    expect(Math.abs(by('d').x! - by('e').x!)).toBeLessThanOrEqual(by('d').width!)
  })

  it('922 环图: treeify 移除环边后布局, P4 后环边恢复且被路由 (边不丢失)', () => {
    const tree = node({
      id: 'tree',
      layoutOptions: {
        'org.eclipse.elk.algorithm': 'org.eclipse.elk.mrtree',
        'org.eclipse.elk.spacing.nodeNode': '30',
      },
      children: [
        node({ id: 'a', width: 70, height: 50 }),
        node({ id: 'b' }), node({ id: 'c' }), node({ id: 'd' }), node({ id: 'e' }), node({ id: 'f' }),
      ],
      edges: [
        { sources: ['a'], targets: ['b'] },
        { sources: ['a'], targets: ['c'] },
        { sources: ['b'], targets: ['d'] },
        { sources: ['c'], targets: ['d'] },
        { sources: ['d'], targets: ['e'] },
        { sources: ['d'], targets: ['f'] },
        { sources: ['f'], targets: ['a'] },
      ],
    })
    mrtreeLayout(tree)

    // 全部边恢复且路由 (untreeify + edgeRouter)
    expect(tree.edges!.length).toBe(7)
    for (const edge of tree.edges!) {
      expect(edge.sections, `边 ${edge.sources}->${edge.targets} 应有 section`).toBeDefined()
      expect(edge.sections![0]!.bendPoints?.length ?? 0).toBeGreaterThanOrEqual(1)
    }
    // 环边 f→a 沿图侧绕行 (cycleInducing), 有多个弯点
    const cycleEdge = tree.edges!.find((e) => e.sources[0] === 'f')
    expect(cycleEdge!.sections![0]!.bendPoints!.length).toBeGreaterThanOrEqual(2)
    // 节点不重叠
    const children = tree.children!
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const p = children[i]!, q = children[j]!
        const overlapX = p.x! < q.x! + q.width! && q.x! < p.x! + p.width!
        const overlapY = p.y! < q.y! + q.height! && q.y! < p.y! + p.height!
        expect(overlapX && overlapY, `${p.id} 与 ${q.id} 重叠`).toBe(false)
      }
    }
  })
})
