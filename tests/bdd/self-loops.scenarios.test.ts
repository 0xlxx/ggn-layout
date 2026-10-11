/**
 * 内部自环 (inside self loops) + 跨层级边端点/弯点坐标系 — 直接 vitest BDD.
 *
 * 语义基准 = ELK Java 0.12.0 (scripts/verify-elkg-java-layout.ts, ε=1e-3):
 *   1. inside 自环端点规则 (ElkGraphLayoutTransferrer L263 sourcePoint =
 *      ledge.getSource().getAbsoluteAnchor()):
 *        - INCLUDE_CHILDREN (compound 路径, CGP 外部端口 dummy): 端点 = 端口绝对锚点
 *          (inside_outside P1 s22 / 167 P1 s42 / 548 P1 s12);
 *        - SEPARATE_CHILDREN (simple 路径, 节点内容单独布局): 端点 = 节点边界投影
 *          (298 P2 WEST s32,34 非锚点 (12,34)).
 *   2. 298 节点尺寸: SEPARATE inside 自环节点 = cell 最小 (44×44), 而非 ComponentGroupGraphPlacer
 *      单分量负宽 (4×44).
 *   3. 跨层级边端点/弯点 = 挂载容器 (LCA) 坐标系:
 *        - 288b NN7.N2.N1->NN7.N4 (SPLINES): s(180.33,50.33) b(197.33,50.33) b(218.67,50.33)
 *          t(228.67,50.33);
 *        - 352 NN2.M1->NN3: 直边无弯点; NN2.M1->NN4 内段弯点 (375,54),(375,64).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseElkt, elktToElkJson } from '../../scripts/elkt2test.mjs'
import { layoutElkJson, type ElkNode } from '../../src/api/index.js'

const MODEL_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../test-resources/elk-models')

function layout(model: string): ElkNode {
  const json = elktToElkJson(parseElkt(readFileSync(join(MODEL_ROOT, model), 'utf8'))) as ElkNode
  return layoutElkJson(json)
}

/** 边 key: "容器::sources->targets" (递归收集, 与 verify 脚本 normGraph 同约定). */
function findEdge(root: ElkNode, key: string): { startPoint: { x: number; y: number }; endPoint: { x: number; y: number }; bendPoints?: { x: number; y: number }[] } | null {
  const walk = (n: ElkNode, path: string[]): { startPoint: any; endPoint: any; bendPoints?: any[] } | null => {
    for (const e of n.edges ?? []) {
      const sources = (e.sources ?? []).map(String).sort().join('|')
      const targets = (e.targets ?? []).map(String).sort().join('|')
      if (`${path.join('::')}::${sources}->${targets}` === key) return e.sections?.[0] ?? null
    }
    for (const c of n.children ?? []) {
      const r = walk(c, [...path, c.id])
      if (r !== null) return r
    }
    return null
  }
  return walk(root, [])
}

function node(root: ElkNode, id: string): { x: number; y: number; width: number; height: number } | null {
  const walk = (n: ElkNode): any => {
    if (n.id === id) return { x: n.x ?? 0, y: n.y ?? 0, width: n.width ?? 0, height: n.height ?? 0 }
    for (const c of n.children ?? []) { const r = walk(c); if (r !== null) return r }
    return null
  }
  return walk(root)
}

const pt = (p: { x: number; y: number } | undefined): string => (p ? `${p.x.toFixed(3)},${p.y.toFixed(3)}` : '?')
const near = (a: { x: number; y: number }, b: { x: number; y: number }): boolean =>
  Math.abs(a.x - b.x) < 1e-3 && Math.abs(a.y - b.y) < 1e-3

describe('内部自环 (inside self loops) 端点/尺寸', () => {
  it('INCLUDE_CHILDREN: yo 自环端点 = 端口绝对锚点 (inside_outside P1 s22 / P2 t122)', () => {
    const out = layout('tests/layered/self_loops/inside_outside.elkt')
    const sec = findEdge(out, '::NN1.P1->NN1.P2')!
    expect(sec).not.toBeNull()
    expect(pt(sec.startPoint)).toBe('22.000,74.000')
    expect(pt(sec.endPoint)).toBe('122.000,74.000')
  })

  it('INCLUDE_CHILDREN: 端口在节点外时端点仍为端口锚点 (167 P1 s42 / P2 t82)', () => {
    const out = layout('tickets/layered/167_insidePortLabelsInHierarchicalGraphs.elkt')
    const sec = findEdge(out, '::NN1.P1->NN1.P2')!
    expect(pt(sec.startPoint)).toBe('42.000,28.000')
    expect(pt(sec.endPoint)).toBe('82.000,28.000')
  })

  it('INCLUDE_CHILDREN: FIXED_POS 端口 (节点外) 端点 = 端口锚点 (548 P1 s12 / P2 t56)', () => {
    const out = layout('tickets/layered/548_NPEWithInsideSelfLoops.elkt')
    const sec = findEdge(out, 'NN1::NN1.N2.P1->NN1.N2.P2')!
    expect(sec).not.toBeNull()
    expect(pt(sec.startPoint)).toBe('12.000,17.000')
    expect(pt(sec.endPoint)).toBe('56.000,17.000')
  })

  it('SEPARATE_CHILDREN: yo 自环端点 = 节点边界投影 (298 P2 s32,34 / P5 t44,56)', () => {
    const out = layout('tickets/layered/298_selfLoopsCauseAIOOBE.elkt')
    const sec = findEdge(out, '::NN1.P2->NN1.P5')!
    expect(sec).not.toBeNull()
    expect(pt(sec.startPoint)).toBe('32.000,34.000')
    expect(pt(sec.endPoint)).toBe('44.000,56.000')
    // 边界投影 ≠ 端口锚点: P2 abs (12,34) 在节点外.
    expect(near(sec.startPoint!, { x: 12, y: 34 })).toBe(false)
  })

  it('SEPARATE_CHILDREN: 无子节点 inside 自环节点尺寸 = cell 最小 44×44 (298, 非 4×44)', () => {
    const out = layout('tickets/layered/298_selfLoopsCauseAIOOBE.elkt')
    const n = node(out, 'NN1')!
    expect(n.width).toBe(44)
    expect(n.height).toBe(44)
  })

  it('SEPARATE_CHILDREN: 单分量 dummy 图保持 ComponentGroupGraphPlacer 负宽 (562 4×32)', () => {
    const out = layout('tickets/core/562_insideSelfLoopAlgorithmResolving.elkt')
    const n = node(out, 'NN1')!
    expect(n.width).toBe(4)
    expect(n.height).toBe(32)
  })
})

describe('跨层级边端点/弯点 = 挂载容器坐标系', () => {
  it('288b: 跨分支 SPLINES 边端点含源祖先偏移 (s180.33,50.33 / t228.67,50.33)', () => {
    const out = layout('tickets/layered/288_selfLoopsCauseNPE_b.elkt')
    const sec = findEdge(out, 'NN7::NN7.N2.N1->NN7.N4')!
    expect(sec).not.toBeNull()
    expect(pt(sec.startPoint)).toBe('180.333,50.333')
    expect(pt(sec.endPoint)).toBe('228.667,50.333')
    expect(sec.bendPoints?.map(pt)).toEqual(['197.333,50.333', '218.667,50.333'])
  })

  it('352: 直边跨层级边无多余弯点 (NN2.M1->NN3)', () => {
    const out = layout('tickets/layered/352_selfLoopNPEorAIOOBE.elkt')
    const sec = findEdge(out, '::NN2.M1->NN3')!
    expect(sec).not.toBeNull()
    expect(pt(sec.startPoint)).toBe('365.000,44.000')
    expect(pt(sec.endPoint)).toBe('442.000,44.000')
    expect(sec.bendPoints ?? []).toHaveLength(0)
  })

  it('352: 跨层级边内段弯点以父节点相对坐标并入挂载容器 (NN2.M1->NN4)', () => {
    const out = layout('tickets/layered/352_selfLoopNPEorAIOOBE.elkt')
    const sec = findEdge(out, '::NN2.M1->NN4')!
    expect(sec).not.toBeNull()
    expect(sec.bendPoints?.map(pt)).toEqual(['375.000,54.000', '375.000,64.000', '432.000,64.000', '432.000,74.000'])
  })
})
