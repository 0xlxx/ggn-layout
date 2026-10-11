/**
 * P1 输出契约 BDD（集成层）。
 *
 * 覆盖评审决策要求的契约：full 保真、concise 不丢未路由边、summary 规则
 * （不含 root / 只含已路由边）、pick 字段裁剪、确定性。
 */
import { describe, expect, it } from 'vitest'
import { layoutElkJson } from '../../src/public.js'
import type { LayoutOutput, LayoutSummary } from '../../src/public.js'

function boxGraph() {
  return {
    id: 'root',
    children: [
      {
        id: 'box1',
        layoutOptions: { 'org.eclipse.elk.algorithm': 'box' },
        children: [
          { id: 'b1', width: 30, height: 20 },
          { id: 'b2', width: 30, height: 20 },
        ],
        edges: [{ id: 'internal-e', sources: ['b1'], targets: ['b2'] }],
      },
      { id: 'N', width: 40, height: 20 },
    ],
    edges: [{ id: 'root-e', sources: ['box1'], targets: ['N'] }],
  }
}

describe('responseFormat=full（默认，P0 保真）', () => {
  it('自定义节点/边字段保留（full 保真契约）', () => {
    const input = {
      id: 'root',
      children: [{ id: 'A', width: 40, height: 20, custom: 'keep-me', properties: { color: 'red' } }],
      edges: [{ id: 'e1', sources: ['A'], targets: ['A'], meta: 42 }],
    }
    const out = layoutElkJson(input) as LayoutOutput
    const a = out.children![0]!
    expect(a.custom).toBe('keep-me')
    expect(a.properties).toEqual({ color: 'red' })
    expect(out.edges![0]!.meta).toBe(42)
  })

  it('空图（仅 root）：输出 root 几何为有限数值', () => {
    const out = layoutElkJson({ id: 'root' })
    expect(Number.isFinite(out.x)).toBe(true)
    expect(Number.isFinite(out.y)).toBe(true)
    expect(Number.isFinite(out.width)).toBe(true)
    expect(Number.isFinite(out.height)).toBe(true)
  })

  it('确定性：同一输入连续两次 full 输出深相等', () => {
    const input = boxGraph()
    expect(JSON.stringify(layoutElkJson(input))).toBe(JSON.stringify(layoutElkJson(input)))
  })
})

describe('responseFormat=concise（省 token）', () => {
  it('节点只保留几何字段', () => {
    const input = {
      id: 'root',
      children: [{ id: 'A', width: 40, height: 20, custom: 'drop', ports: [{ id: 'p' }] }],
      edges: [],
    }
    const out = layoutElkJson(input, { responseFormat: 'concise' }) as LayoutOutput
    const a = out.children![0]!
    expect(Object.keys(a).sort()).toEqual(['height', 'id', 'width', 'x', 'y'])
    expect((a as Record<string, unknown>).custom).toBeUndefined()
  })

  it('未路由边（无 sections）保留结构，不静默丢弃', () => {
    const out = layoutElkJson(boxGraph(), { responseFormat: 'concise' }) as LayoutOutput
    const box = out.children!.find((c) => c.id === 'box1')!
    const internal = (box.edges ?? []).find((e) => e.id === 'internal-e')
    expect(internal).toBeDefined()
    expect(internal!.sources).toEqual(['b1'])
    expect(internal!.targets).toEqual(['b2'])
    expect(internal!.sections).toBeUndefined()
    // 已路由边保留端点，去掉 bendPoints
    const routed = (out.edges ?? []).find((e) => e.id === 'root-e')!
    expect(routed.sections![0]!.startPoint).toBeDefined()
    expect(routed.sections![0]!.bendPoints).toBeUndefined()
  })
})

describe('responseFormat=summary（扁平摘要）', () => {
  it('不含 root 自身；只含已路由单源单目标边', () => {
    const summary = layoutElkJson(boxGraph(), { responseFormat: 'summary' }) as LayoutSummary
    const ids = summary.nodes.map((n) => n.id)
    expect(ids).toContain('box1')
    expect(ids).toContain('N')
    expect(ids).not.toContain('root')
    // 内部未路由边不进摘要；root-e 已路由进摘要
    const edgeIds = summary.edges.map((e) => e.id)
    expect(edgeIds).toContain('root-e')
    expect(edgeIds).not.toContain('internal-e')
    for (const e of summary.edges) {
      expect(e.startPoint).toBeDefined()
      expect(e.endPoint).toBeDefined()
    }
  })
})

describe('pick（仅 full 生效）', () => {
  it('追加保留指定节点字段', () => {
    const input = {
      id: 'root',
      children: [{ id: 'A', width: 40, height: 20, custom: 'drop', layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' } }],
      edges: [],
    }
    const out = layoutElkJson(input, { pick: ['layoutOptions'] }) as LayoutOutput
    const a = out.children![0]!
    expect((a as Record<string, unknown>).layoutOptions).toBeDefined()
    expect((a as Record<string, unknown>).custom).toBeUndefined()
    expect(a.x).toBeDefined()
  })

  it('与 concise 同传时 concise 固定裁剪优先（pick 被忽略）', () => {
    const input = {
      id: 'root',
      children: [{ id: 'A', width: 40, height: 20, custom: 'drop' }],
      edges: [],
    }
    const out = layoutElkJson(input, { responseFormat: 'concise', pick: ['custom'] }) as LayoutOutput
    const a = out.children![0]!
    expect((a as Record<string, unknown>).custom).toBeUndefined()
  })
})
