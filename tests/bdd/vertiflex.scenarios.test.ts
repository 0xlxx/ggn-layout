/**
 * vertiflex 布局算法 (ELK alg.vertiflex 0.12.0 移植) — 直接 vitest BDD.
 *
 * 被测: src/vertiflex/ (VertiFlexLayoutProvider + p1/p2/p3/p4 管线).
 * 对照权威: ELK 0.12.0 jar (verify-elkg-java-layout 对 tickets/core/950-952 全等,
 * 含 BEND 弯点 section 逐点差分).
 * 语义不变量 (与 Java 一致):
 *   - P1: y = max(父最小高度, 垂直约束); 递推步长 = layerDistance + 高 + max(margin.bottom, nodeNodeSpacing);
 *   - P2/P3: 相对 x 布局 → 根左移至最左子树 x=0; 子树不重叠;
 *   - P4: STRAIGHT 无弯点 / BEND 按 EDGE_BEND_HEIGHT 在目标上方插弯点;
 *   - 容器尺寸 = 内容 + padding (默认 12);
 *   - 非树 / 垂直约束过低 → 抛错 (Java UnsupportedConfigurationException 语义).
 */
import { describe, it, expect } from 'vitest'
import { vertiFlexLayout } from '../../src/vertiflex/vertiflex-layout.js'
import type { ElkNode } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)

function node(partial: Partial<ElkNode> & { id: string }): ElkNode {
  return { width: partial.width, height: partial.height, children: partial.children ?? [], edges: partial.edges ?? [], layoutOptions: partial.layoutOptions ?? {}, ...partial }
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

/** 断言边 section 与期望点序列一致. */
function expectSections(edges: ElkNode['edges'], id: string, expected: string): void {
  const e = edges!.find((x) => x.id === id)!
  const pts = (e.sections ?? []).map((s) => {
    const parts = [`s(${s.startPoint.x},${s.startPoint.y})`]
    for (const b of s.bendPoints ?? []) parts.push(`b(${b.x},${b.y})`)
    parts.push(`t(${s.endPoint.x},${s.endPoint.y})`)
    return parts.join(' ')
  }).join(' | ')
  expect(pts).toBe(expected)
}

describe('vertiFlexLayout (ELK VertiFlexLayoutProvider)', () => {
  it('链式树 STRAIGHT: y 递推 100/层, x 对齐到最左, 边直线路由, 容器 = 内容 + padding 12', () => {
    const n1 = node({ id: 'n1', width: 60, height: 30 })
    const n2 = node({ id: 'n2', width: 60, height: 30 })
    const n3 = node({ id: 'n3', width: 60, height: 30 })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      children: [n1, n2, n3],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n2'], targets: ['n3'], sections: [] },
      ],
    })
    vertiFlexLayout(tree)
    // 950/951 jar 差分语义: layerDistance 50 + 高 30 + spacing 20 → 每层 +100.
    expect(n1.y).toBe(0)
    expect(n2.y).toBe(100)
    expect(n3.y).toBe(200)
    expect(n1.x).toBe(0)
    expect(n2.x).toBe(0)
    // 容器尺寸 = maxX/maxY 内容 + padding (12).
    expect(tree.width).toBe(60 + 12)
    expect(tree.height).toBe(230 + 12)
    // STRAIGHT: 无弯点, 父底中点 → 子顶中点.
    expectSections(tree.edges, 'e0', 's(30,30) t(30,100)')
    expectSections(tree.edges, 'e1', 's(30,130) t(30,200)')
  })

  it('垂直约束: 子节点 y 固定到约束值 (≥ 父最小高度)', () => {
    const n1 = node({ id: 'n1', width: 50, height: 40 })
    const n2 = node({ id: 'n2', width: 60, height: 40, layoutOptions: { 'org.eclipse.elk.vertiflex.verticalConstraint': '140' } })
    const tree = node({
      id: 'tree', width: 50, height: 40,
      children: [n1, n2],
      edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] }],
    })
    vertiFlexLayout(tree)
    // 无约束时 n2.y=110 (0+50+40+20); 约束 140 ≥ 110 → 140 生效.
    expect(n2.y).toBe(140)
    expect(tree.height).toBe(140 + 40 + 12)
  })

  it('BEND 策略: 保持模型序 + 在目标上方插弯点 (jar 951 全等)', () => {
    const n4 = node({ id: 'n4', width: 60, height: 30 })
    const n2 = node({ id: 'n2', width: 70, height: 50 })
    const n3 = node({ id: 'n3', width: 60, height: 40, layoutOptions: { 'org.eclipse.elk.vertiflex.verticalConstraint': '140' } })
    const n1 = node({ id: 'n1', width: 50, height: 40 })
    const tree = node({
      id: 'tree', width: 50, height: 40,
      layoutOptions: { 'org.eclipse.elk.vertiflex.layoutStrategy': 'BEND' },
      children: [n1, n2, n3, n4],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n1'], targets: ['n3'], sections: [] },
        { id: 'e2', sources: ['n2'], targets: ['n4'], sections: [] },
      ],
    })
    vertiFlexLayout(tree)
    // 951 jar 差分全等: 节点位置 + 弯点逐点一致.
    expect(n1.x).toBe(52.5)
    expect(n2.x).toBe(0)
    expect(n3.x).toBe(90)
    expect(n3.y).toBe(140)
    expect(n4.x).toBe(5)
    expect(n4.y).toBe(230)
    expect(tree.width).toBe(162)
    expect(tree.height).toBe(272)
    // e0/e2 无弯点 (弯点高度 ≈ 目标顶), e1 有弯点 (120, 100).
    expectSections(tree.edges, 'e0', 's(77.5,40) t(35,110)')
    expectSections(tree.edges, 'e1', 's(77.5,40) b(120,100) t(120,140)')
    expectSections(tree.edges, 'e2', 's(35,160) t(35,230)')
    expectNoOverlap([n1, n2, n3, n4])
  })

  it('STRAIGHT 多子节点: 子树不重叠, 根移向半圆中心', () => {
    // n1 root, 三子节点不同高度 (952 语义, 默认模型序).
    const n1 = node({ id: 'n1', width: 60, height: 40 })
    const n2 = node({ id: 'n2', width: 80, height: 50 })
    const n3 = node({ id: 'n3', width: 50, height: 60 })
    const n4 = node({ id: 'n4', width: 70, height: 40 })
    const tree = node({
      id: 'tree', width: 60, height: 40,
      children: [n1, n2, n3, n4],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n1'], targets: ['n3'], sections: [] },
        { id: 'e2', sources: ['n1'], targets: ['n4'], sections: [] },
      ],
    })
    vertiFlexLayout(tree)
    // 不重叠 (半圆排列核心不变量); 直线边 section 齐全.
    expectNoOverlap([n2, n3, n4])
    for (const e of tree.edges!) {
      expect(e.sections![0]!.startPoint.x).toBe((n1.x ?? 0) + 30)
      expect(e.sections![0]!.startPoint.y).toBe((n1.y ?? 0) + 40)
      expect(e.sections![0]!.bendPoints?.length ?? 0).toBe(0)
    }
    // y 全部 ≥ 100 (第一层: 0 + layerDistance 50 + 高 40 + spacing 20).
    for (const c of [n2, n3, n4]) expect(c.y!).toBeGreaterThanOrEqual(100)
  })

  it('非树图 → 抛错 (Java UnsupportedConfigurationException 语义)', () => {
    // 无根: 两个节点互相入边 1, 但 n3 与 n1 不连通 — 仍有根 (n3 无入边).
    // 构造真无根: 全部节点都有入边 → 环.
    const n1 = node({ id: 'n1', width: 60, height: 30 })
    const n2 = node({ id: 'n2', width: 60, height: 30 })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      children: [n1, n2],
      edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] }],
    })
    // n1 无入边 → 有根, 合法; 再给 n1 一个父 → 两个入边 → 非法.
    const n0 = node({ id: 'n0', width: 60, height: 30 })
    const tree2 = node({
      id: 'tree', width: 60, height: 30,
      children: [n0, n1, n2],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n0'], targets: ['n1'], sections: [] },
        { id: 'e2', sources: ['n2'], targets: ['n1'], sections: [] }, // n1 第二入边
      ],
    })
    expect(() => vertiFlexLayout(tree2)).toThrow(/acyclic tree/)
    // 无根图: 有向环.
    const a = node({ id: 'a', width: 60, height: 30 })
    const b = node({ id: 'b', width: 60, height: 30 })
    const cycle = node({
      id: 'tree', width: 60, height: 30,
      children: [a, b],
      edges: [
        { id: 'e0', sources: ['a'], targets: ['b'], sections: [] },
        { id: 'e1', sources: ['b'], targets: ['a'], sections: [] },
      ],
    })
    expect(() => vertiFlexLayout(cycle)).toThrow(/not a tree/)
  })

  it('垂直约束过低 → 抛错 (Invalid vertical constraints)', () => {
    const n1 = node({ id: 'n1', width: 60, height: 30 })
    const n2 = node({ id: 'n2', width: 60, height: 30, layoutOptions: { 'org.eclipse.elk.vertiflex.verticalConstraint': '30' } })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      children: [n1, n2],
      edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] }],
    })
    // 校验: newMinConstraint = 0 + 30 + max(0, 20) = 50 > 30 + margin.top(0) → 无效.
    expect(() => vertiFlexLayout(tree)).toThrow(/Invalid vertical constraints/)
  })
})

describe('vertiFlexLayout NodeMicroLayout (ELK alg.common NodeMicroLayout 0.12.0)', () => {
  it('节点标签 (默认 placement=fixed): 标签不移动, 但溢出 → 节点 margin.right 增大, 图尺寸/边随之变化 (jar labels.json 全等)', () => {
    const n1 = node({ id: 'n1', width: 60, height: 30, labels: [{ text: 'Root Node', width: 80, height: 14 }] })
    const n2 = node({ id: 'n2', width: 60, height: 30, labels: [{ text: 'Child B', width: 70, height: 14 }] })
    const n3 = node({ id: 'n3', width: 60, height: 30, labels: [{ text: 'Child C', width: 70, height: 14 }] })
    const n4 = node({ id: 'n4', width: 60, height: 30, labels: [{ text: 'Leaf', width: 40, height: 14 }] })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      children: [n1, n2, n3, n4],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n1'], targets: ['n3'], sections: [] },
        { id: 'e2', sources: ['n2'], targets: ['n4'], sections: [] },
      ],
    })
    vertiFlexLayout(tree)
    // 默认 nodeLabels.placement = fixed (空) → 标签留在 (0,0), 不参与节点尺寸;
    // NodeMarginCalculator: 包围盒 = 节点 ∪ 标签 → margin.right = 标签宽 - 节点宽.
    const marginOf = (n: ElkNode) => (n.layoutOptions?.['org.eclipse.elk.margins'] as { right?: number }) ?? {}
    expect(marginOf(n1).right).toBe(20) // 80 - 60
    expect(marginOf(n2).right).toBe(10)
    expect(marginOf(n3).right).toBe(10)
    expect(marginOf(n4).right).toBe(0) // 40 < 60, 无溢出
    expect(n1.x).toBe(90)
    expect(n2.x).toBe(0)
    expect(n2.y).toBe(100)
    expect(n3.x).toBe(90)
    expect(n4.y).toBe(200)
    // 图尺寸 = 内容 + margin.right 溢出 + padding 12.
    expect(tree.width).toBe(182)
    expect(tree.height).toBe(242)
    expectSections(tree.edges, 'e0', 's(120,30) t(30,100)')
    expectSections(tree.edges, 'e1', 's(120,30) t(120,100)')
  })

  it('端口 (带 side, 默认约束): 端口沿边放置 + 节点 margin 溢出 (jar ports_sides.json 全等)', () => {
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      ports: [{ id: 'p0', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } }],
    })
    const n2 = node({
      id: 'n2', width: 60, height: 30,
      ports: [{ id: 'p1', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } }],
    })
    const n3 = node({ id: 'n3', width: 60, height: 30 })
    const n4 = node({
      id: 'n4', width: 60, height: 30,
      ports: [{ id: 'p2', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'EAST' } }],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      children: [n1, n2, n3, n4],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n1'], targets: ['n3'], sections: [] },
        { id: 'e2', sources: ['n2'], targets: ['n4'], sections: [] },
      ],
    })
    vertiFlexLayout(tree)
    // 单端口 SOUTH → 水平居中 (26), y = 节点高 30; EAST → x = 节点宽 60, 垂直居中 (11).
    expect(n1.ports![0]!.x).toBe(26)
    expect(n1.ports![0]!.y).toBe(30)
    expect(n4.ports![0]!.x).toBe(60)
    expect(n4.ports![0]!.y).toBe(11)
    const marginOf = (n: ElkNode) => (n.layoutOptions?.['org.eclipse.elk.margins'] as { bottom?: number; right?: number }) ?? {}
    expect(marginOf(n1).bottom).toBe(8)
    expect(marginOf(n2).bottom).toBe(8)
    expect(marginOf(n4).right).toBe(8)
    expect(n1.x).toBe(88)
    expect(tree.width).toBe(160)
    expect(tree.height).toBe(242)
    expectSections(tree.edges, 'e0', 's(118,30) t(30,100)')
  })

  it('多端口单侧 DISTRIBUTED 对齐: 均匀分布 + surrounding margin (jar pr2.json 全等)', () => {
    const ports = [
      { id: 'p0', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
      { id: 'p1', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
      { id: 'p2', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
      { id: 'p3', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'NORTH' } },
      { id: 'p4', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'NORTH' } },
      { id: 'p5', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'EAST' } },
      { id: 'p6', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'EAST' } },
      { id: 'p7', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'WEST' } },
      { id: 'p8', width: 10, height: 12, layoutOptions: { 'org.eclipse.elk.port.side': 'WEST' } },
    ]
    const n1 = node({ id: 'n1', width: 100, height: 40, ports })
    const tree = node({ id: 'tree', width: 100, height: 40, children: [n1] })
    vertiFlexLayout(tree)
    const byId = (id: string) => n1.ports!.find((p) => p.id === id)!
    // SOUTH: 列表反序放置 (p2 最左), DISTRIBUTED → 间距 (100-3*10)/4 = 17.5.
    expect(byId('p2').x).toBeCloseTo(17.5, 9)
    expect(byId('p1').x).toBeCloseTo(45, 9)
    expect(byId('p0').x).toBeCloseTo(72.5, 9)
    expect(byId('p0').y).toBe(40)
    // NORTH: 输入序, 间距 (100-2*10)/3 = 26.667.
    expect(byId('p3').x).toBeCloseTo(26.666666666666668, 9)
    expect(byId('p4').x).toBeCloseTo(63.33333333333334, 9)
    expect(byId('p3').y).toBe(-12)
    // EAST: 输入序, 间距 (40-2*12)/3 = 5.333; WEST: 反序.
    expect(byId('p5').y).toBeCloseTo(5.333333333333333, 9)
    expect(byId('p6').y).toBeCloseTo(22.666666666666664, 9)
    expect(byId('p5').x).toBe(100)
    expect(byId('p8').y).toBeCloseTo(5.333333333333333, 9)
    expect(byId('p7').y).toBeCloseTo(22.666666666666664, 9)
    expect(byId('p7').x).toBe(-10)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { top?: number; left?: number; bottom?: number; right?: number }
    expect(margin.top).toBe(12)
    expect(margin.left).toBe(10)
    expect(margin.bottom).toBe(12)
    expect(margin.right).toBe(10)
    expect(tree.width).toBe(122)
    expect(tree.height).toBe(64)
  })

  it('标签+端口组合: margin 叠加, 图尺寸/边路由随之变化 (jar combined.json 全等)', () => {
    const n1 = node({
      id: 'n1', width: 50, height: 40,
      labels: [{ text: 'Root Node', width: 80, height: 14 }],
      ports: [{ id: 'p0', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } }],
    })
    const n2 = node({
      id: 'n2', width: 70, height: 50,
      labels: [{ text: 'Child B', width: 70, height: 14 }],
      ports: [{ id: 'p1', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } }],
    })
    const n3 = node({ id: 'n3', width: 60, height: 40, labels: [{ text: 'Child C', width: 90, height: 14 }] })
    const n4 = node({
      id: 'n4', width: 60, height: 40,
      labels: [{ text: 'Leaf', width: 40, height: 14 }],
      ports: [{ id: 'p2', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'EAST' } }],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      children: [n1, n2, n3, n4],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n1'], targets: ['n3'], sections: [] },
        { id: 'e2', sources: ['n2'], targets: ['n4'], sections: [] },
      ],
    })
    vertiFlexLayout(tree)
    const marginOf = (n: ElkNode) => (n.layoutOptions?.['org.eclipse.elk.margins'] as { bottom?: number; right?: number }) ?? {}
    expect(marginOf(n1).bottom).toBe(8) // SOUTH 端口
    expect(marginOf(n1).right).toBe(30) // 标签 80 - 节点 50
    expect(marginOf(n2).bottom).toBe(8)
    expect(marginOf(n3).right).toBe(30)
    expect(marginOf(n4).right).toBe(8) // EAST 端口
    expect(n1.ports![0]!.x).toBe(21)
    expect(n1.ports![0]!.y).toBe(40)
    expect(n2.ports![0]!.x).toBe(31)
    expect(n2.ports![0]!.y).toBe(50)
    expect(n4.ports![0]!.x).toBe(60)
    expect(n4.ports![0]!.y).toBe(16)
    expect(n1.x).toBe(110)
    expect(n3.x).toBe(110)
    expect(n2.y).toBe(110)
    expect(n4.y).toBe(230)
    expect(tree.width).toBe(212)
    expect(tree.height).toBe(282)
    expectSections(tree.edges, 'e0', 's(135,40) t(35,110)')
    expectSections(tree.edges, 'e1', 's(135,40) t(140,110)')
    expectSections(tree.edges, 'e2', 's(35,160) t(35,230)')
  })

  it('nodeSize.constraints=[PORTS]: 节点宽 = 端口放置最小宽, 端口按 spacing 均匀排布 (jar pr7.json 全等)', () => {
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.nodeSize.constraints': '[PORTS]' },
      ports: [
        { id: 'p0', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
        { id: 'p1', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
        { id: 'p2', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
      ],
    })
    const tree = node({ id: 'tree', width: 60, height: 30, children: [n1] })
    vertiFlexLayout(tree)
    // 3*8 + 2*10 (spacing.portPort) + 2*10 (DISTRIBUTED 两侧) = 64; 无 E/W 端口 → 高 = 0.
    expect(n1.width).toBe(64)
    expect(n1.height).toBe(0)
    const byId = (id: string) => n1.ports!.find((p) => p.id === id)!
    // SOUTH 反序: p2 最左, 间距 10 (恰好放满).
    expect(byId('p2').x).toBe(10)
    expect(byId('p1').x).toBe(28)
    expect(byId('p0').x).toBe(46)
    expect(byId('p0').y).toBe(0)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { bottom?: number }
    expect(margin.bottom).toBe(8)
  })

  it('nodeSize.constraints=[NODE_LABELS] + INSIDE 标签: 节点 = 标签 + nodeLabels.padding, 标签居中 (jar pr8.json 全等)', () => {
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[NODE_LABELS]',
        'org.eclipse.elk.nodeLabels.placement': '[INSIDE H_CENTER V_CENTER]',
      },
      labels: [{ text: 'Wide', width: 90, height: 14 }],
    })
    const tree = node({ id: 'tree', width: 60, height: 30, children: [n1] })
    vertiFlexLayout(tree)
    // 90 + padding 5+5 = 100 × 14 + 10 = 24.
    expect(n1.width).toBe(100)
    expect(n1.height).toBe(24)
    expect(n1.labels![0]!.x).toBe(5)
    expect(n1.labels![0]!.y).toBe(5)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { top?: number; left?: number; bottom?: number; right?: number }
    expect(margin.top).toBe(0)
    expect(margin.left).toBe(0)
    expect(margin.bottom).toBe(0)
    expect(margin.right).toBe(0)
  })

  it('nodeSize.constraints=[NODE_LABELS] + 多 INSIDE 标签不同位置: 行内列求和 + 行间 gap (jar tA 全等)', () => {
    // 4 个标签分属 4 个 cell: IN_T_L / IN_T_R / IN_C_C / IN_B_L.
    // labelLabel=4 → labelCellSpacing=2*4=8 (GridContainerCell gap).
    // 宽度 (非 tabular): 行 T 列宽 [90,0,40] → 对称 [90,0,90] → 90+90+8=188; 行 C=50, 行 B=30 → 行 max 188;
    // 高度: 行高 [14,20,10] → 对称 [14,20,14] → 14+20+14+8+8=64; + nodeLabels.padding 10 → 198×74.
    // spacing.labelLabel=4 设在 root(graph) 级, 节点不设 → jar IndividualSpacings 继承生效 (R78).
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[NODE_LABELS]',
        'org.eclipse.elk.nodeLabels.placement': '[INSIDE H_CENTER V_CENTER]',
      },
      labels: [
        { text: 'L90', width: 90, height: 14, layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': '[INSIDE V_TOP H_LEFT]' } },
        { text: 'R40', width: 40, height: 14, layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': '[INSIDE V_TOP H_RIGHT]' } },
        { text: 'C50', width: 50, height: 20, layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': '[INSIDE H_CENTER V_CENTER]' } },
        { text: 'B30', width: 30, height: 10, layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': '[INSIDE V_BOTTOM H_LEFT]' } },
      ] as unknown as ElkNode['labels'],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.spacing.labelLabel': '4' },
      children: [n1],
    })
    vertiFlexLayout(tree)
    expect(n1.width).toBe(198)
    expect(n1.height).toBe(74)
    const byText = (t: string) => n1.labels!.find((l) => l.text === t)!
    expect(byText('L90')!.x).toBe(5)
    expect(byText('L90')!.y).toBe(5)
    expect(byText('R40')!.x).toBe(153)
    expect(byText('R40')!.y).toBe(5)
    expect(byText('C50')!.x).toBe(74)
    expect(byText('C50')!.y).toBe(27)
    expect(byText('B30')!.x).toBe(5)
    expect(byText('B30')!.y).toBe(59)
    expect(tree.width).toBe(210)
    expect(tree.height).toBe(86)
  })

  it('nodeSize.constraints=[NODE_LABELS] + OUTSIDE V_TOP 标签: 节点宽并入外侧标签, 高塌缩 0 (jar tB 全等)', () => {
    // NodeSizeCalculator.setNodeWidth: NODE_LABELS && !OUTSIDE_NODE_LABELS_OVERHANG 时
    // width = max(width, NORTH.minW=80, SOUTH.minW=0) → 80; E/W 无标签 → 高 0 (节点塌缩为 80×0).
    // spacing.labelNode=7 设在 root(graph) 级, 节点不设 → jar IndividualSpacings 继承生效 (R78).
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[NODE_LABELS]',
        'org.eclipse.elk.nodeLabels.placement': '[OUTSIDE V_TOP H_CENTER]',
      },
      labels: [{ text: 'TopLabel', width: 80, height: 14 }] as unknown as ElkNode['labels'],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.spacing.labelNode': '7' },
      children: [n1],
    })
    vertiFlexLayout(tree)
    expect(n1.width).toBe(80)
    expect(n1.height).toBe(0)
    expect(n1.labels![0]!.x).toBe(0)
    expect(n1.labels![0]!.y).toBe(-21) // -(14 + spacing.labelNode 7)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { top?: number; left?: number; bottom?: number; right?: number }
    expect(margin.top).toBe(21)
    expect(margin.left).toBe(0)
    expect(margin.bottom).toBe(0)
    expect(margin.right).toBe(0)
    expect(tree.width).toBe(92)
    expect(tree.height).toBe(12)
  })

  it('nodeSize.constraints=[NODE_LABELS] + OUTSIDE H_LEFT 标签: 节点高并入外侧标签, 宽塌缩 0 (jar tC 全等)', () => {
    // NodeSizeCalculator.setNodeHeight: height = max(height, EAST.minH=0, WEST.minH=40) → 40; N/S 无标签 → 宽 0.
    // spacing.labelNode=7 设在 root(graph) 级, 节点不设 → jar IndividualSpacings 继承生效 (R78).
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[NODE_LABELS]',
        'org.eclipse.elk.nodeLabels.placement': '[OUTSIDE H_LEFT V_CENTER]',
      },
      labels: [{ text: 'LeftLabel', width: 14, height: 40 }] as unknown as ElkNode['labels'],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.spacing.labelNode': '7' },
      children: [n1],
    })
    vertiFlexLayout(tree)
    expect(n1.width).toBe(0)
    expect(n1.height).toBe(40)
    expect(n1.labels![0]!.x).toBe(-21) // -(14 + spacing.labelNode 7)
    expect(n1.labels![0]!.y).toBe(0)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { top?: number; left?: number; bottom?: number; right?: number }
    expect(margin.top).toBe(0)
    expect(margin.left).toBe(21)
    expect(margin.bottom).toBe(0)
    expect(margin.right).toBe(0)
    expect(tree.width).toBe(12)
    expect(tree.height).toBe(52)
  })

  it('spacing 继承: root 级 spacing.portPort 生效于 PORTS 尺寸 (jar C1 全等)', () => {
    // jar 实证: spacing.portPort 经 IndividualSpacings 从 graph 继承 — root 设 20, 节点不设
    // → 3*8 + 2*20 (portPort) + 2*20 (DISTRIBUTED 两侧) = 104; 端口 x = 20/48/76 (SOUTH 反序).
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.nodeSize.constraints': '[PORTS]' },
      ports: [
        { id: 'p0', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
        { id: 'p1', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
        { id: 'p2', width: 8, height: 8, layoutOptions: { 'org.eclipse.elk.port.side': 'SOUTH' } },
      ],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.spacing.portPort': '20' },
      children: [n1],
    })
    vertiFlexLayout(tree)
    expect(n1.width).toBe(104)
    const byId = (id: string) => n1.ports!.find((p) => p.id === id)!
    expect(byId('p2').x).toBe(20)
    expect(byId('p1').x).toBe(48)
    expect(byId('p0').x).toBe(76)
  })

  it('spacing 继承: 节点自身直接 spacing 不被读取 (jar B2 全等)', () => {
    // jar 实证 NodeContext 只查 node.spacing.individual + graph — 节点直接设 spacing.labelNode=7
    // 被忽略, 仍用默认 5 → 标签 y = -(14+5) = -19, margin top = 19.
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[NODE_LABELS]',
        'org.eclipse.elk.nodeLabels.placement': '[OUTSIDE V_TOP H_CENTER]',
        'org.eclipse.elk.spacing.labelNode': '7',
      },
      labels: [{ text: 'TopLabel', width: 80, height: 14 }] as unknown as ElkNode['labels'],
    })
    const tree = node({ id: 'tree', width: 60, height: 30, children: [n1] })
    vertiFlexLayout(tree)
    expect(n1.width).toBe(80)
    expect(n1.labels![0]!.y).toBe(-19)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { top?: number }
    expect(margin.top).toBe(19)
  })

  it('spacing 继承: node.spacing.individual 覆盖 root 级值 (jar F 全等)', () => {
    // root 设 spacing.labelNode=7, 节点 spacing.individual 覆盖为 3 → 覆盖生效: y = -(14+3) = -17.
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[NODE_LABELS]',
        'org.eclipse.elk.nodeLabels.placement': '[OUTSIDE V_TOP H_CENTER]',
        'org.eclipse.elk.spacing.individual': 'spacing.labelNode:3',
      },
      labels: [{ text: 'TopLabel', width: 80, height: 14 }] as unknown as ElkNode['labels'],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.spacing.labelNode': '7' },
      children: [n1],
    })
    vertiFlexLayout(tree)
    expect(n1.labels![0]!.y).toBe(-17)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { top?: number }
    expect(margin.top).toBe(17)
  })

  it('spacing 继承: root 级 nodeLabels.padding 生效 (jar P 全等)', () => {
    // root 设 nodeLabels.padding=[top=10,left=12,bottom=14,right=16], 节点不设 →
    // 节点 = 90+12+16 = 118 × 14+10+14 = 38; 标签 (12,10).
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: {
        'org.eclipse.elk.nodeSize.constraints': '[NODE_LABELS]',
        'org.eclipse.elk.nodeLabels.placement': '[INSIDE H_CENTER V_CENTER]',
      },
      labels: [{ text: 'Wide', width: 90, height: 14 }] as unknown as ElkNode['labels'],
    })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.nodeLabels.padding': '[top=10.0,left=12.0,bottom=14.0,right=16.0]' },
      children: [n1],
    })
    vertiFlexLayout(tree)
    expect(n1.width).toBe(118)
    expect(n1.height).toBe(38)
    expect(n1.labels![0]!.x).toBe(12)
    expect(n1.labels![0]!.y).toBe(10)
  })

  it('OUTSIDE V_TOP H_CENTER 标签: 标签置于节点上方, margin 反映溢出 (jar pr9.json 全等)', () => {
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': '[OUTSIDE V_TOP H_CENTER]' },
      labels: [{ text: 'TopLabel', width: 80, height: 14 }],
    })
    const tree = node({ id: 'tree', width: 60, height: 30, children: [n1] })
    vertiFlexLayout(tree)
    // y = -(标签高 14 + spacing.labelNode 5) = -19; x = 居中 (60-80)/2 = -10.
    expect(n1.labels![0]!.x).toBe(-10)
    expect(n1.labels![0]!.y).toBe(-19)
    const margin = n1.layoutOptions?.['org.eclipse.elk.margins'] as { top?: number; left?: number; right?: number }
    expect(margin.top).toBe(19)
    expect(margin.left).toBe(10)
    expect(margin.right).toBe(10)
  })

  it('端口无 side → 抛错 (Java PortContextCreator IllegalArgumentException 语义)', () => {
    const n1 = node({
      id: 'n1', width: 60, height: 30,
      ports: [{ id: 'p0', width: 8, height: 8 }], // 无 port.side
    })
    const tree = node({ id: 'tree', width: 60, height: 30, children: [n1] })
    expect(() => vertiFlexLayout(tree)).toThrow(/port sides assigned/)
  })

  it('omitNodeMicroLayout=true: 标签/端口不参与布局 (jar labels_omit.json 全等, 回归基线)', () => {
    const n1 = node({ id: 'n1', width: 60, height: 30, labels: [{ text: 'Root Node', width: 80, height: 14 }] })
    const n2 = node({ id: 'n2', width: 60, height: 30, labels: [{ text: 'Child B', width: 70, height: 14 }] })
    const n3 = node({ id: 'n3', width: 60, height: 30, labels: [{ text: 'Child C', width: 70, height: 14 }] })
    const n4 = node({ id: 'n4', width: 60, height: 30, labels: [{ text: 'Leaf', width: 40, height: 14 }] })
    const tree = node({
      id: 'tree', width: 60, height: 30,
      layoutOptions: { 'org.eclipse.elk.omitNodeMicroLayout': 'true' },
      children: [n1, n2, n3, n4],
      edges: [
        { id: 'e0', sources: ['n1'], targets: ['n2'], sections: [] },
        { id: 'e1', sources: ['n1'], targets: ['n3'], sections: [] },
        { id: 'e2', sources: ['n2'], targets: ['n4'], sections: [] },
      ],
    })
    vertiFlexLayout(tree)
    // 无 margin 效果 → 与无标签/端口基线相同 (jar labels_omit: 152x242, n1.x=80).
    expect(n1.layoutOptions?.['org.eclipse.elk.margins']).toBeUndefined()
    expect(n1.x).toBe(80)
    expect(n2.y).toBe(100)
    expect(n3.x).toBe(80)
    expect(n4.y).toBe(200)
    expect(tree.width).toBe(152)
    expect(tree.height).toBe(242)
  })
})
