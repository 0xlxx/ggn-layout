/**
 * 跨层级边 (hierarchical edge) 正交路由端到端测试 (ELK Java 0.12.0 同构).
 *
 * SSOT: examples/hierarchy/hierarchicalEdges.elkt — source -> outside.inside.n1
 * (跨两层嵌套的层级边). ELK 期望: source 与 n1 同水平, 边无弯点 (水平直线).
 *
 * 历史 bug (2026-08-08 修复): 坐标差分测试只查节点位置不查边弯点, 曾漏掉
 * compound-graph-postprocessor 合并段边时端点 padding 双算 → 边出现非正交斜线
 * (源: ggn 节点 resize 后含 padding, EXTERNAL_PORT dummy 保持 content, 两坐标系混用).
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LayeredLayoutProvider, PortSide } from '../../src/index.js'
import { LEdge } from '../../src/graph/ledge.js'
import { HIERARCHY_HANDLING, DIRECTION } from '../../src/options/layered-options.js'

function buildHierarchicalEdges(dir = 'RIGHT'): { graph: LGraph; n1: LNode; source: LNode } {
  const graph = new LGraph()
  const source = new LNode(graph)
  source.size = { x: 60, y: 30 }
  const outside = new LNode(graph)
  outside.size = { x: 60, y: 30 }
  const outsideG = new LGraph()
  outside.setNestedGraph(outsideG); outsideG.setParentNode(outside)
  const inside = new LNode(outsideG)
  inside.size = { x: 60, y: 30 }
  const insideG = new LGraph()
  inside.setNestedGraph(insideG); insideG.setParentNode(inside)
  const n1 = new LNode(insideG); n1.size = { x: 60, y: 30 }
  const n2 = new LNode(insideG); n2.size = { x: 60, y: 30 }

  // n1 -> n2 (inside 内部)
  const p1 = new LPort(); p1.setNode(n1); p1.setSide(PortSide.EAST)
  const p2 = new LPort(); p2.setNode(n2); p2.setSide(PortSide.WEST)
  const e12 = new LEdge(); e12.setSource(p1); e12.setTarget(p2)

  // source -> outside.inside.n1 (跨层级边)
  const sp = new LPort(); sp.setNode(source); sp.setSide(PortSide.EAST)
  const tp = new LPort(); tp.setNode(n1); tp.setSide(PortSide.WEST)
  const eCross = new LEdge(); eCross.setSource(sp); eCross.setTarget(tp)

  graph.setProperty(HIERARCHY_HANDLING, 'INCLUDE_CHILDREN')
  graph.setProperty(DIRECTION, dir as any)
  return { graph, n1, source }
}

describe('跨层级边正交路由 (ELK Java 0.12.0 同构)', () => {
  it.each(['RIGHT', 'LEFT'])('hierarchicalEdges %s: source→n1 边无弯点水平直线 (合并段边端点 padding 不再双算)', (dir) => {
    const { graph, n1, source } = buildHierarchicalEdges(dir as string)
    new LayeredLayoutProvider().layout(graph)

    // 节点世界坐标 (累加父偏移) 与 ELK jar 一致: source 与 n1 同水平 (y=36)
    const worldOf = (n: LNode): { x: number; y: number } => {
      let x = n.position.x, y = n.position.y
      let g = n.getGraph()
      while (g !== null && g !== graph) { const par = g.getParentNode(); if (par === null) break; x += par.position.x; y += par.position.y; g = par.getGraph() }
      return { x, y }
    }
    const ws = worldOf(source), wn = worldOf(n1)
    // RIGHT/LEFT 同水平 (y=36); x 由方向决定 (RIGHT: source 左; LEFT: source 右)
    expect(ws.y).toBeCloseTo(wn.y, 6)
    const sourceEdge = [...source.getPorts()].flatMap(p => p.getOutgoingEdges()).find(e => {
      const t = e.getTarget()?.getNode()
      return t !== null && t !== undefined && t !== n1 && t.getGraph() !== source.getGraph()
        || (t === n1)
    })
    expect(sourceEdge).toBeTruthy()
    // 跨层级边 (经过合并) 应无弯点 (水平直线)
    const crossEdges = new Set<LEdge>()
    for (const p of n1.getPorts()) {
      for (const e of p.getIncomingEdges()) crossEdges.add(e)
    }
    for (const e of crossEdges) {
      const src = e.getSource()?.getNode()
      // source→n1 的跨层级边: source 在根图, n1 在嵌套内
      if (src === source) {
        expect(e.getBendPoints(), '跨层级边 source→n1 应无弯点 (ELK 水平直线)').toHaveLength(0)
        // 边端点世界坐标同水平 (y 一致, 无斜线段); getAbsoluteAnchor 是局部坐标, 需累加父偏移
        const worldAnchor = (port: LPort): { x: number; y: number } => {
          let x = port.getAbsoluteAnchor().x, y = port.getAbsoluteAnchor().y
          let g = port.getNode()!.getGraph()
          while (g !== null && g !== graph) { const par = g.getParentNode(); if (par === null) break; x += par.position.x; y += par.position.y; g = par.getGraph() }
          return { x, y }
        }
        const sAbs = worldAnchor(e.getSource()!)
        const tAbs = worldAnchor(e.getTarget()!)
        expect(Math.abs(sAbs.y - tAbs.y), '端点应同水平').toBeLessThanOrEqual(1e-6)
      }
    }
  })

  it('不变式: 布局后无悬挂边 + 节点坐标有限', () => {
    const { graph } = buildHierarchicalEdges()
    new LayeredLayoutProvider().layout(graph)
    for (const n of graph.getAllNodes()) {
      expect(Number.isFinite(n.position.x)).toBe(true)
      expect(Number.isFinite(n.position.y)).toBe(true)
      for (const p of n.getPorts()) {
        for (const e of p.getConnectedEdges()) {
          expect(e.getSource()).toBeTruthy()
          expect(e.getTarget()).toBeTruthy()
        }
      }
    }
  })
})
