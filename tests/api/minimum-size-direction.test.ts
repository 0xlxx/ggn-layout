/**
 * 回归：容器节点的**非正方形**显式 nodeSize.minimum × 方向。
 *
 * 历史缺陷（2026-10）：容器 minimum 被合并进嵌套图 minimum（导入期原方向值，不随方向变换），
 * 同时 `LabelAndNodeSizeProcessor` 又把节点级 minimum 的**转置值**应用到容器尺寸 —— 同一个
 * minimum 在 canonical 的两个轴上各生效一次，`400×100` 的容器在 DOWN/UP 下被撑成 `400×400`。
 *
 * ELK 语义：容器尺寸的 minimum 由嵌套图 resize 应用一次，轴随布局方向（canonical）解释；
 * DOWN/UP 下 `minimum 400×100` 得到「高 400、宽按内容」的容器。
 */
import { describe, expect, it } from 'vitest'
import { layoutElkJson } from '../../src/api/index.js'

function layoutContainer(
  direction: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP',
  minimum: { x: number; y: number },
) {
  const graph = {
    id: 'root',
    layoutOptions: {
      'org.eclipse.elk.algorithm': 'org.eclipse.elk.layered',
      'org.eclipse.elk.edgeRouting': 'ORTHOGONAL',
      'org.eclipse.elk.padding': { top: 0, right: 0, bottom: 0, left: 0 },
    },
    children: [
      {
        id: 'sub',
        layoutOptions: {
          'org.eclipse.elk.nodeSize.constraints': ['MINIMUM_SIZE'],
          'org.eclipse.elk.nodeSize.minimum': minimum,
        },
        children: [{ id: 'a', width: 100, height: 75 }],
      },
    ],
  }
  const out = layoutElkJson(graph as never, {
    direction,
    hierarchyHandling: 'INCLUDE_CHILDREN',
  })
  const sub = out.children?.[0]
  return { width: sub?.width ?? 0, height: sub?.height ?? 0 }
}

describe('容器 nodeSize.minimum × direction（非正方形）', () => {
  it('RIGHT: minimum 400×100 → 宽 400、高按内容（100）', () => {
    const size = layoutContainer('RIGHT', { x: 400, y: 100 })
    expect(size.width).toBe(400)
    expect(size.height).toBe(100)
  })

  it('DOWN: minimum 400×100 → 高 400、宽按内容（不再是 400×400）', () => {
    const size = layoutContainer('DOWN', { x: 400, y: 100 })
    expect(size.height).toBe(400)
    expect(size.width).toBeLessThan(200)
  })

  it('UP: minimum 100×400 → 宽 400、高按内容（canonical 轴与最终轴互换）', () => {
    const size = layoutContainer('UP', { x: 100, y: 400 })
    expect(size.width).toBe(400)
    expect(size.height).toBe(100)
  })

  it('正方形 minimum 不受影响', () => {
    const size = layoutContainer('DOWN', { x: 100, y: 100 })
    expect(size.width).toBeLessThan(200)
    expect(size.height).toBe(100)
  })
})
