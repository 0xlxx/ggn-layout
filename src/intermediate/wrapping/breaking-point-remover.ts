/**
 * BreakingPointRemover (对应 ELK wrapping.BreakingPointRemover) — 断点处理器三件套之三.
 *
 * 定位任何 BREAKING_POINT end dummy, 连同 start dummy 与边 dummy 一起从图中移除.
 * 移除前把拆分边的路径转移回原 (被拆分的) 边. 组装新路径时, 不同 EdgeRouting
 * 风格需要不同的弯点:
 *  - SPLINES: 最终弯点尚未计算, 只转移 nubspline 信息 (由 FinalSplineBendpointsCalculator 后续处理);
 *  - POLYLINE: 直接拼接段弯点, 并把 start/end 标记的位置作为弯点加入;
 *  - ORTHOGONAL: 由于入射边平行于 x 轴进入节点, start/end 位置位于直线上, 可以丢弃.
 *
 * 前置条件: 图已完全布局 (边已路由); 插槽: P5 之后, LongEdgeJoiner 之后,
 * HorizontalGraphCompactor 之前. 向后 wrap 的边已经指向正确方向, ReversedEdgeRestorer 不需要再反转.
 *
 * 来源: org.eclipse.elk.alg.layered.intermediate.wrapping.BreakingPointRemover
 */
import type { LGraph } from '../../graph/lgraph.js'
import type { LEdge } from '../../graph/ledge.js'
import type { KVector } from '../../graph/enums.js'
import { kvector } from '../../graph/enums.js'
import { BREAKING_POINT_INFO, SPLINE_ROUTE_START, SPLINE_EDGE_CHAIN, SPLINE_SURVIVING_EDGE } from '../../options/internal-properties.js'
import { EDGE_ROUTING, JUNCTION_POINTS } from '../../options/layered-options.js'
import type { SplineSegment } from '../../p5edges/splines/spline-segment.js'
import { BPInfo } from './bp-info.js'

/** 执行断点移除的入口 (对应 BreakingPointRemover.process). */
export function processBreakingPointRemoval(graph: LGraph): void {
  const edgeRouting = graph.getProperty(EDGE_ROUTING)
  for (const l of graph.getLayers()) {
    for (const node of [...l.getNodes()]) {
      if (BPInfo.isEnd(node)) {
        const bpi = node.getProperty(BREAKING_POINT_INFO)!
        if (bpi.next === null) {
          remove(graph, bpi, edgeRouting)
        }
      }
    }
  }
}

/** 移除单个断点 (递归处理 prev 链). */
function remove(graph: LGraph, bpi: BPInfo, edgeRouting: string): void {
  // 组装新的边路径
  const newBends: KVector[] = []

  // 根据边路由风格不同处理
  switch (edgeRouting) {
    // 样条: 最终弯点尚未计算 (由 FinalSplineBendpointsCalculator 完成),
    // 目前只有中间 nubspline 挂在属性上
    case 'SPLINES': {
      // 收集已计算的样条信息
      const s1 = bpi.nodeStartEdge.getProperty(SPLINE_ROUTE_START) ?? []
      const s2 = bpi.startEndEdge.getProperty(SPLINE_ROUTE_START) ?? []
      const s3 = bpi.originalEdge.getProperty(SPLINE_ROUTE_START) ?? []
      const e1 = bpi.nodeStartEdge.getProperty(SPLINE_EDGE_CHAIN) ?? []
      const e2 = bpi.startEndEdge.getProperty(SPLINE_EDGE_CHAIN) ?? []
      const e3 = bpi.originalEdge.getProperty(SPLINE_EDGE_CHAIN) ?? []

      // 拼接 (记住要反转部分段)
      const joinedSegments: SplineSegment[] = []
      joinedSegments.push(...s1)
      for (const s of s2) {
        s.inverseOrder = true
      }
      joinedSegments.push(...[...s2].reverse())
      joinedSegments.push(...s3)

      const joinedEdges: LEdge[] = []
      joinedEdges.push(...e1)
      joinedEdges.push(...[...e2].reverse())
      joinedEdges.push(...e3)

      // 把信息转移给原边
      bpi.originalEdge.setProperty(SPLINE_ROUTE_START, joinedSegments)
      bpi.originalEdge.setProperty(SPLINE_EDGE_CHAIN, joinedEdges)
      bpi.originalEdge.setProperty(SPLINE_SURVIVING_EDGE, bpi.originalEdge)

      // 清理
      bpi.nodeStartEdge.setProperty(SPLINE_ROUTE_START, null)
      bpi.nodeStartEdge.setProperty(SPLINE_EDGE_CHAIN, null)
      bpi.startEndEdge.setProperty(SPLINE_ROUTE_START, null)
      bpi.startEndEdge.setProperty(SPLINE_EDGE_CHAIN, null)
      break
    }

    // 折线: 执行完 polyline router 后边段直接拼接,
    // 注意 bpi.start 与 bpi.end 的位置必须作为弯点加入
    case 'POLYLINE':
      newBends.push(...bpi.nodeStartEdge.getBendPoints())
      newBends.push(kvector(bpi.start.getPosition().x, bpi.start.getPosition().y))
      newBends.push(...[...bpi.startEndEdge.getBendPoints()].reverse())
      newBends.push(kvector(bpi.end.getPosition().x, bpi.end.getPosition().y))
      newBends.push(...bpi.originalEdge.getBendPoints())
      break

    // 正交: 保证节点的入射边平行于 x 轴进入, 因此 bpi.start/bpi.end
    // 的位置位于直线上, 可以丢弃
    default: // ORTHOGONAL
      newBends.push(...bpi.nodeStartEdge.getBendPoints())
      newBends.push(...[...bpi.startEndEdge.getBendPoints()].reverse())
      newBends.push(...bpi.originalEdge.getBendPoints())
      break
  }

  // 恢复原边
  const originalBendPoints = bpi.originalEdge.getBendPoints()
  originalBendPoints.splice(0, originalBendPoints.length, ...newBends)
  bpi.originalEdge.setSource(bpi.nodeStartEdge.getSource())

  // 收集任何产生的 junction points (顺序可任意)
  const junctionPointsOne = bpi.nodeStartEdge.getProperty(JUNCTION_POINTS)
  const junctionPointsTwo = bpi.startEndEdge.getProperty(JUNCTION_POINTS)
  const junctionPointsThree = bpi.originalEdge.getProperty(JUNCTION_POINTS)
  if (junctionPointsOne !== null || junctionPointsTwo !== null || junctionPointsThree !== null) {
    const newJunctionPoints: unknown[] = []
    addNullSafe(newJunctionPoints, junctionPointsThree)
    addNullSafe(newJunctionPoints, junctionPointsTwo)
    addNullSafe(newJunctionPoints, junctionPointsOne)
    bpi.originalEdge.setProperty(JUNCTION_POINTS, newJunctionPoints)
  }

  // 移除所有 dummy
  bpi.startEndEdge.setSource(null)
  bpi.startEndEdge.setTarget(null)
  bpi.nodeStartEdge.setSource(null)
  bpi.nodeStartEdge.setTarget(null)
  bpi.end.setLayer(null)
  bpi.start.setLayer(null)

  if (bpi.prev !== null) {
    remove(graph, bpi.prev, edgeRouting)
  }
}

function addNullSafe(container: unknown[], toAdd: unknown[] | null): void {
  if (toAdd !== null && toAdd !== undefined) {
    container.push(...toAdd)
  }
}
