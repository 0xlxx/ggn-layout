/**
 * 黑盒 group + NODE_LABELS（2026-08-15 移植缺陷修复）— 直接 vitest BDD.
 *
 * 缺陷: box/force/radial 黑盒节点带 labels + NODE_LABELS 约束时, layered 的
 * processNodeLabels 把节点尺寸**覆盖为标签盒**（因黑盒无 nested graph 被当扁平节点）,
 * provider 布局的内容尺寸丢失 → 容器被压扁、子节点溢出.
 * 对照权威: elkjs (ELK 0.12.0 GWT) — box 70×105 / force 140×240（= provider 内容尺寸）,
 * ggn 修复前 30（标签盒）; 差分实证容器 = provider 内容尺寸, NODE_LABELS 不压扁.
 */
import { describe, it, expect } from 'vitest'
import { layoutElkJson, type LayoutInput } from '../../src/api/elk-json.js'
import '../../src/api/register-all.js'

function blackBoxGraph(alg: string, labelW = 48, labelH = 20): LayoutInput {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: [
      {
        id: 'g',
        labels: [{ text: '组件库', width: labelW, height: labelH }],
        layoutOptions: {
          'org.eclipse.elk.algorithm': alg,
          'org.eclipse.elk.nodeLabels.placement': 'INSIDE H_CENTER V_TOP',
          'org.eclipse.elk.nodeSize.constraints': 'NODE_LABELS',
        },
        children: [
          { id: 'a', width: 40, height: 30 },
          { id: 'b', width: 40, height: 30 },
        ],
      },
    ],
    edges: [],
  }
}

interface Box { x?: number; y?: number; width?: number; height?: number }

describe('黑盒 group + NODE_LABELS（2026-08-15 移植缺陷修复）', () => {
  it.each(['box', 'force', 'radial'] as const)(
    '%s 黑盒 + labels + NODE_LABELS → 容器容纳内容、子节点不溢出',
    (alg) => {
      const out = layoutElkJson(blackBoxGraph(alg), { hierarchyHandling: 'INCLUDE_CHILDREN', layoutOptions: {} }) as unknown as {
        children?: Array<{ id: string; width: number; height: number; children?: Box[] }>
      }
      const g = out.children?.find((c) => c.id === 'g')
      expect(g).toBeDefined()
      if (g === undefined) throw new Error('g 缺失')
      // 容器不被压成标签盒高（内容 ≥ 2×30 + padding → 显著大于 label 高 20）
      expect(g.height).toBeGreaterThan(30)
      // 所有子节点完全在容器内（不溢出）
      for (const c of g.children ?? []) {
        expect((c.x ?? 0)).toBeGreaterThanOrEqual(0)
        expect((c.y ?? 0)).toBeGreaterThanOrEqual(0)
        expect((c.x ?? 0) + (c.width ?? 0)).toBeLessThanOrEqual(g.width + 0.01)
        expect((c.y ?? 0) + (c.height ?? 0)).toBeLessThanOrEqual(g.height + 0.01)
      }
    },
  )

  it('force 黑盒 + NODE_LABELS 容器尺寸与 elkjs 对齐（140×240 = provider 内容尺寸）', () => {
    const out = layoutElkJson(blackBoxGraph('force'), { hierarchyHandling: 'INCLUDE_CHILDREN', layoutOptions: {} }) as unknown as {
      children?: Array<{ id: string; width: number; height: number }>
    }
    const g = out.children?.find((c) => c.id === 'g')
    expect(g).toBeDefined()
    if (g === undefined) throw new Error('g 缺失')
    // elkjs 差分实证: force 黑盒 + NODE_LABELS → 140×240（内容尺寸）
    expect(g.width).toBeCloseTo(140, 0)
    expect(g.height).toBeCloseTo(240, 0)
  })

  it('扁平节点 + NODE_LABELS 仍覆盖为标签盒（isBlackBox 排除不误伤非黑盒）', () => {
    // 负向回归: 无子节点(非黑盒) + labels + NODE_LABELS → 尺寸 = 标签盒(ELK 扁平节点语义),
    // 防止 isBlackBox 条件过度排除导致扁平节点尺寸不被覆盖.
    const out = layoutElkJson({
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [{
        id: 'n',
        labels: [{ text: '标签', width: 60, height: 20 }],
        layoutOptions: {
          'org.eclipse.elk.nodeLabels.placement': 'INSIDE H_CENTER V_TOP',
          'org.eclipse.elk.nodeSize.constraints': 'NODE_LABELS',
        },
        width: 40,
        height: 30,
      }],
      edges: [],
    } as never, { hierarchyHandling: 'INCLUDE_CHILDREN', layoutOptions: {} }) as unknown as {
      children?: Array<{ id: string; width: number; height: number }>
    }
    const n = out.children?.find((c) => c.id === 'n')
    expect(n).toBeDefined()
    if (n === undefined) throw new Error('n 缺失')
    // 覆盖为标签盒宽（≥60 label 宽）而非保持输入 40
    expect(n.width).toBeGreaterThanOrEqual(60)
  })

  it('box 黑盒 + NODE_LABELS 容器尺寸与 elkjs 对齐（70×105 = provider 内容尺寸）', () => {
    const out = layoutElkJson(blackBoxGraph('box'), { hierarchyHandling: 'INCLUDE_CHILDREN', layoutOptions: {} }) as unknown as {
      children?: Array<{ id: string; width: number; height: number }>
    }
    const g = out.children?.find((c) => c.id === 'g')
    expect(g).toBeDefined()
    if (g === undefined) throw new Error('g 缺失')
    // elkjs 差分实证: box 黑盒 + NODE_LABELS → 70×105（内容尺寸, 非标签盒 30）
    expect(g.width).toBeCloseTo(70, 0)
    expect(g.height).toBeCloseTo(105, 0)
  })
})
