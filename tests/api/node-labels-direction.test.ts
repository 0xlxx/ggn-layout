/**
 * 回归：NODE_LABELS 容器撑宽 × direction（ELK Java jar oracle vs ggn 一致性）。
 *
 * 2026-08-16 对抗审阅（Mill）+ ELK Java 实证：此前的「nested min 随方向转置」是错误修复——
 * ELK Java 的 GraphTransformer.transposeAll 不转置 nested graph 的 NODE_SIZE_MINIMUM
 * （javap ElkGraphTransformer/GraphTransformer 实证），真正差异在 FREE 端口导入期定侧未按方向
 * （ElkGraphImporter 用 PortSide.fromDirection(direction)；ggn 恒 EAST/WEST → DOWN/UP 下
 * PORT_LABELS 贡献方向错）。修复后 ggn 四方向与 ELK Java jar 逐项一致：
 *   RIGHT/LEFT: 容器 136×83（label 撑宽 126+10）
 *   DOWN/UP:    容器 76×136（label 撑高，NODE_LABELS 沿布局方向）
 * 本测试用 elkjs 仅作旁证（其 INCLUDE_CHILDREN 输入与 ELK Java 一致），主断言为尺寸方向正确性。
 */
import { describe, expect, it } from 'vitest'
import { layoutElkJson } from '../../src/api/index.js'

const mk = (dir: string) => ({
  id: 'root',
  layoutOptions: { 'org.eclipse.elk.algorithm': 'layered', 'org.eclipse.elk.direction': dir },
  children: [
    {
      id: 'g',
      layoutOptions: {
        'org.eclipse.elk.nodeLabels.placement': ['INSIDE', 'H_CENTER', 'V_TOP'],
        'org.eclipse.elk.nodeSize.constraints': ['NODE_LABELS'],
      },
      labels: [{ text: '审核子流程 · layered', width: 126, height: 16 }],
      children: [{ id: 'n1', width: 52, height: 38 }],
    },
    { id: 'leaf', width: 52, height: 38 },
  ],
})

describe('NODE_LABELS 容器撑宽 × direction（ELK Java jar oracle，2026-08-16 P1-1 修复回归）', () => {
  for (const dir of ['RIGHT', 'LEFT', 'DOWN', 'UP'] as const) {
    it(`${dir}: 容器 w/h 与 ELK Java 一致（RIGHT/LEFT 撑宽 136×83；DOWN/UP 撑高 76×136）`, () => {
      const g = (layoutElkJson(mk(dir), { direction: dir, hierarchyHandling: 'INCLUDE_CHILDREN' }) as {
        children?: { id: string; width: number; height: number }[]
      })
      const gg = g.children?.find((c) => c.id === 'g')
      // ELK Java 0.12.0 jar 实证（LayoutJsonMain /tmp/nld-*.json）
      const expected = dir === 'RIGHT' || dir === 'LEFT' ? { w: 136, h: 83 } : { w: 76, h: 136 }
      expect(gg?.width).toBe(expected.w)
      expect(gg?.height).toBe(expected.h)
    })
  }
})

describe('深层嵌套 FREE 端口方向传播（审阅 Kepler P1，2026-08-16）', () => {
  // Kepler 对抗审阅实证：propagateNestedDirections 此前只在 doCompoundLayout 内调用，
  // 晚于 applyNestedGraphMinimumSizes → 第二层及更深 nested graph 的 DIRECTION 仍为
  // UNDEFINED → FREE 端口定侧回落 RIGHT（WEST）→ PORT_LABELS 贡献方向错 → 内层容器尺寸错
  //（修复前 54×60 vs ELK Java 54×54）。修复 = propagateNestedDirections 提前到 layout() 开头
  //（applyNestedGraphMinimumSizes 之前），深层嵌套继承父方向后端口定 NORTH/SOUTH。
  // ELK Java 0.12.0 jar 实测：外层 G 142×102、内层 H 54×44（port label 在 N/S 贡献宽度）。
  it('两层嵌套 + DOWN + FREE port + PORT_LABELS：内层容器与 ELK Java 一致（54×44）', () => {
    const input = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'layered', 'org.eclipse.elk.direction': 'DOWN', 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'G',
          layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': ['INSIDE', 'H_CENTER', 'V_TOP'], 'org.eclipse.elk.nodeSize.constraints': ['NODE_LABELS'], 'org.eclipse.elk.contentAlignment': ['H_CENTER', 'V_TOP'] },
          labels: [{ text: '外层', width: 40, height: 16 }],
          children: [
            { id: 'H', layoutOptions: { 'org.eclipse.elk.nodeSize.constraints': ['PORT_LABELS', 'PORTS'] }, ports: [{ id: 'P1', labels: [{ text: 'port-label', width: 40, height: 12 }] }], children: [{ id: 'n1', width: 30, height: 20 }] },
            { id: 'n2', width: 30, height: 20 },
          ],
        },
      ],
    }
    const r = layoutElkJson(structuredClone(input), { direction: 'DOWN', hierarchyHandling: 'INCLUDE_CHILDREN' })
    const all = new Map<string, { id: string; width?: number; height?: number }>()
    const walk = (n: { id: string; width?: number; height?: number; children?: unknown[] }) => {
      all.set(n.id, n)
      for (const c of (n.children ?? []) as Parameters<typeof walk>[0][]) walk(c)
    }
    walk(r as Parameters<typeof walk>[0])
    const H = all.get('H')
    expect(H?.width).toBe(54)
    expect(H?.height).toBe(44)
  })
})

describe('B4 非法值不污染布局（审阅 Kepler P0 收口，2026-08-16）', () => {
  // Kepler 复审实证：向量正则 [\d.]+ 接受 "(.,2)"/"(1.2.3,4)" → {x:NaN}，padding bracket
  // "[top=foo]" → {top:NaN} → 坐标 NaN。修复 = 严格数字正则 + Number.isFinite 校验，
  // 任一分量非 finite → 整个选项不设置（ELK Java 0.12.0 实测忽略非法选项回默认）。
  const cases: Array<[string, Record<string, unknown>]> = [
    ['nodeSize.minimum "(.,2)"', { 'org.eclipse.elk.nodeSize.minimum': '(.,2)' }],
    ['nodeSize.minimum "(1.2.3,4)"', { 'org.eclipse.elk.nodeSize.minimum': '(1.2.3,4)' }],
    ['position "(.,2)"', { 'org.eclipse.elk.position': '(.,2)' }],
    ['nodeLabels.padding "[top=foo]"', { 'org.eclipse.elk.nodeLabels.padding': '[top=foo]' }],
    ['nodeLabels.padding "[top=20,left=foo]"', { 'org.eclipse.elk.nodeLabels.padding': '[top=20,left=foo]' }],
  ]
  it.each(cases)('%s → 坐标全 finite（B4 不设置 → 默认）', (_name, lo) => {
    const input = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'layered', 'org.eclipse.elk.direction': 'RIGHT' },
      children: [{ id: 'n', width: 10, height: 10, layoutOptions: lo, labels: [{ text: 'L', width: 30, height: 12 }] }],
    }
    const r = layoutElkJson(structuredClone(input)) as { children?: { x?: number; y?: number; width?: number; height?: number }[] }
    const n = r.children?.[0]
    expect(Number.isFinite(n?.x)).toBe(true)
    expect(Number.isFinite(n?.y)).toBe(true)
    expect(Number.isFinite(n?.width)).toBe(true)
    expect(Number.isFinite(n?.height)).toBe(true)
  })
})

describe('端口默认尺寸（审阅 Kepler G 场景，2026-08-16）', () => {
  // Kepler 复审实证：外层容器 G 146×110 vs ELK Java 142×102（差 4×8）——根因 = elkJsonToParsed
  // 端口无显式尺寸时默认 8×8（自创），ELK Java JSON importer（JsonImporter.xtend
  // transformShapeLayout）保持 ElkShape 默认 0×0（ElkShapeImpl EDEFAULT dconst_0）→ 无连接 FREE
  // 端口贡献 margin 8px → 外层容器高 8px。修复 = elkJsonToParsed 端口默认 8→0（elkt 语料路径
  // buildLGraphFromParsed ?? 8 不受影响）。ELK Java jar 实测：无 label G=128×89、有 label G=142×102。
  const mk = (portLabel?: { text: string; width: number; height: number }) => ({
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.algorithm': 'layered', 'org.eclipse.elk.direction': 'DOWN', 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
    children: [
      { id: 'G', layoutOptions: { 'org.eclipse.elk.nodeLabels.placement': ['INSIDE', 'H_CENTER', 'V_TOP'], 'org.eclipse.elk.nodeSize.constraints': ['NODE_LABELS'], 'org.eclipse.elk.contentAlignment': ['H_CENTER', 'V_TOP'] },
        labels: [{ text: '外层', width: 40, height: 16 }],
        children: [
          { id: 'H', ports: [{ id: 'P1', ...(portLabel ? { labels: [portLabel] } : {}) }], children: [{ id: 'n1', width: 30, height: 20 }] },
          { id: 'n2', width: 30, height: 20 },
        ] },
    ],
  })
  it.each([
    ['无端口 label', undefined, 128, 89],
    ['有端口 label', { text: 'port-label', width: 40, height: 12 }, 142, 102],
  ] as const)('%s：外层 G 容器尺寸与 ELK Java 一致', (_name, portLabel, ew, eh) => {
    const r = layoutElkJson(mk(portLabel), { direction: 'DOWN', hierarchyHandling: 'INCLUDE_CHILDREN' })
    const all = new Map<string, { id: string; width?: number; height?: number }>()
    const walk = (n: { id: string; width?: number; height?: number; children?: unknown[] }) => {
      all.set(n.id, n)
      for (const c of (n.children ?? []) as Parameters<typeof walk>[0][]) walk(c)
    }
    walk(r as Parameters<typeof walk>[0])
    const G = all.get('G')
    expect(G?.width).toBe(ew)
    expect(G?.height).toBe(eh)
  })
})
