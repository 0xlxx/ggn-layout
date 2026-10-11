/**
 * NetworkSimplexPlacer 行为 — 直接 vitest BDD.
 * 算法不变量 (与 ELK Java 0.12.0 语义一致):
 *  - NODE_SIZE 弹性节点可增高, 使跨层边对齐 (graph01: n1_1 20→70, 边直线);
 *  - 间距经 Spacings.getIndividualOrDefault 解析 (图级 portPort/portsSurrounding 生效,
 *    而非节点属性默认 — graph01 回归保护);
 *  - NODE_SIZE_WHERE_SPACE_PERMITS 第二遍 network simplex 不崩溃, 非弹性节点尺寸不变.
 */
import { describe, it, expect } from 'vitest'
import { Harness } from './bdd-helpers.js'
import {
  NODE_PLACEMENT_STRATEGY, NodePlacementStrategy,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT,
  NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY,
  NodeFlexibility, SPACING_PORT_PORT, SPACING_PORTS_SURROUNDING,
} from '../../src/options/layered-options.js'
import { PortSide } from '../../src/graph/enums.js'

function setupGraph01(): Harness {
  const h = new Harness().node('n1_1', 'n1_2', 'n1_3').edge('n1_1→n1_2, n1_1→n1_3')
  h.nodes.get('n1_1')!.size = { x: 20, y: 20 }
  h.nodes.get('n1_2')!.size = { x: 60, y: 30 }
  h.nodes.get('n1_3')!.size = { x: 60, y: 30 }
  h.root.setProperty(NODE_PLACEMENT_STRATEGY, NodePlacementStrategy.NETWORK_SIMPLEX)
  h.root.setProperty(SPACING_PORT_PORT, 5)
  h.root.setProperty(SPACING_PORTS_SURROUNDING, { top: 10, left: 0, right: 0, bottom: 10 })
  return h
}

/** 源侧端口绝对锚点是否与目标侧端口绝对锚点 y 对齐 (直线边). */
function assertStraightEdges(h: Harness): void {
  const n1_1 = h.nodes.get('n1_1')!
  for (const e of n1_1.getOutgoingEdges()) {
    const src = e.getSource()!
    const tgt = e.getTarget()!
    const srcY = src.getAbsoluteAnchor().y
    const tgtY = tgt.getAbsoluteAnchor().y
    expect(Math.abs(srcY - tgtY), `边 ${src.getNode()!.id}->${tgt.getNode()!.id} 应水平 (${srcY} vs ${tgtY})`).toBeLessThanOrEqual(1)
  }
}

describe('network simplex 节点放置行为', () => {
  it('NODE_SIZE 弹性节点按端口对齐增高, 边保持直线 (graph01 语义)', () => {
    const h = setupGraph01()
    h.root.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NODE_SIZE)
    h.layout()

    // 弹性节点从 20 增高到 70 (两个 EAST 端口分别对齐 n1_2/n1_3 的 WEST 端口).
    const a = h.nodes.get('n1_1')!
    expect(a.size.y).toBe(70)
    assertStraightEdges(h)
  })

  it('图级 portPort/portsSurrounding 经 Spacings 解析生效 (非属性默认)', () => {
    // 回归保护: 此前 transformPorts 直接读节点属性 → 得到默认 portPort=10 / surround=0,
    // 辅助图间距边 delta 错 → 弹性节点只长到 50 (ELK 70).
    const h = setupGraph01()
    h.root.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NODE_SIZE)
    h.layout()
    const a = h.nodes.get('n1_1')!
    expect(a.size.y).toBe(70)
    // 目标侧端口在节点中心 (30 高 → 15), 源侧端口绝对 y 应等于目标绝对 y.
    const tgt = h.nodes.get('n1_2')!.getPorts(PortSide.WEST)[0]!
    expect(tgt.getAbsoluteAnchor().y).toBeCloseTo(h.nodes.get('n1_2')!.position.y + 15, 5)
  })

  it('NODE_SIZE_WHERE_SPACE_PERMITS 触发第二遍 simplex, 不崩溃且非弹性节点尺寸不变', () => {
    const h = setupGraph01()
    h.root.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NODE_SIZE_WHERE_SPACE_PERMITS)
    expect(() => h.layout()).not.toThrow()
    // 非弹性节点 (无端口, 单端口) 尺寸保持输入.
    expect(h.nodes.get('n1_2')!.size.y).toBe(30)
    expect(h.nodes.get('n1_3')!.size.y).toBe(30)
    // 弹性节点尺寸不缩小 (只增不减).
    expect(h.nodes.get('n1_1')!.size.y).toBeGreaterThanOrEqual(20)
    assertStraightEdges(h)
  })

  it('节点级 nodeFlexibility 覆盖图默认值', () => {
    const h = setupGraph01()
    // 图默认 NONE, 仅 n1_1 节点级 NODE_SIZE → 只有它弹性.
    h.root.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY_DEFAULT, NodeFlexibility.NONE)
    h.nodes.get('n1_1')!.setProperty(NODE_PLACEMENT_NETWORK_SIMPLEX_NODE_FLEXIBILITY, NodeFlexibility.NODE_SIZE)
    h.layout()
    expect(h.nodes.get('n1_1')!.size.y).toBe(70)
    expect(h.nodes.get('n1_2')!.size.y).toBe(30)
  })
})
