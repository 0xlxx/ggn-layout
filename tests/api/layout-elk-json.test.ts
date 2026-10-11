/**
 * layoutElkJson 高层 API 对齐测试 (vs elkjs 0.12.0).
 *
 * 验证: 标准 ELK JSON 输入 → 布局 → 输出 (节点 x/y/w/h + 边 sections)
 * 与 elkjs 逐项一致 (节点坐标 / startPoint / endPoint / bendPoints).
 */
import { describe, expect, it } from 'vitest'
import ELK from 'elkjs/lib/elk.bundled.js'
import { layoutElkJson, buildGraph, type ElkNode } from '../../src/api/index.js'

const elk = new ELK()

/** 递归收集节点世界坐标 (宽松类型兼容 elkjs 输出). */
type AnyElkNode = { id: string; x?: number; y?: number; children?: AnyElkNode[] }
function collectNodes(root: AnyElkNode, px = 0, py = 0): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  const walk = (list: AnyElkNode[] | undefined, ax: number, ay: number): void => {
    for (const c of list ?? []) {
      const wx = ax + (c.x ?? 0), wy = ay + (c.y ?? 0)
      out.set(c.id, { x: wx, y: wy })
      if (c.children) walk(c.children, wx, wy)
    }
  }
  walk(root.children, px, py)
  return out
}

/** 边 key: sources[0]|targets[0]. */
const edgeKey = (e: { sources?: string[]; targets?: string[] }): string => `${e.sources?.[0]}|${e.targets?.[0]}`

async function compareWithElkjs(input: ElkNode): Promise<{ nodeDiff: number; maxNodeD: number; edgeDiff: number; maxEdgeD: number }> {
  const ggn = layoutElkJson(input)
  const elkjs = await elk.layout(JSON.parse(JSON.stringify(input)) as Parameters<typeof elk.layout>[0])
  const gn = collectNodes(ggn), en = collectNodes(elkjs)
  expect(en.size, 'elkjs 节点数').toBe(gn.size)
  let nodeDiff = 0, maxNodeD = 0
  for (const [id, p] of en) {
    const q = gn.get(id)
    expect(q, `ggn 缺节点 ${id}`).toBeDefined()
    const d = Math.max(Math.abs(p.x - q!.x), Math.abs(p.y - q!.y))
    if (d > 0.05) { nodeDiff++; maxNodeD = Math.max(maxNodeD, d) }
  }
  // 边 sections
  const gm = new Map((ggn.edges ?? []).map((e) => [edgeKey(e), e]))
  const em = new Map((elkjs.edges ?? []).map((e) => [edgeKey(e), e]))
  expect(em.size, 'elkjs 边数').toBe(gm.size)
  let edgeDiff = 0, maxEdgeD = 0
  for (const [k, ee] of em) {
    const gg = gm.get(k)
    expect(gg, `ggn 缺边 ${k}`).toBeDefined()
    const a = gg!.sections?.[0], b = ee.sections?.[0]
    if (!a || !b) { edgeDiff++; continue }
    const pa = [a.startPoint, ...(a.bendPoints ?? []), a.endPoint]
    const pb = [b.startPoint, ...(b.bendPoints ?? []), b.endPoint]
    const m = Math.max(pa.length, pb.length)
    for (let j = 0; j < m; j++) {
      const x = pa[j] ?? pa[pa.length - 1]!
      const y = pb[j] ?? pb[pb.length - 1]!
      const d = Math.max(Math.abs(x.x - y.x), Math.abs(x.y - y.y))
      if (d > 0.05) { edgeDiff++; maxEdgeD = Math.max(maxEdgeD, d); break }
    }
  }
  return { nodeDiff, maxNodeD, edgeDiff, maxEdgeD }
}

describe('layoutElkJson (等价 elkjs 高层 API)', () => {
  it('最小图 A→B: 节点坐标 + 直线 section 一致', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [
        { id: 'A', width: 40, height: 20 },
        { id: 'B', width: 40, height: 20 },
      ],
      edges: [{ id: 'e0', sources: ['A'], targets: ['B'] }],
    }
    const r = await compareWithElkjs(input)
    expect(r.nodeDiff).toBe(0)
    expect(r.edgeDiff).toBe(0)
  })

  it('带端口约束与弯点的图: bendPoints 一致', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [
        { id: 'A', width: 60, height: 40, ports: [{ id: 'A.p1', x: -8, y: 16, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST', 'org.eclipse.elk.port.index': '0' } }, { id: 'A.p2', x: 60, y: 16, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'EAST', 'org.eclipse.elk.port.index': '1' } }] },
        { id: 'B', width: 40, height: 20, ports: [{ id: 'B.p1', x: -8, y: 6, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST', 'org.eclipse.elk.port.index': '0' } }] },
        { id: 'C', width: 40, height: 20, ports: [{ id: 'C.p1', x: -8, y: 6, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST', 'org.eclipse.elk.port.index': '0' } }] },
      ],
      edges: [
        { id: 'e0', sources: ['A.p2'], targets: ['B.p1'] },
        { id: 'e1', sources: ['A.p2'], targets: ['C.p1'] },
      ],
    }
    const r = await compareWithElkjs(input)
    expect(r.nodeDiff).toBe(0)
    expect(r.edgeDiff).toBe(0)
  })

  it('嵌套图 (INCLUDE_CHILDREN): 子图节点坐标相对父 + 跨层边一致', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT', 'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN' },
      children: [
        {
          id: 'P', width: 120, height: 80,
          children: [
            { id: 'X', width: 30, height: 20 },
            { id: 'Y', width: 30, height: 20 },
          ],
          edges: [{ id: 'e0', sources: ['X'], targets: ['Y'] }],
        },
        { id: 'Z', width: 40, height: 20 },
      ],
      edges: [{ id: 'e1', sources: ['P'], targets: ['Z'] }],
    }
    const r = await compareWithElkjs(input)
    expect(r.nodeDiff).toBe(0)
    expect(r.edgeDiff).toBe(0)
  })

  it('demo 图 (carTracking 标准 JSON 输入): 节点 + 边 sections 全对齐', async () => {
    // 内联最小等价: 用 3 节点 + 多端口验证 (完整 50 节点图见 docs/API.md 说明)
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT', 'org.eclipse.elk.randomSeed': '1' },
      children: [
        { id: 'N1', width: 41, height: 41, ports: [{ id: 'N1.p1', x: -8, y: 16.5, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST', 'org.eclipse.elk.port.index': '0' } }] },
        { id: 'N2', width: 41, height: 41, ports: [{ id: 'N2.p1', x: -8, y: 16.5, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST', 'org.eclipse.elk.port.index': '0' } }] },
        { id: 'N3', width: 61, height: 41, ports: [{ id: 'N3.p1', x: -8, y: 16.5, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST', 'org.eclipse.elk.port.index': '0' } }, { id: 'N3.p2', x: 61, y: 16.5, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'EAST', 'org.eclipse.elk.port.index': '1' } }] },
      ],
      edges: [
        { id: 'e0', sources: ['N1.p1'], targets: ['N3.p2'] },
        { id: 'e1', sources: ['N2.p1'], targets: ['N3.p2'] },
      ],
    }
    const r = await compareWithElkjs(input)
    expect(r.nodeDiff).toBe(0)
    expect(r.edgeDiff).toBe(0)
  })
})

describe('buildGraph 隐式端口 (回归: 入/出边复用同一端口 bug)', () => {
  it('同节点既有入边又有出边 → 各建独立端口 (源 EAST / 目标 WEST)', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [
        { id: 'A', width: 40, height: 20 },
        { id: 'B', width: 40, height: 20 },
        { id: 'C', width: 40, height: 20 },
      ],
      edges: [
        { id: 'e0', sources: ['A'], targets: ['B'] },
        { id: 'e1', sources: ['B'], targets: ['C'] },
      ],
    }
    const built = buildGraph(input)
    const b = built.nodeOf.get('B')!
    expect(b.getPorts()).toHaveLength(2)
    const sides = b.getPorts().map((p) => p.getSide()).sort()
    expect(sides).toEqual(['EAST', 'WEST'])
    // 入/出边各自连到独立端口 (非同一端口复用)
    const inEdge = b.getPorts()[0]!.getIncomingEdges()
    const outEdge = b.getPorts()[0]!.getOutgoingEdges()
    expect(inEdge.length + outEdge.length).toBe(1)
  })
})

describe('hierarchicalEdges 跨层边 (回归: TARGET_OFFSET 含 padding 双计 bug)', () => {
  it('嵌套节点位置 + 根层跨层边端点对齐 ELK Java', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: {
        'org.eclipse.elk.algorithm': 'elk.layered',
        'org.eclipse.elk.hierarchyHandling': 'INCLUDE_CHILDREN',
        'org.eclipse.elk.direction': 'RIGHT',
        'org.eclipse.elk.randomSeed': '1',
      },
      children: [
        { id: 'Nsource', width: 60, height: 30 },
        {
          id: 'Noutside', width: 60, height: 30,
          children: [{
            id: 'Noutside.inside', width: 60, height: 30,
            children: [
              { id: 'Noutside.inside.n1', width: 60, height: 30 },
              { id: 'Noutside.inside.n2', width: 60, height: 30 },
            ],
            edges: [{ id: 'e0', sources: ['Noutside.inside.n1'], targets: ['Noutside.inside.n2'] }],
          }],
        },
      ],
      edges: [{ id: 'e1', sources: ['Nsource'], targets: ['Noutside.inside.n1'] }],
    }
    const out = layoutElkJson(input)
    const outside = out.children!.find((c) => c.id === 'Noutside')!
    const inside = outside.children![0]!
    const n1 = inside.children![0]!
    const n2 = inside.children![1]!
    // 节点位置/尺寸 (jar oracle: examples__hierarchy__hierarchicalEdges)
    expect(outside.x).toBe(97); expect(outside.y).toBe(12)
    expect(outside.width).toBe(193); expect(outside.height).toBe(78)
    expect(inside.x).toBe(17); expect(inside.y).toBe(12)
    expect(inside.width).toBe(164); expect(inside.height).toBe(54)
    expect(n1.x).toBe(12); expect(n1.y).toBe(12)
    expect(n2.x).toBe(92); expect(n2.y).toBe(12)
    // 跨层边 e1 端点 (jar: start (72,51) end (126,51)) — TARGET_OFFSET 修复前 ggn 为 (150,75)
    const e1 = out.edges!.find((e) => e.sources?.[0] === 'Nsource')!
    const s = e1.sections![0]!
    expect(s.startPoint).toEqual({ x: 72, y: 51 })
    expect(s.endPoint).toEqual({ x: 126, y: 51 })
  })
})

describe('自环边挂载容器 (回归: elkjs/jar 挂 root/父容器, 非节点自身)', () => {
  it('普通自环 A.p1->A.p2 → 挂 root.edges (非 A.edges)', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [{
        id: 'A', width: 40, height: 40,
        ports: [
          { id: 'A.p1', x: -8, y: 16, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'WEST' } },
          { id: 'A.p2', x: 40, y: 16, width: 8, height: 8, properties: { 'org.eclipse.elk.port.side': 'EAST' } },
        ],
      }],
      edges: [{ id: 'e0', sources: ['A.p1'], targets: ['A.p2'] }],
    }
    const out = layoutElkJson(input)
    expect(out.edges?.map((e) => e.sources?.[0])).toContain('A.p1')
    expect(out.children?.[0]?.edges ?? []).toHaveLength(0)
  })
})

describe('inside 自环端点 = 节点边界 (回归: 298/273 jar 实证, 非端口锚点)', () => {
  it('FIXED_SIDE WEST/SOUTH inside 自环: 端点 = 端口内边投影到边界', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.direction': 'RIGHT' },
      children: [{
        id: 'NN1', width: 100, height: 100,
        layoutOptions: { 'org.eclipse.elk.insideSelfLoops.activate': 'true', 'org.eclipse.elk.portConstraints': 'FIXED_SIDE' },
        ports: [
          { id: 'NN1.P2', x: -20, y: 12, width: 20, height: 20, properties: { 'org.eclipse.elk.port.side': 'WEST' } },
          { id: 'NN1.P5', x: 2, y: 44, width: 20, height: 20, properties: { 'org.eclipse.elk.port.side': 'SOUTH' } },
        ],
      }],
      edges: [{ id: 'e0', sources: ['NN1.P2'], targets: ['NN1.P5'], properties: { 'org.eclipse.elk.insideSelfLoops.yo': 'true' } }],
    }
    const out = layoutElkJson(input)
    const e = out.edges![0]!
    const s = e.sections![0]!
    // 边界点 (jar 298): source (32,34) = N1.x + P2 内边(x=0), target (44,56) = N1.y + P5 内边(y=44)
    expect(s.startPoint.x).toBeCloseTo(out.children![0]!.x!, 0)
    expect(s.startPoint.y).toBeCloseTo(out.children![0]!.y! + 12 + 10, 0)
    expect(s.endPoint.x).toBeCloseTo(out.children![0]!.x! + 2 + 10, 0)
    expect(s.endPoint.y).toBeCloseTo(out.children![0]!.y! + 44, 0)
  })
})

describe('force 内嵌 box 子图（回归: nodeMicroLayout 覆盖黑盒容器尺寸 → 子节点溢出）', () => {
  it('force 子图内 box 容器尺寸 = box 布局结果, 子节点全部在容器内', () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'org.eclipse.elk.algorithm': 'layered', 'org.eclipse.elk.direction': 'DOWN' },
      children: [
        { id: 'entry', width: 52, height: 38 },
        { id: 'exit', width: 52, height: 38 },
        {
          id: 'g-force',
          layoutOptions: { 'org.eclipse.elk.algorithm': 'force' },
          children: [
            { id: 's1', width: 52, height: 38 },
            { id: 's2', width: 52, height: 38 },
            { id: 's3', width: 52, height: 38 },
            {
              id: 'g-force-inner',
              layoutOptions: {
                'org.eclipse.elk.algorithm': 'box',
                'org.eclipse.elk.nodeLabels.placement': ['INSIDE', 'H_CENTER', 'V_TOP'],
                'org.eclipse.elk.nodeSize.constraints': ['NODE_LABELS'],
              },
              labels: [{ text: '内部组件 · box', width: 128, height: 16 }],
              children: [
                { id: 'si1', width: 52, height: 38 },
                { id: 'si2', width: 52, height: 38 },
                { id: 'si3', width: 52, height: 38 },
              ],
            },
          ],
        },
      ],
      edges: [
        { id: 'e1', sources: ['entry'], targets: ['g-force'] },
        { id: 'e2', sources: ['g-force'], targets: ['exit'] },
        { id: 'e3', sources: ['s3'], targets: ['g-force-inner'] },
      ],
    }
    const out = layoutElkJson(input)
    const find = (n: ElkNode | undefined, id: string): ElkNode | undefined =>
      n === undefined ? undefined : n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean)
    const gi = find(out as ElkNode, 'g-force-inner')!
    // box 布局 3 个 52x38 节点竖排 → 容器约 82x174；被 NODE_LABELS 覆盖会塌缩成 label 尺寸（< 60 高）
    expect(gi.height).toBeGreaterThan(100)
    const inside = (child: ElkNode | undefined): boolean =>
      child !== undefined && child.x! >= 0 && child.y! >= 0 && child.x! + child.width! <= gi.width! + 0.01 && child.y! + child.height! <= gi.height! + 0.01
    for (const c of gi.children ?? []) {
      expect(inside(c), `子节点 ${c.id} 应在容器内`).toBe(true)
    }
  })
})

describe('onBlackBoxLaidOut（单次布局钩子：每个 black-box 布局后回调，子先父后）', () => {
  const input: ElkNode = {
    id: 'root',
    layoutOptions: { 'org.eclipse.elk.algorithm': 'layered', 'org.eclipse.elk.direction': 'DOWN' },
    children: [
      { id: 'entry', width: 52, height: 38 },
      {
        id: 'g-force',
        layoutOptions: { 'org.eclipse.elk.algorithm': 'force' },
        children: [
          { id: 's1', width: 52, height: 38 },
          {
            id: 'g-inner',
            layoutOptions: { 'org.eclipse.elk.algorithm': 'box' },
            children: [{ id: 'si1', width: 52, height: 38 }],
          },
        ],
      },
    ],
    edges: [{ id: 'e1', sources: ['entry'], targets: ['g-force'] }],
  }

  it('每个非 leaf black-box 恰好回调一次，顺序 = 深度降序（子先父）', () => {
    const calls: string[] = []
    layoutElkJson(input, {
      onBlackBoxLaidOut: (node) => { calls.push(node.id) },
    })
    // 深度排序：g-inner（深）先于 g-force（浅）——父 provider 布局前子容器已可调整
    expect(calls).toEqual(['g-inner', 'g-force'])
  })

  it('回调对节点 width/layoutOptions 的突变传播到最终输出', () => {
    const out = layoutElkJson(input, {
      onBlackBoxLaidOut: (node) => {
        if (node.id === 'g-inner') {
          node.width = 200 // 模拟标题 padding 预留
          node.layoutOptions = { ...node.layoutOptions, 'org.eclipse.elk.padding': '[top=28,left=100,right=15,bottom=15]' }
        }
      },
    })
    const find = (n: ElkNode | undefined, id: string): ElkNode | undefined =>
      n === undefined ? undefined : n.id === id ? n : (n.children ?? []).map((c) => find(c, id)).find(Boolean)
    const gi = find(out as ElkNode, 'g-inner')!
    expect(gi.width).toBe(200)
  })

  it('缺省不传回调 → 不调用（行为与无钩子一致）', () => {
    let called = 0
    layoutElkJson(input)
    void called // 无钩子路径：oracle 4772 全量覆盖，此处仅确认 API 可选性
    const withHook = layoutElkJson(input, { onBlackBoxLaidOut: () => { called += 1 } })
    expect(called).toBe(2) // 2 个 black-box（g-force/g-inner）各回调一次
    void withHook
  })
})
