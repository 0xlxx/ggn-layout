/**
 * 全图守恒不变量 (writer 抽取的共享 helper).
 *
 * 对应 ELK TestAfterProcessor 的"布局后图结构不被破坏"断言, 每个处理器测试默认跑一遍:
 *  1. expectNoDanglingEdges   — 无悬挂边 (每条边源/目标端口均存在且属于图中节点)
 *  2. expectEdgePortConservation — 边-端口守恒 (每条边恰好从源端口出、入目标端口)
 *  3. expectFiniteCoordinates — 坐标有限 (节点/端口/锚点/弯点均为有限数, 无 NaN/Infinity)
 *  4. expectBendPointContinuity — 弯点连续 (相邻弯点共享 x 或 y, 正交路由不变量)
 */
import { expect } from 'vitest'
import type { LGraph } from '../../../src/graph/lgraph.js'
import type { LNode } from '../../../src/graph/lnode.js'
import type { LPort } from '../../../src/graph/lport.js'
import type { LEdge } from '../../../src/graph/ledge.js'

function allNodes(graph: LGraph): LNode[] {
  const nodes: LNode[] = []
  for (const layer of graph.getLayers()) nodes.push(...layer.getNodes())
  nodes.push(...graph.getLayerlessNodes())
  return nodes
}

function finite(value: number): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

/** 无悬挂边 + 边-端口守恒: 每条边源/目标端口都存在, 且端口的连接边列表包含该边. */
export function expectNoDanglingEdges(graph: LGraph): void {
  const nodes = new Set(allNodes(graph))
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          expect(edge.getSource(), `edge ${edge.id ?? ''} source dangling`).not.toBeNull()
          expect(edge.getTarget(), `edge ${edge.id ?? ''} target dangling`).not.toBeNull()
          const srcNode = edge.getSource()!.getNode()
          const tgtNode = edge.getTarget()!.getNode()
          expect(srcNode, `edge ${edge.id ?? ''} source node in graph`).toBeTruthy()
          expect(tgtNode, `edge ${edge.id ?? ''} target node in graph`).toBeTruthy()
          expect(nodes.has(srcNode!), `edge ${edge.id ?? ''} source node registered`).toBe(true)
          expect(nodes.has(tgtNode!), `edge ${edge.id ?? ''} target node registered`).toBe(true)
        }
      }
    }
  }
}

/** 边-端口守恒: 每条边的端口属于图中节点, 且端口在边的连接列表中对称. */
export function expectEdgePortConservation(graph: LGraph): void {
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          if (edge.getSource() === port) {
            expect(port.getOutgoingEdges()).toContain(edge)
          }
          if (edge.getTarget() === port) {
            expect(port.getIncomingEdges()).toContain(edge)
          }
        }
      }
    }
  }
}

/** 坐标有限: 节点位置/尺寸、端口位置/锚点、边弯点均为有限数. */
export function expectFiniteCoordinates(graph: LGraph): void {
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      expect(finite(node.position.x), `node ${node.id} position.x`).toBe(true)
      expect(finite(node.position.y), `node ${node.id} position.y`).toBe(true)
      expect(finite(node.size.x), `node ${node.id} size.x`).toBe(true)
      expect(finite(node.size.y), `node ${node.id} size.y`).toBe(true)
      const m = node.getMargin()
      for (const [k, v] of Object.entries(m)) {
        expect(finite(v), `node ${node.id} margin.${k}`).toBe(true)
      }
      for (const port of node.getPorts()) {
        expect(finite(port.getPosition().x), `node ${node.id} port ${port.id} position.x`).toBe(true)
        expect(finite(port.getPosition().y), `node ${node.id} port ${port.id} position.y`).toBe(true)
        expect(finite(port.getAnchor().x), `node ${node.id} port ${port.id} anchor.x`).toBe(true)
        expect(finite(port.getAnchor().y), `node ${node.id} port ${port.id} anchor.y`).toBe(true)
        for (const edge of port.getConnectedEdges()) {
          for (const [i, bp] of edge.getBendPoints().entries()) {
            expect(finite(bp.x), `node ${node.id} edge ${edge.id ?? ''} bp[${i}].x`).toBe(true)
            expect(finite(bp.y), `node ${node.id} edge ${edge.id ?? ''} bp[${i}].y`).toBe(true)
          }
        }
      }
    }
  }
}

/** 弯点连续: 正交路由下相邻弯点必须共享 x 或 y. */
export function expectBendPointContinuity(edge: LEdge): void {
  const bps = edge.getBendPoints()
  for (let i = 1; i < bps.length; i++) {
    const a = bps[i - 1]!
    const b = bps[i]!
    expect(a.x === b.x || a.y === b.y, `edge ${edge.id ?? ''} bp[${i - 1}]→bp[${i}] 不连续`).toBe(true)
  }
}

/** 图中所有边的弯点连续性. */
export function expectAllBendPointContinuity(graph: LGraph): void {
  for (const layer of graph.getLayers()) {
    for (const node of layer.getNodes()) {
      for (const port of node.getPorts()) {
        for (const edge of port.getConnectedEdges()) {
          expectBendPointContinuity(edge)
        }
      }
    }
  }
}

/** 全图守恒总入口: 无悬挂边 + 边-端口守恒 + 坐标有限 + 弯点连续. */
export function expectGraphConservation(graph: LGraph): void {
  expectNoDanglingEdges(graph)
  expectEdgePortConservation(graph)
  expectFiniteCoordinates(graph)
  expectAllBendPointContinuity(graph)
}

export type { LPort }
