/**
 * 移植自 ELK Java: issues/Issue682Test.java
 * 参数化 4 方向: NODE_LABELS 尺寸约束 + 标签内边距 → 标签位置与节点宽度.
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode } from '../../src/index.js'
import { DIRECTION, EDGE_ROUTING, NODE_LABELS_PADDING, NODE_SIZE_CONSTRAINTS, NODE_LABELS_PLACEMENT } from '../../src/options/layered-options.js'
import { LayeredLayoutProvider, NullProgressMonitor } from '../../src/layered-layout-provider.js'

function run(direction: string): { labelX: number, labelY: number, nodeWidth: number } {
  const g = new LGraph()
  g.setProperty(DIRECTION, direction as never)
  g.setProperty(EDGE_ROUTING, 'ORTHOGONAL')
  g.setProperty(NODE_LABELS_PADDING, { top: 21, right: 32, bottom: 43, left: 54 })

  const parent = new LNode(g)
  parent.setProperty(NODE_SIZE_CONSTRAINTS, ['NODE_LABELS'])
  parent.setProperty(NODE_LABELS_PLACEMENT, ['INSIDE', 'H_CENTER', 'V_TOP'])
  parent.setLabels([{ text: 'foobar', position: { x: 0, y: 0 }, size: { x: 23, y: 22 } }])

  new LayeredLayoutProvider().layout(g, new NullProgressMonitor())
  const label = parent.getLabels()[0]!
  return { labelX: label.position.x, labelY: label.position.y, nodeWidth: parent.size.x }
}

describe('Issue682Test (ELK Java 移植)', () => {
  it.each(['RIGHT', 'DOWN', 'UP', 'LEFT'])('direction %s', (dir) => {
    const r = run(dir)
    expect(r.labelX).toBeCloseTo(54, 3)
    expect(r.labelY).toBeCloseTo(21, 3)
    expect(r.nodeWidth).toBeCloseTo(r.labelX + 23 + 32, 3)
  })
})
