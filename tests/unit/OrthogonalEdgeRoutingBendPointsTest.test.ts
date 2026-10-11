/**
 * OrthogonalEdgeRouter 边弯点测试 (填补坐标差分盲区 — 只查节点坐标不查边路径).
 *
 * 图: A,B,C 在层0, D,E 在层1; 边 C→E 与 B→D 需正交绕行 (斜对角), 应生成垂直弯点段.
 * 期望弯点来自 elkjs/ELK Java 实测 (seed=1): C→E=[(82,127),(82,92)], B→D=[(82,72),(82,37)].
 */
import { describe, expect, it } from 'vitest'
import { LGraph, LNode, LPort, LEdge, LayeredLayoutProvider } from '../../src/index.js'
import { Layer } from '../../src/graph/layer.js'

function makeNode(g: LGraph, layer: Layer): LNode {
  const n = new LNode(g)
  n.size = { x: 60, y: 30 }
  n.setLayer(layer)
  return n
}

// 与 elkt2test 生成测试一致: 端口不设 side, 由 PortSideProcessor 按边方向推断 (锚点由推断设置).
function addPort(n: LNode): LPort {
  const p = new LPort()
  p.setNode(n)
  return p
}

function edge(s: LPort, t: LPort): LEdge {
  const e = new LEdge()
  e.setSource(s)
  e.setTarget(t)
  return e
}

describe('OrthogonalEdgeRouter 边弯点 (ELK 对齐)', () => {
  it('需绕行的边生成正交弯点, 直线边无弯点', () => {
    const g = new LGraph()
    const l0 = new Layer(g)
    const l1 = new Layer(g)
    g.getLayers().push(l0, l1)
    const A = makeNode(g, l0), B = makeNode(g, l0), C = makeNode(g, l0)
    const D = makeNode(g, l1), E = makeNode(g, l1)
    const pA = addPort(A), pB = addPort(B), pC = addPort(C)
    const pD = addPort(D), pE = addPort(E)
    const eAD = edge(pA, pD), eBE = edge(pB, pE), eCE = edge(pC, pE), eBD = edge(pB, pD)
    g.setProperty('org.eclipse.elk.layered.randomSeed', 1)
    g.setProperty('org.eclipse.elk.direction', 'RIGHT')
    new LayeredLayoutProvider().layout(g)

    // 直线边 (源/目标 Y 一致) → 无弯点
    expect(eAD.getBendPoints().length).toBe(0)
    expect(eBE.getBendPoints().length).toBe(0)

    // 绕行边 (C→E, B→D 斜对角) → 2 个正交弯点: (segmentX, sourceY) + (segmentX, targetY)
    for (const e of [eCE, eBD]) {
      const bps = e.getBendPoints()
      expect(bps.length).toBe(2)
      // 弯点 X 相同 (垂直段在路由槽位置)
      expect(Math.abs(bps[0]!.x - bps[1]!.x) < 1e-6).toBe(true)
      // 首弯点 Y = 源端口绝对 Y, 次弯点 Y = 目标端口绝对 Y
      const sp = e.getSource()!, tp = e.getTarget()!
      expect(Math.abs(bps[0]!.y - sp.getAbsoluteAnchor().y) < 1e-6).toBe(true)
      expect(Math.abs(bps[1]!.y - tp.getAbsoluteAnchor().y) < 1e-6).toBe(true)
      // 弯点 X 在源/目标端口 X 之间 (路由区)
      const sx = sp.getAbsoluteAnchor().x, tx = tp.getAbsoluteAnchor().x
      expect(bps[0]!.x).toBeGreaterThan(sx)
      expect(bps[0]!.x).toBeLessThan(tx)
    }

    // 所有边弯点正交: 每对相邻弯点共享 x 或 y
    for (const e of [eAD, eBE, eCE, eBD]) {
      const bps = e.getBendPoints()
      for (let i = 1; i < bps.length; i++) {
        const a = bps[i - 1]!, b = bps[i]!
        expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6).toBe(true)
      }
    }
  })
})
