#!/usr/bin/env bun
/**
 * render-elkjs — 用官方 elkjs 布局并渲染 SVG.
 *
 * 目的: 正确消费 elkjs 的 layout() 输出 (节点位置 + 边 sections/bendPoints),
 * 输出可直接预览的 SVG。边路由 (含 trunk 合并) 完全取自 elkjs 的 sections,
 * 不做任何自研路由, 因此渲染正确性由 elkjs 保证。
 *
 * 用法:
 *   bun scripts/render-elkjs.mjs test-resources/elk-models/examples/hierarchy/hierarchicalEdges.elkt
 *   bun scripts/render-elkjs.mjs test-resources/elk-models/realworld/ptolemy/hierarchical/pn_blindcommunication_BlindCommunication.elkt
 *   bun scripts/render-elkjs.mjs test-resources/elk-models/examples/hierarchy/hierarchicalEdges.elkt --out /tmp/out.svg
 *
 * 输出: <elkt 同名>.elkjs.svg (默认与脚本同级 ../bench-results/render-elkjs/)
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename, resolve } from 'node:path'
import ELK from 'elkjs/lib/elk.bundled.js'
import { parseElkt } from './elkt2test.mjs'

// ── 参数 ──

function parseArgs(argv) {
  const opts = { graph: null, out: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') opts.out = argv[++i] ?? null
    else if (!a.startsWith('--')) opts.graph = a
  }
  return opts
}

// ── elkt → elkjs JSON ──

function buildElkJson(parsed) {
  const { nodes, edges, hierarchy, nodeProps, graphProps } = parsed
  const childIds = new Set([...hierarchy.values()].flat())
  function buildNode(id) {
    const p = nodeProps.get(id) ?? {}
    const n = { id, width: p.width ?? 60, height: p.height ?? 30 }
    const ports = p.ports ?? []
    if (ports.length) {
      n.ports = ports.map(pt => ({
        id: id + '.' + pt.id, width: pt.w ?? 8, height: pt.h ?? 8, x: pt.x ?? 0, y: pt.y ?? 0,
        properties: { 'port.side': pt.side ?? 'UNDEFINED', 'port.index': String(pt.index ?? 0) },
      }))
    }
    const kids = hierarchy.get(id) ?? []
    if (kids.length) n.children = kids.map(buildNode)
    return n
  }
  const elkEdges = edges.map((e, i) => ({
    id: 'e' + i, sources: [e[1] ? e[0] + '.' + e[1] : e[0]], targets: [e[3] ? e[2] + '.' + e[3] : e[2]],
  }))
  return {
    children: nodes.filter(id => !childIds.has(id)).map(buildNode),
    edges: elkEdges,
    direction: (graphProps.direction ?? 'RIGHT').toUpperCase(),
    hasHierarchy: hierarchy.size > 0,
  }
}

// ── elkjs 布局 + 数据提取 ──

async function runElkjs(parsed) {
  const json = buildElkJson(parsed)
  const elk = new ELK()
  const opts = { 'elk.algorithm': 'layered', 'elk.direction': json.direction, 'elk.randomSeed': '1' }
  if (json.hasHierarchy) opts['elk.hierarchyHandling'] = 'INCLUDE_CHILDREN'
  const res = await elk.layout({ id: 'root', layoutOptions: opts, children: json.children, edges: json.edges })

  // 节点: 世界坐标 (累加祖先 position)
  const out = []
  const walk = (list, px, py) => {
    for (const c of list) {
      const wx = px + c.x, wy = py + c.y
      out.push({ id: c.id, x: wx, y: wy, width: c.width, height: c.height, isCompound: !!(c.children && c.children.length) })
      if (c.children) walk(c.children, wx, wy)
    }
  }
  walk(res.children ?? [], 0, 0)
  const byId = new Map(out.map(n => [n.id, n]))
  const nodeIds = new Set(out.map(n => n.id))
  const nodePath = (ref) => {
    const parts = ref.split('.')
    for (let i = parts.length; i >= 1; i--) {
      const cand = parts.slice(0, i).join('.')
      if (nodeIds.has(cand)) return cand
    }
    return parts[0]
  }
  // sections 坐标相对 source/target 的公共祖先 (LCA) 图 → 投影到根坐标系
  const lcaOffset = (s, t) => {
    const sp = s.split('.'), tp = t.split('.')
    let n = 0
    while (n < sp.length && n < tp.length && sp[n] === tp[n]) n++
    if (n === 0) return { x: 0, y: 0 }
    const lca = byId.get(sp.slice(0, n).join('.'))
    return lca ? { x: lca.x, y: lca.y } : { x: 0, y: 0 }
  }
  const edgesOut = []
  ;(res.edges ?? []).forEach((e, i) => {
    const srcNode = nodePath((e.sources ?? [])[0] ?? '')
    const tgtNode = nodePath((e.targets ?? [])[0] ?? '')
    const off = lcaOffset(srcNode, tgtNode)
    const proj = pt => ({ x: pt.x + off.x, y: pt.y + off.y })
    const sections = (e.sections ?? []).filter(s => s && s.startPoint && s.endPoint
      && Number.isFinite(s.startPoint.x) && Number.isFinite(s.startPoint.y)
      && Number.isFinite(s.endPoint.x) && Number.isFinite(s.endPoint.y))
      .map(s => ({
        start: proj(s.startPoint),
        end: proj(s.endPoint),
        points: (s.bendPoints ?? []).filter(bp => Number.isFinite(bp?.x) && Number.isFinite(bp?.y)).map(proj),
      }))
    if (sections.length) edgesOut.push({ id: e.id, src: srcNode, tgt: tgtNode, sections })
  })
  return { nodes: out, edges: edgesOut }
}

// ── SVG 渲染 (elkjs 数据 → 静态 SVG) ──

function toSvg(data, pad = 48) {
  const PAD = pad
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const n of data.nodes) {
    minX = Math.min(minX, n.x); minY = Math.min(minY, n.y)
    maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height)
  }
  for (const e of data.edges) {
    for (const s of e.sections) for (const pt of [s.start, s.end, ...s.points]) {
      minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y)
      maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y)
    }
  }
  const W = maxX - minX + PAD * 2, H = maxY - minY + PAD * 2
  const tx = x => x - minX + PAD, ty = y => y - minY + PAD
  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="system-ui, sans-serif">`)
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff"/>`)
  // 边在节点之上 (完整可见, 不被容器块遮挡)
  for (const e of data.edges) {
    for (const s of e.sections) {
      const pts = [s.start, ...s.points, s.end].map(p => `${tx(p.x).toFixed(1)},${ty(p.y).toFixed(1)}`).join(' ')
      parts.push(`<polyline points="${pts}" fill="none" stroke="#4a90d9" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`)
      const last = s.points.length > 0 ? s.points[s.points.length - 1] : s.start
      const ang = Math.atan2(s.end.y - last.y, s.end.x - last.x)
      const L = 8, a = 0.5
      const ax = tx(s.end.x), ay = ty(s.end.y)
      parts.push(`<polyline points="${(ax - L * Math.cos(ang - a)).toFixed(1)},${(ay - L * Math.sin(ang - a)).toFixed(1)} ${ax.toFixed(1)},${ay.toFixed(1)} ${(ax - L * Math.cos(ang + a)).toFixed(1)},${(ay - L * Math.sin(ang + a)).toFixed(1)}" fill="none" stroke="#4a90d9" stroke-width="1.5" stroke-linecap="round"/>`)
    }
  }
  for (const n of data.nodes) {
    const x = tx(n.x), y = ty(n.y)
    const fill = n.isCompound ? '#fef3c7' : '#e8f4fd'
    const stroke = n.isCompound ? '#d97706' : '#4a90d9'
    parts.push(`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${n.width.toFixed(1)}" height="${n.height.toFixed(1)}" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`)
    parts.push(`<text x="${(x + n.width / 2).toFixed(1)}" y="${(y + n.height / 2 + 3).toFixed(1)}" text-anchor="middle" font-size="9" fill="#333">${String(n.id)}</text>`)
  }
  parts.push('</svg>')
  return parts.join('\n')
}

// ── 主流程 ──

const opts = parseArgs(process.argv.slice(2))
if (!opts.graph) {
  console.error('用法: bun scripts/render-elkjs.mjs <model.elkt> [--out out.svg]')
  process.exit(1)
}
const src = resolve(opts.graph)
const source = readFileSync(src, 'utf8')
const name = basename(src, '.elkt')
const parsed = parseElkt(source)
const data = await runElkjs(parsed)
const svg = toSvg(data)

const outPath = opts.out ?? join(import.meta.dirname, '../bench-results/render-elkjs', `${name}.elkjs.svg`)
mkdirSync(join(import.meta.dirname, '../bench-results/render-elkjs'), { recursive: true })
writeFileSync(outPath, svg, 'utf8')
console.log(`已生成: ${outPath}`)
console.log(`  ${data.nodes.length} 节点 / ${data.edges.length} 边 (elkjs layout)`)
// 边合并统计: 同源端口的多条边共享 trunk (公共 bendPoints 前缀 ≥ 2 点)
const byStart = new Map()
for (const e of data.edges) {
  for (const s of e.sections) {
    const k = `${Math.round(s.start.x)},${Math.round(s.start.y)}`
    if (!byStart.has(k)) byStart.set(k, [])
    byStart.get(k).push(e)
  }
}
let merged = 0
for (const [k, es] of byStart) {
  if (es.length < 2) continue
  let maxShared = 0
  for (let i = 0; i < es.length; i++) for (let j = i + 1; j < es.length; j++) {
    const a = es[i].sections[0].points, b = es[j].sections[0].points
    let n = 0
    while (n < a.length && n < b.length && a[n].x === b[n].x && a[n].y === b[n].y) n++
    maxShared = Math.max(maxShared, n)
  }
  if (maxShared >= 1) merged++
}
console.log(`  trunk 合并源端口: ${merged} 组`)
