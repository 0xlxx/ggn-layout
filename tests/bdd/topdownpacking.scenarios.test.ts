/**
 * topdownpacking 布局算法 (ELK alg.topdownpacking 0.12.0 移植) — 直接 vitest BDD.
 *
 * 被测: src/topdownpacking/ (TopdownpackingLayoutProvider + P1 节点放置 + P2 空白消除).
 * 对照权威: ELK 0.12.0 (verify-elkg-java-layout 对 900/901/902 触发模型全等).
 * 语义不变量 (与 Java 一致):
 *   - 按拓扑序 (children 顺序) 从左到右、从上到下网格放置, 网格 = 正方形 + 移除底部空行;
 *   - 子节点统一尺寸 = topdown.hierarchicalNodeWidth × (width / hierarchicalNodeAspectRatio)
 *     (默认 150 × 106.082 = 150/1.414, 父节点预知尺寸);
 *   - P2 水平扩展: 底部行末节点右侧有空白 → 该行节点均分加宽并右移 (填满父宽度);
 *   - P2 纵向扩展: 首列底部有空白 → 所有节点均分加高并下移 (填满父高度);
 *   - 父节点尺寸 = max(输入, 预测尺寸) (standalone 用法, 同 Java setDimensions).
 */
import { describe, it, expect } from 'vitest'
import { topdownPackingLayout } from '../../src/topdownpacking/topdown-packing-layout.js'
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

describe('topdownPackingLayout (ELK TopdownpackingLayoutProvider)', () => {
  it('3 个子节点: 2x2 网格按拓扑序放置 + 父尺寸 = 预测尺寸 (与 jar oracle 900 standalone 全等)', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })],
    })
    topdownPackingLayout(root)
    // cols=2, rows=2 (3 > 2*2-2); 节点统一 150 x 106.082 (默认 W=150, A=1.414).
    expect(root.children![0]!.x).toBe(12)
    expect(root.children![0]!.y).toBe(12)
    expect(root.children![0]!.width).toBe(150)
    expect(root.children![0]!.height).toBeCloseTo(150 / 1.414, 9)
    // 拓扑序: 第 2 个在 (182,12), 第 3 个换行到 (12, 12+106.082+20).
    expect(root.children![1]!.x).toBe(182)
    expect(root.children![1]!.y).toBe(12)
    expect(root.children![2]!.x).toBe(12)
    expect(root.children![2]!.y).toBeCloseTo(12 + 150 / 1.414 + 20, 9)
    // 父尺寸 = 预测 (2 列 150 + 左右 padding 12 + 列间距 20 = 344; 高 = 2*106.082+24+20).
    expect(root.width).toBe(344)
    expect(root.height).toBeCloseTo(2 * (150 / 1.414) + 24 + 20, 9)
  })

  it('底部行水平扩展填空白: 3 节点末行节点加宽到 320 (jar oracle 900 全等)', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' })],
    })
    topdownPackingLayout(root)
    // 末行 [c] 右边界 12+150=162, 162+12 < 344 → extraSpace=170 全给 c → 320.
    expect(root.children![2]!.width).toBe(320)
    expect(root.children![2]!.x).toBe(12)
    // 前两行末节点右边界 332+12 = 344 无空白 → 不扩张.
    expect(root.children![1]!.width).toBe(150)
  })

  it('5 个子节点: 3x2 网格, 末行 2 节点均分水平扩展 (235 每节点)', () => {
    const root = node({
      id: 'root',
      children: [node({ id: 'a' }), node({ id: 'b' }), node({ id: 'c' }), node({ id: 'd' }), node({ id: 'e' })],
    })
    topdownPackingLayout(root)
    // cols=3 (ceil sqrt 5), rows=2 (5 ≤ 9-3); 首行 3 节点 x=12/182/352.
    expect(root.children![0]!.x).toBe(12)
    expect(root.children![1]!.x).toBe(182)
    expect(root.children![2]!.x).toBe(352)
    // 末行 [d,e]: 右边界 332+12=344 < 514 → extraSpace=170/2=85 → 235 宽 + 右移 85.
    expect(root.children![3]!.x).toBe(12)
    expect(root.children![3]!.width).toBe(235)
    expect(root.children![4]!.x).toBe(267)
    expect(root.children![4]!.width).toBe(235)
    expect(root.width).toBe(514)
  })

  it('纵向空白消除: 父高度 200 > 预测 130.08 → 节点均分加高下移 (2 节点每节点 +34.96)', () => {
    const root = node({
      id: 'root',
      height: 200,
      children: [node({ id: 'a' }), node({ id: 'b' })],
    })
    topdownPackingLayout(root)
    // rows=1 (2 ≤ 4-2); 预测高 = 106.082+24 = 130.08, 输入高 200 → 纵向 extraSpace = 69.92.
    expect(root.height).toBe(200)
    const extraSpacePerNode = (200 - (12 + 150 / 1.414 + 12)) / 2
    expect(root.children![0]!.height).toBeCloseTo(150 / 1.414 + extraSpacePerNode, 9)
    expect(root.children![0]!.y).toBe(12)
    expect(root.children![1]!.y).toBeCloseTo(12 + extraSpacePerNode, 9)
    expect(root.children![1]!.height).toBeCloseTo(150 / 1.414 + extraSpacePerNode, 9)
  })

  it('任意数量子节点: 两两不重叠 (盒子不重叠不变量)', () => {
    const root = node({
      id: 'root',
      children: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => node({ id })),
    })
    topdownPackingLayout(root)
    expectNoOverlap(root.children ?? [])
  })

  it('自定义选项 (padding 8 / spacing 10 / W 80 / A 2): 与 jar oracle 902 standalone 全等', () => {
    const root = node({
      id: 'root',
      layoutOptions: {
        'org.eclipse.elk.padding': '[top=8,left=8,bottom=8,right=8]',
        'org.eclipse.elk.spacing.nodeNode': '10',
        'org.eclipse.elk.topdown.hierarchicalNodeWidth': '80',
        'org.eclipse.elk.topdown.hierarchicalNodeAspectRatio': '2',
      },
      children: [node({ id: 'g1' }), node({ id: 'g2' }), node({ id: 'g3' }), node({ id: 'g4' }), node({ id: 'g5' })],
    })
    topdownPackingLayout(root)
    // cols=3, rows=2; 节点 80x40; 预测宽 = 3*80+16+2*10 = 276, 高 = 2*40+16+10 = 106.
    expect(root.width).toBe(276)
    expect(root.height).toBe(106)
    expect(root.children![0]!.x).toBe(8)
    expect(root.children![0]!.y).toBe(8)
    expect(root.children![0]!.width).toBe(80)
    expect(root.children![0]!.height).toBe(40)
    // 末行 [g4,g5]: 右边界 98+80+8 = 186 < 276 → extraSpace=90/2=45 → 各 125 宽, g5 右移 45.
    expect(root.children![3]!.width).toBe(125)
    expect(root.children![4]!.width).toBe(125)
    expect(root.children![4]!.x).toBe(143)
  })

  it('空 children: 不崩溃, 网格 0x0 (Java 同: cols=0 → 直接跳过 P2)', () => {
    const root = node({ id: 'root', children: [] })
    topdownPackingLayout(root)
    // 预测尺寸 (cols=0): 0*150 + 24 + (0-1)*20 = 4 → 父尺寸 4x4 (Java 同).
    expect(root.width).toBe(4)
    expect(root.height).toBe(4)
  })

  it('未知策略: 抛 Java 同文案错误', () => {
    const root = node({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.topdownpacking.nodeArrangement.strategy': 'SOME_OTHER_PLACER' },
      children: [node({ id: 'a' })],
    })
    expect(() => topdownPackingLayout(root)).toThrow(/No implementation is available for the node placer/)
  })
})

describe('layoutElkJson topdownpacking 分派 (黑盒子树)', () => {
  it('子节点算法 topdownpacking: 作为黑盒布局, 与 jar oracle 901 全等', () => {
    const root = node({
      id: 'root',
      children: [
        node({
          id: 'group',
          layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.topdownpacking' },
          children: [node({ id: 'g1' }), node({ id: 'g2' }), node({ id: 'g3' })],
        }),
        node({ id: 'a' }),
      ],
      edges: [{ id: 'e0', sources: ['a'], targets: ['group'] }],
    })
    const out = layoutElkJson(root)
    const group = out.children!.find((c) => c.id === 'group')!
    const a = out.children!.find((c) => c.id === 'a')!
    // jar oracle 901: group(92,12,344x256.16), g1..g3 网格放置, a(12,125.08).
    expect(group.x).toBe(92)
    expect(group.y).toBe(12)
    expect(group.width).toBe(344)
    expect(group.height).toBeCloseTo(256.16407355021215, 9)
    expect(group.children![0]!.x).toBe(12)
    expect(group.children![0]!.y).toBe(12)
    expect(group.children![1]!.x).toBe(182)
    expect(group.children![2]!.x).toBe(12)
    expect(group.children![2]!.y).toBeCloseTo(138.08203677510608, 9)
    expect(a.x).toBe(12)
    expect(a.y).toBeCloseTo(125.08203677510608, 9)
  })

  it('子节点算法 topdownpacking + 内部边: 内部边不进 layered 图, 原样保留在节点 (jar oracle 902)', () => {
    const root = node({
      id: 'root',
      children: [
        node({
          id: 'group',
          layoutOptions: {
            'org.eclipse.elk.algorithm': 'org.eclipse.elk.topdownpacking',
            'org.eclipse.elk.padding': '[top=8,left=8,bottom=8,right=8]',
            'org.eclipse.elk.spacing.nodeNode': '10',
            'org.eclipse.elk.topdown.hierarchicalNodeWidth': '80',
            'org.eclipse.elk.topdown.hierarchicalNodeAspectRatio': '2',
          },
          children: [node({ id: 'g1' }), node({ id: 'g2' }), node({ id: 'g3' }), node({ id: 'g4' }), node({ id: 'g5' })],
        }),
        node({ id: 'a' }),
        node({ id: 'b' }),
      ],
      edges: [
        { id: 'e0', sources: ['group.g1'], targets: ['group.g2'] },
        { id: 'e1', sources: ['group.g3'], targets: ['group.g4'] },
        { id: 'e2', sources: ['group.g2'], targets: ['group.g5'] },
        { id: 'e3', sources: ['a'], targets: ['group'] },
        { id: 'e4', sources: ['group'], targets: ['b'] },
      ],
    })
    const out = layoutElkJson(root)
    const group = out.children!.find((c) => c.id === 'group')!
    // 内部边挂在 group.edges 且无 sections (topdown 不动边; jar 同).
    expect(group.edges ?? []).toHaveLength(3)
    for (const e of group.edges ?? []) expect(e.sections ?? []).toHaveLength(0)
    // 跨层级边由 layered 路由, 挂在 root.edges.
    expect((out.edges ?? []).filter((e) => (e.sections?.length ?? 0) > 0)).toHaveLength(2)
    expect(group.x).toBe(92)
    expect(group.y).toBe(12)
    expect(group.width).toBe(276)
    expect(group.children![4]!.width).toBe(125)
  })
})
