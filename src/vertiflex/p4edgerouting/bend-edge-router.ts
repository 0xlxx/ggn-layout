/**
 * 弯点边路由 (ELK alg.vertiflex p4edgerouting.BendEdgeRouter).
 *
 * 直线会穿过节点时插入弯点: 若边弯点高度 (P2 计算的 EDGE_BEND_HEIGHT) 距
 * 目标节点顶部超过 epsilon, 在目标节点上方 (endX, bendHeight) 加一个弯点.
 */
import type { ElkNode } from '../../api/elk-json.js'
import { SPACING_NODE_NODE, optNum } from '../options.js'
import { outgoingEdges, targetOf, firstEdgeSection, createBendPoint, nodeX, nodeY } from '../vertiflex-util.js'
import type { InternalProperties } from '../internal-properties.js'

/** BendEdgeRouter.process(graph). */
export function bendEdgeRouter(graph: ElkNode, root: ElkNode, props: InternalProperties): void {
  if ((graph.children ?? []).length > 0) {
    routeEdges(graph, root, props)
  }
}

/** 递归路由带弯点的边. */
function routeEdges(graph: ElkNode, node: ElkNode, props: InternalProperties): void {
  for (const edge of outgoingEdges(graph, node)) {
    const target = targetOf(graph, edge)
    const section = firstEdgeSection(edge)

    const startX = nodeX(node) + (node.width ?? 0) / 2
    const startY = nodeY(node) + (node.height ?? 0)
    const endX = nodeX(target) + (target.width ?? 0) / 2
    const endY = nodeY(target)

    section.startPoint = { x: startX, y: startY }
    section.endPoint = { x: endX, y: endY }

    const bendHeight = props.getEdgeBendHeight(target) ?? 0
    const epsilon = 0.0001
    // 若节点偏低则在它上方放一个弯点
    if (Math.abs(bendHeight - (endY - optNum(graph, SPACING_NODE_NODE, 20) / 2)) > epsilon) {
      createBendPoint(section, endX, bendHeight)
    }
    routeEdges(graph, target, props)
  }
}
