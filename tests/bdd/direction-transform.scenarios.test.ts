/**
 * GraphTransformer 方向变换 (R16: compound/realworld 图非 RIGHT 方向与 Java 全等).
 *
 * 语义基准 = ELK Java 0.12.0 GraphTransformer.java (逐符号):
 *   - transposeProperties: NODE_SIZE_MINIMUM 转置 (w↔h) + ALIGNMENT 转置 + POSITION 转置;
 *   - transposeNodeLabelPlacement: H/V 对齐互换, 非空无 INSIDE 补 OUTSIDE, 无 H_PRIORITY 补 H_PRIORITY;
 *   - mirrorX/Y: H_LEFT↔H_RIGHT / V_TOP↔V_BOTTOM, ALIGNMENT LEFT↔RIGHT / TOP↔BOTTOM, POSITION 镜像;
 *   - transposeEdgeLabelPlacement: edgeLabels.sideSelection UP↔DOWN.
 *
 * 实证: 476_multiLabelInVerticalLayout (DOWN + MINIMUM_SIZE) 修复前 ggn 200x200 vs jar 200x100;
 *   blindCommunication 4 方向修复前 LEFT 29/51 DOWN/UP 51/51 → 修复后全部 51/51 全等.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseElkt, elktToElkJson } from '../../scripts/elkt2test.mjs'
import { layoutElkJson, type ElkNode } from '../../src/api/index.js'
import { LGraph } from '../../src/graph/lgraph.js'
import { LNode } from '../../src/graph/lnode.js'
import { Direction } from '../../src/graph/enums.js'
import { DIRECTION, NODE_SIZE_MINIMUM, POSITION, ALIGNMENT, NODE_LABELS_PLACEMENT } from '../../src/options/layered-options.js'
import { GraphTransformer, TransformMode } from '../../src/intermediate/graph-transformer.js'

const MODEL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../test-resources/elk-models')

function layout(model: string, direction?: 'RIGHT' | 'LEFT' | 'DOWN' | 'UP'): ElkNode {
  const json: any = elktToElkJson(parseElkt(readFileSync(join(MODEL_ROOT, model), 'utf8')))
  return layoutElkJson(json, direction ? { direction } : undefined)
}

function node(root: ElkNode, id: string): { x: number; y: number; width: number; height: number } | null {
  const walk = (n: ElkNode): any => {
    if (n.id === id) return { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 }
    for (const c of n.children ?? []) { const r = walk(c); if (r !== null) return r }
    return null
  }
  return walk(root)
}

/** placement tokens 规范化排序 (顺序不影响语义, 消费方用 includes). */
const sorted = (tokens: string[]): string => [...tokens].sort().join(',')

describe('GraphTransformer 方向变换 (R16)', () => {
  it('476: DOWN + MINIMUM_SIZE 节点尺寸与 Java 全等 (200x100, 层间距 120)', () => {
    const g = layout('tickets/layered/476_multiLabelInVerticalLayout.elkt')
    // jar 0.12.0: Node1=(12,12,200,100) Node2=(12,132,200,100) Node3=(12,252,200,100)
    expect(node(g, 'NNode1')).toEqual({ x: 12, y: 12, width: 200, height: 100 })
    expect(node(g, 'NNode2')).toEqual({ x: 12, y: 132, width: 200, height: 100 })
    expect(node(g, 'NNode3')).toEqual({ x: 12, y: 252, width: 200, height: 100 })
  })

  it('transposeProperties: DOWN TO_INPUT 转置 minimum/position/alignment, TO_INTERNAL 往返恢复', () => {
    const graph = new LGraph()
    graph.setProperty(DIRECTION, Direction.DOWN)
    const n = new LNode(graph)
    n.position = { x: 10, y: 20 }
    n.size = { x: 200, y: 100 }
    n.setProperty(NODE_SIZE_MINIMUM, { x: 200, y: 100 })
    n.setProperty(POSITION, { x: 5, y: 6 })
    n.setProperty(ALIGNMENT, 'LEFT')
    n.setProperty(NODE_LABELS_PLACEMENT, ['INSIDE', 'H_CENTER', 'V_TOP'])
    n.setLabels([{ text: 'L1', position: { x: 0, y: 0 }, size: { x: 56, y: 15 }, placement: 'INSIDE, H_CENTER, V_TOP' }])

    // TO_INPUT (READING_DIRECTION DOWN = transposeAll)
    new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(graph)
    expect(n.position).toEqual({ x: 20, y: 10 })
    expect(n.size).toEqual({ x: 100, y: 200 })
    expect(n.getProperty(NODE_SIZE_MINIMUM)).toEqual({ x: 100, y: 200 })
    expect(n.getProperty(POSITION)).toEqual({ x: 6, y: 5 })
    expect(n.getProperty(ALIGNMENT)).toBe('TOP') // LEFT → TOP
    // placement: INSIDE 保留, 补 H_PRIORITY, H_CENTER→V_CENTER, V_TOP→H_LEFT
    expect(sorted(n.getProperty(NODE_LABELS_PLACEMENT))).toBe(sorted(['INSIDE', 'H_PRIORITY', 'V_CENTER', 'H_LEFT']))
    expect(n.getLabels()[0].placement).toBe('INSIDE, H_PRIORITY, V_CENTER, H_LEFT')

    // TO_INTERNAL: transpose 自逆 → 恢复原状
    new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(graph)
    expect(n.position).toEqual({ x: 10, y: 20 })
    expect(n.size).toEqual({ x: 200, y: 100 })
    expect(n.getProperty(NODE_SIZE_MINIMUM)).toEqual({ x: 200, y: 100 })
    expect(n.getProperty(POSITION)).toEqual({ x: 5, y: 6 })
    expect(n.getProperty(ALIGNMENT)).toBe('LEFT')
    expect(sorted(n.getProperty(NODE_LABELS_PLACEMENT))).toBe(sorted(['INSIDE', 'H_CENTER', 'V_TOP']))
  })

  it('mirrorX (LEFT READING_DIRECTION): position/alignment/placement H 镜像', () => {
    const graph = new LGraph()
    graph.setProperty(DIRECTION, Direction.LEFT)
    graph.getSize().x = 500 // 固定图宽 → mirror offset 稳定
    const n = new LNode(graph)
    n.position = { x: 10, y: 20 }
    n.size = { x: 200, y: 100 }
    n.setProperty(POSITION, { x: 5, y: 6 })
    n.setProperty(ALIGNMENT, 'LEFT')
    n.setProperty(NODE_LABELS_PLACEMENT, ['INSIDE', 'H_LEFT', 'V_TOP'])
    n.setLabels([{ text: 'L1', position: { x: 0, y: 0 }, size: { x: 56, y: 15 }, placement: 'INSIDE, H_LEFT, V_TOP' }])

    new GraphTransformer(TransformMode.TO_INPUT_DIRECTION).process(graph)
    // offset = size.x - offset.x = 500; mirrorX(v, offset - node.size.x=300)
    expect(n.position.x).toBe(300 - 10) // 290
    expect(n.position.y).toBe(20) // y 不变
    expect(n.getProperty(POSITION)?.x).toBe(300 - 5) // 295
    expect(n.getProperty(ALIGNMENT)).toBe('RIGHT')
    expect(sorted(n.getProperty(NODE_LABELS_PLACEMENT))).toBe(sorted(['INSIDE', 'H_RIGHT', 'V_TOP']))
    expect(n.getLabels()[0].placement).toBe('INSIDE, H_RIGHT, V_TOP')

    // 往返: 第二次 mirrorX 恢复 (offset 仍 500)
    new GraphTransformer(TransformMode.TO_INTERNAL_LTR).process(graph)
    expect(n.position.x).toBe(10)
    expect(n.getProperty(POSITION)?.x).toBe(5)
    expect(n.getProperty(ALIGNMENT)).toBe('LEFT')
    expect(sorted(n.getProperty(NODE_LABELS_PLACEMENT))).toBe(sorted(['INSIDE', 'H_LEFT', 'V_TOP']))
  })
})
