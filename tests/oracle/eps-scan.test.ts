/**
 * ε 扫描: 对指定 elkt 图 (默认: 当前失败集合) 计算 ggn vs elkjs 的世界坐标最大差异.
 * 用法: EPS_FILES=/tmp/eps/files.txt ./node_modules/.bin/vitest run tests/elk-official/eps-scan.test.ts
 * 输出: /tmp/eps/scan.json
 *   { file, label, maxDx, maxDy, nodeDiffs: [{id, dx, dy}] }
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, it } from 'vitest'
import { parseElkt } from '../../scripts/elkt2test.mjs'
import { LGraph, LNode, LPort, LEdge } from '../../src/index.js'
import { LayeredLayoutProvider } from '../../src/layered-layout-provider.js'
import { PORT_CONSTRAINTS as PCC, PORT_INDEX as PIX, HIERARCHY_HANDLING as HIH, DIRECTION as DIR } from '../../src/options/layered-options.js'

function calcPortSide(pw, ph, x, y, w, h) {
  if (x < 0) return 'WEST'
  if (x + w > pw) return 'EAST'
  const widthPercent = (x + w / 2) / pw
  const heightPercent = (y + h / 2) / ph
  if (widthPercent + heightPercent <= 1 && widthPercent - heightPercent <= 0) return 'WEST'
  if (widthPercent + heightPercent >= 1 && widthPercent - heightPercent >= 0) return 'EAST'
  if (heightPercent < 0.5) return 'NORTH'
  return 'SOUTH'
}

function buildGraph(graphData) {
  const { nodes, edges, hierarchy, graphProps, nodeProps } = graphData
  const g = new LGraph()
  const nodeOf = new Map()
  const nestedGraphs = new Map()
  for (const p of hierarchy.keys()) nestedGraphs.set(p, new LGraph())
  for (const id of nodes) {
    const parentIdx = [...hierarchy.entries()].find(([, kids]) => kids.includes(id))?.[0]
    const gg = parentIdx !== undefined ? nestedGraphs.get(parentIdx) : g
    const n = new LNode(gg)
    const p = nodeProps.get(id) ?? {}
    const pw = p.width ?? 60, ph = p.height ?? 30
    n.size = { x: pw, y: ph }
    if (p.portConstraints) n.setProperty(PCC, p.portConstraints)
    const isCompound = (hierarchy.get(id) ?? []).length > 0
    for (const port of p.ports ?? []) {
      const lport = new LPort()
      lport.setNode(n)
      lport.getPosition().x = port.x ?? 0
      lport.getPosition().y = port.y ?? 0
      lport.size = { x: port.w ?? 8, y: port.h ?? 8 }
      let side = port.side ?? null
      if (side === null && port.x !== undefined && port.y !== undefined && p.portConstraints
        && String(p.portConstraints).includes('FIXED') && isCompound) {
        side = calcPortSide(pw, ph, port.x, port.y, port.w ?? 8, port.h ?? 8)
      }
      if (side) lport.setSide(side)
      if (port.index !== null && port.index !== undefined) lport.setProperty(PIX, port.index)
    }
    nodeOf.set(id, n)
  }
  for (const p of hierarchy.keys()) {
    nodeOf.get(p).setNestedGraph(nestedGraphs.get(p))
    nestedGraphs.get(p).setParentNode(nodeOf.get(p))
  }
  const spIdxOf = (nid, pid) => {
    if (pid === null) return null
    const ports = nodeProps.get(nid)?.ports ?? []
    return ports.findIndex(pp => pp.id === pid)
  }
  for (const [s, sp, t, tp] of edges) {
    const src = nodeOf.get(s), tgt = nodeOf.get(t)
    const spIdx = spIdxOf(s, sp), tpIdx = spIdxOf(t, tp)
    const spPort = spIdx !== null && spIdx !== -1 && spIdx < src.getPorts().length ? src.getPorts()[spIdx]
      : (() => { const pp = new LPort(); pp.setNode(src); return pp })()
    const tpPort = tpIdx !== null && tpIdx !== -1 && tpIdx < tgt.getPorts().length ? tgt.getPorts()[tpIdx]
      : (() => { const pp = new LPort(); pp.setNode(tgt); return pp })()
    const e = new LEdge(); e.setSource(spPort); e.setTarget(tpPort)
  }
  const IH = graphProps.hierarchyHandling === 'INCLUDE_CHILDREN' || hierarchy.size > 0
  if (IH) g.setProperty(HIH, 'INCLUDE_CHILDREN')
  g.setProperty(DIR, (graphProps.direction ?? 'RIGHT').toUpperCase())
  return { g, nodeOf, nodeProps, hierarchy, nodes, edges }
}

async function scanOne(file) {
  const source = readFileSync(file, 'utf8')
  const graphData = parseElkt(source)
  const { g, nodeOf, nodeProps, hierarchy, nodes, edges } = buildGraph(graphData)
  new LayeredLayoutProvider().layout(g)

  const GRAPH_DIRECTION = (graphData.graphProps.direction ?? 'RIGHT').toUpperCase()
  const IH = graphData.graphProps.hierarchyHandling === 'INCLUDE_CHILDREN' || hierarchy.size > 0
  const buildElkHierarchy = (idx) => {
    const p = nodeProps.get(idx) ?? {}
    const pw = p.width ?? 60, ph = p.height ?? 30
    const node = { id: 'N' + idx, width: pw, height: ph }
    if (p.portConstraints) node.layoutOptions = { 'elk.portConstraints': p.portConstraints }
    const ports = p.ports ?? []
    if (ports.length > 0) {
      node.ports = ports.map(pp => {
        let side = pp.side ?? null
        const isCompound = (hierarchy.get(idx) ?? []).length > 0
        if (side === null && pp.x !== undefined && pp.y !== undefined && p.portConstraints
          && String(p.portConstraints).includes('FIXED') && isCompound) {
          side = calcPortSide(pw, ph, pp.x, pp.y, pp.w ?? 8, pp.h ?? 8)
        }
        return { id: `N${idx}.${pp.id}`, width: pp.w ?? 8, height: pp.h ?? 8, x: pp.x ?? 0, y: pp.y ?? 0, properties: { 'port.side': side ?? 'UNDEFINED', 'port.index': String(pp.index ?? 0), 'port.x': String(pp.x ?? 0), 'port.y': String(pp.y ?? 0) } }
      })
    }
    const kids = hierarchy.get(idx) ?? []
    if (kids.length > 0) node.children = kids.map(k => buildElkHierarchy(k))
    return node
  }
  const elk = new ELK()
  const elkRes = await elk.layout({
    id: 'root',
    layoutOptions: { 'elk.algorithm': 'layered', 'elk.direction': GRAPH_DIRECTION, 'elk.randomSeed': '1', ...(IH ? { 'elk.hierarchyHandling': 'INCLUDE_CHILDREN' } : {}) },
    children: nodes.filter(id => ![...hierarchy.values()].flat().includes(id)).map(i => buildElkHierarchy(i)),
    edges: edges.map(([s, sp, t, tp], i) => ({ id: 'e' + i, sources: [sp === null ? 'N' + s : `N${s}.${sp}`], targets: [tp === null ? 'N' + t : `N${t}.${tp}`] })),
  })
  const elkPos = new Map()
  const walk = (list, px, py) => {
    for (const c of list) {
      elkPos.set(c.id, { x: px + c.x, y: py + c.y })
      if (c.children) walk(c.children, px + c.x, py + c.y)
    }
  }
  walk(elkRes.children ?? [], 0, 0)

  const ggnPos = new Map()
  const walkGgn = (ids, px, py) => {
    for (const id of ids) {
      const n = nodeOf.get(id)
      const wx = px + n.position.x, wy = py + n.position.y
      ggnPos.set(id, { x: wx, y: wy })
      const kids = hierarchy.get(id) ?? []
      if (kids.length > 0) walkGgn(kids, wx, wy)
    }
  }
  walkGgn(nodes.filter(id => ![...hierarchy.values()].flat().includes(id)), 0, 0)

  let maxDx = 0, maxDy = 0
  const nodeDiffs = []
  for (const id of nodes) {
    const gn = ggnPos.get(id)
    const el = elkPos.get('N' + id)
    if (!gn || !el) continue
    const dx = Math.abs(gn.x - el.x), dy = Math.abs(gn.y - el.y)
    nodeDiffs.push({ id, dx: Math.round(dx * 1000) / 1000, dy: Math.round(dy * 1000) / 1000 })
    if (dx > maxDx) maxDx = dx
    if (dy > maxDy) maxDy = dy
  }
  nodeDiffs.sort((a, b) => Math.max(b.dx, b.dy) - Math.max(a.dx, a.dy))
  return { file, maxDx: Math.round(maxDx * 1000) / 1000, maxDy: Math.round(maxDy * 1000) / 1000, nodeDiffs }
}

describe('eps-scan', () => {
  // 显式列表扫描工具: 未配置 EPS_FILES 时跳过 (不当作门禁失败, R65).
  it.skipIf(!process.env.EPS_FILES || !existsSync(process.env.EPS_FILES))('扫描失败集合的坐标差异', async () => {
    const listFile = process.env.EPS_FILES!
    const files = readFileSync(listFile, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)
    const results = []
    for (const f of files) {
      try {
        results.push(await scanOne(f))
      } catch (e) {
        results.push({ file: f, error: String(e) })
      }
    }
    writeFileSync('/tmp/eps/scan.json', JSON.stringify(results, null, 1) + '\n')
    const summary = results.filter(r => !r.error)
    const byBucket = (n) => {
      const b = { le1: 0, le2: 0, le5: 0, le10: 0, gt10: 0 }
      for (const r of summary) {
        const m = Math.max(r.maxDx, r.maxDy)
        if (m <= 1) b.le1++
        else if (m <= 2) b.le2++
        else if (m <= 5) b.le5++
        else if (m <= 10) b.le10++
        else b.gt10++
      }
      return b
    }
    console.log('=== ε 桶统计 ===', JSON.stringify(byBucket()))
    console.log('=== 最小差异 TOP20 ===')
    const sorted = [...summary].sort((a, b) => Math.max(a.maxDx, a.maxDy) - Math.max(b.maxDx, b.maxDy))
    for (const r of sorted.slice(0, 20)) {
      console.log(`  max=${Math.max(r.maxDx, r.maxDy).toFixed(3)} (dx=${r.maxDx}, dy=${r.maxDy}) ${r.file.replace('test-resources/elk-models/', '')}`)
    }
    console.log('=== 最大差异 TOP10 ===')
    for (const r of [...sorted].reverse().slice(0, 10)) {
      console.log(`  max=${Math.max(r.maxDx, r.maxDy).toFixed(3)} ${r.file.replace('test-resources/elk-models/', '')}`)
    }
  }, 300000)
})
