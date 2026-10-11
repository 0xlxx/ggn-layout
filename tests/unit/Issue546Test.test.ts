/**
 * Issue546Test — ELK Java v0.12.0 移植 (LayoutTestRunner 框架).
 * 原文件: .../issues/Issue546Test.java
 * 资源: tickets/layered/546_borderGaps.elkt
 * 断言 (@Test, when='layout'): 每条边源点接近源端口矩形 (容差 0.5).
 *
 * ★ 坐标系对齐 Java (Issue546Test.java:68-87):
 *   - srcPoint = section.start + ElkUtil.toAbsolute(currNode)  → 绝对坐标
 *   - srcPortRect = ElkUtil.absolutePosition(srcPort)          → 绝对坐标 (递归父链 + port 位置, 不含 anchor)
 *   TS 端 getEdgeEndpoints 返回「边所属图」坐标系, 需按分支绝对化 (与 getEdgeEndpoints 语义一致).
 */
import { describe, expect, it } from 'vitest'
import { resolveModels, limitModels, runAll, summarizeFailures } from './framework/runner.js'
import { allEdgeRoutes } from './framework/orthogonal.js'
import type { LGraph, LEdge, LNode, LPort, KVector } from '../../src/index.js'

const MODELS = limitModels(resolveModels('tickets/layered/546_borderGaps.elkt'))
const TOL = 0.5

/** 节点递归绝对位置 (node.position + 父链所有 position; 对齐 ElkUtil.absolutePosition 对节点部分). */
function recursiveAbs(node: LNode): KVector {
  let x = node.position.x
  let y = node.position.y
  let g = node.getGraph()
  while (g?.getParentNode()) {
    const p = g.getParentNode()!
    x += p.position.x
    y += p.position.y
    g = p.getGraph()
  }
  return { x, y }
}

/** 端口绝对位置 (递归父链 + port position, 不含 anchor; 对齐 ElkUtil.absolutePosition(port)). */
function portAbsolutePosition(port: LPort): KVector {
  const nodePos = recursiveAbs(port.getNode()!)
  return { x: nodePos.x + port.getPosition().x, y: nodePos.y + port.getPosition().y }
}

/** 判断 node 是否是 ancestor 的后代 (自身不算; 与 src/graph/lgraph-util.ts isDescendant 同语义). */
function isDescendant(node: LNode, ancestor: LNode | null): boolean {
  let current: LNode | null = node.getGraph()?.getParentNode() ?? null
  while (current !== null) {
    if (current === ancestor) return true
    current = current.getGraph()?.getParentNode() ?? null
  }
  return false
}

/** 把 getEdgeEndpoints 的 source (边所属图坐标系) 绝对化 → 根图坐标 (对齐 Java section.start + toAbsolute). */
function srcPointAbsolute(e: LEdge, pts0: KVector): KVector {
  const srcNode = e.getSource()!.getNode()!
  const tgtNode = e.getTarget()!.getNode()!
  if (isDescendant(tgtNode, srcNode)) {
    // 正向跨层级: source 相对 srcNode 内容 → + srcNode 递归绝对位置
    const off = recursiveAbs(srcNode)
    return { x: pts0.x + off.x, y: pts0.y + off.y }
  }
  if (isDescendant(srcNode, tgtNode)) {
    // 反向跨层级: source 相对 tgtNode 内容 → + tgtNode 递归绝对位置
    const off = recursiveAbs(tgtNode)
    return { x: pts0.x + off.x, y: pts0.y + off.y }
  }
  // 普通边: source = getAbsoluteAnchor (owner 层, 相对所属图) → + 父链 (不含 owner)
  const abs = { x: pts0.x, y: pts0.y }
  let g = srcNode.getGraph()
  while (g?.getParentNode()) {
    const p = g.getParentNode()!
    abs.x += p.position.x
    abs.y += p.position.y
    g = p.getGraph()
  }
  return abs
}

const LAYOUT_ASSERTS = [
  {
    module: 'layout',
    when: 'layout' as const,
    check: (g: LGraph): string[] => {
      const problems: string[] = []
      for (const { id, pts } of allEdgeRoutes(g)) {
        if (pts.length === 0) {
          problems.push(`edge ${id}: 无路由点`)
          continue
        }
        // src 端口: 从边取源端口 (绝对锚点 = 起点, 矩形 = 端口位置+尺寸)
        const srcPort = findSrcPort(g, id)
        if (!srcPort) continue
        const e = findEdge(g, id)
        if (!e) continue
        const srcPoint = srcPointAbsolute(e, pts[0]!)
        const abs = portAbsolutePosition(srcPort)
        const inRect = srcPoint.x >= abs.x - TOL && srcPoint.x <= abs.x + srcPort.size.x + TOL
          && srcPoint.y >= abs.y - TOL && srcPoint.y <= abs.y + srcPort.size.y + TOL
        if (!inRect) {
          problems.push(`edge ${id}: 源点 (${srcPoint.x},${srcPoint.y}) 不在端口矩形 (${abs.x},${abs.y})-(${abs.x + srcPort.size.x},${abs.y + srcPort.size.y}) 内`)
        }
      }
      return problems
    },
  },
]

function findSrcPort(g: LGraph, id: unknown): LPort | null {
  const e = findEdge(g, id)
  return e ? e.getSource() : null
}

function findEdge(g: LGraph, id: unknown): LEdge | null {
  const stack: LGraph[] = [g]
  while (stack.length) {
    const graph = stack.pop()!
    for (const n of graph.getLayerlessNodes()) if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
    for (const layer of graph.getLayers()) {
      for (const n of layer.getNodes()) {
        if (n.getNestedGraph()) stack.push(n.getNestedGraph()!)
        for (const port of n.getPorts()) {
          for (const e of port.getOutgoingEdges()) {
            if (e.id === id) return e
          }
        }
      }
    }
  }
  return null
}

describe('Issue546Test (ELK Java 移植)', () => {
  it(`边源点在端口: ${MODELS.length} 图`, () => {
    const results = runAll(MODELS, LAYOUT_ASSERTS)
    const failed = results.filter(r => r.problems.length > 0 || r.error)
    const msg = summarizeFailures(results, 'Issue546 边起点断言')
    expect(failed.length, msg).toBe(0)
  })
})
