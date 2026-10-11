/**
 * R44 回归: per-node 坐标模式 (org.eclipse.elk.json.shapeCoords / edgeCoords) 按元素继承.
 *
 * SSOT: elkjs 0.12.0 (JsonImporter.transferLayout) + ELK Java 0.12.0 jar 实测 (逐点一致).
 * 继承语义 (elkjs elk-worker.js recordCoordinateModes / adjustX 反编译 + 实测):
 *   - 每个节点的有效模式 = 自身 layoutOptions 设置值, 否则继承 JSON 父节点
 *     (显式 INHERIT 同未设置), 根默认 PARENT / CONTAINER.
 *   - shapeCoords: 节点 N 的有效模式决定其**子节点**输出坐标参照系:
 *     ROOT → 子节点 x/y 为全局坐标; PARENT → 相对 N. 只向下传播.
 *   - edgeCoords: 边在输入 JSON 的**声明父节点** N 的有效模式决定该边输出:
 *     CONTAINER → 相对 LCA + container 字段; PARENT → 相对声明父 N;
 *     ROOT → 全局; PARENT/ROOT 不输出 container.
 *
 * 本文件断言 layout 输出与 elkjs 逐点一致 (per-node 混合模式), 并辅以
 * 语义断言 (受影响子树全局 / 未受影响子树保持相对 / container 字段行为).
 */
import { describe, expect, it } from 'vitest'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode as ElkjsNode } from 'elkjs/lib/elk-api.js'
import { layoutElkJson, type ElkNode } from '../../src/api/index.js'

/** elkjs 独立实例 per 调用 (共享 ELK worker 并发串扰 → 间歇失败). */
function elkLayout(input: ElkNode, opts?: Record<string, unknown>): Promise<ElkjsNode> {
  return new ELK().layout(deepCopy(input) as unknown as ElkjsNode, opts ? { layoutOptions: opts as Record<string, string> } : undefined)
}

const deepCopy = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T
const TOL = 0.05

// ── 测试图: root > {n1, n2, A > {a1, a2, a3}, B > {b1, b2}} ──
//   A.edges: ea (a1→a2), eb (a2→a3)   root.edges: e0 (n1→n2), e1 (a1→b1)
function mkGraph(edgeVal?: string): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.randomSeed': '1' },
    children: [
      { id: 'n1', width: 30, height: 30 },
      { id: 'n2', width: 30, height: 30 },
      {
        id: 'A', width: 300, height: 300,
        layoutOptions: edgeVal ? { 'elk.json.edgeCoords': edgeVal } : undefined,
        children: [
          { id: 'a1', width: 30, height: 30 },
          { id: 'a2', width: 30, height: 30 },
          { id: 'a3', width: 40, height: 40 },
        ],
        edges: [
          { id: 'ea', sources: ['a1'], targets: ['a2'] },
          { id: 'eb', sources: ['a2'], targets: ['a3'] },
        ],
      },
      {
        id: 'B', width: 300, height: 300,
        children: [
          { id: 'b1', width: 30, height: 30 },
          { id: 'b2', width: 30, height: 30 },
        ],
      },
    ],
    edges: [
      { id: 'e0', sources: ['n1'], targets: ['n2'] },
      { id: 'e1', sources: ['a1'], targets: ['b1'] },
    ],
  }
}

type AnyNode = { id: string; x?: number; y?: number; children?: AnyNode[]; edges?: any[] }

/** 节点收集: accum=false 直接取 x/y (原始输出); accum=true 递归累加 (相对父语义). */
function collectNodes(root: AnyNode, accum: boolean): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>()
  const walk = (list: AnyNode[] | undefined, ax: number, ay: number): void => {
    for (const c of list ?? []) {
      const x = c.x ?? 0, y = c.y ?? 0
      const wx = accum ? ax + x : x, wy = accum ? ay + y : y
      out.set(c.id, { x: wx, y: wy })
      walk(c.children, wx, wy)
    }
  }
  walk(root.children, 0, 0)
  return out
}

/** 边收集 (任意挂载层级), key = sources[0]|targets[0]. */
function collectEdges(root: AnyNode): Map<string, any> {
  const out = new Map<string, any>()
  const walk = (n: AnyNode): void => {
    for (const e of n.edges ?? []) out.set(`${e.sources?.[0]}|${e.targets?.[0]}`, e)
    for (const c of n.children ?? []) walk(c)
  }
  walk(root)
  return out
}

function sectionPoints(e: any): { x: number; y: number }[] {
  const s = e.sections?.[0]
  if (!s) return []
  return [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]
}

/** 断言两棵树节点原始输出坐标逐项一致 (per-node 模式: ROOT 子树全局, PARENT 子树相对). */
function expectNodesRawEqual(ggn: AnyNode, elkjs: AnyNode): void {
  const gn = collectNodes(ggn, false), en = collectNodes(elkjs, false)
  expect(en.size, 'elkjs 节点数').toBe(gn.size)
  for (const [id, p] of en) {
    const q = gn.get(id)
    expect(q, `ggn 缺节点 ${id}`).toBeDefined()
    expect(Math.abs(p.x - q!.x), `节点 ${id} x`).toBeLessThanOrEqual(TOL)
    expect(Math.abs(p.y - q!.y), `节点 ${id} y`).toBeLessThanOrEqual(TOL)
  }
}

/** 断言两棵树边 sections 逐项一致 (坐标均已投影到同一参照系). */
function expectEdgesEqual(ggn: AnyNode, elkjs: AnyNode): void {
  const gm = collectEdges(ggn), em = collectEdges(elkjs)
  expect(em.size, 'elkjs 边数').toBe(gm.size)
  for (const [k, ee] of em) {
    const gg = gm.get(k)
    expect(gg, `ggn 缺边 ${k}`).toBeDefined()
    const pa = sectionPoints(gg!), pb = sectionPoints(ee)
    expect(pb.length, `边 ${k} 点数`).toBe(pa.length)
    for (let i = 0; i < pa.length; i++) {
      expect(Math.abs(pa[i]!.x - pb[i]!.x), `边 ${k} 点${i} x`).toBeLessThanOrEqual(TOL)
      expect(Math.abs(pa[i]!.y - pb[i]!.y), `边 ${k} 点${i} y`).toBeLessThanOrEqual(TOL)
    }
  }
}

describe('坐标模式 per-node 继承 (R44)', () => {
  it('shapeCoords=ROOT 只作用于子树: A 子节点全局, B/root 子节点相对父, 与 elkjs 逐点一致', async () => {
    const input = mkGraph()
    input.children!.find((c) => c.id === 'A')!.layoutOptions = { 'elk.json.shapeCoords': 'ROOT' }
    const ggn = layoutElkJson(deepCopy(input))
    const elkjs = await elkLayout(deepCopy(input))
    expectNodesRawEqual(ggn, elkjs)
    // 语义: a1 输出全局 == 默认布局下 a1 全局位置 (C 全局 + 相对偏移)
    const defElk = await elkLayout(mkGraph())
    const defAcc = collectNodes(defElk, true)
    const ggnRaw = collectNodes(ggn, false)
    const defRaw = collectNodes(defElk, false)
    expect(Math.abs(ggnRaw.get('a1')!.x - defAcc.get('a1')!.x)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(ggnRaw.get('a1')!.y - defAcc.get('a1')!.y)).toBeLessThanOrEqual(TOL)
    // 未受影响子树: b1 保持相对父 (原始输出 == 默认布局原始输出)
    expect(Math.abs(ggnRaw.get('b1')!.x - defRaw.get('b1')!.x)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(ggnRaw.get('b1')!.y - defRaw.get('b1')!.y)).toBeLessThanOrEqual(TOL)
  })

  it('继承: A(ROOT) 内无设置的 C/E 继承 ROOT (孙节点全局), 显式 PARENT 的 D 覆盖 (d1 相对 D)', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.randomSeed': '1' },
      children: [
        { id: 'n1', width: 30, height: 30 },
        {
          id: 'A', width: 400, height: 400,
          layoutOptions: { 'elk.json.shapeCoords': 'ROOT' },
          children: [
            { id: 'C', width: 200, height: 200, children: [{ id: 'c1', width: 30, height: 30 }] },
            { id: 'D', width: 200, height: 200, layoutOptions: { 'elk.json.shapeCoords': 'PARENT' }, children: [{ id: 'd1', width: 30, height: 30 }] },
            { id: 'E', width: 200, height: 200, layoutOptions: { 'elk.json.shapeCoords': 'INHERIT' }, children: [{ id: 'e1', width: 30, height: 30 }] },
          ],
        },
      ],
    }
    const ggn = layoutElkJson(deepCopy(input))
    const elkjs = await elkLayout(deepCopy(input))
    expectNodesRawEqual(ggn, elkjs)
    // 无模式基准 (去掉 A 的 shapeCoords): C/D/E 相对位置与 A 内偏移
    const plain = deepCopy(input)
    plain.children!.find((c) => c.id === 'A')!.layoutOptions = undefined
    const defElk = await elkLayout(plain)
    const defAcc = collectNodes(defElk, true)
    const ggnRaw = collectNodes(ggn, false)
    const defRaw = collectNodes(defElk, false)
    // C 继承 ROOT: c1 全局 == 默认 c1 全局
    expect(Math.abs(ggnRaw.get('c1')!.x - defAcc.get('c1')!.x)).toBeLessThanOrEqual(TOL)
    // E 显式 INHERIT: e1 同全局
    expect(Math.abs(ggnRaw.get('e1')!.x - defAcc.get('e1')!.x)).toBeLessThanOrEqual(TOL)
    // D 显式 PARENT 覆盖: d1 相对 D (原始输出 == 默认 d1 相对输出)
    expect(Math.abs(ggnRaw.get('d1')!.x - defRaw.get('d1')!.x)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(ggnRaw.get('d1')!.y - defRaw.get('d1')!.y)).toBeLessThanOrEqual(TOL)
  })

  it('edgeCoords=ROOT 只作用于声明在 A 的边: ea/eb 全局无 container, e0/e1 不受影响, 与 elkjs 逐点一致', async () => {
    const input = mkGraph('ROOT')
    const ggn = layoutElkJson(deepCopy(input))
    const elkjs = await elkLayout(deepCopy(input))
    expectEdgesEqual(ggn, elkjs)
    const gm = collectEdges(ggn), em = collectEdges(elkjs)
    // ea/eb 声明在 A: ROOT → 无 container + 全局
    for (const k of ['a1|a2', 'a2|a3']) {
      expect(gm.get(k)!.container, `${k} container`).toBeUndefined()
      expect(em.get(k)!.container, `elkjs ${k} container`).toBeUndefined()
    }
    // e0/e1 声明在 root: 默认 CONTAINER → container=root
    expect(gm.get('n1|n2')!.container).toBe('root')
    expect(gm.get('a1|b1')!.container).toBe('root')
    // ea 全局 == 默认 ea 相对 A + A 全局
    const def = await elkLayout(mkGraph())
    const A = def.children!.find((c) => c.id === 'A')!
    const eaDef = A.edges!.find((e) => e.sources?.[0] === 'a1')!
    const ea = gm.get('a1|a2')!
    const pa = sectionPoints(ea), pd = sectionPoints(eaDef)
    expect(pa.length).toBe(pd.length)
    for (let i = 0; i < pa.length; i++) {
      expect(Math.abs(pa[i]!.x - (pd[i]!.x + A.x!))).toBeLessThanOrEqual(TOL)
      expect(Math.abs(pa[i]!.y - (pd[i]!.y + A.y!))).toBeLessThanOrEqual(TOL)
    }
  })

  it('edgeCoords=PARENT 作用于声明在 A 的边: ea 相对 A 无 container, e1 (声明在 root) 不受影响, 与 elkjs 逐点一致', async () => {
    const input = mkGraph('PARENT')
    const ggn = layoutElkJson(deepCopy(input))
    const elkjs = await elkLayout(deepCopy(input))
    expectEdgesEqual(ggn, elkjs)
    const gm = collectEdges(ggn), em = collectEdges(elkjs)
    expect(gm.get('a1|a2')!.container, 'ea container').toBeUndefined()
    expect(em.get('a1|a2')!.container, 'elkjs ea container').toBeUndefined()
    // ea 相对 A == 默认 ea (无模式) 逐点一致
    const def = await elkLayout(mkGraph())
    const A = def.children!.find((c) => c.id === 'A')!
    const eaDef = A.edges!.find((e) => e.sources?.[0] === 'a1')!
    const pa = sectionPoints(gm.get('a1|a2')!), pd = sectionPoints(eaDef)
    expect(pa.length).toBe(pd.length)
    for (let i = 0; i < pa.length; i++) {
      expect(Math.abs(pa[i]!.x - pd[i]!.x)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(pa[i]!.y - pd[i]!.y)).toBeLessThanOrEqual(TOL)
    }
    // e1 声明在 root (根默认 CONTAINER → PARENT 投影偏移 0): 与 elkjs 逐点一致已覆盖
    expect(gm.get('a1|b1')!.container).toBe('root')
  })

  it('子树设置覆盖根级模式: 根 ROOT + A 显式 PARENT → A 子节点相对父, 其余全局, 与 elkjs 一致', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.randomSeed': '1' },
      children: [
        { id: 'n1', width: 30, height: 30 },
        { id: 'n2', width: 30, height: 30 },
        { id: 'A', width: 300, height: 300, layoutOptions: { 'elk.json.shapeCoords': 'PARENT' }, children: [{ id: 'a1', width: 30, height: 30 }] },
      ],
    }
    const opts = { 'org.eclipse.elk.json.shapeCoords': 'ROOT' }
    const ggn = layoutElkJson(deepCopy(input), { layoutOptions: opts })
    const elkjs = await elkLayout(deepCopy(input), opts)
    expectNodesRawEqual(ggn, elkjs)
    const ggnRaw = collectNodes(ggn, false)
    // n1 (根 ROOT 生效): 全局 == 默认累加
    const defElk = await elkLayout(deepCopy(input))
    expect(Math.abs(ggnRaw.get('n1')!.x - collectNodes(defElk, true).get('n1')!.x)).toBeLessThanOrEqual(TOL)
    // a1 (A 显式 PARENT 覆盖): 相对 A == 默认原始输出
    expect(Math.abs(ggnRaw.get('a1')!.x - collectNodes(defElk, false).get('a1')!.x)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(ggnRaw.get('a1')!.y - collectNodes(defElk, false).get('a1')!.y)).toBeLessThanOrEqual(TOL)
  })
})
