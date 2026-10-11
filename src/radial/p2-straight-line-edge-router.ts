/**
 * p2-straight-line-edge-router — ELK alg.radial.p2routing
 * (IRadialEdgeRouter / StraightLineEdgeRouter).
 *
 * 中心到中心直线路由: 从根开始递归, 每条非层级边裁剪到两端节点边界内,
 * 写入 edge.sections[0] 的 startPoint/endPoint.
 */
import type { ElkNode, ElkEdge } from '../api/elk-json.js'
import { KVector, clipVector } from '../force/kvector.js'
import {
  allOutgoingEdges, findNodeById, nodeIdOfRef, isHierarchicalEdge, isPortRef,
} from './radial-util.js'
import { INTERNAL_ROOT_NODE } from './radial-layout.js'
import { getGraphProperty } from './options.js'

/** 径向边路由器 (Java IRadialEdgeRouter). */
export interface IRadialEdgeRouter {
  routeEdges(root: ElkNode): void
}

/** 直线边路由器 (Java StraightLineEdgeRouter). */
export class StraightLineEdgeRouter implements IRadialEdgeRouter {
  private graph: ElkNode

  constructor(graph: ElkNode) {
    this.graph = graph
  }

  /** 从节点中心到节点中心路由, 然后裁剪以不穿过节点 (Java routeEdges, 递归). */
  routeEdges(node: ElkNode): void {
    for (const edge of allOutgoingEdges(this.graph, node)) {
      if (!isPortRef(this.graph, String(edge.sources?.[0] ?? ''))) {
        const target = findNodeById(this.graph, nodeIdOfRef(this.graph, String(edge.targets?.[0] ?? '')) ?? '')
        if (target === undefined) continue
        if (!isHierarchicalEdge(this.graph, edge)) {
          let sourceX = (node.x ?? 0) + (node.width ?? 0) / 2
          let sourceY = (node.y ?? 0) + (node.height ?? 0) / 2

          let targetX = (target.x ?? 0) + (target.width ?? 0) / 2
          let targetY = (target.y ?? 0) + (target.height ?? 0) / 2

          // Clipping
          const vector = new KVector(targetX - sourceX, targetY - sourceY)
          const sourceClip = new KVector(vector.x, vector.y)
          clipVector(sourceClip, node.width ?? 0, node.height ?? 0)
          vector.x -= sourceClip.x
          vector.y -= sourceClip.y

          sourceX = targetX - vector.x
          sourceY = targetY - vector.y

          const targetClip = new KVector(vector.x, vector.y)
          clipVector(targetClip, target.width ?? 0, target.height ?? 0)
          vector.x -= targetClip.x
          vector.y -= targetClip.y

          targetX = sourceX + vector.x
          targetY = sourceY + vector.y

          const section = firstEdgeSection(edge)
          section.startPoint = { x: sourceX, y: sourceY }
          section.endPoint = { x: targetX, y: targetY }
          this.routeEdges(target)
        }
      }
    }
  }
}

/** ElkGraphUtil.firstEdgeSection(e, true, true): 无 section 则新建. */
export function firstEdgeSection(e: ElkEdge): NonNullable<ElkEdge['sections']>[number] {
  e.sections ??= []
  if (e.sections.length === 0) e.sections.push({ startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 } })
  return e.sections[0]!
}

/** P2 边路由阶段 (Java StraightLineEdgeRouter.process). */
export function straightLineEdgeRouter(graph: ElkNode): void {
  const root = getGraphProperty<ElkNode>(graph, INTERNAL_ROOT_NODE, undefined as unknown as ElkNode)
  const router = new StraightLineEdgeRouter(graph)
  router.routeEdges(root)
}
