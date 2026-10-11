/**
 * spline 自环路由行为 — 直接 vitest BDD (selfloop_crash.elkt 复刻).
 *
 * 语义不变量 (ELK Java 0.12.0 行为):
 *  - 自环节点的普通 spline 边 (n4→n5), sloppy 中心 CP 的度差必须计入**已恢复的自环**
 *    (Java SelfLoopPostProcessor 在 FinalSplineBendpointsCalculator 之前运行):
 *    outdegree(n4)=5 (4 自环 + 1 普通) > indegree(n5)=2 → degreeDiff=+1, 中心 CP 被拉向
 *    目标侧. 若自环未计入 (degreeDiff=-1), CP 落在源侧 (selfloop_crash jar b232,126.55
 *    vs ggn b232,158.95).
 *  - 外部自环 spline 弯点全部位于节点盒外 (不越界).
 *  - 外部自环 spline 弯点关于节点中心 x 对称.
 */
import { describe, expect, it } from 'vitest'
import { Harness } from './bdd-helpers.js'

/** 复刻 tests/layered/compaction_oned/selfloop/selfloop_crash.elkt (n4 带 4 个外部自环). */
function crashModel(): Harness {
  const h = new Harness()
    .splinesRouting()
    .postCompaction('LEFT')
    .node('n1', 'n2', 'n3', 'n4', 'n5')
  h.nodes.get('n2')!.size = { x: 40, y: 120 }
  h.edge('n1→n2, n2→n3, n3→n5, n4→n5, n4→n4, n4→n4, n4→n4, n4→n4')
  h.root.setProperty('org.eclipse.elk.randomSeed', 2)
  return h
}

function selfLoopsOf(h: Harness, name: string): import('../../src/graph/ledge.js').LEdge[] {
  const node = h.nodes.get(name)!
  return h.edges.filter(e => e.getSource()?.getNode() === node && e.getTarget()?.getNode() === node)
}

describe('spline 自环路由行为', () => {
  it('自环节点的普通边 sloppy 中心 CP 朝目标侧 (自环度计入, 与 Java 一致)', () => {
    const h = crashModel().layout()
    const n4 = h.nodes.get('n4')!
    const n5 = h.nodes.get('n5')!
    const e = h.edges.find(x => x.getSource()?.getNode() === n4 && x.getTarget()?.getNode() === n5)
    expect(e, 'n4→n5 边应存在').toBeDefined()
    const bends = e!.getBendPoints()
    // sloppy 双向 shortcut 路径: NUB=[src, v2, tgt] 补零后 Bezier 输出 [src锚点, 中心CP] 共 2 点
    expect(bends.length, 'n4→n5 应为 sloppy 双向 shortcut 路径 (2 弯点)').toBe(2)
    const ySource = e!.getSource()!.getAbsoluteAnchor().y
    const yTarget = e!.getTarget()!.getAbsoluteAnchor().y
    const mid = (ySource + yTarget) / 2
    // Java: degreeDiff=sign(out-n4 - in-n5)=sign(5-2)=+1 → 中心 CP 与目标同侧
    // (未计入自环时 degreeDiff=-1, CP 落源侧 → selfloop_crash b232,158.95 vs jar b232,126.55)
    const centerCP = bends[1]!
    expect(Math.sign(centerCP.y - mid), '中心 CP 应位于源/目标中点偏向目标侧').toBe(Math.sign(yTarget - ySource))
  })

  it('外部自环 spline 弯点不越界 (全部位于节点盒外)', () => {
    const h = crashModel().layout()
    const n4 = h.nodes.get('n4')!
    const loops = selfLoopsOf(h, 'n4')
    expect(loops.length, 'n4 应有 4 条自环').toBe(4)
    const box = { x: n4.position.x, y: n4.position.y, w: n4.size.x, h: n4.size.y }
    for (const e of loops) {
      for (const b of e.getBendPoints()) {
        const inside = b.x > box.x && b.x < box.x + box.w && b.y > box.y && b.y < box.y + box.h
        expect(inside, `自环弯点 (${b.x},${b.y}) 越界进入节点盒`).toBe(false)
      }
    }
  })

  it('外部自环 spline 弯点对称于节点中心 x', () => {
    const h = crashModel().layout()
    const n4 = h.nodes.get('n4')!
    const centerX = n4.position.x + n4.size.x / 2
    const loops = selfLoopsOf(h, 'n4')
    expect(loops.length, 'n4 应有 4 条自环').toBe(4)
    for (const e of loops) {
      const bends = e.getBendPoints()
      expect(bends.length).toBeGreaterThanOrEqual(2)
      for (let i = 0; i < Math.floor(bends.length / 2); i++) {
        const a = bends[i]!
        const b = bends[bends.length - 1 - i]!
        expect((a.x + b.x) / 2, `自环弯点 ${i} 与 ${bends.length - 1 - i} 关于节点中心对称`).toBeCloseTo(centerX, 6)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// NubsSelfLoop 收尾 (SplineEdgeRouter.selfLoopsLayer 处理路径) — 未预路由自环的样条生成.
// 常规管线自环在 P1 被 SelfLoopPreprocessor 隐藏并由 SplineSelfLoopRouter 预路由,
// 故这里直接构造"到达 P5 且未预路由"的自环图, 验证 SplineEdgeRouter 用 NubsSelfLoop
// 生成绝对坐标弯点: 端点锚定 (曲线过源/目标端口锚点) + 控制点方向 (沿端口侧外移)
// + 与 jar 弯点一致 (NubsSelfLoopProbe SIDE 参考值, size 先于 setSide → 真实 anchor).
// ─────────────────────────────────────────────────────────────────────────────
import { LGraph, LNode, LPort, LEdge, Layer, PortSide, NodeType } from '../../src/index.js'
import { SplineEdgeRouter } from '../../src/p5edges/splines/spline-edge-router.js'
import { NubsSelfLoop } from '../../src/p5edges/splines/nubs-self-loop.js'
import { getPointOnBezierSegment } from '../../src/p5edges/splines/splines-math.js'

/** 单层图 + EAST 侧同侧自环 (未隐藏), 直接跑 SplineEdgeRouter 触发 routeSelfLoops. */
function unhiddenSelfLoopGraph(): { graph: LGraph; edge: LEdge; node: LNode } {
  const graph = new LGraph()
  const layer = new Layer(graph)
  graph.getLayers().push(layer)

  const node = new LNode(graph)
  node.setType(NodeType.NORMAL)
  node.size = { x: 60, y: 30 }
  node.setLayer(layer)
  layer.getNodes().push(node)

  const mkPort = (x: number, y: number): LPort => {
    const p = new LPort()
    p.size = { x: 8, y: 8 }
    p.setSide(PortSide.EAST)
    p.setNode(node)
    p.getPosition().x = x
    p.getPosition().y = y
    return p
  }
  const p1 = mkPort(60, 5)
  const p2 = mkPort(60, 20)
  const edge = new LEdge()
  edge.setSource(p1)
  edge.setTarget(p2)
  return { graph, edge, node }
}

describe('spline 自环收尾 (NubsSelfLoop 接入 selfLoopsLayer)', () => {
  it('未预路由自环经 routeSelfLoops 生成弯点: 端点锚定 + 控制点方向 + 与 jar 一致', () => {
    const { graph, edge, node } = unhiddenSelfLoopGraph()
    expect(edge.isSelfLoop(), '边应为自环').toBe(true)

    new SplineEdgeRouter().process(graph)

    const bends = edge.getBendPoints()
    // SIDE 自环 (5 原始 CP, clamped cubic): Bezier 输出 5 点 (NubsSelfLoopProbe SIDE)
    expect(bends.length, '同侧自环应生成 5 个弯点').toBe(5)

    const ox = node.position.x
    const oy = node.position.y
    const srcAbs = { x: ox + 60 + 8, y: oy + 5 + 4 }
    const tgtAbs = { x: ox + 60 + 8, y: oy + 20 + 4 }
    // 控制点方向: EAST 侧, length=edgeNodeSpacing(10) → 首/末弯点 = 锚点 + (10, 0)
    expect(bends[0]).toEqual({ x: srcAbs.x + 10, y: srcAbs.y })
    expect(bends[4]).toEqual({ x: tgtAbs.x + 10, y: tgtAbs.y })
    // 全部弯点在节点盒外 (EAST 侧)
    for (const b of bends) {
      expect(b.x, 'EAST 侧自环弯点应在节点右侧').toBeGreaterThan(ox + 60)
    }
    // 端点锚定: 首个 Bezier 段起点 = 源端口绝对锚点 (t=0 处曲线过锚点)
    const start = getPointOnBezierSegment(0, [srcAbs, ...bends.slice(0, 3)])
    expect(start.x).toBeCloseTo(srcAbs.x, 9)
    expect(start.y).toBeCloseTo(srcAbs.y, 9)
    // 末段终点 = 目标端口绝对锚点 (用末 4 点, t=1 处曲线过锚点)
    const end = getPointOnBezierSegment(1, [...bends.slice(1), tgtAbs])
    expect(end.x).toBeCloseTo(tgtAbs.x, 9)
    expect(end.y).toBeCloseTo(tgtAbs.y, 9)
  })

  it('routeSelfLoops 与直接 NubsSelfLoop.createSideSelfLoop + 节点偏移一致', () => {
    const { graph, edge, node } = unhiddenSelfLoopGraph()
    new SplineEdgeRouter().process(graph)

    const source = edge.getSource()!
    const target = edge.getTarget()!
    const nubs = NubsSelfLoop.createSideSelfLoop(source, target, 10)
    const expected = nubs.getBezierCP().map(bp => ({ x: bp.x + node.position.x, y: bp.y + node.position.y }))
    expect(edge.getBendPoints()).toEqual(expected)
  })
})
