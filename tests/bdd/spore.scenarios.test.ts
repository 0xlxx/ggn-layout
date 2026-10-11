/**
 * spore 布局算法 (ELK alg.spore 0.12.0 移植) — 直接 vitest BDD.
 *
 * 被测: src/spore/ (OverlapRemovalLayoutProvider + ShrinkTreeLayoutProvider +
 * ScanlineOverlapCheck + BowyerWatsonTriangulation + NaiveMinST + GrowTree + DepthFirstCompaction).
 * 对照权威: ELK 0.12.0 jar (verify-elkg-java-layout 对 910-914 触发模型全等; SporeMain
 * 直出 910 与 Java 逐位全等).
 * 语义不变量 (与 Java 一致):
 *   - sporeOverlap: 迭代 (scanline 检测重叠 → Delaunay → MinST(INVERTED_OVERLAP) →
 *     GrowTree 沿生成树边拉伸) 消除重叠, 输出含 spacing 的矩形互不重叠 (MST 边语义);
 *   - sporeCompaction: 输入无重叠, 收缩生成树压缩间隙 (节点可重合, Java 同);
 *   - 保持相对拓扑: 节点沿原始方向拉伸, 相对顺序不变.
 */
import { describe, it, expect } from 'vitest'
import { sporeOverlapLayout, sporeCompactionLayout } from '../../src/spore/spore-layout.js'
import { layoutElkJson } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)
import type { ElkNode } from '../../src/api/elk-json.js'

function node(partial: Partial<ElkNode> & { id: string }): ElkNode {
  return { ...partial, children: partial.children ?? [], edges: partial.edges ?? [], layoutOptions: partial.layoutOptions }
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

describe('sporeOverlapLayout (ELK OverlapRemovalLayoutProvider)', () => {
  it('910 模型: 3 个重叠节点消除重叠, 与 jar 直出逐位全等 (n1(8,8) n2(68.4,66) n3(136.4,134))', () => {
    const root = node({
      id: 'root',
      children: [
        node({ id: 'n1', width: 100, height: 50, x: 10, y: 10 }),
        node({ id: 'n2', width: 80, height: 60, x: 40, y: 30 }),
        node({ id: 'n3', width: 60, height: 40, x: 70, y: 60 }),
      ],
    })
    sporeOverlapLayout(root)
    // Java SporeMain (不强制 layered) 直出: 含 spacing(8) 的布局.
    expect(root.children![0]!.x).toBe(8)
    expect(root.children![0]!.y).toBe(8)
    expect(root.children![1]!.x).toBeCloseTo(68.4, 9)
    expect(root.children![1]!.y).toBe(66)
    expect(root.children![2]!.x).toBeCloseTo(136.4, 9)
    expect(root.children![2]!.y).toBe(134)
    expect(root.width).toBeCloseTo(204.4, 9)
    expect(root.height).toBe(182)
    expectNoOverlap(root.children!)
  })

  it('不变量: 消除后节点互不重叠, 且沿原始方向保持相对拓扑 (中心序不变)', () => {
    const root = node({
      id: 'root',
      children: [
        node({ id: 'a', width: 60, height: 40, x: 5, y: 5 }),
        node({ id: 'b', width: 80, height: 50, x: 50, y: 45 }),
        node({ id: 'c', width: 50, height: 60, x: 100, y: 80 }),
      ],
    })
    const before = root.children!.map((c) => ((c.x ?? 0) + (c.width ?? 0) / 2) + ((c.y ?? 0) + (c.height ?? 0) / 2))
    sporeOverlapLayout(root)
    expectNoOverlap(root.children!)
    // 拓扑: 中心沿 (x+y) 对角线的相对顺序不因消除重叠而翻转 (Java GrowTree 沿 MST 边拉伸).
    const after = root.children!.map((c) => ((c.x ?? 0) + (c.width ?? 0) / 2) + ((c.y ?? 0) + (c.height ?? 0) / 2))
    const order = (xs: number[]) => xs.map((v, i) => ({ v, i })).sort((p, q) => p.v - q.v).map((p) => p.i)
    expect(after.map((_, i) => i)).toEqual(order(after))
    expect(order(before)).toEqual(order(after))
  })

  it('空 children / 单节点: 不崩溃, 父尺寸 = padding (Java importGraph 提前返回)', () => {
    const empty = node({ id: 'root', children: [] })
    sporeOverlapLayout(empty)
    // Java SporeMain 空图: 不设父尺寸 (applyPositions 提前返回)
    expect(empty.width).toBeUndefined()
    expect(empty.height).toBeUndefined()
    const single = node({ id: 'root', children: [node({ id: 's', width: 40, height: 30, x: 0, y: 0 })] })
    sporeOverlapLayout(single)
    expect(single.children![0]!.x).toBe(8)
    expect(single.children![0]!.y).toBe(8)
  })

  it('runScanline=false + maxIterations=2 (914 语义): 仅 Delaunay 边消除, 与 jar SporeMain 全等', () => {
    const root = node({
      id: 'root',
      width: 300, height: 200,
      layoutOptions: {
        'org.eclipse.elk.overlapRemoval.runScanline': 'false',
        'org.eclipse.elk.overlapRemoval.maxIterations': '2',
      },
      children: [
        node({ id: 'g1', width: 60, height: 40, x: 10, y: 10 }),
        node({ id: 'g2', width: 80, height: 60, x: 40, y: 30 }),
        node({ id: 'g3', width: 50, height: 50, x: 70, y: 60 }),
      ],
    })
    sporeOverlapLayout(root)
    expect(root.children![0]!.x).toBe(8)
    expect(root.children![0]!.y).toBe(8)
    expect(root.children![1]!.x).toBeCloseTo(75.33333333333333, 9)
    expect(root.children![1]!.y).toBe(56)
    expect(root.children![2]!.x).toBeCloseTo(128.13333333333333, 9)
    expect(root.children![2]!.y).toBe(124)
    expect(root.width).toBeCloseTo(186.13333333333333, 9)
  })
})

describe('sporeCompactionLayout (ELK ShrinkTreeLayoutProvider)', () => {
  it('913 语义 (显式 x/y): 无重叠输入被压缩, 与 jar SporeMain 全等', () => {
    const root = node({
      id: 'root',
      width: 400, height: 300,
      children: [
        node({ id: 'g1', width: 60, height: 40, x: 20, y: 20 }),
        node({ id: 'g2', width: 80, height: 60, x: 160, y: 30 }),
        node({ id: 'g3', width: 50, height: 50, x: 30, y: 160 }),
        node({ id: 'g4', width: 70, height: 40, x: 200, y: 170 }),
      ],
    })
    sporeCompactionLayout(root)
    expect(root.children![0]!.x).toBe(8)
    expect(root.children![0]!.y).toBe(8)
    expect(root.children![1]!.x).toBe(76)
    expect(root.children![1]!.y).toBeCloseTo(8.400000000000006, 9)
    expect(root.children![2]!.x).toBeCloseTo(14.827586206896555, 9)
    expect(root.children![2]!.y).toBe(56)
    expect(root.children![3]!.x).toBeCloseTo(96.61538461538461, 9)
    expect(root.children![3]!.y).toBeCloseTo(76.4, 9)
    expect(root.width).toBeCloseTo(174.6153846153846, 9)
    expect(root.height).toBeCloseTo(124.4, 9)
  })

  it('2 个分离节点: 压缩到接触 (含 spacing 的 rect 邻接), 不重叠', () => {
    const root = node({
      id: 'root',
      children: [
        node({ id: 'a', width: 60, height: 40, x: 0, y: 0 }),
        node({ id: 'b', width: 60, height: 40, x: 300, y: 0 }),
      ],
    })
    sporeCompactionLayout(root)
    // 两节点沿水平方向压缩到 rect 恰好邻接 (spacing 8 → 中心距 = 60+8).
    const a = root.children![0]!
    const b = root.children![1]!
    expect((b.x ?? 0) - ((a.x ?? 0) + (a.width ?? 0))).toBeCloseTo(8, 9)
    expectNoOverlap(root.children!)
  })
})

describe('layoutElkJson spore 分派 (黑盒子树)', () => {
  it('子节点算法 sporeOverlap: 黑盒布局, 与 jar oracle 911 全等', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        node({
          id: 'group',
          width: 300, height: 200,
          layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.sporeOverlap' },
          children: [
            node({ id: 'g1', width: 60, height: 40, layoutOptions: { 'org.eclipse.elk.position': '(10, 10)' } }),
            node({ id: 'g2', width: 80, height: 60, layoutOptions: { 'org.eclipse.elk.position': '(40, 30)' } }),
            node({ id: 'g3', width: 50, height: 50, layoutOptions: { 'org.eclipse.elk.position': '(70, 60)' } }),
          ],
        }),
        node({ id: 'a', width: 40, height: 30 }),
      ],
      edges: [{ id: 'e0', sources: ['a'], targets: ['group'] }],
    })
    const out = layoutElkJson(root)
    const group = out.children!.find((c) => c.id === 'group')!
    const a = out.children!.find((c) => c.id === 'a')!
    expect(group.x).toBe(72)
    expect(group.y).toBe(12)
    expect(group.width).toBe(192)
    expect(group.height).toBe(124)
    expect(group.children![0]!.x).toBe(56)
    expect(group.children![0]!.y).toBe(8)
    expect(group.children![1]!.x).toBe(104)
    expect(group.children![1]!.y).toBe(56)
    expect(group.children![2]!.x).toBe(8)
    expect(group.children![2]!.y).toBe(56)
    expect(a.x).toBe(12)
    expect(a.y).toBe(59)
  })

  it('子节点算法 sporeCompaction: 黑盒布局, 与 jar oracle 913 全等', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        node({
          id: 'group',
          width: 400, height: 300,
          layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.sporeCompaction' },
          children: [
            node({ id: 'g1', width: 60, height: 40, layoutOptions: { 'org.eclipse.elk.position': '(20, 20)' } }),
            node({ id: 'g2', width: 80, height: 60, layoutOptions: { 'org.eclipse.elk.position': '(160, 30)' } }),
            node({ id: 'g3', width: 50, height: 50, layoutOptions: { 'org.eclipse.elk.position': '(30, 160)' } }),
            node({ id: 'g4', width: 70, height: 40, layoutOptions: { 'org.eclipse.elk.position': '(200, 170)' } }),
          ],
        }),
        node({ id: 'a', width: 40, height: 30 }),
      ],
      edges: [{ id: 'e0', sources: ['a'], targets: ['group'] }],
    })
    const out = layoutElkJson(root)
    const group = out.children!.find((c) => c.id === 'group')!
    expect(group.x).toBe(72)
    expect(group.y).toBe(12)
    expect(group.width).toBe(96)
    expect(group.height).toBe(76)
    for (const c of group.children!) {
      expect(c.x).toBe(8)
      expect(c.y).toBe(8)
    }
  })

  it('子节点算法 sporeOverlap 多节点 + 跨层边: 与 jar oracle 912 全等', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        node({
          id: 'group',
          width: 400, height: 300,
          layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.sporeOverlap' },
          children: [
            node({ id: 'g1', width: 70, height: 50, layoutOptions: { 'org.eclipse.elk.position': '(20, 20)' } }),
            node({ id: 'g2', width: 90, height: 40, layoutOptions: { 'org.eclipse.elk.position': '(60, 40)' } }),
            node({ id: 'g3', width: 50, height: 70, layoutOptions: { 'org.eclipse.elk.position': '(110, 30)' } }),
            node({ id: 'g4', width: 60, height: 60, layoutOptions: { 'org.eclipse.elk.position': '(50, 110)' } }),
            node({ id: 'g5', width: 80, height: 50, layoutOptions: { 'org.eclipse.elk.position': '(140, 90)' } }),
          ],
        }),
        node({ id: 'a', width: 40, height: 30 }),
        node({ id: 'b', width: 50, height: 40 }),
      ],
      edges: [
        { id: 'e0', sources: ['a'], targets: ['group'] },
        { id: 'e1', sources: ['group'], targets: ['b'] },
      ],
    })
    const out = layoutElkJson(root)
    const group = out.children!.find((c) => c.id === 'group')!
    expect(group.x).toBe(72)
    expect(group.y).toBe(12)
    expect(group.width).toBeCloseTo(301.02272727272725, 9)
    expect(group.height).toBeCloseTo(240.88771832547823, 9)
    expect(group.children![0]!.x).toBe(124)
    expect(group.children![0]!.y).toBeCloseTo(46.88771832547823, 9)
    expect(group.children![1]!.x).toBeCloseTo(203.02272727272728, 9)
    expect(group.children![1]!.y).toBe(8)
    expect(group.children![2]!.x).toBe(8)
    expect(group.children![2]!.y).toBeCloseTo(162.88771832547823, 9)
    expect(group.children![3]!.x).toBe(66)
    expect(group.children![3]!.y).toBeCloseTo(104.88771832547823, 9)
    expect(group.children![4]!.x).toBe(202)
    expect(group.children![4]!.y).toBe(56)
    expect(out.children!.find((c) => c.id === 'a')!.y).toBeCloseTo(117.44385916273912, 9)
    expect(out.children!.find((c) => c.id === 'b')!.x).toBeCloseTo(393.02272727272725, 9)
  })

  it('910 根算法 sporeOverlap: root 算法生效 (Java RecursiveGraphLayoutEngine 尊重 root 算法, R61 修复)', () => {
    // 修复前 layoutElkJson 强制 root layered (模拟 LayoutJsonMain harness 强制), 与 Java 真实行为不符;
    // Java RootAlgProbe 实测 root resolved = sporeOverlap, 输出 n1=(8,8) n2=(68.4,66) n3=(136.4,134) 重叠移除.
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.sporeOverlap' },
      children: [
        node({ id: 'n1', width: 100, height: 50, x: 10, y: 10 }),
        node({ id: 'n2', width: 80, height: 60, x: 40, y: 30 }),
        node({ id: 'n3', width: 60, height: 40, x: 70, y: 60 }),
      ],
    })
    const out = layoutElkJson(root)
    const byId = new Map(out.children!.map((c) => [c.id, c]))
    expect(byId.get('n1')!.x).toBeCloseTo(8, 6)
    expect(byId.get('n1')!.y).toBeCloseTo(8, 6)
    expect(byId.get('n2')!.x).toBeCloseTo(68.4, 6)
    expect(byId.get('n2')!.y).toBeCloseTo(66, 6)
    expect(byId.get('n3')!.x).toBeCloseTo(136.4, 6)
    expect(byId.get('n3')!.y).toBeCloseTo(134, 6)
  })
})
