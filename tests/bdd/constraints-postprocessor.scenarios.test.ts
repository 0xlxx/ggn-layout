/**
 * ConstraintsPostprocessor 行为 — 直接 vitest BDD.
 * 算法不变量 (与 ELK Java 语义一致):
 *  - NORMAL 节点获得 (层号, 层内位置号) 且按层/层内递增;
 *  - 空层不递增层号;
 *  - dummy 节点不获得 ID (属性保持默认 -1).
 */
import { describe, it, expect } from 'vitest'
import { LGraph, LNode, Layer } from '../../src/index.js'
import { NodeType } from '../../src/graph/enums.js'
import { LAYERING_LAYER_ID, CROSSING_MINIMIZATION_POSITION_ID } from '../../src/options/layered-options.js'
import { processConstraintsPost } from '../../src/intermediate/constraints-postprocessor.js'

/** 建图: 层 0 [n1, dummy], 层 1 [] (空), 层 2 [n2, dummy]. */
function setupGraph(): { graph: LGraph; n1: LNode; n2: LNode } {
  const graph = new LGraph()
  const layer0 = new Layer(graph)
  const layer1 = new Layer(graph)
  const layer2 = new Layer(graph)
  graph.getLayers().push(layer0, layer1, layer2)

  const n1 = new LNode(graph)
  n1.setLayer(layer0)
  const dummy1 = new LNode(graph)
  dummy1.setType(NodeType.LONG_EDGE)
  dummy1.setLayer(layer0)
  const n2 = new LNode(graph)
  n2.setLayer(layer2)
  const dummy2 = new LNode(graph)
  dummy2.setType(NodeType.EXTERNAL_PORT)
  dummy2.setLayer(layer2)
  return { graph, n1, n2 }
}

describe('ConstraintsPostprocessor 行为', () => {
  it('NORMAL 节点获得递增的层 ID 与层内位置 ID; 空层不递增层号', () => {
    const { graph, n1, n2 } = setupGraph()
    processConstraintsPost(graph)

    // 层 0 有 NORMAL 节点 → 层号 0; 层 1 为空 → 不递增; 层 2 → 层号 1.
    expect(n1.getProperty(LAYERING_LAYER_ID)).toBe(0)
    expect(n1.getProperty(CROSSING_MINIMIZATION_POSITION_ID)).toBe(0)
    expect(n2.getProperty(LAYERING_LAYER_ID)).toBe(1)
    expect(n2.getProperty(CROSSING_MINIMIZATION_POSITION_ID)).toBe(0)
  })

  it('dummy 节点不获得 ID (保持默认 -1); 位置 ID 跳过 dummy 递增', () => {
    const { graph, n1, n2 } = setupGraph()
    // 额外 NORMAL 节点夹在 dummy 后 (层 0: n1, dummy, n3).
    const n3 = new LNode(graph)
    n3.setLayer(graph.getLayers()[0]!)
    processConstraintsPost(graph)

    const dummies = graph.getLayers()[0]!.getNodes().filter(n => n.getType() !== NodeType.NORMAL)
    for (const d of dummies) {
      expect(d.getProperty(LAYERING_LAYER_ID)).toBe(-1)
      expect(d.getProperty(CROSSING_MINIMIZATION_POSITION_ID)).toBe(-1)
    }
    // 层 0: n1 posId 0, n3 posId 1 (dummy 不占号).
    expect(n3.getProperty(CROSSING_MINIMIZATION_POSITION_ID)).toBe(1)
    expect(n2.getProperty(LAYERING_LAYER_ID)).toBe(1)
  })
})
