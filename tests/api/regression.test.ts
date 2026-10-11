/**
 * 回归测试: carTracking (80 节点) / intersections (300 节点).
 *
 * 输入为 ELK Java 0.12.0 权威标准 JSON (端口 index 每侧独立, 与 jar/elkjs 验证一致),
 * 断言 layoutElkJson 输出与 elkjs 0.12.0 逐项一致 (节点坐标 + 边 sections).
 *
 * 背景: 这两个图曾是 demo-vite 边路由偏差的来源 (GreedySwitch 误激活 → N11 差 297);
 * 修复后固化回归, 防止边路由/布局再回归.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ELK from 'elkjs/lib/elk.bundled.js'
import { layoutElkJson, type ElkNode } from '../../src/api/index.js'

const elk = new ELK()
const FIXTURES = new URL('./fixtures/', import.meta.url)

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

const edgeKey = (e: { sources?: string[]; targets?: string[] }): string => `${e.sources?.[0]}|${e.targets?.[0]}`

/** 递归收集所有容器的边 (key → 完整路由点). 层级图 ggn 用 LCA 挂载、elkjs 复制到多容器,
 * 故按 key 全局比较坐标 (不比较容器归属). */
function collectEdgesGlobal(root: AnyElkNode & { edges?: any[] }): Map<string, { x: number; y: number }[]> {
  const out = new Map<string, { x: number; y: number }[]>()
  const add = (eds: any[] | undefined): void => {
    for (const ed of eds ?? []) {
      const s = ed?.sections?.[0]
      if (!s) continue
      out.set(edgeKey(ed), [s.startPoint, ...(s.bendPoints ?? []), s.endPoint])
    }
  }
  add((root as any).edges)
  const walk = (list: AnyElkNode[] | undefined): void => {
    for (const c of list ?? []) {
      add((c as any).edges)
      if (c.children) walk(c.children)
    }
  }
  walk(root.children)
  return out
}

async function compareWithElkjs(fixture: string): Promise<{ nodeDiff: number; maxNodeD: number; edgeDiff: number; maxEdgeD: number }> {
  const path = fileURLToPath(new URL(fixture, FIXTURES))
  const input = JSON.parse(readFileSync(path, 'utf8')) as ElkNode
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

  const gm = collectEdgesGlobal(ggn)
  const em = collectEdgesGlobal(elkjs)
  expect(em.size, 'elkjs 边数').toBe(gm.size)
  let edgeDiff = 0, maxEdgeD = 0
  for (const [k, eb] of em) {
    const gb = gm.get(k)
    expect(gb, `ggn 缺边 ${k}`).toBeDefined()
    const m = Math.max(eb.length, gb!.length)
    for (let j = 0; j < m; j++) {
      const x = eb[j] ?? eb[eb.length - 1]!
      const y = gb![j] ?? gb![gb!.length - 1]!
      const d = Math.max(Math.abs(x.x - y.x), Math.abs(x.y - y.y))
      if (d > 0.05) { edgeDiff++; maxEdgeD = Math.max(maxEdgeD, d); break }
    }
  }
  return { nodeDiff, maxNodeD, edgeDiff, maxEdgeD }
}

describe('真实图回归 (layoutElkJson vs elkjs)', () => {
  it('carTracking (80 节点, 57 边): 节点 + 边 sections 全对齐', async () => {
    const r = await compareWithElkjs('carTracking.json')
    expect(r.nodeDiff, `节点差分 max=${r.maxNodeD.toFixed(2)}`).toBe(0)
    expect(r.edgeDiff, `边差分 max=${r.maxEdgeD.toFixed(2)}`).toBe(0)
  })

  it('intersections (300 节点, 200 边): 节点 + 边 sections 全对齐', async () => {
    const r = await compareWithElkjs('intersections.json')
    expect(r.nodeDiff, `节点差分 max=${r.maxNodeD.toFixed(2)}`).toBe(0)
    expect(r.edgeDiff, `边差分 max=${r.maxEdgeD.toFixed(2)}`).toBe(0)
  })

  it('blindCommunication (87 节点层级图, 66 边): 节点 + 跨层级边 sections 全对齐', async () => {
    const r = await compareWithElkjs('blindCommunication.json')
    expect(r.nodeDiff, `节点差分 max=${r.maxNodeD.toFixed(2)}`).toBe(0)
    expect(r.edgeDiff, `边差分 max=${r.maxEdgeD.toFixed(2)}`).toBe(0)
  })

  it('blindCommunication: 边挂载容器 (LCA) 与 ELK Java 完全一致', () => {
    // jar oracle: 容器 → [{src, tgt, pts}], 坐标相对容器内容 (LCA 挂载语义)
    const jarFixture = JSON.parse(readFileSync(
      fileURLToPath(new URL('blindCommunication-jar-edges.json', FIXTURES)), 'utf8')) as Record<string, { src: string; tgt: string; pts: [number, number][] }[]>
    const input = JSON.parse(readFileSync(
      fileURLToPath(new URL('blindCommunication.json', FIXTURES)), 'utf8')) as ElkNode
    const ggn = layoutElkJson(input)
    // 收集 ggn 边挂载 (容器 id → [{src,tgt,pts}])
    const ggnBy = new Map<string, { src: string; tgt: string; pts: { x: number; y: number }[] }[]>()
    const addEdges = (list: any, containerId: string): void => {
      for (const ed of list ?? []) {
        const s = ed?.sections?.[0]
        if (!s) continue
        const arr = ggnBy.get(containerId) ?? []
        ggnBy.set(containerId, arr)
        arr.push({ src: ed.sources[0].replace(/^NN/, ''), tgt: ed.targets[0].replace(/^NN/, ''), pts: [s.startPoint, ...(s.bendPoints ?? []), s.endPoint] })
      }
    }
    addEdges((ggn as any).edges, 'root')
    const walk = (list: any): void => { for (const c of list) { addEdges(c.edges, c.id.replace(/^NN/, '')); if (c.children) walk(c.children) } }
    walk((ggn as any).children)
    // 对比每个容器
    for (const [cid, jarEdges] of Object.entries(jarFixture)) {
      const ggnEdges = ggnBy.get(cid) ?? []
      expect(ggnEdges.length, `容器 ${cid} 边数`).toBe(jarEdges.length)
      const key = (e: { src: string; tgt: string }): string => `${e.src}|${e.tgt}`
      const gm = new Map(ggnEdges.map((e) => [key(e), e]))
      for (const je of jarEdges) {
        const g = gm.get(key(je))
        expect(g, `ggn 缺边 ${cid}/${key(je)}`).toBeDefined()
        const m = Math.max(je.pts.length, g!.pts.length)
        for (let i = 0; i < m; i++) {
          const a = je.pts[i] ?? je.pts[je.pts.length - 1]!
          const b = g!.pts[i] ?? g!.pts[g!.pts.length - 1]!
          const d = Math.max(Math.abs(a[0] - b.x), Math.abs(a[1] - b.y))
          expect(d, `边 ${cid}/${key(je)} 点${i} 坐标差`).toBeLessThan(0.05)
        }
      }
    }
  })
})
