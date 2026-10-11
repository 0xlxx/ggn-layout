import { describe, expect, it } from 'vitest'
import {
  LayoutError,
  LayoutErrorCode,
  diffLayout,
  layoutElkJson,
  layoutJsonBatch,
  layoutJsonDiff,
} from '../../src/public.js'
import type { LayoutInput, LayoutOutput } from '../../src/public.js'

function graph(): LayoutInput {
  return {
    id: 'root',
    children: [
      { id: 'A', width: 40, height: 20 },
      { id: 'B', width: 40, height: 20 },
    ],
    edges: [{ id: 'e0', sources: ['A'], targets: ['B'] }],
  }
}

function positionedGraph(aX: number, aY: number, bX = 10, bY = 0): LayoutOutput {
  return {
    id: 'root',
    x: 0,
    y: 0,
    width: 100,
    height: 60,
    children: [
      { id: 'A', x: aX, y: aY, width: 20, height: 20 },
      { id: 'B', x: bX, y: bY, width: 20, height: 20 },
    ],
    edges: [{ id: 'e0', sources: ['A'], targets: ['B'], sections: [{ startPoint: { x: aX + 20, y: aY + 10 }, endPoint: { x: bX, y: bY + 10 } }] }],
  }
}

describe('复合布局 API', () => {
  it('batch 顺序执行、隔离失败，并保持输入不变', () => {
    const inputs: readonly LayoutInput[] = [
      graph(),
      { id: 'invalid', children: [{ id: 'A' }], edges: [{ sources: ['A'], targets: ['missing'] }] },
      graph(),
    ]
    const before = structuredClone(inputs)

    const result = layoutJsonBatch(inputs)

    expect(result.okCount).toBe(2)
    expect(result.errorCount).toBe(1)
    expect(result.items.map((item) => item.index)).toEqual([0, 1, 2])
    expect(result.items[0]?.ok).toBe(true)
    expect(result.items[1]?.ok).toBe(false)
    expect(result.items[1]?.error).toBeInstanceOf(LayoutError)
    expect(result.items[1]?.error?.code).toBe(LayoutErrorCode.DANGLING_ENDPOINT)
    expect(result.items[2]?.ok).toBe(true)
    expect(result.items[0]?.output?.children?.map(({ id, x, y }) => ({ id, x, y }))).toEqual([
      { id: 'A', x: 12, y: 12 },
      { id: 'B', x: 72, y: 12 },
    ])
    expect(inputs).toEqual(before)
  })

  it('diff 按节点坐标计算位移，并统计未变化节点', () => {
    const before = positionedGraph(0, 0)
    const after = positionedGraph(3, 4)

    const diff = diffLayout(before, after)

    expect(diff.changedNodes).toEqual([{ id: 'A', before: { x: 0, y: 0 }, after: { x: 3, y: 4 }, distance: 5 }])
    expect(diff.unchangedNodes).toBe(2)
    expect(diff.changedEdges).toEqual([{ id: 'e0', routeChanged: true }])
    expect(diff.unchangedEdges).toBe(0)
    expect(diff.maxNodeDistance).toBe(5)
  })

  it('diff 无变化时返回全 0 变化统计', () => {
    const layout = positionedGraph(0, 0)
    const diff = diffLayout(layout, structuredClone(layout))

    expect(diff.changedNodes).toEqual([])
    expect(diff.changedEdges).toEqual([])
    expect(diff.unchangedNodes).toBe(3)
    expect(diff.unchangedEdges).toBe(1)
    expect(diff.maxNodeDistance).toBe(0)
  })

  it('layoutJsonDiff 重新布局后只报告 previous 中移动的节点', () => {
    const input = graph()
    const previous = layoutElkJson(input) as LayoutOutput
    const changedPrevious = structuredClone(previous)
    changedPrevious.children![0]!.x += 10

    const diff = layoutJsonDiff(input, changedPrevious)

    expect(diff.changedNodes).toHaveLength(1)
    expect(diff.changedNodes[0]?.id).toBe('A')
    expect(diff.changedNodes[0]?.distance).toBe(10)
    expect(diff.unchangedNodes).toBe(2)
  })

  it('control 按阶段报告进度，正常调用不抛；已 abort 时抛 ABORTED', () => {
    const phases: string[] = []
    expect(() => layoutElkJson(graph(), { control: { onProgress: (event) => phases.push(event.phase) } })).not.toThrow()
    expect(phases).toEqual(['validate', 'clone', 'dispatch', 'extract', 'format'])

    const controller = new AbortController()
    controller.abort()
    try {
      layoutElkJson(graph(), { control: { signal: controller.signal } })
      expect.unreachable('expected abort')
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutError)
      expect((error as LayoutError).code).toBe(LayoutErrorCode.ABORTED)
      expect((error as LayoutError).phase).toBe('validate')
    }
  })

  it('新增控制与复合类型命名不包含 ELK/Elk', () => {
    const names = ['LayoutPhase', 'LayoutProgressEvent', 'LayoutControl', 'LayoutBatchItem', 'LayoutBatchResult', 'LayoutDiff', 'LayoutNodeDelta', 'LayoutEdgeDelta']
    expect(names.every((name) => !name.includes('ELK') && !name.includes('Elk'))).toBe(true)
  })
})
