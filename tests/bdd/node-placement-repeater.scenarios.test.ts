/**
 * NodePlacementRepeater 行为 — 直接 vitest BDD.
 * 算法不变量 (与 ELK Java 语义一致):
 *  - 第二遍运行前清除弹性: 图级 DEFAULT 与节点级 FLEXIBILITY 属性移除 (回落到默认 NONE),
 *    NODE_SIZE_CONSTRAINTS 移除 (默认固定尺寸);
 *  - 节点 y 位置重置为 0 后由第二遍放置算法重算, 尺寸保持第一遍结果;
 *  - RECOMPUTE_NODE_PLACEMENT 未设置 → 处理器 no-op.
 */
import { describe, it, expect } from 'vitest'
import { Harness } from './bdd-helpers.js'
import {
  NODE_PLACEMENT_STRATEGY, NodePlacementStrategy,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT,
  NodeFlexibility, NODE_SIZE_CONSTRAINTS, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING,
} from '../../src/options/layered-options.js'
import { processNodePlacementRepeat } from '../../src/intermediate/node-placement-repeater.js'

/** 建图 (network-simplex 场景 graph01): 第一遍 NS 放置 + NODE_SIZE 弹性. */
function setupFlexibleGraph(): Harness {
  const h = new Harness().node('n1_1', 'n1_2', 'n1_3').edge('n1_1→n1_2, n1_1→n1_3')
  h.nodes.get('n1_1')!.size = { x: 20, y: 20 }
  h.nodes.get('n1_2')!.size = { x: 60, y: 30 }
  h.nodes.get('n1_3')!.size = { x: 60, y: 30 }
  h.root.setProperty(NODE_PLACEMENT_STRATEGY, NodePlacementStrategy.NETWORK_SIMPLEX)
  h.root.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NODE_SIZE)
  h.root.setProperty(SPACING_PORT_PORT, 5)
  h.root.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, right: 0, bottom: 10 })
  return h
}

describe('NodePlacementRepeater 行为', () => {
  it('第一遍弹性放置后第二遍 BK 放置: 弹性被清除, 尺寸保持, 位置重算且有限', () => {
    const h = setupFlexibleGraph()
    h.layout()
    // 第一遍: NODE_SIZE 弹性把 n1_1 从 20 增高到 70.
    const a = h.nodes.get('n1_1')!
    expect(a.size.y).toBe(70)

    h.root.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_RECOMPUTE_NODE_PLACEMENT, NodePlacementStrategy.BRANDES_KOEPF)
    expect(() => processNodePlacementRepeat(h.root)).not.toThrow()

    // 弹性清除: 图级 DEFAULT 与节点级 FLEXIBILITY 回落到默认 NONE, 尺寸约束清空.
    expect(h.root.getProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT)).toBe(NodeFlexibility.NONE)
    for (const n of h.root.getLayers().flatMap(l => l.getNodes())) {
      expect(n.getProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY)).toBe(NodeFlexibility.NONE)
      expect(n.getProperty(NODE_SIZE_CONSTRAINTS)).toEqual([])
    }
    // 尺寸保持第一遍结果 (固定尺寸用于第二遍).
    expect(a.size.y).toBe(70)
    // 第二遍放置后位置有限且非负.
    for (const n of h.root.getLayers().flatMap(l => l.getNodes())) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
      expect(n.position.x).toBeGreaterThanOrEqual(0)
      expect(n.position.y).toBeGreaterThanOrEqual(0)
    }
    // 第二遍放置器已跑: 层内位置非全 0 (y 被重算, 而非停留在重置后的 0).
    const ys = h.root.getLayers().flatMap(l => l.getNodes().map(n => n.position.y))
    expect(ys.some(y => y !== 0)).toBe(true)
  })

  it('RECOMPUTE_NODE_PLACEMENT 未设置 → no-op, 弹性与位置原样保留', () => {
    const h = setupFlexibleGraph()
    h.layout()
    const a = h.nodes.get('n1_1')!
    expect(a.size.y).toBe(70)
    const ysBefore = h.root.getLayers().flatMap(l => l.getNodes().map(n => n.position.y))

    expect(() => processNodePlacementRepeat(h.root)).not.toThrow()

    expect(h.root.getProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT)).toBe(NodeFlexibility.NODE_SIZE)
    const ysAfter = h.root.getLayers().flatMap(l => l.getNodes().map(n => n.position.y))
    expect(ysAfter).toEqual(ysBefore)
  })
})
