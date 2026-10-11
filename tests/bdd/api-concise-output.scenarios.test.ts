import { describe, expect, it } from 'vitest'
import { layoutElkJson, type LayoutInput } from '../../src/api/index.js'

function graph(): LayoutInput {
  return {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
    properties: { 'root.meta': 'keep-in-full' },
    children: [
      {
        id: 'A',
        width: 40,
        height: 20,
        labels: [{ text: 'Alpha', x: 1, y: 2, width: 10, height: 8 }],
        ports: [{ id: 'A.out', x: 40, y: 6, width: 4, height: 8 }],
        properties: { 'node.meta': true },
        customField: 'keep-in-full',
      },
      { id: 'B', width: 40, height: 20 },
    ],
    edges: [{
      id: 'e0',
      sources: ['A'],
      targets: ['B'],
      labels: [{ text: 'edge-label' }],
      layoutOptions: { 'org.eclipse.elk.edgeRouting': 'ORTHOGONAL' },
      properties: { 'edge.meta': 'drop-in-concise' },
    }],
  }
}

describe('layoutElkJson responseFormat', () => {
  it('full 保留 JSON 元数据，concise 只保留布局几何与边首段端点', () => {
    const input = graph()
    const before = structuredClone(input)
    const full = layoutElkJson(input)
    const concise = layoutElkJson(input, { responseFormat: 'concise' })

    expect(input).toEqual(before)
    expect(full.properties).toEqual({ 'root.meta': 'keep-in-full' })
    expect(full.children?.[0]?.ports).toHaveLength(1)
    expect(full.children?.[0]?.labels?.[0]?.text).toBe('Alpha')
    expect((full.children?.[0] as unknown as Record<string, unknown>).customField).toBe('keep-in-full')
    expect(full.edges?.[0]?.labels?.[0]?.text).toBe('edge-label')

    expect(Object.keys(concise)).toEqual(['id', 'x', 'y', 'width', 'height', 'children', 'edges'])
    expect(concise.children?.[0]).toEqual({ id: 'A', x: 16, y: 12, width: 40, height: 20 })
    expect(concise.children?.[1]).toEqual({ id: 'B', x: 96, y: 12, width: 40, height: 20 })
    expect(Object.keys(concise.edges?.[0] ?? {})).toEqual(['id', 'sources', 'targets', 'sections'])
    expect(concise.edges?.[0]).toEqual({
      id: 'e0',
      sources: ['A'],
      targets: ['B'],
      sections: [{ startPoint: { x: 56, y: 22 }, endPoint: { x: 96, y: 22 } }],
    })
    expect(concise.children?.[0]).not.toHaveProperty('ports')
    expect(concise.edges?.[0]).not.toHaveProperty('labels')
    expect(concise.edges?.[0]).not.toHaveProperty('layoutOptions')
  })

  it('summary 扁平收集节点与首段端点，并保持相对坐标', () => {
    const summary = layoutElkJson(graph(), { responseFormat: 'summary' })

    expect(summary.nodes).toEqual([
      { id: 'A', x: 16, y: 12, width: 40, height: 20 },
      { id: 'B', x: 96, y: 12, width: 40, height: 20 },
    ])
    expect(summary.edges).toEqual([{
      id: 'e0',
      sources: ['A'],
      targets: ['B'],
      startPoint: { x: 56, y: 22 },
      endPoint: { x: 96, y: 22 },
    }])
    expect(summary.width).toBe(148)
    expect(summary.height).toBe(44)
  })

  it('相同输入重复布局结果确定且不写回输入', () => {
    const input = graph()
    const before = structuredClone(input)
    const first = layoutElkJson(input, { responseFormat: 'concise' })
    const second = layoutElkJson(input, { responseFormat: 'concise' })

    expect(second).toEqual(first)
    expect(input).toEqual(before)
  })
})
