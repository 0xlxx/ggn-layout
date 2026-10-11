/**
 * 正交路由检查 (对应 ELK BasicEdgeRouterTest.checkEdgeRouteIsOrthogonal).
 * 路由点序列 = [src 绝对锚点, ...弯点, tgt 绝对锚点]; 相邻段必须交替水平/垂直 (容差 0.05).
 */
import { getEdgeEndpoints } from '../../../src/index.js'
import type { LGraph } from '../../../src/index.js'

export const ORTHO_TOLERANCE = 0.05

/** 遍历层级内所有边 (含嵌套图), 返回 (边id, 路由点序列, 源节点, 目标节点). */
export function* allEdgeRoutes(g: LGraph): Generator<{ id: unknown; pts: { x: number; y: number }[] }> {
  const stack: LGraph[] = [g]
  while (stack.length > 0) {
    const graph = stack.pop()!
    for (const n of graph.getLayerlessNodes()) {
      if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
    }
    for (const layer of graph.getLayers()) {
      for (const n of layer.getNodes()) {
        if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
        for (const port of n.getPorts()) {
          for (const e of port.getOutgoingEdges()) {
            const srcP = e.getSource()!, tgtP = e.getTarget()!
            if (!srcP || !tgtP) continue
            const { source, target } = getEdgeEndpoints(e)
            yield { id: e.id, pts: [source, ...e.getBendPoints(), target] }
          }
        }
      }
    }
  }
}

/** 检查一条边路由是否正交; 返回问题描述 (空 = 通过). */
export function checkOrthogonalRoute(id: unknown, pts: { x: number; y: number }[]): string[] {
  const problems: string[] = []
  if (pts.length < 2) {
    problems.push(`edge ${id}: 路由点少于 2`)
    return problems
  }
  let horizontal = Math.abs(pts[0]!.y - pts[1]!.y) <= ORTHO_TOLERANCE
  let prev = pts[0]!
  for (let i = 1; i < pts.length; i++) {
    const cur = pts[i]!
    if (horizontal) {
      if (Math.abs(prev.y - cur.y) > ORTHO_TOLERANCE) {
        problems.push(`edge ${id}: 期望水平段 (prev=(${prev.x},${prev.y}) cur=(${cur.x},${cur.y}))`)
      }
    } else if (Math.abs(prev.x - cur.x) > ORTHO_TOLERANCE) {
      problems.push(`edge ${id}: 期望垂直段 (prev=(${prev.x},${prev.y}) cur=(${cur.x},${cur.y}))`)
    }
    horizontal = !horizontal
    prev = cur
  }
  return problems
}

/** 检查图内所有边正交; 返回问题列表. */
export function checkGraphOrthogonal(g: LGraph): string[] {
  const problems: string[] = []
  for (const { id, pts } of allEdgeRoutes(g)) {
    problems.push(...checkOrthogonalRoute(id, pts))
  }
  return problems
}
