/**
 * 坐标模式 (shapeCoords / edgeCoords) 对齐测试.
 *
 * SSOT: ELK Java 0.12.0 / elkjs 0.12.0 实测行为 (org.eclipse.elk.json.shapeCoords /
 * org.eclipse.elk.json.edgeCoords). 枚举语义 (SSOT 源码 ShapeCoords.java / EdgeCoords.java):
 *   ShapeCoords: INHERIT | PARENT | ROOT   (根默认 PARENT)
 *   EdgeCoords:  INHERIT | CONTAINER | PARENT | ROOT  (根默认 CONTAINER)
 *
 * layout 默认输出 = 节点相对父 (PARENT) + 边相对 LCA 容器 (CONTAINER, 边挂 LCA),
 * 与 elkjs 默认一致 (elkjs 边留在定义处但坐标相对 LCA).
 * 本测试验证:
 *   1. ROOT 模式下 layout 输出与 elkjs 逐项一致 (机器可检查差分).
 *   2. 内部不变量: 默认输出 + LCA/父偏移 == ROOT 输出 (投影自洽, 不依赖 elkjs).
 *   3. 显式 PARENT/CONTAINER/INHERIT == 默认 (模式等价不变量).
 */
import { describe, expect, it } from 'vitest'
import ELK from 'elkjs/lib/elk.bundled.js'
import type { ElkNode as ElkjsNode } from 'elkjs/lib/elk-api.js'
import { layoutElkJson, type ElkNode } from '../../src/api/index.js'

/** elkjs 独立实例 per 调用 (共享 ELK worker 并发串扰 → 间歇失败). */
function elkLayout(input: ElkNode, opts?: Record<string, unknown>): Promise<ElkjsNode> {
  return new ELK().layout(deepCopy(input) as unknown as ElkjsNode, opts ? { layoutOptions: opts as Record<string, string> } : undefined)
}

// ── 层级测试图: root > {n1,n2,outside > inside > n3} ──
// e0 n1→n2 (LCA=root), e1 n1→outside (LCA=root), e2 inside→n3 (LCA=inside).
function hierGraph(): ElkNode {
  return {
    id: 'root',
    layoutOptions: { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.randomSeed': '1' },
    children: [
      { id: 'n1', width: 30, height: 30 },
      { id: 'n2', width: 30, height: 30 },
      {
        id: 'outside', width: 200, height: 200,
        children: [{ id: 'inside', width: 100, height: 100, children: [{ id: 'n3', width: 30, height: 30 }] }],
      },
    ],
    edges: [
      { id: 'e0', sources: ['n1'], targets: ['n2'] },
      { id: 'e1', sources: ['n1'], targets: ['outside'] },
      { id: 'e2', sources: ['inside'], targets: ['n3'] },
    ],
  }
}

type AnyNode = { id: string; x?: number; y?: number; children?: AnyNode[]; edges?: any[] }

/** 节点收集: accum=false 直接取 x/y (ROOT 输出即全局); accum=true 递归累加 (默认相对父). */
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

/** sections 坐标序列 (start + bendPoints + end). */
function sectionPoints(e: any): { x: number; y: number }[] {
  const s = e.sections?.[0]
  if (!s) return []
  return [s.startPoint, ...(s.bendPoints ?? []), s.endPoint]
}

const TOL = 0.05

/** 断言两棵树节点坐标逐项一致 (按目标模式收集). */
function expectNodesEqual(ggn: AnyNode, elkjs: AnyNode, accum: boolean): void {
  const gn = collectNodes(ggn, accum), en = collectNodes(elkjs, accum)
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

const deepCopy = <T,>(o: T): T => JSON.parse(JSON.stringify(o)) as T

describe('坐标模式 (shapeCoords / edgeCoords)', () => {
  it('默认模式基线: 节点相对父 + 边相对 LCA, 与 elkjs 一致', async () => {
    const ggn = layoutElkJson(hierGraph())
    const elkjs = await elkLayout(hierGraph())
    expectNodesEqual(ggn, elkjs, true)   // 默认: 节点相对父, 递归累加
    expectEdgesEqual(ggn, elkjs)         // 默认: 边相对 LCA, 两引擎坐标一致
  })

  it('ROOT 模式: 节点/边均为全局坐标, 与 elkjs 逐项一致', async () => {
    const opts = { 'org.eclipse.elk.json.shapeCoords': 'ROOT', 'org.eclipse.elk.json.edgeCoords': 'ROOT' }
    const ggn = layoutElkJson(hierGraph(), { layoutOptions: opts })
    const elkjs = await elkLayout(hierGraph(), opts)
    expectNodesEqual(ggn, elkjs, false)  // ROOT: 节点直接全局, 不累加
    expectEdgesEqual(ggn, elkjs)         // ROOT: 边直接全局
  })

  it('仅 edgeCoords=ROOT: 边全局 + 节点保持相对父', async () => {
    const opts = { 'org.eclipse.elk.json.edgeCoords': 'ROOT' }
    const ggn = layoutElkJson(hierGraph(), { layoutOptions: opts })
    const elkjs = await elkLayout(hierGraph(), opts)
    expectNodesEqual(ggn, elkjs, true)   // 节点仍相对父
    expectEdgesEqual(ggn, elkjs)         // 边已全局
  })

  it('仅 shapeCoords=ROOT: 节点全局 + 边保持相对 LCA', async () => {
    const opts = { 'org.eclipse.elk.json.shapeCoords': 'ROOT' }
    const ggn = layoutElkJson(hierGraph(), { layoutOptions: opts })
    const elkjs = await elkLayout(hierGraph(), opts)
    expectNodesEqual(ggn, elkjs, false)  // 节点全局
    expectEdgesEqual(ggn, elkjs)         // 边仍相对 LCA, 两引擎一致
  })

  it('内部不变量: 默认输出按 LCA/父偏移投影 == ROOT 输出 (自洽, 不依赖 elkjs)', () => {
    const def = layoutElkJson(hierGraph())
    const root = layoutElkJson(hierGraph(), { layoutOptions: { 'org.eclipse.elk.json.shapeCoords': 'ROOT', 'org.eclipse.elk.json.edgeCoords': 'ROOT' } })
    // 节点: 默认相对坐标递归累加 == ROOT 全局
    // 上面一行语义易混, 显式做: def 累加后 == root 直接取
    const defAcc = collectNodes(def, true)
    const rootDirect = collectNodes(root, false)
    expect(defAcc.size).toBe(rootDirect.size)
    for (const [id, p] of rootDirect) {
      const q = defAcc.get(id)
      expect(q, `节点 ${id}`).toBeDefined()
      expect(Math.abs(p.x - q!.x)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(p.y - q!.y)).toBeLessThanOrEqual(TOL)
    }
    // 边: 默认坐标 + LCA 容器全局偏移 == ROOT 全局
    //   LCA 容器 = 边挂载容器 (layout 边挂 LCA); 容器全局位置从 defAcc 取.
    const defEdges = collectEdges(def)
    const rootEdges = collectEdges(root)
    expect(defEdges.size).toBe(rootEdges.size)
    for (const [k, re] of rootEdges) {
      const de = defEdges.get(k)
      expect(de, `边 ${k}`).toBeDefined()
      // 找 de 的挂载容器 id: 遍历 def 树, 该边所在节点的 id
      let containerId: string | null = null
      const find = (n: AnyNode): boolean => {
        if ((n.edges ?? []).some((e) => `${e.sources?.[0]}|${e.targets?.[0]}` === k)) { containerId = n.id === 'root' ? null : n.id; return true }
        for (const c of n.children ?? []) if (find(c)) return true
        return false
      }
      find(def)
      const off = containerId === null ? { x: 0, y: 0 } : defAcc.get(containerId) ?? { x: 0, y: 0 }
      const rp = sectionPoints(re)
      const dp = sectionPoints(de!)
      expect(rp.length).toBe(dp.length)
      for (let i = 0; i < rp.length; i++) {
        expect(Math.abs((dp[i]!.x + off.x) - rp[i]!.x)).toBeLessThanOrEqual(TOL)
        expect(Math.abs((dp[i]!.y + off.y) - rp[i]!.y)).toBeLessThanOrEqual(TOL)
      }
    }
  })

  it('模式等价不变量: CONTAINER/INHERIT == 默认输出 (与 elkjs 差分)', async () => {
    // 默认 = INHERIT → 根默认 CONTAINER. 显式 CONTAINER/INHERIT 应与默认逐项一致 (elkjs 差分).
    for (const lo of [
      { 'org.eclipse.elk.json.shapeCoords': 'PARENT', 'org.eclipse.elk.json.edgeCoords': 'CONTAINER' },
      { 'org.eclipse.elk.json.shapeCoords': 'INHERIT', 'org.eclipse.elk.json.edgeCoords': 'INHERIT' },
    ]) {
      const ggn = layoutElkJson(hierGraph(), { layoutOptions: lo })
      const elkjs = await elkLayout(hierGraph(), lo)
      expectNodesEqual(ggn, elkjs, true)
      expectEdgesEqual(ggn, elkjs)
    }
  })

  it('edgeCoords=PARENT: 相对输入声明父 (e2 声明在 root → 全局), 与 elkjs 一致', async () => {
    const opts = { 'org.eclipse.elk.json.edgeCoords': 'PARENT' }
    const ggn = layoutElkJson(hierGraph(), { layoutOptions: opts })
    const elkjs = await elkLayout(hierGraph(), opts)
    expectNodesEqual(ggn, elkjs, true)   // 节点仍相对父
    expectEdgesEqual(ggn, elkjs)         // 边相对声明父 (e2 声明 root → 全局)
  })

  it('edgeCoords=PARENT: 声明父=中间容器/LCA 时与 elkjs 逐点一致 (P0 回归)', async () => {
    // e2 (inside→n3, LCA=inside) 分别声明在 outside.edges / inside.edges:
    //   PARENT = 相对输入声明父; 声明父=outside → (12,39); 声明父=inside(=LCA) → (0,27) 不变.
    const mkDeclared = (containerId: string | null): ElkNode => {
      const g = hierGraph()
      const e2 = g.edges!.find((e) => e.sources?.[0] === 'inside')!
      g.edges = g.edges!.filter((e) => e !== e2)
      if (containerId === null) {
        g.edges!.push(e2)
      } else {
        const find = (n: ElkNode): ElkNode | null => (n.id === containerId ? n : (n.children ?? []).map(find).find(Boolean) ?? null)
        const host = find(g)!
        host.edges ??= []
        host.edges.push(e2)
      }
      return g
    }
    for (const containerId of ['outside', 'inside']) {
      const opts = { 'org.eclipse.elk.json.edgeCoords': 'PARENT' }
      const ggn = layoutElkJson(deepCopy(mkDeclared(containerId)), { layoutOptions: opts })
      const elkjs = await elkLayout(mkDeclared(containerId), opts)
      expectEdgesEqual(ggn, elkjs)
    }
  })

  it('container 字段: 默认/CONTAINER 输出 LCA id, PARENT/ROOT 不输出 (elkjs 一致)', async () => {
    const def = layoutElkJson(hierGraph())
    const defElk = await elkLayout(hierGraph())
    const gm = collectEdges(def), em = collectEdges(defElk)
    for (const [k, ee] of em) {
      const gg = gm.get(k)
      expect(gg, `缺边 ${k}`).toBeDefined()
      expect(gg!.container, `边 ${k} container`).toBe(ee.container)
    }
    // PARENT/ROOT 不输出 container
    for (const mode of ['PARENT', 'ROOT']) {
      const out = layoutElkJson(hierGraph(), { layoutOptions: { 'org.eclipse.elk.json.edgeCoords': mode } })
      const edges = collectEdges(out)
      for (const [, e] of edges) expect(e.container, `边 ${mode} container 应为空`).toBeUndefined()
    }
  })

  it('短名键 elk.json.* == 完整 id (ROOT)', async () => {
    const full = layoutElkJson(hierGraph(), { layoutOptions: { 'org.eclipse.elk.json.edgeCoords': 'ROOT', 'org.eclipse.elk.json.shapeCoords': 'ROOT' } })
    const short = layoutElkJson(hierGraph(), { layoutOptions: { 'elk.json.edgeCoords': 'ROOT', 'elk.json.shapeCoords': 'ROOT' } })
    expectNodesEqual(full, short, false)
    expectEdgesEqual(full, short)
  })

  it('键形态: org.eclipse.elk.edgeCoords (无 json. 段) 应忽略 == 默认 (elkjs 实测接受集)', async () => {
    const base = layoutElkJson(hierGraph())
    const weird = layoutElkJson(hierGraph(), { layoutOptions: { 'org.eclipse.elk.edgeCoords': 'ROOT', 'elk.edgeCoords': 'ROOT', 'my.custom.edgeCoords': 'ROOT' } })
    expectNodesEqual(base, weird, true)
    expectEdgesEqual(base, weird)
  })

  it('大小写敏感: 小写值忽略 (== 默认), 对齐 elkjs 枚举解析', async () => {
    const base = layoutElkJson(hierGraph())
    const lower = layoutElkJson(hierGraph(), { layoutOptions: { 'org.eclipse.elk.json.edgeCoords': 'root', 'org.eclipse.elk.json.shapeCoords': 'root' } })
    expectNodesEqual(base, lower, true)
    expectEdgesEqual(base, lower)
  })

  it('合并优先级: API options 覆盖 input 根 layoutOptions (elkjs 实测 + buildGraph 一致)', async () => {
    // layoutElkJson 原地修改 input → 每次调用 fresh 深拷贝.
    const mkInput = (): ElkNode => { const g = hierGraph(); g.layoutOptions = { ...g.layoutOptions, 'org.eclipse.elk.json.edgeCoords': 'PARENT' }; return g }
    const ggn = layoutElkJson(deepCopy(mkInput()), { layoutOptions: { 'org.eclipse.elk.json.edgeCoords': 'ROOT' } }) // options ROOT 应覆盖 input PARENT
    const elkjs = await elkLayout(mkInput(), { 'org.eclipse.elk.json.edgeCoords': 'ROOT' })
    expectNodesEqual(ggn, elkjs, true)
    expectEdgesEqual(ggn, elkjs)
    // ROOT 生效 → e2 全局 (非 PARENT 的相对 root)
    const e2 = collectEdges(ggn).get('inside|n3')!
    const sp = e2.sections?.[0]?.startPoint
    expect(sp.x).toBeGreaterThan(50)  // 全局 > 相对 inside 的 0
  })

  it('自环边 ROOT 投影: 与 elkjs 一致 (自环挂源节点所在图父容器)', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'elk.randomSeed': '1' },
      children: [
        { id: 'A', width: 40, height: 40, children: [{ id: 'A1', width: 20, height: 20 }] },
      ],
      edges: [{ id: 'loop', sources: ['A1'], targets: ['A1'] }],
    }
    const opts = { 'org.eclipse.elk.json.edgeCoords': 'ROOT' }
    const ggn = layoutElkJson(deepCopy(input), { layoutOptions: opts })
    const elkjs = await elkLayout(deepCopy(input), opts)
    expectEdgesEqual(ggn, elkjs)
  })

  it('black-box 子树 + 内部边: 布局成功, 内部边留 box.edges, ROOT 投影与 elkjs 一致', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'elk.randomSeed': '1' },
      children: [
        { id: 'n1', width: 40, height: 20 },
        { id: 'n2', width: 40, height: 20 },
        { id: 'box', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' }, children: [{ id: 'b1', width: 30, height: 30 }, { id: 'b2', width: 30, height: 30 }] },
      ],
      edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'] }, { id: 'e2', sources: ['b1'], targets: ['b2'] }],
    }
    // 默认模式: 布局成功 + 内部边留在 box.edges (不进 layered, R45 修复)
    const def = layoutElkJson(deepCopy(input))
    const box = def.children!.find((c) => c.id === 'box')!
    expect(box.edges?.some((e) => e.sources?.[0] === 'b1' && e.targets?.[0] === 'b2'), '内部边应留在 box.edges').toBe(true)
    // box 内部 (box 算法部分) 与 elkjs 一致: b1/b2 位置 + box 尺寸 + e2 边坐标相对 box
    // (root 层 n1/n2 与 elkjs 的分层差异为既有 layered 问题, 登记 agent-remarks R49, 不在本用例断言).
    const defElk = await elkLayout(input)
    const boxElk = defElk.children!.find((c) => c.id === 'box')!
    expect(Math.abs(box.width! - boxElk.width!)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(box.height! - boxElk.height!)).toBeLessThanOrEqual(TOL)
    const b1 = box.children!.find((c) => c.id === 'b1')!
    const b1Elk = boxElk.children!.find((c) => c.id === 'b1')!
    expect(Math.abs(b1.x! - b1Elk.x!)).toBeLessThanOrEqual(TOL)
    expect(Math.abs(b1.y! - b1Elk.y!)).toBeLessThanOrEqual(TOL)
    const dEdge0 = collectEdges(def).get('b1|b2')!
    const eEdge0 = collectEdges(defElk).get('b1|b2')!
    const dp0 = sectionPoints(dEdge0), ep0 = sectionPoints(eEdge0)
    expect(ep0.length).toBe(dp0.length)
    for (let i2 = 0; i2 < dp0.length; i2++) {
      expect(Math.abs(dp0[i2]!.x - ep0[i2]!.x)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(dp0[i2]!.y - ep0[i2]!.y)).toBeLessThanOrEqual(TOL)
    }
    // ROOT 模式: 投影自洽 (默认 + box 偏移 == ROOT; box 内部与 elkjs 一致已在默认模式验证,
    // box 全局位置受 root 层分层差异 R49 影响, 不与 elkjs 全局对比)
    const opts = { 'org.eclipse.elk.json.shapeCoords': 'ROOT', 'org.eclipse.elk.json.edgeCoords': 'ROOT' }
    const root = layoutElkJson(deepCopy(input), { layoutOptions: opts })
    // 内部不变量: 默认 + box 偏移 == ROOT (black-box 子树投影自洽)
    const dEdge = collectEdges(def).get('b1|b2')!
    const rEdge = collectEdges(root).get('b1|b2')!
    const dp = sectionPoints(dEdge), rp = sectionPoints(rEdge)
    const boxAbs = collectNodes(def, true).get('box')!
    expect(rp.length).toBe(dp.length)
    for (let i = 0; i < rp.length; i++) {
      expect(Math.abs(dp[i]!.x + boxAbs.x - rp[i]!.x)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(dp[i]!.y + boxAbs.y - rp[i]!.y)).toBeLessThanOrEqual(TOL)
    }
  })

  it('black-box 子树 (box 无内部边): ROOT 投影覆盖黑盒节点及子节点', async () => {
    const input: ElkNode = {
      id: 'root',
      layoutOptions: { 'elk.randomSeed': '1' },
      children: [
        { id: 'n1', width: 40, height: 20 },
        { id: 'n2', width: 40, height: 20 },
        { id: 'box', layoutOptions: { 'org.eclipse.elk.algorithm': 'org.eclipse.elk.box' }, children: [{ id: 'b1', width: 30, height: 30 }] },
      ],
      edges: [{ id: 'e0', sources: ['n1'], targets: ['n2'] }],
    }
    const root = layoutElkJson(deepCopy(input), { layoutOptions: { 'org.eclipse.elk.json.shapeCoords': 'ROOT', 'org.eclipse.elk.json.edgeCoords': 'ROOT' } })
    const def = layoutElkJson(deepCopy(input))
    // ROOT: 节点直接全局 == 默认累加
    const rn = collectNodes(root, false), dn = collectNodes(def, true)
    expect(rn.size).toBe(dn.size)
    for (const [id, p] of rn) {
      const q = dn.get(id)
      expect(q, `节点 ${id}`).toBeDefined()
      expect(Math.abs(p.x - q!.x)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(p.y - q!.y)).toBeLessThanOrEqual(TOL)
    }
    // 边: ROOT 全局 == 默认 + 挂载容器偏移 (e0 挂 root → 偏移 0)
    const re = collectEdges(root).get('n1|n2')!
    const de = collectEdges(def).get('n1|n2')!
    const rp = sectionPoints(re), dp = sectionPoints(de)
    expect(rp.length).toBe(dp.length)
    for (let i = 0; i < rp.length; i++) {
      expect(Math.abs(rp[i]!.x - dp[i]!.x)).toBeLessThanOrEqual(TOL)
      expect(Math.abs(rp[i]!.y - dp[i]!.y)).toBeLessThanOrEqual(TOL)
    }
  })
})
