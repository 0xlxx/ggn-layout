/**
 * SplineSelfLoopRouter (src/intermediate/loops/routing/spline-self-loop-router.ts) 语义单元测试.
 * SSOT: ELK Java 0.12.0 SplineSelfLoopRouter.java + NubSpline.java.
 * 走完整自环路由管线 (edgeRouting=SPLINES): 正交弯点 → 中点外移 edgeLabelDistance → NubSpline Bezier.
 * 覆盖: 单侧环、N→E 角环、标签边距、首尾端口锚点.
 */
import { describe, expect, it } from 'vitest'
import { makeGraph, makeLayer, makeNode, makePorts, makeEdge, addLabel, installHolder } from './helpers/SelfLoopGraphBuilder.js'
import { processSelfLoopRouter } from '../../src/intermediate/self-loop-router.js'

function closePt(actual: { x: number; y: number }, x: number, y: number): void {
  expect(actual.x).toBeCloseTo(x, 5)
  expect(actual.y).toBeCloseTo(y, 5)
}

function oneSideSpline(side: 'NORTH' | 'SOUTH' | 'EAST' | 'WEST', withLabel: boolean) {
  const graph = makeGraph({ edgeRouting: 'SPLINES' })
  const layer = makeLayer(graph)
  const node = makeNode(graph, layer, { x: 50, y: 50 })
  const ports = makePorts(node, side === 'NORTH' ? 2 : 0, side === 'EAST' ? 2 : 0, side === 'SOUTH' ? 2 : 0, side === 'WEST' ? 2 : 0)
  const edge = makeEdge(ports[0]!, ports[1]!)
  if (withLabel) addLabel(edge, 'L', { x: 10, y: 5 })
  const holder = installHolder(node)
  for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
  processSelfLoopRouter(graph)
  return { graph, node, edge, holder }
}

describe('SplineSelfLoopRouter (ELK Java 移植)', () => {
  it('NORTH 单侧环: 首尾锚点 + 中点外移 edgeLabelDistance (2), Bezier 裁剪后 5 点', () => {
    const { edge, node } = oneSideSpline('NORTH', false)
    const bends = edge.getBendPoints()
    expect(bends).toHaveLength(5)
    closePt(bends[0]!, 0, -10)  // 源锚点后首 CP = 正交外点
    closePt(bends[1]!, 0, -11)  // 中点外移
    closePt(bends[2]!, 0, -11)
    closePt(bends[3]!, 0, -11)
    closePt(bends[4]!, 0, -10)  // 目标锚点前末 CP
    // 边距: 外点最远距离 11 (非 10), 左/右无扩展
    expect(node.getMargin().top).toBeCloseTo(11, 5)
    expect(node.getMargin().left).toBeCloseTo(0, 5)
    expect(node.getMargin().right).toBe(0)
  })

  it('NORTH 标签: 标签高度计入边距 (top=17)', () => {
    const { edge, node } = oneSideSpline('NORTH', true)
    expect(edge.getBendPoints()).toHaveLength(5)
    expect(node.getMargin().top).toBeCloseTo(17, 5)
  })

  it('N→E 角环: 弯点序列 + 两方向边距 (spline 自环不变量)', () => {
    const graph = makeGraph({ edgeRouting: 'SPLINES' })
    const layer = makeLayer(graph)
    const node = makeNode(graph, layer, { x: 50, y: 50 })
    const n = makePorts(node, 1, 0, 0, 0)
    const e = makePorts(node, 0, 1, 0, 0)
    makeEdge(n[0]!, e[0]!)
    const holder = installHolder(node)
    for (const loop of holder.getSLHyperLoops()) loop.computePortsPerSide()
    processSelfLoopRouter(graph)
    const edge = [...holder.getSLHyperLoops()[0]!.getSLEdges()][0]!.getLEdge()
    const bends = edge.getBendPoints()
    expect(bends).toHaveLength(11)
    const exp = [
      [0, -10], [15, -11], [27.5, -11.166666666666668], [40, -11.333333333333334],
      [50, -10.666666666666668], [55.33333333333333, -9.5], [60.666666666666664, -8.333333333333334],
      [61.33333333333333, -6.666666666666667], [61.166666666666664, -4.583333333333334],
      [61, -2.5], [60, 0],
    ]
    bends.forEach((b, i) => closePt(b, exp[i]![0]!, exp[i]![1]!))
    expect(node.getMargin().top).toBeCloseTo(11.333333333333334, 5)
    expect(node.getMargin().right).toBeCloseTo(11.333333333333329, 5)
  })

  it('单侧环全部弯点位于节点盒外 (不越界)', () => {
    for (const side of ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const) {
      const { edge, node } = oneSideSpline(side, false)
      const box = { x: node.position.x, y: node.position.y, w: node.size.x, h: node.size.y }
      for (const b of edge.getBendPoints()) {
        const inside = b.x > box.x && b.x < box.x + box.w && b.y > box.y && b.y < box.y + box.h
        expect(inside, `side=${side} 弯点 (${b.x},${b.y}) 越界`).toBe(false)
      }
    }
  })
})
