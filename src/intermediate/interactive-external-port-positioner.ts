/**
 * InteractiveExternalPortPositioner (对应 ELK intermediate.InteractiveExternalPortPositioner).
 * P1 前: 交互式布局依赖前置位置, 外部端口 dummy 无法指定 → 按 NORMAL 节点包围盒赋予合理坐标:
 *   FIRST_SEPARATE (WEST) 在 minX 左侧, LAST_SEPARATE (EAST) 在 maxX 右侧,
 *   TOP 在 minY 上方, BOTTOM 在 maxY 下方 (间距 ARBITRARY_SPACING = 10).
 */
import type { LGraph } from '../graph/lgraph.js'
import type { LNode } from '../graph/lnode.js'
import type { LEdge } from '../graph/ledge.js'
import { NodeType, LayerConstraint, InLayerConstraint } from '../graph/enums.js'
import { GraphProperties, GRAPH_PROPERTIES } from '../options/internal-properties.js'

/** 外部端口 dummy 与其他节点的间距 (ELK ARBITRARY_SPACING). */
const ARBITRARY_SPACING = 10

export function processInteractiveExternalPortPosition(layeredGraph: LGraph): void {
  // 无外部端口则无事可做.
  if (!layeredGraph.getProperty(GRAPH_PROPERTIES).has(GraphProperties.EXTERNAL_PORTS)) return

  // 找 NORMAL 节点的包围盒 (含 margin).
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  for (const node of layeredGraph.getLayerlessNodes()) {
    if (node.getType() !== NodeType.NORMAL) continue
    const margins = node.getMargin()
    minX = Math.min(minX, node.position.x - margins.left)
    maxX = Math.max(maxX, node.position.x + node.size.x + margins.right)
    minY = Math.min(minY, node.position.y - margins.top)
    maxY = Math.max(maxY, node.position.y + node.size.y + margins.bottom)
  }

  // 给外部端口 dummy 赋坐标.
  for (const node of layeredGraph.getLayerlessNodes()) {
    if (node.getType() === NodeType.NORMAL) continue
    switch (node.getType()) {
      case NodeType.EXTERNAL_PORT: {
        const lc = node.getLayerConstraint()
        if (lc === LayerConstraint.FIRST_SEPARATE) {
          // WEST 端口: 图左侧.
          node.position.x = minX - ARBITRARY_SPACING
          const y = findYCoordinate(node, e => e.getTarget()?.getNode() ?? null)
          if (y !== null) node.position.y = y
          break
        }
        if (lc === LayerConstraint.LAST_SEPARATE) {
          // EAST 端口: 图右侧.
          node.position.x = maxX + ARBITRARY_SPACING
          const y = findYCoordinate(node, e => e.getSource()?.getNode() ?? null)
          if (y !== null) node.position.y = y
          break
        }

        const ilc = node.getInLayerConstraint()
        if (ilc === InLayerConstraint.TOP) {
          const x = findNorthSouthPortXCoordinate(node)
          if (x !== null) node.position.x = x + ARBITRARY_SPACING
          node.position.y = minY - ARBITRARY_SPACING
          break
        }
        if (ilc === InLayerConstraint.BOTTOM) {
          const x = findNorthSouthPortXCoordinate(node)
          if (x !== null) node.position.x = x + ARBITRARY_SPACING
          node.position.y = maxY + ARBITRARY_SPACING
          break
        }
        break
      }
      default:
        throw new Error(`节点类型 ${node.getType()} 不受 InteractiveExternalPortPositioner 支持`)
    }
  }
}

/** 取第一条连接边对端节点的中心 y (无连接边返回 null). */
function findYCoordinate(dummy: LNode, getOther: (e: LEdge) => LNode | null): number | null {
  for (const e of dummy.getConnectedEdges()) {
    const other = getOther(e)
    if (other !== null) return other.position.y + other.size.y / 2
  }
  return null
}

/** N/S 端口 dummy 的 x: 出边取目标侧最小左缘, 入边取源侧最大右缘. */
function findNorthSouthPortXCoordinate(dummy: LNode): number | null {
  // 外部端口 dummy 必须恰好一个端口 (ELK assert).
  if (dummy.getPorts().length !== 1) {
    throw new Error('外部端口 dummy 必须恰好一个端口')
  }

  const port = dummy.getPorts()[0]!
  if (port.getOutgoingEdges().length > 0 && port.getIncomingEdges().length > 0) {
    throw new Error('交互式布局不支持同时有入边和出边的 NORTH/SOUTH 端口')
  }

  if (port.getOutgoingEdges().length > 0) {
    let min = Number.POSITIVE_INFINITY
    for (const e of port.getOutgoingEdges()) {
      const n = e.getTarget()!.getNode()!
      const margins = n.getMargin()
      min = Math.min(min, n.position.x - margins.left)
    }
    return min
  }

  if (port.getIncomingEdges().length > 0) {
    let max = Number.NEGATIVE_INFINITY
    for (const e of port.getIncomingEdges()) {
      const n = e.getSource()!.getNode()!
      const margins = n.getMargin()
      max = Math.max(max, n.position.x + n.size.x + margins.right)
    }
    return max
  }

  return null
}
