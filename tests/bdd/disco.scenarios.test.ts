/**
 * disco 布局算法 (ELK alg.disco 0.12.0 移植) — 直接 vitest BDD.
 *
 * 被测: src/disco/ (DisCoLayoutProvider + DisCoPolyominoCompactor + ElkGraphTransformer +
 * ElkGraphComponentsProcessor + alg.common polyomino 公共部分).
 * 对照权威: ELK 0.12.0 jar (verify-elkg-java-layout 对 940-942 触发模型全等).
 * 语义不变量 (与 Java 一致):
 *   - 各连通分量栅格化为 polyomino 打包: 分量间不重叠且留 spacing (默认 20);
 *   - 同分量内所有元素共享同一偏移 → 分量内相对位置不变 (输入坐标全 0 时同分量节点重合, Java 同);
 *   - 父节点尺寸 = 打包网格包围盒 × 网格步长 + padding (默认 12);
 *   - 内部边无 section 时创建退化 section (firstEdgeSection createEdgeSection 语义), 不崩溃.
 */
import { describe, it, expect } from 'vitest'
import { discoLayout } from '../../src/disco/disco-layout.js'
import type { ElkNode } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js' // 非 layered provider 注册 (测试需全部算法)

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

describe('discoLayout (ELK DisCoLayoutProvider)', () => {
  it('940 模型: 3 个独立分量打包, 与 jar 直出逐位全等 (g1(89.0219,22.5078) g2(79.0219,89.0219) g3(13.2570,13.2570))', () => {
    const group = node({
      id: 'group',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.disco' },
      children: [
        node({ id: 'g1', width: 60, height: 40 }),
        node({ id: 'g2', width: 80, height: 60 }),
        node({ id: 'g3', width: 50, height: 50 }),
      ],
    })
    discoLayout(group)
    // Java jar 直出 (940 oracle, 输入坐标全 0, spacing=20 padding=12):
    expect(group.children![0]!.x).toBeCloseTo(89.02195321372741, 9)
    expect(group.children![0]!.y).toBeCloseTo(22.50784043347408, 9)
    expect(group.children![1]!.x).toBeCloseTo(79.02195321372741, 9)
    expect(group.children![1]!.y).toBeCloseTo(89.02195321372741, 9)
    expect(group.children![2]!.x).toBeCloseTo(13.257056390126671, 9)
    expect(group.children![2]!.y).toBeCloseTo(13.257056390126671, 9)
    expectNoOverlap(group.children!)
  })

  it('不变量: 分量间互不重叠且满足最小间距 (gridCell ≥ 分量半周长启发式, spacing 语义)', () => {
    const group = node({
      id: 'group',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.disco' },
      children: [
        node({ id: 'a', width: 40, height: 30 }),
        node({ id: 'b', width: 70, height: 50 }),
        node({ id: 'c', width: 60, height: 80 }),
        node({ id: 'd', width: 30, height: 30 }),
        node({ id: 'e', width: 90, height: 40 }),
      ],
    })
    discoLayout(group)
    expectNoOverlap(group.children!)
    // 分量不共享 offset (独立打包 → 各自偏移不同)
    const offsets = new Set(group.children!.map((c) => `${c.x},${c.y}`))
    expect(offsets.size).toBe(5)
  })

  it('941 模型: 内部边把 g1/g2 连成同一分量 → 共享同一偏移 (输入坐标全 0 时节点重合, Java 同)', () => {
    const group = node({
      id: 'group',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.disco' },
      children: [
        node({ id: 'g1', width: 60, height: 40 }),
        node({ id: 'g2', width: 80, height: 60 }),
        node({ id: 'g3', width: 50, height: 50 }),
      ],
      edges: [{ id: 'e0', sources: ['g1'], targets: ['g2'] }],
    })
    discoLayout(group)
    // Java jar 直出 (941 oracle): g1/g2 同分量同偏移; g3 独立分量.
    expect(group.children![0]!.x).toBeCloseTo(67.16041308370421, 9)
    expect(group.children![0]!.y).toBeCloseTo(10.09140490638908, 9)
    expect(group.children![1]!.x).toBeCloseTo(67.16041308370421, 9)
    expect(group.children![1]!.y).toBeCloseTo(10.09140490638908, 9)
    expect(group.children![2]!.x).toBeCloseTo(10.636804361234738, 9)
    expect(group.children![2]!.y).toBeCloseTo(90.8196141740129, 9)
    // 内部边: 无 section 时创建退化 section (firstEdgeSection createEdgeSection), 不崩溃且被平移.
    expect(group.edges![0]!.sections).toBeDefined()
    expect(group.edges![0]!.sections![0]!.startPoint.x).toBeCloseTo(67.16041308370421, 9)
  })

  it('942 模型: 多分量混合 + 父尺寸 = 网格包围盒 × 步长 + padding', () => {
    const group = node({
      id: 'group',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.disco' },
      children: [
        node({ id: 'g1', width: 30, height: 20 }),
        node({ id: 'g2', width: 100, height: 60 }),
        node({ id: 'g3', width: 40, height: 80 }),
        node({ id: 'g4', width: 70, height: 30 }),
      ],
      edges: [
        { id: 'e0', sources: ['g1'], targets: ['g3'] },
        { id: 'e1', sources: ['g3'], targets: ['g4'] },
      ],
    })
    discoLayout(group)
    // Java jar 直出 (942 oracle): 分量1={g1,g3,g4} 重合, 分量2={g2}.
    expect(group.children![0]!.x).toBeCloseTo(13.452134072465043, 9)
    expect(group.children![2]!.x).toBeCloseTo(13.452134072465043, 9)
    expect(group.children![3]!.x).toBeCloseTo(13.452134072465043, 9)
    expect(group.children![1]!.x).toBeCloseTo(78.53902419324012, 9)
    // 父尺寸 = 包围盒 + padding(12*2): jar 直出 216.81 x 163.25
    expect(group.width).toBeCloseTo(216.80853628986017, 9)
    expect(group.height).toBeCloseTo(163.25060954267678, 9)
  })

  it('空 children: 不崩溃 (Java importGraph 空分量, 打包空集合)', () => {
    const group = node({
      id: 'group',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.disco' },
      children: [],
    })
    expect(() => discoLayout(group)).not.toThrow()
  })

  it('单分量: 打包后仅受 padding 影响, 节点位置不变 (分量单例 offset=0 附近)', () => {
    const group = node({
      id: 'group',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.disco' },
      children: [
        node({ id: 'a', width: 60, height: 40 }),
        node({ id: 'b', width: 40, height: 30 }),
      ],
      edges: [{ id: 'e0', sources: ['a'], targets: ['b'] }],
    })
    discoLayout(group)
    // 同分量 → 同一偏移
    expect(group.children![0]!.x).toBe(group.children![1]!.x)
    expect(group.children![0]!.y).toBe(group.children![1]!.y)
  })
})
