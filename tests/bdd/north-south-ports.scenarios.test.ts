/**
 * N-S 外部端口正交边路由 (HierarchicalPortOrthogonalEdgeRouter) — 直接 vitest BDD
 * (由 north-south-ports.feature 迁移).
 *
 * 期望语义来自 ELK Java intermediate.HierarchicalPortOrthogonalEdgeRouter (Step1-6):
 *   Step2 定位: northY = -padding.top - offset.y, southY = size.y + padding.top + padding.bottom - offset.y;
 *   Step3 路由: NORTH slots>0 → offset.y += nodeSpacing + (slots-1)*edgeSpacing 且 size.y += 同值;
 *               SOUTH slots>0 → 仅 size.y += 同值; slots=0 (直线边) → 不加;
 *   Step4 移除临时替换 dummy, 出入边重连到原始 dummy;
 *   Step5 修正 E/W dummy x: WEST = -offset.x - padding.left, EAST = size.x + padding.right - offset.x.
 * 注: ggn 当前 northY 用 -offset.y (padding 由 resizeParentNode 单独计入), 与 ELK 差 -padding.top;
 *     二者经 resize 后 dummy 均落在父节点顶边 (y=0), 语义等价。
 */
import { describe, expect, it } from 'vitest'
import { PortSide, NodeType, EXT_PORT_REPLACED_DUMMY, getEdgeEndpoints } from '../../src/index.js'
import {
  Harness, buildNSRoutingGraph, runNSRouting, parseNSLayout,
  expectNSOffsetAndSize, expectNSDummyPosition, expectWESTDummyX, expectEASTDummyX, expectOriginalsHoldEdges,
  expectNoDanglingEdges, expectTempDummiesRemoved, expectExtDummiesOutside, expectFiniteGraph, expectAcyclic,
} from './bdd-helpers.js'

/** ELK Step3: slots>0 → nodeSpacing + (slots-1)*edgeSpacing; slots=0 (直线边) → 0. */
const ROUTE_CASES = [
  { name: 'NORTH 直线边 (槽数 0)', side: 'NORTH', layout: '0', slots: 0, nodeSpacing: 20, edgeSpacing: 10 },
  { name: 'NORTH 2 temp (槽数 1)', side: 'NORTH', layout: '0,100', slots: 1, nodeSpacing: 20, edgeSpacing: 10 },
  { name: 'NORTH 2 temp (槽数 1, 大节点间距)', side: 'NORTH', layout: '0,100', slots: 1, nodeSpacing: 40, edgeSpacing: 5 },
  { name: 'NORTH 2 原始 dummy (槽数 2)', side: 'NORTH', layout: '0,60;40,100', slots: 2, nodeSpacing: 20, edgeSpacing: 10 },
  { name: 'NORTH 2 原始 dummy (槽数 2, 大边间距)', side: 'NORTH', layout: '0,60;40,100', slots: 2, nodeSpacing: 30, edgeSpacing: 15 },
  { name: 'SOUTH 直线边 (槽数 0)', side: 'SOUTH', layout: '0', slots: 0, nodeSpacing: 20, edgeSpacing: 10 },
  { name: 'SOUTH 2 temp (槽数 1)', side: 'SOUTH', layout: '0,100', slots: 1, nodeSpacing: 20, edgeSpacing: 10 },
  { name: 'SOUTH 2 原始 dummy (槽数 2)', side: 'SOUTH', layout: '0,60;40,100', slots: 2, nodeSpacing: 20, edgeSpacing: 10 },
]

describe('N-S 外部端口正交边路由', () => {
  it.each(ROUTE_CASES)('N-S 外部端口路由调整嵌套图尺寸与偏移: $name', ({ side, layout, slots, nodeSpacing, edgeSpacing }) => {
    const h = new Harness()
    buildNSRoutingGraph(h, { side: side as PortSide, groups: parseNSLayout(layout), nodeSpacing, edgeSpacing })
    runNSRouting(h)
    expectNSOffsetAndSize(h, side, slots)
    expectNoDanglingEdges(h)
    expectTempDummiesRemoved(h)
    expectExtDummiesOutside(h)
    expectFiniteGraph(h)
    expectAcyclic(h)
  })

  it.each([{ side: 'NORTH' }, { side: 'SOUTH' }])('N/S 外部端口 dummy 定位 (ELK 语义): $side', ({ side }) => {
    const h = new Harness()
    buildNSRoutingGraph(h, { side: side as PortSide, groups: [[0, 100]], nodeSpacing: 20, edgeSpacing: 10 })
    runNSRouting(h)
    expectNSDummyPosition(h, side)
    expectNoDanglingEdges(h)
    expectTempDummiesRemoved(h)
    expectExtDummiesOutside(h)
    expectFiniteGraph(h)
    expectAcyclic(h)
  })

  it('Step5 修正 E/W 外部端口 dummy 的 x 坐标', () => {
    // 单个 NORTH temp (x=100) 与原始 dummy 对齐 → 直线边 slots=0; 图宽 100 供 EAST.x 断言.
    const h = new Harness()
    buildNSRoutingGraph(h, { side: PortSide.NORTH, groups: [[100]], nodeSpacing: 20, edgeSpacing: 10 }, { withEW: true, graphWidth: 100 })
    runNSRouting(h)
    expectWESTDummyX(h)
    expectEASTDummyX(h)
    expectNoDanglingEdges(h)
    expectTempDummiesRemoved(h)
    expectExtDummiesOutside(h)
    expectFiniteGraph(h)
    expectAcyclic(h)
  })


  it('Step3 北/南向路由生成正交弯点 (ELK routeEdges calculateBendPoints)', () => {
    // 场景: L0=[源] L1=[2 temp] → 恢复原始 dummy + 路由.
    //   NORTH: 每个 temp 出边 3 弯点 [(tx, y0), (tx, trackY), (origX, trackY)], trackY = -offset.y (向上);
    //   SOUTH: 同形, trackY = size.y + ... (向下). 相邻弯点必须正交 (共享 x 或 y).
    for (const side of ['NORTH', 'SOUTH'] as const) {
      const h = new Harness()
      buildNSRoutingGraph(h, { side: side as PortSide, groups: [[0, 100]], nodeSpacing: 20, edgeSpacing: 10 })
      runNSRouting(h)
      const bends = h.edges.map(e => e.getBendPoints().map(b => ({ x: b.x, y: b.y })))
      expect(bends.length, `${side} 应有 2 条路由边`).toBe(2)
      for (const pts of bends) {
        expect(pts.length, `${side} 边应有 3 个弯点 (sourceX, track, targetX)`).toBe(3)
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i]!, b = pts[i + 1]!
          const ortho = Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6
          expect(ortho, `${side} 弯点 ${JSON.stringify(a)}→${JSON.stringify(b)} 不正交`).toBe(true)
        }
      }
      // NORTH: 2 条边 track 相同 (同槽), 且 trackY = -nodeSpacing (startPos=-nodeSpacing-offset.y, slot=0);
      // SOUTH: 同理 trackY = +nodeSpacing (offset.y 不变).
      const ys = bends.map(pts => pts[1]!.y)
      expect(new Set(ys.map(y => Math.round(y))).size, `${side} 同槽边 track y 应一致`).toBe(1)
      if (side === 'NORTH') expect(Math.round(ys[0]!)).toBe(-20)
      else expect(Math.round(ys[0]!)).toBe(20)
    }
  })

  it('Step4 临时 dummy 移除后出入边重连到原始 dummy', () => {
    const h = new Harness()
    buildNSRoutingGraph(h, { side: PortSide.NORTH, groups: [[0, 100]], nodeSpacing: 20, edgeSpacing: 10 })
    runNSRouting(h)
    expectOriginalsHoldEdges(h)
    expectNoDanglingEdges(h)
    expectTempDummiesRemoved(h)
    expectExtDummiesOutside(h)
    expectFiniteGraph(h)
    expectAcyclic(h)
  })

  it('端到端: 含 N/S 外部端口的复合图布局后保持结构不变量', () => {
    const h = new Harness()
      .compound('P', 'C1, C2')
      .fixedSidePorts('P', ['pN', 'NORTH'], ['pS', 'SOUTH'])
      .node('N1', 'N2')
      .edge('N1→pN, N2→pS, pN→C1, pS→C2')
      .layoutIncludeChildren()
    expectNoDanglingEdges(h)
    expectTempDummiesRemoved(h)
    expectFiniteGraph(h)
    expectAcyclic(h)
  })

  it('FIXED_POS 北外部端口不被残留替换 dummy 覆盖 (194 回归)', () => {
    // 194_excessiveWhiteSpace 根因: TS LNode(graph) 构造会 push layerlessNodes, 而 HPC 在
    // P2 清理后创建的 N/S 替换 dummy 经 HOR Step4 setLayer(null) 后仍残留 layerlessNodes →
    // resizeParentNode (getAllNodes) 用残留 dummy 的 ORIGIN LPort 再次 getExternalPortPosition,
    // 覆盖真实端口位置 → 3 个 FIXED_POS 北端口全塌缩到同一 x (修复前 88/88/88, 边端点 92/92/92).
    // 修复后各端口贴各自真实 dummy: p2=68, p1=86, p3=104 (布局确定性: RANDOM_SEED 默认 1).
    const h = new Harness()
      .compound('P', 'C1')
      .fixedSidePorts('P', ['p1', 'NORTH'], ['p2', 'NORTH'], ['p3', 'NORTH'])
      .edge('C1→p1, C1→p2, C1→p3')
    h.nodes.get('P')!.setProperty('org.eclipse.elk.portConstraints', 'FIXED_POS')
    h.ports.get('p1')!.getPosition().x = 100
    h.ports.get('p2')!.getPosition().x = 150
    h.ports.get('p3')!.getPosition().x = 200
    h.layoutIncludeChildren()
    expect(h.ports.get('p1')!.getPosition().x).toBeCloseTo(86)
    expect(h.ports.get('p2')!.getPosition().x).toBeCloseTo(68)
    expect(h.ports.get('p3')!.getPosition().x).toBeCloseTo(104)
    // 边端点贴各自端口锚点 (修复前全塌缩到同一 x=92).
    const txs = h.edges.map((e) => getEdgeEndpoints(e).target.x)
    expect(new Set(txs.map((x) => Math.round(x))).size, 'N 外部端口边端点塌缩到同 x').toBe(3)
  })

  it('HOR Step4 后无残留层外替换 dummy (all_four_port_sides/hierarchy09 回归)', () => {
    // 同一根因的机制级断言: HPC 创建的 N/S 替换 dummy 被 HOR Step4 setLayer(null) 后,
    // 不得再残留于 layerlessNodes (Java LNode 构造不入 layerlessNodes, 删除即彻底移除).
    // 若残留, resizeParentNode (getAllNodes) 会用其 ORIGIN LPort 覆盖真实端口位置
    // (all_four_port_sides 实证 N1 +16 / S1 -20; hierarchy09 CN2 -27.5).
    const h = new Harness()
      .compound('P', 'C1')
      .fixedSidePorts('P', ['N1', 'NORTH'], ['S1', 'SOUTH'], ['E1', 'EAST'], ['W1', 'WEST'])
      .edge('C1→N1, C1→S1, E1→C1, W1→C1')
    h.layoutIncludeChildren()
    const nested = h.nodes.get('P')!.getNestedGraph()!
    const stale = nested.getLayerlessNodes().filter(
      (n) => n.getType() === NodeType.EXTERNAL_PORT && n.hasProperty(EXT_PORT_REPLACED_DUMMY),
    )
    expect(stale.length, '残留替换 dummy 不应留在 layerlessNodes').toBe(0)
    // 真实外部端口 dummy 全部在层内 (结构不变量).
    const layered = nested.getLayers().flatMap((l) => l.getNodes())
      .filter((n) => n.getType() === NodeType.EXTERNAL_PORT)
    expect(layered.length, '外部端口 dummy 应全部在层内').toBe(4)
    expectNoDanglingEdges(h)
  })
})
